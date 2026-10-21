import os from "node:os";
import { modelFile } from "./desktop-models";

/*
 * محرّك النماذج المدمج في برنامج سطح المكتب (llama.cpp عبر node-llama-cpp)،
 * بواجهة متوافقة مع /v1/chat/completions، فيبقى بقية النظام كما هو.
 * يستعمل بطاقة الرسوم تلقائيًّا إن وُجدت (Metal في ماك، Vulkan/CUDA في ويندوز)، وإلا المعالج.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type OAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | { type: string; text?: string }[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};
type OAITool = { type: "function"; function: { name: string; description?: string; parameters?: any } };

type G = typeof globalThis & {
  __llm?: { name: string; model: any; context: any; chat: any; llama: any };
  __llmLock?: Promise<unknown>;
};
const g = globalThis as G;

async function nlc(): Promise<any> {
  // استيراد ديناميكي: الحزمة موجودة في برنامج سطح المكتب وحده
  const name = "node-llama-cpp";
  return await import(/* webpackIgnore: true */ name);
}

export function loadedModels(): string[] {
  return g.__llm ? [g.__llm.name] : [];
}

async function ensureModel(name: string) {
  if (g.__llm?.name === name) return g.__llm;
  const file = modelFile(name);
  if (!file) throw new Error(`النموذج ${name} غير منزَّل`);
  if (g.__llm) {
    try { await g.__llm.context.dispose(); await g.__llm.model.dispose(); } catch {}
    g.__llm = undefined;
  }
  const { getLlama, LlamaChat } = await nlc();
  const llama = await getLlama({ build: "never", gpu: "auto" });
  const model = await llama.loadModel({ modelPath: file });
  const ctxSize = Number(process.env.LLM_CONTEXT || 16384);
  const context = await model.createContext({ contextSize: { min: 4096, max: ctxSize }, threads: Math.max(1, os.cpus().length - 1) });
  const chat = new LlamaChat({ contextSequence: context.getSequence() });
  g.__llm = { name, model, context, chat, llama };
  return g.__llm;
}

const textOf = (c: OAIMessage["content"]) =>
  typeof c === "string" ? c : Array.isArray(c) ? c.filter((p) => p.type === "text").map((p) => p.text || "").join("\n") : "";

/** رسائل OpenAI ← سجل node-llama-cpp (مع ربط نتائج الأدوات باستدعاءاتها). */
function toHistory(messages: OAIMessage[]) {
  const h: any[] = [];
  const pending = new Map<string, any>();
  for (const m of messages) {
    if (m.role === "system") h.push({ type: "system", text: textOf(m.content) });
    else if (m.role === "user") h.push({ type: "user", text: textOf(m.content) });
    else if (m.role === "assistant") {
      const response: any[] = [];
      const t = textOf(m.content);
      if (t) response.push(t);
      for (const tc of m.tool_calls || []) {
        let params: unknown = {};
        try { params = JSON.parse(tc.function.arguments || "{}"); } catch {}
        const call = { type: "functionCall", name: tc.function.name, params, result: null };
        pending.set(tc.id, call);
        response.push(call);
      }
      h.push({ type: "model", response });
    } else if (m.role === "tool") {
      const call = m.tool_call_id ? pending.get(m.tool_call_id) : null;
      let result: unknown = textOf(m.content);
      try { result = JSON.parse(result as string); } catch {}
      if (call) call.result = result;
    }
  }
  return h;
}

/** تبسيط مخطط JSON إلى ما يقبله مولّد القواعد في llama.cpp. */
function simplify(s: any): any {
  if (!s || typeof s !== "object") return { type: "string" };
  if (Array.isArray(s.anyOf)) return simplify(s.anyOf.find((x: any) => x.type !== "null") || s.anyOf[0]);
  const t = Array.isArray(s.type) ? s.type.find((x: string) => x !== "null") : s.type;
  if (t === "object") {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(s.properties || {})) props[k] = simplify(v);
    const out: any = { type: "object", properties: props };
    if (Array.isArray(s.required) && s.required.length) out.required = s.required;
    return out;
  }
  if (t === "array") return { type: "array", items: simplify(s.items) };
  if (s.enum) return { enum: s.enum };
  if (t === "integer" || t === "number" || t === "boolean" || t === "string") return { type: t, ...(s.description ? { description: s.description } : {}) };
  return { type: "string" };
}

/** طابور: طلب واحد في كل لحظة على النموذج. */
function lock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__llmLock || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  g.__llmLock = next.catch(() => {});
  return next;
}

export async function chatCompletions(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    model: string; messages: OAIMessage[]; tools?: OAITool[]; stream?: boolean; max_tokens?: number;
    temperature?: number; reasoning_effort?: string;
  };
  const enc = new TextEncoder();
  const id = "chatcmpl-" + Math.random().toString(36).slice(2);
  const created = Math.floor(Date.now() / 1000);
  const functions = body.tools?.length
    ? Object.fromEntries(body.tools.map((t) => [t.function.name, { description: t.function.description, params: simplify(t.function.parameters) }]))
    : undefined;

  const run = (onText: (t: string) => void) =>
    lock(async () => {
      const llm = await ensureModel(body.model);
      const history = toHistory(body.messages);
      const r = await llm.chat.generateResponse(history, {
        functions,
        maxTokens: body.max_tokens || 4096,
        temperature: body.temperature ?? 0.4,
        repeatPenalty: { penalty: 1.12, frequencyPenalty: 0.1, presencePenalty: 0.05, lastTokens: 128 },
        signal: req.signal,
        stopOnAbortSignal: true,
        onTextChunk: onText,
        budgets: { thoughtTokens: body.reasoning_effort === "none" || !body.reasoning_effort ? 0 : Infinity },
      });
      const inTok = llm.model.tokenize(body.messages.map((m) => textOf(m.content)).join("\n")).length;
      const outTok = llm.model.tokenize(r.response || "").length;
      return { r, inTok, outTok };
    });

  const toolCalls = (r: any) =>
    (r.functionCalls || []).map((fc: any, i: number) => ({
      index: i, id: `call_${Date.now()}_${i}`, type: "function",
      function: { name: fc.functionName, arguments: JSON.stringify(fc.params ?? {}) },
    }));

  if (!body.stream) {
    try {
      const { r, inTok, outTok } = await run(() => {});
      const calls = toolCalls(r);
      return Response.json({
        id, object: "chat.completion", created, model: body.model,
        choices: [{ index: 0, finish_reason: calls.length ? "tool_calls" : "stop", message: { role: "assistant", content: r.response, ...(calls.length ? { tool_calls: calls } : {}) } }],
        usage: { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok },
      });
    } catch (e) {
      return Response.json({ error: { message: (e as Error).message } }, { status: 500 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const sse = (o: object) => { try { c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch {} };
      const chunk = (delta: object, finish: string | null = null) =>
        sse({ id, object: "chat.completion.chunk", created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] });
      chunk({ role: "assistant", content: "" });
      try {
        const { r, inTok, outTok } = await run((t) => chunk({ content: t }));
        const calls = toolCalls(r);
        if (calls.length) chunk({ tool_calls: calls });
        chunk({}, calls.length ? "tool_calls" : "stop");
        sse({ id, object: "chat.completion.chunk", created, model: body.model, choices: [], usage: { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok } });
      } catch (e) {
        sse({ error: { message: (e as Error).message } });
      }
      try { c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
