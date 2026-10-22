// Screen-space overlay rendered in the same WebGL canvas after post-processing,
// so captured frames contain text without relying on DOM compositing.
// Coordinates are in output pixels with (0,0) at the top-left of the 1080x1920 frame.
import * as THREE from 'three';
import { FONT } from './textures.js';
import { radialTexture } from './textures.js';

export const SAFE = { left: 90, right: 950, top: 250, bottom: 1440 }; // Shorts UI-safe region

export class Hud {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, W, 0, -H, -10, 10);
    this.cache = new Map();
    this.used = new Set();
    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    this.fadeMesh.position.set(W / 2, -H / 2, 0);
    this.fadeMesh.renderOrder = 100;
    this.scene.add(this.fadeMesh);
    const vtex = radialTexture('rgba(0,0,0,0)', 'rgba(0,0,0,0.9)', 256);
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, H * 1.25), new THREE.MeshBasicMaterial({ map: vtex, transparent: true, opacity: 0.55, depthTest: false, toneMapped: false }));
    this.vignette.position.set(W / 2, -H / 2, -1);
    this.vignette.renderOrder = 0;
    this.scene.add(this.vignette);
  }

  begin() {
    this.used.clear();
    this.fadeMesh.material.opacity = 0;
    this.vignette.material.opacity = 0.55;
  }

  /** Paint a multi-line text block to a canvas (cached by content+style). */
  _make(lines, o) {
    const key = JSON.stringify([lines, o.align, o.box, o.accent]);
    if (this.cache.has(key)) return this.cache.get(key);
    const pad = 36;
    const measure = document.createElement('canvas').getContext('2d');
    let w = 0, h = 0;
    const metrics = lines.map((l) => {
      measure.font = `${l.weight || 900} ${l.size}px ${l.font || FONT}`;
      if (l.tracking) measure.letterSpacing = `${l.tracking}px`; else measure.letterSpacing = '0px';
      const mw = measure.measureText(l.text).width;
      const lh = l.size * (l.lh || 1.12);
      w = Math.max(w, mw); h += lh;
      return { mw, lh };
    });
    const cw = Math.ceil(w + pad * 2 + (o.accent ? 28 : 0)), ch = Math.ceil(h + pad * 2);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    if (o.box) {
      g.fillStyle = o.box;
      const r = 26;
      g.beginPath(); g.roundRect(pad * 0.35, pad * 0.35, cw - pad * 0.7, ch - pad * 0.7, r); g.fill();
    }
    if (o.accent) { g.fillStyle = o.accent; g.fillRect(pad * 0.35 + 18, pad + 6, 12, h - 12); }
    let y = pad;
    lines.forEach((l, i) => {
      const { mw, lh } = metrics[i];
      g.font = `${l.weight || 900} ${l.size}px ${l.font || FONT}`;
      g.letterSpacing = l.tracking ? `${l.tracking}px` : '0px';
      g.textBaseline = 'middle';
      const x = o.align === 'left' ? pad + (o.accent ? 44 : 0) : (cw - mw) / 2;
      const cy = y + lh / 2;
      g.lineJoin = 'round';
      g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 18; g.shadowOffsetY = 5;
      g.strokeStyle = 'rgba(8,10,14,0.92)'; g.lineWidth = Math.max(6, l.size * 0.13);
      g.strokeText(l.text, x, cy);
      g.shadowColor = 'transparent';
      g.fillStyle = l.color || '#ffffff';
      g.fillText(l.text, x, cy);
      y += lh;
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
    m.renderOrder = 10;
    m.userData.size = [cw, ch];
    this.scene.add(m);
    this.cache.set(key, m);
    return m;
  }

  /**
   * Show text this frame.
   * lines: string | [{text,size,color,weight,font}] ; o: {x,y (centre px), opacity, scale, align, box, accent}
   */
  text(lines, o = {}) {
    if (typeof lines === 'string') lines = [{ text: lines, size: o.size || 104, color: o.color }];
    const m = this._make(lines, o);
    const [cw, ch] = m.userData.size;
    const fit = Math.min(1, (SAFE.right - SAFE.left + 50) / cw);
    const sc = (o.scale ?? 1) * fit;
    let x = o.x ?? this.W / 2;
    if (o.align === 'left') x = x + (cw * sc) / 2;
    // clamp horizontally into the safe region
    const half = (cw * sc) / 2;
    x = Math.min(Math.max(x, SAFE.left + half - 30), SAFE.right - half + 30);
    m.position.set(x, -(o.y ?? 420), 1);
    m.scale.setScalar(sc);
    m.material.opacity = Math.max(0, Math.min(1, o.opacity ?? 1));
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
