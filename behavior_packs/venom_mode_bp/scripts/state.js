import { FORMS, PROP } from './config.js';

/**
 * @typedef {object} Runtime  Per-player state that does not need to survive a restart.
 * @property {Record<string, number>} cooldowns  ability key -> tick it is ready again
 * @property {Record<string, number>} said  message key -> tick it was last shown
 * @property {number} stress  loud-noise hits taken recently
 * @property {number} stressTick  tick of the last hit or decay
 * @property {{fromY: number, tick: number} | undefined} slam  set while a ground slam is falling
 * @property {boolean} camo
 * @property {boolean} menuOpen
 * @property {number} tipUntil  the status bar stays quiet until this tick
 * @property {number} seconds  seconds spent bonded, drives slow timers
 * @property {boolean} striking  true while a claw hit is being applied
 */

/** @type {Map<string, Runtime>} */
const runtimes = new Map();

/** @param {import('@minecraft/server').Player} player */
export function runtimeOf(player) {
  let runtime = runtimes.get(player.id);
  if (!runtime) {
    runtime = {
      cooldowns: {},
      said: {},
      stress: 0,
      stressTick: 0,
      slam: undefined,
      camo: false,
      menuOpen: false,
      tipUntil: 0,
      seconds: 0,
      striking: false,
    };
    runtimes.set(player.id, runtime);
  }
  return runtime;
}

/** @param {string} playerId */
export function forget(playerId) {
  runtimes.delete(playerId);
}

/**
 * The symbiote a player is bonded with, if any.
 * @param {import('@minecraft/server').Player} player
 */
export function formOf(player) {
  const id = player.getDynamicProperty(PROP.form);
  return typeof id === 'string' ? FORMS[id] : undefined;
}

/**
 * Menu toggles are on until the player switches them off.
 * @param {import('@minecraft/server').Player} player
 * @param {string} key
 */
export function option(player, key) {
  return player.getDynamicProperty(key) !== false;
}

/** @param {import('@minecraft/server').Player} player */
export function biomassOf(player) {
  const value = player.getDynamicProperty(PROP.biomass);
  return typeof value === 'number' ? value : 0;
}

/**
 * @param {import('@minecraft/server').Player} player
 * @param {number} amount
 */
export function addBiomass(player, amount) {
  const next = clamp(biomassOf(player) + amount, 0, 100);
  player.setDynamicProperty(PROP.biomass, next);
  return next;
}

/**
 * True at most once per `every` ticks for a given message key.
 * @param {Runtime} runtime
 * @param {string} key
 * @param {number} now
 * @param {number} every
 */
export function shouldSay(runtime, key, now, every) {
  if (now - (runtime.said[key] ?? -every) < every) return false;
  runtime.said[key] = now;
  return true;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
