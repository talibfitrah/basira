"use client";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login";
    throw new Error((data as { error?: string }).error || `خطأ ${res.status}`);
  }
  return data as T;
}

let indic = true;
export function setIndicDigits(v: boolean) { indic = v; }
export function num(n: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat(indic ? "ar-EG-u-nu-arab" : "ar-u-nu-latn", { maximumFractionDigits: digits }).format(n ?? 0);
}
export function digits(s: string) {
  return indic ? s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : s;
}
export function dateAr(ms: number) {
  return new Intl.DateTimeFormat(indic ? "ar-EG-u-nu-arab" : "ar-u-nu-latn", { dateStyle: "medium" }).format(new Date(ms));
}
export function toggleTheme() {
  const d = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("theme", d ? "dark" : "light"); } catch {}
}
