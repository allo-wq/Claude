// Deterministic frame renderer + encoder.
//   node scripts/render.mjs [--workers 3] [--scale 1] [--out final-animation.mp4]
//                           [--frames out/frames] [--audio narration.wav] [--from 0] [--to 1439] [--fresh]
// Every frame is rendered by seeking the master timeline to frame/FPS (no real-time
// playback), captured losslessly as PNG, then encoded with FFmpeg (H.264, yuv420p, 30 fps).
// If --audio is given (or audio/narration.* exists), it is muxed without retiming the video.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openRenderer } from './browser.mjs';
import { FPS, FRAMES, DURATION } from '../src/timeline.js';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const has = (name) => process.argv.includes('--' + name);
const workers = Number(arg('workers', 3));
const scale = Number(arg('scale', 1));
const out = arg('out', 'final-animation.mp4');
const framesDir = arg('frames', scale === 1 ? 'out/frames' : `out/frames_${scale}`);
const from = Number(arg('from', 0)), to = Number(arg('to', FRAMES - 1));
// Audio: --audio file, else the mixed soundtrack, else the bare voiceover, else a user recording.
let audio = arg('audio', null);
if (has('silent')) audio = null;
else if (!audio) for (const f of ['audio/soundtrack.flac', 'audio/narration_voice.flac', 'audio/narration.wav', 'audio/narration.mp3', 'audio/narration.m4a'])
  if (!audio && fs.existsSync(f)) audio = f;

if (has('fresh')) fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
const name = (f) => path.join(framesDir, `f_${String(f).padStart(5, '0')}.png`);
const todo = [];
for (let f = from; f <= to; f++) if (!fs.existsSync(name(f))) todo.push(f);
console.log(`Rendering ${todo.length} frames (${from}-${to}) at ${Math.round(1080 * scale)}x${Math.round(1920 * scale)} with ${workers} workers → ${framesDir}`);

const t0 = Date.now();
let done = 0;
async function worker(w) {
  const r = await openRenderer({ scale });
  for (let i = w; i < todo.length; i += workers) {
    const f = todo[i];
    const { buf } = await r.frame(f);
    fs.writeFileSync(name(f) + '.tmp', buf);
    fs.renameSync(name(f) + '.tmp', name(f)); // atomic: a crash never leaves a half-written frame
    done++;
    if (done % 30 === 0 || done === todo.length) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${done}/${todo.length} frames  ${el.toFixed(0)}s elapsed  ~${((el / done) * (todo.length - done)).toFixed(0)}s left`);
    }
  }
  const errs = [...new Set(r.errors)].filter((e) => !e.includes('GPU stall') && !e.includes('PCFSoftShadowMap'));
  if (errs.length) console.log(`worker ${w} browser messages:\n  ` + errs.slice(0, 20).join('\n  '));
  await r.close();
}
await Promise.all(Array.from({ length: Math.min(workers, Math.max(1, todo.length)) }, (_, w) => worker(w)));

const missing = [];
for (let f = 0; f < FRAMES; f++) if (!fs.existsSync(name(f))) missing.push(f);
if (missing.length) {
  console.log(`Not encoding: ${missing.length} frames missing (first: ${missing[0]}). Render the remaining range to finish.`);
  process.exit(from === 0 && to === FRAMES - 1 ? 1 : 0);
}

const ff = ['-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f_%05d.png')];
if (audio) ff.push('-i', audio);
ff.push('-map', '0:v:0');
if (audio) ff.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-af', 'apad', '-t', String(FRAMES / FPS));
ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-g', String(FPS * 2), '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', out);
console.log('ffmpeg ' + ff.join(' '));
const res = spawnSync('ffmpeg', ff, { stdio: ['ignore', 'inherit', 'pipe'] });
if (res.status !== 0) { console.error(res.stderr.toString().slice(-3000)); process.exit(1); }
console.log(`Wrote ${out} (${FRAMES} frames, ${DURATION}s)${audio ? ' with audio ' + audio : ' (silent)'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
