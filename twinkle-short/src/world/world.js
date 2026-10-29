// The whole show happens in one tiny world: a little round planet with a mushroom
// house on top (Pip's window), a twilight sky with a starfield and a sleepy moon, and a
// ring of puffy clouds. Shots are camera moves through this single scene.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mushroomTexture, woodTexture, grassTexture, radialTexture, sparkleTexture, canvas } from '../core/textures.js';
import { mulberry32, clamp } from '../core/util.js';
import { Eye, Mouth } from '../characters/face.js';

export const PLANET_R = 24;
export const PLANET_C = new THREE.Vector3(0, -PLANET_R, 0);
export const WINDOW = { y: 1.62, r: 0.5, z: 1.2 };     // window centre on the house stem (front, +Z)

const std = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, ...o });

/** Point on the planet surface along direction d (unit), lifted by h. */
export function onPlanet(d, h = 0) {
  return PLANET_C.clone().addScaledVector(d.clone().normalize(), PLANET_R + h);
}

class Sky {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uSpace: { value: 0 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uSpace; varying vec3 vD;
        float h(vec3 p){ p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          float y = vD.y;
          vec3 top = vec3(0.16, 0.08, 0.42), mid = vec3(0.42, 0.17, 0.72), pink = vec3(1.0, 0.45, 0.72), peach = vec3(1.0, 0.72, 0.5);
          vec3 c = mix(mid, top, smoothstep(0.25, 0.95, y));
          c = mix(pink, c, smoothstep(0.0, 0.32, y));
          c = mix(peach, c, smoothstep(-0.06, 0.07, y));
          c = mix(c, vec3(0.2, 0.09, 0.4), smoothstep(-0.02, -0.35, y));          // below the horizon: deep space
          // nebula wisps (pink + teal), stronger high up and in space views
          float n = n3(vD * 3.0 + vec3(0.05 * sin(uTime), 0.0, 0.05 * cos(uTime))) * 0.6 + n3(vD * 7.0) * 0.4;
          float neb = smoothstep(0.52, 0.85, n) * (0.35 + 0.65 * smoothstep(0.1, 0.8, abs(y) + uSpace));
          c += neb * mix(vec3(0.55, 0.12, 0.45), vec3(0.1, 0.45, 0.55), n3(vD * 2.0 + 4.0)) * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.dome.renderOrder = -10;
    // starfield: points that twinkle
    const r = mulberry32(21);
    const N = 1600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
    const palette = [[1, 1, 1], [1, 0.92, 0.6], [1, 0.75, 0.9], [0.7, 0.9, 1]];
    for (let i = 0; i < N; i++) {
      let x, y, z, l;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.2);
      pos.set([(x / l) * 280, (y / l) * 280, (z / l) * 280], i * 3);
      col.set(palette[Math.floor(r() * 4)], i * 3);
      ph[i] = r() * 6.28; sz[i] = 2 + r() * r() * 9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uMap: { value: sparkleTexture() } },
      vertexShader: `attribute float phase; attribute float size; attribute vec3 color; uniform float uTime; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * (8.0 + floor(fract(phase * 7.0) * 14.0)) + phase);   // integer rates → loops
          float horizon = smoothstep(-0.12, 0.08, normalize(position).y);
          vA = tw * (0.35 + 0.65 * horizon); vC = color; gl_PointSize = size * (0.7 + 0.6 * tw); }`,
      fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * 1.6 * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.stars.renderOrder = -9;
    this.group = new THREE.Group();
    this.group.add(this.dome, this.stars);
  }

  /** th: loop phase 0..2π (everything that moves continuously is periodic over the loop) */
  update(th, camPos, space = 0) {
    this.uniforms.uTime.value = th;
    this.uniforms.uSpace.value = space;
    this.group.position.copy(camPos);             // always infinitely far
  }
}

/** Sleepy crescent moon with a night cap. */
class Moon {
  constructor() {
    this.group = new THREE.Group();
    const s = new THREE.Shape();
    s.absarc(0, 0, 1, -Math.PI * 0.62, Math.PI * 0.62, false);
    s.absarc(0.42, 0.06, 0.82, Math.PI * 0.55, -Math.PI * 0.52, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.09, bevelSegments: 6, curveSegments: 48 });
    geo.center();
    this.mesh = new THREE.Mesh(geo, std(0xfff0a6, { emissive: 0xffd76a, emissiveIntensity: 0.5, roughness: 0.5, clearcoat: 0.6 }));
    this.mesh.rotation.z = Math.PI;                 // horns point right: the face sits on the inner edge
    this.group.add(this.mesh);
    // sleepy face on the inner curve
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x5a3a2a });
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), lineMat);
    eye.rotation.z = Math.PI; eye.position.set(0.08, 0.16, 0.36);
    this.group.add(eye);
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 20, Math.PI), lineMat);
    this.smile.rotation.z = Math.PI; this.smile.position.set(0.16, -0.12, 0.36);
    this.group.add(this.smile);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), new THREE.MeshBasicMaterial({ color: 0xff9ac0, transparent: true, opacity: 0.7 }));
    blush.position.set(-0.02, -0.02, 0.37); this.group.add(blush);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 32), std(0x9a7bff, { roughness: 0.7, sheen: 0.6 }));
    cap.position.set(-0.32, 0.92, 0); cap.rotation.z = 0.7;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), std(0xffffff, { roughness: 0.9, sheen: 1 }));
    pom.position.set(-0.68, 1.3, 0);
    this.group.add(cap, pom);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,230,150,0.8)', 'rgba(255,200,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(5.5); this.glow.position.z = -0.5;
    this.group.add(this.glow);
    this.zzz = [0, 1, 2].map((i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false }));
      this.group.add(sp); return sp;
    });
  }

  update(b) {
    this.group.rotation.z = 0.12 * Math.sin(b * Math.PI / 4);
    this.zzz.forEach((sp, i) => {
      const u = ((b / 4 + i / 3) % 1);
      sp.position.set(-0.2 + u * 1.2, 0.5 + u * 1.4, 0.3);
      sp.scale.setScalar(0.25 + u * 0.35);
      sp.material.opacity = Math.sin(u * Math.PI) * 0.9;
    });
  }
}

let _z = null;
function zTexture() {
  if (_z) return _z;
  const c = canvas(128, 128), g = c.getContext('2d');
  g.font = '700 104px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#6b4bd6'; g.strokeText('z', 64, 70);
  g.fillStyle = '#ffffff'; g.fillText('z', 64, 70);
  _z = new THREE.CanvasTexture(c); _z.colorSpace = THREE.SRGBColorSpace;
  return _z;
}

/** Pip's mushroom house: stem with a round window (warm interior), spotted cap, door, flower box. */
class House {
  constructor() {
    this.group = new THREE.Group();
    const stemPts = [[0, 0], [1.32, 0], [1.26, 0.5], [1.15, 1.4], [1.12, 2.2], [1.2, 2.62], [0, 2.62]].map(([x, y]) => new THREE.Vector2(x, y));
    this.stem = new THREE.Mesh(new THREE.LatheGeometry(stemPts, 64), std(0xfff0d6, { roughness: 0.75, sheen: 0.4, sheenColor: new THREE.Color(1, 0.9, 0.8) }));
    this.group.add(this.stem);
    // cap: rounded dome with an underside
    const capPts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; capPts.push(new THREE.Vector2(Math.cos(a) * 2.45, 2.45 + Math.sin(a) * 1.75)); }
    capPts.reverse();
    const capGeo = new THREE.LatheGeometry(capPts, 72);
    this.cap = new THREE.Mesh(capGeo, std(0xffffff, { map: mushroomTexture(), roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.3 }));
    this.group.add(this.cap);
    const under = new THREE.Mesh(new THREE.CircleGeometry(2.45, 72), std(0xffd7c4, { roughness: 0.8, side: THREE.DoubleSide }));
    under.rotation.x = -Math.PI / 2; under.position.y = 2.46;
    this.group.add(under);
    // window: frame ring, sill, warm interior with curtains
    const w = WINDOW;
    this.window = new THREE.Group();
    this.window.position.set(0, w.y, w.z - 0.03);
    this.group.add(this.window);
    const wood = woodTexture(5);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(w.r + 0.06, 0.09, 16, 48), std(0xffffff, { map: wood, roughness: 0.55, clearcoat: 0.5 }));
    this.window.add(frame);
    const interior = canvas(256, 256), g = interior.getContext('2d');
    const grd = g.createRadialGradient(128, 150, 10, 128, 128, 140);
    grd.addColorStop(0, '#fff2b8'); grd.addColorStop(0.55, '#ffc46e'); grd.addColorStop(1, '#ff8a4a');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(160,80,60,0.35)'; g.fillRect(0, 168, 256, 10);                    // shelf
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff7aa8', '#7cc6ff', '#ffe066', '#9be37a', '#c39bff'][i]; g.fillRect(40 + i * 22, 132 - (i % 2) * 8, 16, 36 + (i % 2) * 8); } // books
    const itex = new THREE.CanvasTexture(interior); itex.colorSpace = THREE.SRGBColorSpace;
    this.interiorMat = new THREE.MeshBasicMaterial({ map: itex, color: new THREE.Color(1.3, 1.2, 1.1) });
    const back = new THREE.Mesh(new THREE.CircleGeometry(w.r, 48), this.interiorMat);
    back.position.z = -0.25;
    this.window.add(back);
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, 0.28, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd9a8, side: THREE.BackSide, roughness: 0.9, emissive: 0x6a3a10, emissiveIntensity: 0.6 }));
    tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -0.11;
    this.window.add(tunnel);
    const curtainMat = std(0xff8fbf, { roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(1, 0.8, 0.9), side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const cg = new THREE.PlaneGeometry(0.32, 0.95, 12, 8);
      const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.03 * Math.sin(x * 40) ); p.setX(i, x * (0.65 + 0.35 * (y + 0.47) / 0.95) - s * (1 - (y + 0.47) / 0.95) * 0.04); }
      cg.computeVertexNormals();
      const c = new THREE.Mesh(cg, curtainMat);
      c.position.set(s * (w.r - 0.12), 0.0, -0.18);
      this.window.add(c);
    }
    this.sill = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.4), std(0xffffff, { map: wood, roughness: 0.6 }));
    this.sill.position.set(0, -w.r - 0.02, 0.12);
    this.window.add(this.sill);
    // flower box under the sill
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.24), std(0x9b6bd8, { roughness: 0.6 }));
    box.position.set(0, -w.r - 0.2, 0.18);
    this.window.add(box);
    const r = mulberry32(31);
    const fcol = [0xff6fa8, 0xffe066, 0xffffff, 0x7cc6ff];
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), std(fcol[i % 4], { roughness: 0.5, emissive: fcol[i % 4], emissiveIntensity: 0.15 }));
      f.position.set(-0.42 + i * 0.105, -w.r - 0.06 + r() * 0.05, 0.2 + (r() - 0.5) * 0.08);
      this.window.add(f);
    }
    // warm light from the room onto whoever leans out
    this.roomLight = new THREE.PointLight(0xffb870, 5, 3.5, 1.6);
    this.roomLight.position.set(0, w.y + 0.1, w.z - 0.1);
    this.group.add(this.roomLight);
    // door (round top) facing front-left, with a little lamp
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-0.38, 0); doorShape.lineTo(0.38, 0); doorShape.lineTo(0.38, 0.75); doorShape.absarc(0, 0.75, 0.38, 0, Math.PI, false); doorShape.lineTo(-0.38, 0);
    const door = new THREE.Mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), std(0xffffff, { map: woodTexture(8, [170, 100, 60]), roughness: 0.6 }));
    const doorG = new THREE.Group();
    doorG.rotation.y = -0.85;
    door.position.set(0, 0.02, 1.24);
    doorG.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), std(0xffd25a, { metalness: 0.8, roughness: 0.3 }));
    knob.position.set(0.24, 0.5, 1.36); doorG.add(knob);
    this.group.add(doorG);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.9) }));
    this.lamp.position.set(Math.sin(-1.35) * 1.32, 1.25, Math.cos(-1.35) * 1.32);   // beside the door, out of the window shots
    this.group.add(this.lamp);
  }
}

/** Puffy cloud cluster (merged spheres). */
function cloud(seed, scale = 1) {
  const r = mulberry32(seed);
  const g = new THREE.Group();
  const mat = std(0xfff4fb, { roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(1, 0.85, 1), emissive: 0xffc8e8, emissiveIntensity: 0.12 });
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    const x = (i / (n - 1) - 0.5) * 3.2;
    s.position.set(x + (r() - 0.5) * 0.4, Math.sqrt(Math.max(0, 1 - (x / 1.8) ** 2)) * 0.6 + r() * 0.3, (r() - 0.5) * 0.8);
    s.scale.setScalar((0.55 + r() * 0.5) * (1 - 0.35 * Math.abs(x) / 1.6));
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}

export class World {
  constructor(pmrem) {
    const s = (this.scene = new THREE.Scene());
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.45;
    this.sky = new Sky();
    s.add(this.sky.group);
    // lights: bright, colourful night (kids' content stays readable and cheerful)
    s.add(new THREE.HemisphereLight(0xc6b4ff, 0xff9cc8, 1.25));
    const key = (this.key = new THREE.DirectionalLight(0xfff1df, 2.2));
    key.position.set(-6, 14, 10); key.target.position.set(0, 1, 0);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -4, near: 1, far: 40 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 1.6); rim.position.set(8, 6, -10); s.add(rim);
    // planet
    const pg = new THREE.SphereGeometry(PLANET_R, 160, 120);
    const pp = pg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) {
      v.fromBufferAttribute(pp, i);
      const d = v.clone().normalize();
      const flat = clamp((1 - d.y) / 0.05);                     // keep the house plot flat
      const hgt = (Math.sin(d.x * 9 + d.z * 4) * Math.sin(d.z * 7 - d.y * 3) * 0.45 + Math.sin(d.x * 17) * 0.12) * flat;
      v.addScaledVector(d, hgt);
      pp.setXYZ(i, v.x, v.y, v.z);
    }
    pg.computeVertexNormals();
    this.planet = new THREE.Mesh(pg, std(0xffffff, { map: grassTexture(), roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0.8, 1, 0.7) }));
    this.planet.position.copy(PLANET_C);
    this.planet.receiveShadow = true;
    s.add(this.planet);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.08, 64, 48), new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(1.0, 0.6, 0.95) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(c * f * 1.2, f); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    }));
    this.atmo.position.copy(PLANET_C);
    s.add(this.atmo);
    this._scatter();
    this.house = new House();
    this.house.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    s.add(this.house.group);
    this.moon = new Moon();
    this.moon.group.position.set(-26, 34, -70);
    this.moon.group.scale.setScalar(7);
    s.add(this.moon.group);
    // cloud ring (altitude 9–15 above the surface), plus one cluster right in the star's path up
    this.clouds = new THREE.Group();
    const r = mulberry32(77);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2, tilt = (r() - 0.5) * 1.6;
      const d = new THREE.Vector3(Math.cos(a) * Math.cos(tilt), Math.sin(tilt) * 0.5 + 0.3 * (r() - 0.5), Math.sin(a) * Math.cos(tilt));
      const c = cloud(100 + i, 1.4 + r() * 1.6);
      c.position.copy(onPlanet(d, 10 + r() * 6));
      c.lookAt(PLANET_C); c.rotateX(-Math.PI / 2);
      this.clouds.add(c);
    }
    this.pathClouds = [cloud(501, 2.2), cloud(502, 1.8), cloud(503, 2.0)];
    this.pathClouds[0].position.set(0.6, 12.5, 1.5);
    this.pathClouds[1].position.set(-2.8, 13.6, -0.8);
    this.pathClouds[2].position.set(3.2, 14.2, 0.2);
    for (const c of this.pathClouds) this.clouds.add(c);
    s.add(this.clouds);
    // fireflies around the house
    this.fireflies = [];
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,250,170,1)', 'rgba(200,255,120,0)'), color: new THREE.Color(1.6, 1.8, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.userData = { a: r() * 6.28, rad: 1.6 + r() * 1.4, y: 0.4 + r() * 2.2, sp: 0.2 + r() * 0.3 };
      s.add(sp); this.fireflies.push(sp);
    }
  }

  _scatter() {
    const r = mulberry32(5);
    const randDir = (minY = -1) => {
      let d; do { d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (d.length() > 1 || d.length() < 0.2 || d.normalize().y < minY);
      return d;
    };
    const up = new THREE.Vector3(0, 1, 0);
    const place = (obj, d, h = 0) => { obj.position.copy(onPlanet(d, h)); obj.quaternion.setFromUnitVectors(up, d.clone().normalize()); this.scene.add(obj); obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); };
    // lollipop trees
    const canopyCols = [0x7ee8b8, 0xff9ec7, 0xb9a2ff, 0x9be37a, 0xffd36e];
    for (let i = 0; i < 46; i++) {
      const d = randDir(-0.6);
      if (d.y > 0.985) continue;                                   // keep the house plot clear
      const t = new THREE.Group();
      const sc = 0.7 + r() * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.1, 10), std(0xb07a52, { roughness: 0.8 }));
      trunk.position.y = 0.55;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), std(canopyCols[i % 5], { roughness: 0.55, clearcoat: 0.4, sheen: 0.5 }));
      top.position.y = 1.35; top.scale.set(1, 0.92, 1);
      t.add(trunk, top); t.scale.setScalar(sc);
      place(t, d, -0.1);
    }
    // little mushroom houses dotted around the world
    const capCols = [0x7cc6ff, 0xffd36e, 0xc39bff, 0x7ee8b8];
    for (let i = 0; i < 12; i++) {
      const d = randDir(-0.3);
      if (d.y > 0.97) continue;
      const h = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 20), std(0xfff0d6));
      stem.position.y = 0.45;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(capCols[i % 4], { roughness: 0.45, clearcoat: 0.6 }));
      cap.position.y = 0.85; cap.scale.y = 0.75;
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.7) }));
      win.position.set(0, 0.5, 0.45);
      h.add(stem, cap, win); h.scale.setScalar(0.9 + r() * 0.6);
      place(h, d, -0.05);
    }
    // flowers near the house
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 10, 8), std(0xffffff, { roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 }), 160);
    const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const fcols = [0xff6fa8, 0xffe066, 0xffffff, 0x7cc6ff, 0xc39bff];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, dist = 1.6 + Math.sqrt(r()) * 7;
      const d = new THREE.Vector3(Math.cos(a) * dist, PLANET_R, Math.sin(a) * dist).normalize();
      const p = onPlanet(d, 0.08 + r() * 0.05);
      m4.compose(p, q, new THREE.Vector3(1, 0.8, 1).multiplyScalar(0.8 + r() * 0.6));
      fl.setMatrixAt(i, m4); fl.setColorAt(i, col.set(fcols[i % 5]));
    }
    this.scene.add(fl);
  }

  update(b, camPos, space = 0) {
    const th = (b / 48) * Math.PI * 2;
    this.sky.update(th, camPos, space);
    this.moon.update(b);
    this.fireflies.forEach((f, i) => {
      const u = f.userData;
      const a = u.a + th * (i % 2 ? 1 : -2);
      f.position.set(Math.cos(a) * u.rad, u.y + 0.25 * Math.sin(th * 6 + i), Math.sin(a) * u.rad);
      f.scale.setScalar(0.08 + 0.04 * Math.sin(th * 18 + i * 1.7));
    });
    this.clouds.rotation.y = 0.04 * Math.sin(th);
    // the atmosphere glow reaches above the house: only show it once the camera is far out
    this.atmo.visible = camPos.distanceTo(PLANET_C) > PLANET_R * 1.2;
  }
}
