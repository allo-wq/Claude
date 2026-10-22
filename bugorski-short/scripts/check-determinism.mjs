// Re-renders a sample of frames in REVERSE order in a fresh browser and compares
// them with the frames used for the MP4 (out/frames). Frames are classed as:
//   SAME   – byte-identical PNG
//   ROUND  – pixels differ by at most 2/255 (software-rasteriser rounding, invisible)
//   DIFF   – real difference: some state leaks between frames (fails the check)
// Usage: node scripts/check-determinism.mjs [frame ...]
import fs from 'node:fs';
import { openRenderer } from './browser.mjs';
import { FRAMES } from '../src/timeline.js';

const args = process.argv.slice(2).map(Number);
const frames = args.length ? args : [0, 100, 280, 420, 530, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, FRAMES - 1];
const r = await openRenderer({ scale: 1 });
let bad = 0;
for (const f of [...frames].sort((a, b) => b - a)) {
  const file = `out/frames/f_${String(f).padStart(5, '0')}.png`;
  if (!fs.existsSync(file)) { console.log(`skip   ${f} (not rendered)`); continue; }
  const { buf } = await r.frame(f);
  const ref = fs.readFileSync(file);
  if (Buffer.compare(buf, ref) === 0) { console.log(`SAME   frame ${f}`); continue; }
  const stat = await r.page.evaluate(async ([a, b]) => {
    const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    const [x, y] = [await load(a), await load(b)];
    let max = 0, n = 0;
    for (let i = 0; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); if (d) { n++; if (d > max) max = d; } }
    return { max, n, total: x.length / 4 };
  }, [buf.toString('base64'), ref.toString('base64')]);
  const ok = stat.max <= 2;
  if (!ok) { bad++; fs.mkdirSync('out/determinism', { recursive: true }); fs.writeFileSync(`out/determinism/f_${String(f).padStart(5, '0')}.png`, buf); }
  console.log(`${ok ? 'ROUND' : 'DIFF '}  frame ${f}: ${stat.n} px differ (${((100 * stat.n) / stat.total).toFixed(3)}%), max ${stat.max}/255`);
}
await r.close();
console.log(bad ? `${bad} frame(s) differ beyond rounding — see out/determinism/` : 'Deterministic: every sampled frame matches (identical or within 2/255 rounding).');
process.exit(bad ? 1 : 0);
