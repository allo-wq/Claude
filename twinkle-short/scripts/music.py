#!/usr/bin/env python3
"""Music, sound effects and final mix for the 24 s looping nursery-rhyme Short.

    .venv/bin/python scripts/music.py

Everything is synthesized here with NumPy from fixed seeds (no samples):
  * a bouncy kids'-pop arrangement in D major at 120 bpm: ukulele-style plucked strums,
    plucky bass, glockenspiel doubling the tune an octave up, marimba arpeggios, a soft
    pad, toy drums (kick, finger snaps, shaker);
  * cute beat-locked sound effects (pops, boings, dings, whooshes, sparkles …) from
    song.json "cues", plus the character ad-libs made by scripts/sing.py.

All layers are written into CIRCULAR buffers exactly one loop long: a note or tail
that runs past the end continues at the start, and the reverb is computed over two
laps, so the loop point is seamless. The mix is mastered to -14 LUFS (measured with
FFmpeg's EBU R128 meter) with true peaks at or below -1 dBTP.

Output: audio/soundtrack.flac (+ audio/stems/*.wav for the music and sfx buses).
"""
import json, os, re, subprocess
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEMS = os.path.join(ROOT, 'audio', 'stems')
SR = 48000
RNG = np.random.default_rng(7)

song = json.load(open(os.path.join(ROOT, 'song.json'), encoding='utf-8'))
BEAT = 60.0 / song['bpm']
OFF = song['offset']
LOOP = song['beatsPerLoop'] * BEAT
N = int(round(LOOP * SR))


def bt(b):
    """Time (s) of beat b."""
    return OFF + b * BEAT


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def add(bus, x, t, gain=1.0, pan=0.0):
    """Mix mono x into stereo circular bus at time t (equal-power pan)."""
    i0 = int(round(t * SR))
    idx = (np.arange(len(x)) + i0) % N
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    np.add.at(bus[0], idx, x * gain * l)
    np.add.at(bus[1], idx, x * gain * r)


def db(g):
    return 10 ** (g / 20)


def env_adsr(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    t = np.arange(n) / SR
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where((t >= a + d) & (t < hold), s, e)
    e = np.where(t >= hold, s * np.clip(1 - (t - hold) / max(r, 1e-6), 0, 1), e)
    return e


def fft_filter(x, lo=None, hi=None):
    """Zero-phase band filter in the frequency domain with soft (1 octave) edges."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo: g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi: g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


# ───────────── instruments ─────────────
def pluck(f, dur=1.4, bright=1.0, decay=2.2):
    """Ukulele/guitar-like plucked string: decaying harmonics, higher ones fade faster."""
    t = tvec(dur)
    y = np.zeros_like(t)
    for k in range(1, 14):
        if k * f > 16000: break
        amp = (1 / k ** 1.15) * (1 if k % 5 else 0.4) * bright ** (k / 6)
        y += amp * np.exp(-t * (decay + 0.75 * k * k ** 0.5)) * np.sin(2 * np.pi * k * f * t * (1 + 0.0004 * k) + k)
    y += 0.25 * RNG.standard_normal(len(t)) * np.exp(-t * 180)          # pick noise
    return y * np.minimum(1, t / 0.002)


def bass(f, dur=0.5):
    t = tvec(dur + 0.15)
    ff = f * (1 + 0.04 * np.exp(-t * 40))
    ph = 2 * np.pi * np.cumsum(ff) / SR
    y = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    e = np.minimum(1, t / 0.004) * np.exp(-t * 2.2) * np.clip((dur + 0.15 - t) / 0.08, 0, 1)
    return y * e


def glock(f, dur=1.6):
    """Glockenspiel: bright bar partials (1, 2.76, 5.4) with a soft mallet click."""
    t = tvec(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.4)
    y += 0.4 * np.sin(2 * np.pi * f * 2.756 * t) * np.exp(-t * 6)
    y += 0.18 * np.sin(2 * np.pi * f * 5.404 * t) * np.exp(-t * 11)
    y += 0.3 * fft_filter(RNG.standard_normal(len(t)), lo=3000) * np.exp(-t * 300)
    return y * np.minimum(1, t / 0.0015)


def marimba(f, dur=0.8):
    t = tvec(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 5) + 0.3 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 18)
    return y * np.minimum(1, t / 0.002)


def pad_chord(freqs, dur):
    t = tvec(dur)
    y = np.zeros_like(t)
    for f in freqs:
        for det in (-0.004, 0.0, 0.0045):
            ph = 2 * np.pi * f * (1 + det) * t + RNG.uniform(0, 6.28)
            for k in range(1, 9):                                     # soft band-limited saw
                y += np.sin(k * ph) / k * 0.6 ** (k - 1)
    e = np.clip(t / 0.35, 0, 1) * np.clip((dur - t) / 0.35, 0, 1)
    return y * e / (3 * len(freqs))


def kick():
    t = tvec(0.35)
    f = 50 + 110 * np.exp(-t * 30)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    y += 0.3 * RNG.standard_normal(len(t)) * np.exp(-t * 400)
    return y


def snap():
    t = tvec(0.18)
    n = fft_filter(RNG.standard_normal(len(t)), lo=1200, hi=7000)
    e = sum(np.exp(-np.maximum(0, t - d) * 60) * (t >= d) for d in (0.0, 0.011, 0.02))
    return n * e * 0.6


def shaker(acc=1.0):
    t = tvec(0.06)
    n = fft_filter(RNG.standard_normal(len(t)), lo=6000)
    return n * np.sin(np.pi * np.clip(t / 0.06, 0, 1)) ** 2 * acc


# ───────────── sound effects ─────────────
def chirp(f0, f1, dur, shape='sin', curve=1.0):
    t = tvec(dur)
    f = f0 + (f1 - f0) * (t / dur) ** curve
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if shape == 'sin' else (2 / np.pi) * np.arcsin(np.sin(ph))


def noise_sweep(f0, f1, dur, q=1.5):
    """Filtered-noise whoosh: a band that slides from f0 to f1 (STFT-free: sum of moving bands)."""
    t = tvec(dur)
    x = RNG.standard_normal(len(t))
    out = np.zeros_like(x)
    nseg = 24
    edges = np.linspace(0, len(t), nseg + 1).astype(int)
    for i in range(nseg):
        c = f0 * (f1 / f0) ** ((i + 0.5) / nseg)
        seg = fft_filter(x, lo=c / q, hi=c * q)
        w = np.zeros_like(x); a, b = edges[i], edges[i + 1]
        ramp = np.hanning(2 * (b - a) + 2)[1:-1]
        lo_i = max(0, a - (b - a) // 2); w[lo_i:lo_i + len(ramp)] = ramp[:len(w) - lo_i]
        out += seg * w
    return out * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.2


def bell(f, dur=1.2, bright=1.0):
    t = tvec(dur)
    idx = 2.2 * bright * np.exp(-t * 7)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    return y * np.exp(-t * 3.2) * np.minimum(1, t / 0.001)


PENT = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98]       # D major pentatonic, D5 upward


def sparkle(n=6, span=0.35, base=3, seed=1):
    r = np.random.default_rng(seed)
    y = np.zeros(int((span + 1.0) * SR))
    for i in range(n):
        m = PENT[min(len(PENT) - 1, base + i + r.integers(0, 2))]
        x = bell(hz(m), 0.9, 0.7) * (0.9 - 0.08 * i)
        o = int((i / max(1, n - 1)) * span * SR)
        y[o:o + len(x)] += x[:len(y) - o]
    return y


def mixl(*xs):
    """Sum signals of different lengths (zero-padded)."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs: out[:len(x)] += x
    return out


def make_sfx(name, seed=0):
    r = np.random.default_rng(seed + 11)
    if name == 'pop':
        t = tvec(0.09); y = chirp(900, 260, 0.09, curve=0.5) * np.exp(-t * 45)
        return y + 0.5 * fft_filter(r.standard_normal(len(t)), lo=2000) * np.exp(-t * 300)
    if name == 'pop_big':
        t = tvec(0.5)
        thump = chirp(380, 70, 0.5, curve=0.4) * np.exp(-t * 10)
        burst = fft_filter(r.standard_normal(len(t)), lo=800, hi=9000) * np.exp(-t * 40)
        return mixl(thump + 0.6 * burst, 0.6 * make_sfx('pop'))
    if name in ('boing', 'boing_small', 'boing_q'):
        dur = {'boing': 0.55, 'boing_small': 0.32, 'boing_q': 0.45}[name]
        base = {'boing': 180, 'boing_small': 260, 'boing_q': 320}[name]
        t = tvec(dur)
        f = base * (1 + 0.9 * (1 - np.exp(-t * 18))) * (1 + 0.12 * np.exp(-t * 5) * np.sin(2 * np.pi * 16 * t))
        ph = 2 * np.pi * np.cumsum(f) / SR
        y = (2 / np.pi) * np.arcsin(np.sin(ph)) * 0.7 + 0.3 * np.sin(2 * ph)
        return y * np.exp(-t * 5) * np.minimum(1, t / 0.004)
    if name == 'ding':
        return mixl(bell(hz(93), 1.4), 0.5 * bell(hz(100), 1.0))
    if name == 'tick':
        t = tvec(0.05); return fft_filter(r.standard_normal(len(t)), lo=2500) * np.exp(-t * 200) + 0.4 * np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 90)
    if name in ('swish', 'whoosh', 'whoosh_up', 'whoosh_soft'):
        p = {'swish': (700, 5000, 0.28), 'whoosh': (300, 3500, 0.55), 'whoosh_up': (250, 6000, 0.6), 'whoosh_soft': (300, 2000, 0.7)}[name]
        return noise_sweep(*p)
    if name == 'squeak':
        t = tvec(0.14); return chirp(1300, 1900, 0.14) * np.sin(np.pi * t / 0.14) ** 0.6
    if name == 'squeak_down':
        t = tvec(0.22); return chirp(1900, 700, 0.22, curve=0.7) * np.sin(np.pi * t / 0.22) ** 0.6
    if name == 'tada':
        y = sparkle(7, 0.3, 2, seed + 3)
        t = tvec(len(y) / SR)
        chord = mixl(*[bell(hz(m), len(y) / SR, 0.5) for m in (74, 78, 81, 86)])[:len(t)] * 0.35
        return mixl(y, chord * np.minimum(1, t[:len(chord)] / 0.32) * (t[:len(chord)] >= 0.3))
    if name in ('sparkle', 'shimmer', 'twinkle'):
        n, span, base = {'sparkle': (6, 0.3, 4), 'shimmer': (9, 0.6, 2), 'twinkle': (4, 0.4, 5)}[name]
        return sparkle(n, span, base, seed + 5)
    if name == 'twinkle_in':      # gathers into the loop: rising, swelling sparkle
        y = sparkle(8, 0.42, 2, seed + 9)
        t = tvec(len(y) / SR)
        return y * np.minimum(1, (t + 0.05) / 0.45) ** 1.5
    if name == 'rocket':
        t = tvec(0.75)
        return mixl(0.6 * noise_sweep(200, 4000, 0.75, 1.3), 0.4 * chirp(200, 1400, 0.75, curve=1.6) * np.sin(np.pi * t / 0.75))
    if name == 'puff':
        t = tvec(0.4); return fft_filter(r.standard_normal(len(t)), hi=900) * np.exp(-t * 9) * np.minimum(1, t / 0.02)
    if name == 'harp':
        y = np.zeros(int(1.6 * SR))
        for i, m in enumerate([62, 66, 69, 74, 78, 81, 86, 90, 93]):
            x = pluck(hz(m), 1.0, 1.3, 3.0) * 0.6; o = int(i * 0.045 * SR); y[o:o + len(x)] += x[:len(y) - o]
        return y
    if name == 'swirl':
        t = tvec(0.6)
        f = 700 + 500 * np.sin(2 * np.pi * 3 * t) * (t / 0.6)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.6) * 0.8
    if name == 'spinup':
        t = tvec(0.5)
        f = 150 * (8 ** (t / 0.5))
        ph = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(ph + 2 * np.sin(ph * 0.5)) * (t / 0.5) ** 1.5
    if name == 'shing':
        t = tvec(1.4)
        metal = sum(np.sin(2 * np.pi * f * t + i) * np.exp(-t * (2 + i)) for i, f in enumerate([2637, 3520, 4186, 5274, 6271]))
        return mixl(0.4 * metal + 0.6 * fft_filter(r.standard_normal(len(t)), lo=5000) * np.exp(-t * 14), 0.5 * bell(hz(98), 1.4))
    if name == 'glint':
        return bell(hz(100 + seed % 3), 0.8, 0.6) * 0.8
    if name == 'poof':
        t = tvec(0.55)
        y = fft_filter(r.standard_normal(len(t)), lo=200, hi=2500) * np.exp(-t * 8) * np.minimum(1, t / 0.01)
        sp_ = sparkle(4, 0.2, 6, seed + 2)[:len(t)]
        return mixl(y, 0.5 * sp_)
    if name == 'swoop':
        t = tvec(0.5); return chirp(1600, 380, 0.5, curve=0.6) * np.sin(np.pi * t / 0.5) * 0.8
    if name == 'boop':
        t = tvec(0.22)
        f = 620 - 180 * (t / 0.22)
        ph = 2 * np.pi * np.cumsum(f) / SR
        return (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.sin(np.pi * t / 0.22) ** 0.5
    if name == 'magic':
        y = sparkle(8, 0.5, 3, seed + 21)
        t = tvec(len(y) / SR)
        ch = mixl(*[bell(hz(m), len(y) / SR, 0.4) for m in (81, 86, 90)])[:len(t)]
        return mixl(y, 0.4 * ch * (t[:len(ch)] > 0.45))
    if name == 'confetti':
        y = np.zeros(int(1.0 * SR))
        for k in range(14):
            x = make_sfx('pop', seed + k) * (0.3 + 0.5 * r.random())
            o = int(r.random() * 0.5 * SR); y[o:o + len(x)] += x[:len(y) - o]
        t = tvec(0.5)
        blower = chirp(520, 560, 0.5, shape='tri') * (1 + 0.3 * np.sin(2 * np.pi * 28 * t)) * np.sin(np.pi * t / 0.5) * 0.35
        y[:len(blower)] += blower
        return y
    if name == 'fluff':
        t = tvec(0.35); return fft_filter(r.standard_normal(len(t)), hi=600) * np.exp(-t * 12) * np.minimum(1, t / 0.03)
    if name == 'zip':
        t = tvec(0.18); return chirp(300, 3200, 0.18, curve=1.5) * np.sin(np.pi * t / 0.18) * 0.8
    raise ValueError(name)


# ───────────── arrangement ─────────────
CHORD_NOTES = {'D': [62, 66, 69], 'G': [67, 71, 74], 'A': [69, 73, 76]}
CHORD_ROOT = {'D': 38, 'G': 43, 'A': 45}
UKE = {'D': [69, 74, 78, 81], 'G': [67, 71, 74, 79], 'A': [69, 73, 76, 81]}  # bright high voicings


def melody():
    """(beat, len, midi) for every sung syllable over the loop."""
    out = []
    for line in song['lines']:
        L = song['lines'][line['repeatOf']] if 'repeatOf' in line else line
        for s in L['syllables']:
            out.append((line['start'] + s['beat'], s['len'], s['note']))
    return out


def build_music(glock_tune=True):
    music = np.zeros((2, N))
    chords = song['chords']
    nb = song['beatsPerLoop']
    # intensity per beat: softer goodnight section (beats 40-46), building back into the loop
    inten = np.ones(nb)
    inten[40:46] = 0.72; inten[46:48] = 0.9
    for b in range(nb):
        c = chords[b]; t0 = bt(b); k = inten[b]
        # ukulele: down-strum on the beat, lighter up-strum on the "and"
        for j, m in enumerate(UKE[c]):
            add(music, pluck(hz(m), 1.2, 1.1) * 0.20 * k, t0 + j * 0.011, pan=-0.35)
        for j, m in enumerate(reversed(UKE[c])):
            add(music, pluck(hz(m), 0.8, 0.8, 3.5) * 0.11 * k, t0 + BEAT / 2 + j * 0.008, pan=-0.35)
        # bass: root on 1 and 3, octave pickup on the "and" of 2 and 4
        root = CHORD_ROOT[c]
        if b % 2 == 0: add(music, bass(hz(root), BEAT * 0.9) * 0.55 * k, t0)
        else: add(music, bass(hz(root + 7), BEAT * 0.4) * 0.38 * k, t0)
        if b % 2 == 1: add(music, bass(hz(root + 12), BEAT * 0.35) * 0.3 * k, t0 + BEAT / 2)
        # drums
        if b % 2 == 0: add(music, kick() * 0.75 * k, t0)
        if b % 2 == 1: add(music, snap() * 0.5 * k, t0, pan=0.15)
        for s in range(4):
            add(music, shaker(1.0 if s % 2 else 0.55) * 0.12 * k, t0 + s * BEAT / 4, pan=0.4)
        # marimba arpeggios in the "up above / diamond" lines (beats 16-31) for lift
        if 16 <= b < 32:
            notes = CHORD_NOTES[c]
            for s, m in enumerate([notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 12]):
                add(music, marimba(hz(m)) * 0.16, t0 + s * BEAT / 4, pan=0.45)
    # pad: one chord per two beats (crossfaded)
    for b in range(0, nb, 2):
        c = chords[b]
        add(music, pad_chord([hz(m) for m in CHORD_NOTES[c]], BEAT * 2 + 0.35) * 0.18 * inten[b], bt(b) - 0.1)
    # glockenspiel doubles the tune an octave up
    for beat, ln, m in (melody() if glock_tune else []):
        add(music, glock(hz(m + 12), 1.4 if ln > 1 else 1.0) * (0.15 if ln == 1 else 0.22), bt(beat) + 0.004, pan=0.25)
    return music


def build_sfx():
    sfx = np.zeros((2, N))
    pans = [-0.3, 0.3, -0.15, 0.15, 0.0]
    for i, c in enumerate(song['cues']):
        x = make_sfx(c['sfx'], seed=i)
        x = x / (np.abs(x).max() + 1e-9)
        add(sfx, x * db(c['gain']), bt(c['beat']), pan=pans[i % len(pans)])
    return sfx


def build_adlibs():
    bus = np.zeros((2, N))
    for a in song.get('adlibs', []):
        x, sr = sf.read(os.path.join(STEMS, f"adlib_{a['name']}.wav"))
        add(bus, x * db(a['gain']), bt(a['beat']), pan=a.get('pan', 0.0))
    return bus


def reverb(x, decay=1.4, mix=0.18, seed=3):
    """Circular reverb: exponentially decaying stereo noise IR convolved over two laps."""
    r = np.random.default_rng(seed)
    n = int(decay * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / decay)
        ir = fft_filter(ir, lo=250, hi=7000); ir[:int(0.012 * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        two = np.concatenate([x[ch], x[ch]])
        L = len(two) + n
        y = np.fft.irfft(np.fft.rfft(two, L) * np.fft.rfft(ir, L), L)
        out[ch] = y[N:2 * N]                      # second lap: tails from the end wrap into the start
    return x + mix * out


def eq(x, bands):
    """Zero-phase EQ on a stereo signal. bands: [(centre Hz, gain dB, width in octaves)]; 'hp' = high-pass Hz."""
    out = np.empty_like(x)
    f = np.fft.rfftfreq(x.shape[1], 1 / SR)
    g = np.ones_like(f)
    for c, gain, w in bands:
        if c == 'hp': g *= 1 / (1 + (gain / np.maximum(f, 1)) ** 4); continue
        g *= db(gain * np.exp(-0.5 * (np.log2(np.maximum(f, 1) / c) / w) ** 2))
    for ch in range(x.shape[0]):
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch]) * g, x.shape[1])
    return out


def sliding_min(x, w):
    """min(x[n : n+w]) for every n (circular), van Herk/Gil-Werman in O(n)."""
    n = len(x)
    xp = np.concatenate([x, x[:w]])
    pad = (-len(xp)) % w
    xp = np.concatenate([xp, np.full(pad, np.inf)])
    blocks = xp.reshape(-1, w)
    pre = np.minimum.accumulate(blocks, axis=1).ravel()
    suf = np.minimum.accumulate(blocks[:, ::-1], axis=1)[:, ::-1].ravel()
    i = np.arange(n)
    return np.minimum(suf[i], pre[i + w - 1])


def limiter(x, ceiling_db=-1.5, look_ms=3.0):
    """Look-ahead peak limiter (circular): smooth gain that reaches each peak exactly, no clipping."""
    w = max(2, int(SR * look_ms / 1000))
    peak = np.abs(x).max(axis=0)
    req = np.minimum(1.0, db(ceiling_db) / np.maximum(peak, 1e-9))
    gmin = sliding_min(req, w)                       # forward window: g[n] <= req over the next w samples
    k = np.ones(w) / w                               # box smoothing over the previous w samples
    ext = np.concatenate([gmin[-w:], gmin])
    g = np.convolve(ext, k, 'full')[w: w + len(gmin)]
    # release: let the gain recover gently (moving average over 60 ms of the min-held gain)
    r = int(SR * 0.06)
    held = sliding_min(np.roll(g, r // 2), r)
    ext = np.concatenate([held[-r:], held])
    g2 = np.convolve(ext, np.ones(r) / r, 'full')[r: r + len(held)]
    g = np.minimum(g, g2)
    return x * g, 20 * np.log10(g.min())


def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1]); tp = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)[-1])
    return I, tp


def main():
    lead, _ = sf.read(os.path.join(STEMS, 'vocal_lead.wav'))
    choir, _ = sf.read(os.path.join(STEMS, 'vocal_choir.wav'))
    assert len(lead) == N, 'vocal stems must be exactly one loop long (run scripts/sing.py)'
    vox = np.stack([lead, lead]) * 0.95 + choir.T * 0.42
    music = build_music()
    sfx = build_sfx()
    libs = build_adlibs()
    # duck the music a little under the voice (smooth envelope, circular)
    env = np.abs(lead)
    k = int(0.08 * SR)
    env = np.convolve(np.concatenate([env[-k:], env, env[:k]]), np.ones(k) / k, 'same')[k:-k]
    e = np.clip(env / (np.percentile(env, 95) + 1e-9), 0, 1)
    duck = 1 - 0.4 * e            # music under the voice
    sduck = 1 - 0.55 * e          # sound effects step aside while a word is sung
    # clarity: a pocket in the music/sfx where the voice's consonants live, presence on the voice
    music = eq(music, [(2200, -6, 0.9), ('hp', 35, 0)])
    sfx = eq(sfx, [(2200, -4, 0.9), ('hp', 60, 0)])
    vox = eq(vox, [('hp', 110, 0), (3200, 3, 0.8), (9000, 2, 1.0), (300, -2, 0.8)])
    music_g = music / (np.abs(music).max() + 1e-9) * db(-11)
    sfx_g = sfx / (np.abs(sfx).max() + 1e-9) * db(-14)
    vox_g = vox / (np.abs(vox).max() + 1e-9) * db(-3.5)
    libs_g = libs / (np.abs(libs).max() + 1e-9) * db(-9) if np.abs(libs).max() > 0 else libs
    mix = reverb(music_g * duck, 1.6, 0.16) + reverb(vox_g + libs_g, 1.2, 0.14, 5) + reverb(sfx_g * sduck, 0.9, 0.1, 9)
    os.makedirs(STEMS, exist_ok=True)
    sf.write(os.path.join(STEMS, 'music.wav'), music_g.T.astype(np.float32), SR)
    sf.write(os.path.join(STEMS, 'sfx.wav'), sfx_g.T.astype(np.float32), SR)
    # loudness-normalize to -14 LUFS; a look-ahead limiter keeps true peaks <= -1 dBTP
    tmp = os.path.join(STEMS, '_premaster.wav')
    dst = os.path.join(ROOT, 'audio', 'soundtrack.flac')
    sf.write(tmp, mix.T.astype(np.float32), SR)
    I0, _ = lufs(tmp)
    g = db(-14.0 - I0)
    for it in range(4):
        for ceil_db in (-1.5, -2.0, -2.5, -3.0):
            out, gr = limiter(mix * g, ceil_db)
            sf.write(tmp, out.T.astype(np.float32), SR)
            I2, tp2 = lufs(tmp)
            if tp2 <= -1.0: break
        if abs(I2 + 14.0) < 0.1: break
        g *= db(-14.0 - I2)
    sf.write(dst, out.T.astype(np.float32), SR, format='FLAC', subtype='PCM_24')
    I2, tp2 = lufs(dst)
    os.remove(tmp)
    print(f'master: premix {I0:.1f} LUFS, make-up gain {20 * np.log10(g):+.1f} dB, peak limiting {gr:.1f} dB')
    seam = np.abs(out[:, 0] - out[:, -1]).max()
    print(f'soundtrack: {LOOP:.3f} s loop, {I2:.1f} LUFS, true peak {tp2:.1f} dBTP, seam jump {seam:.4f} → {dst}')


if __name__ == '__main__':
    main()
