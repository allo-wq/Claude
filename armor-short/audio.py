"""Sound design + music for the armor short, synthesized from out/timeline.json.

Every cue (whoosh, impact, scan, counter ticks, ka-ching, explosions...) comes
from the same edit list the renderer used, so audio is frame-locked to picture.
The music is a dark half-time trap/cinematic groove whose downbeats land on the
armor impacts.

    python3 audio.py out/timeline.json out/audio.wav
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ helpers
def n_of(sec):
    return int(round(sec * SR))


def tt(n):
    return np.arange(n) / SR


def noise(n):
    return rng.standard_normal(n)


def sos_filter(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, kind, fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sos_filter(x, "lowpass", f, order)


def hp(x, f, order=2):
    return sos_filter(x, "highpass", f, order)


def bp(x, lo, hi, order=2):
    return sos_filter(x, "bandpass", [lo, hi], order)


def osc(freq, n, shape="sin"):
    """Oscillator with (possibly time-varying) frequency."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = np.cumsum(f) / SR
    if shape == "sin":
        return np.sin(2 * np.pi * ph)
    if shape == "saw":
        return 2 * (ph % 1) - 1
    if shape == "sq":
        return np.sign(np.sin(2 * np.pi * ph))
    raise ValueError(shape)


def fade(x, a=0.003, r=0.02):
    x = x.copy()
    na, nr = min(n_of(a), len(x)), min(n_of(r), len(x))
    if na:
        x[:na] *= np.linspace(0, 1, na)
    if nr:
        x[-nr:] *= np.linspace(1, 0, nr)
    return x


def svf_sweep(x, fc, q=2.0):
    """State-variable band-pass with a per-sample cutoff (for whooshes/risers)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    damp = 1 / q
    low = band = 0.0
    out = np.empty_like(x)
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - damp * band
        band += f[i] * high
        out[i] = band
    return out


class Bus:
    def __init__(self, dur):
        self.n = n_of(dur) + SR * 4
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def add(self, t, x, gain=1.0, pan=0.0):
        i = n_of(t)
        if i < 0:
            x, i = x[-i:], 0
        x = x[: max(0, self.n - i)] * gain
        p = np.clip(np.broadcast_to(np.asarray(pan, dtype=float), (len(x),)), -1, 1)
        a = (p + 1) * np.pi / 4
        self.L[i : i + len(x)] += x * np.cos(a) * np.sqrt(2)
        self.R[i : i + len(x)] += x * np.sin(a) * np.sqrt(2)

    def stereo(self):
        return np.stack([self.L, self.R])


# ------------------------------------------------------------------ drums
def kick(strength=1.0):
    n = n_of(0.5)
    t = tt(n)
    body = osc(45 + 115 * np.exp(-t * 32), n) * np.exp(-t * 7)
    click = hp(noise(n), 1800) * np.exp(-t * 320) * 0.35
    return np.tanh((body + click) * 1.6 * strength) * 0.9


def sub808(freq, dur):
    n = n_of(dur)
    t = tt(n)
    x = osc(freq * (1 + 0.7 * np.exp(-t * 28)), n) * np.exp(-t * 1.3)
    return fade(np.tanh(x * 2.4) / np.tanh(2.4), 0.002, 0.05)


def snare():
    n = n_of(0.4)
    t = tt(n)
    body = osc(190 * (1 + 0.3 * np.exp(-t * 40)), n) * np.exp(-t * 26) * 0.5
    nz = bp(noise(n), 1400, 7500) * np.exp(-t * 15)
    clap = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.023]):
        i = n_of(d)
        m = n - i
        clap[i:] += bp(noise(m), 900, 3200) * np.exp(-tt(m) * (70 if k < 2 else 18))
    return np.tanh((body + nz * 0.7 + clap * 0.6) * 1.4) * 0.7


def hat(open_=False):
    n = n_of(0.3 if open_ else 0.08)
    t = tt(n)
    return hp(noise(n), 7500, 4) * np.exp(-t * (11 if open_ else 75)) * 0.32


# ------------------------------------------------------------------ sfx
def whoosh(dur, up=True):
    n = n_of(dur)
    p = np.linspace(0, 1, n)
    env = np.sin(np.pi * np.clip(p / 0.78, 0, 1) ** 1.6 * 0.5) ** 2 * np.where(p > 0.78, np.exp(-(p - 0.78) * 18), 1)
    fc = (350 + 3200 * env) if up else (3000 - 2400 * p)
    x = svf_sweep(noise(n), fc, 1.6) * env
    air = hp(noise(n), 5000) * env * 0.15
    return fade(x * 0.9 + air, 0.01, 0.03)


def impact(size=1.0, dur=2.6):
    n = n_of(dur)
    t = tt(n)
    sub = osc(30 + 62 * np.exp(-t * 7), n) * np.exp(-t * 2.2)
    body = lp(noise(n), 900) * np.exp(-t * 8)
    thump = osc(105 * (1 + 0.5 * np.exp(-t * 30)), n) * np.exp(-t * 13)
    crack = bp(noise(n), 2200, 9000) * np.exp(-t * 38) * 0.6
    # Cinematic "braam": detuned brass-ish saw cluster so the hit reads on phone speakers.
    braam = sum(osc(f * (1 + d), n, "saw") for f in (73.42, 110.0, 146.83) for d in (-0.006, 0.006))
    braam = lp(braam, 1300) * np.minimum(t / 0.02, 1) * np.exp(-t * 1.6) / 6
    x = sub * 0.9 + body * 0.9 + thump * 0.8 + crack + braam * 0.9
    return np.tanh(x * 1.3 * size) * 0.95


def slam(low=1.0):
    n = n_of(0.9)
    t = tt(n)
    x = osc(70 + 90 * np.exp(-t * 25), n) * np.exp(-t * 7) * low
    x += bp(noise(n), 1500, 8000) * np.exp(-t * 32) * 0.7
    x += lp(noise(n), 500) * np.exp(-t * 14) * 0.5
    return np.tanh(x * 1.5) * 0.8


def riser(dur):
    n = n_of(dur)
    p = np.linspace(0, 1, n)
    swell = p ** 2.2
    nz = svf_sweep(noise(n), 300 * (20 ** p), 3.0) * swell
    tone = (osc(110 * (8 ** p), n, "saw") * 0.25 + osc(165 * (8 ** p), n, "saw") * 0.18)
    tone = lp(tone, 4000) * swell
    return fade(nz * 0.7 + tone * 0.5, 0.05, 0.015)


def scan(dur):
    n = n_of(dur)
    t = tt(n)
    p = t / dur
    f = 420 * (6 ** p)
    gate = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 28 * t))
    x = (osc(f, n) + 0.3 * osc(f * 2.01, n)) * gate * (0.4 + 0.6 * p)
    x += bp(noise(n), 2000, 6000) * 0.08
    return fade(x * 0.32, 0.01, 0.04)


def beep(f, d, amp=0.3):
    n = n_of(d)
    t = tt(n)
    return fade((osc(f, n) + 0.25 * osc(3 * f, n)) * np.exp(-t * 8) * amp, 0.002, 0.01)


def lock():
    x = np.zeros(n_of(0.3))
    a, b = beep(1320, 0.07), beep(1760, 0.16)
    x[: len(a)] += a
    i = n_of(0.085)
    x[i : i + len(b)] += b
    return x


def tick(p):
    n = n_of(0.03)
    t = tt(n)
    f = 1900 + 1900 * p
    return (osc(f, n) * np.exp(-t * 200) + hp(noise(n), 3000) * np.exp(-t * 700) * 0.5) * 0.22


def kaching(size=1.0):
    n = n_of(1.8)
    t = tt(n)
    x = np.zeros(n)
    # "ka": drawer/mechanism clack.
    x[: n_of(0.05)] += (bp(noise(n_of(0.05)), 1500, 5000) * np.exp(-tt(n_of(0.05)) * 70)) * 0.8
    x[: n_of(0.03)] += osc(320, n_of(0.03)) * np.exp(-tt(n_of(0.03)) * 120) * 0.5
    # "ching": bright bell partials.
    i = n_of(0.045)
    m = n - i
    tm = tt(m)
    bell = np.zeros(m)
    for f, a, d in [(2093, 1.0, 2.2), (2637, 0.7, 2.6), (3136, 0.6, 3.2), (4186, 0.4, 3.8), (5274, 0.25, 4.6), (6272, 0.15, 5.5)]:
        bell += a * (osc(f, m) + 0.5 * osc(f * 1.003, m)) * np.exp(-tm * d)
    x[i:] += bell * 0.35
    # Coin jingle.
    for _ in range(8):
        j = n_of(0.05 + rng.random() * 0.35)
        k = n_of(0.12)
        f = 3500 + rng.random() * 3500
        x[j : j + k] += osc(f, k) * np.exp(-tt(k) * 28) * 0.12
    if size > 1.2:
        x += impact(0.8, 1.8)[:n] * 0.6
    return np.tanh(x * 1.2) * 0.8


def glitch():
    seg = n_of(0.014)
    parts = []
    for k in range(13):
        if k % 2:
            parts.append(osc(200 + rng.random() * 1800, seg, "sq") * 0.6)
        else:
            parts.append(np.repeat(noise(seg // 8 + 1), 8)[:seg])
    x = np.concatenate(parts)
    x = np.round(x * 6) / 6  # bitcrush
    return fade(x * 0.22, 0.002, 0.02)


def explosion(size=5.0, near=False):
    n = n_of(3.2)
    t = tt(n)
    att = np.clip(t / 0.012, 0, 1)
    rumble = lp(noise(n), 500 if near else 180, 4) * np.exp(-t * (1.6 if near else 1.2)) * att
    sub = osc(38 + 20 * np.exp(-t * 5), n) * np.exp(-t * 2.6)
    x = rumble * 2.2 + sub * 0.8
    if near:
        gate = (rng.random(n) < 0.004).astype(float)
        crackle = bp(gate * 6 + noise(n) * 0.3, 500, 3500) * np.exp(-t * 2.2)
        x += crackle * 0.7 + bp(noise(n), 1500, 6000) * np.exp(-t * 25) * 0.8
    return np.tanh(x * 0.8) * (size / 6) * (1.0 if near else 0.55)


def cannon():
    n = n_of(2.5)
    t = tt(n)
    x = bp(noise(n), 250, 3000) * np.exp(-t * 28) * 1.2
    x += lp(noise(n), 300, 4) * np.exp(-t * 3.5) * 2.4
    x += osc(52 * (1 + 0.6 * np.exp(-t * 20)), n) * np.exp(-t * 4.5)
    x += lp(noise(n), 120, 4) * np.exp(-t * 1.1) * 1.5
    return np.tanh(x * 0.8) * 0.5


# ------------------------------------------------------------------ music
NOTE = {"D1": 36.71, "A1": 55.0, "Bb1": 58.27, "C2": 65.41, "D2": 73.42, "F2": 87.31, "G2": 98.0, "A2": 110.0,
        "Bb2": 116.54, "C#3": 138.59, "D3": 146.83, "E3": 164.81, "F3": 174.61, "A3": 220.0}
PROG = [("D2", ["D2", "A2", "D3", "F3"]), ("D2", ["D2", "A2", "D3", "F3"]),
        ("Bb1", ["Bb1", "F2", "Bb2", "D3"]), ("A1", ["A1", "E3", "A2", "C#3"])]


ARP = [["D3", "F3", "A3", "D4"], ["D3", "F3", "A3", "D4"], ["Bb2", "D3", "F3", "Bb3"], ["A2", "C#3", "E3", "A3"]]
MIDI = {"A2": 45, "Bb2": 46, "C#3": 49, "D3": 50, "E3": 52, "F3": 53, "A3": 57, "Bb3": 58, "D4": 62}


def pluck(f, dur=0.3):
    n = n_of(dur)
    t = tt(n)
    saw = osc(f, n, "saw") + osc(f * 1.005, n, "saw")
    x = lp(saw, 2600) * np.exp(-t * 14) * 0.6 + lp(saw, 800) * np.exp(-t * 6)
    return fade(x * 0.5, 0.002, 0.03)


def pad_chord(notes, dur, bright=0.0):
    n = n_of(dur)
    t = tt(n)
    x = np.zeros(n)
    for nm in notes:
        f = NOTE[nm]
        for d in (-0.004, 0.0, 0.004):
            x += osc(f * (1 + d), n, "saw")
    x = lp(x, 500 + 1600 * bright, 2) / (len(notes) * 3)
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * t)
    return fade(x, 0.25, 0.25)


def build_music(TL, bus, verb):
    m = TL["music"]
    beat = 60 / m["bpm"]
    bar = beat * 4
    step = bar / 16
    origin = m["origin"]
    end = TL["duration"]
    oS = TL["outroStart"]
    build0, drop2, final = oS + 0.65, oS + 2.5, oS + 4.5

    # Pad: quiet drone in the intro, full under the groove.
    k = 0
    tb = origin - 2 * bar
    while tb < end:
        root, chord = PROG[k % len(PROG)]
        lvl = 0.5 if tb < origin else 0.75
        bright = 0.15 if tb < origin else 0.4
        bus.add(tb, pad_chord(chord, bar + 0.5, bright), 0.22 * lvl)
        k += 1
        tb += bar

    # Intro snare roll into the first drop.
    for i, s in enumerate(np.concatenate([np.arange(0, 0.5, beat / 2), np.arange(0.5, 0.8, beat / 4), np.arange(0.8, 1.0, beat / 8)])):
        bus.add(origin - 1.0 + s, snare(), 0.18 + 0.3 * s)

    # Groove (half-time trap): runs from the first impact, breaks for the
    # outro build, drops again on the final ka-ching.
    def groove(t0, t1):
        tb = t0
        while tb < t1 - 1e-6:
            bi = int(round((tb - origin) / bar))
            root = NOTE[PROG[bi % len(PROG)][0]]
            for s in range(16):
                ts = tb + s * step
                if ts >= t1:
                    break
                if s in (0, 7, 10):
                    bus.add(ts, kick(1.0 if s == 0 else 0.85), 0.55)
                if s in (0, 10):
                    bus.add(ts, sub808(root, step * (10 if s == 0 else 6)), 0.32)
                if s % 2 == 0:
                    nm = ARP[bi % len(ARP)][[0, 1, 2, 3, 2, 1, 2, 3][s // 2]]
                    x = pluck(440 * 2 ** ((MIDI[nm] - 69) / 12))
                    bus.add(ts, x, 0.2, 0.3 * (1 if (s // 2) % 2 else -1))
                    verb.add(ts, x, 0.08)
                if s == 8:
                    bus.add(ts, snare(), 0.5)
                    verb.add(ts, snare(), 0.18)
                roll = bi % 2 == 1 and s >= 12
                if s % 2 == 0 and not roll:
                    bus.add(ts, hat(s == 6), 0.5, 0.25)
                if roll:
                    for r in range(2):
                        bus.add(ts + r * step / 2, hat(), 0.4 + 0.1 * r, 0.25)
            tb += bar

    groove(origin, build0)
    # Build: accelerating snare roll + hats under the total count.
    span = drop2 - build0
    s = 0.0
    while s < span:
        p = s / span
        bus.add(build0 + s, snare(), 0.12 + 0.35 * p)
        s += beat / (2 if p < 0.4 else 4 if p < 0.75 else 8)
    groove(drop2, final)
    bus.add(final, kick(1.2), 0.6)
    bus.add(final, sub808(NOTE["D1"] * 2, 1.8), 0.5)


# ------------------------------------------------------------------ ambience
def build_ambience(TL, bus, verb):
    dur = TL["duration"]
    n = n_of(dur + 1)
    brown = np.cumsum(noise(n))
    brown = hp(brown, 25)
    brown = lp(brown / (np.abs(brown).max() + 1e-9), 220, 2)
    bus.add(0, brown / (np.abs(brown).max() + 1e-9), 0.05, -0.2)
    bus.add(0, np.roll(brown, SR // 3) / (np.abs(brown).max() + 1e-9), 0.05, 0.2)
    # Distant small-arms fire.
    t = 0.3
    while t < dur:
        rounds = rng.integers(3, 10)
        rate = 0.07 + rng.random() * 0.06
        pan = rng.uniform(-0.9, 0.9)
        g = 0.05 + rng.random() * 0.05
        for r in range(rounds):
            m = n_of(0.12)
            shot = bp(noise(m), 700, 2200) * np.exp(-tt(m) * 55)
            verb.add(t + r * rate, shot, g * 1.6, pan)
            bus.add(t + r * rate, shot, g * 0.5, pan)
        t += 0.6 + rng.random() * 1.6


# ------------------------------------------------------------------ main
def main(tl_path, out_path):
    TL = json.load(open(tl_path))
    dur = TL["duration"]
    music, sfx, amb, verb = Bus(dur), Bus(dur), Bus(dur), Bus(dur)

    build_music(TL, music, verb)
    build_ambience(TL, amb, verb)

    kachings = [e for e in TL["audio"] if e["type"] == "kaching"]
    for e in TL["audio"]:
        t, ty = e["t"], e["type"]
        if ty == "whoosh":
            x = whoosh(e["dur"])
            sfx.add(t, x, 0.55, np.linspace(e["pan0"], e["pan1"], len(x)))
        elif ty == "impact":
            x = impact(e.get("size", 1))
            sfx.add(t, x, 0.75)
            verb.add(t, x, 0.35)
        elif ty == "thud":
            sfx.add(t, slam(1.2), 0.45)
        elif ty in ("slam", "hit", "stamp"):
            x = slam(1.4 if ty != "slam" else 1.0)
            sfx.add(t, x, 0.6 if ty != "slam" else 0.42)
            verb.add(t, x, 0.25)
            if ty == "hit":
                sfx.add(t, kick(1.1), 0.5)
        elif ty == "riser":
            sfx.add(t, riser(e["dur"]), 0.3)
        elif ty == "scan":
            sfx.add(t, scan(e["dur"]), 0.7)
        elif ty == "lock":
            sfx.add(t, lock(), 0.8)
        elif ty == "tick":
            sfx.add(t, tick(e["p"]), 0.9)
        elif ty == "kaching":
            x = kaching(e.get("size", 1))
            sfx.add(t, x, 0.85 if e.get("size", 1) <= 1.2 else 1.0)
            verb.add(t, x, 0.3)
        elif ty == "glitch":
            sfx.add(t, glitch(), 0.7, rng.uniform(-0.3, 0.3))
        elif ty == "explosion":
            x = explosion(e["size"], e.get("near", False))
            sfx.add(t, x, 0.8, e["pan"] * 0.7)
            verb.add(t, x, 0.3, e["pan"] * 0.7)
        elif ty == "cannon":
            x = cannon()
            sfx.add(t, x, 0.8, e["pan"])
            verb.add(t, x, 0.4, e["pan"])
    # Soft tension swell under each price count.
    for e in kachings:
        d = 1.5
        sfx.add(e["t"] - d, riser(d), 0.12)

    # Reverb: decaying stereo noise IR.
    ir_n = n_of(2.2)
    ir_t = tt(ir_n)
    ir = np.stack([lp(noise(ir_n), 5000) * np.exp(-ir_t * 3.2) for _ in range(2)])
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    wet = np.stack([signal.fftconvolve(ch, ir[i])[: verb.n] for i, ch in enumerate(verb.stereo())])

    # Duck music + ambience on the big hits.
    duck = np.ones(music.n)
    tl = tt(music.n)
    for e in TL["audio"]:
        if e["type"] in ("impact", "kaching", "explosion") and (e["type"] != "explosion" or e.get("near")):
            d = tl - e["t"]
            m = d >= 0
            duck[m] *= 1 - 0.45 * np.exp(-d[m] * 5)

    mix = music.stereo() * 0.85 * duck + amb.stereo() * duck + sfx.stereo() + wet * 0.35
    n_out = n_of(dur)
    mix = mix[:, :n_out]
    mix[:, -n_of(0.4):] *= np.linspace(1, 0, n_of(0.4)) ** 2
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix /= np.abs(mix).max() / 0.95

    pcm = (mix.T * 32767).astype("<i2")
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out_path}  {dur:.2f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out/timeline.json", sys.argv[2] if len(sys.argv) > 2 else "out/audio.wav")
