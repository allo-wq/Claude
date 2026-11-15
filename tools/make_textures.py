#!/usr/bin/env python3
"""Generates every texture used by the Elemental Relics add-on.

All art is drawn from the ASCII grids / procedures below, so the PNGs in the
resource pack can always be rebuilt with:  python3 tools/make_textures.py
"""
import math
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "resource_pack")
BP = os.path.join(ROOT, "behavior_pack")


def rgb(hexstr, alpha=255):
    hexstr = hexstr.lstrip("#")
    return (int(hexstr[0:2], 16), int(hexstr[2:4], 16), int(hexstr[4:6], 16), alpha)


def sprite(rows, palette):
    """Turn a list of 16 strings into a 16x16 RGBA image."""
    assert len(rows) == 16, len(rows)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == 16, (y, row, len(row))
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), palette[ch])
    return img


# --------------------------------------------------------------------------
# Staffs
# --------------------------------------------------------------------------
WOOD = {
    "o": rgb("2a1a10"),
    "w": rgb("6e4526"),
    "W": rgb("a3713f"),
    "m": rgb("c8921c"),
    "M": rgb("ffdf6b"),
    "s": rgb("ffffff"),
}

SHAFT = [
    ".......oWwo.....",
    "......oWwo......",
    ".....oWwo.......",
    "....oWwo........",
    "...oWwo.........",
    "..oWwo..........",
    ".oWwo...........",
    ".owo............",
    "..o.............",
]

STAFFS = {
    "storm_staff": {
        "gem": {"G": "fff6a0", "g": "f7c81e", "d": "b97f0a", "k": "4a3300", "a": "8fe3ff"},
        "head": [
            "...........kkk.a",
            ".........akGGgk.",
            ".........kGsggdk",
            "........akGgggdk",
            ".........kgggddk",
            "........mMkdddk.",
            "........oMmkkk.a",
        ],
    },
    "inferno_staff": {
        "gem": {"G": "ffe066", "g": "ff7b1c", "d": "c4260d", "k": "4d0d05", "a": "ffb347"},
        "head": [
            "............k...",
            "...........kGk.a",
            "..........kGgdk.",
            ".........kGsgddk",
            ".........kgGggdk",
            "........mMkgddk.",
            "........oMmkkk..",
        ],
    },
    "frost_staff": {
        "gem": {"G": "f2fdff", "g": "8fdcff", "d": "3b8fd6", "k": "17375f", "a": "d6f6ff"},
        "head": [
            ".............k..",
            "..........a.kGk.",
            "..........kkGgk.",
            ".........kGsgdk.",
            ".........kGgdkk.",
            "........mMkdk..a",
            "........oMmk....",
        ],
    },
    "void_staff": {
        "gem": {"G": "f0c4ff", "g": "a548e6", "d": "4c1688", "k": "1c0633", "a": "d77dff"},
        "head": [
            "...........kkk..",
            ".........akdddk.",
            ".........kdGgddk",
            "........akdgsddk",
            ".........kdddddk",
            "........mMkdddk.",
            "........oMmkkk.a",
        ],
    },
    "gale_staff": {
        "gem": {"G": "f6fffb", "g": "aaf0d1", "d": "58b894", "k": "1f5743", "a": "e0fff2"},
        "head": [
            "..........kkkk..",
            ".........kGGggk.",
            "........kGskkgdk",
            "........kGk.kgdk",
            ".........kk.kgdk",
            "........mM.kgdk.",
            "........oMmkkk..",
        ],
    },
    "verdant_staff": {
        "gem": {"G": "d4ff8a", "g": "62d23c", "d": "2c8c20", "k": "0e3a0b", "a": "ff8fc0"},
        "head": [
            "...........kk.a.",
            "..........kGgk..",
            ".......kkkGsggk.",
            "......kGgkgggdk.",
            ".......kkdkgddk.",
            "........mMkddk..",
            "........oMmkk...",
        ],
    },
}


def make_staff(spec):
    palette = dict(WOOD)
    for key, value in spec["gem"].items():
        palette[key] = rgb(value)
    return sprite(spec["head"] + SHAFT, palette)


# --------------------------------------------------------------------------
# Arcane shard + Relic Codex
# --------------------------------------------------------------------------
SHARD_PALETTE = {
    "k": rgb("1b1140"),
    "G": rgb("e6fbff"),
    "g": rgb("6fe3ff"),
    "c": rgb("39a9f0"),
    "d": rgb("7a4fe0"),
    "p": rgb("4a2aa6"),
    "s": rgb("ffffff"),
}
SHARD = [
    "................",
    ".........k......",
    "........kGk.....",
    ".......kGgck....",
    ".......kGgck....",
    "......kGsgcdk...",
    "......kGggcdk...",
    ".....kGGgccdk...",
    ".....kGggcddk...",
    ".....kggccdpk...",
    "....kgccddppk...",
    "....kccddppk....",
    ".....kddppk.....",
    "......kppk......",
    ".......kk.......",
    "................",
]

CODEX_PALETTE = {
    "k": rgb("170a2e"),
    "P": rgb("8a4fd8"),
    "p": rgb("5c2ea6"),
    "q": rgb("3d1c78"),
    "m": rgb("c8921c"),
    "M": rgb("ffdf6b"),
    "G": rgb("e6fbff"),
    "g": rgb("6fe3ff"),
    "c": rgb("2f9bd8"),
    "w": rgb("efe6cf"),
    "x": rgb("b9ad8c"),
}
CODEX = [
    "................",
    "..kkkkkkkkkkk...",
    ".kMPPPPPPPPPMk..",
    ".kPppppppppppkw.",
    ".kPpppkkkppppkw.",
    ".kPppkGgckpppkx.",
    ".kPpkGggcckppkw.",
    ".kPpkggcccktpkw.".replace("t", "p"),
    ".kPppkccckpppkx.",
    ".kPpppkkkppppkw.",
    ".kPppppppppppkw.",
    ".kPpmmmmmmmppkx.",
    ".kmqqqqqqqqqmkw.",
    "..kkkkkkkkkkkx..",
    "...xwwxwwxwwx...",
    "................",
]


# --------------------------------------------------------------------------
# Arcane ore block
# --------------------------------------------------------------------------
ORE_MASK = [
    "................",
    "..cC.......d....",
    ".cGCd.....cC....",
    "..dd.....cGCd...",
    "..........cdd...",
    "......cC........",
    ".....cGCd....c..",
    "......cdd...cCd.",
    ".............d..",
    "...cC...........",
    "..cGCd....cC....",
    "...cdd...cGcd...",
    "..........dd....",
    ".....cC.........",
    "....cCd.....cd..",
    "................",
]
ORE_COLORS = {
    "G": rgb("f0fdff"),
    "C": rgb("7ce8ff"),
    "c": rgb("3fb2f2"),
    "d": rgb("7650d8"),
}


def make_stone(seed):
    rnd = random.Random(seed)
    img = Image.new("RGBA", (16, 16))
    # soft blotches like vanilla stone
    field = [[rnd.random() for _ in range(16)] for _ in range(16)]
    for y in range(16):
        for x in range(16):
            acc = 0.0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    acc += field[(y + dy) % 16][(x + dx) % 16]
            acc /= 9.0
            value = 104 + int((acc - 0.5) * 70) + rnd.randint(-5, 5)
            value = max(84, min(142, value))
            img.putpixel((x, y), (value, value, value + 2, 255))
    return img


def make_ore():
    img = make_stone(7)
    for y, row in enumerate(ORE_MASK):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), ORE_COLORS[ch])
                # darken the stone under/right of crystals for depth
    for y, row in enumerate(ORE_MASK):
        for x, ch in enumerate(row):
            if ch == "." and y > 0 and x > 0 and ORE_MASK[y - 1][x - 1] != ".":
                r, g, b, a = img.getpixel((x, y))
                img.putpixel((x, y), (int(r * 0.72), int(g * 0.72), int(b * 0.78), a))
    return img


# --------------------------------------------------------------------------
# Crystal Sentinel entity texture (64x64, box UV)
# --------------------------------------------------------------------------
GLOW = 24  # low alpha = emissive with the entity_emissive material


def box_faces(u, v, w, h, d):
    """Rectangles (x0, y0, x1, y1) of each face of a box-UV cube."""
    return {
        "top": (u + d, v, u + d + w, v + d),
        "bottom": (u + d + w, v, u + d + 2 * w, v + d),
        "right": (u, v + d, u + d, v + d + h),
        "front": (u + d, v + d, u + d + w, v + d + h),
        "left": (u + d + w, v + d, u + 2 * d + w, v + d + h),
        "back": (u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),
    }


def fill_stone(img, rect, rnd, base, shade=1.0):
    x0, y0, x1, y1 = rect
    for y in range(y0, y1):
        for x in range(x0, x1):
            n = rnd.randint(-9, 9)
            edge = x in (x0, x1 - 1) or y in (y0, y1 - 1)
            k = shade * (0.82 if edge else 1.0)
            img.putpixel(
                (x, y),
                (
                    max(0, min(255, int((base[0] + n) * k))),
                    max(0, min(255, int((base[1] + n) * k))),
                    max(0, min(255, int((base[2] + n) * k))),
                    255,
                ),
            )


def fill_crystal(img, rect, rnd):
    x0, y0, x1, y1 = rect
    light, mid, deep = rgb("eafcff"), rgb("6fe3ff"), rgb("8a5cf0")
    for y in range(y0, y1):
        for x in range(x0, x1):
            t = ((x - x0) + (y - y0)) / max(1, (x1 - x0) + (y1 - y0) - 2)
            t = min(1.0, max(0.0, t + rnd.uniform(-0.12, 0.12)))
            if t < 0.5:
                a, b, f = light, mid, t / 0.5
            else:
                a, b, f = mid, deep, (t - 0.5) / 0.5
            img.putpixel(
                (x, y),
                (
                    int(a[0] + (b[0] - a[0]) * f),
                    int(a[1] + (b[1] - a[1]) * f),
                    int(a[2] + (b[2] - a[2]) * f),
                    GLOW,
                ),
            )


def glow_px(img, x, y, color="7ce8ff"):
    img.putpixel((x, y), rgb(color, GLOW))


def make_sentinel():
    rnd = random.Random(42)
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    stone = (70, 62, 96)
    dark = (52, 46, 74)
    shades = {"top": 1.12, "bottom": 0.7, "front": 1.0, "back": 0.86, "left": 0.92, "right": 0.92}

    def stone_box(u, v, w, h, d, base=stone):
        faces = box_faces(u, v, w, h, d)
        for name, rect in faces.items():
            fill_stone(img, rect, rnd, base, shades[name])
        return faces

    def crystal_box(u, v, w, h, d):
        faces = box_faces(u, v, w, h, d)
        for rect in faces.values():
            fill_crystal(img, rect, rnd)
        return faces

    # head 8x8x8 @ (0,0)
    head = stone_box(0, 0, 8, 8, 8)
    fx, fy = head["front"][0], head["front"][1]
    for ex in (1, 2, 5, 6):  # eyes
        glow_px(img, fx + ex, fy + 3, "eafcff")
        glow_px(img, fx + ex, fy + 4, "6fe3ff")
    for bx in (0, 1, 2, 5, 6, 7):  # heavy brow
        img.putpixel((fx + bx, fy + 2), (34, 29, 52, 255))
    for mx in (2, 3, 4, 5):  # mouth slit
        img.putpixel((fx + mx, fy + 6), (34, 29, 52, 255))
    tx, ty = head["top"][0], head["top"][1]
    for i in range(2, 6):  # glowing rune on top of the head
        glow_px(img, tx + i, ty + 3)
        glow_px(img, tx + 3, ty + i)

    # body 12x14x6 @ (0,16)
    body = stone_box(0, 16, 12, 14, 6)
    bx0, by0 = body["front"][0], body["front"][1]
    cracks = [(2, 2), (3, 3), (3, 4), (4, 5), (8, 2), (8, 3), (7, 4), (9, 9), (8, 10), (8, 11), (2, 10), (3, 11), (3, 12)]
    for cx, cy in cracks:
        glow_px(img, bx0 + cx, by0 + cy)
    for cy in range(5, 9):  # socket around the chest core
        for cx in range(4, 8):
            img.putpixel((bx0 + cx, by0 + cy), (30, 25, 48, 255))
    kx0, ky0 = body["back"][0], body["back"][1]
    for cx, cy in [(3, 2), (4, 3), (5, 4), (6, 5), (6, 6), (7, 7), (7, 8), (8, 9), (5, 9), (4, 10)]:
        glow_px(img, kx0 + cx, ky0 + cy, "8a5cf0")

    # leg 4x12x4 @ (0,36)  and arm 4x14x4 @ (16,36)
    leg = stone_box(0, 36, 4, 12, 4, dark)
    lx, ly = leg["front"][0], leg["front"][1]
    for cy in (3, 4, 5):
        glow_px(img, lx + 1, ly + cy)
    for cx in range(4):  # stone boot band
        img.putpixel((lx + cx, ly + 10), (30, 25, 48, 255))
    arm = stone_box(16, 36, 4, 14, 4)
    ax, ay = arm["front"][0], arm["front"][1]
    for cy in (5, 6, 7, 8):
        glow_px(img, ax + 2, ay + cy)
    ox, oy = arm["left"][0], arm["left"][1]
    for cy in (2, 3, 4):
        glow_px(img, ox + 1, oy + cy, "8a5cf0")
    for name in ("front", "back", "left", "right"):  # crystal knuckles
        rect = arm[name]
        fill_crystal(img, (rect[0], rect[3] - 2, rect[2], rect[3]), rnd)

    # glowing pieces
    crystal_box(32, 0, 4, 4, 1)   # chest core
    crystal_box(44, 0, 2, 4, 2)   # shoulder spikes
    crystal_box(52, 0, 2, 3, 2)   # crown spike
    crystal_box(36, 16, 3, 6, 3)  # back crystal
    return img


# --------------------------------------------------------------------------
# Pack icon
# --------------------------------------------------------------------------
def make_icon(staff_a, staff_b, shard):
    size = 256
    img = Image.new("RGBA", (size, size))
    cx = cy = size / 2
    for y in range(size):
        for x in range(size):
            dist = math.hypot(x - cx, y - cy) / (size * 0.72)
            t = max(0.0, 1.0 - dist)
            # blocky 8px bands keep the pixel-art feel
            t = math.floor(t * 9) / 9
            r = int(18 + 70 * t * t)
            g = int(10 + 40 * t * t)
            b = int(40 + 150 * t)
            img.putpixel((x, y), (r, g, b, 255))
    rnd = random.Random(3)
    for _ in range(46):  # stars
        sx, sy = rnd.randrange(2, 62) * 4, rnd.randrange(2, 62) * 4
        color = rnd.choice(["ffffff", "7ce8ff", "e3a6ff", "ffdf6b"])
        for dx in range(4):
            for dy in range(4):
                img.putpixel((sx + dx, sy + dy), rgb(color))

    def paste(src, scale, pos, flip=False):
        big = src.transpose(Image.FLIP_LEFT_RIGHT) if flip else src
        big = big.resize((16 * scale, 16 * scale), Image.NEAREST)
        img.alpha_composite(big, pos)

    paste(staff_a, 12, (8, 40), flip=True)
    paste(staff_b, 12, (56, 40))
    paste(shard, 8, (64, 16))
    # frame
    for i in range(size):
        for t in range(8):
            for px, py in ((i, t), (i, size - 1 - t), (t, i), (size - 1 - t, i)):
                img.putpixel((px, py), rgb("ffdf6b") if t >= 4 else rgb("2a1a10"))
    return img


def save(img, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return path


def main():
    items = {}
    for name, spec in STAFFS.items():
        items["relics_" + name] = make_staff(spec)
    items["relics_arcane_shard"] = sprite(SHARD, SHARD_PALETTE)
    items["relics_codex"] = sprite(CODEX, CODEX_PALETTE)
    for name, img in items.items():
        save(img, RP, "textures", "items", name + ".png")

    ore = make_ore()
    save(ore, RP, "textures", "blocks", "relics_arcane_ore.png")
    sentinel = make_sentinel()
    save(sentinel, RP, "textures", "entity", "crystal_sentinel.png")

    icon = make_icon(items["relics_storm_staff"], items["relics_void_staff"], items["relics_arcane_shard"])
    save(icon, RP, "pack_icon.png")
    save(icon, BP, "pack_icon.png")

    # optional contact sheet for eyeballing the art: make_textures.py <out.png>
    if len(sys.argv) > 1:
        tiles = list(items.values()) + [ore]
        scale = 12
        sheet = Image.new("RGBA", (len(tiles) * 16 * scale + 64 * 6 + 256, 64 * 6), (58, 58, 64, 255))
        for i, tile in enumerate(tiles):
            sheet.alpha_composite(tile.resize((16 * scale, 16 * scale), Image.NEAREST), (i * 16 * scale, 0))
            sheet.alpha_composite(tile.resize((32, 32), Image.NEAREST), (i * 16 * scale + 80, 16 * scale + 40))
        opaque = sentinel.copy()
        opaque.putalpha(sentinel.getchannel("A").point(lambda a: 255 if a else 0))
        sheet.alpha_composite(opaque.resize((64 * 6, 64 * 6), Image.NEAREST), (len(tiles) * 16 * scale, 0))
        sheet.alpha_composite(icon, (len(tiles) * 16 * scale + 64 * 6, 0))
        sheet.save(sys.argv[1])
    print("textures written")


if __name__ == "__main__":
    main()
