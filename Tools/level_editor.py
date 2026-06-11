#!/usr/bin/env python3
"""Tile-based level editor / generator for Geometry Rush.

Levels are plain JSON (see Resources/Levels/). Grid: x = column, y = rows
above the ground line, 1 tile = 64pt in-game. Everything is authored on a
beat grid: `tiles_per_beat` columns pass per music beat, so obstacles land
on beats.

Usage:
  python3 Tools/level_editor.py generate            # regenerate the 5 shipped levels
  python3 Tools/level_editor.py render <file.json>  # ASCII preview of a level
  python3 Tools/level_editor.py validate <file.json>

Tile types: block, spike, spikeDown, pad, orb, portalCube, portalShip,
portalBall, portalUfo, portalWave, portalRobot, gravityFlip, gravityNormal,
checkpoint, finish.
"""
import json
import os
import sys

TILE = 64
VALID_TYPES = {
    "block", "spike", "spikeDown", "pad", "orb",
    "portalCube", "portalShip", "portalBall", "portalUfo", "portalWave",
    "portalRobot", "gravityFlip", "gravityNormal", "checkpoint", "finish",
}
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "Resources", "Levels")


class LevelBuilder:
    """Cursor-based builder: patterns append at self.x and advance it."""

    def __init__(self, id, name, difficulty, bpm, tiles_per_beat, start_mode, theme):
        self.id = id
        self.name = name
        self.difficulty = difficulty
        self.bpm = bpm
        self.tiles_per_beat = tiles_per_beat
        # speed chosen so exactly tiles_per_beat columns pass per beat
        self.speed = tiles_per_beat * TILE * bpm / 60.0
        self.start_mode = start_mode
        self.theme = theme
        self.tiles = []
        self.x = 0

    def put(self, t, x, y):
        self.tiles.append({"t": t, "x": int(x), "y": int(y)})

    def gap(self, beats=1):
        """Empty runway."""
        self.x += int(beats * self.tiles_per_beat)
        return self

    # ---- cube/robot patterns -------------------------------------------
    def spike_row(self, count=1, rest_beats=1):
        """`count` ground spikes then a rest. Max jumpable ~3."""
        for i in range(count):
            self.put("spike", self.x + i, 0)
        self.x += count
        self.gap(rest_beats)
        return self

    def block_step(self, height=1, width=2, spikes_before=0, rest_beats=1):
        """Raised platform `height` tiles up; optional spikes at its base."""
        for i in range(spikes_before):
            self.put("spike", self.x + i, 0)
        self.x += spikes_before
        for w in range(width):
            for h in range(height):
                self.put("block", self.x + w, h)
        self.x += width
        self.gap(rest_beats)
        return self

    def platform_gap(self, height=2, width=3, pit_spikes=2, rest_beats=1):
        """Floating platform with spikes underneath — jump across on top."""
        for i in range(pit_spikes):
            self.put("spike", self.x + 1 + i, 0)
        for w in range(width):
            self.put("block", self.x + w, height)
        self.x += max(width, pit_spikes + 2)
        self.gap(rest_beats)
        return self

    def pad_launch(self, over_spikes=4, rest_beats=1):
        """Yellow pad flinging the player over a spike field."""
        self.put("pad", self.x, 0)
        for i in range(over_spikes):
            self.put("spike", self.x + 1 + i, 0)
        self.x += 1 + over_spikes
        self.gap(rest_beats)
        return self

    def orb_chain(self, spikes=5, orb_y=2, rest_beats=1):
        """Spike field crossed by tapping a mid-air orb."""
        self.put("spike", self.x - 1, 0)
        for i in range(spikes):
            self.put("spike", self.x + i, 0)
        self.put("orb", self.x + spikes // 2, orb_y)
        self.x += spikes
        self.gap(rest_beats)
        return self

    # ---- ship/wave/ufo corridors ---------------------------------------
    def corridor(self, length=12, floor=0, ceil=7, pillars_every=0, pillar_gap_y=3):
        """Tunnel with optional alternating pillars to weave through."""
        for i in range(length):
            cx = self.x + i
            if floor > 0:
                for y in range(floor):
                    self.put("block", cx, y)
            for y in range(ceil, 11):
                self.put("block", cx, y)
            if pillars_every and i % pillars_every == pillars_every // 2:
                opening = pillar_gap_y + (1 if (i // pillars_every) % 2 else -1)
                opening = max(floor + 1, min(ceil - 3, opening))
                for y in range(floor, ceil):
                    if not (opening <= y < opening + 3):
                        self.put("block", cx, y)
        self.x += length
        return self

    # ---- portals & meta --------------------------------------------------
    def portal(self, kind, y=2):
        self.put(kind, self.x, y)
        self.x += 2
        return self

    def checkpoint_marker(self):
        self.put("checkpoint", self.x, 1)
        return self

    def finish(self):
        self.gap(2)
        self.put("finish", self.x, 0)
        self.x += 2
        return self

    def build(self):
        return {
            "id": self.id,
            "name": self.name,
            "difficulty": self.difficulty,
            "bpm": self.bpm,
            "speed": round(self.speed, 1),
            "startMode": self.start_mode,
            "theme": self.theme,
            "beats": None,
            "tiles": sorted(self.tiles, key=lambda t: (t["x"], t["y"])),
        }


# ---------------------------------------------------------------------------
# The five shipped levels
# ---------------------------------------------------------------------------

def level1():
    b = LevelBuilder(1, "Stereo Steps", "Easy", 100, 2, "cube",
                     {"top": "#1a2b6d", "bottom": "#0a0f2e", "ground": "#2233aa", "accent": "#00e5ff"})
    b.gap(4)
    b.spike_row(1, 2).spike_row(1, 2).spike_row(2, 2)
    b.checkpoint_marker()
    b.block_step(1, 3, rest_beats=2).block_step(1, 2, spikes_before=1, rest_beats=2)
    b.spike_row(2, 2).spike_row(1, 1).spike_row(1, 2)
    b.checkpoint_marker()
    b.pad_launch(4, 2)
    b.platform_gap(2, 3, 2, 2)
    b.spike_row(2, 2).spike_row(3, 2)
    b.checkpoint_marker()
    b.block_step(1, 2, rest_beats=1).block_step(2, 2, rest_beats=2)
    b.spike_row(1, 1).spike_row(1, 1).spike_row(2, 2)
    b.finish()
    return b.build()


def level2():
    b = LevelBuilder(2, "Neon Flight", "Normal", 115, 2, "cube",
                     {"top": "#3d1a5b", "bottom": "#120a2e", "ground": "#7b2fbf", "accent": "#ff2ec4"})
    b.gap(4)
    b.spike_row(2, 1).spike_row(2, 1).spike_row(3, 2)
    b.block_step(1, 2, spikes_before=1, rest_beats=1).block_step(2, 2, rest_beats=2)
    b.checkpoint_marker()
    # ship section
    b.portal("portalShip", 2)
    b.corridor(10, floor=0, ceil=7)
    b.corridor(14, floor=1, ceil=6, pillars_every=5, pillar_gap_y=3)
    b.corridor(8, floor=0, ceil=7)
    b.checkpoint_marker()
    b.portal("portalCube", 2)
    b.gap(2)
    b.orb_chain(5, 2, 2)
    b.spike_row(3, 2)
    b.pad_launch(5, 2)
    b.checkpoint_marker()
    b.platform_gap(2, 3, 3, 1).spike_row(2, 1).spike_row(2, 2)
    b.finish()
    return b.build()


def level3():
    b = LevelBuilder(3, "Bounce Circuit", "Hard", 128, 2, "cube",
                     {"top": "#0b4a2f", "bottom": "#03160d", "ground": "#0e8a4f", "accent": "#aaff00"})
    b.gap(4)
    b.spike_row(2, 1).spike_row(3, 1).spike_row(2, 2)
    b.checkpoint_marker()
    # ball section: ceiling + floor spikes, flip between them
    b.portal("portalBall", 2)
    b.gap(2)
    for i in range(4):
        b.put("spike", b.x, 0)
        b.put("spike", b.x + 1, 0)
        b.x += 2
        b.gap(1)
        b.put("spikeDown", b.x, 10)
        b.put("spikeDown", b.x + 1, 10)
        b.x += 2
        b.gap(1)
    b.checkpoint_marker()
    # ufo section
    b.portal("portalUfo", 2)
    b.corridor(16, floor=1, ceil=7, pillars_every=6, pillar_gap_y=3)
    b.checkpoint_marker()
    b.portal("portalCube", 2)
    b.gap(2)
    b.portal("gravityFlip", 4)
    b.corridor(8, floor=0, ceil=5)
    b.portal("gravityNormal", 4)
    b.gap(2)
    b.spike_row(3, 1).orb_chain(6, 2, 1).spike_row(2, 2)
    b.finish()
    return b.build()


def level4():
    b = LevelBuilder(4, "Wavelength", "Harder", 140, 2, "cube",
                     {"top": "#5b1a1a", "bottom": "#1c0505", "ground": "#bf2f2f", "accent": "#ffb300"})
    b.gap(4)
    b.spike_row(3, 1).spike_row(2, 1).pad_launch(5, 1)
    b.checkpoint_marker()
    # wave corridors, narrowing
    b.portal("portalWave", 3)
    b.corridor(10, floor=1, ceil=8)
    b.corridor(12, floor=2, ceil=7)
    b.corridor(12, floor=3, ceil=7)
    b.checkpoint_marker()
    # robot: timed high/low jumps
    b.portal("portalRobot", 2)
    b.gap(2)
    b.spike_row(2, 1).block_step(2, 2, spikes_before=2, rest_beats=1)
    b.platform_gap(3, 3, 3, 1).spike_row(3, 1)
    b.checkpoint_marker()
    # ship gauntlet
    b.portal("portalShip", 2)
    b.corridor(18, floor=2, ceil=6, pillars_every=5, pillar_gap_y=3)
    b.portal("portalCube", 2)
    b.gap(2)
    b.spike_row(3, 1).spike_row(3, 1).orb_chain(6, 2, 1)
    b.finish()
    return b.build()


def level5():
    b = LevelBuilder(5, "Overdrive", "Insane", 160, 2, "cube",
                     {"top": "#33104d", "bottom": "#0d0314", "ground": "#8a0e6f", "accent": "#ff3355"})
    b.gap(4)
    b.spike_row(3, 1).spike_row(3, 1).spike_row(2, 1).spike_row(3, 1)
    b.checkpoint_marker()
    b.portal("portalWave", 3)
    b.corridor(12, floor=2, ceil=7)
    b.corridor(14, floor=3, ceil=6)
    b.checkpoint_marker()
    b.portal("portalBall", 2)
    b.gap(1)
    for i in range(5):
        b.put("spike", b.x, 0)
        b.put("spike", b.x + 1, 0)
        b.x += 2
        b.put("spikeDown", b.x + 1, 10)
        b.put("spikeDown", b.x + 2, 10)
        b.x += 3
    b.checkpoint_marker()
    b.portal("portalUfo", 2)
    b.corridor(18, floor=1, ceil=6, pillars_every=4, pillar_gap_y=3)
    b.checkpoint_marker()
    b.portal("portalRobot", 2)
    b.gap(2)
    b.block_step(2, 2, spikes_before=2, rest_beats=1)
    b.platform_gap(3, 2, 4, 1)
    b.spike_row(3, 1)
    b.checkpoint_marker()
    b.portal("portalShip", 2)
    b.corridor(20, floor=2, ceil=6, pillars_every=4, pillar_gap_y=3)
    b.portal("gravityFlip", 4)
    b.corridor(10, floor=2, ceil=6)
    b.portal("gravityNormal", 4)
    b.portal("portalCube", 2)
    b.gap(2)
    b.spike_row(3, 1).orb_chain(7, 2, 1).spike_row(3, 1).spike_row(3, 1)
    b.finish()
    return b.build()


# ---------------------------------------------------------------------------

def generate():
    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in (level1, level2, level3, level4, level5):
        level = fn()
        path = os.path.join(OUT_DIR, f"level{level['id']}.json")
        with open(path, "w") as f:
            json.dump(level, f, indent=1)
        n = len(level["tiles"])
        length = max(t["x"] for t in level["tiles"]) + 2
        dur = length * TILE / level["speed"]
        print(f"wrote {path}: {n} tiles, {length} cols, ~{dur:.0f}s @ {level['bpm']} BPM")


def validate(path):
    with open(path) as f:
        level = json.load(f)
    errors = []
    for key in ("id", "name", "difficulty", "bpm", "speed", "startMode", "theme", "tiles"):
        if key not in level:
            errors.append(f"missing key: {key}")
    for i, t in enumerate(level.get("tiles", [])):
        if t.get("t") not in VALID_TYPES:
            errors.append(f"tile {i}: unknown type {t.get('t')!r}")
        if not (0 <= t.get("y", -1) <= 11):
            errors.append(f"tile {i}: y={t.get('y')} out of range 0..11")
        if t.get("x", -1) < 0:
            errors.append(f"tile {i}: negative x")
    if not any(t["t"] == "finish" for t in level.get("tiles", [])):
        errors.append("no finish tile")
    if errors:
        print(f"INVALID: {path}")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print(f"OK: {path} ({len(level['tiles'])} tiles)")


CHARS = {
    "block": "#", "spike": "^", "spikeDown": "v", "pad": "_", "orb": "o",
    "portalCube": "C", "portalShip": "S", "portalBall": "B", "portalUfo": "U",
    "portalWave": "W", "portalRobot": "R", "gravityFlip": "g", "gravityNormal": "G",
    "checkpoint": "+", "finish": "|",
}


def render(path):
    with open(path) as f:
        level = json.load(f)
    width = max(t["x"] for t in level["tiles"]) + 2
    grid = [[" "] * width for _ in range(12)]
    for t in level["tiles"]:
        grid[t["y"]][t["x"]] = CHARS.get(t["t"], "?")
    print(f"{level['name']} [{level['difficulty']}] {level['bpm']} BPM, speed {level['speed']}")
    for row in reversed(grid):
        print("".join(row))
    print("=" * width)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("generate", "render", "validate"):
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == "generate":
        generate()
    elif sys.argv[1] == "render":
        render(sys.argv[2])
    else:
        validate(sys.argv[2])
