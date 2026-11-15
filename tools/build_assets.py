#!/usr/bin/env python3
"""Generates every texture and 3D model of the Venom Mode add-on.

All art is drawn procedurally so the geometry and its texture atlas can never
drift apart: each cube asks the atlas for its six face rectangles, and the
painter for that cube draws straight into them.

Usage:  python3 tools/build_assets.py [--preview DIR]

--preview writes opaque copies of the entity textures (no emissive alpha) into
DIR so offline renderers show the glowing eyes as solid white.
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "resource_packs", "venom_mode_rp")
BP = os.path.join(ROOT, "behavior_packs", "venom_mode_bp")

S = 2  # texels per model unit (a vanilla skin uses 1)
EMISSIVE_ALPHA = 20  # low alpha = glows in the dark with entity_emissive_alpha

# --------------------------------------------------------------------------- palettes

VENOM = {
    "base": (21, 21, 30), "dark": (10, 10, 16), "mid": (32, 33, 47),
    "hi": (54, 58, 84), "sheen": (92, 100, 140),
    "eye": (246, 248, 252), "eye_shade": (196, 202, 218),
    "tooth": (243, 240, 226), "tooth_shade": (198, 192, 170),
    "mouth": (74, 10, 20), "gum": (128, 22, 36),
    "tongue": (206, 52, 78), "tongue_hi": (238, 104, 124), "tongue_dark": (150, 28, 52),
    "mark": (236, 238, 244), "mark_shade": (176, 182, 200),
}
CRIMSON = {
    "base": (128, 18, 22), "dark": (72, 6, 10), "mid": (158, 28, 28),
    "hi": (196, 46, 38), "sheen": (236, 92, 66),
    "eye": (250, 250, 244), "eye_shade": (214, 200, 190),
    "tooth": (246, 238, 214), "tooth_shade": (204, 186, 150),
    "mouth": (30, 4, 8), "gum": (60, 8, 12),
    "tongue": (64, 10, 16), "tongue_hi": (110, 22, 28), "tongue_dark": (34, 4, 8),
    "mark": (26, 6, 8), "mark_shade": (52, 10, 12),
}

# --------------------------------------------------------------------------- pixel helpers


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


def stamp(img, rows, legend, ox=0, oy=0):
    """Draw ASCII art onto img. '.' (or any char not in legend) is skipped."""
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in legend and 0 <= ox + x < img.width and 0 <= oy + y < img.height:
                px[ox + x, oy + y] = legend[ch]


def skin_img(w, h, pal, rng):
    """Glossy symbiote hide: dark base, mottling, a few wet-looking streaks."""
    img = Image.new("RGBA", (w, h), rgba(pal["base"]))
    px = img.load()
    for y in range(h):
        for x in range(w):
            r = rng.random()
            if r < 0.10:
                px[x, y] = rgba(pal["dark"])
            elif r < 0.24:
                px[x, y] = rgba(pal["mid"])
    for _ in range(max(1, (w * h) // 60)):
        x, y = rng.randrange(w), rng.randrange(h)
        length = rng.randint(2, max(2, h // 4))
        for i in range(length):
            xx, yy = x + i // 3, y + i
            if 0 <= xx < w and 0 <= yy < h:
                px[xx, yy] = rgba(pal["hi"] if 0 < i < length - 1 else pal["mid"])
        if rng.random() < 0.6 and y + 1 < h:
            px[x, y + 1] = rgba(pal["sheen"])
    return img


def bone_img(w, h, pal, rng):
    img = Image.new("RGBA", (w, h), rgba(pal["tooth"]))
    px = img.load()
    for x in range(w):
        px[x, h - 1] = rgba(pal["tooth_shade"])
    for y in range(h):
        px[w - 1, y] = rgba(pal["tooth_shade"])
    return img


def tongue_img(w, h, pal, rng):
    img = Image.new("RGBA", (w, h), rgba(pal["tongue"]))
    px = img.load()
    for y in range(h):
        for x in range(w):
            r = rng.random()
            if r < 0.18:
                px[x, y] = rgba(pal["tongue_hi"])
            elif r < 0.34:
                px[x, y] = rgba(pal["tongue_dark"])
    return img


def flip(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


def legend_for(pal, emissive):
    eye_a = EMISSIVE_ALPHA if emissive else 255
    return {
        "W": rgba(pal["eye"], eye_a), "w": rgba(pal["eye_shade"], eye_a),
        "T": rgba(pal["tooth"]), "t": rgba(pal["tooth_shade"]),
        "R": rgba(pal["mouth"]), "r": rgba(pal["gum"]),
        "P": rgba(pal["tongue"]), "p": rgba(pal["tongue_hi"]),
        "M": rgba(pal["mark"]), "m": rgba(pal["mark_shade"]),
        "h": rgba(pal["hi"]), "s": rgba(pal["sheen"]), "d": rgba(pal["dark"]),
    }


# --------------------------------------------------------------------------- face art (16x16 head)

FACE_FRONT = [
    "................",
    "................",
    "W..............W",
    "WW............WW",
    "WWWw........wWWW",
    "WWWWw......wWWWW",
    "wWWWWw....wWWWWw",
    ".wWWWW....WWWWw.",
    "...www....www...",
    "................",
    "T..............T",
    "TT.T.T.TT.T.T.TT",
    "TRTRTRTTTTRTRTRT",
    "RRRRRRPppPRRRRRR",
    "TRTRTrPppPrTRTRT",
    "tT.T.T.PP.T.T.Tt",
]

# drawn with the front edge on the LEFT (wraps the eye and the grin round the head)
FACE_SIDE = [
    "................",
    "................",
    "WW..............",
    "WWW.............",
    "WWWw............",
    "WWw.............",
    "Ww..............",
    "................",
    "................",
    "................",
    "TT..............",
    "TTT.T...........",
    "RTRTRT..........",
    "RRRRRr..........",
    "RTRTR...........",
    "T.T.............",
]

# spider-ish chest emblem, 16x12, drawn on the bulky upper torso front and back
EMBLEM = [
    "M..............M",
    ".M....M..M....M.",
    "..M...M..M...M..",
    "...M..MMMM..M...",
    "....MMMMMMMM....",
    ".....MMMMMM.....",
    "....MMMMMMMM....",
    "...M..MMMM..M...",
    "..M...MMMM...M..",
    ".M...M.mm.M...M.",
    "M....M....M....M",
    "................",
]

ABS = [  # 16x24 lower torso front: muscle highlights
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....hhh..hhh....",
    "...h...hh...h...",
    "................",
    "....hhh..hhh....",
    "...h...hh...h...",
    "................",
    "....hhh..hhh....",
    "...h...hh...h...",
    "................",
    ".....hh..hh.....",
    "................",
    "................",
]

SPINE = [  # 16x24 back: ridge down the middle
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".......ss.......",
    ".......hh.......",
    "......h..h......",
    ".......ss.......",
    ".......hh.......",
    "......h..h......",
    ".......ss.......",
    ".......hh.......",
    "......h..h......",
    ".......hh.......",
    "................",
    "................",
]

HAND_MARK = [  # white patch on the back of each fist, 8x10
    "........",
    "........",
    "........",
    "........",
    "..MMMM..",
    ".MMMMMM.",
    ".MMMMMM.",
    "..MmmM..",
    "........",
    "........",
]

BLOB_FACE = [  # wild symbiote "head" front, 12x8
    "............",
    "W..........W",
    "WW........WW",
    "WWWw....wWWW",
    ".WWWW..WWWW.",
    "..www..www..",
    "............",
    "............",
]

# --------------------------------------------------------------------------- painters


def p_skin(pal):
    return lambda face, w, h, rng, em: skin_img(w, h, pal, rng)


def p_bone(pal):
    return lambda face, w, h, rng, em: bone_img(w, h, pal, rng)


def p_tongue(pal):
    return lambda face, w, h, rng, em: tongue_img(w, h, pal, rng)


def p_head(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        lg = legend_for(pal, em)
        if face == "north":
            stamp(img, FACE_FRONT, lg)
        elif face == "west":  # character's left side: front edge is on the left
            stamp(img, FACE_SIDE, lg)
        elif face == "east":  # character's right side: front edge is on the right
            side = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            stamp(side, FACE_SIDE, lg)
            img.alpha_composite(flip(side)) if not em else _paste_raw(img, flip(side))
        return img
    return paint


def _paste_raw(dst, src):
    """Copy every non-empty pixel of src into dst, keeping src alpha as-is."""
    sp, dp = src.load(), dst.load()
    for y in range(src.height):
        for x in range(src.width):
            if sp[x, y] != (0, 0, 0, 0):
                dp[x, y] = sp[x, y]


def p_torso(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        lg = legend_for(pal, em)
        if face == "north":
            stamp(img, ABS, lg)
        elif face == "south":
            stamp(img, SPINE, lg)
        return img
    return paint


def p_chest(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        lg = legend_for(pal, em)
        if face in ("north", "south"):
            stamp(img, EMBLEM, lg)
        return img
    return paint


def p_fist(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        if face == "east":  # outer side of the right arm (mirrored onto the left)
            stamp(img, HAND_MARK, legend_for(pal, em))
        return img
    return paint


def p_blob_head(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        if face == "north":
            stamp(img, BLOB_FACE, legend_for(pal, em))
        return img
    return paint


# --------------------------------------------------------------------------- atlas + model


class Atlas:
    """Shelf-packs cube faces into one texture and remembers where each went."""

    FACES = ("north", "south", "east", "west", "up", "down")

    def __init__(self, width, height):
        self.width, self.height = width, height
        self.keys = {}  # key -> (size, painter)
        self.rects = {}  # (key, face) -> (x, y, w, h)

    @staticmethod
    def face_px(size):
        sx, sy, sz = (max(1, round(v * S)) for v in size)
        return {"north": (sx, sy), "south": (sx, sy), "east": (sz, sy),
                "west": (sz, sy), "up": (sx, sz), "down": (sx, sz)}

    def register(self, key, size, painter):
        if key not in self.keys:
            self.keys[key] = (size, painter)

    def pack(self):
        todo = []
        for key, (size, _) in self.keys.items():
            for face, (w, h) in self.face_px(size).items():
                todo.append((h, w, key, face))
        todo.sort(key=lambda t: (-t[0], -t[1], t[2], t[3]))
        x = y = shelf = 0
        for h, w, key, face in todo:
            if x + w > self.width:
                x, y, shelf = 0, y + shelf, 0
            if y + h > self.height:
                raise SystemExit(f"atlas {self.width}x{self.height} is too small")
            self.rects[(key, face)] = (x, y, w, h)
            x += w
            shelf = max(shelf, h)

    def render(self, emissive, seed):
        img = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        for key, (size, painter) in self.keys.items():
            rng = random.Random(f"{seed}:{key}")
            for face in self.FACES:
                x, y, w, h = self.rects[(key, face)]
                img.paste(painter(face, w, h, rng, emissive), (x, y))
        return img

    def uv(self, key, mirror):
        """Per-face UV block for a cube. mirror=True reuses the rects of its twin."""
        out = {}
        for face in self.FACES:
            src = face
            if mirror and face in ("east", "west"):
                src = "west" if face == "east" else "east"
            x, y, w, h = self.rects[(key, src)]
            if mirror:
                out[face] = {"uv": [x + w, y], "uv_size": [-w, h]}
            else:
                out[face] = {"uv": [x, y], "uv_size": [w, h]}
        return out


def cube(origin, size, key, painter, inflate=0.0, mirror=False, pivot=None, rotation=None):
    return {"origin": origin, "size": size, "key": key, "painter": painter,
            "inflate": inflate, "mirror": mirror, "pivot": pivot, "rotation": rotation}


def bone(name, pivot, cubes, parent=None, rotation=None):
    return {"name": name, "pivot": pivot, "cubes": cubes, "parent": parent, "rotation": rotation}


def register_all(atlas, bones):
    for b in bones:
        for c in b["cubes"]:
            if not c["mirror"]:
                atlas.register(c["key"], c["size"], c["painter"])
    for b in bones:  # a mirrored cube with no twin still needs a rect
        for c in b["cubes"]:
            atlas.register(c["key"], c["size"], c["painter"])


def geometry(identifier, atlas, bones, bounds, offset):
    out_bones = []
    for b in bones:
        ob = {"name": b["name"], "pivot": b["pivot"]}
        if b["parent"]:
            ob["parent"] = b["parent"]
        cubes = []
        for c in b["cubes"]:
            oc = {"origin": c["origin"], "size": c["size"]}
            if c["inflate"]:
                oc["inflate"] = c["inflate"]
            # A bone's rest rotation is written on its cubes (around the bone
            # pivot) rather than on the bone: the pose is identical in game,
            # animations still turn the bone about the same pivot, and simple
            # model viewers that skip bone rotations show the real pose.
            if c["rotation"]:
                oc["pivot"] = c["pivot"]
                oc["rotation"] = c["rotation"]
            elif b["rotation"]:
                oc["pivot"] = b["pivot"]
                oc["rotation"] = b["rotation"]
            oc["uv"] = atlas.uv(c["key"], c["mirror"])
            cubes.append(oc)
        if cubes:
            ob["cubes"] = cubes
        out_bones.append(ob)
    return {
        "description": {
            "identifier": identifier,
            "texture_width": atlas.width,
            "texture_height": atlas.height,
            "visible_bounds_width": bounds[0],
            "visible_bounds_height": bounds[1],
            "visible_bounds_offset": offset,
        },
        "bones": out_bones,
    }


def mirror_x(c):
    """Twin of a cube on the other side of the body, sharing its texture."""
    m = dict(c)
    m["origin"] = [-(c["origin"][0] + c["size"][0]), c["origin"][1], c["origin"][2]]
    m["mirror"] = True
    if c["rotation"]:
        m["pivot"] = [-c["pivot"][0], c["pivot"][1], c["pivot"][2]]
        m["rotation"] = [c["rotation"][0], -c["rotation"][1], -c["rotation"][2]]
    return m


# --------------------------------------------------------------------------- humanoid symbiote (suit + boss)


def humanoid_parts(pal):
    """Cubes of the symbiote body, grouped by the armor slot that carries them.

    Everything hangs off the standard player bones (head, body, rightArm,
    leftArm, rightLeg, leftLeg) so the same parts work as attachables on a
    player and as a stand-alone mob.
    """
    skin, bone_p = p_skin(pal), p_bone(pal)

    head = [cube([-4, 24, -4], [8, 8, 8], "head", p_head(pal), inflate=0.75)]
    tongue = [
        cube([-1, 24.7, -9.2], [2, 1, 4.5], "tongue_a", p_tongue(pal)),
        cube([-0.5, 24.8, -11.6], [1, 0.8, 2.6], "tongue_b", p_tongue(pal)),
    ]

    body = [
        cube([-4, 12, -2], [8, 12, 4], "torso", p_torso(pal), inflate=0.6),
        cube([-4, 18, -2], [8, 6, 4], "chest", p_chest(pal), inflate=1.15),
    ]

    def tendril(tag, x, y):
        return [
            cube([x - 0.5, y - 0.5, 2.2], [1, 1, 4.5], f"tendril_{tag}_a", skin),
            cube([x - 0.3, y - 0.3, 6.5], [0.6, 0.6, 3], f"tendril_{tag}_b", skin),
        ]

    r_arm = [
        cube([-8, 12, -2], [4, 12, 4], "arm", skin, inflate=0.6),
        cube([-8, 20, -2], [4, 4, 4], "shoulder", skin, inflate=1.15),
        cube([-8, 12, -2], [4, 5, 4], "fist", p_fist(pal), inflate=0.95),
        cube([-8.5, 9.2, -2.6], [1, 2, 1], "claw_a", bone_p),
        cube([-6.5, 8.9, -2.9], [1, 2.3, 1], "claw_b", bone_p),
        cube([-4.5, 9.2, -2.6], [1, 2, 1], "claw_c", bone_p),
        cube([-6.5, 9.6, 1.4], [1, 1.6, 1], "claw_d", bone_p),
    ]
    r_leg = [
        cube([-3.9, 0, -2], [4, 12, 4], "leg", skin, inflate=0.5),
        cube([-3.9, 6, -2], [4, 6, 4], "thigh", skin, inflate=0.8),
    ]
    r_foot = [
        cube([-3.9, 0, -2], [4, 4, 4], "boot", skin, inflate=0.9),
        cube([-3.9, 0, -4.6], [4, 2, 2.4], "toes", skin, inflate=0.35),
        cube([-3.6, 0.1, -6.3], [1, 1, 1.5], "toe_claw_a", bone_p),
        cube([-1.2, 0.1, -6.3], [1, 1, 1.5], "toe_claw_b", bone_p),
    ]

    return {
        "head": head, "tongue": tongue, "body": body,
        "tendrils": [
            ("tendril_1", [-2.5, 21.5, 2.2], [26, -24, 0], tendril("u", -2.5, 21.5)),
            ("tendril_2", [2.5, 21.5, 2.2], [26, 24, 0], [mirror_x(c) for c in tendril("u", -2.5, 21.5)]),
            ("tendril_3", [-2, 16.5, 2.2], [-12, -30, 0], tendril("l", -2, 16.5)),
            ("tendril_4", [2, 16.5, 2.2], [-12, 30, 0], [mirror_x(c) for c in tendril("l", -2, 16.5)]),
        ],
        "r_arm": r_arm, "l_arm": [mirror_x(c) for c in r_arm],
        "r_leg": r_leg, "l_leg": [mirror_x(c) for c in r_leg],
        "r_foot": r_foot, "l_foot": [mirror_x(c) for c in r_foot],
    }


TONGUE_PIVOT, TONGUE_ROT = [0, 25.2, -4.6], [22, 0, 0]
LEG_YAW_FRONT, LEG_YAW_MID, LEG_YAW_BACK, LEG_DROOP = -135, -90, -45, -10


def suit_piece_bones(parts):
    """Four bone lists, one per armor slot."""
    head = [
        bone("head", [0, 24, 0], parts["head"]),
        bone("tongue", TONGUE_PIVOT, parts["tongue"], parent="head", rotation=TONGUE_ROT),
    ]
    chest = [
        bone("body", [0, 24, 0], parts["body"]),
        bone("rightArm", [-5, 22, 0], parts["r_arm"]),
        bone("leftArm", [5, 22, 0], parts["l_arm"]),
    ] + [bone(n, pv, cs, parent="body", rotation=rt) for n, pv, rt, cs in parts["tendrils"]]
    legs = [
        bone("rightLeg", [-1.9, 12, 0], parts["r_leg"]),
        bone("leftLeg", [1.9, 12, 0], parts["l_leg"]),
    ]
    feet = [
        bone("rightLeg", [-1.9, 12, 0], parts["r_foot"]),
        bone("leftLeg", [1.9, 12, 0], parts["l_foot"]),
    ]
    return {"head": head, "chest": chest, "legs": legs, "feet": feet}


def host_bones(parts):
    """The whole body as one mob skeleton (used by the Crimson boss)."""
    return [
        bone("root", [0, 0, 0], []),
        bone("waist", [0, 12, 0], [], parent="root"),
        bone("body", [0, 24, 0], parts["body"], parent="waist"),
        bone("head", [0, 24, 0], parts["head"], parent="body"),
        bone("tongue", TONGUE_PIVOT, parts["tongue"], parent="head", rotation=TONGUE_ROT),
        bone("rightArm", [-5, 22, 0], parts["r_arm"], parent="body"),
        bone("leftArm", [5, 22, 0], parts["l_arm"], parent="body"),
        bone("rightLeg", [-1.9, 12, 0], parts["r_leg"] + parts["r_foot"], parent="root"),
        bone("leftLeg", [1.9, 12, 0], parts["l_leg"] + parts["l_foot"], parent="root"),
    ] + [bone(n, pv, cs, parent="body", rotation=rt) for n, pv, rt, cs in parts["tendrils"]]


# --------------------------------------------------------------------------- wild symbiote blob


def blob_bones(pal):
    skin = p_skin(pal)
    bones = [
        bone("root", [0, 0, 0], []),
        bone("body", [0, 0, 0], [
            cube([-5, 0, -5], [10, 1.5, 10], "puddle", skin),
            cube([-4, 1, -4], [8, 3.5, 8], "mass", skin),
        ], parent="root"),
        bone("head", [0, 4, -2], [
            cube([-3, 3.5, -5.2], [6, 4, 6], "blob_head", p_blob_head(pal)),
        ], parent="body"),
    ]
    # two thin feelers swaying above the head
    feeler = [
        cube([-2.4, 7, -1.4], [0.8, 3.5, 0.8], "feeler_a", skin),
        cube([-2.25, 10.2, -1.25], [0.5, 2.6, 0.5], "feeler_b", skin),
    ]
    bones.append(bone("feeler_r", [-2, 7.2, -1], feeler, parent="head", rotation=[-20, 0, 24]))
    bones.append(bone("feeler_l", [2, 7.2, -1], [mirror_x(c) for c in feeler],
                      parent="head", rotation=[-20, 0, -24]))
    # six whip-like legs; each cube points toward +Z, then is swung out sideways
    for tag, x, z, yaw in (("f", -3.6, -3.2, LEG_YAW_FRONT), ("m", -4.2, 0, LEG_YAW_MID), ("b", -3.6, 3.2, LEG_YAW_BACK)):
        c = cube([x - 0.5, 0.9, z - 0.5], [1, 1, 5.5], f"leg_{tag}", skin)
        bones.append(bone(f"leg_r_{tag}", [x, 1.4, z], [c], parent="body", rotation=[LEG_DROOP, yaw, 0]))
        bones.append(bone(f"leg_l_{tag}", [-x, 1.4, z], [mirror_x(c)], parent="body",
                          rotation=[LEG_DROOP, -yaw, 0]))
    return bones


# --------------------------------------------------------------------------- item icons (16x16)

INK = {
    "K": (8, 8, 12), "k": (22, 22, 32), "m": (40, 42, 62), "h": (78, 84, 122),
    "W": (246, 248, 252), "w": (190, 196, 212),
    "R": (206, 44, 54), "r": (122, 16, 26), "P": (236, 96, 118),
    "G": (214, 236, 244), "g": (150, 192, 208),
    "B": (118, 66, 32), "b": (74, 40, 20), "c": (158, 96, 54),
    "S": (208, 212, 222), "s": (150, 156, 172),
    "T": (243, 240, 226),
}
# the crimson recolor swaps the symbiote blacks for reds
RED_INK = dict(INK, K=(52, 4, 8), k=(128, 18, 22), m=(170, 34, 32), h=(228, 86, 62))

ICONS = {
    "venom_symbiote_sample": [
        "................",
        "......bBBb......",
        "......bccb......",
        ".....GggggG.....",
        ".....G....G.....",
        "....G......G....",
        "...G..KKKK..G...",
        "...G.KKmhKK.G...",
        "..G.KKKKKKKK.G..",
        "..GKKWKKKKWKKG..",
        "..GKKWWKKWWKKG..",
        "..GKKKWKKWKKKG..",
        "..GKmKKKKKKmKG..",
        "...GKKKKKKKKG...",
        "....GGGGGGGG....",
        "................",
    ],
    "venom_chocolate": [
        "................",
        "...bbbbbbbbbb...",
        "...bcBBbcBBbb...",
        "...bBBBbBBBbb...",
        "...bBBbbBBbbb...",
        "...bbbbbbbbbb...",
        "...bcBBbcBBbb...",
        "...bBBBbBBBbb...",
        "...SsSsSsSsSs...",
        "...RRRRRRRRRR...",
        "...RRrRRRRrRR...",
        "...RRWWWWWWRR...",
        "...RRRRRRRRRR...",
        "...RRrRRRRrRR...",
        "...rrrrrrrrrr...",
        "................",
    ],
    "venom_core": [
        "................",
        ".....KKKKKK.....",
        "...KKkkkkkkKK...",
        "..KkkmmkkkkkkK..",
        "..KkmhmkkkkkkK..",
        ".KkWkkkkkkkkWkK.",
        ".KkWWkkkkkkWWkK.",
        ".KkWWWkkkkWWWkK.",
        ".KkkWWWkkWWWkkK.",
        ".KkkkkkkkkkkkkK.",
        ".KkkkkkkkkkkkkK.",
        "..KkkkkkkkkkkK..",
        "..KkkkkkkkmkkK..",
        "...KKkkkkkkKK...",
        ".....KKKKKK.....",
        "................",
    ],
    "venom_tendril": [
        "................",
        "..........KKK...",
        ".........KkkmK..",
        ".........KK.KkK.",
        ".............KkK",
        "............KkmK",
        "...........KkmK.",
        "..........KkmK..",
        ".........KkmK...",
        "........KkmK....",
        ".......KkkK.....",
        "......KkkK......",
        ".....KkkkK......",
        "....KkkkK.......",
        "...KkkkK........",
        "...KKKK.........",
    ],
    "venom_devour": [
        "................",
        "..KKKKKKKKKKKK..",
        ".KkkkmkkkkkkkkK.",
        ".KkkkkkkkkkkkkK.",
        ".KTkTkTkkTkTkTK.",
        ".KTrTrTrrTrTrTK.",
        ".KrrrrrrrrrrrrK.",
        ".KrrrrPPPPrrrrK.",
        ".KrrrPPPPPPrrrK.",
        ".KrrrrPPPPrrrrK.",
        ".KTrTrTPPTrTrTK.",
        ".KTkTkTPPTkTkTK.",
        ".KkkkkkPPkkkkkK.",
        ".KkkkkkPPkkkkkK.",
        "..KKKKKPPKKKKK..",
        ".......PP.......",
    ],
    "venom_roar": [
        "................",
        "............W...",
        "..KKKKK......W..",
        ".KkkmkkK..W...W.",
        ".KWWkkkK...W..W.",
        ".KkWWkkKK...W..W",
        ".KkkkkTTK.W.W..W",
        ".KkkkTrrr.W.W..W",
        ".KkkkTrrr.W.W..W",
        ".KkkkkTTK.W.W..W",
        ".KkkkkkKK...W..W",
        ".KkkkkkK...W..W.",
        ".KkkkkkK..W...W.",
        "..KKKKK......W..",
        "............W...",
        "................",
    ],
    "venom_spikes": [
        ".......K........",
        ".......K........",
        "..K...KkK...K...",
        "..KK..KkK..KK...",
        "...Kk.KkK.kK....",
        "...KkKKmKKkK....",
        "....KkKmKkK.....",
        "K...KkkmkkK...K.",
        "KKk..KkmkK..kKK.",
        ".KKkkKkmkKkkKK..",
        "..KKkkkmkkkKK...",
        "...KKkkmkkKK....",
        "..KKkkkkkkkKK...",
        ".KkkkkkhkkkkkK..",
        "KkkkkkkkkkkkkkK.",
        "KKKKKKKKKKKKKKK.",
    ],
    "venom_suit": [
        "................",
        "....KKKKKKKK....",
        "...KkkkkkkkkK...",
        "..KkkmmkkkkkkK..",
        "..KkkkkkkkkkkK..",
        "..KWkkkkkkkkWK..",
        "..KWWkkkkkkWWK..",
        "..KWWWkkkkWWWK..",
        "..KkWWWkkWWWkK..",
        "..KkkkkkkkkkkK..",
        "..KTkTkTTkTkTK..",
        "..KTTTTTTTTTTK..",
        "..KrrrrrrrrrrK..",
        "...KTkTkkTkTK...",
        "....KKKKKKKK....",
        "................",
    ],
}
RECOLORED = {"venom_crimson_sample": "venom_symbiote_sample", "venom_crimson_suit": "venom_suit"}


def icon(rows, ink):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    stamp(img, rows, {k: rgba(v) for k, v in ink.items()})
    return img


# --------------------------------------------------------------------------- particles + pack icons


def particle_sheet():
    """Four 8x8 sprites: black goo, red goo, white spark, dark smoke."""
    blob = [
        "..KKKK..",
        ".KkkkkK.",
        "KkhkkkkK",
        "KkkkkkkK",
        "KkkkkkkK",
        "KkkkkmkK",
        ".KkkkkK.",
        "..KKKK..",
    ]
    spark = [
        "...WW...",
        "...WW...",
        "..WWWW..",
        "WWWWWWWW",
        "WWWWWWWW",
        "..WWWW..",
        "...WW...",
        "...WW...",
    ]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    stamp(img, blob, {k: rgba(v) for k, v in INK.items()}, 0, 0)
    stamp(img, blob, {k: rgba(v) for k, v in RED_INK.items()}, 8, 0)
    stamp(img, spark, {"W": rgba(INK["W"])}, 0, 8)
    stamp(img, blob, {"K": rgba(INK["k"], 150), "k": rgba(INK["m"], 150),
                      "h": rgba(INK["h"], 150), "m": rgba(INK["h"], 150)}, 8, 8)
    return img


FONT = {
    "V": ["X...X", "X...X", "X...X", ".X.X.", "..X.."],
    "E": ["XXXXX", "X....", "XXXX.", "X....", "XXXXX"],
    "N": ["X...X", "XX..X", "X.X.X", "X..XX", "X...X"],
    "O": [".XXX.", "X...X", "X...X", "X...X", ".XXX."],
    "M": ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"],
    "D": ["XXXX.", "X...X", "X...X", "X...X", "XXXX."],
    " ": [".....", ".....", ".....", ".....", "....."],
}


def pack_icon(pal, backdrop):
    """32x32 pixel-art head, scaled up to the 256x256 Minecraft wants."""
    img = Image.new("RGBA", (32, 32), rgba(backdrop))
    px = img.load()
    rng = random.Random("pack-icon")
    for y in range(32):
        for x in range(32):
            if rng.random() < 0.12:
                px[x, y] = rgba(tuple(min(255, c + 14) for c in backdrop))
    head = skin_img(16, 16, pal, random.Random("pack-head"))
    stamp(head, FACE_FRONT, legend_for(pal, False))
    frame = Image.new("RGBA", (18, 18), rgba(pal["dark"]))
    frame.paste(head, (1, 1))
    img.paste(frame, (7, 3))
    text = "VENOM"
    x0 = (32 - (len(text) * 6 - 1)) // 2
    for i, ch in enumerate(text):
        stamp(img, FONT[ch], {"X": rgba(pal["eye"])}, x0 + i * 6, 24)
    return img.resize((256, 256), Image.NEAREST)


# --------------------------------------------------------------------------- main


def save(img, *path):
    full = os.path.join(*path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)


def save_json(obj, *path):
    full = os.path.join(*path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


def main():
    preview = None
    if "--preview" in sys.argv:
        preview = sys.argv[sys.argv.index("--preview") + 1]

    # humanoid: one atlas layout shared by the black and red textures
    venom_parts = humanoid_parts(VENOM)
    crimson_parts = humanoid_parts(CRIMSON)
    pieces = suit_piece_bones(venom_parts)
    host = host_bones(venom_parts)

    def humanoid_atlas(parts):
        atlas = Atlas(128, 128)
        register_all(atlas, host_bones(parts))
        atlas.pack()
        return atlas

    a_venom, a_crimson = humanoid_atlas(venom_parts), humanoid_atlas(crimson_parts)
    suit_geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [
            geometry(f"geometry.venom.suit.{slot}", a_venom, pieces[slot], (3, 4), [0, 1.5, 0])
            for slot in ("head", "chest", "legs", "feet")
        ],
    }
    host_geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [geometry("geometry.venom.host", a_venom, host, (4, 5), [0, 2, 0])],
    }
    save_json(suit_geo, RP, "models", "entity", "venom_suit.geo.json")
    save_json(host_geo, RP, "models", "entity", "venom_host.geo.json")
    save(a_venom.render(True, "venom"), RP, "textures", "entity", "venom", "venom_suit.png")
    save(a_crimson.render(True, "crimson"), RP, "textures", "entity", "venom", "crimson_suit.png")

    # wild symbiote
    blob = blob_bones(VENOM)
    a_blob = Atlas(64, 64)
    register_all(a_blob, blob)
    a_blob.pack()
    save_json({
        "format_version": "1.12.0",
        "minecraft:geometry": [geometry("geometry.venom.symbiote", a_blob, blob, (2, 2), [0, 0.5, 0])],
    }, RP, "models", "entity", "venom_symbiote.geo.json")
    save(a_blob.render(True, "blob"), RP, "textures", "entity", "venom", "symbiote.png")

    # items, particles, pack icons
    for name, rows in ICONS.items():
        save(icon(rows, INK), RP, "textures", "items", f"{name}.png")
    for name, source in RECOLORED.items():
        save(icon(ICONS[source], RED_INK), RP, "textures", "items", f"{name}.png")
    save(particle_sheet(), RP, "textures", "particle", "venom_particles.png")
    save(pack_icon(VENOM, (46, 18, 66)), RP, "pack_icon.png")
    save(pack_icon(VENOM, (66, 18, 30)), BP, "pack_icon.png")

    if preview:
        save(a_venom.render(False, "venom"), preview, "venom_suit.png")
        save(a_crimson.render(False, "crimson"), preview, "crimson_suit.png")
        save(a_blob.render(False, "blob"), preview, "symbiote.png")
        sheet = Image.new("RGBA", (16 * 12, 16), (90, 90, 100, 255))
        names = list(ICONS) + list(RECOLORED)
        for i, name in enumerate(names):
            src = Image.open(os.path.join(RP, "textures", "items", f"{name}.png"))
            sheet.alpha_composite(src, (i * 16, 0))
        save(sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST), preview, "icons.png")

    print("assets written")


if __name__ == "__main__":
    main()
