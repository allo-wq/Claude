// node scripts/still.mjs <t,t,t...> [scale]  ->  build/still-<t>.png (dev aid)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openPage } from './lib.mjs';
const times = (process.argv[2] || '0').split(',').map(Number);
const scale = process.argv[3] || '0.5';
const { server, port } = await serve();
const browser = await launch();
const page = await openPage(browser, `http://127.0.0.1:${port}/src/index.html?scale=${scale}`);
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
for (const t of times) {
  const t0 = Date.now();
  const data = await page.evaluate((tt) => { window.renderFrame(tt); return window.capture('image/png'); }, t);
  const out = path.join(ROOT, 'build', `still-${t.toFixed(2)}.png`);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(out, `${Date.now() - t0}ms`);
}
await browser.close();
server.close();
