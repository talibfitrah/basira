// غلاف رفيع حول SQLite المدمج في Node (node:sqlite) بواجهة قريبة من better-sqlite3.
// يغني عن أي وحدة مُصرَّفة، فيعمل التطبيق نفسه على الخادم وعلى ويندوز وماك دون إعادة بناء.
import { DatabaseSync } from "node:sqlite";

class Statement {
  /** @param {import("node:sqlite").StatementSync} s */
  constructor(s) { this.s = s; }
  get(...a) { return this.s.get(...a); }
  all(...a) { return this.s.all(...a); }
  run(...a) { return this.s.run(...a); }
  iterate(...a) { return this.s.iterate(...a); }
}

export default class Database {
  /** @param {string} file @param {{ readonly?: boolean, fileMustExist?: boolean }} [opts] */
  constructor(file, opts = {}) {
    this.d = new DatabaseSync(file, { readOnly: !!opts.readonly });
  }
  /** @param {string} sql */
  prepare(sql) { return new Statement(this.d.prepare(sql)); }
  /** @param {string} sql */
  exec(sql) { this.d.exec(sql); return this; }
  /** @param {string} p */
  pragma(p) { this.d.exec(`PRAGMA ${p}`); }
  /** @template {(...a: any[]) => any} F @param {F} fn @returns {F} */
  transaction(fn) {
    // @ts-ignore
    return (...a) => {
      this.d.exec("BEGIN");
      try {
        const r = fn(...a);
        this.d.exec("COMMIT");
        return r;
      } catch (e) {
        this.d.exec("ROLLBACK");
        throw e;
      }
    };
  }
  close() { this.d.close(); }
}
