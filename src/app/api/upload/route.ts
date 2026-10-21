import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { saveFile, MAX_UPLOAD, guessType } from "@/lib/files";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    rateLimit("up:" + u.id, 40, 60_000);
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) throw new HttpError(400, "لم يُرسل ملف");
    if (f.size > MAX_UPLOAD) throw new HttpError(413, "حجم الملف أكبر من ٢٠ م.ب");
    const type = guessType(f.name, f.type);
    const id = saveFile(u.id, f.name, type, new Uint8Array(await f.arrayBuffer()));
    return Response.json({ id, name: f.name, mediaType: type, size: f.size });
  } catch (e) {
    return errorResponse(e);
  }
}
