#!/usr/bin/env python3
"""Soundtrack for the armor short, synthesized from scratch (numpy + scipy).

    python3 scripts/audio.py build/timeline.json build/soundtrack.wav

Every hit, whoosh, counter tick and "cha-ching" is placed from the same
timeline the renderer uses, so sound and picture stay locked together. No
samples or third-party music are used, so the result is royalty-free.
"""
import json
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
TAU = 2 * np.pi
rng = np.random.default_rng(11)


# ------------------------------------------------------------------ helpers
def n_(dur):
    return max(8, int(round(dur * SR)))


def tt(dur):
    return np.arange(n_(dur)) / SR


def noise(dur):
    return rng.standard_normal(n_(dur))


def _f(x, kind, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, kind, fs=SR, output="sos"), x)


def lp(x, fc, order=2):
    return _f(x, "lowpass", fc, order)


def hp(x, fc, order=2):
    return _f(x, "highpass", fc, order)


def bp(x, lo, hi, order=2):
    return _f(x, "bandpass", [lo, hi], order)


def drive(x, g):
    return np.tanh(x * g) / np.tanh(g)


def fade(x, a=0.002, r=0.012):
    x = x.copy()
    na, nr = min(len(x), n_(a)), min(len(x), n_(r))
    x[:na] *= np.linspace(0, 1, na)
    x[-nr:] *= np.linspace(1, 0, nr)
    return x


def phase(freq):
    return TAU * np.cumsum(freq) / SR


def saw(ph):
    return 2 * ((ph / TAU) % 1.0) - 1


class Bus:
    def __init__(self, dur):
        self.buf = np.zeros((n_(dur) + SR * 4, 2))

    def add(self, sig, t, gain=1.0, pan=0.0):
        if t < 0:
            sig = sig[int(-t * SR):]
            t = 0
        i = int(round(t * SR))
        n = min(len(sig), len(self.buf) - i)
        if n <= 0:
            return
        sig = sig[:n] * gain
        p = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        if np.ndim(p):
            p = p[:n]
        self.buf[i:i + n, 0] += sig * np.cos(p) * 1.414
        self.buf[i:i + n, 1] += sig * np.sin(p) * 1.414


# -------------------------------------------------------------------- drums
def kick(punch=1.0):
    t = tt(0.45)
    s = np.sin(phase(44 + 125 * np.exp(-t / 0.03))) * np.exp(-t / 0.17)
    s += 0.3 * hp(noise(0.45), 3000) * np.exp(-t / 0.004)
    return fade(drive(s * 1.4 * punch, 1.6))


def snare():
    t = tt(0.32)
    s = 0.5 * np.sin(phase(185 + 70 * np.exp(-t / 0.02))) * np.exp(-t / 0.07)
    s += 0.85 * bp(noise(0.32), 1500, 9000) * np.exp(-t / 0.085)
    c = np.zeros_like(t)
    for d in (0.0, 0.011, 0.024):
        i = int(d * SR)
        c[i:] += bp(noise(0.32), 900, 5000)[: len(t) - i] * np.exp(-t[: len(t) - i] / 0.02)
    return fade(drive(s + 0.45 * c, 1.5))


def hat(open_=False, pitch=1.0):
    d = 0.13 if open_ else 0.026
    t = tt(d * 4)
    return fade(hp(noise(d * 4), min(7000 * pitch, 15000)) * np.exp(-t / d))


def tom(freq=95.0):
    t = tt(0.4)
    s = np.sin(phase(freq * (1 + 0.6 * np.exp(-t / 0.03)))) * np.exp(-t / 0.15)
    s += 0.25 * bp(noise(0.4), 300, 2500) * np.exp(-t / 0.012)
    return fade(drive(s * 1.3, 1.5))


def bass808(freq, dur):
    t = tt(dur + 0.1)
    s = np.sin(phase(freq * (1 + 0.6 * np.exp(-t / 0.018))))
    env = np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.55))
    return fade(lp(drive(s * env * 1.7, 4.0), 1500), r=0.05)


def pluck(freq, dur=0.22, bright=2600):
    t = tt(dur)
    s = sum(saw(TAU * freq * d * t + rng.random() * TAU) for d in (0.995, 1.0, 1.006)) / 3
    return fade(lp(s, bright) * np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.32)))


def braam(freq, dur=1.6, bright=1050):
    t = tt(dur)
    s = np.zeros_like(t)
    for mult, amp in ((1, 1.0), (2, 0.7), (1.5, 0.5), (3, 0.3), (0.5, 0.9)):
        for det in (0.992, 1.0, 1.008):
            s += amp * saw(TAU * freq * mult * det * t + rng.random() * TAU)
    s /= 6
    k = np.exp(-t / 0.4)
    s = lp(s, bright * 2.4) * k + lp(s, bright * 0.55) * (1 - k)
    env = np.minimum(1, t / 0.02) * np.exp(-t / (dur * 0.42))
    return fade(drive(s * env * 2.4, 2.0), r=0.08)


def pad(freqs, dur, bright=1900):
    t = tt(dur)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (0.994, 1.0, 1.007):
            s += saw(TAU * f * det * t + rng.random() * TAU)
    s = lp(s / (3 * len(freqs)), bright)
    trem = 0.8 + 0.2 * np.sin(TAU * 5.5 * t)
    return fade(s * trem, a=0.03, r=0.12)


def riser(dur):
    t = tt(dur)
    k = t / dur
    f = 170 * np.power(9.5, k)
    tone = 0.35 * np.sin(phase(f)) + 0.22 * np.sin(phase(f * 1.5))
    nz = noise(dur)
    nzf = hp(nz, 900) * k ** 2 * 0.55 + bp(nz, 300, 2600) * (k * (1 - k)) * 1.1
    trem = 0.72 + 0.28 * np.sin(phase(6 + 28 * k))
    return fade((tone * k ** 1.5 * trem + nzf) * 0.9, r=0.004)


# ---------------------------------------------------------------------- sfx
def whoosh(dur, peak=0.7):
    nz = noise(dur)
    k = tt(dur) / dur
    c = 3.2 * np.clip(1 - np.abs(k - peak) / max(peak, 1 - peak), 0, 1) ** 1.4
    env = np.exp(-(((k - peak) / 0.27) ** 2))
    out = np.zeros_like(k)
    for j, (lo, hi) in enumerate(((150, 500), (500, 1400), (1400, 3600), (3600, 9500))):
        out += bp(nz, lo, hi) * np.exp(-((j - c) ** 2) / 0.7)
    return fade(out * env, a=0.02, r=0.03)


def impact(size=1.0, metal=1.0):
    t = tt(0.95)
    sub = np.sin(phase(36 + 85 * np.exp(-t / 0.045))) * np.exp(-t / 0.33)
    thump = lp(noise(0.95), 300) * np.exp(-t / 0.13) * 2.2
    crack = hp(noise(0.95), 2500) * np.exp(-t / 0.018) * 0.5
    clank = np.zeros_like(t)
    for f, a, d in ((497, 0.5, 0.13), (823, 0.4, 0.1), (1361, 0.35, 0.075), (2143, 0.25, 0.05), (3319, 0.2, 0.04)):
        clank += a * np.sin(TAU * f * metal * t + rng.random() * TAU) * np.exp(-t / d)
    return fade(drive((sub * 0.95 + thump + crack + clank * 0.95) * size, 1.8), r=0.06)


def scan(dur):
    t = tt(dur)
    k = t / dur
    f = 300 * np.power(3.4, k)
    s = 0.3 * saw(phase(f)) + 0.3 * np.sin(phase(f * 2)) + 0.15 * np.sin(phase(f * 3.01))
    trem = 0.55 + 0.45 * signal.square(TAU * 30 * t)
    return fade(bp(s * trem, 250, 5000) * (0.5 + 0.5 * k), a=0.01, r=0.01)


def lock_beep():
    out = np.zeros(n_(0.2))
    for i, f in enumerate((1318.5, 1760.0)):
        t = tt(0.075)
        b = fade(np.sin(TAU * f * t) + 0.3 * np.sin(TAU * f * 2 * t), a=0.002, r=0.02)
        j = int(i * 0.075 * SR)
        out[j:j + len(b)] += b
    return out * 0.6


def ticks(dur, interval):
    out = np.zeros(n_(dur))
    n = max(1, int(dur / interval))
    for i in range(n):
        k = i / max(1, n - 1)
        t = tt(0.045)
        f = 720 * 3.0 ** k
        b = np.sin(TAU * f * t) * np.exp(-t / 0.011) + 0.4 * hp(noise(0.045), 4000) * np.exp(-t / 0.003)
        j = int(i * interval * SR)
        m = min(len(b), len(out) - j)
        out[j:j + m] += b[:m] * (0.45 + 0.55 * k)
    return out


def chaching(pitch=1.0):
    out = np.zeros(n_(1.3))
    t = tt(0.04)
    out[: len(t)] += bp(noise(0.04), 500, 1800) * np.exp(-t / 0.008) * 1.2  # drawer clunk
    for i, (delay, mul) in enumerate(((0.0, 1.0), (0.09, 1.335))):
        t = tt(1.1)
        b = np.zeros_like(t)
        for f, a, d in ((2637, 1.0, 0.5), (3951, 0.55, 0.36), (5274, 0.4, 0.25), (6593, 0.22, 0.16)):
            b += a * np.sin(TAU * f * mul * pitch * t + rng.random() * TAU) * np.exp(-t / d)
        j = int(delay * SR)
        m = min(len(b), len(out) - j)
        out[j:j + m] += fade(b, a=0.001)[:m] * (0.8 if i == 0 else 1.0)
    for _ in range(9):  # coin shimmer
        j = int(rng.uniform(0.05, 0.45) * SR)
        t = tt(0.12)
        out[j:j + len(t)] += 0.2 * np.sin(TAU * rng.uniform(4200, 8200) * t) * np.exp(-t / 0.03)
    return fade(out * 0.33, r=0.1)


def explosion(size=1.0):
    d = 1.5 + size * 0.9
    t = tt(d)
    nz = noise(d)
    rumble = lp(nz, 85, 4) * np.exp(-t / (0.55 * size + 0.3)) * 4.2
    boom = lp(nz, 800) * np.exp(-t / 0.3) * 2.6
    crack = bp(nz, 900, 5000) * np.exp(-t / 0.085) * 0.7
    s = (rumble + boom + crack) * np.minimum(1, t / 0.004)
    return fade(drive(s * 0.5 * size, 2.0), r=0.25)


def gun_burst(n, interval):
    out = np.zeros(n_(n * interval + 0.5))
    for i in range(n):
        t = tt(0.14)
        b = bp(noise(0.14), 420, 3400) * np.exp(-t / 0.02) + 0.6 * lp(noise(0.14), 200) * np.exp(-t / 0.03)
        j = int((i * interval + rng.uniform(-0.004, 0.004)) * SR)
        j = max(j, 0)
        out[j:j + len(b)] += b * rng.uniform(0.75, 1.0)
    out = lp(out, 3200)
    echo = int(0.11 * SR)
    out[echo:] += 0.32 * out[:-echo]
    return fade(out, r=0.1)


def jet(dur=2.1):
    t = tt(dur)
    k = t / dur
    nz = noise(dur)
    env = np.exp(-(((k - 0.42) / 0.2) ** 2))
    hi = bp(nz, 1500, 6000) * np.clip(1 - k * 1.3, 0, 1) + bp(nz, 500, 1800) * np.clip(k * 1.4, 0, 1)
    whine = 0.12 * np.sin(phase(2300 * (1.25 - 0.5 * k)))
    roar = lp(nz, 260) * 2.5
    return fade((hi + whine + roar) * env, a=0.05, r=0.1)


def ambience(dur):
    brown = np.cumsum(noise(dur))
    brown = lp(hp(brown, 25), 140)
    brown /= np.max(np.abs(brown)) + 1e-9
    t = tt(dur)
    lfo = 0.6 + 0.4 * np.sin(TAU * 0.11 * t + 1.0) * np.sin(TAU * 0.07 * t)
    battle = bp(noise(dur), 180, 900) * lfo * 0.05
    crackle = np.where(rng.random(len(t)) > 0.9993, rng.standard_normal(len(t)), 0.0)
    crackle = hp(crackle, 2500) * 0.25
    return brown * 0.22 + battle + crackle


# --------------------------------------------------------------------- main
def build(tl):
    beat = tl["beat"]
    dur = tl["duration"]
    pieces = tl["pieces"]
    F = tl["finale"]
    music, sfx, amb = Bus(dur), Bus(dur), Bus(dur)

    D2, Bb1, C2, F2, D3 = 73.416, 58.27, 65.406, 87.307, 146.83
    semis = lambda f, s: f * 2 ** (s / 12)

    k_, sn_, hc_, ho_ = kick(), snare(), hat(False), hat(True)
    ost = [0, 0, 3, 0, 7, 0, 8, 7, 0, 0, 3, 0, 10, 8, 7, 5]

    def groove(b0, bars=2, level=1.0, fill=True):
        """Half-time trap groove starting at beat b0 (one bar = 4 beats)."""
        for bar in range(bars):
            b = b0 + bar * 4
            for kb in (0, 0.75, 2.5):
                music.add(k_, (b + kb) * beat, 0.95 * level)
            music.add(sn_, (b + 2) * beat, 0.8 * level)
            for h in range(8):
                music.add(hc_, (b + h * 0.5) * beat, (0.26 if h % 2 else 0.34) * level, pan=0.25)
            music.add(ho_, (b + 3.5) * beat, 0.2 * level, pan=0.3)
            notes = ((0, D2, 1.9), (2.5, D2, 1.1)) if bar % 2 == 0 else ((0, Bb1, 1.9), (2.5, C2, 1.2))
            for nb, f, ln in notes:
                music.add(bass808(f, ln * beat), (b + nb) * beat, 0.42 * level)
            chord = (D3, semis(D3, 7), semis(D3, 15)) if bar % 2 == 0 else (semis(D3, -4), semis(D3, 3), semis(D3, 12))
            music.add(pad(chord, 4 * beat), b * beat, 1.0 * level)
            for e in range(8):
                f = semis(D3, ost[(bar % 2) * 8 + e])
                music.add(pluck(f), (b + e * 0.5) * beat, (0.5 if e % 2 else 0.66) * level, pan=-0.3 if e % 2 else 0.3)
        if fill:  # hat roll into the next downbeat
            end = b0 + bars * 4
            for i in range(8):
                music.add(hat(False, 1 + i * 0.07), (end - 1 + i / 8) * beat, (0.14 + 0.03 * i) * level, pan=0.2)

    # --- cold open: three title hits, riser into the first piece
    for i, l in enumerate(tl["hook"]["lines"]):
        t = max(l["t"], 0.0)
        sfx.add(impact(0.85 + 0.2 * i, 0.8 + 0.25 * i), t, 0.8)
        music.add(braam(semis(D2, (0, 3, 7)[min(i, 2)]) / 2, 1.3 + 0.3 * i), t, 0.5 + 0.12 * i)
    t0 = pieces[0]["T"]
    music.add(riser(2 * beat), t0 - 2 * beat, 0.55)
    for i in range(8):
        music.add(tom(80 + i * 6), t0 - beat + i * beat / 8, 0.25 + 0.06 * i, pan=-0.4 + i * 0.1)

    # --- one 8-beat block per armour piece
    for p in pieces:
        T = p["T"]
        b0 = T / beat
        groove(b0)
        metal = 0.85 + 0.07 * p["index"]
        sfx.add(whoosh(tl["IN"] + 0.12, 0.72), p["enterStart"] - 0.05, 0.75, pan=np.linspace(-0.9, 0.0, n_(tl["IN"] + 0.12)))
        sfx.add(impact(1.0, metal), p["land"], 0.95)
        music.add(braam(D2 / 2, 1.5), p["land"], 0.55)
        sfx.add(scan(p["sweepEnd"] - p["sweepStart"]), p["sweepStart"], 0.44)
        sfx.add(lock_beep(), p["sweepEnd"] - 0.02, 0.5)
        cd = p["countEnd"] - p["countStart"]
        sfx.add(ticks(cd, beat / 8), p["countStart"], 0.62)
        music.add(riser(cd), p["countStart"], 0.45)
        for i in range(4):
            music.add(tom(90 + i * 9), p["slam"] - beat / 2 + i * beat / 8, 0.3 + 0.07 * i, pan=-0.3 + 0.2 * i)
        sfx.add(impact(1.15, metal * 1.2), p["slam"], 0.9)
        sfx.add(chaching(1.0 + 0.02 * p["index"]), p["slam"], 1.35)
        music.add(braam(semis(D2, 7) / 2, 1.3, 1400), p["slam"], 0.42)
        sfx.add(whoosh(tl["OUT"] + 0.15, 0.45), p["exitStart"] - 0.03, 0.55, pan=np.linspace(0.0, 0.9, n_(tl["OUT"] + 0.15)))

    # --- finale
    Tf = F["T"]
    bf = Tf / beat
    for k in range(4):
        music.add(k_, (bf + k) * beat, 0.95)
        for h in range(4):
            music.add(hc_, (bf + k + h / 4) * beat, 0.2, pan=0.25)
    for k, tland in enumerate(F["lands"]):
        sfx.add(whoosh(F["flyIn"] + 0.08, 0.75), tland - F["flyIn"], 0.4, pan=-0.6)
        sfx.add(impact(0.75, 0.8 + 0.13 * k), tland, 0.7, pan=-0.3 + 0.12 * k)
        music.add(tom(85 + 11 * k), tland, 0.5, pan=-0.3 + 0.12 * k)
    sfx.add(scan(F["sweepEnd"] - F["sweepStart"]), F["sweepStart"], 0.36)
    sfx.add(lock_beep(), F["sweepEnd"] - 0.02, 0.5)
    cd = F["countEnd"] - F["countStart"]
    sfx.add(ticks(cd, beat / 8), F["countStart"], 0.62)
    music.add(riser(cd), F["countStart"], 0.6)
    for i in range(16):  # accelerating snare/tom roll into the total
        music.add(tom(80 + i * 5), F["slam"] - beat * 2 + i * beat / 8, 0.16 + 0.03 * i, pan=-0.5 + i / 16)
    for i in range(8):
        music.add(sn_, F["slam"] - beat + i * beat / 8, 0.12 + 0.05 * i)
    sfx.add(impact(1.5, 1.0), F["slam"], 1.0)
    sfx.add(chaching(1.0), F["slam"], 1.35)
    sfx.add(chaching(1.26), F["slam"] + beat / 2, 0.8)
    sfx.add(chaching(1.5), F["slam"] + beat, 0.65)
    music.add(braam(D2 / 2, 2.6, 800), F["slam"], 0.7)
    music.add(braam(semis(D2, 7), 2.2, 900), F["slam"], 0.3)
    outro_beats = int(round((dur - F["slam"]) / beat))
    groove(F["slam"] / beat, bars=max(1, outro_beats // 4), fill=False)
    music.add(braam(D2 / 2, 1.2), F["slam"] + 4 * beat, 0.5)

    # --- the war itself
    for e in tl["explosions"]:
        dist = min(1.0, 60.0 / max(40.0, -e["z"]))
        sfx.add(explosion(e["size"]), e["t"] + 0.05, 0.3 * dist * min(e["size"], 1.6), pan=float(np.clip(e["x"] / 40.0, -0.9, 0.9)))
    for b in tl["tracers"]:
        amb.add(gun_burst(b["n"], b["interval"]), b["t"], 0.3, pan=-0.6 * b["dir"])
    for j in tl["jets"]:
        amb.add(jet(), j["t"] + 0.1, 0.5, pan=np.linspace(-0.9 * j["dir"], 0.9 * j["dir"], n_(2.1)))
    amb.add(ambience(dur + 1), 0, 0.5)

    # --- mix: duck the music under every impact, add a hall, soft-clip
    n = n_(dur)
    t = np.arange(len(music.buf)) / SR
    duck = np.ones(len(t))
    hits = [p["land"] for p in pieces] + [p["slam"] for p in pieces] + [F["slam"]]
    for th in hits:
        duck -= 0.38 * np.where(t >= th, np.exp(-(t - th) / 0.16), 0.0)
    music.buf *= np.clip(duck, 0.4, 1.0)[:, None]

    ir_t = tt(1.7)
    send = music.buf * 0.14 + sfx.buf * 0.3 + amb.buf * 0.1
    rev = np.zeros_like(send)
    for ch in range(2):
        ir = lp(noise(1.7), 5500) * np.exp(-ir_t / 0.36)
        ir[: n_(0.012)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        rev[:, ch] = signal.fftconvolve(send[:, ch], ir)[: len(send)]
    mix = music.buf * 0.27 + sfx.buf * 0.46 + amb.buf * 0.6 + rev * 0.16
    mix = hp(mix.T, 38).T[:n]
    mix = mix - 0.4 * lp(mix.T, 75).T  # tame the sub
    mix = mix + 0.15 * hp(mix.T, 1800).T  # presence lift: phone speakers have no low end
    mix = np.tanh(mix)
    mix[-n_(0.12):] *= np.linspace(1, 0, n_(0.12))[:, None]
    mix *= 0.89 / np.max(np.abs(mix))
    return mix


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "build/timeline.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "build/soundtrack.wav"
    with open(src) as fh:
        timeline = json.load(fh)
    audio = build(timeline)
    wavfile.write(dst, SR, (audio * 32767).astype(np.int16))
    rms = np.sqrt(np.mean(audio ** 2))
    print(f"soundtrack: {len(audio) / SR:.2f}s, peak {np.max(np.abs(audio)):.2f}, rms {20 * np.log10(rms):.1f} dBFS -> {dst}")
