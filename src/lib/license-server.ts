import { db, now, getSetting } from "./db";
import { HttpError, getUser, type User } from "./auth";
import { getPlan } from "./models";
import { numS } from "./format";
import { signLicense, newLicenseKey, normKey, type LicensePayload } from "./license";

export type LicenseRow = {
  key: string; user_id: string | null; devices: string; max_devices: number;
  expires_at: number | null; note: string; revoked: number; created_at: number;
};
type Device = { id: string; name: string; at: number };

function privateKey(): string {
  const v = process.env.LICENSE_PRIVATE_KEY || "";
  if (!v) throw new HttpError(503, "إصدار التراخيص غير مفعَّل على الخادم (LICENSE_PRIVATE_KEY)");
  return v.includes("BEGIN") ? v.replace(/\\n/g, "\n") : Buffer.from(v, "base64").toString("utf8");
}

/** أقل مستوى باقة يشمل برنامج سطح المكتب (الافتراضي: أي باقة مدفوعة). */
export const desktopMinTier = () => Number(getSetting("desktop_min_tier", "1"));

export function userLicense(u: User): LicenseRow {
  const d = db();
  let row = d.prepare("SELECT * FROM licenses WHERE user_id=? AND expires_at IS NULL AND revoked=0 ORDER BY created_at LIMIT 1").get(u.id) as LicenseRow | undefined;
  if (!row) {
    const key = newLicenseKey();
    d.prepare("INSERT INTO licenses (key,user_id,max_devices,created_at) VALUES (?,?,?,?)").run(key, u.id, 2, now());
    row = d.prepare("SELECT * FROM licenses WHERE key=?").get(key) as LicenseRow;
  }
  return row;
}

export function createManualLicense(opts: { userId?: string | null; days: number; maxDevices: number; note: string }) {
  const key = newLicenseKey();
  db().prepare("INSERT INTO licenses (key,user_id,max_devices,expires_at,note,created_at) VALUES (?,?,?,?,?,?)")
    .run(key, opts.userId || null, opts.maxDevices, now() + opts.days * 864e5, opts.note, now());
  return key;
}

/** يتحقق من المفتاح ويسجّل الجهاز، ثم يصدر ترخيصًا موقَّعًا. */
export function activate(keyRaw: string, device: string, deviceName: string): { token: string; payload: LicensePayload } {
  const key = normKey(keyRaw);
  if (!/^[a-f0-9]{16,64}$/.test(device)) throw new HttpError(400, "بصمة جهاز غير صالحة");
  const d = db();
  const lic = d.prepare("SELECT * FROM licenses WHERE key=?").get(key) as LicenseRow | undefined;
  if (!lic) throw new HttpError(404, "مفتاح التفعيل غير صحيح");
  if (lic.revoked) throw new HttpError(403, "هذا المفتاح موقوف");

  const user = lic.user_id ? getUser(lic.user_id) : null;
  let exp: number;
  let planName = "ترخيص خاص";
  let tier = 9;
  if (lic.expires_at) {
    if (lic.expires_at < now()) throw new HttpError(402, "انتهت مدة هذا المفتاح");
    exp = lic.expires_at;
  } else {
    if (!user || user.disabled) throw new HttpError(403, "الحساب المرتبط بالمفتاح غير متاح");
    const plan = getPlan(user.plan_id);
    const active = user.role === "admin" || ["active", "trialing", "past_due"].includes(user.subscription_status || "");
    if (!plan || (user.role !== "admin" && (!active || plan.tier < desktopMinTier())))
      throw new HttpError(402, "برنامج سطح المكتب يحتاج اشتراكًا فعّالًا. جدّد اشتراكك من صفحة الحساب ثم أعد المحاولة.");
    planName = plan.name;
    tier = user.role === "admin" ? 9 : plan.tier;
    // يعمل بلا اتصال حتى نهاية دورة الاشتراك (بحد أقصى ٣٥ يومًا) ثم ٧ أيام سماح
    const periodEnd = user.period_end && user.period_end > now() ? user.period_end : now() + 31 * 864e5;
    exp = Math.min(periodEnd, now() + 35 * 864e5) + 7 * 864e5;
  }

  const devices = JSON.parse(lic.devices) as Device[];
  const existing = devices.find((x) => x.id === device);
  if (!existing) {
    if (devices.length >= lic.max_devices)
      throw new HttpError(409, `المفتاح مفعَّل على ${numS(lic.max_devices)} أجهزة بالفعل. ألغِ تفعيل أحدها من صفحة الحساب.`);
    devices.push({ id: device, name: deviceName.slice(0, 80), at: now() });
  } else {
    existing.at = now();
  }
  d.prepare("UPDATE licenses SET devices=? WHERE key=?").run(JSON.stringify(devices), key);

  const payload: LicensePayload = { k: key, d: device, n: user?.name || lic.note || "", p: planName, t: tier, iat: now(), exp };
  return { token: signLicense(payload, privateKey()), payload };
}

export function removeDevice(key: string, device: string) {
  const lic = db().prepare("SELECT * FROM licenses WHERE key=?").get(normKey(key)) as LicenseRow | undefined;
  if (!lic) return;
  const devices = (JSON.parse(lic.devices) as Device[]).filter((x) => x.id !== device);
  db().prepare("UPDATE licenses SET devices=? WHERE key=?").run(JSON.stringify(devices), lic.key);
}


// روابط تنزيل البرنامج: ما ضُبط في لوحة الإدارة، وإلا ما في ملف .env
export const DOWNLOAD_KINDS = ["win", "mac", "macintel", "linux"] as const;
export type Downloads = Record<(typeof DOWNLOAD_KINDS)[number], string>;
export function desktopDownloads(): Downloads {
  const out = {} as Downloads;
  for (const k of DOWNLOAD_KINDS) out[k] = getSetting(`desktop_${k}_url`, process.env[`DESKTOP_${k.toUpperCase()}_URL`] || "");
  return out;
}
