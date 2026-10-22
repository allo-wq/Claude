#!/usr/bin/env python3
"""QA for the voiceover (no human listening required).

    .venv/bin/python scripts/check_narration.py [audio/narration_voice.flac | audio/soundtrack.flac | video.mp4]

* Transcribes every narration line with TWO independent offline speech recognisers
  (sherpa-onnx Zipformer transducer + Whisper tiny.en; downloaded from GitHub
  releases on first use) and compares the words with the script. A word only counts
  as a problem when BOTH recognisers miss it — that separates real pronunciation or
  masking problems from one model's quirks.
* Measures each line's audible onset and compares it with src/narrationTiming.js
  (the times the animation is warped to).
"""
import json, os, re, subprocess, sys, tarfile, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'audio', 'models')
ZIP, WHI = 'sherpa-onnx-zipformer-en-2023-06-26', 'sherpa-onnx-whisper-tiny.en'
NUM = {'1978': 'nineteen seventy eight', 'phd': 'p h d'}
SAME = {'travelling': 'traveling', 'sons': 'suns', 'anatoly': 'anatoli', 'bugorsky': 'bugorski', 'bogorski': 'bugorski'}


def fetch(name):
    d = os.path.join(MODELS, name)
    if not os.path.isdir(d):
        print(f'downloading {name} …')
        tmp = d + '.tar.bz2'
        urllib.request.urlretrieve(f'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{name}.tar.bz2', tmp)
        tarfile.open(tmp).extractall(MODELS); os.remove(tmp)
    return d


def words(s):
    s = s.lower().replace('-', ' ')
    for a, b in NUM.items(): s = s.replace(a, b)
    return [SAME.get(w, w) for w in re.sub(r"[^a-z' ]", ' ', s).split()]


def missing(expected, heard):
    """Script words not found (in order) in the transcript."""
    out, j = set(), 0
    for i, w in enumerate(expected):
        k = next((k for k in range(j, len(heard)) if heard[k] == w), None)
        if k is None: out.add(i)
        else: j = k + 1
    return out


def main():
    src_audio = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'audio', 'narration_voice.flac')
    import sherpa_onnx
    z, w = fetch(ZIP), fetch(WHI)
    zr = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=f'{z}/encoder-epoch-99-avg-1.onnx', decoder=f'{z}/decoder-epoch-99-avg-1.onnx',
        joiner=f'{z}/joiner-epoch-99-avg-1.onnx', tokens=f'{z}/tokens.txt', num_threads=4)
    wr = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=f'{w}/tiny.en-encoder.onnx', decoder=f'{w}/tiny.en-decoder.onnx', tokens=f'{w}/tiny.en-tokens.txt', num_threads=4)

    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src_audio, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    src = open(os.path.join(ROOT, 'src', 'narrationTiming.js'), encoding='utf-8').read()
    timing = json.loads(src[src.index('{'):src.rindex('}') + 1])
    lines = timing['lines']

    def asr(rec, seg):
        st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([seg, np.zeros(4000, np.float32)])); rec.decode_stream(st)
        return st.result.text.strip()

    total = bad = 0
    worst = 0.0
    for i, L in enumerate(lines):
        a = max(0.0, L['start'] - 0.12)
        b = (lines[i + 1]['start'] if i + 1 < len(lines) else timing['duration']) + 0.05
        seg = audio[int(a * 16000):int(b * 16000)]
        tz, tw = asr(zr, seg), asr(wr, seg)
        exp = words(L['text'])
        both = missing(exp, words(tz)) & missing(exp, words(tw))
        total += len(exp); bad += len(both)
        # audible onset: first 10 ms frame within 30 dB of the line's peak (lines that start
        # mid-sentence have no silence before them; their start was measured by ASR)
        fr = seg[: len(seg) // 160 * 160].reshape(-1, 160)
        rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
        on = np.nonzero(rms > rms.max() * 0.0316)[0]
        mid = i > 0 and not re.search(r'[.,!?;:]$', lines[i - 1]['text'].strip())
        onset = L['start'] if mid or not len(on) else a + on[0] * 0.01
        worst = max(worst, abs(onset - L['start']))
        flag = f'   ← both missed: {", ".join(exp[k] for k in sorted(both))}' if both else ''
        print(f"{L['start']:6.2f}s  {L['text']}\n         zipformer: {tz.lower()}\n         whisper:   {tw}{flag}")
    print(f'\nWords missed by BOTH recognisers: {bad}/{total}')
    print(f'Largest onset difference vs src/narrationTiming.js: {worst * 1000:.0f} ms '
          '(only meaningful on the dry voice track; music raises the floor in a mix)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
