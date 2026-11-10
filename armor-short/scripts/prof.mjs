// Dev aid: average render time per frame for a set of URL flags.
import { serve, launch, openPage } from './lib.mjs';
const scale = process.argv[2] || '1';
const configs = (process.argv[3] || '').split(',');
const { server, port } = await serve();
const browser = await launch();
for (const extra of configs) {
  const page = await openPage(browser, `http://127.0.0.1:${port}/src/index.html?scale=${scale}&${extra}`);
  const res = await page.evaluate(async () => {
    const times = [2.0, 2.4, 3.2, 3.6, 24.5];
    const out = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const t of times) {
        const t0 = performance.now();
        window.renderFrame(t);
        window.capture('image/jpeg', 0.95);
        if (pass) out.push(Math.round(performance.now() - t0));
      }
    }
    return out;
  });
  console.log((extra || 'baseline').padEnd(28), res.join(' '), ' avg', Math.round(res.reduce((a, b) => a + b, 0) / res.length));
  await page.close();
}
await browser.close();
server.close();
