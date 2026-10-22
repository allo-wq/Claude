# The Scientist Who Put His Head in a Particle Beam: 3D animated Short

A 48-second vertical (1080×1920, 30 fps) 3D explainer about Anatoli Bugorski's 1978 accident at the U-70 synchrotron. It is built entirely in Three.js from procedural geometry, materials, lights, shadows, instancing and particles. There are no image, video or AI-generated assets.

- **Finished video:** [`final-animation.mp4`](final-animation.mp4). H.264 High, yuv420p, 30 fps, 1440 frames, silent.
- **Voiceover:** see [`NARRATION_GUIDE.md`](NARRATION_GUIDE.md) for the timestamped script and how to add a recording.

## Commands

```bash
npm install                 # three + playwright (uses the system Chromium; no browser download needed here)
npm run preview             # serves http://127.0.0.1:5173/ (real-time player with scrub bar; Space = play/pause, ←/→ = step a frame)
                            #   http://127.0.0.1:5173/?t=17.5  or  ?frame=525  renders one exact frame
npm run render              # deterministic render of all 1440 frames → out/frames/*.png → final-animation.mp4
npm run render:fast         # same at 540×960 → out/preview-540p.mp4 (quick check)
npm run stills -- 2.0 17.5  # render specific times to out/stills/ (add --scale 1, --nobloom)
npm run contact-sheet       # out/qa/contact-sheet.png (1 frame/s) + out/qa/transitions.png (both sides of every cut)
npm run verify              # ffprobe checks: resolution, fps, codec, pix_fmt, frame count, duration, black frames
npm run check-determinism   # re-renders sample frames in reverse order and byte-compares them with out/frames
```

`render` options: `--workers 3` (parallel headless Chromium pages), `--scale 0.5`, `--from/--to` (frame range), `--fresh` (discard cached frames), and `--audio file.wav`. If `audio/narration.*` exists it is muxed automatically. Frames are cached, so an interrupted render resumes where it stopped.

Requirements: Node 18+, FFmpeg/ffprobe on `PATH`, and a Chromium for Playwright. Rendering uses SwiftShader software WebGL, so no GPU is needed. A full render takes about 31 minutes on 4 CPU cores (3 workers).

## How it works

| Path | Role |
|---|---|
| `src/timeline.js` | **Master timeline.** Narration timestamps, the six major scenes, and 28 shots with exact start/end times. It is the single source of truth for sync. |
| `src/shots.js` | One function per shot: poses the set, animates the camera, and returns post-FX. Also the on-screen captions and the flash transitions. |
| `src/main.js` | Builds the stage and all sets, then exposes `window.__renderFrame(frame)` for capture or runs the preview player. |
| `src/core/` | `stage.js` (WebGL renderer, MSAA HalfFloat composer, bloom, ACES), `hud.js` (text drawn in the same canvas, kept inside the Shorts safe area), `materials.js`, `textures.js` (procedural canvas textures), `util.js` (easing, seeded random, deterministic noise). |
| `src/assets/` | `head.js` (procedural head: swelling morph target, burn/frozen-half shader, X-ray layer with clip-plane sweep, skull, brain, seizure lightning, peel flakes, beam-path dashes); `person.js` (rigged character, analytic two-bone arm IK, walk cycle); `beam.js` (instanced proton bunches); `machines.js` (magnets, apparatus, beacon, interlock, console, ring); `displays.js` (scope, gauge, calendar and ECG canvases redrawn from `t`). |
| `src/sets/` | Eight scenes: ring (aerial), hall (beam line), tunnel (inside the pipe), studio (head close-ups), suns, dose blocks, hospital, desk. |
| `scripts/` | `serve.mjs` (dependency-free static server), `browser.mjs` (headless Chromium launcher), `render.mjs`, `stills.mjs`, `contact-sheet.mjs`, `verify.mjs`, `check-determinism.mjs`, `sheet.py` (tiles stills for review). |
| `qa/` | Contact sheet (one frame per second) and cut pairs (both sides of every cut) taken from the final MP4. |

**Determinism.** Every visual value is a pure function of the timeline time `t = frame / 30`. There is no wall-clock time, no `Math.random()`, and no accumulated simulation state. Particles, flicker, calendar pages and ECG traces are all computed from `t`, and randomness is seeded. Any frame can therefore be rendered in isolation, in any order, by any worker, and produce the same image. `npm run check-determinism` verifies this by re-rendering sample frames in reverse order and byte-comparing the PNGs. One pitfall it caught: the X-ray head attaches world-space clip planes to its materials, so every head owns its own materials. Shared eye materials had made the eyes vanish depending on render order.

**Beam alignment.** In the hall, the beam's height is *derived* from Bugorski's solved lean pose (`HallSet._solveLean`). The head is aimed so its local entry→exit axis lies along the beam. That guarantees the beam enters the back of the skull and exits beside the left nostril in every shot.

## Accuracy notes and visual metaphors
- This is a **stylised reconstruction**, not documentary footage. The hall layout, the apparatus with an open gap, the console and the interlock panel are illustrative. The real U-70 ring is about 1.5 km around; the aerial shot compresses it.
- Facts shown on screen:
  - 13 July 1978; Institute for High Energy Physics, Protvino.
  - 76 GeV protons, about 99.99% of light speed.
  - Entry at the back of the head, exit near the nose.
  - About 2,000 Gy received, against a lethal whole-body dose of about 5 Gy.
  - Left-side facial paralysis, deafness in the left ear, seizures, intellect intact, and he completed his PhD.
- Shown as clear **metaphors**, not literal depictions:
  - **The thousand suns** are captioned as his own description of the flash.
  - **The frosted left half of the face** stands for paralysis.
  - **The lightning arcs** stand for seizures.
  - **The glowing brain and orbiting equations** stand for an intact mind.
  - **The red protons** stand in for particles that are invisible in reality.
