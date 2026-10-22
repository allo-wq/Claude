// Entry point. Two modes:
//   preview (default): real-time playback with a scrub bar.
//   ?render=1        : no UI; exposes window.__renderFrame(frame) for the headless capture script.
// Also: ?frame=N or ?t=seconds renders one exact frame (handy for inspection).
import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { FONT, FONT_BOLD } from './core/textures.js';
import { FPS, FRAMES, DURATION, WIDTH, HEIGHT, shotAt, NARRATION } from './timeline.js';
import { IMPL, captions, transitions } from './shots.js';
import { HallSet } from './sets/hallSet.js';
import { StudioSet } from './sets/studioSet.js';
import { RingSet } from './sets/ringSet.js';
import { TunnelSet } from './sets/tunnelSet.js';
import { SunsSet } from './sets/sunsSet.js';
import { DoseSet } from './sets/doseSet.js';
import { HospitalSet } from './sets/hospitalSet.js';
import { DeskSet } from './sets/deskSet.js';

const params = new URLSearchParams(location.search);
const renderMode = params.has('render');
const scale = Number(params.get('scale') || 1);
const noBloom = params.has('nobloom'); // debug: inspect geometry without glow

await document.fonts.load(`900 100px ${FONT}`);
await document.fonts.load(`700 100px ${FONT_BOLD}`);
await document.fonts.ready;

const stage = new Stage(document.getElementById('stage'), WIDTH, HEIGHT, scale);
const pmrem = new THREE.PMREMGenerator(stage.renderer);
const sets = {
  ring: new RingSet(),
  hall: new HallSet(pmrem),
  tunnel: new TunnelSet(),
  studio: new StudioSet(pmrem),
  suns: new SunsSet(),
  dose: new DoseSet(),
  hospital: new HospitalSet(pmrem),
  desk: new DeskSet(pmrem),
};
pmrem.dispose();

const tmp = new THREE.Vector3();
function project(p) {
  stage.camera.updateMatrixWorld(); // the shot just moved the camera; don't project with last frame's matrices
  tmp.set(p[0], p[1], p[2]).project(stage.camera);
  return { x: (tmp.x + 1) / 2 * WIDTH, y: (1 - tmp.y) / 2 * HEIGHT };
}

/** Render the exact frame for master-timeline time t (seconds). */
function renderAt(t) {
  const frame = Math.round(t * FPS);
  const shot = shotAt(t);
  stage.hud.begin();
  const extra = {};
  const ctx = { t, lt: t - shot.start, p: (t - shot.start) / (shot.end - shot.start), frame, cam: stage.camera, sets, extra };
  const out = IMPL[shot.id](ctx);
  if (window.__camOverride) { // debugging hook for inspection scripts
    const o = window.__camOverride;
    stage.camera.position.set(...o.pos); stage.camera.up.set(0, 1, 0); stage.camera.lookAt(...o.target);
    stage.camera.fov = o.fov || stage.camera.fov; stage.camera.updateProjectionMatrix();
  }
  captions(stage.hud, t, { ...extra, project });
  transitions(stage.hud, t);
  stage.render(out.scene, noBloom ? { ...out.fx, bloom: 0 } : out.fx);
  return shot;
}

// Compile every set's shaders up-front so no frame pays a compile hitch.
for (const s of Object.values(sets)) stage.renderer.compile(s.scene, stage.camera);

window.__meta = { FPS, FRAMES, DURATION, WIDTH, HEIGHT };
window.__sets = sets; // debugging hook (inspection scripts only)
window.__renderFrame = (frame) => { const s = renderAt(frame / FPS); return s.id; };
window.__renderTime = (t) => renderAt(t).id;

if (renderMode) {
  window.__ready = true;
} else if (params.has('frame') || params.has('t')) {
  const t = params.has('t') ? Number(params.get('t')) : Number(params.get('frame')) / FPS;
  renderAt(t);
  window.__ready = true;
} else {
  // Preview player
  document.body.classList.add('preview');
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `<button id="pp">Pause</button><input id="scrub" type="range" min="0" max="${FRAMES - 1}" value="0"><span id="time"></span><span id="cap"></span>`;
  document.body.appendChild(ui);
  const scrub = ui.querySelector('#scrub'), timeEl = ui.querySelector('#time'), capEl = ui.querySelector('#cap'), pp = ui.querySelector('#pp');
  let playing = true, t0 = performance.now(), offset = 0;
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? 'Pause' : 'Play'; t0 = performance.now(); offset = Number(scrub.value) / FPS; };
  scrub.oninput = () => { offset = Number(scrub.value) / FPS; t0 = performance.now(); if (!playing) draw(offset); };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') pp.onclick();
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { playing = false; pp.textContent = 'Play'; scrub.value = Number(scrub.value) + (e.code === 'ArrowRight' ? 1 : -1); scrub.oninput(); }
  });
  function draw(t) {
    const s = renderAt(t);
    scrub.value = Math.round(t * FPS);
    timeEl.textContent = `${t.toFixed(2)}s  f${Math.round(t * FPS)}  [${s.id}]`;
    const line = NARRATION.find((n) => t >= n.start && t < n.end);
    capEl.textContent = line ? line.text : '';
  }
  function loop() {
    if (playing) draw(((performance.now() - t0) / 1000 + offset) % DURATION);
    requestAnimationFrame(loop);
  }
  loop();
  window.__ready = true;
}
