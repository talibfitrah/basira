import { z } from "zod";
import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPlans, getPlan } from "@/lib/models";
import { stripe } from "@/lib/billing";
import { branding } from "@/lib/config";

const P = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().min(1).max(60),
  description: z.string().max(200).default(""),
  price_eur: z.number().min(0),
  monthly_credits: z.number().min(0),
  tier: z.number().int().min(0).max(9),
  stripe_price_id: z.string().max(100).nullable().optional(),
  features: z.array(z.string().max(120)).max(12).default([]),
  sort: z.number().int().default(0),
  active: z.boolean(),
});

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ plans: listPlans(false).map((p) => ({ ...p, features: JSON.parse(p.features), active: !!p.active })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "stripe-sync") {
      // ينشئ منتجًا وسعرًا شهريًّا باليورو في Stripe ويربطه بالباقة
      const plan = getPlan(String(body.id));
      if (!plan || plan.price_eur <= 0) throw new HttpError(400, "باقة غير صالحة أو مجانية");
      const s = stripe();
      const product = await s.products.create({ name: `${branding().appName} — ${plan.name}`, description: plan.description || undefined, metadata: { planId: plan.id } });
      const price = await s.prices.create({ product: product.id, currency: "eur", unit_amount: Math.round(plan.price_eur * 100), recurring: { interval: "month" }, metadata: { planId: plan.id } });
      db().prepare("UPDATE plans SET stripe_price_id=? WHERE id=?").run(price.id, plan.id);
      return Response.json({ ok: true, price: price.id });
    }
    const p = P.safeParse(body);
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    const v = p.data;
    db().prepare(`INSERT INTO plans (id,name,description,price_eur,monthly_credits,tier,stripe_price_id,features,sort,active)
      VALUES (@id,@name,@description,@price_eur,@monthly_credits,@tier,@stripe_price_id,@features,@sort,@active)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, price_eur=excluded.price_eur,
      monthly_credits=excluded.monthly_credits, tier=excluded.tier, stripe_price_id=excluded.stripe_price_id,
      features=excluded.features, sort=excluded.sort, active=excluded.active`)
      .run({ ...v, stripe_price_id: v.stripe_price_id || null, features: JSON.stringify(v.features), active: v.active ? 1 : 0 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
