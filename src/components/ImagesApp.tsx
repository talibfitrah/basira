"use client";
import { useEffect, useState } from "react";
import { useMe, PageHead } from "./AppShell";
import { api, num } from "@/lib/client";
import { IconDownload, IconTrash, IconSpark, IconLock } from "./Icons";

type Img = { id: string; prompt: string; model: string; aspectRatio?: string; created_at?: number };
const RATIOS = [["1:1", "مربّع"], ["16:9", "عريض"], ["9:16", "طولي"], ["3:2", "أفقي"], ["2:3", "عمودي"]] as const;

export default function ImagesApp() {
  const { me, reload } = useMe();
  const [images, setImages] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState<Img | null>(null);

  useEffect(() => { api<{ images: Img[] }>("/api/image").then((r) => setImages(r.images)).catch(() => {}); }, []);
  useEffect(() => { if (me && !model) setModel(me.imageModels.find((m) => !m.locked)?.id || ""); }, [me, model]);

  async function gen() {
    if (!prompt.trim() || !model) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ images: Img[] }>("/api/image", { method: "POST", json: { model, prompt, aspectRatio: ratio, n } });
      setImages((x) => [...r.images, ...x]);
      reload();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function del(id: string) {
    if (!confirm("حذف الصورة؟")) return;
    await api(`/api/image?id=${id}`, { method: "DELETE" });
    setImages((x) => x.filter((i) => i.id !== id));
  }
  const cur = me?.imageModels.find((m) => m.id === model);

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <PageHead title="توليد الصور" sub="صف الصورة التي تريدها بالعربية أو بغيرها، وكلما كان الوصف أدقّ كانت النتيجة أقرب." />
        <div className="card p-4 space-y-3">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="input resize-none"
            placeholder="مثال: مسجد صغير على تلّة خضراء عند الغروب، بأسلوب الألوان المائية، بلا أشخاص" />
          <div className="flex flex-wrap items-center gap-2">
            <select value={model} onChange={(e) => setModel(e.target.value)} className="input !w-auto !py-1.5 text-sm">
              {me?.imageModels.map((m) => <option key={m.id} value={m.id} disabled={m.locked}>{m.label}{m.locked ? " (باقة أعلى)" : ""}</option>)}
            </select>
            <div className="flex gap-1">
              {RATIOS.map(([r, l]) => <button key={r} onClick={() => setRatio(r)} className="chip" data-on={ratio === r}>{l}</button>)}
            </div>
            <select value={n} onChange={(e) => setN(+e.target.value)} className="input !w-auto !py-1.5 text-sm">
              {[1, 2, 3, 4].map((x) => <option key={x} value={x}>{num(x)} {x === 1 ? "صورة" : "صور"}</option>)}
            </select>
            <div className="flex-1" />
            <button onClick={gen} disabled={busy || !prompt.trim() || !model} className="btn btn-primary">
              <IconSpark className="w-4 h-4" />{busy ? "يُولِّد…" : "ولِّد"}
            </button>
          </div>
          {!me?.imageModels.length && <p className="text-sm text-[var(--color-gold)]">لا نموذج صور مفعّل (يحتاج مفتاح OpenAI أو Google).</p>}
          {!!me?.imageModels.length && me.imageModels.every((m) => m.locked) && (
            <p className="text-sm text-[var(--color-gold)] flex items-center gap-1"><IconLock className="w-4 h-4" />توليد الصور متاح في الباقات المدفوعة. <a href="/account" className="underline">رقِّ باقتك</a></p>
          )}
          {cur && <p className="text-xs text-[var(--color-muted)]">{cur.description}</p>}
          {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
          {busy && Array.from({ length: n }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-[var(--color-line)] animate-pulse" />)}
          {images.map((im) => (
            <figure key={im.id} className="group relative rounded-xl overflow-hidden border border-[var(--color-line)] bg-[var(--color-card)]">
              <button onClick={() => setView(im)} className="block w-full"><img src={`/api/files/${im.id}`} alt={im.prompt} loading="lazy" className="w-full aspect-square object-cover" /></button>
              <figcaption className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-white text-xs opacity-0 group-hover:opacity-100 transition flex items-end gap-1">
                <span className="flex-1 line-clamp-2">{im.prompt}</span>
                <a href={`/api/files/${im.id}?download`} className="p-1" aria-label="تنزيل"><IconDownload className="w-4 h-4" /></a>
                <button onClick={() => del(im.id)} className="p-1" aria-label="حذف"><IconTrash className="w-4 h-4" /></button>
              </figcaption>
            </figure>
          ))}
        </div>
        {!images.length && !busy && <p className="text-center text-[var(--color-muted)] mt-10">معرضك فارغ بعد.</p>}
      </div>
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          <div className="max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img src={`/api/files/${view.id}`} alt={view.prompt} className="max-h-[80vh] rounded-xl mx-auto" />
            <p className="text-white text-sm mt-3 text-center">{view.prompt} · {view.model}</p>
            <div className="flex justify-center gap-2 mt-3">
              <a href={`/api/files/${view.id}?download`} className="btn btn-primary"><IconDownload className="w-4 h-4" />تنزيل</a>
              <button onClick={() => { setPrompt(view.prompt); setView(null); }} className="btn btn-ghost">استعمل الوصف نفسه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
