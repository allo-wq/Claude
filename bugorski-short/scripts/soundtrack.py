#!/usr/bin/env python3
"""Procedural sound design + final mix (deterministic: fixed seeds, no samples).

    .venv/bin/python scripts/soundtrack.py

Inputs : audio/narration_voice.flac (scripts/narrate.py), src/timeline.js (time warp).
Output : audio/soundtrack.flac — voice + score pad + ambience + effects, ducked under
         the voice and loudness-normalised to -14 LUFS / -1.5 dBTP (YouTube target).

Every effect is authored on the DESIGN clock (the times the shots use) and placed on
the real clock through realTime() from src/timeline.js, so it hits the same frame as
the visual it belongs to.
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TAU = 2 * np.pi


def real_times(design_times):
    """Map design seconds → real seconds with the exact warp used by the renderer."""
    js = ("import { realTime, DURATION } from './src/timeline.js';"
          "const ts = JSON.parse(process.argv[1]);"
          "console.log(JSON.stringify({ t: ts.map(realTime), d: DURATION }));")
    out = subprocess.run(['node', '--input-type=module', '-e', js, json.dumps(list(map(float, design_times)))],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    r = json.loads(out)
    return r['t'], r['d']


# ───────────── DSP helpers ─────────────
def band(x, lo, hi, soft=0.25):
    """Zero-phase FFT band-pass with raised-cosine skirts (lo/hi in Hz; None = open)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        a, b = lo * (1 - soft), lo * (1 + soft)
        g *= np.clip((f - a) / (b - a), 0, 1) ** 2
    if hi:
        a, b = hi * (1 - soft), hi * (1 + soft)
        g *= np.clip((b - f) / (b - a), 0, 1) ** 2
    return np.fft.irfft(X * g, len(x)).astype(np.float32)


def env_ad(n, attack, decay, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack) * curve / max(decay, 1e-4))
    return e.astype(np.float32)


def noise(n, seed):
    return np.random.RandomState(seed).standard_normal(n).astype(np.float32)


def sweep(n, f0, f1, shape='exp'):
    t = np.linspace(0, 1, n, endpoint=False)
    f = f0 * (f1 / f0) ** t if shape == 'exp' else f0 + (f1 - f0) * t
    return np.sin(np.cumsum(TAU * f / SR)).astype(np.float32)


def db(v):
    return 10 ** (v / 20)


class Track:
    def __init__(self, n): self.x = np.zeros(n, np.float32)

    def add(self, sig, t, gain_db=0.0):
        i = int(round(t * SR))
        if i >= len(self.x): return
        if i < 0: sig = sig[-i:]; i = 0
        m = min(len(sig), len(self.x) - i)
        self.x[i:i + m] += sig[:m] * db(gain_db)


# ───────────── sound sources ─────────────
def hit(seed, dur=1.6, sub=48):
    n = int(dur * SR)
    body = sweep(n, sub * 1.6, sub * 0.7) * env_ad(n, 0.004, dur * 0.9, 3.0)
    crack = band(noise(n, seed), 800, 9000) * env_ad(n, 0.001, 0.25, 6.0)
    return body * 0.9 + crack * 0.5


def zap(seed, dur=0.45):
    # sub thump + high sizzle, nothing in the speech band (zaps land on narration)
    n = int(dur * SR)
    sub = sweep(n, 90, 38) * env_ad(n, 0.002, dur, 4) * 0.8
    sizzle = band(noise(n, seed), 4500, 14000) * env_ad(n, 0.001, 0.16, 5) * 0.7
    return sub + sizzle


def whoosh(seed, dur=0.6, lo=300, hi=4000):
    n = int(dur * SR)
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    return band(noise(n, seed), lo, hi) * e.astype(np.float32) * 0.5


def riser(seed, dur):
    n = int(dur * SR)
    e = np.linspace(0, 1, n, dtype=np.float32) ** 2.2
    tone = sweep(n, 160, 1400) * 0.35 + sweep(n, 80, 700) * 0.25
    hiss = band(noise(n, seed), 1500, 9000) * 0.35
    return (tone + hiss) * e


def clunk(seed):
    n = int(0.25 * SR)
    return sweep(n, 110, 60) * env_ad(n, 0.002, 0.18, 5) + band(noise(n, seed), 1500, 6000) * env_ad(n, 0.0005, 0.03, 6) * 0.6


def buzzer(dur=0.16):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sq = np.sign(np.sin(TAU * 196 * t)) * 0.5 + np.sign(np.sin(TAU * 293 * t)) * 0.3
    return band(sq.astype(np.float32), None, 3000) * env_ad(n, 0.005, dur, 1.5)


def beep(freq=1000, dur=0.11):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(TAU * freq * t) * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.02)).astype(np.float32)


def thud(seed, dur=0.5, f=70):
    n = int(dur * SR)
    return sweep(n, f * 1.5, f * 0.8) * env_ad(n, 0.002, dur * 0.7, 4) + band(noise(n, seed), 200, 2500) * env_ad(n, 0.001, 0.06, 6) * 0.5


def step(seed):
    n = int(0.18 * SR)
    return band(noise(n, seed), 120, 3000) * env_ad(n, 0.002, 0.08, 6) * 0.7 + sweep(n, 90, 60) * env_ad(n, 0.002, 0.1, 5) * 0.4


def chime():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    s = sum(a * np.sin(TAU * f * t) * np.exp(-t * d) for f, a, d in [(880, 1, 1.8), (1320, 0.5, 2.4), (1760, 0.3, 3.0), (2640, 0.15, 4)])
    return (s * np.minimum(1, t / 0.005)).astype(np.float32) * 0.5


NOTE = {n: 440 * 2 ** ((i - 9) / 12) for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def hz(name):  # e.g. 'D3'
    return NOTE[name[:-1]] * 2 ** (int(name[-1]) - 4)


def pad_note(f, n, seed, bright=6):
    t = np.arange(n) / SR
    rng = np.random.RandomState(seed)
    out = np.zeros(n, np.float32)
    for det in (-0.0018, 0.0018):
        ph = rng.rand() * TAU
        for k in range(1, bright + 1):
            out += (np.sin(TAU * f * (1 + det) * k * t + ph * k) / k ** 1.6).astype(np.float32)
    return out * 0.5


# ───────────── score + design ─────────────
def main():
    voice, sr = sf.read(os.path.join(ROOT, 'audio', 'narration_voice.flac'), dtype='float32')
    assert sr == SR, 'narration_voice.flac must be 48 kHz'
    if voice.ndim > 1: voice = voice.mean(axis=1)

    # design-clock events (seconds on the 48 s design clock the shots are written on)
    ev = {
        'intro': 0.0, 'cut_hall': 1.4, 'running': 2.9, 'cut_name': 4.0, 'glitch_a': 6.8, 'glitch_b': 8.3,
        'lamp1': 8.55, 'lamp2': 8.9, 'lamp3': 9.25, 'cross': 9.45, 'riser_a': 11.9, 'strike': 13.82,
        'tunnel_a': 14.0, 'tunnel_b': 16.6, 'entry': 17.2, 'exit': 18.1, 'eye_a': 19.0, 'suns': 19.8,
        'white': 21.15, 'quiet_a': 21.4, 'icon1': 22.4, 'icon2': 23.2, 'quiet_b': 24.0, 'peel_a': 25.6,
        'peel_b': 28.2, 'block': 28.2, 'wall_a': 29.45, 'wall_b': 31.0, 'hosp_a': 31.4, 'flip_a': 34.0,
        'flip_b': 35.0, 'hosp_b': 35.4, 'ear_a': 37.0, 'ear_b': 38.8, 'seiz_a': 38.8, 'seiz_b': 40.2,
        'intact': 41.4, 'book': 43.3, 'stamp': 44.0, 'walk_a': 44.6, 'end': 48.0,
    }
    # ECG beeps: the monitor draws an R-peak at phase 0.25 of each beat (72 bpm) on the design clock
    period = 60 / 72
    ecg = [k * period + 0.25 * period for k in range(int(31.4 / period), int(35.4 / period) + 1) if 31.4 <= k * period + 0.25 * period <= 35.4]
    # footsteps: heel strikes of the walk cycle (1.05 s per cycle, phase 0.25 / 0.75)
    steps = [44.6 + (0.25 + 0.5 * k) * 1.05 for k in range(7) if 44.6 + (0.25 + 0.5 * k) * 1.05 < 48.0]
    # rings rushing past in the beam pipe (one ring every 6 units at 22 units/s)
    rings = list(np.arange(14.15, 16.6, 6 / 22))
    keys = list(ev.keys())
    rt, dur = real_times([ev[k] for k in keys] + ecg + steps + rings)
    R = dict(zip(keys, rt[:len(keys)]))
    ecg_r, steps_r, rings_r = rt[len(keys):len(keys) + len(ecg)], rt[len(keys) + len(ecg):len(keys) + len(ecg) + len(steps)], rt[-len(rings):]
    N = int(round(dur * SR))
    voice = np.pad(voice, (0, max(0, N - len(voice))))[:N]

    music, amb, fx = Track(N), Track(N), Track(N)

    # ---- score pad: chords follow the story beats (real-time spans) ----
    chords = [
        ('intro', 'glitch_b', ['D2', 'A2', 'D3', 'F3'], -24),        # dark D minor
        ('glitch_b', 'riser_a', ['A#1', 'F2', 'A#2', 'D3'], -23),    # Bb: safety fails
        ('riser_a', 'strike', ['D2', 'A2', 'D#3', 'A3'], -22),       # tension (b9)
        ('tunnel_a', 'suns', ['D2', 'A2', 'D3', 'F3', 'A3'], -24),  # the beam
        ('suns', 'quiet_a', ['A2', 'E3', 'A3', 'C#4', 'E4'], -20),  # bright A major: thousand suns
        ('quiet_b', 'hosp_a', ['G1', 'D2', 'G2', 'A#2'], -25),       # aftermath, G minor
        ('hosp_a', 'hosp_b', ['D#2', 'A#2', 'D#3', 'G3'], -27),      # hospital, Eb
        ('hosp_b', 'seiz_a', ['F2', 'C3', 'F3', 'A3'], -25),         # he survives: F major
        ('seiz_a', 'seiz_b', ['F#2', 'C3', 'F#3', 'A3'], -25),       # seizures: diminished
        ('seiz_b', 'book', ['F2', 'C3', 'F3', 'G3', 'A3'], -23),     # mind intact: Fadd9
        ('book', 'end', ['A#1', 'F2', 'D3', 'F3', 'A3', 'C4'], -22), # back to work: Bbmaj9 → resolves
    ]
    for i, (a, b, notes, lvl) in enumerate(chords):
        t0, t1 = R[a], R[b] if b != 'end' else dur
        n = int((t1 - t0 + 0.8) * SR)
        e = np.minimum(1, np.arange(n) / (0.5 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.8 * SR))
        sig = sum(pad_note(hz(nm), n, 100 * i + j) for j, nm in enumerate(notes)) / len(notes)
        sig = band(sig, 50, 2400) * e.astype(np.float32)
        music.add(sig, t0, lvl + 6)

    # ---- ambience ----
    def hum(t0, t1, lvl, seed):
        n = int((t1 - t0) * SR)
        if n <= 0: return
        t = np.arange(n) / SR
        h = (np.sin(TAU * 50 * t) * 0.6 + np.sin(TAU * 100 * t) * 0.35 + np.sin(TAU * 150 * t) * 0.15) * (0.8 + 0.2 * np.sin(TAU * 0.3 * t))
        air = band(noise(n, seed), 80, 900) * 0.25
        e = np.minimum(1, t / 0.3) * np.minimum(1, (t[-1] - t) / 0.3 + 1e-3)
        amb.add(((h + air) * e).astype(np.float32), t0, lvl)
    hum(R['cut_hall'], R['tunnel_a'], -30, 1)
    hum(R['walk_a'], dur, -31, 2)
    n = int((R['cut_hall']) * SR)
    amb.add(band(noise(n, 3), 100, 1200) * np.linspace(0.3, 1, n, dtype=np.float32), 0, -31)  # wind over the ring
    n = int((R['tunnel_b'] - R['tunnel_a']) * SR)
    amb.add(band(noise(n, 4), 250, 3500) * np.sin(np.linspace(0, np.pi, n)).astype(np.float32) ** 0.5, R['tunnel_a'], -22)  # rushing pipe
    n = int((R['hosp_b'] - R['hosp_a']) * SR)
    amb.add(band(noise(n, 5), 150, 1500) * 0.6, R['hosp_a'], -36)  # room tone

    # ---- effects ----
    fx.add(hit(10, 2.2, 42), R['intro'] + 0.02, -9)
    fx.add(whoosh(11, 0.5), R['cut_hall'] - 0.25, -22)
    fx.add(zap(12, 0.6) * 0.6, R['running'], -24)
    fx.add(whoosh(13, 0.45), R['cut_name'] - 0.22, -26)
    rng = np.random.RandomState(14)
    t = R['glitch_a']
    while t < R['glitch_b']:  # electrical sputter while the machine glitches
        L = int(rng.uniform(0.03, 0.14) * SR)
        burst = band(noise(L, int(t * 1000)), 1200, 7000) * env_ad(L, 0.002, L / SR, 3)
        tt = np.arange(L) / SR
        burst += (np.sign(np.sin(TAU * 120 * tt)) * 0.3).astype(np.float32) * env_ad(L, 0.002, L / SR, 3)
        fx.add(burst, t, -22 + rng.uniform(-4, 2))
        t += rng.uniform(0.05, 0.22)
    for k, key in enumerate(['lamp1', 'lamp2', 'lamp3']):
        fx.add(clunk(20 + k), R[key], -15)
    fx.add(buzzer(), R['cross'], -19); fx.add(buzzer(), R['cross'] + 0.22, -19)
    fx.add(riser(30, R['strike'] - R['riser_a']), R['riser_a'], -17)
    fx.add(hit(31, 2.6, 38), R['strike'], -4)
    for k, tr in enumerate(rings_r):
        fx.add(whoosh(40 + k, 0.22, 600, 6000), tr - 0.11, -30)
    fx.add(zap(50, 0.5), R['entry'] - 0.02, -13)
    fx.add(zap(51, 0.6), R['exit'] - 0.02, -13)
    fx.add(riser(52, R['suns'] - R['eye_a']) * 0.8, R['eye_a'], -19)
    n = int((R['quiet_a'] - R['suns']) * SR)
    t_ = np.arange(n) / SR
    shimmer = sum(np.sin(TAU * f * t_ + k) * (0.6 + 0.4 * np.sin(TAU * (3 + k) * t_)) for k, f in enumerate([1760, 2217, 2637, 3520]))
    fx.add((shimmer * np.minimum(1, t_ / 0.3) * np.minimum(1, (t_[-1] - t_) / 0.4 + 1e-3) * 0.15).astype(np.float32), R['suns'], -20)
    fx.add(whoosh(53, 0.6, 2000, 12000), R['white'] - 0.2, -20)
    fx.add(beep(1320, 0.06) * 0.5, R['icon1'] + 0.05, -30)
    fx.add(beep(990, 0.06) * 0.5, R['icon2'] + 0.05, -30)
    rng = np.random.RandomState(60)
    t = R['peel_a'] + 0.3
    while t < R['peel_b'] - 0.2:  # faint skin-flake crackle
        L = int(0.02 * SR)
        fx.add(band(noise(L, int(t * 997)), 2500, 9000) * env_ad(L, 0.001, 0.015, 6), t, -34 + rng.uniform(-3, 3))
        t += rng.uniform(0.04, 0.16)
    fx.add(thud(61, 0.6, 60), R['block'], -18)
    rng = np.random.RandomState(62)
    t, k = R['wall_a'], 0
    while t < R['wall_b']:  # blocks clattering into the wall, getting denser
        fx.add(thud(70 + k, 0.12, 140 + rng.uniform(-30, 30)), t, -28 + rng.uniform(-3, 2))
        frac = (t - R['wall_a']) / (R['wall_b'] - R['wall_a'])
        t += rng.uniform(0.02, 0.09) * (1.2 - frac); k += 1
    fx.add(thud(63, 0.9, 45), R['wall_b'], -16)
    for k, tr in enumerate(ecg_r):
        fx.add(beep(1000, 0.1), tr, -24)
    rng = np.random.RandomState(64)
    t = R['flip_a']
    while t < R['flip_b']:  # calendar pages fluttering
        L = int(0.05 * SR)
        fx.add(band(noise(L, int(t * 991)), 1500, 8000) * env_ad(L, 0.004, 0.04, 4), t, -28 + rng.uniform(-3, 2))
        t += rng.uniform(0.025, 0.07)
    n = int((R['ear_b'] - R['ear_a']) * SR)
    t_ = np.arange(n) / SR
    ripple = np.sin(TAU * 520 * t_) * (0.5 + 0.5 * np.sin(TAU * 0.9 * t_ * 5)) * np.minimum(1, t_ / 0.2) * np.minimum(1, (t_[-1] - t_) / 0.3 + 1e-3)
    fx.add(band(ripple.astype(np.float32), 300, 1200), R['ear_a'], -30)
    rng = np.random.RandomState(65)
    t = R['seiz_a']
    while t < R['seiz_b'] - 0.05:  # electrical crackle while the arcs flicker
        L = int(rng.uniform(0.02, 0.09) * SR)
        fx.add(band(noise(L, int(t * 983)), 3500, 12000) * env_ad(L, 0.001, L / SR, 4), t, -24 + rng.uniform(-5, 1))
        t += rng.uniform(0.03, 0.12)
    fx.add(chime(), R['intact'], -20)
    fx.add(thud(66, 0.5, 80), R['book'], -16)
    fx.add(thud(67, 0.8, 55) + band(noise(int(0.8 * SR), 68), 300, 4000) * env_ad(int(0.8 * SR), 0.001, 0.08, 5) * 0.4, R['stamp'], -9)
    for k, tr in enumerate(steps_r):
        fx.add(step(80 + k), tr, -25)

    # ---- mix: duck score/ambience under the voice ----
    def moving_avg(x, w):  # centred box filter in O(N) via cumulative sums
        c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)])
        i = np.arange(len(x)); lo = np.clip(i - w // 2, 0, len(x)); hi = np.clip(i + w - w // 2, 0, len(x))
        return ((c[hi] - c[lo]) / w).astype(np.float32)
    venv = np.sqrt(moving_avg(voice ** 2, int(0.05 * SR)))
    venv = moving_avg(venv, int(0.25 * SR))  # smooth (≈250 ms release)
    duck = 1 - 0.5 * np.clip(venv / (venv.max() * 0.25 + 1e-9), 0, 1)
    bed = (music.x + amb.x) * duck
    # speech pocket: duck the 250 Hz–8 kHz band of the effects while the narrator talks
    fx_mid = band(fx.x, 250, 8000)  # speech band incl. sibilants
    pocket = 1 - 0.75 * np.clip(venv / (venv.max() * 0.2 + 1e-9), 0, 1)
    fx_mix = (fx.x - fx_mid) + fx_mid * pocket
    mono = voice * db(-2) + bed + fx_mix * db(-1)
    # gentle stereo width on the bed only (voice + effects centred, mono-safe)
    d = int(0.012 * SR)
    left = mono + 0.18 * np.concatenate([np.zeros(d, np.float32), bed[:-d]])   # bed delayed 12 ms
    right = mono + 0.18 * np.concatenate([bed[d:], np.zeros(d, np.float32)])   # bed advanced 12 ms
    fade = np.ones(N, np.float32); fl = int(0.6 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
    st = np.stack([left * fade, right * fade], axis=1)
    st = st / max(1e-6, np.abs(st).max()) * 0.7
    out = os.path.join(ROOT, 'audio', 'soundtrack.flac')
    y = master(st.astype(np.float32), target_lufs=-14.0, ceiling_dbtp=-1.5)
    sf.write(out, y, SR, format='FLAC', subtype='PCM_24')
    I, tp = measure(y)
    print(f'audio/soundtrack.flac  {len(y) / SR:.3f}s  {I:.1f} LUFS integrated, {tp:.1f} dBTP true peak')


def measure(x):
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg's EBU R128 meter (measurement only)."""
    tmp = os.path.join(ROOT, 'audio', '_measure.wav')
    sf.write(tmp, x, SR, subtype='FLOAT')
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    os.remove(tmp)
    summary = log[log.rindex('Summary:'):]
    I = float(summary.split('I:')[1].split('LUFS')[0])
    tp = float(summary.split('Peak:')[1].split('dBFS')[0])
    return I, tp


def master(x, target_lufs, ceiling_dbtp):
    """Linear gain to the loudness target; soft-limit only the samples that would exceed
    the ceiling. Sample-exact: no resampling or look-ahead delay, so sync is untouched."""
    I, _ = measure(x)
    y = x * db(target_lufs - I)
    for _ in range(3):
        _, tp = measure(y)
        if tp <= ceiling_dbtp: break
        c = db(ceiling_dbtp - 0.4)          # knee just under the ceiling (true peak > sample peak)
        k = 0.8 * c
        a = np.abs(y)
        over = a > k
        y[over] = np.sign(y[over]) * (k + (c - k) * np.tanh((a[over] - k) / (c - k)))
        I2, _ = measure(y)
        y = y * db(target_lufs - I2)        # restore loudness lost to limiting
    return y.astype(np.float32)


if __name__ == '__main__':
    main()
