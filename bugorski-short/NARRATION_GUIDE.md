# Narration and audio: "The Scientist Who Put His Head in a Particle Beam"

`final-animation.mp4` has a full soundtrack:

- **Voiceover:** generated locally with Kokoro-82M (open-source Apache-2.0 TTS, runs offline via ONNX; no paid service or API key). Voice `af_heart`, pace 1.15× (about 188 words/min).
- **Score and sound design:** synthesized procedurally in NumPy from fixed seeds, so it's deterministic and uses no samples or licensed assets.
- **Delivery:** AAC 256 kb/s, 48 kHz stereo, loudness-normalized to −14 LUFS integrated, −1.7 dBTP true peak.

The video is **49.57 s** (1487 frames). The script's section markers implied 48 s, but the hook alone ("In 1978… while it was running", 17 spoken words) needs about 5 s at a natural pace, not 4.

## How the picture stays in sync with the voice
The animation is authored on a 48 s *design* clock that follows the script's section markers. `scripts/narrate.py` measures when every line is actually spoken. Three sources feed the start times:

- clip onsets
- speech-recognizer word timestamps, for the two lines that start mid-sentence
- the clip lead-in silence

`src/timeline.js` then time-warps the design clock onto those measurements with a monotone cubic curve, so every cut, reveal, caption and sound effect lands on its words without speed jumps.

Measured line starts in the final video (seconds):

| # | Spoken | Ends | Line | Design cue |
|---|---|---|---|---|
| 1 | 0.16 | 2.78 | In 1978, a Soviet scientist | 0.0 |
| 2 | 2.78 | 4.94 | stuck his head into a particle accelerator... | 1.4 |
| 3 | 5.30 | 6.29 | while it was running. | 2.9 |
| 4 | 6.72 | 8.01 | Anatoli Bugorski. | 4.0 |
| 5 | 8.27 | 9.49 | A physicist in Russia. | 5.4 |
| 6 | 9.75 | 10.90 | The machine was glitching, | 6.8 |
| 7 | 11.02 | 12.46 | and the safety system failed. | 8.3 |
| 8 | 12.77 | 13.91 | He leaned in to check it. | 10.0 |
| 9 | 14.16 | 15.18 | Just a quick look. | 11.9 |
| 10 | 15.62 | 16.73 | A beam of protons, | 14.0 |
| 11 | 16.84 | 18.32 | traveling near the speed of light, | 15.1 |
| 12 | 18.44 | 19.70 | shot through the back of his skull | 16.6 |
| 13 | 19.70 | 20.71 | and out his face. | 18.0 |
| 14 | 20.99 | 23.02 | He saw a flash brighter than a thousand suns. | 19.0 |
| 15 | 23.28 | 24.18 | And felt nothing. | 21.4 |
| 16 | 24.43 | 25.19 | No pain. | 22.4 |
| 17 | 25.44 | 26.26 | No sound. | 23.2 |
| 18 | 26.70 | 27.88 | Then his face swelled up. | 24.0 |
| 19 | 28.14 | 30.25 | Skin peeled away along the path of the beam. | 25.6 |
| 20 | 30.49 | 33.37 | The radiation dose should have killed him many times over. | 28.2 |
| 21 | 33.62 | 34.89 | Doctors gave him days. | 31.4 |
| 22 | 35.33 | 36.23 | He didn't die. | 34.0 |
| 23 | 36.51 | 37.75 | Half his face froze. | 35.4 |
| 24 | 38.05 | 39.34 | He lost hearing in one ear. | 37.0 |
| 25 | 39.60 | 40.50 | Seizures came. | 38.8 |
| 26 | 40.76 | 41.61 | But his mind? | 40.2 |
| 27 | 41.99 | 43.08 | Completely intact. | 41.4 |
| 28 | 43.55 | 44.81 | He finished his PhD. | 43.0 |
| 29 | 45.08 | 46.39 | And went right back to work... | 44.6 |
| 30 | 46.72 | 48.29 | around particle accelerators. | 46.2 |

`qa/sync-sheet.jpg` shows the frame 0.4 s into each of these lines.

## Sound design (each effect sits on the frame of its visual)
- **Pad:** follows the story. Dark D minor at the hook, B♭ when the safety fails, a tense ♭9 before the strike, bright A major for the "thousand suns", then near-silence on "No sound".
- **Score after the accident:** G minor and E♭ for the aftermath and hospital, F major when he survives, a diminished chord for the seizures, and F add9 / B♭maj9 for "mind intact" and the return to work.
- **Machines and impacts:**
  - an accelerator hum and air in the hall
  - electrical sputter while the machine glitches
  - three relay clunks as the interlock lamps die, then an error buzzer on the ✕
  - a riser into the white-flash strike
  - wind through the beam pipe, with whooshes as the rings pass
- **Close-ups:**
  - sub-plus-sizzle zaps as the beam enters the skull and exits beside the nose
  - a shimmering "suns" chord
  - soft ticks for the crossed-out icons
- **Story beats:**
  - blocks clattering into the 400-block wall
  - ECG beeps locked to the R-peaks drawn on the monitor
  - calendar pages fluttering
  - ripples for the ear diagram
  - crackle while the seizure arcs flicker
  - a chime on "intact"
  - the book landing and the stamp slam
  - footsteps on his walk-cycle heel strikes

The score and ambience duck about 6 dB under the voice. The effects keep their sub and sizzle but are ducked in the 250 Hz–8 kHz speech band while the narrator talks, so words are never masked.

## Quality checks performed
- **Pronunciation:**
  - every line was transcribed by two independent offline speech recognizers (Zipformer and Whisper tiny.en)
  - Whisper transcribes the delivered MP4's audio word for word, apart from spelling the name "Anatoly Bugorsky"
  - pronunciation fixes were each verified this way: "1978" → "nineteen seventy-eight", Anatoli → "ah-nah-TOH-lee", Bugorski → "boo-GOR-skee", and a tiny break in "face, froze"
- **Sync:**
  - measured voice onsets match the timing file within 10 ms
  - the MP4's audio track is sample-aligned with the master (0 ms lag)
- **Reproducibility:** rerunning the audio pipeline reproduces the timing, voice and mix bit for bit.

## Regenerating, changing the voice, or using your own recording
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-audio.txt   # one-time
npm run audio            # narrate.py (TTS + timing) → soundtrack.py (score, effects, mix)
npm run check-audio      # transcribe the mix and compare with the script
npm run render -- --fresh  # re-render frames (timing changes move every frame), mux audio
```
- **Different voice:** `.venv/bin/python scripts/narrate.py --voice am_michael`. Kokoro has 28 English voices, e.g. `am_onyx`, `bm_george`, `af_bella`. Use `--target 48` to aim for another length.
- **Your own recording:**
  1. `.venv/bin/python scripts/align_recording.py my_voiceover.wav`. This transcribes it with word timestamps, matches it to the script, and rewrites `src/narrationTiming.js`. Validated against the TTS track's known timings: median 5 ms, max 20 ms per line.
  2. Run `.venv/bin/python scripts/soundtrack.py` and `npm run render -- --fresh`.
- **Silent picture only:** `npm run render -- --silent --out silent.mp4`.
- The first run downloads models (Kokoro and the two QA recognizers, about 0.9 GB) from GitHub releases into `audio/models/`. That folder is git-ignored.
