// "He finished his PhD": dissertation on a desk receives an approval stamp.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from '../core/materials.js';
import { canvas, FONT, FONT_BOLD } from '../core/textures.js';
import { clamp, smooth, ease } from '../core/util.js';

export class DeskSet {
  constructor(pmrem) {
    const M = materials();
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x120e0b);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.3;
    s.add(new THREE.HemisphereLight(0xffeedd, 0x201810, 0.9));
    const lampLight = new THREE.SpotLight(0xffd9a0, 9, 6, 0.75, 0.5, 1.2);
    lampLight.position.set(-0.55, 0.85, -0.25);
    lampLight.target.position.set(0.05, 0, 0.05);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(1024, 1024);
    lampLight.shadow.bias = -0.0005;
    s.add(lampLight, lampLight.target);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.8);
    fill.position.set(2, 3, 3);
    s.add(fill);

    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.3), M.wood);
    top.position.y = -0.03; top.receiveShadow = true;
    s.add(top);
    // lamp
    const lamp = new THREE.Group();
    lamp.position.set(-0.75, 0, -0.35);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.03, 24), M.darkMetal); base.position.y = 0.015;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 8), M.darkMetal); arm.position.set(0.05, 0.4, 0.02); arm.rotation.z = -0.15;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(0.2, 0.83, 0.1); shade.rotation.z = 0.6;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.bulb); bulb.position.set(0.22, 0.78, 0.1);
    lamp.add(base, arm, shade, bulb);
    lamp.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    s.add(lamp);
    // loose papers
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.95 });
    for (const [x, z, r] of [[0.55, 0.25, 0.3], [0.6, 0.2, -0.1], [-0.45, 0.35, 0.5]]) {
      const pp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, 0.42), paperMat);
      pp.position.set(x, 0.002, z); pp.rotation.y = r; pp.receiveShadow = true; s.add(pp);
    }
    // dissertation book
    const cov = canvas(512, 700), g = cov.getContext('2d');
    g.fillStyle = '#7a1c1c'; g.fillRect(0, 0, 512, 700);
    g.strokeStyle = '#d9b55a'; g.lineWidth = 8; g.strokeRect(28, 28, 456, 644);
    g.fillStyle = '#e9cf7a'; g.textAlign = 'center';
    g.font = `900 54px ${FONT}`; g.fillText('ДИССЕРТАЦИЯ', 256, 150);
    g.font = `700 34px ${FONT_BOLD}`; g.fillText('DISSERTATION', 256, 205);
    g.font = `700 30px ${FONT_BOLD}`; g.fillText('HIGH-ENERGY PHYSICS', 256, 270);
    g.font = `700 34px ${FONT_BOLD}`; g.fillText('A. P. BUGORSKI', 256, 600);
    const ct = new THREE.CanvasTexture(cov); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 8;
    const coverMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 });
    const pages = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0x6c1818, roughness: 0.6 });
    this.book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.58), [pages, red, coverMat, red, pages, pages]);
    this.book.castShadow = true; this.book.receiveShadow = true;
    s.add(this.book);
    // the cover texture is on +Y face (index 2); orient so text reads from the camera (front = +Z)
    // stamp mark (decal above the cover)
    const sc = canvas(512, 512), sg = sc.getContext('2d');
    sg.strokeStyle = 'rgba(200,20,30,0.95)'; sg.lineWidth = 26;
    sg.beginPath(); sg.arc(256, 256, 215, 0, Math.PI * 2); sg.stroke();
    sg.lineWidth = 8; sg.beginPath(); sg.arc(256, 256, 180, 0, Math.PI * 2); sg.stroke();
    sg.fillStyle = 'rgba(200,20,30,0.95)'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.font = `900 170px ${FONT}`; sg.fillText('PhD', 256, 225);
    sg.lineWidth = 26; sg.lineCap = 'round'; sg.lineJoin = 'round';
    sg.beginPath(); sg.moveTo(180, 340); sg.lineTo(235, 390); sg.lineTo(340, 300); sg.stroke();
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: st, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.mark.rotation.x = -Math.PI / 2;
    s.add(this.mark);
    // stamp
    this.stamp = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.5 }));
    handle.position.y = 0.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.5 }));
    knob.position.y = 0.33;
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.08, 0.32, 2, 0.015), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.6 }));
    block.position.y = 0.06;
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: 0xb01822, roughness: 0.8 }));
    rubber.position.y = 0.01;
    this.stamp.add(handle, knob, block, rubber);
    this.stamp.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    s.add(this.stamp);
  }

  /** drop: book lands 0..1; press: stamp cycle 0..1 (hit at 0.5). */
  update(t, { drop = 1, press = 0 } = {}) {
    const d = clamp(drop);
    const fall = 1 - ease.outBack(d);
    this.book.position.set(0.02, 0.035 + Math.max(0, fall) * 0.38, 0.05);
    this.book.rotation.set(Math.max(0, fall) * 0.5, -0.12 + Math.max(0, fall) * 0.6, 0);
    const p = clamp(press);
    let h;
    if (p < 0.5) h = 0.75 * (1 - ease.in(p / 0.5));
    else h = 0.75 * smooth(clamp((p - 0.62) / 0.38));
    this.stamp.visible = p > 0 && p < 0.999;
    this.stamp.position.set(0.04, 0.07 + h + (p >= 0.5 && p < 0.6 ? -0.006 : 0), 0.06);
    this.stamp.rotation.set(0, -0.12, 0);
    const squash = p > 0.48 && p < 0.6 ? 0.9 : 1;
    this.stamp.scale.set(1, squash, 1);
    this.mark.visible = p >= 0.5;
    this.mark.position.set(0.04, 0.0715, 0.1);
    this.mark.rotation.set(-Math.PI / 2, 0, -0.12);
    this.mark.material.opacity = p >= 0.5 ? 0.95 : 0;
  }
}
