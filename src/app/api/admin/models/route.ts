import { z } from "zod";
import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { listModels } from "@/lib/models";

const M = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/, "المعرّف: حروف لاتينية صغيرة وأرقام وشرطة"),
  provider: z.enum(["local", "anthropic", "openai", "google", "openrouter", "demo"]),
  model_id: z.string().min(1).max(120),
  label: z.string().min(1).max(80),
  kind: z.enum(["chat", "image", "tts", "stt"]),
  description: z.string().max(200).default(""),
  tier: z.number().int().min(0).max(9),
  input_cost: z.number().min(0),
  output_cost: z.number().min(0),
  unit_cost: z.number().min(0),
  caps: z.object({ vision: z.boolean().optional(), pdf: z.boolean().optional(), web: z.boolean().optional(), code: z.boolean().optional(), tools: z.boolean().optional(), think: z.boolean().optional() }).default({}),
  enabled: z.boolean(),
  sort: z.number().int().default(0),
});

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ models: listModels(undefined, false).map((m) => ({ ...m, caps: JSON.parse(m.caps), enabled: !!m.enabled })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const p = M.safeParse(await req.json());
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    const m = p.data;
    db().prepare(`INSERT INTO models (id,provider,model_id,label,kind,description,tier,input_cost,output_cost,unit_cost,caps,enabled,sort)
      VALUES (@id,@provider,@model_id,@label,@kind,@description,@tier,@input_cost,@output_cost,@unit_cost,@caps,@enabled,@sort)
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, model_id=excluded.model_id, label=excluded.label, kind=excluded.kind,
      description=excluded.description, tier=excluded.tier, input_cost=excluded.input_cost, output_cost=excluded.output_cost,
      unit_cost=excluded.unit_cost, caps=excluded.caps, enabled=excluded.enabled, sort=excluded.sort`)
      .run({ ...m, caps: JSON.stringify(m.caps), enabled: m.enabled ? 1 : 0 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    db().prepare("DELETE FROM models WHERE id=?").run(new URL(req.url).searchParams.get("id"));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
