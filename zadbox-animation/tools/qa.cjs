#!/usr/bin/env node
/* Behaviour checks for the built single-file animation. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, '../dist/zadbox-animation.html'));
const URL = 'file://' + FILE;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, reducedMotion: opts.reducedMotion || 'no-preference' });
  const pg = await ctx.newPage();
  const errors = [], requests = [];
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  pg.on('pageerror', (e) => errors.push(e.message));
  pg.on('request', (r) => { if (!r.url().startsWith('data:') && r.url() !== URL) requests.push(r.url()); });
  await pg.goto(opts.url || URL);
  return { ctx, pg, errors, requests };
}
const api = (pg, expr) => pg.evaluate(expr);

(async () => {
  const browser = await chromium.launch();

  /* 1. autoplay, self-containment, pause, chapters */
  {
    const { ctx, pg, errors, requests } = await open(browser);
    await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
    await wait(3500);
    const t1 = await api(pg, () => window.ZadboxHero.time);
    check('autoplays after intro', t1 > 1.5 && t1 < 4, `master t=${t1.toFixed(2)}s after 3.5s`);
    check('no external requests (fully self-contained)', requests.length === 0, requests.join(', '));

    await pg.click('.zb-toggle');
    const p1 = await api(pg, () => window.ZadboxHero.time); await wait(800);
    const p2 = await api(pg, () => window.ZadboxHero.time);
    const label = await pg.getAttribute('.zb-toggle', 'aria-label');
    check('pause button stops playback', Math.abs(p2 - p1) < 0.001 && label === 'Play animation', `Δt=${(p2 - p1).toFixed(3)} label="${label}"`);
    await pg.click('.zb-toggle'); await wait(600);
    const p3 = await api(pg, () => window.ZadboxHero.time);
    check('play button resumes', p3 > p2 + 0.3, `t=${p3.toFixed(2)}`);

    await pg.click('.zb-chapter[data-chapter="1"]'); await wait(200);
    const c1 = await api(pg, () => window.ZadboxHero.time);
    const active = await pg.getAttribute('.zb-chapter[data-chapter="1"]', 'aria-current');
    check('chapter 2 button jumps to Meal Subscription', c1 >= 8.35 && c1 < 9.2 && active === 'step', `t=${c1.toFixed(2)} aria-current=${active}`);
    await pg.click('.zb-chapter[data-chapter="2"]'); await wait(200);
    const c2 = await api(pg, () => window.ZadboxHero.time);
    check('chapter 3 button jumps to Reviews', c2 >= 16.6 && c2 < 17.5, `t=${c2.toFixed(2)}`);

    /* responsive switch */
    await pg.setViewportSize({ width: 390, height: 694 }); await wait(300);
    const lay = await pg.getAttribute('.zb-stage', 'data-layout');
    const box = await pg.evaluate(() => { const r = document.querySelector('.zb-stage').getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; });
    check('switches to portrait layout on phones', lay === 'portrait' && box.w <= 390.5 && box.l >= -0.5, JSON.stringify(box));
    const hscroll = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check('no horizontal scroll on phones', !hscroll);
    await pg.setViewportSize({ width: 1440, height: 810 }); await wait(300);
    check('switches back to landscape', (await pg.getAttribute('.zb-stage', 'data-layout')) === 'landscape');

    /* inline embed mode: scales to width, sets its own height */
    const inline = await pg.evaluate(() => {
      const root = document.getElementById('zadbox-hero');
      root.setAttribute('data-fit', 'width'); root.style.height = '';
      document.body.style.height = 'auto';
      window.dispatchEvent(new Event('resize'));
      return root.getBoundingClientRect().height;
    });
    check('inline (data-fit="width") sets height from width', Math.abs(inline - 1440 * 720 / 1280) < 1, `height=${inline.toFixed(1)}px`);

    check('no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* 2. reduced motion: no autoplay, static poster, chapters still navigable */
  {
    const { ctx, pg, errors } = await open(browser, { reducedMotion: 'reduce' });
    await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
    await wait(1500);
    const a = await api(pg, () => window.ZadboxHero.time); await wait(1000);
    const b = await api(pg, () => window.ZadboxHero.time);
    const paused = await pg.evaluate(() => document.getElementById('zadbox-hero').classList.contains('is-paused'));
    check('reduced motion: does not autoplay', a === b && paused, `t=${a}`);
    await pg.click('.zb-chapter[data-chapter="1"]'); await wait(100);
    const c = await api(pg, () => window.ZadboxHero.time);
    check('reduced motion: chapter shows its still frame', Math.abs(c - 15.8) < 0.01, `t=${c}`);
    check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* 3. seamless loop: last frame == first frame */
  {
    const { ctx, pg } = await open(browser);
    await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
    const end = await api(pg, () => window.ZadboxHero.loopDuration);
    await api(pg, () => window.ZadboxHero.renderLoopAt(0)); await wait(50);
    const A = await pg.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    await api(pg, (e) => window.ZadboxHero.renderLoopAt(e), end); await wait(50);
    const B = await pg.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    const diff = await pg.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const x = c.getContext('2d'); x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
      x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let changed = 0, max = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d > 8) changed++; if (d > max) max = d;
      }
      return { changed, max, total: da.length / 4 };
    }, [A.toString('base64'), B.toString('base64')]);
    check('loop is seamless (end frame matches start frame)', diff.changed / diff.total < 0.001, `${diff.changed} px differ (max Δ ${diff.max})`);
    await ctx.close();
  }

  /* 4. iframe embed pauses when scrolled out of view */
  {
    const host = path.join(path.dirname(FILE), '.qa-host.html');
    fs.writeFileSync(host, `<!doctype html><body style="margin:0"><div style="position:relative;width:100%;aspect-ratio:16/9"><iframe id="f" src="${path.basename(FILE)}" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div><div style="height:3000px"></div></body>`);
    const { ctx, pg } = await open(browser, { url: 'file://' + host });
    const frame = await (await pg.$('#f')).contentFrame();
    await frame.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
    await wait(2500);
    const t0 = await frame.evaluate(() => window.ZadboxHero.time);
    await pg.evaluate(() => window.scrollTo(0, 2500)); await wait(600);
    const t1 = await frame.evaluate(() => window.ZadboxHero.time); await wait(1000);
    const t2 = await frame.evaluate(() => window.ZadboxHero.time);
    check('iframe embed plays', t0 > 0.5, `t=${t0.toFixed(2)}`);
    check('pauses when scrolled out of view', Math.abs(t2 - t1) < 0.001, `Δt=${(t2 - t1).toFixed(3)}`);
    await pg.evaluate(() => window.scrollTo(0, 0)); await wait(700);
    const t3 = await frame.evaluate(() => window.ZadboxHero.time);
    check('resumes when scrolled back', t3 > t2 + 0.2, `t=${t3.toFixed(2)}`);
    await ctx.close();
    fs.unlinkSync(host);
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
