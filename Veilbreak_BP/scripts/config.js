// Veilbreak — tweak these freely; everything in the scripts reads from here.
// Values that live in entity JSON (base health 600, melee damage) are noted.
export const CONFIG = {
  // Multiplies all SCRIPTED damage (Snuffing, Soulburst, shadow pools, ember patches).
  difficulty: 1.0,

  // Master switch for the guaranteed artifact drops (Hollow Lantern, Soulrend,
  // Roadster Key, Skull). XP and Soulforged Iron always drop.
  lootEnabled: true,

  // false = the summoning ritual only works below Y -40 (Noxhollow's lore home).
  canSummonAnywhere: true,

  // Scale boss HP with nearby player count at summon time
  // (2 players -> 900 HP, 3+ players -> 1200 HP via entity events).
  scaleHealthMultiplayer: true,

  // Phase 2 minions.
  wispCount: 3,

  // Cooldowns in ticks (20 ticks = 1 second).
  snuffCooldownTicks: 360,      // The Snuffing, phase 2+
  soulburstCooldownTicks: 260,  // Soulburst, phase 3
  shadowPoolIntervalTicks: 160, // arena hazard, phase 2+

  // Hollow Roadster driving feel.
  car: {
    maxSpeed: 0.55,       // blocks per tick (~11 m/s)
    acceleration: 0.02,
    brakeForce: 0.05,
    reverseFraction: 0.4, // reverse top speed as a fraction of maxSpeed
    turnRate: 2.2         // degrees per tick at low speed (scales up with speed)
  }
};
