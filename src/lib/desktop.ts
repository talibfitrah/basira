import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db, now } from "./db";
import { verifyLicense, deviceId, deviceName, normKey, type LicensePayload } from "./license";

/*
 * وضع سطح المكتب: البرنامج نفسه على حاسوب المستخدم، بمستخدم محلي واحد،
 * ونموذج يعمل داخل البرنامج، وترخيص موقَّع يُتحقق منه بلا إنترنت.
 */

export const isDesktop = () => process.env.DESKTOP_MODE === "1";
export const DESKTOP_COOKIE = "basira_desktop";
export const licenseServer = () => (process.env.LICENSE_SERVER || "https://ai.murabbie.org").replace(/\/$/, "");

const LICENSE_FILE = () => path.join(DATA_DIR, "license.json");

/** المستخدم المحلي الوحيد (يُنشأ أول مرة). */
export function desktopUserId(): string {
  const d = db();
  const row = d.prepare("SELECT id FROM users WHERE id='local'").get() as { id: string } | undefined;
  if (!row) {
    d.prepare("INSERT INTO users (id,email,name,password_hash,role,plan_id,credits,credits_reset_at,created_at) VALUES ('local','local@desktop','',?, 'admin','free',0,0,?)")
      .run("!", now());
  }
  return "local";
}

export type LicenseState = { valid: boolean; reason?: string; payload?: LicensePayload; daysLeft?: number };

type Stored = { token: string; refreshedAt: number };
function readStored(): Stored | null {
  try { return JSON.parse(fs.readFileSync(LICENSE_FILE(), "utf8")); } catch { return null; }
}

export function licenseState(): LicenseState {
  const s = readStored();
  if (!s) return { valid: false, reason: "لم يُفعَّل البرنامج بعد" };
  const p = verifyLicense(s.token);
  if (!p) return { valid: false, reason: "ملف الترخيص غير صالح" };
  if (p.d !== deviceId()) return { valid: false, reason: "الترخيص لجهاز آخر", payload: p };
  if (p.exp < Date.now()) return { valid: false, reason: "انتهت مدة الترخيص؛ اتصل بالإنترنت ليتجدد مع اشتراكك", payload: p };
  maybeRefresh(s, p);
  return { valid: true, payload: p, daysLeft: Math.floor((p.exp - Date.now()) / 864e5) };
}

/** يطلب الترخيص من المنصة ويحفظه. */
export async function activateRemote(key: string): Promise<LicenseState> {
  const r = await fetch(`${licenseServer()}/api/license/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: normKey(key), device: deviceId(), deviceName: deviceName() }),
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as { license?: string; error?: string };
  if (!r.ok || !j.license) throw new Error(j.error || `تعذّر الاتصال بخادم التفعيل (${r.status})`);
  if (!verifyLicense(j.license)) throw new Error("ترخيص غير موثوق من الخادم");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LICENSE_FILE(), JSON.stringify({ token: j.license, refreshedAt: Date.now() } satisfies Stored));
  return licenseState();
}

export function deactivateLocal() {
  try { fs.rmSync(LICENSE_FILE()); } catch {}
}

/* التجديد الصامت: كل ١٢ ساعة إن وُجد اتصال؛ وبلا اتصال يعمل البرنامج حتى تاريخ الترخيص. */
type G = typeof globalThis & { __licRefreshing?: boolean };
function maybeRefresh(s: Stored, p: LicensePayload) {
  const g = globalThis as G;
  if (g.__licRefreshing || Date.now() - s.refreshedAt < 12 * 3600_000) return;
  g.__licRefreshing = true;
  activateRemote(p.k)
    .catch((e) => {
      // الخادم رفض صراحةً (اشتراك منتهٍ أو مفتاح موقوف): نسجّل المحاولة ونترك الترخيص الحالي حتى ينتهي
      console.warn("[license] refresh:", (e as Error).message);
      try { fs.writeFileSync(LICENSE_FILE(), JSON.stringify({ ...s, refreshedAt: Date.now() - 11 * 3600_000 })); } catch {}
    })
    .finally(() => { g.__licRefreshing = false; });
}
