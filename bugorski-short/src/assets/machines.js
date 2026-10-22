// Accelerator hardware built from primitives: magnets, apparatus, supports,
// beacon, interlock panel, operator console. Dimensions in metres.
import * as THREE from 'three';
import { materials } from '../core/materials.js';
import { labelTexture, tex, FONT } from '../core/textures.js';

const box = (w, h, d, mat, pos = [0, 0, 0]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(...pos); m.castShadow = true; m.receiveShadow = true;
  return m;
};
const cylX = (r, len, mat, pos = [0, 0, 0], seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2), mat);
  m.position.set(...pos); m.castShadow = true; m.receiveShadow = true;
  return m;
};
export { box, cylX };

/** Dipole bending magnet (C-shaped yoke with copper coils), centred on the beam axis. */
export function dipole(len = 1.6, color = 'blue') {
  const M = materials();
  const yoke = color === 'blue' ? M.magnetBlue : M.magnetRed;
  const g = new THREE.Group();
  g.add(box(len, 0.28, 0.9, yoke, [0, 0.36, 0]));
  g.add(box(len, 0.28, 0.9, yoke, [0, -0.36, 0]));
  g.add(box(len, 1.0, 0.24, yoke, [0, 0, -0.33]));
  for (const y of [0.17, -0.17]) {
    const coil = box(len + 0.16, 0.1, 0.62, M.copper, [0, y, 0.02]);
    g.add(coil);
  }
  g.add(box(len * 0.95, 0.04, 0.5, M.darkMetal, [0, 0.505, 0]));
  return g;
}

/** Quadrupole focusing magnet: four poles around the pipe in a square yoke. */
export function quadrupole(len = 0.7) {
  const M = materials();
  const g = new THREE.Group();
  const s = 0.42;
  g.add(box(len, 0.12, s * 2, M.magnetRed, [0, s, 0]));
  g.add(box(len, 0.12, s * 2, M.magnetRed, [0, -s, 0]));
  g.add(box(len, s * 2, 0.12, M.magnetRed, [0, 0, s]));
  g.add(box(len, s * 2, 0.12, M.magnetRed, [0, 0, -s]));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const p = box(len * 0.92, 0.16, 0.16, M.copper, [0, Math.sin(a) * 0.24, Math.cos(a) * 0.24]);
    p.rotation.x = -a;
    g.add(p);
  }
  return g;
}

/** Equipment housing the beam passes through, with indicator LEDs; open face toward the gap. */
export function apparatus(len, h = 0.62, d = 0.62) {
  const M = materials();
  const g = new THREE.Group();
  // glass inspection window on top so the beam inside stays visible
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, d), [M.panel, M.panel, M.glass, M.panel, M.panel, M.panel]);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) g.add(box(len + 0.01, 0.05, 0.05, M.darkMetal, [0, h / 2 + 0.006, z]));
  for (const x of [-len / 2 + 0.02, len / 2 - 0.02]) g.add(box(0.05, 0.05, d + 0.01, M.darkMetal, [x, h / 2 + 0.006, 0]));
  const inner = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.02, d * 0.98), M.panelDark);
  inner.position.y = -h / 2 + 0.03;
  g.add(inner);
  for (const x of [-0.25, 0.1, 0.4].map((f) => f * len)) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20).rotateY(Math.PI / 2), M.copper);
    ring.position.x = x; g.add(ring);
  }
  const flange = cylX(0.13, 0.06, M.metal, [0, 0, 0], 24);
  g.userData.flange = flange;
  g.add(flange);
  const leds = [];
  for (let i = 0; i < 4; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.lampGreen);
    led.position.set(-len / 2 + 0.12 + i * 0.08, h / 2 - 0.15, d / 2 + 0.005);
    g.add(led); leds.push(led);
  }
  g.userData.leds = leds;
  return g;
}

/** Rotating warning beacon with a "BEAM ON" sign. */
export function beacon() {
  const M = materials();
  const g = new THREE.Group();
  g.add(box(0.08, 2.2, 0.08, M.darkMetal, [0, 1.1, 0]));
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 20), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: new THREE.Color(1.2, 0.08, 0.04), roughness: 0.3, transparent: true, opacity: 0.92 }));
  dome.position.y = 2.33;
  g.add(dome);
  const rot = new THREE.Group(); rot.position.y = 2.33; g.add(rot);
  const reflector = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 1.0, 0.5), side: THREE.DoubleSide }));
  reflector.position.x = 0.05;
  rot.add(reflector);
  const light = new THREE.SpotLight(0xff3020, 0, 9, 0.5, 0.6, 1.2);
  light.position.set(0, 0, 0); light.target.position.set(4, -0.6, 0);
  rot.add(light, light.target);
  const signTex = tex(labelTexture('BEAM ON', { w: 512, h: 160, bg: '#120808', fg: '#ff4433', size: 96, border: '#ff4433' }), { repeat: [1, 1] });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color(1, 1, 1), roughness: 0.6 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.03), [M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal, signMat, M.darkMetal]);
  sign.position.set(0, 1.95, 0.06);
  g.add(sign);
  g.userData = { dome, rot, light, signMat };
  return g;
}

/** Wall-mounted safety interlock panel with three status lamps. */
export function interlockPanel() {
  const M = materials();
  const g = new THREE.Group();
  g.add(box(0.72, 1.12, 0.12, M.panel, [0, 0, 0]));
  g.add(box(0.62, 0.74, 0.02, M.panelDark, [0, -0.13, 0.065]));
  const t = tex(labelTexture('SAFETY', { w: 512, h: 220, bg: '#e8e2cf', fg: '#141414', size: 92, sub: 'INTERLOCK' }));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.258), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  plate.position.set(0, 0.39, 0.065);
  g.add(plate);
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const y = 0.07 - i * 0.22;
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 24).rotateX(Math.PI / 2), M.metal);
    bezel.position.set(0, y, 0.08);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.lampGreen.clone());
    lamp.position.set(0, y, 0.1);
    g.add(bezel, lamp); lamps.push(lamp);
  }
  const cross = new THREE.Group();
  const xm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.0, 0.0) });
  for (const r of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.11, 0.02), xm);
    bar.rotation.z = r; cross.add(bar);
  }
  cross.position.set(0, -0.05, 0.17);
  g.add(cross);
  g.userData = { lamps, cross, crossMat: xm };
  return g;
}

/** Operator console: sloped panel with an oscilloscope screen, analog gauge, lamps and switches. */
export function operatorConsole(scopeTexture, gaugeTexture) {
  const M = materials();
  const g = new THREE.Group();
  g.add(box(1.8, 0.8, 0.7, M.panel, [0, 0.4, 0]));
  const slope = new THREE.Group();
  slope.position.set(0, 0.8, 0.0);
  slope.rotation.x = -0.75;
  g.add(slope);
  slope.add(box(1.8, 0.75, 0.08, M.panel, [0, 0.37, -0.04]));
  const scope = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: scopeTexture }));
  scope.position.set(-0.45, 0.4, 0.006);
  slope.add(scope);
  slope.add(box(0.7, 0.5, 0.03, M.panelDark, [-0.45, 0.4, -0.014]));
  const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshStandardMaterial({ map: gaugeTexture, roughness: 0.4 }));
  gaugeFace.position.set(0.35, 0.42, 0.006);
  slope.add(gaugeFace);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.02, 10, 40), M.metal);
  rim.position.copy(gaugeFace.position);
  slope.add(rim);
  const needlePivot = new THREE.Group();
  needlePivot.position.set(0.35, 0.42, 0.02);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.006), new THREE.MeshStandardMaterial({ color: 0xd61f1f, roughness: 0.4 }));
  needle.position.y = 0.08;
  needlePivot.add(needle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2), M.darkMetal);
  needlePivot.add(cap);
  slope.add(needlePivot);
  // fault lamp + label
  const fault = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.lampAmber.clone());
  fault.position.set(0.72, 0.42, 0.01);
  slope.add(fault);
  const ft = tex(labelTexture('FAULT', { w: 256, h: 96, bg: '#1a1d20', fg: '#ffb020', size: 64 }));
  const flabel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }));
  flabel.position.set(0.72, 0.32, 0.006);
  slope.add(flabel);
  // switches
  for (let i = 0; i < 8; i++) {
    const sw = box(0.03, 0.03, 0.07, M.metal, [-0.7 + i * 0.12, 0.1, 0.03]);
    sw.rotation.x = i % 3 === 0 ? 0.5 : -0.5;
    slope.add(sw);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), i % 4 === 1 ? M.lampRed : M.lampGreen);
    led.position.set(-0.7 + i * 0.12, 0.18, 0.01);
    slope.add(led);
  }
  g.userData = { needlePivot, fault, slope, scope };
  return g;
}

/** Large ring of a synchrotron for the aerial establishing shot. */
export function synchrotronRing(R = 30, count = 120) {
  const M = materials();
  const g = new THREE.Group();
  // trench (open-top tunnel cut-away)
  const wallMat = M.concreteDark;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 1.4, R - 1.4, 1.6, 160, 1, true), wallMat);
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.4, R + 1.4, 1.6, 160, 1, true), wallMat);
  inner.material = wallMat.clone(); inner.material.side = THREE.DoubleSide;
  outer.material = wallMat.clone(); outer.material.side = THREE.DoubleSide;
  inner.position.y = outer.position.y = -0.8;
  const floor = new THREE.Mesh(new THREE.RingGeometry(R - 1.4, R + 1.4, 160, 1).rotateX(-Math.PI / 2), M.concrete);
  floor.position.y = -1.6;
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
  const lip = new THREE.Mesh(new THREE.RingGeometry(R - 2.6, R - 1.4, 160).rotateX(-Math.PI / 2), rimMat);
  const lip2 = new THREE.Mesh(new THREE.RingGeometry(R + 1.4, R + 2.6, 160).rotateX(-Math.PI / 2), rimMat);
  lip.position.y = lip2.position.y = 0.005;
  g.add(inner, outer, floor, lip, lip2);
  // magnets (instanced, alternating dipole colours)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const blue = new THREE.InstancedMesh(geo, M.magnetBlue, count / 2);
  const red = new THREE.InstancedMesh(geo, M.magnetRed, count / 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    p.set(Math.cos(a) * R, -1.0, Math.sin(a) * R);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    s.set(0.9, 0.9, (2 * Math.PI * R) / count * 0.78);
    m4.compose(p, q, s);
    (i % 2 ? red : blue).setMatrixAt(i >> 1, m4);
  }
  blue.castShadow = red.castShadow = true;
  g.add(blue, red);
  const pipe = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 10, 240).rotateX(Math.PI / 2), M.metal);
  pipe.position.y = -0.5;
  g.add(pipe);
  const beamRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 8, 240).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.6, 5.0) }));
  beamRing.position.y = -0.35;
  g.add(beamRing);
  const haze = new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 8, 240).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.35, 0.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  haze.position.y = -0.35;
  g.add(haze);
  // racing bunches
  const bunches = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 4.5, 5.5) }), 24);
  bunches.frustumCulled = false;
  g.add(bunches);
  g.userData = { bunches, R, beamRing };
  return g;
}
