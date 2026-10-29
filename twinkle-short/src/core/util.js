// Pure, deterministic helpers. Nothing in the animation may depend on wall-clock
// time or Math.random(): every value is derived from the master timeline time `t`.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Eased 0..1 progress of `t` between `a` and `b`. */
export const ramp = (t, a, b, fn = smooth) => fn(invLerp(a, b, t));
/** Rises over [a,a+fi], holds, falls over [b-fo,b]. Used for text/visibility envelopes. */
export const envelope = (t, a, b, fi = 0.2, fo = 0.2) => Math.min(ramp(t, a, a + fi), 1 - ramp(t, b - fo, b));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth deterministic 1D noise in [-1,1] (sum of incommensurate sines). */
export const wobble = (t, seed = 0) =>
  (Math.sin(t * 1.7 + seed * 3.1) * 0.5 + Math.sin(t * 2.9 + seed * 1.3) * 0.3 + Math.sin(t * 5.3 + seed * 7.7) * 0.2);

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Quaternion that maps a local (forward, up) frame onto a target (forward, up) frame. */
export function quatFromFrames(fromFwd, fromUp, toFwd, toUp) {
  const basis = (f, u) => {
    const z = f.clone().normalize();
    const x = new THREE.Vector3().crossVectors(u, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const m1 = basis(fromFwd, fromUp);
  const m2 = basis(toFwd, toUp);
  const m = m2.multiply(m1.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** Deterministic camera shake offset. */
export function shake(t, amp, freq = 1) {
  return new THREE.Vector3(wobble(t * freq * 6, 1) * amp, wobble(t * freq * 6, 2) * amp, wobble(t * freq * 6, 3) * amp * 0.5);
}

/** Catmull-Rom style keyframe interpolation for vectors: keys = [[time, Vector3], ...]. */
export function keyVec(t, keys, fn = smooth) {
  if (t <= keys[0][0]) return keys[0][1].clone();
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) return a.clone().lerp(b, fn(invLerp(t0, t1, t)));
  }
  return keys[keys.length - 1][1].clone();
}
export function keyNum(t, keys, fn = smooth) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) return lerp(a, b, fn(invLerp(t0, t1, t)));
  }
  return keys[keys.length - 1][1];
}

// ───────────── cartoon-motion helpers (all pure functions of the beat clock) ─────────────
/** Beats elapsed since `at` (0 before it). */
export const since = (b, at) => Math.max(0, b - at);
/** Damped spring after an impulse at `at`: 0 before, oscillates and settles to 0. */
export const spring = (b, at, freq = 2.2, damp = 4.5) => {
  const d = b - at;
  return d < 0 ? 0 : Math.exp(-damp * d) * Math.sin(2 * Math.PI * freq * d);
};
/** Elastic pop from 0 → 1 starting at `at`, taking `dur` beats (overshoots, settles). */
export const pop = (b, at, dur = 0.6) => {
  const u = clamp((b - at) / dur);
  return u <= 0 ? 0 : u >= 1 ? 1 : ease.outElastic(u);
};
/** Smooth 0→1→0 bump centred on `at` with half-width `w` beats. */
export const bump = (b, at, w = 0.5) => Math.max(0, 1 - ((b - at) / w) ** 2) ** 2;
/** Hop: |sin| bounce every beat (0 on the beat, 1 between beats). */
export const hop = (b) => Math.abs(Math.sin(Math.PI * b));
/** Shortest angle difference. */
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
