import { system, EquipmentSlot } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { safe, playSoundAt, particleAt } from "./util.js";
import { onSummoned, BOSS_ID } from "./boss.js";

// Ritual frame: 8 Dim Iron blocks in a 5x5 ring (edge midpoints + corners at
// distance 2) around a center block, all at the same height. The player aims
// at the center block and uses a Wick of Souls.
const RING = [
  [2, 0], [-2, 0], [0, 2], [0, -2],
  [2, 2], [2, -2], [-2, 2], [-2, -2]
];

export function onWickUse(ev) {
  const player = ev.source;
  const dim = player.dimension;

  const hit = safe(() => player.getBlockFromViewDirection({ maxDistance: 8 }));
  if (!hit) {
    safe(() => player.onScreenDisplay.setActionBar("§7Aim at the center block of the ritual frame."));
    return;
  }
  const center = hit.block;

  if (!CONFIG.canSummonAnywhere && center.y > -40) {
    safe(() => player.onScreenDisplay.setActionBar("§8The wick refuses to burn this close to the sun. Go deeper (below Y -40)."));
    return;
  }

  for (const [dx, dz] of RING) {
    const b = safe(() => dim.getBlock({ x: center.x + dx, y: center.y, z: center.z + dz }));
    if (!b || b.typeId !== "veil:dim_iron") {
      safe(() => player.onScreenDisplay.setActionBar("§7The frame is incomplete: 8 Dim Iron in a 5×5 ring around the center."));
      return;
    }
  }

  // Frame is valid — consume one wick.
  safe(() => {
    const eq = player.getComponent("minecraft:equippable");
    const stack = eq.getEquipment(EquipmentSlot.Mainhand);
    if (!stack) return;
    if (stack.amount > 1) {
      stack.amount -= 1;
      eq.setEquipment(EquipmentSlot.Mainhand, stack);
    } else {
      eq.setEquipment(EquipmentSlot.Mainhand, undefined);
    }
  });

  const spawnLoc = { x: center.x + 0.5, y: center.y + 1, z: center.z + 0.5 };
  playSoundAt(dim, "veil.noxhollow.emerge", spawnLoc, { volume: 3, pitch: 0.6 });
  // 1.5s of rising dread before the entrance.
  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => particleAt(dim, "veil:soul_stream", spawnLoc), i * 5);
  }

  system.runTimeout(() => {
    const boss = safe(() => dim.spawnEntity(BOSS_ID, spawnLoc));
    if (!boss) return;
    const nearby = dim.getPlayers({ location: spawnLoc, maxDistance: 48 }).length;
    onSummoned(boss, nearby);
    safe(() => boss.playAnimation("animation.veil.noxhollow.roar", { blendOutTime: 0.3 }));
    playSoundAt(dim, "veil.noxhollow.roar", spawnLoc, { volume: 3 });
    safe(() => boss.runCommand("camerashake add @a[r=24] 0.4 0.8 positional"));
    particleAt(dim, "veil:snuff_burst", { x: spawnLoc.x, y: spawnLoc.y + 3, z: spawnLoc.z });
  }, 30);
}
