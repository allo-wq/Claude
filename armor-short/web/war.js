// Procedural battlefield backdrop: burning sky, ruined skyline, fires, smoke,
// tanks, explosions, embers, tracers and searchlights. Everything is a pure
// function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, GLSL_NOISE, clamp, pulse } from './util.js';

const GROUND = -2.2;
const PI = Math.PI;

const billboardVS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime, uFlash; uniform vec3 uFlashDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.012, 0.010, 0.012);
        vec3 mid = vec3(0.24, 0.05, 0.01);
        vec3 hor = vec3(1.25, 0.32, 0.05);
        vec3 col = mix(hor, mid, smoothstep(-0.02, 0.10, h));
        col = mix(col, top, smoothstep(0.08, 0.45, h));
        vec2 uv = d.xz / (max(h, 0.0) + 0.18);
        float n = fbm(uv * 0.9 + vec2(uTime * 0.06, uTime * 0.015));
        float n2 = fbm3(uv * 2.3 - vec2(uTime * 0.04, -uTime * 0.01));
        float smoke = smoothstep(0.38, 0.85, n * 0.75 + n2 * 0.4);
        vec3 smokeLit = mix(vec3(0.03, 0.022, 0.018), vec3(0.6, 0.16, 0.035), smoothstep(0.35, 0.0, h) * (0.4 + n2));
        col = mix(col, smokeLit, smoke * smoothstep(-0.03, 0.06, h) * 0.9);
        col += vec3(1.0, 0.3, 0.06) * exp(-abs(h) * 16.0) * 0.5;
        float fd = max(dot(d, uFlashDir), 0.0);
        col += vec3(1.0, 0.55, 0.2) * uFlash * (0.15 + pow(fd, 5.0) * 1.6) * (0.5 + smoke);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function fireMaterial(seed) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uGain: { value: 1 } },
    vertexShader: billboardVS,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime, uSeed, uGain; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        float n = fbm(vec2(uv.x * 3.2 + uSeed, uv.y * 2.4 - uTime * 2.6));
        float n2 = vnoise(vec2(uv.x * 7.0 - uSeed, uv.y * 6.0 - uTime * 4.0));
        float w = (1.0 - uv.y) * 0.55 + 0.05;
        float shape = smoothstep(w, w * 0.2, abs(uv.x - 0.5 + (n - 0.5) * 0.35 * uv.y));
        float f = shape * (1.0 - uv.y * 0.9) * (0.55 + n * 0.9 + n2 * 0.25);
        f = smoothstep(0.18, 0.85, f);
        vec3 col = mix(vec3(0.85, 0.12, 0.0), vec3(1.0, 0.62, 0.15), smoothstep(0.2, 0.7, f));
        col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.75, 1.0, f));
        gl_FragColor = vec4(col * f * 1.7 * uGain, f);
      }`,
  });
}

function smokeMaterial(seed) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed } },
    vertexShader: billboardVS,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime, uSeed; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        float n = fbm(vec2(uv.x * 2.2 + uSeed, uv.y * 2.0 - uTime * 0.22));
        float n2 = fbm(vec2(uv.x * 5.0 - uSeed, uv.y * 4.0 - uTime * 0.35));
        float bend = (n - 0.5) * 0.5 * uv.y + uv.y * uv.y * 0.18;
        float w = mix(0.08, 0.42, pow(uv.y, 0.7));
        float m = smoothstep(w, w * 0.25, abs(uv.x - 0.5 - bend));
        float a = m * smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.55, uv.y) * (0.45 + n2 * 0.8);
        vec3 col = mix(vec3(0.5, 0.15, 0.03), vec3(0.045, 0.038, 0.034), smoothstep(0.0, 0.3, uv.y));
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
      }`,
  });
}

function explosionMaterial(seed) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uAge: { value: 99 }, uSeed: { value: seed } },
    vertexShader: billboardVS,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uAge, uSeed; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        p.y -= uAge * 0.12;
        float R = (1.0 - exp(-uAge * 6.0)) * 0.78 + 0.04;
        float n = fbm(p * 2.2 + uSeed + vec2(0.0, -uAge * 0.9));
        float d = length(p * vec2(1.0, 1.15)) / R + (n - 0.5) * 0.8;
        float body = smoothstep(1.0, 0.55, d);
        float heat = exp(-uAge * 2.0) * smoothstep(1.05, 0.0, d) * (0.55 + n * 0.9);
        vec3 fire = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.58, 0.14), smoothstep(0.15, 0.55, heat));
        fire = mix(fire, vec3(1.0, 0.95, 0.8), smoothstep(0.6, 1.0, heat));
        vec3 smoke = vec3(0.05, 0.042, 0.038) + vec3(0.5, 0.13, 0.03) * heat;
        vec3 col = mix(smoke, fire * 5.0, smoothstep(0.12, 0.45, heat));
        float alpha = body * (1.0 - smoothstep(2.2, 3.6, uAge)) * step(0.0, uAge);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

function sparksMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 99 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uAge, uScale; varying float vA;
      void main(){
        vec3 dir = normalize(vec3(aSeed.x * 2.0 - 1.0, aSeed.y * 1.2 + 0.2, aSeed.z * 2.0 - 1.0));
        float sp = (6.0 + aSeed.w * 14.0) * uScale;
        vec3 p = dir * sp * uAge * 0.6 + vec3(0.0, -6.0 * uAge * uAge * uScale, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + aSeed.w * 3.0) * 120.0 / -mv.z;
        vA = step(0.0, uAge) * (1.0 - smoothstep(0.3, 1.4 + aSeed.w, uAge));
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.6, 0.2) * 3.0 * a, a); }`,
  });
}

function buildTank(mat, darkMat) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.65, 0.3); s.lineTo(1.35, 0.3); s.lineTo(1.8, 0.62); s.lineTo(1.5, 0.88);
  s.lineTo(-1.55, 0.88); s.lineTo(-1.72, 0.62); s.closePath();
  const hull = new THREE.ExtrudeGeometry(s, { depth: 1.9, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  hull.translate(0, 0, -0.95);
  g.add(new THREE.Mesh(hull, mat));
  for (const z of [-1.0, 1.0]) {
    const tr = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.6, 0.5, 2, 0.22), darkMat);
    tr.position.set(0, 0.32, z);
    g.add(tr);
    for (let i = 0; i < 6; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 14), mat);
      w.rotation.x = PI / 2;
      w.position.set(-1.35 + i * 0.54, 0.26, z);
      g.add(w);
    }
  }
  const ts = new THREE.Shape();
  ts.moveTo(-0.95, -0.7); ts.lineTo(0.55, -0.78); ts.lineTo(1.05, -0.32); ts.lineTo(1.05, 0.32); ts.lineTo(0.55, 0.78); ts.lineTo(-0.95, 0.7); ts.closePath();
  const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  tg.rotateX(-PI / 2);
  const turret = new THREE.Group();
  turret.position.set(-0.1, 0.9, 0);
  turret.add(new THREE.Mesh(tg, mat));
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 14), mat);
  hatch.position.set(-0.4, 0.55, 0.25);
  turret.add(hatch);
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(1.0, 0.25, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 2.8, 12), mat);
  barrel.rotation.z = -PI / 2;
  barrel.position.x = 1.4;
  barrelPivot.add(barrel);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 12), mat);
  brake.rotation.z = -PI / 2;
  brake.position.x = 2.75;
  barrelPivot.add(brake);
  turret.add(barrelPivot);
  g.add(turret);
  return { group: g, turret, barrelPivot, barrel };
}

export function createWar(scene, schedule) {
  const R = rng(1337);
  const timed = []; // materials with uTime
  const dynamic = [];

  // Sky.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMaterial());
  scene.add(sky);
  timed.push(sky.material);

  scene.fog = new THREE.FogExp2(0x1c0b05, 0.016);

  // Ground with noise texture.
  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const gx = gc.getContext('2d');
  const gi = gx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 40 + R() * 40;
    gi.data[i * 4] = v * 1.1; gi.data[i * 4 + 1] = v * 0.9; gi.data[i * 4 + 2] = v * 0.75; gi.data[i * 4 + 3] = 255;
  }
  gx.putImageData(gi, 0, 0);
  const gtex = new THREE.CanvasTexture(gc);
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(120, 120);
  gtex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: 0x2f2822, map: gtex, roughness: 0.96, metalness: 0 })
  );
  ground.rotation.x = -PI / 2;
  ground.position.y = GROUND;
  scene.add(ground);

  // Ruined skyline: merged boxes with jagged broken tops.
  const ruinGeos = [], windowGeos = [], windowPhase = [];
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.95 });
  function addBuilding(x, z, w, h, d) {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, GROUND + h / 2, z);
    ruinGeos.push(b);
    const chunks = 2 + Math.floor(R() * 4);
    for (let c = 0; c < chunks; c++) {
      const cw = w * (0.15 + R() * 0.35), ch = h * (0.08 + R() * 0.35);
      const cb = new THREE.BoxGeometry(cw, ch, d * (0.6 + R() * 0.4));
      cb.rotateZ((R() - 0.5) * 0.5);
      cb.translate(x + (R() - 0.5) * (w - cw), GROUND + h + ch / 2 - 0.3, z + (R() - 0.5) * 0.4);
      ruinGeos.push(cb);
    }
    const cols = Math.floor(w / 1.3), rows = Math.floor(h / 1.7);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        if (R() > 0.14) continue;
        const wg = new THREE.PlaneGeometry(0.55, 0.8);
        wg.translate(x - w / 2 + 0.65 + i * 1.3, GROUND + 1.2 + j * 1.7, z + d / 2 + 0.02);
        windowGeos.push(wg);
        const ph = R() * 10;
        windowPhase.push(ph, ph, ph, ph);
      }
  }
  for (let i = 0; i < 34; i++) {
    const z = -40 - R() * 40;
    const x = (R() - 0.5) * (30 + (-z - 40) * 0.6);
    addBuilding(x, z, 2.5 + R() * 5, 5 + R() * 15 * (1 - Math.abs(x) / 40), 3 + R() * 4);
  }
  // Mid-ground broken walls.
  for (let i = 0; i < 5; i++) {
    const z = -24 - R() * 10, x = (R() - 0.5) * 18;
    addBuilding(x, z, 1.5 + R() * 3, 1.2 + R() * 3, 0.5 + R() * 0.6);
  }
  scene.add(new THREE.Mesh(mergeGeometries(ruinGeos), ruinMat));
  const wgeo = mergeGeometries(windowGeos);
  wgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(windowPhase, 1));
  const windowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aPhase; varying float vP; varying vec2 vUv;
      void main(){ vP = aPhase; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying float vP; varying vec2 vUv;
      void main(){ float f = 0.65 + 0.35 * sin(uTime * (3.0 + vP) + vP * 7.0) * sin(uTime * 7.3 + vP);
        float g = 1.0 - vUv.y * 0.6;
        gl_FragColor = vec4(vec3(1.0, 0.38, 0.07) * 2.2 * f * g, 1.0); }`,
  });
  scene.add(new THREE.Mesh(wgeo, windowMat));
  timed.push(windowMat);

  // Rubble.
  const rub = [];
  for (let i = 0; i < 140; i++) {
    const s = 0.08 + Math.pow(R(), 2) * 0.45;
    const z = -6 - R() * 34;
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1, 0.4 + R() * 0.5, 1);
    g.rotateY(R() * PI);
    g.translate((R() - 0.5) * (6 - z * 0.35), GROUND + s * 0.15, z);
    rub.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(rub), new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1, flatShading: true })));

  // Fires + smoke columns.
  const fireSpots = [
    [-7, -46, 4.5], [5.5, -52, 6], [-1.5, -62, 5], [11, -44, 4], [-13, -58, 5.5],
    [3.4, -21.5, 2.6], [-4.5, -26, 2.0], [8, -30, 2.4], [-9, -34, 3],
  ];
  fireSpots.forEach(([x, z, s], i) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.2, s * 1.6), fireMaterial(i * 3.7));
    f.position.set(x, GROUND + s * 0.75, z);
    scene.add(f);
    timed.push(f.material);
    if (i < 6) {
      const h = 26 + R() * 14;
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.55, h), smokeMaterial(i * 5.1));
      sm.position.set(x + 1.5, GROUND + h * 0.5 + s * 0.4, z - 1);
      scene.add(sm);
      timed.push(sm.material);
    }
  });
  const fireLights = [[-4.5, -24], [3.4, -20]].map(([x, z], i) => {
    const l = new THREE.PointLight(0xff6a20, 0, 60, 1.6);
    l.position.set(x, GROUND + 2, z);
    scene.add(l);
    return { l, base: 140, seed: i * 2.1 };
  });

  // Tanks.
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x2f2e24, roughness: 0.75, metalness: 0.2 });
  const tankDark = new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 0.9 });
  const tankA = buildTank(tankMat, tankDark);
  tankA.group.position.set(-3.3, GROUND, -18);
  tankA.group.rotation.y = 0.55;
  tankA.barrelPivot.rotation.z = 0.12;
  tankA.turret.rotation.y = -0.15;
  scene.add(tankA.group);
  const tankB = buildTank(tankMat, tankDark);
  tankB.group.position.set(3.6, GROUND, -23);
  tankB.group.rotation.set(0, -2.4, 0.06);
  tankB.turret.rotation.y = 0.9;
  tankB.barrelPivot.rotation.z = -0.1;
  scene.add(tankB.group);
  const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), fireMaterial(9.9));
  scene.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffa040, 0, 40, 1.5);
  scene.add(muzzleLight);
  const tankSmoke = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), explosionMaterial(4.2));
  scene.add(tankSmoke);

  // Explosion pool.
  const exPool = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), explosionMaterial(i * 7.3 + 1));
    scene.add(m);
    const sg = new THREE.BufferGeometry();
    const N = 90, seeds = new Float32Array(N * 4);
    for (let k = 0; k < N * 4; k++) seeds[k] = R();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const sp = new THREE.Points(sg, sparksMaterial());
    sp.frustumCulled = false;
    scene.add(sp);
    // Only the two newest blasts get a real light (lights are expensive here).
    const l = i < 2 ? new THREE.PointLight(0xff6a20, 0, 120, 1.4) : null;
    if (l) scene.add(l);
    exPool.push({ m, sp, l });
  }

  // Embers.
  {
    const N = 900, seeds = new Float32Array(N * 4);
    for (let k = 0; k < N * 4; k++) seeds[k] = R();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime; varying float vA;
        void main(){
          float life = 5.0 + aSeed.w * 6.0;
          float ph = fract(uTime / life + aSeed.x);
          vec3 p = vec3(mix(-26.0, 26.0, aSeed.y), -2.2 + ph * 20.0, mix(-55.0, -3.0, aSeed.z));
          p.x += sin(uTime * 0.9 + aSeed.w * 30.0) * 1.0 + ph * 7.0;
          p.z += cos(uTime * 0.7 + aSeed.y * 20.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.5 + aSeed.w * 3.0) * 220.0 / -mv.z;
          vA = smoothstep(0.0, 0.08, ph) * smoothstep(1.0, 0.5, ph) * (0.55 + 0.45 * sin(uTime * 11.0 + aSeed.x * 50.0));
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.42, 0.08) * 3.2 * a, a); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    timed.push(mat);
  }
  // Falling ash in the foreground for depth.
  {
    const N = 260, seeds = new Float32Array(N * 4);
    for (let k = 0; k < N * 4; k++) seeds[k] = R();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime; varying float vA;
        void main(){
          float ph = fract(uTime / (8.0 + aSeed.w * 6.0) + aSeed.x);
          vec3 p = vec3(mix(-5.0, 5.0, aSeed.y) + sin(uTime * 0.7 + aSeed.w * 20.0) * 0.4 + ph * 2.0,
                        mix(5.0, -4.0, ph), mix(-2.0, 6.5, aSeed.z));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 + aSeed.w * 2.5) * 60.0 / -mv.z;
          vA = smoothstep(0.0, 0.1, ph) * smoothstep(1.0, 0.85, ph) * 0.5;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float a = smoothstep(0.5, 0.2, length(gl_PointCoord - 0.5)) * vA;
          gl_FragColor = vec4(vec3(0.55, 0.5, 0.45), a); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    timed.push(mat);
  }

  // Tracers.
  const tracerMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: billboardVS,
    fragmentShader: /* glsl */ `varying vec2 vUv;
      void main(){ float a = pow(vUv.x, 3.0) * smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.25) * 4.0 * a, a); }`,
  });
  const tracers = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tracerMat);
    scene.add(m);
    const dir = R() < 0.5 ? 1 : -1;
    const ang = (0.08 + R() * 0.35) * dir;
    tracers.push({
      m,
      period: 1.6 + R() * 2.8,
      off: R() * 10,
      s: new THREE.Vector3(-dir * (18 + R() * 8), GROUND + 1 + R() * 6, -28 - R() * 22),
      d: new THREE.Vector3(dir * Math.cos(ang), Math.abs(Math.sin(ang)), 0),
      speed: 55 + R() * 30,
      len: 2.5 + R() * 2,
    });
  }

  // Searchlights.
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float core = pow(abs(dot(vN, vV)), 2.0);
        float a = core * (1.0 - vY) * 0.11;
        gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, a); }`,
  });
  const beams = [[-9, -56, 0.2], [10, -62, -0.3]].map(([x, z, a]) => {
    const g = new THREE.ConeGeometry(5, 70, 24, 1, true);
    g.translate(0, -35, 0);
    g.rotateX(PI);
    const m = new THREE.Mesh(g, beamMat);
    m.position.set(x, GROUND + 1, z);
    scene.add(m);
    return { m, a };
  });

  // Global lighting.
  const hemi = new THREE.HemisphereLight(0xff7a3a, 0x0a0503, 0.22);
  scene.add(hemi);

  const camPos = new THREE.Vector3();
  return {
    tankA,
    update(t, camera) {
      for (const m of timed) m.uniforms.uTime.value = t;
      camera.getWorldPosition(camPos);

      for (const fl of fireLights) {
        const k = 0.7 + 0.3 * Math.sin(t * 13 + fl.seed) * Math.sin(t * 7.7 + fl.seed * 3);
        fl.l.intensity = fl.base * k;
      }

      // Explosions (pooled by most recent).
      let skyFlash = 0;
      const flashDir = sky.material.uniforms.uFlashDir.value;
      const active = schedule.explosions.filter((e) => t >= e.t - 0.01 && t < e.t + 3.8).slice(-exPool.length);
      exPool.forEach((slot, i) => {
        const e = active[i];
        if (!e) {
          slot.m.visible = slot.sp.visible = false;
          if (slot.l) slot.l.intensity = 0;
          return;
        }
        const age = t - e.t;
        slot.m.visible = slot.sp.visible = true;
        slot.m.position.set(e.pos[0], e.pos[1] + e.size * 0.35 + age * 0.6, e.pos[2]);
        slot.m.scale.setScalar(e.size * 2.2);
        slot.m.lookAt(camPos);
        slot.m.material.uniforms.uAge.value = age;
        slot.m.material.uniforms.uSeed.value = e.seed;
        slot.sp.position.set(...e.pos);
        slot.sp.material.uniforms.uAge.value = age;
        slot.sp.material.uniforms.uScale.value = e.size / 5;
        const env = pulse(age, 2.2, 0.03);
        const light = exPool[active.length - 1 - i]?.l;
        if (light) {
          light.position.set(e.pos[0], e.pos[1] + 3, e.pos[2] + 2);
          light.intensity = env * 90 * e.size;
        }
        if (env > skyFlash) {
          skyFlash = env * clamp(e.size / 6, 0.3, 1.4);
          flashDir.set(e.pos[0], e.pos[1] + 6, e.pos[2]).sub(camPos).normalize();
        }
      });
      sky.material.uniforms.uFlash.value = skyFlash;

      // Tank A cannon shots.
      const shot = schedule.tankShots.filter((s) => t >= s - 0.01).pop();
      const age = shot === undefined ? 99 : t - shot;
      const recoil = age < 1 ? Math.exp(-age * 9) * 0.35 : 0;
      tankA.barrel.position.x = 1.4 - recoil;
      tankA.group.updateMatrixWorld(true);
      const tip = new THREE.Vector3(2.95, 0, 0);
      tankA.barrelPivot.localToWorld(tip);
      const mf = age < 0.12 ? 1 - age / 0.12 : 0;
      muzzle.visible = mf > 0;
      muzzle.position.copy(tip).add(new THREE.Vector3(0.9, 0.05, 0.4));
      muzzle.scale.setScalar(0.6 + mf * 1.4);
      muzzle.material.uniforms.uGain.value = 1 + mf * 3;
      muzzleLight.position.copy(tip);
      muzzleLight.intensity = mf * 450;
      tankSmoke.visible = age < 3.4;
      tankSmoke.position.copy(tip).add(new THREE.Vector3(1.2 + age * 0.8, 0.3 + age * 0.4, 0));
      tankSmoke.scale.setScalar(1 + age * 1.5);
      tankSmoke.material.uniforms.uAge.value = age * 0.6 + 0.9;
      tankSmoke.lookAt(camPos);

      for (const tr of tracers) {
        const ph = ((t + tr.off) % tr.period) / tr.period;
        const live = ph < 0.4;
        tr.m.visible = live;
        if (!live) continue;
        const dist = ph * tr.period * tr.speed;
        tr.m.position.copy(tr.s).addScaledVector(tr.d, dist);
        tr.m.rotation.z = Math.atan2(tr.d.y, tr.d.x);
        tr.m.scale.set(tr.len, 0.09, 1);
      }

      for (const b of beams) b.m.rotation.z = Math.sin(t * 0.35 + b.a * 10) * 0.45 + b.a;

      return { skyFlash };
    },
  };
}
