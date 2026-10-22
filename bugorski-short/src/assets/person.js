// Rigged stylised character built from primitives. Root sits on the floor
// between the feet; faces +Z; character's left = +X. All joints are Groups so
// meshes can never detach: a pose only rotates joints.
import * as THREE from 'three';
import { Head } from './head.js';
import { materials } from '../core/materials.js';
import { quatFromFrames } from '../core/util.js';

const HEAD_SCALE = 0.112;
export const ARM = { upper: 0.3, fore: 0.29 };

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  GEO = {
    pelvis: new THREE.SphereGeometry(1, 20, 14),
    torso: lathe([[0.001, -0.02], [0.155, 0.0], [0.17, 0.12], [0.178, 0.3], [0.19, 0.42], [0.16, 0.5], [0.08, 0.535], [0.001, 0.54]]),
    skirt: lathe([[0.165, 0.04], [0.19, -0.1], [0.215, -0.3], [0.235, -0.46]]),
    neck: new THREE.CylinderGeometry(0.05, 0.056, 0.11, 14),
    collar: new THREE.TorusGeometry(0.07, 0.025, 8, 20),
    shirtV: new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.075, 0.07), new THREE.Vector2(0.075, 0.07), new THREE.Vector2(0, -0.13)])),
    tie: new THREE.BoxGeometry(0.03, 0.17, 0.01),
    knot: new THREE.BoxGeometry(0.036, 0.03, 0.016),
    upperArm: new THREE.CapsuleGeometry(0.055, 0.22, 6, 12),
    foreArm: new THREE.CapsuleGeometry(0.047, 0.2, 6, 12),
    cuff: new THREE.CylinderGeometry(0.052, 0.052, 0.04, 12),
    hand: new THREE.SphereGeometry(1, 14, 10),
    thumb: new THREE.CapsuleGeometry(0.014, 0.035, 4, 6),
    thigh: new THREE.CapsuleGeometry(0.072, 0.3, 6, 12),
    shin: new THREE.CapsuleGeometry(0.058, 0.33, 6, 12),
    foot: new THREE.BoxGeometry(0.1, 0.07, 0.25, 1, 1, 1),
    clipboard: new THREE.BoxGeometry(0.24, 0.32, 0.012),
    paper: new THREE.PlaneGeometry(0.21, 0.27),
    clip: new THREE.BoxGeometry(0.08, 0.03, 0.02),
  };
  for (const g of Object.values(GEO)) g.computeBoundingSphere();
  return GEO;
}

export class Person {
  constructor(o = {}) {
    const M = materials();
    const G = geos();
    this.o = { coat: M.labCoat, trousers: M.trousers, shirt: M.shirt, hair: M.hair, skin: 0xe0ab88, glasses: false, clipboard: false, ...o };
    const skinMat = new THREE.MeshStandardMaterial({ color: this.o.skin, roughness: 0.62 });
    const mesh = (geo, mat, parent, pos = [0, 0, 0], scale = null, rot = null) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      if (rot) m.rotation.set(...rot);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const joint = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

    this.root = new THREE.Group();
    this.root.name = 'person';
    const J = (this.j = {});
    J.hips = joint(this.root, [0, 0.95, 0]);
    mesh(G.pelvis, this.o.trousers, J.hips, [0, 0, 0], [0.165, 0.11, 0.11]);
    const skirtMat = this.o.coat.clone();
    skirtMat.side = THREE.DoubleSide;
    mesh(G.skirt, skirtMat, J.hips, [0, 0, 0], [1, 1, 0.68]);

    J.spine = joint(J.hips, [0, 0.02, 0]);
    mesh(G.torso, this.o.coat, J.spine, [0, 0, 0], [1.05, 1, 0.66]);
    if (this.o.tie !== false) {
      mesh(G.shirtV, this.o.shirt, J.spine, [0, 0.455, 0.121], null, [-0.12, 0, 0]);
      mesh(G.knot, M.tie, J.spine, [0, 0.5, 0.126], null, [-0.12, 0, 0]);
      mesh(G.tie, M.tie, J.spine, [0, 0.41, 0.127], null, [-0.08, 0, 0]);
    }
    mesh(G.collar, this.o.coat, J.spine, [0, 0.525, 0.0], [1.05, 1, 0.9], [Math.PI / 2, 0, 0]);

    J.neck = joint(J.spine, [0, 0.52, 0.0]);
    mesh(G.neck, skinMat, J.neck, [0, 0.05, 0]);
    J.headPivot = joint(J.neck, [0, 0.09, 0.0]);
    this.head = new Head({ skin: this.o.skin, hair: this.o.hair, glasses: this.o.glasses });
    this.head.group.scale.setScalar(HEAD_SCALE);
    this.head.group.position.set(0, 0.07, 0.015);
    J.headPivot.add(this.head.group);

    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = (J['shoulder' + side] = joint(J.spine, [0.205 * sx, 0.45, 0]));
      mesh(G.upperArm, this.o.coat, sh, [0, -0.15, 0]);
      const el = (J['elbow' + side] = joint(sh, [0, -ARM.upper, 0]));
      mesh(G.foreArm, this.o.coat, el, [0, -0.13, 0]);
      mesh(G.cuff, this.o.coat, el, [0, -0.25, 0]);
      const hand = (J['hand' + side] = joint(el, [0, -ARM.fore, 0]));
      mesh(G.hand, skinMat, hand, [0, -0.02, 0.0], [0.042, 0.068, 0.026]);
      mesh(G.thumb, skinMat, hand, [-0.012 * sx, -0.012, 0.024], null, [0.5, 0, 0]);

      const hip = (J['hip' + side] = joint(J.hips, [0.092 * sx, -0.03, 0]));
      mesh(G.thigh, this.o.trousers, hip, [0, -0.21, 0]);
      const knee = (J['knee' + side] = joint(hip, [0, -0.44, 0]));
      mesh(G.shin, this.o.trousers, knee, [0, -0.21, 0]);
      const ankle = (J['ankle' + side] = joint(knee, [0, -0.445, 0]));
      mesh(G.foot, M.shoes, ankle, [0, -0.025, 0.055]);
    }

    if (this.o.clipboard) {
      this.clipboard = new THREE.Group();
      mesh(G.clipboard, M.wood, this.clipboard);
      mesh(G.paper, new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.9 }), this.clipboard, [0, -0.015, 0.0065]);
      mesh(G.clip, M.metal, this.clipboard, [0, 0.15, 0.012]);
      this.root.add(this.clipboard);
    }
    this.rest();
  }

  rest() {
    for (const j of Object.values(this.j)) j.rotation.set(0, 0, 0);
    this.j.hips.position.set(0, 0.95, 0);
    this.j.shoulderL.rotation.z = 0.08; this.j.shoulderR.rotation.z = -0.08;
    this.j.elbowL.rotation.x = -0.12; this.j.elbowR.rotation.x = -0.12;
  }

  /** Apply pose: object of joint → [x,y,z] euler (radians); 'hipsY' lowers the pelvis. */
  pose(p = {}) {
    this.rest();
    for (const [k, v] of Object.entries(p)) {
      if (k === 'hipsY') { this.j.hips.position.y = v; continue; }
      if (k === 'hipsZ') { this.j.hips.position.z = v; continue; }
      const j = this.j[k];
      if (j) j.rotation.set(v[0] || 0, v[1] || 0, v[2] || 0);
    }
    this.root.updateMatrixWorld(true);
    return this;
  }

  /** Classic walk cycle; phase in cycles. Returns stride length per cycle (m). */
  walk(phase, amt = 1) {
    const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
    const sw = 0.42 * amt;
    const kneeL = Math.max(0, -c) * 0.9 * amt + 0.08, kneeR = Math.max(0, c) * 0.9 * amt + 0.08;
    this.pose({
      hipsY: 0.94 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.025 * amt,
      spine: [0.06, -s * 0.12 * amt, 0],
      neck: [0, s * 0.06 * amt, 0],
      hipL: [-s * sw, 0, 0], hipR: [s * sw, 0, 0],
      kneeL: [kneeL, 0, 0], kneeR: [kneeR, 0, 0],
      ankleL: [s * 0.2 * amt - kneeL * 0.3, 0, 0], ankleR: [-s * 0.2 * amt - kneeR * 0.3, 0, 0],
      shoulderL: [s * 0.45 * amt, 0, 0.1], shoulderR: [-s * 0.45 * amt, 0, -0.1],
      elbowL: [-0.25 - Math.max(0, s) * 0.3, 0, 0], elbowR: [-0.25 - Math.max(0, -s) * 0.3, 0, 0],
    });
    return 2 * 2 * 0.88 * Math.sin(sw) * 0.92;
  }

  /**
   * Two-bone analytic IK for an arm. target: world position of the wrist.
   * pole: world direction the elbow should point towards.
   */
  reach(side, target, pole) {
    const sh = this.j['shoulder' + side], el = this.j['elbow' + side];
    const parent = sh.parent;
    parent.updateWorldMatrix(true, false);
    const inv = parent.matrixWorld.clone().invert();
    const tLocal = target.clone().applyMatrix4(inv).sub(sh.position);
    const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
    const pLocal = pole.clone().applyQuaternion(pq.invert()).normalize();
    const L1 = ARM.upper, L2 = ARM.fore;
    const d = Math.min(tLocal.length(), L1 + L2 - 1e-3);
    const dir = tLocal.clone().normalize();
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const alpha = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const perp = pLocal.clone().addScaledVector(dir, -pLocal.dot(dir)).normalize();
    const elbowPos = dir.clone().multiplyScalar(Math.cos(alpha) * L1).addScaledVector(perp, Math.sin(alpha) * L1);
    const u = elbowPos.clone().normalize();
    const wrist = dir.clone().multiplyScalar(d);
    const v = wrist.clone().sub(elbowPos).normalize();
    // local -Y → u ; local +Z → bend direction (forearm side)
    const yAxis = u.clone().negate();
    let zAxis = v.clone().addScaledVector(u, -v.dot(u));
    if (zAxis.lengthSq() < 1e-8) zAxis = perp.clone().negate();
    zAxis.normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    sh.quaternion.setFromRotationMatrix(m);
    el.rotation.set(-Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)), 0, 0);
    this.root.updateMatrixWorld(true);
  }

  /** Orient the head in world space: local beam direction / forward → worldFwd, up → worldUp. */
  aimHead(worldFwd, worldUp, localFwd = new THREE.Vector3(0, 0, 1)) {
    const hp = this.j.headPivot;
    hp.parent.updateWorldMatrix(true, false);
    const qWorld = quatFromFrames(localFwd, new THREE.Vector3(0, 1, 0), worldFwd, worldUp);
    const pq = new THREE.Quaternion(); hp.parent.getWorldQuaternion(pq);
    hp.quaternion.copy(pq.invert().multiply(qWorld));
    this.root.updateMatrixWorld(true);
  }

  /** World position of a point given in head-local (unit) coordinates. */
  headPoint(local) {
    this.head.group.updateWorldMatrix(true, false);
    return local.clone().applyMatrix4(this.head.group.matrixWorld);
  }

  /** Place the clipboard between both hands (call after reach()). */
  holdClipboard(tilt = 0.5) {
    if (!this.clipboard) return;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.j.handL.getWorldPosition(a); this.j.handR.getWorldPosition(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const inv = this.root.matrixWorld.clone().invert();
    this.clipboard.position.copy(mid.applyMatrix4(inv)).add(new THREE.Vector3(0, -0.02, 0.03));
    this.clipboard.rotation.set(-tilt, 0, 0);
  }
}
