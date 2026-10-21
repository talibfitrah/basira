import { errorResponse, HttpError } from "@/lib/auth";
import { activate } from "@/lib/license-server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

/** يستدعيه برنامج سطح المكتب للتفعيل ولتجديد الترخيص دوريًّا. */
export async function POST(req: Request) {
  try {
    rateLimit("lic:" + clientIp(req), 30, 3600_000);
    const b = await req.json();
    if (typeof b.key !== "string" || typeof b.device !== "string") throw new HttpError(400, "بيانات ناقصة");
    const r = activate(b.key, b.device, String(b.deviceName || ""));
    return Response.json({ license: r.token, expires: r.payload.exp });
  } catch (e) {
    return errorResponse(e);
  }
}
