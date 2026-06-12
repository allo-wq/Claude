import { system, EquipmentSlot, EntityDamageCause } from "@minecraft/server";
import { safe, valid, playSoundAt, particleAt, mainhand } from "./util.js";

const SOULREND = "veil:soulrend";
const MARK_TICKS = 120;       // 6s
const MARK_CHANCE = 0.3;
const BONUS_FRACTION = 0.25;  // extra damage vs marked targets
const KILL_HEAL = 4;          // hearts*2 returned on a killing blow

const marked = new Map(); // entityId -> { entity, until }
let applyingBonus = false; // re-entrancy guard: bonus damage re-fires entityHurt

function wieldingSoulrend(attacker) {
  if (!attacker || attacker.typeId !== "minecraft:player") return false;
  const item = mainhand(attacker);
  return item !== undefined && item.typeId === SOULREND;
}

export function onHit(ev) {
  if (applyingBonus) return;
  if (ev.damageSource?.cause !== EntityDamageCause.entityAttack) return;
  const attacker = ev.damageSource.damagingEntity;
  if (!wieldingSoulrend(attacker)) return;
  const target = ev.hurtEntity;

  const m = marked.get(target.id);
  if (m && m.until > system.currentTick) {
    // Marked targets take bonus soul damage from Soulrend hits.
    applyingBonus = true;
    safe(() => target.applyDamage(
      Math.max(1, Math.round(ev.damage * BONUS_FRACTION)),
      { cause: EntityDamageCause.magic }
    ));
    applyingBonus = false;
    particleAt(target.dimension, "veil:soul_mote", { x: target.location.x, y: target.location.y + 1, z: target.location.z });
  } else if (Math.random() < MARK_CHANCE) {
    marked.set(target.id, { entity: target, until: system.currentTick + MARK_TICKS });
    playSoundAt(target.dimension, "veil.mark", target.location, { volume: 1, pitch: 1.4 });
    particleAt(target.dimension, "veil:soul_mote", { x: target.location.x, y: target.location.y + 1.2, z: target.location.z });
    safe(() => attacker.onScreenDisplay.setActionBar("§bSoulrend marks its prey."));
  }

  damageDurability(attacker);
}

// Custom items don't reliably lose durability from melee, so manage the bar
// ourselves: 1 point per landed hit, shatter at zero.
function damageDurability(player) {
  safe(() => {
    const eq = player.getComponent("minecraft:equippable");
    const item = eq.getEquipment(EquipmentSlot.Mainhand);
    if (!item || item.typeId !== SOULREND) return;
    const dur = item.getComponent("minecraft:durability");
    if (!dur) return;
    if (dur.damage + 1 >= dur.maxDurability) {
      eq.setEquipment(EquipmentSlot.Mainhand, undefined);
      playSoundAt(player.dimension, "veil.lantern.shatter", player.location, { volume: 1 });
      player.onScreenDisplay.setActionBar("§8Soulrend shatters...");
    } else {
      dur.damage += 1;
      eq.setEquipment(EquipmentSlot.Mainhand, item);
    }
  });
}

export function onKill(ev) {
  const attacker = ev.damageSource?.damagingEntity;
  if (!wieldingSoulrend(attacker)) return;
  const dead = ev.deadEntity;
  marked.delete(dead.id);
  // Soul siphon: killing blow feeds the wielder.
  safe(() => {
    const hp = attacker.getComponent("minecraft:health");
    hp.setCurrentValue(Math.min(hp.currentValue + KILL_HEAL, hp.effectiveMax));
  });
  particleAt(dead.dimension, "veil:soul_stream", { x: dead.location.x, y: dead.location.y + 0.5, z: dead.location.z });
  playSoundAt(dead.dimension, "veil.mark", attacker.location, { volume: 1, pitch: 0.8 });
}

// Cyan motes orbit marked targets so the mark is readable mid-fight.
export function tickMarks() {
  const now = system.currentTick;
  for (const [id, m] of marked) {
    if (m.until <= now || !valid(m.entity)) {
      marked.delete(id);
      continue;
    }
    particleAt(m.entity.dimension, "veil:soul_mote", {
      x: m.entity.location.x, y: m.entity.location.y + 1.2, z: m.entity.location.z
    });
  }
}
