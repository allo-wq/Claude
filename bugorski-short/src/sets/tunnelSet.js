// Inside the beam pipe: proton bunches (stylised as glowing red spheres, since
// real protons are invisible) racing along; wall markers streak past to sell speed.
import * as THREE from 'three';
import { glowMaterial } from '../core/materials.js';
import { mulberry32 } from '../core/util.js';

export class TunnelSet {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x020306);
    s.fog = new THREE.FogExp2(0x020306, 0.018);
    s.add(new THREE.HemisphereLight(0x88aadd, 0x223344, 1.4));
    this.length = 400;
    // pipe interior
    const c = document.createElement('canvas'); c.width = 64; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#2b3138'; g.fillRect(0, 0, 64, 512);
    g.fillStyle = '#a9b4bf'; g.fillRect(0, 0, 64, 18);
    g.fillStyle = '#56606a'; g.fillRect(0, 250, 64, 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(16, 80);
    this.pipeMat = new THREE.MeshStandardMaterial({ map: t, side: THREE.BackSide, roughness: 0.35, metalness: 0.6, color: 0x9fb2c8, emissive: 0x0c1622 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, this.length, 48, 1, true).rotateX(Math.PI / 2), this.pipeMat);
    pipe.position.z = -this.length / 2 + 20;
    s.add(pipe);
    this.pipeTex = t;
    // light rings along the pipe
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1.36, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.8, 4.4) }), 60);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) { m4.makeTranslation(0, 0, 20 - i * 6); rings.setMatrixAt(i, m4); }
    s.add(rings);
    // protons: bunches of glowing spheres with "+" charge marks (sprites would be flat; use small crosses)
    const r = mulberry32(3);
    this.protons = [];
    const N = 70;
    this.protonMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: new THREE.Color(1.6, 0.18, 0.08), roughness: 0.35 }), N);
    this.trailMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.0, 1, 10, 1, true).rotateX(-Math.PI / 2), glowMaterial(new THREE.Color(1.6, 0.5, 0.25), 0.5), N);
    for (let i = 0; i < N; i++) {
      const bunch = Math.floor(i / 10);
      this.protons.push({ x: (r() - 0.5) * 0.7, y: (r() - 0.5) * 0.7, z: -bunch * 7 - r() * 1.5, wob: r() * 6 });
    }
    s.add(this.protonMesh, this.trailMesh);
    this.protonMesh.frustumCulled = this.trailMesh.frustumCulled = false;
    this.light = new THREE.PointLight(0xff8866, 6, 6, 1.5);
    s.add(this.light);
  }

  /** travel: protons' distance along -Z; trail: streak length. */
  update(t, { travel = 0, trail = 1 } = {}) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    this.protons.forEach((pr, i) => {
      p.set(pr.x + Math.sin(t * 3 + pr.wob) * 0.03, pr.y + Math.cos(t * 2.5 + pr.wob) * 0.03, pr.z - travel);
      m4.compose(p, q, sc.set(1, 1, 1));
      this.protonMesh.setMatrixAt(i, m4);
      const len = 0.4 + trail * 3.2;
      m4.compose(p.clone().add(new THREE.Vector3(0, 0, len / 2)), q, sc.set(1, 1, len));
      this.trailMesh.setMatrixAt(i, m4);
    });
    this.protonMesh.instanceMatrix.needsUpdate = true;
    this.trailMesh.instanceMatrix.needsUpdate = true;
    this.light.position.set(0, 0, -travel - 2);
  }
}
