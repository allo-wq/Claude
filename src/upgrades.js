'use strict';
// Adaptations offered on level-up. desc(n) describes what taking level n gives you.
// The numbers here must match computeStats() in player.js.

const CATS = {
  bolt: 'Bolts',
  weapon: 'Organ',
  body: 'Body',
};

const UPGRADES = [
  { id: 'multishot', cat: 'bolt', name: 'Twin Photophores', max: 4, weight: 0.9,
    desc: n => `Fire ${n + 1} bolts per volley, fanned out.` },
  { id: 'firerate', cat: 'bolt', name: 'Rapid Pulse', max: 6, weight: 1.1,
    desc: n => `+15% fire rate (${100 + 15 * n}% total).` },
  { id: 'damage', cat: 'bolt', name: 'Dense Light', max: 6, weight: 1.1,
    desc: n => `+20% bolt damage (${100 + 20 * n}% total).` },
  { id: 'pierce', cat: 'bolt', name: 'Needle Beam', max: 3, weight: 0.8,
    desc: n => `Bolts pass through ${n} more ${n === 1 ? 'enemy' : 'enemies'}.` },
  { id: 'size', cat: 'bolt', name: 'Heavy Bolts', max: 3, weight: 0.8,
    desc: () => 'Bolts are 30% larger and hit 15% harder.' },
  { id: 'velocity', cat: 'bolt', name: 'Swift Bolts', max: 3, weight: 0.7,
    desc: () => 'Bolts fly 18% faster and 15% further.' },
  { id: 'homing', cat: 'bolt', name: 'Seeker Light', max: 3, weight: 0.7,
    desc: n => (n === 1 ? 'Bolts curve toward nearby enemies.' : 'Bolts turn harder toward their targets.') },
  { id: 'crit', cat: 'bolt', name: 'Glint', max: 4, weight: 0.8,
    desc: n => `${5 + 10 * n}% chance for a bolt to deal 2.2× damage.` },

  { id: 'orbs', cat: 'weapon', name: 'Satellite Spores', max: 5, weight: 0.9,
    desc: n => (n === 1 ? 'Two glowing spores orbit you and burn what they touch.' : `${n + 1} orbiting spores, circling a little wider.`) },
  { id: 'chain', cat: 'weapon', name: 'Electric Organ', max: 4, weight: 0.8,
    desc: n => `Hits have a ${12 + 8 * n}% chance to arc to ${n + 1} nearby enemies.` },
  { id: 'shock', cat: 'weapon', name: 'Depth Charge', max: 4, weight: 0.8,
    desc: n => `Every ${(7.5 - n).toFixed(1)} s a pressure wave blasts everything around you.` },
  { id: 'ink', cat: 'weapon', name: 'Ink Sac', max: 3, weight: 0.7,
    desc: n => (n === 1 ? 'Dashing leaves ink that burns and slows enemies.' : 'Ink clouds grow, last longer and burn hotter.') },
  { id: 'rear', cat: 'weapon', name: 'Tail Lantern', max: 2, weight: 0.7,
    desc: n => (n === 1 ? 'Also fire a bolt straight behind you.' : 'Fire three bolts behind you.') },

  { id: 'hp', cat: 'body', name: 'Thick Scales', max: 4, weight: 0.9,
    desc: () => '+1 heart, and heal 1.' },
  { id: 'speed', cat: 'body', name: 'Strong Fins', max: 4, weight: 0.8,
    desc: n => `+8% swim speed (${100 + 8 * n}% total).` },
  { id: 'magnet', cat: 'body', name: 'Filter Feeder', max: 4, weight: 0.8,
    desc: () => 'Draw in plankton from 35% further away.' },
  { id: 'light', cat: 'body', name: 'Wide Glow', max: 3, weight: 0.7,
    desc: () => 'Your light reaches 18% further into the dark.' },
  { id: 'regen', cat: 'body', name: 'Mending Tissue', max: 3, weight: 0.6,
    desc: n => `Heal 1 heart every ${[0, 40, 28, 18][n]} s.` },
  { id: 'dashcd', cat: 'body', name: 'Quick Fins', max: 3, weight: 0.6,
    desc: () => 'Dash recharges 15% faster.' },
  { id: 'flare', cat: 'body', name: 'Flare Gland', max: 3, weight: 0.6,
    desc: () => 'Flare charges 30% faster and hits 35% harder.' },
  { id: 'siphon', cat: 'body', name: 'Symbiosis', max: 3, weight: 0.5,
    desc: n => `Kills have a ${(1.2 * n).toFixed(1)}% chance to drop a heart.` },
];

// Offered once everything is maxed.
const FALLBACKS = [
  { id: 'heal2', cat: 'body', name: 'Second Wind', max: Infinity, desc: () => 'Heal 2 hearts.' },
  { id: 'treasure', cat: 'bolt', name: 'Sunken Treasure', max: Infinity, desc: () => '+2,500 score.' },
];

function rollChoices(pearl) {
  const P = G.player;
  const pool = UPGRADES.filter(u => P.lv[u.id] < u.max);
  const out = [];
  while (out.length < 3 && pool.length) {
    const u = weightedPick(pool, x => (x.weight || 1)
      * (pearl && x.cat === 'weapon' ? 3 : 1)
      * (P.lv[x.id] > 0 ? 1.25 : 1));
    out.push(u);
    pool.splice(pool.indexOf(u), 1);
  }
  if (out.length < 3) for (const f of FALLBACKS) if (out.length < 3) out.push(f);
  return out;
}

function applyUpgrade(u) {
  const P = G.player;
  if (u.id === 'heal2') { P.hp = Math.min(P.maxHp, P.hp + 2); return; }
  if (u.id === 'treasure') { G.score += 2500; return; }
  P.lv[u.id]++;
  if (u.id === 'hp') { P.maxHp++; P.hp = Math.min(P.maxHp, P.hp + 1); }
  computeStats(P);
}
