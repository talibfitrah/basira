import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { assertCredits, assertModelAccess, getModel } from "@/lib/models";
import { runChat } from "@/lib/chat";
import { isDesktop, licenseState } from "@/lib/desktop";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 600;

const Body = z.object({
  conversationId: z.string().optional(),
  model: z.string(),
  mode: z.enum(["general", "scholar"]).default("general"),
  text: z.string().max(100_000).default(""),
  fileIds: z.array(z.string()).max(10).default([]),
  web: z.boolean().default(false),
  code: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (isDesktop() && !licenseState().valid) throw new HttpError(402, "البرنامج غير مفعَّل. افتح صفحة «الترخيص» وأدخل مفتاح التفعيل.");
    rateLimit("chat:" + u.id, 20, 60_000);
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, b.error.issues[0].message);
    const m = await assertModelAccess(u, getModel(b.data.model), "chat");
    assertCredits(u);
    const stream = runChat(u, { ...b.data, model: m }, req.signal);
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
