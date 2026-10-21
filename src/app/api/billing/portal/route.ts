import { requireUser, errorResponse } from "@/lib/auth";
import { createPortal } from "@/lib/billing";

export async function POST() {
  try {
    const u = await requireUser();
    return Response.json({ url: await createPortal(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
