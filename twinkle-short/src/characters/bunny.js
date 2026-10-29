// "Pip": a little bunny in star pyjamas and a night cap. Built at head-radius 1 and
// scaled into the world. Hierarchy: root → body → head (ears, cap, face) and arms.
// Pose with set({...}); every value is plain data so each frame is independent.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { Eye, Mouth, blushMaterial } from './face.js';
import { pyjamaTexture, stripeTexture } from '../core/textures.js';
import { clamp, lerp } from '../core/util.js';

const FUR = 0xfff6fa;
const HEAD_SCALE = new THREE.Vector3(1.08, 0.95, 1.0);

function fur(color = FUR) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color(1, 1, 1), sheenRoughness: 0.55, envMapIntensity: 0.5 });
}

/** Point + normal on the scaled head sphere in direction (x, y, z). */
function headSurface(x, y, z) {
  const d = new THREE.Vector3(x, y, z).normalize();
  const p = d.clone().multiply(HEAD_SCALE);
  const n = new THREE.Vector3(d.x / HEAD_SCALE.x, d.y / HEAD_SCALE.y, d.z / HEAD_SCALE.z).normalize();
  return { p, n };
}

export class Bunny {
  constructor(o = {}) {
    this.o = { size: 0.28, ...o };
    const Z = new THREE.Vector3(0, 0, 1);
    this.root = new THREE.Group();
    this.root.scale.setScalar(this.o.size);
    this.body = new THREE.Group();
    this.root.add(this.body);
    const furMat = fur();
    const pj = new THREE.MeshPhysicalMaterial({ map: pyjamaTexture(), roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color(0.9, 0.95, 1) });
    // torso in pyjamas
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.85, 40, 30), pj);
    torso.scale.set(1.0, 1.12, 0.85); torso.position.y = -1.45;
    this.body.add(torso);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 12, 36), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.7, sheen: 0.5 }));
    collar.rotation.x = Math.PI / 2 - 0.15; collar.position.set(0, -0.72, 0.05);
    this.body.add(collar);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshPhysicalMaterial({ color: 0xffe066, roughness: 0.3, clearcoat: 1 }));
      b.position.set(0, -1.1 - i * 0.32, 0.72 - i * 0.03); this.body.add(b);
    }
    // arms (pivot at the shoulder; rest pose hangs down)
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.62 * s, -1.0, 0.05);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 8, 16), pj);
      arm.position.y = -0.38;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.23, 24, 18), furMat);
      paw.position.y = -0.78;
      pivot.add(arm, paw);
      this.body.add(pivot);
      return { pivot, paw };
    });
    // head
    this.head = new THREE.Group();
    this.head.position.y = 0.05;
    this.body.add(this.head);
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 40), furMat);
    this.headMesh.scale.copy(HEAD_SCALE);
    this.head.add(this.headMesh);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.4, 36, 28), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.85, sheen: 1, sheenRoughness: 0.5 }));
    this.muzzle.scale.set(1.25, 0.82, 0.7); this.muzzle.position.set(0, -0.36, 0.76);
    this.head.add(this.muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), new THREE.MeshPhysicalMaterial({ color: 0xff7aa8, roughness: 0.25, clearcoat: 1 }));
    nose.scale.set(1.35, 0.95, 0.8); nose.position.set(0, -0.2, 1.03);
    this.head.add(nose);
    this.nose = nose;
    // whiskers
    const wm = new THREE.MeshStandardMaterial({ color: 0xd9c4da, roughness: 0.6 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.55, 5), wm);
      w.rotation.z = s * (Math.PI / 2 + (i - 1) * 0.22);
      w.position.set(s * 0.62, -0.36 + (1 - i) * 0.07, 0.86);
      this.head.add(w);
    }
    // eyes on the head surface
    this.eyes = [-1, 1].map((s) => {
      const e = new Eye({ r: 0.2, lid: FUR, iris: '#6b3f22', sy: 1.2, depth: 0.6 });
      const { p, n } = headSurface(0.4 * s, 0.17, 0.9);
      e.group.position.copy(p).addScaledVector(n, -0.07);
      e.group.quaternion.setFromUnitVectors(Z, n);
      this.head.add(e.group);
      return e;
    });
    // cheeks
    this.cheeks = [-1, 1].map((s) => {
      const { p, n } = headSurface(0.66 * s, -0.24, 0.72);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), blushMaterial());
      m.position.copy(p).addScaledVector(n, 0.012); m.quaternion.setFromUnitVectors(Z, n);
      this.head.add(m);
      return m;
    });
    // mouth: canvas texture projected onto the muzzle with a decal (conforms to the curve)
    this.mouth = new Mouth({ teeth: true, fill: '#8a2243' });
    this.root.updateMatrixWorld(true);
    const mpos = new THREE.Vector3(0, -0.5, 1.0).applyMatrix4(this.head.matrixWorld);
    const dec = new DecalGeometry(this.muzzle, mpos, new THREE.Euler(0, 0, 0), new THREE.Vector3(0.52, 0.39, 0.6));
    dec.applyMatrix4(this.head.matrixWorld.clone().invert());
    this.mouthMesh = new THREE.Mesh(dec, this.mouth.material);
    this.head.add(this.mouthMesh);
    // ears: base + tip segments, pink inner
    const inner = new THREE.MeshPhysicalMaterial({ color: 0xffa6c9, roughness: 0.7, sheen: 0.8, sheenColor: new THREE.Color(1, 0.8, 0.9) });
    this.ears = [-1, 1].map((s) => {
      const base = new THREE.Group();
      base.position.set(0.42 * s, 0.72, -0.08);
      const seg = (len, r) => {
        const g = new THREE.Group();
        const outer = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 16), furMat);
        outer.scale.z = 0.5; outer.position.y = len / 2 + r * 0.6;
        const inn = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.6, len * 0.85, 8, 12), inner);
        inn.scale.z = 0.3; inn.position.set(0, len / 2 + r * 0.6, r * 0.32);
        g.add(outer, inn);
        return g;
      };
      const a = seg(0.62, 0.21);
      base.add(a);
      const tipPivot = new THREE.Group();
      tipPivot.position.y = 0.86;
      a.add(tipPivot);
      tipPivot.add(seg(0.52, 0.2));
      this.head.add(base);
      return { base, tipPivot };
    });
    // night cap: bent striped cone with a pompom
    const capGeo = new THREE.ConeGeometry(0.46, 1.25, 40, 24, true);
    const pos = capGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.625, u = y / 1.25;
      pos.setX(i, pos.getX(i) + 0.55 * u * u);
      pos.setY(i, pos.getY(i) - 0.25 * u * u * u);
    }
    capGeo.computeVertexNormals();
    this.cap = new THREE.Group();
    this.cap.position.set(-0.05, 0.86, -0.22); this.cap.rotation.set(-0.35, 0, 0.25);
    const capMesh = new THREE.Mesh(capGeo, new THREE.MeshPhysicalMaterial({ map: stripeTexture('#ff8ac2', '#ffffff', 5), roughness: 0.75, sheen: 0.6, side: THREE.DoubleSide }));
    capMesh.position.y = 0.6;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 10, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, sheen: 1 }));
    brim.rotation.x = Math.PI / 2;
    this.pompom = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), new THREE.MeshPhysicalMaterial({ color: 0xffe066, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(1, 1, 0.8) }));
    this.pompom.position.set(0.55, 1.12, 0);
    this.cap.add(capMesh, brim, this.pompom);
    this.head.add(this.cap);
    this.set({});
  }

  /** Hide everything below the world-space height y (Pip stands inside, behind the sill). */
  clipBelow(y) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    this.root.traverse((m) => { if (m.isMesh) m.material.clippingPlanes = [plane]; });
    for (const e of this.eyes) e.irisSparkMat.clippingPlanes = e.irisMat.clippingPlanes = [plane];
  }

  /**
   * head: [nod, turn, tilt]; lean; bob (vertical); arms: [[x, y, z] L, [x, y, z] R] (character's left/right);
   * ears: {perk, flop, wiggle}; eyes: {...Eye.set}; mouth: {...Mouth.set}; squash
   */
  set({ head = [0, 0, 0], lean = 0, bob = 0, armL = [0, 0, 0.15], armR = [0, 0, -0.15], ears = {}, eyes = {}, mouth = {}, squash = 0, blush = 0.8 } = {}) {
    this.body.position.y = bob;
    this.body.rotation.set(lean, 0, 0);
    const st = 1 + squash;
    this.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    this.head.rotation.set(head[0], head[1], head[2]);
    // arm 0 is on the viewer's left = character's right
    this.arms[0].pivot.rotation.set(armR[0], armR[1], armR[2]);
    this.arms[1].pivot.rotation.set(armL[0], armL[1], armL[2]);
    const { perk = 1, flop = 0, wiggle = 0, spread = 0 } = ears;
    this.ears.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      e.base.rotation.set(-0.12 + (1 - perk) * 0.5, 0, s * (-0.12 - spread * 0.4) + wiggle * Math.sin(i * 2.3));
      e.tipPivot.rotation.set(flop * 0.9 * (i ? 0.8 : 1), 0, s * -flop * 0.6);
    });
    this.eyes.forEach((e, i) => e.set({ ...eyes, ...(eyes.wink === (i ? 'L' : 'R') ? { happy: 1 } : {}) }));
    this.mouth.set({ smile: 0.6, ...mouth, width: (mouth.width ?? 1) * 0.9 });
    this.cheeks.forEach((c) => (c.material.opacity = clamp(blush)));
  }
}
