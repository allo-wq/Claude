// Shared cartoon face parts: big glossy eyes with lids, happy "^ ^" arcs and sparkle
// highlights; a canvas-drawn mouth that morphs between smile, open grin, "O" and yawn;
// soft blush. Everything is driven by plain numbers so any frame can be posed alone.
import * as THREE from 'three';
import { canvas } from '../core/textures.js';
import { clamp, lerp } from '../core/util.js';

const _iris = new Map();
/** Painted iris + pupil + catch-lights; `sparkle` adds star-shaped highlights. */
function irisTexture(color = '#3a2a6a', sparkle = false) {
  const key = color + sparkle;
  if (_iris.has(key)) return _iris.get(key);
  const s = 256, c = canvas(s, s), g = c.getContext('2d'), h = s / 2;
  const grd = g.createRadialGradient(h, h * 1.15, 4, h, h, h);
  grd.addColorStop(0, '#120a1e'); grd.addColorStop(0.42, '#1d1230'); grd.addColorStop(0.7, color); grd.addColorStop(0.93, color); grd.addColorStop(1, '#140c22');
  g.fillStyle = grd; g.beginPath(); g.arc(h, h, h - 1, 0, Math.PI * 2); g.fill();
  // lower-half glow: makes the eyes look wet and alive
  const lg = g.createRadialGradient(h, h * 1.55, 2, h, h * 1.55, h * 0.7);
  lg.addColorStop(0, 'rgba(255,255,255,0.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg; g.beginPath(); g.arc(h, h, h - 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  if (sparkle) {
    const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    star(h * 0.68, h * 0.62, h * 0.42); star(h * 1.38, h * 1.36, h * 0.2);
    g.beginPath(); g.arc(h * 1.36, h * 0.66, h * 0.08, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath(); g.ellipse(h * 0.66, h * 0.6, h * 0.27, h * 0.22, -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(h * 1.34, h * 1.36, h * 0.11, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(h * 1.12, h * 0.52, h * 0.06, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _iris.set(key, t);
  return t;
}

export class Eye {
  /**
   * @param {object} o  r: eye radius; lid: lid colour; iris: iris colour; sy: vertical stretch; depth: z squash
   */
  constructor(o = {}) {
    this.o = { r: 0.13, lid: 0xffd23f, iris: '#3a2a6a', sy: 1.18, depth: 0.55, ...o };
    const { r, sy, depth } = this.o;
    this.group = new THREE.Group();
    this.white = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xfbfbff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
    this.white.scale.set(1, sy, depth);
    this.group.add(this.white);
    this.lookG = new THREE.Group();
    this.group.add(this.lookG);
    const irisGeo = new THREE.CircleGeometry(r * 0.72, 40);
    this.irisMat = new THREE.MeshBasicMaterial({ map: irisTexture(this.o.iris), transparent: true, toneMapped: true });
    this.irisSparkMat = new THREE.MeshBasicMaterial({ map: irisTexture(this.o.iris, true), transparent: true });
    this.iris = new THREE.Mesh(irisGeo, this.irisMat);
    this.iris.scale.set(1, sy * 0.98, 1);
    this.iris.position.z = r * depth * 0.985;
    this.lookG.add(this.iris);
    // upper lid: a cap of body colour that rotates down over the eye
    const lidMat = new THREE.MeshPhysicalMaterial({ color: this.o.lid, roughness: 0.45, clearcoat: 0.6, emissive: new THREE.Color(this.o.lid).multiplyScalar(this.o.lidGlow ?? 0) });
    this.lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.07, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    this.lidPivot = new THREE.Group();
    this.lidPivot.scale.set(1, sy, depth * 1.04);
    this.lidPivot.add(this.lid);
    this.group.add(this.lidPivot);
    this.lower = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
    this.lowerPivot = new THREE.Group();
    this.lowerPivot.scale.set(1, sy, depth * 1.03);
    this.lowerPivot.add(this.lower);
    this.group.add(this.lowerPivot);
    // happy closed eye: dark arc "^"
    this.arc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, r * 0.13, 10, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a1530, roughness: 0.5 }));
    this.arc.position.z = r * depth * 1.12;
    this.group.add(this.arc);
    this.set({});
  }

  /** open 0..1, look [x,y] −1..1, happy 0..1 (closed "^"), sleep 0..1 (closed "‿"), sparkle bool, squint 0..1, pupil scale */
  set({ open = 1, look = [0, 0], happy = 0, sleep = 0, sparkle = false, squint = 0, pupil = 1 } = {}) {
    const { r, sy, depth } = this.o;
    const closed = Math.max(1 - clamp(open), clamp(happy), clamp(sleep));
    this.lid.rotation.x = lerp(-1.35, Math.PI / 2 + 0.04, closed);
    this.lower.rotation.x = lerp(1.25, 0.55, clamp(squint));
    const showArc = happy > 0.55 || sleep > 0.55;
    this.arc.visible = showArc;
    this.arc.scale.setScalar(showArc ? 1 : 0.01);
    this.arc.rotation.z = sleep > 0.55 ? Math.PI : 0;              // "‿" asleep, "^" happy
    this.arc.position.y = sleep > 0.55 ? this.o.r * 0.25 : 0;
    this.lookG.position.set(look[0] * r * 0.28, look[1] * r * 0.3 * sy, 0);
    this.lookG.rotation.y = look[0] * 0.25;
    this.iris.material = sparkle ? this.irisSparkMat : this.irisMat;
    this.iris.scale.set(pupil, sy * 0.98 * pupil, 1);
    this.white.visible = this.iris.visible = closed < 0.97;
  }
}

/**
 * Canvas mouth. Parameters: smile (−1 frown … 1 big smile), open (0 closed line … 1 wide),
 * round (0 grin … 1 "O"), teeth (buck teeth for the bunny), tongue.
 */
export class Mouth {
  constructor({ w = 256, h = 192, line = '#3b1430', fill = '#7a1f3d', tongue = '#ff7f9f', teeth = false } = {}) {
    this.c = canvas(w, h);
    this.g = this.c.getContext('2d');
    this.o = { line, fill, tongue, teeth };
    this.texture = new THREE.CanvasTexture(this.c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.key = '';
    this.set({});
  }

  set({ smile = 0.6, open = 0, round = 0, width = 1 } = {}) {
    const key = [smile, open, round, width].map((v) => v.toFixed(3)).join();
    if (key === this.key) return;
    this.key = key;
    const { c, g } = this, W = c.width, H = c.height, cx = W / 2, cy = H * 0.42;
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const hw = W * 0.4 * width * lerp(1, 0.45, round);
    const lift = smile * H * 0.17;                    // corner lift
    if (open < 0.04) {
      g.strokeStyle = this.o.line; g.lineWidth = H * 0.1;
      g.beginPath(); g.moveTo(cx - hw, cy - lift); g.quadraticCurveTo(cx, cy + lift * 1.25, cx + hw, cy - lift); g.stroke();
      return void (this.texture.needsUpdate = true);
    }
    const depth = H * 0.5 * open * lerp(1, 1.25, round);
    const mouth = new Path2D();
    if (round > 0.5) {
      mouth.ellipse(cx, cy + depth * 0.3, hw * 0.9, depth * 0.62, 0, 0, Math.PI * 2);
    } else {
      mouth.moveTo(cx - hw, cy - lift);
      mouth.quadraticCurveTo(cx, cy + lift * 0.35 + depth * 0.05, cx + hw, cy - lift);        // upper lip
      mouth.quadraticCurveTo(cx + hw * 0.55, cy + depth * 1.2, cx, cy + depth * 1.05);         // lower curve
      mouth.quadraticCurveTo(cx - hw * 0.55, cy + depth * 1.2, cx - hw, cy - lift);
      mouth.closePath();
    }
    g.fillStyle = this.o.fill; g.fill(mouth);
    g.save(); g.clip(mouth);
    // tongue sits low in the mouth
    g.fillStyle = this.o.tongue;
    g.beginPath(); g.ellipse(cx, cy + depth * (round > 0.5 ? 0.85 : 1.05), hw * 0.6, depth * 0.5, 0, 0, Math.PI * 2); g.fill();
    if (this.o.teeth) {
      g.fillStyle = '#ffffff';
      const tw = hw * 0.26, th = depth * 0.42;
      g.beginPath(); g.roundRect(cx - tw * 1.04, cy - lift * 0.2 - 6, tw, th + 6, 6); g.roundRect(cx + tw * 0.04, cy - lift * 0.2 - 6, tw, th + 6, 6); g.fill();
    }
    g.restore();
    g.strokeStyle = this.o.line; g.lineWidth = H * 0.06; g.stroke(mouth);
    this.texture.needsUpdate = true;
  }
}

/** Soft pink blush disc. */
let _blush = null;
export function blushMaterial(color = 'rgba(255,120,160,') {
  if (!_blush) {
    const s = 128, c = canvas(s, s), g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, color + '0.75)'); grd.addColorStop(0.6, color + '0.35)'); grd.addColorStop(1, color + '0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    _blush = new THREE.CanvasTexture(c); _blush.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: _blush, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
}
