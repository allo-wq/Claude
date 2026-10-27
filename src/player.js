'use strict';
// The lanternfish: movement, dash, auto-fire, the organ weapons and the flare.

const PLAYER_COLOR = '140,250,230';
const DASH_SPEED = 920, DASH_TIME = 0.17;

function createPlayer() {
  const lv = {};
  for (const u of UPGRADES) lv[u.id] = 0;
  const P = {
    x: 0, y: 0, vx: 0, vy: 0, r: 12, hitR: 7, ang: -Math.PI / 2, aim: -Math.PI / 2,
    hp: 5, maxHp: 5, inv: 0, dashT: 0, dashCd: 0, dashDir: 0, inkT: 0,
    fireT: 0, shockT: 5, regenT: 0, tail: 0, orbA: 0, lv, st: null, dead: false,
  };
  computeStats(P);
  return P;
}

function computeStats(P) {
  const L = P.lv;
  P.st = {
    speed: 275 * (1 + 0.08 * L.speed),
    fireRate: 4.2 * (1 + 0.15 * L.firerate),
    dmg: 10 * (1 + 0.2 * L.damage) * (1 + 0.15 * L.size),
    shots: 1 + L.multishot,
    pierce: L.pierce,
    boltSpeed: 660 * (1 + 0.18 * L.velocity),
    boltLife: 0.8 * (1 + 0.15 * L.velocity),
    boltR: 4 * (1 + 0.3 * L.size),
    homing: L.homing * 2.8,
    crit: 0.05 + 0.1 * L.crit,
    orbs: L.orbs ? L.orbs + 1 : 0,
    orbR: 70 + L.orbs * 6,
    chainP: L.chain ? 0.12 + 0.08 * L.chain : 0,
    chainN: 1 + L.chain,
    shockEvery: L.shock ? 7.5 - L.shock : 0,
    shockR: 150 + 30 * L.shock,
    ink: L.ink,
    rear: L.rear,
    magnet: 95 * (1 + 0.35 * L.magnet),
    light: 300 * (1 + 0.18 * L.light),
    regen: [0, 40, 28, 18][L.regen],
    dashCd: 1.3 * (1 - 0.15 * L.dashcd),
    flareGain: 1 + 0.3 * L.flare,
    flareDmg: 1 + 0.35 * L.flare,
    siphon: 0.012 * L.siphon,
  };
}

// Resolve the aim angle for this frame: mouse, right stick, or nearest enemy.
function resolveAim(P, inp) {
  if (inp.aim === 'mouse' && !Settings.autoAim) {
    const [wx, wy] = screenToWorld(Input.mouse.x, Input.mouse.y);
    P.aim = angleTo(P.x, P.y, wx, wy);
    return true;
  }
  if (inp.aim === 'pad') { P.aim = inp.padAim; return true; }
  const t = nearestTarget(P.x, P.y, 560);
  if (t) {
    // Lead the target a little so auto-aim hits moving things.
    const o = t.owner || t, d = dist(P.x, P.y, t.x, t.y), lead = d / P.st.boltSpeed;
    P.aim = angleTo(P.x, P.y, t.x + (o.vx || 0) * lead * 0.7, t.y + (o.vy || 0) * lead * 0.7);
    return true;
  }
  if (Math.hypot(P.vx, P.vy) > 40) P.aim = Math.atan2(P.vy, P.vx);
  return false;
}

function updatePlayer(P, inp, dt) {
  const st = P.st;
  P.inv = Math.max(0, P.inv - dt);
  P.dashCd = Math.max(0, P.dashCd - dt);

  // Swimming: velocity eases toward the stick, which gives a light, watery drift.
  const ml = Math.hypot(inp.mx, inp.my);
  if (P.dashT > 0) {
    P.dashT -= dt;
    const k = 0.55 + 0.45 * (P.dashT / DASH_TIME);
    P.vx = Math.cos(P.dashDir) * DASH_SPEED * k;
    P.vy = Math.sin(P.dashDir) * DASH_SPEED * k;
    if (st.ink) {
      P.inkT -= dt;
      if (P.inkT <= 0) {
        P.inkT = 0.05;
        G.inks.push({ x: P.x, y: P.y, r: 40 + 12 * st.ink, life: 2 + 0.5 * st.ink, max: 2 + 0.5 * st.ink, dps: st.dmg * (0.8 + 0.6 * st.ink), tick: 0, dead: false, seed: rand(TAU) });
      }
    }
    if (chance(0.8)) particle(PK.STREAK, P.x, P.y, -P.vx * 0.15, -P.vy * 0.15, 0.25, 3, PLAYER_COLOR, 5);
  } else {
    steer(P, inp.mx * st.speed, inp.my * st.speed, ml > 0.05 ? 9 : 4, dt);
  }

  if (inp.dash && P.dashCd <= 0 && P.dashT <= 0) {
    P.dashDir = ml > 0.1 ? Math.atan2(inp.my, inp.mx) : Math.hypot(P.vx, P.vy) > 30 ? Math.atan2(P.vy, P.vx) : P.aim;
    P.dashT = DASH_TIME; P.dashCd = st.dashCd;
    P.inv = Math.max(P.inv, DASH_TIME + 0.08);
    P.inkT = 0;
    Sound.dash();
    bubbles(P.x, P.y, 8, 6, 90);
  }

  P.x += P.vx * dt; P.y += P.vy * dt;

  const hasTarget = resolveAim(P, inp);
  P.ang = turnToward(P.ang, P.aim, 14 * dt);
  const spd = Math.hypot(P.vx, P.vy);
  P.tail += dt * (6 + spd * 0.05);

  if (spd > 120 && chance(dt * 6)) bubbles(P.x - Math.cos(P.ang) * 14, P.y - Math.sin(P.ang) * 14, 1, 4, 20);

  // Auto-fire. With auto-aim and nothing in range, hold fire.
  P.fireT -= dt;
  if (P.fireT <= 0 && (hasTarget || inp.aim === 'mouse')) {
    P.fireT += 1 / st.fireRate;
    if (P.fireT < 0) P.fireT = 0;
    const n = st.shots, step = n > 1 ? Math.min(0.13, 0.55 / (n - 1)) : 0;
    for (let i = 0; i < n; i++) fireBolt(P, P.aim + (i - (n - 1) / 2) * step);
    if (st.rear >= 1) fireBolt(P, P.aim + Math.PI);
    if (st.rear >= 2) { fireBolt(P, P.aim + Math.PI - 0.35); fireBolt(P, P.aim + Math.PI + 0.35); }
    Sound.shoot();
    const mx = P.x + Math.cos(P.aim) * 16, my = P.y + Math.sin(P.aim) * 16;
    particle(PK.SPARK, mx, my, Math.cos(P.aim) * 60, Math.sin(P.aim) * 60, 0.12, 3, PLAYER_COLOR, 6);
  }
  if (P.fireT < 0) P.fireT = 0;

  // Satellite spores.
  P.orbA += dt * 2.7;

  // Depth charge.
  if (st.shockEvery) {
    P.shockT -= dt;
    if (P.shockT <= 0) {
      P.shockT = st.shockEvery;
      pressureWave(P.x, P.y, st.shockR, st.dmg * (1.6 + 0.5 * P.lv.shock), 420);
    }
  }

  // Mending tissue.
  if (st.regen) {
    P.regenT += dt;
    if (P.regenT >= st.regen) {
      P.regenT = 0;
      if (P.hp < P.maxHp) healPlayer(1);
    }
  }

  // Flare.
  if (inp.flare && G.flare >= 100) triggerFlare(P);
}

function fireBolt(P, a) {
  const st = P.st;
  const x = P.x + Math.cos(a) * 14, y = P.y + Math.sin(a) * 14;
  G.bolts.push({
    x, y, vx: Math.cos(a) * st.boltSpeed + P.vx * 0.2, vy: Math.sin(a) * st.boltSpeed + P.vy * 0.2,
    r: st.boltR, dmg: st.dmg, pierce: st.pierce, life: st.boltLife, hits: [], dead: false,
  });
}

function orbPositions(P, out) {
  out.length = 0;
  const n = P.st.orbs;
  for (let i = 0; i < n; i++) {
    const a = P.orbA + i / n * TAU;
    out.push(P.x + Math.cos(a) * P.st.orbR, P.y + Math.sin(a) * P.st.orbR);
  }
  return out;
}

function pressureWave(x, y, radius, dmg, knock) {
  ring(x, y, radius, PLAYER_COLOR, 0.45, 5);
  flashLight(x, y, radius * 1.2, 0.3);
  Sound.shock();
  shake(0.12);
  forEachEnemyNear(x, y, radius, e => {
    damageEnemy(e, dmg, { crit: false });
    const a = angleTo(x, y, e.x, e.y);
    const t = e.owner || e;
    if (!t.boss) { t.vx += Math.cos(a) * knock / t.mass; t.vy += Math.sin(a) * knock / t.mass; }
  });
}

function triggerFlare(P) {
  G.flare = 0;
  G.flareLight = 1;
  const st = P.st, R = 720;
  Sound.flare();
  shake(0.45);
  FX.white = 0.6;
  ring(P.x, P.y, R, '255,255,240', 0.9, 10);
  ring(P.x, P.y, R * 0.6, PLAYER_COLOR, 0.7, 6);
  burst(P.x, P.y, PLAYER_COLOR, 40, 600, 4, 0.9);
  for (const b of G.ebullets) {
    if (dist2(b.x, b.y, P.x, P.y) < R * R) { b.dead = true; particle(PK.SPARK, b.x, b.y, 0, 0, 0.4, 4, ENEMY_BULLET, 2); }
  }
  const dmg = st.dmg * 7 * st.flareDmg;
  for (const e of G.enemies) {
    if (e.dead || dist2(e.x, e.y, P.x, P.y) > R * R) continue;
    e.stun = 1.6;
    // Interrupt wind-ups so nothing lunges without a warning once the stun wears off.
    if (e.state) { e.state = 0; e.st = rand(1, 2); }
    const a = angleTo(P.x, P.y, e.x, e.y);
    e.vx += Math.cos(a) * 500 / e.mass; e.vy += Math.sin(a) * 500 / e.mass;
    damageEnemy(e, dmg, { crit: false });
  }
  if (G.boss && !G.boss.dying && dist(G.boss.x, G.boss.y, P.x, P.y) < R + G.boss.r) {
    damageEnemy(G.boss, dmg * 1.5, { crit: false });
    G.boss.stun = 0.4;
  }
  for (const t of G.tele) if (t.owner && !t.owner.boss && t.owner.stun > 0) t.dead = true;
}

function healPlayer(n) {
  const P = G.player;
  const before = P.hp;
  P.hp = Math.min(P.maxHp, P.hp + n);
  if (P.hp > before) {
    floatText(P.x, P.y - 24, `+${P.hp - before} ♥`, '255,120,150', 15);
    Sound.heal();
    burst(P.x, P.y, '255,120,150', 12, 160, 3, 0.6);
  }
}

function drawPlayer(ctx, P) {
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.rotate(P.ang);
  if (P.inv > 0 && P.dashT <= 0 && Math.floor(P.inv * 16) % 2 === 0) ctx.globalAlpha = 0.35;
  const sw = Math.sin(P.tail) * 0.4;
  // tail fin
  ctx.fillStyle = '#2b5566';
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-23, -8 + sw * 9);
  ctx.quadraticCurveTo(-19, sw * 6, -23, 8 + sw * 9);
  ctx.closePath(); ctx.fill();
  // body
  const grd = ctx.createLinearGradient(0, -8, 0, 8);
  grd.addColorStop(0, '#1b3644');
  grd.addColorStop(0.55, '#4f7c8a');
  grd.addColorStop(1, '#b9dbe0');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 7.5, 0, 0, TAU); ctx.fill();
  // dorsal and pectoral fins
  ctx.fillStyle = '#24495a';
  ctx.beginPath(); ctx.moveTo(-2, -6.5); ctx.lineTo(-9, -12 - sw * 2); ctx.lineTo(-8, -5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(-5, 8 + sw * 3); ctx.lineTo(-3, 2); ctx.fill();
  // the big eye
  ctx.fillStyle = '#e6fbff';
  ctx.beginPath(); ctx.arc(8, -1.5, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#061016';
  ctx.beginPath(); ctx.arc(8.7, -1.5, 2.1, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function glowPlayer(ctx, P) {
  const c = Math.cos(P.ang), s = Math.sin(P.ang);
  const at = (lx, ly) => [P.x + c * lx - s * ly, P.y + s * lx + c * ly];
  const k = P.inv > 0 && P.dashT <= 0 && Math.floor(P.inv * 16) % 2 === 0 ? 0.4 : 1;
  drawGlow(ctx, PLAYER_COLOR, P.x, P.y, 46, 0.22 * k);
  for (let i = 0; i < 5; i++) {
    const [x, y] = at(7 - i * 4.4, 5);
    drawGlow(ctx, PLAYER_COLOR, x, y, 5.5, 0.95 * k);
  }
  const [hx, hy] = at(12.5, -4.5);
  drawGlow(ctx, PLAYER_COLOR, hx, hy, 11, k);
  drawGlow(ctx, '255,255,255', hx, hy, 3.5, k);
}
