// "Twinkle": a plush, glowing five-point star with a big expressive face.
// Geometry: a rounded star outline scaled in concentric rings toward the centre, each
// ring lifted by a quarter-circle profile → a soft pillow shape with rounded rims.
// The two upper tips are arms and the two lower tips are legs: they bend at their base
// (CPU vertex deform, cheap at ~7k vertices) for waves, cheers and kicks.
import * as THREE from 'three';
import { Eye, Mouth, blushMaterial } from './face.js';
import { radialTexture, sparkleTexture } from '../core/textures.js';
import { clamp, angDiff } from '../core/util.js';

const TIP0 = Math.PI / 2;                       // top tip points up (+Y); the star faces +Z
const TIPS = [0, 1, 2, 3, 4].map((k) => TIP0 + (k * 2 * Math.PI) / 5);
// tips: 0 top, 1 upper-left (viewer), 2 lower-left, 3 lower-right, 4 upper-right
export const ARM_R = 1, LEG_R = 2, LEG_L = 3, ARM_L = 4;     // character's right arm is on the viewer's left

function roundedStarOutline(rOut, rIn, rTip, rNotch, n = 240) {
  const corners = [];
  for (let k = 0; k < 5; k++) {
    const a = TIPS[k], b = a + Math.PI / 5;
    corners.push([Math.cos(a) * rOut, Math.sin(a) * rOut, rTip], [Math.cos(b) * rIn, Math.sin(b) * rIn, rNotch]);
  }
  // fillet every corner with a quadratic curve, sample densely, then resample by arc length
  const pts = [];
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i], prev = corners[(i + corners.length - 1) % corners.length], next = corners[(i + 1) % corners.length];
    const d = p[2];
    const toPrev = new THREE.Vector2(prev[0] - p[0], prev[1] - p[1]).normalize().multiplyScalar(d);
    const toNext = new THREE.Vector2(next[0] - p[0], next[1] - p[1]).normalize().multiplyScalar(d);
    const a = new THREE.Vector2(p[0] + toPrev.x, p[1] + toPrev.y), c = new THREE.Vector2(p[0] + toNext.x, p[1] + toNext.y);
    for (let s = 0; s <= 16; s++) {
      const t = s / 16;
      pts.push(new THREE.Vector2(
        (1 - t) ** 2 * a.x + 2 * (1 - t) * t * p[0] + t * t * c.x,
        (1 - t) ** 2 * a.y + 2 * (1 - t) * t * p[1] + t * t * c.y));
    }
  }
  const curve = new THREE.SplineCurve([...pts, pts[0]]);
  return curve.getSpacedPoints(n).slice(0, n);
}

function plushStarGeometry({ rOut = 1, rIn = 0.5, thick = 0.34, rings = 14 } = {}) {
  const outline = roundedStarOutline(rOut, rIn, 0.2, 0.14);
  const M = outline.length;
  const pos = [], idx = [];
  // ring j: scale s = cos(φ), height z = thick·sin(φ), φ from 0 (rim) to π/2 (centre)
  const ringVerts = (side) => {
    const base = pos.length / 3, start = side > 0 ? 0 : 1;   // the rim (j = 0) is shared
    for (let j = start; j <= rings; j++) {
      const phi = (j / rings) * Math.PI / 2, s = Math.cos(phi), z = thick * Math.sin(phi) * side;
      for (let k = 0; k < M; k++) pos.push(outline[k].x * s, outline[k].y * s, z);
    }
    return base;
  };
  const front = ringVerts(1);
  const back = ringVerts(-1);
  const at = (side, j, k) => (side > 0 ? front + j * M : (j === 0 ? front : back + (j - 1) * M)) + (k % M);
  for (const side of [1, -1]) {
    for (let j = 0; j < rings; j++) {
      for (let k = 0; k < M; k++) {
        const a = at(side, j, k), b = at(side, j, k + 1), c = at(side, j + 1, k), d = at(side, j + 1, k + 1);
        if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, outline };
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = plushStarGeometry();
  return SHARED;
}

export class Star {
  /**
   * @param {object} o  color, glow (sprite colour), face (bool), size
   */
  constructor(o = {}) {
    this.o = { color: 0xffd426, emissive: 0xffa800, glow: 'rgba(255,200,70,', face: true, light: false, ...o };
    const { geometry, outline } = shared();
    this.outline = outline;
    this.root = new THREE.Group();          // world placement
    this.body = new THREE.Group();          // squash / spin / lean
    this.root.add(this.body);
    this.geo = o.deform !== false ? geometry.clone() : geometry;
    this.base = Float32Array.from(this.geo.attributes.position.array);
    this.mat = new THREE.MeshPhysicalMaterial({
      color: this.o.color, emissive: this.o.emissive, emissiveIntensity: 0.32, roughness: 0.38, envMapIntensity: 0.6,
      clearcoat: 1, clearcoatRoughness: 0.22, sheen: 0.25, sheenColor: new THREE.Color(1, 0.85, 0.4), sheenRoughness: 0.5,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.body.add(this.mesh);
    // soft halo behind + a light so nearby characters get a warm glow
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(this.o.glow + '0.9)', this.o.glow + '0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.scale.setScalar(3.6);
    this.halo.position.z = -0.4;
    this.halo.renderOrder = -1;
    this.root.add(this.halo);
    if (this.o.light) {
      this.light = new THREE.PointLight(0xffd27a, 6, 7, 1.6);
      this.root.add(this.light);
    }
    // twinkles on the tips
    this.tipSparks = TIPS.map(() => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture(), color: new THREE.Color(1.6, 1.5, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.renderOrder = 5;
      this.body.add(sp);
      return sp;
    });
    if (this.o.face) this._buildFace();
    this.set({});
  }

  /** Height of the plush surface above the centre plane at 2D point (x, y). */
  surfaceZ(x, y) {
    const th = Math.atan2(y, x);
    // outline radius at this angle (nearest sample)
    let best = 0, bd = 1e9;
    for (let k = 0; k < this.outline.length; k += 2) {
      const p = this.outline[k], d = Math.abs(angDiff(Math.atan2(p.y, p.x), th));
      if (d < bd) { bd = d; best = Math.hypot(p.x, p.y); }
    }
    const s = clamp(Math.hypot(x, y) / best, 0, 1);
    return 0.34 * Math.sqrt(1 - s * s);
  }

  _buildFace() {
    this.face = new THREE.Group();
    this.body.add(this.face);
    // features sit on the dome and face along its surface normal
    const Z = new THREE.Vector3(0, 0, 1);
    const place = (obj, x, y, lift = 0.0) => {
      const e = 0.01, z = this.surfaceZ(x, y);
      const n = new THREE.Vector3(-(this.surfaceZ(x + e, y) - this.surfaceZ(x - e, y)) / (2 * e), -(this.surfaceZ(x, y + e) - this.surfaceZ(x, y - e)) / (2 * e), 1).normalize();
      obj.position.set(x, y, z).addScaledVector(n, lift);
      obj.quaternion.setFromUnitVectors(Z, n);
      this.face.add(obj);
      return obj;
    };
    this.eyes = [-1, 1].map((s) => {
      const e = new Eye({ r: 0.14, lid: this.o.color, lidGlow: 0.25, iris: '#4a2d7a' });
      place(e.group, s * 0.2, 0.07, -0.025);
      return e;
    });
    this.mouth = new Mouth({ teeth: false });
    this.mouthMesh = place(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), this.mouth.material), 0, -0.21, 0.02);
    this.cheeks = [-1, 1].map((s) => place(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), blushMaterial()), s * 0.35, -0.12, 0.015));
  }

  _deform(limbs) {
    const pos = this.geo.attributes.position.array, base = this.base;
    pos.set(base);
    const rIn = 0.5, rOut = 1;
    for (const [tip, ang] of limbs) {
      if (Math.abs(ang) < 1e-4) continue;
      const ta = TIPS[tip], dx = Math.cos(ta), dy = Math.sin(ta);
      const px = dx * rIn * 0.78, py = dy * rIn * 0.78;
      for (let i = 0; i < pos.length; i += 3) {
        const x = base[i], y = base[i + 1];
        const u = x * dx + y * dy;
        if (u < rIn * 0.6) continue;
        const d = Math.abs(angDiff(Math.atan2(y, x), ta));
        if (d > 0.66) continue;
        const w = clamp((u - rIn * 0.62) / (rIn * 0.55)) * (1 - clamp((d - 0.5) / 0.16));
        const a = ang * w * (0.75 + 0.35 * clamp((u - rIn) / (rOut - rIn)));
        const c = Math.cos(a), s = Math.sin(a);
        const rx = pos[i] - px, ry = pos[i + 1] - py;
        pos[i] = px + rx * c - ry * s;
        pos[i + 1] = py + rx * s + ry * c;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /**
   * Pose the star. Arm/leg angles in radians (positive = raise/kick outward).
   * eyes: {open, look, happy, sparkle, squint, wink: 'L'|'R'}; mouth: {smile, open, round, width}
   */
  set({ armL = 0, armR = 0, legL = 0, legR = 0, squash = 0, spin = 0, lean = 0, tilt = 0, scale = 1,
        eyes = {}, mouth = {}, glow = 1, sparkle = 0, sparkPhase = 0, blush = 1, lamp = 1 } = {}) {
    if (this.o.deform !== false) {
      // positive raises: the character's left arm (viewer right) rotates CCW, the right arm CW
      this._deform([[ARM_L, armL], [ARM_R, -armR], [LEG_L, legL * 0.7], [LEG_R, -legR * 0.7]]);
    }
    const st = 1 + squash;
    this.body.scale.set(scale / Math.sqrt(st), scale * st, scale / Math.sqrt(st));
    this.body.rotation.set(tilt, spin, lean);
    this.halo.material.opacity = clamp(glow) * 0.6;
    this.halo.scale.setScalar(3.4 * scale * (0.85 + 0.25 * glow));
    if (this.light) this.light.intensity = 7 * glow * lamp;
    TIPS.forEach((ta, k) => {
      const sp = this.tipSparks[k];
      const tw = clamp(sparkle) * (0.5 + 0.5 * Math.sin(sparkPhase * 6.283 + k * 2.1));
      sp.visible = tw > 0.02;
      sp.position.set(Math.cos(ta) * 1.12, Math.sin(ta) * 1.12, 0.1);
      sp.scale.setScalar(0.55 * tw);
    });
    if (this.eyes) {
      this.eyes.forEach((e, i) => {
        const side = i === 0 ? 'R' : 'L';                 // eye 0 is on the viewer's left = character's right
        const wink = eyes.wink === side ? 1 : 0;
        e.set({ ...eyes, happy: Math.max(eyes.happy || 0, wink), open: eyes.open ?? 1 });
      });
      this.mouth.set({ smile: 0.7, ...mouth });
      this.cheeks.forEach((c) => (c.material.opacity = clamp(blush)));
    }
  }
}

/** Many small plain stars (no face) for the sky: one shared geometry, per-instance colour. */
export function littleStarGeometry() {
  return shared().geometry;
}
