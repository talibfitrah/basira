import { streamText, tool, isStepCount, type ModelMessage } from "ai";
import { z } from "zod";
import { db, now } from "./db";
import { newId, HttpError, type User } from "./auth";
import { caps, charge, languageModel, nativeTools, tokenCost, type ModelRow } from "./models";
import { getFile, readFileBytes, isImage, isPdf, isText, saveFile } from "./files";
import { libraryInfo, searchLibrary, readPages, quranAyat, quranSearch, verifyQuotes, type QuoteCheck } from "./library";
import { systemPrompt } from "./prompts";
// @ts-ignore — وحدة JS مشتركة
import { keywords } from "./arabic.mjs";
import { searchWeb, fetchPage } from "./local";

export type Part =
  | { type: "text"; text: string }
  | { type: "file"; fileId: string; mediaType: string; name: string };

export type Conversation = {
  id: string; user_id: string; title: string; mode: "general" | "scholar"; model: string | null;
  created_at: number; updated_at: number;
};
export type MessageRow = { id: string; conversation_id: string; role: "user" | "assistant"; parts: string; meta: string; created_at: number };

export function getConversation(id: string, userId: string): Conversation | null {
  const c = db().prepare("SELECT * FROM conversations WHERE id=? AND user_id=?").get(id, userId) as Conversation | undefined;
  return c || null;
}

export function createConversation(userId: string, mode: "general" | "scholar", model: string, title: string) {
  const id = newId(12);
  db().prepare("INSERT INTO conversations (id,user_id,title,mode,model,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, userId, title, mode, model, now(), now());
  return getConversation(id, userId)!;
}

export function conversationMessages(convId: string) {
  return (db().prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid").all(convId) as MessageRow[])
    .map((m) => ({ id: m.id, role: m.role, parts: JSON.parse(m.parts) as Part[], meta: JSON.parse(m.meta), created_at: m.created_at }));
}

function addMessage(convId: string, role: "user" | "assistant", parts: Part[], meta: object = {}) {
  const id = newId(12);
  db().prepare("INSERT INTO messages (id,conversation_id,role,parts,meta,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, convId, role, JSON.stringify(parts), JSON.stringify(meta), now());
  db().prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(now(), convId);
  return id;
}

/** يحوّل سجل المحادثة إلى رسائل النموذج، مع إرفاق الملفات بحسب قدرات النموذج. */
/** استخراج نص PDF وWord على الخادم نفسه، للنماذج التي لا تقرأ الملفات مباشرة. */
async function extractDocText(f: { media_type: string; name: string }, bytes: Buffer): Promise<string | null> {
  try {
    if (isPdf(f.media_type)) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      return (Array.isArray(text) ? text.join("\n") : text).trim();
    }
    if (/wordprocessingml|msword/.test(f.media_type) || /\.docx$/i.test(f.name)) {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: bytes });
      return r.value.trim();
    }
  } catch (e) {
    console.error("[extract]", (e as Error).message);
  }
  return null;
}

async function toModelMessages(history: ReturnType<typeof conversationMessages>, m: ModelRow, userId: string): Promise<ModelMessage[]> {
  const c = caps(m);
  const recent = history.slice(-40);
  const out: ModelMessage[] = [];
  for (const msg of recent) {
    if (msg.role === "assistant") {
      const text = msg.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n");
      if (text) out.push({ role: "assistant", content: text });
      continue;
    }
    const arr: Array<Record<string, unknown>> = [];
    for (const p of msg.parts) {
      let extracted: string | null = null;
      if (p.type === "text") { arr.push({ type: "text", text: p.text }); continue; }
      const f = getFile(p.fileId, userId);
      if (!f) continue;
      if (isImage(f.media_type) && c.vision) {
        arr.push({ type: "file", mediaType: f.media_type, data: readFileBytes(f) });
      } else if (isPdf(f.media_type) && c.pdf) {
        arr.push({ type: "file", mediaType: "application/pdf", data: readFileBytes(f), filename: f.name });
      } else if (!isImage(f.media_type) && !isText(f.media_type, f.name) && (extracted = await extractDocText(f, readFileBytes(f))) !== null) {
        const t = extracted.slice(0, 200_000);
        arr.push({ type: "text", text: t ? `\n[نص الملف المرفق: ${f.name}]\n${t}` : `[الملف «${f.name}» لا يحوي نصًّا قابلًا للاستخراج؛ لعله مصوَّر]` });
      } else if (isText(f.media_type, f.name)) {
        const t = readFileBytes(f).toString("utf8").slice(0, 200_000);
        arr.push({ type: "text", text: `\n[الملف المرفق: ${f.name}]\n\`\`\`\n${t}\n\`\`\`` });
      } else {
        arr.push({ type: "text", text: `[أرفق المستخدم الملف «${f.name}» لكن هذا النموذج لا يقرأ هذا النوع من الملفات]` });
      }
    }
    if (arr.length) out.push({ role: "user", content: arr } as unknown as ModelMessage);
  }
  return out;
}

function libraryTools() {
  return {
    library_search: tool({
      description: "البحث النصي في المكتبة الشرعية الموثقة (تفاسير، كتب السنة وشروحها، كتب الألباني في التخريج، فتاوى ابن تيمية وابن القيم وابن باز وابن عثيمين). استعمله قبل أي نقل أو عزو. اكتب كلمات مفتاحية مميزة من النص المطلوب لا جملة طويلة.",
      inputSchema: z.object({
        query: z.string().describe("كلمات البحث بالعربية، مثل: إنما الأعمال بالنيات"),
        book_ids: z.array(z.number()).optional().describe("تقييد البحث بكتب معيّنة بأرقامها إن عُرفت"),
      }),
      execute: async ({ query, book_ids }) => {
        const hits = searchLibrary(query, { books: book_ids, limit: 8 });
        if (!hits.length) return { found: 0, note: "لا نتائج. جرّب كلمات أخرى أو صيغة أقصر." };
        return { found: hits.length, results: hits };
      },
    }),
    library_read: tool({
      description: "قراءة صفحة كاملة من كتاب في المكتبة (مع الصفحة السابقة واللاحقة اختياريًّا) للتحقق من السياق قبل النقل.",
      inputSchema: z.object({ book_id: z.number(), page_id: z.number(), around: z.number().min(0).max(2).optional() }),
      execute: async ({ book_id, page_id, around }) => ({ pages: readPages(book_id, page_id, around ?? 0) }),
    }),
    quran_ayat: tool({
      description: "جلب نص آيات القرآن بالرسم العثماني من مصدر موثق برقم السورة والآيات. يجب استعماله لكتابة أي آية.",
      inputSchema: z.object({ sura: z.number().min(1).max(114), from: z.number().min(1), to: z.number().optional() }),
      execute: async ({ sura, from, to }) => quranAyat(sura, from, to) ?? { error: "سورة أو آية غير صحيحة" },
    }),
    quran_search: tool({
      description: "البحث عن آية بكلمات منها، يعيد السورة ورقم الآية.",
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => ({ results: quranSearch(text) }),
    }),
  };
}

/** بحث الويب للنماذج المحلية عبر محرك SearXNG المستضاف على الخادم نفسه. */
function webTools() {
  return {
    web_search: tool({
      description: "البحث في الإنترنت عن معلومات حديثة. يعيد عناوين وروابط ومقتطفات. استعمله لما يتغير مع الزمن أو لا تعرفه، ثم اقرأ أنفع النتائج بأداة web_read.",
      inputSchema: z.object({ query: z.string().describe("عبارة البحث") }),
      execute: async ({ query }) => {
        try { return { results: await searchWeb(query) }; } catch (e) { return { error: (e as Error).message }; }
      },
    }),
    web_read: tool({
      description: "قراءة نص صفحة ويب من رابطها، للتحقق من التفاصيل قبل الاعتماد عليها.",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        try { return await fetchPage(url, 8000); } catch (e) { return { error: (e as Error).message }; }
      },
    }),
  };
}

export type ChatInput = {
  conversationId?: string;
  model: ModelRow;
  mode: "general" | "scholar";
  text: string;
  fileIds: string[];
  web: boolean;
  code: boolean;
};

const enc = new TextEncoder();
const line = (o: object) => enc.encode(JSON.stringify(o) + "\n");

/** يشغّل المحادثة ويعيد تدفّق NDJSON بالأحداث: meta, text, reasoning, tool, source, file, done, error. */
export function runChat(user: User, input: ChatInput, signal: AbortSignal): ReadableStream<Uint8Array> {
  const { model: m } = input;
  let conv = input.conversationId ? getConversation(input.conversationId, user.id) : null;
  if (input.conversationId && !conv) throw new HttpError(404, "المحادثة غير موجودة");
  if (!conv) {
    const title = input.text.replace(/\s+/g, " ").trim().slice(0, 60) || "محادثة جديدة";
    conv = createConversation(user.id, input.mode, m.id, title);
  } else {
    db().prepare("UPDATE conversations SET model=? WHERE id=?").run(m.id, conv.id);
  }
  const mode = conv.mode;

  const parts: Part[] = [];
  for (const fid of input.fileIds.slice(0, 10)) {
    const f = getFile(fid, user.id);
    if (f) parts.push({ type: "file", fileId: f.id, mediaType: f.media_type, name: f.name });
  }
  if (input.text.trim()) parts.push({ type: "text", text: input.text });
  if (!parts.length) throw new HttpError(400, "الرسالة فارغة");
  const userMsgId = addMessage(conv.id, "user", parts);

  const history = conversationMessages(conv.id);
  const messagesP = toModelMessages(history, m, user.id);
  const lib = libraryInfo();
  const c = caps(m);
  const fnTools = {
    ...((mode === "scholar" || (m.provider === "local" && lib.ready)) && c.tools !== false ? libraryTools() : {}),
    ...(m.provider === "local" && input.web && c.tools !== false ? { web_read: webTools().web_read } : {}),
  };
  const tools = { ...fnTools, ...nativeTools(m, { web: input.web, code: input.code }, Object.keys(fnTools).length > 0) };
  const convId = conv.id;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: object) => { try { controller.enqueue(line(o)); } catch {} };
      send({ t: "meta", conversationId: convId, userMessageId: userMsgId, title: conv!.title, mode });

      let text = "";
      let reasoning = "";
      const sources: { url: string; title?: string }[] = [];
      const toolsUsed: { name: string; input?: unknown }[] = [];
      const files: { fileId: string; mediaType: string; name: string }[] = [];
      let inTok = 0, outTok = 0;
      let errorMsg = "";
      let messages: ModelMessage[] = [];

      // النماذج المحلية: نسترجع النصوص من المكتبة قبل التوليد ونضعها أمام النموذج،
      // فلا يعتمد الجواب على أن يتذكّر النموذج استدعاء أداة البحث.
      let retrieved = "";
      if (mode === "scholar" && m.provider === "local" && lib.ready && input.text.trim()) {
        const kw = keywords(input.text) || input.text;
        const ayat = quranSearch(kw, 4) as { sura: number; sura_name: string; aya: number; text: string }[];
        const hits = searchLibrary(kw, { limit: 6 });
        const blocks: string[] = [];
        ayat.forEach((a) => blocks.push(`﴿${a.text}﴾ [${a.sura_name}: ${a.aya}]`));
        hits.forEach((h, i) => {
          blocks.push(`[${i + 1}] ${h.ref}\n${h.text.slice(0, 1200)}`);
          if (!sources.some((x) => x.url === h.url)) { sources.push({ url: h.url, title: h.ref }); send({ t: "source", url: h.url, title: h.ref, library: true }); }
        });
        send({ t: "tool", name: "library_search", input: { query: kw } });
        retrieved = blocks.length
          ? `\n\n### نصوص من المكتبة الموثقة متعلقة بالسؤال\n${blocks.join("\n\n")}\n\n### قاعدة النقل\nلا تنقل آية ولا حديثًا ولا قولًا إلا من النصوص أعلاه بلفظها، واذكر مرجعه بين معقوفين بعده. وإن لم تجد فيها ما يجيب فقل: «لم أقف في المكتبة على نص في هذا»، ولا تكمل من ذاكرتك.`
          : `\n\nلم يُعثر في المكتبة على نصوص متعلقة بهذا السؤال؛ فقل ذلك صراحة، ولا تنقل آية ولا حديثًا من ذاكرتك.`;
      }

      // النماذج المحلية مع البحث في الويب: نبحث ونقرأ أنفع الصفحات قبل التوليد
      if (m.provider === "local" && input.web && input.text.trim()) {
        send({ t: "tool", name: "web_search", input: { query: input.text.slice(0, 120) } });
        try {
          const hits = await searchWeb(input.text.slice(0, 300), 6);
          const readable = hits.filter((h) => !/youtube\.com|youtu\.be|tiktok\.com|facebook\.com|instagram\.com|x\.com|twitter\.com/.test(h.url));
          const pages = (await Promise.allSettled(readable.slice(0, 3).map((h) => fetchPage(h.url, 3500))))
            .map((r, i) => (r.status === "fulfilled" ? { ...r.value, title: r.value.title || readable[i].title } : null))
            .filter(Boolean) as { url: string; title: string; text: string }[];
          const blocks = pages.map((pg, i) => `[${i + 1}] ${pg.title} — ${pg.url}\n${pg.text}`);
          readable.slice(3).forEach((h, i) => blocks.push(`[${pages.length + i + 1}] ${h.title} — ${h.url}\n${h.snippet}`));
          pages.forEach((pg) => { if (!sources.some((x) => x.url === pg.url)) { sources.push({ url: pg.url, title: pg.title }); send({ t: "source", url: pg.url, title: pg.title }); } });
          if (blocks.length) retrieved += `\n\n### نتائج البحث في الويب (اليوم)\n${blocks.join("\n\n")}\n\nأجب من هذه النتائج، واذكر رقم المصدر بين معقوفين بعد كل معلومة. وإن لم تكفِ فقل ذلك.`;
        } catch (e) {
          retrieved += `\n\nتعذّر البحث في الويب الآن (${(e as Error).message}). أخبر المستخدم بذلك.`;
        }
      }

      try {
        messages = await messagesP;
        const result = streamText({
          model: languageModel(m, { web: input.web }),
          instructions: systemPrompt(mode, { userName: user.name, hasLibrary: lib.ready, webEnabled: input.web }) + retrieved,
          messages,
          tools: tools as Parameters<typeof streamText>[0]["tools"],
          stopWhen: isStepCount(mode === "scholar" ? 12 : 6),
          // في القسم الشرعي: الخطوة الأولى بحث في المكتبة إلزامًا، فلا يُجاب من الذاكرة
          prepareStep: ({ stepNumber }) =>
            stepNumber === 0 && mode === "scholar" && lib.ready && m.provider !== "local" && "library_search" in fnTools
              ? { toolChoice: "required" as const } : undefined,
          abortSignal: signal,
          maxRetries: 2,
          // النماذج المحلية على معالج الخادم: التفكير المطوّل يبطئها جدًّا، فيُطفأ ما لم يُفعَّل للنموذج
          ...(m.provider === "local" && !c.think
            ? { providerOptions: { local: { reasoningEffort: "none" }, openaiCompatible: { reasoningEffort: "none" } } }
            : {}),
        });
        for await (const p of result.stream) {
          switch (p.type) {
            case "text-delta":
              text += p.text; send({ t: "text", d: p.text }); break;
            case "reasoning-delta":
              reasoning += p.text; send({ t: "reasoning", d: p.text }); break;
            case "tool-call": {
              const tc = p as { toolName: string; input?: unknown };
              toolsUsed.push({ name: tc.toolName, input: tc.input });
              send({ t: "tool", name: tc.toolName, input: tc.input });
              break;
            }
            case "source":
              if (p.sourceType === "url" && !sources.some((s) => s.url === p.url)) {
                sources.push({ url: p.url, title: p.title });
                send({ t: "source", url: p.url, title: p.title });
              }
              break;
            case "tool-result": {
              // نُظهر روابط المكتبة مصادرَ للقارئ
              const tr = p as { toolName?: string; output?: { results?: { url: string; ref?: string; title?: string }[]; pages?: { url: string; ref: string }[]; url?: string; title?: string } };
              const out = tr.output;
              if (tr.toolName === "web_read" && out?.url && !sources.some((s) => s.url === out.url)) {
                sources.push({ url: out.url, title: out.title });
                send({ t: "source", url: out.url, title: out.title });
              }
              if (tr.toolName === "web_search") break; // نتائج البحث وحدها ليست مصادر حتى تُقرأ
              for (const r of [...(out?.results || []), ...(out?.pages || [])]) {
                if (r?.url && r.ref && !sources.some((s) => s.url === r.url)) {
                  sources.push({ url: r.url, title: r.ref });
                  send({ t: "source", url: r.url, title: r.ref, library: true });
                }
              }
              break;
            }
            case "file": {
              const f = p.file;
              const ext = f.mediaType.split("/")[1] || "bin";
              const fileId = saveFile(user.id, `output.${ext}`, f.mediaType, f.uint8Array, "output");
              files.push({ fileId, mediaType: f.mediaType, name: `output.${ext}` });
              send({ t: "file", fileId, mediaType: f.mediaType });
              break;
            }
            case "finish":
              inTok = p.totalUsage.inputTokens ?? 0;
              outTok = p.totalUsage.outputTokens ?? 0;
              break;
            case "error":
              errorMsg = friendlyError(p.error);
              break;
          }
        }
        if (!inTok && !outTok) {
          try {
            const u = await result.usage;
            inTok = u.inputTokens ?? 0; outTok = u.outputTokens ?? 0;
          } catch {}
        }
      } catch (e) {
        errorMsg = signal.aborted ? "" : friendlyError(e);
      }

      // عند الإيقاف قبل اكتمال الرد لا يرسل المزوّد الاستهلاك؛ نقدّره تقديرًا
      if (!inTok && !outTok && (text || reasoning)) {
        inTok = Math.ceil(JSON.stringify(messages).length / 3);
        outTok = Math.ceil((text.length + reasoning.length) / 3);
      }
      // التحقق الآلي من النقول (الآيات والأحاديث والأقوال المنصوصة) في المكتبة
      let verify: QuoteCheck[] = [];
      if (text && lib.ready && (mode === "scholar" || /ﷺ|﴿|رواه|قال رسول الله|صلى الله عليه وسلم|قال تعالى/.test(text))) {
        try { verify = verifyQuotes(text); } catch (e) { console.error("[verify]", e); }
        if (verify.length) send({ t: "verify", items: verify });
      }
      const credits = charge(user, "chat", m.id, tokenCost(m, inTok, outTok), inTok, outTok);
      const aParts: Part[] = [...files.map((f) => ({ type: "file" as const, ...f }))];
      if (text) aParts.push({ type: "text", text });
      if (aParts.length || errorMsg) {
        addMessage(convId, "assistant", aParts.length ? aParts : [{ type: "text", text: "" }], {
          model: m.id, modelLabel: m.label, sources, tools: toolsUsed, reasoning: reasoning.slice(0, 20000),
          usage: { inTok, outTok }, credits, verify: verify.length ? verify : undefined, error: errorMsg || undefined, aborted: signal.aborted || undefined,
        });
      }
      if (errorMsg) send({ t: "error", message: errorMsg });
      send({ t: "done", credits, usage: { inTok, outTok } });
      try { controller.close(); } catch {}
    },
  });
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[chat]", msg);
  if (/api key|apikey|authentication|401|invalid x-api-key/i.test(msg)) return "مفتاح المزوّد غير صالح. على المشرف مراجعة المفاتيح في لوحة الإدارة.";
  if (/rate.?limit|429|overloaded|529/i.test(msg)) return "المزوّد مشغول الآن، أعد المحاولة بعد لحظات.";
  if (/model.*(not found|does not exist)|404/i.test(msg)) return "اسم النموذج غير صحيح أو غير متاح لحسابك لدى المزوّد. عدّله من لوحة الإدارة.";
  if (/context|too long|maximum.*tokens/i.test(msg)) return "المحادثة أو الملفات أطول مما يتسع له النموذج. ابدأ محادثة جديدة أو اختصر المرفقات.";
  if (/credit|billing|quota|insufficient/i.test(msg)) return "رصيد حساب المزوّد نفد. على المشرف شحن حساب المزوّد.";
  return "حدث خطأ أثناء التوليد: " + msg.slice(0, 200);
}
