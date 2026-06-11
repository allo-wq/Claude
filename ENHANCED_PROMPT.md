# Enhanced Prompt

> Original prompt: *"make Fortnite"*

## Enhanced version (the prompt I'm giving to myself)

Build a playable, single-file browser battle royale inspired by Fortnite, named
**Victory Isle**, with zero build steps — one `fortnite.html` that runs by
double-clicking it (Three.js loaded from CDN). Target 60 fps on a laptop and
basic playability on iPhone Safari via touch controls.

### World
- Procedural island (~800m across) with rolling hills, sand beaches, rock
  peaks, surrounded by water; vertex-colored terrain, fog, sun + sky lighting.
- Scattered pine trees, rocks, and a handful of simple buildings.
- Loot chests glowing gold around the map.

### Core battle-royale loop
1. Match starts with the player skydiving onto the island; glider auto-deploys,
   WASD steers the drop.
2. 20 combatants (player + 19 AI bots). Bots roam toward the safe zone, fight
   each other, and engage the player on sight.
3. A purple storm circle shrinks in timed phases toward a random safe zone,
   dealing escalating damage outside it (to bots too).
4. Last one standing wins: show **#1 VICTORY ROYALE**; death shows placement.

### Combat & building
- First-person controls: pointer lock mouse-look, WASD, sprint, jump.
- Weapons: pickaxe (melee, harvests wood from trees), assault rifle (auto,
  reload, spread, tracers), shotgun (devastating up close). Keys 1/2/3.
- Headshots deal bonus damage; show hit markers and a kill feed.
- Fortnite-style building: press Q to place a wooden wall (costs wood);
  walls block bullets and can be destroyed.
- Health + shield system; chests grant ammo and shield.

### Presentation
- HUD: health/shield bars, ammo, materials, players-alive counter,
  eliminations, storm timer, minimap with current/target circle, kill feed,
  damage vignette.
- Procedural sound effects via WebAudio (no asset files).
- Touch controls on mobile: virtual joystick, look-drag, fire/jump/build buttons.

### Constraints
- Single HTML file, no bundler, no assets, no server. Clean, commented code.
