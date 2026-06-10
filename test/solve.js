// Load the game script in a sandbox and BFS over inputs to prove the level is beatable.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code += `
globalThis.__test = {
  objects,
  getPlayer: () => player,
  resetRun,
  getState: () => state,
  step(hold) {
    holding = hold;
    jumpBuffer = hold ? 0.12 : 0;
    physicsStep(1/240);
    jumpBuffer = Math.max(0, jumpBuffer - 1/240);
  },
  save() {
    return { x: player.x, y: player.y, vy: player.vy, mode: player.mode,
             grounded: player.grounded, dead: player.dead, state,
             orbs: objects.filter(o => o.t === 'orb').map(o => o.used) };
  },
  restore(s) {
    player.x = s.x; player.y = s.y; player.vy = s.vy; player.mode = s.mode;
    player.grounded = s.grounded; player.dead = s.dead; state = s.state;
    let i = 0;
    for (const o of objects) if (o.t === 'orb') o.used = s.orbs[i++];
  },
  LEVEL_END, U,
};
`;

const noop = () => {};
const ctx2d = new Proxy({}, {
  get: (t, k) => k === 'createLinearGradient' ? (() => ({ addColorStop: noop })) : noop,
  set: () => true,
});
const canvas = { width: 960, height: 540, getContext: () => ctx2d, style: {} };
const sandbox = {
  document: { getElementById: () => canvas },
  addEventListener: noop,
  localStorage: { getItem: () => null, setItem: noop },
  performance: { now: () => 0 },
  requestAnimationFrame: noop,
  setTimeout: noop,
  innerWidth: 960, innerHeight: 570,
  window: {},
  console, Math,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const T = sandbox.__test;

T.resetRun();
const start = T.save();

const DT_STEPS = Math.ceil((T.LEVEL_END - start.x) / 384 * 240) + 200;
let layer = [start];
let furthestDeath = -Infinity;
let won = false;

for (let step = 0; step < DT_STEPS && !won; step++) {
  const next = new Map();
  for (const s of layer) {
    for (const hold of [false, true]) {
      T.restore(s);
      T.step(hold);
      const st = T.getState();
      if (st === 'win') { won = true; break; }
      if (st !== 'playing') {
        const p = T.getPlayer();
        if (p.x > furthestDeath) furthestDeath = p.x;
        continue;
      }
      const ns = T.save();
      const key = `${ns.mode}|${ns.grounded}|${Math.round(ns.y / 2)}|${Math.round(ns.vy / 25)}|${ns.orbs.join('')}`;
      if (!next.has(key)) next.set(key, ns);
    }
    if (won) break;
  }
  layer = [...next.values()];
  if (layer.length > 4000) layer = layer.slice(0, 4000);
  if (layer.length === 0) break;
}

if (won) {
  console.log('LEVEL IS BEATABLE ✔');
} else {
  console.log('LEVEL IS NOT BEATABLE ✘');
  console.log('furthest death at x =', (furthestDeath / T.U).toFixed(1), 'units',
              `(${(furthestDeath / T.LEVEL_END * 100).toFixed(1)}%)`);
  process.exit(1);
}
