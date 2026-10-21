import Stripe from "stripe";
import { db, now } from "./db";
import { stripeSecret, stripeWebhookSecret, publicUrl, branding } from "./config";
import { HttpError, type User, getUser } from "./auth";
import { getPlan, listPlans, type Plan } from "./models";

export function stripe(): Stripe {
  const key = stripeSecret();
  if (!key) throw new HttpError(503, "الدفع غير مفعَّل بعد. على المشرف ضبط مفتاح Stripe.");
  return new Stripe(key);
}
export const billingEnabled = () => !!stripeSecret();

async function ensureCustomer(s: Stripe, u: User) {
  if (u.stripe_customer_id) return u.stripe_customer_id;
  const c = await s.customers.create({ email: u.email, name: u.name || undefined, metadata: { userId: u.id } });
  db().prepare("UPDATE users SET stripe_customer_id=? WHERE id=?").run(c.id, u.id);
  return c.id;
}

export async function createCheckout(u: User, planId: string) {
  const plan = getPlan(planId);
  if (!plan || !plan.active || plan.price_eur <= 0) throw new HttpError(400, "باقة غير صالحة");
  if (!plan.stripe_price_id) throw new HttpError(503, "لم يُربط سعر Stripe بهذه الباقة بعد");
  const s = stripe();
  const customer = await ensureCustomer(s, u);
  // إن كان له اشتراك قائم فالتغيير من بوابة العميل
  if (u.stripe_subscription_id && ["active", "trialing", "past_due"].includes(u.subscription_status || "")) {
    return createPortal(u);
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${publicUrl()}/account?paid=1`,
    cancel_url: `${publicUrl()}/pricing`,
    allow_promotion_codes: true,
    locale: "auto",
    client_reference_id: u.id,
    metadata: { userId: u.id, planId: plan.id },
    subscription_data: { metadata: { userId: u.id, planId: plan.id }, description: `${branding().appName} — ${plan.name}` },
  });
  return session.url!;
}

export async function createPortal(u: User) {
  if (!u.stripe_customer_id) throw new HttpError(400, "لا يوجد اشتراك مدفوع بعد");
  const s = stripe();
  const p = await s.billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: `${publicUrl()}/account` });
  return p.url;
}

function planForPrice(priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  return listPlans(false).find((p) => p.stripe_price_id === priceId) || null;
}

type AnySub = Stripe.Subscription & { current_period_end?: number };
function periodEnd(sub: AnySub): number | null {
  const t = sub.current_period_end ?? (sub.items?.data?.[0] as unknown as { current_period_end?: number })?.current_period_end;
  return t ? t * 1000 : null;
}

function userForSub(sub: Stripe.Subscription): User | null {
  const byMeta = sub.metadata?.userId ? getUser(sub.metadata.userId) : null;
  if (byMeta) return byMeta;
  const cid = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return (db().prepare("SELECT * FROM users WHERE stripe_customer_id=?").get(cid) as User) || null;
}

/** يطبّق حالة الاشتراك على المستخدم. resetCredits=true عند بداية دورة مدفوعة جديدة. */
function applySubscription(sub: Stripe.Subscription, resetCredits: boolean) {
  const u = userForSub(sub);
  if (!u) return;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const plan = active ? planForPrice(sub.items.data[0]?.price?.id) || getPlan(sub.metadata?.planId || "") : getPlan("free");
  const pe = periodEnd(sub as AnySub);
  const d = db();
  if (active && plan) {
    d.prepare("UPDATE users SET plan_id=?, stripe_subscription_id=?, subscription_status=?, period_end=? WHERE id=?")
      .run(plan.id, sub.id, sub.status, pe, u.id);
    if (resetCredits || u.plan_id !== plan.id) {
      // عند الترقية يُضاف رصيد الباقة الجديدة؛ عند التجديد يُعاد ضبطه
      const credits = resetCredits ? plan.monthly_credits : Math.max(u.credits, plan.monthly_credits);
      d.prepare("UPDATE users SET credits=?, credits_reset_at=? WHERE id=?").run(credits, pe ?? now() + 30 * 864e5, u.id);
    }
  } else {
    const free = getPlan("free");
    d.prepare("UPDATE users SET plan_id='free', subscription_status=?, period_end=NULL, credits=MIN(credits, ?), credits_reset_at=? WHERE id=?")
      .run(sub.status, free?.monthly_credits ?? 0, now() + 30 * 864e5, u.id);
  }
}

export async function handleWebhook(raw: string, signature: string) {
  const secret = stripeWebhookSecret();
  if (!secret) throw new HttpError(503, "سرّ Webhook غير مضبوط");
  const s = stripe();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, signature, secret);
  } catch {
    throw new HttpError(400, "توقيع غير صالح");
  }
  const seen = db().prepare("INSERT OR IGNORE INTO stripe_events (id, created_at) VALUES (?, ?)").run(event.id, now());
  if (seen.changes === 0) return { duplicate: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      const uid = cs.client_reference_id || cs.metadata?.userId;
      if (uid && cs.customer) db().prepare("UPDATE users SET stripe_customer_id=? WHERE id=?").run(typeof cs.customer === "string" ? cs.customer : cs.customer.id, uid);
      if (cs.subscription) {
        const sub = await s.subscriptions.retrieve(typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id);
        applySubscription(sub, true);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      applySubscription(event.data.object as Stripe.Subscription, false);
      break;
    case "customer.subscription.deleted":
      applySubscription({ ...(event.data.object as Stripe.Subscription), status: "canceled" } as Stripe.Subscription, false);
      break;
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice & { subscription?: string; parent?: { subscription_details?: { subscription?: string } } };
      const subId = inv.parent?.subscription_details?.subscription || inv.subscription;
      // أول فاتورة تعالجها checkout.session.completed؛ هنا التجديدات
      if (subId && inv.billing_reason === "subscription_cycle") {
        applySubscription(await s.subscriptions.retrieve(subId), true);
      }
      break;
    }
  }
  return { ok: true, type: event.type };
}
