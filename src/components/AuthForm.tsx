"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

export default function AuthForm({ mode, appName }: { mode: "login" | "register"; appName: string }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: Object.fromEntries(f) });
      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") ? next : "/chat";
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card p-7 w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{mode === "login" ? "تسجيل الدخول" : `حساب جديد في ${appName}`}</h1>
      {mode === "register" && (
        <div><label className="label" htmlFor="name">الاسم</label><input id="name" name="name" className="input" required autoComplete="name" /></div>
      )}
      <div><label className="label" htmlFor="email">البريد الإلكتروني</label><input id="email" name="email" type="email" dir="ltr" className="input" required autoComplete="email" /></div>
      <div>
        <label className="label" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" dir="ltr" className="input" required minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </div>
      {err && <p className="text-sm text-[var(--color-danger)]" role="alert">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "لحظة…" : mode === "login" ? "دخول" : "إنشاء الحساب"}</button>
      <p className="text-sm text-center text-[var(--color-muted)]">
        {mode === "login" ? <>ليس لك حساب؟ <Link href="/register" className="text-[var(--color-brand)]">سجّل مجانًا</Link></>
          : <>لديك حساب؟ <Link href="/login" className="text-[var(--color-brand)]">ادخل</Link></>}
      </p>
    </form>
  );
}
