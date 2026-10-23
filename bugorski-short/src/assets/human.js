// Realistic rigged humans built from MakeHuman's CC0 base mesh, skeleton, weights,
// face pose units and eyes (scripts/build_human.py → assets/human/*.json + .bin).
//
// Pose semantics match the original primitive rig, so shots pose both the same way:
// every joint rotation is an Euler angle in its parent's "character frame"
// (+X = character's left, +Y up, +Z forward) and identity = standing straight with
// the arms hanging. Internally each MakeHuman bone gets
//   local = restRot(parent)⁻¹ · R · restRot(bone)
// so the rotation R composes down the chain exactly like the old joints did.
import * as THREE from 'three';
import { ghostMaterial, glowMaterial } from '../core/materials.js';
import { clamp, smooth, mulberry32, hash1, quatFromFrames } from '../core/util.js';
import { radialTexture } from '../core/textures.js';

export const HEAD_UNIT = 0.112; // 1 head-space unit in metres (the close-up studio's scale)
const ASSETS = {};
let EYE_TEX = null;

/** Fetch the generated character data once, before any set is built. */
export async function loadHumanAssets(names = ['bugorski', 'doctor']) {
  await Promise.all(names.map(async (name) => {
    const [meta, bin] = await Promise.all([
      fetch(`assets/human/${name}.json`).then((r) => r.json()),
      fetch(`assets/human/${name}.bin`).then((r) => r.arrayBuffer()),
    ]);
    ASSETS[name] = { meta, bin, geos: {} };
  }));
  EYE_TEX = await new THREE.TextureLoader().loadAsync('assets/human/eye_brown.png');
  EYE_TEX.colorSpace = THREE.SRGBColorSpace;
  EYE_TEX.anisotropy = 4;
}

const DT = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array };
function view(asset, key) {
  const a = asset.meta.arrays[key];
  return a ? new DT[a.dtype](asset.bin, a.offset, a.count) : null;
}
const ATTRS = [['position', 3], ['normal', 3], ['skinIndex', 4], ['skinWeight', 4], ['uv', 2], ['aHead', 3], ['aMask', 4], ['aMask2', 4], ['aHair', 1], ['aBrow', 1], ['ao', 1], ['aLash', 3]];
function geometry(asset, key) {
  if (asset.geos[key]) return asset.geos[key];
  const g = new THREE.BufferGeometry();
  g.setIndex(new THREE.BufferAttribute(view(asset, `${key}.index`), 1));
  for (const [name, size] of ATTRS) {
    const v = view(asset, `${key}.${name}`);
    if (v) g.setAttribute(name, new THREE.BufferAttribute(v, size));
  }
  const sw = view(asset, `${key}.swell`);
  if (sw) { g.morphAttributes.position = [new THREE.BufferAttribute(sw, 3)]; g.morphTargetsRelative = true; }
  g.computeBoundingSphere();
  return (asset.geos[key] = g);
}

// ───────────── shader helpers ─────────────
const NOISE_GLSL = /* glsl */`
  float hhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hhash(i), hhash(i + vec3(1,0,0)), f.x), mix(hhash(i + vec3(0,1,0)), hhash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hhash(i + vec3(0,0,1)), hhash(i + vec3(1,0,1)), f.x), mix(hhash(i + vec3(0,1,1)), hhash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  vec3 perturbBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
    vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos));
    vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
    float det = dot(sx, r1) * faceDir;
    vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
    return normalize(abs(det) * surf_norm - grad);
  }`;

// Subsurface approximation: per-channel wrapped diffuse (red light bleeds past the
// terminator) plus back-lit glow through thin tissue (ears, nostrils).
const DIFFUSE_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const SSS_CHUNK = THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIFFUSE_LINE, /* glsl */`
  #ifdef SKIN_SSS
    float ndlRaw = dot( geometryNormal, directLight.direction );
    vec3 wrapW = vec3( 0.55, 0.26, 0.18 );
    vec3 wrapped = clamp( ( vec3( ndlRaw ) + wrapW ) / ( 1.0 + wrapW ), 0.0, 1.0 );
    wrapped = wrapped * wrapped * ( 1.0 + wrapW * 0.6 );
    reflectedLight.directDiffuse += wrapped * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
    float backLit = pow( clamp( dot( geometryViewDir, - directLight.direction ), 0.0, 1.0 ), 3.0 ) * skinThin;
    reflectedLight.directDiffuse += backLit * directLight.color * vec3( 0.75, 0.16, 0.08 ) * 0.5;
  #else
    ${DIFFUSE_LINE}
  #endif`);
if (!SSS_CHUNK.includes('SKIN_SSS')) console.warn('skin SSS patch did not apply');

function makeSkinMaterial(tone, uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tone, roughness: 0.52, metalness: 0, ior: 1.4, specularIntensity: 0.75,
    sheen: 0.18, sheenRoughness: 0.7, sheenColor: new THREE.Color(1.0, 0.82, 0.78),
  });
  m.defines = { SKIN_SSS: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aHead; attribute vec4 aMask; attribute vec4 aMask2;
        varying vec3 vHead; varying vec4 vMask; varying vec4 vMask2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vHead = aHead; vMask = aMask; vMask2 = aMask2;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHead; varying vec4 vMask; varying vec4 vMask2;
        uniform float uBurn; uniform float uFrozen; uniform float uRed; uniform float uStubble; uniform float uPore;
        uniform vec3 uEntry; uniform vec3 uExit; uniform vec3 uHairColor; uniform vec3 uLipColor;
        float skinThin = 0.0;
        ${NOISE_GLSL}`)
      .replace('#include <lights_physical_pars_fragment>', SSS_CHUNK)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 hp = vHead;
          float lips = vMask.x, brow = vMask.y, stub = vMask.z, red = vMask.w;
          float ao = vMask2.x, tz = vMask2.z, hairCov = vMask2.w;
          skinThin = vMask2.y;
          float n1 = vnoise(hp * 3.5), n2 = vnoise(hp * 11.0 + 7.1), n3 = vnoise(hp * 55.0 + 3.3);
          vec3 col = diffuseColor.rgb * (0.94 + 0.1 * n1);
          col = mix(col, col * vec3(1.05, 0.84, 0.82), clamp(red * 0.6 + (n2 - 0.5) * 0.3, 0.0, 1.0));
          col = mix(col, col * vec3(0.96, 0.9, 0.86), smoothstep(0.55, 0.75, n3) * 0.25); // freckles / pigment
          col = mix(col, uLipColor * (0.92 + 0.14 * n3), smoothstep(0.12, 0.65, lips));
          float dots = smoothstep(0.6, 0.8, vnoise(hp * 230.0));
          col = mix(col, col * vec3(0.6, 0.6, 0.64), clamp(stub * uStubble * (0.22 + dots * 0.55), 0.0, 1.0));
          float browHair = smoothstep(0.35, 0.65, vnoise(vec3((hp.y - 0.12 * abs(hp.x)) * 380.0, hp.x * 36.0, 2.0)));
          col = mix(col, uHairColor * 2.2, smoothstep(0.1, 0.8, brow) * (0.18 + 0.4 * browHair));
          col = mix(col, uHairColor * 0.55, smoothstep(0.05, 0.55, hairCov) * 0.92);
          col *= mix(0.5, 1.0, smoothstep(0.0, 0.85, ao));
          // radiation burns around the entry / exit wounds and the frozen (paralysed) half
          float nz = vnoise(hp * 11.0);
          float dEx = length(hp - uExit) + (nz - 0.5) * 0.05, dEn = length(hp - uEntry) + (nz - 0.5) * 0.05;
          float rEx = 0.2 * uBurn, rEn = 0.15 * uBurn;
          float on = step(0.001, uBurn);
          float raw = on * smoothstep(0.3, 0.5, uBurn) * max(1.0 - smoothstep(rEx * 0.55, rEx + 1e-4, dEx), 1.0 - smoothstep(rEn * 0.55, rEn + 1e-4, dEn));
          float halo = on * max(1.0 - smoothstep(0.0, rEx * 2.4 + 1e-4, dEx), 1.0 - smoothstep(0.0, rEn * 2.4 + 1e-4, dEn));
          float side = smoothstep(0.02, 0.5, hp.x) * step(abs(hp.y), 1.2) * step(abs(hp.z), 1.3);
          col = mix(col, col * vec3(1.18, 0.66, 0.6), uRed * side * 0.6);
          col = mix(col, col * vec3(1.12, 0.72, 0.68), halo * uBurn * 0.8);
          col = mix(col, vec3(0.5, 0.1, 0.08) * (0.75 + 0.5 * nz), raw);
          float hside = smoothstep(-0.06, 0.14, hp.x) * step(abs(hp.y), 1.2) * step(abs(hp.z), 1.3);
          col = mix(col, col * vec3(0.84, 0.92, 1.12), hside * uFrozen * 0.6);      // cool, bloodless half
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - vMask2.z * 0.16 + (vnoise(vHead * 9.0) - 0.5) * 0.1 - vMask.x * 0.14 + vMask2.w * 0.3, 0.22, 0.95);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float freq = length(fwidth(vHead)) * 160.0;           // pore cycles per pixel
          float fade = (1.0 - smoothstep(0.25, 0.8, freq)) * uPore * (1.0 - 0.6 * smoothstep(0.2, 0.7, vMask.x));
          float h = vnoise(vHead * 160.0) * 0.6 + vnoise(vHead * 340.0 + 5.0) * 0.4;
          h += (1.0 - abs(2.0 * vnoise(vHead * vec3(18.0, 70.0, 18.0)) - 1.0)) * 0.35 * smoothstep(0.35, 0.75, vHead.y); // forehead lines
          normal = perturbBump(- vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * 0.012 * fade, faceDirection);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float aoL = smoothstep(0.0, 0.9, vMask2.x);
          reflectedLight.indirectDiffuse *= aoL; reflectedLight.indirectSpecular *= aoL * aoL;
          reflectedLight.directSpecular *= mix(0.25, 1.0, aoL);
        }`);
  };
  m.customProgramCacheKey = () => 'mh-skin-v1';
  return m;
}

/** Fabric: subtle weave + soft wrinkles so clothes don't read as painted skin. */
function clothMaterial(color, { roughness = 0.85, weave = 1, wrinkle = 1, side = THREE.FrontSide, sheen = 0.3, coat = null } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, side, sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.4) });
  // coat: { vbot, waist } in rest-pose metres → button placket, buttons and pockets
  const u = { uWeave: { value: weave }, uWrinkle: { value: wrinkle }, uCoat: { value: coat ? 1 : 0 }, uVbot: { value: coat?.vbot ?? 0 }, uWaist: { value: coat?.waist ?? 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest; uniform float uWeave; uniform float uWrinkle; uniform float uCoat; uniform float uVbot; uniform float uWaist;
        float seamH = 0.0;\n${NOISE_GLSL}
        float box(vec2 p, vec2 a, vec2 b) { vec2 d = max(a - p, p - b); return max(d.x, d.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.95 + 0.07 * vnoise(vRest * 9.0);
        if (uCoat > 0.5 && vRest.z > -0.02) {
          vec2 p = vRest.xy;
          float below = step(p.y, uVbot + 0.01);
          float edge = (1.0 - smoothstep(0.0012, 0.0035, abs(p.x - 0.014))) * below;     // placket edge
          float stitch = (1.0 - smoothstep(0.0006, 0.0016, abs(p.x - 0.03))) * below * step(0.5, fract(p.y * 160.0));
          float shade = 0.0, bump = 0.0;
          for (int k = 0; k < 4; k++) {                                                   // buttons
            float d = length(p - vec2(0.0, uVbot - 0.035 - float(k) * 0.115));
            float b = 1.0 - smoothstep(0.0075, 0.0095, d);
            shade = max(shade, b * 0.25); bump += b * sqrt(max(0.0, 1.0 - d * d / 0.000085));
          }
          for (int sd = 0; sd < 2; sd++) {                                                // hip pockets
            float sx = sd == 0 ? 1.0 : -1.0;
            float bx = box(vec2(p.x * sx, p.y), vec2(0.075, uWaist - 0.3), vec2(0.205, uWaist - 0.12));
            float rim = 1.0 - smoothstep(0.0, 0.0025, abs(bx));
            float opening = (1.0 - smoothstep(0.0, 0.004, abs(p.y - (uWaist - 0.12)))) * step(bx, 0.002);
            shade = max(shade, rim * 0.12 + opening * 0.3); seamH += rim * 0.6 + opening;
          }
          float bxp = box(p, vec2(0.06, uVbot - 0.02), vec2(0.16, uVbot + 0.11));         // breast pocket (left)
          shade = max(shade, (1.0 - smoothstep(0.0, 0.0025, abs(bxp))) * 0.12);
          seamH += (1.0 - smoothstep(0.0, 0.0025, abs(bxp))) * 0.6;
          shade = max(shade, edge * 0.22 + stitch * 0.1);
          seamH += edge + bump * 1.5;
          diffuseColor.rgb *= 1.0 - shade;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float w = (1.0 - abs(2.0 * vnoise(vRest * vec3(16.0, 5.0, 16.0)) - 1.0)) * uWrinkle;
          w += vnoise(vRest * 40.0) * 0.25 * uWrinkle;
          float fq = length(fwidth(vRest)) * 900.0;
          w += (sin(vRest.x * 5600.0 + vRest.z * 5600.0) * sin(vRest.y * 5600.0)) * 0.06 * uWeave * (1.0 - smoothstep(0.3, 0.9, fq));
          w += seamH * 0.35;
          normal = perturbBump(- vViewPosition, normal, vec2(dFdx(w), dFdy(w)) * 0.02, faceDirection);
        }`);
  };
  m.customProgramCacheKey = () => 'mh-cloth-v1';
  return m;
}

/** One layer of a shell-textured hair volume (scalp hair or eyebrows). */
function hairShellMaterial(color, layer, kind, len) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, specularIntensity: 0.35, envMapIntensity: 0.45, alphaToCoverage: true, transparent: false });
  const u = { uLayer: { value: layer }, uLen: { value: len }, uKind: { value: kind === 'brow' ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aHead; attribute float aCov;
        uniform float uLayer; uniform float uLen; uniform float uKind;
        varying vec3 vHead; varying float vCov;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vHead = aHead; vCov = aCov;
          float cov = smoothstep(0.0, 0.6, aCov);
          vec3 comb;
          float L;
          if (uKind < 0.5) {
            // short side-parted 1970s cut: fuller on top, close at the sides/back
            float top = smoothstep(0.1, 0.9, aHead.y);
            L = uLen * cov * (0.45 + 0.75 * top + 0.25 * smoothstep(0.2, 0.7, aHead.z) * top);
            float sideSign = smoothstep(0.24, 0.42, aHead.x) * 2.0 - 1.0;
            comb = normalize(vec3(sideSign * 0.9 * top, -0.7, -0.45 * (1.0 - top) - 0.2));
          } else {
            L = uLen * cov;
            comb = normalize(vec3(sign(aHead.x) * 1.0, 0.25, 0.1));
          }
          vec3 nn = normalize(normal);
          comb = normalize(comb - nn * dot(comb, nn));
          transformed += (nn * 0.7 + comb * 0.9) * L * uLayer;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLayer; uniform float uKind;
        varying vec3 vHead; varying float vCov;
        ${NOISE_GLSL}`)
      .replace('#include <alphatest_fragment>', `
        {
          vec3 p = vHead;
          float across, along;
          if (uKind < 0.5) {
            float back = smoothstep(0.15, -0.45, p.z);
            across = mix(p.z, p.x * 1.2, back) + 0.08 * vnoise(p * 3.0);
            along = mix(p.x, p.y, back);
          } else {
            across = p.y - 0.12 * abs(p.x);
            along = p.x;
          }
          float f1 = uKind < 0.5 ? 190.0 : 420.0, f2 = uKind < 0.5 ? 9.0 : 34.0;
          float s = vnoise(vec3(across * f1, along * f2, 1.7)) * 0.7 + vnoise(vec3(across * f1 * 2.3, along * f2 * 1.8, 4.2)) * 0.3;
          float cov = smoothstep(0.05, 0.5, vCov);
          float thr = (uKind < 0.5 ? mix(0.16, 0.72, uLayer) : mix(0.45, 0.8, uLayer)) + (1.0 - cov) * 0.6;
          float a = smoothstep(thr - 0.06, thr + 0.06, s);
          if (a < 0.02) discard;
          diffuseColor.a = a;
          diffuseColor.rgb *= mix(0.62, 1.05, uLayer) * (0.85 + 0.3 * vnoise(vec3(across * 40.0, along * 3.0, 9.0)));
        }`);
  };
  m.customProgramCacheKey = () => 'mh-hair-v1';
  return m;
}

/** Eyelashes: separate tapered hairs drawn on MakeHuman's lash strips. */
function lashMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, alphaToCoverage: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLash; varying vec3 vLash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLash = aLash;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLash;\n${NOISE_GLSL}`)
      .replace('#include <alphatest_fragment>', `
        {
          float upper = step(0.5, vLash.z), along = vLash.x, across = vLash.y;
          float n = mix(26.0, 70.0, upper);
          float cell = along * n + across * mix(0.6, 1.4, upper);
          float id = floor(cell), f = fract(cell);
          float len = mix(0.5, 1.0, hhash(vec3(id, upper, 3.0))) * mix(0.5, 1.0, upper);
          float w = mix(0.17, 0.04, across / len);
          float a = (1.0 - smoothstep(w, w + 0.12, abs(f - 0.5 - (hhash(vec3(id, 1.0, upper)) - 0.5) * 0.4)));
          a *= 1.0 - smoothstep(len - 0.12, len, across);
          a *= mix(0.35, 1.0, upper) * step(0.35 - 0.35 * upper, hhash(vec3(id, 7.0, upper)));
          if (a < 0.03) discard;
          diffuseColor.a = a;
        }`);
  };
  m.customProgramCacheKey = () => 'mh-lash-v1';
  return m;
}

/** Skinned fresnel "x-ray" material (follows the skeleton and the swelling morph). */
function ghostSkinned(color, intensity, power, base) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const u = { gColor: { value: new THREE.Color(color) }, gInt: { value: intensity }, gPow: { value: power }, gBase: { value: base } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGN; varying vec3 vGV;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vGN = normalize(normalMatrix * objectNormal); vGV = - mvPosition.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGN; varying vec3 vGV; uniform vec3 gColor; uniform float gInt; uniform float gPow; uniform float gBase;')
      .replace('#include <opaque_fragment>', `
        float fr = pow(1.0 - abs(dot(normalize(vGN), normalize(vGV))), gPow);
        gl_FragColor = vec4(gColor * (fr * gInt + gBase), 1.0);`);
  };
  m.customProgramCacheKey = () => 'mh-ghost-v1';
  return m;
}

// ───────────── the character ─────────────
const SPINE = [['spine05', 0.12], ['spine04', 0.22], ['spine03', 0.24], ['spine02', 0.22], ['spine01', 0.2]];
const NECK = [['neck01', 0.4], ['neck02', 0.3], ['neck03', 0.3]];
const OUTFITS = {
  labcoat: { coat: 0xeeeee8, shirt: 0x9cbbe0, trousers: 0x2b303b, tie: 0x6e2420, shoes: 0x1a1817 },
  doctor: { coat: 0xf3f3ef, shirt: 0xe6e2d6, trousers: 0x3a3a40, tie: 0x2c3a5a, shoes: 0x201c1a },
  pyjamas: { coat: null, shirt: 0xb4c6dc, trousers: 0xb4c6dc, tie: null, shoes: null },
};
const HAIR = { brown: 0x2a1d15, gray: 0x8f8a84 };
const DEFAULT_R = { shoulderL: [0, 0, 0.08], shoulderR: [0, 0, -0.08], elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0] };
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _I = new THREE.Quaternion();

export class Human {
  /**
   * @param {object} o
   * @param {string} o.asset   'bugorski' | 'doctor'
   * @param {string} o.outfit  'labcoat' | 'doctor' | 'pyjamas'
   * @param {string} o.hair    'brown' | 'gray'
   */
  constructor(o = {}) {
    this.o = { asset: 'bugorski', outfit: 'labcoat', hair: 'brown', glasses: false, clipboard: false, xray: false, skin: 0xd99f84, stubble: 0.5, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) };
    const A = (this.asset = ASSETS[this.o.asset]);
    if (!A) throw new Error(`human asset ${this.o.asset} not loaded`);
    const meta = A.meta;
    this.root = new THREE.Group();
    this.root.name = 'human';

    // ---- skeleton ----
    this.bones = []; this.idx = {}; this.restG = []; this.qRestG = []; this.restPos = []; this.restQuat = [];
    this.parentIdx = meta.bones.map((b) => b.parent);
    meta.bones.forEach((b, i) => {
      const bone = new THREE.Bone(); bone.name = b.name;
      this.bones.push(bone); this.idx[b.name] = i;
      const m = new THREE.Matrix4().fromArray(b.rest);
      this.restG.push(m); this.qRestG.push(new THREE.Quaternion().setFromRotationMatrix(m));
    });
    meta.bones.forEach((b, i) => {
      const bone = this.bones[i];
      const local = b.parent >= 0 ? this.restG[b.parent].clone().invert().multiply(this.restG[i]) : this.restG[i].clone();
      local.decompose(bone.position, bone.quaternion, bone.scale);
      bone.scale.set(1, 1, 1);
      this.restPos.push(bone.position.clone()); this.restQuat.push(bone.quaternion.clone());
      (b.parent >= 0 ? this.bones[b.parent] : this.root).add(bone);
    });
    this.skeleton = new THREE.Skeleton(this.bones, this.restG.map((m) => m.clone().invert()));
    const P = (n) => new THREE.Vector3().setFromMatrixPosition(this.restG[this.idx[n]]);

    // bones posed by the body rig, with their parent's rest rotation precomputed
    this.drive = {};
    const drv = (n) => {
      const i = this.idx[n], p = this.parentIdx[i];
      this.drive[n] = { bone: this.bones[i], qA: p >= 0 ? this.qRestG[p].clone().invert() : new THREE.Quaternion(), qB: this.qRestG[i].clone() };
    };
    ['root', ...SPINE.map((s) => s[0]), ...NECK.map((s) => s[0]), 'head'].forEach(drv);
    for (const s of ['L', 'R']) ['shoulder01', 'upperarm01', 'lowerarm01', 'wrist', 'upperleg01', 'lowerleg01', 'foot'].forEach((b) => drv(`${b}.${s}`));
    // A-pose → hanging arms: map the rest upper arm / forearm onto −Y with the elbow hinge on −X
    this.base = {};
    this.armLen = {};
    for (const s of ['L', 'R']) {
      const sh = P(`upperarm01.${s}`), el = P(`lowerarm01.${s}`), wr = P(`wrist.${s}`);
      const u = el.clone().sub(sh), f = wr.clone().sub(el);
      this.armLen = { upper: u.length(), fore: f.length() };
      u.normalize(); f.normalize();
      const h = new THREE.Vector3().crossVectors(u, f).normalize();
      const down = new THREE.Vector3(0, -1, 0), hinge = new THREE.Vector3(-1, 0, 0);
      const bu = quatFromFrames(u, h, down, hinge), bf = quatFromFrames(f, h, down, hinge);
      // the shoulder girdle takes part of the swing so the deltoid doesn't bunch up
      const drop = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(u, down), 0.3);
      this.base[s] = { u: bu, uInv: bu.clone().invert(), f: bf, fInv: bf.clone().invert(), drop, dropInv: drop.clone().invert() };
    }
    this.legLen = P('upperleg01.L').y - P('foot.L').y;
    this.rootRest = this.restPos[this.idx.root].clone();
    // relaxed finger curl
    this.fingers = this.bones.map((b, i) => [b, i]).filter(([b]) => /^finger[2-5]-[123]\.|^finger1-[23]\./.test(b.name));

    // face bones (driven only by face units)
    this.faceUnits = meta.faceUnits;
    const faceSet = new Set();
    for (const u of Object.values(this.faceUnits)) for (const b of Object.keys(u)) faceSet.add(this.idx[b]);
    this.faceBones = [...faceSet];
    this.isFace = new Array(this.bones.length).fill(false);
    for (const i of this.faceBones) this.isFace[i] = true;
    this.unitQ = {};
    for (const [u, bones] of Object.entries(this.faceUnits)) {
      this.unitQ[u] = Object.entries(bones).map(([b, q]) => [this.idx[b], new THREE.Quaternion(q[0], q[1], q[2], q[3])]);
    }

    // ---- meshes ----
    const tone = new THREE.Color(this.o.skin);
    const hairCol = new THREE.Color(HAIR[this.o.hair] ?? this.o.hair);
    this.uniforms = {
      uBurn: { value: 0 }, uFrozen: { value: 0 }, uRed: { value: 0 }, uStubble: { value: this.o.stubble }, uPore: { value: 1 },
      uEntry: { value: new THREE.Vector3().fromArray(meta.head.entry) }, uExit: { value: new THREE.Vector3().fromArray(meta.head.exit) },
      uHairColor: { value: hairCol.clone() }, uLipColor: { value: new THREE.Color(0xa8605a) },
    };
    this.skinLayer = []; // everything hidden by the x-ray sweep
    this.morphMeshes = [];
    const skinned = (key, mat, { cast = true, layer = false } = {}) => {
      const m = new THREE.SkinnedMesh(geometry(A, key), mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
      if (m.geometry.morphAttributes.position) { m.morphTargetInfluences = [0]; this.morphMeshes.push(m); }
      this.root.add(m);
      if (layer) this.skinLayer.push(m);
      return m;
    };
    this.skinMat = makeSkinMaterial(tone, this.uniforms);
    this.body = skinned('body', this.skinMat, { layer: true });
    this.eyeMat = new THREE.MeshPhysicalMaterial({ map: EYE_TEX, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.376 });
    this.eyeMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao; varying float vAo;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAo = ao;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAo;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float mx = max(c.r, max(c.g, c.b)), l = dot(c, vec3(0.3, 0.55, 0.15));
            float sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);              // relative: dark irises count too
            c = mix(c, l * vec3(1.5, 1.05, 0.7) * 1.3, smoothstep(0.3, 0.6, sat));
            diffuseColor.rgb = c * vec3(0.92, 0.9, 0.88) * mix(0.2, 1.0, smoothstep(0.05, 0.75, vAo));
          }`)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= smoothstep(0.05, 0.75, vAo);');
    };
    this.eyeMat.customProgramCacheKey = () => 'mh-eye-v1';
    this.eyes = skinned('eyes', this.eyeMat, { cast: false, layer: true });
    this.corneaMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, ior: 1.376, specularIntensity: 1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, envMapIntensity: 1.6 });
    skinned('cornea', this.corneaMat, { cast: false, layer: true }).renderOrder = 2;
    this.lashMat = lashMaterial(hairCol.clone().multiplyScalar(0.35));
    skinned('lashes', this.lashMat, { cast: false, layer: true });
    this.teethMat = new THREE.MeshStandardMaterial({ color: 0xd9d0bc, roughness: 0.35 });
    skinned('teeth', this.teethMat, { cast: false, layer: true });
    this.tongueMat = new THREE.MeshStandardMaterial({ color: 0x9c4f4c, roughness: 0.45 });
    skinned('tongue', this.tongueMat, { cast: false, layer: true });

    // hair + eyebrow shells
    this.hairMats = [];
    const NH = 24, NB = 8;
    for (let i = 0; i < NH; i++) {
      const mat = hairShellMaterial(hairCol, (i + 1) / NH, 'hair', 0.016);
      this.hairMats.push(mat);
      const g = geometry(A, 'scalp');
      if (!g.getAttribute('aCov')) g.setAttribute('aCov', g.getAttribute('aHair'));
      skinned('scalp', mat, { cast: i === NH - 1, layer: true }).renderOrder = 1;
    }
    for (let i = 0; i < NB; i++) {
      const mat = hairShellMaterial(hairCol.clone().multiplyScalar(2.0), (i + 1) / NB, 'brow', 0.0018);
      this.hairMats.push(mat);
      const g = geometry(A, 'brows');
      if (!g.getAttribute('aCov')) g.setAttribute('aCov', g.getAttribute('aBrow'));
      skinned('brows', mat, { cast: false, layer: true }).renderOrder = 1;
    }

    // clothes
    const fit = OUTFITS[this.o.outfit];
    this.clothes = {};
    this.clothes.trousers = skinned('trousers', clothMaterial(fit.trousers, { roughness: 0.9 }));
    this.clothes.shirt = skinned('shirt', clothMaterial(fit.shirt, { roughness: 0.85, wrinkle: 0.8 }));
    this.clothes.collar = skinned('collar', clothMaterial(fit.shirt, { roughness: 0.85, side: THREE.DoubleSide }));
    if (fit.coat) {
      const cl = meta.clothes;
      this.clothes.coat = skinned('coat', clothMaterial(fit.coat, { roughness: 0.82, wrinkle: 1.2, coat: cl }));
      this.clothes.coattails = skinned('coattails', clothMaterial(fit.coat, { roughness: 0.82, wrinkle: 1.4, side: THREE.DoubleSide, coat: cl }));
      const lapel = clothMaterial(fit.coat, { roughness: 0.82, wrinkle: 0.5, side: THREE.DoubleSide });
      this.clothes.coatcollar = skinned('coatcollar', lapel);
      this.clothes.lapelL = skinned('lapelL', lapel);
      this.clothes.lapelR = skinned('lapelR', lapel);
    }
    if (fit.tie) this.clothes.tie = skinned('tie', clothMaterial(fit.tie, { roughness: 0.6, wrinkle: 0.3, weave: 2, side: THREE.DoubleSide }));
    if (fit.shoes) this.clothes.shoes = skinned('shoes', new THREE.MeshPhysicalMaterial({ color: fit.shoes, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }));

    // ---- head space (head units, centred on the head, character axes) ----
    const hb = this.idx[meta.head.headBone];
    this.headGroup = new THREE.Group();
    this.headGroup.name = 'head';
    const c = new THREE.Vector3().fromArray(meta.head.center);
    this.headCenter = c;
    this.restG[hb].clone().invert().multiply(new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(HEAD_UNIT, HEAD_UNIT, HEAD_UNIT)))
      .decompose(this.headGroup.position, this.headGroup.quaternion, this.headGroup.scale);
    this.bones[hb].add(this.headGroup);
    this.headBone = this.bones[hb];
    this.head = new HeadRig(this);

    // compatibility joints (world positions used by sets)
    const palm = (s) => {
      const g = new THREE.Object3D();
      const w = this.bones[this.idx[`wrist.${s}`]];
      const fing = P(`finger3-1.${s}`), wr = P(`wrist.${s}`);
      g.position.set(0, fing.distanceTo(wr) * 0.55, 0);
      w.add(g);
      return g;
    };
    this.palm = { L: palm('L'), R: palm('R') };
    this.j = { hips: this.bones[this.idx.root], headPivot: this.headBone, handL: this.bones[this.idx['wrist.L']], handR: this.bones[this.idx['wrist.R']] };

    if (this.o.clipboard) this._buildClipboard();
    this.R = {};
    this.pose({});
    this.head.set({});
  }

  _buildClipboard() {
    this.clipboard = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.31, 0.008), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.55 }));
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.9 }));
    paper.position.set(0, -0.015, 0.0045);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.016), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 }));
    clip.position.set(0, 0.145, 0.008);
    for (const m of [board, paper, clip]) { m.castShadow = true; this.clipboard.add(m); }
    // a few lines of handwriting
    const ink = new THREE.MeshBasicMaterial({ color: 0x334a7a });
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15 - (i % 3) * 0.03, 0.0035), ink);
      l.position.set(-0.012 + (i % 3) * 0.006, 0.09 - i * 0.022, 0.0048);
      this.clipboard.add(l);
    }
    this.root.add(this.clipboard);
  }

  // ───────────── body pose ─────────────
  _q(v) { return v instanceof THREE.Quaternion ? v.clone() : new THREE.Quaternion().setFromEuler(_e.set(v[0] || 0, v[1] || 0, v[2] || 0)); }

  _apply() {
    const R = this.R;
    const I = _I;
    for (let i = 0; i < this.bones.length; i++) {
      if (this.isFace[i]) continue;
      this.bones[i].position.copy(this.restPos[i]);
      this.bones[i].quaternion.copy(this.restQuat[i]);
    }
    const rb = this.bones[this.idx.root];
    rb.position.y += (this.hipsY ?? 0.95) - 0.95;
    rb.position.z += this.hipsZ ?? 0;
    const set = (n, q) => { const d = this.drive[n]; d.bone.quaternion.copy(d.qA).multiply(q).multiply(d.qB); };
    set('root', R.hips || I);
    const frac = (q, f) => _q2.copy(I).slerp(q, f);
    if (R.spine) for (const [n, f] of SPINE) set(n, frac(R.spine, f).clone());
    if (R.neck) for (const [n, f] of NECK) set(n, frac(R.neck, f).clone());
    if (R.headPivot) set('head', R.headPivot);
    for (const s of ['L', 'R']) {
      const b = this.base[s];
      set(`shoulder01.${s}`, b.drop);
      set(`upperarm01.${s}`, _q.copy(b.dropInv).multiply(R['shoulder' + s] || I).multiply(b.u));
      set(`lowerarm01.${s}`, _q.copy(b.uInv).multiply(R['elbow' + s] || I).multiply(b.f));
      set(`wrist.${s}`, _q.copy(b.fInv).multiply(R['hand' + s] || I).multiply(b.f));
      set(`upperleg01.${s}`, R['hip' + s] || I);
      set(`lowerleg01.${s}`, R['knee' + s] || I);
      set(`foot.${s}`, R['ankle' + s] || I);
    }
    const curl = this.curl ?? 0.32;
    for (const [b, i] of this.fingers) {
      const thumb = b.name.startsWith('finger1');
      b.quaternion.copy(this.restQuat[i]).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), curl * (thumb ? 0.4 : 1) * (b.name.includes('-1.') ? 0.6 : 1)));
    }
    this.root.updateMatrixWorld(true);
  }

  /** Apply a pose: joint → [x,y,z] Euler (radians) in the parent's character frame; 'hipsY' raises/lowers the pelvis. */
  pose(p = {}) {
    this.R = {};
    this.hipsY = 0.95; this.hipsZ = 0;
    for (const [k, v] of Object.entries({ ...DEFAULT_R, ...p })) {
      if (k === 'hipsY') { this.hipsY = v; continue; }
      if (k === 'hipsZ') { this.hipsZ = v; continue; }
      this.R[k] = this._q(v);
    }
    this._apply();
    return this;
  }

  /** Classic walk cycle; phase in cycles. Returns stride length per cycle (m). */
  walk(phase, amt = 1) {
    const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
    const sw = 0.35 * amt;
    const kneeL = Math.max(0, -c) * 0.85 * amt + 0.08, kneeR = Math.max(0, c) * 0.85 * amt + 0.08;
    this.pose({
      hipsY: 0.94 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.025 * amt,
      hips: [0, s * 0.06 * amt, 0],
      spine: [0.06, -s * 0.14 * amt, 0],
      neck: [0, s * 0.08 * amt, 0],
      hipL: [-s * sw, 0, 0], hipR: [s * sw, 0, 0],
      kneeL: [kneeL, 0, 0], kneeR: [kneeR, 0, 0],
      ankleL: [s * 0.2 * amt - kneeL * 0.3, 0, 0], ankleR: [-s * 0.2 * amt - kneeR * 0.3, 0, 0],
      shoulderL: [s * 0.4 * amt, 0, 0.1], shoulderR: [-s * 0.4 * amt, 0, -0.1],
      elbowL: [-0.25 - Math.max(0, s) * 0.3, 0, 0], elbowR: [-0.25 - Math.max(0, -s) * 0.3, 0, 0],
    });
    return 2 * 2 * this.legLen * Math.sin(sw) * 0.92;
  }

  /** Character frame (world rotation) that a bone's rotations are expressed in. */
  _frame(boneName) {
    const i = this.idx[boneName];
    this.bones[i].getWorldQuaternion(_q);
    return _q.clone().multiply(this.qRestG[i].clone().invert());
  }

  /**
   * Two-bone analytic IK for an arm. target: world position of the wrist.
   * pole: world direction the elbow should point towards.
   */
  reach(side, target, pole) {
    this.root.updateMatrixWorld(true);
    const frame = this._frame(`clavicle.${side}`); // shoulder rotations live in the clavicle's frame
    const inv = frame.clone().invert();
    const scale = this.root.getWorldScale(_v).x;
    const sh = new THREE.Vector3();
    this.bones[this.idx[`upperarm01.${side}`]].getWorldPosition(sh);
    const tLocal = target.clone().sub(sh).divideScalar(scale).applyQuaternion(inv);
    const pLocal = pole.clone().applyQuaternion(inv).normalize();
    const L1 = this.armLen.upper, L2 = this.armLen.fore;
    const d = Math.min(tLocal.length(), L1 + L2 - 1e-3);
    const dir = tLocal.clone().normalize();
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const alpha = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const perp = pLocal.clone().addScaledVector(dir, -pLocal.dot(dir)).normalize();
    const elbowPos = dir.clone().multiplyScalar(Math.cos(alpha) * L1).addScaledVector(perp, Math.sin(alpha) * L1);
    const u = elbowPos.clone().normalize();
    const v = dir.clone().multiplyScalar(d).sub(elbowPos).normalize();
    // local −Y → upper arm; local +Z → the side the forearm bends to
    const yAxis = u.clone().negate();
    let zAxis = v.clone().addScaledVector(u, -v.dot(u));
    if (zAxis.lengthSq() < 1e-8) zAxis = perp.clone().negate();
    zAxis.normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    this.R['shoulder' + side] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    this.R['elbow' + side] = this._q([-Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)), 0, 0]);
    this._apply();
  }

  /** Orient the head in world space: local forward (head axes) → worldFwd, up → worldUp; blend 0..1 from the current pose. */
  aimHead(worldFwd, worldUp, localFwd = new THREE.Vector3(0, 0, 1), blend = 1) {
    this.root.updateMatrixWorld(true);
    const qWorld = quatFromFrames(localFwd, new THREE.Vector3(0, 1, 0), worldFwd, worldUp);
    const target = this._frame('neck03').invert().multiply(qWorld);
    this.R.headPivot = (this.R.headPivot || new THREE.Quaternion()).clone().slerp(target, blend);
    this._apply();
  }

  /** World position of a point given in head-space units. */
  headPoint(local) {
    this.headGroup.updateWorldMatrix(true, false);
    return local.clone().applyMatrix4(this.headGroup.matrixWorld);
  }

  /** Place the clipboard between both hands (call after reach()). */
  holdClipboard(tilt = 0.5) {
    if (!this.clipboard) return;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.palm.L.getWorldPosition(a); this.palm.R.getWorldPosition(b);
    const mid = a.add(b).multiplyScalar(0.5);
    const inv = this.root.matrixWorld.clone().invert();
    this.clipboard.position.copy(mid.applyMatrix4(inv)).add(new THREE.Vector3(0, 0.02, 0.04));
    this.clipboard.rotation.set(-tilt, 0, 0);
  }

  // ───────────── face ─────────────
  /** weights: unit name → 0..1. Face bones are independent of the body pose. */
  _applyFace(weights) {
    const acc = new Map();
    for (const [u, w] of Object.entries(weights)) {
      if (!w || !this.unitQ[u]) continue;
      for (const [bi, q] of this.unitQ[u]) {
        const part = _q.copy(_I).slerp(q, clamp(w, -1, 1.5));
        if (acc.has(bi)) acc.get(bi).multiply(part); else acc.set(bi, part.clone());
      }
    }
    for (const i of this.faceBones) {
      const b = this.bones[i];
      b.quaternion.copy(this.restQuat[i]);
      const q = acc.get(i);
      if (q) b.quaternion.multiply(q);
    }
    this.root.updateMatrixWorld(true);
  }
}

// ───────────── head: expressions, injuries, x-ray, overlays ─────────────
const DEFAULT_STATE = {
  swell: 0, burn: 0, peel: 0, path: 0, frozen: 0, redness: 0,
  xray: 0, smile: 0, smileLeft: null, browRaise: 0,
  lidL: 0, lidR: 0, gazeX: 0, gazeY: 0, flash: 0,
  brainGlow: 0, arcs: 0, arcSeed: 0,
};

class HeadRig {
  constructor(human) {
    this.human = human;
    const meta = human.asset.meta.head;
    this.group = human.headGroup;
    this.entry = new THREE.Vector3().fromArray(meta.entry);
    this.exit = new THREE.Vector3().fromArray(meta.exit);
    this.beamDir = new THREE.Vector3().fromArray(meta.beamDir).normalize();
    this.uniforms = human.uniforms;
    this.skinLayer = human.skinLayer;
    // landmarks
    this.eyes = {};
    this.ears = {};
    for (const s of ['L', 'R']) {
      const eye = new THREE.Object3D(); eye.position.fromArray(meta['eye' + s]); this.group.add(eye);
      this.eyes[s] = { eye };
      const ear = new THREE.Object3D(); ear.position.fromArray(meta['ear' + s]); this.group.add(ear);
      this.ears[s] = ear;
    }
    if (human.o.glasses) this._buildGlasses(meta);
    this._buildPeelAndPath();
    if (human.o.xray) this._buildXray(meta);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(220,240,255,1)', 'rgba(120,180,255,0)'), color: new THREE.Color(2.6, 3.0, 3.6), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    this.flash.position.copy(this.eyes.L.eye.position).add(new THREE.Vector3(0, 0, 0.12));
    this.flash.renderOrder = 20;
    this.group.add(this.flash);
    if (human.o.xray) this.setClipping(true);
  }

  _buildGlasses(meta) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.35, metalness: 0.5 });
    const lens = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12, depthWrite: false });
    const g = new THREE.Group();
    const z = meta.eyeL[2] + 0.27, y = meta.eyeL[1] + 0.01;
    for (const s of [1, -1]) {
      const cx = meta.eyeL[0] * s * 1.05;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 36), mat);
      ring.scale.set(1.12, 0.86, 1);
      ring.position.set(cx, y, z);
      ring.rotation.y = 0.12 * s;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), lens);
      glass.scale.copy(ring.scale); glass.position.copy(ring.position); glass.rotation.copy(ring.rotation);
      g.add(ring, glass);
      // temple arm from the outer rim back to the ear
      const a = new THREE.Vector3(cx + 0.22 * s, y + 0.03, z - 0.04);
      const b = new THREE.Vector3(meta.earL[0] * s * 0.97, meta.earL[1] + 0.2, meta.earL[2] + 0.05);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, a.distanceTo(b), 6), mat);
      arm.position.copy(a).add(b).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16, Math.PI), mat);
    bridge.position.set(0, y + 0.03, z + 0.01);
    g.add(bridge);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.group.add(g);
    this.glasses = g;
  }

  _buildPeelAndPath() {
    // skin flakes that lift off around the exit/entry wounds, seeded on real surface points
    const A = this.human.asset;
    const pos = view(A, 'body.aHead'), nrm = view(A, 'body.normal'), sw = view(A, 'body.swell');
    const near = (c, r) => {
      const out = [];
      for (let i = 0; i < pos.length / 3; i++) {
        const dx = pos[i * 3] - c.x, dy = pos[i * 3 + 1] - c.y, dz = pos[i * 3 + 2] - c.z;
        if (dx * dx + dy * dy + dz * dz < r * r) out.push(i);
      }
      return out;
    };
    const exitV = near(this.exit, 0.2), entryV = near(this.entry, 0.17);
    const N = 46, r = mulberry32(42);
    this.flakes = [];
    for (let i = 0; i < N; i++) {
      const list = i < 34 ? exitV : entryV;
      const vi = list[Math.floor(r() * list.length)];
      const p = new THREE.Vector3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      const n = new THREE.Vector3(nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2]).normalize();
      const s = new THREE.Vector3(sw[vi * 3], sw[vi * 3 + 1], sw[vi * 3 + 2]).divideScalar(HEAD_UNIT);
      this.flakes.push({ p, n, s, delay: r() * 0.6, spin: (r() - 0.5) * 8, drift: new THREE.Vector3((r() - 0.5) * 0.4, -0.3 - r() * 0.5, (r() - 0.5) * 0.4) });
    }
    const flakeGeo = new THREE.CircleGeometry(0.04, 7);
    this.flakeMesh = new THREE.InstancedMesh(flakeGeo, new THREE.MeshStandardMaterial({ color: 0xe2a993, roughness: 0.7, side: THREE.DoubleSide }), N);
    this.flakeMesh.frustumCulled = false;
    this.group.add(this.flakeMesh);

    const segs = 26;
    this.pathMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), glowMaterial(new THREE.Color(2.6, 0.95, 0.35), 1), segs);
    this.pathMesh.material.depthTest = false;
    this.pathMesh.renderOrder = 15;
    this.pathMesh.frustumCulled = false;
    this.pathSegs = segs;
    this.group.add(this.pathMesh);
  }

  _buildXray(meta) {
    const h = this.human;
    this.ghostLayer = [];
    // ghost skin: the real (skinned, swollen) body surface drawn as a fresnel shell
    this.ghostSkinMat = ghostSkinned(0x7fd0ff, 1.6, 2.4, 0.025);
    const ghost = new THREE.SkinnedMesh(h.body.geometry, this.ghostSkinMat);
    ghost.bind(h.skeleton, new THREE.Matrix4());
    ghost.frustumCulled = false;
    ghost.morphTargetInfluences = [0];
    h.morphMeshes.push(ghost);
    h.root.add(ghost);
    this.ghostLayer.push(ghost);
    // stylised skull fitted to the head: cranium, facial bones, orbits, jaw
    const bone = ghostMaterial(0xfff1d6, 1.3, 1.6, 0.06);
    this.boneMat = bone;
    const add = (geo, mat, setup) => { const m = new THREE.Mesh(geo, mat); if (setup) setup(m); this.group.add(m); this.ghostLayer.push(m); return m; };
    add(new THREE.SphereGeometry(1, 48, 32), bone, (m) => { m.position.set(0, 0.24, -0.13); m.scale.set(0.62, 0.74, 0.8); });
    add(new THREE.SphereGeometry(1, 36, 24), bone, (m) => { m.position.set(0, -0.26, 0.34); m.scale.set(0.42, 0.34, 0.34); });
    for (const s of ['L', 'R']) {
      const e = new THREE.Vector3().fromArray(meta['eye' + s]);
      add(new THREE.TorusGeometry(0.16, 0.035, 8, 24), bone, (m) => { m.position.copy(e).setZ(e.z - 0.02); m.rotation.y = (s === 'L' ? 1 : -1) * 0.25; });
    }
    add(new THREE.TorusGeometry(0.4, 0.05, 8, 32, Math.PI), bone, (m) => { m.position.set(0, -0.68, 0.26); m.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI); });
    // brain: opaque so it reads clearly inside the ghost skull
    const BR = this.brainShape = { c: new THREE.Vector3(0, 0.3, -0.14), r: new THREE.Vector3(0.55, 0.56, 0.72) };
    const brain = new THREE.SphereGeometry(1, 96, 64);
    const bp = brain.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i);
      const fold = 0.045 * (Math.sin(v.x * 13 + v.y * 5) * Math.sin(v.y * 15 - v.z * 4) + 0.6 * Math.sin(v.z * 17 + v.x * 6));
      const groove = 1 - 0.1 * Math.exp(-(v.x * v.x) / 0.004) * smooth(clamp(v.y + 0.3));
      v.multiplyScalar((1 + fold) * groove);
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.6; // flatter underside
      bp.setXYZ(i, v.x * BR.r.x + BR.c.x, v.y * BR.r.y + BR.c.y, v.z * BR.r.z + BR.c.z);
    }
    brain.computeVertexNormals();
    this.brainMat = new THREE.MeshStandardMaterial({ color: 0xe79aa2, roughness: 0.5, emissive: new THREE.Color(0.25, 0.05, 0.08) });
    this.brain = add(brain, this.brainMat);
    // seizure arcs: jagged lightning over the brain built from instanced segments
    const r = mulberry32(99);
    this.arcPaths = [];
    for (let i = 0; i < 12; i++) {
      const pts = [];
      let th = r() * Math.PI * 2, ph = 0.25 + r() * 1.5;
      for (let k = 0; k < 11; k++) {
        th += (r() - 0.5) * 0.55; ph += (r() - 0.5) * 0.4;
        pts.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th) * BR.r.x * 1.05, Math.cos(ph) * BR.r.y * 1.05 + BR.c.y, Math.sin(ph) * Math.sin(th) * BR.r.z * 1.05 + BR.c.z));
      }
      this.arcPaths.push(pts);
    }
    this.arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.arcMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true), this.arcMat, 12 * 10);
    this.arcMesh.frustumCulled = false;
    this.arcMesh.renderOrder = 18;
    this.group.add(this.arcMesh);
    this.ghostLayer.push(this.arcMesh);
  }

  /** Clip planes for the x-ray sweep (world space; updated in set()). */
  setClipping(on) {
    this.planeSkin = new THREE.Plane(new THREE.Vector3(0, 0, 1), 100);
    this.planeX = new THREE.Plane(new THREE.Vector3(0, 0, -1), -100);
    const mats = new Set();
    this.skinLayer.forEach((m) => mats.add(m.material));
    mats.add(this.flakeMesh.material);
    if (this.glasses) this.glasses.traverse((m) => m.isMesh && mats.add(m.material));
    for (const m of mats) m.clippingPlanes = on ? [this.planeSkin] : null;
    const gm = new Set();
    (this.ghostLayer || []).forEach((m) => gm.add(m.material));
    for (const m of gm) m.clippingPlanes = on ? [this.planeX] : null;
  }

  /** Apply a full state (missing keys fall back to defaults → frames are independent). */
  set(state) {
    const s = { ...DEFAULT_STATE, ...state };
    this.state = s;
    const h = this.human;
    for (const m of h.morphMeshes) m.morphTargetInfluences[0] = s.swell;
    this.uniforms.uBurn.value = s.burn;
    this.uniforms.uFrozen.value = s.frozen;
    this.uniforms.uRed.value = Math.max(s.redness, s.swell * 1.15);

    // expression → MakeHuman face units
    const sl = s.smileLeft == null ? s.smile : s.smileLeft;
    const browL = s.browRaise * (1 - s.frozen);
    const gx = s.gazeX, gy = s.gazeY;
    h._applyFace({
      LeftUpperLidClosed: Math.max(s.lidL, s.swell * 0.6), RightUpperLidClosed: s.lidR,
      LeftLowerLidUp: s.swell * 0.5 + s.smile * 0.25 * (1 - s.frozen), RightLowerLidUp: s.smile * 0.3,
      MouthRightPullUp: s.smile * 0.9, RightCheekUp: s.smile * 0.7,
      MouthLeftPullUp: sl * 0.9, LeftCheekUp: sl * 0.7,
      MouthLeftPullDown: s.frozen * 0.3,
      NasolabialDeepener: s.smile * 0.3,
      RightInnerBrowUp: s.browRaise * 0.8, RightOuterBrowUp: s.browRaise, LeftInnerBrowUp: browL * 0.8, LeftOuterBrowUp: browL,
      LeftEyeturnLeft: Math.max(0, gx) * 0.8, RightEyeturnLeft: Math.max(0, gx) * 0.8,
      LeftEyeturnRight: Math.max(0, -gx) * 0.8, RightEyeturnRight: Math.max(0, -gx) * 0.8,
      LeftEyeUp: Math.max(0, gy), RightEyeUp: Math.max(0, gy), LeftEyeDown: Math.max(0, -gy), RightEyeDown: Math.max(0, -gy),
    });

    // flakes
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.flakes.forEach((f, i) => {
      const k = clamp((s.peel - f.delay * 0.6) / 0.45);
      const visible = s.burn > 0.05 && s.peel > 0;
      const lift = smooth(k);
      pos.copy(f.p).addScaledVector(f.s, s.swell).addScaledVector(f.n, 0.012 + lift * 0.35).addScaledVector(f.drift, lift * lift);
      q.setFromUnitVectors(zAxis, f.n);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lift * f.spin, lift * f.spin * 0.7, 0)));
      const size = visible ? (k < 1 ? 1 - lift * 0.6 : 0) * smooth(clamp(s.burn * 2)) : 0;
      sc.setScalar(size);
      m4.compose(pos, q, sc);
      this.flakeMesh.setMatrixAt(i, m4);
    });
    this.flakeMesh.instanceMatrix.needsUpdate = true;
    this.flakeMesh.visible = s.peel > 0 && s.burn > 0.05;

    // beam path dashes
    const a = this.entry.clone().addScaledVector(this.beamDir, -0.7);
    const b = this.exit.clone().addScaledVector(this.beamDir, 0.7);
    const L = a.distanceTo(b);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.beamDir);
    for (let i = 0; i < this.pathSegs; i++) {
      const u = (i + 0.5) / this.pathSegs;
      const show = clamp((s.path * 1.25 - u) / 0.08);
      pos.copy(a).addScaledVector(this.beamDir, u * L);
      sc.set(1, show * (L / this.pathSegs) * 0.55 / 0.1, 1).multiplyScalar(show > 0 ? 1 : 0);
      m4.compose(pos, q, sc);
      this.pathMesh.setMatrixAt(i, m4);
    }
    this.pathMesh.instanceMatrix.needsUpdate = true;
    this.pathMesh.visible = s.path > 0;

    // eye flash
    this.flash.visible = s.flash > 0.001;
    this.flash.scale.setScalar(0.2 + 1.6 * s.flash);
    this.flash.material.opacity = clamp(s.flash * 1.5);

    // x-ray sweep along head −Z → +Z (from the back of the skull to the face)
    if (this.ghostLayer) {
      this.group.updateWorldMatrix(true, false);
      const wm = this.group.matrixWorld;
      const sPos = THREE.MathUtils.lerp(-1.45, 1.5, clamp(s.xray));
      const pt = new THREE.Vector3(0, 0, sPos).applyMatrix4(wm);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(wm);
      this.planeSkin.setFromNormalAndCoplanarPoint(n, pt);
      this.planeX.setFromNormalAndCoplanarPoint(n.clone().negate(), pt);
      const anyX = s.xray > 0.001;
      for (const m of this.ghostLayer) m.visible = anyX;
      this.brainMat.emissive.setRGB(0.25 - 0.2 * s.brainGlow, 0.05 + 0.6 * s.brainGlow, 0.08 + 0.62 * s.brainGlow);
      this.arcMesh.visible = anyX && s.arcs > 0;
      if (this.arcMesh.visible) {
        const up = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion(), m = new THREE.Matrix4();
        const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), dir2 = new THREE.Vector3();
        let idx = 0;
        this.arcPaths.forEach((pts, i) => {
          const on = hash1(i * 7.3 + s.arcSeed * 1.91) < 0.55 * s.arcs;
          for (let k = 0; k < pts.length - 1; k++, idx++) {
            const j = (nn, kk) => (hash1(nn * 3.7 + kk * 11.1 + s.arcSeed * 5.3) - 0.5) * 0.08;
            pa.copy(pts[k]).add(new THREE.Vector3(j(i, k), j(i + 9, k), j(i + 17, k)));
            pb.copy(pts[k + 1]).add(new THREE.Vector3(j(i, k + 1), j(i + 9, k + 1), j(i + 17, k + 1)));
            dir2.subVectors(pb, pa);
            const len = dir2.length();
            mid.addVectors(pa, pb).multiplyScalar(0.5);
            q2.setFromUnitVectors(up, dir2.normalize());
            m.compose(mid, q2, new THREE.Vector3(on ? 1 : 0, on ? len : 0, on ? 1 : 0));
            this.arcMesh.setMatrixAt(idx, m);
          }
        });
        this.arcMesh.instanceMatrix.needsUpdate = true;
      }
      if (s.arcs > 0) {
        const fl = hash1(s.arcSeed * 2.17) > 0.5 ? 1 : 0.3;
        this.brainMat.emissive.setRGB(0.2 + 0.25 * fl, 0.03, 0.1 + 0.45 * fl);
      }
    }
  }
}
