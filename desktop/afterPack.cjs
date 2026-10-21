// electron-builder يستبعد مجلدات node_modules من الموارد الإضافية؛ ننسخها بعد التغليف وقبل صنع المثبّت.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(ctx) {
  const resources = ctx.electronPlatformName === "darwin"
    ? path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(ctx.appOutDir, "resources");
  const src = path.join(__dirname, "server", "node_modules");
  const dst = path.join(resources, "server", "node_modules");
  await fs.promises.cp(src, dst, { recursive: true, force: true, verbatimSymlinks: false, dereference: true });
  console.log("  • نُسخت وحدات الخادم إلى", dst);
};
