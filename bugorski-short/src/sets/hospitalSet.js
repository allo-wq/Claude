// Moscow clinic room (stylised): Bugorski in bed with the swollen left face,
// a doctor with a clipboard, a tear-off calendar starting at 13 July 1978 and an
// ECG monitor that keeps beating ("He didn't die").
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from '../core/materials.js';
import { canvas } from '../core/textures.js';
import { Person } from '../assets/person.js';
import { Calendar, Monitor } from '../assets/displays.js';
import { clamp, smooth } from '../core/util.js';

const MATTRESS_TOP = 0.62;

export class HospitalSet {
  constructor(pmrem) {
    const M = materials();
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x1a2224);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.4;
    s.add(new THREE.HemisphereLight(0xf2f6ff, 0x3a3a30, 0.9));
    const win = new THREE.DirectionalLight(0xfff3dd, 2.6);
    win.position.set(-6, 5, 2.5);
    win.target.position.set(0, 0.6, -0.8);
    win.castShadow = true;
    win.shadow.mapSize.set(2048, 2048);
    Object.assign(win.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    win.shadow.bias = -0.0004; win.shadow.normalBias = 0.02;
    s.add(win, win.target);
    const ceiling = new THREE.PointLight(0xfff0d8, 8, 8, 1.5);
    ceiling.position.set(0.6, 2.9, 0);
    s.add(ceiling);

    // room
    const c = canvas(256, 256), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#cfcab9' : '#b3ad9c'; g.fillRect(i * 32, j * 32, 32, 32); }
    const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    const lower = new THREE.MeshStandardMaterial({ color: 0x8fb3a2, roughness: 0.8 });
    const upper = new THREE.MeshStandardMaterial({ color: 0xe9e4d4, roughness: 0.9 });
    const wall = (w, h, x, y, z, ry, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; s.add(m); };
    wall(6, 1.3, 0, 0.65, -2.4, 0, lower); wall(6, 1.9, 0, 2.25, -2.4, 0, upper);
    wall(6, 1.3, 2.6, 0.65, 0, -Math.PI / 2, lower); wall(6, 1.9, 2.6, 2.25, 0, -Math.PI / 2, upper);
    // left wall with window
    wall(6, 1.3, -2.6, 0.65, 0, Math.PI / 2, lower);
    wall(2.0, 1.9, -2.6, 2.25, -1.9, Math.PI / 2, upper); wall(2.0, 1.9, -2.6, 2.25, 1.9, Math.PI / 2, upper);
    wall(2.0, 0.4, -2.6, 3.0, 0, Math.PI / 2, upper);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) }));
    glow.position.set(-2.62, 2.05, 0); glow.rotation.y = Math.PI / 2;
    s.add(glow);
    const frame = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
    for (const [w, h, y, z] of [[2.1, 0.08, 2.8, 0], [2.1, 0.08, 1.3, 0], [0.08, 1.5, 2.05, 0], [0.08, 1.5, 2.05, 1.0], [0.08, 1.5, 2.05, -1.0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, w === 2.1 ? 2.1 : 0.08), frame);
      b.position.set(-2.58, y, z); s.add(b);
    }

    // bed
    const metal = M.metal;
    const bedGroup = new THREE.Group();
    s.add(bedGroup);
    const mattress = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.2, 2.1, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.9 }));
    mattress.position.set(0, MATTRESS_TOP - 0.1, -0.9);
    mattress.castShadow = mattress.receiveShadow = true;
    bedGroup.add(mattress);
    const frameBox = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal); b.position.set(x, y, z); b.castShadow = true; bedGroup.add(b); };
    frameBox(1.06, 0.06, 2.16, 0, MATTRESS_TOP - 0.23, -0.9);
    for (const x of [-0.5, 0.5]) for (const z of [-1.95, 0.15]) frameBox(0.05, z < 0 ? 1.1 : 0.85, 0.05, x, (z < 0 ? 1.1 : 0.85) / 2, z);
    frameBox(1.05, 0.05, 0.05, 0, 1.08, -1.95); frameBox(1.05, 0.05, 0.05, 0, 0.84, 0.15);
    frameBox(1.05, 0.04, 0.04, 0, 0.75, -1.95);
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.13, 0.4, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    pillow.position.set(0, MATTRESS_TOP + 0.05, -1.68);
    pillow.castShadow = pillow.receiveShadow = true;
    bedGroup.add(pillow);
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.26, 1.3, 4, 0.1), new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.95 }));
    blanket.position.set(0, MATTRESS_TOP + 0.08, -0.12);
    blanket.castShadow = blanket.receiveShadow = true;
    bedGroup.add(blanket);
    const fold = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.12, 0.2, 3, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.9 }));
    fold.position.set(0, MATTRESS_TOP + 0.19, -0.75);
    bedGroup.add(fold);

    // patient (hospital pyjamas)
    const pj = new THREE.MeshStandardMaterial({ color: 0xb9cbe0, roughness: 0.9 });
    this.patient = new Person({ coat: pj, trousers: pj, shirt: pj, tie: false });
    s.add(this.patient.root);

    // doctor
    this.doctor = new Person({ hair: M.grayHair, glasses: true, clipboard: true, skin: 0xd9a585 });
    this.doctor.root.position.set(0.82, 0, -0.6);
    this.doctor.root.rotation.y = -Math.PI / 2 - 0.25;
    s.add(this.doctor.root);

    // calendar
    this.calendar = new Calendar();
    const cal = new THREE.Group();
    cal.position.set(0.5, 1.8, -2.38);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.02), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }));
    cal.add(board);
    const pageMat = new THREE.MeshStandardMaterial({ map: this.calendar.page.t, roughness: 0.85 });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.6), pageMat);
    page.position.set(0, -0.03, 0.012);
    cal.add(page);
    this.flipHinge = new THREE.Group();
    this.flipHinge.position.set(0, 0.27, 0.016);
    // front shows the date; the back is plain paper so text never appears mirrored mid-flip
    this.flipMat = new THREE.MeshStandardMaterial({ map: this.calendar.flip.t, roughness: 0.85, transparent: true });
    this.flipBackMat = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.9, side: THREE.BackSide, transparent: true });
    const flipGeo = new THREE.PlaneGeometry(0.48, 0.6).translate(0, -0.3, 0);
    this.flipHinge.add(new THREE.Mesh(flipGeo, this.flipMat), new THREE.Mesh(flipGeo, this.flipBackMat));
    cal.add(this.flipHinge);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), M.darkMetal);
    ring.position.set(0, 0.29, 0.02);
    cal.add(ring);
    s.add(cal);
    this.calendarGroup = cal;

    // ECG monitor on a stand
    this.monitor = new Monitor();
    const mon = new THREE.Group();
    mon.position.set(-0.95, 0, -1.55);
    mon.rotation.y = 0.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 10), metal);
    pole.position.y = 0.65; mon.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), M.darkMetal);
    foot.position.y = 0.015; mon.add(foot);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.36, 0.2, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.6 }));
    body.position.y = 1.45; body.castShadow = true; mon.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.27), new THREE.MeshBasicMaterial({ map: this.monitor.t }));
    screen.position.set(0, 1.46, 0.101); mon.add(screen);
    s.add(mon);
    this.monitorGroup = mon;
  }

  /** sit: 0 lying → 1 sitting up. day: calendar day offset (fraction = flip progress). */
  update(t, { sit = 0, day = 0, shake = 0, eyesOpen = 0, bpm = 72 } = {}) {
    const p = this.patient;
    const e = smooth(clamp(sit));
    p.root.rotation.set(-Math.PI / 2, 0, 0);
    p.root.position.set(0, MATTRESS_TOP + 0.11, 0.22);
    p.pose({
      spine: [1.05 * e, 0, 0],
      neck: [0.38 * (1 - e) + 0.05 * e, 0, 0],
      hipL: [0, 0, 0.04], hipR: [0, 0, -0.04],
      shoulderL: [0.0 - 0.5 * e, 0, 0.16], shoulderR: [-0.5 * e, 0, -0.16],
      elbowL: [-0.15 - 0.6 * e, 0, 0], elbowR: [-0.15 - 0.6 * e, 0, 0],
      ankleL: [0.5, 0, 0], ankleR: [0.5, 0, 0],
    });
    p.head.set({ swell: 0.85, burn: 0.75, lidL: 1, lidR: 1 - eyesOpen, redness: 0.5 });

    const d = this.doctor;
    d.pose({ neck: [0.12, Math.sin(t * 6.5) * 0.28 * shake, 0] });
    d.root.updateMatrixWorld(true);
    const L = new THREE.Vector3(0.11, 1.13, 0.3).applyMatrix4(d.root.matrixWorld);
    const R = new THREE.Vector3(-0.11, 1.13, 0.3).applyMatrix4(d.root.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(d.root.matrixWorld);
    const side = new THREE.Vector3(1, 0, 0).transformDirection(d.root.matrixWorld);
    d.reach('L', L, side.clone().add(fwd.clone().multiplyScalar(-0.5)).add(new THREE.Vector3(0, -1, 0)));
    d.reach('R', R, side.clone().negate().add(fwd.clone().multiplyScalar(-0.5)).add(new THREE.Vector3(0, -1, 0)));
    d.holdClipboard(0.55);

    const flip = this.calendar.draw(day);
    const f = smooth(clamp(flip / 0.85));
    this.flipHinge.rotation.x = -f * Math.PI * 0.95;
    this.flipMat.opacity = this.flipBackMat.opacity = 1 - smooth(clamp((flip - 0.7) / 0.3));
    this.monitor.draw(t, bpm);
  }
}
