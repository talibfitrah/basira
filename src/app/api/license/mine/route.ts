import { requireUser, errorResponse } from "@/lib/auth";
import { userLicense, removeDevice, desktopMinTier, desktopDownloads } from "@/lib/license-server";
import { getPlan } from "@/lib/models";

export async function GET() {
  try {
    const u = await requireUser();
    const plan = getPlan(u.plan_id);
    const active = u.role === "admin" || ["active", "trialing", "past_due"].includes(u.subscription_status || "");
    const eligible = u.role === "admin" || (active && (plan?.tier ?? 0) >= desktopMinTier());
    const downloads = desktopDownloads();
    if (!eligible) return Response.json({ eligible: false, downloads });
    const lic = userLicense(u);
    return Response.json({ eligible: true, key: lic.key, maxDevices: lic.max_devices, devices: JSON.parse(lic.devices), downloads });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireUser();
    const device = new URL(req.url).searchParams.get("device") || "";
    removeDevice(userLicense(u).key, device);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
