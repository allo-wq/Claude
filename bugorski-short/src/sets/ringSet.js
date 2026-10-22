// Aerial establishing shot: a stylised synchrotron ring (U-70 was ~1.5 km around;
// shown compressed) in forest at dusk, with the beam circulating.
import * as THREE from 'three';
import { materials } from '../core/materials.js';
import { synchrotronRing } from '../assets/machines.js';
import { mulberry32 } from '../core/util.js';
import { gradientTexture, tex, concreteTexture } from '../core/textures.js';

export class RingSet {
  constructor() {
    const M = materials();
    const s = (this.scene = new THREE.Scene());
    s.background = gradientTexture([[0, '#0b1830'], [0.55, '#2a3b63'], [0.8, '#c0674a'], [1, '#e89a5c']]);
    s.fog = new THREE.Fog(0x5a5f80, 140, 380);

    s.add(new THREE.HemisphereLight(0xa9c0e8, 0x3a3020, 1.6));
    const sun = new THREE.DirectionalLight(0xffc08a, 3.0);
    sun.position.set(-70, 55, -50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
    sun.shadow.bias = -0.0005;
    s.add(sun);

    const groundTex = tex(concreteTexture(21, [52, 66, 44]), { repeat: [30, 30] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x8a9a6a, map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    s.add(ground);

    this.ring = synchrotronRing(30, 120);
    s.add(this.ring);

    // forest (instanced cones + trunks), kept clear of the ring trench and the lab campus
    const r = mulberry32(77);
    const N = 1400;
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x3c6040, roughness: 0.9 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    while (n < N) {
      const x = (r() - 0.5) * 260, z = (r() - 0.5) * 260;
      const d = Math.hypot(x, z);
      if (Math.abs(d - 30) < 5.5) continue;
      if (x > 20 && x < 52 && z > -14 && z < 14) continue;
      if (d < 18) { if (r() > 0.35) continue; }
      const h = 3 + r() * 4;
      p.set(x, h / 2, z); sc.set(h * 0.32, h, h * 0.32);
      m4.compose(p, q, sc);
      crown.setMatrixAt(n, m4);
      crown.setColorAt(n, c.setHSL(0.3 + r() * 0.06, 0.3, 0.3 + r() * 0.12));
      n++;
    }
    crown.castShadow = true; crown.receiveShadow = true;
    s.add(crown);

    // lab campus buildings and a beam-line hall leaving the ring
    const bld = new THREE.MeshStandardMaterial({ color: 0xbdb7a8, roughness: 0.9 });
    const add = (w, h, d, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bld); b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; s.add(b); };
    add(16, 5, 7, 38, 0); add(8, 8, 8, 46, 9); add(10, 4, 6, 44, -9); add(5, 3, 18, 27, 0);
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.7, 1.6) });
    for (let i = 0; i < 12; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), winMat);
      w.position.set(31 + i * 1.2, 2.6, 3.52);
      s.add(w);
    }
    // road
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4, 120), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(50, 0.02, 60);
    s.add(road);
  }

  update(t) {
    const { bunches, R } = this.ring.userData;
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < bunches.count; i++) {
      const a = -t * 1.6 + (i / bunches.count) * Math.PI * 2;
      p.set(Math.cos(a) * R, -0.35, Math.sin(a) * R);
      s.set(1, 1, 1);
      m4.compose(p, q, s);
      bunches.setMatrixAt(i, m4);
    }
    bunches.instanceMatrix.needsUpdate = true;
  }
}
