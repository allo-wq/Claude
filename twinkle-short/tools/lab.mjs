// node tools/lab.mjs out.png '{"cam":{...}, "pose":{...}}' [more.png json ...]
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';
const server = await startServer(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const msgs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(m.text()); });
page.on('pageerror', (e) => msgs.push('pageerror ' + e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/tools/lab.html`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(() => {});
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const t0 = Date.now();
  await page.evaluate((o) => window.__lab(o), JSON.parse(args[i + 1]));
  fs.writeFileSync(args[i], await (await page.$('#frame')).screenshot());
  console.log(args[i], Date.now() - t0, 'ms');
}
if (msgs.length) console.log([...new Set(msgs)].slice(0, 20).join('\n'));
await browser.close(); server.close();
