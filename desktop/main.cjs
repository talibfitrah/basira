// بصيرة لسطح المكتب — يشغّل المنصة كلها على حاسوب المستخدم بلا أي خادم خارجي.
// الخادم (Next.js) والنموذج (llama.cpp) يعملان داخل هذه العملية، والنافذة تعرضهما.
const { app, BrowserWindow, shell, Menu, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const crypto = require("node:crypto");

const APP_NAME = "بصيرة";
if (!app.requestSingleInstanceLock()) app.quit();

function freePort() {
  return new Promise((ok, bad) => {
    const s = net.createServer();
    s.unref();
    s.on("error", bad);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

function secretFile(dir, name, bytes) {
  const f = path.join(dir, name);
  try { return fs.readFileSync(f, "utf8").trim(); } catch {}
  const v = crypto.randomBytes(bytes).toString("hex");
  fs.writeFileSync(f, v, { mode: 0o600 });
  return v;
}

async function waitFor(url, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("لم يبدأ الخادم الداخلي");
}

let win;
let logFile = null;
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map(String).join(" ")}\n`;
  process.stdout.write(line);
  try { if (logFile) fs.appendFileSync(logFile, line); } catch {}
}
process.on("uncaughtException", (e) => log("uncaught", e && e.stack ? e.stack : e));
process.on("unhandledRejection", (e) => log("unhandled", e && e.stack ? e.stack : e));

async function start() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  logFile = path.join(dataDir, "basira.log");
  try { if (fs.statSync(logFile).size > 5e6) fs.rmSync(logFile); } catch {}
  const port = await freePort();
  const token = crypto.randomBytes(24).toString("hex");

  Object.assign(process.env, {
    DESKTOP_MODE: "1",
    DESKTOP_TOKEN: token,
    DATA_DIR: dataDir,
    APP_SECRET: secretFile(dataDir, ".secret", 32),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    LOCAL_AI_URL: `http://127.0.0.1:${port}/api/desktop/llm`,
    INDEPENDENT_MODE: "1",
    PUBLIC_URL: `http://127.0.0.1:${port}`,
    LICENSE_SERVER: process.env.LICENSE_SERVER || "https://ai.murabbie.org",
    NODE_NO_WARNINGS: "1",
  });

  // الخادم الداخلي داخل هذه العملية
  const appDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "server");
  log("start", app.getVersion(), process.platform, process.arch, "port", port);
  require(path.join(appDir, "server.js"));

  const base = `http://127.0.0.1:${port}`;
  await session.defaultSession.cookies.set({ url: base, name: "basira_desktop", value: token, httpOnly: true, sameSite: "strict" });
  await waitFor(`${base}/activate`);
  log("server ready");

  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 760, minHeight: 560,
    title: APP_NAME, backgroundColor: "#f7f4ee", show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once("ready-to-show", () => win.show());
  // الروابط الخارجية (مصادر، الشاملة) تُفتح في المتصفح، لا في البرنامج
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(base)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); shell.openExternal(url); } });
  // الميكروفون مسموح للنافذة الداخلية وحدها
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "media" && wc.getURL().startsWith(base)));
  await win.loadURL(`${base}/chat`);
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform === "darwin" ? [{ label: APP_NAME, submenu: [{ role: "about", label: "عن بصيرة" }, { type: "separator" }, { role: "quit", label: "إنهاء" }] }] : []),
  { label: "تحرير", submenu: [{ role: "undo", label: "تراجع" }, { role: "redo", label: "إعادة" }, { type: "separator" }, { role: "cut", label: "قص" }, { role: "copy", label: "نسخ" }, { role: "paste", label: "لصق" }, { role: "selectAll", label: "تحديد الكل" }] },
  { label: "عرض", submenu: [{ role: "reload", label: "إعادة تحميل" }, { role: "zoomIn", label: "تكبير" }, { role: "zoomOut", label: "تصغير" }, { role: "resetZoom", label: "الحجم الأصلي" }, { role: "togglefullscreen", label: "ملء الشاشة" }] },
]));

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(start).catch((e) => {
  dialog.showErrorBox(APP_NAME, "تعذّر تشغيل البرنامج:\n" + (e && e.message ? e.message : String(e)));
  app.quit();
});
app.on("window-all-closed", () => app.quit());
