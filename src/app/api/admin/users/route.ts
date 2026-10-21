import { z } from "zod";
import { requireAdmin, errorResponse, HttpError, setPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams.get("q")?.trim() || "";
    const rows = db().prepare(`SELECT u.id,u.email,u.name,u.role,u.plan_id,u.credits,u.subscription_status,u.period_end,u.disabled,u.created_at,
        (SELECT COALESCE(SUM(credits),0) FROM usage WHERE user_id=u.id AND created_at>?) used30
      FROM users u WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.created_at DESC LIMIT 300`)
      .all(Date.now() - 30 * 864e5, `%${q}%`, `%${q}%`);
    return Response.json({ users: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const Patch = z.object({
  id: z.string(),
  role: z.enum(["user", "admin"]).optional(),
  plan_id: z.string().optional(),
  credits: z.number().min(0).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const p = Patch.safeParse(await req.json());
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    const v = p.data;
    const d = db();
    if (v.id === admin.id && (v.role === "user" || v.disabled)) throw new HttpError(400, "لا يمكنك سحب صلاحيتك أو إيقاف حسابك بنفسك");
    if (v.role) d.prepare("UPDATE users SET role=? WHERE id=?").run(v.role, v.id);
    if (v.plan_id) d.prepare("UPDATE users SET plan_id=? WHERE id=?").run(v.plan_id, v.id);
    if (v.credits !== undefined) d.prepare("UPDATE users SET credits=? WHERE id=?").run(v.credits, v.id);
    if (v.disabled !== undefined) {
      d.prepare("UPDATE users SET disabled=? WHERE id=?").run(v.disabled ? 1 : 0, v.id);
      if (v.disabled) d.prepare("DELETE FROM sessions WHERE user_id=?").run(v.id);
    }
    if (v.password) await setPassword(v.id, v.password);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
