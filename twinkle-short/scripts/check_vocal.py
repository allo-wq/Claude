#!/usr/bin/env python3
"""QA for the sung vocal: pitch accuracy per note and intelligibility (offline ASR).

    .venv/bin/python scripts/check_vocal.py [audio/stems/vocal_lead.wav]
"""
import json, os, sys
import numpy as np
import soundfile as sf
import parselmouth

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASR_MODEL = 'base.en' if os.path.isdir(os.path.join(ROOT, 'audio', 'models', 'sherpa-onnx-whisper-base.en')) else 'tiny.en'
ASR = os.path.join(ROOT, 'audio', 'models', f'sherpa-onnx-whisper-{ASR_MODEL}')


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'audio', 'stems', 'vocal_lead.wav')
    y, sr = sf.read(path)
    if y.ndim > 1: y = y.mean(1)
    song = json.load(open(os.path.join(ROOT, 'song.json'), encoding='utf-8'))
    beat = 60 / song['bpm']; off = song['offset']
    snd = parselmouth.Sound(y, sampling_frequency=sr)
    pitch = snd.to_pitch_ac(time_step=0.005, pitch_floor=120, pitch_ceiling=900)
    times = pitch.xs(); f0 = pitch.selected_array['frequency']
    errs, rows = [], []
    for line in song['lines']:
        L = song['lines'][line.get('repeatOf', song['lines'].index(line))]
        t0 = off + line['start'] * beat
        for s in L['syllables']:
            a = t0 + s['beat'] * beat + 0.09; b = t0 + (s['beat'] + s['len']) * beat - 0.12
            sel = (times >= a) & (times <= b) & (f0 > 0)
            target = 440 * 2 ** ((s['note'] - 69) / 12)
            if sel.sum() < 3:
                rows.append((s['t'], target, None)); continue
            med = np.median(f0[sel]); c = 1200 * np.log2(med / target)
            errs.append(abs(c)); rows.append((s['t'], target, c))
    print('syllable  target   error (cents)')
    for t, tg, c in rows: print(f'  {t:6s} {tg:7.1f}  {"unvoiced" if c is None else f"{c:+6.1f}"}')
    print(f'notes measured {len(errs)}/{len(rows)}; median |error| {np.median(errs):.1f} cents, max {np.max(errs):.1f}')
    # intelligibility: Whisper tiny on 16 kHz audio, line by line
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f'{ASR}/{ASR_MODEL}-encoder.int8.onnx', decoder=f'{ASR}/{ASR_MODEL}-decoder.int8.onnx',
                                                     tokens=f'{ASR}/{ASR_MODEL}-tokens.txt', num_threads=4)
    print(f'intelligibility (Whisper {ASR_MODEL}, line by line):')
    y16 = parselmouth.Sound(y, sampling_frequency=sr).resample(16000).values[0].astype(np.float32)
    for line in song['lines']:
        a = off + line['start'] * beat - 0.15; b = a + 8 * beat + 0.1
        seg = y16[max(0, int(a * 16000)): int(b * 16000)]
        st = rec.create_stream(); st.accept_waveform(16000, seg); rec.decode_stream(st)
        print(f'  {line["text"]:32s} → {st.result.text.strip()}')


if __name__ == '__main__':
    main()
