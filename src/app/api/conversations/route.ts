import { requireUser, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.trim();
    const rows = q
      ? db().prepare(`SELECT DISTINCT c.id,c.title,c.mode,c.updated_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
          WHERE c.user_id=? AND (c.title LIKE ? OR m.parts LIKE ?) ORDER BY c.updated_at DESC LIMIT 100`).all(u.id, `%${q}%`, `%${q}%`)
      : db().prepare("SELECT id,title,mode,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 200").all(u.id);
    return Response.json({ conversations: rows });
  } catch (e) {
    return errorResponse(e);
  }
}
