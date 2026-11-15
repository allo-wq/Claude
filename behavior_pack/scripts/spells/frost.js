import { EntityDamageCause, system } from "@minecraft/server";
import { add, aimTarget, blockAt, burst, damage, effect, line, nearbyMobs, particle, rand, scale, sound, up } from "../util.js";

/** @typedef {import("../staffs.js").SpellContext} SpellContext */

const WATER = new Set(["minecraft:water", "minecraft:flowing_water"]);
const LAVA = new Set(["minecraft:lava", "minecraft:flowing_lava"]);

/**
 * Freezes the surface of water in a disc (frosted ice melts again later) and,
 * optionally, hardens lava.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} center
 * @param {number} radius
 * @param {boolean} hardenLava
 * @param {number} [hole] leave liquid within this distance of the centre untouched
 */
function freezeLiquids(dimension, center, radius, hardenLava, hole = -1) {
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const cz = Math.floor(center.z);
  const reach = Math.ceil(radius);
  let frozen = 0;
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const spread = dx * dx + dz * dz;
      if (spread > radius * radius || spread <= hole * Math.abs(hole)) continue;
      const block = blockAt(dimension, { x: cx + dx, y: cy, z: cz + dz });
      if (!block) continue;
      try {
        if (WATER.has(block.typeId)) {
          const above = block.above();
          if (above && !above.isAir) continue; // only the surface freezes
          block.setType("minecraft:frosted_ice");
          frozen++;
        } else if (hardenLava && LAVA.has(block.typeId)) {
          const isSource = block.permutation.getState("liquid_depth") === 0;
          block.setType(isSource ? "minecraft:obsidian" : "minecraft:cobblestone");
          frozen++;
        }
      } catch {
        /* protected or unloaded block */
      }
    }
  }
  return frozen;
}

/** A freezing beam: chills a mob to the bone, or freezes the water / lava it touches. @param {SpellContext} ctx */
export function frostRay({ player, dimension }) {
  const target = aimTarget(player, 32, { liquids: true });
  const start = add(target.origin, scale(target.direction, 1.2));
  line(dimension, "minecraft:snowflake_particle", start, target.point, 0.6);
  sound(dimension, "random.glass", target.origin, 0.7, 1.8);

  if (target.entity) {
    damage(target.entity, 6, player, EntityDamageCause.freezing);
    effect(target.entity, "slowness", 120, 3);
    try {
      target.entity.extinguishFire(true);
    } catch {
      /* not burning */
    }
    burst(dimension, "minecraft:snowflake_particle", target.point, 18, 0.9);
    sound(dimension, "random.glass", target.point, 1, 0.7);
  } else if (target.blockHit) {
    const block = target.blockHit.block;
    const liquid = WATER.has(block.typeId) || LAVA.has(block.typeId);
    if (liquid && freezeLiquids(dimension, block.location, 2.5, true) > 0) {
      sound(dimension, "random.glass", target.point, 1, 0.6);
    }
    burst(dimension, "minecraft:snowflake_particle", up(target.point, 0.3), 12, 0.8);
  }
  return true;
}

/** A snowstorm centred on the caster that freezes monsters and the water underfoot. @param {SpellContext} ctx */
export function blizzard({ player, dimension }) {
  const center = player.location;
  const radius = 7;
  sound(dimension, "mob.player.hurt_freeze", center, 1, 0.6);
  sound(dimension, "random.glass", center, 1, 0.5);
  try {
    player.extinguishFire(true);
  } catch {
    /* not burning */
  }

  // an instant ice floor: the layer under the caster, plus the layer they are
  // wading in (minus a small hole so nobody gets frozen into a block of ice)
  freezeLiquids(dimension, up(center, -1), 5, false);
  freezeLiquids(dimension, center, 5, false, 1.5);

  let pulses = 0;
  const handle = system.runInterval(() => {
    pulses++;
    for (let i = 0; i < 26; i++) {
      const angle = rand(0, Math.PI * 2);
      const reach = Math.sqrt(Math.random()) * radius;
      particle(dimension, "minecraft:snowflake_particle", {
        x: center.x + Math.cos(angle) * reach,
        y: center.y + rand(0.2, 3.2),
        z: center.z + Math.sin(angle) * reach,
      });
    }
    if (pulses % 5 === 1) {
      for (const mob of nearbyMobs(dimension, center, radius)) {
        damage(mob, 3, player, EntityDamageCause.freezing);
        effect(mob, "slowness", 80, 5);
        effect(mob, "weakness", 80, 1);
      }
    }
    if (pulses >= 30) system.clearRun(handle);
  }, 2);
  return true;
}
