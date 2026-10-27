'use strict';
// Small math and data helpers shared by every module.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const pick = arr => arr[(Math.random() * arr.length) | 0];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const fmtInt = n => Math.round(n).toLocaleString('en-US');
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
const turnToward = (a, target, maxStep) => a + clamp(angleDiff(a, target), -maxStep, maxStep);

// In-place compaction that keeps draw order stable.
function removeDead(arr, onRemove) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o.dead) arr[j++] = o; else if (onRemove) onRemove(o);
  }
  arr.length = j;
}

// Piecewise-linear lookup over [[x, value], ...]; value is a number or an [r, g, b] triple.
function curve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, v1] = points[i];
    if (x <= x1) {
      const [x0, v0] = points[i - 1];
      const t = (x - x0) / (x1 - x0);
      if (typeof v0 === 'number') return lerp(v0, v1, t);
      return [lerp(v0[0], v1[0], t), lerp(v0[1], v1[1], t), lerp(v0[2], v1[2], t)];
    }
  }
  return points[points.length - 1][1];
}
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function weightedPick(items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Uniform grid broad phase. Buckets are pooled so a frame allocates nothing once warm.
class Grid {
  constructor(cell) {
    this.cell = cell; this.inv = 1 / cell;
    this.map = new Map(); this.pool = []; this.live = [];
  }
  clear() {
    for (const b of this.live) { b.length = 0; this.pool.push(b); }
    this.live.length = 0;
    this.map.clear();
  }
  insert(o) {
    const cx = Math.floor(o.x * this.inv), cy = Math.floor(o.y * this.inv);
    const k = ((cx & 0xffff) << 16) | (cy & 0xffff);
    let b = this.map.get(k);
    if (!b) { b = this.pool.pop() || []; this.map.set(k, b); this.live.push(b); }
    b.push(o);
  }
  query(x, y, r, out) {
    out.length = 0;
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.map.get(((cx & 0xffff) << 16) | (cy & 0xffff));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}

// localStorage can be missing or throw (private windows, sandboxed previews); never depend on it.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('lanternfish:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('lanternfish:' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};
