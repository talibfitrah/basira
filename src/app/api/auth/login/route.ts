import { verifyLogin, startSession, errorResponse, HttpError, publicUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  try {
    rateLimit("login:" + clientIp(req), 10, 600_000);
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") throw new HttpError(400, "بيانات ناقصة");
    const u = await verifyLogin(email, password);
    if (!u) throw new HttpError(401, "البريد أو كلمة المرور غير صحيحة");
    if (u.disabled) throw new HttpError(403, "الحساب موقوف، راسل الإدارة");
    await startSession(u.id);
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
