import dns from "node:dns/promises";
import net from "node:net";
import { getSetting } from "./db";
import { HttpError } from "./auth";
import { stripHtml } from "./arabic.mjs";

/* ------------------------------------------------------------------
 * الخدمات المحلية على NAS — لا اتصال بأي شركة ذكاء اصطناعي:
 *   Ollama  : تشغيل النماذج المفتوحة (المحادثة)
 *   SearXNG : محرك بحث تستضيفه بنفسك
 *   Whisper : تفريغ الصوت (خادم متوافق مع واجهة OpenAI مثل speaches)
 * ------------------------------------------------------------------ */

const strip = (u: string) => u.replace(/\/+$/, "");
export const ollamaUrl = () => strip(getSetting("local_url") || process.env.LOCAL_AI_URL || "http://ollama:11434");
export const searxUrl = () => strip(getSetting("searx_url") || process.env.SEARXNG_URL || "http://searxng:8080");
export const whisperUrl = () => strip(getSetting("whisper_url") || process.env.WHISPER_URL || "");
export const whisperModel = () => getSetting("whisper_model") || process.env.WHISPER_MODEL || "Systran/faster-whisper-small";

type G = typeof globalThis & { __localModels?: { at: number; names: Set<string>; ok: boolean } };
const g = globalThis as G;

/** النماذج المنزَّلة فعلًا في Ollama (مع ذاكرة ٣٠ ثانية). */
const desktop = () => process.env.DESKTOP_MODE === "1";

export async function installedModels(force = false): Promise<{ ok: boolean; names: Set<string> }> {
  if (desktop()) return { ok: true, names: (await import("./desktop-models")).desktopInstalled() };
  const c = g.__localModels;
  if (!force && c && Date.now() - c.at < 30_000) return c;
  try {
    const r = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { models?: { name: string }[] };
    const names = new Set<string>();
    for (const m of j.models || []) {
      names.add(m.name);
      if (m.name.endsWith(":latest")) names.add(m.name.replace(/:latest$/, ""));
    }
    g.__localModels = { at: Date.now(), names, ok: true };
  } catch {
    g.__localModels = { at: Date.now(), names: new Set(), ok: false };
  }
  return g.__localModels;
}

export async function ollamaStatus() {
  if (desktop()) {
    const [{ desktopStatus }, { loadedModels }] = await Promise.all([import("./desktop-models"), import("./desktop-llm")]);
    return desktopStatus(loadedModels());
  }
  try {
    const [v, tags, ps] = await Promise.all([
      fetch(`${ollamaUrl()}/api/version`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
      fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
      fetch(`${ollamaUrl()}/api/ps`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch(() => ({ models: [] })),
    ]);
    return {
      ok: true, version: v.version as string,
      models: (tags.models || []).map((m: { name: string; size: number; details?: { parameter_size?: string; quantization_level?: string } }) => ({
        name: m.name, size: m.size, params: m.details?.parameter_size, quant: m.details?.quantization_level,
      })),
      loaded: (ps.models || []).map((m: { name: string }) => m.name),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message, models: [], loaded: [] };
  }
}

/** تنزيل نموذج إلى NAS؛ يعيد تدفق التقدم كما يرسله Ollama. */
export async function ollamaPull(name: string): Promise<Response> {
  if (desktop()) return (await import("./desktop-models")).desktopPull(name);
  if (!/^[a-z0-9._\-/]+(:[a-z0-9._\-]+)?$/i.test(name)) throw new HttpError(400, "اسم نموذج غير صالح");
  const r = await fetch(`${ollamaUrl()}/api/pull`, { method: "POST", body: JSON.stringify({ model: name, stream: true }) });
  if (!r.ok || !r.body) throw new HttpError(502, "تعذّر الاتصال بخادم النماذج المحلي");
  g.__localModels = undefined;
  return r;
}

export async function ollamaDelete(name: string) {
  if (desktop()) { (await import("./desktop-models")).desktopDelete(name); return; }
  const r = await fetch(`${ollamaUrl()}/api/delete`, { method: "DELETE", body: JSON.stringify({ model: name }) });
  g.__localModels = undefined;
  if (!r.ok) throw new HttpError(502, "تعذّر حذف النموذج");
}

/* ------------------ البحث في الويب عبر SearXNG ------------------ */

export type WebHit = { title: string; url: string; snippet: string };

/** بحث احتياطي لبرنامج سطح المكتب: صفحة DuckDuckGo النصية (محرك بحث، لا ذكاء اصطناعي). */
async function ddgSearch(q: string, limit: number): Promise<WebHit[]> {
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=xa-ar`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: AbortSignal.timeout(12000),
  });
  const html = await r.text();
  const out: WebHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(html)) && out.length < limit;) {
    let url = m[1];
    const uddg = /uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = "https:" + url;
    out.push({ url, title: stripHtml(m[2]), snippet: stripHtml(m[3]).slice(0, 400) });
  }
  return out;
}

export async function searchWeb(q: string, limit = 6): Promise<WebHit[]> {
  if (desktop() && !getSetting("searx_url") && !process.env.SEARXNG_URL) return ddgSearch(q, limit);
  const u = `${searxUrl()}/search?format=json&safesearch=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`محرك البحث المحلي رد بالحالة ${r.status}`);
  const j = (await r.json()) as { results?: { title: string; url: string; content?: string }[] };
  return (j.results || []).slice(0, limit).map((x) => ({ title: x.title, url: x.url, snippet: (x.content || "").slice(0, 400) }));
}

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l === "::";
}

/** قراءة نص صفحة ويب عامة (مع منع الوصول إلى الشبكة الداخلية). */
export async function fetchPage(url: string, max = 12000): Promise<{ url: string; title: string; text: string }> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("رابط غير صالح"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("يُسمح بروابط http و https فقط");
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("لا يُسمح بقراءة عناوين الشبكة الداخلية");
  const r = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; BasiraBot/1.0)" } });
  const ct = r.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml/.test(ct)) throw new Error("الصفحة ليست نصًّا");
  const html = (await r.text()).slice(0, 2_000_000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || u.hostname;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n");
  return { url: r.url, title: stripHtml(title), text: stripHtml(body).replace(/\n\s*\n+/g, "\n").slice(0, max) };
}

/** تنزيل نموذج التفريغ إلى خادم Whisper المحلي (مرة واحدة). */
export async function whisperEnsure(model: string) {
  const u = whisperUrl();
  if (!u) throw new HttpError(400, "عنوان خادم التفريغ غير مضبوط");
  const r = await fetch(`${u}/v1/models/${model}`, { method: "POST", signal: AbortSignal.timeout(30 * 60_000) });
  if (!r.ok) throw new HttpError(502, `تعذّر تنزيل نموذج التفريغ: ${(await r.text()).slice(0, 200)}`);
  return (await r.text()).slice(0, 200);
}
