// node scripts/preview.mjs <id> [query]  ->  build/preview-<id>.png
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openPage } from './lib.mjs';
const [id = 'helmet', extra = ''] = process.argv.slice(2);
const { server, port } = await serve();
const browser = await launch();
const page = await openPage(browser, `http://127.0.0.1:${port}/src/preview.html?id=${id}&${extra}`, { width: 1400, height: 1400 });
await page.evaluate(() => window.renderPreview());
const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const out = path.join(ROOT, 'build', `preview-${id}${extra ? '-' + extra.replace(/[^a-z0-9]+/gi, '_') : ''}.png`);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(out);
await browser.close();
server.close();
