import { Direction, system } from "@minecraft/server";
import {
  add,
  aimTarget,
  burst,
  centerOf,
  damage,
  distance,
  effect,
  hitPoint,
  isLiving,
  isProtected,
  normalize,
  particle,
  scale,
  sound,
  sub,
  up,
} from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const BLINK_RANGE = 32;

/** Feet position in the middle of the block containing a point. @param {Vector3} p @returns {Vector3} */
const standIn = (p) => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y), z: Math.floor(p.z) + 0.5 });

/** Teleports the caster to the spot they are looking at. @param {SpellContext} ctx */
export function blink({ player, dimension }) {
  const head = player.getHeadLocation();
  const direction = player.getViewDirection();
  const from = player.location;

  /** @type {Vector3[]} */
  const candidates = [];
  let reach = BLINK_RANGE;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: BLINK_RANGE, includePassableBlocks: false });
    if (hit) {
      const point = hitPoint(hit);
      reach = distance(head, point);
      const b = hit.block.location;
      if (hit.face === Direction.Up) {
        candidates.push({ x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 }); // stand on top of it
      } else if (hit.face === Direction.Down) {
        candidates.push({ x: b.x + 0.5, y: b.y - 2, z: b.z + 0.5 }); // hang under the ceiling
      }
    }
  } catch {
    /* looking into unloaded chunks */
  }
  // otherwise: the furthest free spot along the line of sight
  for (let back = 0.4; back < reach - 1; back += 1) {
    candidates.push(standIn(up(add(head, scale(direction, reach - back)), -1)));
    if (candidates.length > 12) break;
  }

  for (const spot of candidates) {
    let moved = false;
    try {
      moved = player.tryTeleport(spot, { checkForBlocks: true, keepVelocity: false });
    } catch {
      moved = false; // outside the world or unloaded
    }
    if (!moved) continue;

    burst(dimension, "minecraft:mob_portal", up(from, 1), 30, 0.7);
    burst(dimension, "minecraft:mob_portal", up(spot, 1), 30, 0.7);
    burst(dimension, "minecraft:endrod", up(spot, 1), 8, 0.6);
    sound(dimension, "mob.endermen.portal", from, 0.8, 1.1);
    sound(dimension, "mob.endermen.portal", spot, 1, 1.3);
    // Blinking into open air would otherwise be a death sentence: float down.
    // On solid ground a brief pulse just clears any fall built up beforehand.
    let airborne = true;
    try {
      const below = dimension.getBlockFromRay(up(spot, 0.5), { x: 0, y: -1, z: 0 }, { maxDistance: 4, includeLiquidBlocks: true });
      airborne = below === undefined;
    } catch {
      /* unloaded */
    }
    effect(player, "slow_falling", airborne ? 600 : 12, 0, false);
    return true;
  }
  return "No room to blink there";
}

/** Opens a rift that drags mobs and loose items in, then collapses. @param {SpellContext} ctx */
export function singularity({ player, dimension }) {
  const target = aimTarget(player, 28);
  /** @type {Vector3} */
  let center;
  if (target.entity) {
    center = centerOf(target.entity);
  } else if (target.blockHit) {
    // hover just off whatever surface was hit
    const face = target.blockHit.face;
    if (face === Direction.Up) center = up(target.point, 1.4);
    else if (face === Direction.Down) center = up(target.point, -1.2);
    else center = up(sub(target.point, scale(target.direction, 1)), 0.4);
  } else {
    center = add(target.origin, scale(target.direction, 14));
  }

  const pullRadius = 9;
  const lifetime = 70;
  let age = 0;
  sound(dimension, "portal.trigger", center, 1, 1.6);

  const handle = system.runInterval(() => {
    age += 2;
    const shrink = 1 - age / lifetime;

    // two spiral arms winding into the core
    for (let arm = 0; arm < 2; arm++) {
      for (let k = 0; k < 4; k++) {
        const r = 0.5 + shrink * 3.5 * ((k + 1) / 4);
        const angle = age * 0.45 + arm * Math.PI + k * 0.5;
        particle(dimension, "minecraft:mob_portal", {
          x: center.x + Math.cos(angle) * r,
          y: center.y + Math.sin(angle * 0.7) * 0.5,
          z: center.z + Math.sin(angle) * r,
        });
      }
    }
    particle(dimension, "minecraft:endrod", center);
    if (age % 20 === 0) sound(dimension, "mob.endermen.portal", center, 0.6, 0.5);

    /** @type {import("@minecraft/server").Entity[]} */
    let caught = [];
    try {
      caught = dimension.getEntities({ location: center, maxDistance: pullRadius, excludeTypes: ["minecraft:player"] });
    } catch {
      /* unloaded */
    }
    for (const entity of caught) {
      try {
        const loose = entity.typeId === "minecraft:item" || entity.typeId === "minecraft:xp_orb";
        if (!loose && (!isLiving(entity) || isProtected(entity))) continue;
        const offset = sub(center, centerOf(entity));
        const gap = Math.hypot(offset.x, offset.y, offset.z);
        if (gap < 0.8) {
          entity.clearVelocity();
          continue;
        }
        const pull = 0.1 + 0.22 * (1 - gap / pullRadius);
        const toward = normalize(offset);
        entity.applyImpulse({ x: toward.x * pull, y: toward.y * pull + 0.04, z: toward.z * pull });
      } catch {
        /* cannot be pushed */
      }
    }

    if (age < lifetime) return;
    system.clearRun(handle);

    // collapse: a scripted blast rather than a real explosion, so villagers,
    // pets and the caster standing nearby are never caught in it
    particle(dimension, "minecraft:huge_explosion_emitter", center);
    burst(dimension, "minecraft:mob_portal", center, 60, 2.2);
    burst(dimension, "minecraft:endrod", center, 24, 1.6);
    sound(dimension, "random.explode", center, 1, 0.6);
    sound(dimension, "mob.endermen.portal", center, 1, 0.4);
    for (const entity of caught) {
      if (!isLiving(entity) || isProtected(entity)) continue;
      const offset = sub(centerOf(entity), center);
      if (Math.hypot(offset.x, offset.y, offset.z) > 4.5) continue;
      damage(entity, 14, player);
      try {
        const away = normalize({ x: offset.x, y: 0, z: offset.z });
        entity.applyKnockback({ x: away.x * 1.4, z: away.z * 1.4 }, 0.5);
      } catch {
        /* immovable or already dead */
      }
    }
  }, 2);
  return true;
}
