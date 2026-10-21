#!/usr/bin/env node
// استعادة الدخول: يجعل الحساب مشرفًا ويضبط له كلمة مرور جديدة.
// الاستعمال: node scripts/admin-reset.mjs email@example.com NewPassword123
import path from "node:path";
import Database from "../src/lib/sqlite.mjs";
import bcrypt from "bcryptjs";

const [email, pass] = process.argv.slice(2);
if (!email || !pass || pass.length < 8) {
  console.error("الاستعمال: node scripts/admin-reset.mjs <email> <password ≥ 8>");
  process.exit(1);
}
const db = new Database(path.join(process.env.DATA_DIR || "data", "basira.db"));
const r = db.prepare("UPDATE users SET role='admin', disabled=0, password_hash=? WHERE email=?").run(bcrypt.hashSync(pass, 11), email.trim().toLowerCase());
console.log(r.changes ? "تمّ: الحساب مشرف بكلمة المرور الجديدة" : "لا يوجد حساب بهذا البريد");
