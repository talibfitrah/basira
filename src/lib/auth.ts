import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db, now } from "./db";

export const SESSION_COOKIE = "basira_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan_id: string;
  credits: number;
  credits_reset_at: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  period_end: number | null;
  disabled: number;
  created_at: number;
};

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const newId = (n = 16) => crypto.randomBytes(n).toString("base64url");

export function normEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const d = db();
  const e = normEmail(email);
  if (d.prepare("SELECT 1 FROM users WHERE email=?").get(e)) throw new Error("هذا البريد مسجَّل من قبل");
  const isFirst = (d.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c === 0;
  const adminEmail = normEmail(process.env.ADMIN_EMAIL || "");
  // إن حُدِّد ADMIN_EMAIL فهو وحده المدير؛ وإلا فأول حساب (للتجربة المحلية فقط)
  const role = (adminEmail ? adminEmail === e : isFirst) ? "admin" : "user";
  const free = d.prepare("SELECT monthly_credits FROM plans WHERE id='free'").get() as { monthly_credits: number } | undefined;
  const id = newId();
  d.prepare(
    "INSERT INTO users (id,email,name,password_hash,role,plan_id,credits,credits_reset_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(id, e, name.trim(), await bcrypt.hash(password, 11), role, "free", free?.monthly_credits ?? 0, now() + 30 * 864e5, now());
  return getUser(id)!;
}

export function getUser(id: string): User | null {
  return (db().prepare("SELECT * FROM users WHERE id=?").get(id) as User) || null;
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const u = db().prepare("SELECT * FROM users WHERE email=?").get(normEmail(email)) as (User & { password_hash: string }) | undefined;
  if (!u) {
    await bcrypt.compare(password, "$2b$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return null;
  }
  if (!(await bcrypt.compare(password, u.password_hash))) return null;
  return u;
}

export async function setPassword(userId: string, password: string) {
  db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(await bcrypt.hash(password, 11), userId);
  db().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = now() + SESSION_DAYS * 864e5;
  db().prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)").run(hash(token), userId, exp, now());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.PUBLIC_URL || "").startsWith("https://"),
    path: "/",
    expires: new Date(exp),
  });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) db().prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(t));
  jar.delete(SESSION_COOKIE);
}

/** المستخدم الحالي من الكعكة، مع تجديد الرصيد الشهري إن حلّ موعده. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  if (process.env.DESKTOP_MODE === "1") {
    // برنامج سطح المكتب: مستخدم محلي واحد، والكعكة السرية يضعها البرنامج لنافذته وحدها
    const { DESKTOP_COOKIE, desktopUserId } = await import("./desktop");
    if (!process.env.DESKTOP_TOKEN || jar.get(DESKTOP_COOKIE)?.value !== process.env.DESKTOP_TOKEN) return null;
    return getUser(desktopUserId());
  }
  const t = jar.get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const s = db().prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash=?").get(hash(t)) as
    | { user_id: string; expires_at: number }
    | undefined;
  if (!s || s.expires_at < now()) return null;
  const u = getUser(s.user_id);
  if (!u || u.disabled) return null;
  return refreshFreeCredits(u);
}

/** الباقة المجانية تتجدد شهريًّا هنا؛ المدفوعة تتجدد بحدث الدفع من Stripe. */
function refreshFreeCredits(u: User): User {
  if (u.plan_id === "free" && u.credits_reset_at < now()) {
    const p = db().prepare("SELECT monthly_credits FROM plans WHERE id='free'").get() as { monthly_credits: number };
    db().prepare("UPDATE users SET credits=?, credits_reset_at=? WHERE id=?").run(p.monthly_credits, now() + 30 * 864e5, u.id);
    return getUser(u.id)!;
  }
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "يلزم تسجيل الدخول");
  return u;
}
export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "هذه الصفحة للمشرف فقط");
  return u;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
  return Response.json({ error: msg }, { status: 500 });
}

export function publicUser(u: User) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, plan_id: u.plan_id,
    credits: Math.round(u.credits * 10) / 10, subscription_status: u.subscription_status, period_end: u.period_end,
  };
}
