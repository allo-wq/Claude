// node scripts/sheet.mjs <t,t,...> [scale] [query]  ->  build/sheet.png  (contact sheet, dev aid)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, serve, launch, openPage } from './lib.mjs';
const times = (process.argv[2] || '0').split(',').map(Number);
const scale = process.argv[3] || '0.3334';
const extra = process.argv[4] || '';
const out = process.argv[5] || 'sheet';
const { server, port } = await serve();
const browser = await launch();
const page = await openPage(browser, `http://127.0.0.1:${port}/src/index.html?scale=${scale}&${extra}`);
const dir = path.join(ROOT, 'build', 'sheet');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
let ms = 0;
for (let i = 0; i < times.length; i++) {
  const t0 = Date.now();
  const data = await page.evaluate((tt) => { window.renderFrame(tt); return window.capture('image/png'); }, times[i]);
  ms += Date.now() - t0;
  fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
}
await browser.close();
server.close();
const cols = Math.min(times.length, 6);
const rows = Math.ceil(times.length / cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'f%03d.png'), '-vf', `tile=${cols}x${rows}:padding=6:color=0x202020`, '-frames:v', '1', path.join(ROOT, 'build', `${out}.png`)]);
console.log(path.join(ROOT, 'build', `${out}.png`), `${Math.round(ms / times.length)}ms/frame`);
