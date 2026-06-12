# Veilbreak — Noxhollow, the Hollow Lantern

A complete Minecraft **Bedrock 1.21.x** Add-On: one unforgettable 3-phase boss with
custom Blockbench 3D models, a signature light-devouring mechanic (**The Snuffing**),
artifact loot, and a drivable **Hollow Roadster**.

> *A towering iron wraith with a caged lantern for a skull — it devours the light
> around it, dragging the world into darkness as you fight.*

## Tech notes (read first)

- **Target:** Minecraft Bedrock **1.21.50+** (`min_engine_version` 1.21.50).
- **Script API:** stable **`@minecraft/server` 1.16.0** — **no Experimental/Beta toggles
  are required.** Car driving uses the stable player input API
  (`player.inputInfo.getMovementVector()`); screen effects use the `darkness` effect,
  a custom RP fog (`/fog push`), and `/camerashake`.
- The two packs are UUID-linked: the BP declares the RP as a dependency, so enabling
  the behavior pack on a world pulls the resource pack in automatically.

## Install

1. Build or download `dist/Veilbreak.mcaddon` (run `tools/build_mcaddon.sh` to build).
2. Double-click the `.mcaddon` (or open it with Minecraft). Both packs import.
3. Create/edit a world → **Behavior Packs → Veilbreak [BP] → Activate.**
   The resource pack activates automatically via the dependency.
4. No experimental toggles needed. Cheats are not required for normal play.

## Summoning Noxhollow

1. Craft **Dim Iron** (8 iron ingots around 1 soul soil → 2 blocks).
2. Craft a **Wick of Souls** (string over soul torch over bone).
3. Build the ritual frame: **8 Dim Iron blocks in a 5×5 ring** (the four edge
   midpoints and four corners, i.e. every block at distance 2 on the same Y level)
   around any center block:

   ```
   D . D . D
   . . . . .
   D . X . D      X = center block (aim here)
   . . . . .
   D . D . D
   ```

4. Aim at the center block and **use the Wick of Souls**. Souls stream upward for
   1.5 seconds, then Noxhollow rises with a roar.
5. Lore says it lives below **Y -40**; by default you may summon anywhere
   (see config).

## The fight

| Phase | HP | What changes |
|---|---|---|
| 1 — Lantern-Lit | 100→66% | Lantern swipes + arcing **Soul Ember** projectiles that leave burning patches |
| 2 — The Snuffing | ≤66% | Roar transition, **2–3 Hollow Wisp** minions, **shadow pools** on the floor, and **The Snuffing** |
| 3 — Hollow Rage | ≤33% | Lantern flares (emissive texture intensifies), faster attacks, **Soulburst** |

- **The Snuffing:** Noxhollow raises its lantern (0.8s tell), nearby torches gutter,
  the screen plunges into darkness + fog for ~5s and you take soul damage —
  **unless you are holding a torch or lantern**, which halves the darkness and
  negates the damage. Pre-place light, hold a light, live.
- **Soulburst:** a telegraphed expanding cyan ring (2.5s). Break line of sight
  behind a pillar or leave the 14-block radius to dodge it entirely.
- **Death** is a scene: it buckles, the lantern shatters, souls stream upward,
  then loot drops. Boss HP scales with players present (600 / 900 / 1200).

## Loot (guaranteed one-of-each, plus 4–8 Soulforged Iron and ~1200 XP)

- **The Hollow Lantern** — hold it to sweep a cone of soul-light that weakens
  monsters caught in the beam. Also your best friend during The Snuffing.
- **Soulrend** — 9-damage scythe, 1250 durability (visible bar), repairable with
  Soulforged Iron. 30% chance on hit to **mark** targets (cyan motes) so Soulrend
  hits deal +25% soul damage; killing blows siphon souls and **heal you**.
- **Roadster Key** — single-use; summons the **Hollow Roadster** where you look.
- **Noxhollow's Skull** — placeable glowing trophy block.

## The Hollow Roadster

Hop in (two seats, players only). **Forward** accelerates, **back** brakes then
reverses, **strafe keys/stick steer** — steering authority grows with speed.
Wheels spin with distance traveled, cyan headlights glow, a soul-resonance hum
plays while driving. It survives world reload (persistent), ignores fall damage,
and removes itself cleanly if it falls out of the world.

> If steering feels inverted on your input device, flip the sign on `-mv.x` in
> `Veilbreak_BP/scripts/car.js`.

## Config

Everything tweakable lives in `Veilbreak_BP/scripts/config.js`:
`difficulty` (scripted-damage multiplier), `lootEnabled`, `canSummonAnywhere`
(set `false` to require Y < -40), `scaleHealthMultiplayer`, `wispCount`,
ability cooldowns, and the car's speed/acceleration/turn feel.

## File map (what goes where)

- `Veilbreak_BP/` — manifest (data + script modules), `entities/` (boss, wisp,
  soul ember, roadster), `items/`, `blocks/`, `loot_tables/`, `recipes/`,
  `scripts/` (`main.js` entry + modules).
- `Veilbreak_RP/` — manifest, `entity/` (client entities), `models/entity/` and
  `models/blocks/` (`.geo.json`), `animations/`, `animation_controllers/`,
  `render_controllers/`, `attachables/` (Soulrend + Lantern held models),
  `particles/`, `fogs/`, `sounds/sound_definitions.json`, `textures/`
  (+ `item_texture.json`, `terrain_texture.json`), `blocks.json`, `texts/`.
- `tools/gen_textures.py` — regenerates every PNG (deterministic, stdlib-only).
- `tools/build_mcaddon.sh` — zips both packs into `dist/Veilbreak.mcaddon`.

All `.geo.json` files import directly into **Blockbench** (File → Open Model)
if you want to refine the models; re-export over the same paths.

Sounds are mapped to vanilla `.ogg` paths (e.g. the boss theme streams the
soulsand-valley track "So Below") so the pack ships with zero audio files and no
missing-sound errors — drop your own `.ogg` files into `Veilbreak_RP/sounds/`
and repoint `sound_definitions.json` to go fully custom.

## Testing checklist

See [TESTING.md](TESTING.md).
