import crypto from "node:crypto";
import { getSetting, setSetting } from "./db";

export type Provider = "local" | "anthropic" | "openai" | "google" | "openrouter" | "demo";
export const PROVIDERS: { id: Provider; label: string; env: string; url: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", env: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI (GPT)", env: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Google (Gemini)", env: "GOOGLE_GENERATIVE_AI_API_KEY", url: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter (مئات النماذج المفتوحة)", env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys" },
];

function secretKey(): Buffer {
  const s = process.env.APP_SECRET || "";
  if (s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET غير مضبوط أو قصير (١٦ حرفًا على الأقل)");
  }
  return crypto.createHash("sha256").update(s || "dev-secret-change-me").digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
export function decrypt(s: string): string {
  const [v, iv, tag, data] = s.split(":");
  if (v !== "v1") return "";
  const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** مفتاح المزوّد: ما ضُبط في لوحة الإدارة أولًا، ثم متغير البيئة. */
/**
 * وضع الاستقلال التام (الافتراضي): لا اتصال بأي شركة ذكاء اصطناعي، ولو ضُبطت مفاتيحها.
 * كل النماذج تعمل على خادمك (Ollama).
 */
export function independentMode() {
  return getSetting("independent", process.env.INDEPENDENT_MODE ?? "1") === "1";
}

export function providerKey(p: Provider): string {
  if (p === "demo") return process.env.DEMO_MODE === "1" ? "demo" : "";
  if (p === "local") return "local";
  if (independentMode()) return "";
  const stored = getSetting(`key_${p}`);
  if (stored) {
    try { return decrypt(stored); } catch { /* مفتاح تالف */ }
  }
  const env = PROVIDERS.find((x) => x.id === p)!.env;
  return process.env[env] || "";
}
export function setProviderKey(p: Provider, key: string) {
  setSetting(`key_${p}`, key ? encrypt(key) : "");
}
export function maskKey(k: string) {
  return k ? `${k.slice(0, 6)}…${k.slice(-4)}` : "";
}

export function stripeSecret() {
  const s = getSetting("stripe_secret");
  if (s) try { return decrypt(s); } catch {}
  return process.env.STRIPE_SECRET_KEY || "";
}
export function stripeWebhookSecret() {
  const s = getSetting("stripe_webhook_secret");
  if (s) try { return decrypt(s); } catch {}
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

export type Branding = {
  appName: string;
  tagline: string;
  indicDigits: boolean;
  allowRegistration: boolean;
  supportEmail: string;
};
export function branding(): Branding {
  return {
    appName: getSetting("app_name", process.env.APP_NAME || "بَصِيرة"),
    tagline: getSetting("tagline", "منصة ذكاء اصطناعي تجمع أقوى النماذج في مكان واحد، مع قسم علمي شرعي موثَّق"),
    indicDigits: getSetting("indic_digits", "1") === "1",
    allowRegistration: getSetting("allow_registration", "1") === "1",
    supportEmail: getSetting("support_email", process.env.SUPPORT_EMAIL || ""),
  };
}

export function publicUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
}
