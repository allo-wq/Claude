#!/usr/bin/env python3
"""Fully drawn version of "Your Cart vs Your Body" (no AI imagery).

Every shot is vector art from art.py, animated frame by frame; the overlays,
transitions and synthesized soundtrack are shared with render.py.

  python3 animate.py --timeline
  python3 animate.py --preview 3,12.5 --scale .4
  python3 animate.py --out your_cart_vs_your_body_animated.mp4
"""
import argparse
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

import art as A
import data
import render as R
from art import (Canvas, TAU, blob, circ, ell, fill_with, heart_path, lin_g, line, paint, path, poly, rad_g,
                 rrect, smooth)
from render import (FPS, GREEN, GREY, H, INK, RED, W, WHITE, YELLOW, F_HEAVY, F_TEXT, Scene, Timeline,
                    apply_shake, caption, clamp, e_in, e_io, e_out, flash, legend, lin, mix, motion_blur, panel,
                    pill, pop, price_tag, rgb_split, rich, scan_tint, brackets, shake_offset, skull, check, slam,
                    stage_header, text, wrap, zoom_blur, grade, put, particles)


def camera(ctx, cx, cy, z):
    ctx.translate(W / 2, H / 2)
    ctx.scale(z, z)
    ctx.translate(-cx, -cy)


def to_frame(cam, x, y):
    cx, cy, z = cam
    return (x - cx) * z + W / 2, (y - cy) * z + H / 2


def zoom_about(ctx, x, y, z):
    ctx.translate(x, y)
    ctx.scale(z, z)
    ctx.translate(-x, -y)


# ------------------------------------------------------------ store walk ----

WALK_SPEED = 430.0
GUY_X, GUY_Y, GUY_S = 250, 1730, 0.86
CART_OFF = 300  # cart position relative to the guy, in his local units


def scene_walk(kind, dur, lines, mood='happy', stop=None, reach=False, sfx=()):
    """He pushes the cart along the aisle; with stop set he brakes, and with reach he goes for the chips."""
    junk = kind == 'junk'
    sign = 'SNACKS' if junk else 'FRESH PRODUCE'
    base = 0.0 if junk else 3000.0

    def scroll_at(t):
        if stop is None:
            return WALK_SPEED * t
        tt_ = min(t, stop)
        return WALK_SPEED * (tt_ - tt_ * tt_ / (2 * stop))

    end_scroll = scroll_at(dur)
    bag_x, bag_base = 470.0, 880.0  # where the chips sit once he has stopped (frame coords)

    def draw(ctx, t):
        sc = scroll_at(t)
        z = 1.0 + 0.08 * e_out(lin(t, 0, dur))
        fx, fy = (540, 1300)
        if reach:
            u = e_io(lin(t, 0.5, dur))
            z = mix(1.0, 1.28, u)
            fx, fy = mix(540, bag_x, u), mix(1300, 980, u)
        zoom_about(ctx, fx, fy, z)
        A.aisle(ctx, sc + base, kind, sign)
        if reach:
            bx = bag_x + (end_scroll - sc)
            glow = 0.5 + 0.5 * math.sin(t * 7)
            ell(ctx, bx, bag_base - 120, 170, 190)
            fill_with(ctx, rad_g(bx, bag_base - 120, 10, 190, (0, (255, 210, 60), 0.55 * glow), (1, (255, 210, 60), 0)))
            A.draw_item(ctx, 'junk', 0, bx, bag_base, 0.5)
        moving = 1.0 if stop is None else clamp(1 - t / stop)
        ph = sc * TAU / 470
        A.soft_shadow(ctx, GUY_X + 260, GUY_Y + 4, 430, 26, 0.28)
        A.cart_side(ctx, GUY_X + CART_OFF * GUY_S, GUY_Y, GUY_S, 'junk' if junk else 'veg', sc / (40 * GUY_S))
        hand = None
        if reach:
            k = e_out(lin(t, 0.55, 1.1))
            tgt = ((bag_x - GUY_X) / GUY_S, (bag_base - 150 - GUY_Y) / GUY_S)
            hand = (mix(CART_OFF - 24, tgt[0], k), mix(-655, tgt[1], k))
        A.guy_side(ctx, GUY_X, GUY_Y, GUY_S, ph=ph, stride=moving, hands=(CART_OFF - 24, -655), mood=mood,
                   front_hand=hand)

    def fn(t):
        c = Canvas()
        draw(c.ctx, t)
        im = c.image()
        caption(im, lines, t, 0.12, 470, 96)
        return im
    return Scene(dur, fn, sfx, 'walk_' + kind)


def scene_hook():
    sc = scene_walk('junk', 2.6, [])

    def fn(t):
        im = apply_shake(sc.fn(t), *shake_offset(t, [(0.55, 1.0)]))
        caption(im, [[("WHAT'S REALLY IN", WHITE)]], t, 0.08, 430, 88)
        s_, a_ = slam(t, 0.55)
        put(im, rich((('YOUR CART?', YELLOW),), 132, F_HEAVY, 10, 8), W / 2, 560, s_, a_)
        s_, a_ = pop(t, 1.1)
        put(im, text('...and what it does to your body', 42, WHITE, F_TEXT, 4, 4), W / 2, 680, s_, a_)
        return im
    return Scene(2.6, fn, [(0.0, 'riser', 0.25), (0.55, 'impact', 0.9), (1.1, 'pop', 0.5)], 'hook')


# ------------------------------------------------------------ shelf scan ----

def shelf_cam_x(t, t0, per, cols):
    if t <= t0:
        return cols[0]
    for c in range(1, 5):
        ts = t0 + 2 * c * per
        if t < ts:
            return cols[c - 1]
        if t < ts + 0.32:
            return mix(cols[c - 1], cols[c], e_io(lin(t, ts, ts + 0.32)))
    return cols[4]


def draw_shelf(cam, kind):
    c = Canvas()
    camera(c.ctx, *cam)
    A.shelf_world(c.ctx, kind)
    return c.image()


Z_FIT = W / (A.SHELF_W + 160)
SHELF_CY = 1010


def scene_shelf(kind):
    junk = kind == 'junk'
    items = data.JUNK if junk else data.HEALTHY
    acc = RED if junk else GREEN
    boxes = [A.item_world_box(kind, k) for k in range(10)]
    per, t0 = 1.2, 0.25
    cols = [min(max(x, 540), A.SHELF_W - 540) for x in A.COL_X]
    order = []
    for c in range(5):
        order.append((c, t0 + 2 * c * per + 0.3))
        order.append((5 + c, t0 + 2 * c * per + per + 0.1))
    stamp_t = dict(order)
    t_end = t0 + 10 * per
    pull = (t_end + 0.05, t_end + 0.8)
    dur = pull[1] + 1.35

    def cam_at(t):
        x = shelf_cam_x(t, t0, per, cols)
        z = 1.0 + 0.015 * math.sin(t * 1.3)
        for _, ts in order:
            if 0 <= t - ts < 0.4:
                z += 0.035 * math.exp(-(t - ts) / 0.12)
        cy = 960.0
        if t >= pull[0]:
            u = e_io(lin(t, *pull))
            x, z, cy = mix(x, A.SHELF_W / 2, u), mix(z, Z_FIT, u), mix(cy, SHELF_CY, u)
        return x, cy, z

    hits = [(ts, 0.5) for _, ts in order] + [(pull[1], 1.0)]

    def fn(t):
        cam = cam_at(t)
        im = draw_shelf(cam, kind)
        prev = cam_at(t - 1 / FPS)
        im = motion_blur(im, (cam[0] - prev[0]) * cam[2] * 0.9, 0)
        if t >= pull[0]:
            im = zoom_blur(im, 0.12 * math.sin(math.pi * lin(t, *pull)))
        frames = [to_frame(cam, b[0], b[1]) + to_frame(cam, b[2], b[3]) for b in boxes]
        for k in range(10):
            ts = stamp_t[k]
            if t >= ts:
                im = scan_tint(im, frames[k], e_out(lin(t, ts, ts + 0.22)), acc, flash_k=1 - lin(t, ts, ts + 0.25))
        d = R.ImageDraw.Draw(im, 'RGBA')
        z = cam[2]
        for k in range(10):
            ts = stamp_t[k]
            if t < ts:
                continue
            fx0, fy0, fx1, fy1 = frames[k]
            if fx1 < -50 or fx0 > W + 50:
                continue
            brackets(d, (fx0, fy0, fx1, fy1), acc, e_out(lin(t, ts, ts + 0.2)), max(3, int(7 * z)))
            u = lin(t, ts, ts + 0.32)
            if 0 < u < 1:
                yy = mix(fy0, fy1, u)
                d.rectangle((fx0, yy - 10, fx1, yy + 10), fill=acc + (60,))
                d.line((fx0, yy, fx1, yy), fill=WHITE + (230,), width=4)
            bs = max(30, int(82 * z))
            s_, a_ = slam(t, ts + 0.12, 0.16, 2.0)
            put(im, (skull if junk else check)(bs), fx1 - bs * 0.2, fy0 + bs * 0.2, s_, a_)
            if not junk:
                tag = price_tag(items[k])
                tw = 260 * z
                s2, a2 = pop(t, ts + 0.2)
                put(im, tag, (fx0 + fx1) / 2, fy1 - tw * 0.18, tw / tag.width * s2, a2)
        if t < t_end + 0.05:
            cur = None
            for k, ts in order:
                if t >= ts:
                    cur = (k, ts)
            if cur:
                k, ts = cur
                pt = t - ts
                out = lin(pt, per - 0.12, per) if k != order[-1][0] else lin(t, t_end - 0.1, t_end + 0.05)
                panel(im, items[k], k, kind, pt, y=None if k < 5 else 205, bottom=k < 5, fade=out)
        n = sum(1 for k in range(10) if t >= stamp_t[k])
        if t < pull[0]:
            hdr = 'RED FLAGS' if junk else 'GREEN LIGHTS'
            put(im, pill(f'{hdr}  {n:02d}/10', 32, (0, 0, 0, 200), acc, F_HEAVY, 24, 14), 40, 120, anchor='l')
            put(im, legend(kind), W - 36, 120, anchor='r')
        else:
            s_, a_ = slam(t, pull[1] - 0.05, 0.2, 2.6)
            put(im, rich((('10/10', acc),), 190, F_HEAVY, 12, 8), W / 2, 330, s_, a_)
            s_, a_ = pop(t, pull[1] + 0.2)
            put(im, text('RED FLAGS' if junk else 'GREEN LIGHTS', 84, WHITE, F_HEAVY, 8, 6), W / 2, 470, s_, a_)
            s_, a_ = pop(t, pull[1] + 0.45)
            sub = 'every item is hurting him' if junk else 'every item is fueling him'
            put(im, text(sub, 46, WHITE, F_TEXT, 4, 4), W / 2, 1460, s_, a_)
        return apply_shake(im, *shake_offset(t, hits, 14))

    events = [(0.0, 'whoosh', 0.5)]
    for k, ts in order:
        events.append((ts, 'stamp', 0.75))
        events.append((ts + 0.45, 'beep', 0.35) if junk else (ts + 0.2, 'pop', 0.4))
    events += [(pull[0], 'whoosh', 0.6), (pull[1] - 0.05, 'impact', 1.0)]
    return Scene(dur, fn, events, 'shelf_' + kind)


def scene_prices():
    items = data.HEALTHY
    boxes = [A.item_world_box('healthy', k) for k in range(10)]
    picks, snap = [0, 2, 6], [0.0, 0.55, 1.1]
    dur = 4.4
    total_h = sum(i['price'] for i in data.HEALTHY)
    total_j = sum(i['price'] for i in data.JUNK)

    def cam_at(t):
        x, y, z = A.SHELF_W / 2, float(SHELF_CY), Z_FIT
        for i, k in enumerate(picks):
            b = boxes[k]
            u = e_io(lin(t, snap[i], snap[i] + 0.22))
            x, y, z = mix(x, (b[0] + b[2]) / 2, u), mix(y, b[3] - 0.18 * 260, u), mix(z, 2.6, u)
        return x, y, z

    def fn(t):
        cam = cam_at(t)
        im = draw_shelf(cam, 'healthy')
        prev = cam_at(t - 1 / FPS)
        im = motion_blur(im, (cam[0] - prev[0]) * cam[2] * 0.9, (cam[1] - prev[1]) * cam[2] * 0.9)
        if cam[2] > 1.2:
            im = im.filter(ImageFilter.GaussianBlur(5 * lin(cam[2], 1.2, 2.6)))
        for k in range(10):
            b = boxes[k]
            fx0, fy0 = to_frame(cam, b[0], b[1])
            fx1, fy1 = to_frame(cam, b[2], b[3])
            if fx1 < -600 or fx0 > W + 600:
                continue
            im = scan_tint(im, (fx0, fy0, fx1, fy1), 1.0, GREEN)
            tag = price_tag(items[k])
            tw = 260 * cam[2]
            put(im, tag, (fx0 + fx1) / 2, fy1 - tw * 0.18, tw / tag.width)
        if t > 1.75:
            prices_card(im, t, total_h, total_j)
        else:
            put(im, text('THE PRICES?', 92, WHITE, F_HEAVY, 8, 6), W / 2, 250, *pop(t, 0.05))
        return im
    ev = [(s, 'whoosh', 0.4) for s in snap] + [(s + 0.2, 'ching', 0.6) for s in snap]
    ev += [(1.75, 'whoosh', 0.5), (2.75, 'ching', 0.9), (2.75, 'impact', 0.6)]
    return Scene(dur, fn, ev, 'prices')


def prices_card(im, t, total_h, total_j):
    u = e_out(lin(t, 1.75, 2.0))
    a = np.asarray(im, np.float32) * (1 - 0.65 * u)
    im.paste(Image.fromarray(a.astype(np.uint8)))
    d = R.ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((60, 520, 1020, 1420), radius=40, fill=(250, 248, 240, int(245 * u)))
    put(im, text('CART TOTAL', 44, INK, F_HEAVY), W / 2, 600, 1, u)
    cnt = e_out(lin(t, 2.0, 2.6))
    put(im, text('REAL FOOD CART', 40, (20, 120, 60), F_HEAVY), 110, 740, 1, lin(t, 1.95, 2.1), 'l')
    put(im, text(f'${total_h * cnt:.2f}', 64, (20, 120, 60), F_HEAVY), 970, 740, 1, lin(t, 1.95, 2.1), 'r')
    put(im, text('JUNK FOOD CART', 40, (190, 20, 30), F_HEAVY), 110, 860, 1, lin(t, 2.1, 2.25), 'l')
    put(im, text(f'${total_j * cnt:.2f}', 64, (190, 20, 30), F_HEAVY), 970, 860, 1, lin(t, 2.1, 2.25), 'r')
    if t > 2.7:
        d.line((110, 950, 970, 950), fill=(30, 30, 30, 255), width=4)
    s_, a_ = slam(t, 2.75, 0.2, 2.4)
    put(im, text(f'YOU SAVE ${total_j - total_h:.2f}', 78, INK, F_HEAVY), W / 2, 1060, s_, a_)
    s_, a_ = pop(t, 3.1)
    put(im, text('+ way more nutrients', 44, (20, 120, 60), F_HEAVY), W / 2, 1180, s_, a_)
    put(im, text('example US prices', 28, (90, 90, 90), F_TEXT), W / 2, 1360, 1, lin(t, 3.2, 3.4))


# ------------------------------------------------------- the worst item -----

def scene_worst():
    w = data.WORST
    row_t = [1.05 + 0.6 * i for i in range(4)]
    hits = [(0.15, 0.8)] + [(t + 0.15, 0.7) for t, r in zip(row_t, w['rows']) if r[4]]
    dur = 4.6

    def fn(t):
        c = Canvas()
        ctx = c.ctx
        ctx.rectangle(0, 0, W, H)
        fill_with(ctx, rad_g(540, 860, 50, 1400, (0, (96, 40, 18)), (1, (10, 6, 6))))
        poly(ctx, [(430, -10), (650, -10), (1000, 1700), (80, 1700)])
        fill_with(ctx, lin_g(0, 0, 0, 1700, (0, (255, 240, 200), 0.16), (1, (255, 240, 200), 0.0)))
        z = 1.0 + 0.08 * e_out(lin(t, 0, dur))
        if t > dur - 0.5:
            z += 1.9 * e_in(lin(t, dur - 0.5, dur + 0.25))
        zoom_about(ctx, 540, 900, z)
        A.soft_shadow(ctx, 540, 1405, 420, 40, 0.5)
        ctx.save()
        ctx.translate(540, 1400)
        ctx.rotate(0.03 * math.sin(t * 1.6))
        A.draw_item(ctx, 'junk', 0, 0, 0, 2.15)
        ctx.restore()
        im = c.image()
        if t > dur - 0.5:
            im = zoom_blur(im, 0.35 * e_in(lin(t, dur - 0.5, dur + 0.25)))
        worst_rows(im, t, dur, row_t)
        im = rgb_split(im, 10 * sum(max(0, 1 - (t - h) / 0.12) for h, _ in hits if t >= h))
        return apply_shake(im, *shake_offset(t, hits))
    ev = [(0.2, 'impact', 0.9)]
    for i, r in enumerate(w['rows']):
        ev += [(row_t[i], 'whoosh', 0.35), (row_t[i] + 0.15, 'stamp', 0.8)]
        if r[4]:
            ev.append((row_t[i] + 0.2, 'beep', 0.6))
    ev.append((dur - 0.9, 'riser', 0.6))
    return Scene(dur, fn, ev, 'worst')


def worst_rows(im, t, dur, row_t):
    w = data.WORST
    d = R.ImageDraw.Draw(im, 'RGBA')
    put(im, text('THE WORST ONE:', 64, WHITE, F_HEAVY, 7, 5), W / 2, 200, *pop(t, 0.05))
    put(im, rich(((w['name'], RED),), 120, F_HEAVY, 10, 8), W / 2, 320, *slam(t, 0.2, 0.2, 2.4))
    put(im, pill(w['why'], 32, (0, 0, 0, 210), YELLOW, F_HEAVY, 24, 12), W / 2, 430, *pop(t, 0.55))
    fade = 1 - lin(t, dur - 0.55, dur - 0.3)
    for i, (lab, val, unit, pct, lethal) in enumerate(w['rows']):
        tin = row_t[i]
        u = e_out(lin(t, tin, tin + 0.22))
        if u <= 0:
            continue
        yy = 980 + i * 190
        xo = (1 - u) * -500
        a = u * fade
        d.rounded_rectangle((40 + xo, yy, 1040 + xo, yy + 172), radius=28,
                            fill=((90, 0, 8) if lethal else (10, 10, 14)) + (int(215 * a),),
                            outline=(RED if lethal else (120, 120, 130)) + (int(230 * a),), width=4)
        put(im, text(lab, 30, GREY, R.F_BOLD), 76 + xo, yy + 40, 1, a, 'l')
        put(im, rich(((val, WHITE), (' ' + unit, GREY)), 64, F_HEAVY), 70 + xo, yy + 100, 1, a, 'l')
        put(im, text(pct, 26, (255, 120, 120) if lethal else GREY, F_TEXT), 76 + xo, yy + 148, 1, a, 'l')
        if lethal:
            s_, a_ = slam(t, tin + 0.15, 0.18, 2.6)
            put(im, skull(124), 900 + xo, yy + 70, s_, a_ * fade)
            put(im, pill('LETHAL', 26, RED + (255,), WHITE, F_HEAVY, 14, 7), 900 + xo, yy + 145, s_, a_ * fade)
        else:
            s_, a_ = pop(t, tin + 0.15)
            put(im, pill('OK', 30, (60, 60, 70, 255), WHITE, F_HEAVY, 18, 9), 900 + xo, yy + 82, s_, a_ * fade)


def _foil():
    rng = random.Random(21)
    cols, rows = 9, 15
    pts = [[(x * (W + 200) / (cols - 1) - 100 + (rng.uniform(-45, 45) if 0 < x < cols - 1 else 0),
             y * (H + 200) / (rows - 1) - 100 + (rng.uniform(-45, 45) if 0 < y < rows - 1 else 0))
            for x in range(cols)] for y in range(rows)]
    tris = []
    for y in range(rows - 1):
        for x in range(cols - 1):
            a, b, c, d = pts[y][x], pts[y][x + 1], pts[y + 1][x + 1], pts[y + 1][x]
            tris.append(((a, b, c), rng.random()))
            tris.append(((a, c, d), rng.random()))
    return tris


FOIL = _foil()
OIL = [(random.Random(i).uniform(80, 1000), random.Random(i + 50).uniform(500, 1500),
        random.Random(i + 90).uniform(80, 200)) for i in range(9)]
DRIPS = [(180, 520, 0.0), (330, 420, 0.4), (760, 470, 0.2), (900, 600, 0.7), (560, 380, 0.5)]


def draw_inside_bag(ctx, t):
    for (tri, v) in FOIL:
        cx = sum(p[0] for p in tri) / 3
        cy = sum(p[1] for p in tri) / 3
        light = 1 - min(1, math.hypot(cx - 540, (cy - 250) * 0.8) / 1500)
        g = int(105 + 95 * v * 0.6 + 120 * light)
        poly(ctx, tri)
        paint(ctx, (g, g, min(255, g + 8)))
        poly(ctx, tri)
        line(ctx, (255, 255, 255), 2, 0.12)
    # the opening, glowing at the top
    ell(ctx, 540, 230, 470, 190)
    fill_with(ctx, rad_g(540, 230, 20, 480, (0, (255, 252, 230)), (0.7, (255, 236, 190), 0.9), (1, (255, 220, 150), 0)))
    zig = [(70 + i * 47, 230 + (36 if i % 2 else 0) + 120 * math.sin(math.pi * i / 20)) for i in range(21)]
    ctx.move_to(70, 230)
    for p in zig:
        ctx.line_to(*p)
    line(ctx, (150, 150, 160), 10, 0.8)
    for k in range(5):
        x0 = 260 + k * 140 + 30 * math.sin(t + k)
        poly(ctx, [(x0, 260), (x0 + 60, 260), (x0 + 220 + k * 30, 1500), (x0 - 120 + k * 20, 1500)])
        fill_with(ctx, lin_g(0, 260, 0, 1500, (0, (255, 250, 220), 0.12), (1, (255, 250, 220), 0)))
    # a couple of big wrinkles
    for pts in ([(140, 380), (230, 760), (200, 1100), (290, 1500)], [(880, 330), (790, 700), (860, 1050), (760, 1450)],
                [(420, 700), (560, 860), (690, 820)]):
        smooth(ctx, pts, closed=False)
        line(ctx, (40, 40, 50), 26, 0.35)
        ctx.save()
        ctx.translate(-12, -6)
        smooth(ctx, pts, closed=False)
        line(ctx, (255, 255, 255), 9, 0.8)
        ctx.restore()
    # oil smears and running drips
    for i, (x, y, r) in enumerate(OIL):
        blob(ctx, x, y, r, r * 0.6, seed=i + 7, n=9, wob=0.3)
        paint(ctx, (236, 182, 40), 0.32)
        circ(ctx, x - r * 0.3, y - r * 0.2, r * 0.12)
        paint(ctx, (255, 255, 240), 0.7)
    for x, y0, delay in DRIPS:
        L = 120 + 520 * clamp((t - delay) / 2.4)
        ctx.move_to(x, y0)
        ctx.curve_to(x + 8, y0 + L * 0.3, x - 8, y0 + L * 0.7, x, y0 + L)
        line(ctx, (240, 186, 40), 16, 0.75)
        ell(ctx, x, y0 + L + 10, 15, 20)
        paint(ctx, (246, 196, 50), 0.9)
        circ(ctx, x - 5, y0 + L + 4, 5)
        paint(ctx, (255, 255, 255), 0.9)
    # cheese puffs piled at the bottom, sitting in grease
    ell(ctx, 540, 1880, 720, 260)
    paint(ctx, (230, 160, 30), 0.55)
    rng = random.Random(5)
    for i in range(26):
        A.puff(ctx, rng.uniform(40, 1040), rng.uniform(1560, 1920), 2.4, rng.uniform(-1.4, 1.4), i)
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, rad_g(540, 900, 500, 1300, (0, (0, 0, 0), 0), (1, (0, 0, 0), 0.55)))


def scene_inside_bag():
    w = data.WORST
    dur = 2.9

    def fn(t):
        c = Canvas()
        ctx = c.ctx
        z = 1.2 - 0.14 * e_out(lin(t, 0, dur))
        zoom_about(ctx, 540, 900, z)
        ctx.translate(540, 900)
        ctx.rotate(0.03 * math.sin(t * 1.2))
        ctx.translate(-540, -900)
        draw_inside_bag(ctx, t)
        im = c.image()
        a = np.asarray(im, np.float32)
        yy, xx = np.ogrid[0:H, 0:W]
        pos = mix(-600, W + 900, lin(t, 0.2, 2.4))
        a = a + np.exp(-((xx + yy * 0.45 - pos) / 140.0) ** 2)[..., None] * np.array([90, 80, 40], np.float32) * 0.8
        im = R.img(a)
        put(im, text('INSIDE THE BAG', 74, WHITE, F_HEAVY, 8, 6), W / 2, 420, *pop(t, 0.25))
        put(im, rich(((w['fat'], YELLOW),), 110, F_HEAVY, 10, 8), W / 2, 1180, *slam(t, 0.7, 0.2, 2.4))
        put(im, text(w['oil'], 70, WHITE, F_HEAVY, 7, 6), W / 2, 1310, *pop(t, 1.15))
        return apply_shake(im, *shake_offset(t, [(0.7, 0.8)]))
    return Scene(dur, fn, [(0.7, 'impact', 0.7), (1.15, 'pop', 0.5)], 'inside_bag')


# ------------------------------------------------------------- the body -----

XR_X, XR_Y, XR_S = 540, 2380, 1.65


def scene_xray(kind):
    junk = kind == 'junk'
    acc = RED if junk else GREEN
    holo = (255, 110, 110) if junk else (110, 255, 170)
    dur = 2.4
    tx, ty = XR_X + A.XRAY_THROAT[0] * XR_S, XR_Y + A.XRAY_THROAT[1] * XR_S

    def fn(t):
        c = Canvas()
        ctx = c.ctx
        ctx.rectangle(0, 0, W, H)
        fill_with(ctx, rad_g(540, 900, 100, 1300, (0, (24, 30, 52)), (1, (6, 8, 14))))
        for gx in range(0, W, 60):
            path(ctx, [(gx, 0), (gx, H)], holo, 1, 0.07)
        for gy in range(0, H, 60):
            path(ctx, [(0, gy), (W, gy)], holo, 1, 0.07)
        u = e_in(lin(t, 1.1, dur + 0.2))
        k = e_io(lin(t, 0.9, dur))
        camera(ctx, mix(540, tx, k), mix(960, ty, k), mix(1.0, 3.4, u))
        beat = math.exp(-((t * 1.4) % 1) / 0.15)
        A.guy_front(ctx, XR_X, XR_Y, XR_S, mood='happy', hologram=True, holo=holo,
                    inner=lambda cx_: A.xray_organs(cx_, 0, 0, 1.0, t, beat))
        ell(ctx, tx, ty, 70, 90)
        fill_with(ctx, rad_g(tx, ty, 5, 90, (0, holo, 0.6 * (0.5 + 0.5 * math.sin(t * 8))), (1, holo, 0)))
        im = c.image()
        d = R.ImageDraw.Draw(im, 'RGBA')
        if t < 1.0:
            sy = mix(-60, H + 60, lin(t, 0.0, 0.9))
            d.rectangle((0, sy - 40, W, sy + 40), fill=acc + (50,))
            d.line((0, sy, W, sy), fill=WHITE + (220,), width=5)
        im = zoom_blur(im, 0.3 * u)
        if t < 1.6:
            caption(im, [[('NOW FOLLOW IT', WHITE)], [('INSIDE HIS BODY', acc)]], t, 0.2, 1420, 92)
        return im
    return Scene(dur, fn, [(0.0, 'riser', 0.4), (1.2, 'riser', 0.5)], 'xray_' + kind)


def draw_throat(ctx, t, junk):
    cx, cy = 540 + 50 * math.sin(t * 1.1), 880 + 40 * math.cos(t * 0.9)
    ctx.rectangle(0, 0, W, H)
    paint(ctx, (40, 6, 14))
    speed = 1.6
    n = 16
    flow = t * speed
    near = (236, 120, 128) if junk else (246, 160, 166)
    far = (70, 10, 22)
    for i in range(n):
        d = i + 1 - (flow % 1)
        rid = i + int(flow)
        r = 2300 / (d + 0.6)
        k = clamp(1 - d / n)
        col = tuple(int(mix(far[j], near[j], k ** 1.3)) for j in range(3))
        ox = 70 * math.sin(rid * 0.7) / (d * 0.5 + 1)
        oy = 50 * math.cos(rid * 0.5) / (d * 0.5 + 1)
        blob(ctx, cx + ox, cy + oy, r, r * 1.12, seed=rid, n=12, wob=0.05)
        paint(ctx, col)
        blob(ctx, cx + ox, cy + oy, r * 0.93, r * 1.04, seed=rid + 1000, n=12, wob=0.06)
        line(ctx, (90, 20, 30), max(2, r * 0.03), 0.35)
        ctx.new_sub_path()
        ctx.arc(cx + ox, cy + oy, r * 0.9, math.pi * 1.1, math.pi * 1.45)
        line(ctx, (255, 255, 255), max(2, r * 0.018), 0.35 * k)
        if junk and i % 3 == 0 and r < 1600:
            ell(ctx, cx + ox + r * 0.6, cy + oy + r * 0.5, r * 0.08, r * 0.06)
            paint(ctx, (200, 30, 40), 0.5 * k)
    ell(ctx, cx, cy, 70, 80)
    fill_with(ctx, rad_g(cx, cy, 0, 80, (0, (10, 0, 4)), (1, (10, 0, 4), 0)))
    # the food, sliding down ahead of the camera
    s = 1.9 / (1 + t * 0.9)
    fx, fy = mix(540, cx, clamp(t / 2.2)) + 30 * math.sin(t * 3), mix(1250, cy + 60, clamp(t / 2.2))
    if junk:
        blob(ctx, fx, fy, 210 * s, 160 * s, seed=3, n=11, wob=0.25)
        fill_with(ctx, rad_g(fx - 60 * s, fy - 60 * s, 5, 260 * s, (0, (255, 190, 70)), (1, (214, 100, 20))))
        for k in range(6):
            A.puff(ctx, fx + (k - 2.5) * 50 * s, fy + 40 * s * math.sin(k * 2), 1.4 * s, k, k)
        ell(ctx, fx - 70 * s, fy - 70 * s, 70 * s, 26 * s, -0.5)
        paint(ctx, (255, 250, 210), 0.55)
    else:
        A.broccoli_head(ctx, fx - 70 * s, fy + 120 * s, 1.5 * s, 7)
        ctx.save()
        ctx.translate(fx + 110 * s, fy)
        ctx.rotate(0.4)
        poly(ctx, [(-90 * s, 60 * s), (90 * s, 60 * s), (0, -80 * s)])
        paint(ctx, (236, 240, 170))
        path(ctx, [(-90 * s, 60 * s), (90 * s, 60 * s)], (150, 200, 60), 18 * s)
        ctx.restore()


STOMACH = [(330, 520), (450, 470), (520, 560), (560, 700), (680, 770), (860, 790), (960, 910), (990, 1110),
           (930, 1340), (780, 1500), (560, 1560), (360, 1500), (250, 1330), (240, 1100), (290, 880), (300, 680)]


def _scaled(pts, k, c=(600, 1050)):
    return [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k) for x, y in pts]


def draw_stomach(ctx, t, junk):
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, rad_g(560, 1000, 100, 1300, (0, (80, 20, 30)), (1, (24, 6, 10))))
    path(ctx, [(380, -60), (370, 200), (400, 520)], (214, 104, 116), 150)
    path(ctx, [(380, -60), (370, 200), (400, 520)], (120, 40, 50), 90)
    path(ctx, [(900, 1380), (1000, 1470), (1120, 1480)], (214, 104, 116), 140)
    smooth(ctx, STOMACH)
    fill_with(ctx, lin_g(240, 0, 990, 0, (0, (236, 128, 136)), (1, (196, 86, 100))))
    inner = _scaled(STOMACH, 0.86)
    smooth(ctx, inner)
    paint(ctx, (112, 34, 46))
    ctx.save()
    smooth(ctx, inner)
    ctx.clip()
    for k in range(7):
        y0 = 620 + k * 130
        ctx.move_to(200, y0)
        for x in range(200, 1000, 40):
            ctx.line_to(x, y0 + 18 * math.sin(x * 0.03 + k))
        line(ctx, (160, 60, 74), 10, 0.5)
    level = 1050 + 12 * math.sin(t * 1.4)

    def wave(x):
        return level + 20 * math.sin(x * 0.012 + t * 3) + 8 * math.sin(x * 0.031 - t * 2)
    ctx.move_to(150, H)
    for x in range(150, 1060, 20):
        ctx.line_to(x, wave(x))
    ctx.line_to(1060, H)
    ctx.close_path()
    paint(ctx, (176, 108, 38) if junk else (120, 168, 84), 0.95)
    if junk:
        ctx.move_to(150, wave(150) - 22)
        for x in range(150, 1060, 20):
            ctx.line_to(x, wave(x) - 22)
        for x in range(1060, 130, -20):
            ctx.line_to(x, wave(x) + 6)
        ctx.close_path()
        paint(ctx, (246, 204, 60), 0.85)
        for x in range(240, 960, 120):
            path(ctx, [(x, wave(x) - 14), (x + 50, wave(x + 50) - 14)], (255, 255, 230), 5, 0.8)
    rng = random.Random(4)
    for i in range(18):
        bx = rng.uniform(300, 920)
        sp = rng.uniform(120, 260)
        by = 1500 - ((t * sp + rng.uniform(0, 400)) % 420)
        circ(ctx, bx + 8 * math.sin(t * 4 + i), by, rng.uniform(8, 18))
        line(ctx, (255, 255, 255), 3, 0.6 if junk else 0.35)
    for i in range(7):
        bx = 330 + i * 95
        by = wave(bx) + 10 + 8 * math.sin(t * 2 + i)
        if junk:
            A.puff(ctx, bx, by, 1.3, 0.4 * math.sin(i + t), i)
        elif i % 3 == 0:
            ell(ctx, bx, by, 40, 18, 0.3 * i)
            paint(ctx, (50, 140, 60))
        elif i % 3 == 1:
            circ(ctx, bx, by, 18)
            paint(ctx, (60, 60, 140))
        else:
            blob(ctx, bx, by, 36, 20, seed=i)
            paint(ctx, (250, 140, 100))
    if junk:
        for i, (px_, py_) in enumerate(((330, 780), (860, 980), (620, 1460))):
            ell(ctx, px_, py_, 70, 50)
            fill_with(ctx, rad_g(px_, py_, 5, 70, (0, (255, 40, 40), 0.55 + 0.25 * math.sin(t * 5 + i)),
                                 (1, (255, 40, 40), 0)))
    ctx.restore()
    # food dropping in from the esophagus
    u = clamp(t / 1.2)
    if u < 1:
        fy = mix(-80, level - 20, e_in(u))
        if junk:
            A.puff(ctx, 400, fy, 1.6, t * 3, 9)
        else:
            A.broccoli_head(ctx, 400, fy + 80, 0.5, 8)


def draw_intestine(ctx, t, junk):
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, lin_g(0, 0, 0, H, (0, (60, 12, 22)), (0.5, (104, 26, 40)), (1, (60, 12, 22))))
    base = (226, 92, 100) if junk else (240, 150, 154)
    tip = (150, 36, 50) if junk else (206, 110, 120)

    def villi(y_wall, up, layer):
        for i in range(15):
            x = i * 80 - 20 + (40 if layer else 0)
            h = 330 + 70 * math.sin(i * 1.7 + layer)
            sway = 0.12 * math.sin(t * 2.2 + i * 0.7 + layer)
            ctx.save()
            ctx.translate(x, y_wall)
            ctx.rotate(sway if up else -sway)
            if not up:
                ctx.scale(1, -1)
            rrect(ctx, -34, -h, 68, h + 40, 34)
            shade = 0.75 if layer == 0 else 1.0
            fill_with(ctx, lin_g(0, -h, 0, 0, (0, tuple(int(c * shade) for c in base)),
                                 (1, tuple(int(c * shade) for c in tip))))
            path(ctx, [(-8, -h + 40), (-10, -20)], (255, 200, 200), 4, 0.35)
            if junk and i % 3 == layer:
                circ(ctx, 0, -h + 50, 22)
                paint(ctx, (255, 50, 50), 0.4 + 0.3 * math.sin(t * 6 + i))
            ctx.restore()
    villi(1690, True, 0)
    villi(1700, True, 1)
    villi(230, False, 0)
    villi(220, False, 1)
    ctx.rectangle(0, 1660, W, 260)
    paint(ctx, tuple(int(c * 0.7) for c in tip))
    ctx.rectangle(0, 0, W, 260)
    paint(ctx, tuple(int(c * 0.7) for c in tip))
    rng = random.Random(12)
    for i in range(30):
        sp = rng.uniform(180, 320) * (0.7 if junk else 1.0)
        x = (rng.uniform(0, W + 200) + t * sp) % (W + 200) - 100
        y = rng.uniform(640, 1300) + 40 * math.sin(t * 2 + i)
        if junk:
            if i % 3:
                r = rng.uniform(18, 40)
                circ(ctx, x, y, r)
                fill_with(ctx, rad_g(x - r * 0.3, y - r * 0.3, 2, r, (0, (255, 240, 150)), (1, (236, 190, 50))))
            else:
                ctx.save()
                ctx.translate(x, y)
                ctx.rotate(t * 2 + i)
                rrect(ctx, -16, -16, 32, 32, 5)
                paint(ctx, (250, 250, 250))
                ctx.restore()
        else:
            absorb = clamp((x - 300) / 500) if i % 2 else 0
            yy = mix(y, 1500 if i % 4 < 2 else 420, absorb)
            r = rng.uniform(10, 18)
            colr = (140, 255, 120) if i % 2 else (255, 214, 90)
            circ(ctx, x, yy, r * 3)
            fill_with(ctx, rad_g(x, yy, 0, r * 3, (0, colr, 0.6 * (1 - absorb * 0.8)), (1, colr, 0)))
            circ(ctx, x, yy, r)
            paint(ctx, colr, 1 - absorb * 0.8)


def draw_artery(ctx, t, junk, dur=2.15):
    ctx.rectangle(0, 0, W, H)
    paint(ctx, (30, 6, 10))
    ctx.rectangle(0, 470, W, 980)
    fill_with(ctx, lin_g(0, 470, 0, 1450, (0, (90, 6, 16)), (0.5, (150, 20, 32)), (1, (90, 6, 16))))
    for y0, sgn in ((470, -1), (1450, 1)):
        ctx.move_to(0, y0)
        for x in range(0, W + 40, 40):
            ctx.line_to(x, y0 + sgn * 8 * math.sin(x * 0.01 + t))
        ctx.line_to(W, y0 + sgn * 420)
        ctx.line_to(0, y0 + sgn * 420)
        ctx.close_path()
        fill_with(ctx, lin_g(0, y0, 0, y0 + sgn * 420, (0, (236, 120, 130)), (1, (150, 50, 66))))
        path(ctx, [(0, y0 + sgn * 30), (W, y0 + sgn * 30)], (255, 200, 205), 6, 0.25)
    grow = 0.55 + 0.6 * clamp(t / dur)
    if junk:
        for i, (px_, top) in enumerate(((150, True), (420, False), (640, True), (900, False), (1040, True))):
            y = 470 if top else 1450
            r = (150 + 40 * (i % 2)) * grow
            blob(ctx, px_, y, r * 1.3, r * 0.8, seed=i + 40, n=10, wob=0.22)
            fill_with(ctx, rad_g(px_, y, 5, r * 1.3, (0, (255, 236, 150)), (1, (220, 180, 70))))
            for k in range(4):
                circ(ctx, px_ + (k - 1.5) * 40, y + (1 if top else -1) * r * 0.3, 8)
                paint(ctx, (200, 150, 50), 0.7)
    rng = random.Random(3)
    for i in range(34):
        sp = rng.uniform(260, 380) * (0.55 if junk else 1.1)
        x = (rng.uniform(0, W + 300) + t * sp) % (W + 300) - 150
        y = rng.uniform(620, 1300) + 30 * math.sin(t * 2.5 + i)
        if junk:
            y = mix(y, 960, 0.35)
        rot = rng.uniform(-0.6, 0.6) + 0.3 * math.sin(t * 2 + i)
        ell(ctx, x, y, 58, 40, rot)
        fill_with(ctx, rad_g(x, y, 5, 60, (0, (180, 20, 34)), (0.6, (226, 46, 58)), (1, (170, 20, 30))))
        ell(ctx, x, y, 26, 16, rot)
        paint(ctx, (150, 14, 26), 0.8)
    if not junk:
        for i in range(16):
            x = (rng.uniform(0, W) + t * 500) % (W + 100) - 50
            y = rng.uniform(600, 1320)
            circ(ctx, x, y, 34)
            fill_with(ctx, rad_g(x, y, 0, 34, (0, (255, 230, 120), 0.8), (1, (255, 230, 120), 0)))
            circ(ctx, x, y, 8)
            paint(ctx, (255, 250, 200))


def draw_outcome(ctx, t, junk, beat):
    ctx.rectangle(0, 0, W, H)
    if junk:
        fill_with(ctx, rad_g(540, 720, 50, 1300, (0, (110, 14, 24)), (1, (12, 4, 6))))
    else:
        fill_with(ctx, rad_g(540, 720, 50, 1300, (0, (24, 86, 60)), (1, (6, 16, 12))))
    # liver behind and below the heart
    ctx.save()
    ctx.translate(560, 1020)
    ctx.move_to(-420, -40)
    ctx.curve_to(-300, -190, 200, -200, 420, -110)
    ctx.curve_to(460, -30, 300, 120, 60, 170)
    ctx.curve_to(-160, 210, -420, 110, -420, -40)
    ctx.close_path()
    if junk:
        fill_with(ctx, lin_g(0, -200, 0, 200, (0, (236, 206, 120)), (1, (190, 150, 70))))
        rng = random.Random(8)
        for _ in range(14):
            blob(ctx, rng.uniform(-330, 330), rng.uniform(-120, 120), rng.uniform(26, 50), rng.uniform(18, 34),
                 seed=rng.randint(0, 99))
            paint(ctx, (255, 240, 170), 0.8)
    else:
        fill_with(ctx, lin_g(0, -200, 0, 200, (0, (184, 54, 60)), (1, (120, 24, 34))))
    ell(ctx, -150, -100, 150, 34, -0.15)
    paint(ctx, (255, 255, 255), 0.18)
    ctx.restore()
    # heart
    k = 1 + 0.07 * beat
    ctx.save()
    ctx.translate(540, 660)
    ctx.scale(k, k)
    path(ctx, [(-40, -170), (-40, -300), (40, -340), (140, -320), (160, -230)], (206, 50, 64), 86)
    path(ctx, [(70, -150), (90, -280), (180, -300)], (96, 110, 200), 70)
    path(ctx, [(-120, -120), (-130, -320)], (96, 110, 200), 64)
    pts = [(-200, -110), (-70, -200), (90, -180), (210, -70), (200, 90), (90, 240), (0, 310), (-100, 230),
           (-210, 80)]
    smooth(ctx, pts)
    if junk:
        fill_with(ctx, rad_g(-60, -60, 10, 330, (0, (210, 90, 90)), (1, (130, 30, 40))))
    else:
        fill_with(ctx, rad_g(-60, -60, 10, 330, (0, (255, 96, 106)), (1, (176, 20, 40))))
    for pts_, w_ in (([(-20, -170), (20, -40), (-10, 120), (20, 260)], 14), ([(20, -40), (150, 40), (170, 140)], 10),
                     ([(-10, 60), (-140, 110), (-170, 30)], 10)):
        smooth(ctx, pts_, closed=False)
        line(ctx, (150, 20, 34), w_)
        if junk:
            for p in pts_[1:]:
                blob(ctx, p[0], p[1], 26, 18, seed=int(p[0]) % 50, n=8, wob=0.3)
                paint(ctx, (250, 220, 110))
    ell(ctx, -90, -90, 70, 40, -0.6)
    paint(ctx, (255, 255, 255), 0.22)
    ctx.restore()
    if junk:
        circ(ctx, 540, 660, 520)
        fill_with(ctx, rad_g(540, 660, 200, 560, (0, (255, 30, 30), 0), (1, (255, 30, 30), 0.28 * beat)))


STAGE_ART = {'THROAT': draw_throat, 'STOMACH': draw_stomach, 'INTESTINES': draw_intestine,
             'BLOODSTREAM': draw_artery}


def scene_stage(kind, idx, title, head, detail):
    junk = kind == 'junk'
    acc = RED if junk else GREEN
    dur = 2.15

    def fn(t):
        c = Canvas()
        ctx = c.ctx
        zoom_about(ctx, 540, 960, 1.0 + 0.06 * t / dur)
        STAGE_ART[title](ctx, t, junk)
        im = c.image()
        if not junk:
            particles(im, t, (190, 255, 120), seed=idx + 3)
        stage_header(im, t, idx, title, acc)
        lines = wrap(head, 76, F_HEAVY, 960)
        for i, ln in enumerate(lines):
            put(im, text(ln, 76, WHITE, F_HEAVY, 8, 6), W / 2, 1440 + i * 86, *pop(t, 0.35 + 0.1 * i))
        put(im, pill(detail, 36, (0, 0, 0, 205), acc, F_TEXT, 26, 14), W / 2, 1440 + len(lines) * 86 + 30,
            *pop(t, 0.7))
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
    acc = RED if junk else GREEN
    dur = 3.5
    beats = [0.2 + i * (0.62 if junk else 0.8) - (0.04 * i * i if junk else 0) for i in range(6)]
    row_t = [0.75 + 0.45 * i for i in range(4)]

    def fn(t):
        beat = min(1.0, sum(math.exp(-(t - b) / 0.12) for b in beats if t >= b))
        c = Canvas()
        ctx = c.ctx
        zoom_about(ctx, 540, 900, 1.0 + 0.05 * t / dur)
        draw_outcome(ctx, t, junk, beat)
        im = c.image()
        if not junk:
            particles(im, t, (255, 230, 140), seed=11)
        stage_header(im, t, 4, 'THE OUTCOME', acc)
        d = R.ImageDraw.Draw(im, 'RGBA')
        for i, it in enumerate(o['items']):
            u = e_out(lin(t, row_t[i], row_t[i] + 0.22))
            if u <= 0:
                continue
            yy = 1060 + i * 132
            xo = (1 - u) * 400
            d.rounded_rectangle((70 + xo, yy, 1010 + xo, yy + 112), radius=56, fill=(0, 0, 0, int(200 * u)),
                                outline=acc + (int(230 * u),), width=4)
            put(im, (skull if junk else check)(92), 128 + xo, yy + 56, *slam(t, row_t[i] + 0.05, 0.16, 2.0))
            put(im, text(it, 56, WHITE, F_HEAVY), 196 + xo, yy + 58, 1, u, 'l')
        put(im, text(o['note'], 34, GREY, F_TEXT, 4, 3), W / 2, 1060 + 4 * 132 + 40, *pop(t, 2.7))
        return im
    ev = [(b, 'heart', 0.8 if junk else 0.35) for b in beats]
    ev += [(tin + 0.05, 'stamp', 0.7) for tin in row_t]
    if not junk:
        ev.append((0.1, 'shimmer', 0.7))
    return Scene(dur, fn, ev, kind + '_outcome')


# ------------------------------------------------------- couch and park -----

def draw_couch(ctx, t):
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, lin_g(0, 0, 0, H, (0, (36, 40, 64)), (1, (18, 20, 34))))
    rrect(ctx, 760, 260, 220, 300, 10)
    paint(ctx, (52, 58, 90))
    path(ctx, [(870, 260), (870, 560)], (36, 40, 64), 8)
    path(ctx, [(760, 410), (980, 410)], (36, 40, 64), 8)
    ctx.rectangle(0, 1640, W, H - 1640)
    paint(ctx, (44, 36, 42))
    rrect(ctx, 60, 860, 960, 520, 90)
    paint(ctx, (64, 74, 108))
    for x0 in (120, 560):
        rrect(ctx, x0, 900, 400, 340, 70)
        paint(ctx, (80, 92, 130))
    rrect(ctx, 20, 1140, 190, 420, 70)
    paint(ctx, (58, 68, 100))
    rrect(ctx, 870, 1140, 190, 420, 70)
    paint(ctx, (58, 68, 100))
    rrect(ctx, 150, 1250, 780, 200, 50)
    paint(ctx, (74, 86, 124))
    rrect(ctx, 100, 1430, 880, 130, 40)
    paint(ctx, (52, 60, 90))
    blink = 1.0 if 1.05 < t % 2.2 < 1.2 else 0.0
    A.guy_front(ctx, 540, 1690, 0.88, mood='tired', sit=True, tilt=0.1 + 0.03 * math.sin(t * 1.3), blink=blink)
    for kind, idx, x, y, s, rot in (('junk', 0, 230, 1790, 0.42, -1.2), ('junk', 1, 820, 1780, 0.4, 1.4),
                                    ('junk', 5, 560, 1840, 0.35, 0.2), ('junk', 6, 960, 1830, 0.38, -1.5),
                                    ('junk', 4, 120, 1880, 0.32, 0.1)):
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        A.draw_item(ctx, kind, idx, 0, 0, s)
        ctx.restore()
    flick = 0.55 + 0.25 * math.sin(t * 13) + 0.15 * math.sin(t * 29)
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, rad_g(540, 2200, 200, 1700, (0, (120, 170, 255), 0.35 * flick), (1, (120, 170, 255), 0)))


def scene_couch():
    dur = 2.0

    def fn(t):
        c = Canvas()
        zoom_about(c.ctx, 540, 1000, 1.0 + 0.06 * t / dur)
        draw_couch(c.ctx, t)
        im = c.image()
        caption(im, [[('TIRED. BLOATED.', WHITE)], [('AT RISK.', RED)]], t, 0.12, 330, 96)
        return im
    return Scene(dur, fn, [(0.1, 'heart', 0.6)], 'couch')


def draw_park(ctx, t):
    scroll = t * 520
    ctx.rectangle(0, 0, W, H)
    fill_with(ctx, lin_g(0, 0, 0, 1300, (0, (64, 84, 168)), (0.55, (246, 150, 120)), (1, (255, 214, 140))))
    circ(ctx, 760, 1020, 600)
    fill_with(ctx, rad_g(760, 1020, 60, 600, (0, (255, 240, 190), 0.9), (1, (255, 200, 120), 0)))
    circ(ctx, 760, 1020, 120)
    paint(ctx, (255, 246, 210))
    for layer, (col, base, amp, par) in enumerate((((150, 100, 140), 1080, 80, 0.15), ((96, 140, 96), 1180, 60, 0.35))):
        ctx.move_to(0, H)
        for x in range(0, W + 40, 40):
            wx = x + scroll * par
            ctx.line_to(x, base - amp * math.sin(wx * 0.004 + layer) - 30 * math.sin(wx * 0.011))
        ctx.line_to(W, H)
        ctx.close_path()
        paint(ctx, col)
    for i in range(-1, 5):
        tx = i * 360 - (scroll * 0.6) % 360
        rrect(ctx, tx - 16, 1080, 32, 260, 10)
        paint(ctx, (90, 60, 50))
        for k, (dx, dy, r) in enumerate(((0, -40, 120), (-80, 20, 90), (80, 20, 90))):
            circ(ctx, tx + dx, 1060 + dy, r)
            paint(ctx, (50, 110 + 10 * k, 60))
    ctx.rectangle(0, 1330, W, H - 1330)
    paint(ctx, (110, 170, 80))
    ctx.rectangle(0, 1560, W, 160)
    paint(ctx, (232, 204, 160))
    for i in range(-1, 8):
        x = i * 200 - scroll % 200
        path(ctx, [(x, 1640), (x + 80, 1640)], (210, 180, 136), 8)
    for i in range(-1, 4):
        bx = i * 520 - (scroll * 1.3) % 520
        blob(ctx, bx, 1880, 170, 110, seed=i % 3, n=9, wob=0.15)
        paint(ctx, (60, 120, 60))
    for k in range(5):
        a = -1.9 + k * 0.18
        poly(ctx, [(760, 1020), (760 + 1800 * math.cos(a - 0.03), 1020 + 1800 * math.sin(a - 0.03)),
                   (760 + 1800 * math.cos(a + 0.03), 1020 + 1800 * math.sin(a + 0.03))])
        paint(ctx, (255, 240, 200), 0.06)
    A.soft_shadow(ctx, 400, 1650, 200, 24, 0.3)
    A.guy_side(ctx, 380, 1640, 0.9, ph=t * 9.5, run=True, mood='happy')


def scene_jog():
    dur = 1.9

    def fn(t):
        c = Canvas()
        draw_park(c.ctx, t)
        im = c.image()
        caption(im, [[('MORE ENERGY.', WHITE)], [('STRONGER HEART.', GREEN)]], t, 0.12, 330, 96)
        return im
    return Scene(dur, fn, [(0.1, 'shimmer', 0.5)], 'jog')


def scene_final():
    dur = 4.6

    def half(draw, t, top):
        c = Canvas()
        draw(c.ctx, t)
        return c.image().crop((0, top, W, top + H // 2))

    def fn(t):
        a_im = grade(half(draw_couch, t, 560), 'red', 0.45)
        b_im = grade(half(draw_park, t + 2.0, 640), 'warm', 0.25)
        u = e_out(lin(t, 0, 0.35))
        im = Image.new('RGB', (W, H), INK)
        im.paste(a_im, (round(-W * (1 - u)), 0))
        im.paste(b_im, (round(W * (1 - u)), H // 2))
        d = R.ImageDraw.Draw(im, 'RGBA')
        d.rectangle((0, H // 2 - 5, W, H // 2 + 5), fill=WHITE + (255,))
        fade = 1 - lin(t, 1.55, 1.75)
        s_, a_ = pop(t, 0.3)
        put(im, pill('JUNK CART', 40, RED + (240,), WHITE, F_HEAVY, 26, 14), 40, 110, s_, a_ * fade, anchor='l')
        s_, a_ = pop(t, 0.45)
        put(im, pill('REAL FOOD CART', 40, GREEN + (240,), INK, F_HEAVY, 26, 14), 40, H // 2 + 110, s_, a_ * fade,
            anchor='l')
        s_, a_ = slam(t, 0.7, 0.2, 2.2)
        a_ *= 1 - lin(t, 1.55, 1.7)
        if a_ > 0.02:
            r = 70 * s_
            d.ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=INK + (int(255 * a_),),
                      outline=WHITE + (int(255 * a_),), width=5)
            put(im, text('VS', 64, WHITE, F_HEAVY), W / 2, H / 2, s_, a_)
        if t > 1.6:
            k = e_out(lin(t, 1.6, 1.9))
            im = R.img(np.asarray(im, np.float32) * (1 - 0.55 * k))
            put(im, text('YOUR CART', 120, WHITE, F_HEAVY, 10, 8), W / 2, H / 2 - 90, *slam(t, 1.7, 0.2, 2.2))
            put(im, rich((('= ', WHITE), ('YOUR FUTURE', YELLOW)), 104, F_HEAVY, 10, 8), W / 2, H / 2 + 50,
                *slam(t, 2.05, 0.2, 2.2))
            put(im, text('Which cart are you pushing?', 50, WHITE, F_TEXT, 5, 4), W / 2, H / 2 + 220, *pop(t, 2.8))
            put(im, text('Educational only. Values approximate, typical US products. Not medical advice.', 24,
                         (200, 200, 200), F_TEXT, 2, 0), W / 2, H - 70, 1, lin(t, 3.0, 3.3))
        return im
    return Scene(dur, fn, [(0.0, 'whoosh', 0.6), (0.7, 'impact', 0.8), (1.7, 'impact', 1.0),
                           (2.05, 'stamp', 0.9)], 'final')


# -------------------------------------------------------------- timeline ----

def build():
    tl = Timeline()
    marks = {}
    tl.add(scene_hook())
    tl.add(scene_walk('junk', 1.7, [[('THE ', WHITE), ('JUNK', RED), (' AISLE', WHITE)]], mood='tempted', stop=0.6,
                      reach=True, sfx=[(0.15, 'stamp', 0.6)]), 'whip', 0.36)
    tl.add(scene_shelf('junk'), 'whip', 0.36)
    tl.add(scene_worst(), 'zoom', 0.4)
    tl.add(scene_inside_bag(), 'through', 0.4)
    marks['body0'] = tl.add(scene_xray('junk'), 'glitch', 0.3)
    for i, st in enumerate(data.JUNK_STAGES):
        tl.add(scene_stage('junk', i, *st[:3]), 'through' if i == 0 else 'push', 0.4)
    tl.add(scene_outcome('junk'), 'push', 0.4)
    marks['body1'] = tl.add(scene_couch(), 'glitch', 0.3)
    junk_end = tl.t
    tl.add(R.scene_rewind(tl, junk_end - 0.2, 0.6), 'cut', 0)
    marks['bright0'] = tl.add(scene_walk('healthy', 2.0, [[('NOW THE', WHITE)], [('REAL FOOD', GREEN), (' CART', WHITE)]],
                                         sfx=[(0.1, 'shimmer', 0.6)]), 'flash', 0.3)
    tl.add(scene_shelf('healthy'), 'whip', 0.36)
    tl.add(scene_prices(), 'cut', 0)
    tl.add(scene_xray('healthy'), 'leak', 0.5)
    for i, st in enumerate(data.HEALTHY_STAGES):
        tl.add(scene_stage('healthy', i, *st[:3]), 'through' if i == 0 else 'push', 0.4)
    tl.add(scene_outcome('healthy'), 'push', 0.4)
    tl.add(scene_jog(), 'leak', 0.5)
    tl.add(scene_final(), 'zoom', 0.4)
    sections = [(0.0, marks['body0'], 'trap'), (marks['body0'], marks['body1'] + 2.0, 'body'),
                (marks['bright0'], tl.total, 'bright')]
    return tl, sections


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(R.HERE, 'your_cart_vs_your_body_animated.mp4'))
    ap.add_argument('--preview', help='comma-separated times (s) to save as JPEG')
    ap.add_argument('--scale', type=float, default=0.5)
    ap.add_argument('--chunk', type=float, default=4.0)
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 1)
    ap.add_argument('--range', help='a:b seconds to render (for tests)')
    ap.add_argument('--timeline', action='store_true')
    args = ap.parse_args()

    R._post_init()
    tl, sections = build()
    R._TL = tl
    if args.timeline:
        for it in tl.items:
            print(f"{it['start']:7.2f}  {it['scene'].dur:5.2f}  {it['trans']:8s} {it['scene'].name}")
        print(f'total {tl.total:.2f}s')
        return
    if args.preview:
        os.makedirs(os.path.join(R.HERE, 'preview'), exist_ok=True)
        for ts in args.preview.split(','):
            t = float(ts)
            im = tl.frame(t)
            if args.scale != 1:
                im = im.resize((int(W * args.scale), int(H * args.scale)), Image.BILINEAR)
            p = os.path.join(R.HERE, 'preview', f'a_{t:06.2f}.jpg')
            im.save(p, quality=85)
            print(p)
        return

    t0, t1 = 0.0, tl.total
    if args.range:
        t0, t1 = map(float, args.range.split(':'))
    work = os.path.join(R.HERE, 'build_anim')
    os.makedirs(work, exist_ok=True)
    fa, fb = int(round(t0 * FPS)), int(round(t1 * FPS))
    step = int(args.chunk * FPS)
    jobs = [(a, min(fb, a + step), os.path.join(work, f'chunk_{a:05d}.mp4')) for a in range(fa, fb, step)]
    wav = os.path.join(work, 'audio.wav')
    R.build_audio(tl.total, sections, tl.events(), wav)
    if args.jobs > 1:
        import multiprocessing as mp
        with mp.get_context('fork').Pool(args.jobs) as pool:
            for pth in pool.imap(R._worker, jobs):
                print('done', pth, flush=True)
    else:
        for j in jobs:
            print('done', R._worker(j), flush=True)
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
