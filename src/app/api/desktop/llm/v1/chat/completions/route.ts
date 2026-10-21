import { isDesktop } from "@/lib/desktop";

export const maxDuration = 3600;

export async function POST(req: Request) {
  if (!isDesktop() || req.headers.get("authorization") !== `Bearer ${process.env.DESKTOP_TOKEN}`)
    return Response.json({ error: { message: "غير مسموح" } }, { status: 403 });
  const { chatCompletions } = await import("@/lib/desktop-llm");
  return chatCompletions(req);
}
