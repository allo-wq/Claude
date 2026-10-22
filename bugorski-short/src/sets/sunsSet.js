// Visual metaphor for Bugorski's own description — "brighter than a thousand
// suns". 1000 instanced suns ignite around the camera, then white-out.
import * as THREE from 'three';
import { mulberry32, clamp, smooth } from '../core/util.js';

export class SunsSet {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x05040a);
    const N = (this.N = 1000);
    const r = mulberry32(1000);
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.mesh.frustumCulled = false;
    this.items = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // golden-spiral shell + jitter so they surround the viewer evenly
      const k = i + 0.5, phi = Math.acos(1 - (2 * k) / N), th = Math.PI * (1 + Math.sqrt(5)) * k;
      const rad = 16 + r() * 22;
      const pos = new THREE.Vector3(Math.cos(th) * Math.sin(phi), Math.cos(phi) * 0.75, Math.sin(th) * Math.sin(phi)).multiplyScalar(rad);
      this.items.push({ pos, order: r(), size: 0.45 + r() * 0.5 });
      this.mesh.setColorAt(i, c.setRGB(3.6, 2.0 + r() * 0.9, 0.5 + r() * 0.5));
    }
    s.add(this.mesh);
  }

  /** lit: 0..1 fraction of suns ignited. */
  update(t, { lit = 1 } = {}) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.items.forEach((it, i) => {
      const k = smooth(clamp((lit - it.order * 0.85) / 0.15));
      const pulse = 1 + 0.08 * Math.sin(t * 9 + i);
      sc.setScalar(it.size * k * pulse);
      m4.compose(it.pos, q, sc);
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
