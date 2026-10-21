import Database from "./sqlite.mjs";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";
import { branding } from "./config";
import { buildFtsQuery, normalizeArabic, arabicWordRegex, stripHtml, keywords } from "./arabic.mjs";

const KB_PATH = path.join(DATA_DIR, "kb.db");
type G = typeof globalThis & { __kb?: { db: Database; mtime: number } };
const g = globalThis as G;

/** يفتح المكتبة للقراءة، ويعيد فتحها إن أُعيد بناؤها. */
function kb(): Database | null {
  if (!fs.existsSync(KB_PATH)) return null;
  const mtime = fs.statSync(KB_PATH).mtimeMs;
  if (!g.__kb || g.__kb.mtime !== mtime) {
    try { g.__kb?.db.close(); } catch {}
    g.__kb = { db: new Database(KB_PATH, { readonly: true, fileMustExist: true }), mtime };
  }
  return g.__kb.db;
}

export function libraryInfo() {
  const d = kb();
  if (!d) return { ready: false as const };
  const meta = Object.fromEntries((d.prepare("SELECT key,value FROM meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const books = d.prepare("SELECT id,name,author,category,pages FROM books ORDER BY category, name").all() as LibBook[];
  const quran = (d.prepare("SELECT COUNT(*) c FROM aya").get() as { c: number }).c > 0;
  return { ready: true as const, meta, books, quran };
}

export type LibBook = { id: number; name: string; author: string; category: string; pages: number };
export type LibHit = {
  ref: string; book_id: number; page_id: number; book: string; author: string;
  part: string | null; page: number | null; title: string; text: string; url: string;
};

const shamelaUrl = (b: number, p: number) => `https://shamela.ws/book/${b}/${p}`;

function refOf(r: { book: string; part: string | null; page: number | null; page_id: number }) {
  const where = r.part ? `ج${r.part} ص${r.page ?? "?"}` : r.page ? `ص${r.page}` : `صفحة الشاملة ${r.page_id}`;
  const out = `${r.book}، ${where}`;
  return branding().indicDigits ? out.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : out;
}

/** مقتطف حول أول موضع للكلمات المطلوبة في النص الأصلي. */
function excerpt(text: string, query: string, max = 1400) {
  if (text.length <= max) return text;
  const words = normalizeArabic(query).split(" ").filter((w: string) => w.length > 2)
    .map((w: string) => w.replace(/^(وال|فال|بال|كال|لل|ال)/, "")).filter((w: string) => w.length >= 2);
  let pos = -1;
  for (const w of words) {
    const m = arabicWordRegex(w).exec(text);
    if (m) { pos = m.index; break; }
  }
  const start = pos < 0 ? 0 : Math.max(0, pos - Math.floor(max / 3));
  return (start > 0 ? "… " : "") + text.slice(start, start + max) + (start + max < text.length ? " …" : "");
}

export function searchLibrary(rawQuery: string, opts: { books?: number[]; limit?: number } = {}): LibHit[] {
  const d = kb();
  if (!d) return [];
  const query = keywords(rawQuery) || rawQuery;
  const limit = Math.min(opts.limit ?? 8, 20);
  const run = (op: "near" | "and" | "or") => {
    let q = buildFtsQuery(query, op === "or" ? "or" : "and");
    if (op === "near") {
      const words = normalizeArabic(query).split(" ").filter((w: string) => w.length > 1).slice(0, 8);
      if (words.length < 2) return [];
      q = `NEAR(${words.map((w: string) => `"${w.replace(/^(وال|فال|بال|كال|لل|ال)(?=..)/, "")}"`).join(" ")}, 10)`;
    }
    if (!q) return [];
    const filter = opts.books?.length ? `AND p.book_id IN (${opts.books.map(Number).join(",")})` : "";
    return d.prepare(`
      SELECT p.book_id, p.page_id, p.part, p.page, p.title, p.body, p.foot, b.name book, b.author
      FROM pages_fts f JOIN pages p ON p.id = f.rowid JOIN books b ON b.id = p.book_id
      WHERE pages_fts MATCH ? ${filter}
      ORDER BY bm25(pages_fts) LIMIT ?`).all(q, limit) as {
        book_id: number; page_id: number; part: string | null; page: number | null; title: string;
        body: string; foot: string | null; book: string; author: string;
      }[];
  };
  let rows: ReturnType<typeof run> = [];
  for (const op of ["near", "and", "or"] as const) {
    if (rows.length >= limit) break;
    if (op === "or" && rows.length >= 3) break;
    const extra = run(op).filter((r) => !rows.some((x) => x.book_id === r.book_id && x.page_id === r.page_id));
    rows = rows.concat(extra).slice(0, limit);
  }
  return rows.map((r) => ({
    ref: refOf(r), book_id: r.book_id, page_id: r.page_id, book: r.book, author: r.author,
    part: r.part, page: r.page, title: r.title, text: excerpt(stripHtml(r.body) + (r.foot ? `\n\n[الحاشية]\n${stripHtml(r.foot)}` : ""), query),
    url: shamelaUrl(r.book_id, r.page_id),
  }));
}

export function readPages(bookId: number, pageId: number, around = 0) {
  const d = kb();
  if (!d) return [];
  const rows = d.prepare(`
    SELECT p.book_id, p.page_id, p.part, p.page, p.title, p.body, p.foot, b.name book, b.author
    FROM pages p JOIN books b ON b.id=p.book_id
    WHERE p.book_id=? AND p.page_id BETWEEN ? AND ? ORDER BY p.page_id`).all(bookId, pageId - around, pageId + around) as {
      book_id: number; page_id: number; part: string | null; page: number | null; title: string; body: string; foot: string | null; book: string; author: string;
    }[];
  return rows.map((r) => ({ ref: refOf(r), title: r.title, text: r.body, foot: r.foot, url: shamelaUrl(r.book_id, r.page_id) }));
}

export function quranAyat(sura: number, from: number, to?: number) {
  const d = kb();
  if (!d) return null;
  const s = d.prepare("SELECT id,name,ayat FROM sura WHERE id=?").get(sura) as { id: number; name: string; ayat: number } | undefined;
  if (!s) return null;
  const end = Math.min(to ?? from, s.ayat, from + 40);
  const ayat = d.prepare("SELECT aya, uthmani, text FROM aya WHERE sura=? AND aya BETWEEN ? AND ? ORDER BY aya").all(sura, from, end) as
    { aya: number; uthmani: string; text: string }[];
  return { sura: s.name, sura_no: s.id, ayat };
}

export function quranSearch(text: string, limit = 8) {
  const d = kb();
  if (!d) return [];
  const q = buildFtsQuery(text, "and") || "";
  if (!q) return [];
  return d.prepare(`
    SELECT a.sura, s.name sura_name, a.aya, a.text FROM aya_fts f JOIN aya a ON a.id=f.rowid JOIN sura s ON s.id=a.sura
    WHERE aya_fts MATCH ? ORDER BY bm25(aya_fts) LIMIT ?`).all(q, limit);
}

/* ------------------------------------------------------------------
 * التحقق الآلي من النقول: كل نص بين «» أو "" أو ﴿﴾ في الجواب يُبحث عنه
 * في المكتبة والقرآن؛ فما لم يوجد يُعلَّم للقارئ بأنه غير موثَّق.
 * ------------------------------------------------------------------ */
export type QuoteCheck = { text: string; ok: boolean; kind: "aya" | "text"; ref?: string; url?: string };

export function extractQuotes(answer: string): { text: string; kind: "aya" | "text" }[] {
  const out: { text: string; kind: "aya" | "text" }[] = [];
  const seen = new Set<string>();
  const push = (t: string, kind: "aya" | "text") => {
    const s = t.replace(/\s+/g, " ").trim();
    const words = normalizeArabic(s).split(" ").filter((w: string) => w.length > 1);
    if (words.length < 4 || !/[؀-ۿ]/.test(s)) return;
    const k = words.join(" ");
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ text: s.slice(0, 300), kind });
  };
  for (const m of answer.matchAll(/﴿([^﴾]{6,800})﴾/g)) push(m[1], "aya");
  for (const m of answer.matchAll(/«([^»]{6,800})»/g)) push(m[1], "text");
  for (const m of answer.matchAll(/"([^"\n]{6,800})"/g)) push(m[1], "text");
  for (const m of answer.matchAll(/“([^”\n]{6,800})”/g)) push(m[1], "text");
  return out.slice(0, 15);
}

function nearQuery(words: string[], dist: number) {
  return `NEAR(${words.map((w) => `"${w.replace(/^(وال|فال|بال|كال|لل|ال)(?=..)/, "")}"`).join(" ")}, ${dist})`;
}

export function verifyQuotes(answer: string): QuoteCheck[] {
  const d = kb();
  if (!d) return [];
  const res: QuoteCheck[] = [];
  for (const q of extractQuotes(answer)) {
    const words = normalizeArabic(q.text).split(" ").filter((w: string) => w.length > 1);
    // نأخذ أطول مقطع متصل حتى ٨ كلمات؛ والنص الطويل يُفحص بمقطعين (أوله وآخره)
    const chunks = words.length > 10 ? [words.slice(0, 8), words.slice(-8)] : [words.slice(0, 8)];
    let hit: { ref?: string; url?: string } | null = null;
    let all = true;
    for (const ch of chunks) {
      let found: { ref?: string; url?: string } | null = null;
      try {
        const ay = d.prepare(`SELECT a.sura, s.name sname, a.aya FROM aya_fts f JOIN aya a ON a.id=f.rowid JOIN sura s ON s.id=a.sura WHERE aya_fts MATCH ? LIMIT 1`)
          .get(nearQuery(ch, ch.length * 3)) as { sura: number; sname: string; aya: number } | undefined;
        if (ay) found = { ref: `سورة ${ay.sname}: ${ay.aya}`, url: `https://quran.com/${ay.sura}/${ay.aya}` };
        if (!found && q.kind === "text") {
          const pg = d.prepare(`SELECT p.book_id, p.page_id, p.part, p.page, b.name book FROM pages_fts f JOIN pages p ON p.id=f.rowid JOIN books b ON b.id=p.book_id WHERE pages_fts MATCH ? LIMIT 1`)
            .get(nearQuery(ch, ch.length * 3)) as { book_id: number; page_id: number; part: string | null; page: number | null; book: string } | undefined;
          if (pg) found = { ref: refOf(pg), url: shamelaUrl(pg.book_id, pg.page_id) };
        }
      } catch { /* استعلام غير صالح */ }
      if (!found) all = false;
      else hit ||= found;
    }
    res.push({ text: q.text, kind: q.kind, ok: all && !!hit, ...(all && hit ? hit : {}) });
  }
  if (branding().indicDigits) for (const r of res) if (r.ref) r.ref = r.ref.replace(/[0-9]/g, (x) => "٠١٢٣٤٥٦٧٨٩"[+x]);
  return res;
}
