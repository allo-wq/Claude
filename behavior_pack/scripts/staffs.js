import { lightningStrike, thunderstorm } from "./spells/storm.js";
import { fireBolt, flameNova } from "./spells/inferno.js";
import { blizzard, frostRay } from "./spells/frost.js";
import { blink, singularity } from "./spells/void.js";
import { gust, skyLeap } from "./spells/gale.js";
import { mend, overgrowth } from "./spells/verdant.js";

/**
 * @typedef {object} SpellContext
 * @property {import("@minecraft/server").Player} player
 * @property {import("@minecraft/server").Dimension} dimension
 */

/**
 * @typedef {object} Spell
 * @property {string} name
 * @property {string} about     one line for the Relic Codex
 * @property {number} mana
 * @property {number} cooldown  ticks before the staff can be used again
 * @property {(ctx: SpellContext) => boolean | string} cast  true when cast, otherwise the reason it was not
 */

/**
 * @typedef {object} Staff
 * @property {string} id
 * @property {string} name
 * @property {string} color          formatting code used on the HUD
 * @property {string} icon           texture shown in the Relic Codex
 * @property {string} cooldownGroup  must match minecraft:cooldown in the item file
 * @property {string} catalyst       the ingredient that sets the element
 * @property {Spell} primary         use
 * @property {Spell} secondary       sneak + use
 */

/** @type {Staff[]} */
export const STAFF_LIST = [
  {
    id: "relics:storm_staff",
    name: "Storm Staff",
    color: "§e",
    icon: "textures/items/relics_storm_staff",
    cooldownGroup: "relics_storm",
    catalyst: "Lightning Rod",
    primary: {
      name: "Lightning Strike",
      about: "Calls a bolt down on the block or mob you point at, up to 48 blocks away.",
      mana: 20,
      cooldown: 16,
      cast: lightningStrike,
    },
    secondary: {
      name: "Thunderstorm",
      about: "Strikes every monster within 24 blocks. With no monsters around, bolts fall in a ring.",
      mana: 60,
      cooldown: 140,
      cast: thunderstorm,
    },
  },
  {
    id: "relics:inferno_staff",
    name: "Inferno Staff",
    color: "§6",
    icon: "textures/items/relics_inferno_staff",
    cooldownGroup: "relics_inferno",
    catalyst: "Blaze Powder",
    primary: {
      name: "Fire Bolt",
      about: "Hurls a bolt that bursts on impact and sets everything nearby alight. Never breaks blocks.",
      mana: 12,
      cooldown: 10,
      cast: fireBolt,
    },
    secondary: {
      name: "Flame Nova",
      about: "A ring of fire sweeps 7 blocks outward, burning and throwing back mobs.",
      mana: 50,
      cooldown: 120,
      cast: flameNova,
    },
  },
  {
    id: "relics:frost_staff",
    name: "Frost Staff",
    color: "§b",
    icon: "textures/items/relics_frost_staff",
    cooldownGroup: "relics_frost",
    catalyst: "Packed Ice",
    primary: {
      name: "Frost Ray",
      about: "A freezing beam. Slows and hurts a mob, turns water to ice you can walk on and hardens lava.",
      mana: 12,
      cooldown: 10,
      cast: frostRay,
    },
    secondary: {
      name: "Blizzard",
      about: "Three seconds of snowstorm: monsters around you are frozen in place and the water underfoot ices over.",
      mana: 55,
      cooldown: 160,
      cast: blizzard,
    },
  },
  {
    id: "relics:void_staff",
    name: "Void Staff",
    color: "§d",
    icon: "textures/items/relics_void_staff",
    cooldownGroup: "relics_void",
    catalyst: "Ender Pearl",
    primary: {
      name: "Blink",
      about: "Teleports you to where you look, up to 32 blocks. Blink into open air and you float down.",
      mana: 18,
      cooldown: 8,
      cast: blink,
    },
    secondary: {
      name: "Singularity",
      about: "Opens a rift that drags in mobs and dropped items for a few seconds, then collapses on them.",
      mana: 60,
      cooldown: 200,
      cast: singularity,
    },
  },
  {
    id: "relics:gale_staff",
    name: "Gale Staff",
    color: "§f",
    icon: "textures/items/relics_gale_staff",
    cooldownGroup: "relics_gale",
    catalyst: "Feather",
    primary: {
      name: "Gust",
      about: "Blasts every mob in front of you away.",
      mana: 10,
      cooldown: 10,
      cast: gust,
    },
    secondary: {
      name: "Sky Leap",
      about: "Launches you the way you are looking, then lets you glide down safely.",
      mana: 25,
      cooldown: 30,
      cast: skyLeap,
    },
  },
  {
    id: "relics:verdant_staff",
    name: "Verdant Staff",
    color: "§a",
    icon: "textures/items/relics_verdant_staff",
    cooldownGroup: "relics_verdant",
    catalyst: "Emerald",
    primary: {
      name: "Mend",
      about: "Heals you and nearby players, and cures poison and wither.",
      mana: 25,
      cooldown: 20,
      cast: mend,
    },
    secondary: {
      name: "Overgrowth",
      about: "Ripens crops within 6 blocks, scatters wild flowers and roots monsters to the spot.",
      mana: 40,
      cooldown: 80,
      cast: overgrowth,
    },
  },
];

/** @type {Map<string, Staff>} */
export const STAFFS = new Map(STAFF_LIST.map((staff) => [staff.id, staff]));
