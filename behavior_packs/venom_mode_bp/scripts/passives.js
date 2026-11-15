import { EntityDamageCause, system } from '@minecraft/server';
import { ABILITIES, PROP, SLAM } from './config.js';
import { landSlam, startSlam, tip } from './abilities.js';
import { syncSuit } from './bond.js';
import { addBiomass, biomassOf, option, runtimeOf, shouldSay } from './state.js';

/**
 * @typedef {import('@minecraft/server').Player} Player
 * @typedef {import('./config.js').Form} Form
 */

const DOWN = { x: 0, y: -1, z: 0 };

/**
 * Is there something solid within `distance` blocks along a ray? Plants and
 * other walk-through blocks do not count.
 * @param {Player} player
 * @param {import('@minecraft/server').Vector3} from
 * @param {import('@minecraft/server').Vector3} direction
 * @param {number} distance
 */
function blocked(player, from, direction, distance) {
  try {
    return (
      player.dimension.getBlockFromRay(from, direction, {
        maxDistance: distance,
        includeLiquidBlocks: false,
        includePassableBlocks: false,
      }) !== undefined
    );
  } catch {
    return false; // outside the world or in an unloaded chunk
  }
}

/**
 * Wall-crawl needs a wall right in front of the player and the player pushing
 * into it.
 * @param {Player} player
 */
function facingWall(player) {
  try {
    if (player.inputInfo.getMovementVector().y < 0.4) return false;
  } catch {
    // no movement input available: fall back to just the wall check
  }
  const yaw = (player.getRotation().y * Math.PI) / 180;
  const forward = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  const { x, y, z } = player.location;
  return blocked(player, { x, y: y + 0.4, z }, forward, 0.9) || blocked(player, { x, y: y + 1.4, z }, forward, 0.9);
}

/**
 * Give a suit effect for a few seconds; it is refreshed every second.
 * @param {Player} player
 * @param {string} id
 * @param {number} amplifier
 */
function grant(player, id, amplifier, ticks = 60) {
  player.addEffect(id, ticks, { amplifier, showParticles: false });
}

/**
 * Runs every tick for a bonded player: wall-crawling, soft landings and the
 * ground slam.
 * @param {Player} player
 * @param {Form} form
 */
export function movementTick(player, form) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  const falling = -player.getVelocity().y;

  if (runtime.slam) {
    if (player.isOnGround) landSlam(player, form);
    else if (player.isInWater || now - runtime.slam.tick > 100) runtime.slam = undefined;
    else grant(player, 'resistance', 4, 12); // nothing hurts mid-dive
    return;
  }

  // Hold jump while pushing into a wall to climb it.
  if (option(player, PROP.climb) && player.isJumping && !player.isInWater && facingWall(player)) {
    grant(player, 'levitation', 5, 4);
    return;
  }

  if (player.isOnGround || player.isInWater || player.isFlying || player.isGliding) return;

  // Sneak while airborne, with room below, to dive.
  if (
    player.isSneaking &&
    falling > -0.1 &&
    now >= (runtime.cooldowns.slam ?? 0) &&
    !blocked(player, player.location, DOWN, SLAM.minHeight)
  ) {
    startSlam(player);
    return;
  }

  // A fast fall about to hit the ground: the symbiote absorbs the impact.
  if (falling > 0.6 && blocked(player, player.location, DOWN, Math.max(3, falling * 5))) {
    grant(player, 'resistance', 4, 12);
  }
}

/**
 * Runs once a second for a bonded player: powers, hunger, healing and the
 * fire weakness.
 * @param {Player} player
 * @param {Form} form
 */
export function secondTick(player, form) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  runtime.seconds++;

  // The symbiote is always slowly getting hungry; hiding costs extra.
  if (runtime.seconds % 15 === 0) addBiomass(player, -1);
  if (runtime.camo && runtime.seconds % 2 === 0) addBiomass(player, -1);
  let biomass = biomassOf(player);
  if (runtime.camo && biomass < 10) {
    runtime.camo = false;
    player.removeEffect('invisibility');
    tip(player, '§7Too hungry to stay hidden.');
  }
  syncSuit(player);

  grant(player, 'strength', form.strength);
  grant(player, 'speed', form.speed);
  grant(player, 'jump_boost', form.jump);
  grant(player, 'resistance', form.resistance);
  // Night vision flickers when it is about to run out, so it gets a longer timer.
  if (option(player, PROP.nightVision)) grant(player, 'night_vision', 0, 320);
  if (runtime.camo) grant(player, 'invisibility', 0);

  // Weakness: fire. Burning hurts more, starves the symbiote and stops its healing.
  const burning = player.getComponent('minecraft:onfire') !== undefined && !player.getEffect('fire_resistance');
  if (burning) {
    player.applyDamage(2, { cause: EntityDamageCause.fire });
    biomass = addBiomass(player, -3);
    if (shouldSay(runtime, 'fire', now, 100)) tip(player, '§cFIRE! IT BURNS US!');
  } else if (biomass >= 20) {
    grant(player, 'regeneration', biomass >= 60 ? 1 : 0);
  }

  // A starving symbiote starts on its host.
  if (biomass <= 0) {
    grant(player, 'hunger', 1);
    const health = player.getComponent('minecraft:health');
    if (health && health.currentValue > 4) player.applyDamage(1, { cause: EntityDamageCause.starve });
    if (shouldSay(runtime, 'starving', now, 200)) tip(player, '§4FEED US... OR WE FEED ON YOU.');
  } else if (biomass < 20 && shouldSay(runtime, 'hungry', now, 600)) {
    tip(player, '§6We are hungry. Hunt, or find chocolate.');
  }

  // Ringing ears settle after ten quiet seconds.
  if (runtime.stress > 0 && now - runtime.stressTick > 200) {
    runtime.stress--;
    runtime.stressTick = now;
  }
}

/**
 * The status bar: symbiote name, biomass and any ability still recharging.
 * @param {Player} player
 * @param {Form} form
 */
export function showHud(player, form) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  if (!option(player, PROP.hud) || now < runtime.tipUntil) return;

  const biomass = Math.round(biomassOf(player));
  const filled = Math.round(biomass / 10);
  const tint = biomass >= 60 ? '§a' : biomass >= 20 ? '§e' : '§c';
  let text = `${form.color}§l${form.name.toUpperCase()}§r ${tint}${'|'.repeat(filled)}§8${'|'.repeat(10 - filled)} §7${biomass}`;
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const left = (runtime.cooldowns[key] ?? 0) - now;
    if (left > 0) text += ` §7${ability.name} §c${Math.ceil(left / 20)}s`;
  }
  if (runtime.camo) text += ' §bHIDDEN';
  player.onScreenDisplay.setActionBar(text);
}
