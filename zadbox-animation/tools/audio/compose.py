#!/usr/bin/env python3
"""
Original soundtrack + UI sound design for the Zadbox animation.

Everything is synthesised from scratch (no samples, no licensed audio):
  - music: warm pad, marimba arpeggio, soft bass and light drums in F major,
    115.66 BPM, so bar lines land on the chapter changes (1.0 s, 9.3 s, 17.6 s)
  - sound effects: taps, fly-to-cart whoosh (panned with the motion), cart
    "pop", sheet, tab switch, counter ticks, swap, star sparkle, WhatsApp chime
    -- each placed on the exact cue time exported from the animation timeline.

Usage: python3 compose.py cues.json out.wav
"""
import json
import sys
import wave

import numpy as np

SR = 48000
RNG = np.random.default_rng(20261101)

BEAT = 2.075 / 4            # 115.66 BPM; 8 bars from 1.0 s end exactly at 17.6 s
BAR = BEAT * 4
DOWNBEAT = 1.0              # first bar line = end of the intro


def ns(sec):
    return int(round(sec * SR))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(sec):
    return np.arange(ns(sec)) / SR


# --------------------------------------------------------------------------
# DSP helpers (numpy only)
# --------------------------------------------------------------------------
def fftconvolve(a, b):
    n = len(a) + len(b) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, size) * np.fft.rfft(b, size), size)[:n]


def band(sig, lo, hi, soft=0.25):
    """Zero-phase band-pass with soft (log-frequency) edges."""
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    lf = np.log2(np.maximum(f, 1.0))
    mask = 1 / (1 + np.exp(-(lf - np.log2(lo)) / soft * 4)) * 1 / (1 + np.exp((lf - np.log2(hi)) / soft * 4))
    return np.fft.irfft(spec * mask, len(sig))


def unit(x):
    r = np.sqrt(np.mean(x ** 2))
    return x / r if r > 0 else x


def noise(sec):
    return RNG.standard_normal(ns(sec))


def sweep(dur, f0, f1, width=0.55, shape="hump"):
    """Filtered-noise whoosh whose band centre glides from f0 to f1."""
    L = ns(dur)
    W, H = 1024, 256
    src = RNG.standard_normal(L + W)
    out = np.zeros(L + W)
    win = np.hanning(W)
    freqs = np.fft.rfftfreq(W, 1 / SR)
    lf = np.log2(np.maximum(freqs, 1.0))
    for i in range(0, L, H):
        p = min(1.0, i / max(1, L - 1))
        fc = f0 * (f1 / f0) ** p
        mask = np.exp(-0.5 * ((lf - np.log2(fc)) / width) ** 2)
        out[i:i + W] += np.fft.irfft(np.fft.rfft(src[i:i + W] * win) * mask, W) * win
    out = unit(out[:L])
    x = np.linspace(0, 1, L)
    if shape == "hump":
        env = np.sin(np.pi * x) ** 1.6
    elif shape == "rise":
        env = x ** 2.2 * (1 - np.exp(-(1 - x) * 40))
    else:  # "fall"
        env = (1 - x) ** 1.8 * (1 - np.exp(-x * 60))
    return out * env


def pan_stereo(mono, pan):
    """Equal-power pan; pan may be a scalar or a per-sample array in [-1, 1]."""
    th = (np.asarray(pan) + 1) * np.pi / 4
    return np.vstack([mono * np.cos(th), mono * np.sin(th)]) * np.sqrt(2)


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------
def pad_note(m, dur, vel=1.0):
    f = mtof(m)
    L = ns(dur + 1.8)
    t = np.arange(L) / SR
    out = np.zeros((2, L))
    for ch, detunes in enumerate(((-7, 2), (-2, 7))):
        for c in detunes:
            fc = f * 2 ** (c / 1200)
            ph = RNG.uniform(0, 2 * np.pi)
            for k in range(1, 9):
                if fc * k > 7000:
                    break
                out[ch] += (1 / k) * np.exp(-(k - 1) / 2.0) * np.sin(2 * np.pi * fc * k * t + ph * k)
    att = np.sin(np.minimum(1, t / 0.6) * np.pi / 2) ** 2
    rel = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.32))
    lfo = 1 + 0.05 * np.sin(2 * np.pi * 0.21 * t + RNG.uniform(0, 6))
    return out * att * rel * lfo * vel * 0.085


def marimba(m, vel=1.0):
    f = mtof(m)
    t = tvec(1.3)
    parts = ((1.0, 1.0, 0.50), (3.93, 0.26, 0.11), (9.2, 0.05, 0.035))
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts if f * r < 15000)
    return s * np.minimum(1, t / 0.0015) * vel * 0.20


def bell(m, vel=1.0, decay=1.0):
    f = mtof(m)
    t = tvec(2.4 * decay)
    parts = ((1.0, 1.0, 1.0), (2.0, 0.42, 0.62), (2.76, 0.26, 0.40), (5.40, 0.13, 0.20), (8.93, 0.06, 0.11))
    s = sum(a * np.sin(2 * np.pi * f * r * t + RNG.uniform(0, 6)) * np.exp(-t / (d * decay))
            for r, a, d in parts if f * r < 16000)
    return s * np.minimum(1, t / 0.002) * vel * 0.16


def bass_note(m, dur, vel=1.0):
    f = mtof(m)
    t = tvec(dur + 0.15)
    s = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.07 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.008) * (0.72 + 0.28 * np.exp(-t / 0.22))
    env *= np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.035))
    return s * env * vel * 0.30


def kick(vel=1.0):
    t = tvec(0.45)
    f = 47 + 78 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.20)
    click = unit(band(noise(0.45), 1500, 6000)) * np.exp(-t / 0.0018) * 0.10
    return (body + click) * vel * 0.50


def snap(vel=1.0):
    t = tvec(0.25)
    nz = unit(band(noise(0.25), 1100, 5200))
    env = sum(np.where(t >= o, np.exp(-(t - o) / 0.0045), 0) for o in (0, 0.008, 0.016)) * 0.55
    env += 0.45 * np.exp(-t / 0.065)
    return nz * env * vel * 0.085


def hat(vel=1.0, open_=False):
    dur = 0.32 if open_ else 0.08
    t = tvec(dur)
    nz = unit(band(noise(dur), 7000, 15000))
    return nz * np.exp(-t / (0.085 if open_ else 0.020)) * vel * 0.032


# --------------------------------------------------------------------------
# Sound effects
# --------------------------------------------------------------------------
def sfx_tap():
    t = tvec(0.09)
    s = 0.55 * np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.005)
    s += 0.55 * np.sin(2 * np.pi * 230 * t) * np.exp(-t / 0.016)
    s += 0.18 * unit(band(noise(0.09), 2500, 9000)) * np.exp(-t / 0.0025)
    return s * 0.30


def sfx_pop(n):
    # soft "bloop" + two-note ding; the second item rings a step higher
    t = tvec(0.12)
    f = 320 + 520 * (1 - np.exp(-t / 0.03))
    bloop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * 0.22
    notes = (84, 89) if n == 1 else (86, 91)          # C6→F6, then D6→G6
    out = np.zeros(ns(1.6))
    out[:len(bloop)] += bloop
    for i, m in enumerate(notes):
        b = bell(m, 0.85 - 0.15 * i, decay=0.55)
        o = ns(0.012 + 0.075 * i)
        out[o:o + len(b)] += b[:len(out) - o]
    return out


def sfx_counter(dur):
    # ~16 ticks following the counter's power2.out easing, pitch rising
    out = np.zeros(ns(dur + 0.1))
    steps = 16
    for k in range(steps):
        p = k / steps
        at = (1 - np.sqrt(1 - p)) * dur
        t = tvec(0.03)
        f = 2600 + 900 * p
        tick = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004) * (0.11 - 0.05 * p)
        o = ns(at)
        out[o:o + len(tick)] += tick
    return out


# --------------------------------------------------------------------------
# Composition
# --------------------------------------------------------------------------
# chord: (bass midi, pad voicing, arpeggio tones)
CH = {
    "F":   (41, [57, 60, 64, 67], [69, 72, 76, 79]),   # Fmaj9
    "Dm":  (38, [53, 57, 60, 64], [65, 69, 72, 76]),   # Dm9
    "Bb":  (34, [57, 60, 62, 65], [70, 74, 77, 81]),   # Bbmaj9
    "C":   (36, [55, 62, 64, 69], [67, 72, 74, 76]),   # C6/9
    "Am":  (33, [55, 60, 64, 69], [69, 72, 76, 79]),   # Am7
    "Cs":  (36, [55, 60, 65, 67], [67, 72, 77, 79]),   # Csus4
}
# bars from the downbeat: chapter 1 (0-3), chapter 2 (4-7), chapter 3 (8-10)
BARS = ["F", "Dm", "Bb", "C",  "F", "Am", "Bb", "Cs",  "Dm", "Bb", "F"]
MELODY = {  # bar -> [(beat, midi, vel)]  (bell, chapters 2-3)
    4: [(0, 84, .5), (1.5, 81, .4), (2.5, 79, .35)],
    5: [(0, 88, .5), (1.5, 84, .4), (3.0, 81, .35)],
    6: [(0, 86, .5), (1.5, 81, .4), (2.5, 84, .35)],
    7: [(0, 84, .45), (1.0, 86, .4), (2.0, 88, .45), (3.0, 89, .4)],
    8: [(0, 88, .45), (2.0, 84, .35)],
    9: [(0, 86, .45), (1.5, 84, .35), (3.0, 81, .3)],
    10: [(0, 84, .45)],
}
ARP = [0, 2, 1, 3, 2, 1, 3, 2]
ARP_VEL = [1.0, .55, .75, .6, .9, .55, .8, .65]


class Mix:
    def __init__(self, dur):
        self.dur = dur
        self.N = ns(dur + 4)
        self.bus = {k: np.zeros((2, self.N)) for k in ("pad", "keys", "bass", "drums", "sfx")}
        self.send = np.zeros((2, self.N))

    def add(self, bus, t, sig, pan=0.0, gain=1.0, rev=0.0):
        if sig.ndim == 1:
            sig = pan_stereo(sig, pan)
        i = ns(t)
        if i < 0:
            sig, i = sig[:, -i:], 0
        j = min(self.N, i + sig.shape[1])
        if j <= i:
            return
        self.bus[bus][:, i:j] += sig[:, :j - i] * gain
        if rev:
            self.send[:, i:j] += sig[:, :j - i] * gain * rev


def human(sec=0.004):
    return RNG.uniform(-sec, sec)


def compose_music(mx, end):
    kicks = []
    # intro (0 → 1.0): pad swell on F, riser, single bell on the headline
    bass_m, voicing, _ = CH["F"]
    for m in voicing:
        mx.add("pad", 0.0, pad_note(m, DOWNBEAT + BAR - 0.05, 0.75), rev=0.35)
    mx.add("sfx", 0.0, sweep(1.0, 300, 4200, 0.7, "rise"), gain=0.028, rev=0.3)
    mx.add("keys", 0.14, bell(84, 0.35), pan=0.15, rev=0.5)

    for b, name in enumerate(BARS):
        t0 = DOWNBEAT + b * BAR
        if t0 >= end:
            break
        bass_m, voicing, arp = CH[name]
        last = b == len(BARS) - 1
        if b > 0:  # bar 0's pad started in the intro
            hold = (BAR * 2.2) if last else (BAR - 0.05)
            for m in voicing:
                mx.add("pad", t0, pad_note(m, hold, 0.8), rev=0.35)

        # bass: 1, &2, &3 (approach), 4  — the last bar just holds the root
        pattern = [(0, 0, 3.5)] if last else [(0, 0, 0.9), (1.5, 0, 0.4), (2.5, 7, 0.4), (3.0, 0, 0.85)]
        for beat, iv, length in pattern:
            mx.add("bass", t0 + beat * BEAT, bass_note(bass_m + iv, length * BEAT, 0.9 if beat == 0 else 0.7))

        # marimba arpeggio in 8ths (from bar 1; softer in bar 0)
        if not last:
            level = 0.55 if b == 0 else (0.85 if b < 4 else 1.0)
            for k in range(8):
                if b == 0 and k < 4:
                    continue
                m = arp[ARP[k]]
                pan = -0.35 + 0.7 * (k / 7)
                mx.add("keys", t0 + k * BEAT / 2 + human(), marimba(m, ARP_VEL[k] * level * RNG.uniform(.92, 1.05)),
                       pan=pan, rev=0.22)
        else:
            for k, m in enumerate(arp):
                mx.add("keys", t0 + k * 0.11, marimba(m, 0.7 - 0.1 * k), pan=-0.3 + 0.2 * k, rev=0.45)

        # bell melody (chapters 2-3)
        for beat, m, v in MELODY.get(b, []):
            mx.add("keys", t0 + beat * BEAT + human(0.003), bell(m, v), pan=0.2, rev=0.45)

        # drums
        if last:
            kicks.append(t0)
            mx.add("drums", t0, kick(0.9))
            mx.add("drums", t0, hat(0.6, open_=True), pan=0.2)
            continue
        kick_beats = [0] if b == 0 else ([0, 2, 2.75] if b in (3, 7) else [0, 2])
        for kb in kick_beats:
            kicks.append(t0 + kb * BEAT)
            mx.add("drums", t0 + kb * BEAT, kick(1.0 if kb == 0 else 0.8))
        if b > 0:
            for sb in (1, 3):
                mx.add("drums", t0 + sb * BEAT + human(0.003), snap(RNG.uniform(.85, 1)), pan=-0.08, rev=0.18)
        sub = 4 if b >= 4 else 2
        for k in range(4 * sub):
            if b == 0 and k < 2 * sub:
                continue
            on = k % sub == sub // 2
            v = (1.0 if on else 0.55) * RNG.uniform(.85, 1.05)
            mx.add("drums", t0 + k * BEAT / sub + human(0.003), hat(v), pan=0.3)
        if b >= 4:
            mx.add("drums", t0 + 3.5 * BEAT, hat(0.6, open_=True), pan=0.3)
        if b in (3, 7, 9):  # small snap fill into the next section
            for k, frac in enumerate((3.25, 3.5, 3.75)):
                mx.add("drums", t0 + frac * BEAT, snap(0.45 + 0.15 * k), pan=0.1)
    return kicks


def compose_sfx(mx, cues):
    for c in cues:
        t, kind = c["video"], c["type"]
        if kind == "tap":
            mx.add("sfx", t, sfx_tap(), pan=0.1, rev=0.05)
        elif kind == "fly":
            s = sweep(c["d"], 700, 2600, 0.5, "hump")
            w = c.get("w", 360)
            p0, p1 = (c["x0"] / w * 2 - 1) * 0.7, (c["x1"] / w * 2 - 1) * 0.7
            mx.add("sfx", t, pan_stereo(s, np.linspace(p0, p1, len(s))), gain=0.075, rev=0.12)
        elif kind == "pop":
            mx.add("sfx", t, sfx_pop(c["n"]), pan=0.45, rev=0.25)
        elif kind == "scroll":
            big = c.get("big")
            mx.add("sfx", t, sweep(c["d"], 260, 1100 if big else 800, 0.6, "hump"), gain=0.032 if big else 0.02, rev=0.1)
        elif kind == "sheet":
            mx.add("sfx", t, sweep(0.5, 300, 1700, 0.55, "hump"), gain=0.05, rev=0.15)
            for i, m in enumerate((77, 81, 84)):
                mx.add("sfx", t + 0.32 + i * 0.07, bell(m, 0.55, decay=0.8), pan=-0.1 + 0.15 * i, rev=0.35)
        elif kind == "switch":
            mx.add("sfx", t, sweep(0.45, 600, 1900, 0.5, "hump"), gain=0.045, rev=0.12)
            mx.add("sfx", t + 0.2, bell(81, 0.35, decay=0.6), pan=0.35, rev=0.3)
        elif kind == "count":
            mx.add("sfx", t, sfx_counter(c["d"]), pan=0.15)
        elif kind == "select":
            mx.add("sfx", t, bell(88, 0.45, decay=0.5), pan=0.1, rev=0.3)
        elif kind == "swap":
            mx.add("sfx", t, sweep(0.35, 900, 3200, 0.45, "hump"), gain=0.05, rev=0.12)
            mx.add("sfx", t + 0.2, bell(84, 0.55, decay=0.6), rev=0.3)
            mx.add("sfx", t + 0.27, bell(89, 0.4, decay=0.6), rev=0.3)
        elif kind == "star":
            m = (77, 79, 81, 84, 86)[c["i"]]
            mx.add("sfx", t, bell(m + 12, 0.42, decay=0.7), pan=-0.4 + 0.2 * c["i"], rev=0.45)
        elif kind == "slide":
            mx.add("sfx", t, sweep(c["d"] * 0.7, 500, 1500, 0.55, "hump"), gain=0.03, rev=0.1)
        elif kind == "ring":
            mx.add("sfx", t, bell(84, 0.6, decay=0.7), pan=0.05, rev=0.35)
            mx.add("sfx", t + 0.11, bell(88, 0.5, decay=0.7), pan=0.05, rev=0.35)
        elif kind == "outro":
            mx.add("sfx", t, sweep(0.7, 2200, 380, 0.6, "fall"), gain=0.035, rev=0.2)


def reverb_ir(rt=1.7, length=2.6):
    L = ns(length)
    t = np.arange(L) / SR
    ir = np.zeros((2, L))
    for ch in range(2):
        nz = RNG.standard_normal(L)
        acc = np.zeros(L)
        for lo, hi, r in ((30, 450, rt * 1.1), (450, 2500, rt), (2500, 7000, rt * 0.55), (7000, 20000, rt * 0.28)):
            acc += band(nz, lo, hi) * np.exp(-6.9 * t / r)
        acc *= np.minimum(1, t / 0.006)
        ir[ch] = np.concatenate([np.zeros(ns(0.022)), acc])[:L]
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def render(cues, dur, stem=None):
    mx = Mix(dur)
    kicks = compose_music(mx, dur)
    compose_sfx(mx, cues)

    # gentle sidechain: pad + bass breathe with the kick
    imp = np.zeros(mx.N)
    for k in kicks:
        imp[ns(k)] = 1
    kern = np.exp(-np.arange(ns(0.6)) / (0.13 * SR))
    duck = 1 - np.clip(fftconvolve(imp, kern)[:mx.N], 0, 1) * 0.28

    music = mx.bus["pad"] * duck + mx.bus["bass"] * (0.6 + 0.4 * duck) + mx.bus["keys"] * 0.9 + mx.bus["drums"]
    send = mx.send + mx.bus["pad"] * 0.15
    ir = reverb_ir()
    wet = np.vstack([fftconvolve(send[0], ir[0])[:mx.N], fftconvolve(send[1], ir[1])[:mx.N]]) * 0.32

    out = music * 0.9 + mx.bus["sfx"] + wet
    if stem == "sfx":          # verification stem: dry effects only
        out = mx.bus["sfx"].copy()
    # clean up: high-pass 28 Hz, remove DC
    out = np.vstack([band(ch, 28, 19000, soft=0.15) for ch in out])

    L = ns(dur)
    out = out[:, :L]
    # tail: fade the last 0.6 s so the video ends cleanly
    fade = np.ones(L)
    fl = ns(0.6)
    fade[-fl:] = np.cos(np.linspace(0, np.pi / 2, fl)) ** 2
    out *= fade
    # short fade-in to avoid a click at t=0
    out[:, :ns(0.01)] *= np.linspace(0, 1, ns(0.01))
    peak = np.max(np.abs(out))
    return out / peak * 10 ** (-3 / 20)          # -3 dBFS peak; loudness set later by ffmpeg


def write_wav24(path, stereo):
    data = np.clip(stereo.T, -1, 1)
    ints = np.round(data * (2 ** 23 - 1)).astype("<i4").reshape(-1)
    b = ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b)


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    stem = sys.argv[3] if len(sys.argv) > 3 else None
    info = json.load(open(src))
    audio = render(info["cues"], info["duration"], stem)
    write_wav24(dst, audio)
    print(f"wrote {dst}: {audio.shape[1] / SR:.2f}s, {len(info['cues'])} cues")
