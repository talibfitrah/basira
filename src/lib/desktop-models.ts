import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, getSetting } from "./db";
import { HttpError } from "./auth";

/*
 * إدارة النماذج في برنامج سطح المكتب: تُنزَّل ملفات GGUF مرة واحدة إلى مجلد البرنامج،
 * ثم تعمل دون إنترنت. المصدر الافتراضي سجلّ النماذج المفتوحة العام (بصيغة OCI)،
 * ويمكن جعله خادمك (NAS) من الإعدادات.
 */

export const MODELS_DIR = () => path.join(DATA_DIR, "models");
const INDEX = () => path.join(MODELS_DIR(), "index.json");
const registry = () => (getSetting("model_registry") || process.env.MODEL_REGISTRY || "https://registry.ollama.ai").replace(/\/$/, "");

type Entry = { file: string; size: number; digest: string; params?: string; quant?: string; at: number };
type Index = Record<string, Entry>;

function readIndex(): Index {
  try { return JSON.parse(fs.readFileSync(INDEX(), "utf8")); } catch { return {}; }
}
function writeIndex(ix: Index) {
  fs.mkdirSync(MODELS_DIR(), { recursive: true });
  fs.writeFileSync(INDEX(), JSON.stringify(ix, null, 2));
}

export function modelFile(name: string): string | null {
  const e = readIndex()[name] || readIndex()[`${name}:latest`];
  if (!e) return null;
  const f = path.join(MODELS_DIR(), e.file);
  return fs.existsSync(f) ? f : null;
}

export function desktopInstalled(): Set<string> {
  return new Set(Object.keys(readIndex()).filter((n) => modelFile(n)));
}

export function desktopStatus(loaded: string[]) {
  const ix = readIndex();
  return {
    ok: true, version: "مدمج",
    models: Object.entries(ix).filter(([n]) => modelFile(n)).map(([name, e]) => ({ name, size: e.size, params: e.params, quant: e.quant })),
    loaded,
  };
}

export function desktopDelete(name: string) {
  const ix = readIndex();
  const e = ix[name];
  if (e) {
    try { fs.rmSync(path.join(MODELS_DIR(), e.file)); } catch {}
    delete ix[name];
    writeIndex(ix);
  }
}

function parseName(name: string) {
  if (!/^[a-z0-9._\-/]+(:[a-z0-9._\-]+)?$/i.test(name)) throw new HttpError(400, "اسم نموذج غير صالح");
  const [repo, tag = "latest"] = name.split(":");
  return { repo: repo.includes("/") ? repo : `library/${repo}`, tag };
}

/** تنزيل نموذج مع الاستئناف والتحقق من البصمة؛ يعيد تدفق تقدّم بالصيغة التي تفهمها لوحة الإدارة. */
export function desktopPull(name: string): Response {
  const { repo, tag } = parseName(name);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const send = (o: object) => { try { c.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {} };
      try {
        send({ status: "قراءة بيانات النموذج" });
        const mr = await fetch(`${registry()}/v2/${repo}/manifests/${tag}`, {
          headers: { Accept: "application/vnd.docker.distribution.manifest.v2+json" },
        });
        if (!mr.ok) throw new Error(`النموذج غير موجود في المصدر (${mr.status})`);
        const man = (await mr.json()) as { layers: { mediaType: string; digest: string; size: number }[] };
        const layer = man.layers.find((l) => l.mediaType === "application/vnd.ollama.image.model") || man.layers.find((l) => /gguf|model/.test(l.mediaType));
        if (!layer) throw new Error("لم يوجد ملف النموذج في البيان");
        const total = layer.size;
        const file = `${name.replace(/[^a-z0-9._-]+/gi, "_")}.gguf`;
        fs.mkdirSync(MODELS_DIR(), { recursive: true });
        const part = path.join(MODELS_DIR(), file + ".part");

        // الاستئناف: نحسب بصمة الجزء الموجود ثم نكمل من حيث توقف
        const hash = crypto.createHash("sha256");
        let have = 0;
        if (fs.existsSync(part)) {
          const fd = fs.openSync(part, "r");
          const buf = Buffer.alloc(8 << 20);
          for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) { hash.update(buf.subarray(0, n)); have += n; }
          fs.closeSync(fd);
        }
        send({ status: "تنزيل", total, completed: have });
        if (have < total) {
          const br = await fetch(`${registry()}/v2/${repo}/blobs/${layer.digest}`, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: "follow" });
          if (!(br.ok || br.status === 206) || !br.body) throw new Error(`تعذّر التنزيل (${br.status})`);
          if (have && br.status !== 206) { throw new Error("المصدر لا يدعم الاستئناف؛ احذف الجزء وأعد المحاولة"); }
          const out = fs.createWriteStream(part, { flags: "a" });
          let last = 0;
          const reader = br.body.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            hash.update(value);
            have += value.byteLength;
            if (!out.write(value)) await new Promise((ok) => out.once("drain", ok));
            if (Date.now() - last > 500) { send({ status: "تنزيل", total, completed: have }); last = Date.now(); }
          }
          await new Promise<void>((ok, bad) => out.end((e?: Error | null) => (e ? bad(e) : ok())));
        }
        send({ status: "التحقق من سلامة الملف", total, completed: have });
        const digest = "sha256:" + hash.digest("hex");
        if (digest !== layer.digest) { fs.rmSync(part, { force: true }); throw new Error("الملف تالف (البصمة لا تطابق)؛ أعد التنزيل"); }
        fs.renameSync(part, path.join(MODELS_DIR(), file));
        const ix = readIndex();
        const params = /:(\d+(?:\.\d+)?b)/i.exec(name)?.[1]?.toUpperCase();
        ix[name] = { file, size: total, digest, params, at: Date.now() };
        writeIndex(ix);
        // نموذج مخصص لم يُعرَّف بعد: نسجّله ليظهر في قائمة المحادثة مباشرة
        const { db } = await import("./db");
        db().prepare(`INSERT OR IGNORE INTO models (id,provider,model_id,label,kind,description,tier,input_cost,output_cost,unit_cost,caps,enabled,sort)
          SELECT ?, 'local', ?, ?, 'chat', 'نموذج مُنزَّل', 0, 100, 400, 0, '{"tools":true,"web":true}', 1, 50
          WHERE NOT EXISTS (SELECT 1 FROM models WHERE provider='local' AND model_id=?)`)
          .run(`local-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.slice(0, 40), name, name, name);
        send({ status: "success" });
      } catch (e) {
        send({ error: (e as Error).message });
      }
      try { c.close(); } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
