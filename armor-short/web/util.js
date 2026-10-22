// Small math / easing / randomness helpers shared by every module.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);

export const eOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const eOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const eInCubic = (t) => t * t * t;
export const eInQuad = (t) => t * t;
export const eOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const eInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const eOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// Damped spring kick: 0 at dt=0, rises, oscillates and dies out.
export const spring = (dt, freq = 18, decay = 7) => (dt < 0 ? 0 : Math.sin(dt * freq) * Math.exp(-dt * decay));
// Sharp attack, exponential release envelope.
export const pulse = (dt, decay = 8, attack = 0.02) =>
  dt < -attack ? 0 : dt < 0 ? 1 + dt / attack : Math.exp(-dt * decay);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic smooth 1D noise (sum of sines) for camera shake etc.
export const wobble = (t, seed = 0) =>
  Math.sin(t * 37.1 + seed * 1.7) * 0.5 + Math.sin(t * 23.3 + seed * 4.1) * 0.3 + Math.sin(t * 61.7 + seed * 2.9) * 0.2;

export const fmtMoney = (n) => Math.round(n).toLocaleString('en-US');

// GLSL value noise + fbm, shared by the shader materials.
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v += a*vnoise(p); p = m*p; a *= .5; } return v; }
float fbm3(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<3;i++){ v += a*vnoise(p); p = m*p; a *= .5; } return v * 1.14; }
`;
