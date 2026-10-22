#!/usr/bin/env bash
# Full pipeline: render frames -> synthesize audio -> mux final Short.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
node render.mjs
python3 audio.py out/timeline.json out/audio.wav
ffmpeg -y -loglevel error -i out/video_silent.mp4 -i out/audio.wav \
  -c:v libx264 -preset slow -crf 21 -maxrate 18M -bufsize 36M -pix_fmt yuv420p -af loudnorm=I=-14:TP=-1:LRA=11 -c:a aac -b:a 256k -ar 48000 -shortest \
  -movflags +faststart out/armor_short.mp4
echo "done -> out/armor_short.mp4"
