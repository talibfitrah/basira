"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, num, setIndicDigits, toggleTheme } from "@/lib/client";
import { Logo, IconChat, IconImage, IconBook, IconUser, IconSettings, IconMoon, IconLogout, IconMenu, IconX } from "./Icons";

export type ModelOpt = {
  id: string; label: string; provider: string; description: string; tier: number; locked: boolean;
  caps: { vision?: boolean; pdf?: boolean; web?: boolean; code?: boolean; tools?: boolean };
};
export type Me = {
  user: { id: string; email: string; name: string; role: string; plan_id: string; credits: number; subscription_status: string | null; period_end: number | null };
  plan: { id: string; name: string; monthly_credits: number; tier: number } | null;
  plans: { id: string; name: string; description: string; price_eur: number; monthly_credits: number; tier: number; stripe_price_id: string | null; features: string }[];
  models: ModelOpt[]; imageModels: ModelOpt[]; ttsModels: ModelOpt[]; sttModels: ModelOpt[];
  branding: { appName: string; tagline: string; indicDigits: boolean; supportEmail: string };
  library: { ready: boolean; books?: number; quran?: boolean };
  independent: boolean;
  desktop: null | { license: { valid: boolean; reason?: string; daysLeft?: number; payload?: { n: string; p: string; exp: number; k: string } } };
  usage: { kind: string; n: number; credits: number }[];
};

const Ctx = createContext<{ me: Me | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useMe = () => useContext(Ctx);

export default function AppShell({ children, sidebar }: { children: React.ReactNode; sidebar?: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const reload = useCallback(async () => {
    const m = await api<Me>("/api/me");
    setIndicDigits(m.branding.indicDigits);
    setMe(m);
  }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  useEffect(() => { setOpen(false); }, [path]);

  const desktop = !!me?.desktop;
  useEffect(() => {
    if (me?.desktop && !me.desktop.license.valid && !path.startsWith("/activate") && !path.startsWith("/admin")) location.href = "/activate";
  }, [me, path]);
  const nav = desktop ? [
    { href: "/chat", label: "المحادثة", icon: IconChat },
    { href: "/library", label: "المكتبة الشرعية", icon: IconBook },
    { href: "/admin", label: "النماذج والإعدادات", icon: IconSettings },
    { href: "/activate", label: "الترخيص", icon: IconUser },
  ] : [
    { href: "/chat", label: "المحادثة", icon: IconChat },
    ...(me && !me.imageModels.length && me.independent ? [] : [{ href: "/images", label: "الصور", icon: IconImage }]),
    { href: "/library", label: "المكتبة الشرعية", icon: IconBook },
    { href: "/account", label: "حسابي واشتراكي", icon: IconUser },
    ...(me?.user.role === "admin" ? [{ href: "/admin", label: "لوحة الإدارة", icon: IconSettings }] : []),
  ];

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

  return (
    <Ctx.Provider value={{ me, reload }}>
      <div className="h-dvh flex overflow-hidden">
        {open && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setOpen(false)} />}
        <aside className={`fixed md:static z-40 inset-y-0 start-0 w-72 shrink-0 bg-[var(--color-card)] border-e border-[var(--color-line)] flex flex-col transition-transform
          ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
          <div className="flex items-center justify-between p-4">
            <Link href="/" className="flex items-center gap-2 font-bold"><Logo className="w-7 h-7" />{me?.branding.appName ?? "…"}</Link>
            <button className="md:hidden p-1" onClick={() => setOpen(false)} aria-label="إغلاق"><IconX /></button>
          </div>
          <nav className="px-2 space-y-0.5">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[0.95rem] ${path.startsWith(n.href) ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-semibold" : "hover:bg-[var(--color-brand-soft)]/60"}`}>
                <n.icon className="w-[18px] h-[18px]" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin mt-3 border-t border-[var(--color-line)]">{sidebar}</div>
          <div className="p-3 border-t border-[var(--color-line)] text-sm">
            {me && desktop && (
              <Link href="/activate" className="block mb-2 px-2 text-xs text-[var(--color-muted)]">
                {me.desktop!.license.valid ? `مفعَّل · يتجدد تلقائيًّا · ${num(me.desktop!.license.daysLeft)} يومًا بلا اتصال` : "غير مفعَّل"}
              </Link>
            )}
            {me && !desktop && (
              <Link href="/account" className="block mb-2 px-2">
                <div className="flex justify-between"><span className="font-semibold truncate">{me.user.name || me.user.email}</span>
                  <span className="chip">{me.plan?.name}</span></div>
                <div className="mt-2 h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden">
                  <div className="h-full bg-[var(--color-brand)]" style={{ width: `${Math.min(100, (me.user.credits / Math.max(1, me.plan?.monthly_credits || 1)) * 100)}%` }} />
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-1">الرصيد: {me.user.role === "admin" ? "غير محدود (مشرف)" : `${num(me.user.credits)} نقطة`}</div>
              </Link>
            )}
            <div className="flex gap-1">
              <button onClick={toggleTheme} className="btn flex-1 text-sm" aria-label="تبديل المظهر"><IconMoon className="w-4 h-4" />المظهر</button>
              {!desktop && <button onClick={logout} className="btn flex-1 text-sm"><IconLogout className="w-4 h-4" />خروج</button>}
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-[var(--color-line)] bg-[var(--color-card)]">
            <button onClick={() => setOpen(true)} className="p-1.5" aria-label="القائمة"><IconMenu /></button>
            <span className="font-bold">{me?.branding.appName}</span>
          </div>
          {children}
        </main>
      </div>
    </Ctx.Provider>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub && <p className="text-[var(--color-muted)] mt-1">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
