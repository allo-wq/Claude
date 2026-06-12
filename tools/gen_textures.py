#!/usr/bin/env python3
"""Generate all Veilbreak PNG textures (no external deps).

Palette: void-black iron / ghost-cyan soul glow / dying-ember amber.
Entities use the entity_emissive_alpha material, where texel alpha < 255
makes the pixel glow — so 'emissive' pixels here get alpha ~64.
Re-run any time; output is deterministic (seeded RNG).
"""
import os
import random
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "Veilbreak_RP")
BP = os.path.join(ROOT, "Veilbreak_BP")

IRON = (18, 20, 26)
IRON_DARK = (10, 11, 15)
IRON_LIGHT = (34, 38, 48)
CYAN = (84, 232, 227)
CYAN_BRIGHT = (180, 255, 250)
CYAN_DIM = (38, 120, 128)
AMBER = (232, 154, 60)
BONE = (205, 198, 180)
STEEL = (140, 160, 168)

EMISSIVE = 64   # alpha for glowing pixels
SOLID = 255


def write_png(path, w, h, px):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px[y][x]) for x in range(w))
        for y in range(h)
    )
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print("wrote", os.path.relpath(path, ROOT))


class Img:
    def __init__(self, w, h, fill=(0, 0, 0, 0)):
        self.w, self.h = w, h
        self.px = [[fill for _ in range(w)] for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, c)

    def noise(self, x, y, w, h, base, jitter=8, alpha=SOLID, rng=None):
        rng = rng or random
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                j = rng.randint(-jitter, jitter)
                self.set(xx, yy, (clamp(base[0] + j), clamp(base[1] + j), clamp(base[2] + j), alpha))

    def glow(self, x, y, w, h, color, alpha=EMISSIVE, rng=None):
        """Emissive zone with a brighter center."""
        rng = rng or random
        cx, cy = x + w / 2, y + h / 2
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                d = (((xx - cx) / max(1, w / 2)) ** 2 + ((yy - cy) / max(1, h / 2)) ** 2) ** 0.5
                t = max(0.0, 1.0 - d)
                c = tuple(clamp(int(color[i] * (0.55 + 0.45 * t)) + rng.randint(-6, 6)) for i in range(3))
                self.set(xx, yy, (*c, alpha))

    def sprinkle(self, x, y, w, h, color, density, alpha=SOLID, rng=None):
        rng = rng or random
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if rng.random() < density:
                    self.set(xx, yy, (*color, alpha))

    def from_ascii(self, art, palette):
        for yy, row in enumerate(art):
            for xx, ch in enumerate(row):
                if ch in palette:
                    self.set(xx, yy, palette[ch])


def clamp(v):
    return max(0, min(255, v))


def save(img, *rel):
    write_png(os.path.join(*rel), img.w, img.h, img.px)


# ----------------------------------------------------------------- Noxhollow
def noxhollow(rage=False):
    rng = random.Random(7)
    img = Img(128, 128)
    img.noise(0, 0, 128, 128, IRON, 7, rng=rng)
    # plate seams + rivets
    for y in range(0, 128, 8):
        img.noise(0, y, 128, 1, IRON_DARK, 3, rng=rng)
    img.sprinkle(0, 0, 128, 128, IRON_LIGHT, 0.03, rng=rng)
    # ribcage bars (uv 0,14 52x24)
    for x in range(2, 52, 6):
        img.noise(x, 14, 2, 24, IRON_DARK, 4, rng=rng)
    # amber ember flecks on ribcage and hips
    img.sprinkle(0, 0, 52, 38, AMBER, 0.05 if rage else 0.025, rng=rng)
    glow_c = CYAN_BRIGHT if rage else CYAN
    glow_a = 40 if rage else EMISSIVE
    img.glow(52, 0, 24, 12, glow_c, glow_a, rng=rng)    # soul core
    img.glow(96, 0, 24, 14, glow_c, glow_a, rng=rng)    # skull glow
    img.glow(74, 40, 12, 8, glow_c, glow_a, rng=rng)    # lantern flame
    # cage bars over the head-cage uv (56,14 40x22)
    for x in range(58, 96, 5):
        img.noise(x, 14, 2, 22, IRON_DARK, 4, rng=rng)
    return img


# ----------------------------------------------------------------- others
def wisp():
    rng = random.Random(11)
    img = Img(32, 32)
    img.glow(0, 0, 32, 32, CYAN_DIM, 110, rng=rng)
    img.glow(0, 0, 24, 12, CYAN, 80, rng=rng)        # body
    img.glow(8, 3, 8, 6, CYAN_BRIGHT, 50, rng=rng)   # inner core
    return img


def roadster():
    rng = random.Random(23)
    img = Img(128, 128)
    img.noise(0, 0, 128, 128, IRON, 6, rng=rng)
    img.sprinkle(0, 0, 128, 51, AMBER, 0.015, rng=rng)        # chassis trim
    img.noise(0, 51, 64, 22, (26, 40, 52), 6, rng=rng)        # cabin glass tint
    img.sprinkle(0, 51, 64, 22, (60, 110, 130), 0.12, rng=rng)
    img.glow(64, 60, 10, 3, CYAN, 50, rng=rng)                # headlights
    img.glow(80, 60, 34, 3, AMBER, 80, rng=rng)               # taillight bar
    img.noise(0, 80, 128, 48, IRON_DARK, 5, rng=rng)          # wheels
    for x0 in (0, 24, 48, 72):                                # hub rims
        img.sprinkle(x0 + 6, 84, 10, 8, STEEL, 0.3, rng=rng)
        img.glow(x0 + 9, 86, 4, 4, CYAN_DIM, 120, rng=rng)    # soul hub
    return img


def soulrend_tex():
    rng = random.Random(31)
    img = Img(64, 64)
    img.noise(0, 0, 64, 64, IRON, 6, rng=rng)
    img.noise(0, 0, 10, 32, (38, 32, 28), 6, rng=rng)         # wrapped handle
    img.noise(20, 0, 26, 46, STEEL, 10, rng=rng)              # blade steel
    img.glow(20, 0, 26, 3, CYAN, 70, rng=rng)                 # cutting edges
    img.glow(20, 14, 26, 3, CYAN, 70, rng=rng)
    img.glow(20, 30, 26, 3, CYAN, 70, rng=rng)
    img.sprinkle(8, 0, 12, 6, AMBER, 0.2, rng=rng)            # guard inlay
    return img


def lantern_tex():
    rng = random.Random(41)
    img = Img(32, 32)
    img.noise(0, 0, 32, 32, IRON, 6, rng=rng)
    for x in range(1, 24, 4):                                  # cage bars
        img.noise(x, 0, 2, 14, IRON_DARK, 4, rng=rng)
    img.glow(0, 14, 16, 9, CYAN, 60, rng=rng)                  # soul flame
    img.sprinkle(16, 14, 16, 9, AMBER, 0.12, rng=rng)          # crown/bail trim
    return img


def soul_ember_tex():
    rng = random.Random(43)
    img = Img(16, 16)
    img.glow(0, 0, 16, 16, CYAN, 60, rng=rng)
    img.glow(4, 4, 8, 8, CYAN_BRIGHT, 45, rng=rng)
    return img


def dim_iron_tex():
    rng = random.Random(53)
    img = Img(16, 16)
    img.noise(0, 0, 16, 16, IRON, 6, rng=rng)
    img.noise(0, 0, 16, 1, IRON_DARK, 3, rng=rng)
    img.noise(0, 15, 16, 1, IRON_DARK, 3, rng=rng)
    img.noise(0, 0, 1, 16, IRON_DARK, 3, rng=rng)
    img.noise(15, 0, 1, 16, IRON_DARK, 3, rng=rng)
    img.sprinkle(2, 2, 12, 12, IRON_LIGHT, 0.08, rng=rng)
    img.sprinkle(2, 2, 12, 12, AMBER, 0.03, rng=rng)
    return img


def skull_tex():
    rng = random.Random(59)
    img = Img(32, 32)
    # cage uv (0,0 32x17): vertical bars with see-through gaps (alpha_test)
    img.noise(0, 0, 32, 17, IRON, 6, rng=rng)
    for x in range(32):
        if x % 4 >= 2:
            for y in range(2, 15):
                img.set(x, y, (0, 0, 0, 0))
    # inner skull uv (0,17 20x11)
    img.noise(0, 17, 20, 11, BONE, 10, rng=rng)
    img.rect(4, 20, 2, 2, (*CYAN, 255))   # eyes
    img.rect(12, 20, 2, 2, (*CYAN, 255))
    img.rect(8, 24, 3, 1, IRON_DARK + (255,))
    # finial uv (20,17)
    img.noise(20, 17, 12, 11, IRON_DARK, 4, rng=rng)
    return img


# ----------------------------------------------------------------- icons (16x16)
def icon(art, palette):
    img = Img(16, 16)
    img.from_ascii(art, palette)
    return img


P = {
    "h": (38, 32, 28, 255),        # handle
    "d": (*IRON, 255),             # dark iron
    "D": (*IRON_DARK, 255),
    "C": (*CYAN, 255),             # cyan bright
    "c": (*CYAN_DIM, 255),
    "W": (*CYAN_BRIGHT, 255),
    "A": (*AMBER, 255),
    "a": (150, 95, 40, 255),
    "B": (*BONE, 255),
    "s": (*STEEL, 255),
}

SOULREND_ICON = [
    "....ccCCCCcc....",
    "..cCCWWWWWWCCc..",
    ".cCWWss..ssWWC..",
    ".CWs........sWC.",
    ".Cs..........WC.",
    "...........hsC..",
    "..........hh.C..",
    ".........hh.....",
    "........hh......",
    ".......hh.......",
    "......hh........",
    ".....hh.........",
    "....hh..........",
    "...hh...........",
    "..hh............",
    ".hh.............",
]

LANTERN_ICON = [
    "................",
    "......dd........",
    ".....d..d.......",
    "....dddddd......",
    "...dDddddDd.....",
    "...dD.CC.Dd.....",
    "...d.CWWC.d.....",
    "...d.CWWC.d.....",
    "...dDCWWCDd.....",
    "...dD.CC.Dd.....",
    "...dDddddDd.....",
    "....dddddd......",
    ".....aAAa.......",
    "................",
    "................",
    "................",
]

WICK_ICON = [
    "................",
    ".......C........",
    "......CWC.......",
    "......CWC.......",
    ".......c........",
    ".......B........",
    "......BBB.......",
    "......BBB.......",
    "......BBB.......",
    "......BBB.......",
    "......BBB.......",
    "......BBB.......",
    ".....dBBBd......",
    ".....ddddd......",
    "................",
    "................",
]

KEY_ICON = [
    "................",
    "....AAAA........",
    "...A....A.......",
    "...A.CC.A.......",
    "...A.CC.A.......",
    "...A....A.......",
    "....AAAA........",
    "......A.........",
    "......A.........",
    "......AA........",
    "......A.........",
    "......AA........",
    "......A.........",
    "......AAA.......",
    "................",
    "................",
]

IRON_ICON = [
    "................",
    "................",
    "................",
    "....dddddddd....",
    "...dDddddddDd...",
    "..dDddCcddddDd..",
    "..dDdddCCddsDd..",
    ".dDddddddCdddDd.",
    ".dDdsddddddAdDd.",
    ".dDddddAdddddDd.",
    ".dDDDDDDDDDDDDd.",
    "..dddddddddddd..",
    "................",
    "................",
    "................",
    "................",
]


def pack_icon():
    rng = random.Random(61)
    img = Img(128, 128)
    img.noise(0, 0, 128, 128, IRON_DARK, 4, rng=rng)
    img.glow(24, 24, 80, 80, CYAN_DIM, 255, rng=rng)   # ambient halo (not emissive; icon only)
    img.glow(40, 36, 48, 56, CYAN, 255, rng=rng)
    for x in range(40, 88, 8):                          # cage bars over the light
        img.noise(x, 28, 3, 72, IRON_DARK, 3, rng=rng)
    img.noise(36, 22, 56, 6, IRON, 5, rng=rng)          # lantern lid
    img.noise(36, 100, 56, 6, IRON, 5, rng=rng)         # lantern base
    img.sprinkle(36, 100, 56, 6, AMBER, 0.15, rng=rng)
    return img


def main():
    save(noxhollow(False), RP, "textures/entity/noxhollow.png")
    save(noxhollow(True), RP, "textures/entity/noxhollow_rage.png")
    save(wisp(), RP, "textures/entity/wisp.png")
    save(roadster(), RP, "textures/entity/hollow_roadster.png")
    save(soulrend_tex(), RP, "textures/entity/soulrend.png")
    save(lantern_tex(), RP, "textures/entity/hollow_lantern.png")
    save(soul_ember_tex(), RP, "textures/entity/soul_ember.png")
    save(dim_iron_tex(), RP, "textures/blocks/dim_iron.png")
    save(skull_tex(), RP, "textures/blocks/noxhollow_skull.png")
    save(icon(SOULREND_ICON, P), RP, "textures/items/soulrend_icon.png")
    save(icon(LANTERN_ICON, P), RP, "textures/items/hollow_lantern_icon.png")
    save(icon(WICK_ICON, P), RP, "textures/items/wick_of_souls.png")
    save(icon(KEY_ICON, P), RP, "textures/items/roadster_key.png")
    save(icon(IRON_ICON, P), RP, "textures/items/soulforged_iron.png")
    save(pack_icon(), RP, "pack_icon.png")
    save(pack_icon(), BP, "pack_icon.png")


if __name__ == "__main__":
    main()
