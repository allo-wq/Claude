"""Loop Lab outro card, shared by every video on the channel.

Nothing here depends on a particular video, so any renderer can end on it:

    import brand
    brand.draw_card(ctx, cx, cy, t)   # cairo context; t = seconds since the card appeared
    brand.sting(sample_rate)          # matching two-note chime (mono numpy array)

    python3 brand.py                  # writes brand_preview.png to check the look
"""
import colorsys
import math

import cairo
import numpy as np

NAME = "LOOP LAB"
TAGLINE = "SOMETHING NEW EVERY VIDEO"
FONT = "Inter Black"
VIOLET = colorsys.hsv_to_rgb(0.78, 0.66, 1.0)
PINK = colorsys.hsv_to_rgb(0.97, 0.66, 1.0)
SUBTLE = (0.80, 0.76, 0.94)
CARD_H = 124


def _clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _ease_out_cubic(x):
    return 1 - (1 - _clamp01(x)) ** 3


def _ease_out_back(x, k=2.2):
    x = _clamp01(x) - 1
    return 1 + (k + 1) * x ** 3 + k * x ** 2


def _loop_point(u, a):
    """Lemniscate (figure-of-eight loop) of half-width a."""
    s, c = math.sin(u), math.cos(u)
    d = 1 + s * s
    return a * c / d, a * s * c / d


def loop_path(ctx, x, y, a, u0, u1, steps):
    for i in range(steps + 1):
        px, py = _loop_point(u0 + (u1 - u0) * i / steps, a)
        (ctx.move_to if i == 0 else ctx.line_to)(x + px, y + py)


def _text(ctx, s, x, y, size, col, alpha):
    ctx.set_font_size(size)
    xb, yb, _, th, _, _ = ctx.text_extents(s)
    ctx.move_to(x - xb, y - (yb + th / 2))
    ctx.set_source_rgba(*col, alpha)
    ctx.show_text(s)


def draw_card(ctx, cx, cy, t):
    """Neon pill with an animated loop logo. It slides up and fades in over ~0.45 s."""
    a = _clamp01(t / 0.3)
    if a <= 0:
        return
    ctx.save()
    ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(54)
    name_w = ctx.text_extents(NAME)[4]
    ctx.set_font_size(25)
    tag_w = ctx.text_extents(TAGLINE)[4]
    logo_w, pad_l, gap, pad_r = 96, 36, 26, 50
    pw = pad_l + logo_w + gap + max(name_w, tag_w) + pad_r
    ph, rad = CARD_H, CARD_H / 2

    ctx.translate(cx, cy + 40 * (1 - _ease_out_cubic(t / 0.45)))
    sc = 0.85 + 0.15 * _ease_out_back(t / 0.45)
    ctx.scale(sc, sc)
    x0 = -pw / 2

    # pill
    ctx.new_sub_path()
    ctx.arc(x0 + pw - rad, 0, rad, -math.pi / 2, math.pi / 2)
    ctx.arc(x0 + rad, 0, rad, math.pi / 2, 3 * math.pi / 2)
    ctx.close_path()
    ctx.set_source_rgba(0.04, 0.02, 0.09, 0.82 * a)
    ctx.fill_preserve()
    for lw, al in ((12, 0.18), (3, 1.0)):
        grad = cairo.LinearGradient(x0, 0, x0 + pw, 0)
        grad.add_color_stop_rgba(0, *VIOLET, al * a)
        grad.add_color_stop_rgba(1, *PINK, al * a)
        ctx.set_source(grad)
        ctx.set_line_width(lw)
        ctx.stroke_preserve()
    ctx.new_path()

    # logo: a neon loop with a light running around it
    lx, la = x0 + pad_l + logo_w / 2, logo_w / 2
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    for lw, al in ((16, 0.22), (7, 1.0)):
        grad = cairo.LinearGradient(lx - la, 0, lx + la, 0)
        grad.add_color_stop_rgba(0, *VIOLET, al * a)
        grad.add_color_stop_rgba(1, *PINK, al * a)
        loop_path(ctx, lx, 0, la, 0, 2 * math.pi, 96)
        ctx.close_path()
        ctx.set_source(grad)
        ctx.set_line_width(lw)
        ctx.stroke()
    head = t * 2.8
    n = 14
    ctx.set_line_width(6)
    for i in range(n):
        loop_path(ctx, lx, 0, la, head - (i + 1) * 0.08, head - i * 0.08, 3)
        ctx.set_source_rgba(1, 1, 1, a * (1 - i / n) ** 1.5)
        ctx.stroke()

    # wordmark
    tx = x0 + pad_l + logo_w + gap
    _text(ctx, NAME, tx, -18, 54, (1, 1, 1), a)
    _text(ctx, TAGLINE, tx + 2, 30, 25, SUBTLE, a)
    ctx.restore()


def sting(sr=48000):
    """Two soft bell notes (B5, F#6) that land with the card."""
    t = np.arange(int(1.6 * sr)) / sr
    out = np.zeros(len(t))
    for i, m in enumerate((83, 90)):
        f = 440.0 * 2 ** ((m - 69) / 12)
        off = int(0.11 * i * sr)
        tt = t[: len(t) - off]
        note = sum(amp * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt / (0.6 * d))
                   for r, amp, d in ((1, 1.0, 1.0), (2.0, 0.5, 0.6), (3.0, 0.22, 0.4)))
        out[off:] += note * np.minimum(1.0, tt / 0.002) / 1.5
    return out


if __name__ == "__main__":
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, 1080, 400)
    ctx = cairo.Context(surf)
    ctx.set_source_rgb(0.05, 0.03, 0.11)
    ctx.paint()
    draw_card(ctx, 540, 200, 2.0)
    surf.write_to_png("brand_preview.png")
    print("wrote brand_preview.png")
