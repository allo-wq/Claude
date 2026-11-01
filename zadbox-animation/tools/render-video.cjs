#!/usr/bin/env node
/*
 * Frame-accurate MP4 export: seeks the timeline to every frame and pipes
 * screenshots into ffmpeg, so motion is perfectly smooth on any machine.
 * Usage: node tools/render-video.cjs <landscape|portrait> [fps] [out.mp4] [seconds]
 */
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const layout = process.argv[2] || 'landscape';
const fps = Number(process.argv[3] || 60);
const out = path.resolve(process.argv[4] || path.join(__dirname, `../dist/zadbox-animation-${layout}.mp4`));
const limit = process.argv[5] ? Number(process.argv[5]) : null;
const PAGE = 'file://' + path.resolve(__dirname, '../dist/zadbox-animation.html');
const VIEW = {
  landscape: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 },   // 1920×1080
  portrait: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 }        // 1080×1920
}[layout];
if (!VIEW) throw new Error('layout must be landscape or portrait');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VIEW);
  const pg = await ctx.newPage();
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
  await pg.evaluate(() => {
    document.getElementById('zadbox-hero').setAttribute('data-mode', 'video');
    window.dispatchEvent(new Event('resize'));
  });
  const duration = limit || await pg.evaluate(() => window.ZadboxHero.duration);
  const frames = Math.round(duration * fps);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));

  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await pg.evaluate((t) => window.ZadboxHero.renderAt(t), i / fps);
    const buf = await pg.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 2) === 0) process.stdout.write(`\r${layout}: frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log(`\r${layout}: ${frames} frames @ ${fps}fps → ${path.relative(process.cwd(), out)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
