#!/usr/bin/env node
/*
 * Soundtrack pipeline:
 *   1. export the animation's sound cues from dist/zadbox-animation.html
 *   2. compose music + SFX on those cues   (tools/audio/compose.py, numpy)
 *   3. master to -14 LUFS / -1 dBTP         (ffmpeg loudnorm, two-pass)
 *   4. mux into the MP4s (video stream copied, not re-encoded)
 * Usage: node tools/render-audio.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CUES = path.join(__dirname, 'audio/cues.json');
const TRACK = path.join(DIST, 'zadbox-animation-soundtrack.m4a');
const VIDEOS = ['zadbox-animation-landscape.mp4', 'zadbox-animation-portrait.mp4'].map((f) => path.join(DIST, f));
const TARGET = { I: -14, TP: -1.0, LRA: 11 };

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
/* ffmpeg prints analysis (loudnorm JSON) on stderr, also on success */
const runErr = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
  return r.stderr;
};

(async () => {
  /* 1. cues */
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.goto('file://' + path.join(DIST, 'zadbox-animation.html'));
  await pg.waitForFunction(() => window.ZadboxHero && window.ZadboxHero.isReady);
  const info = await pg.evaluate(() => ({ duration: window.ZadboxHero.duration, handoff: window.ZadboxHero.handoff, cues: window.ZadboxHero.cues }));
  await browser.close();
  fs.writeFileSync(CUES, JSON.stringify(info, null, 1));
  console.log(`cues: ${info.cues.length} events over ${info.duration}s`);

  /* 2. compose */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zb-audio-'));
  const raw = path.join(tmp, 'raw.wav');
  console.log(run('python3', ['-I', path.join(__dirname, 'audio/compose.py'), CUES, raw]).trim());

  /* 3. loudness: measure, then normalise linearly */
  const af1 = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`;
  const log = runErr('ffmpeg', ['-hide_banner', '-nostats', '-i', raw, '-af', af1, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const af2 = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', af2, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', TRACK]);
  console.log(`soundtrack → ${path.relative(process.cwd(), TRACK)} (measured ${m.input_i} LUFS → ${TARGET.I})`);

  /* 4. mux */
  for (const v of VIDEOS) {
    if (!fs.existsSync(v)) { console.log(`skip ${path.basename(v)} (render it first)`); continue; }
    const out = path.join(tmp, path.basename(v));
    run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', v, '-i', TRACK, '-map', '0:v:0', '-map', '1:a:0',
      '-c', 'copy', '-shortest', '-movflags', '+faststart', out]);
    fs.copyFileSync(out, v);
    console.log(`muxed → ${path.relative(process.cwd(), v)}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
