import { system } from "@minecraft/server";

export const MAX_MANA = 100;
/** Mana regained per second. */
export const MANA_REGEN = 5;

/**
 * @typedef {object} PlayerState
 * @property {number} mana
 * @property {Map<string, number>} readyAt  staff id -> tick at which it can cast again
 * @property {string} flashText             short message shown instead of the spell hints
 * @property {number} flashUntil
 */

/** @type {Map<string, PlayerState>} */
const states = new Map();

/** @param {import("@minecraft/server").Player} player @returns {PlayerState} */
export function getState(player) {
  let state = states.get(player.id);
  if (!state) {
    state = { mana: MAX_MANA, readyAt: new Map(), flashText: "", flashUntil: 0 };
    states.set(player.id, state);
  }
  return state;
}

/** @param {string} playerId */
export function forgetPlayer(playerId) {
  states.delete(playerId);
}

/** @param {import("@minecraft/server").Player} player @param {number} amount */
export function restoreMana(player, amount) {
  const state = getState(player);
  state.mana = Math.min(MAX_MANA, state.mana + amount);
}

/** Show a short message on the staff HUD.
 * @param {import("@minecraft/server").Player} player @param {string} text @param {number} [ticks] */
export function flash(player, text, ticks = 30) {
  const state = getState(player);
  state.flashText = text;
  state.flashUntil = system.currentTick + ticks;
}
