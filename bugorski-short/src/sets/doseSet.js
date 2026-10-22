// Dose comparison: one trefoil block = a lethal whole-body dose (~5 Gy);
// Bugorski's beam dose was ~2,000 Gy → a wall of 400 blocks.
import * as THREE from 'three';
import { tex, trefoilTexture } from '../core/textures.js';
import { clamp, smooth, mulberry32, ease } from '../core/util.js';

export class DoseSet {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x121824);
    s.fog = new THREE.Fog(0x121824, 18, 45);
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 9, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 14, bottom: -4, near: 1, far: 40 });
    s.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.55, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    const t = tex(trefoilTexture());
    this.mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, emissive: new THREE.Color(0.18, 0.13, 0.0), emissiveMap: t });
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.hero = new THREE.Mesh(geo, this.mat);
    this.hero.castShadow = true;
    s.add(this.hero);
    this.cols = 20; this.rows = 20;
    this.wall = new THREE.InstancedMesh(geo, this.mat, this.cols * this.rows - 1);
    this.wall.castShadow = true; this.wall.receiveShadow = true;
    this.wall.frustumCulled = false;
    s.add(this.wall);
    const r = mulberry32(400);
    this.cells = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (row === 0 && col === this.cols / 2) continue; // hero block's slot
        this.cells.push({ x: (col - this.cols / 2 + 0.5) * 0.54, y: 0.25 + row * 0.54, delay: row / this.rows * 0.8 + r() * 0.2 });
      }
    }
    this.heroSlot = new THREE.Vector3((this.cols / 2 - this.cols / 2 + 0.5) * 0.54, 0.25, 0);
  }

  /** hero: 0..1 entrance of the first block; fill: 0..1 the wall builds up. */
  update(t, { hero = 1, fill = 0 } = {}) {
    const h = ease.outBack(clamp(hero));
    const start = new THREE.Vector3(0, 1.4, 4.2);
    // hero block floats in front, then drops into its slot as the wall forms
    const settle = smooth(clamp(fill * 3));
    const p = start.clone().lerp(this.heroSlot, settle);
    this.hero.position.copy(p);
    this.hero.position.y += (1 - settle) * Math.sin(t * 2) * 0.05;
    this.hero.rotation.set(0, (1 - settle) * (t * 0.8 + 0.6), 0);
    this.hero.scale.setScalar(Math.max(0.0001, h) * (1 + (1 - settle) * 0.6));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    this.cells.forEach((c, i) => {
      const k = clamp((fill - c.delay * 0.85) / 0.15);
      const e = ease.outBack(k);
      pos.set(c.x, c.y + (1 - smooth(k)) * 1.5, 0);
      sc.setScalar(Math.max(0.0001, e));
      m4.compose(pos, q, sc);
      this.wall.setMatrixAt(i, m4);
    });
    this.wall.instanceMatrix.needsUpdate = true;
  }
}
