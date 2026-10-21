"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMe, PageHead } from "./AppShell";
import { api, num, dateAr } from "@/lib/client";
import { IconCheck } from "./Icons";

const KIND: Record<string, string> = { chat: "المحادثة", image: "الصور", tts: "القراءة الصوتية", stt: "تفريغ الصوت" };

export default function AccountApp() {
  const { me, reload } = useMe();
  const sp = useSearchParams();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sp.get("paid")) { setMsg("تمّ الدفع بنجاح. قد يستغرق تفعيل الباقة دقيقة؛ حدّث الصفحة إن لم تظهر."); const t = setTimeout(reload, 3000); return () => clearTimeout(t); }
  }, [sp, reload]);
  useEffect(() => {
    const up = sp.get("upgrade");
    if (up && me && me.user.plan_id !== up) checkout(up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.id]);

  async function checkout(planId: string) {
    setBusy(planId); setErr("");
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: { planId } });
      location.href = r.url;
    } catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function portal() {
    setBusy("portal"); setErr("");
    try {
      const r = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      location.href = r.url;
    } catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(""); setMsg("");
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body: Record<string, string> = { name: f.name };
    if (f.newPassword) { body.newPassword = f.newPassword; body.currentPassword = f.currentPassword; }
    try { await api("/api/me", { method: "PATCH", json: body }); setMsg("حُفظت التغييرات"); reload(); (e.target as HTMLFormElement).reset(); }
    catch (e) { setErr((e as Error).message); }
  }

  if (!me) return <div className="p-8 text-[var(--color-muted)]">…</div>;
  const u = me.user;
  const paid = !!u.subscription_status && ["active", "trialing", "past_due"].includes(u.subscription_status);
  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        <PageHead title="حسابي واشتراكي" sub={u.email} />
        {msg && <p className="card p-3 text-[var(--color-brand)]">{msg}</p>}
        {err && <p className="card p-3 text-[var(--color-danger)]">{err}</p>}

        <section className="card p-5 grid sm:grid-cols-3 gap-4">
          <div><div className="label">الباقة الحالية</div><div className="text-xl font-bold">{me.plan?.name}</div>
            {paid && u.period_end && <div className="text-xs text-[var(--color-muted)] mt-1">التجديد: {dateAr(u.period_end)}</div>}
            {u.subscription_status === "past_due" && <div className="text-xs text-[var(--color-danger)] mt-1">تعذّر تحصيل الدفعة الأخيرة</div>}
          </div>
          <div><div className="label">الرصيد المتبقي</div><div className="text-xl font-bold">{u.role === "admin" ? "غير محدود" : `${num(u.credits)} نقطة`}</div>
            <div className="text-xs text-[var(--color-muted)] mt-1">من {num(me.plan?.monthly_credits)} شهريًّا</div></div>
          <div className="flex items-end">{paid && <button onClick={portal} disabled={!!busy} className="btn btn-ghost w-full">{busy === "portal" ? "لحظة…" : "إدارة الاشتراك والفواتير"}</button>}</div>
        </section>

        <section>
          <h2 className="font-bold text-lg mb-3">الباقات</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {me.plans.map((p) => {
              const current = p.id === u.plan_id;
              return (
                <div key={p.id} className={`card p-4 flex flex-col ${current ? "ring-2 ring-[var(--color-brand)]" : ""}`}>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-2xl font-bold my-1">{p.price_eur > 0 ? `€${num(p.price_eur, 2)}` : "مجانًا"}</div>
                  <div className="text-xs text-[var(--color-muted)] mb-2">{num(p.monthly_credits)} نقطة شهريًّا</div>
                  <ul className="text-xs space-y-1 flex-1">{(JSON.parse(p.features) as string[]).map((f) => <li key={f} className="flex gap-1"><IconCheck className="w-3.5 h-3.5 text-[var(--color-brand)] shrink-0" />{f}</li>)}</ul>
                  {current ? <span className="chip mt-3 justify-center" data-on="true">باقتك</span>
                    : p.price_eur > 0 ? <button onClick={() => (paid ? portal() : checkout(p.id))} disabled={!!busy} className="btn btn-primary mt-3 text-sm">{busy === p.id ? "لحظة…" : paid ? "تغيير الباقة" : "اشترك"}</button>
                    : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-bold text-lg mb-3">استهلاكك في آخر ٣٠ يومًا</h2>
          {me.usage.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-[var(--color-muted)] text-start"><th className="text-start py-1">الخدمة</th><th className="text-start">العمليات</th><th className="text-start">النقاط</th></tr></thead>
              <tbody>{me.usage.map((x) => <tr key={x.kind} className="border-t border-[var(--color-line)]"><td className="py-1.5">{KIND[x.kind] || x.kind}</td><td>{num(x.n)}</td><td>{num(x.credits, 1)}</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-[var(--color-muted)]">لا استهلاك بعد.</p>}
        </section>

        <DesktopSection />

        <form onSubmit={saveProfile} className="card p-5 space-y-3">
          <h2 className="font-bold text-lg">البيانات الشخصية</h2>
          <div><label className="label">الاسم</label><input name="name" defaultValue={u.name} className="input" required /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">كلمة المرور الحالية</label><input name="currentPassword" type="password" dir="ltr" className="input" autoComplete="current-password" /></div>
            <div><label className="label">كلمة مرور جديدة (اختياري)</label><input name="newPassword" type="password" dir="ltr" minLength={8} className="input" autoComplete="new-password" /></div>
          </div>
          <button className="btn btn-primary">حفظ</button>
        </form>
      </div>
    </div>
  );
}

type Lic = { eligible: boolean; key?: string; maxDevices?: number; devices?: { id: string; name: string; at: number }[]; downloads: { win: string; mac: string; macintel?: string; linux: string } };
function DesktopSection() {
  const [d, setD] = useState<Lic | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () => api<Lic>("/api/license/mine").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const links = [["ويندوز", d.downloads.win], ["ماك (M1 فما بعدها)", d.downloads.mac], ["ماك (Intel)", d.downloads.macintel], ["لينكس", d.downloads.linux]].filter((x): x is [string, string] => !!x[1]);
  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-bold text-lg">برنامج سطح المكتب (يعمل بلا إنترنت)</h2>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed">برنامج يعمل كله على حاسوبك: النموذج والمكتبة الشرعية والمحادثات، بلا اتصال بأي جهة. يتصل بنا مرة عند التفعيل، ثم مرة كل بضعة أسابيع لتجديد الترخيص مع اشتراكك.</p>
      {!!links.length && (
        <div className="flex flex-wrap gap-2">{links.map(([l, u]) => <a key={l} href={u} className="btn btn-ghost text-sm">تنزيل لـ{l}</a>)}</div>
      )}
      {d.eligible ? (
        <>
          <div>
            <div className="label">مفتاح التفعيل</div>
            <div className="flex gap-2 items-center">
              <code dir="ltr" className="bg-[var(--color-brand-soft)] px-3 py-2 rounded-lg font-mono text-sm select-all">{d.key}</code>
              <button onClick={() => { navigator.clipboard.writeText(d.key!); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn btn-ghost text-sm">{copied ? "نُسخ" : "نسخ"}</button>
            </div>
          </div>
          <div className="text-sm">
            <div className="label">الأجهزة المفعّلة ({num(d.devices?.length)} من {num(d.maxDevices)})</div>
            {d.devices?.length ? d.devices.map((x) => (
              <div key={x.id} className="flex justify-between border-t border-[var(--color-line)] py-1.5">
                <span>{x.name} <span className="text-[var(--color-muted)] text-xs">— آخر تجديد {dateAr(x.at)}</span></span>
                <button onClick={async () => { await api(`/api/license/mine?device=${x.id}`, { method: "DELETE" }); load(); }} className="text-[var(--color-danger)] text-xs">إلغاء التفعيل</button>
              </div>
            )) : <p className="text-[var(--color-muted)]">لم يُفعَّل على أي جهاز بعد.</p>}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--color-gold)]">برنامج سطح المكتب متاح في الباقات المدفوعة.</p>
      )}
    </section>
  );
}
