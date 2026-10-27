'use strict';
// Visual effects: cached glow sprites, pooled particles, shock rings, floating text, lightning, screen shake.

const MAX_PARTICLES = 1600;

// Radial glow sprites, one canvas per colour. Drawn with 'lighter' they read as bioluminescence.
const Glow = {
  cache: new Map(),
  get(color) {
    let c = this.cache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${color},1)`);
    grd.addColorStop(0.18, `rgba(${color},0.7)`);
    grd.addColorStop(0.45, `rgba(${color},0.22)`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.cache.set(color, c);
    return c;
  },
};
function drawGlow(ctx, color, x, y, r, alpha = 1) {
  if (alpha <= 0.01 || r <= 0.5) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(Glow.get(color), x - r, y - r, r * 2, r * 2);
}

// Soft white disc used to cut light out of the darkness layer.
const LIGHT_SPRITE = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
})();

// Particle kinds: drawn in the glow pass (additive) or the body pass (lit only by the darkness holes).
const PK = { SPARK: 0, BUBBLE: 1, DEBRIS: 2, STREAK: 3, INK: 4 };
const GLOW_KINDS = new Set([PK.SPARK, PK.STREAK]);

const FX = {
  particles: [], rings: [], texts: [], zaps: [], flashes: [],
  pool: [],
  trauma: 0, sx: 0, sy: 0, t: 0,
  hurt: 0, white: 0,
  reset() {
    for (const p of this.particles) this.pool.push(p);
    this.particles.length = 0;
    this.rings.length = 0; this.texts.length = 0; this.zaps.length = 0; this.flashes.length = 0;
    this.trauma = 0; this.hurt = 0; this.white = 0;
  },
};

function particle(kind, x, y, vx, vy, life, size, color, drag = 2.5) {
  if (FX.particles.length >= MAX_PARTICLES) return null;
  const p = FX.pool.pop() || {};
  p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.max = life; p.size = size; p.color = color; p.drag = drag;
  p.dead = false; p.seed = Math.random() * TAU;
  FX.particles.push(p);
  return p;
}

function burst(x, y, color, n, speed, size = 3, life = 0.6) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = speed * rand(0.25, 1);
    particle(PK.SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.2), size * rand(0.6, 1.4), color, 3);
  }
}
function bubbles(x, y, n, spread = 8, speed = 40) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    particle(PK.BUBBLE, x + Math.cos(a) * rand(spread), y + Math.sin(a) * rand(spread),
      Math.cos(a) * rand(speed * 0.3, speed), Math.sin(a) * rand(speed * 0.3, speed) - 20,
      rand(0.7, 1.5), rand(1.5, 4), '200,240,245', 1.5);
  }
}
function ring(x, y, maxR, color, life = 0.5, width = 3) {
  FX.rings.push({ x, y, r: 0, maxR, color, life, max: life, w: width });
}
function floatText(x, y, text, color = '255,255,255', size = 14) {
  if (FX.texts.length > 60) FX.texts.shift();
  FX.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9, vy: -55 });
}
function flashLight(x, y, r, life = 0.25) {
  if (FX.flashes.length > 40) return;
  FX.flashes.push({ x, y, r, life, max: life });
}
function zap(points) { FX.zaps.push({ pts: points, life: 0.16, max: 0.16 }); }
function shake(amount) { if (Settings.shake) FX.trauma = Math.min(1, FX.trauma + amount); }

function updateFX(dt) {
  FX.t += dt;
  for (const p of FX.particles) {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy *= k;
    if (p.kind === PK.BUBBLE) { p.vy -= 60 * dt; p.vx += Math.sin(FX.t * 6 + p.seed) * 30 * dt; }
    else if (p.kind === PK.INK) p.size += 26 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  removeDead(FX.particles, p => FX.pool.push(p));
  for (const r of FX.rings) { r.life -= dt; r.r = r.maxR * easeOutCubic(1 - r.life / r.max); if (r.life <= 0) r.dead = true; }
  removeDead(FX.rings);
  for (const t of FX.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt); if (t.life <= 0) t.dead = true; }
  removeDead(FX.texts);
  for (const z of FX.zaps) { z.life -= dt; if (z.life <= 0) z.dead = true; }
  removeDead(FX.zaps);
  for (const f of FX.flashes) { f.life -= dt; if (f.life <= 0) f.dead = true; }
  removeDead(FX.flashes);
}

// Real-time effects that keep running during hit-stop and menus.
function updateScreenFX(rdt) {
  FX.trauma = Math.max(0, FX.trauma - rdt * 1.5);
  const s = FX.trauma * FX.trauma * 16, t = performance.now() / 1000;
  FX.sx = s * (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 77.1) * 0.4);
  FX.sy = s * (Math.sin(t * 37.9 + 1.3) * 0.6 + Math.sin(t * 69.7 + 2.1) * 0.4);
  FX.hurt = Math.max(0, FX.hurt - rdt * 1.6);
  FX.white = Math.max(0, FX.white - rdt * 2.2);
}

function drawParticles(ctx, glowPass) {
  if (glowPass) {
    for (const p of FX.particles) {
      if (!GLOW_KINDS.has(p.kind)) continue;
      const k = p.life / p.max;
      if (p.kind === PK.SPARK) {
        drawGlow(ctx, p.color, p.x, p.y, p.size * (1 + k) * 2.2, k);
      } else {
        ctx.globalAlpha = k;
        ctx.strokeStyle = `rgba(${p.color},1)`;
        ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return;
  }
  for (const p of FX.particles) {
    if (GLOW_KINDS.has(p.kind)) continue;
    const k = p.life / p.max;
    if (p.kind === PK.BUBBLE) {
      ctx.globalAlpha = Math.min(1, k * 1.5) * 0.7;
      ctx.strokeStyle = `rgb(${p.color})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
    } else if (p.kind === PK.INK) {
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawRingsAndZaps(ctx) {
  for (const r of FX.rings) {
    const k = r.life / r.max;
    ctx.globalAlpha = k;
    ctx.strokeStyle = `rgb(${r.color})`;
    ctx.lineWidth = r.w * (0.5 + k);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const z of FX.zaps) {
    const k = z.life / z.max;
    for (const [w, col] of [[6, '120,200,255'], [2, '235,250,255']]) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = `rgb(${col})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(z.pts[0], z.pts[1]);
      for (let i = 2; i < z.pts.length; i += 2) ctx.lineTo(z.pts[i], z.pts[i + 1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of FX.texts) {
    const k = t.life / t.max;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = `600 ${t.size}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(0,10,16,0.7)';
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = `rgb(${t.color})`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
