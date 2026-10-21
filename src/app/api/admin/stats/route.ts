import { requireAdmin, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const d = db();
    const since = Date.now() - 30 * 864e5;
    return Response.json({
      users: (d.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c,
      newUsers30: (d.prepare("SELECT COUNT(*) c FROM users WHERE created_at>?").get(since) as { c: number }).c,
      byPlan: d.prepare("SELECT u.plan_id, p.name, COUNT(*) n, p.price_eur FROM users u LEFT JOIN plans p ON p.id=u.plan_id GROUP BY u.plan_id ORDER BY p.sort").all(),
      mrr: (d.prepare("SELECT COALESCE(SUM(p.price_eur),0) s FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.subscription_status IN ('active','trialing')").get() as { s: number }).s,
      usage: d.prepare(`SELECT kind, model, COUNT(*) n, SUM(input_tokens) inTok, SUM(output_tokens) outTok, SUM(credits) credits
                        FROM usage WHERE created_at>? GROUP BY kind, model ORDER BY credits DESC`).all(since),
      daily: d.prepare(`SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') day, COUNT(*) n, SUM(credits) credits
                        FROM usage WHERE created_at>? GROUP BY day ORDER BY day`).all(since),
      conversations: (d.prepare("SELECT COUNT(*) c FROM conversations").get() as { c: number }).c,
      messages: (d.prepare("SELECT COUNT(*) c FROM messages").get() as { c: number }).c,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
