import {
  add,
  centerOf,
  damage,
  dot,
  effect,
  isProtected,
  length,
  nearbyMobs,
  normalize,
  particle,
  scale,
  sound,
  sub,
  up,
} from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */

const GUST_RANGE = 10;

/** A blast of wind that hurls every mob in front of the caster away. @param {SpellContext} ctx */
export function gust({ player, dimension }) {
  const head = player.getHeadLocation();
  const direction = player.getViewDirection();
  const flat = normalize({ x: direction.x, y: 0, z: direction.z });
  // looking straight up or down: push outward in whatever way the mob already is
  const hasHeading = length(flat) > 0.1;

  sound(dimension, "wind_charge.burst", head, 1, 1);
  sound(dimension, "mob.enderdragon.flap", head, 0.5, 1.5);
  particle(dimension, "minecraft:wind_explosion_emitter", add(head, scale(direction, 2)));
  particle(dimension, "minecraft:wind_explosion_emitter", add(head, scale(direction, 5)));
  for (let d = 1.5; d < GUST_RANGE; d += 1.5) {
    particle(dimension, "minecraft:white_smoke_particle", add(head, scale(direction, d)));
    particle(dimension, "minecraft:basic_smoke_particle", add(head, scale(direction, d + 0.7)));
  }

  for (const mob of nearbyMobs(dimension, head, GUST_RANGE, { includeProtected: true })) {
    const offset = sub(centerOf(mob), head);
    const gap = length(offset);
    const toward = normalize(offset);
    // inside a ~55 degree cone, or right on top of the caster
    if (gap > 2 && dot(toward, direction) < 0.57) continue;

    const power = 1 - gap / (GUST_RANGE * 1.4);
    const push = hasHeading ? flat : normalize({ x: toward.x, y: 0, z: toward.z });
    try {
      mob.applyKnockback({ x: push.x * 2.6 * power, z: push.z * 2.6 * power }, 0.5 + 0.45 * power);
    } catch {
      /* immovable */
    }
    if (!isProtected(mob)) damage(mob, 2, player); // villagers and pets are only shoved
    particle(dimension, "minecraft:white_smoke_particle", centerOf(mob));
  }
  return true;
}

/** Launches the caster where they are looking and lets them glide back down. @param {SpellContext} ctx */
export function skyLeap({ player, dimension }) {
  const direction = player.getViewDirection();
  const feet = player.location;
  try {
    player.applyKnockback({ x: direction.x * 1.7, z: direction.z * 1.7 }, 0.6 + Math.max(0, direction.y) * 1.1);
  } catch {
    return "The wind cannot lift you here";
  }
  effect(player, "slow_falling", 400, 0, false);

  particle(dimension, "minecraft:wind_explosion_emitter", up(feet, 0.2));
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    particle(dimension, "minecraft:white_smoke_particle", {
      x: feet.x + Math.cos(angle) * 1.2,
      y: feet.y + 0.2,
      z: feet.z + Math.sin(angle) * 1.2,
    });
  }
  sound(dimension, "wind_charge.burst", feet, 1, 0.8);
  sound(dimension, "mob.enderdragon.flap", feet, 0.7, 1.2);
  return true;
}
