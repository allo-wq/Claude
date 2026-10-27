'use strict';
// World state, the spawn director, collisions and the render pipeline.

const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const Settings = {
  shake: store.get('shake', !reducedMotion),
  autoAim: store.get('autoAim', false),
};

const params = new URLSearchParams(location.search);
const DEBUG = {
  depth: Number(params.get('depth')) || 0,
  level: Number(params.get('level')) || 0,
  god: params.has('god'),
  bot: params.has('bot'),
};

// ---- The ocean, top to bottom ----
const BOTTOM = 10935;
const ZONES = [
  { from: 0, name: 'The Sunlight Zone', sci: 'Epipelagic', line: 'Sunlight still reaches this far. So do the hunters.' },
  { from: 200, name: 'The Twilight Zone', sci: 'Mesopelagic', line: 'The last of the sunlight. Most animals here make their own.' },
  { from: 1000, name: 'The Midnight Zone', sci: 'Bathypelagic', line: 'No sunlight at all. Every light down here is alive.' },
  { from: 4000, name: 'The Abyss', sci: 'Abyssopelagic', line: 'Near freezing, in total dark, under 400 atmospheres.' },
  { from: 6000, name: 'The Trenches', sci: 'Hadopelagic', line: 'Deeper than Mount Everest is tall.' },
];
const BOSS_AT = [
  { depth: 995, kind: 'angler' },
  { depth: 3995, kind: 'squid' },
  { depth: 5995, kind: 'oarfish' },
  { depth: BOTTOM, kind: 'maw' },
];
const BG_TOP = [[0, [34, 124, 146]], [200, [14, 74, 96]], [1000, [6, 36, 50]], [4000, [4, 21, 31]], [6000, [9, 13, 28]], [BOTTOM, [12, 7, 22]]];
const BG_BOT = [[0, [9, 56, 78]], [200, [5, 36, 54]], [1000, [3, 18, 28]], [4000, [2, 10, 17]], [6000, [3, 5, 14]], [BOTTOM, [3, 2, 9]]];
const DARKNESS = [[0, 0], [120, 0.1], [400, 0.42], [1000, 0.62], [4000, 0.76], [6000, 0.84], [BOTTOM, 0.88]];
const DARK_RGB = [[0, [2, 22, 32]], [1000, [1, 9, 15]], [6000, [3, 3, 10]], [BOTTOM, [3, 1, 7]]];
const TEMP = [[0, 21], [200, 14], [1000, 4.5], [4000, 2], [6000, 1.6], [BOTTOM, 2.4]];
const pressureAtm = d => 1 + d / 10.06;
const zoneIndex = d => { let z = 0; for (let i = 0; i < ZONES.length; i++) if (d >= ZONES[i].from) z = i; return z; };

const SPAWNS = [
  { type: 'jelly', from: 0, w: d => lerp(10, 4, clamp(d / 6000, 0, 1)) },
  { type: 'krill', from: 120, w: () => 4, school: true },
  { type: 'needle', from: 380, w: () => 4.5 },
  { type: 'spitter', from: 750, w: () => 3.5 },
  { type: 'isopod', from: 1500, w: () => 3.2 },
  { type: 'gulper', from: 2500, w: () => 2 },
  { type: 'eel', from: 4200, w: () => 2.6 },
  { type: 'viper', from: 6100, w: () => 3.5 },
];

// ---- View ----
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 1, h: 1, dpr: 1, scale: 1, base: 1, zoom: 1 };
const cam = { x: 0, y: 0, px: 0, py: 0 };
const darkLayer = document.createElement('canvas');
const dctx = darkLayer.getContext('2d');
let vignette = null, hurtVignette = null;
const snow = { far: [], near: [] };

function makeVignette(color, inner, alpha) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 128 * inner, 128, 128, 182);
  grd.addColorStop(0, `rgba(${color},0)`);
  grd.addColorStop(1, `rgba(${color},${alpha})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return c;
}

function resize() {
  view.w = Math.max(1, window.innerWidth);
  view.h = Math.max(1, window.innerHeight);
  const raw = Math.min(window.devicePixelRatio || 1, 2);
  view.dpr = Math.max(1, Math.min(raw, Math.sqrt(3200000 / (view.w * view.h))));
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  view.base = clamp(Math.sqrt(view.w * view.h / (1100 * 660)), 0.75, 1.6);
  view.scale = view.base * view.zoom;
  darkLayer.width = Math.ceil(view.w / 4);
  darkLayer.height = Math.ceil(view.h / 4);
  if (!vignette) {
    vignette = makeVignette('0,4,8', 0.45, 0.7);
    hurtVignette = makeVignette('255,30,70', 0.35, 0.85);
  }
  initSnow();
}

const screenToWorld = (sx, sy) => [(sx - view.w / 2) / view.scale + cam.x, (sy - view.h / 2) / view.scale + cam.y];
const spawnRadius = () => Math.hypot(view.w, view.h) / 2 / view.scale + 70;
function onScreen(x, y, pad) {
  const hw = view.w / 2 / view.scale + pad, hh = view.h / 2 / view.scale + pad;
  return x > cam.x - hw && x < cam.x + hw && y > cam.y - hh && y < cam.y + hh;
}

// ---- State ----
const G = {
  state: 'title', player: null, attract: true, god: false,
  enemies: [], boss: null, bolts: [], ebullets: [], pickups: [], tele: [], inks: [], beams: [],
  time: 0, depth: 0, descent: 0, zone: 0, bossIdx: 0, bossesBeaten: 0,
  kills: 0, score: 0, combo: 0, comboT: 0, mult: 1, bestCombo: 0,
  level: 1, xp: 0, xpNext: 10, pending: 0, pendingPearls: 0,
  flare: 0, flareLight: 0, lightMul: 1, hpMul: 1, spdMul: 1,
  uid: 0, stamp: 0, hitstop: 0, slowT: 0, resumeT: 0, deathT: 0, endT: 0, leashT: 0,
  director: null, won: false,
};
const grid = new Grid(80);
const GRID_PAD = 44;
const tmp = [], tmp2 = [], orbPts = [], frameLights = [];

const xpFor = l => Math.floor(5 + l * 3.6 + l * l * 0.3);
function updateScaling() {
  const k = G.depth / 1000;
  G.hpMul = 1 + k * 0.45 + k * k * 0.015;
  G.spdMul = 1 + Math.min(0.3, G.depth / 30000);
}

function resetRun(attract) {
  for (const k of ['enemies', 'bolts', 'ebullets', 'pickups', 'tele', 'inks', 'beams']) G[k].length = 0;
  FX.reset();
  G.player = createPlayer();
  G.attract = attract;
  G.god = attract || DEBUG.god;
  G.boss = null;
  G.time = 0; G.depth = attract ? 2600 : DEBUG.depth; G.descent = 0;
  G.zone = zoneIndex(G.depth);
  G.bossIdx = attract ? BOSS_AT.length : BOSS_AT.findIndex(b => b.depth > G.depth - 1);
  if (G.bossIdx < 0) G.bossIdx = BOSS_AT.length;
  G.bossesBeaten = 0;
  G.kills = 0; G.score = 0; G.combo = 0; G.comboT = 0; G.mult = 1; G.bestCombo = 0;
  G.level = 1; G.xp = 0; G.xpNext = xpFor(1); G.pending = 0; G.pendingPearls = 0;
  G.flare = 0; G.flareLight = 0; G.lightMul = 1; G.flareHinted = false;
  G.hitstop = 0; G.slowT = 0; G.resumeT = 0; G.deathT = 0; G.endT = 0; G.won = false;
  G.director = { credit: 0, next: null, eventT: 30 };
  cam.x = cam.px = 0; cam.y = cam.py = 0;
  updateScaling();
  Sound.setZone(G.zone);
  Sound.setIntensity(0);
  if (!attract && DEBUG.level) {
    for (let i = 1; i < DEBUG.level; i++) { const c = rollChoices(false); applyUpgrade(pick(c)); G.level++; }
    G.xpNext = xpFor(G.level);
  }
}

// ---- Queries ----
function nearestTarget(x, y, R) {
  let best = null, bd = R * R;
  grid.query(x, y, R, tmp2);
  for (const h of tmp2) {
    const e = h.owner || h;
    if (e.dead) continue;
    const d2 = dist2(x, y, h.x, h.y);
    if (d2 < bd) { bd = d2; best = h; }
  }
  const b = G.boss;
  if (b && !b.dying) {
    for (const h of b.hit) {
      const d2 = dist2(x, y, h.x, h.y) - h.r * h.r;
      if (d2 < bd) { bd = d2; best = h; }
    }
  }
  return best;
}

// Calls fn once per enemy (not per segment) whose hitbox touches the circle.
function forEachEnemyNear(x, y, R, fn) {
  const stamp = ++G.stamp;
  grid.query(x, y, R + GRID_PAD, tmp2);
  const found = tmp2.slice();
  for (const h of found) {
    const e = h.owner || h;
    if (e.dead || e._s === stamp) continue;
    const rr = R + h.r;
    if (dist2(x, y, h.x, h.y) > rr * rr) continue;
    e._s = stamp;
    fn(h);
  }
  const b = G.boss;
  if (b && !b.dying) {
    for (const h of b.hit) {
      const rr = R + h.r;
      if (dist2(x, y, h.x, h.y) < rr * rr) { fn(h); break; }
    }
  }
}

// ---- Damage, death, drops ----
function damageEnemy(h, amount, opt = {}) {
  const e = h.owner || h;
  if (e.dead || e.dying) return 0;
  let crit = false;
  if (opt.crit !== false && Math.random() < G.player.st.crit) { crit = true; amount *= 2.2; }
  if (h.mul) amount *= h.mul;
  if (e.boss && e.state === 'enter') amount *= 0.5;
  e.hp -= amount;
  if (e.flash < (e.boss ? -0.16 : -0.03)) e.flash = e.boss ? 0.04 : 0.06;
  if (crit) floatText(h.x + rand(-8, 8), h.y - h.r - 8, fmtInt(amount), '255,226,140', 13 + Math.min(7, amount / 60));
  if (e.hp <= 0) { if (e.boss) killBoss(e); else killEnemy(e); }
  return amount;
}

function killEnemy(e) {
  e.dead = true;
  const P = G.player;
  if (!G.attract) {
    G.kills++;
    G.combo++; G.comboT = 2.4;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    G.mult = 1 + Math.min(8, Math.floor(G.combo / 15)) * 0.5;
    G.score += e.score * G.mult;
    G.flare = Math.min(100, G.flare + (1.1 + e.xp * 0.45) * P.st.flareGain);
    if (G.flare >= 100 && !G.flareHinted) {
      G.flareHinted = true;
      UI.toast(Input.mode === 'touch' ? 'Flare charged. Tap Flare' : Input.mode === 'pad' ? 'Flare charged. Press B' : 'Flare charged. Press E');
    }
  }
  const big = e.r > 25 || e.elite;
  burst(e.x, e.y, e.T.color, big ? 26 : 9, big ? 420 : 240, big ? 4 : 3, big ? 0.8 : 0.5);
  for (let i = 0; i < (big ? 8 : 3); i++) particle(PK.DEBRIS, e.x, e.y, rand(-120, 120), rand(-120, 120), rand(0.4, 0.9), rand(2, 4), '150,130,150', 3);
  if (e.segs) for (const s of e.segs) burst(s.x, s.y, e.T.color, 2, 160, 3, 0.5);
  flashLight(e.x, e.y, big ? 220 : 110, 0.22);
  Sound.kill(big);
  if (big) shake(0.18);
  dropXp(e.x, e.y, e.xp * (1 + G.depth / 3000));
  if (e.elite) dropPickup('pearl', e.x, e.y);
  else if (chance(P.st.siphon)) dropPickup('heart', e.x, e.y);
  if (e.T.onDeath) e.T.onDeath(e);
}

function killBoss(b) {
  b.dying = true; b.deathT = 0; b.hp = 0;
  G.slowT = 1.6;
  Sound.roar();
  shake(0.7);
  for (const t of G.tele) if (t.owner === b) t.dead = true;
  for (const bm of G.beams) bm.dead = true;
  for (const eb of G.ebullets) { eb.dead = true; particle(PK.SPARK, eb.x, eb.y, 0, 0, 0.5, 3, eb.color, 2); }
}

function finishBoss(b) {
  G.boss = null;
  G.bossesBeaten++;
  G.lightMul = 1;
  Sound.bossDie();
  Sound.setIntensity(0);
  FX.white = 0.9;
  shake(0.9);
  burst(b.x, b.y, b.B.color, 80, 720, 5, 1.3);
  burst(b.x, b.y, '255,255,240', 30, 400, 4, 1);
  ring(b.x, b.y, 700, '255,255,240', 1.3, 8);
  flashLight(b.x, b.y, 900, 1.2);
  G.score += 5000 * G.bossesBeaten;
  floatText(b.x, b.y - b.r - 20, `+${fmtInt(5000 * G.bossesBeaten)}`, '255,226,140', 22);
  for (let i = 0; i < 24; i++) dropXp(b.x + rand(-b.r, b.r), b.y + rand(-b.r, b.r), 3 + G.bossesBeaten * 2);
  dropPickup('heart', b.x - 20, b.y);
  dropPickup('heart', b.x + 20, b.y);
  dropPickup('pearl', b.x, b.y + 20);
  for (const p of G.pickups) p.vac = true;
  if (b.kind === 'maw') {
    G.won = true; G.endT = 3.2;
    for (const e of G.enemies) if (!e.dead) killEnemy(e);
    Sound.victory();
  } else {
    UI.toast(`${b.name} defeated`);
  }
}

function dropXp(x, y, v) {
  let left = Math.round(v);
  while (left > 0) {
    const part = left > 12 ? 5 : left > 4 ? Math.ceil(left / 2) : left;
    left -= part;
    if (G.pickups.length > 420) {
      const other = G.pickups[(Math.random() * G.pickups.length) | 0];
      if (other.kind === 'xp') { other.v += part; continue; }
    }
    const a = rand(TAU), s = rand(30, 110);
    G.pickups.push({ kind: 'xp', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: part, t: 0, spd: 0, pull: false, vac: false, dead: false });
  }
}
function dropPickup(kind, x, y) {
  const a = rand(TAU);
  G.pickups.push({ kind, x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, v: 0, t: 0, spd: 0, pull: false, vac: false, dead: false });
}

function gainXp(v) {
  G.xp += v;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = xpFor(G.level);
    G.pending++;
  }
}

function hurtPlayer(sx, sy, cause = 'hit') {
  const P = G.player;
  if (P.inv > 0 || P.dead || G.won) return;
  G.lastCause = cause;
  if (G.god) { P.inv = 0.5; return; }
  P.hp -= 1;
  P.inv = 1.35;
  G.combo = 0; G.comboT = 0; G.mult = 1;
  const a = angleTo(sx, sy, P.x, P.y);
  P.vx += Math.cos(a) * 420; P.vy += Math.sin(a) * 420;
  FX.hurt = 1;
  shake(0.55);
  G.hitstop = 0.09;
  Sound.hurt();
  burst(P.x, P.y, PLAYER_COLOR, 18, 320, 3, 0.6);
  bubbles(P.x, P.y, 10, 10, 120);
  // A little mercy: clear nearby bullets and shove enemies back.
  for (const b of G.ebullets) if (dist2(b.x, b.y, P.x, P.y) < 150 * 150) b.dead = true;
  forEachEnemyNear(P.x, P.y, 170, h => {
    const e = h.owner || h;
    if (e.boss) return;
    const ea = angleTo(P.x, P.y, e.x, e.y);
    e.vx += Math.cos(ea) * 600 / e.mass; e.vy += Math.sin(ea) * 600 / e.mass;
  });
  if (P.hp <= 0) killPlayer();
}

function killPlayer() {
  const P = G.player;
  P.dead = true; P.hp = 0;
  G.state = 'dying'; G.deathT = 0;
  Sound.death();
  Sound.setIntensity(0);
  shake(0.8);
  burst(P.x, P.y, PLAYER_COLOR, 50, 520, 4, 1.3);
  bubbles(P.x, P.y, 24, 14, 160);
}

// ---- Director: spends a growing budget on enemies, plus periodic set pieces ----
function pickSpawn() {
  const d = G.depth;
  return weightedPick(SPAWNS, s => (d >= s.from ? s.w(d) * clamp((d - s.from) / 400 + 0.35, 0, 1) : 0));
}
function spawnPointNear(R) {
  const P = G.player;
  // Bias spawns toward where the player is heading so running away is not free.
  let a = rand(TAU);
  if (Math.hypot(P.vx, P.vy) > 80 && chance(0.4)) a = Math.atan2(P.vy, P.vx) + rand(-0.9, 0.9);
  return [P.x + Math.cos(a) * R, P.y + Math.sin(a) * R];
}
function doSpawn(entry) {
  const [x, y] = spawnPointNear(spawnRadius());
  if (entry.school) {
    const n = randInt(7, 11) + Math.floor(G.depth / 2000);
    for (let i = 0; i < n; i++) spawnEnemy('krill', x + rand(-50, 50), y + rand(-50, 50));
    return;
  }
  spawnEnemy(entry.type, x, y, { elite: !G.attract && chance(0.004 + G.depth / 150000) });
}
function directorUpdate(dt) {
  const D = G.director, d = G.depth;
  if (G.attract) {
    D.credit += dt * 1.2;
    if (D.credit > 1 && G.enemies.length < 22) { D.credit = 0; doSpawn(pick([SPAWNS[0], SPAWNS[0], SPAWNS[1], SPAWNS[2], SPAWNS[3]])); }
    return;
  }
  if (G.won) return;
  const rate = (2 + d / 1000 * 0.42 + G.time / 240) * (G.boss ? 0.2 : 1);
  D.credit = Math.min(D.credit + rate * dt, 25);
  const cap = Math.min(230, 55 + d / 40);
  for (let n = 0; n < 4; n++) {
    if (!D.next) D.next = pickSpawn();
    const cost = D.next.school ? ENEMIES.krill.cost * 9 : ENEMIES[D.next.type].cost;
    if (D.credit < cost || G.enemies.length >= cap) break;
    doSpawn(D.next);
    D.credit -= cost;
    D.next = null;
  }
  if (!G.boss) {
    D.eventT -= dt;
    if (D.eventT <= 0) { D.eventT = rand(28, 40); runEvent(); }
  }
}
function runEvent() {
  const d = G.depth, P = G.player, R = spawnRadius();
  const options = ['bloom'];
  if (d > 150) options.push('school');
  if (d > 500) options.push('ambush');
  if (d > 1200) options.push('elite', 'elite');
  const ev = pick(options);
  if (ev === 'bloom') {
    const n = Math.floor(16 + d / 450);
    for (let i = 0; i < n; i++) { const a = i / n * TAU; spawnEnemy('jelly', P.x + Math.cos(a) * R * 0.85, P.y + Math.sin(a) * R * 0.85); }
    UI.toast('A bloom of jellies closes in');
  } else if (ev === 'school') {
    const base = rand(TAU);
    for (let k = 0; k < 3; k++) {
      const a = base + (k - 1) * 0.35, cx = P.x + Math.cos(a) * R, cy = P.y + Math.sin(a) * R;
      for (let i = 0; i < 10; i++) spawnEnemy('krill', cx + rand(-45, 45), cy + rand(-45, 45));
    }
    UI.toast('A krill swarm is coming through');
  } else if (ev === 'ambush') {
    const n = 4 + Math.floor(d / 2500);
    for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(0.3); const e = spawnEnemy('needle', P.x + Math.cos(a) * 420, P.y + Math.sin(a) * 420); e.st = 0.2; }
    UI.toast('Needlefish ambush');
  } else {
    const types = SPAWNS.filter(s => s.from <= d && !s.school);
    const s = weightedPick(types, t => t.from + 400);
    const [x, y] = spawnPointNear(R);
    spawnEnemy(s.type, x, y, { elite: true });
    UI.toast('Something golden glints in the dark');
  }
}

function updateDepth(dt) {
  if (G.attract || G.boss || G.won) { G.descent = 0; return; }
  G.descent = 18 + G.depth / 800;
  G.depth += G.descent * dt;
  const next = BOSS_AT[G.bossIdx];
  if (next && G.depth >= next.depth) {
    G.depth = next.depth;
    G.descent = 0;
    G.bossIdx++;
    const b = spawnBoss(next.kind);
    UI.bossWarning(b);
    const seen = store.get('seen', []);
    if (!seen.includes(next.kind)) { seen.push(next.kind); store.set('seen', seen); }
    Sound.sonar(true);
    Sound.roar();
    Sound.setIntensity(1);
  }
  const z = zoneIndex(G.depth);
  if (z !== G.zone) {
    G.zone = z;
    UI.zoneBanner(ZONES[z]);
    Sound.setZone(z);
    Sound.sonar(false);
  }
  updateScaling();
}

// ---- Simulation step ----
function stepWorld(dt, inp) {
  const P = G.player;
  G.time += dt;
  if (!P.dead) updatePlayer(P, inp, dt);
  directorUpdate(dt);
  updateDepth(dt);

  for (const e of G.enemies) {
    if (e.dead) continue;
    e.t += dt;
    e.flash = Math.max(-1, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;
    if (e.stun > 0) { e.stun -= dt; steer(e, 0, 0, 3, dt); }
    else e.T.update(e, dt);
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.T.after) e.T.after(e);
  }
  if (G.boss) updateBoss(G.boss, dt);

  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    grid.insert(e);
    if (e.segs) for (const s of e.segs) grid.insert(s);
  }
  separateEnemies();
  updateBolts(dt);
  updateOrbs();
  updateInks(dt);
  updateEnemyBullets(dt);
  if (!P.dead) contactDamage();
  updatePickups(dt);
  updateTelegraphs(dt);
  updateBeams(dt);
  updateFX(dt);

  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; G.mult = 1; } }
  G.flareLight = Math.max(0, G.flareLight - dt * 0.45);

  G.leashT -= dt;
  if (G.leashT <= 0) {
    G.leashT = 0.5;
    const far = spawnRadius() * 1.7;
    for (const e of G.enemies) {
      if (e.dead || dist2(e.x, e.y, P.x, P.y) < far * far) continue;
      const [x, y] = spawnPointNear(spawnRadius());
      const dx = x - e.x, dy = y - e.y;
      e.x = x; e.y = y;
      if (e.segs) for (const s of e.segs) { s.x += dx; s.y += dy; }
    }
  }

  removeDead(G.enemies);
  removeDead(G.bolts);
  removeDead(G.ebullets);
  removeDead(G.pickups);
  removeDead(G.tele);
  removeDead(G.inks);
  removeDead(G.beams);
}

function separateEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    grid.query(e.x, e.y, e.r + GRID_PAD, tmp);
    for (const o of tmp) {
      if (o === e || o.owner || o.dead || o.id < e.id) continue;
      const dx = o.x - e.x, dy = o.y - e.y, rr = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5;
      const nx = dx / d, ny = dy / d, wt = e.mass / (e.mass + o.mass);
      e.x -= nx * push * (1 - wt); e.y -= ny * push * (1 - wt);
      o.x += nx * push * wt; o.y += ny * push * wt;
    }
  }
}

function hitWithBolt(b, h, e) {
  const P = G.player;
  damageEnemy(h, b.dmg);
  b.hits.push(e.boss ? -1 : e.id);
  if (!e.boss && !e.dead) { e.vx += b.vx * 0.07 / e.mass; e.vy += b.vy * 0.07 / e.mass; }
  particle(PK.SPARK, b.x, b.y, -b.vx * 0.1 + rand(-40, 40), -b.vy * 0.1 + rand(-40, 40), 0.18, 3, PLAYER_COLOR, 5);
  Sound.hit();
  if (P.st.chainP && chance(P.st.chainP)) chainFrom(h.x, h.y, e.boss ? -1 : e.id, b.dmg * 0.6, P.st.chainN);
  if (b.pierce-- <= 0) b.dead = true;
}

function chainFrom(x, y, firstId, dmg, n) {
  const pts = [x, y], used = [firstId];
  let cx = x, cy = y;
  const list = [];
  for (let k = 0; k < n; k++) {
    grid.query(cx, cy, 190, list);
    let best = null, bd = 190 * 190;
    for (const h of list) {
      const e = h.owner || h;
      if (e.dead || used.includes(e.id)) continue;
      const d2 = dist2(cx, cy, h.x, h.y);
      if (d2 < bd) { bd = d2; best = h; }
    }
    if (!best) break;
    used.push((best.owner || best).id);
    pts.push((cx + best.x) / 2 + rand(-16, 16), (cy + best.y) / 2 + rand(-16, 16), best.x, best.y);
    cx = best.x; cy = best.y;
    damageEnemy(best, dmg, { crit: false });
  }
  if (pts.length > 2) { zap(pts); Sound.zap(); }
}

function updateBolts(dt) {
  const P = G.player, homing = P.st.homing;
  for (const b of G.bolts) {
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (homing) {
      const t = nearestTarget(b.x, b.y, 230);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy);
        const a = turnToward(Math.atan2(b.vy, b.vx), angleTo(b.x, b.y, t.x, t.y), homing * dt);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    grid.query(b.x, b.y, b.r + GRID_PAD, tmp);
    for (const h of tmp) {
      const e = h.owner || h;
      if (e.dead || b.hits.includes(e.id)) continue;
      const rr = h.r + b.r;
      if (dist2(b.x, b.y, h.x, h.y) > rr * rr) continue;
      hitWithBolt(b, h, e);
      if (b.dead) break;
    }
    const boss = G.boss;
    if (!b.dead && boss && !boss.dying && !b.hits.includes(-1)) {
      for (const h of boss.hit) {
        const rr = h.r + b.r;
        if (dist2(b.x, b.y, h.x, h.y) < rr * rr) { hitWithBolt(b, h, boss); break; }
      }
    }
  }
}

function updateOrbs() {
  const P = G.player;
  if (!P.st.orbs || P.dead) return;
  orbPositions(P, orbPts);
  const dmg = P.st.dmg * 0.75, R = 11;
  for (let i = 0; i < orbPts.length; i += 2) {
    const ox = orbPts[i], oy = orbPts[i + 1];
    grid.query(ox, oy, R + GRID_PAD, tmp);
    for (const h of tmp) {
      const e = h.owner || h;
      if (e.dead || e.orbT > G.time) continue;
      const rr = h.r + R;
      if (dist2(ox, oy, h.x, h.y) > rr * rr) continue;
      e.orbT = G.time + 0.33;
      damageEnemy(h, dmg, { crit: false });
      burst(ox, oy, '170,255,190', 3, 120, 2.5, 0.3);
    }
    const boss = G.boss;
    if (boss && !boss.dying && boss.orbT <= G.time) {
      for (const h of boss.hit) {
        const rr = h.r + R;
        if (dist2(ox, oy, h.x, h.y) < rr * rr) { boss.orbT = G.time + 0.33; damageEnemy(h, dmg, { crit: false }); break; }
      }
    }
  }
}

function updateInks(dt) {
  for (const k of G.inks) {
    k.life -= dt;
    if (k.life <= 0) { k.dead = true; continue; }
    k.tick += dt;
    if (k.tick >= 0.2) {
      k.tick -= 0.2;
      forEachEnemyNear(k.x, k.y, k.r, h => {
        (h.owner || h).slow = 0.4;
        damageEnemy(h, k.dps * 0.2, { crit: false });
      });
    }
  }
}

function updateEnemyBullets(dt) {
  const P = G.player;
  for (const b of G.ebullets) {
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (b.spin) {
      const a = Math.atan2(b.vy, b.vx) + b.spin * dt, s = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
    }
    if (b.acc) { const k = 1 + b.acc * dt; b.vx *= k; b.vy *= k; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (P.dead) continue;
    const d2 = dist2(b.x, b.y, P.x, P.y);
    const rr = b.r * 0.8 + P.hitR;
    if (d2 < rr * rr && P.inv <= 0) { b.dead = true; hurtPlayer(b.x, b.y, 'bullet'); }
    else if (d2 > 1800 * 1800) b.dead = true;
  }
}

function contactDamage() {
  const P = G.player;
  if (P.inv > 0) return;
  grid.query(P.x, P.y, P.hitR + GRID_PAD, tmp);
  for (const h of tmp) {
    const e = h.owner || h;
    if (e.dead || e.stun > 0) continue;
    const rr = h.r * 0.85 + P.hitR;
    if (dist2(P.x, P.y, h.x, h.y) < rr * rr) { hurtPlayer(h.x, h.y, e.type); return; }
  }
  const b = G.boss;
  if (b && !b.dying) {
    for (const h of b.hit) {
      const rr = h.r * 0.85 + P.hitR;
      if (dist2(P.x, P.y, h.x, h.y) < rr * rr) { hurtPlayer(h.x, h.y, b.kind); return; }
    }
  }
}

function updatePickups(dt) {
  const P = G.player, mag = P.st.magnet;
  for (const p of G.pickups) {
    p.t += dt;
    const d2 = dist2(p.x, p.y, P.x, P.y);
    if (!P.dead && (p.vac || d2 < mag * mag)) p.pull = true;
    if (p.pull && !P.dead) {
      p.spd = Math.min(1150, (p.spd || 120) + 1700 * dt);
      const a = angleTo(p.x, p.y, P.x, P.y);
      p.vx = Math.cos(a) * p.spd; p.vy = Math.sin(a) * p.spd;
    } else {
      const k = Math.exp(-3 * dt);
      p.vx *= k; p.vy *= k;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const pr = P.r + 10;
    if (!P.dead && dist2(p.x, p.y, P.x, P.y) < pr * pr) collect(p);
    else if (d2 > 2400 * 2400) p.dead = true;
  }
}

function collect(p) {
  const P = G.player;
  p.dead = true;
  if (p.kind === 'xp') {
    if (!G.attract) gainXp(p.v);
    Sound.pickup();
    particle(PK.SPARK, p.x, p.y, P.vx * 0.3, P.vy * 0.3, 0.2, 3, '255,210,110', 4);
  } else if (p.kind === 'heart') {
    if (P.hp < P.maxHp) healPlayer(1);
    else { G.score += 500; floatText(P.x, P.y - 24, '+500', '255,226,140', 14); Sound.pickup(); }
  } else if (p.kind === 'pearl') {
    G.pendingPearls++;
    Sound.pearl();
    floatText(P.x, P.y - 26, 'Pearl', '255,250,235', 16);
    ring(P.x, P.y, 80, '255,250,235', 0.5, 3);
  }
}

function updateTelegraphs(dt) {
  for (const t of G.tele) {
    if (t.dead) continue;
    if (t.owner && (t.owner.dead || t.owner.dying)) { t.dead = true; continue; }
    t.t += dt;
    if (t.t >= t.dur) { t.dead = true; if (t.onDone) t.onDone(); }
  }
}

function beamOrigin(bm) {
  const o = bm.owner;
  return [o.x, o.y - o.r * 0.45];
}
function updateBeams(dt) {
  const P = G.player;
  for (const bm of G.beams) {
    const o = bm.owner;
    if (o.dead || o.dying) { bm.dead = true; continue; }
    bm.t += dt;
    [bm.x, bm.y] = beamOrigin(bm);
    const toP = angleTo(bm.x, bm.y, P.x, P.y);
    if (bm.t < bm.warm) {
      if (!bm.spin) bm.ang = turnToward(bm.ang, toP, 1.4 * dt);
    } else {
      if (bm.spin) bm.ang += bm.spin * dt;
      else bm.ang = turnToward(bm.ang, toP, 0.5 * dt);
      Sound.beam();
      const ex = bm.x + Math.cos(bm.ang) * bm.len, ey = bm.y + Math.sin(bm.ang) * bm.len;
      if (!P.dead && distToSegment(P.x, P.y, bm.x, bm.y, ex, ey) < bm.w * 0.5 + P.hitR * 0.6) hurtPlayer(P.x - Math.cos(bm.ang), P.y - Math.sin(bm.ang), 'beam');
    }
    if (bm.t > bm.warm + bm.dur) bm.dead = true;
  }
}

function updateCamera(dt) {
  const P = G.player;
  let tx = P.x + Math.cos(P.aim) * 28 + P.vx * 0.12;
  let ty = P.y + Math.sin(P.aim) * 28 + P.vy * 0.12;
  // On the title screen, keep the demo fish clear of the text block.
  if (G.attract && view.w > 900) tx -= view.w * 0.2 / view.scale;
  else if (G.attract) ty += view.h * 0.24 / view.scale;
  cam.px = cam.x; cam.py = cam.y;
  view.zoom = damp(view.zoom, G.boss && !G.boss.dying ? 0.8 : 1, 1.5, dt);
  view.scale = view.base * view.zoom;
  cam.x = damp(cam.x, tx, 5, dt);
  cam.y = damp(cam.y, ty, 5, dt);
}

// ---- Marine snow: two parallax layers in screen space ----
function initSnow() {
  const area = view.w * view.h;
  const make = (n, s0, s1, a0, a1, v0, v1) => Array.from({ length: n }, () => ({
    x: rand(view.w), y: rand(view.h), s: rand(s0, s1), a: rand(a0, a1), sp: rand(v0, v1), ph: rand(TAU),
  }));
  snow.far = make(Math.round(area / 8000), 0.6, 1.7, 0.12, 0.42, 6, 18);
  snow.near = make(Math.round(area / 42000), 1.6, 3.2, 0.2, 0.5, 18, 36);
}
function updateSnow(dt) {
  const dx = (cam.x - cam.px) * view.scale, dy = (cam.y - cam.py) * view.scale;
  const rise = G.descent;
  const wrap = p => {
    if (p.x < -10) p.x += view.w + 20; else if (p.x > view.w + 10) p.x -= view.w + 20;
    if (p.y < -10) p.y += view.h + 20; else if (p.y > view.h + 10) p.y -= view.h + 20;
  };
  for (const p of snow.far) {
    p.x -= dx * 0.4 - Math.sin(FX.t * 0.7 + p.ph) * 5 * dt;
    p.y -= dy * 0.4 + (p.sp + rise * 0.5) * dt;
    wrap(p);
  }
  for (const p of snow.near) {
    p.x -= dx * 1.3;
    p.y -= dy * 1.3 + (p.sp + rise * 1.3) * dt;
    wrap(p);
  }
}

// ---- Rendering ----
function worldTransform() {
  const s = view.scale, d = view.dpr;
  ctx.setTransform(d * s, 0, 0, d * s, d * (view.w / 2 + FX.sx - cam.x * s), d * (view.h / 2 + FX.sy - cam.y * s));
}
function screenTransform() { ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); }

function drawBackground() {
  const w = view.w, h = view.h;
  const top = curve(BG_TOP, G.depth), bot = curve(BG_BOT, G.depth);
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, rgb(top));
  grd.addColorStop(1, rgb(bot));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  // Sun shafts fade out over the first few hundred metres.
  const sun = 1 - smoothstep(0, 450, G.depth);
  if (sun > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const base = ((i / 7) * (w + 400) - cam.x * view.scale * 0.08 + FX.t * 6) % (w + 400);
      const x = (base + w + 400) % (w + 400) - 200;
      const sway = Math.sin(FX.t * 0.3 + i * 1.7) * 30;
      const wTop = 30 + (i * 37) % 60, wBot = wTop * 3.2;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(190,240,230,${0.13 * sun})`);
      g.addColorStop(1, 'rgba(190,240,230,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + sway, 0); ctx.lineTo(x + sway + wTop, 0);
      ctx.lineTo(x + sway * 2 + wTop + h * 0.35 + wBot, h); ctx.lineTo(x + sway * 2 + h * 0.35, h);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawSnowFar() {
  ctx.fillStyle = 'rgb(205,232,238)';
  for (const p of snow.far) {
    ctx.globalAlpha = p.a;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
}
function drawSnowNear(darkA, lightR) {
  const P = G.player;
  const psx = (P.x - cam.x) * view.scale + view.w / 2, psy = (P.y - cam.y) * view.scale + view.h / 2;
  const R = lightR * view.scale;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of snow.near) {
    const lit = 1 - smoothstep(R * 0.4, R * 1.1, Math.hypot(p.x - psx, p.y - psy));
    const a = p.a * ((1 - darkA) + darkA * lit);
    if (a > 0.02) drawGlow(ctx, '215,240,245', p.x, p.y, p.s * 2.4, a);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function collectLights(L) {
  L.length = 0;
  const P = G.player;
  const deathK = P.dead ? Math.max(0, 1 - G.deathT / 1.6) : 1;
  L.push({ x: P.x, y: P.y, r: P.st.light * G.lightMul * deathK * (1 + Math.sin(FX.t * 3.1) * 0.015), i: 1 });
  for (let i = 0; i < G.bolts.length && i < 80; i++) L.push({ x: G.bolts[i].x, y: G.bolts[i].y, r: 75, i: 0.5 });
  for (const f of FX.flashes) { const k = f.life / f.max; L.push({ x: f.x, y: f.y, r: f.r * Math.sqrt(k), i: k }); }
  if (G.flareLight > 0) L.push({ x: P.x, y: P.y, r: 1500 * G.flareLight, i: G.flareLight });
  if (P.st.orbs && !P.dead) for (let i = 0; i < orbPts.length; i += 2) L.push({ x: orbPts[i], y: orbPts[i + 1], r: 55, i: 0.5 });
  if (G.boss && G.boss.B.lights) G.boss.B.lights(G.boss, L);
  for (const bm of G.beams) {
    if (bm.t < bm.warm) continue;
    for (let k = 1; k <= 6; k++) L.push({ x: bm.x + Math.cos(bm.ang) * k * 160, y: bm.y + Math.sin(bm.ang) * k * 160, r: 110, i: 0.6 });
  }
  return L;
}

function drawDarkness(alpha) {
  if (alpha < 0.01) return;
  const dw = darkLayer.width, dh = darkLayer.height, k = dw / view.w, s = view.scale * k;
  const c = curve(DARK_RGB, G.depth);
  dctx.globalCompositeOperation = 'source-over';
  dctx.globalAlpha = 1;
  dctx.clearRect(0, 0, dw, dh);
  dctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
  dctx.fillRect(0, 0, dw, dh);
  dctx.globalCompositeOperation = 'destination-out';
  const ox = (view.w / 2 + FX.sx) * k, oy = (view.h / 2 + FX.sy) * k;
  for (const L of frameLights) {
    const r = L.r * s;
    if (r < 1) continue;
    const x = ox + (L.x - cam.x) * s, y = oy + (L.y - cam.y) * s;
    if (x < -r || y < -r || x > dw + r || y > dh + r) continue;
    dctx.globalAlpha = Math.min(1, L.i);
    dctx.drawImage(LIGHT_SPRITE, x - r, y - r, r * 2, r * 2);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(darkLayer, 0, 0, dw, dh, 0, 0, view.w, view.h);
}

function drawEnemyBodies() {
  for (const e of G.enemies) {
    if (!onScreen(e.x, e.y, e.r * 3 + (e.segs ? 160 : 0))) continue;
    if (e.T.worldSpace) { e.T.draw(ctx, e); continue; }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.ang);
    e.T.draw(ctx, e);
    ctx.restore();
  }
}
function drawEnemyGlows() {
  for (const e of G.enemies) {
    if (!onScreen(e.x, e.y, e.r * 3 + (e.segs ? 160 : 0))) continue;
    if (e.elite) {
      drawGlow(ctx, ELITE_GLOW, e.x, e.y, e.r * 2.8, 0.4 + Math.sin(e.t * 4) * 0.1);
      for (let i = 0; i < 3; i++) {
        const a = e.t * 2 + i / 3 * TAU;
        drawGlow(ctx, ELITE_GLOW, e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5, 6, 0.9);
      }
    }
    if (e.T.worldSpace) { e.T.glow(ctx, e); continue; }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.ang);
    e.T.glow(ctx, e);
    ctx.restore();
    if (e.stun > 0) drawGlow(ctx, '220,240,255', e.x, e.y - e.r - 6, 6, 0.6);
  }
  ctx.globalAlpha = 1;
}

function drawInks() {
  for (const k of G.inks) {
    const a = Math.min(1, k.life / k.max * 2);
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#120a1c';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ox = Math.cos(k.seed + i * 2.1) * k.r * 0.3, oy = Math.sin(k.seed + i * 2.1) * k.r * 0.3;
      ctx.moveTo(k.x + ox + k.r * 0.75, k.y + oy);
      ctx.arc(k.x + ox, k.y + oy, k.r * 0.75, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBulletShadows() {
  // Dark rims keep bullets readable against bright shallow water.
  if (!G.ebullets.length) return;
  ctx.fillStyle = 'rgba(50,0,24,0.55)';
  ctx.beginPath();
  for (const b of G.ebullets) { ctx.moveTo(b.x + b.r * 1.15, b.y); ctx.arc(b.x, b.y, b.r * 1.15, 0, TAU); }
  ctx.fill();
}
function drawEnemyBullets() {
  for (const b of G.ebullets) drawGlow(ctx, b.color, b.x, b.y, b.r * 3.4, 0.95);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const b of G.ebullets) { ctx.moveTo(b.x + b.r * 0.55, b.y); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); }
  ctx.fill();
}
function drawBolts() {
  if (!G.bolts.length) return;
  const r = 2.6 + G.player.st.boltR * 0.35;
  for (const b of G.bolts) drawGlow(ctx, PLAYER_COLOR, b.x, b.y, r * 4.5, 0.35);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    for (const b of G.bolts) { ctx.moveTo(b.x - b.vx * 0.024, b.y - b.vy * 0.024); ctx.lineTo(b.x, b.y); }
  };
  path(); ctx.strokeStyle = 'rgba(140,250,230,0.7)'; ctx.lineWidth = r * 1.6; ctx.stroke();
  path(); ctx.strokeStyle = '#f2fffc'; ctx.lineWidth = r * 0.7; ctx.stroke();
}
function drawOrbs() {
  const P = G.player;
  if (!P.st.orbs || P.dead) return;
  for (let i = 0; i < orbPts.length; i += 2) {
    drawGlow(ctx, '170,255,190', orbPts[i], orbPts[i + 1], 24, 0.9);
    drawGlow(ctx, '255,255,255', orbPts[i], orbPts[i + 1], 6, 1);
  }
}
function drawPickupGlows() {
  for (const p of G.pickups) {
    if (!onScreen(p.x, p.y, 30)) continue;
    if (p.kind === 'xp') drawGlow(ctx, '255,205,110', p.x, p.y, 6 + Math.sqrt(p.v) * 2.6, 0.9);
    else if (p.kind === 'heart') drawGlow(ctx, '255,110,150', p.x, p.y, 26, 0.7);
    else drawGlow(ctx, '255,250,235', p.x, p.y, 34 + Math.sin(FX.t * 5) * 4, 0.8);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff6dc';
  ctx.beginPath();
  for (const p of G.pickups) if (p.kind === 'xp') { const s = 1.4 + Math.sqrt(p.v) * 0.5; ctx.rect(p.x - s / 2, p.y - s / 2, s, s); }
  ctx.fill();
}
function drawPickupIcons() {
  for (const p of G.pickups) {
    if (p.kind === 'heart') {
      const s = 7 + Math.sin(FX.t * 6 + p.t) * 0.8;
      ctx.fillStyle = '#ff5f86';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.9);
      ctx.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.6, p.y - s * 1.3, p.x, p.y - s * 0.4);
      ctx.bezierCurveTo(p.x + s * 0.6, p.y - s * 1.3, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s * 0.9);
      ctx.fill();
    } else if (p.kind === 'pearl') {
      const g = ctx.createRadialGradient(p.x - 2, p.y - 3, 1, p.x, p.y, 8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8cdb8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, TAU); ctx.fill();
    }
  }
}

function drawTelegraphs() {
  ctx.lineDashOffset = -FX.t * 50;
  for (const t of G.tele) {
    const k = clamp(t.t / t.dur, 0, 1);
    if (t.kind === 'line') {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.ang);
      ctx.fillStyle = `rgba(255,70,110,${0.08 + 0.1 * k})`;
      ctx.fillRect(0, -t.w / 2, t.len, t.w);
      ctx.fillStyle = `rgba(255,90,130,${0.14 + 0.14 * k})`;
      ctx.fillRect(0, -t.w / 2, t.len * k, t.w);
      ctx.strokeStyle = `rgba(255,130,160,${0.45 + 0.45 * k})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 9]);
      ctx.beginPath();
      ctx.moveTo(0, -t.w / 2); ctx.lineTo(t.len, -t.w / 2);
      ctx.moveTo(0, t.w / 2); ctx.lineTo(t.len, t.w / 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,70,110,0.12)';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,90,130,${0.12 + 0.2 * k})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,130,160,${0.5 + 0.4 * k})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.stroke();
    }
  }
  for (const bm of G.beams) {
    if (bm.t >= bm.warm) continue;
    const k = bm.t / bm.warm;
    ctx.strokeStyle = `rgba(255,120,150,${0.3 + 0.6 * k})`;
    ctx.lineWidth = 1 + k * 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(bm.x, bm.y);
    ctx.lineTo(bm.x + Math.cos(bm.ang) * bm.len, bm.y + Math.sin(bm.ang) * bm.len);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawBeams() {
  ctx.lineCap = 'round';
  for (const bm of G.beams) {
    if (bm.t < bm.warm) continue;
    const fade = Math.min(1, (bm.t - bm.warm) * 8, (bm.warm + bm.dur - bm.t) * 6);
    const ex = bm.x + Math.cos(bm.ang) * bm.len, ey = bm.y + Math.sin(bm.ang) * bm.len;
    for (const [w, col] of [[bm.w * 1.9, 'rgba(255,95,130,0.3)'], [bm.w, 'rgba(255,150,180,0.75)'], [bm.w * 0.35, '#ffffff']]) {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = w * (0.9 + Math.sin(FX.t * 40) * 0.05);
      ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawReticle() {
  if (G.state !== 'play' || Input.mode !== 'kbm' || Settings.autoAim || !Input.mouse.seen) return;
  const { x, y } = Input.mouse;
  ctx.strokeStyle = 'rgba(160,255,235,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + FX.t * 0.8;
    ctx.moveTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
    ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,255,245,0.9)';
  ctx.fillRect(x - 1, y - 1, 2, 2);
}

function render() {
  const P = G.player;
  screenTransform();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawBackground();
  drawSnowFar();

  if (!P.dead && P.st.orbs) orbPositions(P, orbPts);
  collectLights(frameLights);

  worldTransform();
  drawInks();
  drawParticles(ctx, false);
  drawBulletShadows();
  drawEnemyBodies();
  if (G.boss) G.boss.B.draw(ctx, G.boss);
  if (!P.dead) drawPlayer(ctx, P);

  screenTransform();
  const darkA = curve(DARKNESS, G.depth) * (1 - G.flareLight * 0.75);
  drawDarkness(darkA);

  worldTransform();
  ctx.globalCompositeOperation = 'lighter';
  if (!P.dead) drawGlow(ctx, PLAYER_COLOR, P.x, P.y, P.st.light * G.lightMul * 0.9, 0.05 * darkA);
  drawPickupGlows();
  drawEnemyGlows();
  if (G.boss) G.boss.B.glow(ctx, G.boss);
  drawOrbs();
  drawBolts();
  drawParticles(ctx, true);
  drawRingsAndZaps(ctx);
  if (!P.dead) glowPlayer(ctx, P);
  drawBeams();
  drawEnemyBullets();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawPickupIcons();
  drawTelegraphs();
  drawTexts(ctx);

  screenTransform();
  drawSnowNear(darkA, P.st.light * G.lightMul);
  ctx.drawImage(vignette, 0, 0, view.w, view.h);
  let hurtA = FX.hurt;
  if (!P.dead && P.hp === 1 && !G.attract) hurtA = Math.max(hurtA, 0.22 + Math.sin(FX.t * 5.5) * 0.12);
  if (hurtA > 0.01) { ctx.globalAlpha = Math.min(1, hurtA); ctx.drawImage(hurtVignette, 0, 0, view.w, view.h); ctx.globalAlpha = 1; }
  if (FX.white > 0.01) { ctx.fillStyle = `rgba(235,255,250,${FX.white * (reducedMotion ? 0.25 : 0.5)})`; ctx.fillRect(0, 0, view.w, view.h); }
  drawReticle();
}
