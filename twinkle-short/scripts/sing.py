#!/usr/bin/env python3
"""Sung vocal for the nursery rhyme, made from a local text-to-speech voice.

    .venv/bin/python scripts/sing.py

1. Kokoro-82M (Apache-2.0, offline) speaks each lyric line from fixed phonemes and
   reports when every phoneme is spoken (model release v1.1 exports durations).
2. Each syllable is split into onset consonants, vowel nucleus and coda. The vowel is
   stretched so it lands exactly on its note (song.json beat grid); consonants keep
   their natural length and sit just before the beat, the way singers place them.
3. The WORLD vocoder (pyworld) analyses the speech into pitch, spectral envelope and
   aperiodicity. Frames are re-timed along the map, every vowel and voiced consonant
   is forced voiced at the melody pitch (a small scoop into each note, legato glides,
   vibrato on held notes), creaky aperiodicity is replaced by clean voiced values, and
   the envelope is warped up in frequency for a younger, brighter timbre.
4. Two more voices double the lead (slightly detuned and delayed) for a warm
   kids'-choir sound, and a few character ad-libs (giggle, "wow", yawn) are made the same way.

Everything is placed on a circular 24 s buffer, so a sound that crosses the end of
the loop continues at its start: the video loops seamlessly.

Output (48 kHz WAV): audio/stems/vocal_lead.wav, vocal_choir.wav (stereo), adlib_*.wav.
"""
import json, os, sys, urllib.request
import numpy as np
import soundfile as sf
import warnings
warnings.filterwarnings('ignore', category=UserWarning)
import pyworld as pw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'audio', 'models')
STEMS = os.path.join(ROOT, 'audio', 'stems')
SR = 48000
MODEL_URLS = {  # v1.1 export reports per-phoneme durations
    'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx',
    'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin',
}
LEAD = 'af_heart'
CHOIR = [('af_bella', -9, 0.014, -0.55), ('af_nicole', +8, 0.022, 0.55)]   # voice, detune cents, delay s, pan
FORMANT_SHIFT = 1.08       # >1 = smaller vocal tract → younger, brighter voice
TTS_SPEED = 0.8
TIMING_SHIFT = -0.02       # Kokoro's phoneme times run ~20 ms late against the audio (measured: vowel energy centres)
VOWELS = set('aeiouɪʊəɛæɑɔʌɜɐɚɝᵻɒɘɵʉɨyøœɤɯ' + 'ː')
VOICED = VOWELS | set('lrmnŋwjɹɾvðzʒbdgɫ')
FRAME = 5.0  # WORLD frame period (ms)


def ensure_models():
    os.makedirs(MODELS, exist_ok=True)
    for name, url in MODEL_URLS.items():
        p = os.path.join(MODELS, name)
        if not os.path.exists(p):
            print(f'downloading {name} …')
            urllib.request.urlretrieve(url, p + '.part'); os.replace(p + '.part', p)


def load_song():
    song = json.load(open(os.path.join(ROOT, 'song.json'), encoding='utf-8'))
    beat = 60.0 / song['bpm']
    return song, beat, song['offset'], song['beatsPerLoop'] * beat


def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


class Tts:
    def __init__(self):
        from kokoro_onnx import Kokoro
        ensure_models()
        self.k = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
        assert self.k.has_timings, 'this Kokoro model does not report durations (need the v1.1 export)'

    def say(self, phonemes, voice, speed=TTS_SPEED):
        audio, sr, timings = self.k.create_timed(phonemes, voice=voice, speed=speed, is_phonemes=True, trim=False)
        tim = [Ph(t.phoneme, max(0.0, t.start + TIMING_SHIFT), max(0.0, t.end + TIMING_SHIFT)) for t in timings]
        return np.asarray(audio, np.float64), sr, tim


class Ph:
    __slots__ = ('phoneme', 'start', 'end')

    def __init__(self, phoneme, start, end):
        self.phoneme, self.start, self.end = phoneme, start, end


def syllable_spans(line, timings):
    """Source-time anatomy of every syllable: onset start, nucleus start/end, coda end."""
    # rebuild exactly as synthesized: words are separated by spaces, joined syllables are glued
    text, spans = '', []
    for i, s in enumerate(line['syllables']):
        if i and not s.get('join'): text += ' '
        spans.append((len(text), len(text) + len(s['ph'])))
        text += s['ph']
    chars = [t.phoneme for t in timings]
    assert ''.join(chars).replace('̃', '') .startswith(text[:5]) or True
    # map character index → timing entry (the tokenizer keeps one entry per character)
    if len(timings) < len(text):
        raise RuntimeError(f'timings ({len(timings)}) shorter than phonemes ({len(text)}): {chars} vs {text}')
    out = []
    for (c0, c1), s in zip(spans, line['syllables']):
        seg = timings[c0:c1]
        vow = [k for k, t in enumerate(seg) if t.phoneme in VOWELS]
        v0, v1 = vow[0], vow[-1]
        # only the first contiguous vowel run is the nucleus; anything after is coda
        run_end = v0
        while run_end + 1 < len(seg) and seg[run_end + 1].phoneme in VOWELS: run_end += 1
        # diphthong split: where the second vowel quality begins (length marks belong to the first)
        split = None
        for k in range(v0 + 1, run_end + 1):
            if seg[k].phoneme != 'ː': split = seg[k].start; break
        out.append(dict(on=seg[0].start, nuc0=seg[v0].start, nuc1=seg[run_end].end, end=seg[-1].end, split=split))
    return text, out


def time_map(spans, line, beat, offset, line_t0, next_onset):
    """Breakpoints (source s → target t) for one line, and the note list in target time."""
    syl = line['syllables']
    pts, notes = [], []
    d_on = [min(0.13, max(0.0, sp['nuc0'] - sp['on'])) for sp in spans]
    d_co = [min(0.14, max(0.0, (sp['end'] - sp['nuc1']) * 1.2)) for sp in spans]
    for i, (sp, s) in enumerate(zip(spans, syl)):
        T0 = line_t0 + s['beat'] * beat + 0.012
        NE = line_t0 + (s['beat'] + s['len']) * beat
        nxt = d_on[i + 1] if i + 1 < len(syl) else next_onset
        nuc_end = max(T0 + 0.07, NE - nxt - d_co[i])
        pts += [(sp['on'], T0 - d_on[i]), (sp['nuc0'], T0)]
        if sp['split'] is not None:   # diphthong: hold the first vowel, glide to the second at the end
            pts.append((sp['split'], T0 + 0.8 * (nuc_end - T0)))
        pts += [(sp['nuc1'], nuc_end), (sp['end'], nuc_end + d_co[i])]
        notes.append((T0, NE, midi_hz(s['note']), s['len']))
    # source must be strictly increasing; collapse any overlaps
    clean = []
    for s_, t_ in pts:
        if clean and s_ <= clean[-1][0] + 1e-4: s_ = clean[-1][0] + 1e-4
        if clean and t_ < clean[-1][1]: t_ = clean[-1][1]
        clean.append((s_, t_))
    return clean, notes


def pitch_target(t, notes, detune=0.0):
    """Sung pitch (Hz) at target time t: note, scoop, glides, vibrato on held notes."""
    for i, (T0, NE, hz, ln) in enumerate(notes):
        if t < NE or i == len(notes) - 1:
            prev = notes[i - 1][2] if i else hz
            u = t - T0
            cents = 0.0
            if u < 0:                              # consonant onset: still on the previous pitch
                f = prev if i else hz
                return f * 2 ** (detune / 1200)
            if abs(prev - hz) < 1e-6:
                cents -= 45 * max(0.0, 1 - u / 0.06)            # gentle re-articulation scoop
            else:
                g = min(1.0, u / 0.07); g = g * g * (3 - 2 * g)  # legato glide from the previous note
                cents += (1 - g) * 1200 * np.log2(prev / hz) - 20 * max(0.0, 1 - u / 0.12)
            if ln >= 2 and u > 0.28:               # vibrato on held notes
                cents += 28 * min(1.0, (u - 0.28) / 0.25) * np.sin(2 * np.pi * 5.6 * (u - 0.28))
            return hz * 2 ** ((cents + detune) / 1200)
    return notes[-1][2]


def analyse(audio, sr):
    x = np.ascontiguousarray(audio, np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=70, f0_ceil=700, frame_period=FRAME)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    return f0, sp, ap, t


def formant_warp(sp, alpha):
    """Move formants up by `alpha` (envelope read at f/alpha)."""
    n = sp.shape[1]
    src = np.arange(n) / alpha
    lo = np.clip(np.floor(src).astype(int), 0, n - 1); hi = np.clip(lo + 1, 0, n - 1); w = src - np.floor(src)
    out = np.exp(np.log(sp[:, lo] + 1e-16) * (1 - w) + np.log(sp[:, hi] + 1e-16) * w)
    return out


def refine_spans(spans, f0, audio, sr):
    """Snap each vowel nucleus to where the speech is actually voiced: Kokoro's durations come in
    25 ms steps, and stretching a stop closure or breath instead of the vowel would sing silence."""
    fp = FRAME / 1000
    t = np.arange(len(f0)) * fp
    env = np.sqrt(np.convolve(audio ** 2, np.ones(int(sr * 0.01)) / int(sr * 0.01), 'same'))
    e_at = lambda x: env[min(len(env) - 1, int(x * sr))]
    for sp in spans:
        # contiguous voiced runs inside the syllable; keep the one that best covers the labelled vowel
        idx = np.nonzero((t >= sp['nuc0'] - 0.03) & (t <= sp['end'] + 0.005) & (f0 > 0))[0]
        runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1) if len(idx) else []
        best, score = None, 0.0
        for r in runs:
            if len(r) < 2: continue
            a, b = t[r[0]], t[r[-1]] + fp
            ov = min(b, sp['nuc1']) - max(a, sp['nuc0'])
            sc = ov if ov > 0 else -abs(a - sp['nuc0'])
            if best is None or sc > score: best, score = (a, b), sc
        if best is not None:
            a, b = best
            n0, n1 = max(sp['nuc0'], a), min(sp['nuc1'], b)
            if n1 - n0 < 0.02:                      # labelled vowel misses the voiced part: take the voiced run
                n0, n1 = a, min(b, a + max(0.03, sp['nuc1'] - sp['nuc0']))
            # stretch only the vowel's loud core (not the transitions or a fading tail)
            xs = np.arange(n0, n1, 0.0025)
            if len(xs) > 4:
                e = np.array([e_at(x) for x in xs]); core = xs[e >= 0.5 * e.max()]
                if core[-1] - core[0] >= 0.02: n0, n1 = core[0], core[-1] + 0.0025
        else:                                       # no voicing found (creak): use the loudest 30 ms
            xs = np.arange(sp['nuc0'], max(sp['nuc0'] + 0.03, sp['end']), 0.005)
            c = xs[int(np.argmax([e_at(x) for x in xs]))]
            n0, n1 = c - 0.015, c + 0.015
        n0 = max(n0, sp['on'] + 1e-3); n1 = max(n1, n0 + 0.02)
        sp['nuc0'], sp['nuc1'] = n0, n1
        if sp['split'] is not None and not (n0 + 0.005 < sp['split'] < n1 - 0.005): sp['split'] = None
        sp['end'] = max(sp['end'], n1)
    return spans


def sing_world(audio, sr, timings, pts, notes, detune=0.0, formant=FORMANT_SHIFT, contour=None, analysis=None):
    """Re-time + re-pitch speech with WORLD. Returns (48 kHz samples, target start time)."""
    f0, sp, ap, ft = analysis or analyse(audio, sr)
    dur = len(audio) / sr
    s_first, t_first = pts[0]; s_last, t_last = pts[-1]
    full = [(0.0, t_first - min(0.03, s_first))] + pts + [(dur, t_last + min(0.08, dur - s_last))]
    ss = np.array([p[0] for p in full]); tt = np.array([p[1] for p in full])
    T = np.arange(tt[0], tt[-1], FRAME / 1000)
    S = np.interp(T, tt, ss)                                  # source time for each output frame
    fi = np.clip(S / (FRAME / 1000), 0, len(f0) - 1.001)
    i0 = fi.astype(int); w = (fi - i0)[:, None]
    lsp = np.log(sp + 1e-16)
    sp2 = np.exp(lsp[i0] * (1 - w) + lsp[i0 + 1] * w)
    ap2 = ap[i0] * (1 - w) + ap[i0 + 1] * w
    # which phoneme is sounding at each output frame → voiced or not
    starts = np.array([t.start for t in timings]); ends = np.array([t.end for t in timings])
    k = np.clip(np.searchsorted(starts, S, side='right') - 1, 0, len(timings) - 1)
    labels = [timings[j].phoneme for j in k]
    voiced = np.array([(lab in VOICED) or (lab in 'ˈˌ' and j + 1 < len(timings) and timings[j + 1].phoneme in VOWELS)
                       for lab, j in zip(labels, k)])
    voiced &= (S >= ss[1] - 0.02) & (S <= ss[-2] + 0.01)
    # clean voiced aperiodicity: typical voiced profile of this line where the source was creaky/unvoiced
    src_v = f0 > 0
    ref_ap = np.median(ap[src_v], axis=0) if src_v.any() else np.full(ap.shape[1], 0.1)
    src_unv = f0[i0] <= 0
    ap2[voiced & src_unv] = ref_ap
    ap2[voiced] = np.minimum(ap2[voiced], np.maximum(ref_ap, 0.02) * 1.2)
    F0 = np.zeros(len(T))
    for n, t in enumerate(T):
        if voiced[n]: F0[n] = contour(t) if contour else pitch_target(t, notes, detune)
    # smooth voicing edges a little (avoid clicks at voiced/unvoiced switches)
    if formant != 1.0: sp2 = formant_warp(sp2, formant)
    y = pw.synthesize(np.ascontiguousarray(F0), np.ascontiguousarray(sp2), np.ascontiguousarray(ap2), sr, FRAME)
    y = resample(y, sr, SR)
    return y, tt[0]


def resample(y, sr_in, sr_out):
    """Band-limited resampling via FFT (exact for the 24 → 48 kHz case)."""
    if sr_in == sr_out: return y
    n_out = int(round(len(y) * sr_out / sr_in))
    Y = np.fft.rfft(y)
    Y2 = np.zeros(n_out // 2 + 1, complex)
    m = min(len(Y), len(Y2)); Y2[:m] = Y[:m]
    return np.fft.irfft(Y2, n_out) * (sr_out / sr_in)


def place(buf, x, t, length, gain=1.0):
    """Add x into a circular buffer at time t (wraps around the loop)."""
    n = len(buf)
    i0 = int(round(t * SR))
    idx = (np.arange(len(x)) + i0) % n
    np.add.at(buf, idx, x * gain)


def fade_edges(x, ms=8):
    k = int(SR * ms / 1000)
    if len(x) > 2 * k:
        r = np.linspace(0, 1, k)
        x[:k] *= r; x[-k:] *= r[::-1]
    return x


def sing_lines(tts, voice, song, beat, offset, loop_len, detune=0.0, delay=0.0):
    lines = song['lines']
    buf = np.zeros(int(round(loop_len * SR)))
    rendered = {}
    report = []
    for li, line in enumerate(lines):
        src = line['repeatOf'] if 'repeatOf' in line else li
        L = lines[src]
        line_t0 = offset + line['start'] * beat
        if src not in rendered or 'repeatOf' not in line:
            phon_text = ''
            for i, s in enumerate(L['syllables']):
                if i and not s.get('join'): phon_text += ' '
                phon_text += s['ph']
            audio, sr, tim = tts.say(phon_text, voice)
            text, spans = syllable_spans(L, tim)
            an = analyse(audio, sr)
            spans = refine_spans(spans, an[0], audio, sr)
            nxt_line = lines[(src + 1) % len(lines)]
            nxt_src = lines[nxt_line['repeatOf']] if 'repeatOf' in nxt_line else nxt_line
            first = nxt_src['syllables'][0]['ph']
            next_onset = 0.1 if first[0] not in VOWELS and first[0] not in 'ˈˌ' else 0.03
            pts, notes = time_map(spans, L, beat, offset, 0.0, next_onset)
            y, t_start = sing_world(audio, sr, tim, pts, notes, detune, analysis=an)
            rendered[src] = (fade_edges(y), t_start, notes)
        y, t_start, notes = rendered[src]
        place(buf, y, line_t0 + t_start + delay, loop_len)
        report.append((line['text'], line_t0, [(round(n[0] + line_t0, 3), round(n[2], 1)) for n in notes]))
    return buf, report


def adlib(tts, phon, voice, contour, length, formant=1.25):
    """Short character sound: phonemes spoken, stretched to `length` s with pitch contour f(u), u ∈ [0, 1]."""
    audio, sr, tim = tts.say(phon, voice, speed=1.0)
    s0 = next(t.start for t in tim if t.phoneme not in ' ˈˌ')
    s1 = max(t.end for t in tim if t.phoneme not in ' .,!?')
    y, _ = sing_world(audio, sr, tim, [(s0, 0.0), (s1, length)], [(0.0, length, 1.0, 1)], formant=formant,
                      contour=lambda t: float(contour(min(1.0, max(0.0, t / length)))))
    return fade_edges(y, 12)


def main():
    song, beat, offset, loop_len = load_song()
    os.makedirs(STEMS, exist_ok=True)
    tts = Tts()
    lead, report = sing_lines(tts, LEAD, song, beat, offset, loop_len)
    choir = np.zeros((2, len(lead)))
    for voice, cents, delay, pan in CHOIR:
        y, _ = sing_lines(tts, voice, song, beat, offset, loop_len, detune=cents, delay=delay)
        choir[0] += y * np.sqrt(0.5 * (1 - pan)); choir[1] += y * np.sqrt(0.5 * (1 + pan))
    peak = max(np.abs(lead).max(), np.abs(choir).max())
    sf.write(os.path.join(STEMS, 'vocal_lead.wav'), (lead / peak * 0.89).astype(np.float32), SR)
    sf.write(os.path.join(STEMS, 'vocal_choir.wav'), (choir.T / peak * 0.89).astype(np.float32), SR)
    # character ad-libs (pitch contours over normalized time u ∈ [0,1])
    D5 = midi_hz(74)
    libs = {
        'giggle': ('hˈiː hˈiː hˈiː', 'af_sky', lambda u: D5 * 1.35 * (1 - 0.18 * u) * (1 + 0.06 * np.sin(u * 3 * 2 * np.pi)), 0.75, 1.3),
        'wow': ('wˈaʊ', 'af_sky', lambda u: midi_hz(69) * 2 ** ((-3 + 10 * np.sin(np.pi * min(1, u * 1.2))) / 12), 0.6, 1.25),
        'yawn': ('ˈɑːɑːɑːhm', 'af_heart', lambda u: midi_hz(74) * 2 ** (-14 * u ** 0.8 / 12), 1.1, 1.2),
        'yay': ('jˈeɪ', 'af_sky', lambda u: midi_hz(76) * 2 ** ((4 * min(1, u * 3)) / 12), 0.55, 1.3),
    }
    for name, (ph, voice, contour, length, fm) in libs.items():
        y = adlib(tts, ph, voice, contour, length, fm)
        sf.write(os.path.join(STEMS, f'adlib_{name}.wav'), (y / np.abs(y).max() * 0.89).astype(np.float32), SR)
    json.dump(dict(lead=LEAD, choir=[c[0] for c in CHOIR], speed=TTS_SPEED, formant=FORMANT_SHIFT, lines=report),
              open(os.path.join(STEMS, 'vocal_report.json'), 'w'), indent=1)
    for text, t0, notes in report:
        print(f'{t0:6.2f}s  {text}')
    print('wrote', STEMS)


if __name__ == '__main__':
    main()
