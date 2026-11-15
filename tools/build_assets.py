#!/usr/bin/env python3
"""Generates every texture and 3D model of the Venom Mode add-on.

All art is drawn procedurally so the geometry and its texture atlas can never
drift apart: each cube asks the atlas for its six face rectangles, and the
painter for that cube draws straight into them.

Usage:  python3 tools/build_assets.py [--preview DIR]

--preview also writes stand-alone models of both symbiotes and the blob, with
opaque textures (no emissive alpha), into DIR for offline renderers.
"""
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "resource_packs", "venom_mode_rp")
BP = os.path.join(ROOT, "behavior_packs", "venom_mode_bp")

S = 4  # texels per model unit (a vanilla skin uses 1)
EMISSIVE_ALPHA = 20  # low alpha = glows in the dark with entity_emissive_alpha
CLEAR = (0, 0, 0, 0)  # fully empty pixels are cut out, which is how tips get their points

# --------------------------------------------------------------------------- palettes

VENOM = {
    "style": "venom",
    "dark": (7, 7, 12), "base": (19, 19, 29), "mid": (31, 33, 49), "hi": (52, 57, 87), "sheen": (104, 114, 160),
    "vein": (44, 48, 74),
    "eye": (247, 249, 253), "eye_shade": (188, 196, 216),
    "tooth": (245, 242, 228), "tooth_shade": (190, 182, 156),
    "mouth": (92, 12, 24), "mouth_dark": (36, 2, 8),
    "tongue": (204, 50, 78), "tongue_hi": (240, 110, 130), "tongue_dark": (140, 24, 50),
    "mark": (238, 240, 246), "mark_shade": (170, 178, 198),
}
CARNAGE = {
    "style": "carnage",
    "dark": (70, 4, 8), "base": (138, 16, 20), "mid": (174, 28, 26), "hi": (208, 50, 38), "sheen": (246, 112, 76),
    "vein": (18, 2, 4),
    "eye": (252, 252, 246), "eye_shade": (214, 198, 186),
    "tooth": (248, 240, 216), "tooth_shade": (198, 176, 140),
    "mouth": (40, 4, 8), "mouth_dark": (8, 0, 2),
    "tongue": (58, 8, 14), "tongue_hi": (112, 22, 28), "tongue_dark": (24, 2, 6),
    "mark": (18, 2, 4), "mark_shade": (48, 8, 10),
}

# --------------------------------------------------------------------------- pixel helpers


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


def stamp(img, rows, legend, ox=0, oy=0):
    """Draw ASCII art onto img. Any character not in legend is skipped."""
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in legend and 0 <= ox + x < img.width and 0 <= oy + y < img.height:
                px[ox + x, oy + y] = legend[ch]


def flip(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


def skin_img(w, h, pal, rng):
    """Wet symbiote hide in five flat tones: blotchy, lit from above, with a
    few glossy streaks. Carnage gets black fibres running through it."""
    ramp = [pal["dark"], pal["base"], pal["mid"], pal["hi"], pal["sheen"]]
    cell = 3
    grid = [[rng.random() for _ in range(w // cell + 3)] for _ in range(h // cell + 3)]
    img = Image.new("RGBA", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            gx, gy = x / cell, y / cell
            x0, y0 = int(gx), int(gy)
            fx, fy = gx - x0, gy - y0
            blotch = ((grid[y0][x0] * (1 - fx) + grid[y0][x0 + 1] * fx) * (1 - fy)
                      + (grid[y0 + 1][x0] * (1 - fx) + grid[y0 + 1][x0 + 1] * fx) * fy)
            v = 0.36 + (blotch - 0.5) * 0.46 + 0.14 * (0.5 - y / max(h - 1, 1)) + (rng.random() - 0.5) * 0.08
            if h > 3:
                v += 0.11 if y == 0 else -0.11 if y == h - 1 else 0
            if w > 3 and x in (0, w - 1):
                v -= 0.05
            px[x, y] = rgba(ramp[0 if v < 0.2 else 1 if v < 0.46 else 2 if v < 0.64 else 3])

    def strand(color, glint, length, drift):
        x, y = rng.uniform(0, w), rng.uniform(-0.2, 0.7) * h
        for i in range(int(length)):
            xi, yi = int(x), int(y + i)
            if 0 <= xi < w and 0 <= yi < h:
                px[xi, yi] = rgba(color)
                if glint and rng.random() < 0.18 and xi + 1 < w:
                    px[xi + 1, yi] = rgba(glint)
            x += rng.uniform(-drift, drift)

    area = w * h
    if pal["style"] == "carnage":
        for _ in range(max(1, w // 4)):  # black muscle fibres
            strand(pal["vein"], pal["sheen"], rng.uniform(0.4, 1.1) * h, 0.7)
    else:
        for _ in range(area // 500):  # faint veins
            strand(pal["vein"], None, rng.uniform(0.3, 0.7) * h, 0.9)
    for _ in range(area // 80):  # glossy streaks
        x, y = rng.randrange(w), rng.randrange(h)
        for i in range(rng.randint(2, max(2, h // 5))):
            if 0 <= x + i // 3 < w and y + i < h:
                px[x + i // 3, y + i] = rgba(pal["sheen"] if i == 1 else pal["hi"])
    return img


def taper(img, tip):
    """Cut the corners away so a box reads as a spike pointing at `tip`
    ('top', 'bottom', 'left' or 'right' of this face)."""
    w, h = img.size
    px = img.load()
    along, across = (h, w) if tip in ("top", "bottom") else (w, h)
    for a in range(along):
        t = a / max(along - 1, 1)  # 0 at the base, 1 at the tip
        keep = max(1.0, across * (1 - 0.9 * t ** 1.4))
        lo, hi = (across - keep) / 2, (across + keep) / 2
        for c in range(across):
            if lo <= c + 0.5 <= hi or abs(c + 0.5 - across / 2) < 0.51:
                continue
            pos = a if tip in ("bottom", "right") else along - 1 - a
            px[(c, pos) if tip in ("top", "bottom") else (pos, c)] = CLEAR
    return img


# which edge of each face image a spike's point sits on, by the direction it points
TIP_EDGE = {
    "down": {"north": "bottom", "south": "bottom", "east": "bottom", "west": "bottom"},
    "up": {"north": "top", "south": "top", "east": "top", "west": "top"},
    "front": {"east": "right", "west": "left", "up": "bottom"},
    "back": {"east": "left", "west": "right", "up": "top"},
}


def polygon(img, points, fill, outline=None):
    w, h = img.size
    ImageDraw.Draw(img).polygon([(round(u * (w - 1)), round(v * (h - 1))) for u, v in points], fill=fill, outline=outline)


def polyline(img, points, fill, width):
    w, h = img.size
    ImageDraw.Draw(img).line([(round(u * (w - 1)), round(v * (h - 1))) for u, v in points], fill=fill, width=width)


def mirrored(points):
    return [(1 - u, v) for u, v in points]


def teeth_row(img, pal, edge, count):
    """A row of small pointed teeth along the top or bottom edge of a face."""
    w, h = img.size
    px = img.load()
    depth = max(2, round(h * 0.42))
    for x in range(w):
        phase = (x * count / w) % 1.0
        reach = round(depth * (1 - abs(phase - 0.5) * 2))  # a triangle per tooth
        for d in range(depth):
            y = d if edge == "top" else h - 1 - d
            if d < reach:
                px[x, y] = rgba(pal["tooth"] if phase < 0.6 else pal["tooth_shade"])
            else:
                px[x, y] = rgba(pal["mouth_dark"])
    return img


# --------------------------------------------------------------------------- face art

# Eyes are drawn as polygons in face coordinates (0-1 across, 0-1 down), for the
# viewer's left eye; the right eye is its mirror image. Each wraps round onto the
# side of the head, drawn there with the front edge on the left.
EYES = {
    "venom": {
        "front": [(0.00, 0.10), (0.07, 0.13), (0.21, 0.26), (0.35, 0.40), (0.45, 0.53),
                  (0.40, 0.60), (0.31, 0.55), (0.25, 0.61), (0.16, 0.54), (0.09, 0.57), (0.00, 0.46)],
        "side": [(0.00, 0.10), (0.20, 0.04), (0.44, 0.00), (0.33, 0.13), (0.40, 0.17),
                 (0.24, 0.27), (0.29, 0.33), (0.12, 0.39), (0.00, 0.46)],
    },
    "carnage": {
        "front": [(0.00, 0.17), (0.10, 0.22), (0.25, 0.34), (0.37, 0.45), (0.46, 0.55),
                  (0.38, 0.58), (0.28, 0.52), (0.21, 0.56), (0.12, 0.47), (0.05, 0.50), (0.00, 0.40)],
        "side": [(0.00, 0.17), (0.18, 0.08), (0.36, 0.03), (0.26, 0.16), (0.32, 0.21), (0.14, 0.31), (0.00, 0.40)],
    },
}

# Venom's chest emblem, drawn as strokes for the viewer's left half and mirrored.
EMBLEM_LEGS = [
    [(0.50, 0.34), (0.30, 0.22), (0.14, 0.02)],
    [(0.50, 0.44), (0.24, 0.38), (0.00, 0.26)],
    [(0.50, 0.56), (0.24, 0.62), (0.02, 0.80)],
    [(0.50, 0.66), (0.32, 0.80), (0.20, 1.00)],
]


def legend_for(pal, emissive):
    eye_a = EMISSIVE_ALPHA if emissive else 255
    return {"W": rgba(pal["eye"], eye_a), "w": rgba(pal["eye_shade"], eye_a)}


# --------------------------------------------------------------------------- painters
# A painter is called once per cube face: paint(face, w, h, rng, emissive) -> image.


def p_skin(pal):
    return lambda face, w, h, rng, em: skin_img(w, h, pal, rng)


def p_spike(pal, tip, bone=False):
    """A tendril end, claw or fang: hide or ivory, cut to a point."""
    def paint(face, w, h, rng, em):
        if bone:
            img = Image.new("RGBA", (w, h), rgba(pal["tooth"]))
            px = img.load()
            for y in range(h):
                for x in range(w):
                    if x == w - 1 or rng.random() < 0.12:
                        px[x, y] = rgba(pal["tooth_shade"])
        else:
            img = skin_img(w, h, pal, rng)
        edge = TIP_EDGE[tip].get(face)
        return taper(img, edge) if edge else img
    return paint


def p_blade(pal):
    """Carnage's arm blades: dark at the spine, pale along the cutting edge, pointed.
    The blade is a fin on the outside of the right forearm (mirrored for the left),
    so its cutting edge is on the left of the front face and the right of the back."""
    def paint(face, w, h, rng, em):
        img = Image.new("RGBA", (w, h), rgba(pal["tooth"]))
        px = img.load()
        for y in range(h):
            for x in range(w):
                edge = 1.0
                if face == "north":
                    edge = 1 - x / max(w - 1, 1)
                elif face == "south":
                    edge = x / max(w - 1, 1)
                elif face == "west":
                    edge = 0.0  # the spine, against the arm
                shade = pal["tooth"] if edge > 0.8 else pal["hi"] if edge > 0.55 else pal["mid"] if edge > 0.3 else pal["vein"]
                px[x, y] = rgba(pal["vein"] if rng.random() < 0.08 and edge < 0.8 else shade)
        return taper(img, "bottom") if face in ("north", "south", "east", "west") else img
    return paint


def p_tongue(pal, tip=False):
    def paint(face, w, h, rng, em):
        img = Image.new("RGBA", (w, h), rgba(pal["tongue"]))
        px = img.load()
        for y in range(h):
            for x in range(w):
                r = rng.random()
                if face == "up" and abs(x - (w - 1) / 2) < 0.6:
                    px[x, y] = rgba(pal["tongue_dark"])  # the groove down the middle
                elif r < 0.18:
                    px[x, y] = rgba(pal["tongue_hi"])
                elif r < 0.34:
                    px[x, y] = rgba(pal["tongue_dark"])
        edge = TIP_EDGE["front"].get(face) if tip else None
        return taper(img, edge) if edge else img
    return paint


def p_maw(pal):
    """The inside of the mouth: dark, darker toward the throat."""
    def paint(face, w, h, rng, em):
        img = Image.new("RGBA", (w, h), rgba(pal["mouth_dark"]))
        px = img.load()
        for y in range(h):
            for x in range(w):
                if rng.random() < 0.35 + 0.3 * (y / max(h - 1, 1)):
                    px[x, y] = rgba(pal["mouth"])
        return img
    return paint


def p_head(pal):
    eyes = EYES[pal["style"]]

    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        white, shade = legend_for(pal, em)["W"], legend_for(pal, em)["w"]
        if face == "north":
            ImageDraw.Draw(img).rectangle([0, round(h * 0.66), w - 1, h - 1], fill=rgba(pal["dark"]))  # behind the jaws
            for points in (eyes["front"], mirrored(eyes["front"])):
                polygon(img, points, white, shade)
        elif face in ("west", "east"):
            side = Image.new("RGBA", (w, h), CLEAR)
            polygon(side, eyes["side"], white, shade)
            if face == "east":  # the character's right side has its front edge on the right
                side = flip(side)
            sp, dp = side.load(), img.load()
            for y in range(h):
                for x in range(w):
                    if sp[x, y] != CLEAR:
                        dp[x, y] = sp[x, y]
        return img
    return paint


def p_jaws(pal, edge):
    """Upper or lower jaw: hide with a row of teeth along the biting edge."""
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        if face in ("north", "east", "west"):
            teeth_row(img, pal, edge, max(3, w // 5))
        return img
    return paint


def p_chest(pal, face_with_emblem="north"):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        if pal["style"] == "venom" and face == face_with_emblem:
            stroke = max(2, round(w * 0.085))
            for leg in EMBLEM_LEGS:
                polyline(img, leg, rgba(pal["mark"]), stroke)
                polyline(img, mirrored(leg), rgba(pal["mark"]), stroke)
            polygon(img, [(0.5, 0.20), (0.62, 0.36), (0.60, 0.62), (0.5, 0.84), (0.40, 0.62), (0.38, 0.36)],
                    rgba(pal["mark"]), rgba(pal["mark_shade"]))
        return img
    return paint


def p_forearm(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        if pal["style"] == "venom" and face == "east":  # the outer side (mirrored onto the left arm)
            polygon(img, [(0.25, 0.42), (0.75, 0.42), (0.85, 0.62), (0.70, 0.84), (0.30, 0.84), (0.15, 0.62)],
                    rgba(pal["mark"]), rgba(pal["mark_shade"]))
        return img
    return paint


def p_blob_head(pal):
    def paint(face, w, h, rng, em):
        img = skin_img(w, h, pal, rng)
        white, shade = legend_for(pal, em)["W"], legend_for(pal, em)["w"]
        if face == "north":
            eye = [(0.00, 0.10), (0.12, 0.14), (0.30, 0.30), (0.44, 0.48), (0.36, 0.54), (0.22, 0.48), (0.10, 0.50), (0.00, 0.40)]
            polygon(img, eye, white, shade)
            polygon(img, mirrored(eye), white, shade)
            grin = img.crop((0, round(h * 0.68), w, h))
            teeth_row(grin, pal, "top", max(4, w // 4))
            img.paste(grin, (0, round(h * 0.68)))
        elif face in ("east", "west"):
            side = Image.new("RGBA", (w, h), CLEAR)
            polygon(side, [(0.00, 0.10), (0.30, 0.04), (0.22, 0.24), (0.00, 0.40)], white, shade)
            if face == "east":
                side = flip(side)
            sp, dp = side.load(), img.load()
            for y in range(h):
                for x in range(w):
                    if sp[x, y] != CLEAR:
                        dp[x, y] = sp[x, y]
        return img
    return paint


# --------------------------------------------------------------------------- atlas + model


class Atlas:
    """Shelf-packs cube faces into one texture and remembers where each went."""

    FACES = ("north", "south", "east", "west", "up", "down")
    SIZES = ((64, 64), (128, 64), (128, 128), (256, 128), (256, 256), (512, 256), (512, 512))

    def __init__(self):
        self.width = self.height = 0
        self.keys = {}  # key -> (size, painter)
        self.rects = {}  # (key, face) -> (x, y, w, h)

    @staticmethod
    def face_px(size):
        sx, sy, sz = (max(1, round(v * S)) for v in size)
        return {"north": (sx, sy), "south": (sx, sy), "east": (sz, sy),
                "west": (sz, sy), "up": (sx, sz), "down": (sx, sz)}

    def register(self, key, size, painter):
        if key in self.keys:
            if self.face_px(self.keys[key][0]) != self.face_px(size):
                raise SystemExit(f"cubes sharing texture '{key}' differ in size")
            return
        self.keys[key] = (size, painter)

    def pack(self):
        todo = []
        for key, (size, _) in self.keys.items():
            for face, (w, h) in self.face_px(size).items():
                todo.append((h, w, key, face))
        todo.sort(key=lambda t: (-t[0], -t[1], t[2], t[3]))
        for width, height in self.SIZES:  # the smallest texture that holds everything
            rects, x, y, shelf, fits = {}, 0, 0, 0, True
            for h, w, key, face in todo:
                if x + w > width:
                    x, y, shelf = 0, y + shelf, 0
                if y + h > height or w > width:
                    fits = False
                    break
                rects[(key, face)] = (x, y, w, h)
                x += w
                shelf = max(shelf, h)
            if fits:
                self.width, self.height, self.rects = width, height, rects
                return
        raise SystemExit("model does not fit in the largest atlas")

    def render(self, emissive, seed):
        img = Image.new("RGBA", (self.width, self.height), CLEAR)
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


def mirror_x(c):
    """Twin of a cube on the other side of the body, sharing its texture."""
    m = dict(c)
    m["origin"] = [-(c["origin"][0] + c["size"][0]), c["origin"][1], c["origin"][2]]
    m["mirror"] = True
    if c["rotation"]:
        m["pivot"] = [-c["pivot"][0], c["pivot"][1], c["pivot"][2]]
        m["rotation"] = [c["rotation"][0], -c["rotation"][1], -c["rotation"][2]]
    return m


def mirror_all(cubes):
    return [mirror_x(c) for c in cubes]


def turn(vector, rotation):
    """Rotate a vector the way Bedrock rotates a cube: about X, then Y, then Z,
    in the model's mirrored-X space (checked against rendered previews)."""
    x, y, z = vector
    a, b, g = (math.radians(v) for v in rotation)
    y, z = y * math.cos(a) + z * math.sin(a), -y * math.sin(a) + z * math.cos(a)
    x, z = x * math.cos(b) + z * math.sin(b), -x * math.sin(b) + z * math.cos(b)
    x, y = x * math.cos(g) + y * math.sin(g), -x * math.sin(g) + y * math.cos(g)
    return x, y, z


AXES = {"back": (0, 0, 1), "front": (0, 0, -1), "down": (0, -1, 0), "up": (0, 1, 0)}


def chain(start, toward, segments, key, body, tip):
    """Thin boxes laid end to end along a curve: tendrils, tongues, claws, legs.

    Each segment is (length, width, height, [pitch, yaw, roll]). Every box turns
    about the joint it starts from, and the next one begins where it ends, so
    changing the angles from segment to segment bends the chain. The last
    segment is painted with `tip`, the others with `body`.
    """
    cubes = []
    joint = list(start)
    for i, (length, width, height, rotation) in enumerate(segments):
        if toward == "back":
            origin, size = [joint[0] - width / 2, joint[1] - height / 2, joint[2]], [width, height, length]
        elif toward == "front":
            origin, size = [joint[0] - width / 2, joint[1] - height / 2, joint[2] - length], [width, height, length]
        elif toward == "down":
            origin, size = [joint[0] - width / 2, joint[1] - length, joint[2] - height / 2], [width, length, height]
        else:
            origin, size = [joint[0] - width / 2, joint[1], joint[2] - height / 2], [width, length, height]
        painter = tip if i == len(segments) - 1 else body
        cubes.append(cube([round(v, 3) for v in origin], size, f"{key}{i}", painter,
                          pivot=[round(v, 3) for v in joint], rotation=list(rotation)))
        step = turn(AXES[toward], rotation)
        joint = [joint[k] + step[k] * length * 0.88 for k in range(3)]  # overlap a little so bends stay closed
    return cubes


def register_all(atlas, bones):
    for b in bones:
        for c in b["cubes"]:
            atlas.register(c["key"], c["size"], c["painter"])


def geometry(identifier, atlas, bones, bounds, offset, scale=1.0, prefix=""):
    """One geometry definition. `scale` enlarges the whole model and `prefix`
    renames its bones (used for the blob a player wears, whose bones must not
    be mistaken for the player's own)."""
    def sc(values):
        return [round(v * scale, 3) for v in values]

    out_bones = []
    for b in bones:
        ob = {"name": prefix + b["name"], "pivot": sc(b["pivot"])}
        if b["parent"]:
            ob["parent"] = prefix + b["parent"]
        cubes = []
        for c in b["cubes"]:
            oc = {"origin": sc(c["origin"]), "size": sc(c["size"])}
            if c["inflate"]:
                oc["inflate"] = round(c["inflate"] * scale, 3)
            # A bone's rest rotation is written on its cubes (around the bone
            # pivot) rather than on the bone: the pose is identical in game,
            # animations still turn the bone about the same pivot, and simple
            # model viewers that skip bone rotations show the real pose.
            if c["rotation"]:
                oc["pivot"] = sc(c["pivot"])
                oc["rotation"] = c["rotation"]
            elif b["rotation"]:
                oc["pivot"] = sc(b["pivot"])
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


# --------------------------------------------------------------------------- the symbiote body (suit + boss)

JAW_PIVOT, JAW_OPEN = [0, 24.6, -1.5], [10, 0, 0]


def humanoid_parts(pal):
    """Cubes of a symbiote body, grouped by the player bone that carries them.

    Everything hangs off the standard player bones (head, body, rightArm,
    leftArm, rightLeg, leftLeg) so the same parts work as attachables on a
    player and as a stand-alone mob. Venom is the bulky one with the long
    tongue and chest emblem; Carnage is wiry, bladed and covered in tendrils.
    """
    carnage = pal["style"] == "carnage"
    skin = p_skin(pal)
    fang = lambda tip: p_spike(pal, tip, bone=True)
    tendril_tip = lambda tip: p_spike(pal, tip)

    # ----- head: skull, a muzzle with fangs, and a hinged lower jaw
    upper_fangs = []
    for i, (x, length) in enumerate(((-3.15, 2.1), (-2.05, 1.3), (-0.95, 1.8))):
        upper_fangs.append(cube([x - 0.35, 25.3 - length, -6.45], [0.7, length, 0.7], f"fang_u{i}", fang("down")))
    for i, z in enumerate((-5.5, -4.7)):
        upper_fangs.append(cube([-3.95, 24.2, z], [0.6, 1.2, 0.6], "fang_side", fang("down")))
    head = [
        cube([-4, 24, -4], [8, 8, 8], "head", p_head(pal), inflate=0.75),
        cube([-3.7, 25.3, -6.5], [7.4, 2.2, 2.3], "muzzle", p_jaws(pal, "bottom")),
        cube([-3.4, 23.2, -5.8], [6.8, 2.2, 1.2], "maw", p_maw(pal)),
    ] + upper_fangs + mirror_all(upper_fangs)

    lower_fangs = []
    for i, (x, length) in enumerate(((-2.7, 1.6), (-1.6, 1.0), (-0.6, 1.3))):
        lower_fangs.append(cube([x - 0.3, 23.6, -6.2], [0.6, length, 0.6], f"fang_l{i}", fang("up")))
    jaw = [cube([-3.6, 22.3, -6.3], [7.2, 1.4, 5.4], "jaw", p_jaws(pal, "top"))] + lower_fangs + mirror_all(lower_fangs)

    if carnage:  # a short black tongue, and tendrils whipping back off the skull
        tongue = chain([0, 24.3, -5.4], "front",
                       [(2.6, 1.6, 0.7, (14, 0, 0)), (2.4, 1.0, 0.6, (34, 0, 0))], "tongue", p_tongue(pal), p_tongue(pal, tip=True))
        locks = []
        for i, (x, y, pitch, yaw, lengths) in enumerate(((-2.6, 32.0, 38, -24, (3.4, 3.0)), (-1.0, 32.6, 52, -8, (3.0, 2.6)),
                                                          (-3.4, 29.5, 16, -38, (3.2, 2.6)))):
            locks += chain([x, y, 3.8], "back",
                           [(lengths[0], 0.9, 0.9, (pitch, yaw, 0)), (lengths[1], 0.6, 0.6, (pitch - 26, yaw, 0))],
                           f"lock{i}_", skin, tendril_tip("back"))
        head += locks + mirror_all(locks)
    else:  # the long lolling tongue
        tongue = chain([0, 24.3, -5.4], "front",
                       [(3.6, 2.2, 0.9, (10, 0, 0)), (3.2, 1.8, 0.8, (30, 0, 0)), (3.0, 1.3, 0.7, (54, 0, 0))],
                       "tongue", p_tongue(pal), p_tongue(pal, tip=True))

    # ----- torso: narrow waist, broad chest, a hump the tendrils grow from
    body = [
        cube([-4, 12, -2], [8, 6, 4], "waist", skin, inflate=0.45),
        cube([-4, 18, -2], [8, 6, 4], "chest", p_chest(pal), inflate=1.2),
        cube([-3.5, 20.3, 2.4], [7, 4.4, 2.2], "hump", p_chest(pal, "south")),
    ]

    def tendril(tag, x, y, shape, yaw):
        (l1, t1, p1), (l2, t2, p2), (l3, t3, p3) = shape
        return chain([x, y, 4.2], "back",
                     [(l1, t1, t1, (p1, yaw, 0)), (l2, t2, t2, (p2, yaw, 0)), (l3, t3, t3, (p3, yaw, 0))],
                     f"tendril_{tag}", skin, tendril_tip("back"))

    if carnage:  # many long thin whips
        shapes = [
            ("a", -2.4, 23.8, ((4.2, 0.9, 42), (3.8, 0.6, 18), (3.4, 0.4, -12)), -30),
            ("b", -3.0, 21.6, ((4.6, 0.9, 12), (4.0, 0.6, -6), (3.6, 0.4, -30)), -52),
            ("c", -1.2, 22.4, ((5.0, 0.8, 26), (4.2, 0.55, 40), (3.4, 0.35, 12)), -10),
            ("d", -2.2, 20.6, ((3.8, 0.8, -18), (3.6, 0.55, -40), (3.0, 0.35, -62)), -34),
        ]
    else:  # four heavy ones
        shapes = [
            ("a", -2.2, 23.6, ((3.8, 1.2, 34), (3.2, 0.85, 14), (2.8, 0.55, -10)), -28),
            ("b", -2.6, 21.2, ((3.4, 1.1, -4), (3.0, 0.8, -24), (2.6, 0.5, -46)), -42),
        ]
    tendrils = []
    for n, (tag, x, y, shape, yaw) in enumerate(shapes):
        right = tendril(tag, x, y, shape, yaw)
        tendrils.append((f"tendril_{2 * n + 1}", [x, y, 4.2], right))
        tendrils.append((f"tendril_{2 * n + 2}", [-x, y, 4.2], mirror_all(right)))

    # ----- arms: heavy shoulders and forearms, curled claws
    claws = []
    for i, (x, z, curl, splay) in enumerate(((-8.3, -2.3, -14, 10), (-6.6, -2.8, -18, 2), (-4.9, -2.8, -18, -4), (-6.6, 2.2, 22, 0))):
        claws += chain([x, 11.4, z], "down", [(2.0, 1.0, 1.0, (curl, 0, splay)), (2.0, 0.65, 0.65, (curl * 2.4, 0, splay))],
                       "claw", fang("down"), fang("down"))
    r_arm = [
        cube([-8, 12, -2], [4, 12, 4], "arm", skin, inflate=0.6),
        cube([-8, 20, -2], [4, 4, 4], "shoulder", skin, inflate=1.2),
        cube([-8, 12, -2], [4, 5.5, 4], "forearm", p_forearm(pal), inflate=1.0),
    ] + claws
    if carnage:  # a blade along each forearm, and spikes on the shoulders
        r_arm.append(cube([-11.6, 3.2, -0.4], [2.8, 12.5, 0.8], "blade", p_blade(pal)))
        r_arm += chain([-8.4, 25.0, 0.4], "up", [(2.6, 1.0, 1.0, (0, 0, 28)), (2.4, 0.6, 0.6, (0, 0, 44))],
                       "shoulder_spike", skin, tendril_tip("up"))
        r_arm += chain([-7.0, 25.1, -1.4], "up", [(2.0, 0.8, 0.8, (-18, 0, 12)), (1.8, 0.5, 0.5, (-30, 0, 20))],
                       "shoulder_spur", skin, tendril_tip("up"))

    # ----- legs and clawed feet
    r_leg = [
        cube([-3.9, 0, -2], [4, 12, 4], "leg", skin, inflate=0.5),
        cube([-3.9, 6, -2], [4, 6, 4], "thigh", skin, inflate=0.85),
        cube([-3.4, 5.0, -3.4], [3, 2.0, 1.2], "knee", skin),
    ]
    toe_claws = []
    for x in (-3.5, -1.9, -0.3):
        toe_claws += chain([x, 0.75, -4.9], "front", [(2.0, 0.9, 0.9, (14, 0, 0))], "toe_claw", fang("front"), fang("front"))
    r_foot = [
        cube([-3.9, 0, -2], [4, 4, 4], "boot", skin, inflate=0.9),
        cube([-3.9, 0, -4.8], [4, 2, 2.6], "toes", skin, inflate=0.35),
    ] + toe_claws

    return {
        "head": head, "jaw": jaw, "tongue": tongue, "body": body, "tendrils": tendrils,
        "r_arm": r_arm, "l_arm": mirror_all(r_arm),
        "r_leg": r_leg, "l_leg": mirror_all(r_leg),
        "r_foot": r_foot, "l_foot": mirror_all(r_foot),
    }


def suit_piece_bones(parts):
    """Four bone lists, one per armor slot."""
    head = [
        bone("head", [0, 24, 0], parts["head"]),
        bone("jaw", JAW_PIVOT, parts["jaw"], parent="head", rotation=JAW_OPEN),
        bone("tongue", [0, 24.3, -5.4], parts["tongue"], parent="head"),
    ]
    chest = [
        bone("body", [0, 24, 0], parts["body"]),
        bone("rightArm", [-5, 22, 0], parts["r_arm"]),
        bone("leftArm", [5, 22, 0], parts["l_arm"]),
    ] + [bone(name, pivot, cubes, parent="body") for name, pivot, cubes in parts["tendrils"]]
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
    """The whole body as one mob skeleton (used by the Carnage boss)."""
    return [
        bone("root", [0, 0, 0], []),
        bone("waist", [0, 12, 0], [], parent="root"),
        bone("body", [0, 24, 0], parts["body"], parent="waist"),
        bone("head", [0, 24, 0], parts["head"], parent="body"),
        bone("jaw", JAW_PIVOT, parts["jaw"], parent="head", rotation=JAW_OPEN),
        bone("tongue", [0, 24.3, -5.4], parts["tongue"], parent="head"),
        bone("rightArm", [-5, 22, 0], parts["r_arm"], parent="body"),
        bone("leftArm", [5, 22, 0], parts["l_arm"], parent="body"),
        bone("rightLeg", [-1.9, 12, 0], parts["r_leg"] + parts["r_foot"], parent="root"),
        bone("leftLeg", [1.9, 12, 0], parts["l_leg"] + parts["l_foot"], parent="root"),
    ] + [bone(name, pivot, cubes, parent="body") for name, pivot, cubes in parts["tendrils"]]


# --------------------------------------------------------------------------- the blob (wild symbiote, and blob form)


def blob_bones(pal):
    skin = p_skin(pal)
    tip = lambda toward: p_spike(pal, toward)
    bones = [
        bone("root", [0, 0, 0], []),
        bone("body", [0, 0, 0], [
            cube([-5.5, 0, -5.5], [11, 1.3, 11], "puddle", skin),
            cube([-4.5, 0.9, -4.5], [9, 3.2, 9], "mass", skin),
            cube([-3.4, 3.6, -3.2], [6.8, 2.2, 6.8], "dome", skin),
        ], parent="root"),
        bone("head", [0, 4, -3], [
            cube([-3.2, 2.4, -7.0], [6.4, 4.6, 4.4], "blob_head", p_blob_head(pal)),
        ], parent="body"),
    ]
    feeler = chain([-1.9, 5.4, 1.4], "up", [(3.0, 0.8, 0.8, (22, 0, 20)), (2.8, 0.5, 0.5, (48, 0, 30))],
                   "feeler", skin, tip("up"))
    bones.append(bone("feeler_r", [-1.9, 5.4, 1.4], feeler, parent="body"))
    bones.append(bone("feeler_l", [1.9, 5.4, 1.4], mirror_all(feeler), parent="body"))
    # six jointed legs: each rises out of the body and bends down to the ground
    for tag, x, z, yaw in (("f", -3.6, -3.0, -128), ("m", -4.3, 0.2, -90), ("b", -3.6, 3.2, -48)):
        leg = chain([x, 2.4, z], "back", [(3.6, 1.1, 1.1, (26, yaw, 0)), (4.6, 0.75, 0.75, (-52, yaw, 0))],
                    "leg", skin, tip("back"))
        bones.append(bone(f"leg_r_{tag}", [x, 2.4, z], leg, parent="body"))
        bones.append(bone(f"leg_l_{tag}", [-x, 2.4, z], mirror_all(leg), parent="body"))
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
# the red recolor swaps the symbiote blacks for reds
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
    "venom_swing": [
        "sS............KK",
        "S............Kk.",
        "............Kk..",
        "...........Kk...",
        "..........Kk....",
        ".........Kk.....",
        "........Kk......",
        ".......Kk.......",
        "....KKKk........",
        "...KkmkkK.......",
        "..KWWkkWWK......",
        "..KkWkkWkK....w.",
        "..KkkkkkkK...w..",
        "...KkkkkK...w...",
        "....KKKK..ww....",
        "........ww......",
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
# Carnage's own abilities, drawn with the red inks
RED_ICONS = {
    "venom_slash": [
        "................",
        "...........K..K.",
        "..........Kh.KhK",
        ".........Khk.Khk",
        "....K...Khk.Khk.",
        "...Kh..Khk.Khk..",
        "..Khk.Khk.Khk...",
        "..hk.Khk.Khk....",
        "....Khk.Khk.....",
        "...Khk.Khk......",
        "..Khk.Khk.......",
        ".Khk.Khk........",
        ".hk.Khk.........",
        "...Khk..........",
        "...hk...........",
        "................",
    ],
    "venom_impale": [
        "............WWW.",
        "...........KhWW.",
        "..........KhkKW.",
        ".....WW..KhkK...",
        "....KhW.KhkK....",
        "...KhkKKhkK.....",
        "..KhkKKhkK...WW.",
        ".KhkK.hkK...KhW.",
        ".hkK..kK...KhkK.",
        ".kK.......KhkK..",
        ".........KhkK...",
        "........KhkK....",
        ".......KhkK.....",
        "......KhkK......",
        "......hkK.......",
        "......kK........",
    ],
    "venom_frenzy": [
        "....K......K....",
        "...KhK....KhK...",
        "...KhkK..KkhK...",
        "..KKkkKKKKkkKK..",
        ".KkkkkkkkkkkkkK.",
        ".KWkkkkkkkkkkWK.",
        ".KWWWkkkkkkWWWK.",
        ".KkWWWWkkWWWWkK.",
        ".KkkkWWkkWWkkkK.",
        ".KkkkkkkkkkkkkK.",
        ".KTkTkTkkTkTkTK.",
        ".KTTTTTTTTTTTTK.",
        ".KKKKKKKKKKKKKK.",
        ".KTTTTTTTTTTTTK.",
        "..KTkTkTTkTkTK..",
        "...KKKKKKKKKK...",
    ],
}
RECOLORED = {"venom_crimson_sample": "venom_symbiote_sample", "venom_crimson_suit": "venom_suit"}


def icon(rows, ink):
    img = Image.new("RGBA", (16, 16), CLEAR)
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
    img = Image.new("RGBA", (16, 16), CLEAR)
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
}

PACK_FACE = [  # 16x16 head used on the pack icons
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
    stamp(head, PACK_FACE, {
        "W": rgba(pal["eye"]), "w": rgba(pal["eye_shade"]), "T": rgba(pal["tooth"]), "t": rgba(pal["tooth_shade"]),
        "R": rgba(pal["mouth"]), "r": rgba(pal["mouth"]), "P": rgba(pal["tongue"]), "p": rgba(pal["tongue_hi"])})
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


def geo_file(*geometries):
    return {"format_version": "1.12.0", "minecraft:geometry": list(geometries)}


def main():
    preview = None
    if "--preview" in sys.argv:
        preview = sys.argv[sys.argv.index("--preview") + 1]
    models = os.path.join(RP, "models", "entity")
    textures = os.path.join(RP, "textures", "entity", "venom")

    # The two symbiote bodies. Each has its own shape, so each has its own atlas.
    hosts = {}
    for name, pal, texture in (("suit", VENOM, "venom_suit"), ("carnage", CARNAGE, "crimson_suit")):
        parts = humanoid_parts(pal)
        atlas = Atlas()
        register_all(atlas, host_bones(parts))
        atlas.pack()
        pieces = suit_piece_bones(parts)
        save_json(geo_file(*(geometry(f"geometry.venom.{name}.{slot}", atlas, pieces[slot], (4, 5), [0, 1.5, 0])
                             for slot in ("head", "chest", "legs", "feet"))), models, f"venom_{name}.geo.json")
        save(atlas.render(True, name), textures, f"{texture}.png")
        hosts[name] = (atlas, host_bones(parts))
        print(f"{name}: {atlas.width}x{atlas.height} texture, {sum(len(b['cubes']) for b in host_bones(parts))} cubes")
    c_atlas, c_bones = hosts["carnage"]
    save_json(geo_file(geometry("geometry.venom.carnage_host", c_atlas, c_bones, (5, 6), [0, 2, 0])),
              models, "venom_carnage_host.geo.json")

    # The blob: a wild mob, and (bigger, with its own bone names) what a player in blob form wears.
    blob = blob_bones(VENOM)
    b_atlas = Atlas()
    register_all(b_atlas, blob)
    b_atlas.pack()
    save_json(geo_file(geometry("geometry.venom.symbiote", b_atlas, blob, (2, 2), [0, 0.5, 0])),
              models, "venom_symbiote.geo.json")
    save_json(geo_file(geometry("geometry.venom.blob_worn", b_atlas, blob, (3, 3), [0, 0.75, 0], scale=1.5, prefix="blob_")),
              models, "venom_blob_worn.geo.json")
    save(b_atlas.render(True, "blob"), textures, "symbiote.png")
    red_blob = Atlas()
    register_all(red_blob, blob_bones(CARNAGE))
    red_blob.pack()
    save(red_blob.render(True, "blob"), textures, "crimson_symbiote.png")
    print(f"blob: {b_atlas.width}x{b_atlas.height} texture")

    # items, particles, pack icons
    for name, rows in ICONS.items():
        save(icon(rows, INK), RP, "textures", "items", f"{name}.png")
    for name, rows in RED_ICONS.items():
        save(icon(rows, RED_INK), RP, "textures", "items", f"{name}.png")
    for name, source in RECOLORED.items():
        save(icon(ICONS[source], RED_INK), RP, "textures", "items", f"{name}.png")
    save(particle_sheet(), RP, "textures", "particle", "venom_particles.png")
    save(pack_icon(VENOM, (46, 18, 66)), RP, "pack_icon.png")
    save(pack_icon(VENOM, (66, 18, 30)), BP, "pack_icon.png")

    if preview:
        for name, (atlas, bones) in hosts.items():
            save_json(geo_file(geometry(f"geometry.preview.{name}", atlas, bones, (5, 6), [0, 2, 0])), preview, f"preview_{name}.geo.json")
            save(atlas.render(False, name), preview, f"preview_{name}.png")
        save_json(geo_file(geometry("geometry.preview.blob", b_atlas, blob, (2, 2), [0, 0.5, 0])), preview, "preview_blob.geo.json")
        save(b_atlas.render(False, "blob"), preview, "preview_blob.png")
        names = list(ICONS) + list(RED_ICONS) + list(RECOLORED)
        sheet = Image.new("RGBA", (16 * len(names), 16), (90, 90, 100, 255))
        for i, name in enumerate(names):
            sheet.alpha_composite(Image.open(os.path.join(RP, "textures", "items", f"{name}.png")), (i * 16, 0))
        save(sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST), preview, "icons.png")

    print("assets written")


if __name__ == "__main__":
    main()
