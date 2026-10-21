import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { getFile, readFileBytes } from "@/lib/files";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    const f = getFile(id, u.role === "admin" ? undefined : u.id);
    if (!f) throw new HttpError(404, "الملف غير موجود");
    const dl = new URL(req.url).searchParams.has("download");
    const safeType = /^(image\/(png|jpeg|webp|gif)|audio\/|application\/pdf|text\/plain)/.test(f.media_type) ? f.media_type : "application/octet-stream";
    return new Response(new Uint8Array(readFileBytes(f)), {
      headers: {
        "Content-Type": safeType,
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
