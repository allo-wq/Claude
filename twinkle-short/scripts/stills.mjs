// Render specific times to PNG for inspection.
// Usage: node scripts/stills.mjs [--scale 0.5] [--out dir] 0.5 2.1 13.95 ...
import fs from 'node:fs';
import path from 'node:path';
import { openRenderer } from './browser.mjs';

const args = process.argv.slice(2);
let scale = 0.5, out = 'out/stills', extra = '';
const times = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') scale = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--nobloom') extra += '&nobloom=1';
  else times.push(Number(args[i]));
}
fs.mkdirSync(out, { recursive: true });
const r = await openRenderer({ scale, extra });
for (const t of times) {
  const t0 = Date.now();
  const { buf, shot } = await r.time(t);
  const file = path.join(out, `t${t.toFixed(2).padStart(5, '0')}_${shot}.png`);
  fs.writeFileSync(file, buf);
  console.log(`${file}  (${Date.now() - t0} ms)`);
}
if (r.errors.length) console.log('Browser messages:\n' + [...new Set(r.errors)].slice(0, 30).join('\n'));
await r.close();
