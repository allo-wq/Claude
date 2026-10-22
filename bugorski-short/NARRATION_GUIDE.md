# Narration guide: "The Scientist Who Put His Head in a Particle Beam"

No voiceover file was supplied, so `final-animation.mp4` is a **silent** 48.0 s render (1080×1920, 30 fps). The narration timestamps below are estimates. They come from the script's own section markers, at a natural Shorts pace of about 2.5 words per second. Every shot, caption and transition is cut to these times, so record to them and the picture will line up.

## Recording tips
- Total length is **48.0 s**. Each section's line must finish before the next section starts.
- Pause where the table shows a gap or a long line ("...", "But his mind?").
- Hit the **bold cue words** on time. A visual event happens on each of those words.
- Record mono or stereo WAV at 48 kHz, with about 0.2 s of room tone before the first word. Trim it so "In" starts at 0.00 s.

## Timestamped script

| # | Start | End | Line (cue words in bold) | What is on screen at that moment |
|---|---|---|---|---|
| 1 | 0.00 | 1.40 | In **1978**, a Soviet scientist | Aerial of the synchrotron ring at dusk, beam racing around it. "1978 · SOVIET UNION" |
| 2 | 1.40 | 2.90 | stuck his **head** into a particle accelerator... | Wide shot of the hall: a scientist leaning with his head in the open gap of the beam line |
| 3 | 2.90 | 4.00 | while it was **running**. | Low close-up: beam streaming through the gap, red "BEAM ON" beacon spinning |
| 4 | 4.00 | 5.40 | **Anatoli Bugorski**. | Portrait push-in, name card |
| 5 | 5.40 | 6.80 | A **physicist** in Russia. | Writing equations on a chalkboard. "PHYSICIST · PROTVINO, RUSSIA" |
| 6 | 6.80 | 8.30 | The machine was **glitching**, | Console: gauge needle jitters, then the oscilloscope shows ERROR |
| 7 | 8.30 | 10.00 | and the safety system **failed**. | Interlock lamps die one by one, then a red ✕ (≈ 9.45 s) |
| 8 | 10.00 | 11.90 | He **leaned in** to check it. | He bends over and puts his head into the gap |
| 9 | 11.90 | 14.00 | Just a **quick look**. | Profile close-up, then a top-down view as a beam pulse races toward the back of his head. White flash at 13.9 s |
| 10 | 14.00 | 15.10 | A beam of **protons**, | Inside the beam pipe, riding with the proton bunches. "PROTONS" |
| 11 | 15.10 | 16.60 | traveling near the **speed of light**, | Camera swings low as the protons streak. "99.99% THE SPEED OF LIGHT" |
| 12 | 16.60 | 18.00 | shot through the **back of his skull** | X-ray scan sweeps the head; the beam enters the back of the skull (≈ 17.1 s) |
| 13 | 18.00 | 19.00 | and **out his face**. | Beam exits beside the left nostril (≈ 17.9 s); camera arcs to the front |
| 14 | 19.00 | 21.40 | He saw a **flash** brighter than a thousand suns. | The flash blooms in his eye (≈ 19.4 s), white-out, then 1,000 suns ignite. "“BRIGHTER THAN A THOUSAND SUNS”" |
| 15 | 21.40 | 22.40 | And felt **nothing**. | White fades to a calm, blinking face |
| 16 | 22.40 | 23.20 | No **pain**. | Lightning-bolt icon appears and is crossed out. "NO PAIN" |
| 17 | 23.20 | 24.00 | No **sound**. | Speaker icon appears and is crossed out. "NO SOUND" |
| 18 | 24.00 | 25.60 | Then his face **swelled** up. | The left side of his face swells; camera orbits to show it |
| 19 | 25.60 | 28.20 | Skin **peeled** away along the path of the beam. | Wounds redden and skin flakes lift off; a dashed line shows the beam's track |
| 20 | 28.20 | 31.40 | The radiation dose should have **killed him many times over**. | One trefoil block = "LETHAL DOSE ≈ 5 Gy", then a wall of 400 blocks = "HIS DOSE ≈ 2,000 Gy" |
| 21 | 31.40 | 34.00 | **Doctors** gave him days. | Hospital: doctor shakes his head, calendar at 13 July 1978. "DOCTORS EXPECTED HIM TO DIE" |
| 22 | 34.00 | 35.40 | He **didn't die**. | Calendar flips through weeks, ECG keeps beating, he sits up |
| 23 | 35.40 | 37.00 | Half his face **froze**. | He smiles but only the right side moves; the left half is tinted frozen. "LEFT SIDE PARALYZED" |
| 24 | 37.00 | 38.80 | He lost hearing in **one ear**. | Sound ripples reach the right ear but die before the left one. "DEAF IN LEFT EAR" |
| 25 | 38.80 | 40.20 | **Seizures** came. | X-ray brain with flickering electrical arcs. "SEIZURES" |
| 26 | 40.20 | 41.40 | But his **mind**? | Arcs stop; slow push-in on the calm brain |
| 27 | 41.40 | 43.00 | Completely **intact**. | Brain glows teal, equations orbit his head. "MIND INTACT" |
| 28 | 43.00 | 44.60 | He finished his **PhD**. | Dissertation lands on the desk; a "PhD ✓" stamp comes down (≈ 44.0 s) |
| 29 | 44.60 | 46.20 | And went right **back to work**... | He walks back along the running beam line |
| 30 | 46.20 | 48.00 | around **particle accelerators**. | Crane up to reveal the accelerator hall |

## Adding the recorded narration
1. Save the recording as `audio/narration.wav` (`.mp3`, `.m4a`, `.aac` and `.flac` also work).
2. Run `npm run render`. Frames that already exist in `out/frames/` are reused, so this only re-encodes. The narration is muxed as AAC 192 kbps and the video length stays at 48.0 s.
3. Alternatively, mux it into the existing file without re-encoding the video:
   ```
   ffmpeg -i final-animation.mp4 -i audio/narration.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -af apad -t 48 final-animation-voiced.mp4
   ```

If your read runs noticeably faster or slower, edit the `start`/`end` values in `src/timeline.js` (`NARRATION` and `SHOTS`) to match the recording, then re-render with `npm run render -- --fresh`.
