import { EquipmentSlot } from "@minecraft/server";

// Swallow errors from entities that died/unloaded between ticks — every
// Script API handle can go stale at any time, so all side effects route
// through this.
export function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function valid(entity) {
  try {
    return entity !== undefined && entity.isValid();
  } catch {
    return false;
  }
}

export function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Unit vector on the XZ plane for a Bedrock yaw (0 = +Z, increases clockwise).
export function forwardFromYaw(yawDeg) {
  const r = (yawDeg * Math.PI) / 180;
  return { x: -Math.sin(r), y: 0, z: Math.cos(r) };
}

const LIGHT_ITEMS = new Set([
  "minecraft:torch",
  "minecraft:soul_torch",
  "minecraft:lantern",
  "minecraft:soul_lantern",
  "minecraft:glowstone",
  "minecraft:shroomlight",
  "minecraft:sea_lantern",
  "veil:hollow_lantern"
]);

// Players holding a light source in either hand weather The Snuffing better.
export function holdingLight(player) {
  return safe(() => {
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) return false;
    const main = eq.getEquipment(EquipmentSlot.Mainhand);
    const off = eq.getEquipment(EquipmentSlot.Offhand);
    return (main && LIGHT_ITEMS.has(main.typeId)) || (off && LIGHT_ITEMS.has(off.typeId));
  }) === true;
}

export function playSoundAt(dimension, soundId, location, options) {
  safe(() => dimension.playSound(soundId, location, options));
}

export function particleAt(dimension, id, location) {
  safe(() => dimension.spawnParticle(id, location));
}

export function mainhand(player) {
  return safe(() => player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand));
}
