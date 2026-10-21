"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHead, useMe } from "./AppShell";
import { api, num, dateAr } from "@/lib/client";

const TABS = [
  ["overview", "نظرة عامة"], ["local", "النماذج المحلية"], ["keys", "الخوادم والدفع"], ["models", "النماذج"], ["plans", "الباقات"],
  ["users", "المستخدمون"], ["licenses", "التراخيص"], ["library", "المكتبة"], ["settings", "الهوية والتعليمات"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function AdminApp() {
  const { me } = useMe();
  const desktop = !!me?.desktop;
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => { if (desktop && !["local", "library", "settings"].includes(tab)) setTab("local"); }, [desktop, tab]);
  const tabs = desktop ? TABS.filter(([k]) => ["local", "library", "settings"].includes(k)) : TABS;
  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <PageHead title={desktop ? "النماذج والإعدادات" : "لوحة الإدارة"} />
        <div className="flex flex-wrap gap-1.5 mb-6">
          {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="chip !text-sm !px-3 !py-1.5" data-on={tab === k}>{l}</button>)}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "local" && <LocalModels />}
        {tab === "keys" && <Keys />}
        {tab === "models" && <Models />}
        {tab === "plans" && <Plans />}
        {tab === "users" && <Users />}
        {tab === "licenses" && <Licenses />}
        {tab === "library" && <Library />}
        {tab === "settings" && <Settings />}
      </div>
    </div>
  );
}

function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<T>(url).then(setData).catch((e) => setErr(e.message)), [url]);
  useEffect(() => { load(); }, [load]);
  return { data, err, load, setErr };
}

function Notice({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <p className="text-sm text-[var(--color-danger)] my-2">{err}</p>;
  if (ok) return <p className="text-sm text-[var(--color-brand)] my-2">{ok}</p>;
  return null;
}

/* ---------- نظرة عامة ---------- */
type Stats = {
  users: number; newUsers30: number; mrr: number; conversations: number; messages: number;
  byPlan: { plan_id: string; name: string; n: number; price_eur: number }[];
  usage: { kind: string; model: string; n: number; inTok: number; outTok: number; credits: number }[];
  daily: { day: string; n: number; credits: number }[];
};
function Overview() {
  const { data: s, err } = useLoad<Stats>("/api/admin/stats");
  if (err) return <Notice err={err} />;
  if (!s) return <p>…</p>;
  const maxDay = Math.max(1, ...s.daily.map((d) => d.credits));
  const cards = [["المستخدمون", num(s.users)], ["جدد خلال ٣٠ يومًا", num(s.newUsers30)], ["الدخل الشهري المتكرر", `€${num(s.mrr, 2)}`], ["المحادثات", num(s.conversations)]];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([l, v]) => <div key={l} className="card p-4"><div className="label">{l}</div><div className="text-2xl font-bold">{v}</div></div>)}
      </div>
      <div className="card p-5">
        <h3 className="font-bold mb-3">الاستهلاك اليومي (نقاط) — آخر ٣٠ يومًا</h3>
        <div className="flex items-end gap-1 h-32" dir="ltr">
          {s.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.credits.toFixed(1)}`} className="flex-1 bg-[var(--color-brand)] rounded-t" style={{ height: `${(d.credits / maxDay) * 100}%`, minHeight: 2 }} />)}
          {!s.daily.length && <p className="text-sm text-[var(--color-muted)]">لا بيانات بعد</p>}
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold mb-3">المستخدمون حسب الباقة</h3>
          {s.byPlan.map((p) => <div key={p.plan_id} className="flex justify-between py-1 border-b border-[var(--color-line)] last:border-0"><span>{p.name || p.plan_id}</span><b>{num(p.n)}</b></div>)}
        </div>
        <div className="card p-5 overflow-x-auto">
          <h3 className="font-bold mb-3">الاستهلاك حسب النموذج (٣٠ يومًا)</h3>
          <table className="w-full text-sm"><tbody>
            {s.usage.map((u) => <tr key={u.kind + u.model} className="border-b border-[var(--color-line)] last:border-0">
              <td className="py-1">{u.model}</td><td>{num(u.n)} طلب</td><td>{num((u.inTok + u.outTok) / 1000)} ألف رمز</td><td>{num(u.credits, 1)} نقطة</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

/* ---------- النماذج المحلية ---------- */
type LocalStatus = {
  ollama: { ok: boolean; version?: string; error?: string; models: { name: string; size: number; params?: string; quant?: string }[]; loaded: string[] };
  urls: { ollama: string; searx: string; whisper: string };
};
const RECOMMENDED = [
  { name: "qwen3.5:2b", label: "بصيرة الخفيف", ram: "٤ غ.ب", note: "للأجهزة الضعيفة؛ دقته محدودة" },
  { name: "qwen3.5:4b", label: "بصيرة السريع", ram: "٨ غ.ب", note: "سريع ومناسب لأكثر الحواسيب" },
  { name: "qwen3.5:9b", label: "بصيرة المتوازن", ram: "١٦ غ.ب", note: "أدق، والأنسب لأكثر الأجهزة" },
  { name: "gpt-oss:20b", label: "بصيرة المتقدم", ram: "٢٤ غ.ب", note: "استدلال أقوى، سريع نسبيًّا لأنه يفعّل جزءًا صغيرًا منه في كل خطوة" },
  { name: "qwen3.5:35b", label: "بصيرة الأقوى", ram: "٣٢ غ.ب فأكثر", note: "الأقوى مما يعمل على المعالج" },
];
function LocalModels() {
  const { data, load } = useLoad<LocalStatus>("/api/admin/local");
  const desktop = !!useMe().me?.desktop;
  const [pulling, setPulling] = useState<{ name: string; status: string; pct: number } | null>(null);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const [search, setSearch] = useState<string>("");
  const { reload } = useMe();
  async function pull(name: string) {
    setErr(""); setPulling({ name, status: "بدء التنزيل", pct: 0 });
    try {
      const r = await fetch("/api/admin/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `خطأ ${r.status}`);
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) {
          const ln = buf.slice(0, i); buf = buf.slice(i + 1); if (!ln.trim()) continue;
          const ev = JSON.parse(ln);
          if (ev.error) throw new Error(ev.error);
          setPulling({ name, status: ev.status, pct: ev.total ? Math.round((ev.completed || 0) / ev.total * 100) : 0 });
        }
      }
      setPulling(null); load(); reload();
    } catch (e) { setErr((e as Error).message); setPulling(null); }
  }
  async function del(name: string) {
    if (!confirm(`حذف ${name} من الخادم؟`)) return;
    await api(`/api/admin/local?name=${encodeURIComponent(name)}`, { method: "DELETE" }); load(); reload();
  }
  async function testSearch() {
    setSearch("…");
    const r = await api<{ ok: boolean; results?: { title: string }[]; error?: string }>("/api/admin/local?test=search");
    setSearch(r.ok ? `يعمل: ${r.results?.length} نتائج (${r.results?.[0]?.title ?? ""})` : `لا يعمل: ${r.error}`);
  }
  if (!data) return <p>…</p>;
  const o = data.ollama;
  const installed = new Set(o.models.map((m) => m.name));
  return (
    <div className="space-y-4">
      <Notice err={err} />
      <div className="card p-5 text-sm space-y-1">
        {desktop ? <div>محرّك النماذج: <span className="text-[var(--color-brand)] font-semibold">مدمج في البرنامج</span> — يستعمل بطاقة الرسوم إن وُجدت وإلا المعالج</div> : <>
        <div>خادم النماذج: {o.ok ? <span className="text-[var(--color-brand)] font-semibold">يعمل (Ollama {o.version})</span> : <span className="text-[var(--color-danger)]">لا يستجيب — {o.error}</span>} <span dir="ltr" className="text-[var(--color-muted)]">{data.urls.ollama}</span></div>
        <div>محرك البحث: <button onClick={testSearch} className="underline">اختبار</button> {search}</div>
        </>}
        {!desktop && <div>تفريغ الصوت: {data.urls.whisper ? <><span dir="ltr" className="text-[var(--color-muted)]">{data.urls.whisper}</span> <button onClick={async () => { setSearch("يُنزَّل نموذج التفريغ…"); try { await api("/api/admin/local", { method: "POST", json: { action: "whisper" } }); setSearch("نموذج التفريغ جاهز"); } catch (e) { setSearch((e as Error).message); } }} className="underline">تنزيل نموذج التفريغ</button></> : "غير مضبوط"}</div>}
        <p className="text-[var(--color-muted)] leading-relaxed pt-1">{desktop
          ? "النماذج تعمل على حاسوبك وحده، بلا اتصال بأي جهة. تُنزَّل مرة واحدة ثم تعمل دون إنترنت. اختر بحسب ذاكرة حاسوبك."
          : "كل النماذج هنا تعمل على معالج الخادم وذاكرته، بلا اتصال بأي شركة. تُنزَّل مرة واحدة ثم تعمل دون إنترنت. اختر بحسب ذاكرة جهازك (من DSM: مركز المعلومات ← عام)."}</p>
      </div>
      {pulling && (
        <div className="card p-4 text-sm">
          <div>يُنزَّل {pulling.name}: {pulling.status}</div>
          <div className="mt-2 h-2 rounded-full bg-[var(--color-line)] overflow-hidden"><div className="h-full bg-[var(--color-brand)]" style={{ width: `${pulling.pct}%` }} /></div>
          <div className="text-xs text-[var(--color-muted)] mt-1">{num(pulling.pct)}٪ — لا تغلق الصفحة</div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {RECOMMENDED.map((r) => (
          <div key={r.name} className="card p-4 text-sm flex flex-col gap-1">
            <div className="flex justify-between"><b>{r.label}</b><span dir="ltr" className="text-[var(--color-muted)]">{r.name}</span></div>
            <div className="text-[var(--color-muted)]">{r.note} · ذاكرة الجهاز: {r.ram}</div>
            <div className="pt-2">{installed.has(r.name)
              ? <span className="chip" data-on="true">منزَّل ومفعّل</span>
              : <button disabled={!!pulling || !o.ok} onClick={() => pull(r.name)} className="btn btn-primary text-sm">{desktop ? "تنزيل" : "تنزيل إلى الخادم"}</button>}</div>
          </div>
        ))}
      </div>
      <div className="card p-4 flex flex-wrap gap-2 items-end">
        <F l="نموذج آخر بالاسم (من ollama.com/library)"><input dir="ltr" className="input text-sm" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="gemma4:12b" /></F>
        <button disabled={!custom || !!pulling || !o.ok} onClick={() => pull(custom)} className="btn btn-ghost text-sm">تنزيل</button>
        <p className="text-xs text-[var(--color-muted)] w-full">{desktop ? "يظهر النموذج في قائمة المحادثة فور تنزيله." : "بعد تنزيل نموذج غير مدرج أعلاه، أضفه من تبويب «النماذج» بالمزوّد local واسمه نفسه."}</p>
      </div>
      <div className="card p-4">
        <h3 className="font-bold mb-2">{desktop ? "النماذج المنزَّلة" : "المنزَّل على الخادم"}</h3>
        {o.models.length ? (
          <table className="w-full text-sm"><tbody>{o.models.map((m) => (
            <tr key={m.name} className="border-t border-[var(--color-line)]">
              <td className="py-1.5 pe-4 font-semibold" dir="ltr">{m.name}</td><td className="pe-4 text-[var(--color-muted)]" dir="ltr">{m.params}</td><td className="pe-4">{num(m.size / 1e9, 1)} غ.ب</td>
              <td>{o.loaded.includes(m.name) ? <span className="chip" data-on="true">في الذاكرة</span> : null}</td>
              <td><button onClick={() => del(m.name)} className="text-[var(--color-danger)]">حذف</button></td>
            </tr>))}</tbody></table>
        ) : <p className="text-sm text-[var(--color-muted)]">لا نماذج بعد. نزّل واحدًا مما سبق.</p>}
      </div>
    </div>
  );
}

/* ---------- المفاتيح ---------- */
type SettingsData = {
  branding: { appName: string; tagline: string; indicDigits: boolean; allowRegistration: boolean; supportEmail: string };
  providers: { id: string; label: string; env: string; url: string; configured: boolean; masked: string; fromEnv: boolean }[];
  stripe: { secret: string; webhook: string; webhookUrl: string };
  prompts: { general: string; scholar: string };
  publicUrl: string;
  independent: boolean;
  local: { ollama: string; searx: string; whisper: string };
};
function Keys() {
  const { data, load } = useLoad<SettingsData>("/api/admin/settings");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const { reload } = useMe();
  async function save(body: object) {
    setOk(""); setErr("");
    try { await api("/api/admin/settings", { method: "POST", json: body }); setOk("حُفظ"); setVals({}); load(); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (!data) return <p>…</p>;
  const loc = { ...data.local, ...(vals as Record<string, string>) };
  return (
    <div className="space-y-6">
      <Notice ok={ok} err={err} />
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">الاستقلال التام</h3>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={data.independent} onChange={(e) => save({ independent: e.target.checked })} />
          <span>تشغيل المنصة على نماذج الخادم وحده، بلا أي اتصال بشركات الذكاء الاصطناعي ولو وُجدت مفاتيحها. <b>(مستحسن، وهو الافتراضي)</b></span>
        </label>
        <div className="grid sm:grid-cols-3 gap-3">
          <F l="خادم النماذج (Ollama)"><input dir="ltr" className="input text-sm" value={loc.ollama} onChange={(e) => setVals({ ...vals, ollama: e.target.value })} /></F>
          <F l="محرك البحث (SearXNG)"><input dir="ltr" className="input text-sm" value={loc.searx} onChange={(e) => setVals({ ...vals, searx: e.target.value })} /></F>
          <F l="تفريغ الصوت (Whisper) — اختياري"><input dir="ltr" className="input text-sm" value={loc.whisper} placeholder="http://whisper:8000" onChange={(e) => setVals({ ...vals, whisper: e.target.value })} /></F>
        </div>
        <button onClick={() => save({ local: { ollama: loc.ollama, searx: loc.searx, whisper: loc.whisper } })} className="btn btn-primary text-sm">حفظ العناوين</button>
      </div>
      <div className={`card p-5 space-y-4 ${data.independent ? "opacity-50 pointer-events-none" : ""}`}>
        <h3 className="font-bold">مفاتيح مزوّدين خارجيين {data.independent && "— معطّلة في وضع الاستقلال"}</h3>
        <p className="text-sm text-[var(--color-muted)]">تُحفظ مشفّرة في قاعدة البيانات. يكفي مزوّد واحد للبدء، وكل مزوّد تضيفه يفتح نماذجه للمستخدمين.</p>
        {data.providers.map((p) => (
          <div key={p.id} className="grid sm:grid-cols-[14rem_1fr_auto] gap-2 items-center">
            <div><div className="font-semibold text-sm">{p.label}</div>
              <div className="text-xs text-[var(--color-muted)]">{p.configured ? `مضبوط ${p.masked}${p.fromEnv ? " (من ملف البيئة)" : ""}` : "غير مضبوط"} · <a href={p.url} target="_blank" className="underline">احصل على مفتاح</a></div></div>
            <input dir="ltr" type="password" placeholder={p.configured ? "اتركه فارغًا للإبقاء على الحالي" : "الصق المفتاح هنا"} value={vals[p.id] || ""}
              onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} className="input text-sm" />
            <div className="flex gap-1">
              <button disabled={!vals[p.id]} onClick={() => save({ keys: { [p.id]: vals[p.id] } })} className="btn btn-primary text-sm">حفظ</button>
              {p.configured && !p.fromEnv && <button onClick={() => confirm("حذف المفتاح؟") && save({ keys: { [p.id]: "" } })} className="btn btn-danger text-sm">حذف</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">الدفع عبر Stripe</h3>
        <ol className="text-sm text-[var(--color-muted)] list-decimal ps-5 space-y-1 leading-relaxed">
          <li>أنشئ حسابًا في stripe.com وفعّل وسائل الدفع (iDEAL، البطاقات، SEPA…).</li>
          <li>انسخ المفتاح السري (sk_live_… أو sk_test_… للتجربة) والصقه أدناه.</li>
          <li>في Stripe ← Developers ← Webhooks أضف الرابط التالي واختر الأحداث: checkout.session.completed و customer.subscription.created/updated/deleted و invoice.paid، ثم الصق «Signing secret».</li>
          <li>من تبويب «الباقات» اضغط «إنشاء السعر في Stripe» لكل باقة مدفوعة.</li>
        </ol>
        <div className="text-sm">رابط الـWebhook: <code dir="ltr" className="bg-[var(--color-brand-soft)] px-2 py-0.5 rounded select-all">{data.stripe.webhookUrl}</code></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">المفتاح السري {data.stripe.secret && `(${data.stripe.secret})`}</label>
            <input dir="ltr" type="password" value={vals.ss || ""} onChange={(e) => setVals({ ...vals, ss: e.target.value })} className="input text-sm" placeholder="sk_…" /></div>
          <div><label className="label">سرّ الـWebhook {data.stripe.webhook && `(${data.stripe.webhook})`}</label>
            <input dir="ltr" type="password" value={vals.wh || ""} onChange={(e) => setVals({ ...vals, wh: e.target.value })} className="input text-sm" placeholder="whsec_…" /></div>
        </div>
        <button onClick={() => save({ stripe: { ...(vals.ss ? { secret: vals.ss } : {}), ...(vals.wh ? { webhook: vals.wh } : {}) } })} disabled={!vals.ss && !vals.wh} className="btn btn-primary text-sm">حفظ إعدادات Stripe</button>
        {!data.publicUrl.startsWith("https://") && <p className="text-xs text-[var(--color-gold)]">تنبيه: PUBLIC_URL الحالي ({data.publicUrl}) ليس https؛ اضبطه على نطاقك العام قبل تفعيل الدفع.</p>}
      </div>
    </div>
  );
}

/* ---------- النماذج ---------- */
type ModelRow = {
  id: string; provider: string; model_id: string; label: string; kind: string; description: string; tier: number;
  input_cost: number; output_cost: number; unit_cost: number; caps: Record<string, boolean>; enabled: boolean; sort: number;
};
const EMPTY: ModelRow = { id: "", provider: "local", model_id: "", label: "", kind: "chat", description: "", tier: 0, input_cost: 0, output_cost: 0, unit_cost: 0, caps: { vision: true, pdf: true, web: true, code: true, tools: true }, enabled: true, sort: 100 };
const KINDS: Record<string, string> = { chat: "محادثة", image: "صور", tts: "قراءة صوتية", stt: "تفريغ صوت" };

function Models() {
  const { data, load } = useLoad<{ models: ModelRow[] }>("/api/admin/models");
  const [edit, setEdit] = useState<ModelRow | null>(null);
  const [avail, setAvail] = useState<string[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const { reload } = useMe();
  async function save(m: ModelRow) {
    setErr(""); setOk("");
    try { await api("/api/admin/models", { method: "POST", json: m }); setEdit(null); setOk("حُفظ النموذج"); load(); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function del(id: string) {
    if (!confirm("حذف النموذج؟")) return;
    await api(`/api/admin/models?id=${id}`, { method: "DELETE" }); load();
  }
  async function fetchAvail(p: string) {
    setAvail([]); setErr("");
    try { setAvail((await api<{ models: string[] }>(`/api/admin/provider-models?provider=${p}`)).models); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <Notice ok={ok} err={err} />
      <div className="card p-4 text-sm text-[var(--color-muted)] leading-relaxed">
        الكلفة بالنقاط (النقطة ≈ ٠٫٠٠١ دولار من كلفة المزوّد): للمحادثة لكل مليون رمز دخلًا وخرجًا، وللصور لكل صورة، وللقراءة الصوتية لكل ألف حرف، وللتفريغ لكل دقيقة.
        <b className="text-[var(--color-gold)]"> القيم الابتدائية تقديرية؛ طابِقها بصفحات أسعار المزوّدين قبل الإطلاق، وأضف هامش ربحك.</b>
        «الباقة الدنيا» رقم مستوى الباقة: ٠ مجانية، ١ أساسية، ٢ احترافية، ٣ قصوى.
      </div>
      <button onClick={() => { setEdit({ ...EMPTY }); setAvail([]); }} className="btn btn-primary text-sm">إضافة نموذج</button>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--color-muted)]"><tr>{["النموذج", "المزوّد / المعرّف", "النوع", "الباقة الدنيا", "الكلفة", "الحالة", ""].map((h) => <th key={h} className="text-start p-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {data?.models.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-line)]">
                <td className="p-2.5 font-semibold">{m.label}</td>
                <td className="p-2.5" dir="ltr"><span className="text-[var(--color-muted)]">{m.provider}/</span>{m.model_id}</td>
                <td className="p-2.5">{KINDS[m.kind]}</td>
                <td className="p-2.5">{num(m.tier)}</td>
                <td className="p-2.5">{m.kind === "chat" ? `${num(m.input_cost)} / ${num(m.output_cost)}` : num(m.unit_cost)}</td>
                <td className="p-2.5">{m.enabled ? <span className="chip" data-on="true">مفعّل</span> : <span className="chip">معطّل</span>}</td>
                <td className="p-2.5 whitespace-nowrap"><button onClick={() => { setEdit(m); setAvail([]); }} className="text-[var(--color-brand)]">تعديل</button> · <button onClick={() => del(m.id)} className="text-[var(--color-danger)]">حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="card p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">{edit.label || "نموذج جديد"}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <F l="المعرّف الداخلي (لاتيني)"><input dir="ltr" className="input" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} /></F>
              <F l="الاسم الظاهر"><input className="input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></F>
              <F l="المزوّد">
                <select className="input" value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value })}>
                  {["local", "anthropic", "openai", "google", "openrouter"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </F>
              <F l="النوع">
                <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </F>
              <F l="معرّف النموذج عند المزوّد">
                <div className="flex gap-1">
                  <input dir="ltr" className="input" list="avail" value={edit.model_id} onChange={(e) => setEdit({ ...edit, model_id: e.target.value })} />
                  <button type="button" onClick={() => fetchAvail(edit.provider)} className="btn btn-ghost text-xs">جلب القائمة</button>
                </div>
                <datalist id="avail">{avail.map((a) => <option key={a} value={a} />)}</datalist>
                {!!avail.length && <span className="text-xs text-[var(--color-muted)]">{num(avail.length)} نموذجًا متاحًا لحسابك — ابدأ الكتابة للاختيار</span>}
              </F>
              <F l="الباقة الدنيا (٠–٣)"><input type="number" min={0} max={9} className="input" value={edit.tier} onChange={(e) => setEdit({ ...edit, tier: +e.target.value })} /></F>
              {edit.kind === "chat" ? (
                <>
                  <F l="نقاط لكل مليون رمز دخل"><input type="number" min={0} className="input" value={edit.input_cost} onChange={(e) => setEdit({ ...edit, input_cost: +e.target.value })} /></F>
                  <F l="نقاط لكل مليون رمز خرج"><input type="number" min={0} className="input" value={edit.output_cost} onChange={(e) => setEdit({ ...edit, output_cost: +e.target.value })} /></F>
                </>
              ) : (
                <F l="نقاط لكل وحدة"><input type="number" min={0} step="0.1" className="input" value={edit.unit_cost} onChange={(e) => setEdit({ ...edit, unit_cost: +e.target.value })} /></F>
              )}
              <F l="الترتيب"><input type="number" className="input" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: +e.target.value })} /></F>
            </div>
            <F l="الوصف"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></F>
            {edit.kind === "chat" && (
              <div className="flex flex-wrap gap-2 text-sm">
                {[["vision", "يقرأ الصور"], ["pdf", "يقرأ PDF"], ["web", "البحث في الويب"], ["code", "تشغيل الشيفرة"], ["tools", "أدوات المكتبة"], ["think", "التفكير المطوّل (أبطأ)"]].map(([k, l]) => (
                  <label key={k} className="chip cursor-pointer" data-on={!!edit.caps[k]}>
                    <input type="checkbox" className="hidden" checked={!!edit.caps[k]} onChange={(e) => setEdit({ ...edit, caps: { ...edit.caps, [k]: e.target.checked } })} />{l}
                  </label>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />مفعّل للمستخدمين</label>
            <div className="flex gap-2 justify-end"><button onClick={() => setEdit(null)} className="btn btn-ghost">إلغاء</button><button onClick={() => save(edit)} className="btn btn-primary">حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <div><label className="label">{l}</label>{children}</div>;
}

/* ---------- الباقات ---------- */
type PlanRow = { id: string; name: string; description: string; price_eur: number; monthly_credits: number; tier: number; stripe_price_id: string | null; features: string[]; sort: number; active: boolean };
function Plans() {
  const { data, load } = useLoad<{ plans: PlanRow[] }>("/api/admin/plans");
  const [edit, setEdit] = useState<PlanRow | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  async function save(p: PlanRow) {
    setErr(""); setOk("");
    try { await api("/api/admin/plans", { method: "POST", json: p }); setEdit(null); setOk("حُفظت الباقة"); load(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function sync(id: string) {
    setErr(""); setOk("");
    try { const r = await api<{ price: string }>("/api/admin/plans", { method: "POST", json: { action: "stripe-sync", id } }); setOk(`أُنشئ السعر ${r.price}`); load(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <Notice ok={ok} err={err} />
      <button onClick={() => setEdit({ id: "", name: "", description: "", price_eur: 0, monthly_credits: 0, tier: 1, stripe_price_id: null, features: [], sort: 10, active: true })} className="btn btn-primary text-sm">إضافة باقة</button>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data?.plans.map((p) => (
          <div key={p.id} className="card p-4 space-y-1 text-sm">
            <div className="flex justify-between"><b className="text-base">{p.name}</b>{!p.active && <span className="chip">معطّلة</span>}</div>
            <div>€{num(p.price_eur, 2)} شهريًّا · {num(p.monthly_credits)} نقطة · مستوى {num(p.tier)}</div>
            <div className="text-xs" dir="ltr">{p.stripe_price_id || <span className="text-[var(--color-gold)]">— غير مربوطة بـStripe —</span>}</div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEdit(p)} className="text-[var(--color-brand)]">تعديل</button>
              {p.price_eur > 0 && !p.stripe_price_id && <button onClick={() => sync(p.id)} className="text-[var(--color-brand)]">إنشاء السعر في Stripe</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--color-muted)]">عند تغيير سعر باقة مربوطة: أنشئ سعرًا جديدًا (امسح معرّف السعر ثم اضغط «إنشاء السعر»)، فالمشتركون الحاليون يبقون على سعرهم القديم في Stripe.</p>
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="card p-5 w-full max-w-xl space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="grid sm:grid-cols-2 gap-3">
              <F l="المعرّف (لاتيني)"><input dir="ltr" className="input" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} /></F>
              <F l="الاسم"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></F>
              <F l="السعر الشهري (يورو)"><input type="number" min={0} step="0.01" className="input" value={edit.price_eur} onChange={(e) => setEdit({ ...edit, price_eur: +e.target.value })} /></F>
              <F l="النقاط الشهرية"><input type="number" min={0} className="input" value={edit.monthly_credits} onChange={(e) => setEdit({ ...edit, monthly_credits: +e.target.value })} /></F>
              <F l="المستوى (يحدد النماذج المتاحة)"><input type="number" min={0} max={9} className="input" value={edit.tier} onChange={(e) => setEdit({ ...edit, tier: +e.target.value })} /></F>
              <F l="الترتيب"><input type="number" className="input" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: +e.target.value })} /></F>
            </div>
            <F l="الوصف"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></F>
            <F l="معرّف سعر Stripe (price_…)"><input dir="ltr" className="input" value={edit.stripe_price_id || ""} onChange={(e) => setEdit({ ...edit, stripe_price_id: e.target.value || null })} /></F>
            <F l="المزايا (سطر لكل ميزة)"><textarea rows={4} className="input" value={edit.features.join("\n")} onChange={(e) => setEdit({ ...edit, features: e.target.value.split("\n").filter(Boolean) })} /></F>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />معروضة للمستخدمين</label>
            <div className="flex gap-2 justify-end"><button onClick={() => setEdit(null)} className="btn btn-ghost">إلغاء</button><button onClick={() => save(edit)} className="btn btn-primary">حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- المستخدمون ---------- */
type UserRow = { id: string; email: string; name: string; role: string; plan_id: string; credits: number; subscription_status: string | null; disabled: number; created_at: number; used30: number };
function Users() {
  const [q, setQ] = useState("");
  const { data, load } = useLoad<{ users: UserRow[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  const plans = useLoad<{ plans: PlanRow[] }>("/api/admin/plans").data?.plans || [];
  const [err, setErr] = useState("");
  async function patch(body: object) {
    setErr("");
    try { await api("/api/admin/users", { method: "PATCH", json: body }); load(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالبريد أو الاسم" className="input max-w-sm" />
      <Notice err={err} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--color-muted)]"><tr>{["المستخدم", "الباقة", "الرصيد", "استهلاك ٣٠ يومًا", "التسجيل", "إجراءات"].map((h) => <th key={h} className="text-start p-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className={`border-t border-[var(--color-line)] ${u.disabled ? "opacity-50" : ""}`}>
                <td className="p-2.5"><div className="font-semibold">{u.name} {u.role === "admin" && <span className="chip !text-[10px]">مشرف</span>}</div><div className="text-xs text-[var(--color-muted)]" dir="ltr">{u.email}</div></td>
                <td className="p-2.5">
                  <select value={u.plan_id} onChange={(e) => patch({ id: u.id, plan_id: e.target.value })} className="input !py-1 !w-auto text-xs">
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {u.subscription_status && <div className="text-[10px] text-[var(--color-muted)]">Stripe: {u.subscription_status}</div>}
                </td>
                <td className="p-2.5"><button onClick={() => { const v = prompt("الرصيد الجديد:", String(Math.round(u.credits))); if (v !== null && !isNaN(+v)) patch({ id: u.id, credits: +v }); }} className="underline decoration-dotted">{num(u.credits)}</button></td>
                <td className="p-2.5">{num(u.used30, 1)}</td>
                <td className="p-2.5 text-xs">{dateAr(u.created_at)}</td>
                <td className="p-2.5 text-xs whitespace-nowrap space-x-2 space-x-reverse">
                  <button onClick={() => patch({ id: u.id, role: u.role === "admin" ? "user" : "admin" })} className="text-[var(--color-brand)]">{u.role === "admin" ? "سحب الإشراف" : "جعله مشرفًا"}</button>
                  <button onClick={() => patch({ id: u.id, disabled: !u.disabled })} className="text-[var(--color-danger)]">{u.disabled ? "تفعيل" : "إيقاف"}</button>
                  <button onClick={() => { const p = prompt("كلمة مرور جديدة (٨ أحرف فأكثر):"); if (p && p.length >= 8) patch({ id: u.id, password: p }); }} className="text-[var(--color-muted)]">كلمة مرور</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- التراخيص ---------- */
type Dl = { win: string; mac: string; macintel: string; linux: string };
const DL_LABEL: Record<keyof Dl, string> = { win: "ويندوز", mac: "ماك (M1 فما بعدها)", macintel: "ماك (Intel)", linux: "لينكس" };
type LicRow = { key: string; email: string | null; devices: string; max_devices: number; expires_at: number | null; note: string; revoked: number; created_at: number };
function Licenses() {
  const { data, load } = useLoad<{ licenses: LicRow[]; enabled: boolean; downloads: Dl; minTier: number }>("/api/admin/licenses");
  const [form, setForm] = useState({ days: 365, maxDevices: 2, note: "" });
  const [dl, setDl] = useState<Dl | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (data) setDl(data.downloads); }, [data]);
  async function post(body: object, msg: string) {
    setOk(""); setErr("");
    try { const r = await api<{ key?: string }>("/api/admin/licenses", { method: "POST", json: body }); setOk(r.key ? `المفتاح الجديد: ${r.key}` : msg); load(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (!data || !dl) return <p>…</p>;
  return (
    <div className="space-y-4">
      <Notice ok={ok} err={err} />
      {!data.enabled && <p className="card p-4 text-sm text-[var(--color-gold)]">إصدار التراخيص معطّل: ضع LICENSE_PRIVATE_KEY في ملف ‎.env‎ (من ملف الأسرار المسلَّم مع البرنامج) ثم أعد تشغيل الحاوية.</p>}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">روابط تنزيل البرنامج (تظهر للمشتركين في صفحة الحساب)</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {(["win", "mac", "macintel", "linux"] as const).map((k) => (
            <F key={k} l={DL_LABEL[k]}><input dir="ltr" className="input text-sm" value={dl[k] || ""} onChange={(e) => setDl({ ...dl, [k]: e.target.value })} /></F>
          ))}
        </div>
        <F l="أقل مستوى باقة يشمل البرنامج"><input type="number" min={0} max={9} className="input !w-24" defaultValue={data.minTier} onBlur={(e) => post({ action: "settings", minTier: +e.target.value }, "حُفظ")} /></F>
        <button onClick={() => post({ action: "settings", downloads: dl }, "حُفظت الروابط")} className="btn btn-primary text-sm">حفظ</button>
      </div>
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">مفتاح يدوي (هدية، طالب علم، مؤسسة)</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <F l="المدة بالأيام"><input type="number" className="input !w-28" value={form.days} onChange={(e) => setForm({ ...form, days: +e.target.value })} /></F>
          <F l="عدد الأجهزة"><input type="number" className="input !w-24" value={form.maxDevices} onChange={(e) => setForm({ ...form, maxDevices: +e.target.value })} /></F>
          <F l="ملاحظة (اسم المستفيد)"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></F>
          <button onClick={() => post({ action: "create", ...form }, "")} className="btn btn-primary text-sm">إنشاء مفتاح</button>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--color-muted)]"><tr>{["المفتاح", "الصاحب", "الأجهزة", "الانتهاء", ""].map((h) => <th key={h} className="text-start p-2.5">{h}</th>)}</tr></thead>
          <tbody>{data.licenses.map((l) => (
            <tr key={l.key} className={`border-t border-[var(--color-line)] ${l.revoked ? "opacity-50" : ""}`}>
              <td className="p-2.5 font-mono text-xs" dir="ltr">{l.key}</td>
              <td className="p-2.5">{l.email || l.note || "—"}</td>
              <td className="p-2.5">{num(JSON.parse(l.devices).length)} / {num(l.max_devices)}</td>
              <td className="p-2.5 text-xs">{l.expires_at ? dateAr(l.expires_at) : "مع الاشتراك"}</td>
              <td className="p-2.5"><button onClick={() => post({ action: l.revoked ? "unrevoke" : "revoke", key: l.key }, "تمّ")} className={l.revoked ? "text-[var(--color-brand)]" : "text-[var(--color-danger)]"}>{l.revoked ? "إعادة تفعيل" : "إيقاف"}</button></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- المكتبة ---------- */
type LibData = {
  info: { ready: boolean; meta?: Record<string, string>; books?: { id: number; name: string; author: string; category: string; pages: number }[]; quran?: boolean };
  status: { state: string; step: string; done: number; total: number; pages?: number; failed?: number[]; updated_at: string } | null;
  collection: { books: number[]; authors: number[] } | null;
  source: string;
};
function Library() {
  const { data, load } = useLoad<LibData>("/api/admin/library");
  const [books, setBooks] = useState(""); const [authors, setAuthors] = useState("");
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  useEffect(() => {
    if (data?.collection) { setBooks(data.collection.books.join(", ")); setAuthors(data.collection.authors.join(", ")); }
  }, [data?.collection]);
  useEffect(() => {
    if (data?.status?.state !== "running") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data?.status?.state, load]);
  const parse = (s: string) => s.split(/[\s,،]+/).map(Number).filter((n) => n > 0);
  async function act(action?: string) {
    setOk(""); setErr("");
    try { await api("/api/admin/library", { method: "POST", json: { collection: { books: parse(books), authors: parse(authors) }, action } }); setOk(action ? "بدأ البناء" : "حُفظت القائمة"); load(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (!data) return <p>…</p>;
  const s = data.status;
  return (
    <div className="space-y-4">
      <Notice ok={ok} err={err} />
      <div className="card p-5">
        <h3 className="font-bold mb-2">الحالة</h3>
        {data.info.ready
          ? <p className="text-sm">جاهزة: {num(Number(data.info.meta?.books))} كتابًا، {num(Number(data.info.meta?.pages))} صفحة{data.info.quran ? "، والقرآن كاملًا" : ""}. آخر بناء: {data.info.meta?.built_at?.slice(0, 10)}</p>
          : <p className="text-sm text-[var(--color-gold)]">لم تُبنَ بعد.</p>}
        <p className="text-xs text-[var(--color-muted)] mt-1" dir="ltr">المصدر: {data.source}</p>
        {s && (
          <div className="mt-3 text-sm">
            <div>البناء: {s.state === "running" ? "جارٍ" : s.state === "done" ? "اكتمل" : s.state === "error" ? "فشل" : "متوقف"} — {s.step}</div>
            {s.total > 0 && <div className="mt-2 h-2 rounded-full bg-[var(--color-line)] overflow-hidden"><div className="h-full bg-[var(--color-brand)]" style={{ width: `${(s.done / s.total) * 100}%` }} /></div>}
            {s.total > 0 && <div className="text-xs text-[var(--color-muted)] mt-1">{num(s.done)} / {num(s.total)} كتابًا · {num(s.pages || 0)} صفحة</div>}
            {!!s.failed?.length && <div className="text-xs text-[var(--color-danger)]">تعذّر: {s.failed.join(", ")}</div>}
          </div>
        )}
      </div>
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">قائمة الكتب</h3>
        <p className="text-sm text-[var(--color-muted)]">أرقام الكتب من المكتبة الشاملة (يظهر في رابط الكتاب: shamela.ws/book/<b>رقم</b>)، وأرقام المؤلفين لإدخال كل كتبهم (مثل ابن تيمية ٥٤، ابن القيم ١٤، الألباني ٤١٤، ابن باز ٦٧، ابن عثيمين ٥٧ — تنبيه: إدخال مؤلف كامل يكبّر المكتبة كثيرًا).</p>
        <F l="أرقام الكتب"><textarea dir="ltr" rows={3} className="input text-sm" value={books} onChange={(e) => setBooks(e.target.value)} /></F>
        <F l="أرقام المؤلفين (كل كتبهم)"><input dir="ltr" className="input text-sm" value={authors} onChange={(e) => setAuthors(e.target.value)} /></F>
        <div className="flex gap-2">
          <button onClick={() => act()} className="btn btn-ghost">حفظ القائمة</button>
          <button onClick={() => act("build")} disabled={s?.state === "running"} className="btn btn-primary">{data.info.ready ? "إعادة البناء" : "بناء المكتبة"}</button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">البناء يجري في الخلفية، والمكتبة القديمة تبقى عاملة حتى يكتمل الجديد.</p>
      </div>
      {data.info.ready && (
        <details className="card p-5">
          <summary className="font-bold cursor-pointer">الكتب المدرجة ({num(data.info.books?.length)})</summary>
          <ul className="mt-3 text-sm grid sm:grid-cols-2 gap-1">{data.info.books?.map((b) => <li key={b.id}><span dir="ltr" className="text-[var(--color-muted)]">{b.id}</span> {b.name} — {num(b.pages)} ص</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ---------- الهوية والتعليمات ---------- */
function Settings() {
  const { data, load } = useLoad<SettingsData>("/api/admin/settings");
  const [b, setB] = useState<SettingsData["branding"] | null>(null);
  const [p, setP] = useState<SettingsData["prompts"] | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const { reload } = useMe();
  useEffect(() => { if (data) { setB(data.branding); setP(data.prompts); } }, [data]);
  async function save(body: object) {
    setOk(""); setErr("");
    try { await api("/api/admin/settings", { method: "POST", json: body }); setOk("حُفظ"); load(); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (!b || !p) return <p>…</p>;
  return (
    <div className="space-y-4">
      <Notice ok={ok} err={err} />
      <div className="card p-5 space-y-3">
        <h3 className="font-bold">هوية المنصة</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <F l="اسم المنصة"><input className="input" value={b.appName} onChange={(e) => setB({ ...b, appName: e.target.value })} /></F>
          <F l="بريد الدعم"><input dir="ltr" className="input" value={b.supportEmail} onChange={(e) => setB({ ...b, supportEmail: e.target.value })} /></F>
        </div>
        <F l="العبارة التعريفية"><textarea rows={2} className="input" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></F>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.indicDigits} onChange={(e) => setB({ ...b, indicDigits: e.target.checked })} />الأرقام العربية المشرقية (٠١٢٣) في الواجهة والردود</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.allowRegistration} onChange={(e) => setB({ ...b, allowRegistration: e.target.checked })} />التسجيل مفتوح للعموم</label>
        <button onClick={() => save({ branding: b })} className="btn btn-primary text-sm">حفظ الهوية</button>
      </div>
      {(["scholar", "general"] as const).map((k) => (
        <div key={k} className="card p-5 space-y-2">
          <h3 className="font-bold">{k === "scholar" ? "تعليمات القسم الشرعي (المنهج والأمانة العلمية)" : "تعليمات القسم العام"}</h3>
          <textarea rows={k === "scholar" ? 16 : 8} className="input text-sm leading-relaxed" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={() => save({ prompts: { [k]: p[k] } })} className="btn btn-primary text-sm">حفظ</button>
            <button onClick={() => confirm("استعادة النص الافتراضي؟") && save({ prompts: { reset: k } })} className="btn btn-ghost text-sm">استعادة الافتراضي</button>
          </div>
        </div>
      ))}
    </div>
  );
}
