// Where every piece, the camera and the post effects are at time t.
// All pure functions of t (no accumulated state).
import { clamp, sat, lerp, prog, smooth, ease, kick, wobble, noise1, DEG } from './util.js';

const X0 = 9.0; // how far off-screen-left a piece starts
export const SET = { scale: 0.56, y: 0.3 }; // full-set group transform in the finale

const bell = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * prog(t, a, b)));

// ---------------------------------------------------------------- pieces --
export function pieceState(p, piece, t, TL) {
  const F = TL.finale;
  const landK = F.lands[p.index];
  const st = { visible: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, sweepY: -1000, sweepGlow: 0, flash: 0, mode: 'solo', green: 0 };

  if (t >= landK - F.flyIn) {
    // ---- finale: fly into the head-to-toe loadout ----
    st.mode = 'set';
    st.visible = true;
    const q = prog(t, landK - F.flyIn, landK);
    const spin = Math.PI * 2 * ease.inOutCubic(prog(t, F.sweepStart, F.sweepEnd));
    const gy = 0.5 * Math.sin((t - F.T) * 0.62 - 0.9) + spin + 0.25 * kick(t, F.slam, 0.35);
    const [sx, sy, sz] = piece.setPos;
    const c = Math.cos(gy);
    const s = Math.sin(gy);
    st.x = (sx * c + sz * s) * SET.scale - X0 * Math.pow(1 - q, 1.6) + 0.25 * wobble(t, landK, 3.4, 0.13);
    st.y = sy * SET.scale + SET.y + 0.03 * Math.sin(t * 2.0 + p.index);
    st.z = (-sx * s + sz * c) * SET.scale;
    st.yaw = gy + piece.setYaw - Math.pow(1 - q, 2) * 5.0;
    st.roll = -0.5 * (1 - q);
    st.scale = piece.setScale * SET.scale * (lerp(0.6, 1, ease.outCubic(q)) + 0.3 * kick(t, landK, 0.07) + 0.1 * kick(t, F.slam, 0.12));
    const y0 = SET.y - 3.85 * SET.scale;
    const y1 = SET.y + 3.5 * SET.scale;
    if (t >= F.sweepEnd) st.sweepY = 1000;
    else if (t >= F.sweepStart) st.sweepY = lerp(y0, y1, prog(t, F.sweepStart, F.sweepEnd));
    st.sweepGlow = bell(t, F.sweepStart - 0.02, F.sweepEnd + 0.06) > 0 ? 1 : 0;
    st.flash = kick(t, F.sweepEnd, 0.2) + kick(t, F.slam, 0.22);
    st.green = t >= F.sweepEnd ? 1 : prog(t, F.sweepStart, F.sweepEnd);
    return st;
  }

  if (t < p.enterStart || t > p.exitEnd) return st;
  st.visible = true;
  const q = prog(t, p.enterStart, p.land);
  const qx = prog(t, p.exitStart, p.exitEnd);
  st.x = -X0 * Math.pow(1 - q, 1.6) + 0.42 * wobble(t, p.land, 3.2, 0.15) + X0 * ease.inCubic(qx);
  st.y = 0.05 * Math.sin((t - p.land) * 2.3);
  st.yaw =
    piece.yaw +
    0.34 * Math.max(0, t - p.land) -
    Math.pow(1 - q, 2) * 6.5 +
    Math.PI * 2 * ease.inOutCubic(prog(t, p.sweepStart, p.sweepEnd)) +
    0.45 * kick(t, p.slam, 0.3) +
    qx * qx * 2.8;
  st.pitch = 0.1 * wobble(t, p.land, 2.6, 0.2);
  st.roll = -0.55 * (1 - q) - 0.16 * wobble(t, p.land, 3.2, 0.2) - 0.5 * qx;
  st.scale = (lerp(0.55, 1, ease.outCubic(q)) + 0.16 * kick(t, p.land, 0.08) + 0.14 * kick(t, p.slam, 0.11)) * (1 - 0.3 * qx);
  const h = piece.halfH + 0.3;
  if (t >= p.sweepEnd) st.sweepY = 1000;
  else if (t >= p.sweepStart) st.sweepY = lerp(-h, h, prog(t, p.sweepStart, p.sweepEnd));
  st.sweepGlow = t >= p.sweepStart - 0.02 && t <= p.sweepEnd + 0.05 ? 1 : 0;
  st.flash = kick(t, p.sweepEnd, 0.18) + 0.9 * kick(t, p.slam, 0.18);
  st.green = t >= p.sweepEnd ? 1 : prog(t, p.sweepStart, p.sweepEnd);
  return st;
}

// ---------------------------------------------------------------- camera --
// Orbit rig around `target`: yaw/pitch in degrees.
export function cameraState(t, TL) {
  const b = TL.beat;
  const F = TL.finale;
  let c;
  const firstOwn = TL.pieces[0].T - 0.5 * b;
  if (t < firstOwn) {
    // hook: crane down out of the burning skyline into the hero frame
    const q = ease.inOutCubic(prog(t, 0, firstOwn));
    c = {
      yaw: lerp(-22, 9, q),
      pitch: lerp(9, -5, q),
      dist: lerp(27, 10.4, q),
      ty: lerp(5.5, -0.42, q),
      fov: lerp(52, 34, q),
      roll: lerp(7, -2, q),
    };
  } else if (t < F.T - 0.5 * b) {
    const i = clamp(Math.floor((t - firstOwn) / (TL.pieces[1].T - TL.pieces[0].T)), 0, TL.pieces.length - 1);
    const p = TL.pieces[i];
    const s = i % 2 ? 1 : -1;
    if (t < p.sweepStart) {
      // A: whip in + impact
      const q = ease.outCubic(prog(t, p.T - 0.5 * b, p.T + 0.6 * b));
      c = { yaw: s * lerp(-9, -3, q), pitch: -5, dist: lerp(10.4, 12.1, q), ty: -0.42, fov: 34, roll: s * lerp(2, 3.2, q) };
    } else if (t < p.sweepEnd) {
      // B: hard cut to a moving close-up while the scan turns it green
      const q = prog(t, p.sweepStart, p.sweepEnd);
      const pitch = [16, -6, -14, 12, -8, 18][i % 6];
      c = { yaw: s * lerp(46, 18, q), pitch: lerp(pitch, pitch * 0.5, q), dist: lerp(7.6, 6.6, q), ty: lerp(-0.5, 0.35, q), fov: 40, roll: s * lerp(9, 5, q) };
    } else if (t < p.slam) {
      // C: cut back, slow push while the counter runs
      const q = prog(t, p.countStart, p.countEnd);
      c = { yaw: s * lerp(-13, -5, q), pitch: -4.5, dist: lerp(12.3, 11.2, ease.inQuad(q)), ty: -0.42, fov: 34, roll: s * lerp(2.2, 0, q) };
    } else {
      // D: price lands -> punch, then drift into the next whip
      const q = prog(t, p.slam, p.T + 7.5 * b);
      c = { yaw: s * lerp(-5, 9, ease.inOutCubic(q)), pitch: -5, dist: lerp(10.9, 10.4, q), ty: -0.42, fov: 34, roll: s * lerp(0, -2, q) };
    }
  } else {
    const s = 1;
    if (t < F.sweepStart) {
      const q = ease.outCubic(prog(t, F.T - 0.5 * b, F.T + 2.5 * b));
      c = { yaw: s * lerp(9, -8, q), pitch: -4, dist: lerp(10.4, 12.9, q), ty: -0.42, fov: 34, roll: lerp(-2, 1.5, q) };
    } else if (t < F.sweepEnd) {
      // crane up the whole set with the scan line
      const q = prog(t, F.sweepStart, F.sweepEnd);
      c = { yaw: lerp(38, 16, q), pitch: lerp(-14, 8, q), dist: lerp(8.0, 7.2, q), ty: lerp(-1.3, 1.5, q), fov: 40, roll: lerp(8, 4, q) };
    } else if (t < F.slam) {
      const q = prog(t, F.countStart, F.countEnd);
      c = { yaw: lerp(-12, -2, q), pitch: -4, dist: lerp(13.6, 12.4, ease.inQuad(q)), ty: -0.42, fov: 34, roll: lerp(2, 0, q) };
    } else {
      const q = prog(t, F.slam, F.end);
      c = { yaw: lerp(-2, 15, ease.outCubic(q)), pitch: -4.5, dist: lerp(12.1, 11.5, q), ty: -0.42, fov: 34, roll: lerp(0, -1.5, q) };
    }
  }
  // hand-held drift
  c.yaw += 0.7 * noise1(t * 0.7, 1);
  c.pitch += 0.45 * noise1(t * 0.6, 2);
  c.roll += 0.35 * noise1(t * 0.5, 3);
  return c;
}

// ------------------------------------------------------------------ post --
export function postState(t, TL) {
  const F = TL.finale;
  let shake = 0.0012;
  let zoom = 1.045;
  let ca = 0.0014;
  let dirBlur = 0;
  let zoomBlur = 0;
  let glitch = 0;
  const flash = [0, 0, 0];
  const addFlash = (k, r, g, b) => {
    flash[0] += k * r;
    flash[1] += k * g;
    flash[2] += k * b;
  };

  for (const p of TL.pieces) {
    if (t < p.enterStart - 0.2 || t > p.end + 0.3) continue;
    shake += 0.015 * kick(t, p.land, 0.15) + 0.02 * kick(t, p.slam, 0.19) + 0.006 * kick(t, p.sweepEnd, 0.1);
    zoom += 0.055 * kick(t, p.land, 0.09) + 0.085 * kick(t, p.slam, 0.12);
    if (t >= p.countStart && t < p.slam) zoom += 0.03 * Math.pow(prog(t, p.countStart, p.countEnd), 2);
    dirBlur = Math.max(dirBlur, 0.05 * bell(t, p.enterStart - 0.04, p.land + 0.03), 0.05 * bell(t, p.exitStart, p.exitEnd + 0.05));
    zoomBlur += 0.03 * kick(t, p.land, 0.06) + 0.06 * kick(t, p.slam, 0.08);
    addFlash(0.34 * kick(t, p.land, 0.045), 1.0, 0.8, 0.6);
    addFlash(0.42 * kick(t, p.slam, 0.06), 0.55, 1.0, 0.65);
    addFlash(0.16 * kick(t, p.sweepEnd, 0.05), 0.4, 1.0, 0.55);
  }
  // hook words
  for (const l of TL.hook.lines) {
    shake += 0.01 * kick(t, l.t, 0.12);
    zoom += 0.03 * kick(t, l.t, 0.1);
    addFlash(0.12 * kick(t, l.t, 0.04), 1.0, 0.85, 0.7);
  }
  // finale
  if (t > F.T - 0.5) {
    for (const tl of F.lands) {
      shake += 0.009 * kick(t, tl, 0.1);
      zoom += 0.03 * kick(t, tl, 0.07);
      dirBlur = Math.max(dirBlur, 0.025 * bell(t, tl - F.flyIn, tl + 0.02));
      addFlash(0.14 * kick(t, tl, 0.04), 1.0, 0.8, 0.6);
    }
    shake += 0.034 * kick(t, F.slam, 0.3) + 0.008 * kick(t, F.sweepEnd, 0.1);
    zoom += 0.12 * kick(t, F.slam, 0.16);
    if (t >= F.countStart && t < F.slam) zoom += 0.045 * Math.pow(prog(t, F.countStart, F.countEnd), 2);
    zoomBlur += 0.09 * kick(t, F.slam, 0.1);
    addFlash(0.6 * kick(t, F.slam, 0.07), 0.6, 1.0, 0.7);
    addFlash(0.2 * kick(t, F.sweepEnd, 0.05), 0.4, 1.0, 0.55);
  }
  for (const tc of TL.cuts) {
    const k = kick(t, tc, 0.045);
    glitch += k;
    ca += 0.012 * k;
    zoom += 0.02 * k;
  }
  ca += 0.45 * shake;
  // fade in / out
  const fade = smooth(0, 0.12, t) * (1 - smooth(TL.duration - 0.25, TL.duration, t));
  return {
    shakeX: shake * noise1(t * 37, 11),
    shakeY: shake * noise1(t * 37, 23),
    roll: shake * 0.9 * noise1(t * 29, 5),
    zoom,
    ca,
    dirBlur,
    zoomBlur,
    glitch: sat(glitch),
    flash,
    fade,
  };
}

export { DEG };
