// Entry point: builds both scenes and exposes window.renderFrame(t), which
// draws the complete frame for time t (seconds). scripts/render.mjs calls it
// once per output frame; `?play` runs it in real time for previewing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from './config.js';
import { buildTimeline } from './timeline.js';
import { buildPieces } from './models.js';
import { setupForeground } from './stage.js';
import { buildBattlefield } from './battlefield.js';
import { pieceState, cameraState, postState, SET } from './choreo.js';
import { HUD } from './hud.js';
import { DEG, kick, prog, lerp, sat } from './util.js';

const query = new URLSearchParams(location.search);
const SCALE = parseFloat(query.get('scale') || '1');
const W = Math.round((CONFIG.width * SCALE) / 2) * 2;
const H = Math.round((CONFIG.height * SCALE) / 2) * 2;
const TL = buildTimeline(CONFIG);
const F = TL.finale;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 2500);

// The hero layer is rendered on its own (anti-aliased, transparent) target and
// composited over the battlefield, so additive effects must leave alpha alone.
function additive(mat) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

// ------------------------------------------------------------ foreground --
const fg = new THREE.Scene();
const lights = setupForeground(fg, renderer);
const pieces = buildPieces();
for (const p of TL.pieces) {
  fg.add(pieces[p.id].root);
  pieces[p.id].root.traverse((o) => o.layers.enable(1)); // layer 1 = depth pre-pass
}
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

const bf = buildBattlefield(TL, SCALE);
{
  const e = bf.makeEmbers(90, [12, 10, 9], [-6, -5, 0.5], 230 * SCALE, new THREE.Color(3.2, 1.0, 0.2));
  additive(e.material);
  fg.add(e);
}

const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
// dark pocket + green glow behind the hero so it separates from the fire
const pocket = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }));
pocket.renderOrder = -5;
const greenGlow = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0x000000, depthTest: false })));
greenGlow.renderOrder = -4;
fg.add(pocket, greenGlow);

// holographic scanner: ring + light curtain that rides the sweep line
const scanner = new THREE.Group();
{
  const ringMat = additive(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 1.7, 0.42), side: THREE.DoubleSide }));
  scanner.add(new THREE.Mesh(new THREE.RingGeometry(1.66, 1.74, 128).rotateX(-Math.PI / 2), ringMat));
  scanner.add(new THREE.Mesh(new THREE.RingGeometry(1.9, 1.925, 128).rotateX(-Math.PI / 2), ringMat));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.66, 96).rotateX(-Math.PI / 2), additive(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.07, 0.018), side: THREE.DoubleSide })));
  scanner.add(disc);
  const curtain = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.9, 96, 1, true).translate(0, -0.45, 0),
    additive(new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(vUv.y, 3.0); float l = 0.6 + 0.4 * step(0.5, fract(vUv.x * 90.0)); gl_FragColor = vec4(vec3(0.02, 0.6, 0.16) * a * l * 0.45, 1.0); }',
    }))
  );
  scanner.add(curtain);
  scanner.visible = false;
  fg.add(scanner);
}
// shockwave rings (green lock-in, price slam)
const waves = [0, 1, 2].map(() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.965, 1.0, 96), additive(new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, side: THREE.DoubleSide })));
  m.visible = false;
  fg.add(m);
  return m;
});

// ------------------------------------------------------------- post chain --
const hud = new HUD(TL, CONFIG);
const hudTex = new THREE.CanvasTexture(hud.canvas);
hudTex.colorSpace = THREE.SRGBColorSpace;
hudTex.generateMipmaps = false;
hudTex.minFilter = THREE.LinearFilter;

const MSAA = parseInt(query.get('msaa') || '4', 10);
class ScenePass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.rtBg = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType });
    this.rtFg = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: MSAA });
    // battlefield (half-res, softly defocused) + hero layer + 2D overlay -> one HDR frame
    this.mixQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tBg: { value: this.rtBg.texture },
          tFg: { value: this.rtFg.texture },
          tHud: { value: hudTex },
          uBlur: { value: query.has('noblur') ? 0.0 : 0.0055 },
          uAspect: { value: W / H },
          uGain: { value: 1.04 },
          uHudA: { value: query.has('nohud') ? 0 : 1 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D tBg, tFg, tHud; uniform float uBlur, uAspect, uGain, uHudA; varying vec2 vUv;
          void main(){
            vec3 c = texture2D(tBg, vUv).rgb;
            for (int i = 0; i < 7; i++) {
              float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / 7.0) * uBlur;
              c += texture2D(tBg, vUv + vec2(cos(a), sin(a) * uAspect) * r).rgb;
            }
            c /= 8.0;
            vec4 f = texture2D(tFg, vUv);
            c = c * (1.0 - clamp(f.a, 0.0, 1.0)) + f.rgb;
            vec4 h = texture2D(tHud, vUv);
            gl_FragColor = vec4(mix(c, h.rgb * uGain, h.a * uHudA), 1.0);
          }`,
      })
    );
  }
  render(r, writeBuffer, readBuffer) {
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.rtBg);
    r.clear();
    if (!query.has('nobg')) r.render(bf.scene, camera);
    r.setRenderTarget(this.rtFg);
    r.setClearColor(0x000000, 0);
    r.clear();
    if (!query.has('bgonly')) {
      camera.layers.set(1);
      fg.overrideMaterial = depthOnly;
      r.render(fg, camera);
      fg.overrideMaterial = null;
      camera.layers.set(0);
      r.render(fg, camera);
    }
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(readBuffer);
    this.mixQuad.render(r);
  }
}

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
composer.addPass(new ScenePass());
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.34, 0.45, 1.0);
bloom.enabled = !query.has('nobloom');
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(W, H) },
    uTime: { value: 0 },
    uCA: { value: 0 },
    uDirBlur: { value: 0 },
    uZoomBlur: { value: 0 },
    uZoom: { value: 1 },
    uRoll: { value: 0 },
    uGlitch: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uFlash: { value: new THREE.Vector3() },
    uFade: { value: 1 },
    uTaps: { value: 3 },
    uExposure: { value: 1.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes, uShake; uniform vec3 uFlash;
    uniform float uTime, uCA, uDirBlur, uZoomBlur, uZoom, uRoll, uGlitch, uFade, uExposure; uniform int uTaps;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 samp(vec2 uv){ return texture2D(tDiffuse, clamp(uv, 0.0015, 0.9985)).rgb; }
    // ACES filmic (same fit three.js uses) + sRGB encode
    vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      return clamp(outM * rrtOdt(inM * (c * uExposure / 0.6)), 0.0, 1.0);
    }
    vec3 toSrgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    void main(){
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 p = (vUv - 0.5) * asp;
      float c = cos(uRoll), s = sin(uRoll);
      p = mat2(c, -s, s, c) * p / uZoom;
      vec2 uv = p / asp + 0.5 + uShake;
      float fr = floor(uTime * 60.0);
      if (uGlitch > 0.02) {
        float band = floor(uv.y * 13.0 + fr * 3.7);
        float r = h21(vec2(band, fr));
        uv.x += (r - 0.5) * 0.16 * uGlitch * step(0.5, r);
      }
      vec2 dir = uv - 0.5;
      float ca = uCA * (0.6 + 2.4 * length(dir));
      // one fetch per tap: taps are spread along the blur path *and* across
      // the spectrum, so the same loop gives motion blur + chromatic fringing
      vec3 col = vec3(0.0);
      vec3 wsum = vec3(0.0);
      float n = float(uTaps);
      for (int i = 0; i < 16; i++) {
        if (i >= uTaps) break;
        float f = uTaps > 3 ? (float(i) + h21(gl_FragCoord.xy + float(i) * 7.31 + fr)) / n - 0.5 : float(i) * 0.5 - 0.5;
        vec2 u2 = uv + vec2(uDirBlur * f * 2.0, 0.0) - dir * uZoomBlur * (f + 0.5) * 2.0 + dir * ca * f * 2.0;
        vec3 w = max(vec3(0.0), vec3(f * 2.0, 1.0 - abs(f) * 2.0, -f * 2.0)) + (uTaps > 3 ? 0.35 : 0.0);
        col += samp(u2) * w;
        wsum += w;
      }
      col = toSrgb(aces(col / wsum));
      // grade: a touch more contrast, cool shadows, warm highs
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);
      col += vec3(-0.012, 0.003, 0.022) * (1.0 - smoothstep(0.0, 0.45, l));
      col *= mix(1.0, 0.42, smoothstep(0.3, 1.2, length((vUv - 0.5) * vec2(1.0, 1.2))));
      col += uFlash;
      col += (h21(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0) - 0.5) * 0.045;
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
});
composer.addPass(finalPass);

// --------------------------------------------------------------- per frame --
const tmp = new THREE.Vector3();
const hero = new THREE.Vector3();

function renderFrame(t) {
  t = Math.max(0, Math.min(TL.duration - 1e-4, t));

  // camera
  const c = cameraState(t, TL);
  const yaw = c.yaw * DEG;
  const pitch = c.pitch * DEG;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * c.dist, c.ty + Math.sin(pitch) * c.dist, Math.cos(yaw) * Math.cos(pitch) * c.dist);
  camera.up.set(Math.sin(c.roll * DEG), Math.cos(c.roll * DEG), 0);
  camera.lookAt(0, c.ty, 0);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // armour
  let green = 0;
  let any = false;
  hero.set(0, 0, 0);
  for (const p of TL.pieces) {
    const piece = pieces[p.id];
    const st = pieceState(p, piece, t, TL);
    piece.root.visible = st.visible;
    if (!st.visible) continue;
    piece.setMode(st.mode);
    piece.root.position.set(st.x, st.y, st.z);
    piece.root.rotation.set(st.pitch + (st.mode === 'solo' ? piece.tilt : 0), st.yaw, st.roll, 'YXZ');
    piece.root.scale.setScalar(st.scale);
    piece.root.updateMatrixWorld(true);
    piece.U.uSweepY.value = st.sweepY;
    piece.U.uSweepGlow.value = st.sweepGlow;
    piece.U.uFlash.value = st.flash;
    piece.U.uTime.value = t;
    piece.U.uPieceInv.value.copy(piece.inner.matrixWorld).invert();
    green = Math.max(green, st.green * (1 - prog(t, p.exitStart, p.exitEnd) * (st.mode === 'solo' ? 1 : 0)));
    if (st.mode === 'solo' && Math.abs(st.x) < 4) {
      hero.set(st.x, st.y, 0);
      any = true;
    }
  }
  const inFinale = t >= F.T - F.flyIn;
  if (inFinale) {
    hero.set(0, SET.y - 0.1, 0);
    any = true;
  }

  // scanner ring + shockwaves
  scanner.visible = false;
  let waveIdx = 0;
  for (const w of waves) w.visible = false;
  const wave = (t0, life, size, r, g, b, y = 0) => {
    const age = t - t0;
    if (age < 0 || age > life || waveIdx >= waves.length) return;
    const w = waves[waveIdx++];
    const k = age / life;
    w.visible = true;
    w.position.set(hero.x, y, 0);
    w.quaternion.copy(camera.quaternion);
    w.scale.setScalar(size * (0.5 + 5.5 * (1 - Math.pow(1 - k, 3))));
    const a = Math.pow(1 - k, 2);
    w.material.color.setRGB(r * a, g * a, b * a);
  };
  for (const p of TL.pieces) {
    if (t >= p.sweepStart - 0.02 && t <= p.sweepEnd + 0.06) {
      const h = pieces[p.id].halfH + 0.3;
      scanner.visible = true;
      scanner.position.set(0, lerp(-h, h, prog(t, p.sweepStart, p.sweepEnd)), 0);
      scanner.scale.setScalar(1.0);
      scanner.rotation.y = t * 3;
    }
    wave(p.sweepEnd, 0.4, 1.0, 0.3, 3.0, 0.9);
    wave(p.slam, 0.5, 1.2, 0.9, 3.2, 1.3);
    wave(p.land, 0.26, 0.75, 1.3, 0.85, 0.45);
  }
  if (t >= F.sweepStart - 0.02 && t <= F.sweepEnd + 0.06) {
    scanner.visible = true;
    scanner.position.set(0, lerp(SET.y - 3.85 * SET.scale, SET.y + 3.5 * SET.scale, prog(t, F.sweepStart, F.sweepEnd)), 0);
    scanner.scale.setScalar(1.05);
    scanner.rotation.y = t * 3;
  }
  wave(F.sweepEnd, 0.45, 1.4, 0.3, 3.0, 0.9, SET.y);
  wave(F.slam, 0.7, 1.9, 0.9, 3.4, 1.4, SET.y);
  wave(F.slam + 0.14, 0.7, 1.5, 0.5, 2.6, 0.9, SET.y);

  // dark pocket / green halo behind the hero, along the view axis
  tmp.copy(hero).sub(camera.position).normalize();
  pocket.visible = greenGlow.visible = any;
  pocket.position.copy(hero).addScaledVector(tmp, 3.5);
  pocket.scale.setScalar(inFinale ? 12 : 9.5);
  greenGlow.position.copy(hero).addScaledVector(tmp, 3.0);
  greenGlow.scale.setScalar((inFinale ? 11 : 8.5) * (1 + 0.25 * kick(t, inFinale ? F.slam : -99, 0.2)));
  const gi = 0.16 * green;
  greenGlow.material.color.setRGB(0.02 * gi, 0.9 * gi, 0.26 * gi);

  // battlefield + light it throws on the hero
  bf.update(t, camera);
  const flash = bf.flashAt(t);
  lights.blast.intensity = Math.min(flash * 3.0, 8);
  lights.rimWarm.intensity = 3.2 + Math.min(flash * 1.6, 4);

  // overlay
  const h0 = performance.now();
  hud.draw(t);
  hudTex.needsUpdate = true;
  window.PROF = { hud: Math.round(performance.now() - h0) };

  // post
  const ps = postState(t, TL);
  const u = finalPass.uniforms;
  u.uTime.value = t;
  u.uCA.value = ps.ca;
  u.uDirBlur.value = ps.dirBlur;
  u.uZoomBlur.value = ps.zoomBlur;
  u.uZoom.value = ps.zoom;
  u.uRoll.value = ps.roll;
  u.uGlitch.value = ps.glitch;
  u.uShake.value.set(ps.shakeX, ps.shakeY);
  u.uFlash.value.set(ps.flash[0], ps.flash[1], ps.flash[2]);
  u.uFade.value = ps.fade;
  u.uTaps.value = ps.dirBlur > 0.002 || ps.zoomBlur > 0.002 ? 9 : 3;
  bloom.strength = 0.34 + 0.12 * sat(flash);

  composer.render();
}

window.renderFrame = renderFrame;
window.TIMELINE = TL;
window.capture = (type = 'image/jpeg', quality = 0.96) => renderer.domElement.toDataURL(type, quality);

await Promise.all([document.fonts.load('400 100px Anton'), document.fonts.load('600 40px Oswald'), document.fonts.load('700 40px Oswald')]);
renderFrame(0); // compiles every shader up front
window.READY = true;

if (query.has('play')) {
  const cv = renderer.domElement;
  cv.style.cssText = 'height:100vh;width:auto;display:block;margin:0 auto';
  const start = performance.now();
  const loop = () => {
    renderFrame(((performance.now() - start) / 1000) % TL.duration);
    requestAnimationFrame(loop);
  };
  loop();
}
