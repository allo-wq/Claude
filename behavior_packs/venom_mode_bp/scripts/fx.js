// Particles, sounds and screen effects. Everything here is cosmetic, so each
// call swallows its own errors (for example a location in an unloaded chunk).

/**
 * @typedef {import('@minecraft/server').Vector3} Vector3
 * @typedef {import('@minecraft/server').Dimension} Dimension
 * @typedef {import('@minecraft/server').Player} Player
 */

/**
 * @param {Dimension} dimension
 * @param {string} id
 * @param {Vector3} location
 */
export function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    // out of the loaded world
  }
}

/**
 * @param {Dimension} dimension
 * @param {string} id
 * @param {Vector3} location
 */
export function sound(dimension, id, location, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // out of the loaded world
  }
}

/**
 * A row of particles from one point to another: this is how a tendril is drawn.
 * @param {Dimension} dimension
 * @param {string} id
 * @param {Vector3} from
 * @param {Vector3} to
 */
export function line(dimension, id, from, to, spacing = 0.35, limit = 90) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const steps = Math.min(limit, Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / spacing)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    particle(dimension, id, { x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t });
  }
}

/**
 * Particles in a flat circle around a point.
 * @param {Dimension} dimension
 * @param {string} id
 * @param {Vector3} center
 * @param {number} radius
 * @param {number} count
 */
export function ring(dimension, id, center, radius, count) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    particle(dimension, id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y,
      z: center.z + Math.sin(angle) * radius,
    });
  }
}

/**
 * Bursts of goo up the height of a player, used when a bond forms or breaks.
 * @param {Player} player
 * @param {string} id
 */
export function engulf(player, id) {
  const { x, y, z } = player.location;
  for (const height of [0.3, 1, 1.7]) particle(player.dimension, id, { x, y: y + height, z });
}

/**
 * @param {Player} player
 * @param {number} intensity  0 to 4
 * @param {number} seconds
 */
export function shake(player, intensity, seconds) {
  try {
    player.runCommand(`camerashake add @s ${intensity.toFixed(2)} ${seconds.toFixed(2)} positional`);
  } catch {
    // the player left
  }
}
