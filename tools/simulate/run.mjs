// Casts every spell of every staff against a small fake world and checks the
// results. Catches runtime errors and logic slips without launching Minecraft:
//
//   node --import ./tools/simulate/register.mjs tools/simulate/run.mjs [--verbose]
//
// It cannot judge how spells look or feel in game - only that the scripts run
// and do what they are meant to.
import * as mc from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const VERBOSE = process.argv.includes("--verbose");

const warnings = [];
console.warn = (...a) => warnings.push(a.join(" "));

await import("../../behavior_pack/scripts/main.js"); // early execution: must not touch the world
mc.__endEarlyExecution();
const { STAFF_LIST } = await import("../../behavior_pack/scripts/staffs.js");
const { getState } = await import("../../behavior_pack/scripts/state.js");

const dim = new mc.Dimension();
const player = new mc.Player(dim, { x: 0.5, y: 64, z: 0.5 });
mc.__players.push(player);
const spawn = () => {
  for (const e of dim.entities.filter((e) => e !== player)) e.isValid = false;
  dim.entities = [player];
  return {
    zombie: new mc.Entity(dim, "minecraft:zombie", { x: 0.5, y: 64, z: 8.5 }, { families: ["zombie", "undead", "monster", "mob"] }),
    skeleton: new mc.Entity(dim, "minecraft:skeleton", { x: -3.5, y: 64, z: 6.5 }, { families: ["skeleton", "monster", "mob"] }),
    cow: new mc.Entity(dim, "minecraft:cow", { x: 2.5, y: 64, z: 5.5 }, { families: ["cow", "mob"] }),
    wolf: new mc.Entity(dim, "minecraft:wolf", { x: -1.5, y: 64, z: 4.5 }, { families: ["wolf", "mob"], tamed: true }),
    villager: new mc.Entity(dim, "minecraft:villager_v2", { x: 1.5, y: 64, z: 3.5 }, { families: ["villager", "mob"] }),
    item: new mc.Entity(dim, "minecraft:item", { x: 1.5, y: 64, z: 7.5 }, { health: null }),
    stand: new mc.Entity(dim, "minecraft:armor_stand", { x: -0.5, y: 64, z: 3.5 }, { families: ["armor_stand", "inanimate", "mob"] }),
  };
};
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const VIEWS = {
  "at zombie": norm({ x: 0, y: -0.09, z: 1 }),
  "at ground": norm({ x: 0.3, y: -0.5, z: 1 }),
  "at sky": norm({ x: 0, y: 1, z: 0.05 }),
  "straight up": { x: 0, y: 1, z: 0 },
  "straight down": { x: 0, y: -1, z: 0 },
  "at water": norm({ x: 25, y: -1.62, z: 0.01 }),
  "at lava": norm({ x: -25, y: -1.62, z: 0.01 }),
  "at far wall": norm({ x: 0.9, y: 0.05, z: 1 }),
};
let failures = 0;
let casts = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const summary = (before) => {
  const out = [];
  for (const [k, v] of mc.log.calls) { const d = v - (before.get(k) ?? 0); if (d > 0 && !k.startsWith("particle:") && !k.startsWith("sound:")) out.push(`${k}x${d}`); }
  let particles = 0, sounds = 0;
  for (const [k, v] of mc.log.calls) { const d = v - (before.get(k) ?? 0); if (k.startsWith("particle:")) particles += d; if (k.startsWith("sound:")) sounds += d; }
  return `${out.join(" ")} | particles=${particles} sounds=${sounds}`;
};

function cast(staff, sneak, viewName, opts = {}) {
  const mobs = spawn();
  dim.blocks.clear();
  player.location = { x: 0.5, y: 64, z: 0.5 };
  player.view = VIEWS[viewName]; player.isSneaking = sneak; player.held = new mc.ItemStack(staff.id);
  player.gameMode = opts.creative ? mc.GameMode.Creative : mc.GameMode.Survival;
  const state = getState(player); state.mana = opts.mana ?? 100; state.readyAt.clear();
  dim.failEffects = !!opts.unloaded; mc.log.failEffects = !!opts.immune;
  const before = new Map(mc.log.calls); const warnBefore = warnings.length;
  const spell = sneak ? staff.secondary : staff.primary;
  let error;
  try {
    mc.world.afterEvents.itemUse.emit({ source: player, itemStack: player.held });
    mc.__tick(260);
  } catch (e) { error = e; }
  const tag = `${spell.name.padEnd(17)} ${viewName.padEnd(13)}${opts.unloaded ? " [unloaded]" : ""}${opts.immune ? " [immune]" : ""}`;
  casts++;
  if (VERBOSE) console.log(`${tag} | ${summary(before)}`);
  if (error) fail(`threw: ${error.stack.split("\n").slice(0, 3).join(" / ")}`);
  if (warnings.length > warnBefore) fail(`warned: ${warnings.slice(warnBefore).join("; ")}`);
  if (mc.__pendingTasks() !== 1) fail(`leaked scheduled tasks: ${mc.__pendingTasks() - 1}`);
  dim.failEffects = false; mc.log.failEffects = false;
  return { mobs, state };
}

console.log("== every spell, every aim ==");
for (const staff of STAFF_LIST) {
  if (VERBOSE) console.log(`-- ${staff.name}`);
  for (const sneak of [false, true]) for (const view of Object.keys(VIEWS)) cast(staff, sneak, view);
  for (const sneak of [false, true]) { cast(staff, sneak, "at zombie", { unloaded: true }); cast(staff, sneak, "at zombie", { immune: true }); }
}

console.log(`  ${casts} casts across ${STAFF_LIST.length} staffs, ${Object.keys(VIEWS).length} aims, plus unloaded-chunk and effect-immune runs`);
console.log("\n== targeted expectations ==");
const S = Object.fromEntries(STAFF_LIST.map((s) => [s.id.split(":")[1], s]));
const expect = (cond, msg) => { if (!cond) fail(msg); else console.log("  ok   " + msg); };
{
  const { mobs } = cast(S.storm_staff, false, "at zombie");
  expect(mobs.zombie.health.currentValue === 14, "lightning strike damages the aimed zombie (6)");
  expect(mobs.villager.health.currentValue === 20 && mobs.cow.health.currentValue === 20, "…and nobody else");
}
{
  const { mobs } = cast(S.storm_staff, true, "at sky");
  expect(mobs.zombie.health.currentValue === 12 && mobs.skeleton.health.currentValue === 12, "thunderstorm hits both monsters (8)");
  expect(mobs.cow.health.currentValue === 20 && mobs.wolf.health.currentValue === 20 && mobs.villager.health.currentValue === 20, "thunderstorm spares cow, pet and villager");
}
{
  const { mobs } = cast(S.inferno_staff, true, "at sky");
  expect(mobs.cow.health.currentValue === 10, "flame nova burns the cow in range once (10)");
  expect(mobs.wolf.health.currentValue === 20 && mobs.villager.health.currentValue === 20, "flame nova spares tamed wolf and villager");
  expect(mobs.skeleton.health.currentValue === 10, "flame nova burns the skeleton at ~7.2 blocks exactly once");
}
{
  const { mobs } = cast(S.frost_staff, true, "at sky");
  expect(mobs.cow.health.currentValue === 20 - 18, "blizzard pulses 6x3 damage on mobs in range");
  expect(mobs.villager.health.currentValue === 20, "blizzard spares villager");
}
{
  const before = mc.log.calls.get("setType:minecraft:frosted_ice") ?? 0;
  cast(S.frost_staff, false, "at water");
  expect((mc.log.calls.get("setType:minecraft:frosted_ice") ?? 0) - before >= 15, "frost ray freezes a disc of water");
  const lavaBefore = (mc.log.calls.get("setType:minecraft:obsidian") ?? 0);
  cast(S.frost_staff, false, "at lava");
  expect((mc.log.calls.get("setType:minecraft:obsidian") ?? 0) > lavaBefore, "frost ray hardens lava sources to obsidian");
}
{
  cast(S.void_staff, false, "at far wall");
  expect(Math.hypot(player.location.x - 0.5, player.location.z - 0.5) > 20, `blink moved the player far (${player.location.x.toFixed(1)}, ${player.location.y}, ${player.location.z.toFixed(1)})`);
  expect(dim.getBlock(player.location).isAir && dim.getBlock({ ...player.location, y: player.location.y + 1 }).isAir, "…into free space");
  cast(S.void_staff, false, "at ground");
  expect(player.location.y === 64, `blink onto the ground lands on top of it (y=${player.location.y})`);
  cast(S.void_staff, false, "straight down");
  expect(player.location.y === 64, "blink straight down stays on the ground");
}
{
  const explosionsBefore = mc.log.calls.get("explosion") ?? 0;
  const { mobs } = cast(S.void_staff, true, "at zombie");
  expect(mobs.zombie.health.currentValue === 6, "singularity collapse damages the zombie at its core (14)");
  expect((mc.log.calls.get("impulse->minecraft:item") ?? 0) > 0, "singularity drags dropped items in");
  expect((mc.log.calls.get("impulse->minecraft:armor_stand") ?? 0) === 0, "…but not armour stands");
  expect(mobs.villager.health.currentValue === 20 && mobs.wolf.health.currentValue === 20, "singularity leaves villager and pet unharmed");
  expect((mc.log.calls.get("explosion") ?? 0) === explosionsBefore, "singularity uses no real explosion");
}
{
  const kb = mc.log.calls.get("knockback->minecraft:zombie") ?? 0;
  const { mobs } = cast(S.gale_staff, false, "at zombie");
  expect((mc.log.calls.get("knockback->minecraft:zombie") ?? 0) === kb + 1, "gust knocks back the zombie in front");
  expect(mobs.villager.health.currentValue === 20 && mobs.wolf.health.currentValue === 20 && mobs.zombie.health.currentValue === 18, "gust shoves villager and pet without hurting them");
  const pk = mc.log.calls.get("knockback->minecraft:player") ?? 0;
  cast(S.gale_staff, true, "at sky");
  expect((mc.log.calls.get("knockback->minecraft:player") ?? 0) === pk + 1, "sky leap launches the player");
}
{
  player.health.currentValue = 5;
  cast(S.verdant_staff, false, "at sky");
  expect(player.health.currentValue === 13, "mend heals 8");
  player.health.currentValue = 19; cast(S.verdant_staff, false, "at sky");
  expect(player.health.currentValue === 20, "mend never overheals");
  cast(S.verdant_staff, true, "at sky");
  expect(dim.cell(3, 64, 3).states.growth === 7, "overgrowth ripens wheat");
  expect(dim.cell(-2, 64, 3).states.age === 3, "overgrowth ripens nether wart");
  const { mobs } = cast(S.verdant_staff, true, "at sky");
  expect(mobs.cow.health.currentValue === 20, "overgrowth harms nothing");
}

console.log("\n== mana, cooldown, creative ==");
{
  const boltsBefore = mc.log.calls.get("spawnEntity:minecraft:lightning_bolt") ?? 0;
  const { state } = cast(S.storm_staff, true, "at sky", { mana: 30 });
  expect(Math.round(state.mana) === 95 && player.actionBar.includes("Storm Staff") && (mc.log.calls.get("spawnEntity:minecraft:lightning_bolt") ?? 0) === boltsBefore, "too little mana: nothing cast, mana only regenerates (30 → 95), HUD still shown");
  const d0 = mc.log.calls.get("spawnEntity:minecraft:lightning_bolt") ?? 0;
  spawn(); player.view = VIEWS["at zombie"]; player.isSneaking = false; player.held = new mc.ItemStack(S.storm_staff.id);
  const st = getState(player); st.mana = 100; st.readyAt.clear();
  for (let i = 0; i < 5; i++) { mc.world.afterEvents.itemUse.emit({ source: player, itemStack: player.held }); mc.__tick(2); }
  expect((mc.log.calls.get("spawnEntity:minecraft:lightning_bolt") ?? 0) === d0 + 1, "5 rapid taps inside the cooldown cast once");
  expect(st.mana >= 82 && st.mana <= 83, `mana went 100 → ${st.mana} (20 spent, ~2.5 regenerated)`);
  mc.__tick(300);
  const c = cast(S.void_staff, true, "at zombie", { creative: true, mana: 0 });
  expect(c.mobs.zombie.health.currentValue === 6, "creative casts with 0 mana");
  mc.__tick(40);
  if (VERBOSE) console.log("  HUD: " + JSON.stringify(player.actionBar));
}

console.log("\n== codex, welcome, sentinel, ore, commands ==");
{
  player.held = new mc.ItemStack("relics:codex");
  ui.answers.push(2, 0, 6, 1);
  mc.world.afterEvents.itemUse.emit({ source: player, itemStack: player.held });
  await new Promise((r) => setTimeout(r, 20));
  expect(ui.shown.length === 4, `codex flow: menu → staff page → back → menu → world page (${ui.shown.length} forms)`);
  if (VERBOSE) {
    console.log("  menu buttons: " + ui.shown[0].buttons.map((b) => b.text).join(" | "));
    console.log("  --- page: " + ui.shown[1]._title + "\n    " + ui.shown[1]._body.split("\n").join("\n    "));
  }
  expect(ui.shown[3]._title === "The World", "last button opens the world page");

  mc.world.afterEvents.playerSpawn.emit({ player, initialSpawn: true });
  mc.world.afterEvents.playerSpawn.emit({ player, initialSpawn: true });
  expect(player.inventory.filter((i) => i === "relics:codex").length === 1 && player.messages.length === 1, "welcome gives exactly one codex, once");

  const sentinel = new mc.Entity(dim, "relics:crystal_sentinel", { x: 3, y: 64, z: 3 }, { families: ["monster"] });
  const fx = mc.log.calls.get("effect:minecraft:slowness") ?? 0;
  mc.world.afterEvents.entityHurt.emit({ hurtEntity: player, damageSource: { damagingEntity: sentinel }, damage: 7 });
  expect((mc.log.calls.get("effect:minecraft:slowness") ?? 0) === fx + 1, "sentinel hit slows the player");
  mc.world.afterEvents.entityHurt.emit({ hurtEntity: player, damageSource: {}, damage: 1 });
  getState(player).mana = 10;
  mc.world.afterEvents.entityDie.emit({ deadEntity: sentinel, damageSource: { damagingEntity: player } });
  expect(getState(player).mana === 50, "killing a sentinel restores 40 mana");
  mc.world.afterEvents.entityDie.emit({ deadEntity: sentinel, damageSource: {} });

  const orbs = mc.log.calls.get("spawnEntity:minecraft:xp_orb") ?? 0;
  const ev = { player, dimension: dim, block: dim.getBlock({ x: 5, y: 20, z: 5 }), brokenBlockPermutation: { type: { id: "relics:arcane_ore" } } };
  player.gameMode = mc.GameMode.Survival; mc.world.afterEvents.playerBreakBlock.emit(ev);
  player.gameMode = mc.GameMode.Creative; mc.world.afterEvents.playerBreakBlock.emit(ev);
  expect((mc.log.calls.get("spawnEntity:minecraft:xp_orb") ?? 0) === orbs + 3, "ore drops 3 xp orbs in survival, none in creative");

  player.inventory.length = 0;
  mc.system.afterEvents.scriptEventReceive.emit({ id: "relics:kit", sourceEntity: player, message: "" });
  expect(player.inventory.length === 8, `kit gives 6 staffs + codex + shards (${player.inventory.join(", ")})`);
  mc.system.afterEvents.scriptEventReceive.emit({ id: "relics:mana", sourceEntity: player, message: "" });
  expect(getState(player).mana === 100, "mana command refills");
  mc.world.afterEvents.playerLeave.emit({ playerId: player.id });
}
if (VERBOSE) console.log(`\nparticle ids used: ${[...mc.log.calls.keys()].filter((k) => k.startsWith("particle:")).map((k) => k.slice(19)).join(", ")}`);
if (VERBOSE) console.log(`sound ids used: ${[...mc.log.calls.keys()].filter((k) => k.startsWith("sound:") || k.startsWith("playerSound:")).map((k) => k.split(":").slice(1).join(":")).join(", ")}`);
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " FAILURE(S)"}; warnings=${warnings.length}`);
process.exit(failures ? 1 : 0);
