# Military Armor Price Short (3D, vertical 1080×1920)

A YouTube Short with a dynamic, fast-cut edit: over a burning battlefield, each armor
piece whips in from the left, slams into the center, gets scanned **green**, and its
price counts up from **$1** to the real value with a ka-ching. Then the next piece
does the same. The outro assembles the full set and counts up the total.

Everything is procedural and generated from code. There's no stock footage or audio:

| Part | File | What it does |
| --- | --- | --- |
| Edit list | `config.json`, `web/timeline.js` | Piece names, prices, and the timing of every hit, flash, explosion and sound cue |
| 3D armor | `web/armor.js` | Helmet, plate carrier, gloves, knee pads, boots + the green scan shader |
| Battlefield | `web/war.js` | Burning sky, ruined skyline, fires, smoke, tanks, explosions, embers, tracers |
| Editing FX | `web/post.js`, `web/main.js` | Whip-pan blur, zoom punches, camera shake, glitch, chromatic aberration, impact frames |
| Text / HUD | `index.html`, `web/hud.js` | Hook, item names, price counter, lock-on brackets, running total, CTA |
| Sound | `audio.py` | Synthesized half-time trap beat + whooshes, impacts, scan beeps, ticks, ka-chings, war ambience |
| Capture | `render.mjs` | Renders every frame deterministically in headless Chromium → ffmpeg |

## Change the prices or items

Edit `config.json` (names, sub-titles, prices, hook text, CTA), then rebuild. Each
`model` must be one of `helmet`, `vest`, `gloves`, `kneepads`, `boots`.

## Build

```bash
npm install          # three.js, playwright-core, fonts
pip install numpy scipy
./build.sh           # -> out/armor_short.mp4
```

Rendering uses software WebGL (SwiftShader) at ~3.5 s/frame, so the full 28.5 s
Short (855 frames @ 30 fps) takes about 50 minutes on 4 cores. Handy flags:

```bash
node render.mjs --stills 4.6,12.6   # PNG stills at given times -> out/stills/
node render.mjs --range 0:120       # render only a frame range
```

To preview live in a browser, serve this folder (e.g. `npx serve .`) and open
`index.html?play` (or `index.html?t=12.5` for one frame).
