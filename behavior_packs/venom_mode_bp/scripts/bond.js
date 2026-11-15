import { EquipmentSlot, ItemLockMode, ItemStack } from '@minecraft/server';
import {
  ABILITY_ITEMS,
  BIOMASS_START,
  FORMS,
  PROP,
  SUIT_EFFECTS,
  SUIT_ITEMS,
  SUIT_SLOTS,
  TAG_BONDED,
  itemsOf,
} from './config.js';
import * as fx from './fx.js';
import { formOf, runtimeOf } from './state.js';

/** @typedef {import('@minecraft/server').Player} Player */

const ABILITY_SET = new Set(ABILITY_ITEMS);

/**
 * A suit piece: fixed to its armor slot and kept through death.
 * @param {string} id
 */
function suitStack(id) {
  const stack = new ItemStack(id, 1);
  stack.lockMode = ItemLockMode.slot;
  stack.keepOnDeath = true;
  return stack;
}

/**
 * An ability item: can be moved around the inventory but never leaves it.
 * @param {string} id
 */
function abilityStack(id) {
  const stack = new ItemStack(id, 1);
  stack.lockMode = ItemLockMode.inventory;
  stack.keepOnDeath = true;
  return stack;
}

/**
 * Put an item in the player's inventory, or at their feet if it is full.
 * @param {Player} player
 * @param {ItemStack} stack
 */
function giveBack(player, stack) {
  const container = player.getComponent('minecraft:inventory')?.container;
  const leftover = container ? container.addItem(stack) : stack;
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

/**
 * Reset everything about a player's current shape (suit, blob or hidden).
 * @param {Player} player
 */
function resetShape(player) {
  const runtime = runtimeOf(player);
  runtime.camo = false;
  runtime.blob = false;
  runtime.slam = undefined;
  runtime.swing = undefined;
  runtime.squeeze = undefined;
  runtime.frenzyUntil = 0;
}

/**
 * Make the four armor slots match the player's state: the suit while bonded,
 * only the blob body while in blob form, nothing of ours while camouflaged or
 * unbonded. Armor the player was already wearing is handed back, not destroyed.
 * @param {Player} player
 */
export function syncSuit(player) {
  const equippable = player.getComponent('minecraft:equippable');
  if (!equippable) return;
  const form = formOf(player);
  const runtime = runtimeOf(player);
  for (const [piece, slot] of SUIT_SLOTS) {
    const current = equippable.getEquipment(slot);
    let wanted;
    if (form && runtime.blob) wanted = slot === EquipmentSlot.Chest ? form.blob : undefined;
    else if (form && !runtime.camo) wanted = form.suit[piece];
    if (current?.typeId === wanted) continue;
    if (current && !SUIT_ITEMS.has(current.typeId)) {
      if (!wanted) continue; // the player's own armor: leave it alone
      giveBack(player, current);
    }
    equippable.setEquipment(slot, wanted ? suitStack(wanted) : undefined);
  }
}

/**
 * Make the inventory match the player's state: exactly one of each item their
 * symbiote hands out, nothing from another symbiote, and never a loose suit
 * piece.
 * @param {Player} player
 */
export function syncInventory(player) {
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  const form = formOf(player);
  const wanted = form ? itemsOf(form) : [];
  const held = new Set();
  for (let slot = 0; slot < container.size; slot++) {
    const id = container.getItem(slot)?.typeId;
    if (!id) continue;
    const isAbility = ABILITY_SET.has(id);
    if (SUIT_ITEMS.has(id) || (isAbility && (!wanted.includes(id) || held.has(id)))) {
      container.setItem(slot, undefined);
    } else if (isAbility) {
      held.add(id);
    }
  }
  for (const id of wanted) {
    if (!held.has(id)) placeAbility(player, container, abilityStack(id));
  }
}

/**
 * Find room for an ability item: an empty hotbar slot, then any empty slot,
 * and as a last resort push an ordinary item out onto the ground.
 * @param {Player} player
 * @param {import('@minecraft/server').Container} container
 * @param {ItemStack} stack
 */
function placeAbility(player, container, stack) {
  for (let slot = 0; slot < Math.min(9, container.size); slot++) {
    if (!container.getItem(slot)) {
      container.setItem(slot, stack);
      return;
    }
  }
  if (container.emptySlotsCount > 0) {
    container.addItem(stack);
    return;
  }
  for (let slot = container.size - 1; slot >= 0; slot--) {
    const occupant = container.getItem(slot);
    if (occupant && !ABILITY_SET.has(occupant.typeId)) {
      player.dimension.spawnItem(occupant, player.location);
      container.setItem(slot, stack);
      return;
    }
  }
}

/**
 * Bond a player with a symbiote. Returns false if they already have one.
 * @param {Player} player
 * @param {string} formId
 */
export function bond(player, formId) {
  const form = FORMS[formId];
  if (!form) return false;
  if (formOf(player)) {
    player.sendMessage('§7A symbiote already lives in you. Separate from it first (Symbiote Core).');
    return false;
  }

  player.setDynamicProperty(PROP.form, form.id);
  player.setDynamicProperty(PROP.biomass, BIOMASS_START);
  player.addTag(TAG_BONDED);
  const runtime = runtimeOf(player);
  resetShape(player);
  runtime.stress = 0;
  runtime.seconds = 0;
  syncSuit(player);
  syncInventory(player);
  player.getComponent('minecraft:health')?.resetToMaxValue();

  const dimension = player.dimension;
  fx.engulf(player, form.particle.goo);
  fx.sound(dimension, 'venom.bond', player.location);
  fx.shake(player, 0.5, 0.6);
  player.addEffect('blindness', 25, { showParticles: false });
  player.onScreenDisplay.setTitle(`${form.color}§l${form.cry}`, {
    subtitle: '§7Use the Symbiote Core to see your powers',
    fadeInDuration: 5,
    stayDuration: 60,
    fadeOutDuration: 15,
  });
  return true;
}

/**
 * Break the bond. A willing separation hands the sample back; a forced one
 * (too much noise) throws it to the ground and leaves the host badly shaken.
 * @param {Player} player
 * @param {boolean} forced
 */
export function separate(player, forced) {
  const form = formOf(player);
  if (!form) return false;

  player.setDynamicProperty(PROP.form, undefined);
  player.removeTag(TAG_BONDED);
  resetShape(player);
  runtimeOf(player).stress = 0;
  syncSuit(player);
  syncInventory(player);
  for (const effect of SUIT_EFFECTS) player.removeEffect(effect);

  const sample = new ItemStack(form.sample, 1);
  if (forced) {
    player.dimension.spawnItem(sample, player.location);
    player.addEffect('weakness', 300, { amplifier: 1 });
    player.addEffect('slowness', 200, { amplifier: 1 });
    player.addEffect('nausea', 200);
  } else {
    giveBack(player, sample);
    player.addEffect('weakness', 100);
  }

  fx.engulf(player, form.particle.goo);
  fx.sound(player.dimension, 'venom.separate', player.location);
  player.onScreenDisplay.setActionBar(forced ? '§cThe symbiote is torn from you!' : '§7The symbiote lets go.');
  return true;
}

/**
 * A bonded player came back from the dead: they stand up in the suit again,
 * whatever shape they died in.
 * @param {Player} player
 */
export function restoreAfterDeath(player) {
  resetShape(player);
  syncSuit(player);
  syncInventory(player);
}

/**
 * Remove anything left behind on a player who is not bonded (for example after
 * the world was edited, or an item was obtained with commands).
 * @param {Player} player
 */
export function cleanUpUnbonded(player) {
  if (player.hasTag(TAG_BONDED)) player.removeTag(TAG_BONDED);
  syncSuit(player);
  syncInventory(player);
}
