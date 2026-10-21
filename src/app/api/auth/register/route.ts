import { z } from "zod";
import { createUser, startSession, errorResponse, HttpError, publicUser } from "@/lib/auth";
import { branding } from "@/lib/config";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const Body = z.object({
  email: z.string().email("بريد غير صالح"),
  password: z.string().min(8, "كلمة المرور ٨ أحرف على الأقل").max(200),
  name: z.string().min(1, "الاسم مطلوب").max(80),
});

export async function POST(req: Request) {
  try {
    rateLimit("reg:" + clientIp(req), 5, 3600_000);
    const isFirst = (db().prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c === 0;
    if (!isFirst && !branding().allowRegistration) throw new HttpError(403, "التسجيل مغلق حاليًّا");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const u = await createUser(parsed.data.email, parsed.data.password, parsed.data.name);
    await startSession(u.id);
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    if (e instanceof Error && e.message.includes("مسجَّل")) return Response.json({ error: e.message }, { status: 409 });
    return errorResponse(e);
  }
}
