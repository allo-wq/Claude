// Procedural 3D armour. Every piece is built from lofted / swept surfaces and
// rounded boxes -- no external model files, so the whole short is reproducible
// from source.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeMaterials } from './materials.js';
import { smooth } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const sgnpow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

// ---------------------------------------------------------------- helpers --
function loft(rings, { closed = true, capStart = false, capEnd = false } = {}) {
  const N = rings.length;
  const M = rings[0].length;
  const pos = [];
  const idx = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) pos.push(rings[i][j].x, rings[i][j].y, rings[i][j].z);
  const jMax = closed ? M : M - 1;
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < jMax; j++) {
      const a = i * M + j;
      const b = i * M + ((j + 1) % M);
      const c = (i + 1) * M + j;
      const d = (i + 1) * M + ((j + 1) % M);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (i, flip) => {
    const ctr = V(0, 0, 0);
    rings[i].forEach((p) => ctr.add(p));
    ctr.multiplyScalar(1 / M);
    const ci = pos.length / 3;
    pos.push(ctr.x, ctr.y, ctr.z);
    for (let j = 0; j < jMax; j++) {
      const a = i * M + j;
      const b = i * M + ((j + 1) % M);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(N - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Unit superellipse outline (e = 2 circle, larger = boxier).
function superPts(M, e) {
  const out = [];
  for (let j = 0; j < M; j++) {
    const t = (j / M) * PI * 2;
    out.push([sgnpow(Math.cos(t), 2 / e), sgnpow(Math.sin(t), 2 / e)]);
  }
  return out;
}

// Flat padded band swept along a path. W = direction of the band's width.
function ribbon(path, width, thick, W, { e = 4, M = 16, closed = false } = {}) {
  const n = path.length;
  const sp = superPts(M, e);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const prev = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const T = next.clone().sub(prev).normalize();
    const w = (typeof W === 'function' ? W(i, p) : W).clone();
    w.addScaledVector(T, -w.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, w).normalize();
    const wd = typeof width === 'function' ? width(i / (n - 1)) : width;
    rings.push(sp.map(([c, s]) => p.clone().addScaledVector(w, (c * wd) / 2).addScaledVector(N, (s * thick) / 2)));
  }
  if (closed) rings.push(rings[0].map((p) => p.clone()));
  return loft(rings, { capStart: !closed, capEnd: !closed });
}

const curvePts = (pts, n, closed = false) => new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5).getPoints(n);
const tube = (pts, r, { closed = false, seg = 48, radial = 8 } = {}) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5), seg, r, radial, closed);
const rbox = (w, h, d, r = 0.05, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

function add(parent, geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale !== undefined) {
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale[0], scale[1], scale[2]);
  }
  parent.add(m);
  return m;
}

// Cylinder between two points.
function seg(parent, a, b, r, mat, radial = 6) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), radial), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  parent.add(m);
  return m;
}

// Put a mesh at P with its +Z along normal n.
function place(mesh, P, n) {
  mesh.position.copy(P);
  mesh.lookAt(P.clone().add(n));
  return mesh;
}

// Smooth 1D curve through control points (Catmull-Rom tangents).
function spline(pts) {
  const n = pts.length;
  const m = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
  };
}

// Padded soft panel: cross-sections stacked along Y, bent by zSurf(x, y).
function panel({ yBot, yTop, halfW, depth, zSurf, M = 44, NV = 26, e = 5 }) {
  const sp = superPts(M, e);
  const rings = [];
  for (let i = 0; i <= NV; i++) {
    const v = 0.5 - 0.5 * Math.cos((PI * i) / NV); // dense near the edges
    const tk = depth * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * v - 1), 6)), 1 / 3) + 0.004;
    rings.push(
      sp.map(([c, s]) => {
        const y = yBot + v * (yTop(c) - yBot);
        const x = c * halfW(y);
        return V(x, y, zSurf(x, y) + (s * tk) / 2);
      })
    );
  }
  return loft(rings, { capStart: true, capEnd: true });
}

// ----------------------------------------------------------------- HELMET --
function buildHelmet(M) {
  const g = new THREE.Group();
  const a = 0.95;
  const b = 0.93;
  const c = 1.12;
  const wrap = (phi) => Math.abs(((((phi + PI) % (2 * PI)) + 2 * PI) % (2 * PI)) - PI);
  // Rim height around the head: level brow, high cut over the ears, low nape.
  const thetaMax = (phi) => {
    const p = wrap(phi);
    return 1.5 + 0.4 * smooth(2.0, 2.9, p) - 0.27 * Math.exp(-(((p - 1.62) / 0.42) ** 2));
  };
  const shellPt = (phi, th, k = 1) => {
    if (th <= PI / 2) {
      const s = Math.sin(th);
      return V(a * s * Math.sin(phi) * k, b * Math.cos(th) * k, c * s * Math.cos(phi) * k);
    }
    return V(a * Math.sin(phi) * k, -b * (th - PI / 2) * 0.95, c * Math.cos(phi) * k);
  };
  const shellN = (p) => V(p.x / (a * a), Math.max(p.y, 0) / (b * b), p.z / (c * c)).normalize();

  const NU = 96;
  const NV = 30;
  const shellRings = (k) => {
    const rings = [];
    for (let i = 0; i <= NV; i++) {
      const v = Math.max(i / NV, 0.002);
      const ring = [];
      for (let j = 0; j < NU; j++) {
        const phi = -PI + (j / NU) * 2 * PI;
        ring.push(shellPt(phi, v * thetaMax(phi), k));
      }
      rings.push(ring);
    }
    return rings;
  };
  const outer = shellRings(1);
  const inner = shellRings(0.94);
  add(g, loft(outer), M.camoShell);
  add(g, loft(inner), M.rubber);
  add(g, loft([outer[NV], inner[NV]]), M.rubber);
  add(g, tube(outer[NV].map((p) => p.clone().multiplyScalar(0.985)), 0.034, { closed: true, seg: 160 }), M.rubber);

  // velcro fields
  const patch = (phi0, phi1, v0, v1, mat = M.velcro, k = 1.014) => {
    const rings = [];
    for (let i = 0; i <= 8; i++) {
      const v = v0 + ((v1 - v0) * i) / 8;
      const ring = [];
      for (let j = 0; j <= 18; j++) {
        const phi = phi0 + ((phi1 - phi0) * j) / 18;
        ring.push(shellPt(phi, v * thetaMax(phi), k));
      }
      rings.push(ring);
    }
    add(g, loft(rings, { closed: false }), mat);
  };
  patch(0.78, 2.15, 0.4, 0.68);
  patch(-2.15, -0.78, 0.4, 0.68);
  patch(2.72, 2 * PI - 2.72, 0.42, 0.74);
  {
    // top panel
    const rings = [];
    for (let i = 0; i <= 10; i++) {
      const z = -0.5 + (0.92 * i) / 10;
      const ring = [];
      for (let j = 0; j <= 10; j++) {
        const x = -0.3 + (0.6 * j) / 10;
        ring.push(V(x, b * Math.sqrt(1 - (x / a) ** 2 - (z / c) ** 2), z).multiplyScalar(1.014));
      }
      rings.push(ring);
    }
    add(g, loft(rings, { closed: false }), M.velcro);
  }

  // accessory rails + ear protection
  for (const s of [1, -1]) {
    const path = [];
    for (let j = 0; j <= 20; j++) {
      const phi = s * (0.9 + (1.45 * j) / 20);
      path.push(shellPt(phi, thetaMax(phi) - 0.15, 1.04));
    }
    add(g, ribbon(path, 0.17, 0.075, V(0, 1, 0), { e: 6 }), M.polymer);
    for (const j of [4, 8, 12, 16]) {
      add(g, rbox(0.05, 0.07, 0.11, 0.015), M.metal, [path[j].x * 1.035, path[j].y, path[j].z]);
    }
    for (const phi of [0.92, 2.25]) {
      const P = shellPt(s * phi, thetaMax(phi) - 0.06, 1.0);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.035, 12).rotateX(PI / 2), M.metal);
      place(bolt, P.clone().multiplyScalar(1.012), shellN(P));
      g.add(bolt);
    }
    // headset
    const ear = new THREE.Group();
    ear.position.set(s * 0.9, -0.44, -0.02);
    ear.rotation.z = s * 0.07;
    add(ear, rbox(0.28, 0.68, 0.52, 0.13, 6), M.fabricDark);
    add(ear, rbox(0.07, 0.42, 0.32, 0.03), M.polymer, [s * 0.14, 0, 0]);
    add(ear, rbox(0.1, 0.62, 0.48, 0.05), M.rubber, [-s * 0.15, 0, 0]);
    add(ear, rbox(0.05, 0.1, 0.1, 0.02), M.metal, [s * 0.17, 0.08, 0.04]);
    g.add(ear);
    add(g, rbox(0.07, 0.46, 0.09, 0.03), M.polymer, [s * 1.0, -0.02, -0.02], [0, 0, s * 0.1]);
    // chin strap
    const A = shellPt(s * 0.95, thetaMax(0.95) - 0.04, 0.96);
    const R = shellPt(s * 2.25, thetaMax(2.25) - 0.04, 0.96);
    const J = V(s * 0.74, -1.0, 0.28);
    const C = V(s * 0.2, -1.6, 0.64);
    add(g, tube([A, V(s * 0.84, -0.6, 0.48), J], 0.03, { seg: 16 }), M.elastic);
    add(g, tube([R, V(s * 0.86, -0.62, -0.2), J], 0.03, { seg: 16 }), M.elastic);
    add(g, tube([J, V(s * 0.52, -1.38, 0.5), C], 0.03, { seg: 16 }), M.elastic);
    add(g, rbox(0.07, 0.1, 0.1, 0.02), M.polymer, [J.x, J.y, J.z]);
  }
  add(g, rbox(0.52, 0.17, 0.27, 0.08, 5), M.rubber, [0, -1.63, 0.68], [-0.45, 0, 0]);
  // boom mic
  add(g, tube([V(-0.93, -0.66, 0.2), V(-0.82, -0.9, 0.72), V(-0.4, -1.0, 1.0)], 0.02, { seg: 20, radial: 6 }), M.polymer);
  add(g, new THREE.SphereGeometry(0.075, 14, 10), M.rubber, [-0.38, -1.0, 1.01], null, [1.4, 1, 1]);

  // NVG shroud
  {
    const P = shellPt(0, 1.02, 1.0);
    const n = shellN(P);
    const sh = new THREE.Group();
    add(sh, rbox(0.38, 0.36, 0.07, 0.035), M.polymer, [0, 0, 0.02]);
    add(sh, rbox(0.22, 0.2, 0.06, 0.02), M.metal, [0, -0.01, 0.055]);
    add(sh, rbox(0.1, 0.05, 0.05, 0.015), M.polymer, [0, 0.13, 0.06]);
    for (const [x, y] of [[-0.14, 0.13], [0.14, 0.13], [-0.14, -0.13], [0.14, -0.13]]) {
      add(sh, new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8).rotateX(PI / 2), M.metal, [x, y, 0.055]);
    }
    place(sh, P, n);
    g.add(sh);
  }
  // counterweight pouch + strobe
  add(g, rbox(0.6, 0.3, 0.17, 0.07, 5), M.camo, [0, -0.13, -1.2]);
  add(g, rbox(0.5, 0.05, 0.03, 0.01), M.webbing, [0, -0.13, -1.29]);
  {
    const P = shellPt(PI + 0.35, 0.62, 1.0);
    const st = new THREE.Mesh(rbox(0.13, 0.2, 0.07, 0.03), M.polymer);
    place(st, P.clone().multiplyScalar(1.03), shellN(P));
    g.add(st);
  }
  return g;
}

// ---------------------------------------------------------------- GOGGLES --
function buildGoggles(M) {
  const g = new THREE.Group();
  const R = 1.25;
  const A = 1.02; // half arc
  const H = 0.47;
  const n = 3.2;
  const top = (a) => H * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(a / A), n)), 1 / n);
  const notch = (a) => 0.36 * Math.exp(-((a / 0.2) ** 2));
  const bot = (a) => Math.min(-top(a) + notch(a) * smooth(0, 0.2, top(a)), top(a));
  const P = (a, y, r = R) => V(r * Math.sin(a), y, r * Math.cos(a) - R);

  // lens
  {
    const rings = [];
    for (let i = 0; i <= 60; i++) {
      const a = -A * 0.985 + (2 * A * 0.985 * i) / 60;
      const ring = [];
      for (let j = 0; j <= 12; j++) ring.push(P(a, bot(a) + ((top(a) - bot(a)) * j) / 12));
      rings.push(ring);
    }
    add(g, loft(rings, { closed: false }), M.lens);
  }
  // frame
  const outline = (r, k) => {
    const pts = [];
    const NA = 70;
    for (let i = 0; i <= NA; i++) {
      const a = -A + (2 * A * i) / NA;
      pts.push(P(a * k, top(a) * k, r));
    }
    for (let i = NA; i >= 0; i--) {
      const a = -A + (2 * A * i) / NA;
      pts.push(P(a * k, bot(a) * k, r));
    }
    return pts;
  };
  const front = outline(R + 0.015, 1.0);
  const back = outline(R - 0.2, 1.1);
  add(g, loft([front, back.map((p) => p.clone())]), M.polymer);
  add(g, tube(front, 0.062, { closed: true, seg: 200 }), M.polymer);
  add(g, tube(back, 0.1, { closed: true, seg: 200 }), M.rubber);
  // top vents
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.22;
    const m = add(g, rbox(0.15, 0.03, 0.09, 0.012), M.rubber);
    m.position.copy(P(a, top(a) * 1.05 + 0.03, R - 0.09));
    m.rotation.y = a;
  }
  // strap
  const sideEnd = P(A * 1.1, 0, R - 0.12);
  const strapPts = curvePts(
    [
      V(sideEnd.x, 0, sideEnd.z + 0.05),
      V(1.3, 0, -1.25),
      V(1.16, 0, -1.95),
      V(0.66, 0, -2.52),
      V(0, 0, -2.72),
      V(-0.66, 0, -2.52),
      V(-1.16, 0, -1.95),
      V(-1.3, 0, -1.25),
      V(-sideEnd.x, 0, sideEnd.z + 0.05),
    ],
    80
  );
  add(g, ribbon(strapPts, 0.36, 0.035, V(0, 1, 0), { e: 6 }), M.elastic);
  for (const dy of [-0.09, 0.09]) {
    add(g, ribbon(strapPts.map((p) => V(p.x * 1.012, dy, p.z * 1.004 - 0.004)), 0.035, 0.03, V(0, 1, 0), { e: 3, M: 8 }), M.webbing);
  }
  for (const s of [1, -1]) {
    add(g, rbox(0.1, 0.4, 0.2, 0.035), M.polymer, [s * sideEnd.x, 0, sideEnd.z + 0.02], [0, s * 0.5, 0]);
    add(g, rbox(0.06, 0.44, 0.16, 0.02), M.polymer, [s * 1.29, 0, -1.4], [0, s * 0.1, 0]);
  }
  add(g, rbox(0.34, 0.2, 0.05, 0.02), M.patch, [0, 0, -2.74]);
  return g;
}

// ------------------------------------------------------------------- VEST --
function buildVest(M) {
  const g = new THREE.Group();
  const K = 0.16; // wrap-around bend
  const D = 0.3;
  const zMidF = (x) => 0.58 - K * x * x;
  const zF = (x) => zMidF(x) + D / 2; // outer face of the front panel
  const rotF = (x) => Math.atan(2 * K * x);
  const halfW = (y) => 1.0 - 0.4 * smooth(0.45, 1.25, y);

  add(
    g,
    panel({ yBot: -1.25, yTop: (u) => 1.25 - 0.24 * Math.exp(-((u / 0.42) ** 2)), halfW, depth: D, zSurf: (x) => zMidF(x), e: 6 }),
    M.camo
  );
  add(g, panel({ yBot: -1.25, yTop: () => 1.3, halfW, depth: D, zSurf: (x) => -zMidF(x), e: 6 }), M.camo);

  const row = (y, x0, x1, z, sign, w = 0.095, mat = M.webbing, th = 0.035) => {
    const path = [];
    for (let i = 0; i <= 24; i++) {
      const x = x0 + ((x1 - x0) * i) / 24;
      path.push(V(x, y, sign * (zF(x) + z)));
    }
    add(g, ribbon(path, w, th, V(0, 1, 0), { e: 3, M: 10 }), mat);
  };
  // MOLLE webbing, front and back
  for (let i = 0; i < 6; i++) row(-1.06 + 0.185 * i, -0.88, 0.88, 0.012, 1);
  for (let i = 0; i < 9; i++) row(-1.06 + 0.185 * i, -0.86, 0.86, 0.012, -1);
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.2;
    add(g, rbox(0.016, 1.06, 0.03, 0.006, 1), M.fabricDark, [x, -0.6, zF(x) + 0.03], [0, rotF(x), 0]);
    add(g, rbox(0.016, 1.6, 0.03, 0.006, 1), M.fabricDark, [x, -0.32, -(zF(x) + 0.03)], [0, -rotF(x), 0]);
  }
  // chest velcro + patches
  row(0.58, -0.64, 0.64, 0.01, 1, 0.56, M.velcro, 0.03);
  add(g, rbox(0.34, 0.24, 0.03, 0.012), M.patch, [0.32, 0.66, zF(0.32) + 0.03], [0, rotF(0.32), 0]);
  add(g, rbox(0.56, 0.115, 0.03, 0.012), M.patch, [-0.24, 0.43, zF(0.24) + 0.03], [0, -rotF(0.24), 0]);
  add(g, rbox(0.3, 0.12, 0.03, 0.012), M.fabricDark, [-0.36, 0.7, zF(0.36) + 0.03], [0, -rotF(0.36), 0]);

  // triple magazine pouch
  for (const x of [-0.52, 0, 0.52]) {
    const p = new THREE.Group();
    p.position.set(x, -0.7, zF(x) + 0.14);
    p.rotation.y = rotF(x);
    add(p, rbox(0.46, 0.76, 0.27, 0.075, 5), M.camo);
    add(p, rbox(0.3, 0.32, 0.15, 0.025), M.metal, [0, 0.43, -0.01], [0.05, 0, 0]);
    add(p, rbox(0.26, 0.04, 0.13, 0.012), M.polymer, [0, 0.6, -0.01], [0.05, 0, 0]);
    add(p, new THREE.TorusGeometry(0.105, 0.014, 6, 16, PI).rotateY(PI / 2), M.elastic, [0, 0.52, 0]);
    add(p, rbox(0.07, 0.15, 0.025, 0.01), M.webbing, [0, 0.36, 0.14]);
    add(p, rbox(0.4, 0.06, 0.03, 0.01), M.webbing, [0, -0.1, 0.135]);
    add(p, rbox(0.4, 0.06, 0.03, 0.01), M.webbing, [0, 0.1, 0.135]);
    g.add(p);
  }

  // shoulder straps
  for (const s of [1, -1]) {
    const pts = curvePts(
      [V(s * 0.5, 1.02, 0.66), V(s * 0.52, 1.5, 0.52), V(s * 0.54, 1.76, 0.2), V(s * 0.54, 1.8, -0.15), V(s * 0.52, 1.55, -0.5), V(s * 0.5, 1.02, -0.68)],
      40
    );
    add(g, ribbon(pts, 0.4, 0.07, V(1, 0, 0), { e: 5 }), M.webbing);
    add(g, ribbon(pts.slice(9, 31), 0.5, 0.14, V(1, 0, 0), { e: 4 }), M.camo);
    add(g, rbox(0.3, 0.1, 0.05, 0.02), M.polymer, [s * 0.5, 1.12, 0.71], [-0.3, 0, 0]);
    // cummerbund
    const cb = curvePts(
      [V(s * 0.9, -0.55, zF(0.9) - 0.1), V(s * 1.13, -0.55, 0.38), V(s * 1.2, -0.55, 0), V(s * 1.13, -0.55, -0.38), V(s * 0.9, -0.55, -(zF(0.9) - 0.1))],
      30
    );
    add(g, ribbon(cb, 0.78, 0.1, V(0, 1, 0), { e: 6 }), M.camo);
    for (const dy of [-0.24, 0, 0.24]) {
      add(g, ribbon(cb.slice(3, 28).map((p) => V(p.x * 1.05, p.y + dy, p.z)), 0.095, 0.035, V(0, 1, 0), { e: 3, M: 10 }), M.webbing);
    }
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10), M.polymer, [s * 0.96, -0.55, zF(0.96) - 0.02]);
  }
  // radio + antenna on the left side
  {
    const r = new THREE.Group();
    r.position.set(-1.3, -0.4, 0.08);
    r.rotation.y = -PI / 2;
    add(r, rbox(0.34, 0.62, 0.22, 0.06), M.camo);
    add(r, rbox(0.26, 0.26, 0.15, 0.03), M.polymer, [0, 0.4, 0]);
    add(r, new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), M.metal, [0.07, 0.57, 0]);
    add(r, new THREE.CylinderGeometry(0.014, 0.02, 1.15, 8), M.rubber, [-0.07, 1.1, 0], [0, 0, 0.06]);
    add(r, new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), M.polymer, [-0.07, 0.56, 0]);
    g.add(r);
  }
  // drag handle
  add(g, tube([V(-0.24, 1.26, -0.76), V(-0.16, 1.44, -0.84), V(0.16, 1.44, -0.84), V(0.24, 1.26, -0.76)], 0.035, { seg: 20 }), M.webbing);
  return g;
}

// ------------------------------------------------------------------ GLOVE --
function buildGlove(M) {
  const g = new THREE.Group();
  add(g, rbox(1.02, 1.08, 0.38, 0.16, 6), M.fabric, [0, 0, 0]);
  add(g, rbox(0.98, 1.02, 0.1, 0.05, 4), M.rubber, [0, 0, -0.16]); // palm
  add(g, rbox(0.82, 0.5, 0.07, 0.03), M.camo, [0, -0.1, 0.18]);
  for (const x of [-0.2, 0, 0.2]) add(g, rbox(0.03, 0.44, 0.03, 0.01), M.fabricDark, [x, -0.1, 0.215]);

  const fingers = [
    { x: -0.375, len: 0.9, r: 0.122, spread: 0.07 },
    { x: -0.125, len: 1.02, r: 0.126, spread: 0.02 },
    { x: 0.125, len: 0.94, r: 0.12, spread: -0.03 },
    { x: 0.375, len: 0.74, r: 0.108, spread: -0.09 },
  ];
  for (const f of fingers) {
    const base = new THREE.Group();
    base.position.set(f.x, 0.48, 0);
    base.rotation.set(-0.1, 0, f.spread);
    g.add(base);
    let parent = base;
    const lens = [0.45, 0.31, 0.24].map((k) => k * f.len);
    const curls = [0, -0.2, -0.17];
    lens.forEach((L, k) => {
      const j = new THREE.Group();
      j.rotation.x = curls[k];
      if (k > 0) j.position.y = lens[k - 1];
      parent.add(j);
      const r = f.r * (1 - 0.07 * k);
      add(j, new THREE.CapsuleGeometry(r, L, 6, 14), k === 2 ? M.rubber : M.fabric, [0, L / 2, 0]);
      if (k < 2) add(j, rbox(r * 1.5, L * 0.68, 0.06, 0.025), M.polymer, [0, L * 0.52, r * 0.95]);
      parent = j;
    });
    add(g, new THREE.SphereGeometry(0.115, 14, 10), M.polymer, [f.x, 0.5, 0.2], null, [1, 0.95, 0.62]);
  }
  add(g, rbox(1.0, 0.24, 0.12, 0.055), M.polymer, [0, 0.47, 0.17]);
  // thumb
  {
    const t = new THREE.Group();
    t.position.set(-0.47, -0.22, -0.02);
    t.rotation.set(-0.3, 0, 0.78);
    add(t, new THREE.SphereGeometry(0.2, 14, 10), M.fabric, [0, 0, 0], null, [1, 1.25, 0.95]);
    add(t, new THREE.CapsuleGeometry(0.135, 0.36, 6, 14), M.fabric, [0, 0.3, 0]);
    const j = new THREE.Group();
    j.position.y = 0.52;
    j.rotation.set(-0.15, 0, -0.3);
    add(j, new THREE.CapsuleGeometry(0.122, 0.26, 6, 14), M.rubber, [0, 0.16, 0]);
    t.add(j);
    g.add(t);
  }
  // cuff
  const cuff = new THREE.CylinderGeometry(0.5, 0.6, 0.72, 28, 1, true);
  add(g, cuff, M.fabricDark, [0, -0.84, 0], null, [1, 1, 0.42]);
  add(g, new THREE.TorusGeometry(0.6, 0.035, 8, 32).rotateX(PI / 2), M.fabricDark, [0, -1.2, 0], null, [1, 1, 0.42]);
  add(g, rbox(0.78, 0.22, 0.06, 0.025), M.velcro, [0.02, -0.82, 0.235]);
  add(g, rbox(0.22, 0.24, 0.05, 0.02), M.polymer, [0.42, -0.82, 0.26]);
  add(g, new THREE.CircleGeometry(1, 28).rotateX(PI / 2), M.rubber, [0, -1.18, 0], null, [0.57, 1, 0.24]);
  return g;
}

// --------------------------------------------------------------- KNEE PAD --
function buildKneePad(M) {
  const g = new THREE.Group();
  const zS = (x, y) => -0.5 * x * x - 0.16 * y * y;
  add(
    g,
    panel({
      yBot: -1.0,
      yTop: () => 1.0,
      halfW: (y) => 0.68 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y), 3.4)), 1 / 3.4) + 0.01,
      depth: 0.24,
      zSurf: zS,
      e: 4,
      NV: 30,
    }),
    M.camo
  );
  const capGeo = new THREE.SphereGeometry(1, 44, 22, 0, PI * 2, 0, 1.15).rotateX(PI / 2);
  add(g, capGeo, M.polymer, [0, -0.02, -0.12], null, [0.53, 0.68, 0.36]);
  add(g, capGeo, M.rubber, [0, -0.02, -0.105], null, [0.34, 0.47, 0.37]);
  for (const y of [-0.16, 0.0, 0.16]) add(g, rbox(0.34, 0.035, 0.05, 0.012), M.polymer, [0, y - 0.02, 0.245]);
  add(g, rbox(0.52, 0.2, 0.05, 0.02), M.velcro, [0, 0.76, 0.045], [-0.26, 0, 0]);
  for (const [x, y] of [[-0.4, 0.42], [0.4, 0.42], [-0.4, -0.46], [0.4, -0.46]]) {
    add(g, new THREE.SphereGeometry(0.038, 10, 8), M.metal, [x, y, zS(x, y) + 0.125]);
  }
  for (const y of [0.5, -0.52]) {
    const path = [];
    for (let i = 0; i <= 30; i++) {
      const bta = (PI * i) / 30;
      path.push(V(0.62 * Math.cos(bta), y, -0.2 - 0.72 * Math.sin(bta)));
    }
    add(g, ribbon(path, 0.22, 0.035, V(0, 1, 0), { e: 6 }), M.elastic);
    add(g, rbox(0.09, 0.28, 0.14, 0.03), M.polymer, [0.63, y, -0.2]);
    add(g, rbox(0.09, 0.28, 0.14, 0.03), M.polymer, [-0.63, y, -0.2]);
  }
  return g;
}

// ------------------------------------------------------------------- BOOT --
function buildBoot(M) {
  const g = new THREE.Group();
  const hw = spline([[-0.62, 0.03], [-0.585, 0.17], [-0.5, 0.275], [-0.3, 0.35], [0.0, 0.375], [0.3, 0.385], [0.7, 0.44], [1.0, 0.435], [1.2, 0.36], [1.32, 0.26], [1.385, 0.15], [1.41, 0.03]]);
  const ht = spline([[-0.62, 0.72], [-0.4, 0.9], [0.1, 0.95], [0.3, 0.86], [0.5, 0.7], [0.75, 0.56], [1.0, 0.48], [1.2, 0.4], [1.32, 0.31], [1.385, 0.2], [1.41, 0.06]]);
  const sp = superPts(40, 2.7);
  const footRings = (z0, z1, n, k = 1, yk = 1, zOff = 0) => {
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const u = 0.5 - 0.5 * Math.cos((PI * i) / n);
      const z = z0 + (z1 - z0) * u;
      rings.push(sp.map(([c, s]) => V(c * hw(z) * k, (0.5 + 0.5 * s) * ht(z) * yk, z + zOff)));
    }
    return rings;
  };
  add(g, loft(footRings(-0.62, 1.41, 40), { capStart: true, capEnd: true }), M.suede);
  add(g, loft(footRings(0.98, 1.413, 16, 1.04, 1.05), { capEnd: true }), M.suedeDark); // toe cap
  add(g, loft(footRings(-0.62, -0.12, 14, 1.05, 0.64, -0.014)), M.suedeDark); // heel counter

  // shaft
  const zc = (y) => -0.13 + 0.03 * (y - 0.55);
  const rx = spline([[0.5, 0.37], [0.95, 0.345], [1.5, 0.365], [2.05, 0.41]]);
  const rz = spline([[0.5, 0.5], [0.95, 0.45], [1.5, 0.465], [2.05, 0.51]]);
  const shaftRing = (y, k = 1) => {
    const ring = [];
    for (let j = 0; j < 40; j++) {
      const t = (j / 40) * PI * 2;
      ring.push(V(rx(y) * k * Math.cos(t), y, zc(y) + rz(y) * k * Math.sin(t)));
    }
    return ring;
  };
  const rings = [];
  for (let i = 0; i <= 18; i++) rings.push(shaftRing(0.5 + (1.55 * i) / 18));
  add(g, loft(rings), M.fabric);
  add(g, tube(shaftRing(2.05, 1.0), 0.085, { closed: true, seg: 60 }), M.fabricDark);
  add(g, tube(shaftRing(1.9, 1.02), 0.05, { closed: true, seg: 60 }), M.fabricDark);
  add(g, tube(shaftRing(1.3, 1.012), 0.018, { closed: true, seg: 60, radial: 6 }), M.suedeDark);
  add(g, new THREE.CircleGeometry(1, 30).rotateX(-PI / 2), M.rubber, [0, 1.99, zc(2.0)], null, [rx(2.0) * 0.97, 1, rz(2.0) * 0.97]);
  add(g, new THREE.TorusGeometry(0.095, 0.024, 6, 16), M.webbing, [0, 2.15, zc(2.05) - rz(2.05) + 0.01]);

  // sole
  const outline = (z0, z1, k) => {
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      pts.push(new THREE.Vector2(hw(z) * k + 0.02, z));
    }
    for (let i = n; i >= 0; i--) {
      const z = z0 + ((z1 - z0) * i) / n;
      pts.push(new THREE.Vector2(-(hw(z) * k + 0.02), z));
    }
    return new THREE.Shape(pts);
  };
  const slab = (z0, z1, k, depth, yTop, mat) => {
    const geo = new THREE.ExtrudeGeometry(outline(z0, z1, k), { depth, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 2 }).rotateX(PI / 2);
    add(g, geo, mat, [0, yTop, 0]);
  };
  slab(-0.64, 1.43, 1.07, 0.11, 0.03, M.suedeDark); // midsole
  slab(-0.64, -0.06, 1.08, 0.2, -0.09, M.rubber); // heel
  slab(0.2, 1.43, 1.08, 0.11, -0.09, M.rubber); // forefoot
  for (let i = 0; i < 7; i++) {
    const z = 0.3 + i * 0.16;
    for (const s of [1, -1]) add(g, rbox(0.07, 0.1, 0.1, 0.015), M.rubber, [s * (hw(z) * 1.08 + 0.02), -0.17, z]);
  }
  for (let i = 0; i < 3; i++) {
    const z = -0.5 + i * 0.17;
    for (const s of [1, -1]) add(g, rbox(0.07, 0.14, 0.1, 0.015), M.rubber, [s * (hw(z) * 1.08 + 0.02), -0.24, z]);
  }

  // tongue + laces
  const center = [];
  for (const z of [0.9, 0.78, 0.66, 0.55, 0.45]) center.push(V(0, ht(z) + 0.01, z));
  for (const y of [0.92, 1.1, 1.28, 1.46, 1.64, 1.82, 2.0]) center.push(V(0, y, zc(y) + rz(y) + 0.01));
  const cPts = curvePts(center, 50);
  add(g, ribbon(cPts, 0.27, 0.07, V(1, 0, 0), { e: 4 }), M.fabricDark);
  const rowsAt = [3, 8, 13, 18, 23, 28, 33, 38, 43, 47];
  const L = [];
  const Rr = [];
  rowsAt.forEach((i) => {
    const p = cPts[i];
    const T = cPts[Math.min(i + 1, 50)].clone().sub(cPts[Math.max(i - 1, 0)]).normalize();
    const N = V(0, T.z, -T.y).multiplyScalar(-1); // outward normal in the YZ plane
    if (N.z < 0 && N.y < 0) N.multiplyScalar(-1);
    const o = p.clone().addScaledVector(N, 0.045);
    L.push(o.clone().add(V(-0.155, 0, 0)).addScaledVector(N, -0.02));
    Rr.push(o.clone().add(V(0.155, 0, 0)).addScaledVector(N, -0.02));
  });
  for (let i = 0; i < L.length; i++) {
    seg(g, L[i], Rr[i], 0.02, M.webbing);
    add(g, new THREE.SphereGeometry(0.034, 8, 6), M.metal, [L[i].x - 0.01, L[i].y, L[i].z]);
    add(g, new THREE.SphereGeometry(0.034, 8, 6), M.metal, [Rr[i].x + 0.01, Rr[i].y, Rr[i].z]);
    if (i < L.length - 1) {
      seg(g, L[i], Rr[i + 1], 0.017, M.webbing);
      seg(g, Rr[i], L[i + 1], 0.017, M.webbing);
    }
  }
  for (const s of [1, -1]) {
    const top = L[L.length - 1].clone();
    add(g, new THREE.TorusGeometry(0.1, 0.017, 6, 14), M.webbing, [s * 0.13, top.y - 0.03, top.z + 0.05], [0.5, s * 0.5, s * 0.8]);
  }
  return g;
}

// -------------------------------------------------------------- assembly --
function fit(group, maxW, maxH) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = Math.min(maxW / Math.max(size.x, size.z), maxH / size.y);
  const inner = new THREE.Group();
  group.position.sub(center);
  inner.add(group);
  inner.scale.setScalar(s);
  return { inner, s, size, center };
}

function pair(build, M, solo, set) {
  const g = new THREE.Group();
  const L = new THREE.Group();
  const R = new THREE.Group();
  const l = build(M);
  l.scale.x = -1;
  L.add(l);
  R.add(build(M));
  g.add(L, R);
  const apply = (cfg) => {
    R.position.set(cfg.x, cfg.y ?? 0, cfg.z ?? 0);
    R.rotation.set(cfg.rx ?? 0, cfg.ry ?? 0, cfg.rz ?? 0);
    L.position.set(-cfg.x, cfg.y ?? 0, cfg.z ?? 0);
    L.rotation.set(cfg.rx ?? 0, -(cfg.ry ?? 0), -(cfg.rz ?? 0));
    if (cfg.parallel) {
      // both items point the same way (product-shot style) instead of mirrored
      L.rotation.set(cfg.rx ?? 0, cfg.ry ?? 0, cfg.rz ?? 0);
      L.position.z = (cfg.z ?? 0) + cfg.parallel;
    }
  };
  apply(solo);
  return { g, apply, solo, set };
}

// Returns { id: piece }. piece.root is what the choreography animates.
export function buildPieces() {
  const defs = {
    helmet: { build: buildHelmet, maxW: 2.5, maxH: 2.9, yaw: -0.5, tilt: 0.3, setScale: 0.62, setPos: [0, 2.72, 0], setYaw: 0 },
    goggles: { build: buildGoggles, maxW: 2.75, maxH: 2.6, yaw: -0.45, setScale: 0.51, setPos: [0, 2.98, 0.07], setYaw: 0 },
    vest: { build: buildVest, maxW: 2.55, maxH: 3.0, yaw: -0.45, setScale: 0.85, setPos: [0, 0.5, 0], setYaw: 0 },
    gloves: {
      pair: buildGlove,
      solo: { x: 0.72, rz: -0.2, ry: -0.3, y: 0 },
      set: { x: 3.75, rz: PI - 0.12, ry: 0.5 },
      maxW: 2.75,
      maxH: 2.8,
      yaw: -0.25,
      setScale: 0.4,
      setPos: [0, -0.45, 0.1],
      setYaw: 0,
    },
    kneepads: {
      pair: buildKneePad,
      solo: { x: 0.86, ry: -0.3, rz: -0.06 },
      set: { x: 1.0, ry: -0.12 },
      maxW: 2.7,
      maxH: 2.5,
      yaw: -0.3,
      setScale: 0.5,
      setPos: [0, -1.52, 0.12],
      setYaw: 0,
    },
    boots: {
      pair: buildBoot,
      solo: { x: 0.56, ry: 0.0, parallel: -0.25 },
      set: { x: 0.92, ry: 0.22 },
      maxW: 2.75,
      maxH: 2.9,
      yaw: -0.85,
      setScale: 0.5,
      setPos: [0, -2.95, 0.12],
      setYaw: 0,
    },
  };
  const out = {};
  for (const [id, d] of Object.entries(defs)) {
    const M = makeMaterials();
    let model;
    let pr = null;
    if (d.pair) {
      pr = pair(d.pair, M, d.solo, d.set);
      model = pr.g;
    } else {
      model = d.build(M);
    }
    // bbox centre of the alternative (full-set) arrangement, measured up front
    let setOffset = null;
    if (pr) {
      pr.apply(pr.set);
      setOffset = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()).negate();
      pr.apply(pr.solo);
    }
    const f = fit(model, d.maxW, d.maxH);
    const soloOffset = model.position.clone();
    const root = new THREE.Group();
    root.add(f.inner);
    const piece = {
      id,
      root,
      inner: f.inner,
      model,
      U: M.U,
      fitScale: f.s,
      halfH: (f.size.y * f.s) / 2,
      yaw: d.yaw,
      tilt: d.tilt ?? 0,
      setScale: d.setScale / f.s, // root scale that gives the native->set scale
      setPos: d.setPos,
      setYaw: d.setYaw,
      mode: 'solo',
      setMode(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        if (!pr) return;
        pr.apply(mode === 'set' ? pr.set : pr.solo);
        model.position.copy(mode === 'set' ? setOffset : soloOffset);
      },
    };
    out[id] = piece;
  }
  return out;
}
