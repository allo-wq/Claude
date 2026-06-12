import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { safe, valid, dist, holdingLight, playSoundAt, particleAt } from "./util.js";

export const BOSS_ID = "veil:noxhollow";
export const WISP_ID = "veil:wisp";
export const EMBER_ID = "veil:soul_ember";

const ANIM = {
  melee: "animation.veil.noxhollow.melee",
  cast: "animation.veil.noxhollow.cast",
  snuff: "animation.veil.noxhollow.snuff",
  roar: "animation.veil.noxhollow.roar",
  hurt: "animation.veil.noxhollow.hurt",
  death: "animation.veil.noxhollow.death"
};

// id -> { boss, engaged, dying, lootDropped, nextSnuff, nextBurst, nextPool, nextMusic, wisps[] }
const bosses = new Map();
// Lingering ground hazards: { dim, loc, until, type: "shadow"|"ember" }
const hazards = [];

function state(boss) {
  let s = bosses.get(boss.id);
  if (!s) {
    s = {
      boss,
      engaged: false,
      dying: false,
      lootDropped: false,
      nextSnuff: 0,
      nextBurst: 0,
      nextPool: 0,
      nextMusic: 0,
      wisps: []
    };
    bosses.set(boss.id, s);
  }
  return s;
}

export function register(entity) {
  if (entity.typeId !== BOSS_ID) return;
  const s = state(entity);
  s.boss = entity;
  safe(() => {
    entity.nameTag = "Noxhollow, the Hollow Lantern";
    // If the world reloaded mid-death, finish the death instead of leaving a
    // frozen invulnerable statue.
    const hp = entity.getComponent("minecraft:health");
    if (hp && hp.currentValue <= 10) startDeath(entity, s);
  });
}

export function onSummoned(boss, playerCount) {
  register(boss);
  if (CONFIG.scaleHealthMultiplayer) {
    if (playerCount >= 3) safe(() => boss.triggerEvent("veil:scale_mp3"));
    else if (playerCount === 2) safe(() => boss.triggerEvent("veil:scale_mp2"));
  }
}

function engage(boss, s) {
  if (s.engaged) return;
  s.engaged = true;
  startMusic(boss, s);
  playSoundAt(boss.dimension, "veil.noxhollow.roar", boss.location, { volume: 2 });
  safe(() => boss.playAnimation(ANIM.roar, { blendOutTime: 0.3 }));
}

function startMusic(boss, s) {
  // playSound has no native loop from script, so re-arm every ~93s while engaged.
  s.nextMusic = system.currentTick + 1860;
  for (const p of boss.dimension.getPlayers({ location: boss.location, maxDistance: 48 })) {
    safe(() => p.playSound("veil.music.boss", { volume: 0.6 }));
  }
}

function stopMusic(boss) {
  safe(() => boss.dimension.runCommand("stopsound @a veil.music.boss"));
}

export function onBossHurt(ev) {
  const boss = ev.hurtEntity;
  if (boss.typeId !== BOSS_ID || !valid(boss)) return;
  const s = state(boss);
  engage(boss, s);
  if (s.dying) return;

  const hp = boss.getComponent("minecraft:health");
  if (!hp) return;

  // Intercept the kill so the death can be a scene, not a poof.
  if (hp.currentValue <= 10) {
    startDeath(boss, s);
    return;
  }

  const ratio = hp.currentValue / hp.effectiveMax;
  const phase = safe(() => boss.getProperty("veil:phase")) ?? 1;
  if (phase < 2 && ratio <= 0.66) toPhase2(boss, s);
  else if (phase < 3 && ratio <= 0.33) toPhase3(boss, s);
  else if (Math.random() < 0.35) {
    safe(() => boss.playAnimation(ANIM.hurt, { blendOutTime: 0.2 }));
    playSoundAt(boss.dimension, "veil.noxhollow.hurt", boss.location, { volume: 1.2 });
  }
}

// Behavior-pack attacks don't play scripted animations, so hook the swing to
// the moment the boss actually lands a melee hit.
export function onBossLandedHit(ev) {
  const attacker = ev.damageSource?.damagingEntity;
  if (!attacker || attacker.typeId !== BOSS_ID) return;
  if (ev.damageSource.cause !== EntityDamageCause.entityAttack) return;
  safe(() => attacker.playAnimation(ANIM.melee, { blendOutTime: 0.2 }));
}

// Likewise, a soul ember appearing means the boss just threw one: play the
// cast animation + throw sound on the nearest boss.
export function onEmberSpawn(entity) {
  if (entity.typeId !== EMBER_ID) return;
  playSoundAt(entity.dimension, "veil.ember.throw", entity.location, { volume: 1.5 });
  const nearBoss = safe(() => entity.dimension.getEntities({
    location: entity.location, maxDistance: 6, type: BOSS_ID
  }))?.[0];
  if (nearBoss) safe(() => nearBoss.playAnimation(ANIM.cast, { blendOutTime: 0.2 }));
}

function toPhase2(boss, s) {
  safe(() => boss.triggerEvent("veil:to_phase2"));
  safe(() => boss.playAnimation(ANIM.roar, { blendOutTime: 0.3 }));
  playSoundAt(boss.dimension, "veil.noxhollow.roar", boss.location, { volume: 2, pitch: 0.85 });
  safe(() => boss.runCommand("camerashake add @a[r=24] 0.25 0.6 positional"));
  announce(boss, "§8Noxhollow begins to drink the light...");
  summonWisps(boss, s);
  // First Snuffing comes quickly so the phase identity lands immediately.
  s.nextSnuff = system.currentTick + 60;
  s.nextPool = system.currentTick + 80;
}

function toPhase3(boss, s) {
  safe(() => boss.triggerEvent("veil:to_phase3"));
  safe(() => boss.playAnimation(ANIM.roar, { blendOutTime: 0.3 }));
  playSoundAt(boss.dimension, "veil.noxhollow.roar", boss.location, { volume: 2, pitch: 0.7 });
  safe(() => boss.runCommand("camerashake add @a[r=24] 0.35 0.7 positional"));
  particleAt(boss.dimension, "veil:soul_mote", headPos(boss));
  announce(boss, "§bThe lantern flares — HOLLOW RAGE!");
  s.nextBurst = system.currentTick + 100;
}

function summonWisps(boss, s) {
  for (let i = 0; i < CONFIG.wispCount; i++) {
    const a = (i / CONFIG.wispCount) * Math.PI * 2;
    const loc = {
      x: boss.location.x + Math.cos(a) * 3,
      y: boss.location.y + 1.5,
      z: boss.location.z + Math.sin(a) * 3
    };
    const w = safe(() => boss.dimension.spawnEntity(WISP_ID, loc));
    if (w) {
      s.wisps.push(w);
      particleAt(boss.dimension, "veil:soul_mote", loc);
    }
  }
  playSoundAt(boss.dimension, "veil.wisp.ambient", boss.location, { volume: 1.5 });
}

function headPos(boss) {
  return { x: boss.location.x, y: boss.location.y + 3.4, z: boss.location.z };
}

function announce(boss, msg) {
  for (const p of boss.dimension.getPlayers({ location: boss.location, maxDistance: 40 })) {
    safe(() => p.onScreenDisplay.setActionBar(msg));
  }
}

// ---------------------------------------------------------------- The Snuffing
function doSnuff(boss, s) {
  s.nextSnuff = system.currentTick + CONFIG.snuffCooldownTicks;
  safe(() => boss.playAnimation(ANIM.snuff, { blendOutTime: 0.3 }));
  playSoundAt(boss.dimension, "veil.snuff.charge", headPos(boss), { volume: 2, pitch: 0.8 });
  announce(boss, "§7Noxhollow raises its lantern...");

  // 0.8s wind-up tell, then the lights die.
  system.runTimeout(() => {
    if (!valid(boss) || s.dying) return;
    const dim = boss.dimension;
    playSoundAt(dim, "veil.snuff.blast", headPos(boss), { volume: 3, pitch: 0.6 });
    particleAt(dim, "veil:snuff_burst", headPos(boss));
    safe(() => boss.runCommand("camerashake add @a[r=24] 0.3 0.5 positional"));
    gutterNearbyLights(boss);

    for (const p of dim.getPlayers({ location: boss.location, maxDistance: 24 })) {
      const lit = holdingLight(p);
      safe(() => p.addEffect("minecraft:darkness", lit ? 50 : 100, { showParticles: false }));
      safe(() => p.runCommand("fog @s push veil:hollow_fog veil_snuff"));
      safe(() => p.onScreenDisplay.setActionBar(
        lit ? "§bYour light holds against the Snuffing." : "§8The Snuffing devours your light!"
      ));
      if (!lit) safe(() => p.applyDamage(Math.round(6 * CONFIG.difficulty), { cause: EntityDamageCause.magic }));
      system.runTimeout(() => safe(() => p.runCommand("fog @s remove veil_snuff")), 90);
    }
  }, 16);
}

// Visually gutter placed torches/lanterns near the boss (no blocks are harmed).
function gutterNearbyLights(boss) {
  const dim = boss.dimension;
  const c = boss.location;
  let shown = 0;
  for (let dx = -6; dx <= 6 && shown < 14; dx += 2) {
    for (let dz = -6; dz <= 6 && shown < 14; dz += 2) {
      for (let dy = -2; dy <= 3 && shown < 14; dy++) {
        const b = safe(() => dim.getBlock({ x: c.x + dx, y: c.y + dy, z: c.z + dz }));
        if (!b) continue;
        const t = b.typeId;
        if (t.includes("torch") || t.includes("lantern") || t === "minecraft:glowstone" || t === "minecraft:campfire") {
          const loc = { x: b.x + 0.5, y: b.y + 0.6, z: b.z + 0.5 };
          particleAt(dim, "veil:snuff_burst", loc);
          playSoundAt(dim, "veil.roadster.brake", loc, { volume: 0.6, pitch: 1.4 });
          shown++;
        }
      }
    }
  }
}

// ------------------------------------------------------------------- Soulburst
function doSoulburst(boss, s) {
  s.nextBurst = system.currentTick + CONFIG.soulburstCooldownTicks;
  safe(() => boss.playAnimation(ANIM.cast, { blendOutTime: 0.3 }));
  playSoundAt(boss.dimension, "veil.soulburst.warn", headPos(boss), { volume: 3, pitch: 0.7 });
  announce(boss, "§bSOULBURST — break line of sight or get clear!");

  // Telegraph: a cyan ring sweeps outward over 2.5s before detonation.
  for (let i = 1; i <= 5; i++) {
    system.runTimeout(() => {
      if (valid(boss) && !s.dying) spawnRing(boss, i * 2.8);
    }, i * 10);
  }

  system.runTimeout(() => {
    if (!valid(boss) || s.dying) return;
    const dim = boss.dimension;
    playSoundAt(dim, "veil.soulburst.blast", boss.location, { volume: 4, pitch: 0.9 });
    safe(() => boss.runCommand("camerashake add @a[r=20] 0.45 0.6 positional"));
    spawnRing(boss, 14);
    const origin = headPos(boss);
    for (const p of dim.getPlayers({ location: boss.location, maxDistance: 14 })) {
      if (hasCover(dim, origin, p)) {
        safe(() => p.onScreenDisplay.setActionBar("§aYou ducked behind cover!"));
        continue;
      }
      safe(() => p.applyDamage(Math.round(14 * CONFIG.difficulty), { cause: EntityDamageCause.magic }));
      const away = { x: p.location.x - boss.location.x, z: p.location.z - boss.location.z };
      const len = Math.max(0.01, Math.sqrt(away.x * away.x + away.z * away.z));
      safe(() => p.applyKnockback({ x: (away.x / len) * 2.2, z: (away.z / len) * 2.2 }, 0.6));
    }
  }, 50);
}

function spawnRing(boss, radius) {
  const dim = boss.dimension;
  const c = boss.location;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    particleAt(dim, "veil:soul_mote", {
      x: c.x + Math.cos(a) * radius,
      y: c.y + 0.4,
      z: c.z + Math.sin(a) * radius
    });
  }
}

// A solid block between the lantern and the player's chest = safe.
function hasCover(dim, origin, player) {
  const target = { x: player.location.x, y: player.location.y + 1, z: player.location.z };
  const d = dist(origin, target);
  if (d < 0.5) return false;
  const dir = { x: (target.x - origin.x) / d, y: (target.y - origin.y) / d, z: (target.z - origin.z) / d };
  const hit = safe(() => dim.getBlockFromRay(origin, dir, { maxDistance: d, includeLiquidBlocks: false, includePassableBlocks: false }));
  return hit !== undefined && hit !== null;
}

// ---------------------------------------------------------------- Shadow pools
function spawnShadowPool(boss, s) {
  s.nextPool = system.currentTick + CONFIG.shadowPoolIntervalTicks;
  const players = boss.dimension.getPlayers({ location: boss.location, maxDistance: 24 });
  if (players.length === 0) return;
  const target = players[Math.floor(Math.random() * players.length)];
  const px = target.location.x + (Math.random() * 10 - 5);
  const pz = target.location.z + (Math.random() * 10 - 5);
  // Snap the pool to the ground below.
  const hit = safe(() => boss.dimension.getBlockFromRay(
    { x: px, y: target.location.y + 3, z: pz }, { x: 0, y: -1, z: 0 }, { maxDistance: 12 }
  ));
  if (!hit) return;
  const loc = { x: hit.block.x + 0.5, y: hit.block.y + 1.05, z: hit.block.z + 0.5 };
  hazards.push({ dim: boss.dimension, loc, until: system.currentTick + 200, type: "shadow" });
  particleAt(boss.dimension, "veil:shadow_pool", loc);
}

export function onEmberHit(ev) {
  if (ev.projectile?.typeId !== EMBER_ID) return;
  const loc = { x: ev.location.x, y: ev.location.y + 0.1, z: ev.location.z };
  hazards.push({ dim: ev.dimension, loc, until: system.currentTick + 60, type: "ember" });
  particleAt(ev.dimension, "veil:ember_flame", loc);
  playSoundAt(ev.dimension, "veil.roadster.brake", loc, { volume: 0.8, pitch: 0.9 });
}

function tickHazards(now) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (h.until <= now) {
      hazards.splice(i, 1);
      continue;
    }
    particleAt(h.dim, h.type === "shadow" ? "veil:shadow_pool" : "veil:ember_flame", h.loc);
    if (now % 20 !== 0) continue; // damage once per second
    for (const p of safe(() => h.dim.getPlayers({ location: h.loc, maxDistance: 1.8 })) ?? []) {
      if (h.type === "shadow") {
        if (holdingLight(p)) continue; // held light wards off the dark
        safe(() => p.applyDamage(Math.round(3 * CONFIG.difficulty), { cause: EntityDamageCause.magic }));
        safe(() => p.addEffect("minecraft:wither", 30, { showParticles: false }));
      } else {
        safe(() => p.applyDamage(Math.round(3 * CONFIG.difficulty), { cause: EntityDamageCause.fire }));
      }
    }
  }
}

// ----------------------------------------------------------------- Death scene
function startDeath(boss, s) {
  if (s.dying) return;
  s.dying = true;
  safe(() => boss.triggerEvent("veil:on_dying")); // invulnerable, rooted
  safe(() => boss.playAnimation(ANIM.death, { blendOutTime: 0 }));
  playSoundAt(boss.dimension, "veil.noxhollow.death", boss.location, { volume: 3 });
  stopMusic(boss);
  announce(boss, "§bThe Hollow Lantern gutters out...");

  // Souls stream out of the ribcage while it buckles.
  for (let i = 1; i <= 5; i++) {
    system.runTimeout(() => {
      if (valid(boss)) particleAt(boss.dimension, "veil:soul_stream", headPos(boss));
    }, i * 12);
  }
  // The lantern shatters near the end of the buckle...
  system.runTimeout(() => {
    if (!valid(boss)) return;
    playSoundAt(boss.dimension, "veil.lantern.shatter", headPos(boss), { volume: 2 });
    safe(() => boss.runCommand("camerashake add @a[r=24] 0.4 0.4 positional"));
  }, 50);
  // ...then loot, XP, and a clean exit.
  system.runTimeout(() => finishDeath(boss, s), 66);
}

function finishDeath(boss, s) {
  if (!valid(boss)) return;
  const dim = boss.dimension;
  const loc = { x: boss.location.x, y: boss.location.y + 0.5, z: boss.location.z };
  dropLoot(dim, loc, s);
  particleAt(dim, "veil:soul_stream", loc);
  for (const w of s.wisps) safe(() => w.remove());
  for (const p of dim.getPlayers({ location: loc, maxDistance: 48 })) {
    safe(() => p.sendMessage("§b§lNoxhollow, the Hollow Lantern §r§7has been broken. The light returns."));
  }
  bosses.delete(boss.id);
  safe(() => boss.remove());
}

function dropLoot(dim, loc, s) {
  if (s.lootDropped) return;
  s.lootDropped = true;
  const drops = [new ItemStack("veil:soulforged_iron", 4 + Math.floor(Math.random() * 5))];
  if (CONFIG.lootEnabled) {
    drops.push(
      new ItemStack("veil:hollow_lantern", 1),
      new ItemStack("veil:soulrend", 1),
      new ItemStack("veil:roadster_key", 1),
      new ItemStack("veil:noxhollow_skull", 1)
    );
  }
  for (const item of drops) safe(() => dim.spawnItem(item, loc));
  // Scripted removal skips minecraft:experience_reward, so grant XP directly
  // to everyone who was in the fight, plus a handful of orbs for the visual.
  safe(() => dim.runCommand(
    `execute positioned ${Math.floor(loc.x)} ${Math.floor(loc.y)} ${Math.floor(loc.z)} run xp 1200 @a[r=48]`
  ));
  for (let i = 0; i < 12; i++) {
    safe(() => dim.spawnEntity("minecraft:xp_orb", {
      x: loc.x + (Math.random() * 2 - 1),
      y: loc.y + 0.5,
      z: loc.z + (Math.random() * 2 - 1)
    }));
  }
}

// Fallback: if one absurd hit skips the <=10 HP window and the boss dies for
// real, vanilla loot/XP fire — we still owe the guaranteed artifacts.
export function onBossDie(ev) {
  const boss = ev.deadEntity;
  if (boss.typeId !== BOSS_ID) return;
  const s = state(boss);
  stopMusic(boss);
  dropLoot(boss.dimension, boss.location, s);
  for (const w of s.wisps) safe(() => w.remove());
  bosses.delete(boss.id);
}

// ------------------------------------------------------------------ Main brain
export function tick() {
  const now = system.currentTick;
  tickHazards(now);

  for (const [id, s] of bosses) {
    const boss = s.boss;
    if (!valid(boss)) {
      bosses.delete(id);
      continue;
    }
    if (s.dying) continue;

    const players = boss.dimension.getPlayers({ location: boss.location, maxDistance: 32 });
    if (players.length > 0) engage(boss, s);
    if (!s.engaged) continue;

    if (now >= s.nextMusic) startMusic(boss, s);

    const phase = safe(() => boss.getProperty("veil:phase")) ?? 1;
    if (phase >= 2 && now >= s.nextSnuff) doSnuff(boss, s);
    if (phase >= 2 && now >= s.nextPool) spawnShadowPool(boss, s);
    if (phase >= 3 && now >= s.nextBurst) doSoulburst(boss, s);

    // Idle soul motes drifting off the lantern keep it alive on screen.
    if (now % 30 === 0) particleAt(boss.dimension, "veil:soul_mote", headPos(boss));
  }
}
