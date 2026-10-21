"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell, { useMe, type ModelOpt } from "./AppShell";
import Markdown from "./Markdown";
import { api, num } from "@/lib/client";
import {
  IconSend, IconStop, IconPlus, IconClip, IconMic, IconGlobe, IconCode, IconBook, IconX, IconTrash,
  IconCopy, IconCheck, IconSpeaker, IconSearch, IconLock, IconSpark,
} from "./Icons";

type Part = { type: "text"; text: string } | { type: "file"; fileId: string; mediaType: string; name: string };
type Msg = {
  id: string; role: "user" | "assistant"; parts: Part[];
  meta: { modelLabel?: string; sources?: { url: string; title?: string; library?: boolean }[]; tools?: { name: string; input?: unknown }[]; credits?: number; error?: string; reasoning?: string;
    verify?: { text: string; ok: boolean; kind: string; ref?: string; url?: string }[] };
  streaming?: boolean;
};
type ConvItem = { id: string; title: string; mode: string; updated_at: number };
type Attach = { id: string; name: string; mediaType: string; uploading?: boolean };

const TOOL_LABELS: Record<string, string> = {
  library_search: "بحث في المكتبة", library_read: "قراءة صفحة", quran_ayat: "جلب آيات", quran_search: "بحث في القرآن",
  web_search: "بحث في الويب", google_search: "بحث في الويب", code_execution: "تشغيل شيفرة", code_interpreter: "تشغيل شيفرة",
};

export default function ChatApp() {
  return (
    <AppShell sidebar={<ConvList />}>
      <ChatView />
    </AppShell>
  );
}

/* ------------ قائمة المحادثات ------------ */
function useConvs() {
  const [list, setList] = useState<ConvItem[]>([]);
  const load = useCallback(async (q = "") => {
    const r = await api<{ conversations: ConvItem[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setList(r.conversations);
  }, []);
  return { list, load };
}

let refreshConvs: () => void = () => {};

function ConvList() {
  const { list, load } = useConvs();
  const [q, setQ] = useState("");
  const sp = useSearchParams();
  const router = useRouter();
  const active = sp.get("c");
  useEffect(() => { refreshConvs = () => load(q); }, [load, q]);
  useEffect(() => { const t = setTimeout(() => load(q).catch(() => {}), q ? 300 : 0); return () => clearTimeout(t); }, [q, load]);

  async function del(id: string) {
    if (!confirm("حذف هذه المحادثة نهائيًّا؟")) return;
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    if (active === id) router.push("/chat");
    load(q);
  }
  return (
    <div className="p-2">
      <button onClick={() => router.push("/chat?new=" + Date.now())} className="btn btn-ghost w-full mb-2"><IconPlus className="w-4 h-4" />محادثة جديدة</button>
      <div className="relative mb-2">
        <IconSearch className="w-4 h-4 absolute top-2.5 start-2.5 text-[var(--color-muted)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في محادثاتك" className="input !py-1.5 ps-8 text-sm" />
      </div>
      <ul className="space-y-0.5">
        {list.map((c) => (
          <li key={c.id} className={`group flex items-center rounded-lg ${active === c.id ? "bg-[var(--color-brand-soft)]" : "hover:bg-[var(--color-brand-soft)]/60"}`}>
            <button onClick={() => router.push(`/chat?c=${c.id}`)} className="flex-1 min-w-0 text-start px-2.5 py-2 text-sm">
              <span className="flex items-center gap-1.5">
                {c.mode === "scholar" && <IconBook className="w-3.5 h-3.5 text-[var(--color-gold)] shrink-0" />}
                <span className="truncate">{c.title}</span>
              </span>
            </button>
            <button onClick={() => del(c.id)} className="p-2 opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-[var(--color-danger)]" aria-label="حذف">
              <IconTrash className="w-4 h-4" />
            </button>
          </li>
        ))}
        {!list.length && <li className="text-sm text-[var(--color-muted)] px-2 py-3">لا محادثات بعد</li>}
      </ul>
    </div>
  );
}

/* ------------ نافذة المحادثة ------------ */
function ChatView() {
  const { me, reload } = useMe();
  const sp = useSearchParams();
  const router = useRouter();
  const convParam = sp.get("c");
  const newParam = sp.get("new");
  const modeParam = sp.get("mode");

  const [convId, setConvId] = useState<string | null>(convParam);
  const [mode, setMode] = useState<"general" | "scholar">(modeParam === "scholar" ? "scholar" : "general");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<Attach[]>([]);
  const [modelId, setModelId] = useState("");
  const [web, setWeb] = useState(false);
  const [code, setCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const liveConv = useRef<string | null>(null);

  // اختيار النموذج: المحفوظ ثم أول نموذج متاح
  useEffect(() => {
    if (!me || modelId) return;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("model") : null;
    const usable = me.models.filter((m) => !m.locked);
    setModelId(usable.find((m) => m.id === saved)?.id || usable[0]?.id || "");
  }, [me, modelId]);

  // تحميل المحادثة عند تغيّر الرابط
  useEffect(() => {
    if (convParam && convParam === liveConv.current) return;
    abortRef.current?.abort();
    liveConv.current = null;
    setErr("");
    if (!convParam) { setConvId(null); setMsgs([]); setMode(modeParam === "scholar" ? "scholar" : "general"); return; }
    if (convParam === liveConv.current || (convParam === convId && msgs.length)) return;
    setConvId(convParam);
    api<{ conversation: { mode: "general" | "scholar"; model: string | null }; messages: Msg[] }>(`/api/conversations/${convParam}`)
      .then((r) => { setMsgs(r.messages); setMode(r.conversation.mode); stickRef.current = true; })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convParam, newParam]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const model = me?.models.find((m) => m.id === modelId);
  const canUpload = true;

  async function upload(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      const tmp: Attach = { id: "tmp-" + Math.random(), name: f.name, mediaType: f.type, uploading: true };
      setAttach((a) => [...a, tmp]);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api<{ id: string; name: string; mediaType: string }>("/api/upload", { method: "POST", body: fd });
        setAttach((a) => a.map((x) => (x.id === tmp.id ? { id: r.id, name: r.name, mediaType: r.mediaType } : x)));
      } catch (e) {
        setAttach((a) => a.filter((x) => x.id !== tmp.id));
        setErr((e as Error).message);
      }
    }
  }

  async function send() {
    const t = text.trim();
    if ((!t && !attach.length) || busy || !modelId || attach.some((a) => a.uploading)) return;
    setErr("");
    setBusy(true);
    stickRef.current = true;
    const userMsg: Msg = {
      id: "u" + Date.now(), role: "user", meta: {},
      parts: [...attach.map((a) => ({ type: "file" as const, fileId: a.id, mediaType: a.mediaType, name: a.name })), ...(t ? [{ type: "text" as const, text: t }] : [])],
    };
    const aMsg: Msg = { id: "a" + Date.now(), role: "assistant", parts: [], meta: { modelLabel: model?.label, sources: [], tools: [] }, streaming: true };
    setMsgs((m) => [...m, userMsg, aMsg]);
    setText("");
    const fileIds = attach.map((a) => a.id);
    setAttach([]);
    const ac = new AbortController();
    abortRef.current = ac;

    const patch = (fn: (m: Msg) => Msg) => setMsgs((list) => list.map((m) => (m.id === aMsg.id ? fn(m) : m)));
    const appendText = (d: string) => patch((m) => {
      const parts = [...m.parts];
      const last = parts[parts.length - 1];
      if (last && last.type === "text") parts[parts.length - 1] = { type: "text", text: last.text + d };
      else parts.push({ type: "text", text: d });
      return { ...m, parts };
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId || undefined, model: modelId, mode, text: t, fileIds, web, code }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `خطأ ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const ln = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!ln.trim()) continue;
          const ev = JSON.parse(ln);
          if (ev.t === "meta") {
            if (!convId) {
              liveConv.current = ev.conversationId;
              setConvId(ev.conversationId);
              window.history.replaceState(null, "", `/chat?c=${ev.conversationId}`);
              refreshConvs();
            }
          } else if (ev.t === "text") appendText(ev.d);
          else if (ev.t === "reasoning") patch((m) => ({ ...m, meta: { ...m.meta, reasoning: (m.meta.reasoning || "") + ev.d } }));
          else if (ev.t === "tool") patch((m) => ({ ...m, meta: { ...m.meta, tools: [...(m.meta.tools || []), { name: ev.name, input: ev.input }] } }));
          else if (ev.t === "source") patch((m) => ({ ...m, meta: { ...m.meta, sources: [...(m.meta.sources || []), { url: ev.url, title: ev.title, library: ev.library }] } }));
          else if (ev.t === "file") patch((m) => ({ ...m, parts: [{ type: "file", fileId: ev.fileId, mediaType: ev.mediaType, name: "output" }, ...m.parts] }));
          else if (ev.t === "verify") patch((m) => ({ ...m, meta: { ...m.meta, verify: ev.items } }));
          else if (ev.t === "error") patch((m) => ({ ...m, meta: { ...m.meta, error: ev.message } }));
          else if (ev.t === "done") patch((m) => ({ ...m, meta: { ...m.meta, credits: ev.credits } }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((m) => ({ ...m, meta: { ...m.meta, error: (e as Error).message } }));
    } finally {
      patch((m) => ({ ...m, streaming: false }));
      setBusy(false);
      abortRef.current = null;
      reload().catch(() => {});
      refreshConvs();
      taRef.current?.focus();
    }
  }

  function chooseModel(id: string) {
    setModelId(id);
    try { localStorage.setItem("model", id); } catch {}
  }

  function newChat(m: "general" | "scholar") {
    router.push(`/chat?new=${Date.now()}${m === "scholar" ? "&mode=scholar" : ""}`);
  }

  const empty = msgs.length === 0;
  return (
    <div className="flex-1 min-h-0 flex flex-col"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[var(--color-line)]">
        <ModelPicker models={me?.models || []} value={modelId} onChange={chooseModel} />
        <div className="flex rounded-xl border border-[var(--color-line)] overflow-hidden text-sm" role="tablist">
          <button disabled={!!convId} onClick={() => newChat("general")} className={`px-3 py-1.5 ${mode === "general" ? "bg-[var(--color-brand)] text-white" : ""}`}>عام</button>
          <button disabled={!!convId} onClick={() => newChat("scholar")} className={`px-3 py-1.5 flex items-center gap-1 ${mode === "scholar" ? "bg-[var(--color-brand)] text-white" : ""}`}>
            <IconBook className="w-4 h-4" />شرعي
          </button>
        </div>
        {mode === "scholar" && me && !me.library.ready && <span className="text-xs text-[var(--color-gold)]">المكتبة الشرعية لم تُعدّ بعد على الخادم</span>}
      </div>

      {/* الرسائل */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin"
        onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <div className="max-w-3xl mx-auto px-4 py-6">
          {empty && <Welcome mode={mode} onPick={(s) => { setText(s); taRef.current?.focus(); }} noModels={!!me && me.models.length === 0} isAdmin={me?.user.role === "admin"} />}
          {msgs.map((m) => <MessageView key={m.id} m={m} />)}
          {err && <p className="text-[var(--color-danger)] text-sm my-3">{err}</p>}
        </div>
      </div>

      {/* المحرر */}
      <div className="px-3 pb-3 pt-1">
        <div className="max-w-3xl mx-auto card p-2 shadow-sm">
          {!!attach.length && (
            <div className="flex flex-wrap gap-1.5 p-1.5">
              {attach.map((a) => (
                <span key={a.id} className="chip max-w-56">
                  {a.mediaType.startsWith("image/") && !a.uploading
                    ? <img src={`/api/files/${a.id}`} alt="" className="w-5 h-5 rounded object-cover" />
                    : <IconClip className="w-3.5 h-3.5" />}
                  <span className="truncate">{a.uploading ? "يُرفع… " : ""}{a.name}</span>
                  <button onClick={() => setAttach((x) => x.filter((y) => y.id !== a.id))} aria-label="إزالة"><IconX className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
          )}
          <textarea ref={taRef} value={text} rows={1}
            onChange={(e) => { setText(e.target.value); const t = e.target; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 260) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); upload(fs); } }}
            placeholder={mode === "scholar" ? "اسأل عن مسألة شرعية، أو اطلب تخريج حديث أو تفسير آية…" : "اكتب رسالتك… (Shift+Enter لسطر جديد)"}
            className="w-full resize-none bg-transparent outline-none px-2 py-2 text-[1rem] leading-relaxed max-h-64" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }}
              accept="image/*,application/pdf,.docx,.txt,.md,.csv,.json,.html,.xml,.py,.js,.ts" />
            {canUpload && <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg hover:bg-[var(--color-brand-soft)]" title="إرفاق ملف"><IconClip /></button>}
            {!!me?.sttModels.length && <MicButton onText={(t) => setText((x) => (x ? x + " " : "") + t)} />}
            {model?.caps.web && (
              <button onClick={() => setWeb((v) => !v)} className="chip" data-on={web} title="البحث في الويب"><IconGlobe className="w-4 h-4" />الويب</button>
            )}
            {model?.caps.code && mode === "general" && (
              <button onClick={() => setCode((v) => !v)} className="chip" data-on={code} title="تشغيل الشيفرة"><IconCode className="w-4 h-4" />تشغيل الشيفرة</button>
            )}
            <div className="flex-1" />
            {busy ? (
              <button onClick={() => abortRef.current?.abort()} className="btn btn-ghost !p-2" aria-label="إيقاف"><IconStop /></button>
            ) : (
              <button onClick={send} disabled={!modelId || (!text.trim() && !attach.length)} className="btn btn-primary !p-2" aria-label="إرسال"><IconSend /></button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-[var(--color-muted)] mt-1.5">قد يخطئ الذكاء الاصطناعي؛ تحقّق من المعلومات المهمة.</p>
      </div>
    </div>
  );
}

function ModelPicker({ models, value, onChange }: { models: ModelOpt[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = models.find((m) => m.id === value);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn btn-ghost !py-1.5 text-sm">
        <IconSpark className="w-4 h-4 text-[var(--color-brand)]" />{cur?.label || "اختر النموذج"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 start-0 w-80 max-h-96 overflow-y-auto scroll-thin card p-1.5 shadow-lg">
            {models.map((m) => (
              <button key={m.id} disabled={m.locked} onClick={() => { onChange(m.id); setOpen(false); }}
                className={`w-full text-start px-3 py-2 rounded-lg ${m.id === value ? "bg-[var(--color-brand-soft)]" : "hover:bg-[var(--color-brand-soft)]/60"} disabled:opacity-60`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{m.label}</span>
                  {m.locked && <span className="chip !text-[11px]"><IconLock className="w-3 h-3" />باقة أعلى</span>}
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">{m.description}</div>
              </button>
            ))}
            {!models.length && <p className="p-3 text-sm text-[var(--color-muted)]">لا نماذج مفعّلة بعد. يضبطها المشرف من لوحة الإدارة.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Welcome({ mode, onPick, noModels, isAdmin }: { mode: string; onPick: (s: string) => void; noModels: boolean; isAdmin?: boolean }) {
  const { me } = useMe();
  const general = ["لخّص لي هذا الملف في نقاط", "اكتب لي رسالة رسمية لطلب إجازة", "اشرح لي فكرة الذكاء الاصطناعي ببساطة", "صمّم لي صفحة ويب بسيطة لمسجد"];
  const scholar = ["خرّج حديث «إنما الأعمال بالنيات» واذكر حكمه", "ما تفسير آية الكرسي عند السعدي؟", "ما حكم صلاة الجماعة مع الأدلة والراجح؟", "ما أنواع التوحيد مع أدلتها؟"];
  return (
    <div className="text-center py-10">
      <h2 className="font-serif text-3xl font-bold">{mode === "scholar" ? "القسم الشرعي" : `مرحبًا${me?.user.name ? ` ${me.user.name}` : ""}`}</h2>
      <p className="text-[var(--color-muted)] mt-2">
        {mode === "scholar" ? "أجوبة موثَّقة من المكتبة الشرعية، بعزو كل نقل إلى مصدره ورابطه." : "بماذا أستطيع أن أخدمك اليوم؟"}
      </p>
      {noModels && (
        <p className="mt-4 text-sm text-[var(--color-gold)]">لم تُضبط مفاتيح أي مزوّد بعد. {isAdmin ? <a className="underline" href="/admin">اضبطها من لوحة الإدارة</a> : "راسل الإدارة."}</p>
      )}
      <div className="grid sm:grid-cols-2 gap-2 mt-8 text-start">
        {(mode === "scholar" ? scholar : general).map((s) => (
          <button key={s} onClick={() => onPick(s)} className="card px-4 py-3 text-sm hover:border-[var(--color-brand)]">{s}</button>
        ))}
      </div>
    </div>
  );
}

function MessageView({ m }: { m: Msg }) {
  const text = m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n");
  const files = m.parts.filter((p) => p.type === "file") as Extract<Part, { type: "file" }>[];
  if (m.role === "user") {
    return (
      <div className="flex justify-end my-4">
        <div className="max-w-[85%] bg-[var(--color-brand-soft)] rounded-2xl rounded-se-sm px-4 py-2.5">
          {!!files.length && <FileStrip files={files} />}
          {text && <div className="whitespace-pre-wrap leading-relaxed">{text}</div>}
        </div>
      </div>
    );
  }
  const tools = m.meta.tools || [];
  const sources = m.meta.sources || [];
  return (
    <div className="my-5">
      <div className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-2">
        <IconSpark className="w-3.5 h-3.5 text-[var(--color-brand)]" />{m.meta.modelLabel}
      </div>
      {!!tools.length && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tools.map((t, i) => (
            <span key={i} className="chip !text-[11px]" title={JSON.stringify(t.input ?? "")}>
              {TOOL_LABELS[t.name] || t.name}{typeof (t.input as { query?: string })?.query === "string" ? `: ${(t.input as { query: string }).query.slice(0, 40)}` : ""}
            </span>
          ))}
        </div>
      )}
      {m.meta.reasoning && (
        <details className="mb-2 text-sm text-[var(--color-muted)]">
          <summary className="cursor-pointer">مسار التفكير</summary>
          <div className="whitespace-pre-wrap mt-1 border-s-2 border-[var(--color-line)] ps-3">{m.meta.reasoning}</div>
        </details>
      )}
      {!!files.length && <FileStrip files={files} />}
      {text ? <div className={m.streaming ? "caret" : ""}><Markdown text={text} /></div>
        : m.streaming ? <div className="caret text-[var(--color-muted)]">{tools.length ? "يبحث ويتحقق" : "يفكّر"}</div> : null}
      {m.meta.error && <p className="text-sm text-[var(--color-danger)] mt-2">{m.meta.error}</p>}
      {!!m.meta.verify?.length && <VerifyBox items={m.meta.verify} />}
      {!!sources.length && (
        <div className="mt-3 card p-3">
          <div className="text-xs font-semibold text-[var(--color-muted)] mb-1.5">المصادر</div>
          <ol className="text-sm space-y-1 ps-5" style={{ listStyleType: "arabic-indic" }}>
            {sources.slice(0, 20).map((s, i) => (
              <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] hover:underline">{s.title || s.url}</a></li>
            ))}
          </ol>
        </div>
      )}
      {!m.streaming && text && <MsgActions text={text} credits={m.meta.credits} />}
    </div>
  );
}

function VerifyBox({ items }: { items: NonNullable<Msg["meta"]["verify"]> }) {
  const bad = items.filter((x) => !x.ok).length;
  return (
    <div className={`mt-3 card p-3 text-sm ${bad ? "border-[var(--color-danger)]/50" : "border-[var(--color-brand)]/40"}`}>
      <div className="font-semibold mb-1.5">
        التحقق الآلي من النقول: {bad ? <span className="text-[var(--color-danger)]">{num(bad)} من {num(items.length)} لم يُعثر عليها في المكتبة — لا تعتمدها قبل مراجعتها</span>
          : <span className="text-[var(--color-brand)]">وُجدت كلها في المكتبة</span>}
      </div>
      <ul className="space-y-1">
        {items.map((v, i) => (
          <li key={i} className="flex gap-1.5 items-start">
            <span className={v.ok ? "text-[var(--color-brand)]" : "text-[var(--color-danger)]"}>{v.ok ? "✓" : "✗"}</span>
            <span className="flex-1">«{v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text}»
              {v.ok && v.ref ? <> — <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline">{v.ref}</a></> : !v.ok ? <span className="text-[var(--color-muted)]"> — لم يُعثر عليه</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileStrip({ files }: { files: Extract<Part, { type: "file" }>[] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((f) => f.mediaType.startsWith("image/")
        ? <a key={f.fileId} href={`/api/files/${f.fileId}`} target="_blank"><img src={`/api/files/${f.fileId}`} alt={f.name} className="max-h-60 rounded-xl border border-[var(--color-line)]" /></a>
        : <a key={f.fileId} href={`/api/files/${f.fileId}?download`} className="chip"><IconClip className="w-3.5 h-3.5" />{f.name}</a>)}
    </div>
  );
}

function MsgActions({ text, credits }: { text: string; credits?: number }) {
  const { me } = useMe();
  const [copied, setCopied] = useState(false);
  const [audio, setAudio] = useState<"idle" | "loading" | "playing">("idle");
  const ref = useRef<HTMLAudioElement | null>(null);
  const serverTts = !!me?.ttsModels.filter((x) => !x.locked).length;
  const browserTts = typeof window !== "undefined" && "speechSynthesis" in window;

  /** القراءة على جهاز المستخدم نفسه — بلا خادم ولا شركة. */
  function speakBrowser() {
    const synth = window.speechSynthesis;
    if (audio !== "idle") { synth.cancel(); setAudio("idle"); return; }
    const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ar"));
    const male = voices.find((v) => /male|maged|tarik|hamed|naayf|majed|shakir|omar/i.test(v.name));
    const parts = clean.match(/[^.!؟?\n]{1,220}[.!؟?\n]?/g) || [clean];
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = "ar"; u.rate = 0.95;
      const v = male || voices[0];
      if (v) u.voice = v;
      if (i === parts.length - 1) u.onend = () => setAudio("idle");
      synth.speak(u);
    });
    setAudio("playing");
  }

  async function speak() {
    if (!serverTts) return speakBrowser();
    if (audio === "playing") { ref.current?.pause(); setAudio("idle"); return; }
    setAudio("loading");
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      ref.current = a;
      a.onended = () => setAudio("idle");
      await a.play();
      setAudio("playing");
    } catch (e) {
      alert((e as Error).message);
      setAudio("idle");
    }
  }
  return (
    <div className="flex items-center gap-1 mt-2 text-[var(--color-muted)]">
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-1.5 rounded hover:bg-[var(--color-brand-soft)]" title="نسخ">
        {copied ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
      </button>
      {(serverTts || browserTts) && (
        <button onClick={speak} className="p-1.5 rounded hover:bg-[var(--color-brand-soft)]" title="استماع">
          <IconSpeaker className={`w-4 h-4 ${audio !== "idle" ? "text-[var(--color-brand)]" : ""} ${audio === "loading" ? "animate-pulse" : ""}`} />
        </button>
      )}
      {credits !== undefined && credits > 0 && <span className="text-[11px] ms-1">{num(credits, 2)} نقطة</span>}
    </div>
  );
}

function MicButton({ onText }: { onText: (t: string) => void }) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const rec = useRef<MediaRecorder | null>(null);
  async function toggle() {
    if (state === "rec") { rec.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("busy");
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, `voice.${(mr.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`);
        try {
          const r = await api<{ text: string }>("/api/stt", { method: "POST", body: fd });
          onText(r.text);
        } catch (e) { alert((e as Error).message); }
        setState("idle");
      };
      rec.current = mr;
      mr.start();
      setState("rec");
    } catch {
      alert("لم يُسمح باستعمال الميكروفون");
    }
  }
  return (
    <button onClick={toggle} className={`p-2 rounded-lg ${state === "rec" ? "bg-[var(--color-danger)] text-white animate-pulse" : "hover:bg-[var(--color-brand-soft)]"}`}
      title={state === "rec" ? "إيقاف التسجيل" : "تحدّث"} disabled={state === "busy"}>
      <IconMic className={state === "busy" ? "w-5 h-5 animate-spin" : "w-5 h-5"} />
    </button>
  );
}

