// Venom Mode: bond with a symbiote for a suit, powers, hunger and weaknesses.
//
//   config.js     every number and id worth tuning
//   state.js      what is stored per player
//   bond.js       bonding, separating, the suit and the ability items
//   abilities.js  hotbar abilities, blob form, ground slam, the sound weakness
//   passives.js   per-tick movement powers and once-a-second upkeep
//   ui.js         the Symbiote Core menu

import { EntityDamageCause, EquipmentSlot, GameMode, Player, system, world } from '@minecraft/server';
import {
  ABILITIES,
  ABILITY_ITEMS,
  CORE_ITEM,
  FOOD,
  FORMS,
  FORM_ALIASES,
  FRENZY,
  ITEM_TO_ABILITY,
  PROP,
  SAMPLE_TO_FORM,
  SKYFALL,
  SONIC,
} from './config.js';
import { breakCamo, heal, sonicHit, sonicPulse, tip, toggleBlob, useAbility } from './abilities.js';
import { bond, cleanUpUnbonded, restoreAfterDeath, separate, syncInventory } from './bond.js';
import * as fx from './fx.js';
import { movementTick, secondTick, showHud, undoSqueeze } from './passives.js';
import { addBiomass, biomassOf, forget, formOf, runtimeOf } from './state.js';
import { openCore } from './ui.js';

const ABILITY_SET = new Set(ABILITY_ITEMS);
const WILD_SYMBIOTE = 'venom:symbiote';

/** Log each distinct problem once instead of every tick. */
const reported = new Set();
/** @param {unknown} error */
function report(error) {
  const text = String(error);
  if (reported.has(text)) return;
  reported.add(text);
  console.warn(`[Venom Mode] ${text}`);
}

// ----------------------------------------------------------------------------- items

/**
 * Use up one item from the player's hand (creative players keep theirs).
 * @param {Player} player
 */
function consumeHeldItem(player) {
  if (player.getGameMode() === GameMode.Creative) return;
  const slot = player.getComponent('minecraft:equippable')?.getEquipmentSlot(EquipmentSlot.Mainhand);
  if (!slot || !slot.hasItem()) return;
  if (slot.amount > 1) slot.amount -= 1;
  else slot.setItem(undefined);
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const id = itemStack.typeId;
  try {
    if (id in SAMPLE_TO_FORM) {
      if (bond(player, SAMPLE_TO_FORM[id])) consumeHeldItem(player);
      return;
    }
    if (id === 'minecraft:goat_horn') {
      sonicPulse(player.dimension, player.location, SONIC.goatHornRadius);
      return;
    }
    const form = formOf(player);
    if (!form) return;
    if (id === CORE_ITEM) {
      // Sneaking with the Core is the quick way in and out of blob form.
      if (player.isSneaking) toggleBlob(player, form);
      else openCore(player).catch(report);
    } else if (id in ITEM_TO_ABILITY) {
      const key = /** @type {keyof typeof ABILITIES} */ (ITEM_TO_ABILITY[id]);
      if (form.abilities.includes(key)) useAbility(player, form, key);
    }
  } catch (error) {
    report(error);
  }
});

// Feeding the symbiote: chocolate above all, but meat will do.
world.afterEvents.itemCompleteUse.subscribe(({ source: player, itemStack }) => {
  const value = FOOD[/** @type {keyof typeof FOOD} */ (itemStack.typeId)];
  if (!value || !formOf(player)) return;
  addBiomass(player, value);
  tip(player, itemStack.typeId === 'venom:chocolate' ? '§aCHOCOLATE!' : '§aMore.');
});

// ----------------------------------------------------------------------------- combat

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity }) => {
  if (!(player instanceof Player)) return;
  const form = formOf(player);
  if (!form) return;
  const runtime = runtimeOf(player);
  if (runtime.striking) return;
  try {
    breakCamo(player);
    // Claws: a hit with an empty hand (or an ability item) lands much harder.
    const held = player.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Mainhand);
    if ((held && !ABILITY_SET.has(held.typeId)) || !hitEntity.isValid || hitEntity instanceof Player) return;
    if (runtime.blob || hitEntity.getComponent('minecraft:is_tamed')) return;
    runtime.striking = true;
    hitEntity.applyDamage(form.claws, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
    if (system.currentTick < runtime.frenzyUntil) heal(player, FRENZY.lifesteal);
  } catch (error) {
    report(error);
  } finally {
    runtime.striking = false;
  }
});

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
  if (!(hurtEntity instanceof Player) || !hurtEntity.isValid) return;
  try {
    const health = hurtEntity.getComponent('minecraft:health');
    const alive = health !== undefined && health.currentValue > 0;
    const form = formOf(hurtEntity);

    // A wild symbiote that reaches an unbonded player takes them as its host.
    if (!form) {
      const attacker = damageSource.damagingEntity;
      if (alive && attacker?.typeId === WILD_SYMBIOTE && attacker.isValid && bond(hurtEntity, FORMS.venom.id)) {
        attacker.remove();
      }
      return;
    }
    if (!alive) return;

    if (damageSource.cause === EntityDamageCause.fall) {
      // Backstop for the soft landing in passives.js: undo any fall damage that got through.
      health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + damage));
    } else if (damageSource.cause === EntityDamageCause.sonicBoom || damageSource.cause === EntityDamageCause.lightning) {
      sonicHit(hurtEntity, 2);
    } else if (damageSource.cause === EntityDamageCause.suffocation) {
      undoSqueeze(hurtEntity);
    }
  } catch (error) {
    report(error);
  }
});

// Every kill feeds the symbiote a little; bigger prey feeds it more.
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || !formOf(killer)) return;
  try {
    const size = deadEntity.isValid ? deadEntity.getComponent('minecraft:health')?.effectiveMax ?? 10 : 10;
    addBiomass(killer, Math.min(25, 4 + size * 0.4));
    const kills = killer.getDynamicProperty(PROP.kills);
    killer.setDynamicProperty(PROP.kills, (typeof kills === 'number' ? kills : 0) + 1);
  } catch (error) {
    report(error);
  }
});

// ----------------------------------------------------------------------------- weakness: sound

world.afterEvents.playerInteractWithBlock.subscribe(({ block, isFirstEvent }) => {
  if (!isFirstEvent) return;
  const radius = SONIC.blocks[/** @type {keyof typeof SONIC.blocks} */ (block.typeId)];
  if (radius) sonicPulse(block.dimension, block.location, radius);
});

// ----------------------------------------------------------------------------- players coming and going

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  try {
    if (!formOf(player)) {
      cleanUpUnbonded(player);
      return;
    }
    // Death does not break the bond, but the symbiote comes back hungry.
    if (biomassOf(player) < 40) player.setDynamicProperty(PROP.biomass, 40);
    restoreAfterDeath(player);
  } catch (error) {
    report(error);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => forget(playerId));

// ----------------------------------------------------------------------------- main loop

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if (!player.isValid) continue;
    try {
      const form = formOf(player);
      if (form) {
        movementTick(player, form);
        if (now % 10 === 0) showHud(player, form);
        if (now % 20 === 0) secondTick(player, form);
        if (now % 100 === 0) syncInventory(player);
      } else if (now % 100 === 0) {
        cleanUpUnbonded(player);
      }
    } catch (error) {
      report(error);
    }
  }
  if (now % 1200 === 600) skyfall();
}, 1);

/**
 * At night, a wild symbiote occasionally crashes down near a player who has
 * none, so the mod can be started without crafting anything.
 */
function skyfall() {
  const time = world.getTimeOfDay();
  if (time < 13000 || time > 23000) return;
  for (const player of world.getAllPlayers()) {
    if (!player.isValid || player.dimension.id !== 'minecraft:overworld' || formOf(player)) continue;
    if (Math.random() > SKYFALL.chancePerMinute) continue;
    try {
      const dimension = player.dimension;
      const angle = Math.random() * Math.PI * 2;
      const distance = SKYFALL.minDistance + Math.random() * (SKYFALL.maxDistance - SKYFALL.minDistance);
      const top = dimension.getTopmostBlock({
        x: player.location.x + Math.cos(angle) * distance,
        z: player.location.z + Math.sin(angle) * distance,
      });
      if (!top) continue;
      const spot = { x: top.location.x + 0.5, y: top.location.y + 1, z: top.location.z + 0.5 };
      if (dimension.getEntities({ type: WILD_SYMBIOTE, location: spot, maxDistance: 64 }).length > 0) continue;
      dimension.spawnEntity(WILD_SYMBIOTE, spot);
      fx.particle(dimension, 'minecraft:huge_explosion_emitter', spot);
      fx.sound(dimension, 'random.explode', spot, 3, 0.6);
      player.sendMessage('§8§oSomething fell from the sky nearby...');
    } catch {
      // that spot is not loaded; try again next minute
    }
  }
}

// ----------------------------------------------------------------------------- commands for map makers
//   /scriptevent venom:bond [venom|carnage]
//   /scriptevent venom:separate
//   /scriptevent venom:feed

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (!(sourceEntity instanceof Player)) return;
    try {
      if (id === 'venom:bond') {
        const asked = message.trim().toLowerCase() || FORMS.venom.id;
        const formId = FORM_ALIASES[/** @type {keyof typeof FORM_ALIASES} */ (asked)] ?? asked;
        if (!(formId in FORMS)) sourceEntity.sendMessage(`§cUnknown symbiote "${asked}". Try: venom, carnage`);
        else bond(sourceEntity, formId);
      } else if (id === 'venom:separate') {
        separate(sourceEntity, false);
      } else if (id === 'venom:feed') {
        addBiomass(sourceEntity, 100);
      }
    } catch (error) {
      report(error);
    }
  },
  { namespaces: ['venom'] },
);
