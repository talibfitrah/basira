import { requireUser, errorResponse } from "@/lib/auth";
import { createCheckout } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const { planId } = await req.json();
    return Response.json({ url: await createCheckout(u, String(planId)) });
  } catch (e) {
    return errorResponse(e);
  }
}
