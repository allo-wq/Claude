#!/usr/bin/env python3
"""RING ESCAPE: Orange vs Blue, a 1080x1920 / 60 fps YouTube Short with sound.

Everything is generated: the physics (sim.py), the visuals (cairo + a bloom pass)
and the soundtrack. Every wall bounce plays the next note of "In the Hall of the
Mountain King" (Grieg, 1875, public domain). Every ring that shatters rings a
chime one semitone higher than the one before. The race slows down for the final
ring, then a winner screen with confetti plays.

    python3 render.py search                 # rank seeds by how dramatic the race is
    python3 render.py still --times 0,20,41  # preview PNGs
    python3 render.py render                 # full MP4 (default seed 2129)
    python3 render.py audio                  # rebuild just the soundtrack of an existing render
"""
import argparse
import colorsys
import json
import math
import os
import subprocess
import sys
import time
import wave

import cairo
import numpy as np
from PIL import Image, ImageChops, ImageFilter

import sim as S
from sim import BALL_R, DT, FPS, LW, N_RINGS, gap_half, ring_angle, ring_omega, ring_r

W, H = 1080, 1920
CX, CY = W / 2, 1030
GS = 4                                  # bloom layer is rendered at 1/GS resolution
GW, GH = W // GS, H // GS
SR = 48000
DEFAULT_SEED = 2129

WHITE = (1.0, 1.0, 1.0)
GOLD = (1.0, 0.82, 0.25)
RED = (1.0, 0.28, 0.33)
BALL_COL = [(1.0, 0.56, 0.10), (0.22, 0.66, 1.0)]
BALL_NAME = ["ORANGE", "BLUE"]
RING_COL = [colorsys.hsv_to_rgb((0.78 + 0.19 * k / (N_RINGS - 1)) % 1.0, 0.66, 1.0)
            for k in range(N_RINGS)]
FONT = "Inter"
FONT_HEAVY = "Inter Black"
TRAIL = 18
GLOW_LUT = [min(255, int(i * 1.45)) for i in range(256)] * 4

# Hall of the Mountain King, main theme (MIDI note numbers, B minor)
PHRASE = [59, 61, 62, 64, 66, 62, 66, 65, 61, 65, 64, 60, 64,
          59, 61, 62, 64, 66, 62, 66, 71, 69, 66, 62, 66, 69]


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def sstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def ease_out_cubic(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_out_back(x, k=2.2):
    x = clamp01(x) - 1
    return 1 + (k + 1) * x ** 3 + k * x ** 2


def mix(a, b, f):
    return tuple(p + (q - p) * f for p, q in zip(a, b))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# --------------------------------------------------------------------------- race
class Race:
    def __init__(self, seed):
        sim = S.simulate(seed, after=6.0)
        if sim is None:
            raise SystemExit(f"seed {seed} never finishes")
        self.seed = seed
        self.T = T = sim["t_end"]
        self.traj = sim["traj"]
        self.breaks = sim["breaks"]
        self.bounces = sim["bounces"]
        self.clicks = sim["clicks"]
        self.break_t = np.array([b[0] for b in self.breaks])
        self.bounce_t = np.array([b[0] for b in self.bounces])
        self.click_t = np.array([c[0] for c in self.clicks])

        # time remap: video time v -> sim time s, with slow motion on the final ring
        ds, slow = 1e-3, 0.28
        s = np.arange(0.0, T + 5.2, ds)
        sp = np.ones_like(s)
        a0, a1, b0, b1 = T - 0.8, T - 0.5, T + 0.25, T + 0.7
        m = (s >= a0) & (s < a1)
        sp[m] = 1 + (slow - 1) * sstep((s[m] - a0) / (a1 - a0))
        sp[(s >= a1) & (s < b0)] = slow
        m = (s >= b0) & (s < b1)
        sp[m] = slow + (1 - slow) * sstep((s[m] - b0) / (b1 - b0))
        self.sg = s
        self.vg = np.concatenate([[0.0], np.cumsum(ds / sp[:-1])])
        self.duration = float(self.vg[-1])
        self.n_frames = int(self.duration * FPS)

        self.break_v = [self.v_of_s(t) for t in self.break_t]
        self.vT = self.v_of_s(T)
        self.vW = self.v_of_s(T + 0.75)          # winner card appears
        self.v_slow = self.v_of_s(T - 0.8)

        # score bookkeeping, indexed by number of rings broken so far
        sc = [0, 0]
        self.cum = [(0, 0)]
        self.last_score_v = [[None, None]]
        self.leader = [-1]
        self.leader_since = [0.0]
        for i, (t, k, b, x, y) in enumerate(self.breaks):
            sc[b] += 1
            self.cum.append(tuple(sc))
            ls = list(self.last_score_v[-1])
            ls[b] = self.break_v[i]
            self.last_score_v.append(ls)
            lead = 0 if sc[0] > sc[1] else 1 if sc[1] > sc[0] else -1
            self.leader_since.append(self.break_v[i] if lead != self.leader[-1]
                                     else self.leader_since[-1])
            self.leader.append(lead)
        # chains: rings broken by the same ball in quick succession share one popup
        self.chain = [1] * N_RINGS
        self.chain_next = [None] * N_RINGS
        for i in range(1, N_RINGS):
            b = self.breaks[i][2]
            for j in range(i - 1, -1, -1):
                if self.break_v[i] - self.break_v[j] > 0.45:
                    break
                if self.breaks[j][2] == b:
                    self.chain[i] = self.chain[j] + 1
                    self.chain_next[j] = i
                    break
        self.winner = 0 if sc[0] > sc[1] else 1
        self.final = tuple(sc)

        # heartbeat while the final ring is up
        hb0 = self.break_v[N_RINGS - 2] + 0.15
        self.heartbeats = list(np.arange(hb0, self.vT - 0.15, 0.68))

        self._build_shards()
        self._build_confetti()

    # time helpers
    def s_of_v(self, v):
        return float(np.interp(v, self.vg, self.sg))

    def v_of_s(self, s):
        return float(np.interp(s, self.sg, self.vg))

    def pos_many(self, ss):
        f = np.clip(np.asarray(ss) / DT, 0, len(self.traj) - 1.000001)
        i = f.astype(int)
        w = (f - i)[:, None]
        return self.traj[i] * (1 - w) + self.traj[i + 1] * w

    def heart(self, v):
        p = 0.0
        for t in self.heartbeats:
            for off, amp in ((0.0, 1.0), (0.2, 0.6)):
                a = v - t - off
                if 0 <= a < 0.4:
                    p = max(p, amp * math.exp(-a * 9))
        return p

    def shake(self, v, nb):
        ox = oy = 0.0
        for k in range(max(0, nb - 4), nb):
            age = v - self.break_v[k]
            if 0 <= age < 0.3:
                amp = (18 if k == N_RINGS - 1 else 6) * (1 - age / 0.3) ** 2
                ox += amp * math.sin(v * 91 + k * 1.7)
                oy += amp * math.cos(v * 77 + k * 2.3)
        return ox, oy

    # precomputed particle systems (all analytic, so any frame renders on its own)
    def _build_shards(self):
        self.shards = []
        for k, (tb, _, b, bx, by) in enumerate(self.breaks):
            rng = np.random.default_rng(1000 + k)
            R, gh, a = ring_r(k), gap_half(k), ring_angle(k, tb)
            n = 90
            phi = a + gh + rng.random(n) * (2 * np.pi - 2 * gh)
            rad = rng.uniform(140, 520, n)
            tang = ring_omega(k) * R * 0.6 + rng.normal(0, 60, n)
            sh = dict(
                px=R * np.cos(phi), py=R * np.sin(phi),
                vx=rad * np.cos(phi) - tang * np.sin(phi),
                vy=rad * np.sin(phi) + tang * np.cos(phi),
                rot=phi + np.pi / 2, spin=rng.uniform(-14, 14, n),
                ln=rng.uniform(6, 15, n), life=rng.uniform(0.7, 1.4, n))
            m = 40
            ang = math.atan2(by, bx) + rng.normal(0, 0.45, m)
            spd = rng.uniform(450, 1150, m)
            sh["spark"] = dict(px=np.full(m, bx), py=np.full(m, by),
                               vx=spd * np.cos(ang), vy=spd * np.sin(ang),
                               life=rng.uniform(0.25, 0.6, m))
            self.shards.append(sh)

    def _build_confetti(self):
        rng = np.random.default_rng(7)
        n = 260
        side = np.where(np.arange(n) % 2 == 0, -1.0, 1.0)
        tilt = rng.uniform(0.12, 0.75, n)            # rad from vertical, towards centre
        spd = rng.uniform(3600, 6900, n)
        wc = BALL_COL[self.winner]
        palette = [wc, wc, WHITE, GOLD, mix(wc, WHITE, 0.5)]
        self.confetti = dict(
            x0=np.where(side < 0, -30.0, W + 30.0), y0=np.full(n, 1560.0),
            vx=-side * spd * np.sin(tilt), vy=-spd * np.cos(tilt),
            w=rng.uniform(14, 26, n), h=rng.uniform(8, 13, n),
            flip=rng.uniform(5, 13, n), spin=rng.uniform(-6, 6, n),
            ph=rng.uniform(0, 6.28, n), sway=rng.uniform(15, 45, n),
            col=[palette[i] for i in rng.integers(0, len(palette), n)],
            delay=rng.uniform(0, 0.12, n))


# ------------------------------------------------------------------------ drawing
def text(ctx, s, x, y, size, col, alpha=1.0, scale=1.0, face=FONT, outline=0.14, left=False):
    if alpha <= 0.003 or scale <= 0.01:
        return
    ctx.save()
    ctx.select_font_face(face, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_NORMAL if face == FONT_HEAVY else cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(size)
    xb, yb, tw, th, _, _ = ctx.text_extents(s)
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.move_to(-xb if left else -(xb + tw / 2), -(yb + th / 2))
    ctx.text_path(s)
    if outline:
        ctx.set_source_rgba(0.02, 0.0, 0.06, 0.85 * alpha)
        ctx.set_line_width(size * outline)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.stroke_preserve()
    ctx.set_source_rgba(*col, alpha)
    ctx.fill()
    ctx.restore()


def ball_icon(ctx, x, y, r, col, alpha=1.0):
    g = cairo.RadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
    g.add_color_stop_rgba(0, *mix(col, WHITE, 0.6), alpha)
    g.add_color_stop_rgba(1, *col, alpha)
    ctx.arc(x, y, r, 0, 2 * math.pi)
    ctx.set_source(g)
    ctx.fill_preserve()
    ctx.set_source_rgba(1, 1, 1, 0.9 * alpha)
    ctx.set_line_width(max(2.0, r * 0.12))
    ctx.stroke()


def crown(ctx, x, y, size, alpha):
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(size / 60, size / 60)
    pts = [(-30, 0), (-32, -30), (-15, -14), (0, -38), (15, -14), (32, -30), (30, 0)]
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    ctx.close_path()
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_source_rgba(0.1, 0.05, 0.0, 0.8 * alpha)
    ctx.set_line_width(7)
    ctx.stroke_preserve()
    ctx.set_source_rgba(*GOLD, alpha)
    ctx.fill()
    for px, py in pts[1:-1:2] + [pts[3]]:
        ctx.arc(px, py, 5, 0, 2 * math.pi)
        ctx.fill()
    ctx.restore()


def make_background():
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surf)
    g = cairo.RadialGradient(CX, CY, 50, CX, CY, 1350)
    g.add_color_stop_rgb(0, 0.10, 0.05, 0.19)
    g.add_color_stop_rgb(0.45, 0.05, 0.03, 0.11)
    g.add_color_stop_rgb(1, 0.01, 0.01, 0.03)
    ctx.set_source(g)
    ctx.paint()
    g = cairo.RadialGradient(CX, CY, 0, CX, CY, 520)
    g.add_color_stop_rgba(0, 0.30, 0.12, 0.45, 0.22)
    g.add_color_stop_rgba(1, 0.30, 0.12, 0.45, 0.0)
    ctx.set_source(g)
    ctx.paint()
    rng = np.random.default_rng(3)
    for _ in range(170):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        ctx.arc(x, y, rng.uniform(0.8, 2.3), 0, 2 * math.pi)
        ctx.set_source_rgba(0.85, 0.8, 1.0, rng.uniform(0.06, 0.32))
        ctx.fill()
    return surf


class Renderer:
    def __init__(self, race):
        self.r = race
        self.bg = make_background()
        self.surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        self.ctx = cairo.Context(self.surf)
        self.gsurf = cairo.ImageSurface(cairo.FORMAT_ARGB32, GW, GH)
        self.gctx = cairo.Context(self.gsurf)

    # world = everything that lives in the arena (gets bloom + screen shake)
    def world(self, ctx, s, v, nb, glow):
        r = self.r
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)

        flash = [0.0] * N_RINGS
        i0 = int(np.searchsorted(r.bounce_t, s - 0.3))
        i1 = int(np.searchsorted(r.bounce_t, s, "right"))
        recent = r.bounces[i0:i1]
        for tb, b, k, x, y, vn in recent:
            age = s - tb
            if age < 0.22:
                flash[k] = max(flash[k], (1 - age / 0.22) * min(1.0, vn / 900))

        pulse = r.heart(v) if nb == N_RINGS - 1 else 0.0
        for k in range(N_RINGS - 1, nb - 1, -1):
            R, gh, a = ring_r(k), gap_half(k), ring_angle(k, s)
            depth = k - nb
            alpha = 1.0 if depth == 0 else max(0.35, 0.82 - 0.028 * depth)
            f = flash[k]
            col = mix(RING_COL[k], WHITE, min(1.0, 0.7 * f + 0.5 * pulse))
            lw = LW + (1.5 if depth == 0 else 0.0) + 3 * f + 5 * pulse
            if glow:
                lw *= 2.2
                alpha *= 0.6 if depth == 0 else 0.45
            ctx.set_source_rgba(*col, alpha)
            ctx.set_line_width(lw)
            ctx.new_sub_path()
            ctx.arc(CX, CY, R, a + gh, a - gh + 2 * math.pi)
            ctx.stroke()

        # shattered rings
        for k in range(max(0, nb - 10), nb):
            age = s - r.break_t[k]
            if age < 1.5:
                self.shatter(ctx, k, age, glow)

        # bounce ripples + ball-ball clicks
        for tb, b, k, x, y, vn in recent:
            u = (s - tb) / 0.3
            d = math.hypot(x, y) or 1.0
            rr = ring_r(k) - LW / 2
            ctx.set_source_rgba(*BALL_COL[b], 0.6 * (1 - u))
            ctx.set_line_width(3.0 if not glow else 6.0)
            ctx.new_sub_path()
            ctx.arc(CX + x / d * rr, CY + y / d * rr, 5 + 34 * ease_out_cubic(u), 0, 2 * math.pi)
            ctx.stroke()
        j0 = int(np.searchsorted(r.click_t, s - 0.25))
        j1 = int(np.searchsorted(r.click_t, s, "right"))
        for tc, x, y, vr in r.clicks[j0:j1]:
            u = (s - tc) / 0.25
            ctx.set_source_rgba(1, 1, 1, 0.7 * (1 - u))
            ctx.set_line_width(3.0)
            ctx.new_sub_path()
            ctx.arc(CX + x, CY + y, 6 + 40 * ease_out_cubic(u), 0, 2 * math.pi)
            ctx.stroke()

        # trails + balls
        vs = v - np.arange(TRAIL) / 90.0
        ps = r.pos_many(np.interp(vs, r.vg, r.sg))
        for b in (0, 1):
            col = BALL_COL[b]
            for j in range(TRAIL - 1, 0, -1):
                f = 1 - j / TRAIL
                ctx.set_source_rgba(*col, (0.55 if not glow else 0.35) * f ** 1.6)
                ctx.set_line_width(2 * BALL_R * f * 0.95)
                ctx.move_to(CX + ps[j, 2 * b], CY + ps[j, 2 * b + 1])
                ctx.line_to(CX + ps[j - 1, 2 * b], CY + ps[j - 1, 2 * b + 1])
                ctx.stroke()
            x, y = CX + ps[0, 2 * b], CY + ps[0, 2 * b + 1]
            if glow:
                ctx.set_source_rgba(*col, 1.0)
                ctx.arc(x, y, BALL_R * 1.6, 0, 2 * math.pi)
                ctx.fill()
            else:
                ball_icon(ctx, x, y, BALL_R, col)

    def shatter(self, ctx, k, age, glow):
        sh = self.r.shards[k]
        col = RING_COL[k]
        R = ring_r(k)
        if age < 0.45:
            u = age / 0.45
            ctx.set_source_rgba(*col, 0.75 * (1 - u) ** 1.5)
            ctx.set_line_width((6 if not glow else 12) * (1 - u) + 1)
            ctx.new_sub_path()
            ctx.arc(CX, CY, R + 120 * ease_out_cubic(u), 0, 2 * math.pi)
            ctx.stroke()
        live = age < sh["life"]
        if live.any():
            x = CX + sh["px"] + sh["vx"] * age
            y = CY + sh["py"] + sh["vy"] * age + 650 * age * age
            rot = sh["rot"] + sh["spin"] * age
            dx = np.cos(rot) * sh["ln"] / 2
            dy = np.sin(rot) * sh["ln"] / 2
            fade = np.clip(1 - age / sh["life"], 0, 1) ** 1.3
            c = mix(col, WHITE, clamp01(1 - age / 0.12))
            ctx.set_line_width(4.0 if not glow else 7.0)
            for i in np.nonzero(live)[0]:
                ctx.set_source_rgba(*c, float(fade[i]))
                ctx.move_to(x[i] - dx[i], y[i] - dy[i])
                ctx.line_to(x[i] + dx[i], y[i] + dy[i])
                ctx.stroke()
        sp = sh["spark"]
        live = age < sp["life"]
        if live.any():
            bcol = mix(BALL_COL[self.r.breaks[k][2]], WHITE, 0.45)
            x = CX + sp["px"] + sp["vx"] * age
            y = CY + sp["py"] + sp["vy"] * age + 500 * age * age
            fade = np.clip(1 - age / sp["life"], 0, 1)
            ctx.set_line_width(3.0 if not glow else 6.0)
            for i in np.nonzero(live)[0]:
                ctx.set_source_rgba(*bcol, float(fade[i]))
                ctx.move_to(x[i], y[i])
                ctx.line_to(x[i] - sp["vx"][i] * 0.02, y[i] - sp["vy"][i] * 0.02)
                ctx.stroke()

    def hud(self, ctx, s, v, nb):
        r = self.r
        sc = r.cum[nb]
        text(ctx, "WHO BREAKS MORE RINGS?", W / 2, 205, 52, WHITE, face=FONT_HEAVY)

        y = 350
        for b, (ix, nx) in enumerate(((190, 345), (890, 735))):
            ball_icon(ctx, ix, y, 34, BALL_COL[b])
            lv = r.last_score_v[nb][b]
            pop = 1 + 0.55 * math.exp(-(v - lv) * 7) if lv is not None else 1.0
            text(ctx, str(sc[b]), nx, y, 128, BALL_COL[b], scale=pop, face=FONT_HEAVY)
        text(ctx, "VS", W / 2, y, 46, (0.72, 0.70, 0.82), face=FONT_HEAVY)
        lead = r.leader[nb]
        if lead >= 0:
            u = (v - r.leader_since[nb]) / 0.35
            crown(ctx, (190, 890)[lead], y - 46, 62 * ease_out_back(u), clamp01(u * 3))

        if v < 3.4:
            a = clamp01((3.4 - v) / 0.3) * (0.75 + 0.25 * math.sin(v * 9))
            text(ctx, "PICK A SIDE IN THE COMMENTS", W / 2, 478, 40, GOLD, alpha=a, face=FONT_HEAVY)
        elif s < r.T and nb == N_RINGS - 1:
            a = 0.7 + 0.3 * math.sin(v * 11)
            text(ctx, "FINAL RING", W / 2, 470, 64, RED, alpha=a, face=FONT_HEAVY,
                 scale=1 + 0.08 * r.heart(v))
            text(ctx, "WINNER TAKES ALL", W / 2, 1530, 44, WHITE, alpha=a, face=FONT_HEAVY)
        elif s < r.T:
            a = clamp01((v - 3.4) / 0.3)
            last = r.break_v[nb - 1] if nb else -9
            text(ctx, f"RINGS LEFT: {N_RINGS - nb}", W / 2, 478, 40, (0.86, 0.84, 0.95),
                 alpha=a, scale=1 + 0.25 * math.exp(-(v - last) * 8), face=FONT_HEAVY)

        # +1 popups (a quick chain by one ball collapses into a single "+N")
        for k in range(max(0, nb - 8), nb):
            age = v - r.break_v[k]
            nxt = r.chain_next[k]
            if age < 0.85 and not (nxt is not None and nxt < nb):
                _, _, b, bx, by = r.breaks[k]
                u = age / 0.85
                text(ctx, f"+{r.chain[k]}", CX + bx, CY + by - 30 - 90 * ease_out_cubic(u), 58,
                     BALL_COL[b], alpha=1 - u ** 2, scale=ease_out_back(age / 0.25),
                     face=FONT_HEAVY)

        # final ring: flash, winner card, confetti
        if r.vT <= v < r.vT + 0.45:
            u = (v - r.vT) / 0.45
            ctx.set_source_rgba(1, 1, 1, 0.45 * (1 - u) ** 2)
            ctx.paint()
        if v >= r.vW - 0.1:
            self.confetti(ctx, v - (r.vW - 0.1))
        if v >= r.vW:
            t = v - r.vW
            g = cairo.RadialGradient(CX, 1120, 50, CX, 1120, 780)
            g.add_color_stop_rgba(0, 0, 0, 0.03, 0.6 * clamp01(t / 0.3))
            g.add_color_stop_rgba(1, 0, 0, 0.03, 0.0)
            ctx.set_source(g)
            ctx.paint()
            wc = BALL_COL[r.winner]
            text(ctx, BALL_NAME[r.winner], W / 2, 900, 200, wc,
                 scale=ease_out_back(t / 0.45), face=FONT_HEAVY, outline=0.1)
            text(ctx, "WINS!", W / 2, 1080, 170, WHITE,
                 scale=ease_out_back((t - 0.15) / 0.45), face=FONT_HEAVY, outline=0.1)
            a = clamp01((t - 0.45) / 0.25)
            text(ctx, str(r.final[0]), W / 2 - 115, 1235, 92, BALL_COL[0], alpha=a, face=FONT_HEAVY)
            text(ctx, "\u2013", W / 2, 1230, 92, WHITE, alpha=a, face=FONT_HEAVY)
            text(ctx, str(r.final[1]), W / 2 + 115, 1235, 92, BALL_COL[1], alpha=a, face=FONT_HEAVY)
            a = clamp01((t - 1.0) / 0.3)
            text(ctx, "DID YOU CALL IT?", W / 2, 1360, 60, GOLD, alpha=a,
                 scale=0.9 + 0.1 * ease_out_back((t - 1.0) / 0.4), face=FONT_HEAVY)
            if t >= 1.6:
                self.brand_card(ctx, t - 1.6)

    def brand_card(self, ctx, t):
        """'LOOP LAB' sign-off: a neon pill with a spinning ring logo."""
        a = clamp01(t / 0.3)
        cx, cy = W / 2, 1470 + 40 * (1 - ease_out_cubic(t / 0.45))
        pw, ph = 600, 124
        ctx.save()
        ctx.translate(cx, cy)
        sc = 0.85 + 0.15 * ease_out_back(t / 0.45)
        ctx.scale(sc, sc)
        x0, y0, rad = -pw / 2, -ph / 2, ph / 2
        ctx.new_sub_path()
        ctx.arc(x0 + pw - rad, 0, rad, -math.pi / 2, math.pi / 2)
        ctx.arc(x0 + rad, 0, rad, math.pi / 2, 3 * math.pi / 2)
        ctx.close_path()
        ctx.set_source_rgba(0.04, 0.02, 0.09, 0.82 * a)
        ctx.fill_preserve()
        grad = cairo.LinearGradient(x0, 0, x0 + pw, 0)
        grad.add_color_stop_rgba(0, *RING_COL[0], a)
        grad.add_color_stop_rgba(1, *RING_COL[-1], a)
        for lw, al in ((12, 0.18), (3, 1.0)):
            ctx.set_line_width(lw)
            ctx.set_source(grad)
            ctx.push_group()
            ctx.paint_with_alpha(al)
            ctx.pop_group_to_source()
            ctx.stroke_preserve()
        ctx.new_path()
        # logo: a spinning ring with a gap and a ball inside
        lx = x0 + 72
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        spin = -0.8 + t * 2.4
        for lw, al in ((14, 0.25), (7, 1.0)):
            ctx.set_line_width(lw)
            ctx.set_source_rgba(*RING_COL[8], al * a)
            ctx.new_sub_path()
            ctx.arc(lx, 0, 32, spin + 0.55, spin - 0.55 + 2 * math.pi)
            ctx.stroke()
        ball_icon(ctx, lx + 9 * math.cos(t * 5), 7 * math.sin(t * 7) + 4, 9,
                  BALL_COL[self.r.winner], alpha=a)
        text(ctx, "LOOP LAB", x0 + 128, -18, 54, WHITE, alpha=a, face=FONT_HEAVY,
             outline=0, left=True)
        text(ctx, "NEW EXPERIMENT EVERY DAY", x0 + 130, 30, 25, (0.80, 0.76, 0.94),
             alpha=a, face=FONT_HEAVY, outline=0, left=True)
        ctx.restore()

    def confetti(self, ctx, t):
        c = self.r.confetti
        tt = np.maximum(0.0, t - c["delay"])
        kd, vt = 4.2, 230.0
        e = (1 - np.exp(-kd * tt)) / kd
        x = c["x0"] + c["vx"] * e + c["sway"] * np.sin(3 * tt + c["ph"]) * np.minimum(1, tt)
        y = c["y0"] + vt * tt + (c["vy"] - vt) * e
        rot = c["ph"] + c["spin"] * tt
        fl = np.abs(np.cos(c["flip"] * tt + c["ph"])) * 0.85 + 0.15
        for i in range(len(x)):
            if tt[i] <= 0 or not (-40 < x[i] < W + 40 and -40 < y[i] < H + 40):
                continue
            ctx.save()
            ctx.translate(x[i], y[i])
            ctx.rotate(rot[i])
            ctx.scale(1.0, fl[i])
            ctx.rectangle(-c["w"][i] / 2, -c["h"][i] / 2, c["w"][i], c["h"][i])
            ctx.set_source_rgba(*c["col"][i], 0.95)
            ctx.fill()
            ctx.restore()

    def frame(self, v):
        r = self.r
        s = r.s_of_v(v)
        nb = int(np.searchsorted(r.break_t, s, "right"))
        ox, oy = r.shake(v, nb)

        g = self.gctx
        g.set_operator(cairo.OPERATOR_SOURCE)
        g.set_source_rgba(0, 0, 0, 0)
        g.paint()
        g.set_operator(cairo.OPERATOR_OVER)
        g.save()
        g.scale(1 / GS, 1 / GS)
        g.translate(ox, oy)
        self.world(g, s, v, nb, glow=True)
        g.restore()
        self.gsurf.flush()
        img = Image.frombuffer("RGBA", (GW, GH), bytes(self.gsurf.get_data()), "raw", "RGBA", 0, 1)
        img = ImageChops.add(img.filter(ImageFilter.GaussianBlur(2)),
                             img.filter(ImageFilter.GaussianBlur(7))).point(GLOW_LUT)
        gbuf = bytearray(img.tobytes())
        gsrc = cairo.ImageSurface.create_for_data(gbuf, cairo.FORMAT_RGB24, GW, GH, GW * 4)

        c = self.ctx
        c.set_operator(cairo.OPERATOR_SOURCE)
        c.set_source_surface(self.bg, 0, 0)
        c.paint()
        c.set_operator(cairo.OPERATOR_OVER)
        c.save()
        c.translate(ox, oy)
        self.world(c, s, v, nb, glow=False)
        c.restore()
        c.save()
        c.scale(GS, GS)
        c.set_source_surface(gsrc, 0, 0)
        c.get_source().set_filter(cairo.FILTER_BILINEAR)
        c.set_operator(cairo.OPERATOR_ADD)
        c.paint()
        c.restore()
        c.set_operator(cairo.OPERATOR_OVER)
        self.hud(c, s, v, nb)
        self.surf.flush()
        return self.surf


# -------------------------------------------------------------------------- audio
def env_t(dur):
    return np.arange(int(dur * SR)) / SR


def pluck(m):
    f = midi_hz(m)
    t = env_t(0.7)
    att = np.minimum(1.0, t / 0.003)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.20)
           + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.09)
           + 0.22 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.05)
           + 0.45 * np.sin(np.pi * f * t) * np.exp(-t / 0.25))
    return sig * att / 1.6


def bell(m, dur=1.6, decay=0.9):
    f = midi_hz(m)
    t = env_t(dur)
    sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay * d))
              for r, a, d in ((1, 1.0, 1.0), (2.0, 0.5, 0.6), (3.0, 0.22, 0.4), (4.07, 0.15, 0.25)))
    return sig * np.minimum(1.0, t / 0.002) / 1.5


def thump(f0=140, f1=48, dur=0.25, decay=0.09):
    t = env_t(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    return np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t / decay)


def noise_burst(rng, dur, decay, hp=True):
    t = env_t(dur)
    n = rng.standard_normal(len(t))
    if hp:
        n = np.diff(n, prepend=0.0) * 0.6
    return n * np.exp(-t / decay)


def lowpass(x, width):
    k = np.ones(width) / width
    return np.convolve(x, k, mode="same")


def build_audio(race, path):
    rng = np.random.default_rng(11)
    n = int((race.duration + 1.5) * SR)
    L = np.zeros(n)
    R = np.zeros(n)

    def add(sig, v, gain=1.0, pan=0.0):
        i = int(v * SR)
        if i < 0 or i >= n:
            return
        seg = sig[: n - i] * gain
        th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        L[i:i + len(seg)] += seg * math.cos(th)
        R[i:i + len(seg)] += seg * math.sin(th)

    def pan_of(x):
        return float(np.clip(x / 470.0, -1, 1)) * 0.75

    # ambient drone (B + F#) under the race
    t = np.arange(int(race.vT * SR)) / SR
    drone = (np.sin(2 * np.pi * midi_hz(35) * t) + 0.6 * np.sin(2 * np.pi * midi_hz(42) * t))
    drone *= (0.75 + 0.25 * np.sin(2 * np.pi * 0.25 * t)) * np.minimum(1, t / 1.5)
    drone[-2400:] *= np.linspace(1, 0, 2400)
    add(drone, 0.0, 0.05)

    # melody: one note per wall bounce
    cache = {}
    idx, trans = 0, 0
    for tb, b, k, x, y, vn in race.bounces:
        if tb >= race.T:
            break
        if idx % len(PHRASE) == 0:
            trans = 0 if k < 7 else 7 if k < 14 else 12
        m = PHRASE[idx % len(PHRASE)] + trans
        idx += 1
        if m not in cache:
            cache[m] = pluck(m)
        add(cache[m], race.v_of_s(tb), 0.34 * float(np.clip(vn / 1100, 0.55, 1.0)), pan_of(x))

    # ring shatters: rising chromatic chime + crack + thump
    for i, (tb, k, b, x, y) in enumerate(race.breaks):
        v = race.break_v[i]
        p = pan_of(x)
        add(bell(71 + k), v, 0.42, p)
        add(noise_burst(rng, 0.12, 0.025), v, 0.30, p)
        add(thump(), v, 0.55)

    # ball-ball clicks
    for tc, x, y, vr in race.clicks:
        if tc >= race.T:
            break
        t = env_t(0.08)
        wb = np.sin(2 * np.pi * 1250 * t) * np.exp(-t / 0.018) + 0.5 * np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.01)
        add(wb, race.v_of_s(tc), 0.22, pan_of(x))

    # heartbeat on the final ring
    for hb in race.heartbeats:
        add(thump(70, 40, 0.3, 0.11), hb, 0.9)
        add(thump(70, 40, 0.3, 0.09), hb + 0.2, 0.55)

    # riser into the final ring
    dur = race.vT - race.v_slow
    t = env_t(dur)
    u = t / dur
    riser = lowpass(rng.standard_normal(len(t)), 6) * u ** 2.2 * 0.6
    riser += np.sin(np.cumsum(2 * np.pi * (150 * 6 ** u) / SR)) * u ** 2 * 0.5
    add(riser, race.v_slow, 0.35)

    # impact: sub drop + crash + B minor chord
    t = env_t(3.0)
    f = 30 + 60 * np.exp(-t / 0.25)
    add(np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t / 0.9), race.vT, 0.9)
    add(lowpass(rng.standard_normal(len(t)), 3) * np.exp(-t / 0.6), race.vT, 0.32)
    for m in (47, 54, 59, 62, 66):
        fm = midi_hz(m)
        saw = sum(np.sin(2 * np.pi * fm * h * t) / h for h in range(1, 7))
        add(saw * np.exp(-t / 1.1) * np.minimum(1, t / 0.01), race.vT, 0.09)

    # winner: confetti pops, B-major arpeggio, pad, sparkles
    vw = race.vW
    add(noise_burst(rng, 0.25, 0.05, hp=False), vw - 0.1, 0.5, -0.8)
    add(noise_burst(rng, 0.25, 0.05, hp=False), vw - 0.06, 0.5, 0.8)
    for i, m in enumerate((71, 75, 78, 83)):
        add(bell(m, 1.8, 1.1), vw + 0.09 * i, 0.42)
    t = env_t(3.2)
    pad = sum(np.sin(2 * np.pi * midi_hz(m) * t) + 0.3 * np.sin(4 * np.pi * midi_hz(m) * t)
              for m in (59, 63, 66, 71, 75))
    add(pad * np.minimum(1, t / 0.08) * np.exp(-t / 1.6), vw + 0.36, 0.09)
    for i in range(16):
        m = 83 + int(rng.choice([0, 4, 7, 11, 12, 16, 19]))
        add(bell(m, 0.8, 0.3), vw + 0.4 + rng.uniform(0, 1.8), 0.1, rng.uniform(-0.9, 0.9))
    for i, m in enumerate((83, 90)):
        add(bell(m, 1.4, 0.6), vw + 1.62 + 0.11 * i, 0.16)

    # master: soft clip + normalise
    st = np.stack([L, R], axis=1)
    st = np.tanh(st / np.max(np.abs(st)) * 1.6)
    st = st / np.max(np.abs(st)) * 0.93
    st[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))[:, None]
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((st * 32767).astype("<i2").tobytes())


def loudnorm(src, dst, target=-14.0, tp=-1.5):
    """Two-pass EBU R128 normalisation to YouTube's ~-14 LUFS with a true-peak ceiling."""
    base = f"loudnorm=I={target}:TP={tp}:LRA=11"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af",
                        base + ":print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    af = (f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
          f"offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", af,
                    "-ar", str(SR), dst], check=True)


def make_soundtrack(race, wav):
    raw = wav + ".raw.wav"
    build_audio(race, raw)
    loudnorm(raw, wav)
    os.remove(raw)


# ---------------------------------------------------------------------------- CLI
def cmd_search(args):
    from multiprocessing import Pool
    with Pool(os.cpu_count()) as p:
        res = p.map(S.summarize, range(args.count), chunksize=20)
    good = []
    for seed, r in res:
        if r and r["tied"] and 34 <= r["T"] <= 44 and 1.2 <= r["final_wait"] <= 4.5 and r["changes"] >= 3:
            good.append((r["changes"] * 2 + r["deficit"] * 1.5 - abs(r["T"] - 39) * 0.3, seed, r))
    for score, seed, r in sorted(good, reverse=True)[:15]:
        print(f"{score:5.1f}  seed={seed:<5} T={r['T']:.1f}s score={r['score']} "
              f"lead_changes={r['changes']} comeback={r['deficit']} final_wait={r['final_wait']:.1f}s")


def cmd_still(args):
    race = Race(args.seed)
    rd = Renderer(race)
    os.makedirs(args.outdir, exist_ok=True)
    print(f"duration {race.duration:.2f}s, final ring at v={race.vT:.2f}s, winner {BALL_NAME[race.winner]}")
    for tv in args.times.split(","):
        v = float(tv) if tv not in ("end", "final") else (race.vW + 2.6 if tv == "end" else race.vT - 0.4)
        path = os.path.join(args.outdir, f"still_{tv}.png")
        rd.frame(v).write_to_png(path)
        print(path)


def cmd_render(args):
    race = Race(args.seed)
    rd = Renderer(race)
    out = os.path.abspath(args.out)
    wav = os.path.splitext(out)[0] + ".wav"
    print(f"seed {args.seed}: {race.duration:.2f}s, {race.n_frames} frames, "
          f"winner {BALL_NAME[race.winner]} {race.final}")
    make_soundtrack(race, wav)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
           "-shortest", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for fi in range(race.n_frames):
        proc.stdin.write(rd.frame(fi / FPS).get_data())
        if fi % 300 == 0:
            print(f"  frame {fi}/{race.n_frames}  {time.time() - t0:.0f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    if not args.keep_wav:
        os.remove(wav)
    print("wrote", out)


def cmd_audio(args):
    """Rebuild only the soundtrack and swap it into an existing render (video is copied)."""
    race = Race(args.seed)
    out = os.path.abspath(args.out)
    wav = os.path.splitext(out)[0] + ".wav"
    tmp = os.path.splitext(out)[0] + ".tmp.mp4"
    make_soundtrack(race, wav)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out, "-i", wav,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", "-shortest", tmp], check=True)
    os.replace(tmp, out)
    if not args.keep_wav:
        os.remove(wav)
    print("re-muxed audio into", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("search")
    p.add_argument("--count", type=int, default=3000)
    p = sub.add_parser("still")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--times", default="0,12,end")
    p.add_argument("--outdir", default="stills")
    p = sub.add_parser("render")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--out", default="ring_escape_short.mp4")
    p.add_argument("--keep-wav", action="store_true")
    p = sub.add_parser("audio")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--out", default="ring_escape_short.mp4")
    p.add_argument("--keep-wav", action="store_true")
    args = ap.parse_args()
    {"search": cmd_search, "still": cmd_still, "render": cmd_render, "audio": cmd_audio}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
