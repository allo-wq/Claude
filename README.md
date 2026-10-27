# Lanternfish

A bioluminescent survival roguelite for the browser. You are a small fish that makes its own light. Fight your way down through the ocean's five zones to the bottom of the Challenger Deep, 10,935 m down.

## Play

Open `index.html` in a browser. There is no build step and nothing to install. To serve it locally:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

### Controls

| Action | Keyboard and mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Swim | WASD or arrow keys | Left stick or d-pad | Drag on the left half |
| Aim | Mouse (you fire on your own) | Right stick | Automatic |
| Dash | Space, Shift or right-click | A, RB or RT | Tap the right half or Dash |
| Flare | E (once the meter is full) | B, LB or LT | Flare button |
| Pause | Esc or P | Start | Pause button |
| Mute | M | | |

Auto-aim, screen shake, music and sound effects can be toggled from the pause menu.

## How a dive works

- **Descent.** You sink steadily. The deeper you go, the darker the water gets, until the only light is your own glow, your bolts, and the creatures that make their own.
- **Plankton and adaptations.** Kills drop glowing plankton. Each level offers three adaptations: bolt upgrades, organ weapons (orbiting spores, electric arcs, depth charges, ink, a tail lantern) and body upgrades. Golden elites drop pearls that offer a rarer pick.
- **Chains.** Kills in quick succession build a score multiplier, up to ×5. Taking a hit resets it.
- **Flare.** Kills charge the flare. Releasing it lights up the whole screen, stuns and damages everything nearby, and wipes out incoming bullets.
- **Guardians.** The descent stops at four boss fights:
  - the humpback anglerfish at 1,000 m
  - the colossal squid at 4,000 m
  - the giant oarfish at 6,000 m
  - something unclassified at the bottom of the Challenger Deep

  Every attack is telegraphed.

The zones, depths, pressures (about 1 atm per 10 m) and water temperatures follow the real ocean. The temperature rises slightly in the trench, as it does in reality.

## Code

Plain JavaScript on a 2D canvas, split into classic scripts that share one global scope (load order is set in `index.html`):

| File | Contents |
| --- | --- |
| `src/util.js` | Math helpers, spatial grid, safe `localStorage` |
| `src/audio.js` | All sound and music, synthesized with WebAudio |
| `src/input.js` | Keyboard, mouse, touch stick and gamepad merged into one per-frame intent |
| `src/fx.js` | Glow sprites, pooled particles, rings, text, screen shake |
| `src/enemies.js` | Enemy archetypes: AI, body art and glow art |
| `src/bosses.js` | The four boss state machines |
| `src/upgrades.js` | Adaptation definitions and level-up rolls |
| `src/player.js` | Movement, dash, firing, organ weapons, flare |
| `src/game.js` | World state, spawn director, collisions, render pipeline |
| `src/autopilot.js` | The pilot that plays the title-screen demo |
| `src/ui.js` | HUD, banners, level-up cards, menus |
| `src/main.js` | State machine and frame loop |

Rendering works in layers. Bodies are drawn first. A low-resolution darkness layer goes over them, with light cut out around every light source. Bioluminescence is then drawn additively on top, so creatures outside your light show up only as their glowing eyes and lures.

### Debug parameters

These are for testing:

- `?depth=3900` starts a dive at that depth.
- `?level=15` starts with 15 random adaptations.
- `?god` makes you invulnerable.
- `?bot` lets the autopilot play.

Combine them, for example `index.html?depth=10900&level=35&god&bot`.
