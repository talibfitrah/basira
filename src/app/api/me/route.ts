import { z } from "zod";
import { requireUser, errorResponse, publicUser, verifyLogin, setPassword, startSession, HttpError, getUser } from "@/lib/auth";
import { modelsForUser, getPlan, listPlans } from "@/lib/models";
import { branding, independentMode } from "@/lib/config";
import { isDesktop, licenseState } from "@/lib/desktop";
import { db } from "@/lib/db";
import { libraryInfo } from "@/lib/library";

export async function GET() {
  try {
    const u = await requireUser();
    const lib = libraryInfo();
    const since = Date.now() - 30 * 864e5;
    const usage = db().prepare("SELECT kind, COUNT(*) n, SUM(credits) credits FROM usage WHERE user_id=? AND created_at>? GROUP BY kind").all(u.id, since);
    return Response.json({
      user: publicUser(u),
      plan: getPlan(u.plan_id),
      plans: listPlans(),
      models: await modelsForUser(u, "chat"),
      imageModels: await modelsForUser(u, "image"),
      ttsModels: await modelsForUser(u, "tts"),
      sttModels: await modelsForUser(u, "stt"),
      branding: branding(),
      independent: independentMode(),
      desktop: isDesktop() ? { license: licenseState() } : null,
      library: lib.ready ? { ready: true, books: lib.books.length, quran: lib.quran } : { ready: false },
      usage,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "كلمة المرور ٨ أحرف على الأقل").max(200).optional(),
});

export async function PATCH(req: Request) {
  try {
    const u = await requireUser();
    const p = Patch.safeParse(await req.json());
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    if (p.data.name) db().prepare("UPDATE users SET name=? WHERE id=?").run(p.data.name.trim(), u.id);
    if (p.data.newPassword) {
      if (!p.data.currentPassword || !(await verifyLogin(u.email, p.data.currentPassword))) throw new HttpError(400, "كلمة المرور الحالية غير صحيحة");
      await setPassword(u.id, p.data.newPassword);
      await startSession(u.id);
    }
    return Response.json({ user: publicUser(getUser(u.id)!) });
  } catch (e) {
    return errorResponse(e);
  }
}
