'use strict';
// Boot, the state machine and the frame loop.

const IDLE_INPUT = { mx: 0, my: 0, aim: 'auto', padAim: null, dash: false, flare: false };

const Game = (() => {
  let wakeLock = null;

  function requestWakeLock() {
    try {
      if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
    } catch (e) { /* optional */ }
  }

  function start() {
    Sound.ensure();
    resetRun(false);
    G.state = 'play';
    UI.showOnly(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    UI.zoneBanner(ZONES[G.zone]);
    Sound.sonar(false);
    requestWakeLock();
  }
  function pause() {
    if (G.state !== 'play') return;
    G.state = 'paused';
    UI.showPause();
  }
  function resume() {
    if (G.state !== 'paused') return;
    G.state = 'play';
    G.resumeT = 0.35;
    UI.showOnly(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function toTitle() {
    resetRun(true);
    G.state = 'title';
    UI.refreshTitle();
    UI.showOnly('title');
  }
  function openLevelUp() {
    G.state = 'levelup';
    const pearl = G.pendingPearls > 0;
    UI.showLevelUp(rollChoices(pearl), pearl);
    Sound.levelUp();
  }
  function choose(u) {
    applyUpgrade(u);
    if (G.pendingPearls > 0) G.pendingPearls--; else G.pending = Math.max(0, G.pending - 1);
    Sound.choose();
    const P = G.player;
    ring(P.x, P.y, 120, PLAYER_COLOR, 0.5, 4);
    burst(P.x, P.y, PLAYER_COLOR, 16, 260, 3, 0.6);
    if (G.pending > 0 || G.pendingPearls > 0) { openLevelUp(); return; }
    G.state = 'play';
    G.resumeT = 0.45;
    P.inv = Math.max(P.inv, 0.5);
    UI.showOnly(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function endRun(won) {
    G.state = 'over';
    const best = store.get('best', { depth: 0, score: 0 });
    const record = G.depth > best.depth + 0.5;
    store.set('best', { depth: Math.max(best.depth, Math.round(G.depth)), score: Math.max(best.score, Math.round(G.score)) });
    UI.showEnd(won, record && best.depth > 0);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  return { start, pause, resume, toTitle, openLevelUp, choose, endRun };
})();

let lastT = performance.now();

function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  const inp = Input.frame();

  if (inp.mute) {
    Sound.ensure();
    const on = !(Sound.sfxOn || Sound.musicOn);
    Sound.setSfx(on); Sound.setMusic(on);
    UI.syncToggles();
    UI.toast(on ? 'Sound on' : 'Sound off');
  }
  if (inp.pause) {
    if (G.state === 'play') Game.pause();
    else if (G.state === 'paused') Game.resume();
  }

  updateScreenFX(rdt);
  Sound.update();

  let dt = rdt;
  if (G.hitstop > 0) { G.hitstop -= rdt; dt = 0; }
  if (G.slowT > 0) { G.slowT -= rdt; dt *= 0.35; }
  if (G.resumeT > 0) { G.resumeT -= rdt; dt *= 0.35 + 0.65 * (1 - Math.max(0, G.resumeT) / 0.45); }

  let live = false;
  if (G.state === 'title') {
    stepWorld(rdt, Autopilot.frame(rdt));
    live = true;
  } else if (G.state === 'play') {
    const pin = DEBUG.bot ? Autopilot.frame(dt) : inp;
    if (dt > 0) stepWorld(dt, pin);
    Sound.setDepth(G.depth);
    if (G.won) {
      G.endT -= rdt;
      if (G.endT <= 0) Game.endRun(true);
    } else if ((G.pending > 0 || G.pendingPearls > 0) && !(G.boss && G.boss.dying)) {
      Game.openLevelUp();
    }
    live = true;
  } else if (G.state === 'dying') {
    G.deathT += rdt;
    stepWorld(rdt * 0.4, IDLE_INPUT);
    if (G.deathT > 2.1) Game.endRun(false);
    live = true;
  }
  if (DEBUG.bot && G.state === 'levelup') Game.choose(pick(rollChoices(G.pendingPearls > 0)));

  if (live) { updateCamera(rdt); updateSnow(rdt); }
  render();
  UI.update(inp);
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  UI.init();
  Input.attach(canvas, { dash: UI_el('tbDash'), flare: UI_el('tbFlare'), pause: UI_el('tbPause') });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Game.pause(); Sound.suspend(); } else Sound.resume();
  });
  window.addEventListener('blur', () => Game.pause());
  // The first tap anywhere unlocks audio, so the title demo can be heard.
  window.addEventListener('pointerdown', () => Sound.ensure(), { once: true });
  window.addEventListener('keydown', () => Sound.ensure(), { once: true });
  resetRun(true);
  G.state = 'title';
  UI.showOnly('title');
  if (DEBUG.depth || DEBUG.bot || DEBUG.god || DEBUG.level) Game.start();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}
const UI_el = id => document.getElementById(id);

// Test hook for automated play-testing.
window.LF = { G, Game, stepWorld, Autopilot, rollChoices, applyUpgrade, resetRun, spawnEnemy, spawnBoss };

const hot = window.claude && window.claude.hot;
try { if (hot && hot.snapshot) hot.snapshot(() => ({ v: 1 })); } catch (e) { /* optional */ }
if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
