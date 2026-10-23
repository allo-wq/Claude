// Shot implementations. Each function poses the set and camera for absolute time
// `t` (and local time `lt` since the shot began) and returns the scene + post FX.
// Everything is a pure function of time, so any frame can be rendered in isolation.
import * as THREE from 'three';
import { clamp, lerp, ramp, smooth, ease, envelope, keyVec, keyNum, v3, wobble } from './core/util.js';
import { GAP_X } from './sets/hallSet.js';

function look(cam, pos, target, fov = 35, roll = 0) {
  cam.position.copy(pos);
  cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  cam.lookAt(target);
  cam.fov = fov;
  cam.near = 0.05; cam.far = 400;
  cam.updateProjectionMatrix();
}
function handheld(t, amt) {
  return v3(wobble(t * 2.2, 11) * amt, wobble(t * 2.0, 12) * amt, wobble(t * 1.7, 13) * amt);
}
/** Standing idle: subtle breathing so held shots never freeze. */
function idle(person, t, extra = {}) {
  const b = Math.sin(t * 2.1) * 0.015;
  person.pose({ spine: [0.02 + b, 0, 0], neck: [-0.02, 0, 0], shoulderL: [0, 0, 0.1], shoulderR: [0, 0, -0.1], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], ...extra });
}
const blink = (t, every = 3.1, offset = 0) => {
  const ph = ((t + offset) % every) / every;
  return ph > 0.94 ? Math.sin(((ph - 0.94) / 0.06) * Math.PI) : 0;
};

export const IMPL = {
  // ───────────── S1 HOOK ─────────────
  '1A'({ t, lt, cam, sets }) {
    const s = sets.ring;
    s.update(t);
    const k = ease.inOut(clamp(lt / 1.4));
    look(cam, v3(lerp(-6, 10, k), lerp(70, 40, k), lerp(98, 64, k)), v3(lerp(0, 8, k), lerp(14, 8, k), lerp(-4, 2, k)), 52);
    return { scene: s.scene, fx: { bloom: 0.9, exposure: 1.3 } };
  },
  '1B'({ t, lt, cam, sets }) {
    const h = sets.hall;
    h.leanPose(1);
    h.person.head.set({ lidL: blink(t), lidR: blink(t), gazeX: -0.3 });
    h.update(t, { beamOn: 1, beaconOn: 1 });
    const k = smooth(clamp(lt / 1.5));
    look(cam, v3(lerp(-2.9, -2.45, k), lerp(1.55, 1.5, k), lerp(3.0, 2.55, k)), v3(0.05, 0.95, -0.25), 44);
    return { scene: h.scene, fx: { bloom: 0.45, exposure: 1.0 } };
  },
  '1C'({ t, lt, cam, sets }) {
    const h = sets.hall;
    h.leanPose(1);
    h.person.head.set({ lidL: blink(t), lidR: blink(t), gazeX: -0.3 });
    h.update(t, { beamOn: 1, beaconOn: 1, beamSpeed: 18 });
    const k = smooth(clamp(lt / 1.1));
    const y = h.BEAM_Y;
    const pos = v3(lerp(-1.25, -1.0, k), y - 0.12 + 0.05 * k, lerp(1.6, 1.25, k)).add(handheld(t, 0.012));
    look(cam, pos, v3(0.25, y + 0.15, -0.35), 40, -0.05);
    return { scene: h.scene, fx: { bloom: 0.45, exposure: 1.0 } };
  },

  // ───────────── S2 SETUP ─────────────
  '2A'({ t, lt, cam, sets }) {
    const h = sets.hall, p = h.person;
    p.root.position.set(2.1, 0, 1.75); p.root.rotation.set(0, -0.25, 0);
    idle(p, t);
    p.head.set({ lidL: blink(t, 2.6), lidR: blink(t, 2.6), gazeX: 0.1, smile: 0.15 });
    h.update(t, { beamOn: 1, beaconOn: 0 });
    const k = smooth(clamp(lt / 1.4));
    look(cam, v3(lerp(1.75, 1.85, k), 1.5, lerp(4.5, 3.7, k)), v3(2.1, 1.43, 1.75), 32);
    return { scene: h.scene, fx: { bloom: 0.7 } };
  },
  '2B'({ t, lt, cam, sets }) {
    const h = sets.hall, p = h.person;
    p.root.position.set(4.05, 0, -3.42); p.root.rotation.set(0, Math.PI - 0.1, 0);
    idle(p, t, { neck: [0.05, -0.25, 0] });
    const tgt = v3(4.45 + Math.sin(t * 6.5) * 0.12 + lt * 0.08, 1.92 + Math.cos(t * 9) * 0.05, -4.02);
    p.reach('R', tgt, v3(1, -1, 0.6));
    p.head.set({ lidL: blink(t, 2.4), lidR: blink(t, 2.4), gazeX: 0.4 });
    h.update(t, { beamOn: 1, beaconOn: 0 });
    const k = smooth(clamp(lt / 1.4));
    look(cam, v3(lerp(6.6, 6.2, k), 1.65, lerp(-0.6, -1.0, k)), v3(4.45, 1.45, -3.7), 40);
    return { scene: h.scene, fx: { bloom: 0.6 } };
  },
  '2C'({ t, lt, cam, sets }) {
    const h = sets.hall, p = h.person;
    p.root.position.set(-3, 0, 6); p.root.rotation.set(0, 0, 0); // out of shot
    idle(p, t);
    p.head.set({});
    h.update(t, { beamOn: 0.6 + 0.4 * Math.sign(Math.sin(t * 17)), beaconOn: 0, glitch: 1 });
    // gauge (0..0.75 s) then pan to the oscilloscope
    const n = new THREE.Vector3(0, 0.68, 0.73);
    const gauge = v3(-3.65, 1.1, 2.62), scope = v3(-4.45, 1.09, 2.63);
    const k = ease.inOut(ramp(lt, 0.7, 1.0));
    const tgt = gauge.clone().lerp(scope, k);
    const pos = tgt.clone().addScaledVector(n, lerp(0.75, 0.95, k)).add(v3(0.12, 0, 0)).add(handheld(t, 0.012));
    look(cam, pos, tgt, 40, 0.04 * Math.sin(t * 3));
    return { scene: h.scene, fx: { bloom: 0.9 } };
  },
  '2D'({ t, lt, cam, sets }) {
    const h = sets.hall;
    h.person.root.position.set(-3, 0, 6); h.person.root.rotation.set(0, 0, 0); // off-screen
    idle(h.person, t);
    h.person.head.set({});
    // lamps die at 0.25 / 0.6 / 0.95 s; the lamp that just died sputters for 0.18 s
    const deaths = [0.25, 0.6, 0.95];
    const alive = 3 - deaths.filter((d) => lt >= d).length;
    const lastDeath = Math.max(-1, ...deaths.filter((d) => lt >= d));
    const flicker = lt - lastDeath < 0.18 && Math.sin(t * 40) > 0;
    h.update(t, { beamOn: 1, beaconOn: 0, interlock: [alive, flicker, ramp(lt, 1.15, 1.4, ease.outBack)] });
    const k = smooth(clamp(lt / 1.7));
    look(cam, v3(-2.5, 1.68, lerp(-1.05, -1.5, k)), v3(-2.6, 1.62, -4.1), 38);
    return { scene: h.scene, fx: { bloom: 0.9 } };
  },
  '2E'({ t, lt, cam, sets }) {
    const h = sets.hall;
    const k = ramp(lt, 0.25, 1.75, ease.inOut);
    h.leanPose(k);
    h.person.head.set({ lidL: blink(t, 2.2), lidR: blink(t, 2.2), gazeX: -0.2 * k });
    h.update(t, { beamOn: 0, beaconOn: 0, interlock: [0, false, 0] });
    const c = smooth(clamp(lt / 1.9));
    look(cam, v3(lerp(-2.3, -1.95, c), 1.75, lerp(-3.0, -2.7, c)), v3(0.05, 1.0, -0.3), 42);
    return { scene: h.scene, fx: { bloom: 0.6 } };
  },
  '2F'({ t, lt, cam, sets }) {
    const h = sets.hall;
    h.leanPose(1);
    h.person.head.set({ lidL: 0, lidR: 0, gazeX: -0.5, gazeY: -0.1, browRaise: 0.4 });
    h.update(t, { beamOn: 0, beaconOn: 0 });
    const y = h.BEAM_Y;
    const k = smooth(clamp(lt / 1.0));
    look(cam, v3(lerp(-0.42, -0.36, k), y + 0.06, lerp(0.95, 0.72, k)), v3(0.0, y + 0.01, 0), 32);
    return { scene: h.scene, fx: { bloom: 0.6 } };
  },
  '2G'({ t, lt, cam, sets }) {
    const h = sets.hall;
    h.leanPose(1);
    h.person.head.set({ lidL: 0, lidR: 0, gazeX: -0.5 });
    // beam front in beam-local coords (local x = −world x): starts at the upstream
    // wall (−14.5) and reaches the back of his head (local ≈ −GAP_X) at lt ≈ 0.95
    const front = lerp(-3.2, -GAP_X + 0.12, clamp(lt / 0.92));
    h.update(t, { beamOn: 0.6, beaconOn: 0, beamHead: front, beamSpeed: 20, pulseX: -front + 0.25 });
    const y = h.BEAM_Y;
    const k = smooth(clamp(lt / 1.1));
    look(cam, v3(lerp(2.5, 2.15, k), y + lerp(2.95, 2.7, k), 0.42), v3(-0.05, y + 0.02, 0), 40);
    return { scene: h.scene, fx: { bloom: 0.6, exposure: 1.0 } };
  },

  // ───────────── S3 THE BEAM ─────────────
  '3A'({ t, lt, cam, sets }) {
    const s = sets.tunnel;
    const travel = lt * 22;
    s.update(t, { travel, trail: 0.4 + ramp(lt, 1.1, 1.8) * 1.2 });
    // camera rides just behind the lead bunch; at 15.1 s it swings to a low side angle
    const k = ease.inOut(ramp(lt, 1.0, 1.6));
    const base = -travel;
    const pos = v3(lerp(0.0, 0.85, k), lerp(0.2, -0.55, k), base + lerp(3.2, 1.8, k)).add(handheld(t, 0.03));
    look(cam, pos, v3(0, 0, base - 6), lerp(55, 70, k), lerp(0, 0.25, k));
    return { scene: s.scene, fx: { bloom: 0.6 } };
  },
  '3B'({ t, lt, cam, sets }) {
    const st = sets.studio;
    const xray = ramp(lt, 0.0, 0.5, smooth);
    // beam front in head units measured from the entry wound along the beam: reaches the
    // back of the skull at 17.2 s ("back of his skull") and leaves the face at 18.1 s ("out his face")
    const exitDist = st.head.entry.distanceTo(st.head.exit);
    const beamFront = keyNum(lt, [[0, -4.5], [0.6, 0], [1.5, exitDist], [2.4, 9]], ease.linear);
    st.update(t, {
      head: { xray, lidL: 0, lidR: 0, gazeX: -0.1, brainGlow: 0 },
      beam: { from: -6, to: 9, head: beamFront, overlay: true, speed: 16, spacing: 1.2 },
      bg: ['#0d1a2e', '#020306', '#16365a'],
      hitFlash: Math.max(envelope(lt, 0.6, 1.0, 0.04, 0.32), envelope(lt, 1.5, 1.95, 0.04, 0.38)),
      hitAt: lt < 1.25 ? 'entry' : 'exit',
    });
    // orbit on the subject's LEFT (+X): from behind (sees the entry wound) → profile → front (sees the exit)
    const phi = lerp(-1.15, 0.85, ease.inOut(clamp(lt / 2.4)));
    const r = 7.2;
    look(cam, v3(Math.cos(phi) * r, 0.6, Math.sin(phi) * r), v3(0, 0.0, 0), 34);
    return { scene: st.scene, fx: { bloom: 0.45, exposure: 1.05 } };
  },
  '3C'({ t, lt, cam, sets }) {
    const st = sets.studio;
    const f = ramp(lt, 0.1, 0.65, ease.in);
    st.update(t, {
      head: { lidL: lt > 0.55 ? 0.6 : 0, lidR: lt > 0.55 ? 0.6 : 0, flash: f * 1.4, gazeX: 0.05 },
      bg: ['#0d1a2e', '#020306', '#16365a'],
    });
    const eye = st.head.eyes.L.eye.position;
    const k = smooth(clamp(lt / 0.8));
    look(cam, v3(lerp(1.9, 1.5, k), 0.35, lerp(4.2, 3.4, k)).add(handheld(t, 0.01)), v3(eye.x - 0.35, eye.y - 0.25, eye.z), 30);
    return { scene: st.scene, fx: { bloom: 1.3, exposure: 1.0 + f * 0.6 } };
  },
  '3D'({ t, lt, cam, sets }) {
    const s = sets.suns;
    s.update(t, { lit: lerp(0.18, 1, ramp(lt, 0.0, 1.15, ease.in)) });
    const a = lt * 0.25;
    look(cam, v3(0, 0, 0), v3(Math.sin(a) * 10, 1.2 + lt * 0.6, -Math.cos(a) * 10), lerp(70, 58, smooth(clamp(lt / 1.6))), lt * 0.08);
    return { scene: s.scene, fx: { bloom: 1.1, bloomRadius: 0.55, bloomThreshold: 1.4, exposure: 0.9 + ramp(lt, 0.9, 1.6) * 0.9 } };
  },
  '3E'({ t, lt, cam, sets, extra }) {
    const st = sets.studio;
    st.update(t, {
      head: { lidL: blink(t, 1.4, 0.6) * 0.9, lidR: blink(t, 1.4, 0.6) * 0.9, gazeX: 0, browRaise: 0.15 },
      bg: ['#1a2230', '#05070a', '#2c3a4c'],
      icons: {
        pain: { v: ramp(lt, 1.0, 1.25, ease.outBack), pos: [-0.7, 1.75, 0.6], size: 0.4, cross: ramp(lt, 1.35, 1.55) },
        sound: { v: ramp(lt, 1.8, 2.05, ease.outBack), pos: [0.7, 1.75, 0.6], size: 0.4, cross: ramp(lt, 2.1, 2.3) },
      },
    });
    const k = smooth(clamp(lt / 2.6));
    look(cam, v3(lerp(0.35, 0.0, k), 0.9, lerp(8.6, 9.8, k)), v3(0, 0.75, 0), 32);
    extra.labels = { pain: [-0.7, 2.45, 0.6], sound: [0.7, 2.45, 0.6] };
    return { scene: st.scene, fx: { bloom: 0.7, exposure: 0.95 } };
  },

  // ───────────── S4 AFTERMATH ─────────────
  '4A'({ t, lt, cam, sets }) {
    const st = sets.studio;
    const sw = ramp(lt, 0.15, 1.4, ease.inOut);
    st.update(t, { head: { swell: sw, lidR: blink(t, 2.0, 0.3), gazeX: 0.1 }, bg: ['#2a1a1a', '#070404', '#4a2424'] });
    const a = lerp(0.05, 0.62, ease.inOut(clamp(lt / 1.6)));
    look(cam, v3(Math.sin(a) * 6.0, 0.25, Math.cos(a) * 6.0), v3(0.15, -0.05, 0), 30);
    return { scene: st.scene, fx: { bloom: 0.5 } };
  },
  '4B'({ t, lt, cam, sets }) {
    const st = sets.studio;
    st.update(t, {
      head: { swell: 1, burn: ramp(lt, 0.0, 0.9), peel: ramp(lt, 0.4, 2.3, ease.linear), path: ramp(lt, 1.2, 2.2), lidR: blink(t, 2.0, 0.3) },
      bg: ['#2a1a1a', '#070404', '#4a2424'],
    });
    const a = lerp(0.55, 0.95, ease.inOut(clamp(lt / 2.6)));
    look(cam, v3(Math.sin(a) * 6.2, lerp(0.45, 0.25, clamp(lt / 2.6)), Math.cos(a) * 6.2), v3(0.1, -0.1, 0.1), 32);
    return { scene: st.scene, fx: { bloom: 0.8 } };
  },
  '4C'({ t, lt, cam, sets }) {
    const d = sets.dose;
    d.update(t, { hero: lerp(0.35, 1, ramp(lt, 0.0, 0.4)), fill: 0 });
    const k = smooth(clamp(lt / 1.2));
    look(cam, v3(lerp(0.6, 0.35, k), 1.7, lerp(7.5, 7.0, k)), v3(0, 1.32, 4.2), 40);
    return { scene: d.scene, fx: { bloom: 0.5 } };
  },
  '4D'({ t, lt, cam, sets }) {
    const d = sets.dose;
    const fill = ramp(lt, 0.05, 1.55, ease.linear);
    d.update(t, { hero: 1, fill });
    const k = ease.inOut(clamp(lt / 1.9));
    look(cam, v3(lerp(0.8, 2.2, k), lerp(1.75, 5.6, k), lerp(6.4, 21.5, k)), v3(0, lerp(1.45, 5.45, k), lerp(4.2, 0, k)), lerp(40, 50, k));
    return { scene: d.scene, fx: { bloom: 0.5 } };
  },
  '4E'({ t, lt, cam, sets }) {
    const hs = sets.hospital;
    const day = keyNum(lt, [[0, 0], [1.2, 0], [1.65, 1], [2.1, 1], [2.55, 2]], ease.linear);
    hs.update(t, { sit: 0, day, shake: envelope(lt, 0.5, 2.3, 0.3, 0.3), eyesOpen: 0 });
    const k = smooth(clamp(lt / 2.6));
    look(cam, v3(lerp(0.5, 0.38, k), lerp(1.85, 1.78, k), lerp(1.75, 1.4, k)), v3(0.08, 0.95, -1.25), 52);
    return { scene: hs.scene, fx: { bloom: 0.5 } };
  },

  // ───────────── S5 SURVIVAL ─────────────
  '5A'({ t, lt, cam, sets }) {
    const hs = sets.hospital;
    const day = 2 + ease.in(clamp(lt / 1.0)) * 46; // flips fast through ~7 weeks
    hs.update(t, { sit: ramp(lt, 0.7, 1.35, ease.inOut), day, eyesOpen: ramp(lt, 0.9, 1.1), bpm: 72 });
    const k = ease.inOut(ramp(lt, 0.45, 1.1));
    const pos = v3(0.55, 1.8, -1.3).lerp(v3(-0.45, 1.6, 1.15), k);
    const tgt = v3(0.5, 1.78, -2.38).lerp(v3(0.0, 0.95, -1.3), k);
    look(cam, pos, tgt, lerp(38, 42, k));
    return { scene: hs.scene, fx: { bloom: 0.5 } };
  },
  '5B'({ t, lt, cam, sets }) {
    const st = sets.studio;
    const sm = ramp(lt, 0.25, 0.75, ease.out);
    st.update(t, {
      head: { swell: 0.12, burn: 0.2, smile: sm, smileLeft: 0, frozen: ramp(lt, 0.6, 1.1), browRaise: sm * 0.6, lidR: blink(t, 2.4, 1) },
      bg: ['#14243a', '#04060a', '#2a4466'],
    });
    const k = smooth(clamp(lt / 1.6));
    look(cam, v3(lerp(0.25, 0.1, k), 0.0, lerp(5.6, 5.0, k)), v3(0, -0.15, 0), 30);
    return { scene: st.scene, fx: { bloom: 0.5 } };
  },
  '5C'({ t, lt, cam, sets }) {
    const st = sets.studio;
    // camera first: the "blocked" icon billboards toward this frame's camera
    const k = smooth(clamp(lt / 1.8));
    look(cam, v3(lerp(-0.3, 0.3, k), 1.1, lerp(7.6, 7.0, k)), v3(0, -0.1, 0), 55);
    st.camera = cam;
    st.update(t, {
      head: { swell: 0.1, burn: 0.2 },
      bg: ['#101c2c', '#03050a', '#22344e'],
      waves: ramp(lt, 0.05, 0.4),
    });
    return { scene: st.scene, fx: { bloom: 0.9 } };
  },
  '5D'({ t, lt, cam, sets, frame }) {
    const st = sets.studio;
    st.update(t, {
      head: { xray: 1, arcs: 1, arcSeed: Math.floor(frame / 2), brainGlow: 0, lidL: 0.3, lidR: 0.3 },
      bg: ['#1c0f2e', '#040208', '#3a1c5c'],
      shakeAmt: 1,
    });
    const k = smooth(clamp(lt / 1.4));
    look(cam, v3(lerp(4.6, 4.0, k), 1.2, lerp(3.6, 3.0, k)).add(handheld(t * 3, 0.06)), v3(0, 0.25, 0), 34);
    return { scene: st.scene, fx: { bloom: 0.5 } };
  },
  '5E'({ t, lt, cam, sets }) {
    const st = sets.studio;
    st.update(t, {
      head: { xray: 1, arcs: 0, brainGlow: ramp(lt, 1.1, 1.7), lidL: 0.15, lidR: 0 },
      bg: ['#0e2a2c', '#020606', '#1a5050'],
      eq: ramp(lt, 1.2, 1.8),
    });
    const k = ease.inOut(clamp(lt / 2.8));
    look(cam, v3(lerp(3.2, 0.4, k), lerp(0.7, 0.3, k), lerp(4.4, 8.4, k)), v3(0, lerp(0.2, -0.45, k), 0), lerp(32, 38, k));
    return { scene: st.scene, fx: { bloom: 0.9 } };
  },

  // ───────────── S6 CLOSER ─────────────
  '6A'({ t, lt, cam, sets }) {
    const d = sets.desk;
    d.update(t, { drop: ramp(lt, 0.0, 0.5, ease.linear), press: ramp(lt, 0.55, 1.45, ease.linear) });
    const k = smooth(clamp(lt / 1.6));
    look(cam, v3(lerp(0.2, 0.14, k), lerp(1.25, 1.08, k), lerp(1.05, 0.86, k)), v3(0.03, 0.03, 0.08), 40);
    return { scene: d.scene, fx: { bloom: 0.5 } };
  },
  '6B'({ t, lt, cam, sets }) {
    const h = sets.hall, p = h.person;
    const walkT = t - 44.6;
    const cycle = 1.05;
    const stride = p.walk(walkT / cycle);
    const x = 3.8 - (walkT / cycle) * stride;
    p.root.position.set(x, 0, 1.3); p.root.rotation.set(0, -Math.PI / 2, 0);
    p.root.updateMatrixWorld(true);
    p.head.set({ lidL: blink(t, 2.3), lidR: blink(t, 2.3), frozen: 0, smile: 0.2, smileLeft: 0, gazeX: 0.2 });
    h.update(t, { beamOn: 1, beaconOn: 1 });
    const k = smooth(clamp(lt / 1.6));
    look(cam, v3(x - 2.4, 0.95, lerp(3.4, 3.6, k)), v3(x - 0.3, 1.35, 1.2), 40);
    return { scene: h.scene, fx: { bloom: 0.8 } };
  },
  '6C'({ t, lt, cam, sets }) {
    const h = sets.hall, p = h.person;
    const walkT = t - 44.6;
    const cycle = 1.05;
    const stride = p.walk(walkT / cycle);
    const x = 3.8 - (walkT / cycle) * stride;
    p.root.position.set(x, 0, 1.3); p.root.rotation.set(0, -Math.PI / 2, 0);
    p.root.updateMatrixWorld(true);
    p.head.set({ lidL: blink(t, 2.3), lidR: blink(t, 2.3), smile: 0.2, smileLeft: 0 });
    h.update(t, { beamOn: 1, beaconOn: 1 });
    const k = ease.inOut(clamp(lt / 1.8));
    look(cam, v3(lerp(x - 2.4, -6.5, k), lerp(0.95, 6.8, k), lerp(3.6, 9.5, k)), v3(lerp(x - 0.3, 0.5, k), lerp(1.35, 0.6, k), lerp(1.2, -0.5, k)), lerp(40, 46, k));
    return { scene: h.scene, fx: { bloom: 0.9 } };
  },
};

// ───────────── CAPTIONS (on-screen text) ─────────────
// Only facts that help a muted viewer; kept inside the Shorts safe area (y 250–1440).
const Y = 'ffd34d';
export function captions(hud, t, ctx) {
  const pop = (a, b, fi = 0.18, fo = 0.15) => envelope(t, a, b, fi, fo);
  const sc = (a) => 0.92 + 0.08 * ease.outBack(clamp((t - a) / 0.3));

  if (t < 1.4) {
    hud.text([{ text: '1978', size: 230, color: '#ffffff' }], { y: 430, opacity: pop(-0.3, 1.4, 0.15, 0.1), scale: 1 + 0.04 * t });
    hud.text([{ text: 'SOVIET UNION', size: 62, color: '#' + Y, tracking: 10 }], { y: 585, opacity: pop(-0.3, 1.4, 0.2, 0.1) });
  }
  if (t >= 4.1 && t < 6.8) {
    hud.text([{ text: 'ANATOLI BUGORSKI', size: 88 }], { y: 1265, opacity: pop(4.1, 6.8, 0.2, 0.15), scale: sc(4.1) });
    hud.text([{ text: 'PHYSICIST · PROTVINO, RUSSIA', size: 50, color: '#' + Y, weight: 700, font: 'InterBold' }], { y: 1365, opacity: pop(5.45, 6.8, 0.2, 0.15) });
  }
  if (t >= 14.1 && t < 16.6) {
    hud.text([{ text: 'PROTONS', size: 120 }], { y: 410, opacity: pop(14.1, 15.15, 0.15, 0.1), scale: sc(14.1) });
    hud.text([{ text: '99.99%', size: 190, color: '#' + Y }, { text: 'THE SPEED OF LIGHT', size: 74 }], { y: 470, opacity: pop(15.15, 16.6, 0.15, 0.12), scale: sc(15.15) });
  }
  if (t >= 19.95 && t < 21.4) {
    hud.text([{ text: '“BRIGHTER THAN', size: 84 }, { text: 'A THOUSAND SUNS”', size: 84 }, { text: 'HOW HE DESCRIBED THE FLASH', size: 40, color: '#' + Y, weight: 700, font: 'InterBold' }], { y: 470, opacity: pop(19.95, 21.3, 0.18, 0.15), scale: sc(19.95) });
  }
  if (t >= 22.4 && t < 24.0 && ctx.labels) {
    const P = ctx.project;
    const a = P(ctx.labels.pain), b = P(ctx.labels.sound);
    hud.text([{ text: 'NO PAIN', size: 58 }], { x: a.x, y: a.y, opacity: pop(22.45, 24.0, 0.15, 0.1) });
    if (t >= 23.2) hud.text([{ text: 'NO SOUND', size: 58 }], { x: b.x, y: b.y, opacity: pop(23.25, 24.0, 0.15, 0.1) });
  }
  if (t >= 28.3 && t < 29.4) hud.text([{ text: 'LETHAL DOSE', size: 92 }, { text: '≈ 5 Gy', size: 130, color: '#' + Y }], { y: 450, opacity: pop(28.3, 29.4, 0.15, 0.1), scale: sc(28.3) });
  if (t >= 29.45 && t < 31.4) {
    hud.text([{ text: 'HIS DOSE', size: 92 }, { text: '≈ 2,000 Gy', size: 150, color: '#' + Y }], { y: 450, opacity: pop(29.45, 31.4, 0.15, 0.12), scale: sc(29.45) });
    hud.text([{ text: '1 BLOCK = ONE LETHAL DOSE', size: 44, weight: 700, font: 'InterBold' }], { y: 1400, opacity: pop(29.9, 31.4, 0.2, 0.12) });
  }
  if (t >= 31.55 && t < 34.0) hud.text([{ text: 'DOCTORS EXPECTED', size: 80 }, { text: 'HIM TO DIE', size: 80, color: '#' + Y }], { y: 1320, opacity: pop(31.55, 34.0, 0.18, 0.15), scale: sc(31.55) });
  if (t >= 35.65 && t < 37.0) hud.text([{ text: 'LEFT SIDE', size: 92 }, { text: 'PARALYZED', size: 92, color: '#' + Y }], { y: 390, opacity: pop(35.65, 37.0, 0.15, 0.12), scale: sc(35.65) });
  if (t >= 37.2 && t < 38.8) hud.text([{ text: 'DEAF IN', size: 92 }, { text: 'LEFT EAR', size: 92, color: '#' + Y }], { y: 380, opacity: pop(37.2, 38.8, 0.15, 0.12), scale: sc(37.2) });
  if (t >= 38.9 && t < 40.2) hud.text([{ text: 'SEIZURES', size: 110, color: '#d8b4ff' }], { y: 400, opacity: pop(38.9, 40.2, 0.12, 0.12), scale: sc(38.9) });
  if (t >= 41.45 && t < 43.0) hud.text([{ text: 'MIND', size: 100 }, { text: 'INTACT', size: 150, color: '#7dffb0' }], { y: 1290, opacity: pop(41.45, 43.0, 0.15, 0.12), scale: sc(41.45) });
}

// ───────────── TRANSITIONS ─────────────
export function transitions(hud, t) {
  const flash = (a, peak, b, color = '#ffffff', amt = 1) => {
    if (t < a || t > b) return;
    const v = t < peak ? (t - a) / (peak - a) : 1 - (t - peak) / (b - peak);
    hud.fade(color, clamp(v) * amt);
  };
  flash(13.82, 14.0, 14.28);            // beam hits → into the pipe
  flash(19.5, 19.8, 20.0);              // eye flash → thousand suns
  flash(21.05, 21.4, 21.75);            // white-out → calm, nothing felt
}
