// Screen-space overlay drawn into the same WebGL canvas after post-processing:
// karaoke lyrics (syllable highlight + a hopping star), and full-frame colour flashes.
// Coordinates are output pixels with (0, 0) at the top-left of the 1080x1920 frame.
import * as THREE from 'three';
import { FONT } from './textures.js';
import { clamp, ease } from './util.js';

// Shorts UI covers the bottom ~470 px (title, channel, music) and a column of buttons on
// the right; lyrics stay inside this box.
export const SAFE = { left: 90, right: 900, top: 230, bottom: 1440 };

const STYLE = { size: 92, weight: 700, fill: '#ffffff', stroke: '#5b2bb5', strokeW: 18, shadow: 'rgba(40,10,80,0.55)' };

export class Hud {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, W, 0, -H, -10, 10);
    this.cache = new Map();
    this.used = new Set();
    this.measureCtx = document.createElement('canvas').getContext('2d');
    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    this.fadeMesh.position.set(W / 2, -H / 2, 0);
    this.fadeMesh.renderOrder = 0;            // flashes sit under the lyrics so words stay readable
    this.scene.add(this.fadeMesh);
  }

  begin() {
    this.used.clear();
    this.fadeMesh.material.opacity = 0;
  }

  measure(text, st = STYLE) {
    this.measureCtx.font = `${st.weight} ${st.size}px ${FONT}`;
    return this.measureCtx.measureText(text).width;
  }

  _make(text, st, id = '') {
    const key = JSON.stringify([id, text, st]);
    if (this.cache.has(key)) return this.cache.get(key);
    const pad = st.strokeW + 14;
    const w = Math.ceil(this.measure(text, st) + pad * 2), h = Math.ceil(st.size * 1.3 + pad * 2);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.font = `${st.weight} ${st.size}px ${FONT}`;
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    const y = h / 2 + st.size * 0.04;
    g.shadowColor = st.shadow; g.shadowBlur = 16; g.shadowOffsetY = 8;
    g.strokeStyle = st.stroke; g.lineWidth = st.strokeW;
    g.strokeText(text, pad, y);
    g.shadowColor = 'transparent';
    g.fillStyle = st.fill; g.fillText(text, pad, y);
    // glossy top highlight on the letters
    g.globalCompositeOperation = 'source-atop';
    const grd = g.createLinearGradient(0, y - st.size * 0.55, 0, y + st.size * 0.1);
    grd.addColorStop(0, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, y);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
    m.renderOrder = 10;
    m.userData = { w, h, pad };
    this.scene.add(m);
    this.cache.set(key, m);
    return m;
  }

  /** Draw text with its left edge (of the glyphs) at x and vertical centre y. */
  token(text, x, y, { style = STYLE, scale = 1, opacity = 1, rot = 0, id = '' } = {}) {
    const m = this._make(text, style, id);
    const { w, pad } = m.userData;
    const glyphW = w - pad * 2;
    m.position.set(x + (glyphW / 2) * scale, -y, 1);
    m.scale.setScalar(scale);
    m.rotation.z = rot;
    m.material.opacity = clamp(opacity);
    this.used.add(m);
    return m;
  }

  /** A cached canvas image (drawn once by draw(g, w, h)), centred at (x, y). */
  image(key, w, h, draw, x, y, { scale = 1, opacity = 1, rot = 0, order = 12 } = {}) {
    let m = this.cache.get('img:' + key);
    if (!m) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
      this.scene.add(m);
      this.cache.set('img:' + key, m);
    }
    m.renderOrder = order;
    m.position.set(x, -y, 1);
    m.scale.setScalar(scale);
    m.rotation.z = rot;
    m.material.opacity = clamp(opacity);
    this.used.add(m);
    return m;
  }

  fade(color, alpha) {
    this.fadeMesh.material.color.set(color);
    this.fadeMesh.material.opacity = Math.max(this.fadeMesh.material.opacity, alpha);
  }

  render(renderer) {
    for (const m of this.cache.values()) m.visible = this.used.has(m) && m.material.opacity > 0.003;
    this.fadeMesh.visible = this.fadeMesh.material.opacity > 0.003;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}

export const LYRIC_STYLE = STYLE;
export const ACTIVE_STYLE = { ...STYLE, fill: '#ffe14d', stroke: '#c2185b' };

/**
 * Split a lyric line into display tokens (one per syllable, carrying the word's
 * punctuation and trailing space) and two rows.
 */
export function layoutLine(line, hud, breakAt) {
  const words = line.text.split(' ');
  const toks = [];
  let si = 0;
  for (const word of words) {
    const letters = word.replace(/[^A-Za-z']/g, '').toLowerCase();
    let acc = '', first = si;
    while (si < line.syllables.length && acc.length < letters.length) acc += line.syllables[si++].t.toLowerCase();
    let pos = 0;
    for (let k = first; k < si; k++) {
      const n = line.syllables[k].t.length;
      let piece = word.slice(pos, pos + n);
      pos += n;
      if (k === si - 1) piece += word.slice(pos);          // trailing punctuation
      toks.push({ syl: line.syllables[k], text: piece, space: k === si - 1 });
    }
  }
  const rows = [toks.slice(0, breakAt), toks.slice(breakAt)];
  const out = [];
  rows.forEach((row, ri) => {
    const space = hud.measure(' ');
    const widths = row.map((t) => hud.measure(t.text));
    const total = widths.reduce((a, b) => a + b, 0) + row.filter((t, i) => t.space && i < row.length - 1).length * space;
    const fit = Math.min(1, (SAFE.right - SAFE.left) / total);
    let x = (SAFE.left + SAFE.right) / 2 - (total * fit) / 2;
    row.forEach((t, i) => {
      out.push({ ...t, x, row: ri, w: widths[i] * fit, fit });
      x += (widths[i] + (t.space ? space : 0)) * fit;
    });
  });
  return out;
}
