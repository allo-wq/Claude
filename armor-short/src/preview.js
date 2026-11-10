// Dev-only contact sheet: renders one armour piece from a few angles.
import * as THREE from 'three';
import { buildPieces } from './models.js';
import { setupForeground } from './stage.js';

const q = new URLSearchParams(location.search);
const W = 1400, H = 1400;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c20);
setupForeground(scene, renderer);
const pieces = buildPieces();
const id = q.get('id') || 'helmet';
const piece = pieces[id];
if (q.get('mode') === 'set') {
  for (const p of Object.values(pieces)) {
    p.setMode('set');
    p.root.scale.setScalar(p.setScale);
    p.root.position.set(...p.setPos);
    scene.add(p.root);
  }
} else scene.add(piece.root);
const green = parseFloat(q.get('green') || '0');
for (const p of Object.values(pieces)) { p.U.uSweepY.value = green ? -100 + 200 * green : -1000; if (green > 0 && green < 1) { p.U.uSweepY.value = (green - 0.5) * 3; p.U.uSweepGlow.value = 1; } }
const cam = new THREE.PerspectiveCamera(q.get('mode') === 'set' ? 30 : 24, 1, 0.1, 100);
const yaws = (q.get('yaws') || '-0.5,0.6,1.9,3.4').split(',').map(Number);
const dist = parseFloat(q.get('dist') || (q.get('mode') === 'set' ? '15' : '9.5'));
const pitch = parseFloat(q.get('pitch') || '0.12');
window.renderPreview = () => {
  renderer.setScissorTest(true);
  yaws.forEach((yaw, i) => {
    const vx = (i % 2) * (W / 2), vy = (1 - Math.floor(i / 2)) * (H / 2);
    renderer.setViewport(vx, vy, W / 2, H / 2);
    renderer.setScissor(vx, vy, W / 2, H / 2);
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(0, 0, 0);
    scene.updateMatrixWorld(true);
    for (const p of Object.values(pieces)) p.U.uPieceInv.value.copy(p.inner.matrixWorld).invert();
    renderer.render(scene, cam);
  });
  return true;
};
window.READY = true;
