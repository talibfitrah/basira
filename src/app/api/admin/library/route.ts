import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { DATA_DIR } from "@/lib/db";
import { libraryInfo } from "@/lib/library";

const statusFile = path.join(DATA_DIR, "kb-status.json");
const collFile = path.join(DATA_DIR, "kb-collection.json");

function running() {
  try {
    const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    if (s.state !== "running") return false;
    process.kill(s.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    await requireAdmin();
    const info = libraryInfo();
    let status = null, collection = null;
    try { status = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch {}
    try { collection = JSON.parse(fs.readFileSync(collFile, "utf8")); } catch {}
    if (status?.state === "running" && !running()) status.state = "stopped";
    return Response.json({
      info: info.ready ? { ready: true, meta: info.meta, books: info.books, quran: info.quran } : { ready: false },
      status, collection,
      source: process.env.SHAMELA_DIR || process.env.SHAMELA_MANIFEST_URL || "روابط NAS العامة (الافتراضي)",
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (b.collection) {
      const books = (b.collection.books || []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
      const authors = (b.collection.authors || []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
      fs.writeFileSync(collFile, JSON.stringify({ books, authors }, null, 2));
    }
    if (b.action === "build") {
      if (running()) throw new HttpError(409, "البناء جارٍ بالفعل");
      const script = path.join(process.cwd(), "scripts", "kb-build.mjs");
      if (!fs.existsSync(script)) throw new HttpError(500, "سكربت البناء غير موجود في الصورة");
      const log = fs.openSync(path.join(DATA_DIR, "kb-build.log"), "w");
      const child = spawn(process.execPath, [script], { cwd: process.cwd(), env: { ...process.env, DATA_DIR, NODE_NO_WARNINGS: "1", ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) }, detached: true, stdio: ["ignore", log, log] });
      child.unref();
      fs.writeFileSync(statusFile, JSON.stringify({ state: "running", step: "بدء البناء", done: 0, total: 0, pid: child.pid, updated_at: new Date().toISOString() }));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
