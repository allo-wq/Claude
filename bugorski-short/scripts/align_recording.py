#!/usr/bin/env python3
"""Use YOUR OWN voiceover recording instead of the synthesized one.

    .venv/bin/python scripts/align_recording.py path/to/recording.wav

Transcribes the recording with an offline speech recogniser (word timestamps),
matches the words to the script lines in src/timeline.js, and writes:
  * audio/narration_voice.flac – the recording, 48 kHz (replaces the TTS voice)
  * src/narrationTiming.js     – measured start of every line → the animation is
                                  time-warped so each visual cue hits its words.
Then run `.venv/bin/python scripts/soundtrack.py` and `npm run render -- --fresh`.
"""
import difflib, json, os, re, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narrate import ROOT, ASR_DIR, read_narration, TAIL  # noqa: E402

NUMS = {'1978': 'nineteen seventy eight', 'phd': 'p h d'}


def norm_words(s):
    s = s.lower().replace('-', ' ')
    for a, b in NUMS.items(): s = s.replace(a, b)
    return re.sub(r"[^a-z' ]", ' ', s).split()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv  # compare with the current timing file instead of writing
    if not args: sys.exit(__doc__)
    src = args[0]
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=f'{ASR_DIR}/encoder-epoch-99-avg-1.onnx', decoder=f'{ASR_DIR}/decoder-epoch-99-avg-1.onnx',
        joiner=f'{ASR_DIR}/joiner-epoch-99-avg-1.onnx', tokens=f'{ASR_DIR}/tokens.txt', num_threads=4)
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    length = len(audio) / 16000

    # Recognise in 20 s windows (1 s overlap) and keep word starts from each window's core.
    heard = []  # (word, start_seconds)
    win, hop = 20.0, 19.0
    for w0 in np.arange(0, length, hop):
        seg = audio[int(w0 * 16000):int(min(length, w0 + win) * 16000)]
        st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([seg, np.zeros(8000, np.float32)])); rec.decode_stream(st)
        toks, ts = st.result.tokens, st.result.timestamps
        word, start = '', None
        for tk, t in zip(toks, ts):
            if tk.startswith((' ', '▁')):
                if word: heard.append((word.lower(), w0 + start))
                word, start = tk.strip(' ▁'), t
            else:
                word += tk
        if word: heard.append((word.lower(), w0 + start))
    heard.sort(key=lambda x: x[1])
    dedup = []
    for w, t in heard:  # drop duplicates from the overlap
        if not dedup or t - dedup[-1][1] > 0.12 or w != dedup[-1][0]: dedup.append((w, t))
    heard = dedup

    lines = read_narration()
    script_words, owner = [], []
    for li, L in enumerate(lines):
        ws = norm_words(L['text']); script_words += ws; owner += [li] * len(ws)
    sm = difflib.SequenceMatcher(a=script_words, b=[w for w, _ in heard], autojunk=False)
    match = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n): match[a + k] = heard[b + k][1]
    starts = []
    first_word = 0
    for li, L in enumerate(lines):
        idx = [i for i in range(len(script_words)) if owner[i] == li]
        t = next((match[i] - 0.0 for i in idx if i in match), None)
        if t is not None and idx and idx[0] not in match:  # first word missed: back off by its share
            t -= 0.3 * (idx.index(next(i for i in idx if i in match)))
        starts.append(t)
    for i, t in enumerate(starts):  # interpolate any line the recogniser missed entirely
        if t is None:
            prev = next((starts[j] for j in range(i - 1, -1, -1) if starts[j] is not None), 0.0)
            nxt = next((starts[j] for j in range(i + 1, len(starts)) if starts[j] is not None), length)
            starts[i] = (prev + nxt) / 2
    # The recogniser tends to emit a word's first token during the silence before it.
    # Snap each start to the real voice onset: the first rise out of silence within
    # [-0.15 s, +0.5 s] of the estimate (mid-sentence lines have no silence → unchanged).
    fr = audio[: len(audio) // 160 * 160].reshape(-1, 160)
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    thr = rms.max() * 0.0316
    snapped = []
    for li, t in enumerate(starts):
        if li > 0 and not re.search(r'[.,!?;:]$', lines[li - 1]['text'].strip()):
            snapped.append(t); continue  # mid-sentence: no pause to snap to; ASR time is accurate here
        i0, i1 = max(5, int((t - 0.15) / 0.01)), min(len(rms) - 1, int((t + 0.6) / 0.01))
        # rising edges preceded by ≥50 ms of real silence (stop consonants are shorter)
        rises = [i for i in range(i0, i1) if rms[i] >= thr and all(rms[i - k] < thr for k in range(1, 6))]
        snapped.append(min(rises, key=lambda i: abs(i * 0.01 - (t + 0.2))) * 0.01 if rises else t)
    starts = [max(0.0, s) for s in snapped]
    duration = round(np.ceil((max(length, starts[-1] + 1.0) + TAIL * 0.0) * 30) / 30, 4)
    timing = [dict(text=L['text'], designStart=L['start'], designEnd=L['end'], start=round(s, 3),
                   speechEnd=round(starts[i + 1] if i + 1 < len(starts) else length, 3)) for i, (L, s) in enumerate(zip(lines, starts))]
    if check:
        cur = open(os.path.join(ROOT, 'src', 'narrationTiming.js'), encoding='utf-8').read()
        ref = json.loads(cur[cur.index('{'):cur.rindex('}') + 1])['lines']
        errs = [abs(a['start'] - b['start']) for a, b in zip(timing, ref)]
        for a, b, e in zip(timing, ref, errs): print(f"  {b['start']:6.2f} vs measured {a['start']:6.2f}  ({e * 1000:4.0f} ms)  {a['text']}")
        print(f'max {max(errs) * 1000:.0f} ms, median {np.median(errs) * 1000:.0f} ms')
        return
    meta = dict(voice=f'recording: {os.path.basename(src)}', model='human recording (aligned with Zipformer ASR)', speed=1.0,
                duration=duration, designDuration=48.0, lines=timing)
    open(os.path.join(ROOT, 'src', 'narrationTiming.js'), 'w', encoding='utf-8').write(
        '// GENERATED by scripts/align_recording.py — measured start of every narration line in the\n'
        '// supplied recording. src/timeline.js time-warps the animation onto these times.\n'
        f'export const NARRATION_TIMING = {json.dumps(meta, indent=2, ensure_ascii=False)};\n')
    out = os.path.join(ROOT, 'audio', 'narration_voice.flac')
    if os.path.abspath(src) != os.path.abspath(out):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-af', 'aresample=48000:resampler=soxr',
                        '-c:a', 'flac', '-sample_fmt', 's16', out], check=True)
    matched = sum(1 for i in range(len(script_words)) if i in match)
    print(f'aligned {matched}/{len(script_words)} script words; duration {duration}s → src/narrationTiming.js')
    for L in timing: print(f"  design {L['designStart']:5.2f} → spoken {L['start']:6.2f}  {L['text']}")


if __name__ == '__main__':
    main()
