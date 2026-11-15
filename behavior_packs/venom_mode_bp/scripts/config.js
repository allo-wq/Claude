import { EquipmentSlot } from '@minecraft/server';

/** Tag put on bonded players so wild symbiotes leave them alone. */
export const TAG_BONDED = 'venom_bonded';

/** Dynamic properties saved on each player. */
export const PROP = {
  form: 'venom:form',
  biomass: 'venom:biomass',
  kills: 'venom:kills',
  nightVision: 'venom:night_vision',
  climb: 'venom:wall_crawl',
  hud: 'venom:hud',
};

/**
 * @typedef {object} Form
 * @property {string} id
 * @property {string} name
 * @property {string} color  chat colour code used for this symbiote
 * @property {string} cry  shown on screen when the bond completes
 * @property {string} sample  item that starts the bond and comes back on separation
 * @property {{head: string, chest: string, legs: string, feet: string}} suit
 * @property {{tendril: string, goo: string, spike: string}} particle
 * @property {number} strength  effect amplifiers (0 = level I)
 * @property {number} speed
 * @property {number} jump
 * @property {number} resistance
 * @property {number} claws  damage of a bare-handed hit
 * @property {number} power  multiplier on ability damage
 */

/** @type {Record<string, Form>} */
export const FORMS = {
  venom: {
    id: 'venom',
    name: 'Venom',
    color: '§f',
    cry: 'WE ARE VENOM',
    sample: 'venom:symbiote_sample',
    suit: {
      head: 'venom:suit_head',
      chest: 'venom:suit_chest',
      legs: 'venom:suit_legs',
      feet: 'venom:suit_feet',
    },
    particle: { tendril: 'venom:tendril', goo: 'venom:goo', spike: 'venom:spike' },
    strength: 0,
    speed: 1,
    jump: 1,
    resistance: 1,
    claws: 7,
    power: 1,
  },
  // Dropped by the Crimson Symbiote boss: hits harder and runs faster, but is less tough.
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    color: '§c',
    cry: 'WE ARE CRIMSON',
    sample: 'venom:crimson_sample',
    suit: {
      head: 'venom:crimson_head',
      chest: 'venom:crimson_chest',
      legs: 'venom:crimson_legs',
      feet: 'venom:crimson_feet',
    },
    particle: { tendril: 'venom:tendril_red', goo: 'venom:goo_red', spike: 'venom:spike_red' },
    strength: 0,
    speed: 2,
    jump: 2,
    resistance: 0,
    claws: 10,
    power: 1.3,
  },
};

/** Sample item id -> form id. */
export const SAMPLE_TO_FORM = Object.fromEntries(Object.values(FORMS).map((form) => [form.sample, form.id]));

/** Suit piece name -> armor slot, in the order pieces are put on. */
export const SUIT_SLOTS = /** @type {[keyof Form['suit'], EquipmentSlot][]} */ ([
  ['head', EquipmentSlot.Head],
  ['chest', EquipmentSlot.Chest],
  ['legs', EquipmentSlot.Legs],
  ['feet', EquipmentSlot.Feet],
]);

export const SUIT_ITEMS = new Set(Object.values(FORMS).flatMap((form) => Object.values(form.suit)));

/**
 * Hotbar abilities. Cooldowns are in ticks (20 = one second) and match the
 * `minecraft:cooldown` component on each item; cost is biomass spent per use.
 */
export const ABILITIES = {
  tendril: { item: 'venom:tendril', name: 'Tendril', cooldown: 30, cost: 1 },
  devour: { item: 'venom:devour', name: 'Devour', cooldown: 100, cost: 0 },
  roar: { item: 'venom:roar', name: 'Roar', cooldown: 300, cost: 4 },
  spikes: { item: 'venom:spikes', name: 'Spikes', cooldown: 200, cost: 5 },
};

export const CORE_ITEM = 'venom:core';

/** Everything a bonded player carries, in the order it is handed out. */
export const ABILITY_ITEMS = [CORE_ITEM, ...Object.values(ABILITIES).map((ability) => ability.item)];

/** Ability item id -> key in ABILITIES. */
export const ITEM_TO_ABILITY = Object.fromEntries(Object.entries(ABILITIES).map(([key, ability]) => [ability.item, key]));

export const TENDRIL = { range: 24, damage: 5 };
export const DEVOUR = { range: 5, bite: 12, finishBelow: 24, biggestPrey: 100, heal: 8, biomass: 30 };
export const ROAR = { radius: 12, damage: 3 };
export const SPIKES = { radius: 6, damage: 11 };
export const SLAM = { cooldown: 60, cost: 3, minHeight: 3 };

/** Biomass (0-100) is the symbiote's hunger. It starts here on bonding. */
export const BIOMASS_START = 60;

/** Things the symbiote likes to eat, and how much biomass each gives. */
export const FOOD = {
  'venom:chocolate': 35,
  'minecraft:cookie': 12,
  'minecraft:beef': 10,
  'minecraft:porkchop': 10,
  'minecraft:mutton': 10,
  'minecraft:chicken': 8,
  'minecraft:rabbit': 8,
  'minecraft:cod': 6,
  'minecraft:salmon': 6,
  'minecraft:rotten_flesh': 6,
};

/** Loud things hurt. Three hits in a row tear the symbiote off. */
export const SONIC = {
  separateAt: 3,
  blocks: { 'minecraft:bell': 12, 'minecraft:noteblock': 6 },
  goatHornRadius: 14,
};

/** Wild symbiotes sometimes fall from the night sky near players who have none. */
export const SKYFALL = { chancePerMinute: 0.06, minDistance: 18, maxDistance: 32 };

/** Effects handed out by the suit; all are cleared on separation. */
export const SUIT_EFFECTS = ['strength', 'speed', 'jump_boost', 'resistance', 'night_vision', 'regeneration', 'invisibility'];
