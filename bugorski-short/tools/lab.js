// Character lab: renders one Human under neutral studio light for inspection.
// window.__lab({ asset, outfit, hair, pose, head, cam: {pos, target, fov}, w, h }) → renders.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadHumanAssets, Human } from '../src/assets/human.js';

await loadHumanAssets(['bugorski', 'doctor']);
const W = 720, H = 1280;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
renderer.domElement.id = 'frame';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e34);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x221a18, 0.6));
const key = new THREE.DirectionalLight(0xffe6cc, 2.8); key.position.set(2, 3, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -0.2, near: 0.5, far: 12 });
key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8cc4ff, 2.5); rim.position.set(-3, 2, -3); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-3, 0.5, 3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
const people = {};
window.__lab = (o = {}) => {
  const k = `${o.asset || 'bugorski'}|${o.outfit || 'labcoat'}|${o.hair || 'brown'}|${!!o.glasses}|${!!o.xray}`;
  for (const p of Object.values(people)) p.root.visible = false;
  if (!people[k]) { people[k] = new Human({ asset: o.asset, outfit: o.outfit, hair: o.hair, glasses: o.glasses, xray: o.xray }); scene.add(people[k].root); }
  const p = people[k];
  p.root.visible = true;
  for (const [k2, m] of Object.entries(p.clothes)) m.visible = !(o.hide || []).includes(k2);
  p.root.position.set(0, 0, 0); p.root.rotation.set(0, o.yaw || 0, 0);
  if (o.walk != null) p.walk(o.walk); else p.pose(o.pose || {});
  if (o.reach) for (const [side, t, pole] of o.reach) p.reach(side, new THREE.Vector3(...t), new THREE.Vector3(...pole));
  p.head.set(o.head || {});
  let c = o.cam || { pos: [0, 1.0, 4.2], target: [0, 0.95, 0], fov: 30 };
  if (o.camHead) { // camera given in head units around the head centre
    const hp = (v) => p.headPoint(new THREE.Vector3(...v)).toArray();
    c = { pos: hp(o.camHead.pos), target: hp(o.camHead.target), fov: o.camHead.fov };
  }
  cam.position.set(...c.pos); cam.fov = c.fov || 30; cam.updateProjectionMatrix(); cam.lookAt(...c.target);
  renderer.render(scene, cam);
  return true;
};
window.__ready = true;
