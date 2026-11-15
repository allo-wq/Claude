import { EntityDamageCause, system } from "@minecraft/server";
import {
  add,
  burst,
  centerOf,
  damage,
  distance,
  effect,
  hitPoint,
  isLiving,
  nearbyMobs,
  normalize,
  particle,
  ring,
  scale,
  sound,
  sub,
  up,
} from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */

const BOLT_SPEED = 1.8; // blocks per tick
const BOLT_RANGE = 48;

/** A fire bolt that flies until it hits a block or a mob, then bursts. @param {SpellContext} ctx */
export function fireBolt({ player, dimension }) {
  const direction = player.getViewDirection();
  let position = player.getHeadLocation();
  let travelled = 0;
  sound(dimension, "mob.blaze.shoot", position, 1, 1.1);

  const handle = system.runInterval(() => {
    try {
      /** @type {import("@minecraft/server").Vector3 | undefined} */
      let impact;

      const mobHit = dimension
        .getEntitiesFromRay(position, direction, {
          maxDistance: BOLT_SPEED,
          excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
          excludeFamilies: ["inanimate"],
        })
        .find((entry) => entry.entity.id !== player.id && isLiving(entry.entity));
      if (mobHit) {
        impact = centerOf(mobHit.entity);
      } else {
        const blockHit = dimension.getBlockFromRay(position, direction, {
          maxDistance: BOLT_SPEED,
          includeLiquidBlocks: true,
          includePassableBlocks: false,
        });
        if (blockHit) impact = hitPoint(blockHit);
      }

      if (impact) {
        system.clearRun(handle);
        explode(dimension, impact, player);
        return;
      }

      for (let i = 0; i < 3; i++) {
        const at = add(position, scale(direction, (BOLT_SPEED * i) / 3));
        if (travelled + i > 1) particle(dimension, "minecraft:basic_flame_particle", at);
      }
      if (travelled > 1) particle(dimension, "minecraft:lava_particle", position);

      position = add(position, scale(direction, BOLT_SPEED));
      travelled += BOLT_SPEED;
      if (travelled >= BOLT_RANGE) {
        system.clearRun(handle);
        burst(dimension, "minecraft:basic_smoke_particle", position, 8, 0.4);
      }
    } catch {
      system.clearRun(handle); // flew out of the loaded world
    }
  }, 1);
  return true;
}

/** @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} impact
 * @param {import("@minecraft/server").Player} player */
function explode(dimension, impact, player) {
  // the caster's own flames do not hurt them when a bolt bursts point-blank
  if (distance(player.location, impact) < 5) effect(player, "resistance", 5, 4, false);
  try {
    dimension.createExplosion(impact, 2.5, { breaksBlocks: false, causesFire: false, source: player });
  } catch {
    /* unloaded chunk */
  }
  burst(dimension, "minecraft:lava_particle", impact, 10, 0.8);
  burst(dimension, "minecraft:basic_flame_particle", impact, 20, 1.6);
  for (const mob of nearbyMobs(dimension, impact, 3.5)) {
    try {
      mob.setOnFire(5, true);
    } catch {
      /* fire immune */
    }
  }
}

/** Expanding ring of fire around the caster. @param {SpellContext} ctx */
export function flameNova({ player, dimension }) {
  const center = up(player.location, 0.4);
  sound(dimension, "mob.ghast.fireball", center, 1, 0.7);
  sound(dimension, "random.explode", center, 0.6, 1.4);
  /** @type {Set<string>} */
  const burned = new Set();

  for (let step = 1; step <= 7; step++) {
    system.runTimeout(() => {
      ring(dimension, "minecraft:basic_flame_particle", center, step, step * 10, step * 0.4);
      ring(dimension, "minecraft:lava_particle", center, step, step * 2, step);
      for (const mob of nearbyMobs(dimension, center, step + 0.5)) {
        if (burned.has(mob.id)) continue;
        burned.add(mob.id);
        damage(mob, 10, player, EntityDamageCause.fire);
        try {
          mob.setOnFire(6, true);
          const away = normalize(sub(mob.location, center));
          mob.applyKnockback({ x: away.x * 1.2, z: away.z * 1.2 }, 0.45);
        } catch {
          /* fire immune or already dead */
        }
      }
    }, (step - 1) * 2);
  }
  return true;
}
