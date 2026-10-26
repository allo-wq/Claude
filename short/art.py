"""Vector art for the animated short, drawn with cairo: drawing helpers, the
main character, the shopping cart, store aisles and the twenty grocery items.

All character and item coordinates are local: (0, 0) is the floor point under
the figure / the bottom-center of the item, and y grows downward.
"""
import math
import random

import cairocffi as cairo
import numpy as np
from PIL import Image

W, H = 1080, 1920
TAU = 2 * math.pi
FONT = 'Inter'

SKIN = (232, 182, 146)
SKIN_D = (201, 145, 108)
SKIN_L = (246, 208, 178)
HAIR = (38, 27, 24)
HAIR_L = (84, 62, 52)
HOOD = (230, 174, 38)
HOOD_D = (188, 134, 22)
HOOD_L = (250, 204, 86)
DENIM = (60, 94, 152)
DENIM_D = (42, 68, 116)
SHOE = (246, 246, 248)
SOLE = (196, 198, 206)
EYE = (32, 24, 24)


# ---------------------------------------------------------------- canvas ----

class Canvas:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
        self.ctx = cairo.Context(self.surf)
        self.ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        self.ctx.set_line_join(cairo.LINE_JOIN_ROUND)

    def image(self):
        self.surf.flush()
        a = np.frombuffer(self.surf.get_data(), np.uint8).reshape(self.h, self.surf.get_stride() // 4, 4)
        return Image.fromarray(a[:, :self.w, 2::-1].copy())


def rgba(c, a=1.0):
    return c[0] / 255, c[1] / 255, c[2] / 255, a


def paint(ctx, c, a=1.0, keep=False):
    ctx.set_source_rgba(*rgba(c, a))
    ctx.fill_preserve() if keep else ctx.fill()


def line(ctx, c, w, a=1.0, keep=False):
    ctx.set_source_rgba(*rgba(c, a))
    ctx.set_line_width(w)
    ctx.stroke_preserve() if keep else ctx.stroke()


def fill_with(ctx, pattern, keep=False):
    ctx.set_source(pattern)
    ctx.fill_preserve() if keep else ctx.fill()


def lin_g(x0, y0, x1, y1, *stops):
    g = cairo.LinearGradient(x0, y0, x1, y1)
    for st in stops:
        g.add_color_stop_rgba(st[0], *rgba(st[1], st[2] if len(st) > 2 else 1.0))
    return g


def rad_g(cx, cy, r0, r1, *stops):
    g = cairo.RadialGradient(cx, cy, r0, cx, cy, r1)
    for st in stops:
        g.add_color_stop_rgba(st[0], *rgba(st[1], st[2] if len(st) > 2 else 1.0))
    return g


def rrect(ctx, x, y, w, h, r):
    r = max(0.0, min(r, w / 2, h / 2))
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -TAU / 4, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, TAU / 4)
    ctx.arc(x + r, y + h - r, r, TAU / 4, TAU / 2)
    ctx.arc(x + r, y + r, r, TAU / 2, 3 * TAU / 4)
    ctx.close_path()


def ell(ctx, cx, cy, rx, ry, rot=0.0):
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot)
    ctx.scale(max(rx, 1e-3), max(ry, 1e-3))
    ctx.new_sub_path()
    ctx.arc(0, 0, 1, 0, TAU)
    ctx.restore()


def circ(ctx, cx, cy, r):
    ctx.new_sub_path()
    ctx.arc(cx, cy, max(r, 1e-3), 0, TAU)


def poly(ctx, pts):
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    ctx.close_path()


def smooth(ctx, pts, closed=True):
    """Catmull-Rom curve through pts."""
    n = len(pts)
    ctx.move_to(*pts[0])
    for i in range(n if closed else n - 1):
        p0, p1 = pts[(i - 1) % n], pts[i]
        p2, p3 = pts[(i + 1) % n], pts[(i + 2) % n]
        if not closed:
            p0 = pts[max(i - 1, 0)]
            p3 = pts[min(i + 2, n - 1)]
        ctx.curve_to(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                     p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
    if closed:
        ctx.close_path()


def blob(ctx, cx, cy, rx, ry, seed=0, n=9, wob=0.18, rot=0.0):
    rng = random.Random(seed)
    pts = []
    for i in range(n):
        a = rot + TAU * i / n
        k = 1 + wob * (rng.random() * 2 - 1)
        pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    smooth(ctx, pts)


def path(ctx, pts, c, w, a=1.0):
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    line(ctx, c, w, a)


def heart_path(ctx, cx, cy, s):
    ctx.move_to(cx, cy + 0.95 * s)
    ctx.curve_to(cx - 1.45 * s, cy - 0.05 * s, cx - 0.95 * s, cy - 1.25 * s, cx, cy - 0.45 * s)
    ctx.curve_to(cx + 0.95 * s, cy - 1.25 * s, cx + 1.45 * s, cy - 0.05 * s, cx, cy + 0.95 * s)
    ctx.close_path()


def label(ctx, s, x, y, size, c, a=1.0, anchor='c'):
    """World-space text (scales with the camera, unlike the PIL overlays)."""
    ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(size)
    xb, yb, tw, th, _, _ = ctx.text_extents(s)
    ox = {'c': -tw / 2, 'l': 0, 'r': -tw}[anchor] - xb
    ctx.move_to(x + ox, y - th / 2 - yb)
    ctx.set_source_rgba(*rgba(c, a))
    ctx.show_text(s)
    ctx.new_path()


def shine(ctx, x, y, w, h, a=0.28):
    rrect(ctx, x, y, w, h, w / 2)
    paint(ctx, (255, 255, 255), a)


def soft_shadow(ctx, cx, cy, rx, ry, a=0.22):
    ell(ctx, cx, cy, rx, ry)
    fill_with(ctx, rad_g(cx, cy, 0, max(rx, ry), (0, (0, 0, 0), a), (1, (0, 0, 0), 0)))


def ik(S, T, L1, L2, bend=1):
    """Elbow/knee position for a two-bone limb from S reaching toward T."""
    dx, dy = T[0] - S[0], T[1] - S[1]
    d = min(max(math.hypot(dx, dy), abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3)
    a = math.atan2(dy, dx)
    b = math.acos(max(-1.0, min(1.0, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    ang = a + bend * b
    E = (S[0] + L1 * math.cos(ang), S[1] + L1 * math.sin(ang))
    k = min(1.0, (L1 + L2) / max(1e-3, math.hypot(dx, dy)))
    return E, (S[0] + dx * k, S[1] + dy * k)


# ------------------------------------------------------------- character ----

def _curls(seed, a0, a1, n, dist, r0, r1):
    rng = random.Random(seed)
    return [(math.radians(a0 + (a1 - a0) * (i + rng.random() * 0.7) / n), dist + rng.uniform(-8, 8),
             rng.uniform(r0, r1)) for i in range(n)]


CURLS_SIDE = _curls(4, 150, 318, 15, 90, 30, 42)
CURLS_FRONT = _curls(9, 200, 340, 16, 104, 28, 40)


def _hair(ctx, hx, hy, curls, cap):
    blob(ctx, hx + cap[0], hy + cap[1], cap[2], cap[3], seed=5, n=12, wob=0.05)
    paint(ctx, HAIR)
    for a, d, r in curls:
        circ(ctx, hx + d * math.cos(a), hy + d * math.sin(a), r)
        paint(ctx, HAIR)
    for a, d, r in curls[::2]:
        ctx.new_sub_path()
        ctx.arc(hx + d * math.cos(a), hy + d * math.sin(a), r * 0.55, math.pi * 1.05, math.pi * 1.55)
        line(ctx, HAIR_L, 6)


def _mouth(ctx, x, y, mood, s=1.0):
    if mood == 'happy':
        ctx.new_sub_path()
        ctx.arc(x, y - 14 * s, 26 * s, 0.35, math.pi - 0.35)
        line(ctx, (120, 40, 40), 8 * s)
    elif mood == 'tempted':
        ell(ctx, x, y, 10 * s, 13 * s)
        paint(ctx, (110, 40, 40))
    else:  # tired / sick
        ctx.move_to(x - 22 * s, y + 4 * s)
        ctx.curve_to(x - 8 * s, y - 4 * s, x + 8 * s, y - 4 * s, x + 22 * s, y + 6 * s)
        line(ctx, (120, 50, 50), 7 * s)


def _eye(ctx, x, y, mood, white=True, look=(0, 0), blink=0.0):
    if white:
        ell(ctx, x, y, 21, 25)
        paint(ctx, (255, 255, 255))
        circ(ctx, x + 4 + look[0], y + 3 + look[1], 11)
        paint(ctx, EYE)
        circ(ctx, x + 8 + look[0], y - 2 + look[1], 4)
        paint(ctx, (255, 255, 255))
    else:
        ell(ctx, x, y, 10, 14)
        paint(ctx, EYE)
        circ(ctx, x + 3, y - 5, 3.5)
        paint(ctx, (255, 255, 255))
    lid = 0.55 if mood == 'tired' else 0.0
    lid = max(lid, blink)
    if lid > 0:
        r = 26 if white else 16
        ctx.save()
        ctx.rectangle(x - r, y - r, 2 * r, 2 * r * lid)
        ctx.clip()
        ell(ctx, x, y, r - 4, r)
        paint(ctx, SKIN_D)
        ctx.restore()
        ctx.move_to(x - r + 4, y - r + 2 * r * lid)
        ctx.line_to(x + r - 4, y - r + 2 * r * lid)
        line(ctx, (150, 100, 80), 4)


def guy_side(ctx, x, y, s, ph=0.0, stride=1.0, run=False, hands=None, mood='happy', lean=0.0, look=0.0,
             arm_raise=None, front_hand=None):
    """The main character in profile, facing right. ph is the walk-cycle phase; hands is the
    cart-handle point both hands grip, front_hand overrides the near hand (reaching)."""
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    st = stride
    bob = -30 * abs(math.sin(ph)) * st if run else -12 * math.cos(2 * ph) * st
    hip = (0.0, -470 + bob)
    amp = math.radians(42 if run else 25) * st
    kamp = math.radians(95 if run else 40) * st

    def leg(lp, col):
        sw = amp * math.sin(lp)
        kb = kamp * max(0.0, math.sin(lp + 1.25))
        knee = (hip[0] + 225 * math.sin(sw), hip[1] + 225 * math.cos(sw))
        sa = sw - kb
        ank = (knee[0] + 215 * math.sin(sa), knee[1] + 215 * math.cos(sa))
        path(ctx, [hip, knee, ank], col, 98)
        ctx.save()
        ctx.translate(*ank)
        ctx.rotate(-sa * 0.4)
        rrect(ctx, -40, -24, 152, 60, 28)
        paint(ctx, SHOE)
        rrect(ctx, -40, 20, 152, 18, 9)
        paint(ctx, SOLE)
        ctx.restore()

    sh = (14.0, -792 + bob)

    def arm(col, swing_ph, target, front):
        if target is not None:
            E, T = ik(sh, target, 195, 185, bend=1)
        else:
            a1 = math.radians(48 if run else 22) * st * math.sin(swing_ph)
            if arm_raise is not None and front:
                a1 = arm_raise
            E = (sh[0] + 195 * math.sin(a1), sh[1] + 195 * math.cos(a1))
            fa = a1 + math.radians(95 if run else 18)
            if arm_raise is not None and front:
                fa = a1 + math.radians(25)
            T = (E[0] + 185 * math.sin(fa), E[1] + 185 * math.cos(fa))
        path(ctx, [sh, E, T], col, 86)
        circ(ctx, T[0], T[1], 40)
        paint(ctx, SKIN if front else SKIN_D)

    back_target = None if hands is None else (hands[0] - 30, hands[1] + 6)
    arm(HOOD_D, ph, back_target, False)
    leg(ph + math.pi, DENIM_D)
    leg(ph, DENIM)

    # torso
    ctx.save()
    ctx.translate(*hip)
    ctx.rotate(lean)
    pts = [(-92, 36), (94, 36), (112, -140), (100, -300), (56, -362), (-42, -372), (-104, -318), (-114, -150)]
    smooth(ctx, pts)
    fill_with(ctx, lin_g(-115, 0, 115, 0, (0, HOOD_D), (0.55, HOOD), (1, HOOD_L)))
    blob(ctx, -62, -340, 70, 50, seed=2, n=8, wob=0.08)
    paint(ctx, HOOD_D)
    rrect(ctx, -2, -138, 102, 84, 30)
    paint(ctx, HOOD_D, 0.55)
    rrect(ctx, -96, 8, 196, 34, 16)
    paint(ctx, HOOD_D)
    path(ctx, [(52, -350), (54, -262)], (250, 245, 235), 7)
    path(ctx, [(70, -346), (74, -270)], (250, 245, 235), 7)
    ctx.restore()

    # head
    hx, hy = 40.0 + 30 * lean, -935 + bob
    rrect(ctx, hx - 44, hy + 48, 74, 86, 22)
    paint(ctx, SKIN_D)
    blob(ctx, hx - 38, hy + 128, 92, 40, seed=8, n=8, wob=0.06)
    paint(ctx, HOOD_D)
    circ(ctx, hx, hy, 100)
    fill_with(ctx, rad_g(hx + 30, hy - 30, 10, 130, (0, SKIN_L), (1, SKIN)))
    ell(ctx, hx + 38, hy + 46, 62, 46)
    paint(ctx, SKIN)
    ell(ctx, hx + 48, hy + 58, 56, 30)
    paint(ctx, SKIN_D, 0.32)
    ell(ctx, hx + 101, hy + 4, 20, 25, 0.3)
    paint(ctx, SKIN)
    _hair(ctx, hx, hy, CURLS_SIDE, (-28, -50, 92, 62))
    ell(ctx, hx - 16, hy + 12, 20, 28)
    paint(ctx, SKIN_D)
    _eye(ctx, hx + 60 + look, hy - 4, mood, white=False)
    path(ctx, [(hx + 42, hy - 40 - (6 if mood == 'tempted' else 0)), (hx + 84, hy - 44)], HAIR, 12)
    _mouth(ctx, hx + 70, hy + 44, mood, 0.8)

    arm(HOOD, ph + math.pi, front_hand if front_hand is not None else hands, True)
    ctx.restore()


def guy_front(ctx, x, y, s, mood='happy', sit=False, tilt=0.0, blink=0.0, hologram=False, holo=(90, 200, 255),
              inner=None):
    """Front view. With hologram=True the body is drawn as a see-through x-ray shell and
    inner(ctx) draws the organs (in these local coordinates) before the neck and head."""
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)

    def body_fill(c_main, c_dark):
        if hologram:
            paint(ctx, (20, 50, 90), 0.42, keep=True)
            line(ctx, holo, 7, 0.9)
        else:
            fill_with(ctx, lin_g(-200, 0, 200, 0, (0, c_dark), (0.5, c_main), (1, c_dark)))

    # legs
    if sit:
        for sd in (-1, 1):
            rrect(ctx, sd * 62 - 62, -470, 124, 150, 60)
            body_fill(DENIM, DENIM_D)
            path(ctx, [(sd * 80, -360), (sd * 92, -60)], DENIM_D if not hologram else holo, 104 if not hologram else 8)
            ell(ctx, sd * 96, -26, 80, 36)
            paint(ctx, SHOE)
    else:
        for sd in (-1, 1):
            ctx.move_to(sd * 18, -470)
            ctx.line_to(sd * 118, -470)
            ctx.line_to(sd * 110, -40)
            ctx.line_to(sd * 30, -40)
            ctx.close_path()
            body_fill(DENIM, DENIM_D)
            ell(ctx, sd * 74, -24, 76, 34)
            paint(ctx, SHOE if not hologram else holo, 1.0 if not hologram else 0.5)

    # arms
    for sd in (-1, 1):
        if sit:
            pts = [(sd * 160, -770), (sd * 196, -590), (sd * 116, -430)]
        else:
            pts = [(sd * 160, -770), (sd * 200, -610), (sd * 192, -470)]
        if hologram:
            path(ctx, pts, (20, 50, 90), 86, 0.42)
            path(ctx, pts, holo, 6, 0.7)
        else:
            path(ctx, pts, HOOD_D, 86)
        circ(ctx, pts[-1][0], pts[-1][1] + 12, 42)
        paint(ctx, SKIN if not hologram else holo, 1.0 if not hologram else 0.45)

    # torso
    pts = [(-158, -800), (158, -800), (184, -690), (156, -430), (-156, -430), (-184, -690)]
    smooth(ctx, pts)
    body_fill(HOOD, HOOD_D)
    if not hologram:
        rrect(ctx, -104, -566, 208, 104, 40)
        paint(ctx, HOOD_D, 0.6)
        rrect(ctx, -160, -458, 320, 34, 16)
        paint(ctx, HOOD_D)
        path(ctx, [(-30, -790), (-34, -690)], (250, 245, 235), 7)
        path(ctx, [(30, -790), (34, -690)], (250, 245, 235), 7)

    if inner is not None:
        inner(ctx)

    # neck, hood collar, head
    rrect(ctx, -46, -900, 92, 120, 26)
    paint(ctx, SKIN_D, 0.45 if hologram else 1.0)
    if not hologram:
        ell(ctx, 0, -800, 128, 44)
        paint(ctx, HOOD_D)
        ell(ctx, 0, -812, 70, 22)
        paint(ctx, SKIN_D)
    ctx.save()
    ctx.translate(0, -960)
    ctx.rotate(tilt)
    ctx.translate(0, 960)
    ell(ctx, -112, -950, 22, 32)
    paint(ctx, SKIN_D)
    ell(ctx, 112, -950, 22, 32)
    paint(ctx, SKIN_D)
    circ(ctx, 0, -960, 116)
    fill_with(ctx, rad_g(-30, -1000, 10, 150, (0, SKIN_L), (1, SKIN)))
    ell(ctx, 0, -872, 80, 40)
    paint(ctx, SKIN_D, 0.3)
    _hair(ctx, 0, -960, CURLS_FRONT, (0, -92, 116, 56))
    for sd in (-1, 1):
        _eye(ctx, sd * 44, -944, mood, white=True, blink=blink)
        bl = -986 if mood != 'tired' else -980
        path(ctx, [(sd * 22, bl + (4 if mood == 'tired' else 0)), (sd * 66, bl - (2 if mood != 'tired' else -6))],
             HAIR, 11)
    ell(ctx, 0, -906, 16, 11)
    paint(ctx, SKIN_D, 0.6)
    _mouth(ctx, 0, -868, mood, 1.0)
    ctx.restore()
    ctx.restore()


# The x-ray organs, in guy_front's local coordinates.
XRAY_THROAT = (0.0, -820.0)
XRAY_HEART = (28.0, -676.0)


def xray_organs(ctx, x, y, s, t=0.0, beat=0.0):
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    for sd in (-1, 1):
        blob(ctx, sd * 92, -680, 78, 122, seed=20 + sd, n=10, wob=0.07)
        paint(ctx, (244, 160, 172), 0.5)
        for k in range(4):
            path(ctx, [(sd * 20, -760), (sd * (50 + 14 * k), -720 + 22 * k), (sd * (80 + 12 * k), -640 + 30 * k)],
                 (255, 210, 215), 5, 0.6)
    path(ctx, [(0, -840), (-4, -760), (-2, -650), (24, -612)], (232, 120, 132), 30)
    path(ctx, [(0, -840), (0, -760)], (255, 220, 225), 18, 0.55)
    blob(ctx, -62, -574, 118, 54, seed=31, n=10, wob=0.1, rot=-0.15)
    paint(ctx, (156, 56, 52))
    ctx.save()
    ctx.translate(58, -588)
    ctx.rotate(0.25)
    blob(ctx, 0, 0, 72, 50, seed=33, n=9, wob=0.12)
    paint(ctx, (238, 150, 150))
    ctx.restore()
    k = 1 + 0.08 * beat
    heart_path(ctx, XRAY_HEART[0], XRAY_HEART[1], 48 * k)
    fill_with(ctx, rad_g(XRAY_HEART[0] - 10, XRAY_HEART[1] - 20, 5, 80, (0, (255, 110, 120)), (1, (196, 30, 50))))
    rrect(ctx, -124, -536, 248, 100, 44)
    line(ctx, (226, 140, 130), 30)
    pts = []
    for i in range(46):
        u = i / 45
        row = int(u * 4)
        fx = (u * 4) % 1
        xx = -88 + 176 * (fx if row % 2 == 0 else 1 - fx)
        pts.append((xx, -514 + row * 22 + 6 * math.sin(xx * 0.08)))
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    line(ctx, (246, 176, 160), 18)
    ctx.restore()


# ----------------------------------------------------------------- cart -----

def cart_side(ctx, x, y, s, contents='junk', wheel=0.0):
    """Shopping cart in profile; its handle grip sits at local (-24, -655)."""
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    frame = (160, 166, 176)
    if contents == 'junk':
        rrect(ctx, 90, -760, 130, 190, 20)
        paint(ctx, (250, 140, 20))
        label(ctx, 'PUFFZ', 155, -690, 34, (255, 255, 255))
        rrect(ctx, 230, -820, 60, 250, 24)
        paint(ctx, (70, 30, 20))
        rrect(ctx, 226, -760, 68, 70, 10)
        paint(ctx, (220, 40, 40))
        rrect(ctx, 300, -740, 220, 170, 12)
        paint(ctx, (40, 90, 200))
        circ(ctx, 410, -660, 60)
        paint(ctx, (240, 190, 90))
        for px_, py_ in ((390, -670), (430, -650), (405, -635)):
            circ(ctx, px_, py_, 12)
            paint(ctx, (200, 40, 40))
        rrect(ctx, 450, -700, 110, 120, 14)
        paint(ctx, (230, 80, 150))
    else:
        for k, (bx, by) in enumerate(((140, -690), (205, -720), (175, -760))):
            circ(ctx, bx, by, 44)
            paint(ctx, (46, 140, 60))
            circ(ctx, bx - 12, by - 12, 16)
            paint(ctx, (90, 185, 90))
        for k in range(3):
            ctx.new_sub_path()
            ctx.arc(330 + k * 22, -800, 120, 0.9, 2.0)
            line(ctx, (250, 214, 60), 30)
        for bx in (420, 480, 450):
            circ(ctx, bx, -660 - (bx % 3) * 12, 38)
            paint(ctx, (214, 40, 46))
            circ(ctx, bx - 12, -672, 9)
            paint(ctx, (255, 255, 255), 0.5)
        blob(ctx, 270, -660, 70, 50, seed=4, n=8, wob=0.25)
        paint(ctx, (60, 160, 70))
    # basket
    top = [(0, -640), (590, -640)]
    bot = [(70, -300), (540, -300)]
    poly(ctx, [top[0], top[1], bot[1], bot[0]])
    paint(ctx, (200, 210, 222), 0.25)
    for i in range(12):
        u = i / 11
        path(ctx, [(mix(top[0][0], top[1][0], u), -640), (mix(bot[0][0], bot[1][0], u), -300)], frame, 5)
    for j in range(6):
        v = j / 5
        yy = mix(-640, -300, v)
        path(ctx, [(mix(0, 70, v), yy), (mix(590, 540, v), yy)], frame, 5)
    path(ctx, [top[0], top[1], bot[1], bot[0], top[0]], (140, 146, 156), 10)
    # handle and chassis
    path(ctx, [(0, -640), (-30, -660)], frame, 12)
    rrect(ctx, -60, -680, 70, 42, 20)
    paint(ctx, (214, 40, 46))
    path(ctx, [(90, -300), (110, -80), (520, -80), (530, -300)], frame, 12)
    for wx in (130, 500):
        circ(ctx, wx, -40, 40)
        paint(ctx, (52, 54, 60))
        circ(ctx, wx, -40, 14)
        paint(ctx, (180, 184, 190))
        path(ctx, [(wx, -40), (wx + 30 * math.cos(wheel), -40 + 30 * math.sin(wheel))], (120, 124, 130), 6)
    ctx.restore()


def mix(a, b, u):
    return a + (b - a) * u


# ---------------------------------------------------------------- aisles ----

JUNK_COLORS = [(232, 62, 52), (250, 168, 32), (58, 118, 222), (238, 92, 152), (122, 66, 186), (250, 208, 44),
               (40, 168, 96), (240, 120, 40), (30, 30, 36)]
PRODUCE = [((214, 40, 46), 'round'), ((250, 150, 30), 'round'), ((120, 190, 60), 'round'),
           ((250, 220, 60), 'round'), ((50, 140, 60), 'leafy'), ((120, 50, 110), 'long'), ((240, 110, 40), 'long')]


def _unit_items(u, kind):
    rng = random.Random(u * 7919 + (0 if kind == 'junk' else 1))
    shelves = []
    for sh in range(4):
        items, x = [], 30
        while x < 510:
            if kind == 'junk':
                tp = rng.choice(['box', 'bag', 'bottle', 'can', 'box'])
                w = {'box': rng.uniform(80, 120), 'bag': rng.uniform(90, 120), 'bottle': 46, 'can': 54}[tp]
                h = {'box': rng.uniform(150, 220), 'bag': rng.uniform(140, 190), 'bottle': rng.uniform(170, 220),
                     'can': 110}[tp]
                items.append((tp, x, w, h, rng.choice(JUNK_COLORS), rng.choice(JUNK_COLORS)))
            else:
                col, tp = rng.choice(PRODUCE)
                w = rng.uniform(150, 190)
                items.append((tp, x, w, 120, col, None))
            x += w + rng.uniform(8, 20)
        shelves.append(items)
    return shelves


_UNIT_CACHE = {}


def unit(ctx, ux, u, kind):
    """One shelving unit (560 wide) with its products; ux is its left edge."""
    key = (u, kind)
    if key not in _UNIT_CACHE:
        _UNIT_CACHE[key] = _unit_items(u, kind)
    rrect(ctx, ux, 330, 560, 1270, 0)
    paint(ctx, (222, 214, 200) if kind == 'junk' else (214, 222, 206))
    boards = [600, 880, 1160, 1440]
    for si, items in enumerate(_UNIT_CACHE[key]):
        base = boards[si]
        for tp, x, w, h, c1, c2 in items:
            X = ux + x
            if tp == 'box':
                rrect(ctx, X, base - h, w, h, 6)
                paint(ctx, c1)
                rrect(ctx, X + 8, base - h * 0.62, w - 16, h * 0.26, 6)
                paint(ctx, c2)
                shine(ctx, X + 6, base - h + 8, 10, h - 20, 0.18)
            elif tp == 'bag':
                blob(ctx, X + w / 2, base - h / 2, w / 2, h / 2, seed=int(X) % 97, n=8, wob=0.08)
                paint(ctx, c1)
                ell(ctx, X + w / 2, base - h * 0.55, w * 0.32, h * 0.16)
                paint(ctx, c2)
            elif tp == 'bottle':
                rrect(ctx, X, base - h * 0.75, w, h * 0.75, 14)
                paint(ctx, c1)
                rrect(ctx, X + w * 0.3, base - h, w * 0.4, h * 0.3, 6)
                paint(ctx, c1)
                rrect(ctx, X, base - h * 0.5, w, h * 0.2, 4)
                paint(ctx, c2)
            elif tp == 'can':
                rrect(ctx, X, base - h, w, h, 10)
                paint(ctx, c1)
                rrect(ctx, X, base - h * 0.62, w, h * 0.24, 2)
                paint(ctx, c2)
            else:
                rrect(ctx, X - 6, base - 70, w + 12, 70, 10)
                paint(ctx, (176, 128, 80))
                rng = random.Random(int(X) * 31 + si)
                for k in range(16):
                    fx = X + rng.uniform(10, w - 10)
                    fy = base - 70 - rng.uniform(0, 50) + 10
                    if tp == 'round':
                        circ(ctx, fx, fy, 24)
                        paint(ctx, c1)
                        circ(ctx, fx - 7, fy - 8, 7)
                        paint(ctx, (255, 255, 255), 0.35)
                    elif tp == 'leafy':
                        ell(ctx, fx, fy, 30, 18, rng.uniform(-1, 1))
                        paint(ctx, c1)
                    else:
                        ell(ctx, fx, fy, 36, 15, rng.uniform(-0.6, 0.6))
                        paint(ctx, c1)
        rrect(ctx, ux, base, 560, 34, 4)
        paint(ctx, (244, 244, 246))
        rrect(ctx, ux, base + 34, 560, 10, 0)
        paint(ctx, (0, 0, 0), 0.12)
    rrect(ctx, ux - 14, 330, 28, 1270, 6)
    paint(ctx, (120, 124, 132))


def aisle(ctx, scroll, kind='junk', sign='SNACKS'):
    """Store aisle seen from the side; scroll moves the world left."""
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, lin_g(0, 0, 0, H, (0, (250, 247, 240)), (1, (232, 224, 212))))
    ctx.rectangle(0, 0, W, 180)
    paint(ctx, (238, 236, 232))
    for i in range(-1, 4):
        lx = i * 460 - (scroll * 0.6) % 460
        ell(ctx, lx + 160, 110, 300, 90)
        fill_with(ctx, rad_g(lx + 160, 110, 10, 300, (0, (255, 255, 240), 0.55), (1, (255, 255, 240), 0)))
        rrect(ctx, lx + 40, 90, 240, 34, 17)
        paint(ctx, (255, 255, 250))
    first = int(math.floor(scroll / 560)) - 1
    for u in range(first, first + 4):
        unit(ctx, u * 560 - scroll, u, kind)
    sx = 620 - (scroll * 0.8) % 1700
    for k in range(2):
        X = sx + k * 1700
        path(ctx, [(X, 180), (X, 228)], (110, 110, 120), 5)
        path(ctx, [(X + 420, 180), (X + 420, 228)], (110, 110, 120), 5)
        rrect(ctx, X - 40, 228, 500, 96, 18)
        paint(ctx, (210, 40, 46) if kind == 'junk' else (36, 150, 80))
        label(ctx, sign, X + 210, 276, 52, (255, 255, 255))
    ctx.rectangle(0, 1600, W, H - 1600)
    fill_with(ctx, lin_g(0, 1600, 0, H, (0, (206, 198, 186)), (1, (226, 220, 210))))
    for i in range(-1, 9):
        tx = i * 180 - scroll % 180
        path(ctx, [(tx, 1600), (tx - 120, H)], (190, 182, 170), 3)
    ctx.rectangle(0, 1600, W, 14)
    paint(ctx, (0, 0, 0), 0.1)


# ----------------------------------------------------------------- items ----
# Each item is drawn with its bottom-center at (0, 0); ITEM_BOX holds its
# local bounding box for the scan overlay.

def _bag_shape(ctx, w, h, bulge=0.06):
    hw = w / 2
    zig = []
    n = 9
    for i in range(n + 1):
        zig.append((-hw + w * i / n, -h + (0 if i % 2 == 0 else 14)))
    ctx.move_to(*zig[0])
    for p in zig[1:]:
        ctx.line_to(*p)
    ctx.curve_to(hw * (1 + bulge), -h * 0.7, hw * (1 + bulge), -h * 0.3, hw, -14)
    for i in range(n, -1, -1):
        ctx.line_to(-hw + w * i / n, 0 if i % 2 == 0 else -14)
    ctx.curve_to(-hw * (1 + bulge), -h * 0.3, -hw * (1 + bulge), -h * 0.7, -hw, -h)
    ctx.close_path()


def puff(ctx, x, y, s, rot, seed):
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    blob(ctx, 0, 0, 46 * s, 20 * s, seed=seed, n=10, wob=0.22)
    fill_with(ctx, lin_g(0, -20 * s, 0, 20 * s, (0, (255, 190, 60)), (1, (236, 120, 20))))
    rng = random.Random(seed)
    for _ in range(5):
        circ(ctx, rng.uniform(-34, 34) * s, rng.uniform(-10, 10) * s, 3.5 * s)
        paint(ctx, (200, 90, 10), 0.7)
    ctx.restore()


def item_cheese_puffs(ctx):
    _bag_shape(ctx, 350, 470)
    fill_with(ctx, lin_g(-180, 0, 180, 0, (0, (230, 96, 10)), (0.45, (255, 150, 26)), (1, (220, 86, 8))))
    shine(ctx, -140, -400, 30, 300, 0.22)
    ell(ctx, 0, -330, 140, 62, -0.08)
    paint(ctx, (34, 84, 200))
    label(ctx, 'CHEEZ', 0, -350, 52, (255, 222, 40))
    label(ctx, 'PUFFZ', 0, -300, 44, (255, 255, 255))
    for i, (px_, py_, r) in enumerate(((-70, -170, 0.4), (40, -150, -0.3), (-10, -95, 0.1), (90, -80, 0.6),
                                       (-90, -70, -0.5))):
        puff(ctx, px_, py_, 1.0, r, i + 1)
    rrect(ctx, 70, -450, 110, 44, 22)
    paint(ctx, (230, 30, 40))
    label(ctx, 'XL', 125, -428, 30, (255, 255, 255))


def item_cola(ctx):
    pts = [(-26, -470), (26, -470), (30, -420), (36, -380), (70, -300), (74, -40), (60, 0), (-60, 0), (-74, -40),
           (-70, -300), (-36, -380), (-30, -420)]
    smooth(ctx, pts)
    fill_with(ctx, lin_g(-74, 0, 74, 0, (0, (40, 16, 10)), (0.4, (96, 40, 22)), (1, (34, 12, 8))))
    rrect(ctx, -32, -486, 64, 34, 8)
    paint(ctx, (220, 30, 40))
    rrect(ctx, -76, -250, 152, 110, 8)
    paint(ctx, (220, 30, 40))
    ctx.move_to(-70, -170)
    ctx.curve_to(-20, -230, 30, -150, 74, -210)
    line(ctx, (255, 255, 255), 8)
    label(ctx, 'COLA', 0, -212, 40, (255, 255, 255))
    shine(ctx, -50, -360, 16, 300, 0.3)


def item_donuts(ctx):
    rrect(ctx, -190, -230, 380, 230, 16)
    fill_with(ctx, lin_g(0, -230, 0, 0, (0, (255, 160, 200)), (1, (236, 110, 160))))
    rrect(ctx, -160, -170, 320, 140, 18)
    paint(ctx, (255, 245, 250))
    for i, dx in enumerate((-105, 0, 105)):
        circ(ctx, dx, -100, 50)
        paint(ctx, (226, 160, 80))
        circ(ctx, dx, -104, 42)
        paint(ctx, (250, 228, 190))
        circ(ctx, dx, -100, 15)
        paint(ctx, (255, 245, 250))
        rng = random.Random(i)
        for _ in range(7):
            a = rng.uniform(0, TAU)
            rr = rng.uniform(22, 36)
            path(ctx, [(dx + rr * math.cos(a), -104 + rr * math.sin(a)),
                       (dx + rr * math.cos(a) + 8, -104 + rr * math.sin(a) + 3)],
                 rng.choice([(230, 60, 120), (60, 140, 230), (250, 210, 40)]), 6)
    shine(ctx, -150, -165, 14, 120, 0.4)
    rrect(ctx, -190, -230, 380, 52, 16)
    paint(ctx, (210, 50, 120))
    label(ctx, 'DONUTS', 0, -204, 34, (255, 255, 255))


def item_ramen(ctx):
    poly(ctx, [(-150, -340), (150, -340), (112, 0), (-112, 0)])
    fill_with(ctx, lin_g(-150, 0, 150, 0, (0, (230, 228, 222)), (0.5, (255, 255, 255)), (1, (214, 212, 206))))
    poly(ctx, [(-140, -270), (140, -270), (126, -150), (-126, -150)])
    paint(ctx, (214, 36, 40))
    label(ctx, 'RAMEN', 0, -210, 46, (255, 255, 255))
    ell(ctx, 0, -340, 152, 26)
    paint(ctx, (200, 204, 212))
    for k in range(4):
        ctx.move_to(-60, -100 + k * 14)
        for i in range(1, 13):
            ctx.line_to(-60 + i * 10, -100 + k * 14 + 6 * math.sin(i * 1.4 + k))
        line(ctx, (240, 200, 90), 6)


def item_pizza(ctx):
    rrect(ctx, -205, -400, 410, 400, 18)
    fill_with(ctx, lin_g(0, -400, 0, 0, (0, (38, 76, 170)), (1, (24, 50, 120))))
    circ(ctx, 0, -190, 150)
    paint(ctx, (222, 170, 90))
    circ(ctx, 0, -190, 130)
    paint(ctx, (210, 60, 40))
    blob(ctx, 0, -190, 118, 118, seed=4, n=12, wob=0.08)
    paint(ctx, (252, 214, 110))
    rng = random.Random(3)
    for _ in range(9):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(20, 95)
        circ(ctx, rr * math.cos(a), -190 + rr * math.sin(a), 18)
        paint(ctx, (196, 40, 36))
    rrect(ctx, -205, -400, 410, 70, 18)
    paint(ctx, (220, 34, 40))
    label(ctx, 'PIZZA', 0, -364, 46, (255, 255, 255))


def item_candy(ctx):
    for k in range(3):
        y0 = -110 - k * 110
        ctx.save()
        ctx.translate(0, y0 + 50)
        ctx.rotate(0.04 * (k - 1))
        rrect(ctx, -170, -50, 340, 100, 14)
        fill_with(ctx, lin_g(0, -50, 0, 50, (0, (130, 70, 36)), (1, (88, 46, 22))))
        for sd in (-1, 1):
            poly(ctx, [(sd * 170, -50), (sd * 192, -38), (sd * 182, 0), (sd * 192, 38), (sd * 170, 50)])
            paint(ctx, (176, 120, 70))
        rrect(ctx, -90, -30, 180, 60, 10)
        paint(ctx, (220, 34, 40))
        label(ctx, 'CHOCO', 0, 0, 34, (255, 255, 255))
        ctx.restore()


def item_energy(ctx):
    for k, dx in enumerate((-70, 75)):
        ctx.save()
        ctx.translate(dx, 0)
        rrect(ctx, -72, -410, 144, 410, 18)
        fill_with(ctx, lin_g(-72, 0, 72, 0, (0, (16, 16, 20)), (0.45, (60, 60, 66)), (1, (12, 12, 14))))
        rrect(ctx, -68, -420, 136, 24, 10)
        paint(ctx, (190, 196, 204))
        poly(ctx, [(10, -330), (-36, -200), (2, -200), (-16, -90), (40, -236), (4, -236), (26, -330)])
        paint(ctx, (90, 240, 60))
        label(ctx, 'VOLT', 0, -362, 34, (90, 240, 60))
        shine(ctx, -52, -380, 12, 330, 0.25)
        ctx.restore()


def item_hotdogs(ctx):
    rrect(ctx, -190, -200, 380, 200, 22)
    paint(ctx, (236, 236, 240), 0.9)
    for k in range(4):
        yy = -160 + k * 38
        rrect(ctx, -160, yy, 320, 34, 17)
        fill_with(ctx, lin_g(0, yy, 0, yy + 34, (0, (240, 110, 100)), (1, (190, 60, 56))))
    shine(ctx, -170, -186, 330, 16, 0.5)
    rrect(ctx, -110, -40, 220, 36, 10)
    paint(ctx, (230, 190, 40))
    label(ctx, 'FRANKS', 0, -22, 26, (150, 30, 30))


def item_icecream(ctx):
    poly(ctx, [(-150, -320), (150, -320), (122, 0), (-122, 0)])
    fill_with(ctx, lin_g(-150, 0, 150, 0, (0, (250, 214, 226)), (0.5, (255, 238, 244)), (1, (238, 196, 212))))
    ell(ctx, 0, -320, 152, 30)
    paint(ctx, (214, 80, 130))
    for k, (dx, c) in enumerate(((-50, (130, 80, 50)), (40, (255, 160, 190)), (0, (255, 240, 210)))):
        circ(ctx, dx, -170 - (k == 2) * 50, 52)
        paint(ctx, c)
    label(ctx, 'ICE CREAM', 0, -60, 34, (200, 50, 110))


def item_pastries(ctx):
    rrect(ctx, -200, -300, 400, 300, 16)
    fill_with(ctx, lin_g(0, -300, 0, 0, (0, (70, 150, 236)), (1, (40, 100, 200))))
    rrect(ctx, -130, -200, 260, 160, 16)
    paint(ctx, (236, 190, 120))
    rrect(ctx, -108, -180, 216, 120, 14)
    paint(ctx, (255, 120, 170))
    rng = random.Random(2)
    for _ in range(14):
        x0, y0 = rng.uniform(-96, 90), rng.uniform(-172, -70)
        path(ctx, [(x0, y0), (x0 + 8, y0 + 3)], rng.choice([(255, 255, 255), (250, 220, 40), (90, 180, 255)]), 6)
    label(ctx, 'TOASTIES', 0, -256, 40, (255, 255, 255))


def broccoli_head(ctx, x, y, s, seed):
    poly(ctx, [(x - 26 * s, y - 120 * s), (x + 26 * s, y - 120 * s), (x + 16 * s, y), (x - 16 * s, y)])
    paint(ctx, (150, 196, 90))
    rng = random.Random(seed)
    for _ in range(22):
        a = rng.uniform(math.pi, TAU)
        rr = rng.uniform(0, 95 * s)
        cx, cy = x + rr * math.cos(a) * 1.1, y - 150 * s + rr * math.sin(a) * 0.7
        circ(ctx, cx, cy, rng.uniform(28, 40) * s)
        paint(ctx, rng.choice([(40, 120, 50), (52, 140, 58), (34, 106, 44)]))
    for _ in range(10):
        circ(ctx, x + rng.uniform(-70, 60) * s, y - rng.uniform(170, 220) * s, 8 * s)
        paint(ctx, (120, 190, 100), 0.6)


def item_broccoli(ctx):
    broccoli_head(ctx, -80, 0, 1.0, 1)
    broccoli_head(ctx, 85, 0, 0.95, 2)
    broccoli_head(ctx, 0, 0, 1.12, 3)


def apple(ctx, x, y, r):
    ctx.move_to(x, y - r * 0.75)
    ctx.curve_to(x + r * 0.6, y - r * 1.15, x + r * 1.25, y - r * 0.6, x + r * 0.95, y + r * 0.35)
    ctx.curve_to(x + r * 0.7, y + r * 1.0, x + r * 0.25, y + r * 1.0, x, y + r * 0.85)
    ctx.curve_to(x - r * 0.25, y + r * 1.0, x - r * 0.7, y + r * 1.0, x - r * 0.95, y + r * 0.35)
    ctx.curve_to(x - r * 1.25, y - r * 0.6, x - r * 0.6, y - r * 1.15, x, y - r * 0.75)
    ctx.close_path()
    fill_with(ctx, rad_g(x - r * 0.3, y - r * 0.3, r * 0.1, r * 1.3, (0, (250, 80, 70)), (1, (176, 20, 30))))
    path(ctx, [(x, y - r * 0.7), (x + 4, y - r * 1.05)], (100, 60, 30), r * 0.1)
    ell(ctx, x + r * 0.25, y - r * 1.0, r * 0.22, r * 0.1, -0.4)
    paint(ctx, (70, 150, 60))
    ell(ctx, x - r * 0.45, y - r * 0.3, r * 0.14, r * 0.26, 0.4)
    paint(ctx, (255, 255, 255), 0.5)


def item_apples(ctx):
    for x, y, r in ((-110, -80, 82), (0, -76, 86), (110, -80, 82), (-55, -200, 80), (55, -200, 82)):
        apple(ctx, x, y, r)


def item_bananas(ctx):
    for k in range(4):
        ctx.save()
        ctx.translate(-150, -150 + k * 34)
        ctx.rotate(-0.32 + k * 0.13)
        ctx.move_to(0, 0)
        ctx.curve_to(60, -120, 230, -170, 330, -120)
        ctx.curve_to(230, -80, 70, -20, 10, 40)
        ctx.close_path()
        fill_with(ctx, lin_g(0, -150, 0, 30, (0, (255, 228, 70)), (1, (232, 184, 20))))
        circ(ctx, 330, -120, 12)
        paint(ctx, (90, 70, 30))
        ctx.restore()
    rrect(ctx, -190, -170, 70, 140, 24)
    paint(ctx, (130, 150, 60))


def item_spinach(ctx):
    rrect(ctx, -165, -420, 330, 420, 30)
    paint(ctx, (240, 250, 240), 0.55)
    rng = random.Random(6)
    for _ in range(26):
        x, y = rng.uniform(-130, 130), rng.uniform(-380, -40)
        a = rng.uniform(-1.4, 1.4)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(a)
        ctx.move_to(0, -48)
        ctx.curve_to(34, -30, 30, 26, 0, 48)
        ctx.curve_to(-30, 26, -34, -30, 0, -48)
        ctx.close_path()
        paint(ctx, rng.choice([(40, 120, 50), (60, 150, 60), (30, 100, 40)]))
        path(ctx, [(0, -40), (0, 40)], (150, 210, 130), 3)
        ctx.restore()
    rrect(ctx, -110, -250, 220, 70, 14)
    paint(ctx, (255, 255, 255), 0.92)
    label(ctx, 'SPINACH', 0, -215, 34, (40, 130, 60))
    shine(ctx, -150, -400, 18, 340, 0.45)


def item_salmon(ctx):
    rrect(ctx, -210, -80, 420, 80, 16)
    paint(ctx, (30, 30, 34))
    blob(ctx, 0, -90, 190, 64, seed=8, n=10, wob=0.06)
    fill_with(ctx, lin_g(0, -150, 0, -30, (0, (255, 150, 100)), (1, (232, 104, 64))))
    for k in range(6):
        x = -140 + k * 52
        ctx.move_to(x, -140)
        ctx.curve_to(x + 30, -110, x - 10, -70, x + 20, -40)
        line(ctx, (255, 220, 200), 6)
    shine(ctx, -180, -160, 360, 12, 0.35)


def item_eggs(ctx):
    rrect(ctx, -200, -120, 400, 120, 18)
    paint(ctx, (206, 200, 186))
    poly(ctx, [(-200, -120), (200, -120), (180, -230), (-180, -230)])
    paint(ctx, (226, 220, 206))
    for row in range(2):
        for k in range(3):
            x = -120 + k * 120 + row * 0
            y = -120 - row * 60 + 10
            ell(ctx, x, y - 30, 48, 58)
            fill_with(ctx, rad_g(x - 14, y - 50, 5, 70, (0, (240, 200, 160)), (1, (196, 140, 96))))
    label(ctx, 'EGGS', 0, -60, 40, (120, 100, 80))


def item_oats(ctx):
    rrect(ctx, -115, -390, 230, 390, 20)
    fill_with(ctx, lin_g(-115, 0, 115, 0, (0, (222, 196, 150)), (0.5, (246, 226, 186)), (1, (210, 182, 136))))
    ell(ctx, 0, -392, 118, 26)
    paint(ctx, (60, 90, 170))
    rrect(ctx, -115, -404, 230, 30, 8)
    paint(ctx, (60, 90, 170))
    label(ctx, 'OATS', 0, -290, 56, (60, 90, 170))
    rng = random.Random(9)
    for _ in range(16):
        ell(ctx, rng.uniform(-70, 70), rng.uniform(-220, -60), 14, 8, rng.uniform(0, 3))
        paint(ctx, (200, 160, 100))


def item_blueberries(ctx):
    rrect(ctx, -165, -200, 330, 200, 22)
    paint(ctx, (120, 200, 120), 0.5)
    rng = random.Random(4)
    for _ in range(46):
        x, y = rng.uniform(-140, 140), rng.uniform(-240, -30)
        circ(ctx, x, y, 22)
        fill_with(ctx, rad_g(x - 6, y - 6, 2, 26, (0, (90, 100, 180)), (1, (40, 40, 110))))
        circ(ctx, x, y - 8, 5)
        paint(ctx, (30, 26, 70))
    path(ctx, [(-165, -200), (165, -200)], (80, 160, 90), 8)


def item_sweet_potatoes(ctx):
    for k, (x, y, r) in enumerate(((-100, -60, 0.3), (90, -64, -0.25), (0, -150, 0.1))):
        blob(ctx, x, y, 120, 54, seed=k + 11, n=10, wob=0.1, rot=r)
        fill_with(ctx, lin_g(0, y - 60, 0, y + 60, (0, (196, 110, 90)), (1, (140, 66, 60))))
        for j in range(3):
            path(ctx, [(x - 40 + j * 36, y - 8), (x - 30 + j * 36, y + 6)], (110, 50, 40), 4)


def item_avocados(ctx):
    for x, y, rot in ((-120, -110, -0.2), (0, -120, 0.1)):
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.move_to(0, -110)
        ctx.curve_to(50, -110, 70, -30, 78, 30)
        ctx.curve_to(86, 110, -86, 110, -78, 30)
        ctx.curve_to(-70, -30, -50, -110, 0, -110)
        ctx.close_path()
        fill_with(ctx, lin_g(-80, 0, 80, 0, (0, (40, 66, 30)), (0.5, (70, 100, 44)), (1, (32, 52, 24))))
        ctx.restore()
    ctx.save()
    ctx.translate(125, -100)
    ctx.rotate(0.15)
    ell(ctx, 0, 0, 86, 104)
    paint(ctx, (60, 90, 36))
    ell(ctx, 0, 0, 74, 92)
    fill_with(ctx, rad_g(0, 10, 10, 90, (0, (230, 236, 140)), (1, (150, 196, 70))))
    circ(ctx, 0, 18, 36)
    fill_with(ctx, rad_g(-10, 8, 4, 40, (0, (176, 110, 60)), (1, (120, 70, 36))))
    ctx.restore()


JUNK_ART = [item_cheese_puffs, item_cola, item_donuts, item_ramen, item_pizza, item_candy, item_energy, item_hotdogs,
            item_icecream, item_pastries]
HEALTHY_ART = [item_broccoli, item_apples, item_bananas, item_spinach, item_salmon, item_eggs, item_oats,
               item_blueberries, item_sweet_potatoes, item_avocados]
JUNK_BOX = [(-180, -480, 180, 0), (-80, -490, 80, 0), (-195, -235, 195, 0), (-155, -366, 155, 0),
            (-210, -405, 210, 0), (-195, -330, 195, 0), (-148, -425, 150, 0), (-195, -205, 195, 0),
            (-155, -355, 155, 0), (-205, -305, 205, 0)]
HEALTHY_BOX = [(-190, -370, 190, 0), (-200, -300, 200, 0), (-200, -360, 330, -10), (-170, -425, 170, 0),
               (-215, -160, 215, 0), (-205, -235, 205, 0), (-120, -410, 120, 0), (-170, -270, 170, 0),
               (-225, -210, 225, 0), (-205, -235, 220, 0)]


def draw_item(ctx, kind, idx, x, y, s=1.0):
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    soft_shadow(ctx, 0, 0, 220, 22, 0.25)
    (JUNK_ART if kind == 'junk' else HEALTHY_ART)[idx](ctx)
    ctx.restore()


# The scan shelf: two boards with five items each.
COL_X = [430 + c * 640 for c in range(5)]
ITEM_S = 1.22
ROW_BASE = [930, 1690]
SHELF_W = COL_X[-1] + 420


def item_world_box(kind, idx):
    b = (JUNK_BOX if kind == 'junk' else HEALTHY_BOX)[idx]
    x, y = COL_X[idx % 5], ROW_BASE[idx // 5]
    return (x + b[0] * ITEM_S - 12, y + b[1] * ITEM_S - 12, x + b[2] * ITEM_S + 12, y + b[3] * ITEM_S + 6)


def shelf_world(ctx, kind):
    """The two-row display shelf, in world coordinates (0..SHELF_W, 0..H)."""
    ctx.rectangle(-4000, -4000, SHELF_W + 8000, H + 8000)
    paint(ctx, (232, 226, 214) if kind == 'junk' else (226, 232, 220))
    rrect(ctx, -60, 120, SHELF_W + 120, 1700, 24)
    fill_with(ctx, lin_g(0, 120, 0, 1820, (0, (246, 242, 234)), (1, (222, 214, 200))))
    for yy in range(200, 1800, 70):
        for xx in range(0, SHELF_W, 70):
            circ(ctx, xx, yy, 5)
            paint(ctx, (0, 0, 0), 0.05)
    rrect(ctx, SHELF_W / 2 - 700, 150, 1400, 190, 30)
    paint(ctx, (210, 40, 46) if kind == 'junk' else (36, 150, 80))
    label(ctx, 'SNACKS & SWEETS' if kind == 'junk' else 'FRESH & WHOLE', SHELF_W / 2, 245, 110, (255, 255, 255))
    for base in ROW_BASE:
        rrect(ctx, -60, base, SHELF_W + 120, 60, 8)
        fill_with(ctx, lin_g(0, base, 0, base + 60, (0, (250, 250, 252)), (1, (210, 214, 220))))
        rrect(ctx, -60, base + 60, SHELF_W + 120, 26, 0)
        paint(ctx, (0, 0, 0), 0.14)
    for idx in range(10):
        draw_item(ctx, kind, idx, COL_X[idx % 5], ROW_BASE[idx // 5], ITEM_S)
    for xx in (-60, SHELF_W + 30):
        rrect(ctx, xx, 120, 30, 1700, 8)
        paint(ctx, (130, 134, 142))
