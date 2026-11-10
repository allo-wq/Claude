// Dev aid: throughput with N concurrent browsers.
import { serve, launch, openPage } from './lib.mjs';
const N = parseInt(process.argv[2] || '2', 10);
const extra = process.argv[3] || '';
const frames = 8;
const { server, port } = await serve();
const browsers = await Promise.all(Array.from({ length: N }, () => launch()));
const pages = await Promise.all(browsers.map((b) => openPage(b, `http://127.0.0.1:${port}/src/index.html?scale=1&${extra}`)));
const t0 = Date.now();
await Promise.all(pages.map((page, k) => page.evaluate(async ({ k, frames }) => {
  for (let i = 0; i < frames; i++) { window.renderFrame(2 + k * 3 + i * 0.1); window.capture('image/jpeg', 0.95); }
}, { k, frames })));
const dt = (Date.now() - t0) / 1000;
console.log(`N=${N} ${extra}: ${(dt / (N * frames)).toFixed(2)} s/frame effective (${(dt / frames).toFixed(2)} s/frame per process)`);
await Promise.all(browsers.map((b) => b.close()));
server.close();
