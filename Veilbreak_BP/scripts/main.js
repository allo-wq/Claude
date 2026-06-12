// Veilbreak — Noxhollow, the Hollow Lantern
// Entry point: wires world events to the boss, ritual, Soulrend, lantern, and
// Hollow Roadster modules. Stable @minecraft/server 1.16.0 — no Beta APIs.
import { world, system } from "@minecraft/server";
import { safe, valid, mainhand, playSoundAt, particleAt } from "./util.js";
import * as boss from "./boss.js";
import * as soulrend from "./soulrend.js";
import * as car from "./car.js";
import { onWickUse } from "./ritual.js";

// ------------------------------------------------------------------- combat
world.afterEvents.entityHurt.subscribe((ev) => {
  safe(() => boss.onBossHurt(ev));
  safe(() => boss.onBossLandedHit(ev));
  safe(() => soulrend.onHit(ev));
});

world.afterEvents.entityDie.subscribe((ev) => {
  safe(() => boss.onBossDie(ev));
  safe(() => soulrend.onKill(ev));
});

world.afterEvents.projectileHitBlock.subscribe((ev) => {
  safe(() => boss.onEmberHit(ev));
});

// ------------------------------------------------------------------- items
world.afterEvents.itemUse.subscribe((ev) => {
  switch (ev.itemStack?.typeId) {
    case "veil:wick_of_souls":
      safe(() => onWickUse(ev));
      break;
    case "veil:roadster_key":
      safe(() => car.onKeyUse(ev));
      break;
  }
});

// ------------------------------------------- entity tracking (incl. reloads)
world.afterEvents.entitySpawn.subscribe((ev) => {
  safe(() => boss.register(ev.entity));
  safe(() => boss.onEmberSpawn(ev.entity));
  safe(() => car.register(ev.entity));
});
world.afterEvents.entityLoad.subscribe((ev) => {
  safe(() => boss.register(ev.entity));
  safe(() => car.register(ev.entity));
});

// --------------------------------------------------- The Hollow Lantern item
// While held, sweeps a cone of soul-light ahead that weakens monsters.
function lanternTick() {
  for (const player of world.getAllPlayers()) {
    const item = mainhand(player);
    if (!item || item.typeId !== "veil:hollow_lantern") continue;

    const dir = safe(() => player.getViewDirection());
    if (!dir) continue;
    const eye = { x: player.location.x, y: player.location.y + 1.5, z: player.location.z };

    // Visible beam: motes along the look direction.
    for (const t of [2, 4, 6]) {
      particleAt(player.dimension, "veil:soul_mote", {
        x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t
      });
    }
    if (system.currentTick % 40 === 0) {
      playSoundAt(player.dimension, "veil.lantern.beam", player.location, { volume: 0.4, pitch: 1.2 });
    }

    const monsters = safe(() => player.dimension.getEntities({
      location: player.location, maxDistance: 8, families: ["monster"]
    })) ?? [];
    for (const mob of monsters) {
      if (!valid(mob)) continue;
      const to = {
        x: mob.location.x - player.location.x,
        y: mob.location.y + 0.5 - eye.y,
        z: mob.location.z - player.location.z
      };
      const len = Math.sqrt(to.x * to.x + to.y * to.y + to.z * to.z);
      if (len < 0.5) continue;
      // ~56-degree cone in front of the player.
      const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / len;
      if (dot > 0.55) {
        safe(() => mob.addEffect("minecraft:weakness", 60, { amplifier: 1, showParticles: false }));
        if (system.currentTick % 20 === 0) {
          particleAt(mob.dimension, "veil:soul_mote", { x: mob.location.x, y: mob.location.y + 1, z: mob.location.z });
        }
      }
    }
  }
}

// ------------------------------------------------------------------- loops
system.runInterval(() => safe(() => boss.tick()), 2);        // boss brain, 10 Hz
system.runInterval(() => safe(() => car.driveTick()), 1);    // driving, 20 Hz
system.runInterval(() => safe(() => lanternTick()), 10);     // lantern, 2 Hz
system.runInterval(() => safe(() => soulrend.tickMarks()), 10);

console.log("[Veilbreak] scripts loaded — Noxhollow waits below.");
