import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { ollamaStatus, ollamaPull, ollamaDelete, ollamaUrl, searxUrl, whisperUrl, searchWeb, whisperEnsure, whisperModel } from "@/lib/local";

export const maxDuration = 3600;

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    if (sp.get("test") === "search") {
      try { const r = await searchWeb("المسجد النبوي", 3); return Response.json({ ok: true, results: r }); }
      catch (e) { return Response.json({ ok: false, error: (e as Error).message }); }
    }
    return Response.json({ ollama: await ollamaStatus(), urls: { ollama: ollamaUrl(), searx: searxUrl(), whisper: whisperUrl() } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** تنزيل نموذج: يمرّر تقدّم Ollama سطرًا سطرًا إلى المتصفح. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { name, action } = await req.json();
    if (action === "whisper") return Response.json({ ok: true, message: await whisperEnsure(whisperModel()) });
    if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "اكتب اسم النموذج");
    const r = await ollamaPull(name.trim());
    return new Response(r.body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    await ollamaDelete(new URL(req.url).searchParams.get("name") || "");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
