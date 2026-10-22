// Shared material palette. Materials are created once and reused across sets.
import * as THREE from 'three';
import * as T from './textures.js';

const std = (color, roughness = 0.7, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

let _M = null;
/** Lazily built so fonts are loaded before any canvas text is drawn. */
export function materials() {
  if (_M) return _M;
  const concreteMap = T.tex(T.concreteTexture(11), { repeat: [1, 1] });
  const floorMap = T.tex(T.floorTexture(12), { repeat: [14, 14] });
  const hazardMap = T.tex(T.hazardTexture(), { repeat: [20, 1] });
  _M = {
    // character
    hair: std(0x2e221a, 0.85),
    grayHair: std(0xb9b6b0, 0.85),
    labCoat: std(0xf1f1ec, 0.75),
    shirt: std(0x9cc0e4, 0.8, 0, { side: THREE.DoubleSide }),
    tie: std(0x7a2622, 0.7),
    trousers: std(0x2c3240, 0.85),
    shoes: std(0x18181b, 0.5),
    eyeWhite: std(0xf4f1ec, 0.25),
    iris: std(0x3b2a1e, 0.2),
    lips: std(0xa65a52, 0.55),
    glasses: std(0x1c1c1e, 0.3, 0.6),
    // machines
    metal: std(0xa4acb5, 0.32, 0.85),
    darkMetal: std(0x3c4248, 0.45, 0.7),
    steelBlue: std(0x41505e, 0.5, 0.5),
    copper: std(0xc0763a, 0.35, 0.9),
    magnetBlue: std(0x2d5ea8, 0.45, 0.25),
    magnetRed: std(0xb3322f, 0.45, 0.25),
    panel: std(0x55626b, 0.6, 0.2),
    panelDark: std(0x262c31, 0.7, 0.1),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    rubber: std(0x111214, 0.9),
    // environment
    concrete: std(0x8d8b86, 0.95, 0, { map: concreteMap }),
    concreteDark: std(0x5c5b58, 0.95, 0, { map: concreteMap }),
    floor: std(0x9a9da0, 0.85, 0, { map: floorMap }),
    hazard: std(0xffffff, 0.7, 0, { map: hazardMap }),
    wood: std(0xffffff, 0.6, 0, { map: T.tex(T.woodTexture(5)) }),
    // emissive (values >1 feed the bloom pass)
    beamCore: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.6, 5.0) }),
    lampRed: std(0x330000, 0.4, 0, { emissive: new THREE.Color(9, 0.6, 0.4) }),
    lampGreen: std(0x003300, 0.4, 0, { emissive: new THREE.Color(0.6, 4.5, 0.9) }),
    lampAmber: std(0x332200, 0.4, 0, { emissive: new THREE.Color(5.5, 2.8, 0.3) }),
    lampOff: std(0x2a2a2a, 0.35, 0.1),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3) }),
  };
  return _M;
}

export function cloneStd(m, overrides = {}) {
  const c = m.clone();
  Object.assign(c, overrides);
  return c;
}

/** Additive fresnel "x-ray" material (rim glow), with clipping support. */
export function ghostMaterial(color = 0x8fd8ff, intensity = 1.4, power = 2.2, base = 0.05) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, power: { value: power }, base: { value: base }, opacity: { value: 1 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 transformed = position;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 color; uniform float intensity; uniform float power; uniform float base; uniform float opacity;
      varying vec3 vN; varying vec3 vV;
      void main(){
        #include <clipping_planes_fragment>
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        gl_FragColor = vec4(color * (f * intensity + base) * opacity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clipping: true,
  });
}

/** Simple additive glow material for beams/flares. */
export function glowMaterial(color, opacity = 1, map = null) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, map });
}
