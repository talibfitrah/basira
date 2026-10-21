import fs from "node:fs";
import path from "node:path";
import { db, FILES_DIR, now } from "./db";
import { newId, HttpError } from "./auth";

export type FileRow = {
  id: string; user_id: string; name: string; media_type: string; size: number;
  path: string; kind: string; meta: string; created_at: number;
};

export const MAX_UPLOAD = 20 * 1024 * 1024;
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|csv))/;

export function saveFile(userId: string, name: string, mediaType: string, data: Uint8Array, kind = "upload", meta: object = {}) {
  const id = newId(12);
  const dir = path.join(FILES_DIR, userId);
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join(userId, id);
  fs.writeFileSync(path.join(FILES_DIR, rel), data);
  db().prepare("INSERT INTO files (id,user_id,name,media_type,size,path,kind,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, userId, name.slice(0, 200), mediaType, data.byteLength, rel, kind, JSON.stringify(meta), now());
  return id;
}

export function getFile(id: string, userId?: string): FileRow | null {
  const f = db().prepare("SELECT * FROM files WHERE id=?").get(id) as FileRow | undefined;
  if (!f || (userId && f.user_id !== userId)) return null;
  return f;
}

export function readFileBytes(f: FileRow): Buffer {
  const p = path.join(FILES_DIR, f.path);
  if (!p.startsWith(FILES_DIR)) throw new HttpError(400, "مسار غير صالح");
  return fs.readFileSync(p);
}

export function deleteFile(f: FileRow) {
  try { fs.rmSync(path.join(FILES_DIR, f.path)); } catch {}
  db().prepare("DELETE FROM files WHERE id=?").run(f.id);
}

export function isImage(t: string) { return t.startsWith("image/"); }
export function isPdf(t: string) { return t === "application/pdf"; }
export function isText(t: string, name = "") {
  return TEXT_TYPES.test(t) || /\.(txt|md|csv|json|xml|html?|js|ts|py|java|c|cpp|cs|go|rs|php|rb|sql|yaml|yml|ini|log)$/i.test(name);
}

/** نوع الملف من الامتداد عند غياب نوع صحيح من المتصفح. */
export function guessType(name: string, given: string) {
  if (given && given !== "application/octet-stream") return given;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg",
  };
  return map[ext] || given || "application/octet-stream";
}
