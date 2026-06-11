#!/usr/bin/env python3
"""Generate all binary assets (PNG textures, WAV sounds) for the Black Hole add-on.

No third-party dependencies: PNGs are written with zlib/struct, sounds with the
stdlib wave module. Run from anywhere; paths are resolved relative to this file.
"""

import math
import os
import random
import struct
import wave
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "BlackHoleRP")
BP = os.path.join(ROOT, "packs", "BlackHoleBP")

random.seed(42)


# ----------------------------------------------------------------------
# Minimal PNG writer (RGBA, 8-bit)
# ----------------------------------------------------------------------

def write_png(path, width, height, pixels):
    """pixels: function (x, y) -> (r, g, b, a)"""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: none
        for x in range(width):
            r, g, b, a = pixels(x, y)
            raw += bytes((clamp8(r), clamp8(g), clamp8(b), clamp8(a)))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(path, ROOT))


def clamp8(v):
    return max(0, min(255, int(v)))


def lerp(a, b, t):
    return a + (b - a) * t


# ----------------------------------------------------------------------
# Textures
# ----------------------------------------------------------------------

def tex_entity():
    """128x128 atlas: y0-28 core (near black), y28-56 shells (translucent
    purple swirl), y56-108 accretion disk (glowing purple/orange bands)."""
    noise = [[random.random() for _ in range(128)] for _ in range(128)]

    def px(x, y):
        n = noise[y][x]
        if y < 28:  # core: almost pure black with faint violet flecks
            v = 4 + n * 10
            return (v, 2, v * 1.8, 255)
        if y < 56:  # shells: swirling translucent purple
            band = (math.sin(x * 0.45 + y * 0.8) + 1) / 2
            a = 60 + band * 90 + n * 30
            return (60 + band * 90, 10 + band * 30, 120 + band * 120, a)
        if y < 108:  # disk: hot bands fading outward
            band = (math.sin(x * 0.30 + y * 1.1) + 1) / 2
            heat = (math.sin(y * 0.6) + 1) / 2
            r = lerp(120, 255, band * heat)
            g = lerp(20, 120, band * heat * 0.6)
            b = lerp(160, 255, band)
            return (r, g, b, 150 + band * 105)
        return (0, 0, 0, 0)

    write_png(os.path.join(RP, "textures", "entity", "black_hole.png"), 128, 128, px)


def tex_glow():
    """32x32 soft radial glow, white core -> transparent edge."""
    def px(x, y):
        d = math.hypot(x - 15.5, y - 15.5) / 15.5
        a = max(0.0, 1.0 - d) ** 2.2
        return (255, 255, 255, a * 255)

    write_png(os.path.join(RP, "textures", "particle", "bh_glow.png"), 32, 32, px)


def tex_shard():
    """16x16 chunky block shard with rough edges."""
    def px(x, y):
        cx, cy = abs(x - 7.5), abs(y - 7.5)
        if max(cx, cy) > 6:
            return (0, 0, 0, 0)
        n = random.random()
        if max(cx, cy) > 5 and n < 0.45:
            return (0, 0, 0, 0)
        v = 140 + n * 90
        return (v, v * 0.92, v * 0.85, 255)

    random.seed(7)
    write_png(os.path.join(RP, "textures", "particle", "bh_shard.png"), 16, 16, px)


def tex_singularity_core():
    """16x16 item: black orb, purple event-horizon ring, white spark."""
    def px(x, y):
        d = math.hypot(x - 7.5, y - 7.5)
        if d > 7.2:
            return (0, 0, 0, 0)
        if d > 6.0:  # outer glow ring
            return (150, 60, 255, 200)
        if d > 4.6:  # bright horizon
            return (210, 130, 255, 255)
        if d < 1.3:  # singular spark
            return (255, 255, 255, 255)
        swirl = (math.sin(math.atan2(y - 7.5, x - 7.5) * 3 + d * 2.2) + 1) / 2
        return (10 + swirl * 45, 0, 18 + swirl * 70, 255)

    write_png(os.path.join(RP, "textures", "items", "singularity_core.png"), 16, 16, px)


def tex_stabilizer_rod():
    """16x16 item: diagonal cyan-tipped rod."""
    def px(x, y):
        # rod along the anti-diagonal
        t = x + (15 - y)
        d = abs(x - (15 - y))
        if d > 2 or t < 6 or t > 26:
            return (0, 0, 0, 0)
        if t > 22:  # crystal tip
            return (140, 240, 255, 255)
        if d == 0:
            return (200, 215, 225, 255)
        return (120, 135, 150, 255)

    write_png(os.path.join(RP, "textures", "items", "stabilizer_rod.png"), 16, 16, px)


def tex_pack_icon(path):
    """128x128 spiral galaxy on black."""
    def px(x, y):
        dx, dy = x - 63.5, y - 63.5
        d = math.hypot(dx, dy)
        if d > 62:
            return (0, 0, 0, 255)
        ang = math.atan2(dy, dx)
        spiral = (math.sin(ang * 2 - d * 0.22) + 1) / 2
        fall = max(0.0, 1 - d / 62)
        if d < 10:  # event horizon
            ring = max(0.0, 1 - abs(d - 9) / 2)
            return (40 + ring * 200, 10 + ring * 120, 60 + ring * 195, 255)
        v = spiral * fall
        return (30 + v * 170, 5 + v * 60, 50 + v * 205, 255)

    write_png(path, 128, 128, px)


# ----------------------------------------------------------------------
# Sounds (mono 16-bit 22050 Hz WAV)
# ----------------------------------------------------------------------

SR = 22050


def write_wav(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(
            b"".join(
                struct.pack("<h", clamp16(int(s * 32767))) for s in samples
            )
        )
    print("wrote", os.path.relpath(path, ROOT))


def clamp16(v):
    return max(-32767, min(32767, v))


def snd_hum():
    """3.0 s seamless deep hum: stacked low sines with slow wobble.
    All frequencies are multiples of 1/3 Hz so the clip loops cleanly."""
    dur = 3.0
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        wob = 0.75 + 0.25 * math.sin(2 * math.pi * t / 3.0)
        s = (
            0.50 * math.sin(2 * math.pi * 45 * t)
            + 0.28 * math.sin(2 * math.pi * 90 * t + 1.3)
            + 0.16 * math.sin(2 * math.pi * 30 * t + 0.5)
            + 0.10 * math.sin(2 * math.pi * 135 * t + 2.1)
        )
        out.append(s * wob * 0.55)
    write_wav(os.path.join(RP, "sounds", "bh", "hum.wav"), out)


def snd_distort():
    """2.0 s eerie detuned drone with a falling sweep and tremolo."""
    dur = 2.0
    n = int(SR * dur)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        p = t / dur
        env = math.sin(math.pi * p) ** 1.5  # fade in/out
        sweep_f = 380 * (1 - p) + 70  # falling tone
        phase += 2 * math.pi * sweep_f / SR
        trem = 0.6 + 0.4 * math.sin(2 * math.pi * 9 * t)
        s = (
            0.35 * math.sin(2 * math.pi * 110 * t)
            + 0.35 * math.sin(2 * math.pi * 113.5 * t)
            + 0.30 * math.sin(phase) * trem
        )
        out.append(s * env * 0.6)
    write_wav(os.path.join(RP, "sounds", "bh", "distort.wav"), out)


def snd_collapse():
    """1.6 s implosion: noise burst with exponential decay + pitch drop."""
    dur = 1.6
    n = int(SR * dur)
    out = []
    random.seed(3)
    phase = 0.0
    lp = 0.0
    for i in range(n):
        t = i / SR
        p = t / dur
        env = math.exp(-4.5 * p)
        f = 320 * math.exp(-3.0 * p) + 28
        phase += 2 * math.pi * f / SR
        noise = random.uniform(-1, 1)
        lp += 0.12 * (noise - lp)  # crude low-pass rumble
        s = 0.7 * math.sin(phase) + 0.8 * lp
        out.append(s * env * 0.85)
    write_wav(os.path.join(RP, "sounds", "bh", "collapse.wav"), out)


if __name__ == "__main__":
    tex_entity()
    tex_glow()
    tex_shard()
    tex_singularity_core()
    tex_stabilizer_rod()
    tex_pack_icon(os.path.join(RP, "pack_icon.png"))
    tex_pack_icon(os.path.join(BP, "pack_icon.png"))
    snd_hum()
    snd_distort()
    snd_collapse()
    print("done")
