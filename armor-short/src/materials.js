// PBR materials for the armour, patched with:
//  * procedural camo + wear + micro-bump (no textures / UVs needed)
//  * the "turns green" sweep: everything below uSweepY becomes glowing green
import * as THREE from 'three';
import { noiseTexture } from './noise3d.js';

export const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(7.1, 3.3, 1.7); a *= 0.5; } return s; }
`;

function armorMaterial(U, o) {
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0x888888,
    roughness: o.roughness ?? 0.8,
    metalness: o.metalness ?? 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: o.env ?? 1.0,
  });
  const local = {
    uCamo: { value: o.camo ? 1 : 0 },
    uBump: { value: o.bump ?? 0.006 },
    uBumpFreq: { value: o.bumpFreq ?? 70 },
    uWear: { value: o.wear ?? 0.5 },
    uCamoA: { value: new THREE.Color(0x85754f) },
    uCamoB: { value: new THREE.Color(0x4b3b27) },
    uCamoC: { value: new THREE.Color(0x505a30) },
    uCamoD: { value: new THREE.Color(0x23281a) },
    uNoise: { value: noiseTexture() },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uPieceInv;\nvarying vec3 vWPos;\nvarying vec3 vPPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vec4 wp_ = modelMatrix * vec4(transformed, 1.0);\n  vWPos = wp_.xyz;\n  vPPos = (uPieceInv * wp_).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSweepY, uGreenAmt, uSweepGlow, uFlash, uTime;
uniform float uCamo, uBump, uBumpFreq, uWear;
uniform vec3 uCamoA, uCamoB, uCamoC, uCamoD;
uniform highp sampler3D uNoise;
varying vec3 vWPos;
varying vec3 vPPos;`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  if (uCamo > 0.5) {
    vec3 cn_ = texture(uNoise, vPPos * 0.375 + vec3(0.13, 0.57, 0.31)).rgb;
    vec3 cc = uCamoA;
    cc = mix(cc, uCamoB, smoothstep(0.50, 0.525, cn_.r));
    cc = mix(cc, uCamoC, smoothstep(0.53, 0.555, cn_.g));
    cc = mix(cc, uCamoD, smoothstep(0.60, 0.62, cn_.b));
    diffuseColor.rgb = cc;
  }
  diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * texture(uNoise, vPPos * 0.7 + vec3(0.41, 0.17, 0.83)).r, uWear);
  float gEdge_ = vWPos.y - uSweepY;
  float gMask_ = (1.0 - smoothstep(-0.025, 0.025, gEdge_)) * uGreenAmt;
  {
    float lum_ = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 gCol_ = vec3(0.0, 0.3, 0.04) * (0.3 + 3.0 * lum_);
    diffuseColor.rgb = mix(diffuseColor.rgb, gCol_, gMask_);
  }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.5), gMask_);'
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
  {
    float h_ = texture(uNoise, vPPos * (uBumpFreq / 16.0)).a;
    vec2 dH_ = vec2(dFdx(h_), dFdy(h_)) * uBump;
    vec3 sx_ = dFdx(-vViewPosition), sy_ = dFdy(-vViewPosition);
    vec3 r1_ = cross(sy_, normal), r2_ = cross(normal, sx_);
    float det_ = dot(sx_, r1_);
    vec3 grad_ = sign(det_) * (dH_.x * r1_ + dH_.y * r2_);
    normal = normalize(abs(det_) * normal - grad_);
  }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
  {
    float fr_ = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
    float band_ = exp(-abs(gEdge_) * 20.0) * uSweepGlow;
    float scan_ = 0.5 + 0.5 * sin(vWPos.y * 46.0 - uTime * 14.0);
    totalEmissiveRadiance += vec3(0.0, 1.0, 0.16) * (gMask_ * (0.03 + 0.55 * fr_ * fr_ + 0.03 * scan_ + uFlash * 1.2) + band_ * 2.4);
    totalEmissiveRadiance += vec3(0.7, 1.0, 0.8) * band_ * band_ * 1.6;
  }`
      );
  };
  return m;
}

// One material set (with its own sweep uniforms) per armour piece.
export function makeMaterials() {
  const U = {
    uSweepY: { value: -1000 },
    uGreenAmt: { value: 1 },
    uSweepGlow: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uPieceInv: { value: new THREE.Matrix4() },
  };
  const mk = (o) => armorMaterial(U, o);
  return {
    U,
    camo: mk({ camo: true, roughness: 0.9, bump: 0.004, bumpFreq: 42, wear: 0.5 }),
    camoShell: mk({ camo: true, roughness: 0.62, bump: 0.0015, bumpFreq: 30, wear: 0.5 }),
    fabric: mk({ color: 0x6f5f40, roughness: 0.9, bump: 0.004, bumpFreq: 42, wear: 0.5 }),
    fabricDark: mk({ color: 0x35321f, roughness: 0.95, bump: 0.004, bumpFreq: 42, wear: 0.5 }),
    webbing: mk({ color: 0x57492f, roughness: 0.88, bump: 0.005, bumpFreq: 55, wear: 0.4 }),
    velcro: mk({ color: 0x23241b, roughness: 1.0, bump: 0.004, bumpFreq: 60, wear: 0.35 }),
    shell: mk({ color: 0x6b5d3f, roughness: 0.6, bump: 0.0015, bumpFreq: 30, wear: 0.55 }),
    suede: mk({ color: 0x7d6645, roughness: 0.95, bump: 0.003, bumpFreq: 50, wear: 0.55 }),
    suedeDark: mk({ color: 0x46392a, roughness: 0.9, bump: 0.003, bumpFreq: 50, wear: 0.5 }),
    polymer: mk({ color: 0x141513, roughness: 0.46, metalness: 0.1, bump: 0.001, bumpFreq: 30, wear: 0.3 }),
    rubber: mk({ color: 0x0c0c0b, roughness: 0.82, bump: 0.002, bumpFreq: 45, wear: 0.3 }),
    elastic: mk({ color: 0x121210, roughness: 0.9, bump: 0.004, bumpFreq: 60, wear: 0.2 }),
    metal: mk({ color: 0x2c2c2a, roughness: 0.36, metalness: 0.9, bump: 0.0005, bumpFreq: 30, wear: 0.3 }),
    patch: mk({ color: 0x9a8a62, roughness: 0.9, bump: 0.003, bumpFreq: 55, wear: 0.3 }),
    lens: mk({ color: 0xff8a22, roughness: 0.07, metalness: 1.0, bump: 0.0, wear: 0.0, env: 1.6 }),
  };
}
