"""Shared building blocks for Loop Lab shorts: drawing helpers, bloom, slow-mo time maps,
confetti, a small synth/mixer for soundtracks, loudness mastering and the ffmpeg encoder.

Each video lives in its own folder with a sim.py (what happens) and a render.py (how it
looks and sounds); this module is the toolbox they share.
"""
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

W, H, FPS, SR = 1080, 1920, 60, 48000
WHITE = (1.0, 1.0, 1.0)
GOLD = (1.0, 0.82, 0.25)
RED = (1.0, 0.28, 0.33)
FONT, FONT_HEAVY = "Inter", "Inter Black"


# ----------------------------------------------------------------------------- easing
def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def sstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def ease_out_cubic(x):
    return 1 - (1 - clamp01(x)) ** 3


def ease_out_back(x, k=2.2):
    x = clamp01(x) - 1
    return 1 + (k + 1) * x ** 3 + k * x ** 2


def mix(a, b, f):
    return tuple(p + (q - p) * f for p, q in zip(a, b))


# ---------------------------------------------------------------------------- drawing
def text(ctx, s, x, y, size, col, alpha=1.0, scale=1.0, face=FONT_HEAVY, outline=0.14, left=False):
    """Text centred on (x, y) (or left-aligned), with a dark outline for readability."""
    if alpha <= 0.003 or scale <= 0.01:
        return 0.0
    ctx.save()
    ctx.select_font_face(face, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_NORMAL if face == FONT_HEAVY else cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(size)
    xb, yb, tw, th, xa, _ = ctx.text_extents(s)
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
    return xa


def text_width(ctx, s, size, face=FONT_HEAVY):
    ctx.save()
    ctx.select_font_face(face, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_NORMAL if face == FONT_HEAVY else cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(size)
    w = ctx.text_extents(s)[4]
    ctx.restore()
    return w


def crown(ctx, x, y, size, alpha):
    if size <= 0.5 or alpha <= 0:
        return
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
    for px, py in (pts[1], pts[3], pts[5]):
        ctx.arc(px, py, 5, 0, 2 * math.pi)
        ctx.fill()
    ctx.restore()


def rounded_rect(ctx, x0, y0, x1, y1, r):
    ctx.new_sub_path()
    ctx.arc(x1 - r, y0 + r, r, -math.pi / 2, 0)
    ctx.arc(x1 - r, y1 - r, r, 0, math.pi / 2)
    ctx.arc(x0 + r, y1 - r, r, math.pi / 2, math.pi)
    ctx.arc(x0 + r, y0 + r, r, math.pi, 3 * math.pi / 2)
    ctx.close_path()


def make_background(cx, cy, seed=3, stars=170):
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surf)
    g = cairo.RadialGradient(cx, cy, 50, cx, cy, 1350)
    g.add_color_stop_rgb(0, 0.10, 0.05, 0.19)
    g.add_color_stop_rgb(0.45, 0.05, 0.03, 0.11)
    g.add_color_stop_rgb(1, 0.01, 0.01, 0.03)
    ctx.set_source(g)
    ctx.paint()
    rng = np.random.default_rng(seed)
    for _ in range(stars):
        ctx.arc(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.8, 2.3), 0, 2 * math.pi)
        ctx.set_source_rgba(0.85, 0.8, 1.0, rng.uniform(0.06, 0.32))
        ctx.fill()
    return surf


class Bloom:
    """Draw glowing things into a 1/GS-resolution layer, then add it, blurred, onto the frame."""
    GS = 4

    def __init__(self, gain=1.45):
        self.gw, self.gh = W // self.GS, H // self.GS
        self.surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.gw, self.gh)
        self.ctx = cairo.Context(self.surf)
        self.lut = [min(255, int(i * gain)) for i in range(256)] * 4

    def begin(self):
        g = self.ctx
        g.set_operator(cairo.OPERATOR_SOURCE)
        g.set_source_rgba(0, 0, 0, 0)
        g.paint()
        g.set_operator(cairo.OPERATOR_OVER)
        g.save()
        g.scale(1 / self.GS, 1 / self.GS)
        return g

    def apply(self, ctx):
        self.ctx.restore()
        self.surf.flush()
        img = Image.frombuffer("RGBA", (self.gw, self.gh), bytes(self.surf.get_data()), "raw", "RGBA", 0, 1)
        img = ImageChops.add(img.filter(ImageFilter.GaussianBlur(2)),
                             img.filter(ImageFilter.GaussianBlur(7))).point(self.lut)
        buf = bytearray(img.tobytes())
        src = cairo.ImageSurface.create_for_data(buf, cairo.FORMAT_RGB24, self.gw, self.gh, self.gw * 4)
        ctx.save()
        ctx.scale(self.GS, self.GS)
        ctx.set_source_surface(src, 0, 0)
        ctx.get_source().set_filter(cairo.FILTER_BILINEAR)
        ctx.set_operator(cairo.OPERATOR_ADD)
        ctx.paint()
        ctx.restore()
        ctx.set_operator(cairo.OPERATOR_OVER)


class TimeMap:
    """Video time <-> sim time, running at `slow` speed around a dramatic moment T."""

    def __init__(self, T, tail, slow=0.28, before=(0.8, 0.5), after=(0.25, 0.7), ds=1e-3):
        s = np.arange(0.0, T + tail, ds)
        sp = np.ones_like(s)
        a0, a1, b0, b1 = T - before[0], T - before[1], T + after[0], T + after[1]
        m = (s >= a0) & (s < a1)
        sp[m] = 1 + (slow - 1) * sstep((s[m] - a0) / (a1 - a0))
        sp[(s >= a1) & (s < b0)] = slow
        m = (s >= b0) & (s < b1)
        sp[m] = slow + (1 - slow) * sstep((s[m] - b0) / (b1 - b0))
        self.sg = s
        self.vg = np.concatenate([[0.0], np.cumsum(ds / sp[:-1])])
        self.duration = float(self.vg[-1])
        self.n_frames = int(self.duration * FPS)
        self.slow_start = T - before[0]

    def s_of_v(self, v):
        return float(np.interp(v, self.vg, self.sg))

    def v_of_s(self, s):
        return float(np.interp(s, self.sg, self.vg))


class Confetti:
    """Two confetti cannons firing from the bottom corners (analytic, so any frame renders alone)."""

    def __init__(self, colors, n=260, seed=7, y0=1560.0):
        rng = np.random.default_rng(seed)
        side = np.where(np.arange(n) % 2 == 0, -1.0, 1.0)
        tilt = rng.uniform(0.12, 0.75, n)
        spd = rng.uniform(3600, 6900, n)
        self.x0 = np.where(side < 0, -30.0, W + 30.0)
        self.y0 = np.full(n, y0)
        self.vx, self.vy = -side * spd * np.sin(tilt), -spd * np.cos(tilt)
        self.w, self.h = rng.uniform(14, 26, n), rng.uniform(8, 13, n)
        self.flip, self.spin = rng.uniform(5, 13, n), rng.uniform(-6, 6, n)
        self.ph, self.sway = rng.uniform(0, 6.28, n), rng.uniform(15, 45, n)
        self.col = [colors[i] for i in rng.integers(0, len(colors), n)]
        self.delay = rng.uniform(0, 0.12, n)

    def draw(self, ctx, t):
        tt = np.maximum(0.0, t - self.delay)
        kd, vt = 4.2, 230.0
        e = (1 - np.exp(-kd * tt)) / kd
        x = self.x0 + self.vx * e + self.sway * np.sin(3 * tt + self.ph) * np.minimum(1, tt)
        y = self.y0 + vt * tt + (self.vy - vt) * e
        rot = self.ph + self.spin * tt
        fl = np.abs(np.cos(self.flip * tt + self.ph)) * 0.85 + 0.15
        for i in range(len(x)):
            if tt[i] <= 0 or not (-40 < x[i] < W + 40 and -40 < y[i] < H + 40):
                continue
            ctx.save()
            ctx.translate(x[i], y[i])
            ctx.rotate(rot[i])
            ctx.scale(1.0, fl[i])
            ctx.rectangle(-self.w[i] / 2, -self.h[i] / 2, self.w[i], self.h[i])
            ctx.set_source_rgba(*self.col[i], 0.95)
            ctx.fill()
            ctx.restore()


# ------------------------------------------------------------------------------ audio
def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_t(dur):
    return np.arange(int(dur * SR)) / SR


def pluck(m, decay=0.2, dur=0.7):
    f = midi_hz(m)
    t = env_t(dur)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
           + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (decay * 0.45))
           + 0.22 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / (decay * 0.25)))
    return sig * np.minimum(1.0, t / 0.003) / 1.5


def bell(m, dur=1.6, decay=0.9):
    f = midi_hz(m)
    t = env_t(dur)
    sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay * d))
              for r, a, d in ((1, 1.0, 1.0), (2.0, 0.5, 0.6), (3.0, 0.22, 0.4), (4.07, 0.15, 0.25)))
    return sig * np.minimum(1.0, t / 0.002) / 1.5


def saw(m, dur, decay, harmonics=6, attack=0.005):
    f = midi_hz(m)
    t = env_t(dur)
    sig = sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, harmonics + 1))
    return sig * np.exp(-t / decay) * np.minimum(1.0, t / attack)


def thump(f0=140, f1=48, dur=0.25, decay=0.09):
    t = env_t(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    return np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t / decay)


def sweep(f0, f1, dur, decay):
    t = env_t(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t / decay) * np.minimum(1.0, t / 0.003)


def noise_burst(rng, dur, decay, hp=True):
    t = env_t(dur)
    n = rng.standard_normal(len(t))
    if hp:
        n = np.diff(n, prepend=0.0) * 0.6
    return n * np.exp(-t / decay)


def lowpass(x, width):
    return np.convolve(x, np.ones(width) / width, mode="same")


class Mixer:
    def __init__(self, duration):
        self.n = int((duration + 1.5) * SR)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def add(self, sig, v, gain=1.0, pan=0.0):
        i = int(v * SR)
        if i < 0 or i >= self.n:
            return
        seg = sig[: self.n - i] * gain
        th = (float(np.clip(pan, -1, 1)) + 1) * np.pi / 4
        self.L[i:i + len(seg)] += seg * math.cos(th)
        self.R[i:i + len(seg)] += seg * math.sin(th)

    def write(self, path, drive=1.6):
        st = np.stack([self.L, self.R], axis=1)
        st = np.tanh(st / np.max(np.abs(st)) * drive)
        st = st / np.max(np.abs(st)) * 0.93
        fade = int(0.05 * SR)
        st[-fade:] *= np.linspace(1, 0, fade)[:, None]
        raw = path + ".raw.wav"
        with wave.open(raw, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes((st * 32767).astype("<i2").tobytes())
        loudnorm(raw, path)
        os.remove(raw)


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


# ----------------------------------------------------------------------------- encode
def encode(out, n_frames, frame_fn, wav):
    """Pipe BGRA frames from frame_fn(i) -> cairo surface into H.264 + AAC."""
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
           "-shortest", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for i in range(n_frames):
        proc.stdin.write(frame_fn(i).get_data())
        if i % 300 == 0:
            print(f"  frame {i}/{n_frames}  {time.time() - t0:.0f}s", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
