// Proton beam: bright core + soft glow + instanced proton "bunches".
// Local +X is the direction of travel; place/rotate the group to aim it.
import * as THREE from 'three';
import { glowMaterial } from '../core/materials.js';

let CYL = null;
const cyl = () => CYL || (CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateZ(-Math.PI / 2));

export class Beam {
  constructor({ radius = 0.012, glow = 4, bunches = 30, bunchLen = 0.22, bunchRadius = null, color = new THREE.Color(1.6, 3.6, 5.0) } = {}) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.coreMat = new THREE.MeshBasicMaterial({ color });
    this.core = new THREE.Mesh(cyl(), this.coreMat);
    this.glowMesh = new THREE.Mesh(cyl(), glowMaterial(new THREE.Color(0.15, 0.45, 0.9), 0.3));
    this.glowScale = glow;
    this.bunchMat = glowMaterial(new THREE.Color(2.2, 3.8, 5.0), 1);
    this.bunches = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.bunchMat, bunches);
    this.bunchLen = bunchLen;
    this.bunchRadius = bunchRadius ?? radius * 2.6;
    for (const m of [this.core, this.glowMesh, this.bunches]) { m.frustumCulled = false; this.group.add(m); }
    this.core.renderOrder = 5; this.glowMesh.renderOrder = 6; this.bunches.renderOrder = 6;
  }

  setOverlay(on) {
    for (const m of [this.coreMat, this.glowMesh.material, this.bunchMat]) m.depthTest = !on;
  }

  /**
   * from/to: extent of the beam line (local x). head: how far the beam front has
   * travelled (core only exists behind it). intensity scales visibility.
   */
  update({ t = 0, from = -10, to = 10, head = Infinity, speed = 12, spacing = 1.2, intensity = 1, core = true }) {
    const end = Math.min(to, head);
    const len = end - from;
    const vis = intensity > 0.001 && len > 0;
    this.core.visible = vis && core;
    this.glowMesh.visible = vis && core;
    if (vis) {
      this.core.scale.set(len, this.radius * intensity, this.radius * intensity);
      this.core.position.x = from + len / 2;
      this.glowMesh.scale.set(len, this.radius * this.glowScale, this.radius * this.glowScale);
      this.glowMesh.position.x = from + len / 2;
      this.glowMesh.material.opacity = 0.35 * Math.min(1, intensity);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const n = this.bunches.count, span = to - from;
    let shown = 0;
    for (let i = 0; i < n; i++) {
      let x = from + ((((t * speed + i * spacing) % span) + span) % span);
      const ok = vis && x <= end && i * spacing < span;
      p.set(x, 0, 0);
      s.set(this.bunchLen, this.bunchRadius, this.bunchRadius).multiplyScalar(ok ? Math.min(1, intensity) : 0);
      m4.compose(p, q, s);
      this.bunches.setMatrixAt(i, m4);
      if (ok) shown++;
    }
    this.bunches.instanceMatrix.needsUpdate = true;
    this.bunches.visible = shown > 0;
  }
}
