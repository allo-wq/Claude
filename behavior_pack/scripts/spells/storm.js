import { EntityDamageCause, system } from "@minecraft/server";
import { aimTarget, burst, damage, groundBelow, nearbyMobs, rand, sound, up } from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */

/** @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} where */
function strike(dimension, where) {
  try {
    dimension.spawnEntity("minecraft:lightning_bolt", where);
  } catch {
    /* unloaded chunk */
  }
  burst(dimension, "minecraft:electric_spark_particle", up(where, 0.8), 14, 1.2);
}

/** Calls a lightning bolt down on whatever the caster is pointing at. @param {SpellContext} ctx */
export function lightningStrike({ player, dimension }) {
  const target = aimTarget(player, 48);
  if (!target.hit) return "No target in range";

  if (target.entity) {
    strike(dimension, target.entity.location);
    damage(target.entity, 6, player, EntityDamageCause.lightning);
  } else {
    strike(dimension, target.point);
  }
  return true;
}

/** Chain of bolts: one on every monster nearby, or a ring of bolts if there are none. @param {SpellContext} ctx */
export function thunderstorm({ player, dimension }) {
  const origin = player.location;
  const monsters = nearbyMobs(dimension, origin, 24, { hostileOnly: true, limit: 8 });
  const bolts = monsters.length > 0 ? monsters.length : 6;
  const spin = rand(0, Math.PI * 2);
  sound(dimension, "item.trident.thunder", origin, 1, 0.8);

  for (let i = 0; i < bolts; i++) {
    system.runTimeout(() => {
      const mob = monsters[i];
      if (mob) {
        if (!mob.isValid) return;
        strike(dimension, mob.location);
        damage(mob, 8, player, EntityDamageCause.lightning);
        return;
      }
      const angle = spin + (i / bolts) * Math.PI * 2;
      const reach = rand(6, 11);
      const above = { x: origin.x + Math.cos(angle) * reach, y: origin.y + 12, z: origin.z + Math.sin(angle) * reach };
      strike(dimension, groundBelow(dimension, above));
    }, 4 + i * 5);
  }
  return true;
}
