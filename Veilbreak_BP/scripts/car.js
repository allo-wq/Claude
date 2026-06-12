import { system, EquipmentSlot } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { safe, valid, forwardFromYaw, playSoundAt, particleAt } from "./util.js";

export const CAR_ID = "veil:hollow_roadster";

const cars = new Map(); // id -> { car, speed, vy, lastEngine, lastBrake }

export function register(entity) {
  if (entity.typeId !== CAR_ID) return;
  if (!cars.has(entity.id)) {
    cars.set(entity.id, { car: entity, speed: 0, vy: -0.08, lastEngine: 0, lastBrake: 0 });
  }
}

export function onKeyUse(ev) {
  const player = ev.source;
  const dim = player.dimension;

  // Spawn where the player is looking (on top of the hit block), else 4 ahead.
  const hit = safe(() => player.getBlockFromViewDirection({ maxDistance: 12 }));
  let loc;
  if (hit) {
    loc = { x: hit.block.x + 0.5, y: hit.block.y + 1.2, z: hit.block.z + 0.5 };
  } else {
    const f = forwardFromYaw(player.getRotation().y);
    loc = { x: player.location.x + f.x * 4, y: player.location.y + 0.5, z: player.location.z + f.z * 4 };
  }

  const car = safe(() => dim.spawnEntity(CAR_ID, loc));
  if (!car) {
    safe(() => player.onScreenDisplay.setActionBar("§7No room to summon the Roadster here."));
    return;
  }
  safe(() => car.setRotation({ x: 0, y: player.getRotation().y }));
  safe(() => { car.nameTag = "Hollow Roadster"; });
  register(car);

  // The key is single-use.
  safe(() => player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Mainhand, undefined));

  playSoundAt(dim, "veil.roadster.start", loc, { volume: 2 });
  particleAt(dim, "veil:soul_mote", loc);
  safe(() => player.onScreenDisplay.setActionBar("§bThe Hollow Roadster answers the key."));
}

// Runs every tick. Reads the driver's stick/WASD via the stable input API and
// drives the entity with velocity + rotation for real accelerate/brake/steer.
export function driveTick() {
  const now = system.currentTick;
  const { maxSpeed, acceleration, brakeForce, reverseFraction, turnRate } = CONFIG.car;

  for (const [id, d] of cars) {
    const car = d.car;
    if (!valid(car)) {
      cars.delete(id);
      continue;
    }
    // Clean removal if it somehow leaves the world floor.
    if (car.location.y < -100) {
      safe(() => car.remove());
      cars.delete(id);
      continue;
    }

    const riders = safe(() => car.getComponent("minecraft:rideable")?.getRiders()) ?? [];
    const driver = riders.find((r) => r.typeId === "minecraft:player");

    if (driver) {
      // movementVector.y: +1 forward / -1 back; x: left/right strafe input.
      const mv = safe(() => driver.inputInfo.getMovementVector()) ?? { x: 0, y: 0 };

      if (mv.y > 0.1) {
        d.speed = Math.min(d.speed + acceleration, maxSpeed);
      } else if (mv.y < -0.1) {
        if (d.speed > 0.15 && now - d.lastBrake > 20) {
          d.lastBrake = now;
          playSoundAt(car.dimension, "veil.roadster.brake", car.location, { volume: 1, pitch: 0.8 });
        }
        d.speed = Math.max(d.speed - brakeForce, -maxSpeed * reverseFraction);
      } else {
        d.speed *= 0.96; // coast
        if (Math.abs(d.speed) < 0.01) d.speed = 0;
      }

      // Steering authority grows with speed; reversing flips the wheel.
      if (Math.abs(d.speed) > 0.02) {
        const steer = -mv.x * (turnRate + Math.abs(d.speed) * 6) * Math.sign(d.speed);
        safe(() => car.setRotation({ x: 0, y: car.getRotation().y + steer }));
      }

      // Soul-resonance engine loop while driven.
      if (now - d.lastEngine > 50 && Math.abs(d.speed) > 0.05) {
        d.lastEngine = now;
        playSoundAt(car.dimension, "veil.roadster.engine", car.location, { volume: 0.7, pitch: 0.7 + Math.abs(d.speed) });
      }
      // Headlight glow while ridden.
      if (now % 6 === 0) {
        const f = forwardFromYaw(car.getRotation().y);
        particleAt(car.dimension, "veil:soul_mote", {
          x: car.location.x + f.x * 1.6, y: car.location.y + 0.45, z: car.location.z + f.z * 1.6
        });
      }
    } else {
      d.speed *= 0.9; // rolls to a stop when empty
      if (Math.abs(d.speed) < 0.01) d.speed = 0;
    }

    if (d.speed !== 0 || !car.isOnGround) {
      // clearVelocity + applyImpulse each tick = direct speed control; we
      // re-add gravity ourselves since clearVelocity wipes it.
      d.vy = car.isOnGround ? -0.08 : Math.max(d.vy - 0.08, -1.2);
      const f = forwardFromYaw(car.getRotation().y);
      safe(() => {
        car.clearVelocity();
        car.applyImpulse({ x: f.x * d.speed, y: d.vy, z: f.z * d.speed });
      });
    }
  }
}
