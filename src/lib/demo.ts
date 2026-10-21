import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

type Msg = { role: string; content: unknown };
type Opts = { prompt: Msg[]; tools?: { name: string }[] };

function lastUserText(prompt: Msg[]) {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const parts = m.content as { type: string; text?: string }[];
    return parts.filter((p) => p.type === "text").map((p) => p.text).join(" ");
  }
  return "";
}

const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: o, text: o, reasoning: undefined },
});

function textStream(reply: string) {
  const chunks = reply.match(/[\s\S]{1,12}/g) || [];
  return simulateReadableStream({
    initialDelayInMs: 120,
    chunkDelayInMs: 15,
    chunks: [
      { type: "text-start", id: "t" },
      ...chunks.map((c) => ({ type: "text-delta", id: "t", delta: c })),
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: usage(150, Math.ceil(reply.length / 3)) },
    ],
  });
}

/**
 * نموذج تجريبي يعمل بلا مفاتيح (DEMO_MODE=1) لعرض الواجهة واختبارها.
 * في القسم الشرعي يستدعي أداة البحث في المكتبة فعلًا ثم يعرض ما وجده.
 */
export function demoModel() {
  return new MockLanguageModelV4({
    doStream: async (opts: Opts) => {
      const asked = lastUserText(opts.prompt).slice(0, 300);
      const hasLib = opts.tools?.some((t) => t.name === "library_search");
      const toolMsgs = opts.prompt.filter((m) => m.role === "tool");
      if (hasLib && !toolMsgs.length) {
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 100,
            chunks: [
              { type: "tool-call", toolCallId: "c1", toolName: "library_search", input: JSON.stringify({ query: asked }) },
              { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: usage(150, 20) },
            ],
          }),
        };
      }
      if (hasLib) {
        const refs: string[] = [];
        const walk = (v: unknown) => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            if (typeof o.ref === "string") refs.push(o.ref);
            Object.values(o).forEach(walk);
          }
        };
        walk(toolMsgs.at(-1)?.content);
        refs.splice(5);
        const reply = refs.length
          ? `بحثتُ في المكتبة الشرعية عن «${asked}» فوقفتُ على المواضع الآتية:\n\n${refs.map((r) => `- ${r}`).join("\n")}\n\nهذا **ردّ تجريبي**: النموذج الحقيقي يقرأ هذه النصوص وينقل منها بعزوٍ دقيق، بعد ضبط مفاتيح المزوّدين.`
          : `لم أقف في المكتبة المتاحة على «${asked}». (ردّ تجريبي)`;
        return { stream: textStream(reply) };
      }
      const reply = `هذا **ردّ تجريبي** من وضع العرض؛ اضبط مفاتيح المزوّدين من لوحة الإدارة لتعمل النماذج الحقيقية.\n\nسؤالك كان: «${asked}»\n\n| الميزة | الحالة |\n|---|---|\n| البث المباشر | يعمل |\n| حفظ المحادثة | يعمل |\n\n\`\`\`python\nprint("بسم الله")\n\`\`\``;
      return { stream: textStream(reply) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
