#!/usr/bin/env bash
# 브라우저 AI 검사(nsfwjs)를 앱 안에 담는 번들을 다시 만들 때만 쓰는 스크립트입니다. (평소에는 실행할 필요 없음)
# 사용법: bash tools/build-nsfw.sh   → public/vendor/nsfw4/ 아래에 번들이 만들어집니다.
set -euo pipefail
cd "$(dirname "$0")/.."
W=$(mktemp -d)
cp tools/nsfw-entry.js "$W/entry.js"
(cd "$W" && npm init -y >/dev/null && npm install --no-audit --no-fund nsfwjs@4 @tensorflow/tfjs@4 esbuild >/dev/null)
OUT=public/vendor/nsfw4
rm -rf "$OUT"
(cd "$W" && npx esbuild entry.js --bundle --format=esm --splitting --minify --target=es2020 \
  --entry-names=nsfw --outdir="$OLDPWD/$OUT" --define:process.env.NODE_ENV='"production"' --define:global=globalThis --legal-comments=none)
echo "완료: $OUT"; ls -la "$OUT"
