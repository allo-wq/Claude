'use strict';
// The four guardians of the descent. Each boss is a small state machine of telegraphed attacks
// that gets meaner below half health. Hitboxes are refreshed every frame in b.hit.

const LURE = '255,236,180';

function bossFireRing(x, y, n, speed, offset = 0, r = 7) {
  for (let i = 0; i < n; i++) enemyFire(x, y, offset + i / n * TAU, speed, r);
  Sound.enemyShoot();
}
function bossNext(b, list) {
  b.state = list[b.oi % list.length];
  b.oi++;
  b.st = 0; b.fired = 0; b.rep = 0;
}
const toPlayer = b => angleTo(b.x, b.y, G.player.x, G.player.y);
const distPlayer = b => dist(b.x, b.y, G.player.x, G.player.y);

const BOSSES = {
  angler: {
    name: 'Humpback anglerfish', latin: 'Melanocetus johnsonii', r: 58, hp: 1500, color: '255,90,110',
    init(b) { b.mouth = 0; b.lure = 0; b.cd = 1.2; },
    update(b, dt) {
      const P = G.player, a = toPlayer(b), d = distPlayer(b), p2 = b.hp < b.maxHp * 0.5;
      b.st += dt;
      if (b.state === 'idle') {
        const want = d > 240 ? 70 : 0;
        steer(b, Math.cos(a) * want, Math.sin(a) * want, 1.5, dt);
        b.ang = turnToward(b.ang, a, 1.5 * dt);
        b.mouth = damp(b.mouth, 0.1, 3, dt);
        b.lure = damp(b.lure, 0, 3, dt);
        b.cd -= dt;
        if (b.cd <= 0) bossNext(b, p2 ? ['burst', 'lunge', 'summon', 'stream', 'lunge', 'burst'] : ['burst', 'lunge', 'stream']);
      } else if (b.state === 'burst') {
        steer(b, 0, 0, 3, dt);
        b.ang = turnToward(b.ang, a, 0.8 * dt);
        b.lure = Math.min(1, b.st / 0.8);
        if (b.st < 0.05 && !b.fired) { Sound.telegraph(); b.fired = 0.5; }
        if (b.st >= 0.8 && b.fired < 1) { bossFireRing(b.lx, b.ly, p2 ? 22 : 16, 165, rand(TAU)); b.fired = 1; flashLight(b.lx, b.ly, 260, 0.4); }
        if (p2 && b.st >= 1.15 && b.fired < 2) { bossFireRing(b.lx, b.ly, 22, 130, rand(TAU)); b.fired = 2; }
        if (b.st >= 1.5) { b.state = 'idle'; b.cd = p2 ? 0.7 : 1.1; }
      } else if (b.state === 'lunge') {
        if (b.st < 0.85) {
          if (!b.fired) { b.fired = 1; b.dashA = a; telegraphLine(b, b.x, b.y, a, 520, 0.85, 70); Sound.telegraph(); }
          steer(b, 0, 0, 4, dt);
          b.ang = turnToward(b.ang, b.dashA, 8 * dt);
          b.mouth = damp(b.mouth, 1, 5, dt);
        } else if (b.st < 1.55) {
          b.vx = Math.cos(b.dashA) * 640; b.vy = Math.sin(b.dashA) * 640;
          if (chance(0.6)) bubbles(b.x - Math.cos(b.dashA) * b.r, b.y - Math.sin(b.dashA) * b.r, 1, 20);
        } else {
          steer(b, 0, 0, 3, dt);
          b.mouth = damp(b.mouth, 0.1, 3, dt);
          if (b.st > 2.1) {
            b.rep++;
            if (p2 && b.rep < 2) { b.st = 0; b.fired = 0; }
            else { b.state = 'idle'; b.cd = 0.9; }
          }
        }
      } else if (b.state === 'stream') {
        const sa = a + Math.PI / 2;
        steer(b, Math.cos(sa) * 90, Math.sin(sa) * 90, 2, dt);
        b.ang = turnToward(b.ang, a, 3 * dt);
        b.mouth = damp(b.mouth, 0.6, 5, dt);
        b.fireT = (b.fireT || 0) - dt;
        if (b.st > 0.3 && b.fireT <= 0) {
          b.fireT = p2 ? 0.08 : 0.11;
          enemyFire(b.x + Math.cos(b.ang) * b.r, b.y + Math.sin(b.ang) * b.r, a + rand(-0.14, 0.14), 250, 6);
          Sound.enemyShoot();
        }
        if (b.st > 1.7) { b.state = 'idle'; b.cd = 1.0; }
      } else if (b.state === 'summon') {
        steer(b, 0, 0, 3, dt);
        b.lure = Math.min(1, b.st / 0.5);
        if (b.st > 0.5 && !b.fired) {
          b.fired = 1;
          for (let i = 0; i < 6; i++) {
            const ang = i / 6 * TAU;
            spawnEnemy('jelly', b.x + Math.cos(ang) * 120, b.y + Math.sin(ang) * 120);
          }
          ring(b.lx, b.ly, 200, LURE, 0.6, 4);
        }
        if (b.st > 1.0) { b.state = 'idle'; b.cd = 0.8; }
      }
    },
    pose(b) {
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      b.lx = b.x + c * b.r * 1.35 + s * b.r * 0.55;
      b.ly = b.y + s * b.r * 1.35 - c * b.r * 0.55;
      b.hit[0].x = b.x; b.hit[0].y = b.y; b.hit[0].r = b.r * 0.92;
      b.hit[1].x = b.x + c * b.r * 0.7; b.hit[1].y = b.y + s * b.r * 0.7; b.hit[1].r = b.r * 0.5;
    },
    lights(b, out) { out.push({ x: b.lx, y: b.ly, r: 170 + b.lure * 160, i: 0.9 }); },
    makeHit(b) { b.hit = [{ x: b.x, y: b.y, r: b.r, owner: b }, { x: b.x, y: b.y, r: b.r * 0.5, owner: b }]; },
    draw(ctx, b) {
      const r = b.r, m = b.mouth;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      // tail and fins
      ctx.fillStyle = bodyColor(b, '#241a1d');
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(-r * 1.55, -r * 0.45 + Math.sin(b.t * 4) * 6);
      ctx.lineTo(-r * 1.45, 0);
      ctx.lineTo(-r * 1.55, r * 0.45 + Math.sin(b.t * 4) * 6);
      ctx.closePath(); ctx.fill();
      // body
      const grd = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
      grd.addColorStop(0, b.flash > 0 ? '#ffdce4' : '#4a3a3d');
      grd.addColorStop(1, b.flash > 0 ? '#ffdce4' : '#1a1214');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * 0.92, 0, 0, TAU); ctx.fill();
      // mouth: a dark wedge with needle teeth
      const jaw = 0.2 + m * 0.5;
      ctx.fillStyle = '#0a0506';
      ctx.beginPath();
      ctx.moveTo(-r * 0.05, r * 0.08);
      ctx.lineTo(r * 1.05, r * 0.08 - Math.tan(jaw) * r * 0.9);
      ctx.lineTo(r * 1.05, r * 0.32 + Math.tan(jaw) * r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = bodyColor(b, '#e8dfcf');
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const t = 0.25 + i / 7 * 0.75;
        const ux = lerp(-r * 0.05, r * 1.05, t), uy = lerp(r * 0.08, r * 0.08 - Math.tan(jaw) * r * 0.9, t);
        ctx.moveTo(ux - 3, uy); ctx.lineTo(ux + 3, uy); ctx.lineTo(ux, uy + 9 + (i % 2) * 5);
        const lx = lerp(-r * 0.05, r * 1.05, t), ly = lerp(r * 0.08, r * 0.32 + Math.tan(jaw) * r * 0.5, t);
        ctx.moveTo(lx - 3, ly); ctx.lineTo(lx + 3, ly); ctx.lineTo(lx, ly - 8 - (i % 2) * 5);
      }
      ctx.fill();
      // eye
      ctx.fillStyle = '#c9c3b0';
      ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.42, r * 0.09, 0, TAU); ctx.fill();
      // illicium: the fishing rod
      ctx.strokeStyle = bodyColor(b, '#3d2f31');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.9, -r * 1.55, r * 1.35, -r * 0.55);
      ctx.stroke();
      ctx.restore();
    },
    glow(ctx, b) {
      const pulse = 0.85 + Math.sin(b.t * 5) * 0.15;
      drawGlow(ctx, LURE, b.lx, b.ly, (26 + b.lure * 50) * pulse, 1);
      drawGlow(ctx, '255,255,255', b.lx, b.ly, 8 + b.lure * 10, 1);
      if (b.lure > 0.3) drawGlow(ctx, LURE, b.lx, b.ly, 120 * b.lure, 0.3);
    },
  },

  squid: {
    name: 'Colossal squid', latin: 'Mesonychoteuthis hamiltoni', r: 62, hp: 5600, color: '255,120,90',
    init(b) {
      b.cd = 1.5;
      b.arms = [];
      for (let i = 0; i < 10; i++) b.arms.push({ off: (i - 4.5) * 0.16, ph: rand(TAU), tx: null, ty: null, reach: 0, long: i === 2 || i === 7 });
    },
    update(b, dt) {
      const P = G.player, a = toPlayer(b), d = distPlayer(b), p2 = b.hp < b.maxHp * 0.5;
      b.st += dt;
      b.ang = turnToward(b.ang, a, 1.8 * dt);
      for (const arm of b.arms) arm.reach = damp(arm.reach, arm.tx !== null ? 1 : 0, 6, dt);
      if (b.state === 'idle') {
        const around = angleTo(P.x, P.y, b.x, b.y) + 0.5 * dt;
        const tx = P.x + Math.cos(around) * 300, ty = P.y + Math.sin(around) * 300;
        const ma = angleTo(b.x, b.y, tx, ty), sp = Math.min(150, dist(b.x, b.y, tx, ty) * 1.5);
        steer(b, Math.cos(ma) * sp, Math.sin(ma) * sp, 1.5, dt);
        b.cd -= dt;
        if (b.cd <= 0) bossNext(b, p2 ? ['slam', 'spiral', 'ink', 'slam', 'ink'] : ['slam', 'ink', 'spiral']);
      } else if (b.state === 'slam') {
        steer(b, 0, 0, 2, dt);
        const n = p2 ? 6 : 4;
        const due = Math.floor(b.st / 0.2);
        while (b.fired < n && b.fired <= due) {
          const lead = b.fired === 0 ? 0 : 0.5;
          const tx = P.x + P.vx * lead + (b.fired ? rand(-150, 150) : 0);
          const ty = P.y + P.vy * lead + (b.fired ? rand(-150, 150) : 0);
          const arm = b.arms[[2, 7, 1, 8, 3, 6][b.fired]];
          arm.tx = tx; arm.ty = ty;
          telegraphCircle(b, tx, ty, 74, 1.05, () => {
            arm.tx = null;
            if (dist(G.player.x, G.player.y, tx, ty) < 74 + G.player.hitR) hurtPlayer(tx, ty, 'slam');
            Sound.slam(); shake(0.25);
            burst(tx, ty, '255,140,110', 14, 260, 3, 0.5);
            ring(tx, ty, 90, '255,140,110', 0.4, 4);
            bubbles(tx, ty, 8, 40, 80);
          });
          b.fired++;
          Sound.telegraph();
        }
        if (b.st > n * 0.2 + 1.4) { b.state = 'idle'; b.cd = p2 ? 0.6 : 1.0; }
      } else if (b.state === 'ink') {
        if (!b.fired) {
          b.fired = 1;
          for (let i = 0; i < 14; i++) particle(PK.INK, b.x + rand(-60, 60), b.y + rand(-60, 60), rand(-60, 60), rand(-60, 60), rand(2.5, 3.5), rand(30, 55), '6,4,10', 1);
          const away = a + Math.PI + rand(-0.8, 0.8);
          b.vx = Math.cos(away) * 720; b.vy = Math.sin(away) * 720;
        }
        steer(b, 0, 0, 1.6, dt);
        const waves = p2 ? 5 : 3;
        if (b.st > 0.25 + b.fired * 0.28 && b.fired <= waves) {
          const n = 5;
          for (let i = 0; i < n; i++) enemyFire(b.x, b.y, a + (i - 2) * 0.17, 230, 7);
          Sound.enemyShoot();
          b.fired++;
        }
        if (b.st > 2.2) { b.state = 'idle'; b.cd = 0.8; }
      } else if (b.state === 'spiral') {
        steer(b, 0, 0, 2, dt);
        b.spin = (b.spin || 0) + dt * 2.1;
        b.fireT = (b.fireT || 0) - dt;
        if (b.fireT <= 0 && b.st > 0.4) {
          b.fireT = 0.075;
          const arms = p2 ? 3 : 2;
          for (let i = 0; i < arms; i++) enemyFire(b.x, b.y, b.spin + i / arms * TAU, 150, 7);
          Sound.enemyShoot();
        }
        if (b.st > 3.0) { b.state = 'idle'; b.cd = 1.0; }
      }
    },
    pose(b) {
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      b.hit[0].x = b.x; b.hit[0].y = b.y; b.hit[0].r = b.r * 0.8;
      b.hit[1].x = b.x - c * b.r * 1.0; b.hit[1].y = b.y - s * b.r * 1.0; b.hit[1].r = b.r * 0.72;
      b.hit[2].x = b.x - c * b.r * 1.85; b.hit[2].y = b.y - s * b.r * 1.85; b.hit[2].r = b.r * 0.5;
    },
    makeHit(b) { b.hit = [0, 1, 2].map(() => ({ x: b.x, y: b.y, r: b.r, owner: b })); },
    draw(ctx, b) {
      const r = b.r;
      // arms (world space so tentacles can reach their slam targets)
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      const hx = b.x + c * r * 0.6, hy = b.y + s * r * 0.6;
      ctx.lineCap = 'round';
      for (const arm of b.arms) {
        const base = b.ang + arm.off;
        const len = arm.long ? r * 3.2 : r * 2.1;
        let px = hx, py = hy;
        const N = 9;
        for (let i = 1; i <= N; i++) {
          const t = i / N;
          let x = hx + Math.cos(base) * len * t + Math.cos(base + Math.PI / 2) * Math.sin(b.t * 2.4 + arm.ph + t * 4) * 14 * t;
          let y = hy + Math.sin(base) * len * t + Math.sin(base + Math.PI / 2) * Math.sin(b.t * 2.4 + arm.ph + t * 4) * 14 * t;
          if (arm.tx !== null && arm.reach > 0.01) {
            const ex = lerp(hx, arm.tx, t), ey = lerp(hy, arm.ty, t);
            x = lerp(x, ex, arm.reach); y = lerp(y, ey, arm.reach);
          }
          ctx.strokeStyle = bodyColor(b, '#6e2a33');
          ctx.lineWidth = (arm.long ? 9 : 12) * (1 - t * 0.8);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          px = x; py = y;
        }
        arm.ex = px; arm.ey = py;
      }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      // mantle, pointing away from the player
      ctx.fillStyle = bodyColor(b, '#7a2733');
      ctx.beginPath();
      ctx.moveTo(r * 0.55, -r * 0.62);
      ctx.bezierCurveTo(-r * 0.6, -r * 0.95, -r * 1.9, -r * 0.6, -r * 2.5, 0);
      ctx.bezierCurveTo(-r * 1.9, r * 0.6, -r * 0.6, r * 0.95, r * 0.55, r * 0.62);
      ctx.closePath(); ctx.fill();
      // fins
      ctx.fillStyle = bodyColor(b, '#8e3340');
      ctx.beginPath();
      ctx.moveTo(-r * 1.7, 0);
      ctx.quadraticCurveTo(-r * 2.1, -r * 1.05 - Math.sin(b.t * 3) * 6, -r * 2.55, 0);
      ctx.quadraticCurveTo(-r * 2.1, r * 1.05 + Math.sin(b.t * 3) * 6, -r * 1.7, 0);
      ctx.fill();
      // spots
      ctx.fillStyle = 'rgba(40,8,14,0.5)';
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-r * (0.2 + i * 0.3), Math.sin(i * 2.3) * r * 0.35, 4 + (i % 3) * 2, 0, TAU); ctx.fill(); }
      // head + the largest eye in the animal kingdom
      ctx.fillStyle = bodyColor(b, '#8a2f3a');
      ctx.beginPath(); ctx.ellipse(r * 0.45, 0, r * 0.55, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9e2d6';
      ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.3, r * 0.24, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0a10';
      ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.3, r * 0.15, 0, TAU); ctx.fill();
      ctx.restore();
    },
    glow(ctx, b) {
      const r = b.r, c = Math.cos(b.ang), s = Math.sin(b.ang);
      const ex = b.x + c * r * 0.45 - s * -r * 0.3, ey = b.y + s * r * 0.45 + c * -r * 0.3;
      drawGlow(ctx, '120,200,255', ex, ey, r * 0.55, 0.55);
      for (const arm of b.arms) if (arm.ex !== undefined) drawGlow(ctx, '255,140,110', arm.ex, arm.ey, 8, 0.8);
      if (b.state === 'spiral') drawGlow(ctx, this.color, b.x, b.y, r * 1.2, 0.35);
    },
  },

  oarfish: {
    name: 'Giant oarfish', latin: 'Regalecus glesne', r: 24, hp: 14000, color: '255,70,90', segN: 34, spacing: 24,
    init(b) {
      b.segs = [];
      for (let i = 0; i < this.segN; i++) b.segs.push({ x: b.x, y: b.y + i * 10, r: lerp(22, 7, i / (this.segN - 1)), owner: b });
      b.cd = 1.5;
      b.speed = 200;
    },
    update(b, dt) {
      const P = G.player, a = toPlayer(b), p2 = b.hp < b.maxHp * 0.5;
      b.st += dt;
      let turn = 2.2, speed = p2 ? 250 : 215;
      if (b.state === 'idle' || b.state === 'volley') {
        const ta = a + Math.sin(b.t * 1.7) * 0.7;
        b.ang = turnToward(b.ang, ta, turn * dt);
        b.cd -= dt;
        if (b.state === 'volley') {
          const due = Math.floor(b.st / 0.045);
          while (b.fired < b.segs.length && b.fired <= due) {
            const i = b.fired, sg = b.segs[i];
            if (i % 2 === 0) {
              const prev = i === 0 ? b : b.segs[i - 1];
              const ba = angleTo(sg.x, sg.y, prev.x, prev.y);
              enemyFire(sg.x, sg.y, ba + Math.PI / 2, 135, 6);
              enemyFire(sg.x, sg.y, ba - Math.PI / 2, 135, 6);
            }
            b.fired++;
          }
          if (b.fired % 6 === 0) Sound.enemyShoot();
          if (b.fired >= b.segs.length) { b.state = 'idle'; b.cd = p2 ? 0.8 : 1.4; }
        } else if (b.cd <= 0) bossNext(b, p2 ? ['volley', 'coil', 'charge', 'volley', 'charge'] : ['volley', 'charge', 'coil']);
      } else if (b.state === 'coil') {
        const around = angleTo(P.x, P.y, b.x, b.y) + 0.55;
        const R = lerp(310, p2 ? 190 : 220, clamp(b.st / 4, 0, 1));
        const tx = P.x + Math.cos(around) * R, ty = P.y + Math.sin(around) * R;
        b.ang = turnToward(b.ang, angleTo(b.x, b.y, tx, ty), 4 * dt);
        speed = 320;
        b.fireT = (b.fireT || 0) - dt;
        if (p2 && b.fireT <= 0 && b.st > 1) {
          b.fireT = 0.6;
          for (let i = 4; i < b.segs.length; i += 6) enemyFire(b.segs[i].x, b.segs[i].y, angleTo(b.segs[i].x, b.segs[i].y, P.x, P.y), 120, 6);
          Sound.enemyShoot();
        }
        if (b.st > 4.5) { b.state = 'idle'; b.cd = 0.8; }
      } else if (b.state === 'charge') {
        if (b.st < 0.8) {
          speed = 60;
          b.ang = turnToward(b.ang, a, 3 * dt);
          if (!b.fired && b.st > 0.25) { b.fired = 1; b.dashA = b.ang; telegraphLine(b, b.x, b.y, b.ang, 640, 0.55, 40); Sound.telegraph(); }
        } else if (b.st < 1.75) {
          speed = 700; turn = 0.3;
          b.ang = turnToward(b.ang, a, turn * dt);
        } else {
          speed = 160;
          if (b.st > 2.2) {
            b.rep++;
            if (p2 && b.rep < 2) { b.st = 0; b.fired = 0; }
            else { b.state = 'idle'; b.cd = 1.0; }
          }
        }
      }
      b.speed = damp(b.speed, speed, 4, dt);
      b.vx = Math.cos(b.ang) * b.speed; b.vy = Math.sin(b.ang) * b.speed;
    },
    pose(b) {
      followChain(b, b.segs, this.spacing);
      b.hit[0].x = b.x; b.hit[0].y = b.y;
    },
    makeHit(b) { b.hit = [{ x: b.x, y: b.y, r: b.r, owner: b, mul: 1.5 }, ...b.segs]; },
    draw(ctx, b) {
      ctx.lineCap = 'round';
      let px = b.x, py = b.y;
      for (let i = 0; i < b.segs.length; i++) {
        const sg = b.segs[i];
        ctx.strokeStyle = bodyColor(b, i % 2 ? '#a9b7c4' : '#9aaabb');
        ctx.lineWidth = sg.r * 1.7;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sg.x, sg.y); ctx.stroke();
        px = sg.x; py = sg.y;
      }
      // faint stripes
      ctx.strokeStyle = 'rgba(40,60,80,0.35)';
      ctx.lineWidth = 2;
      for (let i = 2; i < b.segs.length; i += 3) {
        const sg = b.segs[i], prev = b.segs[i - 1];
        const ba = angleTo(sg.x, sg.y, prev.x, prev.y) + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(sg.x + Math.cos(ba) * sg.r * 0.8, sg.y + Math.sin(ba) * sg.r * 0.8);
        ctx.lineTo(sg.x - Math.cos(ba) * sg.r * 0.8, sg.y - Math.sin(ba) * sg.r * 0.8);
        ctx.stroke();
      }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      ctx.fillStyle = bodyColor(b, '#b8c4cf');
      ctx.beginPath(); ctx.ellipse(4, 0, b.r * 1.35, b.r * 0.85, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20262c';
      ctx.beginPath(); ctx.arc(b.r * 0.7, -b.r * 0.25, 4, 0, TAU); ctx.fill();
      ctx.restore();
    },
    glow(ctx, b) {
      // The scarlet dorsal crest, glowing along the whole body.
      const hot = b.hp < b.maxHp * 0.5 ? 1 : 0.7;
      for (let i = 0; i < b.segs.length; i += 2) {
        const sg = b.segs[i], prev = i === 0 ? b : b.segs[i - 1];
        const ba = angleTo(sg.x, sg.y, prev.x, prev.y) - Math.PI / 2;
        drawGlow(ctx, this.color, sg.x + Math.cos(ba) * sg.r, sg.y + Math.sin(ba) * sg.r, sg.r * 0.9, hot);
      }
      for (let k = 0; k < 5; k++) {
        const a = b.ang + Math.PI - 0.5 + k * 0.25 + Math.sin(b.t * 3 + k) * 0.08;
        drawGlow(ctx, this.color, b.x + Math.cos(a) * b.r * 1.6, b.y + Math.sin(a) * b.r * 1.6 - 0, 10, 0.9);
      }
    },
  },

  maw: {
    name: 'Species incognita', latin: 'Unclassified · Challenger Deep', r: 86, hp: 30000, color: '255,95,130',
    init(b) {
      b.cd = 1.5;
      b.phase = 1;
      b.lanterns = [];
      for (let i = 0; i < 6; i++) b.lanterns.push({ a: i / 6 * TAU, fireT: 1 + i * 0.5, x: b.x, y: b.y });
      b.eye = 0;
    },
    update(b, dt) {
      const P = G.player, a = toPlayer(b), d = distPlayer(b);
      b.st += dt;
      const ph = b.hp > b.maxHp * 0.66 ? 1 : b.hp > b.maxHp * 0.33 ? 2 : 3;
      if (ph !== b.phase) {
        b.phase = ph;
        Sound.roar(); shake(0.6);
        ring(b.x, b.y, 420, this.color, 0.9, 6);
        for (const eb of G.ebullets) eb.dead = true;
        b.state = 'idle'; b.cd = 1.4;
        if (ph === 3) G.lightMul = 0.75;
      }
      const want = d > 300 ? 55 : d < 200 ? -40 : 0;
      steer(b, Math.cos(a) * want, Math.sin(a) * want, 1, dt);
      b.ang = turnToward(b.ang, a, 0.8 * dt);
      b.eye = damp(b.eye, b.state === 'beam' ? 1 : 0.3, 4, dt);

      for (const L of b.lanterns) {
        L.fireT -= dt;
        if (L.fireT <= 0) {
          L.fireT = ph === 1 ? 3.4 : 2.2;
          enemyFire(L.x, L.y, angleTo(L.x, L.y, P.x, P.y), 190, 6);
        }
      }

      if (b.state === 'idle') {
        b.cd -= dt;
        if (b.cd <= 0) {
          const plan = ph === 1 ? ['spiral', 'rings'] : ph === 2 ? ['beam', 'spiral', 'summon', 'rings', 'beam'] : ['beam', 'rings', 'spiral', 'beam', 'summon'];
          bossNext(b, plan);
        }
      } else if (b.state === 'spiral') {
        b.spin = (b.spin || 0) + dt * (b.oi % 2 ? 1.4 : -1.4);
        b.fireT = (b.fireT || 0) - dt;
        if (b.fireT <= 0 && b.st > 0.3) {
          b.fireT = ph === 3 ? 0.075 : 0.09;
          const arms = ph === 1 ? 4 : ph === 2 ? 5 : 6;
          for (let i = 0; i < arms; i++) enemyFire(b.x, b.y, b.spin + i / arms * TAU, 140, 7);
          Sound.enemyShoot();
        }
        if (b.st > 3.2) { b.state = 'idle'; b.cd = 0.9; }
      } else if (b.state === 'rings') {
        const due = Math.floor(b.st / 0.45);
        if (b.fired <= due && b.fired < 3) {
          bossFireRing(b.x, b.y, 26, ph === 3 ? 190 : 165, b.fired * (TAU / 52), 7);
          flashLight(b.x, b.y, 300, 0.3);
          b.fired++;
        }
        if (b.st > 2.0) { b.state = 'idle'; b.cd = 0.9; }
      } else if (b.state === 'beam') {
        if (!b.fired) {
          b.fired = 1;
          const n = ph === 3 ? 2 : 1;
          // One beam tracks the player; in the last phase two opposite beams sweep like a lighthouse.
          const spin = n === 2 ? (b.oi % 2 ? 0.45 : -0.45) : 0;
          for (let i = 0; i < n; i++) G.beams.push({ owner: b, ang: a + i * Math.PI, spin, t: 0, warm: 1.0, dur: n === 2 ? 3.2 : 2.6, len: 1500, w: 34, dead: false, x: b.x, y: b.y });
          Sound.telegraph();
        }
        if (b.st > (ph === 3 ? 4.4 : 3.8)) { b.state = 'idle'; b.cd = 0.8; }
      } else if (b.state === 'summon') {
        if (!b.fired) {
          b.fired = 1;
          for (let i = 0; i < 3; i++) { const ang = i / 3 * TAU + rand(0.5); spawnEnemy('viper', b.x + Math.cos(ang) * 200, b.y + Math.sin(ang) * 200); }
          for (let i = 0; i < 5; i++) { const ang = rand(TAU); spawnEnemy('jelly', b.x + Math.cos(ang) * 160, b.y + Math.sin(ang) * 160); }
          ring(b.x, b.y, 260, this.color, 0.6, 4);
          Sound.roar();
        }
        if (b.st > 1.2) { b.state = 'idle'; b.cd = 0.8; }
      }
    },
    pose(b, dt) {
      const lspd = b.phase === 3 ? 0.95 : 0.55;
      for (const L of b.lanterns) {
        L.a += lspd * dt;
        const R = 175 + Math.sin(b.t * 1.3 + L.a * 2) * 15;
        L.x = b.x + Math.cos(L.a) * R; L.y = b.y + Math.sin(L.a) * R;
      }
      b.hit[0].x = b.x; b.hit[0].y = b.y; b.hit[0].r = b.r * 0.85;
    },
    lights(b, out) {
      for (const L of b.lanterns) out.push({ x: L.x, y: L.y, r: 120, i: 0.7 });
      out.push({ x: b.x, y: b.y - b.r * 0.35, r: 140 + b.eye * 120, i: 0.6 });
    },
    makeHit(b) { b.hit = [{ x: b.x, y: b.y, r: b.r, owner: b }]; },
    draw(ctx, b) {
      const r = b.r;
      // stalks to the lanterns
      ctx.strokeStyle = 'rgba(160,140,170,0.35)';
      ctx.lineWidth = 3;
      for (const L of b.lanterns) {
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo((b.x + L.x) / 2 + Math.sin(b.t + L.a) * 30, (b.y + L.y) / 2 + Math.cos(b.t + L.a) * 30, L.x, L.y);
        ctx.stroke();
      }
      // tendrils
      ctx.strokeStyle = 'rgba(190,170,200,0.3)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        const base = Math.PI / 2 + (i - 3) * 0.28;
        ctx.beginPath(); ctx.moveTo(b.x + Math.cos(base) * r * 0.8, b.y + Math.sin(base) * r * 0.8);
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          ctx.lineTo(b.x + Math.cos(base) * r * (0.8 + t * 2.2) + Math.sin(b.t * 1.5 + i + k) * 18 * t, b.y + Math.sin(base) * r * (0.8 + t * 2.2));
        }
        ctx.stroke();
      }
      // ghost-pale body
      const grd = ctx.createRadialGradient(b.x, b.y - r * 0.2, r * 0.2, b.x, b.y, r * 1.15);
      grd.addColorStop(0, b.flash > 0 ? '#ffdce4' : 'rgba(225,212,232,0.95)');
      grd.addColorStop(0.7, b.flash > 0 ? '#ffdce4' : 'rgba(150,130,165,0.85)');
      grd.addColorStop(1, 'rgba(90,70,110,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.15, 0, TAU); ctx.fill();
      // vertical maw lined with teeth
      const open = 0.35 + (b.state === 'rings' || b.state === 'spiral' ? 0.4 : 0) + Math.sin(b.t * 2) * 0.05;
      ctx.fillStyle = '#12060c';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + r * 0.25, r * 0.22 * open * 2, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe6dc';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = b.y + r * (-0.15 + i * 0.16), w = r * 0.22 * open * 2 * Math.sqrt(Math.max(0, 1 - ((i - 2.5) / 3.2) ** 2));
        ctx.moveTo(b.x - w, y - 4); ctx.lineTo(b.x - w + 12, y); ctx.lineTo(b.x - w, y + 4);
        ctx.moveTo(b.x + w, y - 4); ctx.lineTo(b.x + w - 12, y); ctx.lineTo(b.x + w, y + 4);
      }
      ctx.fill();
      // the eye
      ctx.fillStyle = '#efe6dc';
      ctx.beginPath(); ctx.ellipse(b.x, b.y - r * 0.45, r * 0.3, r * 0.2, 0, 0, TAU); ctx.fill();
      const px = b.x + Math.cos(b.ang) * r * 0.1, py = b.y - r * 0.45 + Math.sin(b.ang) * r * 0.06;
      ctx.fillStyle = '#1a0710';
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.08, r * 0.15, 0, 0, TAU); ctx.fill();
    },
    glow(ctx, b) {
      const r = b.r;
      const px = b.x + Math.cos(b.ang) * r * 0.1, py = b.y - r * 0.45 + Math.sin(b.ang) * r * 0.06;
      drawGlow(ctx, this.color, px, py, r * (0.4 + b.eye * 0.5), 0.8);
      for (const L of b.lanterns) {
        drawGlow(ctx, LURE, L.x, L.y, 26 + Math.sin(b.t * 4 + L.a) * 4, 1);
        drawGlow(ctx, '255,255,255', L.x, L.y, 7, 1);
      }
      if (b.phase === 3) drawGlow(ctx, this.color, b.x, b.y, r * 2.2, 0.15 + Math.sin(b.t * 3) * 0.05);
    },
  },
};

function spawnBoss(kind) {
  const B = BOSSES[kind], P = G.player;
  const below = P.y + (view.h / 2) / view.scale + B.r * 2 + 80;
  const b = {
    boss: true, kind, B, x: P.x + rand(-120, 120), y: below, vx: 0, vy: 0, r: B.r,
    hp: B.hp, maxHp: B.hp, t: 0, flash: -1, stun: 0, slow: 0, ang: -Math.PI / 2,
    state: 'enter', st: 0, oi: 0, fired: 0, cd: 2, dead: false, dying: false, deathT: 0, orbT: 0, hit: [], name: B.name, latin: B.latin,
  };
  B.init(b);
  B.makeHit(b);
  G.boss = b;
  return b;
}

function updateBoss(b, dt) {
  const B = b.B;
  b.t += dt;
  b.flash = Math.max(-1, b.flash - dt);
  if (b.dying) {
    b.deathT += dt;
    b.vx *= Math.exp(-2 * dt); b.vy *= Math.exp(-2 * dt);
    if (b.kind === 'oarfish') b.speed *= Math.exp(-2 * dt);
    b.x += b.vx * dt; b.y += b.vy * dt;
    B.pose(b, dt);
    if (Math.random() < dt * 22) {
      const h = pick(b.hit);
      burst(h.x + rand(-h.r, h.r), h.y + rand(-h.r, h.r), B.color, 10, 300, 3.5, 0.6);
      flashLight(h.x, h.y, 160, 0.25);
      Sound.kill(chance(0.3));
    }
    if (b.deathT > 2.0) finishBoss(b);
    return;
  }
  if (b.state === 'enter') {
    // Rise from below toward the player, then start the pattern.
    const a = toPlayer(b);
    b.ang = turnToward(b.ang, a, 2.5 * dt);
    if (b.kind === 'oarfish') { b.speed = 260; b.vx = Math.cos(b.ang) * 260; b.vy = Math.sin(b.ang) * 260; }
    else steer(b, Math.cos(a) * 190, Math.sin(a) * 190, 2, dt);
    b.st += dt;
    if (distPlayer(b) < 380 || b.st > 3.5) { b.state = 'idle'; b.st = 0; }
  } else if (b.stun > 0) {
    b.stun -= dt;
    steer(b, 0, 0, 3, dt);
  } else {
    B.update(b, dt);
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  B.pose(b, dt);
}
