// Tileable 3D noise baked into a texture once at start-up. Sampling this is
// far cheaper than evaluating procedural fbm per pixel (which matters a lot
// when frames are rendered on a CPU rasteriser).
//   R, G, B : three independent fbm fields (camo blobs at three scales)
//   A       : fine two-octave noise (fabric micro-bump)
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function lattice(L, rnd) {
  const a = new Float32Array(L * L * L);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

// periodic value noise with L cells per tile, evaluated on an N^3 grid
function addOctave(out, N, L, amp, rnd) {
  const lat = lattice(L, rnd);
  const idx = new Int32Array(N * 2);
  const frac = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / N) * L;
    const i0 = Math.floor(x);
    const f = x - i0;
    idx[i * 2] = i0 % L;
    idx[i * 2 + 1] = (i0 + 1) % L;
    frac[i] = f * f * (3 - 2 * f);
  }
  let o = 0;
  for (let z = 0; z < N; z++) {
    const z0 = idx[z * 2] * L * L;
    const z1 = idx[z * 2 + 1] * L * L;
    const fz = frac[z];
    for (let y = 0; y < N; y++) {
      const y0 = idx[y * 2] * L;
      const y1 = idx[y * 2 + 1] * L;
      const fy = frac[y];
      for (let x = 0; x < N; x++) {
        const x0 = idx[x * 2];
        const x1 = idx[x * 2 + 1];
        const fx = frac[x];
        const a = lat[z0 + y0 + x0] + (lat[z0 + y0 + x1] - lat[z0 + y0 + x0]) * fx;
        const b = lat[z0 + y1 + x0] + (lat[z0 + y1 + x1] - lat[z0 + y1 + x0]) * fx;
        const c = lat[z1 + y0 + x0] + (lat[z1 + y0 + x1] - lat[z1 + y0 + x0]) * fx;
        const d = lat[z1 + y1 + x0] + (lat[z1 + y1 + x1] - lat[z1 + y1 + x0]) * fx;
        const ab = a + (b - a) * fy;
        const cd = c + (d - c) * fy;
        out[o++] += (ab + (cd - ab) * fz) * amp;
      }
    }
  }
}

let cached = null;
export function noiseTexture() {
  if (cached) return cached;
  const N = 64;
  const rnd = mulberry32(4242);
  const chan = (octaves) => {
    const f = new Float32Array(N * N * N);
    for (const [L, amp] of octaves) addOctave(f, N, L, amp, rnd);
    return f;
  };
  const r = chan([[4, 0.5], [8, 0.25], [16, 0.125], [32, 0.0625]]);
  const g = chan([[7, 0.5], [14, 0.25], [28, 0.125], [32, 0.0625]]);
  const b = chan([[12, 0.5], [24, 0.25], [32, 0.19]]);
  const a = chan([[16, 0.62], [32, 0.38]]);
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) {
    data[i * 4] = Math.min(255, r[i] * 272);
    data[i * 4 + 1] = Math.min(255, g[i] * 272);
    data[i * 4 + 2] = Math.min(255, b[i] * 272);
    data[i * 4 + 3] = Math.min(255, a[i] * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
