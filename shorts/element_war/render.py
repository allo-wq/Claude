#!/usr/bin/env python3
"""FIRE vs WATER vs PLANT, a 1080x1920 / 60 fps Loop Lab short with sound.

240 particles in three armies. Fire burns plant, plant drinks water, water puts out
fire: touch your prey and it joins your side. The battle runs until one element owns
the arena. The soundtrack is generated too: a synth track that builds as the battle
narrows, plus a crackle, splash or pluck for every conversion.

    python3 render.py search                  # rank simulated battles by drama
    python3 render.py still --times 2,20,end  # preview PNGs
    python3 render.py render                  # full MP4
"""
import argparse
import math
import os
import sys

import cairo
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import brand  # noqa: E402
import common as C  # noqa: E402
from common import GOLD, H, RED, WHITE, W  # noqa: E402

import sim as S  # noqa: E402
from sim import ARENA, DT, FIRE, NAMES, PLANT, WATER  # noqa: E402

DEFAULT_SEED = 231
COL = [(1.0, 0.45, 0.12), (0.22, 0.62, 1.0), (0.32, 0.90, 0.38)]
LIGHT = [(1.0, 0.88, 0.35), (0.65, 0.92, 1.0), (0.78, 1.0, 0.5)]
VERB = {FIRE: "BURNS", PLANT: "DRINKS", WATER: "PUTS OUT"}
ONE = {FIRE: "FLAME", WATER: "DROP", PLANT: "LEAF"}
MANY = {FIRE: "FLAMES", WATER: "DROPS", PLANT: "LEAVES"}
AX0, AY0, AX1, AY1 = ARENA
ACX, ACY = (AX0 + AX1) / 2, (AY0 + AY1) / 2
SPR = 96                     # sprite canvas size (icons are drawn at ~2x and scaled down)
ICON = 0.42                  # sprite px -> screen px for arena particles
PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]


# --------------------------------------------------------------------------- sprites
def _flame(ctx):
    ctx.move_to(0, 0.92)
    ctx.curve_to(-0.55, 0.92, -0.72, 0.38, -0.45, 0.02)
    ctx.curve_to(-0.36, -0.12, -0.38, -0.32, -0.44, -0.5)
    ctx.curve_to(-0.18, -0.36, -0.08, -0.22, -0.06, -0.08)
    ctx.curve_to(0.02, -0.38, 0.14, -0.66, 0.32, -0.92)
    ctx.curve_to(0.36, -0.55, 0.72, -0.3, 0.66, 0.24)
    ctx.curve_to(0.62, 0.66, 0.4, 0.92, 0, 0.92)
    ctx.close_path()


def _drop(ctx):
    ctx.move_to(0, -0.95)
    ctx.curve_to(0.12, -0.72, 0.68, -0.18, 0.68, 0.3)
    ctx.curve_to(0.68, 0.7, 0.38, 0.95, 0, 0.95)
    ctx.curve_to(-0.38, 0.95, -0.68, 0.7, -0.68, 0.3)
    ctx.curve_to(-0.68, -0.18, -0.12, -0.72, 0, -0.95)
    ctx.close_path()


def _leaf(ctx):
    ctx.move_to(-0.7, 0.7)
    ctx.curve_to(-0.75, -0.1, -0.15, -0.72, 0.78, -0.78)
    ctx.curve_to(0.72, 0.15, 0.1, 0.75, -0.7, 0.7)
    ctx.close_path()


def make_sprite(kind):
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, SPR, SPR)
    ctx = cairo.Context(surf)
    ctx.translate(SPR / 2, SPR / 2)
    ctx.scale(40, 40)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    shape = {FIRE: _flame, WATER: _drop, PLANT: _leaf}[kind]
    shape(ctx)
    ctx.set_source_rgba(0.03, 0.01, 0.06, 0.75)
    ctx.set_line_width(0.16)
    ctx.stroke_preserve()
    if kind == FIRE:
        g = cairo.LinearGradient(0, 0.92, 0, -0.92)
        g.add_color_stop_rgb(0, 1.0, 0.9, 0.35)
        g.add_color_stop_rgb(0.5, 1.0, 0.5, 0.12)
        g.add_color_stop_rgb(1, 0.95, 0.2, 0.1)
    elif kind == WATER:
        g = cairo.LinearGradient(0, -0.95, 0, 0.95)
        g.add_color_stop_rgb(0, 0.7, 0.95, 1.0)
        g.add_color_stop_rgb(1, 0.12, 0.45, 0.95)
    else:
        g = cairo.LinearGradient(-0.7, 0.7, 0.78, -0.78)
        g.add_color_stop_rgb(0, 0.18, 0.62, 0.22)
        g.add_color_stop_rgb(1, 0.55, 0.98, 0.42)
    ctx.set_source(g)
    ctx.fill()
    if kind == FIRE:
        ctx.move_to(0, 0.86)
        ctx.curve_to(-0.3, 0.86, -0.38, 0.5, -0.2, 0.26)
        ctx.curve_to(-0.1, 0.12, -0.04, 0.0, 0.0, -0.18)
        ctx.curve_to(0.1, 0.06, 0.34, 0.24, 0.3, 0.52)
        ctx.curve_to(0.28, 0.76, 0.16, 0.86, 0, 0.86)
        ctx.set_source_rgb(1.0, 0.97, 0.7)
        ctx.fill()
    elif kind == WATER:
        ctx.save()
        ctx.translate(-0.28, 0.32)
        ctx.scale(0.11, 0.22)
        ctx.arc(0, 0, 1, 0, 2 * math.pi)
        ctx.restore()
        ctx.set_source_rgba(1, 1, 1, 0.75)
        ctx.fill()
    else:
        ctx.move_to(-0.62, 0.62)
        ctx.curve_to(-0.1, 0.1, 0.3, -0.35, 0.7, -0.7)
        ctx.set_source_rgba(0.85, 1.0, 0.7, 0.85)
        ctx.set_line_width(0.07)
        ctx.stroke()
        ctx.move_to(-0.7, 0.7)
        ctx.line_to(-0.92, 0.92)
        ctx.set_source_rgb(0.2, 0.55, 0.2)
        ctx.set_line_width(0.09)
        ctx.stroke()
    surf.flush()
    return surf


# ---------------------------------------------------------------------------- battle
class Battle:
    def __init__(self, seed):
        sim = S.simulate(seed, after=6.0)
        if sim is None:
            raise SystemExit(f"seed {seed} never finishes")
        self.seed = seed
        self.T = T = sim["t_end"]
        self.pos, self.typ, self.counts = sim["pos"], sim["typ"], sim["counts"]
        self.F = len(self.pos)
        ev = sim["events"]
        self.ev_t = np.array([e[0] * DT for e in ev])
        self.ev_i = np.array([e[1] for e in ev])
        self.ev_from = np.array([e[2] for e in ev])
        self.ev_to = np.array([e[3] for e in ev])
        self.ev_x = np.array([e[4] for e in ev])
        self.ev_y = np.array([e[5] for e in ev])
        rng = np.random.default_rng(99)
        self.ev_ang = rng.uniform(0, 2 * np.pi, (len(ev), 6))
        self.ev_spd = rng.uniform(90, 260, (len(ev), 6))

        self.tm = C.TimeMap(T, tail=5.2)
        self.vT = self.tm.v_of_s(T)
        self.vW = self.tm.v_of_s(T + 0.75)
        self.winner = int(self.counts[-1].argmax())

        # extinctions: (time, element, x, y of the last one to fall)
        self.extinct = []
        for k in range(3):
            zero = np.nonzero(self.counts[:, k] == 0)[0]
            if len(zero):
                f = int(zero[0])
                last = np.nonzero((self.ev_from == k) & (np.round(self.ev_t / DT) <= f))[0][-1]
                self.extinct.append((f * DT, k, self.ev_x[last], self.ev_y[last]))
        self.extinct.sort()
        self.first_out_t = self.extinct[0][0]
        before = self.counts[: int(round(self.first_out_t / DT))]
        self.winner_min = int(before[:, self.winner].min())
        self.peak = int(before.max())
        self.peak_type = int(np.unravel_index(before.argmax(), before.shape)[1])

        # leader (unique top count) and when it last changed, per frame
        self.leader = np.full(self.F, -1)
        self.leader_since = np.zeros(self.F)
        prev, since = -1, 0.0
        for f in range(self.F):
            row = self.counts[f]
            lead = int(row.argmax()) if (row == row.max()).sum() == 1 else prev
            if lead != prev:
                since = self.tm.v_of_s(f * DT)
                prev = lead
            self.leader[f], self.leader_since[f] = lead, since

        self.confetti = C.Confetti([COL[self.winner], COL[self.winner], LIGHT[self.winner], WHITE, GOLD])

    def frame_of(self, s):
        return min(self.F - 1, max(0, int(round(s / DT))))

    def positions(self, s):
        f = min(max(s / DT, 0.0), self.F - 1.000001)
        i = int(f)
        w = f - i
        return self.pos[i] * (1 - w) + self.pos[i + 1] * w

    def shake(self, v):
        ox = oy = 0.0
        for t, k, _, _ in self.extinct:
            age = v - self.tm.v_of_s(t)
            if 0 <= age < 0.35:
                amp = (18 if t >= self.T else 10) * (1 - age / 0.35) ** 2
                ox += amp * math.sin(v * 91 + k)
                oy += amp * math.cos(v * 77 + 2 * k)
        return ox, oy


# -------------------------------------------------------------------------- renderer
class Renderer:
    def __init__(self, battle):
        self.b = battle
        self.bg = self._background()
        self.surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        self.ctx = cairo.Context(self.surf)
        self.bloom = C.Bloom()
        self.spr = [make_sprite(k) for k in range(3)]

    def _background(self):
        surf = C.make_background(ACX, ACY)
        ctx = cairo.Context(surf)
        ctx.save()
        C.rounded_rect(ctx, AX0, AY0, AX1, AY1, 28)
        ctx.clip()
        ctx.set_source_rgba(0.75, 0.7, 1.0, 0.045)
        ctx.set_line_width(1.5)
        for x in np.arange(AX0, AX1, 70):
            ctx.move_to(x, AY0)
            ctx.line_to(x, AY1)
        for y in np.arange(AY0, AY1, 70):
            ctx.move_to(AX0, y)
            ctx.line_to(AX1, y)
        ctx.stroke()
        ctx.restore()
        for lw, al in ((26, 0.05), (14, 0.10), (7, 0.25), (3.5, 1.0)):
            g = cairo.LinearGradient(AX0, AY0, AX1, AY1)
            g.add_color_stop_rgba(0, *brand.VIOLET, al)
            g.add_color_stop_rgba(1, *brand.PINK, al)
            C.rounded_rect(ctx, AX0 - 6, AY0 - 6, AX1 + 6, AY1 + 6, 32)
            ctx.set_source(g)
            ctx.set_line_width(lw)
            ctx.stroke()
        return surf

    def icon(self, ctx, k, x, y, scale, rot=0.0, sx=1.0, sy=1.0, alpha=1.0):
        ctx.save()
        ctx.translate(x, y)
        if rot:
            ctx.rotate(rot)
        ctx.scale(scale * sx, scale * sy)
        ctx.set_source_surface(self.spr[k], -SPR / 2, -SPR / 2)
        if alpha >= 0.999:
            ctx.paint()
        else:
            ctx.paint_with_alpha(alpha)
        ctx.restore()

    # world = the arena contents (gets bloom + shake)
    def world(self, ctx, s, v, glow):
        b = self.b
        f = b.frame_of(s)
        P, T = b.positions(s), b.typ[f]
        cnt = b.counts[f]
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)

        i0 = int(np.searchsorted(b.ev_t, s - 0.5))
        i1 = int(np.searchsorted(b.ev_t, s, "right"))
        pop = {}
        for e in range(i0, i1):
            age = s - b.ev_t[e]
            pop[int(b.ev_i[e])] = age
            self.burst(ctx, e, age, glow)

        for t, k, x, y in b.extinct:
            age = s - t
            if 0 <= age < 0.8:
                u = age / 0.8
                ctx.set_source_rgba(*COL[k], 0.8 * (1 - u) ** 1.4)
                ctx.set_line_width((7 if not glow else 16) * (1 - u) + 1)
                ctx.new_sub_path()
                ctx.arc(x, y, 20 + 320 * C.ease_out_cubic(u), 0, 2 * math.pi)
                ctx.stroke()

        # the last few survivors of an element get a pulsing target ring
        for k in range(3):
            if 0 < cnt[k] <= 3 and s < b.T:
                pr = 0.5 + 0.5 * math.sin(v * 9)
                for i in np.nonzero(T == k)[0]:
                    ctx.set_source_rgba(*COL[k], 0.5 + 0.4 * pr)
                    ctx.set_line_width(3 if not glow else 7)
                    ctx.new_sub_path()
                    ctx.arc(P[i, 0], P[i, 1], 24 + 6 * pr, 0, 2 * math.pi)
                    ctx.stroke()

        if glow:
            for k in range(3):
                idx = np.nonzero(T == k)[0]
                ctx.set_source_rgba(*COL[k], 0.45)
                for i in idx:
                    ctx.new_sub_path()
                    ctx.arc(P[i, 0], P[i, 1], 15, 0, 2 * math.pi)
                ctx.fill()
            return

        for i in range(len(P)):
            k = int(T[i])
            sc = ICON
            if i in pop:
                sc *= 1 + 0.8 * math.exp(-pop[i] * 9)
            if k == FIRE:
                fl = math.sin(v * 13 + i * 1.3)
                self.icon(ctx, k, P[i, 0], P[i, 1], sc, sx=1 - 0.04 * fl, sy=1 + 0.07 * fl)
            elif k == PLANT:
                self.icon(ctx, k, P[i, 0], P[i, 1], sc, rot=0.28 * math.sin(v * 3 + i * 1.7))
            else:
                self.icon(ctx, k, P[i, 0], P[i, 1], sc)

    def burst(self, ctx, e, age, glow):
        b = self.b
        k = int(b.ev_to[e])
        x, y = b.ev_x[e], b.ev_y[e]
        u = age / 0.45
        if u < 1:
            ctx.set_source_rgba(*COL[k], 0.55 * (1 - u))
            ctx.set_line_width(3.0 if not glow else 6.0)
            ctx.new_sub_path()
            ctx.arc(x, y, 12 + 30 * C.ease_out_cubic(u), 0, 2 * math.pi)
            ctx.stroke()
        if age > 0.5:
            return
        fade = (1 - age / 0.5)
        a, sp = b.ev_ang[e], b.ev_spd[e]
        bx = x + np.cos(a) * sp * age
        by = y + np.sin(a) * sp * age
        if k == WATER:
            by = by + 500 * age * age
            ctx.set_source_rgba(*LIGHT[k], fade)
            for j in range(6):
                ctx.new_sub_path()
                ctx.arc(bx[j], by[j], 3.2, 0, 2 * math.pi)
            ctx.fill()
        elif k == FIRE:
            by = by - 120 * age
            ctx.set_source_rgba(*LIGHT[k], fade)
            ctx.set_line_width(3)
            for j in range(6):
                ctx.move_to(bx[j], by[j])
                ctx.line_to(bx[j] - math.cos(a[j]) * 9, by[j] - math.sin(a[j]) * 9 + 4)
            ctx.stroke()
        else:
            ctx.set_source_rgba(*LIGHT[k], fade)
            ctx.set_line_width(5)
            for j in range(6):
                r = a[j] + age * 8
                ctx.move_to(bx[j] - math.cos(r) * 4, by[j] - math.sin(r) * 4)
                ctx.line_to(bx[j] + math.cos(r) * 4, by[j] + math.sin(r) * 4)
            ctx.stroke()

    def hud(self, ctx, s, v):
        b = self.b
        f = b.frame_of(s)
        cnt = b.counts[f]
        C.text(ctx, "FIRE, WATER OR PLANT?", W / 2, 172, 56, WHITE)

        y = 300
        for k, cx in enumerate((190, 540, 890)):
            dead = cnt[k] == 0
            self.icon(ctx, k, cx - 82, y, 0.85, alpha=0.35 if dead else 1.0)
            if dead:
                ctx.set_source_rgba(*RED, 0.95)
                ctx.set_line_width(8)
                ctx.move_to(cx - 112, y - 30)
                ctx.line_to(cx - 52, y + 30)
                ctx.move_to(cx - 52, y - 30)
                ctx.line_to(cx - 112, y + 30)
                ctx.stroke()
                C.text(ctx, "OUT", cx - 34, y, 60, RED, left=True)
            else:
                C.text(ctx, str(cnt[k]), cx - 36, y, 84, COL[k], left=True)
        lead = b.leader[f]
        if lead >= 0 and cnt[lead] > 0:
            u = (v - b.leader_since[f]) / 0.35
            C.crown(ctx, (190, 540, 890)[lead] - 82, y - 50, 56 * C.ease_out_back(u), C.clamp01(u * 3))

        # territory bar
        bx0, bx1, by, bh = 90, 990, 392, 24
        ctx.save()
        C.rounded_rect(ctx, bx0, by - bh / 2, bx1, by + bh / 2, bh / 2)
        ctx.clip()
        x = bx0
        for k in range(3):
            wdt = (bx1 - bx0) * cnt[k] / S.N
            ctx.rectangle(x, by - bh / 2, wdt, bh)
            ctx.set_source_rgb(*COL[k])
            ctx.fill()
            x += wdt
        ctx.restore()
        C.rounded_rect(ctx, bx0, by - bh / 2, bx1, by + bh / 2, bh / 2)
        ctx.set_source_rgba(1, 1, 1, 0.5)
        ctx.set_line_width(2)
        ctx.stroke()

        # info line
        alive = [k for k in range(3) if cnt[k] > 0]
        if v < 3.4:
            a = C.clamp01((3.4 - v) / 0.3) * (0.75 + 0.25 * math.sin(v * 9))
            C.text(ctx, "PICK ONE IN THE COMMENTS", W / 2, 460, 40, GOLD, alpha=a)
        elif len(alive) == 3:
            low = [k for k in alive if cnt[k] <= 3]
            if low and s < b.T:
                k = min(low, key=lambda j: cnt[j])
                C.text(ctx, f"ONLY {cnt[k]} {(ONE if cnt[k] == 1 else MANY)[k]} LEFT!", W / 2, 460, 46, COL[k],
                       scale=1 + 0.06 * math.sin(v * 10))
            else:
                self.rules(ctx, 460, C.clamp01((v - 3.4) / 0.3))
        elif len(alive) == 2 and s < b.T:
            p, q = alive if S.PREY[alive[0]] == alive[1] else alive[::-1]
            age = v - b.tm.v_of_s(b.first_out_t)
            if age < 1.3:
                C.text(ctx, f"ONLY {NAMES[alive[0]]} AND {NAMES[alive[1]]} LEFT", W / 2, 460, 40, WHITE)
            else:
                C.text(ctx, f"...AND {NAMES[p]} {VERB[p]} {NAMES[q]}!", W / 2, 460, 46, COL[p],
                       scale=C.ease_out_back((age - 1.3) / 0.35))

        # "X IS OUT!" banner
        for t, k, _, _ in b.extinct:
            if t >= b.T:
                continue
            age = v - b.tm.v_of_s(t)
            if 0 <= age < 1.7:
                a = C.clamp01((1.7 - age) / 0.3)
                C.text(ctx, f"{NAMES[k]} IS OUT!", ACX, ACY, 118, COL[k], alpha=a,
                       scale=C.ease_out_back(age / 0.35), outline=0.12)

        # finale
        if b.vT <= v < b.vT + 0.45:
            u = (v - b.vT) / 0.45
            ctx.set_source_rgba(1, 1, 1, 0.45 * (1 - u) ** 2)
            ctx.paint()
        if v >= b.vW - 0.1:
            b.confetti.draw(ctx, v - (b.vW - 0.1))
        if v >= b.vW:
            self.winner_card(ctx, v - b.vW)

    def rules(self, ctx, y, alpha):
        items = [("i", FIRE), ("w", "BURNS"), ("i", PLANT), ("w", "DRINKS"), ("i", WATER),
                 ("w", "PUTS OUT"), ("i", FIRE)]
        size, iw, gap = 28, 40, 14
        widths = [iw if t == "i" else C.text_width(ctx, s, size) for t, s in items]
        x = W / 2 - (sum(widths) + gap * (len(items) - 1)) / 2
        for (t, s), wdt in zip(items, widths):
            if t == "i":
                self.icon(ctx, s, x + iw / 2, y, 0.5, alpha=alpha)
            else:
                C.text(ctx, s, x, y, size, (0.86, 0.84, 0.95), alpha=alpha, left=True, outline=0.1)
            x += wdt + gap

    def winner_card(self, ctx, t):
        b = self.b
        k = b.winner
        C.rounded_rect(ctx, AX0 - 8, AY0 - 8, AX1 + 8, AY1 + 8, 32)
        ctx.set_source_rgba(0.02, 0.01, 0.05, 0.55 * C.clamp01(t / 0.3))
        ctx.fill()
        g = cairo.RadialGradient(ACX, 1060, 50, ACX, 1060, 780)
        g.add_color_stop_rgba(0, 0, 0, 0.03, 0.65 * C.clamp01(t / 0.3))
        g.add_color_stop_rgba(1, 0, 0, 0.03, 0.0)
        ctx.set_source(g)
        ctx.paint()
        C.text(ctx, NAMES[k], W / 2, 850, 190, COL[k], scale=C.ease_out_back(t / 0.45), outline=0.1)
        C.text(ctx, "TAKES OVER!", W / 2, 1005, 118, WHITE,
               scale=C.ease_out_back((t - 0.15) / 0.45), outline=0.1)
        a = C.clamp01((t - 0.45) / 0.25)
        if b.winner_min == 1:
            C.text(ctx, f"CAME BACK FROM A SINGLE {ONE[k]}!", W / 2, 1125, 48, GOLD, alpha=a)
        elif b.winner_min <= 15:
            C.text(ctx, f"CAME BACK FROM ONLY {b.winner_min} LEFT", W / 2, 1125, 48, GOLD, alpha=a)
        if b.peak_type != k and b.peak >= S.N - 15:
            C.text(ctx, f"({NAMES[b.peak_type]} WAS {S.N - b.peak} AWAY FROM WINNING)", W / 2, 1182, 36,
                   (0.86, 0.84, 0.95), alpha=C.clamp01((t - 0.7) / 0.25))
        a = C.clamp01((t - 1.0) / 0.3)
        C.text(ctx, f"DID YOU PICK {NAMES[k]}?", W / 2, 1280, 58, WHITE, alpha=a,
               scale=0.9 + 0.1 * C.ease_out_back((t - 1.0) / 0.4))
        if t >= 1.6:
            brand.draw_card(ctx, W / 2, 1470, t - 1.6)

    def frame(self, v):
        b = self.b
        s = b.tm.s_of_v(v)
        ox, oy = b.shake(v)
        g = self.bloom.begin()
        g.translate(ox, oy)
        self.world(g, s, v, glow=True)
        c = self.ctx
        c.set_operator(cairo.OPERATOR_SOURCE)
        c.set_source_surface(self.bg, 0, 0)
        c.paint()
        c.set_operator(cairo.OPERATOR_OVER)
        c.save()
        c.translate(ox, oy)
        self.world(c, s, v, glow=False)
        c.restore()
        self.bloom.apply(c)
        self.hud(c, s, v)
        self.surf.flush()
        return self.surf


# ----------------------------------------------------------------------------- audio
def build_audio(b, path):
    rng = np.random.default_rng(21)
    tm = b.tm
    mx = C.Mixer(tm.duration)
    v_music_end = tm.v_of_s(tm.slow_start)
    v_final_two = tm.v_of_s(b.first_out_t)

    # music: 120 BPM, A minor (Am F C G), layers come in as the battle heats up
    prog = [(45, (57, 60, 64)), (41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62))]
    bass = {r: C.saw(r, 0.3, 0.11, 5) for r, _ in prog}
    pads = {}
    kick = C.thump(130, 45, 0.3, 0.12)
    for bar in range(int(v_music_end / 2.0) + 1):
        tb = bar * 2.0
        root, triad = prog[bar % 4]
        for m in triad:
            if m not in pads:
                pads[m] = C.lowpass(C.saw(m, 2.4, 1.4, 4, attack=0.25), 6)
            if tb < v_music_end:
                mx.add(pads[m], tb, 0.035)
        for e in range(8):
            t = tb + e * 0.25
            if t >= v_music_end:
                break
            mx.add(bass[root], t, 0.15)
            if t >= 2.0 and e % 2 == 0:
                mx.add(kick, t, 0.42)
            if t >= 8.0 and e % 2 == 1:
                mx.add(C.noise_burst(rng, 0.06, 0.012), t, 0.06)
            if t >= 16.0 and e in (2, 6):
                mx.add(C.noise_burst(rng, 0.15, 0.05), t, 0.13)
        if tb >= v_final_two - 2.0:
            for e in range(16):
                t = tb + e * 0.125
                if v_final_two <= t < v_music_end:
                    mx.add(C.pluck(triad[e % 3] + 12, 0.08, 0.25), t, 0.07)

    # conversions: crackle (fire wins), bloop (water wins), pluck (plant wins)
    crackles = [C.noise_burst(rng, 0.12, 0.025) * 0.8 + 0.5 * C.thump(180, 70, 0.12, 0.05) for _ in range(6)]
    bloops = {m: C.sweep(C.midi_hz(m), C.midi_hz(m) * 1.9, 0.12, 0.05) for m in PENTA}
    plucks = {m: C.pluck(m, 0.09, 0.3) for m in PENTA}
    last = [-1.0, -1.0, -1.0]
    for e in range(len(b.ev_t)):
        if b.ev_t[e] > b.T:
            break
        v = tm.v_of_s(b.ev_t[e])
        k = int(b.ev_to[e])
        if v - last[k] < 0.045:
            continue
        last[k] = v
        pan = (b.ev_x[e] - ACX) / 490 * 0.7
        m = int(rng.choice(PENTA[2:]))
        sig = crackles[e % 6] if k == FIRE else bloops[m] if k == WATER else plucks[m]
        mx.add(sig, v, 0.17, pan)

    # an element is wiped out
    for t, k, x, y in b.extinct:
        if t >= b.T:
            continue
        v = tm.v_of_s(t)
        mx.add(C.sweep(700, 70, 0.8, 0.35), v, 0.35)
        mx.add(C.thump(), v, 0.6)

    # riser into the final conversion, then impact
    dur = b.vT - tm.v_of_s(tm.slow_start)
    t = C.env_t(dur)
    u = t / dur
    riser = C.lowpass(rng.standard_normal(len(t)), 6) * u ** 2.2 * 0.6
    riser += np.sin(np.cumsum(2 * np.pi * (150 * 6 ** u) / C.SR)) * u ** 2 * 0.5
    mx.add(riser, tm.v_of_s(tm.slow_start), 0.35)
    t = C.env_t(3.0)
    mx.add(np.sin(np.cumsum(2 * np.pi * (30 + 60 * np.exp(-t / 0.25)) / C.SR)) * np.exp(-t / 0.9), b.vT, 0.9)
    mx.add(C.lowpass(rng.standard_normal(len(t)), 3) * np.exp(-t / 0.6), b.vT, 0.3)
    for m in (45, 52, 57, 60, 64):
        mx.add(C.saw(m, 3.0, 1.1, 6, attack=0.01), b.vT, 0.09)

    # winner: confetti pops, A-major arpeggio, pad, sparkles, then the Loop Lab sting
    vw = b.vW
    mx.add(C.noise_burst(rng, 0.25, 0.05, hp=False), vw - 0.1, 0.5, -0.8)
    mx.add(C.noise_burst(rng, 0.25, 0.05, hp=False), vw - 0.06, 0.5, 0.8)
    for i, m in enumerate((69, 73, 76, 81)):
        mx.add(C.bell(m, 1.8, 1.1), vw + 0.09 * i, 0.42)
    t = C.env_t(3.2)
    pad = sum(np.sin(2 * np.pi * C.midi_hz(m) * t) + 0.3 * np.sin(4 * np.pi * C.midi_hz(m) * t)
              for m in (57, 61, 64, 69, 73))
    mx.add(pad * np.minimum(1, t / 0.08) * np.exp(-t / 1.6), vw + 0.36, 0.09)
    for _ in range(16):
        m = 81 + int(rng.choice([0, 4, 7, 12, 16, 19]))
        mx.add(C.bell(m, 0.8, 0.3), vw + 0.4 + rng.uniform(0, 1.8), 0.1, rng.uniform(-0.9, 0.9))
    mx.add(brand.sting(C.SR), vw + 1.62, 0.16)
    mx.write(path)


# ------------------------------------------------------------------------------- CLI
def cmd_search(args):
    from multiprocessing import Pool
    with Pool(os.cpu_count()) as p:
        res = p.map(S.summarize, range(1, args.count + 1), chunksize=4)
    rank(res)


def rank(res):
    good = []
    for seed, r in res:
        if not r or not (34 <= r["T"] <= 46 and 2.0 <= r["final_phase"] <= 6.0 and r["first_out"] >= 24):
            continue
        score = (15 - min(r["winner_min"], 15)) * 1.0 + (r["peak"] - 180) / 10 * (r["peak_type"] != r["winner"]) \
            + r["leaders"] - abs(r["T"] - 40) * 0.3
        good.append((score, seed, r))
    for score, seed, r in sorted(good, reverse=True)[:15]:
        print(f"{score:5.1f} seed={seed:<4} T={r['T']:.1f}s winner={NAMES[r['winner']]:<5} "
              f"came_back_from={r['winner_min']:<3} peak={r['peak']} by {NAMES[r['peak_type']]:<5} "
              f"first_out={r['first_out']:.1f}s final_phase={r['final_phase']:.1f}s")


def cmd_still(args):
    b = Battle(args.seed)
    rd = Renderer(b)
    os.makedirs(args.outdir, exist_ok=True)
    print(f"duration {b.tm.duration:.2f}s, T={b.T:.2f}s (video {b.vT:.2f}s), "
          f"winner {NAMES[b.winner]}, came back from {b.winner_min}, extinctions "
          + ", ".join(f"{NAMES[k]}@{b.tm.v_of_s(t):.1f}s" for t, k, _, _ in b.extinct))
    for tv in args.times.split(","):
        v = {"end": b.vW + 2.6, "final": b.vT - 0.3}.get(tv)
        v = float(tv) if v is None else v
        path = os.path.join(args.outdir, f"still_{tv}.png")
        rd.frame(v).write_to_png(path)
        print(path)


def cmd_render(args):
    b = Battle(args.seed)
    rd = Renderer(b)
    out = os.path.abspath(args.out)
    wav = os.path.splitext(out)[0] + ".wav"
    print(f"seed {args.seed}: {b.tm.duration:.2f}s, {b.tm.n_frames} frames, winner {NAMES[b.winner]}")
    build_audio(b, wav)
    C.encode(out, b.tm.n_frames, lambda i: rd.frame(i / C.FPS), wav)
    if not args.keep_wav:
        os.remove(wav)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("search")
    p.add_argument("--count", type=int, default=400)
    p = sub.add_parser("still")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--times", default="1,20,final,end")
    p.add_argument("--outdir", default="stills")
    p = sub.add_parser("render")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--out", default="element_war_short.mp4")
    p.add_argument("--keep-wav", action="store_true")
    args = ap.parse_args()
    {"search": cmd_search, "still": cmd_still, "render": cmd_render}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
