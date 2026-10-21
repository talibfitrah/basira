import { errorResponse } from "@/lib/auth";
import { handleWebhook } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const r = await handleWebhook(raw, req.headers.get("stripe-signature") || "");
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
