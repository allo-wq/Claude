import { EntityDamageCause, system } from '@minecraft/server';
import { ABILITIES, BLOB, PROP, SLAM } from './config.js';
import { drawRope, landSlam, startSlam, tip } from './abilities.js';
import { syncSuit } from './bond.js';
import * as fx from './fx.js';
import { addBiomass, biomassOf, option, runtimeOf, shouldSay } from './state.js';

/**
 * @typedef {import('@minecraft/server').Player} Player
 * @typedef {import('@minecraft/server').Vector3} Vector3
 * @typedef {import('./config.js').Form} Form
 */

const DOWN = { x: 0, y: -1, z: 0 };

/**
 * Is there something solid within `distance` blocks along a ray? Plants and
 * other walk-through blocks do not count.
 * @param {Player} player
 * @param {Vector3} from
 * @param {Vector3} direction
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
 * The way the player is facing, flat along the ground.
 * @param {Player} player
 */
function facing(player) {
  const yaw = (player.getRotation().y * Math.PI) / 180;
  return { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

/**
 * Is the player pushing forward? Assumed yes when the input cannot be read.
 * @param {Player} player
 */
function pushingForward(player) {
  try {
    return player.inputInfo.getMovementVector().y >= 0.4;
  } catch {
    return true;
  }
}

/**
 * Wall-crawl needs a wall right in front of the player and the player pushing
 * into it.
 * @param {Player} player
 */
function facingWall(player) {
  if (!pushingForward(player)) return false;
  const forward = facing(player);
  const { x, y, z } = player.location;
  return blocked(player, { x, y: y + 0.4, z }, forward, 0.9) || blocked(player, { x, y: y + 1.4, z }, forward, 0.9);
}

/**
 * Blob form: when the blob pushes against an opening only one block high, it
 * slips inside. From there the game's own crawling takes over, so the player
 * can keep going through the tunnel and stands up again when there is room.
 * @param {Player} player
 */
function squeezeIntoGap(player) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  if (now < (runtime.cooldowns.squeeze ?? 0) || !player.isOnGround || !pushingForward(player)) return;

  const dimension = player.dimension;
  /** @param {Vector3} spot */
  const blockAt = (spot) => {
    try {
      return dimension.getBlock(spot);
    } catch {
      return undefined; // outside the world
    }
  };
  const { x, y, z } = player.location;
  const forward = facing(player);
  const ahead = { x: x + forward.x * 0.8, y: y + 0.2, z: z + forward.z * 0.8 };
  const overhead = blockAt({ x, y: y + 1.2, z });
  const gap = blockAt(ahead);
  const lintel = blockAt({ x: ahead.x, y: y + 1.2, z: ahead.z });
  // Standing in the open, facing a hole at foot level with something solid above it.
  if (!overhead?.isAir || !gap?.isAir || !lintel || lintel.isAir || lintel.isLiquid) return;

  runtime.squeeze = { from: { x, y, z }, tick: now };
  runtime.cooldowns.squeeze = now + 10;
  player.teleport(
    { x: Math.floor(ahead.x) + 0.5, y: Math.floor(ahead.y), z: Math.floor(ahead.z) + 0.5 },
    { keepVelocity: true, checkForBlocks: false },
  );
  fx.sound(dimension, 'venom.squelch', player.location, 0.6);
}

/**
 * If slipping into a gap left the player stuck inside a block, put them back
 * where they were and stop trying for a while.
 * @param {Player} player
 */
export function undoSqueeze(player) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  if (!runtime.squeeze || now - runtime.squeeze.tick > 60) return;
  player.teleport(runtime.squeeze.from, { checkForBlocks: false });
  runtime.squeeze = undefined;
  runtime.cooldowns.squeeze = now + 100;
  tip(player, '§7Too tight even for a blob.');
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
 * Runs every tick for a bonded player: wall-crawling, soft landings, the
 * ground slam, the swing rope and the blob's gap-squeezing.
 * @param {Player} player
 * @param {Form} form
 */
export function movementTick(player, form) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  const falling = -player.getVelocity().y;

  drawRope(player, form);

  if (runtime.slam) {
    if (player.isOnGround) landSlam(player, form);
    else if (player.isInWater || now - runtime.slam.tick > 100) runtime.slam = undefined;
    else grant(player, 'resistance', 4, 12); // nothing hurts mid-dive
    return;
  }

  if (runtime.blob) squeezeIntoGap(player);

  // Hold jump while pushing into a wall to climb it.
  if (option(player, PROP.climb) && player.isJumping && !player.isInWater && facingWall(player)) {
    grant(player, 'levitation', 5, 4);
    return;
  }

  if (player.isOnGround || player.isInWater || player.isFlying || player.isGliding) return;

  // Sneak while airborne, with room below, to dive. (Not as a blob.)
  if (
    !runtime.blob &&
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

  if (runtime.blob) {
    // A blob trades the suit's muscle for speed and going unseen.
    grant(player, 'speed', BLOB.speed);
    grant(player, 'jump_boost', BLOB.jump);
    grant(player, 'invisibility', 0);
  } else {
    grant(player, 'strength', form.strength);
    grant(player, 'speed', form.speed);
    grant(player, 'jump_boost', form.jump);
    grant(player, 'resistance', form.resistance);
    if (runtime.camo) grant(player, 'invisibility', 0);
  }
  // Night vision flickers when it is about to run out, so it gets a longer timer.
  if (option(player, PROP.nightVision)) grant(player, 'night_vision', 0, 320);

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
    if (shouldSay(runtime, 'starving', now, 200)) {
      tip(player, '§4FEED US... OR WE FEED ON YOU.');
      fx.sound(player.dimension, 'venom.growl', player.location);
    }
  } else if (biomass < 20 && shouldSay(runtime, 'hungry', now, 600)) {
    tip(player, '§6We are hungry. Hunt, or find chocolate.');
    fx.sound(player.dimension, 'venom.growl', player.location, 0.7);
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
  for (const key of form.abilities) {
    const left = (runtime.cooldowns[key] ?? 0) - now;
    if (left >= 20) text += ` §7${ABILITIES[key].name} §c${Math.ceil(left / 20)}s`;
  }
  if (runtime.blob) text += ' §bBLOB';
  else if (runtime.camo) text += ' §bHIDDEN';
  if (now < runtime.frenzyUntil) text += ` §4FRENZY ${Math.ceil((runtime.frenzyUntil - now) / 20)}s`;
  player.onScreenDisplay.setActionBar(text);
}
