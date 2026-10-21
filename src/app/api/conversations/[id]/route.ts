import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getConversation, conversationMessages } from "@/lib/chat";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    const c = getConversation(id, u.id);
    if (!c) throw new HttpError(404, "المحادثة غير موجودة");
    return Response.json({ conversation: c, messages: conversationMessages(id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    if (!getConversation(id, u.id)) throw new HttpError(404, "المحادثة غير موجودة");
    const { title } = await req.json();
    if (typeof title === "string" && title.trim()) db().prepare("UPDATE conversations SET title=? WHERE id=?").run(title.trim().slice(0, 120), id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    db().prepare("DELETE FROM conversations WHERE id=? AND user_id=?").run(id, u.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
