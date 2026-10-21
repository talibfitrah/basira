#!/usr/bin/env bash
# بناء برنامج سطح المكتب: ./desktop/build.sh win | mac | linux
# يُشغَّل من أي مكان؛ يحتاج Node 22 فأحدث.
set -euo pipefail
TARGET="${1:-win}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESK="$ROOT/desktop"

case "$TARGET" in
  win)   OS=win32;  CPU=x64;   EB="--win" ;;
  mac)   OS=darwin; CPU=arm64; EB="--mac" ;;
  linux) OS=linux;  CPU=x64;   EB="--linux" ;;
  *) echo "الاستعمال: build.sh win|mac|linux"; exit 1 ;;
esac

echo "١) بناء التطبيق"
cd "$ROOT"
[ -d node_modules ] || npm ci
NEXT_TELEMETRY_DISABLED=1 npx next build

echo "٢) تجميع ملفات البرنامج"
rm -rf "$DESK/server"
cp -r "$ROOT/.next/standalone" "$DESK/server"
rm -rf "$DESK/server/data" "$DESK/server/desktop"
cp -r "$ROOT/.next/static" "$DESK/server/.next/static"
[ -d "$ROOT/public" ] && cp -r "$ROOT/public" "$DESK/server/public"
mkdir -p "$DESK/server/scripts" "$DESK/server/src/lib"
cp "$ROOT"/scripts/*.mjs "$DESK/server/scripts/"
cp "$ROOT/src/lib/arabic.mjs" "$ROOT/src/lib/sqlite.mjs" "$DESK/server/src/lib/"

echo "٣) محرّك النماذج (llama.cpp) للنظام الهدف: $OS-$CPU"
TMP="$(mktemp -d)"
( cd "$TMP" && npm init -y >/dev/null && npm i --no-audit --no-fund --os="$OS" --cpu="$CPU" node-llama-cpp@3.22.2 )
if [ "$TARGET" = "mac" ]; then
  ( cd "$TMP" && npm i --no-audit --no-fund --force --os=darwin --cpu=x64 @node-llama-cpp/mac-x64@3.22.2 )
fi
# نُبقي المعالج وVulkan (يشمل بطاقات NVIDIA وAMD وIntel) ونحذف CUDA الضخم ومنصات أخرى
find "$TMP/node_modules/@node-llama-cpp" -maxdepth 1 -mindepth 1 -type d | while read -r d; do
  n="$(basename "$d")"
  case "$TARGET:$n" in
    win:win-x64|win:win-x64-vulkan|mac:mac-arm64-metal|mac:mac-x64|linux:linux-x64|linux:linux-x64-vulkan) ;;
    *) rm -rf "$d" ;;
  esac
done
cp -rn "$TMP/node_modules/." "$DESK/server/node_modules/"
rm -rf "$TMP"
# مصادر llama.cpp وبناءاته المحلية لا يحتاجها البرنامج (يستعمل الملفات الجاهزة) — نحو ٣٠٠ م.ب
rm -rf "$DESK/server/node_modules/node-llama-cpp/llama/llama.cpp" \
       "$DESK/server/node_modules/node-llama-cpp/llama/gitRelease.bundle" \
       "$DESK/server/node_modules/node-llama-cpp/llama/localBuilds" \
       "$DESK/server/node_modules/@img" "$DESK/server/node_modules/sharp"

echo "٤) التغليف"
cd "$DESK"
[ -d node_modules ] || npm ci
if [ "$TARGET" = "win" ]; then
  # مثبّت ويندوز بـ makensis مباشرة (يعمل على لينكس وماك وويندوز دون wine)
  npx electron-builder --win --dir --publish never
  node set-exe-icon.cjs dist/win-unpacked/Basira.exe
  VERSION="$(node -p "require('./package.json').version")"
  makensis -V2 -DVERSION="$VERSION" installer.nsi
else
  npx electron-builder $EB --publish never
fi
ls -la "$DESK/dist" | grep -E "Basira" || true
