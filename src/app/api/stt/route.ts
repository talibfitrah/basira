import { transcribe } from "ai";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { assertCredits, assertModelAccess, charge, listModels, modelAvailable, transcriptionModel } from "@/lib/models";
import { rateLimit } from "@/lib/ratelimit";
import { friendlyError } from "@/lib/chat";
import { whisperEnsure, whisperModel } from "@/lib/local";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    rateLimit("stt:" + u.id, 20, 60_000);
    const form = await req.formData();
    const f = form.get("audio");
    if (!(f instanceof File)) throw new HttpError(400, "لم يُرسل صوت");
    if (f.size > 24 * 1024 * 1024) throw new HttpError(413, "التسجيل أطول من المسموح");
    const cands = listModels("stt");
    const ok = await Promise.all(cands.map(modelAvailable));
    const m = await assertModelAccess(u, cands.find((_, i) => ok[i]) ?? null, "stt");
    assertCredits(u, 0.5);
    let r;
    try {
      const audio = new Uint8Array(await f.arrayBuffer());
      const run = () => transcribe({ model: transcriptionModel(m), audio, abortSignal: req.signal, providerOptions: { openai: { language: "ar" } } });
      try {
        r = await run();
      } catch (e) {
        // الخادم المحلي لم ينزّل النموذج بعد: ننزّله ثم نعيد المحاولة
        if (m.provider !== "local") throw e;
        await whisperEnsure(whisperModel());
        r = await run();
      }
    } catch (e) {
      throw new HttpError(502, friendlyError(e));
    }
    const minutes = Math.max(0.1, (r.durationInSeconds ?? f.size / 16000) / 60);
    charge(u, "stt", m.id, m.unit_cost * minutes, 0, 0, minutes);
    return Response.json({ text: r.text });
  } catch (e) {
    return errorResponse(e);
  }
}
