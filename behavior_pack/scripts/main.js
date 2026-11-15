// Elemental Relics - entry point.
// Runs on the stable @minecraft/server 2.x API (Minecraft 1.21.90 and newer).
import { EquipmentSlot, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { openCodex } from "./codex.js";
import { STAFFS, STAFF_LIST } from "./staffs.js";
import { MANA_REGEN, MAX_MANA, flash, forgetPlayer, getState, restoreMana } from "./state.js";
import { burst, effect, sound, up } from "./util.js";

const HUD_INTERVAL = 4; // ticks
const BAR_CELLS = 12;
const FULL = "█";
const SENTINEL = "relics:crystal_sentinel";
const ORE = "relics:arcane_ore";

// ------------------------------------------------------------------ casting
world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const id = event.itemStack?.typeId;
  if (!id) return;
  if (id === "relics:codex") {
    openCodex(player);
    return;
  }
  const staff = STAFFS.get(id);
  if (staff) castStaff(player, staff);
});

/** @param {Player} player @param {import("./staffs.js").Staff} staff */
function castStaff(player, staff) {
  const now = system.currentTick;
  const state = getState(player);
  if (now < (state.readyAt.get(staff.id) ?? 0)) return;

  const spell = player.isSneaking ? staff.secondary : staff.primary;
  const free = player.getGameMode() === GameMode.Creative;

  if (!free && state.mana < spell.mana) {
    state.readyAt.set(staff.id, now + 8);
    flash(player, `§cNot enough mana for ${spell.name} §7(${spell.mana})`);
    player.playSound("note.bass", { volume: 0.6, pitch: 0.6 });
    return;
  }

  /** @type {boolean | string} */
  let outcome;
  try {
    outcome = spell.cast({ player, dimension: player.dimension });
  } catch (error) {
    console.warn(`[Elemental Relics] ${spell.name} failed: ${error}`);
    outcome = "The spell fizzled";
  }

  if (outcome !== true) {
    state.readyAt.set(staff.id, now + 8);
    flash(player, `§c${typeof outcome === "string" ? outcome : "The spell fizzled"}`);
    player.playSound("note.bass", { volume: 0.6, pitch: 0.8 });
    return;
  }

  if (!free) state.mana -= spell.mana;
  state.readyAt.set(staff.id, now + spell.cooldown);
  flash(player, `${staff.color}${spell.name}!`, 24);
  try {
    player.startItemCooldown(staff.cooldownGroup, spell.cooldown);
  } catch {
    /* purely visual */
  }
}

// ---------------------------------------------------------------- mana + HUD
system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      const state = getState(player);
      state.mana = Math.min(MAX_MANA, state.mana + (MANA_REGEN * HUD_INTERVAL) / 20);

      const held = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
      const staff = held ? STAFFS.get(held.typeId) : undefined;
      if (!staff) continue;

      const filled = Math.round((state.mana / MAX_MANA) * BAR_CELLS);
      const bar = `§b${FULL.repeat(filled)}§8${FULL.repeat(BAR_CELLS - filled)}`;
      const hint =
        now < state.flashUntil
          ? state.flashText
          : `§7Use: §f${staff.primary.name} §8${staff.primary.mana}  §7Sneak: §f${staff.secondary.name} §8${staff.secondary.mana}`;
      player.onScreenDisplay.setActionBar(`${staff.color}§l${staff.name}§r ${bar} §f${Math.floor(state.mana)}\n${hint}`);
    } catch {
      /* player is still loading or just left */
    }
  }
}, HUD_INTERVAL);

world.afterEvents.playerLeave.subscribe((event) => forgetPlayer(event.playerId));

// ------------------------------------------------------------------ welcome
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  try {
    if (player.getDynamicProperty("relics:welcomed")) return;
    player.setDynamicProperty("relics:welcomed", true);
    give(player, ["relics:codex"]);
    player.sendMessage(
      "§d§lElemental Relics§r §7is active. A §fRelic Codex§7 was added to your inventory - use it to learn the six staffs. Mine §bArcane Ore§7 underground to craft them.",
    );
  } catch (error) {
    console.warn(`[Elemental Relics] welcome failed: ${error}`);
  }
});

/** @param {Player} player @param {string[]} itemIds */
function give(player, itemIds) {
  const container = player.getComponent("minecraft:inventory")?.container;
  for (const id of itemIds) {
    const stack = new ItemStack(id, 1);
    const leftover = container ? container.addItem(stack) : stack;
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }
}

// -------------------------------------------------------- Crystal Sentinel
world.afterEvents.entityHurt.subscribe(
  (event) => {
    // a Sentinel's blow chills its victim
    const attacker = event.damageSource.damagingEntity;
    if (!attacker || attacker.typeId !== SENTINEL) return;
    effect(event.hurtEntity, "slowness", 60, 1);
    burst(event.hurtEntity.dimension, "minecraft:endrod", up(event.hurtEntity.location, 1), 6, 0.5);
  },
  { entityTypes: ["minecraft:player"] },
);

world.afterEvents.entityDie.subscribe(
  (event) => {
    const sentinel = event.deadEntity;
    const killer = event.damageSource.damagingEntity;
    try {
      const where = up(sentinel.location, 1.2);
      burst(sentinel.dimension, "minecraft:endrod", where, 30, 1.2);
      sound(sentinel.dimension, "random.glass", where, 1, 0.6);
      sound(sentinel.dimension, "random.orb", where, 1, 0.5);
    } catch {
      /* already unloaded */
    }
    if (killer instanceof Player) {
      restoreMana(killer, 40);
      flash(killer, "§b+40 mana §7absorbed from the Sentinel", 40);
    }
  },
  { entityTypes: [SENTINEL] },
);

// --------------------------------------------------------------- Arcane Ore
world.afterEvents.playerBreakBlock.subscribe(
  (event) => {
    if (event.brokenBlockPermutation.type.id !== ORE) return;
    if (event.player.getGameMode() === GameMode.Creative) return;
    const where = { x: event.block.x + 0.5, y: event.block.y + 0.5, z: event.block.z + 0.5 };
    try {
      for (let i = 0; i < 3; i++) event.dimension.spawnEntity("minecraft:xp_orb", where);
    } catch {
      /* unloaded */
    }
    burst(event.dimension, "minecraft:endrod", where, 6, 0.4);
  },
  { blockTypes: [ORE] },
);

// ------------------------------------------------------------ chat commands
//   /scriptevent relics:kit    every staff, some shards and the codex
//   /scriptevent relics:mana   refill your mana
system.afterEvents.scriptEventReceive.subscribe(
  (event) => {
    const player = event.sourceEntity;
    if (!(player instanceof Player)) return;
    if (event.id === "relics:kit") {
      give(player, [...STAFF_LIST.map((staff) => staff.id), "relics:codex"]);
      const shards = new ItemStack("relics:arcane_shard", 16);
      const leftover = player.getComponent("minecraft:inventory")?.container.addItem(shards);
      if (leftover) player.dimension.spawnItem(leftover, player.location);
      player.sendMessage("§dElemental Relics§7: the full kit is yours.");
    } else if (event.id === "relics:mana") {
      restoreMana(player, MAX_MANA);
      player.sendMessage("§dElemental Relics§7: mana refilled.");
    }
  },
  { namespaces: ["relics"] },
);
