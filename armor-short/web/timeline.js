// The edit decision list: every beat of the short, as data. Visual FX hits,
// background explosions and the audio cue sheet all come from here, so the
// picture and the sound design stay frame-locked.
import { eOutQuart, prog } from './util.js';

const GROUND = -2.2;

// Local times inside each piece's 4 s slot.
export const L = {
  impact: 0.5, // piece lands in the center
  label: 0.62, // name slams in
  scan0: 0.95, // green scan sweeps up...
  scan1: 1.4, // ...and locks
  count0: 1.45, // price counts 1 -> price
  count1: 3.0, // price lands (ka-ching)
  exit0: 3.62, // whip out to the right
};
// Local times inside the outro.
export const O = { land0: 0.1, landStep: 0.1, title: 0.55, count0: 0.65, count1: 2.5, cta: 3.1, final: 4.5 };

export const countValue = (price, p) => 1 + (price - 1) * eOutQuart(p);

export function buildTimeline(cfg) {
  const pieces = cfg.pieces.map((p, i) => ({ ...p, i, t0: cfg.intro + i * cfg.pieceDuration }));
  const outroStart = cfg.intro + pieces.length * cfg.pieceDuration;
  const duration = outroStart + cfg.outro;
  const total = pieces.reduce((s, p) => s + p.price, 0);
  const fps = cfg.fps;

  const hits = [];
  const audio = [];
  const explosions = [];
  const tankShots = [];
  let seed = 1;
  const hit = (t, o) => hits.push({ t, decay: 9, ...o });
  const sfx = (t, type, o = {}) => audio.push({ t, type, ...o });
  const boom = (t, x, z, size, near = false) => {
    explosions.push({ t, pos: [x, GROUND, z], size, seed: (seed += 3.17) });
    sfx(t, 'explosion', { size, pan: Math.max(-1, Math.min(1, x / 14)), near });
  };
  // Price counter ticks: one per displayed-value change, max one per frame.
  const ticks = (t0, t1, price) => {
    let last = 1;
    for (let f = Math.ceil(t0 * fps); f <= Math.floor(t1 * fps); f++) {
      const t = f / fps;
      const v = Math.floor(countValue(price, prog(t, t0, t1)));
      if (v !== last) sfx(t, 'tick', { p: prog(t, t0, t1) });
      last = v;
    }
  };

  // ---- Hook / intro.
  boom(0.0, 1.8, -17, 7.5, true);
  hit(0.0, { shake: 1.2, flash: 0.65, flashCol: [1, 0.7, 0.4], invert: 1, zblur: 0.3, ca: 0.025, decay: 5 });
  [0.1, 0.6, 1.1].forEach((t, k) => {
    hit(t, { shake: 0.35 + k * 0.1, zoom: 0.05, ca: 0.01, flash: 0.12 });
    sfx(t, 'hit', { k });
  });
  boom(1.35, -8, -48, 5);
  tankShots.push(1.7);
  sfx(1.7, 'cannon', { pan: -0.3 });
  hit(1.7, { shake: 0.25, decay: 6 });
  sfx(1.2, 'riser', { dur: 1.3 });
  hit(2.12, { glitch: 1, ca: 0.02, decay: 7 });
  sfx(2.12, 'glitch');

  // ---- Armor pieces.
  pieces.forEach((p, i) => {
    const t0 = p.t0;
    sfx(t0 - 0.18, 'whoosh', { dur: 0.7, pan0: -1, pan1: 0 });
    hit(t0 + L.impact, { shake: 0.9, zoom: 0.11, ca: 0.02, flash: 0.22, flashCol: [1, 0.85, 0.65], zblur: 0.12, decay: 8 });
    sfx(t0 + L.impact, 'impact', { size: 1 });
    boom(t0 + L.impact + 0.02, i % 2 ? 7 : -6.5, -40 - (i % 3) * 6, 5.5);
    hit(t0 + L.label, { shake: 0.22, ca: 0.008 });
    sfx(t0 + L.label, 'slam');
    sfx(t0 + L.scan0, 'scan', { dur: L.scan1 - L.scan0 });
    hit(t0 + L.scan1, { flash: 0.32, flashCol: [0.2, 1, 0.4], ca: 0.01, zoom: 0.05 });
    sfx(t0 + L.scan1, 'lock');
    ticks(t0 + L.count0, t0 + L.count1, p.price);
    hit(t0 + L.count1, { zoom: 0.1, shake: 0.4, flash: 0.38, flashCol: [0.25, 1, 0.45], zblur: 0.1 });
    sfx(t0 + L.count1, 'kaching', { size: 1 });
    if (i % 2 === 0) {
      tankShots.push(t0 + 2.15);
      sfx(t0 + 2.15, 'cannon', { pan: -0.3 });
      hit(t0 + 2.15, { shake: 0.18, decay: 6 });
    } else {
      boom(t0 + 2.0, i % 4 === 1 ? 10 : -12, -58, 4.5);
    }
    sfx(t0 + L.exit0 - 0.05, 'whoosh', { dur: 0.5, pan0: 0, pan1: 1 });
    hit(t0 + 3.82, { glitch: 0.8, ca: 0.02, decay: 12 });
    sfx(t0 + 3.82, 'glitch');
  });

  // ---- Outro: full set + total.
  const oS = outroStart;
  sfx(oS - 0.12, 'whoosh', { dur: 0.75, pan0: -1, pan1: 0.2 });
  for (let j = 0; j < pieces.length; j++) {
    const t = oS + O.land0 + j * O.landStep;
    const last = j === pieces.length - 1;
    hit(t, last ? { shake: 1.0, zoom: 0.1, flash: 0.45, zblur: 0.15, ca: 0.02, decay: 7 } : { shake: 0.25, ca: 0.006 });
    sfx(t, last ? 'impact' : 'thud', { size: last ? 1.2 : 0.5 });
  }
  boom(oS + O.land0 + 4 * O.landStep, -5, -36, 6.5);
  hit(oS + O.title, { shake: 0.3, ca: 0.01 });
  sfx(oS + O.title, 'slam');
  ticks(oS + O.count0, oS + O.count1, total);
  sfx(oS + O.count0, 'riser', { dur: O.count1 - O.count0 });
  const k = oS + O.count1;
  hit(k, { shake: 1.3, zoom: 0.16, flash: 0.7, flashCol: [0.3, 1, 0.5], invert: 1, zblur: 0.3, ca: 0.03, decay: 5 });
  sfx(k, 'kaching', { size: 1.6 });
  sfx(k, 'impact', { size: 1.5 });
  boom(k + 0.02, -7.5, -30, 7, true);
  boom(k + 0.25, 9, -42, 6);
  hit(oS + O.cta, { shake: 0.45, ca: 0.012, zoom: 0.05 });
  sfx(oS + O.cta, 'stamp');
  hit(oS + O.final, { shake: 0.5, flash: 0.2, decay: 6 });
  boom(oS + O.final, 9, -50, 6);
  sfx(oS + O.final, 'impact', { size: 0.9 });

  audio.sort((a, b) => a.t - b.t);
  return {
    fps,
    duration,
    pieces,
    outroStart,
    total,
    hits,
    explosions: explosions.sort((a, b) => a.t - b.t),
    tankShots: tankShots.sort((a, b) => a - b),
    audio,
    // Music grid: downbeats land on the piece impacts.
    music: { bpm: cfg.bpm, origin: pieces[0].t0 + L.impact, dropAt: pieces[0].t0 + L.impact, end: duration },
  };
}
