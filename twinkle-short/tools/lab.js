// Character lab: one character under the show's lighting, posed from JSON.
// window.__lab({ who: 'star'|'bunny'|..., pose: {...}, cam: {pos, target, fov} })
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Star } from '../src/characters/star.js';
import { Bunny } from '../src/characters/bunny.js';

const W = 720, H = 1280;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.domElement.id = 'frame';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4a2a8a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x6a3a7a, 1.4));
const key = new THREE.DirectionalLight(0xfff0dd, 2.4); key.position.set(3, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xff9ad5, 2.0); rim.position.set(-4, 2, -3); scene.add(rim);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
const made = {};
const builders = { star: () => new Star({ light: false }), bunny: () => { const b = new Bunny({ size: 1 }); b.root.position.y = 0.6; return b; } };
window.__lab = (o = {}) => {
  const who = o.who || 'star';
  for (const m of Object.values(made)) m.root.visible = false;
  if (!made[who]) { made[who] = builders[who](); scene.add(made[who].root); }
  const c = made[who]; c.root.visible = true;
  c.set(o.pose || {});
  const cc = o.cam || { pos: [0, 0, 6], target: [0, 0, 0], fov: 30 };
  cam.position.set(...cc.pos); cam.fov = cc.fov || 30; cam.updateProjectionMatrix(); cam.lookAt(...cc.target);
  renderer.render(scene, cam);
  return true;
};
window.__ready = true;
