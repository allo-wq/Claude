// Procedural stylised head used both on the full-body character and in the
// close-up "studio" shots. Modelled at unit scale (cranium radius ≈ 1 ≈ 11 cm).
// Conventions: faces +Z, up +Y, the subject's LEFT side is +X — the side the
// beam damaged (left face swelling/paralysis, left ear deafness).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { materials, ghostMaterial, glowMaterial } from '../core/materials.js';
import { clamp, smooth, mulberry32, hash1 } from '../core/util.js';
import { radialTexture } from '../core/textures.js';

const DEFAULT_STATE = {
  swell: 0, burn: 0, peel: 0, path: 0, frozen: 0, redness: 0,
  xray: 0, smile: 0, smileLeft: null, browRaise: 0,
  lidL: 0, lidR: 0, gazeX: 0, gazeY: 0, flash: 0,
  brainGlow: 0, arcs: 0, arcSeed: 0,
};

// ---------- shared geometry (built once) ----------
function shapeVertex(v) {
  let { x, y, z } = v;
  const jaw = smooth(clamp((-y - 0.05) / 0.95));
  x *= 0.86 * (1 - 0.2 * jaw);
  z *= 0.96 * (1 - 0.05 * jaw);
  const chin = Math.exp(-((y + 0.86) ** 2) / 0.05 - (x * x) / 0.08) * Math.max(0, z);
  z += 0.1 * chin; y -= 0.04 * chin;
  const brow = Math.exp(-((y - 0.3) ** 2) / 0.012) * Math.pow(Math.max(0, z), 4);
  z += 0.035 * brow;
  const occ = Math.exp(-((y - 0.15) ** 2) / 0.15) * Math.max(0, -z);
  z -= 0.05 * occ;
  y *= 1.02;
  v.set(x, y, z);
}

function swellField(p) {
  const c1 = new THREE.Vector3(0.6, -0.3, 0.62), c2 = new THREE.Vector3(0.55, 0.12, 0.55);
  return 0.42 * Math.exp(-p.distanceToSquared(c1) / 0.2) + 0.16 * Math.exp(-p.distanceToSquared(c2) / 0.2);
}

let GEO = null;
function sharedGeometry() {
  if (GEO) return GEO;
  let g = new THREE.SphereGeometry(1, 80, 60);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); shapeVertex(v); pos.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();

  // Swelling morph target (absolute positions + normals).
  const nrm = g.attributes.normal;
  const swollen = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i);
    const d = swellField(v);
    swollen.set([v.x + n.x * d, v.y + n.y * d, v.z + n.z * d], i * 3);
  }
  const tmp = g.clone();
  tmp.setAttribute('position', new THREE.BufferAttribute(swollen, 3));
  tmp.computeVertexNormals();
  g.morphAttributes.position = [new THREE.BufferAttribute(swollen, 3)];
  g.morphAttributes.normal = [tmp.attributes.normal.clone()];
  tmp.dispose();

  // Hair shell: offset outwards inside the hair region, tucked inside elsewhere.
  const hair = g.clone();
  hair.morphAttributes = {};
  const hp = hair.attributes.position, hn = hair.attributes.normal;
  for (let i = 0; i < hp.count; i++) {
    v.fromBufferAttribute(hp, i); n.fromBufferAttribute(hn, i);
    const t = smooth(clamp((0.62 - v.z) / 1.45));
    let hairY = 0.5 + 0.13 * v.x + (-0.5 - 0.5 - 0.13 * v.x) * t;
    hairY += 0.2 * Math.exp(-(v.z * v.z) / 0.12) * Math.abs(v.x); // lift over the ears
    const inside = v.y > hairY;
    const edge = smooth(clamp((v.y - hairY) / 0.12));
    let off = inside ? 0.035 + 0.05 * edge + 0.03 * Math.max(0, v.y) : -0.08;
    if (inside && v.y > 0.55) off += 0.03 * smooth(clamp((v.x + 0.15) / 0.6)); // side-parted volume
    hp.setXYZ(i, v.x + n.x * off, v.y + n.y * off, v.z + n.z * off);
  }
  hair.computeVertexNormals();

  const brain = new THREE.SphereGeometry(1, 96, 64);
  const bp = brain.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const fold = 0.045 * (Math.sin(v.x * 13 + v.y * 5) * Math.sin(v.y * 15 - v.z * 4) + 0.6 * Math.sin(v.z * 17 + v.x * 6));
    const groove = 1 - 0.1 * Math.exp(-(v.x * v.x) / 0.004) * smooth(clamp(v.y + 0.3));
    const r = (1 + fold) * groove;
    v.multiplyScalar(r);
    v.set(v.x * 0.66, v.y * 0.6 + 0.18, v.z * 0.8 - 0.04);
    bp.setXYZ(i, v.x, v.y, v.z);
  }
  brain.computeVertexNormals();

  GEO = { head: g, hair, brain };
  return GEO;
}

// ---------- skin shader injection ----------
function makeSkinMaterial(color, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <project_vertex>', 'vLocalPos = transformed;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocalPos;
        uniform float uBurn; uniform float uFrozen; uniform float uRed;
        uniform vec3 uEntry; uniform vec3 uExit;
        float hnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
          float n=dot(i,vec3(1.0,57.0,113.0));
          #define H(o) fract(sin(n+o)*43758.5453)
          return mix(mix(mix(H(0.0),H(1.0),f.x),mix(H(57.0),H(58.0),f.x),f.y),
                     mix(mix(H(113.0),H(114.0),f.x),mix(H(170.0),H(171.0),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float nz = hnoise(vLocalPos * 11.0);
          float dEx = length(vLocalPos - uExit) + (nz - 0.5) * 0.05;
          float dEn = length(vLocalPos - uEntry) + (nz - 0.5) * 0.05;
          float rEx = 0.2 * uBurn, rEn = 0.15 * uBurn;
          float raw = max(1.0 - smoothstep(rEx * 0.55, rEx + 1e-4, dEx), 1.0 - smoothstep(rEn * 0.55, rEn + 1e-4, dEn));
          float halo = max(1.0 - smoothstep(0.0, rEx * 2.4 + 1e-4, dEx), 1.0 - smoothstep(0.0, rEn * 2.4 + 1e-4, dEn));
          float side = smoothstep(0.02, 0.5, vLocalPos.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.5, 0.44), uRed * side * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.36, 0.3), halo * uBurn * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.12, 0.1) * (0.75 + 0.5 * nz), raw);
          float hside = smoothstep(-0.015, 0.03, vLocalPos.x);
          vec3 frost = vec3(0.55, 0.72, 0.95) * (0.85 + 0.3 * hnoise(vLocalPos * 24.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, frost, hside * uFrozen * 0.6);
        }`);
  };
  m.customProgramCacheKey = () => 'bugorski-skin-v1';
  return m;
}

export class Head {
  /**
   * @param {object} o
   * @param {boolean} o.xray  build the x-ray layer (ghost skin, skull, brain, arcs)
   */
  constructor(o = {}) {
    const M = materials();
    const G = sharedGeometry();
    this.o = { skin: 0xe0ab88, hair: M.hair, glasses: false, xray: false, ...o };
    this.group = new THREE.Group();
    this.group.name = 'head';
    this.uniforms = {
      uBurn: { value: 0 }, uFrozen: { value: 0 }, uRed: { value: 0 },
      uEntry: { value: new THREE.Vector3() }, uExit: { value: new THREE.Vector3() },
    };
    this.skinMat = makeSkinMaterial(this.o.skin, this.uniforms);
    this.featureSkinMat = new THREE.MeshStandardMaterial({ color: this.o.skin, roughness: 0.62 });
    this.innerEarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.o.skin).multiplyScalar(0.78), roughness: 0.7 });
    // Per-instance materials: the x-ray head attaches world-space clip planes to its
    // materials, so nothing that head touches may be shared with other heads.
    this.lipMat = M.lips.clone();
    this.eyeWhiteMat = M.eyeWhite.clone();
    this.irisMat = M.iris.clone();
    this.hairMat = this.o.hair.clone();
    this.skinLayer = []; // meshes clipped away during the x-ray sweep
    this.anchored = [];  // features that ride on the swelling

    // Cranium
    this.skin = new THREE.Mesh(G.head, this.skinMat);
    this.skin.morphTargetInfluences = [0];
    this.skin.castShadow = true;
    this.group.add(this.skin);
    this.skinLayer.push(this.skin);

    this.hair = new THREE.Mesh(G.hair, this.hairMat);
    this.hair.castShadow = true;
    this.group.add(this.hair);
    this.skinLayer.push(this.hair);

    // Raycast helper against the base (un-swollen) head for feature placement.
    const probe = new THREE.Mesh(G.head, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const rc = new THREE.Raycaster();
    const hit = (origin, dir) => {
      rc.set(origin, dir.clone().normalize());
      const h = rc.intersectObject(probe, false)[0];
      return { p: h.point.clone(), n: h.face.normal.clone() };
    };
    const front = (x, y) => hit(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1));
    this._hit = hit;

    // Beam line through the head: enters back-left of the skull, exits beside the left nostril.
    const P0 = new THREE.Vector3(0.24, -0.03, 0), dir = new THREE.Vector3(-0.03, -0.17, 1).normalize();
    this.beamDir = dir.clone();
    this.entry = hit(P0.clone().addScaledVector(dir, -5), dir).p;
    this.exit = hit(P0.clone().addScaledVector(dir, 5), dir.clone().negate()).p;
    this.uniforms.uEntry.value.copy(this.entry);
    this.uniforms.uExit.value.copy(this.exit);

    // Eyes
    this.eyes = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const a = front(0.31 * sx, 0.12);
      const eye = new THREE.Group();
      eye.position.copy(a.p).addScaledVector(a.n, -0.075);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), this.eyeWhiteMat);
      const gaze = new THREE.Group();
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 12), this.irisMat);
      iris.scale.z = 0.35; iris.position.z = 0.118;
      gaze.add(iris);
      const lidMat = this.featureSkinMat;
      const upper = new THREE.Mesh(new THREE.SphereGeometry(0.142, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.139, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
      lower.rotation.x = 0.75;
      eye.add(ball, gaze, upper, lower);
      this.group.add(eye);
      this.skinLayer.push(ball, iris, upper, lower);
      this.eyes[side] = { eye, gaze, upper, lower, anchor: a, base: eye.position.clone() };
      this.anchored.push({ obj: eye, base: eye.position.clone(), p: a.p, n: a.n });
    }

    // Eyebrows
    this.brows = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const a = front(0.31 * sx, 0.36);
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.2, 4, 10), this.hairMat);
      b.rotation.set(0, 0.38 * sx, Math.PI / 2 + 0.08 * sx, 'YXZ');
      b.position.copy(a.p).addScaledVector(a.n, 0.02);
      this.group.add(b);
      this.skinLayer.push(b);
      this.brows[side] = { mesh: b, base: b.position.clone(), a };
      this.anchored.push({ obj: b, base: b.position.clone(), p: a.p, n: a.n });
    }

    // Nose
    const nose = new THREE.Group();
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.26, 6, 12), this.featureSkinMat);
    bridge.position.set(0, -0.04, 0.98); bridge.rotation.x = -0.55;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), this.featureSkinMat);
    tip.position.set(0, -0.215, 1.07); tip.scale.set(0.85, 0.8, 0.85);
    const alaL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), this.featureSkinMat);
    alaL.position.set(0.068, -0.25, 0.985);
    const alaR = alaL.clone(); alaR.position.x = -0.068;
    nose.add(bridge, tip, alaL, alaR);
    nose.traverse((m) => { if (m.isMesh) { m.castShadow = true; this.skinLayer.push(m); } });
    this.group.add(nose);
    this.anchored.push({ obj: alaL, base: alaL.position.clone(), p: alaL.position.clone(), n: new THREE.Vector3(0.6, 0, 0.8) });
    this.noseParts = [bridge, tip, alaL, alaR];

    // Mouth: two halves pivoting at the centre so each corner can move independently.
    const ma = front(0, -0.52);
    this.mouth = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.copy(ma.p).addScaledVector(ma.n, 0.005);
      const half = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 10), this.lipMat);
      half.rotation.z = Math.PI / 2;
      half.position.x = 0.085 * sx;
      pivot.add(half);
      pivot.rotation.y = 0.38 * sx;
      this.group.add(pivot);
      this.skinLayer.push(half);
      this.mouth[side] = pivot;
    }
    this.anchored.push({ obj: this.mouth.L, base: this.mouth.L.position.clone(), p: ma.p.clone().add(new THREE.Vector3(0.12, 0, 0)), n: ma.n });

    // Ears
    this.ears = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const a = hit(new THREE.Vector3(4 * sx, -0.08, -0.02), new THREE.Vector3(-sx, 0, 0));
      const ear = new THREE.Group();
      ear.position.copy(a.p).addScaledVector(a.n, 0.03);
      ear.rotation.y = -0.3 * sx;
      const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), this.featureSkinMat);
      outer.scale.set(0.075, 0.26, 0.16);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.innerEarMat);
      inner.scale.set(0.03, 0.14, 0.075); inner.position.set(0.05 * sx, -0.01, 0.01);
      ear.add(outer, inner);
      outer.castShadow = true;
      this.group.add(ear);
      this.skinLayer.push(outer, inner);
      this.ears[side] = ear;
      this.anchored.push({ obj: ear, base: ear.position.clone(), p: a.p, n: a.n });
    }

    if (this.o.glasses) this._buildGlasses();
    this._buildPeelAndPath();
    if (this.o.xray) this._buildXray();

    // Eye flash (the "flash brighter than a thousand suns" seen inside the eye).
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(220,240,255,1)', 'rgba(120,180,255,0)'), color: new THREE.Color(2.6, 3.0, 3.6), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    this.flash.position.copy(this.eyes.L.eye.position).add(new THREE.Vector3(0, 0, 0.12));
    this.flash.renderOrder = 20;
    this.group.add(this.flash);

    if (this.o.xray) this.setClipping(true);
    probe.geometry = new THREE.BufferGeometry(); // drop reference to shared geometry
    this.set({});
  }

  _buildGlasses() {
    const M = materials();
    const g = new THREE.Group();
    for (const side of ['L', 'R']) {
      const e = this.eyes[side];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 28), M.glasses);
      ring.position.copy(e.anchor.p).addScaledVector(e.anchor.n, 0.12);
      ring.lookAt(ring.position.clone().add(e.anchor.n));
      g.add(ring);
      const sx = side === 'L' ? 1 : -1;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), M.glasses);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0.47 * sx, 0.14, 0.45);
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), M.glasses);
    bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.16, this.eyes.L.anchor.p.z + 0.12);
    g.add(bridge);
    this.group.add(g);
  }

  _buildPeelAndPath() {
    // Skin flakes that lift off around the exit/entry wounds.
    const N = 46, r = mulberry32(42);
    this.flakes = [];
    const flakeMat = new THREE.MeshStandardMaterial({ color: 0xe9b39a, roughness: 0.7, side: THREE.DoubleSide });
    this.flakeMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 7), flakeMat, N);
    this.flakeMesh.frustumCulled = false;
    for (let i = 0; i < N; i++) {
      const atExit = i < 34;
      const c = atExit ? this.exit : this.entry;
      const jitter = new THREE.Vector3((r() - 0.5) * 0.34, (r() - 0.5) * 0.34, 0);
      const origin = c.clone().add(jitter).multiplyScalar(4);
      const h = this._hit(origin, c.clone().add(jitter).negate());
      this.flakes.push({ p: h.p, n: h.n, delay: r() * 0.6, spin: (r() - 0.5) * 8, drift: new THREE.Vector3((r() - 0.5) * 0.4, -0.3 - r() * 0.5, (r() - 0.5) * 0.4) });
    }
    this.group.add(this.flakeMesh);

    // Dashed glowing path showing the beam's straight track through the head.
    const segs = 26;
    this.pathMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), glowMaterial(new THREE.Color(2.6, 0.95, 0.35), 1), segs);
    this.pathMesh.material.depthTest = false;
    this.pathMesh.renderOrder = 15;
    this.pathMesh.frustumCulled = false;
    this.pathSegs = segs;
    this.group.add(this.pathMesh);
  }

  _buildXray() {
    const G = sharedGeometry();
    const M = materials();
    this.ghostLayer = [];
    const ghostSkin = ghostMaterial(0x7fd0ff, 1.6, 2.4, 0.03);
    const add = (geo, mat, setup) => { const m = new THREE.Mesh(geo, mat); if (setup) setup(m); this.group.add(m); this.ghostLayer.push(m); return m; };
    add(G.head, ghostSkin);
    for (const p of this.noseParts) add(p.geometry, ghostSkin, (m) => { m.position.copy(p.position); m.rotation.copy(p.rotation); m.scale.copy(p.scale); });
    for (const side of ['L', 'R']) {
      const e = this.ears[side];
      add(new THREE.SphereGeometry(1, 18, 14), ghostSkin, (m) => { m.position.copy(e.position); m.rotation.copy(e.rotation); m.scale.set(0.075, 0.26, 0.16); });
    }
    const bone = ghostMaterial(0xfff1d6, 1.3, 1.6, 0.06);
    add(G.head, bone, (m) => m.scale.setScalar(0.9));
    for (const side of ['L', 'R']) {
      const e = this.eyes[side];
      add(new THREE.TorusGeometry(0.16, 0.035, 8, 24), bone, (m) => { m.position.copy(e.anchor.p).multiplyScalar(0.9); m.lookAt(m.position.clone().add(e.anchor.n)); });
    }
    add(new THREE.TorusGeometry(0.3, 0.04, 8, 24, Math.PI * 0.9), bone, (m) => { m.position.set(0, -0.6, 0.55); m.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); });
    // Brain is opaque so it reads clearly inside the ghost skull.
    this.brainMat = new THREE.MeshStandardMaterial({ color: 0xe79aa2, roughness: 0.5, emissive: new THREE.Color(0.25, 0.05, 0.08) });
    this.brain = add(G.brain, this.brainMat);
    this.brain.scale.setScalar(0.93);

    // Seizure arcs: jagged lightning over the brain built from instanced segments.
    // Each frame a hashed subset of arcs flickers on and their kinks jitter.
    const r = mulberry32(99);
    this.arcPaths = [];
    for (let i = 0; i < 12; i++) {
      const pts = [];
      let th = r() * Math.PI * 2, ph = 0.25 + r() * 1.5;
      for (let k = 0; k < 11; k++) {
        th += (r() - 0.5) * 0.55; ph += (r() - 0.5) * 0.4;
        pts.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th) * 0.66, Math.cos(ph) * 0.6 + 0.18, Math.sin(ph) * Math.sin(th) * 0.8 - 0.04).multiplyScalar(1.03));
      }
      this.arcPaths.push(pts);
    }
    this.arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.arcMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true), this.arcMat, 12 * 10);
    this.arcMesh.frustumCulled = false;
    this.arcMesh.renderOrder = 18;
    this.group.add(this.arcMesh);
    this.ghostLayer.push(this.arcMesh);
    this.ghostSkinMat = ghostSkin; this.boneMat = bone;
  }

  /** Clip planes for the x-ray sweep (world space; updated in set()). */
  setClipping(on) {
    this.planeSkin = new THREE.Plane(new THREE.Vector3(0, 0, 1), 100);
    this.planeX = new THREE.Plane(new THREE.Vector3(0, 0, -1), -100);
    const mats = new Set();
    this.skinLayer.forEach((m) => mats.add(m.material));
    for (const m of mats) m.clippingPlanes = on ? [this.planeSkin] : null;
    this.flakeMesh.material.clippingPlanes = on ? [this.planeSkin] : null;
    const gm = new Set();
    (this.ghostLayer || []).forEach((m) => gm.add(m.material));
    for (const m of gm) m.clippingPlanes = on ? [this.planeX] : null;
  }

  /** Apply a full state (missing keys fall back to defaults → frames are independent). */
  set(state) {
    const s = { ...DEFAULT_STATE, ...state };
    this.state = s;
    // swelling + features riding on it
    this.skin.morphTargetInfluences[0] = s.swell;
    for (const a of this.anchored) a.obj.position.copy(a.base).addScaledVector(a.n, swellField(a.p) * s.swell);
    this.uniforms.uBurn.value = s.burn;
    this.uniforms.uFrozen.value = s.frozen;
    this.uniforms.uRed.value = Math.max(s.redness, s.swell * 1.15);

    // eyelids: 0 = open, 1 = closed; swelling narrows the left eye
    const lid = (v) => -0.6 + (0.55 + 0.6) * clamp(v);
    this.eyes.L.upper.rotation.x = lid(Math.max(s.lidL, s.swell * 0.72));
    this.eyes.R.upper.rotation.x = lid(s.lidR);
    for (const side of ['L', 'R']) this.eyes[side].gaze.rotation.set(-s.gazeY * 0.4, s.gazeX * 0.5, 0);

    // brows
    for (const side of ['L', 'R']) {
      const b = this.brows[side];
      const raise = side === 'L' ? s.browRaise * (1 - s.frozen) : s.browRaise;
      b.mesh.position.y = b.mesh.position.y + raise * 0.06;
    }

    // mouth corners: smile lifts both, unless smileLeft overrides the (paralysed) left side
    const sl = s.smileLeft == null ? s.smile : s.smileLeft;
    this.mouth.R.rotation.z = -0.42 * s.smile;
    this.mouth.L.rotation.z = 0.42 * sl - 0.08 * s.frozen;

    // flakes
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.flakes.forEach((f, i) => {
      const k = clamp((s.peel - f.delay * 0.6) / 0.45);
      const visible = s.burn > 0.05 && s.peel > 0;
      const lift = smooth(k);
      pos.copy(f.p).addScaledVector(f.n, 0.012 + lift * 0.35).addScaledVector(f.drift, lift * lift);
      q.setFromUnitVectors(zAxis, f.n);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lift * f.spin, lift * f.spin * 0.7, 0)));
      const size = visible ? (k < 1 ? 1 - lift * 0.6 : 0) * smooth(clamp(s.burn * 2)) : 0;
      sc.setScalar(size);
      m4.compose(pos, q, sc);
      this.flakeMesh.setMatrixAt(i, m4);
    });
    this.flakeMesh.instanceMatrix.needsUpdate = true;
    this.flakeMesh.visible = s.peel > 0 && s.burn > 0.05;

    // beam path dashes
    const a = this.entry.clone().addScaledVector(this.beamDir, -0.7);
    const b = this.exit.clone().addScaledVector(this.beamDir, 0.7);
    const L = a.distanceTo(b);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.beamDir);
    for (let i = 0; i < this.pathSegs; i++) {
      const u = (i + 0.5) / this.pathSegs;
      const show = clamp((s.path * 1.25 - u) / 0.08);
      pos.copy(a).addScaledVector(this.beamDir, u * L);
      sc.set(1, show * (L / this.pathSegs) * 0.55 / 0.1, 1).multiplyScalar(show > 0 ? 1 : 0);
      m4.compose(pos, q, sc);
      this.pathMesh.setMatrixAt(i, m4);
    }
    this.pathMesh.instanceMatrix.needsUpdate = true;
    this.pathMesh.visible = s.path > 0;

    // eye flash
    this.flash.visible = s.flash > 0.001;
    this.flash.scale.setScalar(0.2 + 1.6 * s.flash);
    this.flash.material.opacity = clamp(s.flash * 1.5);

    // x-ray sweep along local -Z → +Z (from the back of the skull to the face)
    if (this.o.xray) {
      this.group.updateWorldMatrix(true, false);
      const wm = this.group.matrixWorld;
      const sPos = THREE.MathUtils.lerp(-1.45, 1.5, clamp(s.xray));
      const pt = new THREE.Vector3(0, 0, sPos).applyMatrix4(wm);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(wm);
      this.planeSkin.setFromNormalAndCoplanarPoint(n, pt);
      this.planeX.setFromNormalAndCoplanarPoint(n.clone().negate(), pt);
      const anyX = s.xray > 0.001;
      for (const m of this.ghostLayer) m.visible = anyX;
      this.brainMat.emissive.setRGB(0.25 - 0.2 * s.brainGlow, 0.05 + 0.6 * s.brainGlow, 0.08 + 0.62 * s.brainGlow);
      this.arcMesh.visible = anyX && s.arcs > 0;
      if (this.arcMesh.visible) {
        const up = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion(), m = new THREE.Matrix4();
        const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), dir2 = new THREE.Vector3();
        let idx = 0;
        this.arcPaths.forEach((pts, i) => {
          const on = hash1(i * 7.3 + s.arcSeed * 1.91) < 0.55 * s.arcs;
          for (let k = 0; k < pts.length - 1; k++, idx++) {
            const j = (n, kk) => (hash1(n * 3.7 + kk * 11.1 + s.arcSeed * 5.3) - 0.5) * 0.08;
            pa.copy(pts[k]).add(new THREE.Vector3(j(i, k), j(i + 9, k), j(i + 17, k)));
            pb.copy(pts[k + 1]).add(new THREE.Vector3(j(i, k + 1), j(i + 9, k + 1), j(i + 17, k + 1)));
            dir2.subVectors(pb, pa);
            const len = dir2.length();
            mid.addVectors(pa, pb).multiplyScalar(0.5);
            q2.setFromUnitVectors(up, dir2.normalize());
            m.compose(mid, q2, new THREE.Vector3(on ? 1 : 0, on ? len : 0, on ? 1 : 0));
            this.arcMesh.setMatrixAt(idx, m);
          }
        });
        this.arcMesh.instanceMatrix.needsUpdate = true;
      }
      if (s.arcs > 0) {
        const fl = hash1(s.arcSeed * 2.17) > 0.5 ? 1 : 0.3;
        this.brainMat.emissive.setRGB(0.2 + 0.25 * fl, 0.03, 0.1 + 0.45 * fl);
      }
    }
  }
}
