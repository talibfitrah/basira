import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { isDesktop, licenseState, activateRemote, deactivateLocal, licenseServer } from "@/lib/desktop";

export async function GET() {
  try {
    if (!isDesktop()) throw new HttpError(404, "غير متاح");
    await requireUser();
    return Response.json({ ...licenseState(), server: licenseServer() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    if (!isDesktop()) throw new HttpError(404, "غير متاح");
    await requireUser();
    const { key } = await req.json();
    if (typeof key !== "string" || key.trim().length < 10) throw new HttpError(400, "اكتب مفتاح التفعيل");
    try {
      return Response.json(await activateRemote(key));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  try {
    if (!isDesktop()) throw new HttpError(404, "غير متاح");
    await requireUser();
    deactivateLocal();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
