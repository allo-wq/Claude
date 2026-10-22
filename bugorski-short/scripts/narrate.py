#!/usr/bin/env python3
"""Generate the voiceover locally with Kokoro-82M (Apache-2.0, ONNX, no API key).

    .venv/bin/python scripts/narrate.py [--voice af_heart] [--target 48.0]

1. Reads the narration lines from src/timeline.js (the master timeline).
2. Synthesises clause units (fragments without end punctuation are merged with the
   next line so a sentence is never cut mid-phrase), fixing pronunciations with a
   small phoneme lexicon.
3. Chooses one global speaking rate so the finished voiceover (natural pauses
   included) lands on the target length, then lays the clauses out back to back.
4. Writes audio/narration_voice.flac and src/narrationTiming.js. The latter holds
   the MEASURED start time of every narration line; the animation timeline is
   time-warped onto those times, so each visual cue lands on its spoken words.
"""
import argparse, json, os, re, subprocess, sys, urllib.request
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'audio', 'models')
MODEL_URLS = {
    'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
    'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
}
SR_OUT = 48000

# Text fixes before phonemisation, then phoneme fixes after it (espeak defaults
# read "1978" as "nineteen hundred seventy-eight" and "Bugorski" as "bew-").
TEXT_FIXES = {'1978': 'nineteen seventy-eight'}
# Each fix was verified by transcribing the synthesized audio with two independent
# speech recognisers (scripts/check_narration.py): both must hear the scripted words.
PHONEME_FIXES = {
    'ˈænɐtˌɑːli': 'ˌɑːnɑːtˈoʊli',        # Anatoli → "ah-nah-TOH-lee" (was heard as "and a totally")
    'bjuːɡˈɔːɹski': 'buːɡˈɔːɹski',        # Bugorski → "boo-GOR-skee"
    'fˈeɪs fɹˈoʊz': 'fˈeɪs, fɹˈoʊz',      # tiny break so "face froze" isn't heard as "base rows"
}

LEAD = 0.12   # silence before the first word
TAIL = 1.25   # final shot holds after the last word


def pause_after(text, next_section_changes):
    t = text.rstrip()
    if t.endswith('...'): return 0.3
    if t.endswith('?'): return 0.34
    if t.endswith(','): return 0.08
    return 0.4 if next_section_changes else 0.22


def read_narration():
    src = open(os.path.join(ROOT, 'src', 'timeline.js'), encoding='utf-8').read()
    rows = re.findall(r"\{ start: ([\d.]+), end: ([\d.]+), section: '(\w+)', text: (\"|')(.+?)\4 \}", src)
    lines = [dict(start=float(a), end=float(b), section=c, text=e.replace("\\'", "'")) for a, b, c, _, e in rows]
    if not lines: sys.exit('could not parse NARRATION from src/timeline.js')
    return lines


def ensure_models():
    os.makedirs(MODELS, exist_ok=True)
    for name, url in MODEL_URLS.items():
        path = os.path.join(MODELS, name)
        if not os.path.exists(path) or os.path.getsize(path) < 1_000_000:
            print(f'downloading {name} …')
            urllib.request.urlretrieve(url, path + '.part')
            os.replace(path + '.part', path)


ASR_DIR = os.path.join(MODELS, 'sherpa-onnx-zipformer-en-2023-06-26')
_rec = None


def asr_word_starts(clip24k, parts):
    """Start time (s, within clip) of the first word of parts[1:], via Zipformer token timestamps."""
    global _rec
    if not os.path.isdir(ASR_DIR): return None
    try:
        import sherpa_onnx
    except ImportError:
        return None
    if _rec is None:
        _rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=f'{ASR_DIR}/encoder-epoch-99-avg-1.onnx', decoder=f'{ASR_DIR}/decoder-epoch-99-avg-1.onnx',
            joiner=f'{ASR_DIR}/joiner-epoch-99-avg-1.onnx', tokens=f'{ASR_DIR}/tokens.txt', num_threads=4)
    pad = 0.5
    x = np.interp(np.arange(0, len(clip24k), 1.5), np.arange(len(clip24k)), clip24k).astype(np.float32)
    x = np.concatenate([np.zeros(int(pad * 16000), np.float32), x, np.zeros(int(pad * 16000), np.float32)])
    st = _rec.create_stream(); st.accept_waveform(16000, x); _rec.decode_stream(st)
    toks, ts = st.result.tokens, st.result.timestamps
    starts = [(ts[i] - pad) for i, tk in enumerate(toks) if tk.startswith(('▁', ' '))]  # word-initial tokens
    out, idx = [], 0
    for part in parts[:-1]:
        idx += len(re.sub(r"[^A-Za-z0-9' ]", ' ', part.replace('1978', 'nineteen seventy eight')).split())
        if idx >= len(starts): return None
        out.append(round(max(0.0, starts[idx]), 3))
    return out


def build_units(lines):
    """Group lines into clause units; a line without end punctuation joins the next."""
    units, cur = [], []
    for i, L in enumerate(lines):
        cur.append(i)
        if re.search(r'[.,!?;:]$|\.\.\.$', L['text'].strip()):
            units.append(cur); cur = []
    if cur: units.append(cur)
    return units


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='af_heart')
    ap.add_argument('--target', type=float, default=49.5, help='target total length in seconds (script says ~48 s)')
    ap.add_argument('--speed', type=float, default=None, help='force a speaking rate instead of fitting the target')
    args = ap.parse_args()

    ensure_models()
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
    lines = read_narration()
    units = build_units(lines)

    def phonemes(text):
        for a, b in TEXT_FIXES.items(): text = text.replace(a, b)
        p = kokoro.tokenizer.phonemize(text, 'en-us')
        for a, b in PHONEME_FIXES.items(): p = p.replace(a, b)
        return p

    unit_text = [' '.join(lines[i]['text'] for i in u) for u in units]
    unit_ph = [phonemes(t) for t in unit_text]
    pauses = []
    for ui, u in enumerate(units):
        last = lines[u[-1]]
        nxt = lines[units[ui + 1][0]] if ui + 1 < len(units) else None
        pauses.append(0.0 if nxt is None else pause_after(last['text'], nxt['section'] != last['section']))

    def synth(speed):
        return [kokoro.create(p, voice=args.voice, speed=speed, is_phonemes=True)[0] for p in unit_ph]

    # Fit one global speaking rate to the target length (two passes is plenty).
    speed = args.speed or 1.1
    clips = synth(speed)
    if args.speed is None:
        for _ in range(2):
            speech = sum(len(c) for c in clips) / 24000
            budget = args.target - LEAD - TAIL - sum(pauses)
            new = float(np.clip(speed * speech / budget, 0.95, 1.2))  # >1.2 starts to sound rushed
            if abs(new - speed) < 0.01: break
            speed = new
            clips = synth(speed)

    # Lay the clauses out and measure where every narration line starts.
    t = LEAD
    timing = []
    voice = []
    for ui, (u, clip) in enumerate(zip(units, clips)):
        dur = len(clip) / 24000
        # Inner line starts of a merged unit: measured with ASR word timestamps when
        # the recogniser is installed, otherwise estimated from phoneme lengths.
        lens = [len(phonemes(lines[i]['text'])) for i in u]
        bounds = [dur * sum(lens[:k]) / sum(lens) for k in range(len(u))] + [dur]
        if len(u) > 1:
            measured = asr_word_starts(clip, [lines[i]['text'] for i in u])
            if measured: bounds[1:-1] = measured; print(f'  measured inner boundaries {measured} for: {unit_text[ui]}')
        # audible onset of the clip (first 10 ms frame within 30 dB of its peak)
        fr = clip[: len(clip) // 240 * 240].reshape(-1, 240)
        rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
        bounds[0] = float(np.nonzero(rms > rms.max() * 0.0316)[0][0]) * 0.01
        for k, i in enumerate(u):
            timing.append(dict(text=lines[i]['text'], designStart=lines[i]['start'], designEnd=lines[i]['end'],
                               start=round(t + bounds[k], 3), speechEnd=round(t + bounds[k + 1], 3)))
        voice.append((t, clip))
        t += dur + pauses[ui]
    duration = round(np.ceil((t + TAIL) * 30) / 30, 4)  # whole number of frames

    # Assemble at 24 kHz, then resample to 48 kHz with ffmpeg (soxr).
    buf = np.zeros(int(round(duration * 24000)) + 1, dtype=np.float32)
    for start, clip in voice:
        i = int(round(start * 24000)); buf[i:i + len(clip)] += clip
    buf = buf / max(1e-6, np.abs(buf).max()) * 0.891  # peak -1 dBFS
    os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
    tmp = os.path.join(ROOT, 'audio', '_voice24k.wav')
    out = os.path.join(ROOT, 'audio', 'narration_voice.flac')
    sf.write(tmp, buf, 24000, subtype='FLOAT')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', 'aresample=48000:resampler=soxr', '-t', str(duration), '-c:a', 'flac', '-sample_fmt', 's16', out], check=True)
    os.remove(tmp)

    meta = dict(voice=args.voice, model='Kokoro-82M v1.0 (Apache-2.0)', speed=round(speed, 4), duration=duration,
                designDuration=48.0, lines=timing)
    js = ('// GENERATED by scripts/narrate.py — measured start of every narration line in the\n'
          '// synthesized voiceover. src/timeline.js time-warps the animation onto these times.\n'
          f'export const NARRATION_TIMING = {json.dumps(meta, indent=2, ensure_ascii=False)};\n')
    open(os.path.join(ROOT, 'src', 'narrationTiming.js'), 'w', encoding='utf-8').write(js)

    print(f'voice {args.voice}  speed {speed:.3f}  duration {duration:.3f}s  → audio/narration_voice.flac, src/narrationTiming.js')
    for L in timing:
        print(f"  design {L['designStart']:5.2f} → spoken {L['start']:6.2f}–{L['speechEnd']:6.2f}  {L['text']}")


if __name__ == '__main__':
    main()
