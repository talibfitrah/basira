import { generateSpeech } from "ai";
import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { assertCredits, assertModelAccess, charge, getModel, listModels, speechModel } from "@/lib/models";
import { providerKey } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { friendlyError } from "@/lib/chat";

export const maxDuration = 120;

const Body = z.object({ text: z.string().min(1).max(8000), model: z.string().optional(), voice: z.string().max(40).optional() });

const DEFAULT_VOICE: Record<string, string> = { openai: "onyx", google: "Charon" };

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    rateLimit("tts:" + u.id, 20, 60_000);
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, b.error.issues[0].message);
    const row = b.data.model ? getModel(b.data.model) : listModels("tts").find((x) => !!providerKey(x.provider)) ?? null;
    const m = await assertModelAccess(u, row, "tts");
    const text = b.data.text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    const cost = (m.unit_cost * text.length) / 1000;
    assertCredits(u, cost);
    let r;
    try {
      r = await generateSpeech({
        model: speechModel(m), text, voice: b.data.voice || DEFAULT_VOICE[m.provider],
        instructions: "اقرأ بالعربية الفصحى قراءة واضحة متأنية بنبرة رجل وقور، مع إعطاء كل حرف حقه.",
        abortSignal: req.signal,
      });
    } catch (e) {
      throw new HttpError(502, friendlyError(e));
    }
    charge(u, "tts", m.id, cost, 0, 0, text.length);
    return new Response(new Uint8Array(r.audio.uint8Array), { headers: { "Content-Type": r.audio.mediaType || "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
