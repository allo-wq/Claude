#!/usr/bin/env node
/*
 * Renders exact frames of the animation for review and runs layout checks.
 * Usage: node tools/snapshots.cjs [page.html] [outDir] [t1,t2,...]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const page = path.resolve(process.argv[2] || path.join(__dirname, '../src/index.html'));
const outDir = path.resolve(process.argv[3] || path.join(__dirname, '../.snapshots'));
const times = (process.argv[4] || '0.4,1.2,2.6,3.0,4.9,6.2,7.4,9.3,9.6,11.2,11.9,13.6,14.7,15.8,17.3,18.4,19.6,21.2,22.4,23.55')
  .split(',').map(Number);

const VIEWS = [
  { name: 'landscape', width: 1280, height: 720, dsf: 1 },
  { name: 'portrait', width: 390, height: 694, dsf: 2 }
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  let problems = 0;
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf });
    const pg = await ctx.newPage();
    const logs = [];
    pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
    pg.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    await pg.goto('file://' + page);
    await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady, null, { timeout: 10000 });

    const info = await pg.evaluate(() => {
      const r = (s) => document.querySelector(s);
      const stage = r('.zb-stage');
      const lines = (el) => {
        const rects = Array.from(el.querySelectorAll('.zb-w')).map((w) => Math.round(w.getBoundingClientRect().top));
        return new Set(rects).size;
      };
      // text that overflows its own box (clipped/ellipsized content)
      const overflow = Array.from(document.querySelectorAll('.zb-panel *, .zb-copy *, .zb-accent *, .zb-controls *'))
        .filter((el) => el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
        .map((el) => el.className + ' :: ' + el.textContent.trim());
      const fontsOk = document.fonts.check('700 20px "Plus Jakarta Sans"');
      return {
        layout: stage.getAttribute('data-layout'),
        transform: stage.style.transform,
        headlineLines: lines(r('.zb-headline')),
        fontsOk,
        overflow,
        duration: window.ZadboxHero.duration
      };
    });
    console.log(`[${v.name}]`, JSON.stringify(info));
    if (logs.length) { console.log(`[${v.name}] console:`, logs); problems += logs.length; }
    if (!info.fontsOk) { console.log('font not loaded'); problems++; }

    for (const t of times) {
      await pg.evaluate((tt) => window.ZadboxHero.renderAt(tt), t);
      // stage bounds vs viewport
      const file = path.join(outDir, `${v.name}-${String(t.toFixed(2)).padStart(5, '0')}.png`);
      await pg.screenshot({ path: file });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `${problems} problem(s)` : 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
