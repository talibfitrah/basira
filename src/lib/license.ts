import crypto from "node:crypto";
import os from "node:os";

/*
 * التراخيص: رمز موقَّع بمفتاح Ed25519.
 *   - المنصة (الخادم) تملك المفتاح الخاص وتصدر الترخيص عند التفعيل.
 *   - برنامج سطح المكتب يحمل المفتاح العام فيتحقق من الترخيص بلا إنترنت حتى تاريخ انتهائه.
 */

export const LICENSE_PUBLIC_KEY =
  process.env.LICENSE_PUBLIC_KEY ||
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAhri3/v1z2A9Y22rwEuods2un3FAh5H5JmZ8G4qhghmQ=\n-----END PUBLIC KEY-----\n";

export type LicensePayload = {
  k: string;      // مفتاح التفعيل
  d: string;      // بصمة الجهاز
  n: string;      // اسم صاحب الترخيص
  p: string;      // اسم الباقة
  t: number;      // مستوى الباقة
  iat: number;    // وقت الإصدار (ms)
  exp: number;    // وقت الانتهاء (ms) — يعمل البرنامج بلا اتصال حتى هذا الوقت
};

const b64u = (b: Buffer) => b.toString("base64url");

export function signLicense(payload: LicensePayload, privatePem: string): string {
  const body = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, body, crypto.createPrivateKey(privatePem));
  return `${b64u(body)}.${b64u(sig)}`;
}

export function verifyLicense(token: string, publicPem = LICENSE_PUBLIC_KEY): LicensePayload | null {
  try {
    const [b, s] = token.split(".");
    const body = Buffer.from(b, "base64url");
    if (!crypto.verify(null, body, crypto.createPublicKey(publicPem), Buffer.from(s, "base64url"))) return null;
    return JSON.parse(body.toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}

/** بصمة الجهاز: ثابتة للجهاز نفسه، ولا تكشف معلوماته. */
export function deviceId(): string {
  const macs = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && !i.internal && i.mac && i.mac !== "00:00:00:00:00:00")
    .map((i) => i!.mac).sort();
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo().username, macs[0] || ""].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function deviceName(): string {
  const p = { win32: "Windows", darwin: "macOS", linux: "Linux" }[os.platform() as string] || os.platform();
  return `${os.hostname()} (${p})`;
}

/** شكل مفتاح التفعيل: BSR-XXXXX-XXXXX-XXXXX-XXXXX */
export function newLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(20);
  const chars = [...bytes].map((x) => alphabet[x % alphabet.length]).join("");
  return `BSR-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}`;
}

export const normKey = (k: string) => k.trim().toUpperCase().replace(/\s+/g, "");
