// Visual effects. Each effect is posed from the beat clock alone (no simulation state):
// sparkle bursts, shockwave rings, god rays, a rainbow ribbon trail, confetti, a
// thought bubble, a sky full of little rainbow stars, and the faceted diamond.
import * as THREE from 'three';
import { radialTexture, sparkleTexture, canvas, FONT } from '../core/textures.js';
import { mulberry32, clamp, ease } from '../core/util.js';
import { littleStarGeometry } from '../characters/star.js';
import { Eye, Mouth } from '../characters/face.js';

export const RAINBOW = [0xff5a7a, 0xff9f43, 0xffe14d, 0x5be37a, 0x4fc3ff, 0x9a7bff, 0xff7ad9];

/** Additive point sprites flying out from an origin. set(origin, dt) with dt in beats since the burst. */
export class Burst {
  constructor({ n = 60, seed = 1, palette = RAINBOW, size = 26, flat = false } = {}) {
    const r = mulberry32(seed);
    this.n = n;
    this.dir = []; this.speed = []; this.spin = [];
    for (let i = 0; i < n; i++) {
      let d;
      do { d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, flat ? (r() * 2 - 1) * 0.25 : r() * 2 - 1); } while (d.length() > 1 || d.length() < 0.15);
      this.dir.push(d.normalize()); this.speed.push(0.5 + r()); this.spin.push(r() * 6.28);
    }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    const col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { c.set(palette[i % palette.length]); col.set([c.r * 1.6, c.g * 1.6, c.b * 1.6], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sparkleTexture() }, uScale: { value: 1 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = color; vA = alpha;
          gl_PointSize = size * uScale * 30.0 / max(0.5, -mv.z); }`,
      fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.baseSize = size;
  }

  /** dt beats since launch; reach = world radius at the end; life in beats. */
  set(origin, dt, { reach = 2.5, life = 1.6, gravity = 0.3, size = 1 } = {}) {
    const on = dt >= 0 && dt <= life;
    this.points.visible = on;
    if (!on) return;
    const u = dt / life;
    const travel = 1 - Math.pow(1 - u, 3);                 // fast out, drag
    for (let i = 0; i < this.n; i++) {
      const d = this.dir[i], s = this.speed[i] * reach * travel;
      this.pos[i * 3] = origin.x + d.x * s;
      this.pos[i * 3 + 1] = origin.y + d.y * s - gravity * u * u * reach;
      this.pos[i * 3 + 2] = origin.z + d.z * s;
      this.size[i] = this.baseSize * size * (1 - u * 0.7) * (0.6 + 0.4 * Math.sin(this.spin[i] + dt * 9));
      this.alpha[i] = Math.min(1, (1 - u) * 1.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
  }
}

/** Expanding shockwave ring that faces the camera. */
export class Ring {
  constructor(color = new THREE.Color(1.6, 1.4, 2.2)) {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 19;
  }

  set(origin, dt, cam, { radius = 3, life = 0.7 } = {}) {
    const on = dt >= 0 && dt <= life;
    this.mesh.visible = on;
    if (!on) return;
    const u = dt / life;
    this.mesh.position.copy(origin);
    this.mesh.quaternion.copy(cam.quaternion);
    this.mesh.scale.setScalar(0.2 + radius * ease.out(u));
    this.mesh.material.opacity = (1 - u) * 0.9;
  }
}

/** Rotating god rays behind a glowing object. */
export class Rays {
  constructor() {
    const s = 512, c = canvas(s, s), g = c.getContext('2d'), h = s / 2;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = a0 + Math.PI / 22;
      const grd = g.createRadialGradient(h, h, 0, h, h, h);
      grd.addColorStop(0, 'rgba(255,240,180,0.9)'); grd.addColorStop(1, 'rgba(255,170,220,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(h, h); g.arc(h, h, h, a0, a1); g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.renderOrder = -2;
  }

  set(origin, cam, { size = 6, opacity = 0, angle = 0 } = {}) {
    this.mesh.visible = opacity > 0.01;
    this.mesh.position.copy(origin);
    this.mesh.quaternion.copy(cam.quaternion);
    this.mesh.rotateZ(angle);
    this.mesh.scale.setScalar(size);
    this.mesh.material.opacity = opacity;
  }
}

/** Rainbow ribbon trailing behind a moving point: path(beat) → Vector3. */
export class RainbowTrail {
  constructor(seg = 90) {
    this.seg = seg;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((seg + 1) * 2 * 3);
    const uv = new Float32Array((seg + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= seg; i++) {
      uv.set([i / seg, 0, i / seg, 1], i * 4);
      if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uFade; varying vec2 vUv;
        vec3 rb(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ vec3 c = rb(0.83 * (1.0 - vUv.y)) * 1.5 + 0.15;
          float a = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          gl_FragColor = vec4(c, a * uFade * 0.95); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  /** b: current beat; len: trail length in beats; width world units. */
  set(path, b, len, cam, { width = 0.5, fade = 1 } = {}) {
    this.mesh.visible = fade > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.material.uniforms.uFade.value = fade;
    const p = new THREE.Vector3(), q = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
    for (let i = 0; i <= this.seg; i++) {
      const bi = b - len * (1 - i / this.seg);
      p.copy(path(bi)); q.copy(path(bi + 0.01)).sub(p);
      view.copy(cam.position).sub(p);
      side.crossVectors(q, view).normalize();
      const w = width * (0.25 + 0.75 * (i / this.seg));
      this.pos.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

/** Confetti: small spinning paper bits raining down around a centre. */
export class Confetti {
  constructor(n = 140, seed = 9) {
    const r = mulberry32(seed);
    this.n = n; this.p = [];
    for (let i = 0; i < n; i++) this.p.push({ x: (r() - 0.5), z: (r() - 0.5), vy: 0.6 + r() * 0.8, spin: r() * 10, ax: r(), sway: r() * 6.28, delay: r() * 0.4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, c.set(RAINBOW[i % RAINBOW.length]).multiplyScalar(1.3));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
  }

  set(center, dt, { spread = 2.4, height = 1.8, life = 3 } = {}) {
    const on = dt >= 0 && dt <= life;
    this.mesh.visible = on;
    if (!on) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], u = Math.max(0, dt - p.delay);
      const up = Math.min(u, 0.35) / 0.35;                   // pops up first, then flutters down
      const y = center.y + height * ease.out(up) - Math.max(0, u - 0.35) * p.vy * 0.9;
      const x = center.x + p.x * spread * (0.4 + 0.6 * ease.out(up)) + 0.12 * Math.sin(u * 4 + p.sway);
      const z = center.z + p.z * spread * 0.6 * (0.4 + 0.6 * ease.out(up));
      e.set(u * p.spin, u * p.spin * 0.7, p.ax * 6);
      q.setFromEuler(e);
      s.setScalar(u > 0 ? Math.min(1, (life - dt) / 0.5) : 0);
      m.compose(new THREE.Vector3(x, y, z), q, s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function iconTexture(kind) {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (kind === '?') {
    g.font = `700 210px ${FONT}`;
    g.lineWidth = 26; g.strokeStyle = '#ffffff'; g.strokeText('?', 128, 140);
    g.fillStyle = '#8a3cff'; g.fillText('?', 128, 140);
  } else {
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#ff7a00'; g.lineWidth = 12;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 46 : 104; g.lineTo(128 + Math.cos(a) * r, 136 + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cartoon thought bubble: three little puffs and a cloud holding "?" or a star. */
export class Bubble {
  constructor() {
    this.group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, transmission: 0, emissive: 0xe8e0ff, emissiveIntensity: 0.25 });
    this.puffs = [0.08, 0.12, 0.17].map((r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat); this.group.add(m); return m; });
    this.cloud = new THREE.Group();
    const r = mulberry32(13);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3 + r() * 0.08, 24, 18), mat);
      m.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.3, -0.05);
      this.cloud.add(m);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), mat); core.scale.set(1.15, 0.85, 0.6); this.cloud.add(core);
    this.group.add(this.cloud);
    this.icons = { '?': iconTexture('?'), star: iconTexture('star') };
    this.icon = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({ map: this.icons['?'], transparent: true, depthWrite: false }));
    this.icon.position.z = 0.55;
    this.icon.renderOrder = 6;
    this.cloud.add(this.icon);
  }

  /** puffs: 0..3 how many have popped; cloud 0..1 scale; icon {kind, scale, spin, bob} */
  set({ puffs = 0, cloud = 0, icon = null } = {}) {
    this.group.visible = puffs > 0.01 || cloud > 0.01;
    const P = [[0, 0, 0], [0.18, 0.2, 0], [0.42, 0.45, 0]];
    this.puffs.forEach((m, i) => { m.position.set(...P[i]); m.scale.setScalar(clamp(puffs - i) > 0 ? ease.outBack(clamp(puffs - i)) : 0.001); });
    this.cloud.position.set(0.95, 1.05, 0);
    this.cloud.scale.setScalar(Math.max(0.001, cloud));
    this.icon.visible = !!icon;
    if (icon) {
      this.icon.material.map = this.icons[icon.kind];
      this.icon.scale.setScalar(Math.max(0.001, icon.scale ?? 1));
      this.icon.rotation.z = icon.spin ?? 0;
      this.icon.position.y = icon.bob ?? 0;
    }
  }
}

/** A sky full of little rainbow stars that pop in and twinkle. */
export class LittleStars {
  constructor(n = 46, seed = 17) {
    const r = mulberry32(seed);
    this.n = n; this.items = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.75;'); };
    mat.customProgramCacheKey = () => 'little-stars-v1';
    this.mesh = new THREE.InstancedMesh(littleStarGeometry(), mat, n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, c.set(RAINBOW[i % RAINBOW.length]));
      this.items.push({ a: r() * 6.28, el: 0.1 + r() * 1.1, d: 9 + r() * 14, s: 0.14 + r() * 0.22, ph: r() * 6.28, delay: r(), spin: (r() - 0.5) * 2 });
    }
    this.mesh.frustumCulled = false;
  }

  /** around: centre; appear 0..1 (staggered pops); b: beat for twinkle. */
  set(around, appear, b) {
    this.mesh.visible = appear > 0.001;
    if (!this.mesh.visible) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const th = (b / 48) * Math.PI * 2;
    this.items.forEach((it, i) => {
      const k = clamp((appear - it.delay * 0.6) / 0.4);
      const sc = it.s * (k > 0 ? ease.outBack(k) : 0) * (0.8 + 0.25 * Math.sin(th * 24 + it.ph));
      const p = new THREE.Vector3(Math.cos(it.a) * Math.cos(it.el) * it.d, Math.sin(it.el) * it.d * 0.7, Math.sin(it.a) * Math.cos(it.el) * it.d - 4).add(around);
      e.set(0, 0, it.spin * Math.sin(th * 6 + it.ph) * 0.4);
      q.setFromEuler(e);
      m.compose(p, q, new THREE.Vector3(sc, sc, sc));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Brilliant-cut diamond with a cute face and rainbow prism beams. */
export class Diamond {
  constructor() {
    this.group = new THREE.Group();
    const pts = [[0, -1.25], [0.95, 0.0], [1.0, 0.12], [0.62, 0.55], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(pts, 10);
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0xa8e8ff, roughness: 0.04, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [200, 900], emissive: 0x4fb4ff, emissiveIntensity: 0.5, envMapIntensity: 2.4, flatShading: true });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.group.add(this.mesh);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(170,230,255,0.9)', 'rgba(170,140,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(4.2); this.glow.position.z = -0.6;
    this.group.add(this.glow);
    // face on the front of the crown
    this.face = new THREE.Group();
    this.face.position.set(0, 0.08, 0.86);
    this.eyes = [-1, 1].map((s) => { const e = new Eye({ r: 0.16, lid: 0xc8f4ff, iris: '#2b4ea8' }); e.group.position.set(s * 0.27, 0.1, 0); this.face.add(e.group); return e; });
    this.mouth = new Mouth();
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), this.mouth.material);
    mm.position.set(0, -0.2, 0.05);
    this.face.add(mm);
    this.group.add(this.face);
    // prism beams
    this.beams = RAINBOW.map((col, i) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.geometry.translate(0, -4.5, 0); m.geometry.rotateX(Math.PI);
      m.renderOrder = 7;
      this.group.add(m);
      return m;
    });
  }

  set({ scale = 1, spin = 0, tilt = 0, beams = 0, beamAngle = 0, eyes = {}, mouth = {}, glow = 1 } = {}) {
    this.group.visible = scale > 0.001;
    this.group.scale.setScalar(Math.max(0.001, scale));
    this.mesh.rotation.set(tilt, spin, 0);
    this.glow.material.opacity = glow;
    this.eyes.forEach((e) => e.set(eyes));
    this.mouth.set({ smile: 0.8, ...mouth });
    this.beams.forEach((m, i) => {
      m.visible = beams > 0.01;
      const a = beamAngle + (i / this.beams.length) * Math.PI * 2;
      m.rotation.set(0, 0, a);
      m.scale.set(1 + beams * 0.5, beams, 1);
      m.material.opacity = beams * 0.5;
    });
  }
}
