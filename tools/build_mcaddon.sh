#!/usr/bin/env bash
# Package both packs into dist/Veilbreak.mcaddon (a zip with a different suffix).
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/gen_textures.py >/dev/null

# Validate every JSON file before packaging.
find Veilbreak_BP Veilbreak_RP -name '*.json' -print0 |
  xargs -0 -I{} python3 -c 'import json,sys; json.load(open(sys.argv[1]))' {} \
  || { echo "JSON validation failed" >&2; exit 1; }

mkdir -p dist
rm -f dist/Veilbreak.mcaddon
(cd . && zip -qr dist/Veilbreak.mcaddon Veilbreak_BP Veilbreak_RP -x '*.DS_Store')
echo "Built dist/Veilbreak.mcaddon ($(du -h dist/Veilbreak.mcaddon | cut -f1))"
