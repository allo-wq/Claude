#!/usr/bin/env python3
"""Loop Lab channel art: profile picture and banner, in the same style as the video end card.

    python3 brand_assets.py            # writes brand/profile_800.png and brand/banner_2560x1440.png
    python3 brand_assets.py --debug    # also writes previews (small round avatar, banner safe areas)

YouTube specs: the profile picture is 800x800 and shown as a circle (as small as 98 px); the banner
is 2560x1440, and only the centre 1546x423 is guaranteed to show on every device.
"""
import argparse
import colorsys
import math
import os

import cairo
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

import brand

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brand")
CYAN = (0.25, 0.85, 1.0)
ORANGE = (1.0, 0.56, 0.10)
BLUE = (0.22, 0.66, 1.0)
GOLD = (1.0, 0.82, 0.25)


def hue(h, s=0.66, v=1.0):
    return colorsys.hsv_to_rgb(h % 1.0, s, v)


def surface_to_rgb(surf):
    surf.flush()
    w, h = surf.get_width(), surf.get_height()
    return Image.frombuffer("RGBA", (w, h), bytes(surf.get_data()), "raw", "BGRA", 0, 1).convert("RGB")


def _scaled(img, k):
    return img.point(lambda v: min(255, int(v * k)))


def compose(bg, neon, blur_small, blur_big, crisp=None, k_small=0.45, k_big=0.75):
    """Background + neon layer + two bloom passes (additive, like the videos).
    `crisp` is drawn on top afterwards without bloom (used for text)."""
    b, n = surface_to_rgb(bg), surface_to_rgb(neon)
    out = ImageChops.add(b, n)
    out = ImageChops.add(out, _scaled(n.filter(ImageFilter.GaussianBlur(blur_small)), k_small))
    out = ImageChops.add(out, _scaled(n.filter(ImageFilter.GaussianBlur(blur_big)), k_big))
    if crisp is not None:
        crisp.flush()
        w, h = crisp.get_width(), crisp.get_height()
        top = Image.frombuffer("RGBA", (w, h), bytes(crisp.get_data()), "raw", "BGRa", 0, 1)
        out = out.convert("RGBA")
        out.alpha_composite(top)
        out = out.convert("RGB")
    return out


def background(w, h, cx, cy, radius, stars):
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    ctx = cairo.Context(surf)
    g = cairo.RadialGradient(cx, cy, 0, cx, cy, radius)
    g.add_color_stop_rgb(0, 0.12, 0.06, 0.22)
    g.add_color_stop_rgb(0.5, 0.05, 0.03, 0.11)
    g.add_color_stop_rgb(1, 0.015, 0.01, 0.035)
    ctx.set_source(g)
    ctx.paint()
    rng = np.random.default_rng(5)
    for _ in range(stars):
        ctx.arc(rng.uniform(0, w), rng.uniform(0, h), rng.uniform(0.8, 2.6), 0, 2 * math.pi)
        ctx.set_source_rgba(0.85, 0.8, 1.0, rng.uniform(0.05, 0.35))
        ctx.fill()
    return surf


def loop_mark(ctx, x, y, a, lw, head=2.2, comet=True):
    """The Loop Lab infinity mark with a light running along it."""
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    grad = cairo.LinearGradient(x - a, 0, x + a, 0)
    grad.add_color_stop_rgb(0, *brand.VIOLET)
    grad.add_color_stop_rgb(1, *brand.PINK)
    brand.loop_path(ctx, x, y, a, 0, 2 * math.pi, 240)
    ctx.close_path()
    ctx.set_source(grad)
    ctx.set_line_width(lw)
    ctx.stroke()
    if comet:
        n = 22
        ctx.set_line_width(lw * 0.42)
        for i in range(n):
            brand.loop_path(ctx, x, y, a, head - (i + 1) * 0.055, head - i * 0.055, 4)
            ctx.set_source_rgba(1, 1, 1, (1 - i / n) ** 1.6)
            ctx.stroke()


def tracked_text(ctx, s, x, y, size, col, tracking=0.0, alpha=1.0):
    """Left-aligned text, vertically centred on y, with extra letter spacing."""
    ctx.select_font_face(brand.FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)
    _, yb, _, th, _, _ = ctx.text_extents("H")
    ctx.set_source_rgba(*col, alpha)
    for ch in s:
        ctx.move_to(x, y - (yb + th / 2))
        ctx.show_text(ch)
        x += ctx.text_extents(ch)[4] + tracking
    return x


def text_width(ctx, s, size, tracking=0.0):
    ctx.select_font_face(brand.FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)
    return sum(ctx.text_extents(ch)[4] for ch in s) + tracking * (len(s) - 1)


# ----------------------------------------------------------------------------- profile
def profile(size=800):
    c = size / 2
    bg = background(size, size, c, c, size * 0.75, 40)
    neon = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(neon)
    # thin halo ring, so the avatar reads as a "porthole" into the lab
    for k, al in ((0, 0.55), (1, 0.18)):
        grad = cairo.LinearGradient(0, 0, size, size)
        grad.add_color_stop_rgba(0, *brand.VIOLET, al)
        grad.add_color_stop_rgba(1, *brand.PINK, al)
        ctx.set_source(grad)
        ctx.set_line_width(6 if k == 0 else 3)
        ctx.arc(c, c, size * (0.445 - 0.035 * k), 0, 2 * math.pi)
        ctx.stroke()
    loop_mark(ctx, c, c, size * 0.335, size * 0.066, head=0.45)
    return compose(bg, neon, size * 0.012, size * 0.045)


# ------------------------------------------------------------------------------ banner
def banner(w=2560, h=1440):
    cx, cy = w / 2, h / 2
    bg = background(w, h, cx, cy, w * 0.62, 420)
    neon = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    ctx = cairo.Context(neon)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)

    # left: spinning rings with gaps (a nod to RING ESCAPE)
    rx, ry = 250, 740
    for k in range(10):
        r = 110 + k * 32
        gap = 0.5
        a0 = 0.9 + k * 0.32
        ctx.set_source_rgba(*hue(0.78 + 0.19 * k / 9), 0.85 - 0.06 * k)
        ctx.set_line_width(6)
        ctx.new_sub_path()
        ctx.arc(rx, ry, r, a0 + gap / 2, a0 - gap / 2 + 2 * math.pi)
        ctx.stroke()
    for (bx, by), col, ang in (((rx - 30, ry + 40), ORANGE, -0.6), ((rx + 45, ry - 25), BLUE, 2.4)):
        for j in range(12, 0, -1):
            f = 1 - j / 12
            ctx.set_source_rgba(*col, 0.5 * f ** 1.5)
            ctx.set_line_width(22 * f)
            ctx.move_to(bx - math.cos(ang) * 7 * j, by - math.sin(ang) * 7 * j)
            ctx.line_to(bx - math.cos(ang) * 7 * (j - 1), by - math.sin(ang) * 7 * (j - 1))
            ctx.stroke()
        ctx.set_source_rgb(*col)
        ctx.arc(bx, by, 11, 0, 2 * math.pi)
        ctx.fill()

    # right: a Lissajous figure (sound / waves experiments)
    lx, ly = 2310, 720
    pts = [(lx + 190 * math.sin(3 * t + math.pi / 2), ly + 170 * math.sin(2 * t))
           for t in np.linspace(0, 2 * math.pi, 600)]
    grad = cairo.LinearGradient(lx - 190, 0, lx + 190, 0)
    grad.add_color_stop_rgba(0, *CYAN, 0.85)
    grad.add_color_stop_rgba(1, *brand.VIOLET, 0.85)
    ctx.set_source(grad)
    ctx.set_line_width(5)
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    ctx.close_path()
    ctx.stroke()
    ctx.set_source_rgb(1, 1, 1)
    ctx.arc(*pts[95], 9, 0, 2 * math.pi)
    ctx.fill()

    # a faint wave across the bottom and the top, outside the text area
    for yb, amp, ph, col, al in ((1150, 34, 0.0, brand.PINK, 0.35), (1185, 22, 1.6, CYAN, 0.25),
                                 (300, 26, 0.8, brand.VIOLET, 0.3)):
        ctx.set_source_rgba(*col, al)
        ctx.set_line_width(4)
        for i, x in enumerate(np.linspace(0, w, 400)):
            y = yb + amp * math.sin(x / 140 + ph) * math.sin(x / 900 + ph)
            (ctx.move_to if i == 0 else ctx.line_to)(x, y)
        ctx.stroke()

    # floating shapes (other experiments: geometry, particles)
    def poly(x, y, r, n, rot, col, al):
        ctx.set_source_rgba(*col, al)
        ctx.set_line_width(5)
        for i in range(n + 1):
            a = rot + 2 * math.pi * i / n
            (ctx.move_to if i == 0 else ctx.line_to)(x + r * math.cos(a), y + r * math.sin(a))
        ctx.close_path()
        ctx.stroke()
    poly(640, 380, 46, 3, -0.4, GOLD, 0.6)
    poly(1960, 1060, 40, 4, 0.5, CYAN, 0.55)
    poly(2120, 400, 30, 6, 0.2, brand.PINK, 0.5)
    poly(560, 1080, 28, 5, 0.9, brand.VIOLET, 0.55)
    rng = np.random.default_rng(9)
    for _ in range(60):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if 470 < x < 2090 and 470 < y < 970:
            continue
        ctx.set_source_rgba(*hue(rng.uniform(0.5, 1.0)), rng.uniform(0.4, 0.9))
        ctx.arc(x, y, rng.uniform(2, 5), 0, 2 * math.pi)
        ctx.fill()

    # centre (inside the 1546x423 safe area): mark + wordmark + tagline
    name_size, tag_size, tag_track = 190, 46, 9
    a, lw, gap = 125, 28, 70
    name_w = text_width(ctx, brand.NAME, name_size)
    tag_w = text_width(ctx, brand.TAGLINE, tag_size, tag_track)
    group = 2 * a + gap + max(name_w, tag_w)
    x0 = cx - group / 2
    loop_mark(ctx, x0 + a, cy, a, lw, head=0.45)
    tx = x0 + 2 * a + gap
    tracked_text(ctx, brand.NAME, tx, cy - 38, name_size, brand.PINK, alpha=0.35)
    crisp = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    cc = cairo.Context(crisp)
    tracked_text(cc, brand.NAME, tx, cy - 38, name_size, (1, 1, 1))
    tracked_text(cc, brand.TAGLINE, tx + 4, cy + 92, tag_size, brand.SUBTLE, tag_track)

    return compose(bg, neon, 7, 30, crisp=crisp, k_small=0.6, k_big=0.9), (x0, x0 + group)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="also write avatar + safe-area previews")
    ap.add_argument("--debug-dir", default=OUT)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    p = profile()
    p.save(os.path.join(OUT, "profile_800.png"), optimize=True)
    b, (gx0, gx1) = banner()
    b.save(os.path.join(OUT, "banner_2560x1440.png"), optimize=True)
    print("wrote", os.path.join(OUT, "profile_800.png"))
    print("wrote", os.path.join(OUT, "banner_2560x1440.png"))
    print(f"banner text spans x={gx0:.0f}..{gx1:.0f} (safe area 507..2053)")

    if args.debug:
        os.makedirs(args.debug_dir, exist_ok=True)
        # how the avatar looks as YouTube's small circle, at 2x and 1x
        sheet = Image.new("RGB", (420, 220), (24, 24, 24))
        for i, s in enumerate((196, 98)):
            av = p.resize((s, s), Image.LANCZOS)
            mask = Image.new("L", (s, s), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
            sheet.paste(av, (12 + i * 220, 12), mask)
        sheet.save(os.path.join(args.debug_dir, "profile_preview.png"))
        # banner with the TV / desktop / mobile crops outlined
        d = b.copy()
        dr = ImageDraw.Draw(d)
        dr.rectangle((0, 509, 2559, 931), outline=(255, 255, 0), width=4)          # desktop
        dr.rectangle((507, 509, 2053, 931), outline=(0, 255, 120), width=6)        # every device
        d.resize((1280, 720), Image.LANCZOS).save(os.path.join(args.debug_dir, "banner_safe_preview.png"))
        print("debug previews in", args.debug_dir)


if __name__ == "__main__":
    main()
