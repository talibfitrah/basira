import Database from "./sqlite.mjs";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const FILES_DIR = path.join(DATA_DIR, "files");

type G = typeof globalThis & { __basiraDb?: Database };
const g = globalThis as G;

function open(): Database {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "basira.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function db(): Database {
  if (!g.__basiraDb) g.__basiraDb = open();
  return g.__basiraDb;
}

export const now = () => Date.now();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  plan_id TEXT NOT NULL DEFAULT 'free',
  credits REAL NOT NULL DEFAULT 0,
  credits_reset_at INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  period_end INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_eur REAL NOT NULL DEFAULT 0,
  monthly_credits REAL NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  features TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat',
  description TEXT NOT NULL DEFAULT '',
  tier INTEGER NOT NULL DEFAULT 0,
  input_cost REAL NOT NULL DEFAULT 0,
  output_cost REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  caps TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  mode TEXT NOT NULL DEFAULT 'general',
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conv_user ON conversations(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS msg_conv ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'upload',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_user ON files(user_id, kind, created_at DESC);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  credits REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_user ON usage(user_id, created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  devices TEXT NOT NULL DEFAULT '[]',
  max_devices INTEGER NOT NULL DEFAULT 2,
  expires_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lic_user ON licenses(user_id);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
`;

function migrate(db: Database) {
  db.exec(SCHEMA);
  const count = (db.prepare("SELECT COUNT(*) c FROM plans").get() as { c: number }).c;
  if (count === 0) seedPlans(db);
  const mcount = (db.prepare("SELECT COUNT(*) c FROM models").get() as { c: number }).c;
  if (mcount === 0) seedModels(db);
  seedLocalModels(db);
  if (process.env.DEMO_MODE === "1" && !db.prepare("SELECT 1 FROM models WHERE id='demo'").get())
    db.prepare("INSERT INTO models (id,provider,model_id,label,kind,description,tier,input_cost,output_cost,caps,sort) VALUES ('demo','demo','demo','نموذج تجريبي','chat','للتجربة دون مفاتيح — يردّ ردًّا ثابتًا',0,100,100,'{\"vision\":true,\"pdf\":true}',0)").run();
}

/*
 * الرصيد: نقطة واحدة تقابل تقريبًا ٠٫٠٠١ دولار من كلفة المزوّد.
 * الأسعار والباقات قيم ابتدائية قابلة للتعديل من لوحة الإدارة،
 * ويجب مطابقتها بأسعار المزوّدين الحالية قبل الإطلاق.
 */
function seedPlans(db: Database) {
  const ins = db.prepare(
    "INSERT INTO plans (id,name,description,price_eur,monthly_credits,tier,features,sort) VALUES (?,?,?,?,?,?,?,?)",
  );
  ins.run("free", "المجانية", "للتجربة والتعرّف على المنصة", 0, 300, 0,
    JSON.stringify(["النماذج السريعة", "القسم الشرعي", "حفظ المحادثات"]), 0);
  ins.run("basic", "الأساسية", "للاستعمال اليومي", 9, 6000, 1,
    JSON.stringify(["كل ما في المجانية", "النماذج المتقدمة", "توليد الصور", "الصوت والبحث في الويب"]), 1);
  ins.run("pro", "الاحترافية", "للباحثين وطلبة العلم والمؤلفين", 19, 15000, 2,
    JSON.stringify(["كل ما في الأساسية", "أقوى النماذج كلها", "تنفيذ الشيفرة", "رصيد أكبر"]), 2);
  ins.run("max", "القصوى", "للاستعمال المكثف والمؤسسات الصغيرة", 49, 45000, 3,
    JSON.stringify(["كل ما في الاحترافية", "أعلى رصيد", "أولوية في الدعم"]), 3);
}

function seedModels(db: Database) {
  const ins = db.prepare(
    "INSERT INTO models (id,provider,model_id,label,kind,description,tier,input_cost,output_cost,unit_cost,caps,enabled,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const chat = (id: string, provider: string, modelId: string, label: string, desc: string, tier: number,
    inC: number, outC: number, caps: object, sort: number, enabled = 1) =>
    ins.run(id, provider, modelId, label, "chat", desc, tier, inC, outC, 0, JSON.stringify(caps), enabled, sort);

  const full = { vision: true, pdf: true, web: true, code: true, tools: true };
  // Anthropic
  chat("claude-fable", "anthropic", "claude-fable-5-1", "Claude Fable 5.1", "من فئة Mythos — أعلى نماذج Anthropic المتاحة للعموم", 3, 15000, 75000, full, 9);
  chat("claude-opus", "anthropic", "claude-opus-5-5", "Claude Opus 5.5", "الأقوى للمهام المعقدة والبحث العميق", 2, 5000, 25000, full, 10);
  chat("claude-sonnet", "anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "توازن ممتاز بين القوة والسرعة", 1, 3000, 15000, full, 11);
  chat("claude-haiku", "anthropic", "claude-haiku-5-5", "Claude Haiku 5.5", "سريع واقتصادي", 0, 1000, 5000, full, 12);
  // OpenAI
  chat("gpt-astra", "openai", "gpt-6-astra", "GPT-6 Astra", "أقوى نماذج OpenAI للمهام العلمية والبحثية الشاقة", 3, 10000, 50000, full, 19);
  chat("gpt-sol", "openai", "gpt-6.1-sol", "GPT-6.1 Sol", "قريب من Astra في أكثر المهام بكلفة أقل بكثير", 2, 2000, 10000, full, 20);
  chat("gpt-luna", "openai", "gpt-6-luna", "GPT-6 Luna", "نموذج OpenAI الخفيف", 0, 500, 4000, full, 21);
  // Google
  chat("gemini-argon", "google", "gemini-4-argon", "Gemini 4 Argon", "أقوى نماذج Google", 2, 2500, 15000, full, 30);
  chat("gemini-flash", "google", "gemini-3.8-flash", "Gemini 3.8 Flash", "سريع جدًّا وسياق طويل", 0, 300, 2500, full, 31);
  // OpenRouter (نماذج مفتوحة المصدر وغيرها) — معطَّلة حتى يُضبط المفتاح
  chat("deepseek", "openrouter", "deepseek/deepseek-chat", "DeepSeek (OpenRouter)", "نموذج مفتوح المصدر عبر OpenRouter", 0, 300, 1200,
    { vision: false, pdf: false, web: true, code: false, tools: true }, 40, 0);
  chat("qwen", "openrouter", "qwen/qwen3-max", "Qwen (OpenRouter)", "نموذج مفتوح المصدر عبر OpenRouter", 1, 1200, 6000,
    { vision: false, pdf: false, web: true, code: false, tools: true }, 41, 0);

  // الصور: unit_cost = نقاط لكل صورة
  ins.run("img-openai", "openai", "gpt-image-2", "GPT Image 2", "image", "صور عالية الدقة ونصوص داخل الصور", 1, 0, 0, 60, "{}", 1, 50);
  ins.run("img-google", "google", "gemini-nano-banana-2.1", "Nano Banana 2.1", "image", "صور Google السريعة", 1, 0, 0, 40, "{}", 1, 51);
  // الصوت: tts unit = نقاط لكل ١٠٠٠ حرف، stt unit = نقاط لكل دقيقة
  ins.run("tts-openai", "openai", "gpt-4o-mini-tts", "OpenAI TTS", "tts", "قراءة صوتية", 1, 0, 0, 15, "{}", 1, 60);
  ins.run("tts-google", "google", "gemini-3.8-flash-tts", "Gemini TTS", "tts", "قراءة صوتية من Google", 1, 0, 0, 15, "{}", 1, 61);
  ins.run("stt-openai", "openai", "gpt-4o-transcribe", "OpenAI Transcribe", "stt", "تحويل الكلام إلى نص", 0, 0, 0, 6, "{}", 1, 70);
}

/**
 * النماذج المفتوحة التي تعمل على الخادم نفسه (Ollama). لا يظهر منها للمستخدمين إلا ما نُزِّل فعلًا،
 * وتُنزَّل من لوحة الإدارة ← النماذج المحلية.
 */
function seedLocalModels(db: Database) {
  const ins = db.prepare(
    "INSERT OR IGNORE INTO models (id,provider,model_id,label,kind,description,tier,input_cost,output_cost,unit_cost,caps,enabled,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const caps = JSON.stringify({ vision: false, pdf: false, web: true, code: false, tools: true, think: false });
  ins.run("local-qwen-2b", "local", "qwen3.5:2b", "بصيرة الخفيف", "chat", "Qwen3.5 2B — للأجهزة ذات الذاكرة القليلة (٤ غ.ب)، دقته محدودة", 0, 60, 250, 0, caps, 1, 0);
  ins.run("local-qwen-4b", "local", "qwen3.5:4b", "بصيرة السريع", "chat", "Qwen3.5 4B — سريع على معالج الخادم، يحتاج نحو ٦ غ.ب ذاكرة", 0, 100, 400, 0, caps, 1, 1);
  ins.run("local-qwen-9b", "local", "qwen3.5:9b", "بصيرة المتوازن", "chat", "Qwen3.5 9B — أدق، يحتاج نحو ١٠ غ.ب ذاكرة", 0, 200, 800, 0, caps, 1, 2);
  ins.run("local-gptoss-20b", "local", "gpt-oss:20b", "بصيرة المتقدم", "chat", "gpt-oss 20B مفتوح الأوزان — قوي ومناسب للمعالج، يحتاج نحو ١٦ غ.ب", 1, 300, 1200, 0, caps, 1, 3);
  ins.run("local-qwen-35b", "local", "qwen3.5:35b", "بصيرة الأقوى", "chat", "Qwen3.5 35B — الأقوى للمعالج، يحتاج نحو ٢٨ غ.ب ذاكرة", 2, 400, 1600, 0, caps, 1, 4);
  ins.run("local-whisper", "local", "Systran/faster-whisper-small", "Whisper (محلي)", "stt", "تفريغ الكلام على الخادم نفسه", 0, 0, 0, 2, "{}", 1, 5);
}

export function getSetting(key: string, fallback = ""): string {
  const r = db().prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  return r ? r.value : fallback;
}
export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
