# The Scientist Who Put His Head in a Particle Beam: 3D animated Short

A 49.6-second vertical (1080×1920, 30 fps) 3D explainer about Anatoli Bugorski's 1978 accident at the U-70 synchrotron, with narration, score and sound design. The picture is rendered entirely in Three.js from procedural geometry, materials, lights, shadows, instancing and particles. The two people (Bugorski and his doctor) are realistic rigged characters generated from MakeHuman's CC0 base mesh, skeleton, skin weights, facial pose units and eye model; they are synthetic people, not scans or likenesses of anyone. There are no video, photo or AI-generated visual assets.

- **Finished video:** [`final-animation.mp4`](final-animation.mp4).
  - Video: H.264 High, yuv420p, 30 fps, 1487 frames.
  - Audio: AAC 48 kHz stereo at −14 LUFS.
- **Audio:**
  - The voiceover is generated locally with the open-source Kokoro-82M TTS (no paid service or API key).
  - The score and effects are synthesized procedurally.
  - The animation is time-warped so each cue lands on its spoken words.
  - [`NARRATION_GUIDE.md`](NARRATION_GUIDE.md) has the measured timings, the QA results, and how to change the voice or use your own recording.

## Commands

```bash
npm install                 # three + playwright (uses the system Chromium; no browser download needed here)
npm run preview             # serves http://127.0.0.1:5173/ (real-time player with scrub bar; Space = play/pause, ←/→ = step a frame)
                            #   http://127.0.0.1:5173/?t=17.5  or  ?frame=525  renders one exact frame
npm run render              # deterministic render of all 1487 frames → out/frames/*.png → final-animation.mp4 (+ soundtrack)
npm run render:fast         # same at 540×960 → out/preview-540p.mp4 (quick check)
npm run stills -- 2.0 17.5  # render specific times to out/stills/ (add --scale 1, --nobloom)
npm run contact-sheet       # out/qa/: contact sheet (1 frame/s), transitions (both sides of every cut), sync sheet (every spoken line)
npm run verify              # ffprobe checks: resolution, fps, codec, pix_fmt, frames, duration, black frames, audio format/length, loudness, true peak
npm run check-determinism   # re-renders sample frames in reverse order and byte-compares them with out/frames
npm run build-humans        # regenerate assets/human/*.json+.bin from MakeHuman's CC0 data (fetched into git-ignored vendor/)
node tools/lab.mjs face.png '{"camHead":{"pos":[1.2,0,6.5],"target":[0,-0.6,0],"fov":30}}'   # character lab: one human, any pose/expression

# audio (one-time: python3 -m venv .venv && .venv/bin/pip install -r requirements-audio.txt)
npm run audio               # TTS voiceover + measured line timings → score/effects → mastered mix (audio/*.flac)
npm run check-audio         # two offline speech recognisers transcribe the MP4's audio and compare it with the script
```

`render` options: `--workers 3` (parallel headless Chromium pages), `--scale 0.5`, `--from/--to` (frame range), `--fresh` (discard cached frames), `--audio file` and `--silent`. By default `audio/soundtrack.flac` is muxed. Frames are cached, so an interrupted render resumes where it stopped, and re-muxing audio only re-encodes.

Requirements: Node 18+, FFmpeg/ffprobe on `PATH`, and a Chromium for Playwright. Rendering uses SwiftShader software WebGL, so no GPU is needed. A full render takes about 31 minutes on 4 CPU cores (3 workers).

## How it works

| Path | Role |
|---|---|
| `src/timeline.js` | **Master timeline.** The 30 narration lines, six major scenes and 28 shots on a 48 s design clock, plus `designTime()`, a monotone time-warp from the real voiceover clock onto the design clock. |
| `src/narrationTiming.js` | Generated: the measured start of every spoken line. It drives the warp, the total length (1487 frames) and the sound design. |
| `src/shots.js` | One function per shot: poses the set, animates the camera, and returns post-FX. Also the on-screen captions and the flash transitions. |
| `src/main.js` | Builds the stage and all sets, then exposes `window.__renderFrame(frame)` for capture or runs the preview player. |
| `src/core/` | `stage.js` (WebGL renderer, MSAA HalfFloat composer, bloom, ACES), `hud.js` (text drawn in the same canvas, kept inside the Shorts safe area), `materials.js`, `textures.js` (procedural canvas textures), `util.js` (easing, seeded random, deterministic noise). |
| `src/assets/` | `human.js` (realistic character: GPU-skinned MakeHuman mesh with 163 bones, face expressions blended from MakeHuman's face pose units, subsurface-style skin shader with baked AO, pores, stubble, lips and brows, shell-rendered hair and eyebrows, strand eyelashes, textured eyes with a glossy cornea, fabric shaders for the lab coat, shirt, tie and trousers, analytic two-bone arm IK, walk cycle; plus the head effects: swelling morph, burn/paralysis shading, X-ray ghost with clip-plane sweep, skull, brain, seizure lightning, peel flakes, beam-path dashes); `beam.js` (instanced proton bunches); `machines.js` (magnets, apparatus, beacon, interlock, console, ring); `displays.js` (scope, gauge, calendar and ECG canvases redrawn from `t`). |
| `src/sets/` | Eight scenes: ring (aerial), hall (beam line), tunnel (inside the pipe), studio (head close-ups), suns, dose blocks, hospital, desk. |
| `scripts/` | `serve.mjs` (dependency-free static server), `browser.mjs` (headless Chromium launcher), `render.mjs`, `stills.mjs`, `contact-sheet.mjs`, `verify.mjs`, `check-determinism.mjs`, `sheet.py` (tiles stills for review). Audio scripts: `narrate.py` (Kokoro TTS, pronunciation lexicon, measured timing), `soundtrack.py` (procedural score and effects, ducking, EBU R128 mastering), `check_narration.py` (two-recognizer transcript check), `align_recording.py` (sync to your own recording). |
| `audio/` | `narration_voice.flac` (dry voice) and `soundtrack.flac` (final mix), both lossless. Models are downloaded on first use into the git-ignored `audio/models/`. |
| `scripts/build_human.py` | Offline character builder (numpy, in the same `.venv`). Applies MakeHuman macro and face targets (age, build, height, face shape), builds the skeleton with MakeHuman's own code, keeps the top-4 skin weights, fits the eyes, bakes per-vertex ambient occlusion, derives skin masks (lips, brows, stubble, redness, T-zone, thin ears) and the hair coverage, generates the swelling morph, tailors clothes from the body-fitting helper meshes (straight-leg trousers, A-line lab coat with a clean V-neck, procedural collars, lapels, tie and shoes), and locates the beam's entry/exit points on the real skull. Output: `assets/human/bugorski.*`, `assets/human/doctor.*`, the eye texture and the CC0 licence. |
| `tools/` | `lab.html`/`lab.js`/`lab.mjs`: a character lab that renders one human with any pose, expression and camera (head-relative cameras via `camHead`). Used to tune the characters. |
| `qa/` | Taken from the final MP4: contact sheet (one frame per second), cut pairs (both sides of every cut), sync sheet (the frame 0.4 s into every spoken line), and the `verify` report. |

**Determinism.** Every visual value is a pure function of the timeline time (`frame / 30`, warped onto the design clock). There is no wall-clock time, no `Math.random()`, and no accumulated simulation state. Particles, flicker, calendar pages and ECG traces are all computed from `t`, and randomness is seeded. Any frame can therefore be rendered in isolation, in any order, by any worker, and produce the same image. The audio pipeline is deterministic too: rerunning it reproduces the timing, voice and mix bit for bit. `npm run check-determinism` verifies this by re-rendering sample frames in reverse order and byte-comparing the PNGs. One pitfall it caught: the X-ray head attaches world-space clip planes to its materials, so every character owns its own materials. Shared eye materials had made the eyes vanish depending on render order.

**Character rig.** Shots pose the characters with Euler angles per joint (pelvis, spine, neck, head, shoulders, elbows, hands, hips, knees, ankles) expressed in the parent's character frame, where zero means standing with the arms hanging. `human.js` maps each onto MakeHuman bones as `restRot(parent)⁻¹ · R · restRot(bone)`: spine and neck rotations are spread over the five spine and three neck bones, the A-pose arms are re-based to hang naturally, and the shoulder girdle drops with them. Clothing near the neck takes its skin weights from the lower neck and chest, so collars and lapels stay together in strong poses such as the lean into the beam.

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
  - **A cooler, bloodless tint on the left half of the face** stands for paralysis.
  - **The lightning arcs** stand for seizures.
  - **The glowing brain and orbiting equations** stand for an intact mind.
  - **The red protons** stand in for particles that are invisible in reality.

## Credits
- **Voice:** [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0), voice `af_heart`, run locally through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) and ONNX Runtime.
- **QA speech recognition:** [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) with a Zipformer transducer and Whisper tiny.en. These are only used to check the narration and align recordings; they produce nothing that ships.
- **Characters:** base mesh, morph targets, skeleton, skin weights, face pose units, eye mesh and eye texture from [MakeHuman](https://github.com/makehumancommunity/makehuman), released as CC0 1.0 (see `assets/human/LICENSE-MakeHuman-CC0.txt`). MakeHuman's own Python code (AGPL-3.0) is only run at build time to construct the skeleton and face poses; it is fetched into the git-ignored `vendor/` and is not part of this project. Skin, hair, brows, lashes and clothing are shaded and tailored procedurally here.
- **Font:** Inter (SIL OFL 1.1). See `assets/fonts/LICENSE-Inter.txt`.
- **Everything else:** all other imagery, music and sound effects are generated by the code in this repository.
