# Twinkle, Twinkle, Little Star: looping 3D nursery-rhyme Short

A 24-second vertical (1080×1920, 30 fps) 3D cartoon of the public-domain nursery rhyme, built to loop forever. Twinkle, a plush glowing star, and Pip, a bunny in star pyjamas, act out each sung line in one tiny world: a round planet with a mushroom house, a twilight sky and a sleepy moon. The picture is rendered entirely in Three.js from procedural geometry, canvas-drawn textures, lights and particles. The singing is synthesized locally from an open-source TTS voice, and the music and sound effects are synthesized with NumPy. There are no samples, stock assets, paid services or AI-generated visuals.

- **Finished video:** [`final-animation.mp4`](final-animation.mp4).
  - Video: H.264 High, yuv420p, 30 fps, 720 frames (24.0 s).
  - Audio: AAC 48 kHz stereo at −14 LUFS.
- **Seamless loop:** the last frame flows into the first (frame 719 → 0), and the audio is mixed on a circular buffer, so a Shorts replay has no visible or audible seam.
- **QA images:** in [`qa/`](qa/), taken from the final MP4.

## What happens (one shot per sung line, 8 beats each at 120 bpm)

| Time | Lyric | Picture |
|---|---|---|
| 0.0–4.1 s | *Twinkle, twinkle, little star,* | **Hook.** On beat 1 (0.1 s) the star pops out of a twinkle with a flash, sparkle burst and shockwave. It bounces on every beat, winks, spins, shrinks to "little" with a tiny "o" mouth, then bursts back big with god rays. Whip pan down. |
| 4.1–8.1 s | *How I wonder what you are!* | Pip at the round window looks up in wonder, paws clasped, then thinks: three bubble puffs pop, a "?" bounces and spins into a star. "Wow!" and Pip points up. Whip tilt up. |
| 8.1–12.1 s | *Up above the world so high,* | The star rockets up on a rainbow trail and bursts through a cloud (white fly-through). It then circles above the tiny world and flies a loop-de-loop. |
| 12.1–16.1 s | *Like a diamond in the sky.* | It spins up and flashes into a smiling diamond. Glints, then rainbow prism beams sweep the sky. It poofs back into the star and the sky fills with little rainbow stars. Swoop dive to the window. |
| 16.1–20.1 s | *Twinkle, twinkle, little star,* | The star lands beside Pip: a cheek boop (hearts), both giggle. It conjures a tiny pink star into Pip's paws, then both cheer in a confetti burst ("yay!"). |
| 20.1–24.1 s | *How I wonder what you are!* | Pip rubs its eyes, yawns and falls asleep on the sill, with the tiny star as its nightlight (zzz). The camera pulls back and tilts up as the star zips home, waves, winks and shrinks into the same twinkle the video opens with. |

The video starts 0.1 s before beat 1, so frame 0 already shows the twinkle the star bursts from. A loud visual change lands every one to two beats, and the karaoke lyrics highlight each syllable as it is sung, with a bouncing star that hops from syllable to syllable. Lyrics stay inside the Shorts safe area (clear of the title/channel overlay and the button column).

## Commands

```bash
npm install                 # three + playwright (uses the system Chromium; no browser download needed here)
npm run preview             # serves http://127.0.0.1:5173/ (real-time player with the soundtrack; click to start audio,
                            #   Space = play/pause, ←/→ = step a frame); ?t=17.5 or ?frame=525 renders one exact frame
npm run render              # deterministic render of all 720 frames → out/frames/*.png → final-animation.mp4 (+ soundtrack)
npm run render:fast         # same at 540×960 → out/preview-540p.mp4 (quick check)
npm run stills -- 0.6 9.2   # render specific times (seconds) to out/stills/ (add --scale 1, --nobloom)
npm run contact-sheet       # out/qa/: contact sheet, shot transitions, loop seam (716–719 | 0–3), lyric sync sheet
npm run verify              # ffprobe checks: resolution, fps, codec, pix_fmt, frame count, duration, black frames, audio, loudness, true peak
npm run check-determinism   # re-renders sample frames in reverse order and compares them with out/frames
node tools/lab.mjs pip.png '{"who":"bunny","pose":{"eyes":{"sparkle":true}},"cam":{"pos":[0,0.6,6],"target":[0,0.4,0],"fov":30}}'   # character lab

# audio (one-time: python3 -m venv .venv && .venv/bin/pip install -r requirements-audio.txt)
npm run audio               # sung vocal (Kokoro TTS → WORLD vocoder) → music + sound effects → mastered loop (audio/soundtrack.flac)
npm run check-audio         # pitch accuracy of every sung note (Praat) + line-by-line transcription (offline Whisper)
```

`render` options: `--workers 3` (parallel headless Chromium pages), `--scale 0.5`, `--from/--to` (frame range), `--fresh` (discard cached frames), `--audio file` and `--silent`. Frames are cached, so an interrupted render resumes where it stopped.

Requirements: Node 18+, FFmpeg/ffprobe on `PATH`, and a Chromium for Playwright. Rendering uses SwiftShader software WebGL, so no GPU is needed. A full render takes about 34 minutes on 4 CPU cores (3 workers). The Kokoro model files (about 340 MB) download on the first `npm run audio`. `check-audio` expects a sherpa-onnx Whisper model (`sherpa-onnx-whisper-base.en` or `-tiny.en` from the sherpa-onnx `asr-models` release) unpacked in `audio/models/`.

## How it works

| Path | Role |
|---|---|
| `song.json` | **Single source of truth** for sound and picture: tempo (120 bpm), the 48-beat loop, the 0.1 s offset of beat 1, every syllable with its phonemes, beat, length and MIDI note, the chords, the sound-effect cues and the ad-libs. |
| `src/timeline.js` | The beat clock `beatAt(t)` (wraps at 48 beats, which is what makes the picture loop), the six shots, and the lyric syllables with absolute beats. |
| `src/shots.js` | The whole performance: `camAt(b)`, one continuous camera path (whip pans, rocket follow, orbit chase, dolly, swoop, pull-back), motion blur derived from how far the view moved since the previous frame, one function per shot posing the characters and effects, the karaoke lyrics and the flashes. |
| `src/characters/` | `star.js` (plush star: a rounded star outline swept in rings with a pillow profile; the tips bend as arms and legs by CPU vertex deform), `bunny.js` (Pip: posable head, ears, arms, cap, face; clipped below the window sill), `face.js` (glossy eyes with lids, sparkle irises and "^"/"‿" closed eyes; a canvas mouth that morphs between smile, grin, "O" and yawn). |
| `src/world/` | `world.js` (planet, mushroom house and window, sky dome shader with nebula and twinkling starfield, moon, clouds, trees, little houses, flowers, fireflies), `fx.js` (sparkle bursts, shockwave ring, god rays, rainbow ribbon trail, confetti, thought bubble, little rainbow stars, the diamond). |
| `src/core/` | `stage.js` (WebGL renderer, MSAA HalfFloat composer, directional motion blur, bloom on bright highlights only, neutral tone mapping), `hud.js` (lyrics drawn in the same canvas inside the Shorts safe area), `textures.js` (procedural canvas textures), `util.js` (easing, springs, seeded random). |
| `scripts/sing.py` | Sung vocal. Kokoro-82M speaks each line from fixed phonemes and reports per-phoneme timings. Each vowel is stretched onto its note, with consonants placed just before the beat. The WORLD vocoder re-pitches every vowel to the melody (scoop, legato glide, vibrato on held notes) with forced voicing and a slight formant lift for a younger voice. Two more voices make a detuned, delayed, panned choir, and the giggle/"wow"/yawn/"yay" ad-libs are made the same way. |
| `scripts/music.py` | A bouncy kids'-pop arrangement (plucked strums, bass, glockenspiel melody, marimba, pad, toy drums), 40 beat-locked cute effects (pops, boings, dings, whooshes, sparkles, harp, confetti…), vocal clarity EQ and sidechain ducking, reverb over two laps of the loop, a look-ahead limiter and EBU R128 mastering to −14 LUFS / ≤ −1 dBTP. |
| `scripts/` (rest) | `render.mjs`, `stills.mjs`, `contact-sheet.mjs`, `verify.mjs`, `check-determinism.mjs`, `browser.mjs` (headless Chromium), `serve.mjs` (static server), `check_vocal.py`, `sheet.py` (tiles stills for review). |
| `tools/` | Character lab: renders the star or the bunny alone with any pose and camera. |

**Loop.** Every value that moves continuously (sky twinkle, fireflies, the moon's rocking, cloud drift) runs at an integer number of cycles per 24 s, and each shot's choreography is a function of the beat clock, which wraps. The last beat holds the camera on the opening framing while the star shrinks into a twinkle; the first beat pops it back out. In the audio, every note tail, reverb and effect that runs past 24 s wraps around to the start.

**Determinism.** Every visual is a pure function of the beat clock. There is no wall-clock time, no `Math.random()` and no simulation state, so any frame can be rendered alone, in any order, by any worker. `npm run check-determinism` checks this.

## QA

All of this is reproducible with the commands above; the images in [`qa/`](qa/) are taken from the final MP4.

- **`npm run verify`:** every check passes (see [`qa/verify.txt`](qa/verify.txt)): 1080×1920, 30/1 fps, H.264 High, yuv420p, 720 frames, 24.000 s; AAC 48 kHz stereo of the same length; −14.1 LUFS integrated, −1.3 dBTP true peak; no black frames.
- **Loop seam** ([`qa/loop-seam.png`](qa/loop-seam.png)): frames 716–719 followed by 0–3. The star shrinks into the twinkle and the twinkle bursts, with no jump in camera, sky or lyrics.
- **Sync** ([`qa/sync-sheet.png`](qa/sync-sheet.png)): the frame just after every syllable of lines 1 and 3. Each syllable is highlighted as it is sung and the action matches it ("lit-tle": tiny star; "star": burst; "Up": rocket).
- **Transitions** ([`qa/transitions.png`](qa/transitions.png)) and a **contact sheet** at one frame per second ([`qa/contact-sheet.png`](qa/contact-sheet.png)).
- **Determinism:** `npm run check-determinism` re-renders 15 sample frames in reverse order in a fresh browser and byte-compares them with the frames used for the MP4. It caught one leak during development: overlapping lyric tokens with equal draw order were drawn in object-creation order, which depended on which frames a worker had rendered before. Every token now has an explicit draw order.
- **Singing** (`npm run check-audio`): all 42 sung notes are voiced and on pitch (median error 0.7 cents, max 5.1 cents, measured with Praat). An offline Whisper (base.en) transcribes the lead vocal line by line as "Twinkle twinkle little star" / "How I wonder what you are" / "The-the-the world's so high" / "Like in diamond in the sky", and the repeats the same way. The karaoke lyrics on screen carry the two weaker lines.

## Credits and licences

- **Song:** lyrics by Jane Taylor (1806); melody is the traditional French air "Ah ! vous dirai-je, maman" (18th century). Both public domain. Arrangement, lyrics timing and all audio here are original.
- **Voice:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) via [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT), voices `af_heart`, `af_bella`, `af_nicole`, run offline. The singing itself is resynthesized with [WORLD](https://github.com/mmorise/World)/pyworld (modified BSD).
- **Font:** [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License 1.1, [`assets/fonts/LICENSE-Fredoka-OFL.txt`](assets/fonts/LICENSE-Fredoka-OFL.txt)), from `@fontsource/fredoka`.
- **QA only:** Whisper models via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0); Praat via parselmouth (GPL-3.0, not distributed).
- Everything else (characters, world, effects, music, sound effects) is procedural code in this folder.

**Publishing note:** a video aimed at children must be marked "made for kids" when uploaded to YouTube (COPPA). That setting turns off comments and personalized ads, and you choose it in YouTube Studio, not in the file.
