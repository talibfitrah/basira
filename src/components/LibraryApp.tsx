"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHead } from "./AppShell";
import { api, num } from "@/lib/client";
import { IconSearch, IconBook } from "./Icons";

type Hit = { ref: string; book_id: number; page_id: number; book: string; author: string; title: string; text: string; url: string };
type Aya = { sura: number; sura_name: string; aya: number; text: string };
type Book = { id: number; name: string; author: string; category: string; pages: number };

export default function LibraryApp() {
  const [info, setInfo] = useState<{ ready: boolean; books?: Book[]; meta?: Record<string, string> } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [ayat, setAyat] = useState<Aya[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<number | 0>(0);

  useEffect(() => { api<typeof info>("/api/library").then(setInfo).catch((e) => setErr(e.message)); }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ results: Hit[]; ayat: Aya[] }>(`/api/library?q=${encodeURIComponent(q)}${filter ? `&books=${filter}` : ""}`);
      setHits(r.results); setAyat(r.ayat);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const cats = info?.books ? Object.entries(info.books.reduce<Record<string, Book[]>>((a, b) => ((a[b.category] ||= []).push(b), a), {})) : [];

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <PageHead title="المكتبة الشرعية" sub="ابحث بنفسك في النصوص التي يعتمد عليها القسم الشرعي، وتحقّق من كل نقل في موضعه.">
          <Link href="/chat?mode=scholar&new=1" className="btn btn-primary"><IconBook className="w-4 h-4" />اسأل في القسم الشرعي</Link>
        </PageHead>
        {info && !info.ready && (
          <div className="card p-6 text-center text-[var(--color-muted)] space-y-3">
            <p>لم تُعدّ المكتبة بعد. تُبنى مرة واحدة (بضع دقائق، نحو ٧٥٠ م.ب) ثم تعمل بلا إنترنت.</p>
            <a href="/admin" className="btn btn-primary">إعداد المكتبة</a>
          </div>
        )}
        {info?.ready && (
          <>
            <form onSubmit={search} className="card p-3 flex flex-wrap gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} className="input flex-1 min-w-48" placeholder="مثال: من كان يؤمن بالله واليوم الآخر فليقل خيرا" />
              <select value={filter} onChange={(e) => setFilter(+e.target.value)} className="input !w-auto text-sm max-w-56">
                <option value={0}>كل الكتب ({num(info.books?.length)})</option>
                {info.books?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button className="btn btn-primary" disabled={busy}><IconSearch className="w-4 h-4" />{busy ? "يبحث…" : "ابحث"}</button>
            </form>
            {err && <p className="text-[var(--color-danger)] text-sm mt-3">{err}</p>}
            {!!ayat.length && (
              <div className="card p-4 mt-4">
                <div className="text-sm font-semibold text-[var(--color-muted)] mb-2">آيات</div>
                {ayat.map((a) => (
                  <p key={`${a.sura}:${a.aya}`} className="ayah">{a.text} <span className="text-sm text-[var(--color-gold)] font-sans">[{a.sura_name}: {num(a.aya)}]</span></p>
                ))}
              </div>
            )}
            {hits && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-[var(--color-muted)]">{hits.length ? `${num(hits.length)} نتيجة` : "لا نتائج. جرّب كلمات أقل أو صيغة أخرى."}</p>
                {hits.map((h) => (
                  <article key={`${h.book_id}-${h.page_id}`} className="card p-4">
                    <div className="flex flex-wrap justify-between gap-2 text-sm mb-2">
                      <span className="font-bold text-[var(--color-brand)]">{h.ref}</span>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-muted)] hover:underline">في الشاملة ↗</a>
                    </div>
                    {h.title && <div className="text-xs text-[var(--color-gold)] mb-1">{h.title}</div>}
                    <p className="whitespace-pre-wrap leading-loose text-[0.97rem]">{h.text}</p>
                  </article>
                ))}
              </div>
            )}
            {!hits && (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-[var(--color-muted)]">
                  محتوى المكتبة: {num(info.books?.length)} كتابًا، {num(Number(info.meta?.pages || 0))} صفحة، والقرآن الكريم كاملًا.
                </p>
                {cats.map(([cat, books]) => (
                  <div key={cat}>
                    <h3 className="font-bold mb-2">{cat}</h3>
                    <ul className="grid sm:grid-cols-2 gap-1.5 text-sm">
                      {books.map((b) => <li key={b.id} className="card px-3 py-2"><span className="font-semibold">{b.name}</span><span className="text-[var(--color-muted)]"> — {b.author}</span></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
