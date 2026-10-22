// Frame-accurate capture: serves the project, drives window.SHORT.renderAt(t)
// in headless Chromium and pipes PNG frames into ffmpeg.
//   node render.mjs                      -> out/video.mp4 (silent) + out/timeline.json
//   node render.mjs --stills 0.1,4,9.5   -> out/stills/*.png
//   node render.mjs --range 0:300        -> render only that frame range (debug)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.SHORT && window.SHORT.ready, null, { timeout: 300000 });
const { frames, fps } = await page.evaluate(() => ({ frames: SHORT.frames, fps: SHORT.TL.fps }));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(await page.evaluate(() => SHORT.TL), null, 1));

const cdp = await page.context().newCDPSession(page);
const shot = async (t) => {
  await page.evaluate((t) => SHORT.renderAt(t), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  return Buffer.from(data, 'base64');
};

if (arg('--stills')) {
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const t of arg('--stills').split(',').map(Number)) {
    const t0 = Date.now();
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await shot(t));
    console.log(`still t=${t} (${Date.now() - t0} ms)`);
  }
} else {
  const [f0, f1] = (arg('--range') || `0:${frames}`).split(':').map(Number);
  const file = arg('--out') || path.join(OUT, 'video_silent.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const start = Date.now();
  for (let f = f0; f < f1; f++) {
    const buf = await shot(f / fps);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 30 === 0) {
      const el = (Date.now() - start) / 1000, per = el / (f - f0 + 1);
      console.log(`frame ${f}/${f1}  ${per.toFixed(2)} s/frame  eta ${Math.round(per * (f1 - f))} s`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', file);
}
await browser.close();
server.close();
