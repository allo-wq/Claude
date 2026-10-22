// Close-up "studio": a head-and-shoulders bust of Bugorski on a graded backdrop,
// used for the medical explanation shots (beam through skull, swelling, paralysis,
// deafness, seizures, intact mind). Units: head radius = 1 (≈ 11 cm).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { materials, glowMaterial } from '../core/materials.js';
import { Head } from '../assets/head.js';
import { Beam } from '../assets/beam.js';
import { FONT_BOLD, radialTexture } from '../core/textures.js';
import { clamp, smooth, mulberry32 } from '../core/util.js';

function extrude(shape, depth = 0.25, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1 });
  g.center();
  return g;
}

function boltShape() {
  const s = new THREE.Shape();
  s.moveTo(0.15, 1); s.lineTo(-0.45, -0.05); s.lineTo(-0.02, -0.05); s.lineTo(-0.2, -1);
  s.lineTo(0.45, 0.15); s.lineTo(0.03, 0.15); s.lineTo(0.15, 1);
  return s;
}
function speakerShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.6, -0.25); s.lineTo(-0.25, -0.25); s.lineTo(0.2, -0.65); s.lineTo(0.2, 0.65); s.lineTo(-0.25, 0.25); s.lineTo(-0.6, 0.25); s.lineTo(-0.6, -0.25);
  return s;
}

export class StudioSet {
  constructor(pmrem) {
    const M = materials();
    const s = (this.scene = new THREE.Scene());
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.45;

    // graded backdrop sphere (colours set per shot)
    this.bgUniforms = { top: { value: new THREE.Color(0x1b2a44) }, bottom: { value: new THREE.Color(0x05070c) }, glow: { value: new THREE.Color(0x203858) } };
    const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.bgUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; varying vec3 vP;
        void main(){ vec3 c = mix(bottom, top, smoothstep(-0.4, 0.7, vP.y)); c += glow * pow(max(0.0, 1.0 - length(vP.xy - vec2(0.0, 0.1))), 3.0) * 0.6; gl_FragColor = vec4(c, 1.0); }`,
    }));
    s.add(bg);

    // lights
    s.add(new THREE.HemisphereLight(0xcfe0ff, 0x221a18, 0.6));
    const key = (this.key = new THREE.DirectionalLight(0xffe6cc, 2.8));
    key.position.set(4, 4, 6);
    s.add(key);
    const rim = (this.rim = new THREE.DirectionalLight(0x8cc4ff, 3.0));
    rim.position.set(-5, 3, -5);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-4, -1, 4);
    s.add(fill);

    // bust
    this.bust = new THREE.Group();
    s.add(this.bust);
    this.head = new Head({ xray: true });
    this.bust.add(this.head.group);
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ab88, roughness: 0.62 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 1.3, 24), skin);
    neck.position.set(0, -1.2, -0.12);
    this.bust.add(neck);
    this.neckMesh = neck;
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 2.4, 8, 24).rotateZ(Math.PI / 2), M.labCoat);
    shoulders.scale.set(1, 1, 0.62);
    shoulders.position.set(0, -2.5, -0.15);
    this.bust.add(shoulders);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.55, 2.4, 32, 1), M.labCoat);
    chest.scale.z = 0.58; chest.position.set(0, -3.65, -0.15);
    this.bust.add(chest);
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.62, 1.4, 3), M.shirt);
    shirt.rotation.x = Math.PI; shirt.scale.z = 0.3; shirt.position.set(0, -2.35, 0.72);
    this.bust.add(shirt);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, 0.08), M.tie);
    tie.position.set(0, -2.8, 0.8); tie.rotation.x = -0.12;
    this.bust.add(tie);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.17, 10, 28), M.labCoat);
    collar.rotation.x = Math.PI / 2 - 0.25; collar.position.set(0, -1.8, -0.05); collar.scale.set(1.05, 1, 0.9);
    this.bust.add(collar);
    this.bustParts = [neck, shoulders, chest, shirt, tie, collar];
    skin.clippingPlanes = [this.head.planeSkin];
    const ghostNeck = new THREE.Mesh(neck.geometry, this.head.ghostSkinMat);
    ghostNeck.position.copy(neck.position);
    this.bust.add(ghostNeck);
    this.head.ghostLayer.push(ghostNeck);

    // beam through the head (local +X aligned to the head's beam direction)
    this.beam = new Beam({ radius: 0.03, glow: 2.6, bunches: 24, bunchLen: 0.5, bunchRadius: 0.06 });
    this.beam.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.head.beamDir);
    this.beam.group.position.copy(this.head.entry);
    this.head.group.add(this.beam.group);
    this.hitFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(120,200,255,0)'), blending: THREE.AdditiveBlending, depthTest: false, transparent: true }));
    this.hitFlash.renderOrder = 30;
    this.head.group.add(this.hitFlash);

    this._buildIcons();
    this._buildWaves();
    this._buildEquations();
  }

  _buildIcons() {
    const white = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: new THREE.Color(0.5, 0.35, 0.02), roughness: 0.35, metalness: 0.1 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: new THREE.Color(0.9, 0.05, 0.05), roughness: 0.4 });
    const mk = (geo) => {
      const g = new THREE.Group();
      const icon = new THREE.Mesh(geo, white);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 12, 48), red);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.24, 0.24), red);
      bar.rotation.z = -Math.PI / 4;
      g.add(icon, ring, bar);
      g.userData = { icon, ring, bar };
      this.scene.add(g);
      return g;
    };
    this.painIcon = mk(extrude(boltShape(), 0.3));
    const sp = new THREE.Group();
    const spk = new THREE.Mesh(extrude(speakerShape(), 0.3), white);
    spk.position.x = -0.2;
    sp.add(spk);
    for (const r of [0.45, 0.75]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 24, Math.PI * 0.6), white);
      arc.rotation.z = -Math.PI * 0.3; arc.position.x = 0.05;
      sp.add(arc);
    }
    const soundGeoGroup = sp;
    this.soundIcon = mk(new THREE.BufferGeometry());
    this.soundIcon.userData.icon.add(soundGeoGroup);
  }

  _buildWaves() {
    // expanding sound-wave arcs travelling toward each ear (horizontal plane)
    this.waves = [];
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 5; i++) {
        const mat = glowMaterial(side === 0 ? new THREE.Color(0.8, 3.4, 2.0) : new THREE.Color(0.8, 2.4, 3.8), 1);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 48, Math.PI * 0.55), mat);
        arc.frustumCulled = false;
        this.scene.add(arc);
        this.waves.push({ arc, side, i });
      }
    }
    const blockMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: new THREE.Color(4, 0.25, 0.25), roughness: 0.4 });
    this.earBlock = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 10, 40), blockMat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.12), blockMat);
    bar.rotation.z = -Math.PI / 4;
    this.earBlock.add(ring, bar);
    this.scene.add(this.earBlock);
    const okMat = glowMaterial(new THREE.Color(0.8, 4.0, 2.0), 0.9);
    this.earGlow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 40), okMat);
    this.scene.add(this.earGlow);
  }

  _buildEquations() {
    const eqs = ['E = mc²', 'F = q(E + v × B)', 'γ = 1/√(1−β²)', 'p = γmv', 'ΔxΔp ≥ ħ/2', '∇·E = ρ/ε₀'];
    this.equations = eqs.map((e, i) => {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 160;
      const g = c.getContext('2d');
      g.font = `700 92px ${FONT_BOLD}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(80,200,255,0.9)'; g.shadowBlur = 24;
      g.fillStyle = '#e8f6ff';
      g.fillText(e, 512, 80);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      sp.scale.set(2.6, 0.41, 1);
      this.scene.add(sp);
      return sp;
    });
  }

  /** Reset per-frame optional elements; shots then enable what they need. */
  update(t, o = {}) {
    const {
      head = {}, beam = null, bg = null, icons = {}, waves = 0, eq = 0, hitFlash = 0, bustRot = [0, 0, 0], shakeAmt = 0,
    } = o;
    this.bust.rotation.set(bustRot[0], bustRot[1], bustRot[2]);
    if (shakeAmt) {
      this.bust.position.set(Math.sin(t * 61) * 0.03 * shakeAmt, Math.sin(t * 47) * 0.02 * shakeAmt, 0);
      this.bust.rotation.z += Math.sin(t * 53) * 0.02 * shakeAmt;
    } else this.bust.position.set(0, 0, 0);
    this.head.set(head);
    if (bg) {
      this.bgUniforms.top.value.set(bg[0]); this.bgUniforms.bottom.value.set(bg[1]); this.bgUniforms.glow.value.set(bg[2]);
    }
    // bust also fades for x-ray (only the head is x-rayed; shoulders get darker)
    const x = head.xray || 0;
    this.bustParts.forEach((p) => (p.visible = true));

    // beam (local coords along beamDir from the entry point)
    if (beam) {
      this.beam.group.visible = true;
      this.beam.setOverlay(!!beam.overlay);
      this.beam.update({ t, from: beam.from ?? -6, to: beam.to ?? 6, head: beam.head ?? Infinity, speed: beam.speed ?? 10, spacing: beam.spacing ?? 1.4, intensity: beam.intensity ?? 1, core: beam.core ?? true });
      if (beam.color) this.beam.coreMat.color.copy(beam.color);
      else this.beam.coreMat.color.setRGB(1.6, 3.6, 5.0);
    } else this.beam.group.visible = false;

    this.hitFlash.visible = hitFlash > 0.01;
    if (this.hitFlash.visible) {
      this.hitFlash.position.copy(hitFlash > 0 ? (o.hitAt === 'exit' ? this.head.exit : this.head.entry) : this.head.entry);
      this.hitFlash.scale.setScalar(0.4 + 1.1 * hitFlash);
      this.hitFlash.material.opacity = clamp(hitFlash) * 0.6;
    }

    // icons {pain:{v,x,cross}, sound:{...}}
    for (const [name, ic] of [['pain', this.painIcon], ['sound', this.soundIcon]]) {
      const st = icons[name];
      ic.visible = !!st && st.v > 0.001;
      if (!ic.visible) continue;
      const pop = smooth(clamp(st.v));
      ic.position.set(...st.pos);
      ic.scale.setScalar(pop * (st.size ?? 0.9));
      ic.rotation.set(0, Math.sin(t * 1.5) * 0.25 + (st.yaw ?? 0), 0);
      const cr = smooth(clamp(st.cross ?? 0));
      ic.userData.ring.visible = ic.userData.bar.visible = cr > 0.01;
      ic.userData.ring.scale.setScalar(0.6 + 0.4 * cr);
      ic.userData.bar.scale.set(cr, 1, 1);
    }

    // sound waves converge on each ear: side 0 → right ear (−X, heard),
    // side 1 → left ear (+X) where they die out before arriving (deaf).
    const earR = new THREE.Vector3(), earL = new THREE.Vector3();
    this.head.ears.R.getWorldPosition(earR); this.head.ears.L.getWorldPosition(earL);
    for (const w of this.waves) {
      w.arc.visible = waves > 0.001;
      if (!w.arc.visible) continue;
      const ear = w.side === 0 ? earR : earL;
      const ph = (t * 0.9 + w.i / 5) % 1;
      const dist = 1.7 - ph * 1.35;
      const fade = w.side === 1 ? clamp((dist - 0.95) / 0.35) : clamp((dist - 0.42) / 0.25);
      w.arc.position.copy(ear);
      w.arc.rotation.set(0, 0, w.side === 1 ? -Math.PI * 0.275 : Math.PI * 0.725);
      w.arc.scale.setScalar(dist);
      w.arc.material.opacity = waves * fade * smooth(clamp(ph * 5));
    }
    this.earBlock.visible = waves > 0.01;
    this.earBlock.position.copy(earL).add(new THREE.Vector3(0.55, 0.0, 0.5));
    if (this.camera) this.earBlock.lookAt(this.camera.position);
    this.earBlock.scale.setScalar(smooth(clamp(waves * 1.5 - 0.3)));
    this.earGlow.visible = waves > 0.01;
    this.earGlow.position.copy(earR);
    this.earGlow.rotation.set(0, 0, 0);
    const pulse = (t * 0.9) % 1;
    this.earGlow.scale.setScalar(0.4 + pulse * 0.5);
    this.earGlow.material.opacity = waves * (1 - pulse) * 0.9;

    // equations orbiting the head ("mind intact")
    this.equations.forEach((sp, i) => {
      sp.visible = eq > 0.001;
      if (!sp.visible) return;
      const a = t * 0.55 + (i / this.equations.length) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 2.7, 0.9 + Math.sin(a * 2 + i) * 0.35 + (i % 2) * 0.5 - 0.2, Math.sin(a) * 2.2);
      sp.material.opacity = eq * (0.55 + 0.45 * Math.max(0, Math.sin(a) * 0.5 + 0.5));
    });
  }
}
