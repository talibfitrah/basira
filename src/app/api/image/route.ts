import { generateImage } from "ai";
import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { assertCredits, assertModelAccess, charge, getModel, imageModel } from "@/lib/models";
import { saveFile } from "@/lib/files";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { friendlyError } from "@/lib/chat";

export const maxDuration = 300;

const Body = z.object({
  model: z.string(),
  prompt: z.string().min(3, "اكتب وصفًا أوضح").max(4000),
  aspectRatio: z.enum(["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
  n: z.number().int().min(1).max(4).default(1),
});

const SIZES: Record<string, string> = { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536", "16:9": "1536x1024", "9:16": "1024x1536", "4:3": "1536x1024", "3:4": "1024x1536" };

export async function GET() {
  try {
    const u = await requireUser();
    const rows = db().prepare("SELECT id, meta, created_at FROM files WHERE user_id=? AND kind='image' ORDER BY created_at DESC LIMIT 120").all(u.id) as { id: string; meta: string; created_at: number }[];
    return Response.json({ images: rows.map((r) => ({ id: r.id, ...JSON.parse(r.meta), created_at: r.created_at })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    rateLimit("img:" + u.id, 10, 60_000);
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, b.error.issues[0].message);
    const m = await assertModelAccess(u, getModel(b.data.model), "image");
    assertCredits(u, m.unit_cost * b.data.n);
    let result;
    try {
      result = await generateImage({
        model: imageModel(m),
        prompt: b.data.prompt,
        n: b.data.n,
        ...(m.provider === "openai" ? { size: SIZES[b.data.aspectRatio] as `${number}x${number}` } : { aspectRatio: b.data.aspectRatio as `${number}:${number}` }),
        abortSignal: req.signal,
      });
    } catch (e) {
      throw new HttpError(502, friendlyError(e));
    }
    const ids = result.images.map((img, i) =>
      saveFile(u.id, `image-${i + 1}.${img.mediaType.split("/")[1] || "png"}`, img.mediaType, img.uint8Array, "image",
        { prompt: b.data.prompt, model: m.label, aspectRatio: b.data.aspectRatio }));
    const credits = charge(u, "image", m.id, m.unit_cost * ids.length, 0, 0, ids.length);
    return Response.json({ images: ids.map((id) => ({ id, prompt: b.data.prompt, model: m.label })), credits });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireUser();
    const id = new URL(req.url).searchParams.get("id") || "";
    const { getFile, deleteFile } = await import("@/lib/files");
    const f = getFile(id, u.id);
    if (f && f.kind === "image") deleteFile(f);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
