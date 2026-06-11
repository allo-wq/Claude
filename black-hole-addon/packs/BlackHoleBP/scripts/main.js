// =====================================================================
// Black Hole add-on — gravity, absorption, growth, collapse
// Target: @minecraft/server 2.0.0 (stable, Minecraft Bedrock 1.21.90+)
// =====================================================================

import {
  world,
  system,
  EntityDamageCause,
  GameMode,
  MolangVariableMap,
} from "@minecraft/server";

const BLACK_HOLE_ID = "bh:black_hole";
const CORE_ITEM_ID = "bh:singularity_core";
const ROD_ITEM_ID = "bh:stabilizer_rod";

const TICK_STEP = 2; // gravity update period (ticks)
const BLOCK_STEP = 6; // block absorption period (ticks)
const FX_STEP = 8; // camera-shake / fog period (ticks)
const LIFETIME_TICKS = 1200; // 60 seconds
const BASE_PULL_RADIUS = 30;
const CORE_RADIUS = 2; // event horizon at size 1.0
const PULL_CONSTANT = 8; // K in F = K * size / d^2
const MAX_SIZE = 4.0;
const MAX_BLOCK_RADIUS = 9;

const DIMENSION_IDS = [
  "minecraft:overworld",
  "minecraft:nether",
  "minecraft:the_end",
];

// Blocks gravity cannot eat.
const INDESTRUCTIBLE = new Set([
  "minecraft:bedrock",
  "minecraft:barrier",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:structure_void",
  "minecraft:jigsaw",
  "minecraft:end_portal",
  "minecraft:end_portal_frame",
  "minecraft:end_gateway",
  "minecraft:portal",
  "minecraft:allow",
  "minecraft:deny",
  "minecraft:border_block",
  "minecraft:light_block",
  "minecraft:reinforced_deepslate",
]);

// Entities the vortex ignores entirely.
const IMMUNE_TYPES = new Set([
  BLACK_HOLE_ID,
  "minecraft:ender_dragon",
  "minecraft:leash_knot",
]);

/**
 * Runtime state per black hole, keyed by entity.id.
 * { age, size, fogPlayers:Set<string>, dimId }
 * `age` is mirrored into the "bh:life" dynamic property so a black hole
 * keeps its remaining lifetime across /reload or chunk reloads.
 */
const holes = new Map();

// ---------------------------------------------------------------------
// Spawning: right-click the Singularity Core
// ---------------------------------------------------------------------

world.afterEvents.itemUse.subscribe((ev) => {
  const { itemStack, source } = ev;
  if (!itemStack || itemStack.typeId !== CORE_ITEM_ID) return;
  if (!source || source.typeId !== "minecraft:player") return;

  const dim = source.dimension;
  const view = source.getViewDirection();
  const head = source.getHeadLocation();
  const spawnLoc = {
    x: head.x + view.x * 8,
    y: Math.max(head.y + view.y * 8, dim.heightRange.min + 4),
    z: head.z + view.z * 8,
  };

  let bh;
  try {
    bh = dim.spawnEntity(BLACK_HOLE_ID, spawnLoc);
  } catch {
    source.sendMessage("§5The singularity refuses to form here.");
    return;
  }

  bh.setDynamicProperty("bh:life", LIFETIME_TICKS);
  bh.setProperty("bh:size", 1.0);
  bh.nameTag = "";

  dim.playSound("bh.collapse", spawnLoc, { volume: 1.5, pitch: 1.6 });
  dim.spawnParticle("bh:shockwave", spawnLoc, new MolangVariableMap());
  source.sendMessage("§5A singularity tears open the world...");

  // Consume one core unless the player is in creative.
  if (source.getGameMode() !== GameMode.Creative) {
    const inv = source.getComponent("minecraft:inventory")?.container;
    if (inv) {
      const slot = inv.getSlot(source.selectedSlotIndex);
      const held = slot.getItem();
      if (held && held.typeId === CORE_ITEM_ID) {
        if (held.amount > 1) {
          held.amount -= 1;
          slot.setItem(held);
        } else {
          slot.setItem(undefined);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------
// Early collapse: whack it with the Stabilizer Rod
// ---------------------------------------------------------------------

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const { damagingEntity, hitEntity } = ev;
  if (hitEntity.typeId !== BLACK_HOLE_ID) return;
  if (damagingEntity.typeId !== "minecraft:player") return;

  const inv = damagingEntity.getComponent("minecraft:inventory")?.container;
  const held = inv?.getItem(damagingEntity.selectedSlotIndex);
  if (!held || held.typeId !== ROD_ITEM_ID) return;

  damagingEntity.sendMessage("§bThe stabilizer rod forces the singularity shut.");
  collapse(hitEntity, /* early */ true);

  // Wear down the rod.
  const durability = held.getComponent("minecraft:durability");
  if (durability) {
    durability.damage += 1;
    if (durability.damage >= durability.maxDurability) {
      inv.setItem(damagingEntity.selectedSlotIndex, undefined);
      damagingEntity.dimension.playSound("random.break", damagingEntity.location);
    } else {
      inv.setItem(damagingEntity.selectedSlotIndex, held);
    }
  }
});

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

system.runInterval(() => {
  const tick = system.currentTick;

  for (const dimId of DIMENSION_IDS) {
    const dim = world.getDimension(dimId);
    let found;
    try {
      found = dim.getEntities({ type: BLACK_HOLE_ID });
    } catch {
      continue;
    }

    for (const bh of found) {
      if (!bh.isValid) continue;
      const state = getState(bh, dimId);

      state.age += TICK_STEP;
      bh.setDynamicProperty("bh:life", LIFETIME_TICKS - state.age);

      if (state.age >= LIFETIME_TICKS) {
        collapse(bh, false);
        continue;
      }

      applyGravity(bh, state);
      if (tick % BLOCK_STEP < TICK_STEP) absorbBlocks(bh, state);
      if (tick % FX_STEP < TICK_STEP) playerProximityFx(bh, state);
      ambientFx(bh, state, tick);
    }
  }

  // Drop state for holes that vanished without a proper collapse
  // (e.g. /kill or unloaded chunks).
  for (const [id, state] of holes) {
    if (!state.seenThisPass) {
      clearPlayerFx(state);
      holes.delete(id);
    } else {
      state.seenThisPass = false;
    }
  }
}, TICK_STEP);

function getState(bh, dimId) {
  let state = holes.get(bh.id);
  if (!state) {
    const life = bh.getDynamicProperty("bh:life");
    state = {
      age: typeof life === "number" ? LIFETIME_TICKS - life : 0,
      size: bh.getProperty("bh:size") ?? 1.0,
      fogPlayers: new Set(),
      dimId,
      seenThisPass: true,
    };
    holes.set(bh.id, state);
  }
  state.seenThisPass = true;
  return state;
}

function pullRadiusOf(size) {
  return Math.min(BASE_PULL_RADIUS + (size - 1) * 10, 60);
}

function grow(bh, state, amount) {
  state.size = Math.min(state.size + amount, MAX_SIZE);
  try {
    bh.setProperty("bh:size", state.size);
  } catch {}
}

// ---------------------------------------------------------------------
// Gravity: inverse-square pull + event-horizon damage
// ---------------------------------------------------------------------

function applyGravity(bh, state) {
  const dim = bh.dimension;
  const center = bh.location;
  const size = state.size;
  const radius = pullRadiusOf(size);
  const horizonSq = (CORE_RADIUS * size) ** 2;

  const victims = dim.getEntities({ location: center, maxDistance: radius });

  for (const e of victims) {
    if (!e.isValid || e.id === bh.id || IMMUNE_TYPES.has(e.typeId)) continue;

    const isPlayer = e.typeId === "minecraft:player";
    if (isPlayer) {
      const gm = e.getGameMode();
      if (gm === GameMode.Creative || gm === GameMode.Spectator) continue;
    }

    const dx = center.x - e.location.x;
    const dy = center.y + size - (e.location.y + 0.5);
    const dz = center.z - e.location.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    // --- Event horizon -------------------------------------------------
    if (distSq <= horizonSq) {
      if (isPlayer || e.getComponent("minecraft:health")) {
        try {
          e.applyDamage(1000, { cause: EntityDamageCause.void });
        } catch {}
        grow(bh, state, 0.06);
      } else {
        // Items, arrows, xp orbs... are simply swallowed.
        try {
          e.remove();
        } catch {}
        grow(bh, state, 0.012);
      }
      continue;
    }

    // --- Inverse-square pull -------------------------------------------
    const force = Math.min((PULL_CONSTANT * size) / Math.max(distSq, 1), 1.4);
    const ix = (dx / dist) * force;
    const iy = (dy / dist) * force;
    const iz = (dz / dist) * force;

    try {
      if (isPlayer) {
        // applyImpulse is not allowed on players — use knockback.
        e.applyKnockback({ x: ix, z: iz }, Math.max(iy, -0.4) + 0.05);
      } else {
        e.applyImpulse({ x: ix, y: iy + 0.02, z: iz });
      }
    } catch {
      try {
        e.applyKnockback({ x: ix, z: iz }, iy);
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------
// Block absorption: expanding radius, debris spirals into the core
// ---------------------------------------------------------------------

function absorbBlocks(bh, state) {
  const dim = bh.dimension;
  const center = bh.location;
  const progress = state.age / LIFETIME_TICKS;
  const radius = Math.min(
    2 + progress * 5 + (state.size - 1) * 1.5,
    MAX_BLOCK_RADIUS
  );

  const samples = 14;
  let eaten = 0;

  for (let i = 0; i < samples; i++) {
    // Random point in a sphere, biased outward so the crater grows as a shell.
    const r = radius * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const loc = {
      x: Math.floor(center.x + r * Math.sin(phi) * Math.cos(theta)),
      y: Math.floor(center.y + size0(state) + r * Math.cos(phi)),
      z: Math.floor(center.z + r * Math.sin(phi) * Math.sin(theta)),
    };

    let block;
    try {
      block = dim.getBlock(loc);
    } catch {
      continue;
    }
    if (!block || block.isAir) continue;
    if (INDESTRUCTIBLE.has(block.typeId)) continue;

    try {
      block.setType("minecraft:air");
    } catch {
      continue;
    }

    eaten++;
    grow(bh, state, 0.004);

    // Debris visually spiraling into the center.
    const vars = new MolangVariableMap();
    const d = Math.sqrt(
      (loc.x + 0.5 - center.x) ** 2 +
        (loc.y + 0.5 - center.y - size0(state)) ** 2 +
        (loc.z + 0.5 - center.z) ** 2
    );
    vars.setFloat("start_radius", Math.max(d, 1.5));
    dim.spawnParticle(
      "bh:block_spiral",
      { x: center.x, y: center.y + size0(state), z: center.z },
      vars
    );
  }

  if (eaten > 0 && Math.random() < 0.3) {
    dim.playSound("bh.distort", center, { volume: 0.6, pitch: 0.8 });
  }
}

function size0(state) {
  // Visual center sits one core-radius above the entity origin.
  return state.size;
}

// ---------------------------------------------------------------------
// Player effects: camera shake, fog, distorted audio
// ---------------------------------------------------------------------

function playerProximityFx(bh, state) {
  const dim = bh.dimension;
  const center = bh.location;
  const fxRange = pullRadiusOf(state.size) + 10;

  for (const player of dim.getPlayers()) {
    const dx = player.location.x - center.x;
    const dy = player.location.y - center.y;
    const dz = player.location.z - center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > fxRange) {
      if (state.fogPlayers.has(player.id)) {
        state.fogPlayers.delete(player.id);
        try {
          player.runCommand("fog @s remove bh_fog");
        } catch {}
      }
      continue;
    }

    const closeness = 1 - dist / fxRange; // 0 far .. 1 at center

    // Screen shake, stronger near the core.
    const shake = Math.min(0.05 + closeness * closeness * 0.6, 0.6);
    try {
      player.runCommand(
        `camerashake add @s ${shake.toFixed(3)} 0.5 rotational`
      );
    } catch {}

    // Darkening fog inside two thirds of the field.
    if (dist < fxRange * 0.66 && !state.fogPlayers.has(player.id)) {
      state.fogPlayers.add(player.id);
      try {
        player.runCommand("fog @s push bh:black_hole_fog bh_fog");
      } catch {}
    } else if (dist >= fxRange * 0.66 && state.fogPlayers.has(player.id)) {
      state.fogPlayers.delete(player.id);
      try {
        player.runCommand("fog @s remove bh_fog");
      } catch {}
    }

    // Distorted drone that intensifies with proximity.
    if (system.currentTick % 24 < FX_STEP) {
      player.playSound("bh.distort", {
        volume: Math.min(0.15 + closeness * 1.4, 1.5),
        pitch: 1.3 - closeness * 0.8,
      });
    }
  }
}

function clearPlayerFx(state) {
  const dim = world.getDimension(state.dimId);
  for (const player of dim.getPlayers()) {
    if (state.fogPlayers.has(player.id)) {
      try {
        player.runCommand("fog @s remove bh_fog");
        player.runCommand("camerashake stop @s");
      } catch {}
    }
  }
  state.fogPlayers.clear();
}

// ---------------------------------------------------------------------
// Ambient visuals + hum loop
// ---------------------------------------------------------------------

function ambientFx(bh, state, tick) {
  const dim = bh.dimension;
  const c = {
    x: bh.location.x,
    y: bh.location.y + size0(state),
    z: bh.location.z,
  };

  const vars = new MolangVariableMap();
  vars.setFloat("bh_size", state.size);

  // Swirling vortex + light-bending rings, every gravity step.
  dim.spawnParticle("bh:vortex", c, vars);
  if (tick % 4 < TICK_STEP) {
    dim.spawnParticle("bh:event_ring", c, vars);
  }
  if (tick % 10 < TICK_STEP) {
    dim.spawnParticle("bh:aura", c, vars);
  }

  // Deep hum loop (the clip is 3 s; retrigger just before it ends).
  if (tick % 56 < TICK_STEP) {
    dim.playSound("bh.hum", c, { volume: 2.0, pitch: 1.0 - (state.size - 1) * 0.1 });
  }
}

// ---------------------------------------------------------------------
// Collapse: shockwave explosion (natural) or clean implosion (stabilized)
// ---------------------------------------------------------------------

function collapse(bh, early) {
  if (!bh.isValid) return;
  const dim = bh.dimension;
  const state = holes.get(bh.id);
  const size = state?.size ?? bh.getProperty("bh:size") ?? 1.0;
  const center = {
    x: bh.location.x,
    y: bh.location.y + size,
    z: bh.location.z,
  };

  if (state) {
    clearPlayerFx(state);
    holes.delete(bh.id);
  }

  try {
    bh.remove();
  } catch {}

  const vars = new MolangVariableMap();
  vars.setFloat("bh_size", size);
  dim.spawnParticle("bh:shockwave", center, vars);
  dim.playSound("bh.collapse", center, { volume: 3.0, pitch: early ? 1.4 : 0.9 });

  if (!early) {
    try {
      dim.createExplosion(center, 4 + size * 2, {
        breaksBlocks: true,
        causesFire: false,
      });
    } catch {}
  }

  // Radial shockwave knockback.
  const blastRange = early ? 8 : 24;
  for (const e of dim.getEntities({ location: center, maxDistance: blastRange })) {
    if (!e.isValid || e.typeId === BLACK_HOLE_ID) continue;
    const dx = e.location.x - center.x;
    const dy = e.location.y - center.y;
    const dz = e.location.z - center.z;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.5);
    const power = (early ? 0.6 : 1.8) * (1 - dist / blastRange) + 0.2;

    try {
      if (e.typeId === "minecraft:player") {
        e.applyKnockback(
          { x: (dx / dist) * power, z: (dz / dist) * power },
          power * 0.5
        );
      } else {
        e.applyImpulse({
          x: (dx / dist) * power,
          y: power * 0.4,
          z: (dz / dist) * power,
        });
      }
    } catch {}
  }
}
