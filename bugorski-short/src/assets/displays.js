// Canvas-driven screens redrawn as a pure function of time (deterministic).
import * as THREE from 'three';
import { FONT, FONT_BOLD } from '../core/textures.js';
import { hash1 } from '../core/util.js';

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

/** Oscilloscope: clean sine that turns into noisy glitches when `glitch` > 0. */
export class Scope {
  constructor() { Object.assign(this, canvasTex(512, 340)); }
  draw(t, glitch = 0) {
    const { g, c } = this;
    g.fillStyle = '#04140c'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(80,255,150,0.15)'; g.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 340); g.stroke(); }
    for (let y = 0; y <= 340; y += 68) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.strokeStyle = glitch > 0.5 && Math.floor(t * 12) % 2 ? '#ffd040' : '#5dff9a';
    g.lineWidth = 5; g.shadowColor = g.strokeStyle; g.shadowBlur = 14;
    g.beginPath();
    for (let x = 0; x <= 512; x += 4) {
      const ph = x * 0.04 + t * 9;
      let y = Math.sin(ph) * 70;
      const n = hash1(Math.floor(x / 8) * 3.1 + Math.floor(t * 20) * 17.7);
      y += glitch * (n - 0.5) * 220 * (hash1(Math.floor(t * 7) + x * 0.001) > 0.4 ? 1 : 0.2);
      if (x === 0) g.moveTo(x, 170 + y); else g.lineTo(x, 170 + y);
    }
    g.stroke(); g.shadowBlur = 0;
    if (glitch > 0.3) {
      g.fillStyle = Math.floor(t * 6) % 2 ? '#ffd040' : 'rgba(255,208,64,0.25)';
      g.font = `900 46px ${FONT}`; g.fillText('ERROR', 20, 52);
    }
    this.t.needsUpdate = true;
  }
}

export function gaugeTexture() {
  const { g, t } = canvasTex(256, 256);
  g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const r0 = i % 5 === 0 ? 86 : 96;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke();
  }
  g.strokeStyle = '#d02020'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 106, Math.PI * 1.85, Math.PI * 2.25); g.stroke();
  g.fillStyle = '#1a1a1a'; g.font = `700 26px ${FONT_BOLD}`; g.textAlign = 'center';
  g.fillText('BEAM I', 128, 190);
  return t;
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
/** Tear-off wall calendar page for day offset `d` from 13 July 1978 (the accident). */
export function drawCalendarPage(g, w, h, d) {
  const date = new Date(Date.UTC(1978, 6, 13 + d));
  g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c0261f'; g.fillRect(0, 0, w, h * 0.24);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${h * 0.11}px ${FONT}`;
  g.fillText(`${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`, w / 2, h * 0.125);
  g.fillStyle = '#1b1b1b';
  g.font = `900 ${h * 0.5}px ${FONT}`;
  g.fillText(String(date.getUTCDate()), w / 2, h * 0.62);
}

export class Calendar {
  constructor() {
    this.page = canvasTex(400, 500);
    this.flip = canvasTex(400, 500);
    this.last = [null, null];
  }
  draw(dayFloat) {
    const d = Math.floor(dayFloat);
    if (this.last[0] !== d) { drawCalendarPage(this.page.g, 400, 500, d + 1); this.page.t.needsUpdate = true; this.last[0] = d; }
    if (this.last[1] !== d) { drawCalendarPage(this.flip.g, 400, 500, d); this.flip.t.needsUpdate = true; this.last[1] = d; }
    return dayFloat - d; // flip progress of the top page
  }
}

/** Bedside ECG monitor; `alive` keeps a steady rhythm. */
export class Monitor {
  constructor() { Object.assign(this, canvasTex(512, 320)); }
  draw(t, bpm = 72) {
    const { g, c } = this;
    g.fillStyle = '#031008'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(60,255,120,0.12)'; g.lineWidth = 2;
    for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 320); g.stroke(); }
    const period = 60 / bpm, span = 3.0;
    g.strokeStyle = '#43ff88'; g.lineWidth = 6; g.shadowColor = '#43ff88'; g.shadowBlur = 16;
    g.beginPath();
    for (let x = 0; x <= 512; x += 2) {
      const tt = t - span + (x / 512) * span;
      const ph = ((tt % period) + period) % period / period;
      let y = 0;
      if (ph > 0.1 && ph < 0.16) y = Math.sin((ph - 0.1) / 0.06 * Math.PI) * 18;
      else if (ph > 0.2 && ph < 0.23) y = -(ph - 0.2) / 0.03 * 30;
      else if (ph >= 0.23 && ph < 0.26) y = -30 + (ph - 0.23) / 0.03 * 150;
      else if (ph >= 0.26 && ph < 0.29) y = 120 - (ph - 0.26) / 0.03 * 140;
      else if (ph >= 0.29 && ph < 0.31) y = -20 + (ph - 0.29) / 0.02 * 20;
      else if (ph > 0.42 && ph < 0.55) y = Math.sin((ph - 0.42) / 0.13 * Math.PI) * 26;
      const py = 175 - y;
      if (x === 0) g.moveTo(x, py); else g.lineTo(x, py);
    }
    g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#43ff88'; g.font = `900 64px ${FONT}`; g.textAlign = 'right';
    g.fillText(String(bpm), 490, 70);
    g.font = `700 26px ${FONT_BOLD}`; g.fillText('HR', 490, 108);
    this.t.needsUpdate = true;
  }
}
