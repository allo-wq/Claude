// Single source of truth for *when* things happen. Used by the renderer
// (browser) and by the soundtrack generator (via build/timeline.json), so
// picture and sound can never drift apart.
import { mulberry32 } from './util.js';

export function buildTimeline(cfg) {
  const beat = 60 / cfg.bpm;
  const B = cfg.beats;
  const t0 = B.hook * beat;
  const pieceLen = B.piece * beat;
  const IN = 0.34; // seconds a piece takes to fly in from the left
  const OUT = 0.3; // seconds it takes to leave

  const pieces = cfg.pieces.map((p, i) => {
    const T = t0 + i * pieceLen;
    return {
      ...p,
      index: i,
      T,
      enterStart: T - IN,
      land: T, // slams into centre on the downbeat
      sweepStart: T + 1 * beat, // green scan runs bottom -> top
      sweepEnd: T + 2 * beat,
      countStart: T + 2 * beat, // price runs 1 -> price
      countEnd: T + 4 * beat,
      slam: T + 4 * beat, // final price lands
      exitStart: T + pieceLen - IN - 0.05,
      exitEnd: T + pieceLen - IN - 0.05 + OUT,
      end: T + pieceLen,
    };
  });

  const Tf = t0 + pieces.length * pieceLen;
  const total = pieces.reduce((s, p) => s + p.price, 0);
  const finale = {
    T: Tf,
    total,
    lands: pieces.map((_, k) => Tf + k * 0.5 * beat),
    flyIn: 0.28,
    sweepStart: Tf + 3 * beat,
    sweepEnd: Tf + 4 * beat,
    countStart: Tf + 4 * beat,
    countEnd: Tf + 8 * beat,
    slam: Tf + 8 * beat,
    end: Tf + B.finale * beat,
  };
  const duration = finale.end;

  // Hook words land on beats 0, 1, 2 and get wiped as the first piece arrives.
  const hook = {
    lines: cfg.hook.map((text, i) => ({ text, t: -0.06 + i * beat })), // first word is already landing on frame 0
    out: t0 - IN - 0.1,
  };

  // ---- Background battlefield events -------------------------------------
  const rnd = mulberry32(1337);
  const explosions = [];
  const addEx = (t, x, y, z, size) => explosions.push({ t, x, y, z, size, seed: rnd() * 100 });

  addEx(-0.1, -7, 2, -62, 1.6); // already blooming on frame 0
  addEx(beat * 2, 16, 1, -55, 1.1);
  pieces.forEach((p, i) => {
    const s = i % 2 ? 1 : -1;
    addEx(p.land, s * (15 + rnd() * 8), 0.5, -46 - rnd() * 14, 1.25); // on impact
    addEx(p.slam, -s * (9 + rnd() * 7), 1.5, -62 - rnd() * 18, 1.6); // on price slam
    addEx(p.T + 6 * beat + rnd() * 0.2, s * (30 + rnd() * 20), 1, -90 - rnd() * 30, 1.0);
  });
  finale.lands.forEach((t, k) => addEx(t, (k % 2 ? 1 : -1) * (12 + k * 5), 1, -55 - k * 6, 0.9));
  addEx(finale.slam, -13, 2, -58, 1.7);
  addEx(finale.slam + 0.12, 15, 2, -66, 1.5);
  addEx(finale.slam + beat * 2, 30, 1, -80, 1.3);
  addEx(finale.slam + beat * 4, -28, 1, -85, 1.2);
  explosions.sort((a, b) => a.t - b.t);

  const tracers = [];
  const addTr = (t, fromLeft, n) =>
    tracers.push({
      t,
      n,
      interval: 0.06,
      x: fromLeft ? -90 - rnd() * 30 : 90 + rnd() * 30,
      y: 1 + rnd() * 6,
      z: -70 - rnd() * 50,
      dir: fromLeft ? 1 : -1,
      elev: 0.1 + rnd() * 0.28,
      seed: rnd() * 100,
    });
  addTr(0.5, true, 9);
  addTr(1.1, false, 7);
  pieces.forEach((p, i) => {
    addTr(p.countStart, i % 2 === 0, 9);
    addTr(p.T + 5.5 * beat, i % 2 === 1, 7);
  });
  addTr(finale.T + beat, true, 9);
  addTr(finale.countStart, false, 10);
  addTr(finale.countStart + beat * 2, true, 10);
  addTr(finale.slam + beat, false, 9);
  addTr(finale.slam + beat * 3, true, 9);

  const flak = [];
  for (let t = 0.2; t < duration; t += 0.18 + rnd() * 0.5) {
    flak.push({ t, x: (rnd() - 0.5) * 220, y: 22 + rnd() * 55, z: -120 - rnd() * 80, s: 0.6 + rnd() });
  }

  const jets = [
    { t: 0.25, dir: 1, y: 30, z: -105 },
    { t: pieces[2].slam - 0.35, dir: -1, y: 36, z: -120 },
    { t: finale.slam - 0.3, dir: 1, y: 27, z: -95 },
  ];

  // ---- Hard cuts (used for the glitch / RGB-split burst on every cut) ----
  const cuts = [];
  pieces.forEach((p) => cuts.push(p.sweepStart, p.sweepEnd));
  cuts.push(finale.sweepStart, finale.sweepEnd);

  return { beat, t0, duration, pieces, finale, hook, explosions, tracers, flak, jets, cuts, IN, OUT };
}
