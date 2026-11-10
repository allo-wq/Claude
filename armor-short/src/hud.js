// 2D overlay: hook title, piece labels, the price counter, scan brackets,
// speed lines, money burst. Drawn on a 1080x1920 canvas every frame and
// composited into the 3D frame before bloom so the type glows with the scene.
import { sat, lerp, prog, smooth, ease, kick, hash1 } from './util.js';

const W = 1080;
const H = 1920;
const GREEN = '#35ff7a';
const INK = '#03120a';

const L = {
  labelY: 300,
  itemX: 540,
  itemY: 816,
  priceY: 1425,
  fLabelY: 188,
  fPriceY: 1500,
};

// "going from one to the price": starts at exactly 1, ends at exactly `price`.
export function countValue(price, q) {
  const e = 1 - Math.pow(1 - sat(q), 2.6);
  return Math.max(1, Math.round(1 + (price - 1) * e));
}

function text(ctx, str, x, y, size, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  const sc = o.scale ?? 1;
  ctx.scale(sc, sc);
  if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
  ctx.globalAlpha = sat(o.alpha ?? 1);
  ctx.font = `${o.weight ?? 400} ${size}px ${o.font ?? 'Anton'}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${o.track ?? 0}px`;
  if (o.maxW) {
    const w = ctx.measureText(str).width;
    if (w > o.maxW) ctx.scale(o.maxW / w, o.maxW / w);
  }
  ctx.lineJoin = 'round';
  if (o.stroke) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = o.shadowBlur ?? 22;
    ctx.shadowOffsetY = o.shadowY ?? 8;
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeW ?? size * 0.11;
    ctx.strokeText(str, 0, 0);
    ctx.shadowOffsetY = 0;
  }
  ctx.shadowColor = o.glow ?? 'transparent';
  ctx.shadowBlur = o.glow ? o.glowBlur ?? 36 : 0;
  ctx.fillStyle = typeof o.fill === 'function' ? o.fill(ctx, size) : o.fill ?? '#fff';
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

function drawPrice(ctx, str, cx, cy, size, o) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.rot ?? 0);
  ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.globalAlpha = sat(o.alpha ?? 1);
  ctx.font = `${size}px Anton`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // fixed-width digit cells so the number does not jitter while it runs
  const dw = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
  const gap = size * 0.012;
  const cells = [...str].map((ch) => ({ ch, w: /\d/.test(ch) ? dw : ctx.measureText(ch).width }));
  const total = cells.reduce((s, c) => s + c.w, 0) + gap * (cells.length - 1);
  let x = -total / 2;
  for (const c of cells) {
    c.x = x + c.w / 2;
    x += c.w + gap;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.12;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  for (const c of cells) ctx.strokeText(c.ch, c.x, 0);
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = o.final ? 'rgba(20,255,100,0.8)' : 'rgba(130,255,180,0.5)';
  ctx.shadowBlur = o.final ? 34 : 22;
  const g = ctx.createLinearGradient(0, -size * 0.42, 0, size * 0.42);
  if (o.final) {
    g.addColorStop(0, '#c8ffd9');
    g.addColorStop(0.4, '#3dff7c');
    g.addColorStop(1, '#0bc447');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c4ffd8');
  }
  ctx.fillStyle = g;
  for (const c of cells) ctx.fillText(c.ch, c.x, 0);
  ctx.restore();
  return total;
}

function brackets(ctx, cx, cy, w, h, len, lw, alpha, color) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = sat(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'square';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
  }
  ctx.stroke();
  ctx.restore();
}

function rays(ctx, cx, cy, age, n, life, color, reach) {
  if (age < 0 || age > life) return;
  const k = age / life;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash1(i * 3.3) * 0.3;
    const r0 = (160 + reach * ease.outCubic(k)) * (0.75 + 0.5 * hash1(i * 7.1));
    const r1 = r0 + (90 + 160 * hash1(i * 1.9)) * (1 - k);
    ctx.globalAlpha = (1 - k) * (0.5 + 0.5 * hash1(i * 5.7));
    ctx.lineWidth = 4 + 9 * hash1(i * 2.7);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.75);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

function moneyBurst(ctx, cx, cy, age, n, seed, power = 1) {
  if (age < 0 || age > 1.15) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const h = (k) => hash1(seed * 13.1 + i * 7.7 + k * 3.3);
    const a = -Math.PI / 2 + (h(1) - 0.5) * 2.7;
    const sp = (520 + 900 * h(2)) * power;
    const x = cx + Math.cos(a) * sp * age + (h(5) - 0.5) * 520;
    const y = cy + Math.sin(a) * sp * age + 1500 * age * age;
    const size = 44 + 62 * h(3);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((h(4) - 0.5) * 9 * age);
    ctx.globalAlpha = sat(1.25 - age / 0.9) * sat(age / 0.04);
    ctx.font = `${size}px Anton`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = size * 0.14;
    ctx.strokeText('$', 0, 0);
    ctx.shadowColor = 'rgba(40,255,120,0.9)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = h(6) > 0.3 ? GREEN : '#eafff0';
    ctx.fillText('$', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export class HUD {
  constructor(TL, cfg) {
    this.TL = TL;
    this.cfg = cfg;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
  }

  fmt(v) {
    return this.cfg.currency + v.toLocaleString('en-US');
  }

  speedLines(t) {
    const { ctx, TL } = this;
    const bell = (a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * prog(t, a, b)));
    let I = bell(TL.hook.out - 0.05, TL.hook.out + 0.3) * 0.6;
    for (const p of TL.pieces) I = Math.max(I, bell(p.enterStart - 0.06, p.land + 0.07), bell(p.exitStart - 0.02, p.exitEnd + 0.06) * 0.8);
    for (const tl of TL.finale.lands) I = Math.max(I, bell(tl - TL.finale.flyIn - 0.03, tl + 0.05) * 0.6);
    if (I < 0.02) return;
    ctx.save();
    for (let i = 0; i < 54; i++) {
      const y = hash1(i * 1.7) * H;
      const len = 260 + hash1(i * 2.3) * 760;
      const sp = 5200 + hash1(i * 3.1) * 5200;
      const x = ((t * sp + hash1(i * 5.3) * 3000) % (W + len * 2)) - len;
      const th = 2 + hash1(i * 4.1) * 7;
      const g = ctx.createLinearGradient(x - len, 0, x, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(255,${230 + Math.round(hash1(i) * 25)},${190 + Math.round(hash1(i * 9) * 60)},${(I * (0.2 + 0.65 * hash1(i * 6.1))).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(x - len, y, len, th);
    }
    ctx.restore();
  }

  hook(t) {
    const { ctx, TL } = this;
    const hk = TL.hook;
    if (t > hk.out + 0.3) return;
    const qx = prog(t, hk.out, hk.out + 0.24);
    const dx = 1500 * ease.inCubic(qx);
    ctx.save();
    ctx.globalAlpha = 0.32 * (1 - qx) * smooth(0, 0.2, t);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const ys = [640, 806, 1080];
    const sizes = [122, 132, 350];
    hk.lines.forEach((l, i) => {
      if (t < l.t) return;
      const a = prog(t, l.t, l.t + 0.13);
      const big = i === hk.lines.length - 1;
      text(ctx, l.text, W / 2 + dx, ys[i], sizes[i], {
        scale: lerp(2.5, 1, ease.outExpo(a)) * (1 + 0.04 * kick(t, l.t + 0.13, 0.12)),
        alpha: a * (1 - qx),
        rot: big ? -0.035 : 0,
        skew: -0.08,
        maxW: 960,
        stroke: '#000',
        track: big ? 4 : 3,
        fill: big ? (c, s) => {
          const g = c.createLinearGradient(0, -s * 0.42, 0, s * 0.42);
          g.addColorStop(0, '#f2fff5');
          g.addColorStop(0.45, '#62ff97');
          g.addColorStop(1, '#10d653');
          return g;
        } : '#fff',
        glow: big ? 'rgba(40,255,120,0.9)' : null,
        glowBlur: 50,
      });
    });
  }

  label(t, name, index, tIn, slideX, alpha, y, done) {
    const { ctx } = this;
    const a = prog(t, tIn, tIn + 0.12);
    if (a <= 0) return;
    text(ctx, index, W / 2 + slideX, y - 92, 40, { font: 'Oswald', weight: 700, track: 7, alpha: a * alpha, fill: GREEN, stroke: '#000', strokeW: 8, shadowBlur: 10, shadowY: 3 });
    text(ctx, name, W / 2 + slideX, y, 108, {
      scale: lerp(2.3, 1, ease.outExpo(a)) * (1 + 0.05 * kick(t, tIn + 0.12, 0.1)),
      alpha: a * alpha,
      skew: -0.08,
      maxW: 900,
      stroke: '#000',
      track: 3,
    });
    const w = 560 * ease.outCubic(prog(t, tIn + 0.06, tIn + 0.32));
    ctx.save();
    ctx.globalAlpha = a * alpha;
    ctx.fillStyle = done ? GREEN : '#fff';
    ctx.shadowColor = done ? GREEN : 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = done ? 22 : 8;
    ctx.fillRect(W / 2 + slideX - w / 2, y + 76, w, 8);
    ctx.restore();
  }

  pips(t, i, fill, done, slideX, alpha, y) {
    const { ctx, TL } = this;
    const n = TL.pieces.length;
    const pw = 66;
    const gap = 14;
    const x0 = W / 2 - (n * pw + (n - 1) * gap) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * (pw + gap);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 2, y - 2, pw + 4, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x, y, pw, 10);
      if (k < i || (k === i && done)) {
        ctx.fillStyle = GREEN;
        ctx.shadowColor = GREEN;
        ctx.shadowBlur = 14;
        ctx.fillRect(x, y, pw, 10);
      } else if (k === i) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, pw * sat(fill), 10);
      }
    }
    ctx.restore();
  }

  piece(p, t) {
    const { ctx, TL } = this;
    const n = TL.pieces.length;
    const qx = prog(t, p.exitStart, p.exitEnd);
    const dx = 1500 * ease.inCubic(qx);
    const alpha = 1 - qx;
    const done = t >= p.slam;
    const pad = (v) => String(v).padStart(2, '0');

    this.label(t, p.name, `${pad(p.index + 1)} / ${pad(n)}`, p.land, dx, alpha, L.labelY, done);
    if (t >= p.land) this.pips(t, p.index, prog(t, p.land, p.slam), done, dx, alpha * prog(t, p.land, p.land + 0.15), L.labelY + 118);

    // scan brackets
    if (t >= p.sweepStart - 0.02 && t < p.slam + 0.25) {
      const a = prog(t, p.sweepStart - 0.02, p.sweepStart + 0.1);
      const out = prog(t, p.slam, p.slam + 0.22);
      const sc = lerp(1.14, 1, ease.outCubic(a)) + 0.14 * ease.outCubic(out) - 0.03 * kick(t, p.sweepEnd, 0.08);
      const bw = 850 * sc;
      const bh = 770 * sc;
      brackets(ctx, L.itemX, L.itemY, bw, bh, 80, 7, a * (1 - out) * alpha, GREEN);
      const scanning = t < p.sweepEnd;
      const blink = 0.55 + 0.45 * Math.sign(Math.sin(t * 34));
      text(ctx, scanning ? 'SCANNING' : 'PRICING', L.itemX - bw / 2 + 26, L.itemY - bh / 2 + 44, 32, { font: 'Oswald', weight: 600, align: 'left', track: 6, fill: GREEN, alpha: a * (1 - out) * (scanning ? blink : 1), stroke: '#000', strokeW: 7, shadowBlur: 8, shadowY: 2 });
      const pct = scanning ? Math.round(prog(t, p.sweepStart, p.sweepEnd) * 100) : 100;
      text(ctx, `${pct}%`, L.itemX + bw / 2 - 26, L.itemY - bh / 2 + 44, 32, { font: 'Oswald', weight: 600, align: 'right', track: 3, fill: GREEN, alpha: a * (1 - out), stroke: '#000', strokeW: 7, shadowBlur: 8, shadowY: 2 });
    }

    // price counter
    if (t >= p.countStart) {
      const q = prog(t, p.countStart, p.countEnd);
      const val = done ? p.price : countValue(p.price, q);
      const age = t - p.slam;
      let scale;
      let rot = 0;
      let y = L.priceY;
      if (!done) {
        const tick = hash1(val * 1.37);
        scale = lerp(0.3, 1, ease.outBack(prog(t, p.countStart, p.countStart + 0.13))) * lerp(0.86, 1.0, q) * (1 + 0.035 * tick);
        y += (tick - 0.5) * 12 * (1 - q);
      } else {
        scale = 1 + 0.55 * kick(t, p.slam, 0.08) + 0.035 * Math.sin(age * 9) * Math.exp(-age / 0.45);
        rot = -0.035 * (1 - Math.exp(-age / 0.05));
        rays(ctx, W / 2 + dx, L.priceY, age, 22, 0.38, 'rgba(160,255,195,0.95)', 620);
      }
      if (done) moneyBurst(ctx, W / 2 + dx, L.priceY - 40, age, 14, p.index + 1);
      drawPrice(ctx, this.fmt(val), W / 2 + dx, y, 262, { scale, rot, alpha, final: done });
      text(ctx, 'EST. PRICE  ·  USD', W / 2 + dx, L.priceY + 158, 36, { font: 'Oswald', weight: 600, track: 9, fill: 'rgba(255,255,255,0.9)', alpha: alpha * prog(t, p.countStart, p.countStart + 0.2), stroke: '#000', strokeW: 7, shadowBlur: 8, shadowY: 2 });
    }
  }

  finale(t) {
    const { ctx, TL, cfg } = this;
    const F = TL.finale;
    const n = TL.pieces.length;
    const done = t >= F.slam;
    const landed = F.lands.filter((tl) => t >= tl).length;
    this.label(t, cfg.finale.name, `${landed} / ${n} PIECES`, F.T, 0, 1, L.fLabelY, done);

    if (t >= F.sweepStart - 0.02 && t < F.slam + 0.3) {
      const a = prog(t, F.sweepStart - 0.02, F.sweepStart + 0.1);
      const out = prog(t, F.slam, F.slam + 0.25);
      const sc = lerp(1.12, 1, ease.outCubic(a)) + 0.12 * ease.outCubic(out);
      const bw = 900 * sc;
      const bh = 1000 * sc;
      brackets(ctx, W / 2, 800, bw, bh, 90, 8, a * (1 - out), GREEN);
      const scanning = t < F.sweepEnd;
      const blink = 0.55 + 0.45 * Math.sign(Math.sin(t * 34));
      text(ctx, scanning ? 'SCANNING SET' : 'ADDING UP', W / 2 - bw / 2 + 28, 800 - bh / 2 + 46, 32, { font: 'Oswald', weight: 600, align: 'left', track: 6, fill: GREEN, alpha: a * (1 - out) * (scanning ? blink : 1), stroke: '#000', strokeW: 7, shadowBlur: 8, shadowY: 2 });
    }

    if (t >= F.countStart) {
      const q = prog(t, F.countStart, F.countEnd);
      const val = done ? F.total : countValue(F.total, q);
      const age = t - F.slam;
      // TOTAL COST pill
      const pa = ease.outBack(prog(t, F.countStart, F.countStart + 0.16));
      ctx.save();
      ctx.translate(W / 2, L.fPriceY - 172);
      ctx.scale(pa * (1 + 0.12 * kick(t, F.slam, 0.1)), pa * (1 + 0.12 * kick(t, F.slam, 0.1)));
      ctx.rotate(-0.03);
      ctx.fillStyle = GREEN;
      ctx.shadowColor = 'rgba(40,255,120,0.8)';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.roundRect(-205, -40, 410, 80, 12);
      ctx.fill();
      ctx.restore();
      text(ctx, cfg.finale.tag, W / 2, L.fPriceY - 170, 60, { scale: pa * (1 + 0.12 * kick(t, F.slam, 0.1)), rot: -0.03, fill: INK, track: 5, maxW: 370 });

      let scale;
      let rot = 0;
      let y = L.fPriceY;
      if (!done) {
        const tick = hash1(val * 1.37);
        scale = lerp(0.3, 1, ease.outBack(prog(t, F.countStart, F.countStart + 0.15))) * lerp(0.8, 1.0, q) * (1 + 0.03 * tick);
        y += (tick - 0.5) * 12 * (1 - q);
      } else {
        const beatPulse = Math.pow(0.5 + 0.5 * Math.cos(((age % TL.beat) / TL.beat) * Math.PI * 2), 6);
        scale = 1 + 0.7 * kick(t, F.slam, 0.1) + 0.03 * beatPulse;
        rot = -0.04 * (1 - Math.exp(-age / 0.05));
        rays(ctx, W / 2, L.fPriceY, age, 34, 0.5, 'rgba(160,255,195,0.95)', 900);
        rays(ctx, W / 2, L.fPriceY, age - 0.12, 26, 0.5, 'rgba(255,255,255,0.8)', 760);
      }
      if (done) {
        moneyBurst(ctx, W / 2, L.fPriceY - 60, age, 46, 99, 1.25);
        moneyBurst(ctx, W / 2, L.fPriceY - 60, age - 0.18, 30, 57, 1.0);
      }
      drawPrice(ctx, this.fmt(val), W / 2, y, 300, { scale, rot, alpha: 1, final: done });
    }
  }

  draw(t) {
    const { ctx, TL } = this;
    ctx.clearRect(0, 0, W, H);
    // legibility scrims
    let g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, 'rgba(0,0,0,0.66)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 600);
    g = ctx.createLinearGradient(0, 1140, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 1140, W, H - 1140);

    this.speedLines(t);
    this.hook(t);
    for (const p of TL.pieces) {
      if (t < p.land - 0.02 || t > p.exitEnd + 0.05) continue;
      this.piece(p, t);
    }
    if (t >= TL.finale.T - 0.02) this.finale(t);
  }
}
