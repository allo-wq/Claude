'use strict';
// A simple pilot that steers away from danger and toward plankton.
// It plays the title-screen demo, and with ?bot it plays a real run for balance testing.

const Autopilot = (() => {
  const near = [];
  const out = {
    mx: 0, my: 0, mode: 'touch', aim: 'auto', padAim: null,
    dash: false, flare: false, pause: false, mute: false, pick: 0,
    up: false, down: false, left: false, right: false, confirm: false, back: false,
  };
  let wanderA = 0;
  const SAMPLES = [0.12, 0.25, 0.4];

  function frame(dt) {
    const P = G.player;
    let fx = 0, fy = 0, threat = 0;
    grid.query(P.x, P.y, 300, near);
    for (const h of near) {
      const e = h.owner || h;
      if (e.dead) continue;
      const d = Math.max(12, dist(P.x, P.y, h.x, h.y) - h.r);
      const w = 5200 / (d * d);
      fx += (P.x - h.x) / d * w; fy += (P.y - h.y) / d * w;
      if (d < 50) threat++;
    }
    for (const b of G.ebullets) {
      const dx = P.x - b.x, dy = P.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 > 200 * 200) continue;
      const d = Math.sqrt(d2) + 1;
      // Bullets heading our way push us sideways off their line.
      const sp = Math.hypot(b.vx, b.vy) + 1;
      const closing = (dx * b.vx + dy * b.vy) / (d * sp);
      if (closing < 0.3) continue;
      const side = Math.sign(dx * b.vy - dy * b.vx) || 1;
      const w = 2600 / (d * d) * closing;
      fx += (-b.vy / sp) * side * w * 2.2 + dx / d * w;
      fy += (b.vx / sp) * side * w * 2.2 + dy / d * w;
      if (d < 46) threat++;
    }
    for (const t of G.tele) {
      if (t.kind === 'circle' && dist(P.x, P.y, t.x, t.y) < t.r + 30) {
        const a = angleTo(t.x, t.y, P.x, P.y); fx += Math.cos(a) * 3; fy += Math.sin(a) * 3;
      } else if (t.kind === 'line' && distToSegment(P.x, P.y, t.x, t.y, t.x + Math.cos(t.ang) * t.len, t.y + Math.sin(t.ang) * t.len) < t.w / 2 + 26) {
        fx += -Math.sin(t.ang) * 3; fy += Math.cos(t.ang) * 3;
      }
    }
    for (const bm of G.beams) {
      const a = angleTo(bm.x, bm.y, P.x, P.y), side = Math.sign(angleDiff(bm.ang, a)) || 1;
      fx += Math.cos(a + side * Math.PI / 2) * 1.5; fy += Math.sin(a + side * Math.PI / 2) * 1.5;
    }
    if (G.boss && !G.boss.dying) {
      const b = G.boss, d = dist(P.x, P.y, b.x, b.y), a = angleTo(b.x, b.y, P.x, P.y);
      const want = 330 + b.r;
      fx += Math.cos(a) * (want - d) / 90; fy += Math.sin(a) * (want - d) / 90;
      fx += Math.cos(a + Math.PI / 2) * 0.6; fy += Math.sin(a + Math.PI / 2) * 0.6;
    }
    let best = null, bd = 380 * 380;
    for (const p of G.pickups) {
      const d2 = dist2(P.x, P.y, p.x, p.y);
      if (d2 < bd) { bd = d2; best = p; }
    }
    if (best) { const a = angleTo(P.x, P.y, best.x, best.y); fx += Math.cos(a) * 0.7; fy += Math.sin(a) * 0.7; }
    wanderA += rand(-1, 1) * dt * 2;
    fx += Math.cos(wanderA) * 0.25; fy += Math.sin(wanderA) * 0.25;
    if (G.attract) { fx -= P.x / 900; fy -= P.y / 900; }

    // Score a ring of candidate headings by predicting where bullets and bodies will be.
    const l = Math.hypot(fx, fy);
    const bias = l > 0.05 ? [fx / l, fy / l] : [0, 0];
    let bestScore = -Infinity, bx = 0, by = 0;
    for (let i = -1; i < 16; i++) {
      const dx = i < 0 ? 0 : Math.cos(i / 16 * TAU), dy = i < 0 ? 0 : Math.sin(i / 16 * TAU);
      let sc = (dx * bias[0] + dy * bias[1]) * Math.min(1, l) * 6;
      for (const tt of SAMPLES) {
        const px = P.x + dx * P.st.speed * tt, py = P.y + dy * P.st.speed * tt;
        for (const b of G.ebullets) {
          const qx = b.x + b.vx * tt - px, qy = b.y + b.vy * tt - py;
          const d = Math.hypot(qx, qy) - b.r - P.hitR;
          if (d < 34) sc -= (34 - d) * (34 - d) / (tt * 40);
        }
        for (const h of near) {
          const e = h.owner || h;
          if (e.dead) continue;
          const qx = h.x + (e.vx || 0) * tt - px, qy = h.y + (e.vy || 0) * tt - py;
          const d = Math.hypot(qx, qy) - h.r - P.hitR;
          if (d < 40) sc -= (40 - d) * (40 - d) / (tt * 60);
        }
      }
      if (sc > bestScore) { bestScore = sc; bx = dx; by = dy; }
    }
    out.mx = bx; out.my = by;
    out.dash = threat > 0 && P.dashCd <= 0 && chance(0.5);
    out.flare = G.flare >= 100 && (near.length > 14 || (G.boss && !G.boss.dying) || P.hp <= 2);
    return out;
  }

  return { frame };
})();
