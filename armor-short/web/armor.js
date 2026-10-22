// Procedural military armor pieces + the "turns green" scan shader.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, clamp, lerp } from './util.js';

const PI = Math.PI;
const ss = THREE.MathUtils.smoothstep;

// ---------------------------------------------------------------- textures
function lattice(seed, P) {
  const r = rng(seed), g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
}
function vnoise(g, P, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Tileable fbm field in 0..1.
function fbmField(size, seed, P0, oct) {
  const out = new Float32Array(size * size), lats = [];
  for (let o = 0; o < oct; o++) lats.push(lattice(seed + o * 101, P0 << o));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0, a = 0.5, tot = 0;
      for (let o = 0; o < oct; o++) {
        const P = P0 << o;
        v += a * vnoise(lats[o], P, (x / size) * P, (y / size) * P);
        tot += a; a *= 0.5;
      }
      out[y * size + x] = v / tot;
    }
  return out;
}
function canvasTex(size, fill, srgb, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTextures() {
  const S = 512;
  const n1 = fbmField(S, 11, 4, 4), n2 = fbmField(S, 23, 5, 4), n3 = fbmField(S, 37, 7, 4), n4 = fbmField(S, 51, 9, 3);
  const speck = fbmField(S, 77, 32, 2);
  // MultiCam-ish blotches.
  const camo = canvasTex(S, (d) => {
    const layers = [
      [n1, 0.55, [107, 110, 70]],
      [n2, 0.585, [112, 84, 56]],
      [n3, 0.63, [60, 56, 40]],
      [n4, 0.62, [214, 200, 160]],
    ];
    for (let i = 0; i < S * S; i++) {
      let r = 184, g = 164, b = 124;
      for (const [n, th, c] of layers) {
        const k = ss(n[i], th, th + 0.018);
        r = lerp(r, c[0], k); g = lerp(g, c[1], k); b = lerp(b, c[2], k);
      }
      const s = (speck[i] - 0.5) * 30;
      d[i * 4] = r + s; d[i * 4 + 1] = g + s; d[i * 4 + 2] = b + s; d[i * 4 + 3] = 255;
    }
  }, true, 1.4);

  const W = 256, grainF = fbmField(W, 91, 64, 2), r = rng(5);
  // Woven nylon bump.
  const weave = canvasTex(W, (d) => {
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const cx = Math.floor(x / 4), cy = Math.floor(y / 4), chk = (cx + cy) % 2 === 0;
        const a = chk ? Math.sin(((x % 4) / 4) * PI) : Math.sin(((y % 4) / 4) * PI);
        const v = 90 + a * 120 + (r() - 0.5) * 40;
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
  }, false, 10);
  // Strap webbing ribs.
  const webbing = canvasTex(W, (d) => {
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const v = 128 + Math.sin((y / W) * PI * 2 * 48) * 90 + (r() - 0.5) * 30;
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
  }, false, 2);
  // Generic surface grain (paint, suede, polymer).
  const grain = canvasTex(W, (d) => {
    for (let i = 0; i < W * W; i++) {
      const v = grainF[i] * 200 + (r() - 0.5) * 60;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  }, false, 3);
  return { camo, weave, webbing, grain };
}

let TEX = null;

// --------------------------------------------------------- green scan FX
// Injects a world-space scan line into MeshStandardMaterial: everything below
// uScan turns glowing tactical green, with a bright edge at the line itself.
export function makeFXUniforms() {
  return {
    uGreen: { value: 0 },
    uScan: { value: -10 },
    uEdge: { value: 0 },
    uPulse: { value: 0 },
    uTime: { value: 0 },
  };
}

function applyFX(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nuniform float uGreen, uScan, uEdge, uPulse, uTime;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          float below = 1.0 - smoothstep(uScan - 0.025, uScan + 0.025, vWPos.y);
          float g = below * uGreen;
          vec3 gc = vec3(0.16, 1.0, 0.36);
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, gc * (0.1 + lum * 1.15), g * 0.85);
          vec3 Vd = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normal, Vd)), 0.0, 1.0), 2.2);
          float lines = smoothstep(0.86, 1.0, abs(sin(vWPos.y * 38.0 - uTime * 3.0)));
          float edge = exp(-abs(vWPos.y - uScan) * 30.0) * uEdge;
          totalEmissiveRadiance += g * gc * (0.015 + fres * 0.5 + lines * 0.08 + uPulse * 0.5)
                                 + edge * vec3(0.55, 1.0, 0.65) * 3.0;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'armorFX';
  return mat;
}

function makeMaterials(U) {
  const S = (o) => applyFX(new THREE.MeshStandardMaterial(o), U);
  return {
    camo: S({ map: TEX.camo, bumpMap: TEX.weave, bumpScale: 1.4, roughness: 0.9 }),
    coyote: S({ color: 0x8c7757, bumpMap: TEX.weave, bumpScale: 1.4, roughness: 0.93 }),
    ranger: S({ color: 0x5c6142, bumpMap: TEX.grain, bumpScale: 0.5, roughness: 0.55, metalness: 0.05 }),
    polymer: S({ color: 0x1d1e1c, bumpMap: TEX.grain, bumpScale: 0.35, roughness: 0.42, metalness: 0.1 }),
    webbing: S({ color: 0x75644a, bumpMap: TEX.webbing, bumpScale: 1.6, roughness: 0.88 }),
    blackWeb: S({ color: 0x232321, bumpMap: TEX.webbing, bumpScale: 1.6, roughness: 0.85 }),
    velcro: S({ color: 0xa08f6c, bumpMap: TEX.grain, bumpScale: 2.5, roughness: 1 }),
    metal: S({ color: 0x3a3a38, metalness: 0.9, roughness: 0.32 }),
    pad: S({ color: 0x262624, bumpMap: TEX.weave, bumpScale: 1, roughness: 0.95 }),
    padBack: S({ color: 0x1c1c1a, roughness: 0.95, side: THREE.BackSide }),
    suede: S({ color: 0xffffff, vertexColors: true, bumpMap: TEX.grain, bumpScale: 1.1, roughness: 0.92 }),
    suedePlain: S({ color: 0x8a7050, bumpMap: TEX.grain, bumpScale: 1.1, roughness: 0.92, side: THREE.DoubleSide }),
    rubber: S({ color: 0x1f1c19, bumpMap: TEX.grain, bumpScale: 0.8, roughness: 0.82 }),
    leather: S({ color: 0x5a4630, bumpMap: TEX.grain, bumpScale: 0.8, roughness: 0.7 }),
    lace: S({ color: 0x3a3024, roughness: 0.9 }),
  };
}

// ------------------------------------------------------------- helpers
function mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.scale.set(...s);
  return m;
}
const rbox = (w, h, d, rad = 0.04, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, rad);

function strap(points, w, t, mat, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  const sh = new THREE.Shape();
  sh.moveTo(-t / 2, -w / 2); sh.lineTo(t / 2, -w / 2); sh.lineTo(t / 2, w / 2); sh.lineTo(-t / 2, w / 2); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { steps: 48, bevelEnabled: false, extrudePath: curve });
  return new THREE.Mesh(geo, mat);
}
function rod(a, b, r, mat, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

// ------------------------------------------------------------- HELMET
const HS = new THREE.Vector3(1.0, 0.95, 1.12);
function rimTheta(phi) {
  const a = Math.abs(((phi + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI);
  return 1.28 + (0.46 * (1 - Math.cos(a))) / 2 - 0.4 * Math.exp(-Math.pow((a - 1.75) / 0.42, 2));
}
function hp(phi, th, r = 1) {
  return new THREE.Vector3(Math.sin(th) * Math.sin(phi) * HS.x * r, Math.cos(th) * HS.y * r, Math.sin(th) * Math.cos(phi) * HS.z * r);
}
function hNormal(p) {
  return new THREE.Vector3(p.x / (HS.x * HS.x), p.y / (HS.y * HS.y), p.z / (HS.z * HS.z)).normalize();
}
function shellGeo(r, th0f, th1f, ph0, ph1, segU, segV, useRim = true) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU, phi = lerp(ph0, ph1, u);
      const th = useRim ? v * rimTheta(phi) : lerp(th0f, th1f, v);
      const p = hp(phi, th, r);
      pos.push(p.x, p.y, p.z);
      uv.push(u * 4, v * 2);
    }
  }
  for (let j = 0; j < segV; j++)
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + segU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function onShell(obj, phi, th, r = 1) {
  const p = hp(phi, th, r);
  obj.position.copy(p);
  obj.lookAt(p.clone().add(hNormal(p)));
  return obj;
}

function buildHelmet(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shellGeo(1, 0, 0, -PI, PI, 160, 48), M.ranger));
  g.add(new THREE.Mesh(shellGeo(0.94, 0, 0, -PI, PI, 96, 24), M.padBack));
  // Rubber edge trim along the rim.
  const rimPts = [];
  for (let i = 0; i < 160; i++) {
    const phi = -PI + (i / 160) * 2 * PI;
    rimPts.push(hp(phi, rimTheta(phi), 0.975));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 320, 0.042, 8, true), M.rubber));
  // ARC side rails.
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const phi = s * lerp(1.12, 2.3, i / 20);
      pts.push(hp(phi, rimTheta(phi) - 0.14, 1.035));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.055, 6, false), M.polymer));
    for (let k = 0; k < 9; k++) {
      const p = curve.getPoint(0.06 + k * 0.11), n = hNormal(p);
      const tooth = mesh(rbox(0.05, 0.12, 0.05, 0.015, 2), M.polymer);
      tooth.position.copy(p).addScaledVector(n, 0.035);
      tooth.lookAt(tooth.position.clone().add(n));
      g.add(tooth);
    }
  }
  // NVG shroud + mount.
  const shroud = onShell(new THREE.Group(), 0, 0.98, 1.01);
  shroud.add(mesh(rbox(0.44, 0.27, 0.08, 0.035), M.metal, [0, 0, 0.03]));
  shroud.add(mesh(rbox(0.16, 0.16, 0.08, 0.02), M.polymer, [0, -0.08, 0.1]));
  for (const x of [-0.16, 0.16]) shroud.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), M.metal, [x, 0.08, 0.075], [PI / 2, 0, 0]));
  g.add(shroud);
  // Velcro patches (conforming to the shell).
  g.add(new THREE.Mesh(shellGeo(1.012, 0.12, 0.62, -0.55, 0.55, 24, 10, false), M.velcro));
  g.add(new THREE.Mesh(shellGeo(1.012, 0.7, 1.08, PI - 0.42, PI + 0.42, 24, 10, false), M.velcro));
  for (const s of [-1, 1]) g.add(new THREE.Mesh(shellGeo(1.012, 0.7, 0.98, s * 1.25 - 0.3, s * 1.25 + 0.3, 16, 8, false), M.velcro));
  // Counterweight pouch.
  g.add(onShell(mesh(rbox(0.5, 0.3, 0.13, 0.05), M.camo), PI, 1.3, 1.03));
  // Retention straps + chin cup.
  for (const s of [-1, 1]) {
    g.add(strap([[s * 0.86, 0.2, 0.3], [s * 0.8, -0.08, 0.22], [s * 0.72, -0.3, 0.16]], 0.06, 0.014, M.blackWeb));
    g.add(strap([[s * 0.72, 0.0, -0.7], [s * 0.76, -0.2, -0.25], [s * 0.72, -0.3, 0.16]], 0.06, 0.014, M.blackWeb));
    g.add(strap([[s * 0.72, -0.3, 0.16], [s * 0.48, -0.6, 0.4], [s * 0.15, -0.72, 0.52]], 0.06, 0.014, M.blackWeb));
    g.add(mesh(rbox(0.1, 0.07, 0.04, 0.015), M.polymer, [s * 0.72, -0.3, 0.17], [0, s * 0.9, 0]));
  }
  g.add(mesh(rbox(0.34, 0.14, 0.15, 0.05), M.pad, [0, -0.74, 0.52], [-0.35, 0, 0]));
  return g;
}

// ------------------------------------------------------------- VEST
function vestPanel(w, h, d, k) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 30, 34, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const Y = y * h;
    const hw = lerp(w / 2, w * 0.24, ss(Y, h * 0.16, h * 0.5));
    const X = x * 2 * hw;
    const e = Math.max(Math.abs(x * 2), Math.abs(y * 2));
    const Z = z * d * (1 - 0.5 * Math.pow(e, 8)) - k * X * X;
    p.setXYZ(i, X, Y, Z);
  }
  geo.computeVertexNormals();
  return geo;
}
function bentBox(w, h, d, k, z0) {
  const geo = new THREE.BoxGeometry(w, h, d, 24, 1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + z0 - k * p.getX(i) * p.getX(i));
  geo.computeVertexNormals();
  return geo;
}

function buildVest(M) {
  const g = new THREE.Group();
  const W = 1.45, H = 1.85, D = 0.2, K = 0.22, BACK = -1.05;
  const zf = (x) => D / 2 - K * x * x;
  g.add(new THREE.Mesh(vestPanel(W, H, D, K), M.camo));
  g.add(mesh(vestPanel(W, H, D, K), M.camo, [0, 0, BACK], [0, PI, 0]));
  // Upper chest MOLLE rows.
  for (const y of [0.5, 0.63]) g.add(new THREE.Mesh(bentBox(0.72, 0.05, 0.03, K, zf(0) + 0.01), M.webbing).translateY(y));
  // Admin pouch with velcro ID patch.
  g.add(mesh(rbox(0.86, 0.36, 0.11, 0.04), M.camo, [0, 0.22, zf(0) + 0.05]));
  g.add(mesh(rbox(0.5, 0.2, 0.02, 0.008), M.velcro, [0, 0.24, zf(0) + 0.11]));
  g.add(mesh(rbox(0.24, 0.13, 0.02, 0.008), M.polymer, [0.08, 0.24, zf(0) + 0.122]));
  // Triple magazine pouches.
  for (const x of [-0.41, 0, 0.41]) {
    const yaw = Math.atan(-2 * K * x);
    const z = zf(x) + 0.1;
    g.add(mesh(rbox(0.37, 0.6, 0.2, 0.05), M.camo, [x, -0.44, z], [0, yaw, 0]));
    g.add(mesh(rbox(0.39, 0.13, 0.23, 0.04), M.camo, [x, -0.13, z + 0.01], [0.08, yaw, 0]));
    g.add(mesh(rbox(0.09, 0.08, 0.05, 0.015), M.blackWeb, [x * 1.02, -0.17, z + 0.13], [0, yaw, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.39, 0.035, 0.205), M.webbing, [x, -0.52, z], [0, yaw, 0]));
  }
  // Shoulder straps.
  for (const s of [-1, 1]) {
    const x = s * 0.25;
    g.add(strap([[x, 0.86, 0.0], [x, 1.08, -0.25], [x, 1.12, -0.6], [x, 1.06, -0.88], [x, 0.86, BACK - 0.02]], 0.26, 0.07, M.camo));
    g.add(mesh(rbox(0.28, 0.08, 0.32, 0.03), M.pad, [x, 1.13, -0.48]));
  }
  // Cummerbunds: elliptical wall segments wrapping each side.
  const a0 = Math.asin(0.8);
  for (const s of [-1, 1]) {
    const th0 = s > 0 ? a0 : PI + a0;
    for (const [r, mat] of [[1, M.camo], [0.93, M.pad]]) {
      const c = new THREE.CylinderGeometry(r, r, 0.72, 28, 1, true, th0, PI - 2 * a0);
      c.scale(0.9, 1, 0.84);
      g.add(mesh(c, mat, [0, -0.45, BACK / 2]));
    }
    for (const y of [-0.81, -0.09, -0.45]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const th = th0 + (k / 16) * (PI - 2 * a0);
        pts.push(new THREE.Vector3(Math.sin(th) * 0.9 * 1.01, y, BACK / 2 + Math.cos(th) * 0.84 * 1.01));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, y === -0.45 ? 0.012 : 0.03, 6), y === -0.45 ? M.webbing : M.blackWeb));
    }
    g.add(mesh(rbox(0.07, 0.24, 0.1, 0.02), M.polymer, [s * 0.73, -0.45, 0.0], [0, s * 0.6, 0]));
  }
  // Radio pouch on the left side.
  g.add(mesh(rbox(0.24, 0.5, 0.3, 0.05), M.camo, [-0.97, -0.4, -0.52]));
  // Drag handle on the back.
  g.add(mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 20, PI), M.blackWeb, [0, 0.9, BACK - 0.12], [-0.3, 0, 0]));
  return g;
}

// ------------------------------------------------------------- GLOVES
function buildGlove(M) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.74, 0.8, 0.26, 0.11, 4), M.coyote));
  g.add(mesh(rbox(0.7, 0.38, 0.3, 0.1, 4), M.coyote, [0, -0.56, -0.01]));
  g.add(mesh(rbox(0.73, 0.15, 0.33, 0.05), M.blackWeb, [0, -0.5, 0]));
  g.add(mesh(rbox(0.12, 0.17, 0.05, 0.02), M.polymer, [0.18, -0.5, 0.165]));
  g.add(mesh(rbox(0.5, 0.36, 0.05, 0.03), M.pad, [0, -0.02, 0.12]));
  // Hard knuckle shell.
  g.add(mesh(rbox(0.76, 0.2, 0.1, 0.05), M.polymer, [0, 0.29, 0.13]));
  const fingers = [
    { x: -0.27, len: [0.27, 0.18, 0.15], r: 0.088, splay: 0.08 },
    { x: -0.09, len: [0.3, 0.2, 0.16], r: 0.09, splay: 0.02 },
    { x: 0.09, len: [0.28, 0.19, 0.15], r: 0.088, splay: -0.04 },
    { x: 0.27, len: [0.21, 0.15, 0.12], r: 0.078, splay: -0.12 },
  ];
  const curl = [-0.18, -0.32, -0.25];
  for (const f of fingers) {
    g.add(mesh(new THREE.SphereGeometry(0.085, 14, 10), M.polymer, [f.x, 0.33, 0.19], [0, 0, 0], [1, 0.8, 0.6]));
    let parent = new THREE.Group();
    parent.position.set(f.x, 0.38, 0);
    parent.rotation.z = f.splay;
    g.add(parent);
    f.len.forEach((L, k) => {
      const joint = new THREE.Group();
      joint.rotation.x = curl[k];
      parent.add(joint);
      const cg = new THREE.CapsuleGeometry(f.r * (1 - k * 0.06), L, 4, 12).translate(0, L / 2, 0);
      joint.add(new THREE.Mesh(cg, k === 2 ? M.leather : M.coyote));
      if (k === 0) joint.add(mesh(rbox(f.r * 1.9, L * 0.55, 0.06, 0.02), M.polymer, [0, L * 0.5, f.r * 0.85]));
      const next = new THREE.Group();
      next.position.y = L;
      joint.add(next);
      parent = next;
    });
  }
  // Thumb.
  let tp = new THREE.Group();
  tp.position.set(-0.37, -0.14, -0.02);
  tp.rotation.set(-0.2, -0.45, 0.85);
  g.add(tp);
  [0.28, 0.2].forEach((L, k) => {
    const j = new THREE.Group();
    j.rotation.x = k ? -0.25 : 0;
    tp.add(j);
    j.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.098, L, 4, 12).translate(0, L / 2, 0), k ? M.leather : M.coyote));
    const n = new THREE.Group();
    n.position.y = L;
    j.add(n);
    tp = n;
  });
  return g;
}
function buildGloves(M) {
  const g = new THREE.Group();
  const r = buildGlove(M);
  r.position.set(0.52, 0, 0.05);
  r.rotation.set(0.1, -0.25, -0.2);
  const l = buildGlove(M);
  l.scale.x = -1;
  l.position.set(-0.52, -0.06, -0.08);
  l.rotation.set(0.1, 0.25, 0.22);
  g.add(r, l);
  return g;
}

// ------------------------------------------------------------- KNEE PADS
function buildKneePad(M) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.78, 1.12, 0.18, 0.08, 4), M.coyote));
  g.add(mesh(rbox(0.66, 0.98, 0.04, 0.03), M.pad, [0, 0, 0.09]));
  const cap = new THREE.SphereGeometry(1, 48, 32, 0, PI);
  g.add(mesh(cap, M.polymer, [0, 0.02, 0.1], [0, 0, 0], [0.33, 0.5, 0.22]));
  // Ridges following the cap surface.
  for (const y of [-0.22, 0.0, 0.22]) {
    const rr = Math.sqrt(1 - Math.pow(y / 0.5, 2)), pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * PI;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.335 * rr, y + 0.02, 0.1 + Math.sin(a) * 0.225 * rr));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6), M.polymer));
  }
  g.add(mesh(rbox(0.22, 0.12, 0.03, 0.01), M.metal, [0, -0.36, 0.25], [-0.5, 0, 0]));
  // Elastic straps behind the knee.
  for (const y of [-0.38, 0.36]) {
    const t = new THREE.TorusGeometry(0.42, 0.045, 6, 32, PI);
    t.scale(1, 0.8, 1);
    g.add(mesh(t, M.blackWeb, [0, y, -0.06], [-PI / 2, 0, 0]));
    for (const s of [-1, 1]) g.add(mesh(rbox(0.1, 0.12, 0.08, 0.02), M.polymer, [s * 0.41, y, -0.04]));
  }
  return g;
}
function buildKneePads(M) {
  const g = new THREE.Group();
  const a = buildKneePad(M);
  a.position.set(0.48, 0.05, 0);
  a.rotation.set(0.15, -0.3, -0.08);
  const b = buildKneePad(M);
  b.scale.x = -1;
  b.position.set(-0.48, -0.05, -0.15);
  b.rotation.set(0.15, 0.3, 0.08);
  g.add(a, b);
  return g;
}

// ------------------------------------------------------------- BOOTS
const footHalfW = (tz) => 0.16 + 0.065 * Math.sin(PI * clamp((tz - 0.12) / 0.82));
function footGeo(scale = 1, flatBottom = true) {
  const g = new THREE.SphereGeometry(1, 72, 48);
  const p = g.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const Z = z * 0.68 + 0.05;
    const tz = (z + 1) / 2;
    const X = x * footHalfW(tz) * (x > 0 ? 1.06 : 0.94) * scale;
    const top = lerp(0.46, 0.19, ss(tz, 0.3, 1.0));
    let Y = y > 0 ? 0.14 + y * top * scale : 0.14 + y * (flatBottom ? 0.02 : 0.1);
    Y += 0.07 * Math.pow(ss(tz, 0.75, 1.0), 2);
    p.setXYZ(i, X, Y, Z * scale);
    // Darker rubber toe cap + heel counter.
    const toe = ss(tz, 0.8, 0.86) * (1 - ss(Y, 0.24, 0.3));
    const heel = (1 - ss(tz, 0.1, 0.16)) * (1 - ss(Y, 0.42, 0.48));
    const k = Math.max(toe, heel);
    const c = new THREE.Color().setRGB(lerp(0.56, 0.24, k), lerp(0.45, 0.19, k), lerp(0.32, 0.13, k), THREE.SRGBColorSpace);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function soleGeo(h, y0, grow) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 72, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const tz = (z + 1) / 2;
    let Y = y0 + (y + 0.5) * h;
    Y += 0.07 * Math.pow(ss(tz, 0.75, 1.0), 2);
    p.setXYZ(i, x * footHalfW(tz) * grow, Y, (z * 0.68 + 0.05) * (1 + (grow - 1) * 0.6));
  }
  g.computeVertexNormals();
  return g;
}
function buildBoot(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(soleGeo(0.13, 0, 1.12), M.rubber));
  g.add(new THREE.Mesh(soleGeo(0.04, 0.12, 1.14), M.leather));
  g.add(new THREE.Mesh(footGeo(), M.suede));
  const shaft = new THREE.CylinderGeometry(0.205, 0.22, 0.86, 40, 6, true);
  shaft.scale(1, 1, 1.25);
  g.add(mesh(shaft, M.suedePlain, [0, 0.72, -0.28], [0.05, 0, 0]));
  const collar = new THREE.TorusGeometry(0.21, 0.05, 10, 40);
  collar.scale(1, 1.25, 1);
  g.add(mesh(collar, M.leather, [0, 1.14, -0.31], [PI / 2 + 0.05, 0, 0]));
  g.add(mesh(rbox(0.21, 0.72, 0.07, 0.03), M.leather, [0, 0.76, 0.0], [-0.22, 0, 0]));
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 14, PI), M.blackWeb, [0, 1.18, -0.6], [0, PI / 2, 0]));
  // Laces + eyelets.
  const N = 8, eyes = [];
  for (let k = 0; k < N; k++) {
    const s = k / (N - 1);
    const y = lerp(0.42, 1.06, s), z = lerp(0.33, 0.06, s) + 0.02;
    eyes.push([[-0.11, y, z], [0.11, y, z]]);
    for (const e of eyes[k]) g.add(mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 12), M.metal, e, [-0.2, 0, 0]));
  }
  for (let k = 0; k < N - 1; k++) {
    g.add(rod(eyes[k][0], eyes[k + 1][1], 0.014, M.lace));
    g.add(rod(eyes[k][1], eyes[k + 1][0], 0.014, M.lace));
  }
  return g;
}
function buildBoots(M) {
  const g = new THREE.Group();
  const r = buildBoot(M);
  r.position.set(0.32, 0, 0.05);
  r.rotation.y = -0.12;
  const l = buildBoot(M);
  l.scale.x = -1;
  l.position.set(-0.32, 0, -0.08);
  l.rotation.y = 0.12;
  g.add(r, l);
  return g;
}

// ------------------------------------------------------------- public API
const BUILDERS = { helmet: buildHelmet, vest: buildVest, gloves: buildGloves, kneepads: buildKneePads, boots: buildBoots };
// Display pose per model so each reads well from the camera.
const POSE = {
  helmet: { yaw: 0.55, pitch: 0.42, size: 2.3 },
  vest: { yaw: 0.42, pitch: 0.05, size: 2.45 },
  gloves: { yaw: 0.15, pitch: 0.0, size: 2.4 },
  kneepads: { yaw: 0.35, pitch: 0.05, size: 2.3 },
  boots: { yaw: -1.05, pitch: 0.12, size: 2.35 },
};

// Returns { root, inner, fx } where root is the animated pivot and inner holds
// the normalized, posed model.
export function createPiece(model) {
  if (!TEX) TEX = makeTextures();
  const fx = makeFXUniforms();
  const M = makeMaterials(fx);
  const model3d = BUILDERS[model](M);
  const pose = POSE[model];
  const box = new THREE.Box3().setFromObject(model3d);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  model3d.position.sub(center);
  const fit = new THREE.Group();
  fit.add(model3d);
  fit.scale.setScalar(pose.size / Math.max(size.x, size.y, size.z));
  const inner = new THREE.Group();
  inner.add(fit);
  inner.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  const root = new THREE.Group();
  root.add(inner);
  return { root, inner, fx, pose };
}
