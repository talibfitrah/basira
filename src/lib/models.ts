import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { demoModel } from "./demo";
import { db, now } from "./db";
import { Provider, providerKey, publicUrl, branding } from "./config";
import { HttpError, User } from "./auth";
import { installedModels, ollamaUrl, whisperUrl, whisperModel } from "./local";

export type Caps = { vision?: boolean; pdf?: boolean; web?: boolean; code?: boolean; tools?: boolean; think?: boolean };
export type ModelRow = {
  id: string;
  provider: Provider;
  model_id: string;
  label: string;
  kind: "chat" | "image" | "tts" | "stt";
  description: string;
  tier: number;
  input_cost: number;
  output_cost: number;
  unit_cost: number;
  caps: string;
  enabled: number;
  sort: number;
};
export type Plan = {
  id: string; name: string; description: string; price_eur: number; monthly_credits: number;
  tier: number; stripe_price_id: string | null; features: string; sort: number; active: number;
};

export function listModels(kind?: string, onlyEnabled = true): ModelRow[] {
  let sql = "SELECT * FROM models WHERE 1=1";
  const args: unknown[] = [];
  if (kind) { sql += " AND kind=?"; args.push(kind); }
  if (onlyEnabled) sql += " AND enabled=1";
  return db().prepare(sql + " ORDER BY sort, label").all(...args) as ModelRow[];
}
export function getModel(id: string): ModelRow | null {
  return (db().prepare("SELECT * FROM models WHERE id=?").get(id) as ModelRow) || null;
}
export function caps(m: ModelRow): Caps {
  try { return JSON.parse(m.caps); } catch { return {}; }
}
export function listPlans(onlyActive = true): Plan[] {
  return db().prepare(`SELECT * FROM plans ${onlyActive ? "WHERE active=1" : ""} ORDER BY sort`).all() as Plan[];
}
export function getPlan(id: string): Plan | null {
  return (db().prepare("SELECT * FROM plans WHERE id=?").get(id) as Plan) || null;
}
export function userTier(u: User) {
  if (u.role === "admin") return 99;
  return getPlan(u.plan_id)?.tier ?? 0;
}

/** النماذج المتاحة للمستخدم مع علامة «مقفل» لما فوق باقته، وإخفاء ما لا مفتاح لمزوّده. */
export async function modelAvailable(m: ModelRow): Promise<boolean> {
  if (!providerKey(m.provider)) return false;
  if (m.provider !== "local") return true;
  if (m.kind === "stt") return !!whisperUrl();
  const inst = await installedModels();
  return inst.names.has(m.model_id) || inst.names.has(`${m.model_id}:latest`);
}

export async function modelsForUser(u: User, kind = "chat") {
  const t = userTier(u);
  const rows = listModels(kind);
  const avail = await Promise.all(rows.map(modelAvailable));
  return rows
    .filter((_, i) => avail[i])
    .map((m) => ({
      id: m.id, label: m.label, provider: m.provider, description: m.description,
      tier: m.tier, locked: m.tier > t, caps: caps(m),
    }));
}

export async function assertModelAccess(u: User, m: ModelRow | null, kind: string): Promise<ModelRow> {
  if (!m || !m.enabled || m.kind !== kind) throw new HttpError(400, "النموذج غير متاح");
  if (!(await modelAvailable(m))) throw new HttpError(503, m.provider === "local" ? "هذا النموذج غير منزَّل على الخادم بعد" : "هذا المزوّد غير مفعَّل");
  if (m.tier > userTier(u)) throw new HttpError(402, "هذا النموذج يحتاج باقة أعلى");
  return m;
}

export function assertCredits(u: User, min = 0.5) {
  if (u.role === "admin") return;
  if (u.credits < min) throw new HttpError(402, "نفد رصيدك لهذا الشهر. يمكنك الترقية إلى باقة أعلى من صفحة الحساب.");
}

/** يخصم الرصيد ويسجّل الاستعمال. المشرف يُسجَّل استعماله ولا يُخصم. */
export function charge(u: User, kind: string, model: string, credits: number, inTok = 0, outTok = 0, units = 0) {
  const c = Math.max(0, Math.round(credits * 100) / 100);
  const d = db();
  d.transaction(() => {
    d.prepare("INSERT INTO usage (user_id,kind,model,input_tokens,output_tokens,units,credits,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(u.id, kind, model, inTok, outTok, units, c, now());
    if (u.role !== "admin") d.prepare("UPDATE users SET credits = MAX(0, credits - ?) WHERE id=?").run(c, u.id);
  })();
  return c;
}

export function tokenCost(m: ModelRow, inTok: number, outTok: number) {
  return (inTok * m.input_cost + outTok * m.output_cost) / 1_000_000;
}

function provider(p: Exclude<Provider, "demo" | "local">) {
  const apiKey = providerKey(p);
  switch (p) {
    case "anthropic": return createAnthropic({ apiKey });
    case "openai": return createOpenAI({ apiKey });
    case "google": return createGoogleGenerativeAI({ apiKey });
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        headers: { "HTTP-Referer": publicUrl(), "X-Title": branding().appName },
      });
  }
}

export function languageModel(m: ModelRow, opts: { web?: boolean } = {}) {
  if (m.provider === "demo") return demoModel();
  if (m.provider === "local") return localProvider().chatModel(m.model_id);
  if (m.provider === "openrouter") {
    const id = opts.web && !m.model_id.endsWith(":online") ? `${m.model_id}:online` : m.model_id;
    return (provider("openrouter") as ReturnType<typeof createOpenAICompatible>).chatModel(id);
  }
  if (m.provider === "anthropic") return (provider("anthropic") as ReturnType<typeof createAnthropic>)(m.model_id);
  if (m.provider === "openai") return (provider("openai") as ReturnType<typeof createOpenAI>)(m.model_id);
  return (provider("google") as ReturnType<typeof createGoogleGenerativeAI>)(m.model_id);
}

export function localProvider() {
  return createOpenAICompatible({ name: "local", baseURL: `${ollamaUrl()}/v1`, apiKey: process.env.DESKTOP_TOKEN || "local", includeUsage: true });
}

export function imageModel(m: ModelRow) {
  if (m.provider === "openai") return createOpenAI({ apiKey: providerKey("openai") }).image(m.model_id);
  if (m.provider === "google") return createGoogleGenerativeAI({ apiKey: providerKey("google") }).image(m.model_id);
  throw new HttpError(400, "هذا المزوّد لا يدعم توليد الصور هنا");
}
export function speechModel(m: ModelRow) {
  if (m.provider === "openai") return createOpenAI({ apiKey: providerKey("openai") }).speech(m.model_id);
  if (m.provider === "google") return createGoogleGenerativeAI({ apiKey: providerKey("google") }).speech(m.model_id);
  throw new HttpError(400, "هذا المزوّد لا يدعم القراءة الصوتية هنا");
}
export function transcriptionModel(m: ModelRow) {
  if (m.provider === "local") return createOpenAI({ baseURL: `${whisperUrl()}/v1`, apiKey: "local" }).transcription(whisperModel());
  if (m.provider === "openai") return createOpenAI({ apiKey: providerKey("openai") }).transcription(m.model_id);
  throw new HttpError(400, "هذا المزوّد لا يدعم تفريغ الصوت هنا");
}

/** أدوات المزوّد الأصلية: البحث في الويب وتنفيذ الشيفرة. */
export function nativeTools(m: ModelRow, want: { web?: boolean; code?: boolean }, hasFunctionTools: boolean) {
  const c = caps(m);
  const tools: Record<string, unknown> = {};
  if (m.provider === "local" || m.provider === "demo") return tools;
  if (m.provider === "anthropic") {
    const a = provider("anthropic") as ReturnType<typeof createAnthropic>;
    if (want.web && c.web) tools.web_search = a.tools.webSearch_20260318({ maxUses: 6 });
    if (want.code && c.code) tools.code_execution = a.tools.codeExecution_20260120();
  } else if (m.provider === "openai") {
    const o = provider("openai") as ReturnType<typeof createOpenAI>;
    if (want.web && c.web) tools.web_search = o.tools.webSearch({});
    if (want.code && c.code) tools.code_interpreter = o.tools.codeInterpreter({});
  } else if (m.provider === "google" && !hasFunctionTools) {
    // Gemini لا يجمع بين أدوات Google المدمجة وأدوات الدوال في الطلب نفسه
    const gg = provider("google") as ReturnType<typeof createGoogleGenerativeAI>;
    if (want.web && c.web) tools.google_search = gg.tools.googleSearch({});
    if (want.code && c.code) tools.code_execution = gg.tools.codeExecution({});
  }
  return tools;
}

/** يجلب قائمة النماذج المتاحة فعلًا من حساب المزوّد (للوحة الإدارة). */
export async function fetchProviderModels(p: Provider): Promise<string[]> {
  if (p === "local") return [...(await installedModels(true)).names].filter((n) => !n.endsWith(":latest")).sort();
  const key = providerKey(p);
  if (!key) throw new HttpError(400, "المفتاح غير مضبوط");
  let res: Response;
  if (p === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    const j = await res.json();
    return (j.data || []).map((x: { id: string }) => x.id);
  }
  if (p === "openai") {
    res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const j = await res.json();
    return (j.data || []).map((x: { id: string }) => x.id).sort();
  }
  if (p === "google") {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
    const j = await res.json();
    return (j.models || []).map((x: { name: string }) => x.name.replace(/^models\//, ""));
  }
  res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const j = await res.json();
  return (j.data || []).map((x: { id: string }) => x.id).sort();
}
