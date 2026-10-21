#!/usr/bin/env node
// بناء «المكتبة الشرعية» (kb.db) من بيانات الشاملة المستخرجة على NAS.
//
// المصدر أحد اثنين:
//   ١) مجلد محلي (الأفضل على NAS): SHAMELA_DIR=/shamela وفيه master.db(.gz) و books.pack و services.db(.gz)
//   ٢) روابط المشاركة العامة: SHAMELA_MANIFEST_URL=https://files.murabbie.org/fsdownload/FnGtHqpG9/manifest.json
//
// قائمة الكتب: DATA_DIR/kb-collection.json  { "books": [..], "authors": [..] }  (تُنشأ بالقائمة الافتراضية إن لم توجد)
// الناتج: DATA_DIR/kb.db  والحالة: DATA_DIR/kb-status.json

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import https from "node:https";
import os from "node:os";
import Database from "../src/lib/sqlite.mjs";
import { normalizeArabic, stripHtml, indexForm } from "../src/lib/arabic.mjs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SRC_DIR = process.env.SHAMELA_DIR || "";
const MANIFEST_URL = process.env.SHAMELA_MANIFEST_URL || "https://files.murabbie.org/fsdownload/FnGtHqpG9/manifest.json";
const STATUS = path.join(DATA_DIR, "kb-status.json");
const OUT = path.join(DATA_DIR, "kb.db");
const TMP = path.join(DATA_DIR, "kb.building.db");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "kb-"));

// القائمة الافتراضية: أمهات التفسير والحديث، وكتب الألباني في التخريج، وأعلام المنهج.
export const DEFAULT_COLLECTION = {
  books: [
    42, 1509, 7798,                     // تفسير السعدي، ابن كثير (أولاد الشيخ)، الطبري (التركي)
    735, 1727, 1726, 1435, 829, 1198, 1699, 25794, // البخاري، مسلم، أبو داود، الترمذي، النسائي، ابن ماجه، الموطأ، المسند
    1673,                               // فتح الباري (السلفية)
    9442, 12762, 22592, 10757, 1663, 171, 25881, 1147, 1148, 1216, // الألباني
    7289, 197,                          // مجموع الفتاوى، زاد المعاد
    21537, 107,                         // ابن باز: مجموع الفتاوى، نور على الدرب
    12293, 10649, 9260,                 // ابن عثيمين: مجموع الفتاوى، الشرح الممتع، شرح رياض الصالحين
    7339,                               // القول المفيد على كتاب التوحيد
  ],
  authors: [],
};

function status(obj) {
  const s = { ...obj, updated_at: new Date().toISOString(), pid: process.pid };
  fs.writeFileSync(STATUS, JSON.stringify(s, null, 2));
}

// ---------- مصدر البيانات ----------
function gunzipFile(gz, out) {
  fs.writeFileSync(out, zlib.gunzipSync(fs.readFileSync(gz)));
}

class LocalSource {
  constructor(dir) {
    this.dir = dir;
    this.packFd = new Map();
  }
  async file(name) {
    const p = path.join(this.dir, name);
    if (fs.existsSync(p)) return p;
    if (fs.existsSync(p + ".gz")) {
      const out = path.join(WORK, name);
      gunzipFile(p + ".gz", out);
      return out;
    }
    return null;
  }
  async range(pack, offset, length) {
    if (!this.packFd.has(pack)) this.packFd.set(pack, fs.openSync(path.join(this.dir, pack), "r"));
    const buf = Buffer.alloc(length);
    fs.readSync(this.packFd.get(pack), buf, 0, length, offset);
    return buf;
  }
}

// روابط مشاركة DSM: تهيئة الجلسة والتنزيل يجب أن يكونا على اتصال TCP واحد.
class RemoteSource {
  constructor(manifestUrl) {
    this.manifestUrl = manifestUrl;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  }
  req(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const r = https.get(url, { agent: this.agent, headers: { ...headers, Cookie: this.cookie || "" } }, (res) => {
        const sc = res.headers["set-cookie"];
        if (sc) this.cookie = sc.map((c) => c.split(";")[0]).join("; ");
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      r.setTimeout(180000, () => r.destroy(new Error("timeout")));
      r.on("error", reject);
    });
  }
  async shared(url, headers = {}) {
    const m = url.match(/\/fsdownload\/([^/]+)\//);
    for (let i = 0; i < 6; i++) {
      try {
        if (m) await this.req(url.replace(/\/fsdownload\/.*/, `/sharing/${m[1]}`));
        const r = await this.req(url, headers);
        const ct = String(r.headers["content-type"] || "");
        if ((r.status === 200 || r.status === 206) && !ct.includes("text/html")) return r.body;
      } catch (e) { /* أعد المحاولة */ }
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
    throw new Error("تعذّر الجلب: " + url);
  }
  async init() {
    this.manifest = JSON.parse((await this.shared(this.manifestUrl)).toString("utf8"));
  }
  async file(name) {
    const d = this.manifest.data;
    const key = name === "master.db" ? "master" : name === "services.db" ? "services" : null;
    if (!key || !d[key]) return null;
    const out = path.join(WORK, name);
    fs.writeFileSync(out, zlib.gunzipSync(await this.shared(d[key].url)));
    return out;
  }
  async range(pack, offset, length) {
    const p = this.manifest.data.packs[pack];
    const body = await this.shared(p.url, { Range: `bytes=${offset}-${offset + length - 1}` });
    if (body.length !== length) throw new Error(`طول غير متوقع ${body.length}/${length}`);
    return body;
  }
}

// ---------- البناء ----------
function loadCollection() {
  const f = path.join(DATA_DIR, "kb-collection.json");
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(DEFAULT_COLLECTION, null, 2));
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function schema(db) {
  db.exec(`
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE books(id INTEGER PRIMARY KEY, name TEXT, author TEXT, author_id INTEGER, category TEXT, death TEXT, pages INTEGER);
    CREATE TABLE pages(id INTEGER PRIMARY KEY, book_id INTEGER, page_id INTEGER, part TEXT, page INTEGER, title TEXT, body TEXT, foot TEXT);
    CREATE INDEX pages_book ON pages(book_id, page_id);
    CREATE VIRTUAL TABLE pages_fts USING fts5(text, content='', tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE sura(id INTEGER PRIMARY KEY, name TEXT, ayat INTEGER, first_aya INTEGER);
    CREATE TABLE aya(id INTEGER PRIMARY KEY, sura INTEGER, aya INTEGER, text TEXT, uthmani TEXT);
    CREATE VIRTUAL TABLE aya_fts USING fts5(text, content='', tokenize='unicode61 remove_diacritics 2');
  `);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  status({ state: "running", step: "تهيئة المصدر", done: 0, total: 0 });
  let src;
  if (SRC_DIR && fs.existsSync(path.join(SRC_DIR, "books.pack"))) {
    src = new LocalSource(SRC_DIR);
    console.log("المصدر: مجلد محلي", SRC_DIR);
  } else {
    src = new RemoteSource(MANIFEST_URL);
    await src.init();
    console.log("المصدر: روابط المشاركة", MANIFEST_URL);
  }

  const masterPath = await src.file("master.db");
  if (!masterPath) throw new Error("لم يوجد master.db");
  const master = new Database(masterPath, { readonly: true });
  const coll = loadCollection();
  const ids = new Set((coll.books || []).map(Number));
  for (const a of coll.authors || []) {
    for (const r of master.prepare("SELECT book_id FROM book WHERE main_author=?").all(Number(a))) ids.add(r.book_id);
  }
  const books = master.prepare(`
    SELECT b.book_id id, b.book_name name, a.author_name author, b.main_author author_id, a.death_text death,
           c.category_name category, f.pack, f.offset, f.length, f.pages
    FROM book b JOIN book_file f USING(book_id)
    LEFT JOIN author a ON a.author_id=b.main_author
    LEFT JOIN category c ON c.category_id=b.book_category
    WHERE b.book_id IN (${[...ids].map(() => "?").join(",") || "NULL"})`).all(...ids);
  const missing = [...ids].filter((i) => !books.find((b) => b.id === i));
  if (missing.length) console.warn("كتب غير موجودة في الفهرس:", missing.join(","));

  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  const kb = new Database(TMP);
  kb.pragma("journal_mode = OFF");
  kb.pragma("synchronous = OFF");
  schema(kb);

  // القرآن من قاعدة الخدمات
  const svcPath = await src.file("services.db");
  if (svcPath) {
    const svc = new Database(svcPath, { readonly: true });
    const insS = kb.prepare("INSERT INTO sura VALUES (?,?,?,?)");
    const insA = kb.prepare("INSERT INTO aya VALUES (?,?,?,?,?)");
    const insF = kb.prepare("INSERT INTO aya_fts(rowid,text) VALUES (?,?)");
    kb.transaction(() => {
      for (const s of svc.prepare("SELECT id,name,ayat,first_aya FROM sura").all()) insS.run(s.id, s.name, s.ayat, s.first_aya);
      for (const a of svc.prepare("SELECT id,sura,aya,text,uthmani FROM aya").all()) {
        insA.run(a.id, a.sura, a.aya, a.text, a.uthmani);
        insF.run(a.id, indexForm(a.text));
      }
    })();
    svc.close();
    console.log("القرآن: تمّ");
  } else console.warn("لم توجد قاعدة الخدمات؛ أدوات القرآن ستكون معطَّلة");

  const insB = kb.prepare("INSERT INTO books VALUES (?,?,?,?,?,?,?)");
  const insP = kb.prepare("INSERT INTO pages(book_id,page_id,part,page,title,body,foot) VALUES (?,?,?,?,?,?,?)");
  const insPF = kb.prepare("INSERT INTO pages_fts(rowid,text) VALUES (?,?)");
  let done = 0, pagesTotal = 0;
  const failed = [];
  for (const b of books) {
    status({ state: "running", step: `«${b.name}»`, done, total: books.length, pages: pagesTotal });
    try {
      const gz = await src.range(b.pack, b.offset, b.length);
      const tmp = path.join(WORK, `${b.id}.db`);
      fs.writeFileSync(tmp, zlib.gunzipSync(gz));
      const bk = new Database(tmp, { readonly: true });
      // أقرب عنوان قبل كل صفحة
      const titles = bk.prepare("SELECT page, text FROM title ORDER BY page, id").all();
      let ti = 0, cur = "";
      let n = 0;
      kb.transaction(() => {
        for (const p of bk.prepare("SELECT id,part,page,body,foot FROM page ORDER BY id").iterate()) {
          while (ti < titles.length && titles[ti].page <= p.id) cur = titles[ti++].text;
          const body = stripHtml(p.body);
          const foot = stripHtml(p.foot);
          if (!body && !foot) continue;
          const r = insP.run(b.id, p.id, p.part ?? null, p.page ?? null, cur, body, foot || null);
          insPF.run(r.lastInsertRowid, indexForm(`${body} ${foot}`));
          n++;
        }
        insB.run(b.id, b.name, b.author, b.author_id, b.category, b.death, n);
      })();
      bk.close();
      fs.rmSync(tmp);
      pagesTotal += n;
      console.log(`✓ ${b.id} ${b.name} — ${n} صفحة`);
    } catch (e) {
      failed.push(b.id);
      console.error(`✗ ${b.id} ${b.name}:`, e.message);
    }
    done++;
  }
  status({ state: "running", step: "تحسين الفهرس", done, total: books.length, pages: pagesTotal });
  kb.exec("INSERT INTO pages_fts(pages_fts) VALUES('optimize'); INSERT INTO aya_fts(aya_fts) VALUES('optimize');");
  kb.prepare("INSERT INTO meta VALUES ('built_at', ?), ('books', ?), ('pages', ?), ('source', ?), ('normalizer', 'basira-v1')")
    .run(new Date().toISOString(), String(books.length - failed.length), String(pagesTotal), SRC_DIR || MANIFEST_URL);
  kb.close();
  fs.renameSync(TMP, OUT);
  for (const ext of ["-wal", "-shm"]) if (fs.existsSync(OUT + ext)) fs.rmSync(OUT + ext);
  fs.rmSync(WORK, { recursive: true, force: true });
  status({ state: "done", step: "اكتمل", done, total: books.length, pages: pagesTotal, failed });
  console.log(`اكتمل البناء — الكتب: ${books.length - failed.length}، الصفحات: ${pagesTotal} → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  status({ state: "error", step: e.message });
  process.exit(1);
});
