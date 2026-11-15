import { blockAt, burst, effect, nearbyMobs, particle, ring, sound, up } from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */
/** @typedef {import("@minecraft/server").Player} Player */

/** Crops and the block state that holds their growth stage. @type {Record<string, [string, number]>} */
const CROPS = {
  "minecraft:wheat": ["growth", 7],
  "minecraft:carrots": ["growth", 7],
  "minecraft:potatoes": ["growth", 7],
  "minecraft:beetroot": ["growth", 7],
  "minecraft:melon_stem": ["growth", 7],
  "minecraft:pumpkin_stem": ["growth", 7],
  "minecraft:nether_wart": ["age", 3],
};

const WILD_PLANTS = ["minecraft:short_grass", "minecraft:short_grass", "minecraft:short_grass", "minecraft:dandelion", "minecraft:poppy"];

/** @param {Player} player @param {number} amount */
function heal(player, amount) {
  try {
    const health = player.getComponent("minecraft:health");
    if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
    player.removeEffect("minecraft:poison");
    player.removeEffect("minecraft:wither");
  } catch {
    /* player left */
  }
  effect(player, "regeneration", 100, 1);
}

/** Heals the caster and every player close by, and cleanses poison and wither. @param {SpellContext} ctx */
export function mend({ player, dimension }) {
  const center = player.location;
  /** @type {Player[]} */
  let allies = [player];
  try {
    allies = dimension.getPlayers({ location: center, maxDistance: 6 });
  } catch {
    /* unloaded */
  }
  for (const ally of allies) {
    heal(ally, ally.id === player.id ? 8 : 6);
    burst(dimension, "minecraft:heart_particle", up(ally.location, 1.4), 5, 0.6);
  }
  ring(dimension, "minecraft:villager_happy", up(center, 0.3), 2.5, 16);
  ring(dimension, "minecraft:villager_happy", up(center, 1.2), 1.4, 10, 0.3);
  sound(dimension, "random.orb", center, 1, 0.7);
  sound(dimension, "block.chorusflower.grow", center, 1, 1.4);
  return true;
}

/** Ripens crops, scatters wild flowers and roots monsters to the spot. @param {SpellContext} ctx */
export function overgrowth({ player, dimension }) {
  const center = player.location;
  const radius = 6;
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const cz = Math.floor(center.z);

  let grown = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const block = blockAt(dimension, { x: cx + dx, y: cy + dy, z: cz + dz });
        if (!block) continue;
        try {
          const crop = CROPS[block.typeId];
          if (crop) {
            const [state, ripe] = crop;
            if (block.permutation.getState(/** @type {any} */ (state)) !== ripe) {
              block.setPermutation(block.permutation.withState(/** @type {any} */ (state), ripe));
              particle(dimension, "minecraft:crop_growth_emitter", { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
              grown++;
            }
          } else if (block.typeId === "minecraft:grass_block" && Math.random() < 0.14) {
            const above = block.above();
            if (above && above.isAir) {
              above.setType(WILD_PLANTS[Math.floor(Math.random() * WILD_PLANTS.length)]);
            }
          }
        } catch {
          /* protected or unloaded block */
        }
      }
    }
  }

  for (const mob of nearbyMobs(dimension, center, radius, { hostileOnly: true })) {
    effect(mob, "slowness", 120, 6);
    effect(mob, "poison", 120, 0);
    burst(dimension, "minecraft:villager_happy", up(mob.location, 0.4), 6, 0.6);
  }

  for (let r = 2; r <= radius; r += 2) ring(dimension, "minecraft:villager_happy", up(center, 0.3), r, r * 6, r);
  sound(dimension, "item.bone_meal.use", center, 1, 0.8);
  sound(dimension, "block.chorusflower.grow", center, 1, 0.8);
  return true;
}
