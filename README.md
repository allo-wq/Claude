# Geometry Dash Remake

A single-file remake of Geometry Dash in HTML5 canvas — no dependencies, no
build step. Open `index.html` in a browser and play.

## Play

```sh
# any static server works, or just double-click index.html
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Input | Action |
|---|---|
| Space / ↑ / W / click / tap | Jump (cube) — hold to keep hopping |
| Hold | Thrust upward (ship) |
| M | Toggle music & sound |

## Features

- **Cube and ship modes** with portals to switch between them
- Spikes, platform blocks, yellow jump pads, and yellow jump orbs
- One hand-built level (~30 s) with a verified-beatable layout
- Death particles, screen shake, parallax background, rotation physics
- Procedural chiptune music and sound effects via WebAudio (no assets)
- Attempts counter, progress bar, and best-percentage saved in `localStorage`
- Fixed-timestep physics (240 Hz) so jumps feel the same on any refresh rate

## Testing

The level layout is machine-verified: `test/solve.js` loads the game's real
physics code in Node (with DOM stubs) and runs a breadth-first search over
hold/release inputs at physics resolution to prove the level can be completed.

```sh
node test/solve.js   # prints "LEVEL IS BEATABLE ✔" and exits 0
```
