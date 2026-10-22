// Scene orchestration: builds the world, then renders any time `t` on demand.
// window.SHORT.renderAt(t) is what the frame-capture script drives.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPiece } from './armor.js';
import { createWar } from './war.js';
import { buildTimeline, L, O } from './timeline.js';
import { EditShader } from './post.js';
import { createHud } from './hud.js';
import { clamp, lerp, prog, eOutCubic, eInCubic, eInOutCubic, spring, pulse, wobble } from './util.js';

const PI = Math.PI;
const cfg = await (await fetch('config.json')).json();
const TL = buildTimeline(cfg);
const W = cfg.width, H = cfg.height;

const stage = document.getElementById('stage');
const fitStage = () => {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = s < 1 ? `scale(${s})` : '';
};
fitStage();
addEventListener('resize', fitStage);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 1200);

// ---- World.
const war = createWar(scene, TL);

// ---- Armor lighting (warm fire key, hot rims, cool fill, green glow).
// Short-range point lights so they sculpt the armor without flooding the set.
// Spots aimed at the hero so their spill lands off-screen.
const spot = (color, intensity, pos) => {
  const s = new THREE.SpotLight(color, intensity, 24, 0.3, 0.6, 1.2);
  s.position.set(...pos);
  s.target.position.set(0, 0.55, 0);
  scene.add(s.target);
  return s;
};
const key = spot(0xffd2a8, 55, [-4, 2.5, 8]);
const rim = spot(0xff7a30, 120, [5, 6, -4]);
const rim2 = spot(0xff5a1e, 70, [-5.5, 5, -4]);
const fill = new THREE.PointLight(0x86a6ff, 11, 20, 1.2);
fill.position.set(4, -1, 7);
const greenLight = new THREE.PointLight(0x40ff70, 0, 10, 1.4);
greenLight.position.set(0, 0.8, 3);
scene.add(key, rim, rim2, fill, greenLight);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---- Pieces.
const BASE_Y = 0.55;
const OUTRO_LAYOUT = [
  { x: -1.0, y: 1.72, s: 0.37 },
  { x: 0.02, y: 1.66, s: 0.43 },
  { x: 1.02, y: 1.7, s: 0.37 },
  { x: -0.56, y: 0.5, s: 0.4 },
  { x: 0.58, y: 0.5, s: 0.4 },
];
const pieces = TL.pieces.map((p, i) => {
  const pc = createPiece(p.model);
  pc.root.traverse((o) => {
    if (o.isMesh) {
      o.material.envMap = envTex;
      o.material.envMapIntensity = o.material.metalness > 0.5 ? 0.8 : 0.12;
    }
  });
  pc.root.visible = false;
  scene.add(pc.root);
  return { ...p, ...pc, layout: OUTRO_LAYOUT[i] };
});

// ---- Post.
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const edit = new ShaderPass(EditShader);
composer.addPass(edit);

const hud = createHud(cfg, TL);

// ---- FX envelope from the edit list.
function fxAt(t) {
  const f = { shake: 0, zoom: 0, ca: 0, flash: 0, flashCol: [1, 1, 1], invert: 0, zblur: 0, glitch: 0 };
  let best = 0;
  for (const h of TL.hits) {
    const dt = t - h.t;
    if (dt < 0 || dt > 3) continue;
    const e = Math.exp(-dt * h.decay);
    f.shake += (h.shake || 0) * e;
    f.zoom += (h.zoom || 0) * Math.exp(-dt * h.decay * 0.7);
    f.ca += (h.ca || 0) * e;
    f.zblur += (h.zblur || 0) * Math.exp(-dt * h.decay * 1.8);
    f.glitch += (h.glitch || 0) * Math.exp(-dt * h.decay * 1.1);
    const fl = (h.flash || 0) * Math.exp(-dt * h.decay * 1.6);
    f.flash += fl;
    if (fl > best) { best = fl; f.flashCol = h.flashCol || [1, 1, 1]; }
    if (h.invert && dt < 1 / TL.fps) f.invert = 1;
  }
  return f;
}

// ---- Piece choreography.
const entryCurve = (p) => p * (2 - p) * 0.6 + p * 0.4; // fast in, still moving on impact
function pieceTransform(P, t) {
  const r = P.root, U = P.fx;
  U.uTime.value = t;
  const oS = TL.outroStart;
  if (t >= oS - 0.4 && t >= P.t0 + 4) {
    // Outro: fly into the loadout grid, already green.
    const land = oS + O.land0 + P.i * O.landStep;
    const lay = P.layout;
    if (t < land - 0.38) return (r.visible = false);
    r.visible = true;
    let x, y, ry, rz = 0, s = lay.s;
    if (t < land) {
      const k = 1 - entryCurve(prog(t, land - 0.38, land));
      x = lay.x - 4.8 * k; y = lay.y + k * 0.6; ry = -k * PI * 1.5; rz = k * 0.4;
    } else {
      const tau = t - land;
      x = lay.x + 0.25 * Math.sin(tau * 16) * Math.exp(-tau * 6);
      y = lay.y + 0.04 * Math.sin(t * 2 + P.i);
      ry = tau * 0.5 + Math.sin(t * 0.7 + P.i) * 0.2;
      rz = -0.08 * spring(tau, 13, 5);
      s *= 1 + 0.1 * spring(tau, 22, 7) + 0.12 * pulse(t - (oS + O.count1), 5);
    }
    r.position.set(x, y, 0);
    r.rotation.set(0, ry, rz);
    r.scale.setScalar(s);
    U.uGreen.value = 1; U.uScan.value = 99; U.uEdge.value = 0;
    U.uPulse.value = 0.12 + pulse(t - (oS + O.count1), 3) * 0.6;
    return true;
  }
  const lt = t - P.t0;
  if (lt < 0 || lt >= 4) return (r.visible = false);
  r.visible = true;
  let x, y = BASE_Y, ry, rz, s = 1;
  if (lt < L.impact) {
    const k = 1 - entryCurve(lt / L.impact);
    x = -4.8 * k; y += k * 0.7; ry = -k * PI * 1.4; rz = k * 0.45;
  } else {
    const tau = lt - L.impact;
    x = 0.35 * Math.sin(tau * 16) * Math.exp(-tau * 6);
    y += 0.05 * Math.sin(tau * 2.3);
    ry = tau * 0.42 + 0.12 * spring(tau, 10, 4);
    rz = -0.1 * spring(tau, 13, 5);
    s = 1 + 0.08 * spring(tau, 22, 7) + 0.07 * pulse(lt - L.count1, 7) + 0.04 * pulse(lt - L.scan1, 8);
  }
  if (lt > L.exit0) {
    const q = eInCubic(prog(lt, L.exit0, 4));
    x += q * 9; ry += q * 2.2; rz -= q * 0.35; s *= 1 + q * 0.25;
  }
  r.position.set(x, y, 0);
  r.rotation.set(0, ry, rz);
  r.scale.setScalar(s);
  const sp = prog(lt, L.scan0, L.scan1);
  U.uGreen.value = lt >= L.scan0 ? 1 : 0;
  U.uScan.value = sp < 1 ? lerp(BASE_Y - 1.5, BASE_Y + 1.6, eInOutCubic(sp)) : 99;
  U.uEdge.value = sp > 0 && sp < 1 ? 1 : clamp(1 - (lt - L.scan1) * 8) * (lt > L.scan1 ? 1 : 0);
  U.uPulse.value = pulse(lt - L.scan1, 6) * 0.9 + pulse(lt - L.count1, 5) * 1.2;
  return true;
}

function renderAt(t) {
  const fx = fxAt(t);

  // Pieces + horizontal whip blur from the hero piece's screen velocity.
  let heroX = 0, green = 0, gpulse = 0;
  for (const P of pieces) {
    if (pieceTransform(P, t) && t < TL.outroStart) {
      heroX = P.root.position.x;
      green = P.fx.uGreen.value;
      gpulse = P.fx.uPulse.value;
    }
  }
  if (t >= TL.outroStart) { green = 1; gpulse = pieces[0].fx.uPulse.value; }
  const vx = Math.abs(xAt(t) - xAt(t - 1 / TL.fps));
  const hblur = clamp(vx * 0.11, 0, 0.13);
  greenLight.intensity = green * (12 + gpulse * 50);

  // Camera: intro push-in, slow creep per piece, shake, zoom punches, roll.
  const p0 = TL.pieces[0].t0;
  let cz, cy = -0.3;
  if (t < p0) {
    const p = eOutCubic(prog(t, 0, 2.3));
    cz = lerp(14, 10.6, p);
    cy = lerp(-1.0, -0.3, p);
  } else if (t < TL.outroStart) {
    cz = 10.6 - 0.5 * (((t - p0) % cfg.pieceDuration) / cfg.pieceDuration);
  } else {
    cz = lerp(10.9, 10.4, prog(t, TL.outroStart, TL.duration));
  }
  const s = fx.shake;
  const cx = Math.sin(t * 0.45) * 0.12 + wobble(t, 1) * s * 0.11;
  cy += wobble(t, 2) * s * 0.11;
  camera.position.set(cx, cy, cz);
  camera.lookAt(cx * 0.3, BASE_Y, 0);
  camera.rotateZ(wobble(t * 0.8, 3) * s * 0.025 + hblur * 0.25 * Math.sign(heroX || 1));
  camera.fov = 30 * (1 - clamp(fx.zoom, -0.3, 0.35));
  camera.updateProjectionMatrix();

  war.update(t, camera);

  const u = edit.uniforms;
  u.uSeed.value = (Math.floor(t * TL.fps) * 0.618) % 1;
  u.uCA.value = fx.ca + hblur * 0.06;
  u.uZoomBlur.value = clamp(fx.zblur, 0, 0.35);
  u.uHBlur.value = hblur;
  u.uGlitch.value = clamp(fx.glitch) * (u.uSeed.value > 0.25 ? 1 : 0.3);
  u.uInvert.value = fx.invert;
  u.uFlash.value = 0;

  hud.update(t, fx);
  composer.render();
}
// Hero x at an arbitrary time (for velocity), without touching uniforms.
function xAt(t) {
  if (t >= TL.outroStart - 0.4 && t >= TL.pieces[TL.pieces.length - 1].t0 + 4) {
    const land = TL.outroStart + O.land0 + 2 * O.landStep;
    return -4.8 * (1 - entryCurve(prog(t, land - 0.38, land))) * 0.6;
  }
  const idx = clamp(Math.floor((t - TL.pieces[0].t0) / cfg.pieceDuration), 0, pieces.length - 1);
  const lt = t - TL.pieces[idx].t0;
  if (lt < 0) return -4.8;
  let x;
  if (lt < L.impact) x = -4.8 * (1 - entryCurve(lt / L.impact));
  else x = 0.35 * Math.sin((lt - L.impact) * 16) * Math.exp(-(lt - L.impact) * 6);
  if (lt > L.exit0) x += eInCubic(prog(lt, L.exit0, 4)) * 9;
  return x;
}

await document.fonts.load('100px BlackOps');
await document.fonts.load('100px Anton');
await document.fonts.load('700 40px Oswald');
await document.fonts.ready;
// Warm up every shader permutation before capture.
for (const t of [0.05, 3.5, 6, 8.2, TL.outroStart + 1, TL.outroStart + 3]) renderAt(t);

const params = new URLSearchParams(location.search);
window.SHORT = { cfg, TL, renderAt, frames: Math.round(TL.duration * TL.fps), ready: true, internals: { scene, composer, bloom, edit, renderer, rt } };
if (params.has('t')) renderAt(parseFloat(params.get('t')));
else if (params.has('play')) {
  const start = performance.now();
  const loop = () => {
    renderAt(((performance.now() - start) / 1000) % TL.duration);
    requestAnimationFrame(loop);
  };
  loop();
} else renderAt(0);
