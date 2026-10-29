// Entry point. Modes:
//   preview (default): real-time playback with a scrub bar and the soundtrack.
//   ?render=1        : no UI; exposes window.__renderFrame(frame) for the headless capture script.
//   ?t=seconds / ?frame=N renders one exact frame.
import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { FONT } from './core/textures.js';
import { FPS, FRAMES, DURATION, WIDTH, HEIGHT, beatAt, shotAt, LYRICS } from './timeline.js';
import { World } from './world/world.js';
import { Cast, IMPL, lyrics, flashes } from './shots.js';

const params = new URLSearchParams(location.search);
const renderMode = params.has('render');
const scale = Number(params.get('scale') || 1);
const noBloom = params.has('nobloom');

await document.fonts.load(`700 100px ${FONT}`);
await document.fonts.ready;

const stage = new Stage(document.getElementById('stage'), WIDTH, HEIGHT, scale);
const pmrem = new THREE.PMREMGenerator(stage.renderer);
const world = new World(pmrem);
const cast = new Cast(world);
pmrem.dispose();

/** Render the exact frame for video time t (s). */
function renderAt(t) {
  const frame = Math.round(t * FPS);
  const b = beatAt(t);
  const shot = shotAt(b);
  stage.hud.begin();
  const ctx = { t, b, lb: b - shot.start, frame, cam: stage.camera, world, cast, fx: {} };
  cast.reset(b);
  IMPL[shot.id](ctx);
  cast.finish(ctx);
  lyrics(stage.hud, b);
  flashes(stage.hud, b);
  stage.render(world.scene, noBloom ? { ...ctx.fx, bloom: 0 } : ctx.fx);
  return shot;
}

for (let i = 0; i < 3; i++) stage.renderer.compile(world.scene, stage.camera);

window.__meta = { FPS, FRAMES, DURATION, WIDTH, HEIGHT };
window.__cast = cast;
window.__renderFrame = (frame) => renderAt(frame / FPS).id;
window.__renderTime = (t) => renderAt(t).id;

if (renderMode) {
  window.__ready = true;
} else if (params.has('frame') || params.has('t')) {
  renderAt(params.has('t') ? Number(params.get('t')) : Number(params.get('frame')) / FPS);
  window.__ready = true;
} else {
  document.body.classList.add('preview');
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `<button id="pp">Pause</button><input id="scrub" type="range" min="0" max="${FRAMES - 1}" value="0"><span id="time"></span><span id="cap"></span>`;
  document.body.appendChild(ui);
  const scrub = ui.querySelector('#scrub'), timeEl = ui.querySelector('#time'), capEl = ui.querySelector('#cap'), pp = ui.querySelector('#pp');
  let playing = true, t0 = performance.now(), offset = 0;
  const audio = new Audio('audio/soundtrack.flac');
  audio.loop = true;
  const syncAudio = () => { try { audio.currentTime = offset; if (playing) audio.play().catch(() => {}); else audio.pause(); } catch (e) { /* no audio */ } };
  document.addEventListener('click', syncAudio, { once: true });
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? 'Pause' : 'Play'; t0 = performance.now(); offset = Number(scrub.value) / FPS; syncAudio(); };
  scrub.oninput = () => { offset = Number(scrub.value) / FPS; t0 = performance.now(); syncAudio(); if (!playing) draw(offset); };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') pp.onclick();
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { playing = false; pp.textContent = 'Play'; scrub.value = Number(scrub.value) + (e.code === 'ArrowRight' ? 1 : -1); scrub.oninput(); }
  });
  function draw(t) {
    const s = renderAt(t);
    scrub.value = Math.round(t * FPS) % FRAMES;
    const b = beatAt(t);
    timeEl.textContent = `${t.toFixed(2)}s  beat ${b.toFixed(2)}  [shot ${s.id}]`;
    const line = LYRICS.find((l) => b >= l.start && b < l.start + 8);
    capEl.textContent = line ? line.text : '';
  }
  function loop() {
    if (playing) draw(((performance.now() - t0) / 1000 + offset) % DURATION);
    requestAnimationFrame(loop);
  }
  loop();
  window.__ready = true;
}
