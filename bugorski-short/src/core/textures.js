// Procedural canvas textures (no image assets needed). All randomness is seeded.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const FONT = 'InterBlack';
export const FONT_BOLD = 'InterBold';

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

/** Speckled concrete with faint seams. */
export function concreteTexture(seed = 1, base = [128, 126, 120], size = 512) {
  const c = canvas(size, size), g = c.getContext('2d');
  const r = mulberry32(seed);
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const v = (r() - 0.5) * 40;
    g.fillStyle = `rgba(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0},${0.35 + r() * 0.4})`;
    const s = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, s, s);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
    g.beginPath(); g.arc(r() * size, r() * size, 10 + r() * 60, 0, Math.PI * 2); g.fill();
  }
  return c;
}

/** Industrial floor tiles: concrete with grid seams. */
export function floorTexture(seed = 2) {
  const c = concreteTexture(seed, [104, 107, 110], 512), g = c.getContext('2d');
  g.strokeStyle = 'rgba(30,32,36,0.55)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 512, 512);
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  return c;
}

export function hazardTexture() {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#16161a';
  for (let x = -64; x < 320; x += 64) {
    g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.fill();
  }
  return c;
}

/** Radiation trefoil on yellow — used for the "lethal dose" blocks. */
export function trefoilTexture() {
  const s = 512, c = canvas(s, s), g = c.getContext('2d');
  g.fillStyle = '#f5c518'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 18; g.strokeRect(9, 9, s - 18, s - 18);
  g.fillStyle = '#141414';
  const cx = s / 2, cy = s / 2, R = 170, r0 = 44;
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + i * (2 * Math.PI / 3) - Math.PI / 6;
    g.beginPath();
    g.arc(cx, cy, R, a0, a0 + Math.PI / 3);
    g.arc(cx, cy, r0 + 22, a0 + Math.PI / 3, a0, true);
    g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(cx, cy, r0, 0, Math.PI * 2); g.fill();
  return c;
}

/** Sign / label plate. */
export function labelTexture(text, { w = 512, h = 128, bg = '#20262b', fg = '#f2f2f2', font = FONT, size = 64, border = null, sub = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${size}px ${font}`;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) { g.font = `700 ${size * 0.5}px ${FONT_BOLD}`; g.fillText(sub, w / 2, h * 0.75); }
  return c;
}

/** Chalkboard with physics equations. */
export function chalkboardTexture() {
  const c = canvas(1024, 512), g = c.getContext('2d');
  g.fillStyle = '#1f3a2e'; g.fillRect(0, 0, 1024, 512);
  const r = mulberry32(7);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * 1024, r() * 512, 40 + r() * 120, 2 + r() * 8); }
  g.fillStyle = 'rgba(240,240,230,0.92)';
  g.font = `700 54px ${FONT_BOLD}`;
  g.fillText('E² = (pc)² + (mc²)²', 60, 110);
  g.fillText('γ = 1 / √(1 − v²/c²)', 60, 210);
  g.fillText('F = q(E + v × B)', 60, 310);
  g.font = `700 46px ${FONT_BOLD}`;
  g.fillText('p⁺  76 GeV', 640, 110);
  g.fillText('v ≈ 0.9999c', 640, 210);
  g.strokeStyle = 'rgba(240,240,230,0.8)'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(800, 380, 150, 70, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(950, 380, 10, 0, Math.PI * 2); g.fill();
  return c;
}

/** Wood grain for desks. */
export function woodTexture(seed = 3) {
  const c = canvas(512, 512), g = c.getContext('2d');
  const r = mulberry32(seed);
  g.fillStyle = '#6b4226'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const y = r() * 512, a = 0.05 + r() * 0.12;
    g.strokeStyle = r() > 0.5 ? `rgba(40,20,8,${a})` : `rgba(160,110,70,${a})`;
    g.lineWidth = 1 + r() * 4;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 6);
    g.stroke();
  }
  return c;
}

/** Vertical sky gradient. */
export function gradientTexture(stops, h = 512) {
  const c = canvas(4, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 4, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial dot used for glows/flares. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = canvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
