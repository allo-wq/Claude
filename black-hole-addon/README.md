# Black Hole Add-on (Minecraft Bedrock Edition)

A complete behavior pack + resource pack that adds a craftable, scripted
**Black Hole** to Bedrock, built on the stable `@minecraft/server` **2.0.0**
scripting API (Minecraft **1.21.90+**).

## Features

| Feature | Implementation |
|---|---|
| Singularity Core item | Crafted from 1 nether star, 4 obsidian, 4 end crystals; right-click to tear open a black hole 8 blocks ahead |
| Gravity | Inverse-square pull (`F = K·size/d²`) on all mobs, items and survival players within 30+ blocks, via `applyImpulse` / `applyKnockback` |
| Event horizon | 2-block core (scales with size) deals 1000 void damage; items are swallowed whole |
| Block absorption | Expanding sphere of destruction over the 60 s lifetime; eaten blocks spawn debris that visibly spirals into the core |
| Growth | Every absorbed block (+0.004), item (+0.012) and mob (+0.06) grows the hole up to 4× — model scale, horizon and pull radius all grow with it |
| Collapse | Despawns after 60 s with a shockwave explosion + radial knockback, or collapse it early (no explosion) by hitting it with a **Stabilizer Rod** (diamond + blaze rod + iron ingot) |
| Visuals | Animated multi-shell "sphere" model with accretion disk, swirling purple/black particle vortex, orbiting light-bending rings, dark aura |
| Atmosphere | Looping deep hum, proximity-scaled camera shake, darkening fog (`fog` command + custom fog JSON), distorted drone that intensifies (volume up, pitch down) as you approach |

## Repository layout

```
packs/
  BlackHoleBP/            behavior pack
    manifest.json         UUIDs + script module + @minecraft/server 2.0.0 dependency
    entities/black_hole.json
    items/                singularity_core.json, stabilizer_rod.json
    recipes/              both crafting recipes
    scripts/main.js       all gravity / absorption / FX / collapse logic
  BlackHoleRP/            resource pack
    entity/               client entity (scale driven by the synced bh:size property)
    models/entity/        black_hole.geo.json
    animations/           spin animation
    render_controllers/
    particles/            vortex, event_ring, aura, block_spiral, shockwave
    fogs/                 black_hole_fog.json
    sounds/               sound_definitions.json + hum/distort/collapse WAVs
    textures/             entity, item and particle textures + item_texture.json
    texts/                en_US.lang
tools/
  generate_assets.py      regenerates every PNG/WAV from code (stdlib only)
  build_mcaddon.py        zips both packs into dist/BlackHole.mcaddon
```

## Build the .mcaddon

```bash
python3 tools/generate_assets.py   # only needed if you changed assets
python3 tools/build_mcaddon.py     # -> dist/BlackHole.mcaddon
```

A `.mcaddon` is simply a zip whose root contains the two pack folders. To
package manually instead:

```bash
cd packs && zip -r ../dist/BlackHole.mcaddon BlackHoleBP BlackHoleRP
```

## Install & enable

1. Open `dist/BlackHole.mcaddon` with Minecraft (double-click, or share to
   Minecraft on mobile). Both packs import automatically.
2. Create or edit a world:
   - **Behavior Packs → My Packs → Black Hole [BP] → Activate** (the resource
     pack activates automatically as a dependency).
   - Turn **ON** the world toggle **"Holiday Creator Features"** is *not*
     required; the packs use stable JSON formats. No **Beta APIs** toggle is
     needed either — the script targets the stable `@minecraft/server@2.0.0`
     module shipped with 1.21.90+.
   - Cheats do **not** need to be enabled; `camerashake`/`fog` are executed by
     the script, not by players.
3. Requires Minecraft Bedrock **1.21.90 or newer** (the `min_engine_version`
   and script module version enforce this).

## Play

- Craft a **Singularity Core**:

  ```
  O E O        O = obsidian
  E N E        E = end crystal
  O E O        N = nether star
  ```

- Right-click / use it where you want catastrophic gravitational collapse.
- Craft a **Stabilizer Rod** (diamond / blaze rod / iron ingot on a diagonal)
  and hit the black hole with it to collapse it safely before it detonates.
- Stay outside the swirl unless you enjoy void damage. Creative and spectator
  players are unaffected by the pull.

## Tuning

All gameplay constants live at the top of
`packs/BlackHoleBP/scripts/main.js`: lifetime, pull constant, radii, growth
rates, max size, and the indestructible-block list.
