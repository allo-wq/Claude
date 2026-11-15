import { EntityDamageCause } from "@minecraft/server";

/**
 * @typedef {import("@minecraft/server").Vector3} Vector3
 * @typedef {import("@minecraft/server").Dimension} Dimension
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("@minecraft/server").Player} Player
 * @typedef {import("@minecraft/server").Block} Block
 * @typedef {import("@minecraft/server").BlockRaycastHit} BlockRaycastHit
 */

// ---------------------------------------------------------------- vectors
/** @param {Vector3} a @param {Vector3} b @returns {Vector3} */
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
/** @param {Vector3} a @param {Vector3} b @returns {Vector3} */
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
/** @param {Vector3} a @param {number} s @returns {Vector3} */
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
/** @param {Vector3} a @param {Vector3} b */
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
/** @param {Vector3} a */
export const length = (a) => Math.hypot(a.x, a.y, a.z);
/** @param {Vector3} a @param {Vector3} b */
export const distance = (a, b) => length(sub(a, b));
/** @param {Vector3} a @returns {Vector3} */
export const normalize = (a) => {
  const len = length(a);
  return len > 1e-6 ? scale(a, 1 / len) : { x: 0, y: 0, z: 0 };
};
/** @param {Vector3} a @param {number} [dy] @returns {Vector3} */
export const up = (a, dy = 1) => ({ x: a.x, y: a.y + dy, z: a.z });
/** Centre of mass of a mob, good enough for beams and blasts. @param {Entity} entity */
export const centerOf = (entity) => up(entity.location, 0.9);
/** @param {number} min @param {number} max */
export const rand = (min, max) => min + Math.random() * (max - min);

// ------------------------------------------------------- particles + sound
// Spawning effects in an unloaded chunk or outside the world throws; a spell
// should never die because one sparkle could not be drawn.

/** @param {Dimension} dimension @param {string} id @param {Vector3} location */
export function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    /* out of bounds / unloaded */
  }
}

/** Random puff of particles inside a sphere.
 * @param {Dimension} dimension @param {string} id @param {Vector3} center
 * @param {number} count @param {number} radius */
export function burst(dimension, id, center, count, radius) {
  for (let i = 0; i < count; i++) {
    particle(dimension, id, {
      x: center.x + rand(-radius, radius),
      y: center.y + rand(-radius, radius) * 0.6,
      z: center.z + rand(-radius, radius),
    });
  }
}

/** Flat ring of particles.
 * @param {Dimension} dimension @param {string} id @param {Vector3} center
 * @param {number} radius @param {number} count @param {number} [phase] */
export function ring(dimension, id, center, radius, count, phase = 0) {
  for (let i = 0; i < count; i++) {
    const angle = phase + (i / count) * Math.PI * 2;
    particle(dimension, id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y,
      z: center.z + Math.sin(angle) * radius,
    });
  }
}

/** Particles along a segment.
 * @param {Dimension} dimension @param {string} id @param {Vector3} from
 * @param {Vector3} to @param {number} spacing */
export function line(dimension, id, from, to, spacing) {
  const total = distance(from, to);
  const dir = normalize(sub(to, from));
  for (let d = 0; d <= total; d += spacing) {
    particle(dimension, id, add(from, scale(dir, d)));
  }
}

/** @param {Dimension} dimension @param {string} id @param {Vector3} location
 * @param {number} [volume] @param {number} [pitch] */
export function sound(dimension, id, location, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    /* out of bounds / unloaded */
  }
}

// ---------------------------------------------------------------- entities
const PROTECTED_TYPES = new Set([
  "minecraft:player",
  "minecraft:villager_v2",
  "minecraft:villager",
  "minecraft:wandering_trader",
  "minecraft:iron_golem",
  "minecraft:snow_golem",
  "minecraft:allay",
  "minecraft:npc",
]);

/** A real, living mob (not an item, boat, armour stand ...). @param {Entity} entity */
export function isLiving(entity) {
  try {
    return (
      entity.isValid &&
      entity.getComponent("minecraft:health") !== undefined &&
      !entity.matches({ families: ["inanimate"] })
    );
  } catch {
    return false;
  }
}

/** Players, villagers, golems and tamed pets are never hurt by area spells. @param {Entity} entity */
export function isProtected(entity) {
  try {
    return PROTECTED_TYPES.has(entity.typeId) || entity.getComponent("minecraft:is_tamed") !== undefined;
  } catch {
    return true;
  }
}

/**
 * Living mobs around a point (never players).
 * @param {Dimension} dimension
 * @param {Vector3} center
 * @param {number} radius
 * @param {{ hostileOnly?: boolean, includeProtected?: boolean, limit?: number }} [options]
 * @returns {Entity[]}
 */
export function nearbyMobs(dimension, center, radius, options = {}) {
  /** @type {import("@minecraft/server").EntityQueryOptions} */
  const query = {
    location: center,
    maxDistance: radius,
    excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"],
    excludeFamilies: ["inanimate"],
  };
  if (options.hostileOnly) query.families = ["monster"];
  if (options.limit) query.closest = options.limit;
  try {
    return dimension
      .getEntities(query)
      .filter((entity) => isLiving(entity) && (options.includeProtected || !isProtected(entity)));
  } catch {
    return [];
  }
}

/** @param {Entity} entity @param {number} amount @param {Entity} source
 * @param {EntityDamageCause} [cause] */
export function damage(entity, amount, source, cause = EntityDamageCause.magic) {
  try {
    if (entity.isValid) entity.applyDamage(amount, { cause, damagingEntity: source });
  } catch {
    /* entity vanished mid-spell */
  }
}

/** @param {Entity} entity @param {string} name effect id without the "minecraft:" prefix
 * @param {number} ticks @param {number} [amplifier] @param {boolean} [showParticles] */
export function effect(entity, name, ticks, amplifier = 0, showParticles = true) {
  try {
    if (entity.isValid) entity.addEffect(`minecraft:${name}`, ticks, { amplifier, showParticles });
  } catch {
    /* entity vanished or is immune */
  }
}

// ----------------------------------------------------------------- aiming
/**
 * World position of a block ray hit. The API reports the hit relative to the
 * block's corner; older builds reported it in world space, so accept both.
 * @param {BlockRaycastHit} hit
 * @returns {Vector3}
 */
export function hitPoint(hit) {
  const f = hit.faceLocation;
  const inUnitCube = [f.x, f.y, f.z].every((v) => v >= -0.001 && v <= 1.001);
  return inUnitCube ? add(hit.block.location, f) : f;
}

/**
 * What the player is pointing at: the nearest block or living mob in range.
 * @param {Player} player
 * @param {number} maxDistance
 * @param {{ liquids?: boolean }} [options]
 */
export function aimTarget(player, maxDistance, options = {}) {
  const origin = player.getHeadLocation();
  const direction = player.getViewDirection();
  const liquids = options.liquids ?? false;

  const result = {
    origin,
    direction,
    /** true when a block or mob was actually hit */
    hit: false,
    point: add(origin, scale(direction, maxDistance)),
    range: maxDistance,
    /** @type {Entity | undefined} */
    entity: undefined,
    /** @type {BlockRaycastHit | undefined} */
    blockHit: undefined,
  };

  try {
    const blockHit = player.getBlockFromViewDirection({
      maxDistance,
      includeLiquidBlocks: liquids,
      includePassableBlocks: false,
    });
    if (blockHit) {
      result.hit = true;
      result.blockHit = blockHit;
      result.point = hitPoint(blockHit);
      result.range = Math.min(maxDistance, distance(origin, result.point));
    }
  } catch {
    /* looking into unloaded chunks */
  }

  try {
    const hits = player.getEntitiesFromViewDirection({
      maxDistance: result.range,
      includeLiquidBlocks: liquids,
      excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
      excludeFamilies: ["inanimate"],
    });
    let best = result.range;
    for (const entry of hits) {
      if (entry.distance <= best && isLiving(entry.entity)) {
        best = entry.distance;
        result.hit = true;
        result.entity = entry.entity;
        result.blockHit = undefined;
        result.range = entry.distance;
        result.point = centerOf(entry.entity);
      }
    }
  } catch {
    /* looking into unloaded chunks */
  }

  return result;
}

/** @param {Dimension} dimension @param {Vector3} location @returns {Block | undefined} */
export function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch {
    return undefined;
  }
}

/** Highest solid ground under a point, or the point itself when nothing is below.
 * @param {Dimension} dimension @param {Vector3} location @returns {Vector3} */
export function groundBelow(dimension, location) {
  try {
    const hit = dimension.getBlockFromRay(location, { x: 0, y: -1, z: 0 }, { maxDistance: 40, includeLiquidBlocks: true });
    if (hit) return hitPoint(hit);
  } catch {
    /* unloaded */
  }
  return location;
}
