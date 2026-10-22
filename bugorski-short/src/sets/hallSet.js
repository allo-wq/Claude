// Experimental hall at the U-70 beam line (stylised reconstruction).
// The beam travels toward -X. Bugorski leans into the open gap between two pieces
// of apparatus with his head turned to look down-stream, so the beam enters the
// back of his skull and exits beside his nose. The beam height is DERIVED from
// that pose at build time, which guarantees the alignment in every shot.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { materials } from '../core/materials.js';
import { tex, chalkboardTexture, labelTexture } from '../core/textures.js';
import { Person } from '../assets/person.js';
import { Beam } from '../assets/beam.js';
import { dipole, quadrupole, apparatus, beacon, interlockPanel, operatorConsole, box, cylX } from '../assets/machines.js';
import { Scope, gaugeTexture } from '../assets/displays.js';
import { clamp, smooth, lerp, mulberry32, quatFromFrames } from '../core/util.js';

export const GAP_X = 0;
const GAP_HALF = 0.46;       // half-width of the open gap
const BOX_LEN = 1.1, BOX_H = 0.6, BOX_D = 0.5;
const BODY_YAW = -0.5;
const HEAD_UP = new THREE.Vector3(0, 1, 0.45).normalize();

export class HallSet {
  constructor(pmrem) {
    const M = materials();
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0b0e12);
    s.fog = new THREE.Fog(0x0b0e12, 14, 42);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;

    // --- character & derived beam height
    this.person = new Person();
    s.add(this.person.root);
    this._solveLean();

    // --- lights
    s.add(new THREE.HemisphereLight(0x9fb4c8, 0x1a1612, 0.55));
    const key = (this.key = new THREE.DirectionalLight(0xfff1dc, 2.6));
    key.position.set(4, 9, 6);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.3);
    rim.position.set(-6, 5, -6);
    s.add(rim);
    const fill = new THREE.PointLight(0xffd2a0, 6, 12, 1.6);
    fill.position.set(-2.5, 3.2, 3.5);
    s.add(fill);

    // --- floor, walls
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), M.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.12), M.hazard);
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.003, 1.15);
    stripe.receiveShadow = true;
    s.add(stripe);
    const stripe2 = stripe.clone(); stripe2.position.z = -1.25; s.add(stripe2);
    this._shieldWall(-4.6);
    this._shieldWall(8.6, true);

    // chalkboard on the back wall
    const cb = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: tex(chalkboardTexture()), roughness: 0.9 }));
    cb.position.set(4.6, 1.75, -4.08);
    s.add(cb);
    s.add(box(2.75, 1.45, 0.06, M.wood, [4.6, 1.75, -4.12]));
    this.chalkboard = cb;

    // --- beam line (pipe along X at BEAM_Y, z = 0)
    const Y = this.BEAM_Y;
    const glassL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 24, 1, true).rotateZ(Math.PI / 2), M.glass);
    const up = glassL.clone(); up.scale.x = 14; up.position.set(GAP_X + GAP_HALF + BOX_LEN + 7, Y, 0);
    const dn = glassL.clone(); dn.scale.x = 14; dn.position.set(GAP_X - GAP_HALF - BOX_LEN - 7, Y, 0);
    s.add(up, dn);
    for (let x = -14; x <= 14; x += 0.9) {
      if (Math.abs(x - GAP_X) < GAP_HALF + BOX_LEN + 0.1) continue;
      s.add(cylX(0.09, 0.04, M.metal, [x, Y, 0], 20));
    }
    // apparatus either side of the gap
    this.upBox = apparatus(BOX_LEN, BOX_H, BOX_D);
    this.upBox.position.set(GAP_X + GAP_HALF + BOX_LEN / 2, Y, 0);
    this.upBox.userData.flange.position.x = -BOX_LEN / 2 - 0.03;
    this.dnBox = apparatus(BOX_LEN, BOX_H, BOX_D);
    this.dnBox.position.set(GAP_X - GAP_HALF - BOX_LEN / 2, Y, 0);
    this.dnBox.userData.flange.position.x = BOX_LEN / 2 + 0.03;
    s.add(this.upBox, this.dnBox);
    // stands under the line
    const stand = (x, w = 0.5) => {
      s.add(box(0.12, Y - BOX_H / 2, 0.12, M.darkMetal, [x, (Y - BOX_H / 2) / 2, 0]));
      s.add(box(w, 0.05, 0.5, M.darkMetal, [x, 0.025, 0]));
    };
    stand(this.upBox.position.x); stand(this.dnBox.position.x);
    for (const x of [-9.5, -4.7, 4.7, 9.5, 12.5, -12.5]) stand(x, 0.4);
    // magnets
    const q1 = quadrupole(); q1.position.set(GAP_X + 3.1, Y, 0); s.add(q1);
    const q2 = quadrupole(); q2.position.set(GAP_X - 3.1, Y, 0); s.add(q2);
    const d1 = dipole(1.8, 'blue'); d1.position.set(GAP_X + 6.4, Y, 0); s.add(d1);
    const d2 = dipole(1.8, 'blue'); d2.position.set(GAP_X - 6.4, Y, 0); s.add(d2);
    for (const m of [q1, q2]) s.add(box(0.5, Y - 0.48, 0.5, M.darkMetal, [m.position.x, (Y - 0.48) / 2, 0]));
    for (const m of [d1, d2]) s.add(box(1.4, Y - 0.5, 0.7, M.darkMetal, [m.position.x, (Y - 0.5) / 2, 0]));
    // upstream shield wall the beam emerges from, downstream beam dump
    s.add(box(1.4, 3.2, 3.4, M.concrete, [15.2, 1.6, 0]));
    s.add(box(1.6, 2.2, 2.2, M.concreteDark, [-15.0, 1.1, 0]));

    // beam (travels -X): local +X → world -X
    this.beam = new Beam({ radius: 0.011, glow: 4, bunches: 40, bunchLen: 0.28, color: new THREE.Color(1.0, 2.3, 3.2) });
    this.beam.bunchMat.color.setRGB(1.2, 2.1, 2.8);
    this.beam.group.rotation.y = Math.PI;
    this.beam.group.position.set(0, Y, 0);
    s.add(this.beam.group);
    // the single pulse that hit him (2G): a bright comet drawn over the apparatus glass
    this.pulse = new THREE.Group();
    const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.8, 3.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 4, 12).rotateZ(Math.PI / 2), pm);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.8, 16, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 3), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    tail.position.x = 1.0;
    this.pulse.add(core, tail);
    this.pulse.traverse((m) => { if (m.isMesh) { m.renderOrder = 12; m.frustumCulled = false; } });
    this.pulse.position.y = Y;
    this.pulse.visible = false;
    s.add(this.pulse);

    // beacon, interlock, console
    this.beacon = beacon();
    this.beacon.position.set(GAP_X + 1.9, 0, -1.6);
    s.add(this.beacon);
    this.interlock = interlockPanel();
    this.interlock.position.set(-2.6, 1.7, -4.1);
    s.add(this.interlock);
    this.scope = new Scope();
    this.console = operatorConsole(this.scope.t, gaugeTexture());
    this.console.position.set(-4.0, 0, 2.9);
    s.add(this.console);
    // label on the beam line apparatus
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: tex(labelTexture('U-70 SYNCHROTRON', { w: 512, h: 120, bg: '#e8e2cf', fg: '#141414', size: 46 })), roughness: 0.6 }));
    lab.position.set(this.upBox.position.x + 0.15, Y - 0.12, BOX_D / 2 + 0.003);
    s.add(lab);

    // ceiling lamps (seen in crane shots)
    const lampGeo = new THREE.BoxGeometry(1.6, 0.08, 0.35);
    for (let i = -3; i <= 3; i++) {
      const l = new THREE.Mesh(lampGeo, M.bulb);
      l.position.set(i * 4.2, 6.2, 0.8);
      s.add(l);
      s.add(box(0.02, 1.4, 0.02, M.darkMetal, [i * 4.2, 6.9, 0.8]));
    }
  }

  _shieldWall(z, facingBack = false) {
    const M = materials();
    const r = mulberry32(5);
    const w = 1.6, h = 0.8, d = 1.0;
    const cols = 22, rows = 7;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(w - 0.03, h - 0.03, d), M.concrete, cols * rows);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col - cols / 2) * w + (row % 2 ? w / 2 : 0);
        m4.makeTranslation(x, h / 2 + row * h, z + (facingBack ? d / 2 : -d / 2) + (r() - 0.5) * 0.05);
        inst.setMatrixAt(i, m4);
        const v = 0.85 + r() * 0.25;
        inst.setColorAt(i, c.setRGB(v, v, v * 0.97));
        i++;
      }
    }
    inst.receiveShadow = true;
    this.scene.add(inst);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(cols * w, 0.2), M.hazard);
    hz.position.set(0, 0.4, z + (facingBack ? -0.004 : 0.004));
    if (facingBack) hz.rotation.y = Math.PI;
    this.scene.add(hz);
  }

  /** Solve the final lean pose once: find root offset + beam height that thread the beam through the head. */
  _solveLean() {
    const p = this.person;
    p.root.position.set(0, 0, 0);
    p.root.rotation.y = BODY_YAW;
    this.leanPose(1, false);
    const e = p.headPoint(p.head.entry);
    const c = p.headPoint(new THREE.Vector3());
    this.BEAM_Y = e.y;
    this.leanRoot = new THREE.Vector3(GAP_X - c.x, 0, -e.z);
  }

  /** k: 0 standing → 1 leaning with head in the beam. */
  leanPose(k, placeRoot = true) {
    const p = this.person;
    if (placeRoot) { p.root.position.copy(this.leanRoot); p.root.rotation.y = BODY_YAW; }
    const e = smooth(clamp(k));
    p.pose({
      hipsY: 0.95 - 0.02 * e,
      spine: [0.92 * e, 0.12 * e, 0],
      neck: [-0.45 * e, -0.35 * e, 0],
      hipL: [-0.18 * e, 0, 0], hipR: [-0.18 * e, 0, 0],
      kneeL: [0.32 * e, 0, 0], kneeR: [0.32 * e, 0, 0],
      ankleL: [-0.14 * e, 0, 0], ankleR: [-0.14 * e, 0, 0],
      shoulderL: [0, 0, 0.08], shoulderR: [0, 0, -0.08],
    });
    // head: blend from natural to beam-aligned (local beam dir → world -X)
    const hp = p.j.headPivot;
    const target = new THREE.Quaternion();
    {
      hp.parent.updateWorldMatrix(true, false);
      const qWorld = quatFromFrames(p.head.beamDir, new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), HEAD_UP);
      const pq = new THREE.Quaternion(); hp.parent.getWorldQuaternion(pq);
      target.copy(pq.invert().multiply(qWorld));
    }
    hp.quaternion.identity().slerp(target, e);
    p.root.updateMatrixWorld(true);
    // hands brace on the apparatus edges once leaning
    if (e > 0) {
      const Y = this.BEAM_Y ?? 1.4;
      // palms braced against the back faces of the two apparatus boxes
      const lt = new THREE.Vector3(GAP_X + GAP_HALF + 0.16, Y - 0.06, -BOX_D / 2 - 0.03);
      const rt = new THREE.Vector3(GAP_X - GAP_HALF - 0.16, Y - 0.06, -BOX_D / 2 - 0.03);
      const restL = new THREE.Vector3(), restR = new THREE.Vector3();
      p.j.handL.getWorldPosition(restL); p.j.handR.getWorldPosition(restR);
      p.reach('L', restL.lerp(lt, e), new THREE.Vector3(0.4, -1, -0.4));
      p.reach('R', restR.lerp(rt, e), new THREE.Vector3(-0.4, -1, -0.4));
    }
  }

  /** Shared per-frame animation: beam, beacon, apparatus LEDs, scope. */
  update(t, o = {}) {
    const { beamOn = 1, beamHead = Infinity, beaconOn = 1, glitch = 0, beamSpeed = 14, interlock = [3, false, 0] } = o;
    this.setInterlock(...interlock); // always set → no state carried between frames
    // beam enters from the upstream wall (x = 14.5) and travels -X → local coordinates
    const from = -14.5, to = 14.5;
    this.beam.update({ t, from, to, head: beamHead, speed: beamSpeed, spacing: 0.9, intensity: beamOn });
    this.pulse.visible = o.pulseX != null;
    if (this.pulse.visible) this.pulse.position.x = o.pulseX;
    const b = this.beacon.userData;
    b.rot.rotation.y = t * 7;
    b.light.intensity = beaconOn * 60;
    b.dome.material.emissive.setRGB(1.2 * beaconOn + 0.1, 0.08, 0.04);
    b.signMat.emissiveIntensity = beaconOn ? 0.8 + 0.6 * (Math.sin(t * 10) > 0 ? 1 : 0) : 0.05;
    const M = materials();
    [...this.upBox.userData.leds, ...this.dnBox.userData.leds].forEach((l, i) => {
      const on = glitch > 0 ? Math.sin(t * 23 + i * 2.1) > 0.3 : Math.sin(t * 3 + i) > -0.6;
      l.material = on ? (glitch > 0 && i % 3 === 0 ? M.lampAmber : M.lampGreen) : M.lampOff;
    });
    this.scope.draw(t, glitch);
    const cu = this.console.userData;
    cu.needlePivot.rotation.z = lerp(0.6, -0.4, 0.5) + (glitch > 0 ? Math.sin(t * 31) * 0.6 * glitch + Math.sin(t * 13.7) * 0.4 * glitch : Math.sin(t * 0.8) * 0.05);
    cu.fault.material.emissiveIntensity = glitch > 0 ? (Math.sin(t * 18) > 0 ? 1.2 : 0.05) : 0.05;
  }

  /** Interlock lamps: n lamps still alive (0..3), cross visibility 0..1. */
  setInterlock(alive, flicker, cross) {
    const u = this.interlock.userData;
    u.lamps.forEach((l, i) => {
      const on = i < Math.floor(alive) || (i === Math.floor(alive) && flicker);
      l.material.emissive.setRGB(on ? 0.6 : 0, on ? 4.5 : 0.02, on ? 0.9 : 0);
    });
    u.cross.visible = cross > 0.01;
    u.cross.scale.setScalar(0.4 + 0.6 * smooth(clamp(cross)));
  }
}
