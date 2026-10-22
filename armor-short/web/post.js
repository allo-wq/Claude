// Final "editor" pass: whip-pan blur, zoom blur, chromatic aberration,
// slice glitch, impact-frame invert, flash, grade, vignette and grain.
import * as THREE from 'three';

export const EditShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1080, 1920) },
    uSeed: { value: 0 },
    uCA: { value: 0 },
    uZoomBlur: { value: 0 },
    uHBlur: { value: 0 },
    uGlitch: { value: 0 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uInvert: { value: 0 },
    uSat: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uSeed, uCA, uZoomBlur, uHBlur, uGlitch, uFlash, uInvert, uSat;
    uniform vec3 uFlashCol;
    varying vec2 vUv;
    float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 tap(vec2 uv, float ca){
      vec2 d = (uv - 0.5) * ca;
      return vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
    }
    void main(){
      vec2 uv = vUv;
      float ca = uCA;
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 26.0 + floor(uSeed * 5.0));
        float r = h21(vec2(band, floor(uSeed * 11.0)));
        if (r < uGlitch * 0.55) uv.x += (h21(vec2(band * 1.7, uSeed)) - 0.5) * 0.18 * uGlitch;
        ca += uGlitch * 0.03;
      }
      vec3 col;
      if (uZoomBlur + uHBlur > 0.002) {
        col = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 14; i++) {
          float f = float(i) / 13.0;
          vec2 o = -(uv - 0.5) * uZoomBlur * f + vec2((f - 0.5) * uHBlur, 0.0);
          float w = 1.0 - f * 0.55;
          col += tap(uv + o, ca) * w; tot += w;
        }
        col /= tot;
      } else if (ca > 0.0004) {
        col = tap(uv, ca);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // Grade: crush blacks a touch, warm highlights, cool shadows.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = mix(col * vec3(0.94, 1.0, 1.06), col * vec3(1.05, 1.0, 0.94), smoothstep(0.15, 0.7, l));
      col = (col - 0.5) * 1.07 + 0.5;
      // Vignette.
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.75);
      col *= 1.0 - smoothstep(0.25, 0.75, length(q)) * 0.6;
      // Flash + impact-frame invert.
      col = col + uFlashCol * uFlash;
      col = mix(col, vec3(1.0) - clamp(col, 0.0, 1.0), uInvert);
      // Grain.
      col += (h21(vUv * uRes + uSeed * 913.0) - 0.5) * 0.045;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
