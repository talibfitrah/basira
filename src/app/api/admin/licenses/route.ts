import { z } from "zod";
import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { db, setSetting, getSetting } from "@/lib/db";
import { createManualLicense, desktopDownloads, DOWNLOAD_KINDS } from "@/lib/license-server";

export async function GET() {
  try {
    await requireAdmin();
    const rows = db().prepare(`SELECT l.*, u.email FROM licenses l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 300`).all();
    return Response.json({
      licenses: rows,
      enabled: !!process.env.LICENSE_PRIVATE_KEY,
      downloads: desktopDownloads(),
      minTier: Number(getSetting("desktop_min_tier", "1")),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({
  action: z.enum(["create", "revoke", "unrevoke", "settings"]),
  key: z.string().optional(),
  days: z.number().int().min(1).max(3650).optional(),
  maxDevices: z.number().int().min(1).max(50).optional(),
  note: z.string().max(120).optional(),
  downloads: z.object({ win: z.string(), mac: z.string(), macintel: z.string(), linux: z.string() }).partial().optional(),
  minTier: z.number().int().min(0).max(9).optional(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const p = Body.safeParse(await req.json());
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    const b = p.data;
    if (b.action === "create") return Response.json({ key: createManualLicense({ days: b.days ?? 365, maxDevices: b.maxDevices ?? 2, note: b.note ?? "" }) });
    if (b.action === "revoke" || b.action === "unrevoke") {
      db().prepare("UPDATE licenses SET revoked=? WHERE key=?").run(b.action === "revoke" ? 1 : 0, b.key ?? "");
      return Response.json({ ok: true });
    }
    for (const [k, v] of Object.entries(b.downloads || {})) if (typeof v === "string" && (DOWNLOAD_KINDS as readonly string[]).includes(k)) setSetting(`desktop_${k}_url`, v.trim());
    if (b.minTier !== undefined) setSetting("desktop_min_tier", String(b.minTier));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
