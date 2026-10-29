// Shot choreography for the whole loop. Every pose, camera move and effect is a pure
// function of the song beat b (0 ≤ b < 48), so any frame renders on its own and frame 719
// flows straight into frame 0. One shot per sung line (8 beats); the camera never hard-cuts:
// whip pans, a fly-through a cloud and a swoop carry it through one tiny world.
import * as THREE from 'three';
import { Star } from './characters/star.js';
import { Bunny } from './characters/bunny.js';
import { Burst, Ring, Rays, RainbowTrail, Confetti, Bubble, LittleStars, Diamond } from './world/fx.js';
import { sparkleTexture, radialTexture } from './core/textures.js';
import { clamp, lerp, ease, invLerp, ramp, spring, pop, bump, hop, v3, shake } from './core/util.js';
import { LYRICS, WIDTH, HEIGHT } from './timeline.js';
import { layoutLine, LYRIC_STYLE, ACTIVE_STYLE } from './core/hud.js';

const TAU = Math.PI * 2;
const UP = v3(0, 1, 0);
const mod = (x, m) => ((x % m) + m) % m;
const bezier = (a, c, d, u) => a.clone().multiplyScalar((1 - u) ** 2).addScaledVector(c, 2 * u * (1 - u)).addScaledVector(d, u * u);

// ───────────── places (world units; the planet top is y = 0, the house stands at the origin) ─────────────
const SILL_Y = 1.15;                       // top of the window sill
const BUNNY_AT = v3(0, 1.58, 1.3);         // Pip leans out of the round window
const NOSE = v3(0, 1.54, 1.6);             // Pip's nose (boop target)
const HOME = v3(0.55, 5.25, 1.7);          // Twinkle's spot in the sky above the house
const SP5 = v3(0.6, 1.64, 1.56);           // Twinkle's spot beside the window
const HOLD = v3(0, 1.36, 1.68);            // between Pip's paws
const GIFT_SILL = v3(0.33, 1.235, 1.44);   // the little star's nightlight spot on the sill
const LITTLE_AROUND = v3(0, 6, -2);
const BIG = 0.56, SMALL = 0.3;             // Twinkle's size in the sky / at the window
const GIFT = 0.085;

// orbit above the world (shot 3): φ(b) decelerates to a hover at P4 on beat 24
const ORB = { r: 7, y: 9, w: 0.85, phi24: 0.42 };
const orbitPhi = (b) => { const x = Math.max(0, 24 - b); return ORB.phi24 - ORB.w * (x > 1 ? x - 0.5 : (x * x) / 2); };
function orbitBase(b) {
  const p = orbitPhi(b);
  return v3(Math.sin(p) * ORB.r, ORB.y + 0.35 * Math.sin((b * Math.PI) / 2) * clamp((24 - b) / 1.5), Math.cos(p) * ORB.r);
}
/** Orbit plus a loop-de-loop on "high" (b 21.5–22.7). */
function loopOffset(b) {
  const u = invLerp(21.5, 22.7, b);
  if (u <= 0 || u >= 1) return v3();
  const phi = orbitPhi(b), a = TAU * ease.inOut(u), L = 1.9;
  return v3(Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(L * Math.sin(a)).addScaledVector(UP, L * (1 - Math.cos(a)));
}
const orbitPos = (b) => orbitBase(b).add(loopOffset(b));
const loopRoll = (b) => { const u = invLerp(21.5, 22.7, b); return u > 0 && u < 1 ? TAU * ease.inOut(u) : 0; };
const P4 = orbitBase(24);
const rocketPos = (b) => { const u = Math.max(0, b - 16); return v3(HOME.x + 0.04 * u, HOME.y + 7.5 * (u / 1.1) ** 2, HOME.z); };
const swoopPos = (b) => bezier(P4, P4.clone().lerp(SP5, 0.5).add(v3(0, 1.6, 3.4)), SP5, ease.inOut(invLerp(31.5, 32.3, b)));
const zipPos = (b) => bezier(SP5.clone().add(v3(0.15, 0.55, 0)), v3(1.2, 3.6, 3.8), HOME, ease.inOut(invLerp(45, 45.5, b)));

// ───────────── camera: one continuous path, camAt(b) → {pos, tgt, fov} ─────────────
const pose = (p, t, fov) => ({ pos: v3(...p), tgt: v3(...t), fov });
const mix = (A, B, u, sh = 0.7) => ({ pos: A.pos.clone().lerp(B.pos, u), tgt: A.tgt.clone().lerp(B.tgt, u), fov: lerp(A.fov, B.fov, u), sh });
const C1 = pose([0.4, 2.55, 5.4], [HOME.x - 0.05, HOME.y - 0.45, HOME.z], 40);  // opening: up at the star over the mushroom cap
const C2 = pose([0.38, 2.05, 5.6], [0.26, 1.5, 1.3], 40);                       // Pip at the window
const C5 = pose([0.44, 2.0, 5.7], [0.32, 1.5, 1.4], 40);                        // Pip and Twinkle together
const C6 = pose([0.25, 1.85, 4.9], [0.15, 1.42, 1.3], 38);                       // close on sleepy Pip

function camS1(b) {
  const u = ease.inOut(clamp(b / 7.45));
  const P = { pos: C1.pos.clone().add(v3(0, 0.1 * u, -0.6 * u)), tgt: C1.tgt.clone(), fov: C1.fov };
  const amp = 0.05 * (1 - Math.exp(-b * 20)) * Math.exp(-b * 4) + (b > 6 ? 0.04 * (1 - Math.exp(-(b - 6) * 20)) * Math.exp(-(b - 6) * 4) : 0);
  P.pos.add(shake(b, amp, 2));
  return P;
}
function camS2(b) {
  const u = ease.inOut(invLerp(8, 15.45, b));
  return { pos: C2.pos.clone().add(v3(-0.06 * u, 0, -0.32 * u)), tgt: C2.tgt.clone(), fov: C2.fov };
}
function camRocket(b) {
  const s = rocketPos(Math.min(b, 17.45)), k = s.y - HOME.y;
  return { pos: v3(C1.pos.x, C1.pos.y + 0.8 * k, C1.pos.z + 0.25 * k), tgt: s.add(v3(0, -0.45 - 0.05 * k, 0)), fov: C1.fov + 2 * Math.min(k, 3) };
}
function camChase(b) {
  // high and outside the orbit, looking in: the world's curved horizon below, the star above it
  const phi = orbitPhi(b) - 0.5;
  return { pos: v3(Math.sin(phi) * 15, 14, Math.cos(phi) * 15), tgt: orbitBase(b).addScaledVector(loopOffset(b), 0.6).add(v3(0, -1.0, 0)), fov: 48, sh: 0.15 };
}
const D4 = camChase(24).pos.sub(P4).setY(0).normalize();
function camS4(b) {
  const d = D4.clone().applyAxisAngle(UP, lerp(-0.25, 0.3, ease.inOut(invLerp(24, 31.5, b))));
  d.y = 0.2; d.normalize();
  return { pos: P4.clone().addScaledVector(d, 4.4), tgt: P4.clone().add(v3(0, -0.3, 0)), fov: 38 };
}
function camS5(b) {
  const u = ease.inOut(invLerp(32.3, 40, b));
  return { pos: C5.pos.clone().add(v3(0.06 * Math.sin(u * Math.PI), 0, -0.25 * u)), tgt: C5.tgt.clone(), fov: C5.fov };
}
function camS6(b) {
  if (b < 44) return mix(camS5(40), C6, ease.inOut(invLerp(40, 44, b)), 0.5);
  const u = ease.inOut(invLerp(44, 46.2, b));
  const P = mix(C6, C1, u);
  P.pos.z += 1.1 * Math.sin(Math.PI * u);                 // pull back as it tilts up to the sky
  return P;
}
export function camAt(b) {
  if (b < 7.45) return camS1(b);
  if (b < 8) return mix(camS1(7.45), camS2(8), ease.inOut(invLerp(7.45, 8, b)));      // whip pan down
  if (b < 15.45) return camS2(b);
  if (b < 16) return mix(camS2(15.45), camRocket(16), ease.inOut(invLerp(15.45, 16, b))); // whip tilt up
  if (b < 17.4) return camRocket(b);
  if (b < 23.2) return camChase(b);                                                  // (cut hidden in the cloud)
  if (b < 24.2) return mix(camChase(b), camS4(b), ease.inOut(invLerp(23.2, 24.2, b)), 0.12);
  if (b < 31.5) return camS4(b);
  if (b < 32.3) {                                                                    // swoop down to the window
    const u = ease.inOut(invLerp(31.5, 32.3, b));
    const P = mix(camS4(31.5), camS5(32.3), u);
    P.pos.y += 0.9 * Math.sin(Math.PI * u);
    return P;
  }
  if (b < 40) return camS5(b);
  return camS6(b);
}

const _prev = new THREE.PerspectiveCamera();
function setCam(cam, P) {
  cam.position.copy(P.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(P.tgt);
  cam.fov = P.fov;
  cam.aspect = WIDTH / HEIGHT;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
/** Place the camera and derive the motion-blur vector from how far the view moved since the last frame. */
function applyCam(c) {
  const P = camAt(c.b);
  setCam(c.cam, P);
  setCam(_prev, camAt(mod(c.b - 1 / 15, 48)));
  const ndc = P.tgt.clone().project(_prev);
  const sh = P.sh ?? 0.5;
  let bx = -ndc.x * 0.5 * sh, by = -ndc.y * 0.5 * sh;
  const len = Math.hypot(bx, by);
  if (len > 0.3 || ndc.z > 1) bx = by = 0;                           // a cut: no smear
  else if (len > 0.12) { bx *= 0.12 / len; by *= 0.12 / len; }
  Object.assign(c.fx, { bloom: 0.8, bloomThreshold: 2.0, bloomRadius: 0.4, blur: [bx, by] });
}

// ───────────── performance helpers ─────────────
const SYL = LYRICS.flatMap((l) => l.syllables);
function vowel(ph) {
  if (/uː|oʊ/.test(ph)) return [0.55, 1];
  if (/ɜ/.test(ph)) return [0.5, 0.6];
  if (/aʊ/.test(ph)) return [0.9, 0.45];
  if (/ɑ|aɪ/.test(ph)) return [1, 0];
  if (/ʌ/.test(ph)) return [0.75, 0.1];
  if (/ɪ|i/.test(ph)) return [0.5, 0];
  return [0.4, 0];
}
/** Mouth shape for whoever is singing the current syllable. */
function singing(b, amt = 1) {
  for (const s of SYL) {
    const u = b - s.abs;
    if (u >= 0 && u < s.len) {
      const [o, r] = vowel(s.ph);
      const a = clamp(u / 0.07) * clamp((s.len - u) / 0.16);
      const vib = s.len > 1 ? 1 - 0.14 * (0.5 + 0.5 * Math.sin(u * 16)) : 1;
      return { open: (0.25 + 0.55 * o) * a * amt * vib, round: r };
    }
  }
  return { open: 0, round: 0 };
}
/** Squash on every beat with a little overshoot (dancing to the music). */
const beatBounce = (b) => { const ph = b - Math.floor(b); return -0.12 * Math.exp(-ph * 7) * Math.cos(ph * 14); };
const blink = (b, at) => Math.max(0, ...at.map((t) => bump(b, t, 0.13)));

const lerpDeep = (a, b, t) => (typeof a === 'number' ? lerp(a, b, t) : Array.isArray(a) ? a.map((x, i) => lerpDeep(x, b[i], t)) : Object.fromEntries(Object.keys(a).map((k) => [k, lerpDeep(a[k], b[k], t)])));
/** Pose keys [[beat, value], ...]: each key springs in (outBack) over `dur` beats. */
function keyed(b, keys, dur = 0.32, fn = ease.outBack) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= b) i++;
  if (b < keys[0][0] || i === 0) return lerpDeep(keys[0][1], keys[0][1], 0);   // a fresh copy
  return lerpDeep(keys[i - 1][1], keys[i][1], fn(clamp((b - keys[i][0]) / dur)));
}

// Pip's arm poses: pivot rotations [x, y, z] for the right (viewer's left) and left arm
const ARMS = {
  sill: { R: [-1.2, 0, 0.15], L: [-1.2, 0, -0.15] },
  clasp: { R: [-2.0, 0, 0.75], L: [-2.0, 0, -0.75] },
  chin: { R: [-2.3, 0, 0.6], L: [-1.2, 0, -0.15] },
  point: { R: [-1.2, 0, 0.15], L: [-0.3, 0, 2.7] },
  cheer: { R: [-0.3, 0, -2.6], L: [-0.3, 0, 2.6] },
  hold: { R: [-1.55, 0, 0.62], L: [-1.55, 0, -0.62] },
  stretch: { R: [-0.1, 0, -2.85], L: [-0.1, 0, 2.85] },
  rub: { R: [-2.6, 0, 0.35], L: [-1.2, 0, -0.15] },
  sleep: { R: [-1.45, 0, 1.0], L: [-1.45, 0, -1.0] },
};

function faceCam(obj, cam) { obj.lookAt(cam.position); }

// ───────────── the cast ─────────────
export class Cast {
  constructor(world) {
    this.world = world;
    const s = world.scene;
    this.star = new Star({ light: true });
    this.gift = new Star({ color: 0xff9ad5, emissive: 0xff4fa0, glow: 'rgba(255,150,210,', deform: false });
    this.bunny = new Bunny({ size: 0.28 });
    this.bunny.root.position.copy(BUNNY_AT);
    this.bunny.clipBelow(SILL_Y);
    this.bunny.root.traverse((m) => { if (m.isMesh && m.geometry.type !== 'PlaneGeometry') m.castShadow = true; });
    this.burst = new Burst({ n: 70, seed: 3 });
    this.burst2 = new Burst({ n: 44, seed: 8, palette: [0xffe14d, 0xffffff, 0xffb3e6, 0x9ae6ff], size: 22 });
    this.hearts = new Burst({ n: 18, seed: 12, palette: [0xff6fa8, 0xff9ad5, 0xffffff], size: 14, flat: true });
    this.puffs = new Burst({ n: 26, seed: 21, palette: [0xffffff, 0xffe6f5], size: 70 });
    this.ring = new Ring();
    this.rays = new Rays();
    this.trail = new RainbowTrail();
    this.confetti = new Confetti();
    this.bubble = new Bubble();
    this.little = new LittleStars();
    this.diamond = new Diamond();
    const spark = (color) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.renderOrder = 22;
      return sp;
    };
    this.twinkle = spark(new THREE.Color(2.4, 2.1, 1.4));
    this.twinkleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,230,150,1)', 'rgba(255,180,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glints = [0, 1, 2, 3].map(() => spark(new THREE.Color(2.2, 2.2, 2.4)));
    this.zzz = [0, 1, 2].map(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: world.moon.zzz[0].material.map, transparent: true, depthWrite: false })));
    s.add(this.star.root, this.gift.root, this.bunny.root, this.burst.points, this.burst2.points, this.hearts.points, this.puffs.points,
      this.ring.mesh, this.rays.mesh, this.trail.mesh, this.confetti.mesh, this.bubble.group, this.little.mesh, this.diamond.group,
      this.twinkle, this.twinkleGlow, ...this.glints, ...this.zzz);
    // frame the sleepy moon in the upper left of the opening shot
    const cam = new THREE.PerspectiveCamera();
    setCam(cam, C1);
    const dir = v3(-0.5, 0.66, 0.5).unproject(cam).sub(cam.position).normalize();
    world.moon.group.position.copy(C1.pos).addScaledVector(dir, 90);
    world.moon.group.scale.setScalar(5);
    world.moon.group.lookAt(C1.pos);
  }

  /** Defaults for every frame: effects off, Pip idling at the window, Twinkle at home. */
  reset(b) {
    const Z = v3();
    for (const fx of [this.burst, this.burst2, this.hearts, this.puffs]) fx.set(Z, -1);
    this.ring.mesh.visible = this.rays.mesh.visible = this.trail.mesh.visible = this.confetti.mesh.visible = false;
    this.bubble.set({});
    this.diamond.set({ scale: 0 });
    this.gift.root.visible = false;
    this.star.root.visible = true;
    this.twinkle.visible = this.twinkleGlow.visible = false;
    for (const g of this.glints) g.visible = false;
    for (const z of this.zzz) z.visible = false;
    this.bunny.set({
      head: [-0.25, 0.1, 0.06 * Math.sin((Math.PI * b) / 2)], armR: ARMS.sill.R, armL: ARMS.sill.L,
      ears: { perk: 1, wiggle: 0.08 * Math.sin(Math.PI * b) }, eyes: { look: [0.15, 0.85], sparkle: true, open: 1 - blink(mod(b, 6), [2.5]) },
      mouth: { smile: 0.8 }, bob: 0.05 * hop(b),
    });
  }

  finish(c) {
    const little = Math.min(ramp(c.b, 30.5, 31.7), 1 - ramp(c.b, 46.3, 47.6));
    this.little.set(LITTLE_AROUND, little, c.b);
    this.world.update(c.b, c.cam.position, c.space ?? 0);
  }

  /** The bright twinkle point Twinkle pops out of (and shrinks back into). */
  twinklePoint(p, k, b) {
    const on = k > 0.01;
    this.twinkle.visible = this.twinkleGlow.visible = on;
    if (!on) return;
    const pulse = 0.85 + 0.15 * Math.sin(b * TAU * 2);
    this.twinkle.position.copy(p); this.twinkleGlow.position.copy(p);
    this.twinkle.scale.setScalar(1.3 * k * pulse);
    this.twinkle.material.rotation = b * 0.8;
    this.twinkleGlow.scale.setScalar(1.6 * k);
    this.twinkleGlow.material.opacity = 0.8 * k;
  }

  /** Twinkle at a place, facing the camera. */
  placeStar(p, cam, pose) {
    this.star.root.position.copy(p);
    faceCam(this.star.root, cam);
    const near = clamp((p.distanceTo(BUNNY_AT) - 1) / 2.5);        // dim the lamp near the window
    this.star.set({ lamp: lerp(0.1, 1, near), ...pose });
  }
}

// ───────────── shots ─────────────
export const IMPL = {
  // 1 "Twinkle, twinkle, little star": pop in, bounce, wink, spin, shrink "little", burst back big
  1(c) {
    const { b, cast } = c;
    applyCam(c);
    let scale;
    if (b < 4) scale = BIG * pop(b, 0, 0.9);
    else if (b < 6) scale = lerp(BIG, BIG * 0.45, ease.outBack(invLerp(4, 4.4, b)));
    else scale = lerp(BIG * 0.45, BIG * 1.08, pop(b, 6, 0.9));
    const p = HOME.clone();
    p.y += 0.07 * hop(b);
    const sing = singing(b);
    let mouth = { smile: 0.85, open: sing.open, round: sing.round };
    let eyes = { sparkle: b < 1.6 || b > 6, open: 1 - blink(b, [1.55, 5.6]) };
    let armL = 0.25 + 0.2 * Math.sin(Math.PI * b), armR = 0.25 - 0.2 * Math.sin(Math.PI * b);
    let legL = 0.12 * Math.sin(Math.PI * b), legR = -legL;
    let spin = 0, lean = 0.13 * Math.sin(Math.PI * b), squash = beatBounce(b);
    if (b < 1) {
      const k = 1 - invLerp(0.4, 1, b);
      armL = lerp(armL, 0.8, k); armR = lerp(armR, 0.8, k);
      mouth = { smile: 1, open: Math.max(sing.open, 0.65 * k), round: 0 };
    }
    if (b >= 2 && b < 2.9) { eyes = { ...eyes, wink: 'L' }; armL = 0.85 + 0.12 * Math.sin(b * 20); }
    if (b >= 3 && b < 4) { spin = TAU * ease.inOut(invLerp(3, 3.6, b)); armL = armR = 0.45; }
    if (b >= 4 && b < 6) {
      mouth = { smile: 0.2, open: 0.2 + 0.6 * sing.open, round: 1 };
      eyes = { look: [0, 0.35], pupil: 0.78, open: 1 };
      armL = armR = -0.3;
      lean = 0.1 * Math.sin(Math.PI * b * 2);
      squash = beatBounce(b) * 1.5;
    }
    if (b >= 6) {
      const k = pop(b, 6, 0.6);
      armL = armR = lerp(-0.3, 0.85, k) + 0.08 * Math.sin(b * 12);
      legL = legR = 0.35 * k;
      mouth = { smile: 1, open: Math.max(0.55, sing.open), round: 0, width: 1.1 };
      eyes = { sparkle: true };
      squash = 0.25 * spring(b, 6, 2, 3.5) + beatBounce(b) * 0.5;
      lean = 0.06 * Math.sin(Math.PI * b);
    }
    cast.placeStar(p, c.cam, { armL, armR, legL, legR, squash, spin, lean, scale: Math.max(0.001, scale), eyes, mouth, glow: 1,
      sparkle: bump(b, 2.3, 0.7) + 0.9 * ramp(b, 6, 6.3) * (1 - ramp(b, 7.5, 8)), sparkPhase: b * 1.5 });
    cast.burst.set(p, b, { reach: 1.9, life: 1.5, gravity: 0.15 });
    cast.ring.set(p, b, c.cam, { radius: 2.3, life: 0.7 });
    if (b >= 6) {
      cast.burst2.set(p, b - 6, { reach: 1.7, life: 1.4 });
      cast.ring.set(p, b - 6, c.cam, { radius: 2.8, life: 0.7 });
    }
    const behind = p.clone().addScaledVector(p.clone().sub(c.cam.position).normalize(), 0.5);
    cast.rays.set(behind, c.cam, { size: 6, opacity: 0.85 * ramp(b, 6, 6.35) * (1 - ramp(b, 7.3, 7.9)), angle: b * 0.35 });
    cast.twinklePoint(p, 1 - invLerp(0, 0.3, b), b);
  },

  // 2 "How I wonder what you are": Pip wonders; a thought bubble's "?" turns into a star
  2(c) {
    const { b, cast } = c;
    applyCam(c);
    const B = cast.bunny;
    const sing = singing(b);
    const arms = keyed(b, [[8, ARMS.sill], [8.05, ARMS.clasp], [10, ARMS.chin], [12.15, ARMS.sill], [14.35, ARMS.clasp], [15.1, ARMS.point]]);
    const head = keyed(b, [[8, [-0.22, 0.2, -0.08]], [10, [-0.08, -0.12, 0.22]], [12.1, [-0.2, 0.3, -0.12]], [15.1, [-0.32, 0.12, 0]]], 0.4, ease.inOut);
    const look = keyed(b, [[8, [0.3, 0.75]], [10, [-0.4, 0.8]], [12.1, [0.75, 0.6]], [15.1, [0.25, 1]]], 0.25, ease.out);
    head[2] += 0.05 * Math.sin((Math.PI * b) / 2);
    let mouth = { smile: 0.8, open: sing.open * 0.65, round: sing.round };
    let eyes = { sparkle: true, look, pupil: 1.08, open: 1 - blink(b, [9.6, 13.4]) };
    let ears = { perk: 1 + 0.3 * spring(b, 8, 2.2, 3.5), wiggle: 0.35 * spring(b, 8, 3, 3), flop: 0.4 * bump(b, 10.6, 0.8) };
    if (b >= 15.25) {
      const k = pop(b, 15.25, 0.4);
      mouth = { smile: 0.5, open: 0.8 * k, round: 1 };
      eyes = { ...eyes, pupil: 1.2 };
      ears = { perk: 1 + 0.35 * k, spread: 0.2 * k, wiggle: 0.2 * spring(b, 15.25, 3, 3) };
    } else if (b >= 14.3) {
      mouth = { smile: 1, open: Math.max(sing.open, 0.35), round: sing.round * 0.5 };
    }
    B.set({ head, armR: arms.R, armL: arms.L, ears, eyes, mouth, bob: 0.06 * hop(b) + 0.1 * spring(b, 8, 2, 4), blush: 0.9 });
    // thought bubble from the top-right of Pip's head
    const gone = 1 - ramp(b, 15.25, 15.45);
    const puffs = (clamp((b - 11) / 0.2) + clamp((b - 11.25) / 0.2) + clamp((b - 11.5) / 0.2)) * gone;
    const cloud = pop(b, 11.7, 0.5) * gone;
    const icon = b < 12 ? null : {
      kind: b < 14.25 ? '?' : 'star',
      scale: pop(b, 12, 0.6) * (1 + 0.3 * bump(b, 14.25, 0.3)),
      spin: b < 14 ? 0.18 * spring(b, 12, 2, 3) + 0.35 * spring(b, 13, 2.2, 2.5) : TAU * ease.inOut(invLerp(14, 14.5, b)),
      bob: 0.05 * Math.sin(b * Math.PI),
    };
    cast.bubble.group.position.copy(BUNNY_AT).add(v3(0.2, 0.27, 0.2));
    cast.bubble.group.scale.setScalar(0.36);
    faceCam(cast.bubble.group, c.cam);
    cast.bubble.set({ puffs, cloud, icon });
    if (b >= 14) cast.burst2.set(cast.bubble.cloud.getWorldPosition(v3()), b - 14, { reach: 0.6, life: 1.2, size: 0.5 });
    // Twinkle waits at home, crouching for take-off (seen at the end of the whip up)
    const crouch = ramp(b, 15.55, 16);
    cast.placeStar(HOME, c.cam, { scale: BIG, squash: -0.3 * crouch + beatBounce(b) * (1 - crouch), armL: lerp(0.3, -0.35, crouch), armR: lerp(0.3, -0.35, crouch),
      eyes: { squint: 0.4 * crouch, sparkle: true }, mouth: { smile: 1, open: 0.2 }, sparkle: 0.3 });
  },

  // 3 "Up above the world so high": rocket up through a cloud, then fly a loop around the tiny world
  3(c) {
    const { b, cast } = c;
    applyCam(c);
    const sing = singing(b);
    if (b < 17.45) {
      const p = rocketPos(b);
      const go = ease.out(invLerp(16, 16.25, b));
      cast.placeStar(p, c.cam, { scale: BIG, squash: lerp(-0.3, 0.45, go), armL: -0.4, armR: -0.4, legL: -0.15, legR: -0.15,
        eyes: { happy: 1 }, mouth: { smile: 1, open: Math.max(0.45, sing.open) }, glow: 1.2, sparkle: 1, sparkPhase: b * 3 });
      cast.trail.set(rocketPos, b, Math.min(1.1, b - 15.98), c.cam, { width: 0.32, fade: 1 });
      cast.puffs.set(v3(0.6, 12.4, 1.7), b - 16.95, { reach: 2.6, life: 1.2, gravity: 0 });
      c.space = 0.3 * clamp(b - 16);
    } else {
      const p = orbitPos(b);
      const roll = loopRoll(b);
      const sparkle = 0.5 + bump(b, 23, 0.6);
      const done = ramp(b, 23, 23.3);
      cast.placeStar(p, c.cam, { scale: lerp(0.8, BIG, ramp(b, 23.2, 24)), armL: lerp(0.55, 0.95, done) + 0.12 * Math.sin(b * TAU), armR: lerp(0.55, 0.95, done) - 0.12 * Math.sin(b * TAU),
        legL: 0.18, legR: 0.18, lean: -roll + 0.12 * Math.sin(Math.PI * b), squash: beatBounce(b) * 0.6,
        eyes: { sparkle: true, wink: b > 23 && b < 23.7 ? 'R' : undefined }, mouth: { smile: 1, open: Math.max(sing.open, 0.15), round: sing.round },
        glow: 1.1, sparkle, sparkPhase: b * 2 });
      cast.trail.set(orbitPos, b, Math.min(2.6, b - 17.45), c.cam, { width: 0.6, fade: 1 });
      cast.burst2.set(p, b - 23, { reach: 1.6, life: 1.2 });
      c.space = 0.7;
    }
  },

  // 4 "Like a diamond in the sky": spin up into a diamond, glints, prism rainbows, poof back
  4(c) {
    const { b, cast } = c;
    if (b >= 31.5) return swoop(c);
    applyCam(c);
    const sing = singing(b);
    const p = P4.clone();
    p.y += 0.06 * Math.sin((b - 24) * Math.PI);
    c.space = 0.6;
    const D = cast.diamond;
    if (b < 25 || b >= 30) {
      const spinUp = b < 25 ? 2.2 * TAU * (b - 24) ** 2 : 0;
      const back = b >= 30 ? pop(b, 30, 0.8) : 1;
      const wiggle = b >= 30.5 ? Math.sin((b - 30.5) * TAU) : 0;
      cast.placeStar(p, c.cam, { scale: BIG * back, spin: spinUp, squash: b < 25 ? 0.15 * Math.sin(b * 30) * (b - 24) : 0.2 * spring(b, 30, 2, 3),
        armL: b < 25 ? 0.6 : 0.8 + 0.2 * wiggle, armR: b < 25 ? 0.6 : 0.8 - 0.2 * wiggle,
        eyes: { sparkle: true, look: b >= 30.5 ? [0.5 * Math.sin((b - 30.5) * 2), 0.4] : [0, 0] }, mouth: { smile: 1, open: Math.max(0.3, sing.open), round: sing.round },
        glow: 1 + 0.6 * clamp(b - 24), sparkle: 1, sparkPhase: b * 4 });
    } else {
      cast.star.root.visible = false;
      const size = 0.5 * pop(b, 25, 0.7) * (1 - ease.in(invLerp(29.9, 30.05, b)));
      D.group.position.copy(p);
      faceCam(D.group, c.cam);
      D.set({ scale: Math.max(0.001, size), spin: (b - 25) * 1.1 + 4 * (1 - pop(b, 25, 1)), tilt: 0.12,
        beams: ramp(b, 28, 28.5) * (1 - ramp(b, 29.5, 29.95)), beamAngle: (b - 28) * 0.9,
        eyes: { sparkle: true, open: 1 - blink(b, [27.6]) }, mouth: { smile: 0.9, open: sing.open, round: sing.round }, glow: 0.9 });
      D.group.updateMatrixWorld();
      const corners = [v3(-0.62, 0.55, 0.3), v3(0.7, 0.3, 0.45), v3(0.2, 0.6, 0.5), v3(-0.3, -0.6, 0.45)];
      const at = [26, 26.2, 27, 27.15];
      cast.glints.forEach((g, i) => {
        const k = bump(b, at[i], 0.28);
        g.visible = k > 0.02;
        g.position.copy(D.group.localToWorld(corners[i].clone()));
        g.scale.setScalar(0.9 * k);
        g.material.rotation = b * 2;
      });
    }
    cast.burst.set(p, b - 25, { reach: 1.8, life: 1.3 });
    cast.ring.set(p, b - 25, c.cam, { radius: 2.4, life: 0.6 });
    if (b >= 30) { cast.burst2.set(p, b - 30, { reach: 1.5, life: 1.2 }); cast.ring.set(p, b - 30, c.cam, { radius: 2, life: 0.6 }); }
    c.fx.bloom = 0.95;
  },

  // 5 "Twinkle, twinkle, little star": boop, giggle, a tiny star gift, confetti cheer
  5(c) {
    const { b, cast } = c;
    if (b < 32.3) return swoop(c);
    applyCam(c);
    const B = cast.bunny;
    const sing = singing(b);
    // Pip
    const arms = keyed(b, [[32.3, ARMS.clasp], [36.7, ARMS.hold], [38, ARMS.cheer], [39.7, ARMS.hold]]);
    const head = keyed(b, [[32.3, [-0.06, 0.32, 0.05]], [34.6, [0.02, 0.12, -0.12]], [36.2, [0.12, 0.22, 0.05]], [38, [-0.25, 0.12, 0]]], 0.35, ease.inOut);
    const boop = bump(b, 34.05, 0.35);
    const giggle = ramp(b, 34.55, 34.7) * (1 - ramp(b, 35.7, 35.95));
    head[0] += -0.18 * spring(b, 34, 2, 4);
    head[2] += 0.12 * giggle * Math.sin(b * TAU * 3);
    let eyes = { sparkle: true, look: [0.6, 0.05], open: 1 - blink(b, [33.6, 37.6]), pupil: 1.05 };
    let mouth = { smile: 0.9, open: sing.open * 0.65, round: sing.round };
    let ears = { perk: 1 + 0.3 * spring(b, 33, 2.4, 3), wiggle: 0.25 * spring(b, 33, 3, 3) + 0.3 * giggle * Math.sin(b * TAU * 2.5), spread: 0 };
    if (boop > 0.05) { eyes = { ...eyes, happy: boop > 0.4 ? 1 : 0, squint: boop }; mouth = { smile: 0.6, open: 0.25 * boop, round: 1 }; }
    if (giggle > 0) { eyes = { ...eyes, happy: 1 }; mouth = { smile: 1, open: 0.35 + 0.2 * Math.abs(Math.sin(b * TAU * 3)), round: 0 }; }
    if (b >= 36.2 && b < 38) eyes = { ...eyes, look: [0.2, -0.45] };
    if (b >= 38) {
      const cheer = ramp(b, 38, 38.15);
      eyes = { ...eyes, happy: b < 38.9 ? 1 : 0, look: [0.3, 0.3] };
      mouth = { smile: 1, open: Math.max(0.7 * cheer, sing.open), round: 0, width: 1.1 };
      ears = { perk: 1.25, spread: 0.3 * cheer, wiggle: 0.2 * Math.sin(b * TAU * 2) };
    }
    const jump = b >= 38 && b < 39.6 ? 0.28 * Math.abs(Math.sin(Math.PI * (b - 38) * 1.25)) : 0;
    B.set({ head, armR: arms.R, armL: arms.L, ears, eyes, mouth, bob: 0.05 * hop(b) + jump, squash: 0.05 * giggle * Math.sin(b * TAU * 3), blush: 0.9 + 0.3 * giggle });
    // the nose squishes on the boop
    B.nose.scale.set(1.35 * (1 + 0.35 * boop), 0.95 * (1 - 0.3 * boop), 0.8 * (1 - 0.35 * boop));
    // Twinkle
    const p = SP5.clone();
    p.y += 0.05 * hop(b) + 0.12 * Math.abs(spring(b, 33, 1.5, 3)) + (b >= 38 && b < 39.6 ? 0.2 * Math.abs(Math.sin(Math.PI * (b - 38) * 1.25)) : 0);
    const lean = Math.min(ramp(b, 33.65, 34.0, ease.inOut), 1 - ramp(b, 34.3, 34.8, ease.inOut));
    p.lerp(NOSE.clone().add(v3(0.44, 0.0, 0.02)), lean);              // boops Pip's cheek from the side
    let sEyes = { sparkle: true, look: [-0.6, -0.05], open: 1 - blink(b, [35.9]) };
    let sMouth = { smile: 0.95, open: sing.open * 0.8, round: sing.round };
    if (giggle > 0) { sEyes = { happy: 1 }; sMouth = { smile: 1, open: 0.3 + 0.2 * Math.abs(Math.sin(b * TAU * 3)) }; }
    if (b >= 38) { sEyes = { sparkle: true, happy: b < 38.9 ? 1 : 0 }; sMouth = { smile: 1, open: Math.max(0.6, sing.open), width: 1.1 }; }
    const magic = ramp(b, 35.8, 36.1) * (1 - ramp(b, 36.9, 37.3));
    const cheerArms = b >= 38 ? 0.95 + 0.1 * Math.sin(b * 14) : 0;
    cast.placeStar(p, c.cam, {
      scale: SMALL, lean: 0.45 * lean + 0.1 * Math.sin(Math.PI * b) * (1 - lean), squash: beatBounce(b) * 0.7,
      armR: Math.max(0.6 * lean, cheerArms, 0.15 + 0.1 * Math.sin(Math.PI * b)), armL: Math.max(0.95 * magic, cheerArms, 0.15 - 0.1 * Math.sin(Math.PI * b)),
      legL: b >= 38 ? 0.3 : 0.08, legR: b >= 38 ? 0.3 : 0.08,
      eyes: sEyes, mouth: sMouth, glow: 1, sparkle: 0.3 + magic + bump(b, 38.2, 0.8), sparkPhase: b * 2,
    });
    cast.hearts.set(NOSE.clone().add(v3(0.16, 0.04, 0.03)), b - 34, { reach: 0.35, life: 1.1, gravity: -0.4, size: 0.6 });
    // the little star gift
    if (b >= 35.95) {
      const spawn = p.clone().add(v3(0.12, 0.32, 0.05));
      const u = ease.inOut(invLerp(36.4, 37.3, b));
      const gp = bezier(spawn, v3(0.25, 1.85, 1.75), HOLD, u);
      if (b >= 38) gp.y += 0.1 * Math.abs(Math.sin(Math.PI * (b - 38) * 1.25)) + 0.06;
      gp.y += 0.02 * Math.sin(b * Math.PI);
      cast.gift.root.visible = true;
      cast.gift.root.position.copy(gp);
      faceCam(cast.gift.root, c.cam);
      cast.gift.set({ scale: GIFT * pop(b, 35.95, 0.6), spin: 0.3 * Math.sin(b * 2), eyes: { sparkle: true }, mouth: { smile: 1, open: 0.2 + 0.3 * bump(b, 38.3, 0.5) }, glow: 1, sparkle: 0.6, sparkPhase: b * 3 });
      cast.burst2.set(spawn, b - 36, { reach: 0.45, life: 1.1, size: 0.45 });
    }
    // cheer
    cast.confetti.set(v3(0.25, 1.75, 1.45), (b - 38) * 0.75, { spread: 1.5, height: 0.75, life: 2.2 });
    cast.burst.set(v3(0.28, 1.75, 1.55), b - 38, { reach: 0.9, life: 1.3, size: 0.5 });
  },

  // 6 "How I wonder what you are": Pip yawns and falls asleep; Twinkle flies home, winks, twinkles out
  6(c) {
    const { b, cast } = c;
    applyCam(c);
    const B = cast.bunny;
    const sing = singing(b);
    const arms = keyed(b, [[40, ARMS.hold], [40.15, ARMS.rub], [41.3, ARMS.sill], [42.15, ARMS.stretch], [43.55, ARMS.sleep]], 0.4);
    const head = keyed(b, [[40, [0.06, 0.1, 0.15]], [42.15, [-0.32, 0, -0.05]], [43.55, [0.3, 0.1, 0.22]]], 0.5, ease.inOut);
    head[2] += 0.06 * Math.sin((b - 40) * Math.PI * 0.5) * (b < 42 ? 1 : 0);
    const asleep = ramp(b, 43.5, 44.1);
    let eyes = { open: lerp(0.5 - 0.35 * bump(b, 41.6, 0.4), 0, ramp(b, 42.1, 42.3)), look: [0.1, -0.1], sleep: b >= 42.1 ? 1 : 0 };
    let mouth = { smile: 0.7, open: sing.open * 0.6, round: sing.round };
    if (b >= 42.15 && b < 43.6) {
      const y = Math.min(ramp(b, 42.15, 42.5), 1 - ramp(b, 43.2, 43.6));
      mouth = { smile: 0.2, open: 0.7 * y, round: 0.8, width: 1 };
    }
    if (b >= 43.6) mouth = { smile: 0.45, open: 0, width: 0.55 };
    const ears = { perk: lerp(0.85, 0.55, asleep) + 0.25 * bump(b, 42.6, 0.6), flop: lerp(0.35, 0.6, asleep), wiggle: 0.06 * Math.sin(b * Math.PI) };
    const breathe = 0.04 * Math.sin((b - 44) * Math.PI * 0.5) * asleep;
    B.set({ head, armR: arms.R, armL: arms.L, ears, eyes, mouth, bob: lerp(0.03 * hop(b), -0.4, asleep) + breathe + 0.12 * bump(b, 42.7, 0.6), blush: 1 });
    // little star nightlight on the sill
    const gp = HOLD.clone().lerp(GIFT_SILL, ease.inOut(invLerp(40.1, 40.9, b)));
    gp.y += 0.015 * Math.sin(b * Math.PI);
    cast.gift.root.visible = true;
    cast.gift.root.position.copy(gp);
    faceCam(cast.gift.root, c.cam);
    cast.gift.set({ scale: GIFT, eyes: { sleep: ramp(b, 43.6, 43.8), open: 1 }, mouth: { smile: 0.8 }, glow: 0.8 + 0.25 * Math.sin(b * Math.PI), sparkle: 0.4, sparkPhase: b * 2 });
    // zzz
    cast.zzz.forEach((z, i) => {
      const u = mod((b - 44) / 2 + i / 3, 1);
      const on = b >= 44 + (i * 2) / 3;
      z.visible = on;
      z.position.copy(BUNNY_AT).add(v3(-0.18 - u * 0.3, 0.2 + u * 0.55, 0.15));
      z.scale.setScalar(0.06 + u * 0.1);
      z.material.opacity = Math.sin(u * Math.PI) * 0.95;
    });
    // Twinkle
    let p, scale = SMALL, eyesS = { look: [-0.55, -0.2], sparkle: true, open: 1 - blink(b, [41.2]) }, mouthS = { smile: 0.85, open: sing.open * 0.7, round: sing.round };
    let armL = 0.15 + 0.1 * Math.sin(Math.PI * b * 0.5), armR = 0.15 - 0.1 * Math.sin(Math.PI * b * 0.5), lean = 0.08 * Math.sin(Math.PI * b * 0.5), squash = 0, spin = 0;
    if (b < 45) {
      p = SP5.clone().add(v3(0.05, 0.04 * Math.sin(b * Math.PI * 0.5), 0));
      if (b >= 43.6) { eyesS = { happy: 1 }; mouthS = { smile: 0.9, open: 0.08 }; }
      p.lerp(SP5.clone().add(v3(0.15, 0.55, 0)), ease.inOut(invLerp(44.1, 45, b)));
      scale = lerp(SMALL, 0.38, ramp(b, 44.1, 45));
    } else if (b < 45.5) {
      p = zipPos(b);
      scale = lerp(0.38, BIG, ease.inOut(invLerp(45, 45.5, b)));
      squash = 0.3; armL = armR = -0.3;
      eyesS = { happy: 1 }; mouthS = { smile: 1, open: 0.4 };
      cast.trail.set(zipPos, b, Math.min(0.5, b - 44.95), c.cam, { width: 0.18, fade: 1 });
    } else {
      p = HOME.clone();
      p.y += 0.06 * hop(b) * (1 - ramp(b, 46.8, 47.2));
      squash = 0.22 * spring(b, 45.5, 2, 4) + beatBounce(b) * 0.4;
      const wave = b >= 45.9 && b < 47 ? Math.sin((b - 45.9) * TAU * 2.5) : 0;
      armL = b >= 45.9 && b < 47 ? 0.95 + 0.35 * wave : 0.3;
      armR = 0.2;
      lean = 0.06 * wave;
      eyesS = { sparkle: true, wink: b >= 46 && b < 46.8 ? 'R' : undefined };
      mouthS = { smile: 1, open: Math.max(sing.open, 0.15), round: sing.round };
      // shrink back into the twinkle that opens the loop
      const out = ease.in(invLerp(47.0, 47.85, b));
      scale = BIG * (1 - out);
      spin = TAU * 1.5 * out * out;
      armL = lerp(armL, 0.9, out); armR = lerp(armR, 0.9, out);
      cast.twinklePoint(p, ramp(b, 47.25, 47.85), b);
    }
    cast.placeStar(p, c.cam, { scale: Math.max(0.001, scale), armL, armR, lean, squash, spin, eyes: eyesS, mouth: mouthS, glow: 1, sparkle: 0.3 + bump(b, 46.2, 0.6) + ramp(b, 47, 47.6), sparkPhase: b * 2 });
    cast.burst2.set(HOME, b - 47.3, { reach: 1.1, life: 0.9, gravity: 0, size: 0.6 });
  },
};

/** b 31.5–32.3: Twinkle dives from the sky to the window (spans shots 4 and 5). */
function swoop(c) {
  const { b, cast } = c;
  applyCam(c);
  const p = swoopPos(b);
  const u = invLerp(31.5, 32.3, b);
  cast.placeStar(p, c.cam, { scale: lerp(BIG, SMALL, ease.inOut(u)), squash: 0.25 * Math.sin(Math.PI * u), armL: -0.35, armR: -0.35, legL: -0.1, legR: -0.1,
    eyes: { happy: 1 }, mouth: { smile: 1, open: 0.45 }, glow: 1.1, sparkle: 1, sparkPhase: b * 3 });
  cast.trail.set(swoopPos, b, Math.min(0.6, b - 31.48), c.cam, { width: 0.26, fade: 1 - ramp(b, 32.1, 32.3) });
  c.space = 0.6 * (1 - u);
}

// ───────────── karaoke lyrics ─────────────
const BREAKS = [4, 4, 3, 4, 4, 4];         // tokens on the first row of each line
const ROW_Y = [1276, 1400];
const PRE = 0.3;                            // a line pops in this many beats before it is sung
let LAYOUTS = null;

function drawBall(g, w, h) {
  const cx = w / 2, cy = h / 2;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 16 : 36; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,210,90,0.95)'; g.shadowBlur = 16;
  g.fillStyle = '#ffe14d'; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 7; g.strokeStyle = '#c2185b'; g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(cx - 7, cy - 6, 6, 4, -0.6, 0, TAU); g.fill();
}

export function lyrics(hud, b) {
  if (!LAYOUTS) LAYOUTS = LYRICS.map((l, i) => layoutLine(l, hud, BREAKS[i]));
  for (const line of LYRICS) {
    const rel = mod(b - line.start + PRE, 48) - PRE;         // beats since the line's first syllable
    if (rel >= 8 - PRE) continue;
    const toks = LAYOUTS[line.index];
    const exit = 1 - ease.in(clamp((rel - (8 - PRE - 0.18)) / 0.18));
    const centre = (tk) => tk.x + tk.w / 2;
    toks.forEach((tk, i) => {
      const s = tk.syl, u = rel - s.beat;
      const appear = clamp((rel + PRE - i * 0.035) / 0.26);
      if (appear <= 0) return;
      const active = u >= 0 && u < s.len;
      let scale = tk.fit * ease.outBack(appear) * exit;
      let y = ROW_Y[tk.row];
      if (active) { scale *= 1.1 + 0.14 * Math.exp(-u * 6); y -= 10 * Math.exp(-u * 5); }
      const glyphW = tk.w / tk.fit;
      hud.token(tk.text, centre(tk) - (glyphW * scale) / 2, y, { id: `${line.index}.${i}`, style: u >= 0 ? ACTIVE_STYLE : LYRIC_STYLE, scale, rot: active ? 0.04 * Math.sin(u * 9) * Math.exp(-u * 3) : 0 });
    });
    // bouncing star: lands on each syllable as it is sung
    let i = toks.findIndex((tk) => rel >= tk.syl.beat && rel < tk.syl.beat + tk.syl.len);
    let x, y, rot = rel * 2;
    const top = (tk) => ROW_Y[tk.row] - 80;
    if (i < 0) { x = centre(toks[0]); y = top(toks[0]) - 160 * (clamp(-rel / PRE)) ** 2; }
    else if (i < toks.length - 1) {
      const a = toks[i], n = toks[i + 1], u = (rel - a.syl.beat) / (n.syl.beat - a.syl.beat);
      x = lerp(centre(a), centre(n), u);
      y = lerp(top(a), top(n), u) - 60 * 4 * u * (1 - u);
    } else {
      const a = toks[i];
      x = centre(a);
      y = top(a) - 45 * Math.abs(Math.sin(Math.PI * (rel - a.syl.beat)));
    }
    hud.image('ball', 96, 96, drawBall, x, y, { scale: 0.75 * exit * ease.outBack(clamp((rel + PRE) / 0.26)), rot: 0.25 * Math.sin(rot) });
  }
}

/** Full-frame flashes: the pop, the cloud fly-through, the diamond, the poof. */
export function flashes(hud, b) {
  const f = (at, peak, dur, color = '#ffffff') => { const u = b - at; if (u >= 0 && u < dur) hud.fade(color, peak * (1 - u / dur) ** 2); };
  f(0, 0.7, 0.45);
  f(6, 0.22, 0.35);
  const cloud = Math.min(ramp(b, 16.95, 17.3), 1 - ramp(b, 17.5, 17.95));
  if (cloud > 0) hud.fade('#fff0fa', cloud);
  f(25, 0.85, 0.5);
  f(30, 0.35, 0.35);
}
