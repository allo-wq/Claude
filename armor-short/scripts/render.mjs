// Renders the short: every frame is drawn by src/main.js in headless Chromium
// (WebGL on the CPU, so no GPU needed), cached on disk, then encoded with the
// synthesized soundtrack.
//
//   node scripts/render.mjs                 full quality (1080x1920 @ CONFIG.fps)
//   node scripts/render.mjs --scale 0.5 --fps 30 --out build/preview.mp4
//   node scripts/render.mjs --frames-only   just (re)fill the frame cache
//
// Frames are cached in build/frames-<hash>/ keyed by the source code, so an
// interrupted render resumes where it stopped and a code change starts clean.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, serve, launch, openPage } from './lib.mjs';
import { CONFIG } from '../src/config.js';
import { buildTimeline } from '../src/timeline.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);

const scale = parseFloat(opt('scale', '1'));
const fps = parseInt(opt('fps', String(CONFIG.fps)), 10);
const workers = parseInt(opt('workers', '2'), 10);
const out = path.resolve(ROOT, opt('out', 'out/armor-price-short.mp4'));
const crf = opt('crf', '17');
const quality = parseFloat(opt('jpeg', '0.96'));

const TL = buildTimeline(CONFIG);
const total = Math.floor(TL.duration * fps);

const srcDir = path.join(ROOT, 'src');
const hash = crypto.createHash('sha1');
for (const f of fs.readdirSync(srcDir).sort()) hash.update(f).update(fs.readFileSync(path.join(srcDir, f)));
const tag = `${hash.digest('hex').slice(0, 8)}-s${scale}-f${fps}`;
const framesDir = opt('frames') ? path.resolve(ROOT, opt('frames')) : path.join(ROOT, 'build', `frames-${tag}`); // --frames <dir> reuses an existing cache
fs.mkdirSync(framesDir, { recursive: true });
const frameFile = (i) => path.join(framesDir, `f${String(i).padStart(6, '0')}.jpg`);

const todo = [];
for (let i = 0; i < total; i++) if (!fs.existsSync(frameFile(i))) todo.push(i);
console.log(`[render] ${total} frames @ ${fps}fps, scale ${scale}; ${total - todo.length} cached, ${todo.length} to render -> ${path.relative(ROOT, framesDir)}`);

if (todo.length) {
  const { server, port } = await serve();
  const n = Math.min(workers, todo.length);
  let done = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: n }, async (_, k) => {
      const browser = await launch();
      const page = await openPage(browser, `http://127.0.0.1:${port}/src/index.html?scale=${scale}`);
      // contiguous slices: each worker owns one stretch of the timeline
      const mine = todo.slice(Math.floor((k * todo.length) / n), Math.floor(((k + 1) * todo.length) / n));
      for (const i of mine) {
        const data = await page.evaluate(([t, q]) => { window.renderFrame(t); return window.capture('image/jpeg', q); }, [i / fps, quality]);
        const tmp = `${frameFile(i)}.tmp`;
        fs.writeFileSync(tmp, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
        fs.renameSync(tmp, frameFile(i));
        done++;
        if (done % 25 === 0 || done === todo.length) {
          const el = (Date.now() - t0) / 1000;
          console.log(`[render] ${done}/${todo.length}  ${(el / done).toFixed(2)}s/frame  eta ${Math.round(((todo.length - done) * el) / done / 60)}min`);
        }
      }
      await browser.close();
    })
  );
  server.close();
}
if (has('frames-only')) process.exit(0);

// soundtrack
execFileSync('node', [path.join(ROOT, 'scripts', 'timeline.mjs')], { stdio: 'inherit' });
const wav = path.join(ROOT, 'build', 'soundtrack.wav');
const py = spawnSync('python3', [path.join(ROOT, 'scripts', 'audio.py'), path.join(ROOT, 'build', 'timeline.json'), wav], { stdio: 'inherit' });
if (py.status !== 0) throw new Error('soundtrack generation failed');

// encode
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error', '-stats',
    '-framerate', String(fps), '-i', path.join(framesDir, 'f%06d.jpg'),
    '-i', wav,
    '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-movflags', '+faststart', '-shortest', out,
  ],
  { stdio: 'inherit' }
);
console.log(`[render] wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
