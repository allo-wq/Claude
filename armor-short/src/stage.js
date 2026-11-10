// Lighting + reflections for the hero (foreground) scene.
import * as THREE from 'three';

export function setupForeground(scene, renderer) {
  // Small emissive "studio in a war zone" used only for PBR reflections:
  // warm fire glow from the left, cold sky from the right, soft top light.
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){ vec3 d = normalize(vP);
          vec3 c = mix(vec3(0.05,0.035,0.03), vec3(0.03,0.045,0.08), smoothstep(-0.2,0.8,d.y));
          c += vec3(1.6,0.55,0.12) * smoothstep(0.35,0.0,abs(d.y+0.05)) * (0.35 + 0.65*smoothstep(0.2,-0.9,d.x));
          gl_FragColor = vec4(c,1.0); }`,
    })
  );
  env.add(dome);
  const panel = (color, intensity, pos, size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(0xffffff, 9, [6, 22, 12], [22, 12]);
  panel(0xfff0e0, 5, [16, 6, 16], [8, 14]);
  panel(0xff6a1a, 12, [-22, 3, -10], [10, 18]);
  panel(0x4f8dff, 7, [22, 6, -12], [8, 16]);
  panel(0xffffff, 2.5, [0, -4, 24], [26, 5]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xa9bbdc, 0x5a3a20, 0.75);
  const key = new THREE.DirectionalLight(0xfff1df, 2.0);
  key.position.set(4.5, 6, 8);
  const rimWarm = new THREE.DirectionalLight(0xff8a3a, 3.2);
  rimWarm.position.set(-7, 2.2, -6);
  const rimCool = new THREE.DirectionalLight(0x5b9bff, 3.0);
  rimCool.position.set(7, 3.5, -5);
  const under = new THREE.DirectionalLight(0xffc9a0, 1.1);
  under.position.set(-1.5, -5, 7);
  // pulsed by background explosions
  const blast = new THREE.DirectionalLight(0xffa040, 0);
  blast.position.set(-3, 1, -8);
  scene.add(hemi, key, rimWarm, rimCool, under, blast);
  return { hemi, key, rimWarm, rimCool, under, blast };
}
