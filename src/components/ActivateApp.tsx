"use client";
import { useEffect, useState } from "react";
import { useMe, PageHead } from "./AppShell";
import { api, num, dateAr } from "@/lib/client";

type State = { valid: boolean; reason?: string; daysLeft?: number; payload?: { k: string; n: string; p: string; exp: number }; server: string };

export default function ActivateApp() {
  const { reload } = useMe();
  const [st, setSt] = useState<State | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api<State>("/api/desktop/license").then(setSt).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/desktop/license", { method: "POST", json: { key } }); await load(); await reload(); location.href = "/chat"; }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-xl mx-auto p-4 sm:p-8 space-y-5">
        <PageHead title="الترخيص" sub="البرنامج يعمل كله على حاسوبك. التفعيل يحتاج اتصالًا مرة واحدة، ثم يتجدد تلقائيًّا مع اشتراكك." />
        {st?.valid && st.payload && (
          <div className="card p-5 space-y-1 text-sm">
            <div className="text-[var(--color-brand)] font-bold text-base">البرنامج مفعَّل</div>
            {st.payload.n && <div>باسم: {st.payload.n}</div>}
            <div>الباقة: {st.payload.p}</div>
            <div>يعمل بلا اتصال حتى: {dateAr(st.payload.exp)} ({num(st.daysLeft)} يومًا)، ويتجدد تلقائيًّا متى اتصل الحاسوب بالإنترنت.</div>
            <div dir="ltr" className="text-xs text-[var(--color-muted)] pt-1">{st.payload.k}</div>
            <button onClick={async () => { if (confirm("إلغاء التفعيل على هذا الحاسوب؟")) { await api("/api/desktop/license", { method: "DELETE" }); load(); reload(); } }}
              className="btn btn-danger text-sm mt-2">إلغاء التفعيل على هذا الحاسوب</button>
          </div>
        )}
        {st && !st.valid && (
          <form onSubmit={activate} className="card p-5 space-y-3">
            {st.reason && <p className="text-sm text-[var(--color-gold)]">{st.reason}</p>}
            <label className="label" htmlFor="key">مفتاح التفعيل (تجده في صفحة حسابك على الموقع)</label>
            <input id="key" dir="ltr" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="BSR-XXXXX-XXXXX-XXXXX-XXXXX" className="input font-mono" autoFocus />
            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
            <button className="btn btn-primary w-full" disabled={busy || key.length < 10}>{busy ? "يتصل بالخادم…" : "تفعيل"}</button>
            <p className="text-xs text-[var(--color-muted)]">لا تُرسل محادثاتك ولا ملفاتك إلى أي جهة؛ التفعيل يرسل المفتاح وبصمة مجهولة للحاسوب فقط. الخادم: <span dir="ltr">{st.server}</span></p>
          </form>
        )}
      </div>
    </div>
  );
}
