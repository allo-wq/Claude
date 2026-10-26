#!/usr/bin/env python3
"""Render the "Your Cart vs Your Body" vertical short (1080x1920, 30 fps).

Every shot is a still from assets/ animated here: camera moves, transitions,
see-through red/green scans, stat panels, digestion stages and a synthesized
soundtrack. Output is an H.264/AAC MP4.

  python3 render.py --out short.mp4             # full render
  python3 render.py --preview 3.1,9.4 --scale .5 # PNG frames for review
"""
import argparse
import json
import math
import os
import subprocess
import sys
import wave
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import data

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.environ.get('ASSETS', os.path.join(HERE, 'assets'))

RED = (236, 40, 54)
GREEN = (38, 214, 112)
YELLOW = (255, 212, 0)
WHITE = (255, 255, 255)
GREY = (190, 190, 200)
INK = (10, 10, 14)


def _first(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(paths[0])


F_HEAVY = _first(['/usr/share/fonts/truetype/higgsfield/Montserrat-ExtraBold.ttf',
                  '/usr/share/fonts/opentype/inter/Inter-Black.otf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'])
F_BOLD = _first(['/usr/share/fonts/truetype/higgsfield/Metropolis-ExtraBold.ttf',
                 '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'])
F_TEXT = _first(['/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
                 '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
                 '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'])


# ---------------------------------------------------------------- easing ----

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lin(t, t0, t1):
    return clamp((t - t0) / (t1 - t0)) if t1 > t0 else float(t >= t0)


def e_out(x):
    return 1 - (1 - x) ** 3


def e_in(x):
    return x ** 3


def e_io(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def e_back(x, s=1.9):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def mix(a, b, u):
    return a + (b - a) * u


# ------------------------------------------------------------ text/sprites --

@lru_cache(None)
def font(path, size):
    return ImageFont.truetype(path, size)


@lru_cache(maxsize=4096)
def rich(segs, size, fpath=None, stroke=0, shadow=0):
    """Sprite for one line made of (text, color) segments."""
    f = font(fpath or F_HEAVY, size)
    full = ''.join(t for t, _ in segs)
    bb = ImageDraw.Draw(Image.new('RGBA', (1, 1))).textbbox((0, 0), full, font=f, stroke_width=stroke)
    pad = stroke + shadow * 2 + 6
    im = Image.new('RGBA', (bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad), (0, 0, 0, 0))
    ox, oy = pad - bb[0], pad - bb[1]
    if shadow:
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((ox, oy + shadow), full, font=f, fill=(0, 0, 0, 190),
                                stroke_width=stroke, stroke_fill=(0, 0, 0, 190))
        im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(shadow)))
    d = ImageDraw.Draw(im)
    x = ox
    for t, c in segs:
        d.text((x, oy), t, font=f, fill=c, stroke_width=stroke, stroke_fill=(0, 0, 0))
        x += f.getlength(t)
    return im


def text(s, size, color=WHITE, fpath=None, stroke=0, shadow=0):
    return rich(((s, color),), size, fpath, stroke, shadow)


def wrap(s, size, fpath, max_w):
    f = font(fpath, size)
    lines, cur = [], ''
    for word in s.split(' '):
        nxt = (cur + ' ' + word).strip()
        if f.getlength(nxt) > max_w and cur:
            lines.append(cur)
            cur = word
        else:
            cur = nxt
    if cur:
        lines.append(cur)
    return lines


@lru_cache(None)
def pill(s, size, fill, color=WHITE, fpath=None, padx=22, pady=12):
    f = font(fpath or F_BOLD, size)
    bb = f.getbbox(s)
    hb = f.getbbox('HG')
    w = bb[2] - bb[0] + 2 * padx
    h = hb[3] - hb[1] + 2 * pady
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=fill)
    d.text((padx - bb[0], pady - hb[1]), s, font=f, fill=color)
    return im


@lru_cache(None)
def _skull_master(bg):
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((6, 6, S - 6, S - 6), fill=bg + (255,), outline=WHITE + (255,), width=12)
    for ang in (38, -38):
        bone = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bone)
        bd.rounded_rectangle((46, 168, 210, 188), radius=10, fill=WHITE + (255,))
        for ex in (50, 206):
            for ey in (164, 192):
                bd.ellipse((ex - 13, ey - 13, ex + 13, ey + 13), fill=WHITE + (255,))
        im.alpha_composite(bone.rotate(ang, resample=Image.BICUBIC, center=(128, 178)))
    d = ImageDraw.Draw(im)
    d.ellipse((72, 44, 184, 150), fill=WHITE + (255,))
    d.rounded_rectangle((94, 120, 162, 176), radius=14, fill=WHITE + (255,))
    d.ellipse((90, 88, 122, 122), fill=bg + (255,))
    d.ellipse((134, 88, 166, 122), fill=bg + (255,))
    d.polygon([(128, 128), (119, 144), (137, 144)], fill=bg + (255,))
    for x in (111, 128, 145):
        d.line((x, 156, x, 176), fill=bg + (255,), width=6)
    return im


@lru_cache(None)
def _check_master(bg):
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((6, 6, S - 6, S - 6), fill=bg + (255,), outline=WHITE + (255,), width=12)
    d.line([(70, 134), (112, 176), (190, 88)], fill=WHITE + (255,), width=30, joint='curve')
    return im


@lru_cache(None)
def skull(size, bg=RED):
    return _skull_master(bg).resize((size, size), Image.LANCZOS)


@lru_cache(None)
def check(size, bg=GREEN):
    return _check_master(bg).resize((size, size), Image.LANCZOS)


def put(frame, spr, cx, cy, scale=1.0, alpha=1.0, anchor='c'):
    """Paste an RGBA sprite onto an RGB frame, positioned by its anchor point."""
    if scale <= 0.02 or alpha <= 0.02:
        return
    if abs(scale - 1) > 0.01:
        spr = spr.resize((max(1, round(spr.width * scale)), max(1, round(spr.height * scale))), Image.BILINEAR)
    mask = spr.getchannel('A')
    if alpha < 0.99:
        mask = mask.point(lambda v: int(v * alpha))
    x = cx - spr.width / 2 if anchor in ('c', 't', 'b') else cx if anchor[-1] == 'l' else cx - spr.width
    y = cy - spr.height / 2 if anchor in ('c', 'l', 'r') else cy if anchor[0] == 't' else cy - spr.height
    frame.paste(spr.convert('RGB'), (round(x), round(y)), mask)


def pop(t, t0, dur=0.26):
    """(scale, alpha) for a pop-in that starts at t0."""
    u = lin(t, t0, t0 + dur)
    return (e_back(u) if u > 0 else 0.0), lin(t, t0, t0 + dur * 0.4)


def slam(t, t0, dur=0.18, big=2.2):
    u = lin(t, t0, t0 + dur)
    return mix(big, 1.0, e_out(u)), lin(t, t0, t0 + dur * 0.5)


def caption(frame, lines, t, t0, y, size=96, step=0.16, stroke=8):
    """Stacked bold caption lines, each a tuple of (text, color) segments."""
    for i, segs in enumerate(lines):
        sc, al = pop(t, t0 + i * step)
        spr = rich(tuple(segs), size, F_HEAVY, stroke, 6)
        put(frame, spr, W / 2, y + i * size * 1.08, sc, al)


# ------------------------------------------------------------- assets -------

class Pic:
    def __init__(self, img):
        self.img = img.convert('RGB')
        self.iw, self.ih = self.img.size
        self._bg = None

    def bg(self):
        if self._bg is None:
            base, _ = view(self, 0.5, 0.5, 1.0)
            base = base.resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
            arr = np.asarray(base.resize((W, H), Image.BILINEAR), np.float32) * 0.35
            self._bg = Image.fromarray(arr.astype(np.uint8))
        return self._bg


def _placeholder(name, size=(1152, 2048)):
    im = Image.new('RGB', size, (40, 44, 60))
    d = ImageDraw.Draw(im)
    for i in range(0, size[0] + size[1], 120):
        d.line((i, 0, i - size[1], size[1]), fill=(55, 60, 80), width=30)
    d.text((40, 40), name, font=font(F_HEAVY, 90), fill=WHITE)
    return im


ASSET_NAMES = ['hero', 'shelf_junk', 'shelf_healthy', 'bag', 'bag_inside', 'j_throat', 'j_stomach',
               'j_intestine', 'j_artery', 'h_throat', 'h_stomach', 'h_intestine', 'h_artery', 'c_reach',
               'c_xray', 'c_produce', 'c_couch', 'c_jog']
FALLBACK = {'c_reach': 'hero', 'c_produce': 'hero', 'c_couch': 'hero', 'c_jog': 'hero', 'c_xray': 'hero'}

P = {}
LAYOUT = dict(data.LAYOUT)


def load_assets():
    missing = []
    for n in ASSET_NAMES:
        path = os.path.join(ASSETS, n + '.png')
        if os.path.exists(path):
            P[n] = Pic(Image.open(path))
    for n in ASSET_NAMES:
        if n not in P:
            if n in FALLBACK and FALLBACK[n] in P:
                P[n] = P[FALLBACK[n]]
            else:
                P[n] = Pic(_placeholder(n, (2048, 1152) if n.startswith('shelf') else (1152, 2048)))
            missing.append(n)
    lp = os.path.join(HERE, 'layout.json')
    if os.path.exists(lp):
        LAYOUT.update(json.load(open(lp)))
    return missing


# -------------------------------------------------------------- camera ------

def view(pic, cx, cy, z=1.0, out=(W, H), bg=None):
    """Camera onto `pic`: center (cx, cy) normalized, zoom z relative to cover-fit.

    Returns the frame and the transform (x0, y0, s) mapping source px to frame px.
    """
    ow, oh = out
    iw, ih = pic.iw, pic.ih
    s = max(ow / iw, oh / ih) * z
    ww, wh = ow / s, oh / s
    x0 = cx * iw - ww / 2
    y0 = cy * ih - wh / 2
    x0 = clamp(x0, 0, iw - ww) if ww <= iw else (iw - ww) / 2
    y0 = clamp(y0, 0, ih - wh) if wh <= ih else (ih - wh) / 2
    if x0 >= 0 and y0 >= 0 and x0 + ww <= iw + 1e-6 and y0 + wh <= ih + 1e-6:
        im = pic.img.resize((ow, oh), Image.BILINEAR, box=(x0, y0, x0 + ww, y0 + wh))
    else:
        im = (bg or Image.new('RGB', (ow, oh), INK)).copy()
        sx0, sy0 = max(0, x0), max(0, y0)
        sx1, sy1 = min(iw, x0 + ww), min(ih, y0 + wh)
        part = pic.img.resize((max(1, round((sx1 - sx0) * s)), max(1, round((sy1 - sy0) * s))),
                              Image.BILINEAR, box=(sx0, sy0, sx1, sy1))
        im.paste(part, (round((sx0 - x0) * s), round((sy0 - y0) * s)))
    return im, (x0, y0, s)


def to_frame(tr, pic, nx, ny):
    x0, y0, s = tr
    return (nx * pic.iw - x0) * s, (ny * pic.ih - y0) * s


def shake_offset(t, hits, amp=22):
    dx = dy = 0.0
    for th, a in hits:
        u = t - th
        if 0 <= u < 0.35:
            k = amp * a * math.exp(-u / 0.09)
            dx += k * math.sin(u * 95 + th * 7)
            dy += k * math.cos(u * 83 + th * 3)
    return dx, dy


def apply_shake(im, dx, dy, m=26):
    if abs(dx) + abs(dy) < 0.5:
        return im
    dx, dy = clamp(dx, -m, m), clamp(dy, -m, m)
    return im.resize((W, H), Image.BILINEAR, box=(m + dx, m * H / W + dy, W - m + dx, H - m * H / W + dy))


# ------------------------------------------------------------- effects ------

def arr(im):
    return np.asarray(im, np.float32)


def img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def zoom_blur(im, amount, n=7, center=(0.5, 0.5)):
    if amount < 0.004:
        return im
    cx, cy = center[0] * W, center[1] * H
    acc = arr(im)
    for k in range(1, n):
        sc = 1 + amount * k / (n - 1)
        x0, y0 = cx - cx / sc, cy - cy / sc
        acc += arr(im.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + W / sc, y0 + H / sc)))
    return img(acc / n)


def _shift(a, ox, oy):
    out = np.empty_like(a)
    h, w = a.shape[:2]
    ox = int(clamp(ox, -w + 1, w - 1))
    oy = int(clamp(oy, -h + 1, h - 1))
    if ox > 0:
        out[:, ox:] = a[:, :w - ox]
        out[:, :ox] = a[:, :1]
    elif ox < 0:
        out[:, :w + ox] = a[:, -ox:]
        out[:, w + ox:] = a[:, -1:]
    else:
        out[:] = a
    if oy:
        b = out.copy()
        if oy > 0:
            out[oy:] = b[:h - oy]
            out[:oy] = b[:1]
        else:
            out[:h + oy] = b[-oy:]
            out[h + oy:] = b[-1:]
    return out


def motion_blur(im, dx, dy, n=9):
    if abs(dx) + abs(dy) < 2:
        return im
    a = arr(im)
    acc = np.zeros_like(a)
    for k in range(n):
        f = k / (n - 1) - 0.5
        acc += _shift(a, round(dx * f), round(dy * f))
    return img(acc / n)


def rgb_split(im, px):
    px = int(px)
    if px < 1:
        return im
    a = np.asarray(im).copy()
    a[:, :, 0] = np.roll(a[:, :, 0], px, axis=1)
    a[:, :, 2] = np.roll(a[:, :, 2], -px, axis=1)
    return Image.fromarray(a)


def flash(im, f, color=(255, 255, 255)):
    if f <= 0.01:
        return im
    return img(arr(im) * (1 - f) + np.array(color, np.float32) * f)


def grade(im, kind, k=1.0):
    """Color grade: 'red' (sick), 'green' (healthy), 'cold' (desaturated)."""
    if k <= 0.01:
        return im
    a = arr(im)
    g = a.mean(axis=2, keepdims=True)
    if kind == 'red':
        b = (a * 0.45 + g * 0.55) * np.array([1.18, 0.72, 0.72], np.float32)
    elif kind == 'green':
        b = a * np.array([0.95, 1.08, 0.98], np.float32) + 6
    elif kind == 'warm':
        b = a * np.array([1.08, 1.0, 0.86], np.float32) + 8
    else:
        b = (a * 0.35 + g * 0.65) * np.array([0.92, 0.96, 1.05], np.float32) * 0.85
    return img(a * (1 - k) + b * k)


def _ramp(n, feather):
    i = np.arange(n, dtype=np.float32)
    return np.clip(np.minimum(i + 1, n - i) / max(1.0, feather), 0, 1)


def scan_tint(frame, box, p, color, flash_k=0.0):
    """The see-through scan: desaturate, grey veil, then a translucent color wash."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    bx0, by0, bx1, by1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if bx1 - bx0 < 4 or by1 - by0 < 4 or p <= 0.01:
        return frame
    a = np.array(frame)
    reg = a[by0:by1, bx0:bx1].astype(np.float32)
    g = reg.mean(axis=2, keepdims=True)
    out = reg * (1 - 0.6 * p) + g * 0.6 * p
    out = out * (1 - 0.2 * p) + 120 * 0.2 * p
    wash = 0.36 * p + 0.35 * flash_k
    out = out * (1 - wash) + np.array(color, np.float32) * wash
    fe = 0.06 * min(x1 - x0, y1 - y0)
    m = np.outer(_ramp(y1 - y0, fe), _ramp(x1 - x0, fe))[by0 - y0:by1 - y0, bx0 - x0:bx1 - x0][..., None]
    a[by0:by1, bx0:bx1] = (reg * (1 - m) + out * m).astype(np.uint8)
    return Image.fromarray(a)


def brackets(d, box, color, alpha, width=7):
    x0, y0, x1, y1 = box
    L = 0.2 * min(x1 - x0, y1 - y0)
    c = color + (int(255 * alpha),)
    for (px, py, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line([(px, py + sy * L), (px, py), (px + sx * L, py)], fill=c, width=width, joint='curve')


VIG = None
GRAIN = None


def _post_init():
    global VIG, GRAIN
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dd = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 * 0.9 + ((yy - H / 2) / (H / 2)) ** 2)
    VIG = (1 - 0.42 * np.clip((dd - 0.5) / 0.9, 0, 1) ** 1.5)[..., None].astype(np.float32)
    rng = np.random.default_rng(3)
    GRAIN = [rng.normal(0, 3.0, (H, W, 1)).astype(np.float32) for _ in range(6)]


def post(im, t):
    a = arr(im) * VIG + GRAIN[int(t * FPS) % len(GRAIN)]
    return img(a)


# --------------------------------------------------------------- audio ------

SR = 44100
_rng = np.random.default_rng(11)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return _rng.uniform(-1, 1, int(d * SR))


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-3
    m = 1 / (1 + (lo / f) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, n=len(x))


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def sweep(f0, f1, d, curve=4.0):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / d * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def sfx_whoosh(d=0.5, lo=350, hi=6000):
    t = tt(d)
    pk = 0.62 * d
    env = np.where(t < pk, (t / pk) ** 2.2, np.exp(-(t - pk) / (0.18 * d)))
    return norm(band(noise(d), lo, hi) * env)


def sfx_impact(d=1.1):
    t = tt(d)
    sub = sweep(120, 36, d, 6) * np.exp(-t / 0.42)
    crack = band(noise(d), 60, 1200) * np.exp(-t / 0.05)
    return norm(np.tanh(1.8 * (sub + 0.7 * crack)))


def sfx_stamp():
    d = 0.35
    t = tt(d)
    thud = sweep(160, 50, d, 8) * np.exp(-t / 0.09)
    ping = np.sin(2 * np.pi * 1760 * t) * np.exp(-t / 0.05) * 0.35
    tick = band(noise(d), 2000, 9000) * np.exp(-t / 0.012) * 0.6
    return norm(np.tanh(2 * (thud + ping + tick)))


def sfx_beep():
    t = tt(0.07)
    b = np.tanh(5 * np.sin(2 * np.pi * 1180 * t)) * np.minimum(1, (0.07 - t) / 0.01)
    gap = np.zeros(int(0.04 * SR))
    return norm(np.concatenate([b, gap, b])) * 0.7


def sfx_riser(d=1.0):
    t = tt(d)
    env = (t / d) ** 3
    return norm((band(noise(d), 900, 9000) * 0.6 + sweep(1300, 220, d, 2.5) * 0.4) * env)


def sfx_glitch(d=0.32):
    out = np.zeros(int(d * SR))
    n = 0
    while n < len(out):
        L = int(_rng.integers(300, 1600))
        t = np.arange(L) / SR
        out[n:n + L] = np.sign(np.sin(2 * np.pi * _rng.uniform(80, 2400) * t))[:len(out) - n] * _rng.uniform(.3, 1)
        n += L + int(_rng.integers(0, 600))
    return norm(np.round(out * 6) / 6) * 0.7


def sfx_gulp():
    d = 0.45
    t = tt(d)
    g = sweep(320, 70, d, 3) * np.exp(-t / 0.16)
    w = band(noise(d), 80, 700) * np.exp(-t / 0.08) * 0.6
    return norm(g + w)


def sfx_heart():
    def thump(a):
        t = tt(0.22)
        return a * (np.sin(2 * np.pi * 52 * t) + 0.4 * np.sin(2 * np.pi * 95 * t)) * np.exp(-t / 0.07)
    out = np.zeros(int(0.6 * SR))
    l, dub = thump(1.0), thump(0.7)
    out[:len(l)] += l
    o = int(0.26 * SR)
    out[o:o + len(dub)] += dub
    return norm(np.tanh(1.5 * out))


def sfx_ching():
    d = 1.0
    t = tt(d)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dec)
            for f, a, dec in ((1318, 1, .5), (1976, .7, .4), (2637, .5, .3), (3951, .3, .2)))
    x += band(noise(d), 3000, 12000) * np.exp(-t / 0.015)
    return norm(x) * 0.8


def sfx_shimmer():
    d = 1.4
    out = np.zeros(int(d * SR))
    for i, m in enumerate((72, 76, 79, 84, 88)):
        t = tt(d - i * 0.05)
        f = 440 * 2 ** ((m - 69) / 12)
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.45)
        o = int(i * 0.05 * SR)
        n = min(len(s), len(out) - o)
        out[o:o + n] += s[:n]
    return norm(out) * 0.6


def sfx_rewind(d=1.1):
    t = tt(d)
    lfo = np.sin(2 * np.pi * 28 * t)
    x = band(noise(d), 1500, 7000) * (0.6 + 0.4 * lfo) + 0.5 * np.sin(2 * np.pi * np.cumsum(900 + 500 * lfo) / SR)
    return norm(x * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.1)) * 0.8


def sfx_pop():
    t = tt(0.08)
    return norm(sweep(500, 1100, 0.08, 2) * np.exp(-t / 0.03)) * 0.5


SFX_BANK = {}


def sfx(name):
    if name not in SFX_BANK:
        SFX_BANK[name] = {
            'whoosh': sfx_whoosh, 'whoosh_down': lambda: sfx_whoosh(0.5, 120, 2200), 'impact': sfx_impact,
            'stamp': sfx_stamp, 'beep': sfx_beep, 'riser': sfx_riser, 'glitch': sfx_glitch, 'gulp': sfx_gulp,
            'heart': sfx_heart, 'ching': sfx_ching, 'shimmer': sfx_shimmer, 'rewind': sfx_rewind,
            'pop': sfx_pop,
        }[name]()
    return SFX_BANK[name]


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def v_kick(soft=False):
    d = 0.42
    t = tt(d)
    x = sweep(150, 45, d, 9) * np.exp(-t / (0.16 if soft else 0.3))
    return np.tanh(2.2 * x) * (0.7 if soft else 1)


def v_clap():
    d = 0.25
    t = tt(d)
    env = np.exp(-t / 0.07) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0.6))
    return band(noise(d), 900, 5000) * env * 0.8


def v_hat(open_=False):
    d = 0.2 if open_ else 0.06
    t = tt(d)
    return band(noise(d), 7000, 16000) * np.exp(-t / (0.07 if open_ else 0.018)) * 0.5


def v_808(f, d):
    t = tt(d)
    x = np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.005) * np.exp(-t / (d * 0.8))
    return np.tanh(1.8 * x) * 0.9


def v_pad(fs, d):
    t = tt(d)
    x = np.zeros_like(t)
    for f in fs:
        for det in (0.997, 1.003):
            for h in range(1, 6):
                x += np.sin(2 * np.pi * f * det * h * t + h) / h ** 1.4
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return x / (len(fs) * 6) * env


def v_pluck(f):
    t = tt(0.5)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) \
        * np.exp(-t / 0.16) * np.minimum(1, t / 0.003) * 0.5


def add(buf, x, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    if i < 0:
        x, i = x[-i:], 0
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def music_trap(buf, t0, t1):
    beat = 60 / 140
    step = beat / 4
    kick, clap, hat, ohat = v_kick(), v_clap(), v_hat(), v_hat(True)
    roots = [38, 38, 41, 36]
    bar = 16 * step
    nbars = int(math.ceil((t1 - t0) / bar))
    for b in range(nbars):
        tb = t0 + b * bar
        for s in range(16):
            ts = tb + s * step
            if ts >= t1:
                break
            if s in (0, 10) or (b % 2 == 1 and s == 7):
                add(buf, kick, ts, 0.9)
            if s in (4, 12):
                add(buf, clap, ts, 0.55)
            if s % 2 == 0:
                add(buf, hat, ts, 0.35)
            if b % 2 == 1 and s >= 13:
                add(buf, hat, ts + step / 2, 0.25)
            if s == 14:
                add(buf, ohat, ts, 0.2)
        r = roots[b % 4]
        add(buf, v_808(midi(r - 12), min(bar * 0.9, t1 - tb)), tb, 0.75)
        add(buf, v_pad([midi(r + 12), midi(r + 15), midi(r + 19)], min(bar, t1 - tb)), tb, 0.35)


def music_body(buf, t0, t1):
    d = t1 - t0
    add(buf, v_pad([midi(38), midi(45), midi(50)], d), t0, 0.5)
    t = tt(d)
    add(buf, np.sin(2 * np.pi * midi(26) * t) * 0.25 * np.minimum(1, t / 1.0) * np.minimum(1, (d - t) / 0.5), t0)


def music_bright(buf, t0, t1):
    beat = 60 / 118
    kick, clap, hat = v_kick(True), v_clap(), v_hat()
    prog = [(60, [60, 64, 67, 72]), (55, [55, 59, 62, 67]), (57, [57, 60, 64, 69]), (53, [53, 57, 60, 65])]
    bar = 4 * beat
    nbars = int(math.ceil((t1 - t0) / bar))
    for b in range(nbars):
        tb = t0 + b * bar
        root, chord = prog[b % 4]
        for q in range(4):
            tq = tb + q * beat
            if tq >= t1:
                break
            add(buf, kick, tq, 0.6)
            if q in (1, 3):
                add(buf, clap, tq, 0.35)
            add(buf, hat, tq + beat / 2, 0.3)
        for e in range(8):
            te = tb + e * beat / 2
            if te < t1:
                add(buf, v_pluck(midi(chord[(e * 3) % 4] + 12)), te, 0.5)
        add(buf, v_808(midi(root - 24), min(bar * 0.9, max(0.05, t1 - tb))), tb, 0.55)
        add(buf, v_pad([midi(n) for n in chord[:3]], min(bar, max(0.05, t1 - tb))), tb, 0.25)


def build_audio(total, sections, events, path):
    n = int((total + 1.5) * SR)
    music = np.zeros(n)
    fx = np.zeros(n)
    for t0, t1, style in sections:
        {'trap': music_trap, 'body': music_body, 'bright': music_bright}[style](music, t0, t1)
    duck = np.ones(n)
    for t, name, gain in events:
        x = sfx(name)
        add(fx, x, t, gain)
        if name in ('impact', 'stamp', 'beep'):
            i = int(t * SR)
            L = int(0.35 * SR)
            seg = 1 - 0.55 * np.exp(-np.arange(L) / (0.12 * SR))
            j = min(n, i + L)
            if i < n:
                duck[i:j] = np.minimum(duck[i:j], seg[:j - i])
    fade = np.ones(n)
    end = int(total * SR)
    fade[end - int(0.6 * SR):end] = np.linspace(1, 0, int(0.6 * SR))
    fade[end:] = 0
    master = music * duck * 0.42 * fade + fx * 0.85
    master = np.tanh(1.3 * master) / np.tanh(1.3)
    master = norm(master, 0.93)[:int(total * SR)]
    pcm = (master * 32767).astype(np.int16)
    st = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st.tobytes())


# --------------------------------------------------------------- scenes -----

class Scene:
    def __init__(self, dur, fn, sfx=(), name=''):
        self.dur, self.fn, self.sfx, self.name = dur, fn, list(sfx), name


# --- character beats ---------------------------------------------------------

def scene_hook():
    pic = P['hero']
    hits = [(0.55, 1.0)]

    def fn(t):
        z = 1.12 + 0.12 * e_out(lin(t, 0, 2.8))
        bob = 0.004 * math.sin(t * 2 * math.pi * 1.7)
        im, _ = view(pic, 0.5, 0.42 + bob, z)
        im = apply_shake(im, *shake_offset(t, hits))
        caption(im, [[("WHAT'S REALLY IN", WHITE)]], t, 0.08, 1360, 88)
        sc, al = slam(t, 0.55)
        put(im, rich((('YOUR CART?', YELLOW),), 132, F_HEAVY, 10, 8), W / 2, 1490, sc, al)
        sc, al = pop(t, 1.1)
        put(im, text('...and what it does to your body', 42, WHITE, F_TEXT, 4, 4), W / 2, 1620, sc, al)
        return im
    return Scene(2.6, fn, [(0.0, 'riser', 0.25), (0.55, 'impact', 0.9), (1.1, 'pop', 0.5)], 'hook')


def scene_char(name, lines, gradek=None, dur=1.8, z0=1.05, z1=1.2, cy=0.45, sfx=()):
    pic = P[name]

    def fn(t):
        z = mix(z0, z1, e_out(lin(t, 0, dur)))
        im, _ = view(pic, 0.5, cy, z)
        if gradek:
            im = grade(im, gradek[0], gradek[1])
        caption(im, lines, t, 0.12, 1400, 96)
        return im
    return Scene(dur, fn, sfx, name)


# --- the shelf scan ----------------------------------------------------------

def scene_shelf(kind):
    junk = kind == 'junk'
    pic = P['shelf_junk' if junk else 'shelf_healthy']
    boxes = LAYOUT['junk_boxes' if junk else 'healthy_boxes']
    items = data.JUNK if junk else data.HEALTHY
    acc = RED if junk else GREEN
    per = 1.2
    t0 = 0.25
    cols = [((boxes[c][0] + boxes[c][2] + boxes[5 + c][0] + boxes[5 + c][2]) / 4) for c in range(5)]
    order = []
    for c in range(5):
        order.append((c, t0 + 2 * c * per + 0.3))
        order.append((5 + c, t0 + 2 * c * per + per + 0.1))
    stamp_t = {k: ts for k, ts in order}
    t_end = t0 + 10 * per
    pull = (t_end + 0.05, t_end + 0.8)
    dur = pull[1] + 1.35
    z_cover = 1.06
    # Pull back until the row of products (not the whole photo) fills the width.
    x_lo, x_hi = min(b[0] for b in boxes), max(b[2] for b in boxes)
    z_fit = (W / pic.iw) / max(W / pic.iw, H / pic.ih) / (x_hi - x_lo + 0.05)
    cy_all = (min(b[1] for b in boxes) + max(b[3] for b in boxes)) / 2

    def cam_x(t):
        if t <= t0:
            return cols[0]
        for c in range(1, 5):
            ts = t0 + 2 * c * per
            if t < ts:
                return cols[c - 1]
            if t < ts + 0.32:
                return mix(cols[c - 1], cols[c], e_io(lin(t, ts, ts + 0.32)))
        return cols[4]

    def camera(t):
        x = cam_x(t)
        z = z_cover + 0.02 * math.sin(t * 1.3)
        for k, ts in order:
            u = t - ts
            if 0 <= u < 0.4:
                z += 0.035 * math.exp(-u / 0.12)
        cy = 0.5
        if t >= pull[0]:
            u = e_io(lin(t, *pull))
            x = mix(x, 0.5 * (x_lo + x_hi), u)
            z = mix(z, z_fit, u)
            cy = mix(0.5, cy_all, u)
        return x, cy, z

    hits = [(ts, 0.5) for _, ts in order] + [(pull[1], 1.0)]

    def fn(t):
        x, cy, z = camera(t)
        im, tr = view(pic, x, cy, z, bg=pic.bg())
        xp, _, _ = camera(t - 1 / FPS)
        vel = (x - xp) * pic.iw * tr[2]
        im = motion_blur(im, vel * 0.9, 0)
        if t >= pull[0]:
            im = zoom_blur(im, 0.12 * math.sin(math.pi * lin(t, *pull)))
        for k in range(10):
            ts = stamp_t[k]
            if t < ts:
                continue
            p = e_out(lin(t, ts, ts + 0.22))
            b = boxes[k]
            fx0, fy0 = to_frame(tr, pic, b[0], b[1])
            fx1, fy1 = to_frame(tr, pic, b[2], b[3])
            im = scan_tint(im, (fx0, fy0, fx1, fy1), p, acc, flash_k=1 - lin(t, ts, ts + 0.25))
        d = ImageDraw.Draw(im, 'RGBA')
        for k in range(10):
            ts = stamp_t[k]
            if t < ts:
                continue
            b = boxes[k]
            fx0, fy0 = to_frame(tr, pic, b[0], b[1])
            fx1, fy1 = to_frame(tr, pic, b[2], b[3])
            if fx1 < -50 or fx0 > W + 50:
                continue
            brackets(d, (fx0, fy0, fx1, fy1), acc, e_out(lin(t, ts, ts + 0.2)), max(3, int(7 * tr[2] / 1.7)))
            u = lin(t, ts, ts + 0.32)
            if 0 < u < 1:
                yy = mix(fy0, fy1, u)
                d.rectangle((fx0, yy - 10, fx1, yy + 10), fill=acc + (60,))
                d.line((fx0, yy, fx1, yy), fill=WHITE + (230,), width=4)
            # persistent badge on the item
            badge_size = max(34, int(82 * tr[2] / 1.7))
            sc, al = slam(t, ts + 0.12, 0.16, 2.0)
            if junk:
                n_leth = sum(s[3] for s in items[k]['stats'])
                if n_leth:
                    put(im, skull(badge_size), fx1 - badge_size * 0.2, fy0 + badge_size * 0.2, sc, al)
            else:
                put(im, check(badge_size), fx1 - badge_size * 0.2, fy0 + badge_size * 0.2, sc, al)
                tag = price_tag(items[k])
                tw = 0.11 * pic.iw * tr[2]
                sc2, al2 = pop(t, ts + 0.2)
                put(im, tag, (fx0 + fx1) / 2, fy1 - tw * 0.18, tw / tag.width * sc2, al2)
        # info panel for the item in focus
        if t < t_end + 0.05:
            cur = None
            for k, ts in order:
                if t >= ts:
                    cur = (k, ts)
            if cur:
                k, ts = cur
                pt = t - ts
                out = lin(pt, per - 0.12, per) if k != order[-1][0] else lin(t, t_end - 0.1, t_end + 0.05)
                top_row = k < 5
                panel(im, items[k], k, kind, pt, y=None if top_row else 205, bottom=top_row, fade=out)
        # counters
        n = sum(1 for k in range(10) if t >= stamp_t[k])
        hdr = 'RED FLAGS' if junk else 'GREEN LIGHTS'
        if t < pull[0]:
            put(im, pill(f'{hdr}  {n:02d}/10', 32, (0, 0, 0, 200), acc, F_HEAVY, 24, 14), 40, 120, anchor='l')
            leg = legend(kind)
            put(im, leg, W - 36, 120, anchor='r')
        else:
            sc, al = slam(t, pull[1] - 0.05, 0.2, 2.6)
            put(im, rich((('10/10', acc),), 190, F_HEAVY, 12, 8), W / 2, 330, sc, al)
            sc, al = pop(t, pull[1] + 0.2)
            put(im, text('RED FLAGS' if junk else 'GREEN LIGHTS', 84, WHITE, F_HEAVY, 8, 6), W / 2, 470, sc, al)
            sc, al = pop(t, pull[1] + 0.45)
            sub = 'every item is hurting him' if junk else 'every item is fueling him'
            put(im, text(sub, 46, WHITE, F_TEXT, 4, 4), W / 2, 1460, sc, al)
        im = apply_shake(im, *shake_offset(t, hits, 14))
        return im

    events = [(0.0, 'whoosh', 0.5)]
    for k, ts in order:
        events.append((ts, 'stamp', 0.75))
        if junk and any(s[3] for s in items[k]['stats']):
            events.append((ts + 0.45, 'beep', 0.35))
        if not junk:
            events.append((ts + 0.2, 'pop', 0.4))
    events += [(pull[0], 'whoosh', 0.6), (pull[1] - 0.05, 'impact', 1.0)]
    return Scene(dur, fn, events, 'shelf_' + kind)


@lru_cache(None)
def legend(kind):
    if kind == 'junk':
        icon, txt = skull(44), '= over 1/2 a day\'s limit'
    else:
        icon, txt = check(44), '= clean, real food'
    lab = text(txt, 26, WHITE, F_TEXT, 3, 0)
    w = icon.width + 10 + lab.width + 28
    h = max(icon.height, lab.height) + 16
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=(0, 0, 0, 190))
    im.alpha_composite(icon, (12, (h - icon.height) // 2))
    im.alpha_composite(lab, (12 + icon.width + 6, (h - lab.height) // 2))
    return im


@lru_cache(None)
def price_tag(item):
    """Shelf price label, drawn large so it stays crisp when the camera zooms in."""
    w, h = 900, 470
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 8, w - 8, h - 8), radius=34, fill=(255, 221, 0, 255), outline=(20, 20, 20, 255), width=10)
    d.rectangle((18, 18, w - 18, 120), fill=(20, 20, 20, 255))
    name = text(item['name'], 64, WHITE, F_HEAVY)
    im.alpha_composite(name, ((w - name.width) // 2, 69 - name.height // 2))
    dollars, cents = f"{item['price']:.2f}".split('.')
    big = text('$' + dollars, 250, INK, F_HEAVY)
    small = text(cents, 120, INK, F_HEAVY)
    unit = text(item['unit'], 56, INK, F_BOLD)
    x = (w - (big.width + max(small.width, unit.width))) // 2
    im.alpha_composite(big, (x, 140))
    im.alpha_composite(small, (x + big.width - 8, 150))
    im.alpha_composite(unit, (x + big.width - 4, 150 + small.height - 6))
    return im


# Hashable wrapper so items can key lru caches.
class _Item(dict):
    def __hash__(self):
        return hash(self['name'])


data.JUNK[:] = [_Item(i) for i in data.JUNK]
data.HEALTHY[:] = [_Item(i) for i in data.HEALTHY]


@lru_cache(None)
def panel_layout(item, idx, kind):
    junk = kind == 'junk'
    acc = RED if junk else GREEN
    x_in = 34
    els = []  # (sprite, x, y, t_in, style)
    badge = pill(f'#{idx + 1:02d}', 30, acc + (255,), WHITE, F_HEAVY, 16, 9)
    els.append((badge, x_in, 32, 0.02, 'pop'))
    name = text(item['name'], 58, WHITE, F_HEAVY)
    els.append((name, x_in + badge.width + 14, 32 + badge.height / 2 - name.height / 2, 0.05, 'slide'))
    if not junk:
        pr = pill(f"${item['price']:.2f}{item['unit']}", 30, YELLOW + (255,), INK, F_HEAVY, 16, 9)
        els.append((pr, 1000 - x_in - pr.width, 32, 0.3, 'pop'))
    por = text(item['portion'], 30, GREY, F_TEXT)
    els.append((por, x_in, 98, 0.08, 'slide'))
    lab = text('LINKED TO' if junk else 'BENEFITS', 28, acc, F_HEAVY)
    els.append((lab, x_in, 148, 0.12, 'slide'))
    x, y = x_in, 190
    for i, tg in enumerate(item['tags']):
        p = pill(tg, 30, (150, 16, 28, 245) if junk else (16, 120, 64, 245), WHITE, F_BOLD, 20, 12)
        if x + p.width > 1000 - x_in:
            x, y = x_in, y + p.height + 12
        els.append((p, x, y, 0.16 + 0.07 * i, 'pop'))
        x += p.width + 12
    y += 58 + 26
    cw = (1000 - 2 * x_in - 3 * 14) // 4
    icons = []
    for i, st in enumerate(item['stats']):
        lethal = junk and st[3]
        cell = stat_cell(st[0], st[1], st[2], lethal, junk, cw)
        cx = x_in + i * (cw + 14)
        els.append((cell, cx, y, 0.3 + 0.07 * i, 'pop'))
        # Badges hang off the cell's top-right corner, clear of the label.
        if junk and lethal:
            icons.append((skull(66), cx + cw - 52, y - 22, 0.42 + 0.07 * i, 'slam'))
        elif not junk:
            icons.append((check(56), cx + cw - 44, y - 18, 0.42 + 0.07 * i, 'slam'))
    els += icons
    return els, y + 152 + 28


@lru_cache(None)
def stat_cell(label, value, unit, lethal, junk, cw):
    h = 152
    im = Image.new('RGBA', (cw, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    border = RED + (255,) if lethal else ((255, 255, 255, 70) if junk else GREEN + (200,))
    d.rounded_rectangle((1, 1, cw - 2, h - 2), radius=20, fill=(255, 255, 255, 24) if not lethal else (120, 0, 10, 120),
                        outline=border, width=4 if lethal else 2)
    im.alpha_composite(text(label, 22, GREY, F_BOLD), (14, 12))
    v = text(value, 50 if len(value) < 6 else 44, WHITE, F_HEAVY)
    im.alpha_composite(v, (12, 44))
    u = text(unit, 22, GREY, F_TEXT)
    im.alpha_composite(u, (14, 108))
    if lethal:
        lt = text('LETHAL', 22, (255, 90, 100), F_HEAVY)
        im.alpha_composite(lt, (cw - lt.width - 10, 108))
    return im


def panel(frame, item, idx, kind, pt, y=None, bottom=False, fade=0.0):
    els, ph = panel_layout(item, idx, kind)
    acc = RED if kind == 'junk' else GREEN
    if y is None:
        y = H - 70 - ph if bottom else 205
    u = e_out(lin(pt, 0, 0.22))
    al = lin(pt, 0, 0.12) * (1 - fade)
    if al <= 0.01:
        return
    x0 = 40 + (1 - u) * (260 if bottom else -260)
    d = ImageDraw.Draw(frame, 'RGBA')
    d.rounded_rectangle((x0, y, x0 + 1000, y + ph), radius=34, fill=(8, 8, 12, int(208 * al)),
                        outline=acc + (int(200 * al),), width=3)
    d.rounded_rectangle((x0, y + 26, x0 + 9, y + ph - 26), radius=4, fill=acc + (int(255 * al),))
    for spr, ex, ey, tin, style in els:
        if style == 'slam':
            sc, a2 = slam(pt, tin, 0.16, 2.3)
        elif style == 'slide':
            uu = e_out(lin(pt, tin, tin + 0.2))
            sc, a2 = 1.0, uu
            ex += (1 - uu) * 40
        else:
            sc, a2 = pop(pt, tin, 0.22)
        put(frame, spr, x0 + ex + spr.width / 2, y + ey + spr.height / 2, sc, a2 * al)


# --- the worst item ----------------------------------------------------------

def scene_worst():
    pic = P['bag']
    w = data.WORST
    row_t = [1.05 + 0.6 * i for i in range(4)]
    hits = [(0.15, 0.8)] + [(t + 0.15, 0.7) for t, r in zip(row_t, w['rows']) if r[4]]
    mouth = LAYOUT['bag_mouth']
    dur = 4.6

    def fn(t):
        z = 1.0 + 0.1 * e_out(lin(t, 0, dur))
        if t > dur - 0.5:
            z += 1.6 * e_in(lin(t, dur - 0.5, dur + 0.25))
        cx = mix(0.5, mouth[0], lin(t, dur - 0.6, dur))
        cy = mix(0.48, mouth[1], lin(t, dur - 0.6, dur))
        im, _ = view(pic, cx, cy, z)
        im = grade(im, 'red', 0.25)
        if t > dur - 0.5:
            im = zoom_blur(im, 0.35 * e_in(lin(t, dur - 0.5, dur + 0.25)))
        d = ImageDraw.Draw(im, 'RGBA')
        sc, al = pop(t, 0.05)
        put(im, text('THE WORST ONE:', 64, WHITE, F_HEAVY, 7, 5), W / 2, 200, sc, al)
        sc, al = slam(t, 0.2, 0.2, 2.4)
        put(im, rich(((w['name'], RED),), 120, F_HEAVY, 10, 8), W / 2, 320, sc, al)
        sc, al = pop(t, 0.55)
        put(im, pill(w['why'], 32, (0, 0, 0, 210), YELLOW, F_HEAVY, 24, 12), W / 2, 430, sc, al)
        top = 980
        rh = 190
        fade = 1 - lin(t, dur - 0.55, dur - 0.3)
        for i, (lab, val, unit, pct, lethal) in enumerate(w['rows']):
            tin = row_t[i]
            u = e_out(lin(t, tin, tin + 0.22))
            if u <= 0:
                continue
            yy = top + i * rh
            xo = (1 - u) * -500
            a = u * fade
            d.rounded_rectangle((40 + xo, yy, 1040 + xo, yy + rh - 18), radius=28,
                                fill=((90, 0, 8) if lethal else (10, 10, 14)) + (int(215 * a),),
                                outline=(RED if lethal else (120, 120, 130)) + (int(230 * a),), width=4)
            put(im, text(lab, 30, GREY, F_BOLD), 76 + xo, yy + 40, 1, a, 'l')
            put(im, rich(((val, WHITE), (' ' + unit, GREY)), 64, F_HEAVY), 70 + xo, yy + 100, 1, a, 'l')
            put(im, text(pct, 26, (255, 120, 120) if lethal else GREY, F_TEXT), 76 + xo, yy + 148, 1, a, 'l')
            if lethal:
                sc, al = slam(t, tin + 0.15, 0.18, 2.6)
                put(im, skull(124), 900 + xo, yy + 70, sc, al * fade)
                put(im, pill('LETHAL', 26, RED + (255,), WHITE, F_HEAVY, 14, 7), 900 + xo, yy + 145, sc, al * fade)
            else:
                sc, al = pop(t, tin + 0.15)
                put(im, pill('OK', 30, (60, 60, 70, 255), WHITE, F_HEAVY, 18, 9), 900 + xo, yy + 82, sc, al * fade)
        im = rgb_split(im, 10 * sum(max(0, 1 - (t - h) / 0.12) for h, _ in hits if t >= h))
        return apply_shake(im, *shake_offset(t, hits))
    ev = [(0.2, 'impact', 0.9)]
    for i, r in enumerate(w['rows']):
        ev.append((row_t[i], 'whoosh', 0.35))
        ev.append((row_t[i] + 0.15, 'stamp', 0.8))
        if r[4]:
            ev.append((row_t[i] + 0.2, 'beep', 0.6))
    ev.append((dur - 0.9, 'riser', 0.6))
    return Scene(dur, fn, ev, 'worst')


def scene_inside_bag():
    pic = P['bag_inside']
    w = data.WORST
    dur = 2.9

    def fn(t):
        z = 1.25 - 0.17 * e_out(lin(t, 0, dur)) + 0.6 * e_in(lin(t, dur - 0.4, dur + 0.3))
        im, _ = view(pic, 0.5 + 0.01 * math.sin(t * 2), 0.55, z)
        # oil sheen: a soft light band sweeping across the foil
        a = arr(im)
        yy, xx = np.ogrid[0:H, 0:W]
        pos = mix(-600, W + 900, lin(t, 0.2, 2.4))
        band_ = np.exp(-((xx + yy * 0.45 - pos) / 140.0) ** 2)[..., None]
        a = a + band_ * np.array([90, 80, 40], np.float32) * 0.8
        im = img(a)
        sc, al = pop(t, 0.25)
        put(im, text('INSIDE THE BAG', 74, WHITE, F_HEAVY, 8, 6), W / 2, 260, sc, al)
        sc, al = slam(t, 0.7, 0.2, 2.4)
        put(im, rich(((w['fat'], YELLOW),), 110, F_HEAVY, 10, 8), W / 2, 1460, sc, al)
        sc, al = pop(t, 1.15)
        put(im, text(w['oil'], 70, WHITE, F_HEAVY, 7, 6), W / 2, 1590, sc, al)
        return apply_shake(im, *shake_offset(t, [(0.7, 0.8)]))
    return Scene(dur, fn, [(0.7, 'impact', 0.7), (1.15, 'pop', 0.5)], 'inside_bag')


# --- x-ray and digestion -----------------------------------------------------

def scene_xray(kind):
    pic = P['c_xray']
    junk = kind == 'junk'
    tx, ty = LAYOUT['xray_throat']
    dur = 2.4

    def fn(t):
        u = e_in(lin(t, 1.1, dur + 0.2))
        z = mix(1.02, 3.2, u)
        im, _ = view(pic, mix(0.5, tx, e_io(lin(t, 0.9, dur))), mix(0.45, ty, e_io(lin(t, 0.9, dur))), z)
        im = grade(im, 'red' if junk else 'green', 0.55 if junk else 0.5)
        if junk:
            a = arr(im)
            a *= np.array([1.05, 0.9, 0.9], np.float32)
            im = img(a)
        # scanner sweep down the body
        sy = mix(-60, H + 60, lin(t, 0.0, 0.9))
        d = ImageDraw.Draw(im, 'RGBA')
        acc = RED if junk else GREEN
        if t < 1.0:
            d.rectangle((0, sy - 40, W, sy + 40), fill=acc + (50,))
            d.line((0, sy, W, sy), fill=WHITE + (220,), width=5)
        im = zoom_blur(im, 0.3 * u, center=(0.5, 0.5))
        lines = [[('NOW FOLLOW IT', WHITE)], [('INSIDE HIS BODY', acc)]]
        if t < 1.6:
            caption(im, lines, t, 0.2, 1420, 92)
        return im
    return Scene(dur, fn, [(0.0, 'riser', 0.4), (1.2, 'riser', 0.5)], 'xray_' + kind)


def stage_header(frame, t, idx, title, acc, n=5):
    sc, al = pop(t, 0.05)
    put(frame, text(f'STAGE {idx + 1}/{n}', 32, acc, F_HEAVY, 4, 3), W / 2, 92, sc, al)
    sc, al = slam(t, 0.12, 0.18, 1.8)
    put(frame, text(title, 96, WHITE, F_HEAVY, 8, 6), W / 2, 178, sc, al)
    d = ImageDraw.Draw(frame, 'RGBA')
    sw, gap = 150, 12
    x = (W - (5 * sw + 4 * gap)) / 2
    for i in range(n):
        filled = i < idx or (i == idx and t > 0.2)
        a = 255 if filled else 70
        if i == idx:
            a = int(160 + 95 * (0.5 + 0.5 * math.sin(t * 9)))
        d.rounded_rectangle((x, 262, x + sw, 274), radius=6, fill=(acc if filled else WHITE) + (a,))
        x += sw + gap


def particles(frame, t, color, n=26, seed=5, up=True):
    rng = np.random.default_rng(seed)
    d = ImageDraw.Draw(frame, 'RGBA')
    for i in range(n):
        x = rng.uniform(0, W)
        sp = rng.uniform(60, 220)
        y = (rng.uniform(0, H) - (sp * t if up else -sp * t)) % (H + 100) - 50
        r = rng.uniform(4, 13)
        tw = 0.5 + 0.5 * math.sin(t * rng.uniform(2, 5) + i)
        for rr, aa in ((r * 3, 26), (r * 1.8, 60), (r, 200)):
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=color + (int(aa * tw),))


def scene_stage(kind, idx, title, head, detail, asset, tunnel):
    pic = P[asset]
    junk = kind == 'junk'
    acc = RED if junk else GREEN
    dur = 2.15

    def fn(t):
        z = 1.04 + (0.42 if tunnel else 0.16) * (t / dur)
        im, _ = view(pic, 0.5 + 0.015 * math.sin(t * 1.7), 0.5 + 0.012 * math.cos(t * 1.3), z)
        if junk:
            pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi * 1.3)
            im = grade(im, 'red', 0.12 + 0.12 * pulse)
        else:
            im = grade(im, 'green', 0.35)
            particles(im, t, (190, 255, 120), seed=idx + 3)
        stage_header(im, t, idx, title, acc)
        lines = wrap(head, 76, F_HEAVY, 960)
        for i, ln in enumerate(lines):
            sc, al = pop(t, 0.35 + 0.1 * i)
            put(im, text(ln, 76, WHITE, F_HEAVY, 8, 6), W / 2, 1440 + i * 86, sc, al)
        sc, al = pop(t, 0.7)
        put(im, pill(detail, 36, (0, 0, 0, 205), acc, F_TEXT, 26, 14), W / 2, 1440 + len(lines) * 86 + 30, sc, al)
        return im
    ev = [(0.12, 'stamp', 0.5)]
    if idx == 0:
        ev.append((0.2, 'gulp', 0.9))
    if junk:
        ev += [(0.4, 'heart', 0.5), (1.4, 'heart', 0.5)]
    return Scene(dur, fn, ev, f'{kind}_stage{idx}')


def scene_outcome(kind):
    junk = kind == 'junk'
    o = data.JUNK_OUTCOME if junk else data.HEALTHY_OUTCOME
    pic = P[o['asset']]
    acc = RED if junk else GREEN
    dur = 3.5
    beats = [0.2 + i * (0.62 if junk else 0.8) - (0.004 * i * i * 10 if junk else 0) for i in range(6)]
    row_t = [0.75 + 0.45 * i for i in range(4)]

    def fn(t):
        z = 1.05 + 0.1 * (t / dur)
        for b in beats:
            u = t - b
            if 0 <= u < 0.3:
                z += 0.03 * math.exp(-u / 0.08)
        cx, cy = LAYOUT['xray_chest']
        im, tr = view(pic, cx, cy, z * 1.75)
        beat = sum(math.exp(-(t - b) / 0.12) for b in beats if t >= b)
        if junk:
            im = grade(im, 'red', 0.45 + 0.2 * beat)
        else:
            im = grade(im, 'green', 0.45)
        # the heart glows with each beat: angry red when sick, warm green when healthy
        hx, hy = to_frame(tr, pic, *LAYOUT['xray_heart'])
        a = arr(im)
        yy, xx = np.ogrid[0:H, 0:W]
        glow = np.exp(-(((xx - hx) / 260.0) ** 2 + ((yy - hy) / 260.0) ** 2))[..., None]
        col = np.array((255, 40, 40) if junk else (90, 255, 140), np.float32)
        im = img(a + glow * col * (0.25 + 0.55 * min(1.0, beat)))
        if not junk:
            particles(im, t, (255, 230, 140), seed=11)
        stage_header(im, t, 4, 'THE OUTCOME', acc)
        d = ImageDraw.Draw(im, 'RGBA')
        top = 1060
        for i, it in enumerate(o['items']):
            tin = row_t[i]
            u = e_out(lin(t, tin, tin + 0.22))
            if u <= 0:
                continue
            yy = top + i * 132
            xo = (1 - u) * 400
            d.rounded_rectangle((70 + xo, yy, 1010 + xo, yy + 112), radius=56, fill=(0, 0, 0, int(200 * u)),
                                outline=acc + (int(230 * u),), width=4)
            sc, al = slam(t, tin + 0.05, 0.16, 2.0)
            put(im, (skull if junk else check)(92), 128 + xo, yy + 56, sc, al)
            put(im, text(it, 56, WHITE, F_HEAVY), 196 + xo, yy + 58, 1, u, 'l')
        sc, al = pop(t, 2.7)
        put(im, text(o['note'], 34, GREY, F_TEXT, 4, 3), W / 2, top + 4 * 132 + 40, sc, al)
        return im
    ev = [(b, 'heart', 0.8 if junk else 0.35) for b in beats]
    ev += [(tin + 0.05, 'stamp', 0.7) for tin in row_t]
    if not junk:
        ev.append((0.1, 'shimmer', 0.7))
    return Scene(dur, fn, ev, kind + '_outcome')


# --- rewind, prices, final ---------------------------------------------------

def scene_rewind(timeline, t_from, t_to):
    dur = 1.1

    def fn(t):
        u = clamp(t / dur)
        src = mix(t_from, t_to, e_in(u))
        im = timeline.frame_raw(src)
        im = grade(im, 'cold', 0.5)
        im = rgb_split(im, 12)
        a = np.array(im)
        a[::4] = (a[::4] * 0.6).astype(np.uint8)
        rng = np.random.default_rng(int(t * 1000))
        for _ in range(5):
            y = int(rng.uniform(0, H - 60))
            hgt = int(rng.uniform(10, 60))
            a[y:y + hgt] = np.roll(a[y:y + hgt], int(rng.uniform(-80, 80)), axis=1)
        im = Image.fromarray(a)
        d = ImageDraw.Draw(im, 'RGBA')
        for k in range(2):
            x = 70 + k * 46
            d.polygon([(x + 44, 90), (x + 44, 150), (x, 120)], fill=WHITE + (240,))
        put(im, text('REWIND', 60, WHITE, F_HEAVY, 5, 4), 190, 120, anchor='l')
        put(im, text("LET'S TRY THE OTHER CART", 54, YELLOW, F_HEAVY, 6, 4), W / 2, 1700)
        return im
    return Scene(dur, fn, [(0.0, 'rewind', 0.8)], 'rewind')


def scene_prices():
    pic = P['shelf_healthy']
    boxes = LAYOUT['healthy_boxes']
    items = data.HEALTHY
    picks = [0, 2, 6]
    dur = 4.4
    snap = [0.0, 0.55, 1.1]
    x_lo, x_hi = min(b[0] for b in boxes), max(b[2] for b in boxes)
    z_fit = (W / pic.iw) / max(W / pic.iw, H / pic.ih) / (x_hi - x_lo + 0.05)
    cx0 = 0.5 * (x_lo + x_hi)
    cy0 = (min(b[1] for b in boxes) + max(b[3] for b in boxes)) / 2
    total_h = sum(i['price'] for i in data.HEALTHY)
    total_j = sum(i['price'] for i in data.JUNK)

    def tag_pos(k):
        # Same spot the shelf scene pins the tag to: centered, just above the box bottom.
        b = boxes[k]
        return (b[0] + b[2]) / 2, b[3] - 0.18 * 0.11 * pic.iw / pic.ih

    def camera(t):
        x, y, z = cx0, cy0, z_fit
        for i, k in enumerate(picks):
            ts = snap[i]
            tx, ty = tag_pos(k)
            u = e_io(lin(t, ts, ts + 0.22))
            x, y, z = mix(x, tx, u), mix(y, ty, u), mix(z, 1.9, u)
        return x, y, z

    def fn(t):
        x, y, z = camera(t)
        im, tr = view(pic, x, y, z, bg=pic.bg())
        xp, yp, _ = camera(t - 1 / FPS)
        im = motion_blur(im, (x - xp) * pic.iw * tr[2] * 0.9, (y - yp) * pic.ih * tr[2] * 0.9)
        if z > 1.2:
            im = im.filter(ImageFilter.GaussianBlur(4 * lin(z, 1.2, 1.9)))
        im = grade(im, 'green', 0.2)
        for k in range(10):
            b = boxes[k]
            fx0, fy0 = to_frame(tr, pic, b[0], b[1])
            fx1, fy1 = to_frame(tr, pic, b[2], b[3])
            if fx1 < -400 or fx0 > W + 400:
                continue
            im = scan_tint(im, (fx0, fy0, fx1, fy1), 1.0, GREEN)
            tag = price_tag(items[k])
            tw = 0.11 * pic.iw * tr[2]
            put(im, tag, (fx0 + fx1) / 2, fy1 - tw * 0.18, tw / tag.width)
        if t > 1.75:
            u = e_out(lin(t, 1.75, 2.0))
            a = arr(im) * (1 - 0.65 * u)
            im = img(a)
            d = ImageDraw.Draw(im, 'RGBA')
            d.rounded_rectangle((60, 520, 1020, 1420), radius=40, fill=(250, 248, 240, int(245 * u)))
            put(im, text('CART TOTAL', 44, INK, F_HEAVY), W / 2, 600, 1, u)
            cnt = e_out(lin(t, 2.0, 2.6))
            put(im, text('REAL FOOD CART', 40, (20, 120, 60), F_HEAVY), 110, 740, 1, lin(t, 1.95, 2.1), 'l')
            put(im, text(f'${total_h * cnt:.2f}', 64, (20, 120, 60), F_HEAVY), 970, 740, 1, lin(t, 1.95, 2.1), 'r')
            put(im, text('JUNK FOOD CART', 40, (190, 20, 30), F_HEAVY), 110, 860, 1, lin(t, 2.1, 2.25), 'l')
            put(im, text(f'${total_j * cnt:.2f}', 64, (190, 20, 30), F_HEAVY), 970, 860, 1, lin(t, 2.1, 2.25), 'r')
            if t > 2.7:
                d.line((110, 950, 970, 950), fill=(30, 30, 30, 255), width=4)
            sc, al = slam(t, 2.75, 0.2, 2.4)
            put(im, text(f'YOU SAVE ${total_j - total_h:.2f}', 78, INK, F_HEAVY), W / 2, 1060, sc, al)
            sc, al = pop(t, 3.1)
            put(im, text('+ way more nutrients', 44, (20, 120, 60), F_HEAVY), W / 2, 1180, sc, al)
            put(im, text('example US prices', 28, (90, 90, 90), F_TEXT), W / 2, 1360, 1, lin(t, 3.2, 3.4))
        else:
            put(im, text('THE PRICES?', 92, WHITE, F_HEAVY, 8, 6), W / 2, 250, *pop(t, 0.05))
        return im
    ev = [(s, 'whoosh', 0.4) for s in snap] + [(s + 0.2, 'ching', 0.6) for s in snap]
    ev += [(1.75, 'whoosh', 0.5), (2.75, 'ching', 0.9), (2.75, 'impact', 0.6)]
    return Scene(dur, fn, ev, 'prices')


def scene_final():
    top, bot = P['c_couch'], P['c_jog']
    dur = 4.6

    def fn(t):
        z = 1.08 + 0.06 * (t / dur)
        a_im, _ = view(top, 0.5, 0.42, z, out=(W, H // 2))
        b_im, _ = view(bot, 0.5, 0.36, z, out=(W, H // 2))
        a_im = grade(a_im, 'red', 0.55)
        b_im = grade(b_im, 'warm', 0.35)
        u = e_out(lin(t, 0, 0.35))
        im = Image.new('RGB', (W, H), INK)
        im.paste(a_im, (round(-W * (1 - u)), 0))
        im.paste(b_im, (round(W * (1 - u)), H // 2))
        d = ImageDraw.Draw(im, 'RGBA')
        d.rectangle((0, H // 2 - 5, W, H // 2 + 5), fill=WHITE + (255,))
        # labels give way to the tagline
        fade = 1 - lin(t, 1.55, 1.75)
        sc, al = pop(t, 0.3)
        put(im, pill('JUNK CART', 40, RED + (240,), WHITE, F_HEAVY, 26, 14), 40, 110, sc, al * fade, anchor='l')
        sc, al = pop(t, 0.45)
        put(im, pill('REAL FOOD CART', 40, GREEN + (240,), INK, F_HEAVY, 26, 14), 40, H // 2 + 110, sc, al * fade,
            anchor='l')
        sc, al = slam(t, 0.7, 0.2, 2.2)
        al *= 1 - lin(t, 1.55, 1.7)
        if al > 0.02:
            r = 70 * sc
            d.ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=INK + (int(255 * al),),
                      outline=WHITE + (int(255 * al),), width=5)
            put(im, text('VS', 64, WHITE, F_HEAVY), W / 2, H / 2, sc, al)
        if t > 1.6:
            k = e_out(lin(t, 1.6, 1.9))
            im = img(arr(im) * (1 - 0.55 * k))
            sc, al = slam(t, 1.7, 0.2, 2.2)
            put(im, text('YOUR CART', 120, WHITE, F_HEAVY, 10, 8), W / 2, H / 2 - 90, sc, al)
            sc, al = slam(t, 2.05, 0.2, 2.2)
            put(im, rich((('= ', WHITE), ('YOUR FUTURE', YELLOW)), 104, F_HEAVY, 10, 8), W / 2, H / 2 + 50, sc, al)
            sc, al = pop(t, 2.8)
            put(im, text('Which cart are you pushing?', 50, WHITE, F_TEXT, 5, 4), W / 2, H / 2 + 220, sc, al)
            put(im, text('Educational only. Values approximate, typical US products. Not medical advice.', 24,
                         (200, 200, 200), F_TEXT, 2, 0), W / 2, H - 70, 1, lin(t, 3.0, 3.3))
        return im
    return Scene(dur, fn, [(0.0, 'whoosh', 0.6), (0.7, 'impact', 0.8), (1.7, 'impact', 1.0),
                           (2.05, 'stamp', 0.9)], 'final')


# ----------------------------------------------------------- transitions ----

def tr_whip(A, B, u):
    if u < 0.5:
        k = e_in(u * 2)
        return motion_blur(A(), 260 * k, 0, 11)
    k = 1 - e_out((u - 0.5) * 2)
    return motion_blur(B(), 260 * k, 0, 11)


def tr_zoom(A, B, u):
    if u < 0.5:
        k = e_in(u * 2)
        im = A()
        s = 1 + 0.5 * k
        im = im.resize((W, H), Image.BILINEAR, box=(W / 2 - W / 2 / s, H / 2 - H / 2 / s,
                                                     W / 2 + W / 2 / s, H / 2 + H / 2 / s))
        return flash(zoom_blur(im, 0.4 * k), 0.5 * k)
    k = 1 - e_out((u - 0.5) * 2)
    im = B()
    s = 1 + 0.35 * k
    im = im.resize((W, H), Image.BILINEAR, box=(W / 2 - W / 2 / s, H / 2 - H / 2 / s,
                                                 W / 2 + W / 2 / s, H / 2 + H / 2 / s))
    return flash(zoom_blur(im, 0.4 * k), 0.5 * k)


def tr_through(A, B, u):
    """Fly into A and out the other side into B (both scenes zoom themselves)."""
    if u < 0.5:
        return flash(A(), 0.6 * e_in(u * 2))
    return flash(zoom_blur(B(), 0.3 * (1 - (u - 0.5) * 2)), 0.6 * (1 - e_out((u - 0.5) * 2)))


def tr_glitch(A, B, u):
    im = A() if u < 0.5 else B()
    k = 1 - abs(u - 0.5) * 2
    im = rgb_split(im, 30 * k)
    a = np.array(im)
    rng = np.random.default_rng(int(u * 997))
    for _ in range(int(14 * k)):
        y = int(rng.uniform(0, H - 80))
        h = int(rng.uniform(8, 90))
        a[y:y + h] = np.roll(a[y:y + h], int(rng.uniform(-200, 200)), axis=1)
    return Image.fromarray(a)


def tr_push(A, B, u):
    """Camera falls down to the next stage."""
    k = e_io(u)
    off = int(k * H)
    im = Image.new('RGB', (W, H))
    im.paste(A(), (0, -off))
    im.paste(B(), (0, H - off))
    v = math.sin(math.pi * u)
    return motion_blur(im, 0, 140 * v, 9)


def tr_flash(A, B, u):
    im = A() if u < 0.5 else B()
    return flash(im, 1 - abs(u - 0.5) * 2)


def tr_leak(A, B, u):
    a = arr(A())
    b = arr(B())
    k = e_io(u)
    m = a * (1 - k) + b * k
    yy, xx = np.ogrid[0:H, 0:W]
    cx = mix(-300, W + 300, u)
    leak = np.exp(-(((xx - cx) / 520.0) ** 2 + ((yy - H * 0.35) / 900.0) ** 2))[..., None]
    m = m + leak * np.array([255, 170, 70], np.float32) * math.sin(math.pi * u) * 0.9
    return img(m)


def tr_cut(A, B, u):
    return A() if u < 0.5 else B()


TRANS = dict(whip=tr_whip, zoom=tr_zoom, through=tr_through, glitch=tr_glitch, push=tr_push, flash=tr_flash,
             leak=tr_leak, cut=tr_cut)
TRANS_SFX = dict(whip='whoosh', zoom='impact', through='whoosh', glitch='glitch', push='whoosh_down',
                 flash='impact', leak='shimmer')


# -------------------------------------------------------------- timeline ----

class Timeline:
    def __init__(self):
        self.items = []
        self.t = 0.0

    def add(self, scene, trans='cut', tdur=0.0):
        self.items.append(dict(scene=scene, start=self.t, trans=trans, tdur=tdur))
        self.t += scene.dur
        return self.items[-1]['start']

    @property
    def total(self):
        return self.t

    def frame_raw(self, t):
        items = self.items
        for j in range(1, len(items)):
            it = items[j]
            b, td = it['start'], it['tdur']
            if td > 0 and b - td / 2 <= t < b + td / 2:
                pa, pb = items[j - 1], it
                A = lambda: pa['scene'].fn(t - pa['start'])
                B = lambda: pb['scene'].fn(t - pb['start'])
                return TRANS[it['trans']](A, B, (t - (b - td / 2)) / td)
        i = 0
        for j, it in enumerate(items):
            if t >= it['start']:
                i = j
        it = items[i]
        return it['scene'].fn(t - it['start'])

    def frame(self, t):
        return post(self.frame_raw(t), t)

    def events(self):
        ev = []
        for it in self.items:
            for t, name, g in it['scene'].sfx:
                ev.append((it['start'] + t, name, g))
            if it['tdur'] > 0 and it['trans'] in TRANS_SFX:
                name = TRANS_SFX[it['trans']]
                lead = 0.3 if name.startswith('whoosh') else 0.0
                ev.append((it['start'] - lead, name, 0.6))
        return ev


def build():
    tl = Timeline()
    marks = {}
    tl.add(scene_hook())
    tl.add(scene_char('c_reach', [[('THE ', WHITE), ('JUNK', RED), (' AISLE', WHITE)]], ('red', 0.15), 1.7,
                      sfx=[(0.15, 'stamp', 0.6)]), 'whip', 0.36)
    tl.add(scene_shelf('junk'), 'whip', 0.36)
    tl.add(scene_worst(), 'zoom', 0.4)
    tl.add(scene_inside_bag(), 'through', 0.4)
    marks['body0'] = tl.add(scene_xray('junk'), 'glitch', 0.3)
    for i, st in enumerate(data.JUNK_STAGES):
        tl.add(scene_stage('junk', i, *st), 'through' if i == 0 else 'push', 0.4)
    tl.add(scene_outcome('junk'), 'push', 0.4)
    marks['body1'] = tl.add(scene_char('c_couch', [[('TIRED. BLOATED.', WHITE)], [('AT RISK.', RED)]],
                                       ('cold', 0.5), 2.0, sfx=[(0.1, 'heart', 0.6)]), 'glitch', 0.3)
    junk_end = tl.t
    tl.add(scene_rewind(tl, junk_end - 0.2, 0.6), 'cut', 0)
    marks['bright0'] = tl.add(scene_char('c_produce', [[('NOW THE', WHITE)], [('REAL FOOD', GREEN), (' CART', WHITE)]],
                                         ('warm', 0.3), 2.0, sfx=[(0.1, 'shimmer', 0.6)]), 'flash', 0.3)
    tl.add(scene_shelf('healthy'), 'whip', 0.36)
    tl.add(scene_prices(), 'cut', 0)
    tl.add(scene_xray('healthy'), 'leak', 0.5)
    for i, st in enumerate(data.HEALTHY_STAGES):
        tl.add(scene_stage('healthy', i, *st), 'through' if i == 0 else 'push', 0.4)
    tl.add(scene_outcome('healthy'), 'push', 0.4)
    tl.add(scene_char('c_jog', [[('MORE ENERGY.', WHITE)], [('STRONGER HEART.', GREEN)]], ('warm', 0.35), 1.9,
                      sfx=[(0.1, 'shimmer', 0.5)]), 'leak', 0.5)
    tl.add(scene_final(), 'zoom', 0.4)
    sections = [(0.0, marks['body0'], 'trap'), (marks['body0'], marks['body1'] + 2.0, 'body'),
                (marks['bright0'], tl.total, 'bright')]
    return tl, sections


# ------------------------------------------------------------------ main ----

def render_chunk(args):
    tl, a, b, path = args
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'faster',
                          '-crf', '20', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for f in range(a, b):
        p.stdin.write(tl.frame(f / FPS).tobytes())
    p.stdin.close()
    p.wait()
    return path


_TL = None


def _worker(job):
    a, b, path = job
    return render_chunk((_TL, a, b, path))


def main():
    global _TL
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, 'your_cart_vs_your_body.mp4'))
    ap.add_argument('--preview', help='comma-separated times (s) to save as PNG')
    ap.add_argument('--scale', type=float, default=0.5)
    ap.add_argument('--chunk', type=float, default=6.0)
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 1)
    ap.add_argument('--range', help='a:b seconds to render (for tests)')
    ap.add_argument('--timeline', action='store_true')
    args = ap.parse_args()

    missing = load_assets()
    if missing:
        print('placeholder assets:', ', '.join(missing), file=sys.stderr)
    _post_init()
    tl, sections = build()
    _TL = tl
    if args.timeline:
        for it in tl.items:
            print(f"{it['start']:7.2f}  {it['scene'].dur:5.2f}  {it['trans']:8s} {it['scene'].name}")
        print(f'total {tl.total:.2f}s')
        return
    if args.preview:
        os.makedirs(os.path.join(HERE, 'preview'), exist_ok=True)
        for ts in args.preview.split(','):
            t = float(ts)
            im = tl.frame(t)
            if args.scale != 1:
                im = im.resize((int(W * args.scale), int(H * args.scale)), Image.BILINEAR)
            p = os.path.join(HERE, 'preview', f'f_{t:06.2f}.jpg')
            im.save(p, quality=85)
            print(p)
        return

    t0, t1 = 0.0, tl.total
    if args.range:
        t0, t1 = map(float, args.range.split(':'))
    work = os.path.join(HERE, 'build')
    os.makedirs(work, exist_ok=True)
    fa, fb = int(round(t0 * FPS)), int(round(t1 * FPS))
    step = int(args.chunk * FPS)
    jobs = [(a, min(fb, a + step), os.path.join(work, f'chunk_{a:05d}.mp4')) for a in range(fa, fb, step)]
    wav = os.path.join(work, 'audio.wav')
    build_audio(tl.total, sections, tl.events(), wav)
    if args.jobs > 1:
        import multiprocessing as mp
        with mp.get_context('fork').Pool(args.jobs) as pool:
            for pth in pool.imap(_worker, jobs):
                print('done', pth, flush=True)
    else:
        for j in jobs:
            print('done', _worker(j), flush=True)
    lst = os.path.join(work, 'list.txt')
    with open(lst, 'w') as f:
        for _, _, pth in jobs:
            f.write(f"file '{pth}'\n")
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                           '-ss', f'{t0}', '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
                           '-movflags', '+faststart', args.out])
    print('wrote', args.out)


if __name__ == '__main__':
    main()
