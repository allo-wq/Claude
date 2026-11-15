import { EntityDamageCause, system } from '@minecraft/server';
import { ABILITIES, DEVOUR, FRENZY, IMPALE, PROP, ROAR, SLAM, SLASH, SONIC, SPIKES, SWING, TENDRIL } from './config.js';
import { separate, syncSuit } from './bond.js';
import * as fx from './fx.js';
import { addBiomass, clamp, runtimeOf, shouldSay } from './state.js';

/**
 * @typedef {import('@minecraft/server').Player} Player
 * @typedef {import('@minecraft/server').Entity} Entity
 * @typedef {import('@minecraft/server').Vector3} Vector3
 * @typedef {import('./config.js').Form} Form
 */

// ----------------------------------------------------------------------------- shared helpers

/**
 * A short message in the status bar that the HUD will not overwrite right away.
 * @param {Player} player
 * @param {string} text
 */
export function tip(player, text) {
  runtimeOf(player).tipUntil = system.currentTick + 40;
  player.onScreenDisplay.setActionBar(text);
}

/**
 * Mobs an area attack should hit: living, not a player, not somebody's pet.
 * @param {Player} player
 * @param {Vector3} center
 * @param {number} radius
 */
export function victimsAround(player, center, radius) {
  return player.dimension
    .getEntities({
      location: center,
      maxDistance: radius,
      excludeTypes: ['minecraft:player'],
      excludeFamilies: ['inanimate'],
    })
    .filter((entity) => entity.isValid && entity.getComponent('minecraft:health') && !entity.getComponent('minecraft:is_tamed'));
}

/**
 * The first living thing the player is looking at. Pets are looked past.
 * @param {Player} player
 * @param {number} range
 */
function livingInView(player, range) {
  for (const { entity } of player.getEntitiesFromViewDirection({ maxDistance: range })) {
    if (entity.id === player.id || entity.getComponent('minecraft:is_tamed')) continue;
    if (entity.getComponent('minecraft:health')) return entity;
  }
  return undefined;
}

/**
 * @param {Entity} target
 * @param {number} amount
 * @param {Player} attacker
 */
function hurt(target, amount, attacker) {
  try {
    target.applyDamage(amount, { cause: EntityDamageCause.entityAttack, damagingEntity: attacker });
  } catch {
    // the target despawned
  }
}

/**
 * Put a status effect on a mob. Some mobs are immune to some effects, which
 * must not stop the rest of an ability.
 * @param {Entity} target
 * @param {string} effect
 * @param {number} ticks
 * @param {number} amplifier
 */
function afflict(target, effect, ticks, amplifier) {
  try {
    if (target.isValid) target.addEffect(effect, ticks, { amplifier });
  } catch {
    // immune
  }
}

/**
 * @param {Entity} entity
 * @param {number} amount
 */
export function heal(entity, amount) {
  const health = entity.getComponent('minecraft:health');
  if (health && health.currentValue > 0) {
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
  }
}

/**
 * Throw an entity toward (or away from) a point.
 * @param {Entity} entity
 * @param {Vector3} point
 * @param {number} horizontal  speed along the ground; negative pushes away
 * @param {number} vertical
 */
function launch(entity, point, horizontal, vertical) {
  const dx = point.x - entity.location.x;
  const dz = point.z - entity.location.z;
  const length = Math.hypot(dx, dz) || 1;
  try {
    entity.applyKnockback({ x: (dx / length) * horizontal, z: (dz / length) * horizontal }, vertical);
  } catch {
    // some entities cannot be knocked back
  }
}

/**
 * Fling the player to a point, as if reeled in by a tendril. The launch is
 * sized so the arc roughly ends at the target: farther or higher targets get
 * a harder pull.
 * @param {Player} player
 * @param {Vector3} point
 */
function zipTo(player, point) {
  const rise = point.y - player.location.y;
  const run = Math.hypot(point.x - player.location.x, point.z - player.location.z);
  const vertical = rise > -1 ? clamp(Math.sqrt(0.16 * Math.max(rise + 1.5, 0.6)) * 1.15, 0.45, 2.4) : 0.3;
  launch(player, point, clamp(run * 0.1, 0.3, 3.2), vertical);
}

/**
 * Camouflage ends the moment the symbiote attacks.
 * @param {Player} player
 */
export function breakCamo(player) {
  const runtime = runtimeOf(player);
  if (!runtime.camo) return;
  runtime.camo = false;
  player.removeEffect('invisibility');
  syncSuit(player);
  tip(player, '§7Camouflage dropped.');
}

// ----------------------------------------------------------------------------- hotbar abilities

/**
 * Tendril Lash: drag a mob to you, or (sneaking, or aimed at a block) pull
 * yourself to where the tendril lands.
 * @param {Player} player
 * @param {Form} form
 */
function tendril(player, form) {
  const dimension = player.dimension;
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  const hand = { x: head.x + view.x * 0.6, y: head.y - 0.35, z: head.z + view.z * 0.6 };

  const target = livingInView(player, TENDRIL.range);
  if (target) {
    const grip = { x: target.location.x, y: target.location.y + 0.8, z: target.location.z };
    fx.line(dimension, form.particle.tendril, hand, grip);
    fx.sound(dimension, 'venom.tendril', player.location);
    if (player.isSneaking) {
      zipTo(player, grip);
    } else {
      const run = Math.hypot(grip.x - player.location.x, grip.z - player.location.z);
      const rise = player.location.y - target.location.y;
      launch(target, player.location, clamp(run * 0.12, 0.5, 3), clamp(0.4 + rise * 0.06, 0.3, 1.2));
    }
    if (target.typeId !== 'minecraft:player') {
      hurt(target, TENDRIL.damage * form.power, player);
      afflict(target, 'slowness', 40, 2);
    }
    return true;
  }

  const hit = player.getBlockFromViewDirection({
    maxDistance: TENDRIL.range + 6,
    includeLiquidBlocks: false,
    includePassableBlocks: false,
  });
  if (!hit) {
    tip(player, '§7The tendril finds nothing to grab.');
    return false;
  }
  const anchor = {
    x: hit.block.location.x + hit.faceLocation.x,
    y: hit.block.location.y + hit.faceLocation.y,
    z: hit.block.location.z + hit.faceLocation.z,
  };
  fx.line(dimension, form.particle.tendril, hand, anchor);
  fx.sound(dimension, 'venom.tendril', player.location);
  zipTo(player, anchor);
  return true;
}

/**
 * Devour: a heavy bite. Weakened prey is eaten whole, which heals the host and
 * feeds the symbiote.
 * @param {Player} player
 * @param {Form} form
 */
function devour(player, form) {
  const target = livingInView(player, DEVOUR.range);
  const health = target?.getComponent('minecraft:health');
  if (!target || !health || target.typeId === 'minecraft:player') {
    tip(player, '§7Nothing in reach to devour.');
    return false;
  }
  const finishing = health.currentValue <= DEVOUR.finishBelow && health.effectiveMax <= DEVOUR.biggestPrey;
  const mouth = { x: target.location.x, y: target.location.y + 0.8, z: target.location.z };
  hurt(target, finishing ? health.currentValue + 100 : DEVOUR.bite * form.power, player);

  const dimension = player.dimension;
  fx.particle(dimension, form.particle.goo, mouth);
  fx.sound(dimension, 'venom.bite', player.location);
  const eaten = !target.isValid || (target.getComponent('minecraft:health')?.currentValue ?? 0) <= 0;
  if (eaten) {
    heal(player, DEVOUR.heal);
    addBiomass(player, DEVOUR.biomass);
    player.addEffect('saturation', 2, { amplifier: 3, showParticles: false });
    fx.sound(dimension, 'venom.gulp', player.location);
    tip(player, '§aDelicious.');
  } else {
    heal(player, 3);
  }
  return true;
}

/**
 * Roar: staggers and weakens every mob nearby and sends the symbiote into a
 * short rage.
 * @param {Player} player
 * @param {Form} form
 */
function roar(player, form) {
  const center = player.location;
  for (const mob of victimsAround(player, center, ROAR.radius)) {
    hurt(mob, ROAR.damage, player);
    afflict(mob, 'slowness', 100, 3);
    afflict(mob, 'weakness', 200, 1);
    launch(mob, center, -1.4, 0.45);
  }
  player.addEffect('strength', 160, { amplifier: form.strength + 1, showParticles: false });

  const dimension = player.dimension;
  fx.particle(dimension, 'minecraft:knockback_roar_particle', player.getHeadLocation());
  fx.sound(dimension, 'venom.roar', center, 2);
  fx.shake(player, 0.8, 0.8);
  return true;
}

/**
 * Spike Burst: tendrils erupt from the ground in widening rings.
 * @param {Player} player
 * @param {Form} form
 */
function spikes(player, form) {
  const center = { ...player.location };
  const dimension = player.dimension;
  for (const mob of victimsAround(player, center, SPIKES.radius)) {
    hurt(mob, SPIKES.damage * form.power, player);
    launch(mob, center, -0.3, 0.7);
  }
  for (let wave = 1; wave <= 4; wave++) {
    const radius = (SPIKES.radius * wave) / 4;
    system.runTimeout(() => {
      fx.ring(dimension, form.particle.spike, { x: center.x, y: center.y + 0.1, z: center.z }, radius, Math.round(radius * 5));
    }, (wave - 1) * 2);
  }
  fx.sound(dimension, 'venom.spikes', center, 1.5);
  fx.shake(player, 0.4, 0.4);
  return true;
}

/**
 * Where the player's tendrils come out: just below and in front of the eyes.
 * @param {Player} player
 */
function handOf(player) {
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  return { x: head.x + view.x * 0.6, y: head.y - 0.35, z: head.z + view.z * 0.6 };
}

/**
 * The way the player is facing, flat along the ground.
 * @param {Player} player
 */
function facing(player) {
  const yaw = (player.getRotation().y * Math.PI) / 180;
  return { x: -Math.sin(yaw), z: Math.cos(yaw) };
}

/**
 * Something solid to hook a tendril onto, up and ahead of the player.
 * @param {Player} player
 * @param {{x: number, z: number}} forward
 * @returns {Vector3 | undefined}
 */
function findAnchor(player, forward) {
  const head = player.getHeadLocation();
  for (const degrees of SWING.angles) {
    const angle = (degrees * Math.PI) / 180;
    const direction = { x: forward.x * Math.cos(angle), y: Math.sin(angle), z: forward.z * Math.cos(angle) };
    try {
      const hit = player.dimension.getBlockFromRay(head, direction, {
        maxDistance: SWING.range,
        includeLiquidBlocks: false,
        includePassableBlocks: false,
      });
      if (hit) {
        return {
          x: hit.block.location.x + hit.faceLocation.x,
          y: hit.block.location.y + hit.faceLocation.y,
          z: hit.block.location.z + hit.faceLocation.z,
        };
      }
    } catch {
      // that ray left the loaded world; try the next angle
    }
  }
  return undefined;
}

/**
 * Web Swing: hook onto whatever is above and ahead and swing forward. Each use
 * is one arc, so using it again in mid-air chains into the next swing. With
 * nothing to hook onto it is a plain leap.
 * @param {Player} player
 * @param {Form} form
 */
function swing(player, form) {
  const forward = facing(player);
  const anchor = findAnchor(player, forward);
  let speed = SWING.leapSpeed;
  let lift = SWING.leapLift;
  if (anchor) {
    const head = player.getHeadLocation();
    const reach = Math.hypot(anchor.x - head.x, anchor.y - head.y, anchor.z - head.z);
    speed = clamp(SWING.speed + reach * 0.02, SWING.speed, SWING.speed + 0.6);
    lift = player.isOnGround ? SWING.liftFromGround : SWING.lift;
    runtimeOf(player).swing = { anchor, until: system.currentTick + SWING.rope };
    fx.line(player.dimension, form.particle.tendril, handOf(player), anchor, 0.5, 70);
  }
  try {
    player.applyKnockback({ x: forward.x * speed, z: forward.z * speed }, lift);
  } catch {
    // cannot be moved right now (for example while riding something)
  }
  fx.sound(player.dimension, 'venom.tendril', player.location);
  return true;
}

/**
 * Keep the hooked tendril drawn while a swing is in the air.
 * @param {Player} player
 * @param {Form} form
 */
export function drawRope(player, form) {
  const runtime = runtimeOf(player);
  if (!runtime.swing) return;
  const now = system.currentTick;
  if (now >= runtime.swing.until || player.isOnGround) {
    runtime.swing = undefined;
  } else if (now % 3 === 0) {
    fx.line(player.dimension, form.particle.tendril, handOf(player), runtime.swing.anchor, 0.5, 70);
  }
}

/**
 * Blade Slash (Carnage): a sweep that cuts every mob in a wide arc in front
 * and leaves them bleeding.
 * @param {Player} player
 * @param {Form} form
 */
function slash(player, form) {
  const forward = facing(player);
  const center = player.location;
  for (const mob of victimsAround(player, center, SLASH.range)) {
    const dx = mob.location.x - center.x;
    const dz = mob.location.z - center.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.5 && (dx * forward.x + dz * forward.z) / distance < SLASH.arc) continue; // behind or beside
    hurt(mob, SLASH.damage * form.power, player);
    afflict(mob, 'wither', SLASH.bleedTicks, 1);
    launch(mob, center, -0.6, 0.3);
  }
  const dimension = player.dimension;
  for (let step = -4; step <= 4; step++) {
    const angle = step * 0.28;
    const x = forward.x * Math.cos(angle) - forward.z * Math.sin(angle);
    const z = forward.x * Math.sin(angle) + forward.z * Math.cos(angle);
    for (const reach of [1.6, 2.6, 3.6]) {
      fx.particle(dimension, form.particle.tendril, { x: center.x + x * reach, y: center.y + 1.1, z: center.z + z * reach });
    }
  }
  fx.sound(dimension, 'venom.slash', center);
  return true;
}

/**
 * Tendril Spears (Carnage): spears shoot along the line of sight and run
 * through every mob on it, pinning them in place.
 * @param {Player} player
 * @param {Form} form
 */
function impale(player, form) {
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  const wall = player.getBlockFromViewDirection({
    maxDistance: IMPALE.range,
    includeLiquidBlocks: false,
    includePassableBlocks: false,
  });
  let length = IMPALE.range;
  if (wall) {
    length = Math.hypot(
      wall.block.location.x + wall.faceLocation.x - head.x,
      wall.block.location.y + wall.faceLocation.y - head.y,
      wall.block.location.z + wall.faceLocation.z - head.z,
    );
  }
  const along = (/** @type {number} */ t) => ({ x: head.x + view.x * t, y: head.y + view.y * t, z: head.z + view.z * t });

  for (const mob of victimsAround(player, along(length / 2), length / 2 + 2)) {
    const body = { x: mob.location.x, y: mob.location.y + 0.9, z: mob.location.z };
    const t = clamp((body.x - head.x) * view.x + (body.y - head.y) * view.y + (body.z - head.z) * view.z, 0, length);
    const nearest = along(t);
    if (Math.hypot(body.x - nearest.x, body.y - nearest.y, body.z - nearest.z) > IMPALE.width) continue;
    hurt(mob, IMPALE.damage * form.power, player);
    afflict(mob, 'slowness', 50, 5);
  }
  const dimension = player.dimension;
  fx.line(dimension, form.particle.tendril, handOf(player), along(length), 0.3, 80);
  fx.particle(dimension, form.particle.spike, along(length));
  fx.sound(dimension, 'venom.spikes', player.location, 1.5);
  return true;
}

/**
 * Frenzy (Carnage): a burst of strength and speed, with every claw hit healing
 * the host (see the hit handler in main.js).
 * @param {Player} player
 * @param {Form} form
 */
function frenzy(player, form) {
  runtimeOf(player).frenzyUntil = system.currentTick + FRENZY.ticks;
  player.addEffect('strength', FRENZY.ticks, { amplifier: form.strength + 2, showParticles: false });
  player.addEffect('speed', FRENZY.ticks, { amplifier: form.speed + 1, showParticles: false });
  fx.engulf(player, form.particle.goo);
  fx.sound(player.dimension, 'venom.roar', player.location, 2);
  fx.shake(player, 0.6, 0.6);
  return true;
}

const HANDLERS = { tendril, swing, devour, roar, spikes, slash, impale, frenzy };
const MISS_COOLDOWN = 8;

/**
 * Run a hotbar ability if it is off cooldown.
 * @param {Player} player
 * @param {Form} form
 * @param {keyof typeof ABILITIES} key
 */
export function useAbility(player, form, key) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  if (runtime.blob) {
    tip(player, '§7A blob cannot do that. Sneak and use the Core to rise again.');
    return;
  }
  if (now < (runtime.cooldowns[key] ?? 0)) return;
  const ability = ABILITIES[key];
  // A miss only costs a moment. The item's own cooldown is set to match, so
  // the overlay on the hotbar always shows when the ability is really ready.
  const wait = HANDLERS[key](player, form) ? ability.cooldown : MISS_COOLDOWN;
  runtime.cooldowns[key] = now + wait;
  try {
    player.startItemCooldown(`venom_${key}`, wait);
  } catch {
    // the cooldown overlay is only cosmetic
  }
  if (wait !== ability.cooldown) return;
  if (ability.cost) addBiomass(player, -ability.cost);
  breakCamo(player);
}

// ----------------------------------------------------------------------------- blob form

/**
 * Melt down into a small blob, or rise back into the suit. The blob is fast
 * and unseen, and can slip into gaps one block high (see passives.js), but it
 * has no armor and cannot use abilities.
 * @param {Player} player
 * @param {Form} form
 */
export function toggleBlob(player, form) {
  const runtime = runtimeOf(player);
  runtime.blob = !runtime.blob;
  runtime.camo = false;
  runtime.slam = undefined;
  runtime.swing = undefined;
  runtime.squeeze = undefined;
  if (runtime.blob) {
    player.addEffect('invisibility', 60, { showParticles: false });
  } else {
    player.removeEffect('invisibility');
    player.removeEffect('speed'); // the suit's own speed returns within a second
  }
  syncSuit(player);
  fx.engulf(player, form.particle.goo);
  fx.sound(player.dimension, 'venom.squelch', player.location);
  tip(player, runtime.blob ? '§7You melt into a blob. Sneak and use the Core to rise again.' : `${form.color}§l${form.cry}`);
}

// ----------------------------------------------------------------------------- ground slam

/**
 * Sneak in mid-air to dive: the symbiote drops like a stone.
 * @param {Player} player
 */
export function startSlam(player) {
  runtimeOf(player).slam = { fromY: player.location.y, tick: system.currentTick };
  try {
    player.applyKnockback({ x: 0, z: 0 }, -1.6);
  } catch {
    // falls at normal speed instead
  }
  fx.sound(player.dimension, 'mob.enderdragon.flap', player.location, 0.8, 1.6);
}

/**
 * The dive hits the ground: the farther the fall, the bigger the shockwave.
 * @param {Player} player
 * @param {Form} form
 */
export function landSlam(player, form) {
  const runtime = runtimeOf(player);
  const drop = (runtime.slam?.fromY ?? player.location.y) - player.location.y;
  runtime.slam = undefined;
  if (drop < 2) return;

  const center = player.location;
  const radius = clamp(3 + drop * 0.25, 3.5, 7);
  const damage = clamp(6 + drop * 1.2, 6, 26) * form.power;
  for (const mob of victimsAround(player, center, radius)) {
    const distance = Math.hypot(mob.location.x - center.x, mob.location.z - center.z);
    hurt(mob, damage * (1 - 0.5 * clamp(distance / radius, 0, 1)), player);
    launch(mob, center, -1, 0.6);
  }

  const dimension = player.dimension;
  const ground = { x: center.x, y: center.y + 0.1, z: center.z };
  fx.ring(dimension, form.particle.spike, ground, radius * 0.5, 12);
  fx.ring(dimension, form.particle.goo, ground, radius, 10);
  fx.sound(dimension, 'random.explode', center, 1, 0.7);
  fx.sound(dimension, 'venom.squelch', center);
  fx.shake(player, clamp(0.3 + drop * 0.04, 0.3, 1.2), 0.5);
  runtime.cooldowns.slam = system.currentTick + SLAM.cooldown;
  addBiomass(player, -SLAM.cost);
  breakCamo(player);
}

// ----------------------------------------------------------------------------- weakness: sound

/**
 * A loud noise reached a bonded player. Each hit sickens them; enough hits in
 * a row tear the symbiote off.
 * @param {Player} player
 * @param {number} strength  how many hits this noise counts for
 */
export function sonicHit(player, strength) {
  const now = system.currentTick;
  const runtime = runtimeOf(player);
  runtime.stress += strength;
  runtime.stressTick = now;
  addBiomass(player, -8 * strength);
  player.addEffect('nausea', 140);
  player.addEffect('weakness', 160, { amplifier: 1 });
  player.addEffect('slowness', 80, { amplifier: 1 });
  fx.sound(player.dimension, 'venom.pain', player.location);
  breakCamo(player);

  if (runtime.stress >= SONIC.separateAt) {
    separate(player, true);
  } else if (shouldSay(runtime, 'sonic', now, 40)) {
    tip(player, '§cTHE NOISE! IT HURTS US!');
  }
}

/**
 * Hit every bonded player within earshot of a noise.
 * @param {import('@minecraft/server').Dimension} dimension
 * @param {Vector3} location
 * @param {number} radius
 */
export function sonicPulse(dimension, location, radius) {
  for (const player of dimension.getPlayers({ location, maxDistance: radius })) {
    if (player.getDynamicProperty(PROP.form) !== undefined) sonicHit(player, 1);
  }
}
