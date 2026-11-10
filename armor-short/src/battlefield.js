// The war going on behind the armour: burning skyline, smoke columns,
// explosions, tracer fire, flak, jets, drifting embers. Everything is a pure
// function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise1, sat, smooth } from './util.js';
import { NOISE_GLSL } from './materials.js';

const HAZE = new THREE.Color(0.075, 0.03, 0.014);
export const GROUND_Y = -3.6;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function puffTexture(seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 62;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    const s = 34 + rnd() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

export function buildBattlefield(TL, scale = 1) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE, 28, 240);
  const rnd = mulberry32(2024);
  const glowTex = glowTexture();
  const puffTex = puffTexture(7);
  const updaters = [];

  // ------------------------------------------------------------------ sky --
  const skyU = { uTime: { value: 0 }, uFlash: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uFlash; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          float az = atan(d.x, -d.z);
          float glowAz = 0.35 + 0.9 * fbm3(vec3(az * 2.2, uTime * 0.12, 3.0));
          vec3 col = mix(vec3(0.05, 0.026, 0.022), vec3(0.006, 0.009, 0.02), smoothstep(0.03, 0.5, h));
          col += vec3(1.0, 0.3, 0.045) * glowAz * (exp(-max(h, 0.0) * 11.0) * 0.75 + exp(-max(h, 0.0) * 3.0) * 0.14);
          vec3 p = vec3(az * 2.4, h * 5.5 - uTime * 0.015, uTime * 0.035);
          float n = fbm3(p * 1.3) * 0.7 + fbm3(p * 3.3 + 4.0) * 0.3;
          float smoke = smoothstep(0.4, 0.72, n + 0.14 * (1.0 - h));
          vec3 smokeCol = mix(vec3(0.010, 0.010, 0.013), vec3(0.2, 0.065, 0.015), exp(-max(h, 0.0) * 5.0) * glowAz);
          col = mix(col, smokeCol, smoke * 0.85);
          col += vec3(1.0, 0.5, 0.2) * uFlash * (0.03 + 0.4 * exp(-max(h, 0.0) * 5.0));
          col = mix(col, vec3(0.012, 0.009, 0.008), 1.0 - smoothstep(-0.04, 0.0, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // --------------------------------------------------------------- ground --
  const groundU = { uFlash: { value: 0 }, uFog: { value: HAZE } };
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: groundU,
      fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uFlash; uniform vec3 uFog; varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          float n = fbm3(vec3(vW.xz * 0.07, 1.0));
          float n2 = fbm3(vec3(vW.xz * 0.45, 4.0));
          vec3 col = mix(vec3(0.010, 0.008, 0.007), vec3(0.06, 0.04, 0.028), n * n2 * 1.6);
          float d = length(vW.xz - cameraPosition.xz);
          float puddle = smoothstep(0.52, 0.7, n);
          col += vec3(0.95, 0.3, 0.05) * puddle * 0.16 * smoothstep(8.0, 80.0, d);
          col += vec3(1.0, 0.5, 0.2) * uFlash * 0.05;
          col = mix(col, uFog, smoothstep(28.0, 240.0, d));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  ground.position.y = GROUND_Y;
  scene.add(ground);

  // -------------------------------------------------------- ruined skyline --
  const dark = new THREE.MeshBasicMaterial({ color: 0x050404 });
  {
    const geos = [];
    const box = (w, h, d, x, y, z, ry = 0, rz = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      geos.push(g);
    };
    for (let i = 0; i < 110; i++) {
      const z = -58 - rnd() * 150;
      const x = (rnd() - 0.5) * (150 + Math.abs(z) * 1.5);
      const w = 6 + rnd() * 13;
      const h = 7 + rnd() * 20 + (Math.abs(z) - 58) * 0.16 * rnd();
      const d = 6 + rnd() * 10;
      box(w, h, d, x, GROUND_Y + h / 2, z, rnd() * 0.3);
      // shattered top
      const n = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const ww = w * (0.15 + rnd() * 0.35);
        const hh = 1.5 + rnd() * 7;
        box(ww, hh, d * (0.3 + rnd() * 0.6), x + (rnd() - 0.5) * (w - ww), GROUND_Y + h + hh / 2 - 0.2, z, 0, (rnd() - 0.5) * 0.25);
      }
      if (rnd() < 0.35) box(0.25, 6 + rnd() * 9, 0.25, x + (rnd() - 0.5) * w, GROUND_Y + h + 3, z, 0, (rnd() - 0.5) * 0.5);
    }
    // anti-tank hedgehogs + rubble in the mid-ground
    for (let i = 0; i < 26; i++) {
      const z = -15 - rnd() * 34;
      let x = (rnd() - 0.5) * 70;
      if (Math.abs(x) < 5) x += Math.sign(x || 1) * 6;
      const s = 0.8 + rnd() * 0.7;
      for (const [rx, rz] of [[0.6, 0.6], [-0.6, 0.6], [0, -0.9]]) {
        const g = new THREE.BoxGeometry(0.3 * s, 3.6 * s, 0.3 * s);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, GROUND_Y + 1.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, rnd(), rz)), new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(m);
        geos.push(g);
      }
    }
    for (let i = 0; i < 60; i++) {
      const z = -12 - rnd() * 60;
      const x = (rnd() - 0.5) * 110;
      const s = 0.4 + rnd() * 1.6;
      box(s * (1 + rnd()), s * 0.7, s, x, GROUND_Y + s * 0.3, z, rnd() * 3, (rnd() - 0.5) * 0.6);
    }
    scene.add(new THREE.Mesh(mergeGeometries(geos), dark));
  }

  // tanks
  const tanks = [];
  const makeTank = (x, z, ry, s) => {
    const t = new THREE.Group();
    const add = (g, px, py, pz) => {
      const m = new THREE.Mesh(g, dark);
      m.position.set(px, py, pz);
      t.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(7.4, 1.0, 3.3), 0, 1.35, 0);
    add(new THREE.BoxGeometry(8.0, 1.1, 0.8), 0, 0.6, 1.55);
    add(new THREE.BoxGeometry(8.0, 1.1, 0.8), 0, 0.6, -1.55);
    const turret = new THREE.Group();
    turret.position.set(-0.3, 1.85, 0);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 2.6), dark);
    tb.position.y = 0.45;
    turret.add(tb);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.6, 8).rotateZ(Math.PI / 2), dark);
    barrel.position.set(4.2, 0.55, 0);
    turret.add(barrel);
    turret.rotation.z = 0.07;
    t.add(turret);
    t.position.set(x, GROUND_Y, z);
    t.rotation.y = ry;
    t.scale.setScalar(s);
    scene.add(t);
    tanks.push({ t, turret });
  };
  makeTank(-17, -34, 0.35, 1.0);
  makeTank(22, -46, Math.PI - 0.5, 1.1);
  makeTank(-44, -72, 0.1, 1.2);

  // ---------------------------------------------------------------- fires --
  const fireDefs = [
    [-48, -95, 9], [-22, -70, 7], [-9, -120, 12], [14, -85, 8], [36, -105, 10], [58, -80, 7],
    [-72, -130, 13], [82, -140, 13], [-13, -40, 3.2], [18, -50, 3.8], [4, -150, 14], [-38, -56, 4.4],
    [44, -60, 4.2], [-98, -110, 11], [110, -100, 10],
  ];
  const fireGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const fires = fireDefs.map(([x, z, size], i) => {
    const u = { uTime: { value: 0 }, uSeed: { value: i * 13.7 } };
    const m = new THREE.Mesh(
      fireGeo,
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime, uSeed; varying vec2 vUv;
          ${NOISE_GLSL}
          void main(){
            vec2 uv = vec2((vUv.x - 0.5) * 2.0, vUv.y);
            float n = fbm3(vec3(uv.x * 2.4, uv.y * 2.6 - uTime * 2.4, uSeed + uTime * 0.5));
            float shape = (1.0 - uv.y) * (1.0 - abs(uv.x) * (1.15 + uv.y * 1.6));
            float f = smoothstep(0.22, 0.7, shape * 0.95 + (n - 0.5) * (0.5 + uv.y));
            vec3 col = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.8, 0.3), f * f) * f * 3.2;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    m.position.set(x, GROUND_Y, z);
    m.scale.set(size * 0.95, size, 1);
    scene.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.3, 0.42, 0.08), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    glow.position.set(x, GROUND_Y + size * 0.45, z + 0.5);
    scene.add(glow);
    const puffs = [];
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x000000, transparent: true, depthWrite: false, fog: false, rotation: rnd() * 6 }));
      scene.add(s);
      puffs.push(s);
    }
    return { x, z, size, u, m, glow, puffs, seed: rnd() * 10 };
  });
  const smokeHot = new THREE.Color(0.5, 0.17, 0.05);
  const smokeCold = new THREE.Color(0.03, 0.026, 0.028);
  updaters.push((t, cam) => {
    for (const f of fires) {
      f.u.uTime.value = t;
      f.m.rotation.y = Math.atan2(cam.position.x - f.x, cam.position.z - f.z);
      const fl = 0.75 + 0.25 * noise1(t * 9, f.seed);
      f.glow.scale.setScalar(f.size * 4.2 * fl);
      f.glow.material.opacity = 0.75 * fl;
      const life = 9;
      f.puffs.forEach((s, k) => {
        const age = (t * 0.85 + (k * life) / 8 + f.seed) % life;
        const u = age / life;
        s.position.set(f.x + u * f.size * 2.6 + Math.sin(u * 6 + k) * f.size * 0.25, GROUND_Y + f.size * 0.7 + u * f.size * 6.0, f.z - 0.6 - k * 0.05);
        s.scale.setScalar(f.size * (1.3 + u * 5.0));
        s.material.opacity = 0.8 * smooth(0, 0.1, u) * (1 - smooth(0.5, 1, u));
        s.material.color.copy(smokeHot).lerp(smokeCold, smooth(0, 0.28, u));
      });
    }
  });

  // burning window glows on the skyline
  {
    const geos = [];
    for (let i = 0; i < 70; i++) {
      const g = new THREE.PlaneGeometry(0.8 + rnd() * 1.6, 0.7 + rnd() * 1.4);
      g.translate((rnd() - 0.5) * 230, GROUND_Y + 2 + rnd() * 16, -62 - rnd() * 90);
      geos.push(g);
    }
    scene.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.12), fog: false })));
  }

  // ----------------------------------------------------------- explosions --
  const EX_LIFE = 2.6;
  const POOL = 7;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const group = new THREE.Group();
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }));
    const u = { uAge: { value: 0 }, uSeed: { value: i * 3.1 } };
    const ball = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uAge, uSeed; varying vec2 vUv;
          ${NOISE_GLSL}
          void main(){
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);
            float n = fbm3(vec3(p * 2.3, uSeed + uAge * 1.6));
            float rad = mix(0.22, 0.85, 1.0 - pow(1.0 - uAge, 3.0));
            float d = r + (n - 0.5) * 0.6;
            float core = 1.0 - smoothstep(rad * 0.3, rad, d);
            float heat = pow(1.0 - uAge, 1.7);
            vec3 hot = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.92, 0.65), core * heat) * (0.5 + 6.0 * heat);
            vec3 col = mix(vec3(0.03, 0.025, 0.022), hot, heat);
            float a = core * mix(0.8 * (1.0 - smoothstep(0.55, 1.0, uAge)), 1.0, heat);
            gl_FragColor = vec4(col, a);
          }`,
      })
    );
    const N = 56;
    const dirs = [];
    const pr = mulberry32(900 + i);
    for (let k = 0; k < N; k++) {
      const a = pr() * Math.PI * 2;
      const el = 0.15 + pr() * 1.25;
      const sp = 9 + pr() * 22;
      dirs.push([Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp * 0.5]);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(5, 2.0, 0.5), size: 1.1, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sparks.frustumCulled = false;
    const smokes = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x070606, transparent: true, depthWrite: false, fog: false, rotation: k * 2.1 }));
      group.add(s);
      smokes.push(s);
    }
    group.add(ball, sparks, flash);
    group.visible = false;
    scene.add(group);
    pool.push({ group, flash, ball, u, sparks, dirs, smokes });
  }
  updaters.push((t, cam) => {
    let slot = 0;
    for (const o of pool) o.group.visible = false;
    for (const e of TL.explosions) {
      const age = t - e.t;
      if (age < 0 || age > EX_LIFE || slot >= POOL) continue;
      const o = pool[slot++];
      o.group.visible = true;
      o.group.position.set(e.x, GROUND_Y + e.y, e.z);
      const fl = Math.exp(-age / 0.1);
      o.flash.scale.setScalar(e.size * (24 + 70 * age));
      o.flash.material.color.setRGB(4.5 * fl, 2.2 * fl, 0.9 * fl);
      o.flash.visible = fl > 0.01;
      const ba = sat(age / 1.7);
      o.u.uAge.value = ba;
      o.u.uSeed.value = e.seed;
      o.ball.visible = ba < 1;
      o.ball.scale.setScalar(e.size * 19);
      o.ball.position.y = e.size * 3 + age * 2.5;
      o.ball.quaternion.copy(cam.quaternion);
      const pos = o.sparks.geometry.attributes.position;
      for (let k = 0; k < o.dirs.length; k++) {
        const d = o.dirs[k];
        pos.setXYZ(k, d[0] * age * e.size, d[1] * age * e.size - 9 * age * age, d[2] * age * e.size);
      }
      pos.needsUpdate = true;
      o.sparks.material.opacity = sat(1 - age / 1.4);
      o.sparks.material.size = 1.2 * e.size;
      o.smokes.forEach((s, k) => {
        s.position.set((k - 1) * 3.5 * e.size + age * 1.5, e.size * 4 + age * (3 + k), -0.5 - k * 0.1);
        s.scale.setScalar(e.size * (9 + age * 8));
        s.material.opacity = 0.7 * smooth(0.1, 0.5, age) * (1 - smooth(1.4, EX_LIFE, age));
      });
    }
  });
  const flashAt = (t) => {
    let f = 0;
    for (const e of TL.explosions) {
      const age = t - e.t;
      if (age >= 0 && age < 1.2) f += e.size * Math.exp(-age / 0.17);
    }
    return f;
  };

  // -------------------------------------------------------------- tracers --
  {
    const N = 64;
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 1, 5).rotateZ(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.7, 0.35), fog: false });
    const meshes = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      meshes.push(m);
    }
    const SPEED = 165;
    updaters.push((t) => {
      let k = 0;
      for (const m of meshes) m.visible = false;
      for (const b of TL.tracers) {
        if (t < b.t || t > b.t + b.n * b.interval + 1.5) continue;
        for (let r = 0; r < b.n && k < N; r++) {
          const age = t - (b.t + r * b.interval);
          if (age < 0 || age > 1.45) continue;
          const el = b.elev + 0.05 * noise1(r * 3.1, b.seed);
          const vx = b.dir * SPEED * Math.cos(el);
          const vy = SPEED * Math.sin(el) - 14 * age;
          const m = meshes[k++];
          m.visible = true;
          m.position.set(b.x + vx * age, GROUND_Y + b.y + SPEED * Math.sin(el) * age - 7 * age * age, b.z + 6 * noise1(r, b.seed + 2));
          m.rotation.z = Math.atan2(vy, vx);
          m.scale.set(11, 1, 1);
        }
      }
    });
  }

  // ----------------------------------------------------------------- flak --
  {
    const N = 10;
    const sprites = [];
    for (let i = 0; i < N; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      sprites.push(s);
    }
    updaters.push((t) => {
      let k = 0;
      for (const s of sprites) s.visible = false;
      for (const f of TL.flak) {
        const age = t - f.t;
        if (age < 0 || age > 0.4 || k >= N) continue;
        const s = sprites[k++];
        const i = Math.exp(-age / 0.07);
        s.visible = true;
        s.position.set(f.x, f.y, f.z);
        s.scale.setScalar(f.s * (7 + 40 * age));
        s.material.color.setRGB(6 * i, 4 * i, 2.2 * i);
      }
    });
  }

  // ----------------------------------------------------------------- jets --
  {
    const wing = new THREE.Shape([new THREE.Vector2(1.6, 0), new THREE.Vector2(-3.0, 3.6), new THREE.Vector2(-3.7, 3.6), new THREE.Vector2(-3.3, 0), new THREE.Vector2(-3.7, -3.6), new THREE.Vector2(-3.0, -3.6)]);
    const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.14, bevelEnabled: false }).rotateX(Math.PI / 2);
    const fin = new THREE.Shape([new THREE.Vector2(-1.8, 0), new THREE.Vector2(-3.9, 1.9), new THREE.Vector2(-4.4, 1.9), new THREE.Vector2(-4.0, 0)]);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false });
    const body = new THREE.CylinderGeometry(0.12, 0.6, 9.5, 8).rotateZ(-Math.PI / 2);
    const jetGeo = mergeGeometries([body.toNonIndexed(), wingGeo.toNonIndexed(), finGeo.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
    const jets = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(jetGeo, new THREE.MeshBasicMaterial({ color: 0x030303, fog: false })));
      const burner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(6, 2.6, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      burner.position.x = -5.4;
      burner.scale.setScalar(4.5);
      g.add(burner);
      g.visible = false;
      g.scale.setScalar(1.25);
      scene.add(g);
      jets.push(g);
    }
    updaters.push((t) => {
      for (const g of jets) g.visible = false;
      for (const j of TL.jets) {
        const age = t - j.t;
        if (age < 0 || age > 2.0) continue;
        jets.forEach((g, i) => {
          g.visible = true;
          const lag = i * 0.09;
          g.position.set(j.dir * (-175 + 210 * (age - lag)), j.y + 7 * age - i * 3, j.z - i * 10);
          g.rotation.set(0.5 * j.dir, j.dir > 0 ? 0 : Math.PI, 0.06);
        });
      }
    });
  }

  // --------------------------------------------------------------- embers --
  const makeEmbers = (count, box, origin, size, color) => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd() * box[0];
      pos[i * 3 + 1] = rnd() * box[1];
      pos[i * 3 + 2] = rnd() * box[2];
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    const u = { uTime: { value: 0 }, uBox: { value: new THREE.Vector3(...box) }, uOrigin: { value: new THREE.Vector3(...origin) }, uSize: { value: size }, uColor: { value: color } };
    const pts = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: /* glsl */ `
          attribute vec4 aSeed; uniform float uTime, uSize; uniform vec3 uBox, uOrigin; varying float vA;
          void main(){
            vec3 p = position;
            p.y = mod(p.y + uTime * (1.0 + aSeed.x * 3.0), uBox.y);
            p.x = mod(p.x + sin(uTime * (0.6 + aSeed.y) + aSeed.z * 6.28) * 1.2 + uTime * (0.6 + aSeed.w * 1.6), uBox.x);
            p += uOrigin;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uSize * (0.4 + aSeed.w) / -mv.z;
            vA = (0.45 + 0.55 * sin(uTime * (3.0 + aSeed.z * 6.0) + aSeed.x * 40.0)) * smoothstep(0.0, 0.1, p.y - uOrigin.y) ;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.05, 0.5, d); gl_FragColor = vec4(uColor * a * a * vA, 1.0); }`,
      })
    );
    pts.frustumCulled = false;
    updaters.push((t) => {
      u.uTime.value = t;
    });
    return pts;
  };
  scene.add(makeEmbers(280, [150, 40, 90], [-75, GROUND_Y, -100], 430 * scale, new THREE.Color(4.0, 1.3, 0.25)));

  return {
    scene,
    makeEmbers,
    flashAt,
    update(t, camera) {
      sky.position.copy(camera.position);
      skyU.uTime.value = t;
      const f = flashAt(t);
      skyU.uFlash.value = Math.min(f, 2.5);
      groundU.uFlash.value = Math.min(f, 2.5);
      tanks.forEach((tk, i) => {
        tk.turret.rotation.y = 0.25 * Math.sin(t * 0.3 + i * 2);
      });
      for (const fn of updaters) fn(t, camera);
    },
  };
}
