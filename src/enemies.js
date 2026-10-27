'use strict';
// Enemy archetypes. Each one has stats, an AI step (update), body art drawn under the darkness
// (draw, local space facing +x) and bioluminescent art drawn additively above it (glow).

const ENEMY_BULLET = '255,70,140';
const ELITE_GLOW = '255,205,110';

function steer(o, tx, ty, accel, dt) {
  const k = 1 - Math.exp(-accel * dt);
  o.vx += (tx - o.vx) * k;
  o.vy += (ty - o.vy) * k;
}
const spdOf = e => e.spd * (e.slow > 0 ? 0.5 : 1);
function seekPlayer(e, speed, accel, dt) {
  const P = G.player;
  const a = angleTo(e.x, e.y, P.x, P.y);
  steer(e, Math.cos(a) * speed, Math.sin(a) * speed, accel, dt);
  return a;
}
function enemyFire(x, y, ang, speed, r = 6, opt) {
  if (G.ebullets.length > 900) return null;
  const b = {
    x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r,
    life: opt?.life ?? 5.5, acc: opt?.acc || 0, spin: opt?.spin || 0, color: opt?.color || ENEMY_BULLET, dead: false,
  };
  G.ebullets.push(b);
  return b;
}
function telegraphLine(owner, x, y, ang, len, dur, w = 10) {
  G.tele.push({ kind: 'line', owner, x, y, ang, len, w, t: 0, dur, dead: false });
}
function telegraphCircle(owner, x, y, r, dur, onDone) {
  G.tele.push({ kind: 'circle', owner, x, y, r, t: 0, dur, onDone, dead: false });
}
const bodyColor = (e, c) => (e.flash > 0 ? (e.boss ? '#ffdce4' : '#ffffff') : c);

const ENEMIES = {
  // Comb-jelly-like drifter: the bread and butter of every zone.
  jelly: {
    r: 15, hp: 16, speed: 74, xp: 1, score: 10, cost: 1, mass: 1, color: '255,120,215',
    update(e, dt) {
      const pulse = 0.25 + Math.pow(Math.max(0, Math.sin(e.t * 3.1)), 2) * 1.7;
      const a = seekPlayer(e, spdOf(e) * pulse, 2.5, dt);
      e.ang = turnToward(e.ang, a, 2.2 * dt);
    },
    draw(ctx, e) {
      const r = e.r, s = Math.sin(e.t * 3.1), sq = 1 - s * 0.12, st = 1 + s * 0.12;
      ctx.strokeStyle = bodyColor(e, 'rgba(255,170,230,0.45)');
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const y0 = (i - 2) * r * 0.27 * st;
        ctx.beginPath(); ctx.moveTo(-r * 0.25, y0);
        for (let k = 1; k <= 4; k++) ctx.lineTo(-r * 0.25 - k * r * 0.42, y0 + Math.sin(e.t * 4 + i * 1.7 + k * 0.9) * r * 0.1 * k);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * st);
      ctx.bezierCurveTo(r * 0.6 * sq, -r * st, r * 1.05 * sq, -r * 0.45 * st, r * sq, 0);
      ctx.bezierCurveTo(r * 1.05 * sq, r * 0.45 * st, r * 0.6 * sq, r * st, -r * 0.3, r * st);
      ctx.quadraticCurveTo(-r * 0.02, 0, -r * 0.3, -r * st);
      ctx.fillStyle = bodyColor(e, 'rgba(170,90,210,0.45)');
      ctx.fill();
      ctx.strokeStyle = bodyColor(e, 'rgba(255,185,240,0.9)');
      ctx.lineWidth = 1.6;
      ctx.stroke();
    },
    glow(ctx, e) {
      const r = e.r, s = (Math.sin(e.t * 3.1) + 1) / 2;
      drawGlow(ctx, this.color, r * 0.35, 0, r * 1.7, 0.28 + s * 0.15);
      for (let i = -1; i <= 1; i++) drawGlow(ctx, this.color, r * (0.75 - Math.abs(i) * 0.25), i * r * 0.62, r * 0.45, 0.9);
    },
  },

  // Krill: tiny, fast, arrives in schools.
  krill: {
    r: 7, hp: 5, speed: 150, xp: 1, score: 6, cost: 0.4, mass: 0.5, color: '255,150,80', school: [7, 12],
    init(e) { e.wob = rand(TAU); },
    update(e, dt) {
      const P = G.player;
      const a = angleTo(e.x, e.y, P.x, P.y) + Math.sin(e.t * 2.2 + e.wob) * 0.65;
      const sp = spdOf(e);
      steer(e, Math.cos(a) * sp, Math.sin(a) * sp, 3, dt);
      e.ang = Math.atan2(e.vy, e.vx);
    },
    draw(ctx, e) {
      const r = e.r;
      ctx.fillStyle = bodyColor(e, 'rgba(240,140,110,0.75)');
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = bodyColor(e, 'rgba(255,190,160,0.7)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const x = r * (0.5 - i * 0.5), k = Math.sin(e.t * 14 + i) * r * 0.3;
        ctx.moveTo(x, r * 0.4); ctx.lineTo(x - r * 0.2 + k * 0.3, r * 1.1);
      }
      ctx.moveTo(r * 1.3, -r * 0.2); ctx.lineTo(r * 2.4, -r * 0.9);
      ctx.moveTo(r * 1.3, -r * 0.1); ctx.lineTo(r * 2.5, r * 0.2);
      ctx.stroke();
    },
    glow(ctx, e) { drawGlow(ctx, this.color, e.r * 0.9, -e.r * 0.15, e.r * 1.1, 0.95); },
  },

  // Needlefish: closes in, telegraphs a line, then darts along it.
  needle: {
    r: 10, hp: 20, speed: 125, xp: 2, score: 18, cost: 2, mass: 0.8, color: '255,95,120',
    init(e) { e.st = rand(0.6, 1.6); },
    update(e, dt) {
      const P = G.player, d = dist(e.x, e.y, P.x, P.y);
      e.st -= dt;
      if (e.state === 0) {
        const a = seekPlayer(e, spdOf(e), 2, dt);
        e.ang = turnToward(e.ang, a, 5 * dt);
        if (e.st <= 0 && d < 390) {
          e.state = 1; e.st = 0.6;
          e.dashA = angleTo(e.x, e.y, P.x, P.y);
          telegraphLine(e, e.x, e.y, e.dashA, 360, 0.6, 8);
          Sound.telegraph();
        }
      } else if (e.state === 1) {
        steer(e, 0, 0, 6, dt);
        e.ang = turnToward(e.ang, e.dashA, 12 * dt);
        if (e.st <= 0) { e.state = 2; e.st = 0.42; }
      } else if (e.state === 2) {
        const sp = 780 * (e.slow > 0 ? 0.6 : 1);
        e.vx = Math.cos(e.dashA) * sp; e.vy = Math.sin(e.dashA) * sp;
        if (chance(0.5)) particle(PK.STREAK, e.x, e.y, -e.vx * 0.2, -e.vy * 0.2, 0.25, 2, this.color, 4);
        if (e.st <= 0) { e.state = 3; e.st = 0.75; }
      } else {
        steer(e, 0, 0, 3, dt);
        if (e.st <= 0) { e.state = 0; e.st = rand(1.1, 2.2); }
      }
    },
    draw(ctx, e) {
      const r = e.r;
      ctx.fillStyle = bodyColor(e, '#7f9db3');
      ctx.beginPath();
      ctx.moveTo(r * 2.5, 0);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.55, -r * 1.5, -r * 0.25);
      ctx.lineTo(-r * 1.5, r * 0.25);
      ctx.quadraticCurveTo(r * 0.6, r * 0.55, r * 2.5, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.4, 0); ctx.lineTo(-r * 2.3, -r * 0.7); ctx.lineTo(-r * 2.0, 0); ctx.lineTo(-r * 2.3, r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = bodyColor(e, 'rgba(220,240,255,0.5)');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(-r * 1.2, 0); ctx.stroke();
    },
    glow(ctx, e) {
      const hot = e.state === 1 ? 1.6 : 1;
      drawGlow(ctx, this.color, e.r * 0.9, -e.r * 0.12, e.r * 0.8 * hot, 1);
    },
  },

  // Radiolarian: keeps its distance and spits slow fans of light.
  spitter: {
    r: 15, hp: 32, speed: 88, xp: 3, score: 25, cost: 3, mass: 1.2, color: '215,90,255',
    init(e) { e.fireT = rand(1.4, 2.6); e.dir = chance(0.5) ? 1 : -1; e.charge = 0; },
    update(e, dt) {
      const P = G.player, d = dist(e.x, e.y, P.x, P.y), a = angleTo(e.x, e.y, P.x, P.y), sp = spdOf(e);
      let ta = a, s = sp;
      if (d < 250) ta = a + Math.PI;
      else if (d < 400) { ta = a + e.dir * Math.PI / 2; s = sp * 0.6; }
      steer(e, Math.cos(ta) * s, Math.sin(ta) * s, 2, dt);
      e.ang += dt * 0.8;
      e.fireT -= dt;
      e.charge = clamp(1 - e.fireT / 0.55, 0, 1);
      if (e.fireT <= 0) {
        if (d < 640) {
          const n = G.depth > 3500 ? 5 : 3;
          for (let i = 0; i < n; i++) enemyFire(e.x, e.y, a + (i - (n - 1) / 2) * 0.22, 175 + G.depth / 100, 6);
          Sound.enemyShoot();
          e.fireT = rand(2.2, 2.9) * (G.depth > 5000 ? 0.8 : 1);
        } else e.fireT = 0.6;
      }
    },
    draw(ctx, e) {
      const r = e.r;
      ctx.strokeStyle = bodyColor(e, 'rgba(225,180,255,0.7)');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = e.ang + i / 12 * TAU, l = r * (1.55 + (i % 2) * 0.35);
        ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      }
      ctx.stroke();
      ctx.fillStyle = bodyColor(e, 'rgba(120,60,160,0.65)');
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill();
      ctx.strokeStyle = bodyColor(e, 'rgba(235,190,255,0.8)');
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.stroke();
    },
    glow(ctx, e) {
      drawGlow(ctx, this.color, 0, 0, e.r * (1.2 + e.charge * 1.4), 0.6 + e.charge * 0.4);
      drawGlow(ctx, '255,255,255', 0, 0, e.r * 0.4 * (1 + e.charge), 0.5 + e.charge * 0.5);
    },
  },

  // Giant isopod: armoured and slow; splits into three young when cracked open.
  isopod: {
    r: 19, hp: 62, speed: 58, xp: 4, score: 35, cost: 4, mass: 2.4, color: '255,180,120',
    update(e, dt) {
      seekPlayer(e, spdOf(e), 1.6, dt);
      e.ang = turnToward(e.ang, Math.atan2(e.vy, e.vx), 3 * dt);
    },
    onDeath(e) {
      for (let i = 0; i < 3; i++) {
        const a = e.ang + Math.PI + (i - 1) * 0.9;
        const m = spawnEnemy('mite', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { elite: false });
        m.vx = Math.cos(a) * 260; m.vy = Math.sin(a) * 260;
      }
    },
    draw(ctx, e) { drawIsopod(ctx, e, e.r); },
    glow(ctx, e) {
      drawGlow(ctx, this.color, e.r * 1.0, -e.r * 0.42, e.r * 0.42, 0.9);
      drawGlow(ctx, this.color, e.r * 1.0, e.r * 0.42, e.r * 0.42, 0.9);
    },
  },
  mite: {
    r: 9, hp: 12, speed: 128, xp: 1, score: 8, cost: 1, mass: 0.6, color: '255,180,120', spawnOnly: true,
    update(e, dt) {
      seekPlayer(e, spdOf(e), 2.2, dt);
      e.ang = turnToward(e.ang, Math.atan2(e.vy, e.vx), 6 * dt);
    },
    draw(ctx, e) { drawIsopod(ctx, e, e.r); },
    glow(ctx, e) { drawGlow(ctx, this.color, e.r * 1.0, 0, e.r * 0.5, 0.9); },
  },

  // Gulper eel: a huge mouth on a whip of a body. Winds up, then lunges.
  gulper: {
    r: 30, hp: 230, speed: 50, xp: 10, score: 90, cost: 9, mass: 5, color: '255,80,110',
    init(e) { e.st = rand(1.5, 2.5); e.open = 0; },
    update(e, dt) {
      const P = G.player, d = dist(e.x, e.y, P.x, P.y);
      e.st -= dt;
      if (e.state === 0) {
        const a = seekPlayer(e, spdOf(e), 1.5, dt);
        e.ang = turnToward(e.ang, a, 1.6 * dt);
        e.open = damp(e.open, 0.15, 4, dt);
        if (e.st <= 0 && d < 470) {
          e.state = 1; e.st = 0.9;
          e.dashA = angleTo(e.x, e.y, P.x, P.y);
          telegraphLine(e, e.x, e.y, e.dashA, 420, 0.9, 26);
          Sound.telegraph();
        }
      } else if (e.state === 1) {
        steer(e, 0, 0, 5, dt);
        e.ang = turnToward(e.ang, e.dashA, 8 * dt);
        e.open = damp(e.open, 1, 6, dt);
      } else if (e.state === 2) {
        const sp = 600 * (e.slow > 0 ? 0.6 : 1);
        e.vx = Math.cos(e.dashA) * sp; e.vy = Math.sin(e.dashA) * sp;
      } else {
        steer(e, 0, 0, 2, dt);
        e.open = damp(e.open, 0, 3, dt);
      }
      if (e.state === 1 && e.st <= 0) { e.state = 2; e.st = 0.62; }
      else if (e.state === 2 && e.st <= 0) { e.state = 3; e.st = 1.1; }
      else if (e.state === 3 && e.st <= 0) { e.state = 0; e.st = rand(2, 3.2); }
    },
    draw(ctx, e) {
      const r = e.r, o = e.open;
      // whip tail
      ctx.strokeStyle = bodyColor(e, '#3a2a36');
      ctx.lineCap = 'round';
      let px = -r * 0.6, py = 0;
      for (let i = 1; i <= 7; i++) {
        const x = -r * 0.6 - i * r * 0.45, y = Math.sin(e.t * 5 - i * 0.7) * r * 0.08 * i;
        ctx.lineWidth = r * 0.5 * (1 - i / 8);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        px = x; py = y;
      }
      e.tailX = px; e.tailY = py;
      // head and gaping jaw
      const jaw = 0.25 + o * 0.55;
      ctx.fillStyle = bodyColor(e, '#2c1f2a');
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, 0);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.9, r * 0.2, -r * 0.75);
      ctx.lineTo(r * 1.35 * Math.cos(jaw), -r * 1.35 * Math.sin(jaw));
      ctx.lineTo(r * 0.15, 0);
      ctx.lineTo(r * 1.35 * Math.cos(jaw), r * 1.35 * Math.sin(jaw));
      ctx.lineTo(r * 0.2, r * 0.75);
      ctx.quadraticCurveTo(-r * 0.3, r * 0.9, -r * 0.7, 0);
      ctx.fill();
      ctx.strokeStyle = bodyColor(e, '#6b4c62');
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,6,12,0.9)';
      ctx.beginPath();
      ctx.moveTo(r * 1.3 * Math.cos(jaw), -r * 1.3 * Math.sin(jaw));
      ctx.lineTo(r * 0.2, 0);
      ctx.lineTo(r * 1.3 * Math.cos(jaw), r * 1.3 * Math.sin(jaw));
      ctx.closePath(); ctx.fill();
    },
    glow(ctx, e) {
      const r = e.r;
      drawGlow(ctx, this.color, e.tailX || -r * 3.7, e.tailY || 0, r * 0.7, 0.9 + Math.sin(e.t * 6) * 0.1);
      drawGlow(ctx, this.color, r * 0.05, -r * 0.42, r * 0.35, 1);
      if (e.state === 1) drawGlow(ctx, this.color, r * 0.7, 0, r * (0.8 + e.open), 0.5);
    },
  },

  // Deep-sea eel: a chain of segments, each one solid.
  eel: {
    r: 12, hp: 125, speed: 155, xp: 8, score: 70, cost: 8, mass: 2, color: '255,110,200', segN: 9, spacing: 15,
    init(e) {
      e.segs = [];
      for (let i = 0; i < this.segN; i++) e.segs.push({ x: e.x, y: e.y, r: lerp(10, 5, i / (this.segN - 1)), owner: e });
    },
    update(e, dt) {
      const P = G.player;
      const a = angleTo(e.x, e.y, P.x, P.y) + Math.sin(e.t * 3) * 0.9;
      e.ang = turnToward(e.ang, a, 2.6 * dt);
      const sp = spdOf(e);
      steer(e, Math.cos(e.ang) * sp, Math.sin(e.ang) * sp, 6, dt);
    },
    after(e) { followChain(e, e.segs, this.spacing); },
    draw(ctx, e) {
      // Drawn in world space (see drawEnemyBodies) because the body is a chain.
      ctx.lineCap = 'round';
      ctx.strokeStyle = bodyColor(e, '#3b2d45');
      let px = e.x, py = e.y;
      for (const s of e.segs) {
        ctx.lineWidth = s.r * 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(s.x, s.y); ctx.stroke();
        px = s.x; py = s.y;
      }
      ctx.fillStyle = bodyColor(e, '#4a3858');
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.3, e.r * 0.9, e.ang, 0, TAU); ctx.fill();
    },
    worldSpace: true,
    glow(ctx, e) {
      for (let i = 0; i < e.segs.length; i += 2) drawGlow(ctx, this.color, e.segs[i].x, e.segs[i].y, 7, 0.85);
      drawGlow(ctx, this.color, e.x + Math.cos(e.ang) * e.r * 0.6, e.y + Math.sin(e.ang) * e.r * 0.6, e.r * 0.8, 1);
    },
  },

  // Viperfish: all but invisible in the dark; only its eyes give it away before it strikes.
  viper: {
    r: 13, hp: 44, speed: 175, xp: 4, score: 40, cost: 4, mass: 1, color: '255,60,70',
    init(e) { e.st = rand(1.4, 3); e.orbit = chance(0.5) ? 1 : -1; },
    update(e, dt) {
      const P = G.player;
      e.st -= dt;
      if (e.state === 0) {
        const around = angleTo(P.x, P.y, e.x, e.y) + e.orbit * 0.45;
        const tx = P.x + Math.cos(around) * 240, ty = P.y + Math.sin(around) * 240;
        const a = angleTo(e.x, e.y, tx, ty), sp = spdOf(e);
        steer(e, Math.cos(a) * sp, Math.sin(a) * sp, 2.5, dt);
        e.ang = turnToward(e.ang, angleTo(e.x, e.y, P.x, P.y), 4 * dt);
        if (e.st <= 0) { e.state = 1; e.st = 0.42; Sound.telegraph(); }
      } else if (e.state === 1) {
        steer(e, 0, 0, 5, dt);
        e.dashA = angleTo(e.x, e.y, P.x, P.y);
        e.ang = turnToward(e.ang, e.dashA, 10 * dt);
        if (e.st <= 0) { e.state = 2; e.st = 0.45; }
      } else if (e.state === 2) {
        const sp = 640 * (e.slow > 0 ? 0.6 : 1);
        e.vx = Math.cos(e.dashA) * sp; e.vy = Math.sin(e.dashA) * sp;
        if (e.st <= 0) { e.state = 3; e.st = 0.8; }
      } else {
        const a = angleTo(P.x, P.y, e.x, e.y);
        steer(e, Math.cos(a) * 160, Math.sin(a) * 160, 3, dt);
        if (e.st <= 0) { e.state = 0; e.st = rand(1.8, 3.2); }
      }
    },
    draw(ctx, e) {
      const r = e.r;
      ctx.fillStyle = bodyColor(e, '#140d16');
      ctx.beginPath(); ctx.ellipse(-r * 0.5, 0, r * 1.7, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = bodyColor(e, 'rgba(230,220,210,0.55)');
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.2); ctx.lineTo(r * 1.5, r * 0.5);
      ctx.moveTo(r * 0.7, r * 0.2); ctx.lineTo(r * 1.3, -r * 0.55);
      ctx.stroke();
    },
    glow(ctx, e) {
      const hot = e.state === 1 ? 2 : 1;
      drawGlow(ctx, this.color, e.r * 0.55, -e.r * 0.28, e.r * 0.5 * hot, 1);
      drawGlow(ctx, '255,200,200', e.r * 0.55, -e.r * 0.28, e.r * 0.18 * hot, 1);
      for (let i = 0; i < 4; i++) drawGlow(ctx, '120,140,255', -e.r * (0.2 + i * 0.6), e.r * 0.45, 3.5, 0.6);
    },
  },
};

function drawIsopod(ctx, e, r) {
  ctx.fillStyle = bodyColor(e, '#9d8f9c');
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.92, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = bodyColor(e, '#5d5260');
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    const x = i * r * 0.38;
    const h = Math.sqrt(Math.max(0, 1 - (x / (r * 1.25)) ** 2)) * r * 0.92;
    ctx.moveTo(x, -h); ctx.quadraticCurveTo(x + r * 0.12, 0, x, h);
  }
  ctx.stroke();
  ctx.strokeStyle = bodyColor(e, 'rgba(200,190,200,0.7)');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r * 1.15, -r * 0.3); ctx.quadraticCurveTo(r * 1.8, -r * 0.6, r * 2.0, -r * 1.1);
  ctx.moveTo(r * 1.15, r * 0.3); ctx.quadraticCurveTo(r * 1.8, r * 0.6, r * 2.0, r * 1.1);
  ctx.stroke();
}

// Follow-the-leader constraint for chained bodies (eels, the oarfish).
function followChain(head, segs, spacing) {
  let px = head.x, py = head.y;
  for (const s of segs) {
    const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
    if (d > spacing) { s.x = px + dx / d * spacing; s.y = py + dy / d * spacing; }
    px = s.x; py = s.y;
  }
}

function spawnEnemy(type, x, y, opt = {}) {
  const T = ENEMIES[type], P = G.player;
  const e = {
    type, T, x, y, vx: 0, vy: 0, r: T.r,
    hp: T.hp * G.hpMul, maxHp: 0, spd: T.speed * G.spdMul,
    xp: T.xp, score: T.score, mass: T.mass,
    t: rand(10), ang: angleTo(x, y, P.x, P.y), flash: -1, stun: 0, slow: 0,
    state: 0, st: 0, dead: false, elite: false, id: ++G.uid, orbT: 0, owner: null,
  };
  if (opt.elite) {
    e.elite = true; e.r *= 1.35; e.hp *= 5; e.xp *= 4; e.score *= 5; e.mass *= 2;
  }
  e.maxHp = e.hp;
  if (T.init) T.init(e);
  G.enemies.push(e);
  return e;
}
