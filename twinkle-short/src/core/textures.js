// Procedural canvas textures (no image assets). All randomness is seeded.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const FONT = 'Fredoka';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

const _rad = new Map();
/** Soft radial blob (for glows, blush, bokeh). Cached by colours. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const key = inner + outer + size;
  if (_rad.has(key)) return _rad.get(key);
  const c = canvas(size, size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _rad.set(key, t);
  return t;
}

/** Four-point twinkle (cross flare with a soft core), white; tint with material colour. */
let _spark = null;
export function sparkleTexture() {
  if (_spark) return _spark;
  const s = 128, c = canvas(s, s), g = c.getContext('2d');
  const h = s / 2;
  const core = g.createRadialGradient(h, h, 0, h, h, h * 0.35);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, s, s);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? h * 0.12 : h * 0.98;
    g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  _spark = new THREE.CanvasTexture(c); _spark.colorSpace = THREE.SRGBColorSpace;
  return _spark;
}

/** Pyjama fabric: soft blue with little yellow stars and white dots. */
export function pyjamaTexture(base = '#7cc6ff') {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  const r = mulberry32(4);
  const star = (x, y, rad, col) => {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? rad * 0.45 : rad; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = (i + 0.5) * 64 + (j % 2) * 32, y = (j + 0.5) * 64;
    star(x % s, y, 13, '#ffe066');
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc((x + 32) % s, y + 30, 4 + r() * 2, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { repeat: [3, 3] });
}

/** Night-cap stripes. */
export function stripeTexture(a = '#7cc6ff', b = '#ffffff', n = 6) {
  const c = canvas(64, 256), g = c.getContext('2d');
  for (let i = 0; i < n * 2; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, (i / (n * 2)) * 256, 64, 256 / (n * 2) + 1); }
  return tex(c);
}

/** Mushroom cap: coral red with soft white spots (equirect-ish UVs of a sphere). */
export function mushroomTexture() {
  const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#ff6f86'); grd.addColorStop(0.55, '#ff4f6a'); grd.addColorStop(1, '#e8405c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const r = mulberry32(9);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = 18 + r() * (h * 0.55), rad = 10 + r() * 20;
    for (const dx of [-w, 0, w]) {
      g.fillStyle = '#fff8ef'; g.beginPath(); g.ellipse(x + dx, y, rad, rad * (0.55 + 0.4 * (1 - y / h)), 0, 0, Math.PI * 2); g.fill();
    }
  }
  return tex(c);
}

/** Wood grain for the window frame and door. */
export function woodTexture(seed = 5, base = [196, 132, 78]) {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, s, s);
  const r = mulberry32(seed);
  for (let i = 0; i < 60; i++) {
    const y = r() * s, d = (r() - 0.5) * 40;
    g.strokeStyle = `rgba(${base[0] - 50},${base[1] - 45},${base[2] - 35},${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + d, s * 0.6, y - d, s, y + d * 0.3); g.stroke();
  }
  return tex(c);
}

/** Grass: two greens with tiny flecks (tiles over the planet). */
export function grassTexture() {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  g.fillStyle = '#5fcf63'; g.fillRect(0, 0, s, s);
  const r = mulberry32(3);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(130,232,110,0.55)' : 'rgba(60,170,80,0.45)';
    g.fillRect(r() * s, r() * s, 2, 4 + r() * 5);
  }
  return tex(c, { repeat: [10, 10] });
}
