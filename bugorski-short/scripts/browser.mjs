// Shared headless Chromium launcher (software WebGL via SwiftShader, deterministic).
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

export async function openRenderer({ scale = 1, extra = '' } = {}) {
  const server = await startServer(0);
  const port = server.address().port;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1&scale=${scale}${extra}`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 180000 }).catch((e) => { throw new Error('page not ready: ' + errors.join('\n') + '\n' + e.message); });
  const canvas = await page.$('#frame');
  return {
    page, errors, W, H,
    /** Render one frame and return a PNG buffer of exactly the canvas. */
    async frame(f) {
      const shot = await page.evaluate((n) => window.__renderFrame(n), f);
      const buf = await canvas.screenshot({ type: 'png', animations: 'disabled', caret: 'initial', scale: 'css' });
      return { buf, shot };
    },
    async time(t) {
      const shot = await page.evaluate((n) => window.__renderTime(n), t);
      const buf = await canvas.screenshot({ type: 'png', scale: 'css' });
      return { buf, shot };
    },
    async close() { await browser.close(); server.close(); },
  };
}
