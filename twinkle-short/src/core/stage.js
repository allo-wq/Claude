// Renderer + post-processing. One composer is shared by every set; each frame the
// active shot decides which scene/camera to render and the bloom/exposure values.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Hud } from './hud.js';

export class Stage {
  constructor(container, W, H, scale = 1) {
    this.W = W; this.H = H;
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;
    r.domElement.id = 'frame';
    container.appendChild(r.domElement);

    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.6, 0.45, 0.9);
    // directional motion blur for whip pans / fast moves (direction in UV units per frame)
    this.blur = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec4 c = vec4(0.0); float w = 0.0;
          for (int i = 0; i < 16; i++) { float t = float(i) / 15.0 - 0.5; float k = 1.0 - abs(t);
            c += texture2D(tDiffuse, clamp(vUv + uDir * t, 0.0, 1.0)) * k; w += k; }
          gl_FragColor = c / w; }`,
    });
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.blur);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 400);
    this.hud = new Hud(W, H);
    this.hud.camera.left = 0; this.hud.camera.right = W; this.hud.camera.top = 0; this.hud.camera.bottom = -H;
    this.hud.camera.updateProjectionMatrix();
  }

  /** fx: { bloom, bloomRadius, bloomThreshold, exposure, blur: [dx, dy] (UV units) } */
  render(scene, fx = {}) {
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    this.renderPass.scene = scene;
    this.renderPass.camera = this.camera;
    this.bloom.strength = (fx.bloom ?? 0.6) * 0.8;
    this.bloom.radius = fx.bloomRadius ?? 0.35;
    this.bloom.threshold = fx.bloomThreshold ?? 2.0;
    this.renderer.toneMappingExposure = fx.exposure ?? 1.0;
    const bl = fx.blur || [0, 0];
    this.blur.enabled = Math.hypot(bl[0], bl[1]) > 0.0015;
    this.blur.uniforms.uDir.value.set(bl[0], bl[1]);
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
    this.hud.render(this.renderer);
  }
}
