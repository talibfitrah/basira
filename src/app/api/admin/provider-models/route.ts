import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { fetchProviderModels } from "@/lib/models";
import { PROVIDERS, type Provider } from "@/lib/config";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const p = new URL(req.url).searchParams.get("provider") as Provider;
    if (!PROVIDERS.find((x) => x.id === p)) throw new HttpError(400, "مزوّد غير معروف");
    return Response.json({ models: await fetchProviderModels(p) });
  } catch (e) {
    return errorResponse(e);
  }
}
