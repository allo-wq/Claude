# Geometry Rush

A Geometry Dash–inspired rhythm platformer for iOS, built natively with **Swift + SpriteKit**. No external dependencies, no licensed assets — graphics are drawn with SpriteKit shape nodes and the soundtrack is synthesized at runtime, sample-locked to each level's beat grid.

![platform](https://img.shields.io/badge/platform-iOS%2015%2B-blue) ![engine](https://img.shields.io/badge/engine-SpriteKit-orange)

## Gameplay

- **Auto-running player** — the cube runs on its own; you only control the vertical.
- **Six game modes**, switched mid-level via portals:
  | Mode | Control |
  |---|---|
  | Cube | tap/hold to jump |
  | Ship | hold to thrust up, release to fall |
  | Ball | tap to flip gravity (rolls on floor or ceiling) |
  | UFO | tap to flap |
  | Wave | hold = up diagonal, release = down diagonal |
  | Robot | hold for a variable-height jump |
- **Gravity portals** invert gravity mid-run; the ball mode flips it on demand.
- **Hazards** — spikes (floor and ceiling) and frontal block collisions kill instantly with an explosion burst, then auto-restart.
- **Pads & orbs** — yellow pads auto-launch you; orbs boost when you tap while overlapping.
- **Practice mode** — toggle in level select or settings. Drops green checkpoints every few seconds of survival (plus level-authored ones); death respawns at the last checkpoint with mode/gravity restored.
- **Progress & attempts** — live progress bar + percentage during a run; best % and attempt counts persist per level.

## Levels

Five original levels of increasing difficulty, each with its own color theme and BPM:

| # | Name | Difficulty | BPM | Modes |
|---|------|-----------|-----|-------|
| 1 | Stereo Steps | Easy | 100 | cube |
| 2 | Neon Flight | Normal | 115 | cube, ship |
| 3 | Bounce Circuit | Hard | 128 | cube, ball, UFO + gravity flips |
| 4 | Wavelength | Harder | 140 | cube, wave, robot, ship |
| 5 | Overdrive | Insane | 160 | all six + gravity flips |

### Music sync

Each level declares a `bpm` and a speed expressed in tiles-per-beat, so **every obstacle column lands on a beat**. The `MusicEngine` synthesizes a chiptune track (kick / hats / square bass / 16th-note arp) from that same BPM with `AVAudioSourceNode`, and the scene reads the audio sample clock to fire beat-pulse effects — player scale pulses and screen flashes — exactly on the beat. Levels can also ship explicit `beats: [timestamps]` in their JSON to sync to custom tracks.

### Tile-based JSON level format & editor

Levels live in `Resources/Levels/level*.json`:

```json
{
  "id": 1, "name": "Stereo Steps", "difficulty": "Easy",
  "bpm": 100, "speed": 213.3, "startMode": "cube",
  "theme": { "top": "#1a2b6d", "bottom": "#0a0f2e", "ground": "#2233aa", "accent": "#00e5ff" },
  "beats": null,
  "tiles": [ { "t": "spike", "x": 8, "y": 0 }, { "t": "block", "x": 14, "y": 0 } ]
}
```

One tile = 64pt; `x` is the column, `y` is rows above the ground. Tile types: `block`, `spike`, `spikeDown`, `pad`, `orb`, `portalCube|Ship|Ball|Ufo|Wave|Robot`, `gravityFlip`, `gravityNormal`, `checkpoint`, `finish`.

`Tools/level_editor.py` is the level editor/generator CLI:

```bash
python3 Tools/level_editor.py generate                          # rebuild the 5 shipped levels
python3 Tools/level_editor.py render Resources/Levels/level3.json    # ASCII preview
python3 Tools/level_editor.py validate Resources/Levels/level3.json  # schema + bounds check
```

The builder API (`spike_row`, `block_step`, `corridor`, `orb_chain`, `portal`, …) authors patterns directly on the beat grid — or just hand-edit the JSON and re-validate.

## UI

- **Main menu** → Play / Settings, animated parallax background.
- **Level select** — card per level with difficulty color, best %, progress bar, attempt count, and the practice-mode toggle.
- **Settings** — music on/off, practice mode toggle, reset progress.
- **In-run HUD** — progress bar + %, attempt number, practice badge, pause (returns to level select).
- Parallax backgrounds (gradient sky, drifting glows, skyline silhouettes) tinted per level theme.

## Building

### Locally (requires macOS + Xcode 15+)

```bash
brew install xcodegen
xcodegen generate
open GeometryRush.xcodeproj   # run on simulator or device
```

### CI: IPA via GitHub Actions

`.github/workflows/build-ipa.yml` runs on every push (and manually via *workflow_dispatch*): it generates the project with XcodeGen, validates all level JSON, builds an **unsigned** Release IPA for device, and uploads it as the `GeometryRush-unsigned-ipa` artifact (plus a simulator build as a smoke check).

To install the unsigned IPA on a device, sign it with your own certificate/profile — e.g. open the artifact in Xcode, or use a signer such as AltStore/Sideloadly with your Apple ID.

## Project layout

```
Sources/
  AppDelegate.swift / GameViewController.swift   app shell (landscape, SKView)
  Scenes/   MenuScene, LevelSelectScene, SettingsScene, GameScene
  Game/     LevelModel (JSON), PlayerController (custom AABB physics, 6 modes),
            ParallaxBackground, GameProgress
  Audio/    MusicEngine (procedural beat-synced chiptune)
Resources/Levels/   level1–5.json
Tools/level_editor.py
project.yml         XcodeGen project definition
```
