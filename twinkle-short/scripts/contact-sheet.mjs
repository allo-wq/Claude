// Builds inspection images from a rendered MP4:
//   out/qa/contact-sheet.png – one frame per second across the whole loop
//   out/qa/transitions.png   – frames around every shot change (whips, fly-through, swoop)
//   out/qa/loop-seam.png     – the last four frames followed by the first four (must flow on)
//   out/qa/sync-sheet.png    – the frame on every sung syllable of line 1, labelled with it
// Usage: node scripts/contact-sheet.mjs [video=final-animation.mp4]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SHOTS, FPS, FRAMES, DURATION, LYRICS, timeOfBeat } from '../src/timeline.js';

const video = process.argv[2] || 'final-animation.mp4';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
fs.mkdirSync('out/qa', { recursive: true });
const run = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(r.stderr.toString()); };
// labelled before select, so %{n} is the source frame number
const label = fs.existsSync(FONT) ? `drawtext=fontfile=${FONT}:text='f%{n}':x=12:y=12:fontsize=64:fontcolor=yellow:box=1:boxcolor=black@0.6,` : '';
const sheet = (frames, cols, w, out) => {
  const expr = frames.map((f) => `eq(n\\,${f})`).join('+');
  run(['-i', video, '-vf', `${label}select='${expr}',scale=${w}:-1,tile=${cols}x${Math.ceil(frames.length / cols)}:padding=4:color=magenta`, '-frames:v', '1', '-vsync', 'vfr', out]);
};

// 1 frame per second at t = n + 0.5
sheet(Array.from({ length: Math.round(DURATION) }, (_, n) => n * FPS + 15), 8, 216, 'out/qa/contact-sheet.png');

// shot changes happen on the beat; transitions start up to ~0.6 beat earlier
const starts = SHOTS.slice(1).map((s) => Math.round(timeOfBeat(s.start) * FPS));
sheet(starts.flatMap((f) => [f - 9, f - 6, f - 3, f, f + 3]), 10, 180, 'out/qa/transitions.png');

// loop seam: 716 717 718 719 | 0 1 2 3
const tail = [FRAMES - 4, FRAMES - 3, FRAMES - 2, FRAMES - 1];
run(['-i', video, '-vf', `${label}select='${[...tail, 0, 1, 2, 3].map((f) => `eq(n\\,${f})`).join('+')}',scale=216:-1,tile=8x1:padding=4:color=magenta`, '-frames:v', '1', '-vsync', 'vfr', 'out/qa/loop-seam-raw.png']);
// select keeps stream order (0 1 2 3 716 ...); reorder so the seam reads left → right
const half = 4 * 216 + 3 * 4;
run(['-i', 'out/qa/loop-seam-raw.png', '-filter_complex', `[0]split[a][b];[a]crop=${half}:ih:${half + 4}:0,pad=iw+12:ih:0:0:white[end];[b]crop=${half}:ih:0:0[start];[end][start]hstack`, 'out/qa/loop-seam.png']);
fs.rmSync('out/qa/loop-seam-raw.png');

// sync: the frame 0.1 beat after every syllable onset of the first line, labelled with that syllable
if (fs.existsSync(FONT)) {
  fs.rmSync('out/qa/sync', { recursive: true, force: true });
  fs.mkdirSync('out/qa/sync', { recursive: true });
  const syl = [...LYRICS[0].syllables, ...LYRICS[2].syllables];
  syl.forEach((s, i) => {
    const t = timeOfBeat(s.abs + 0.1);
    fs.writeFileSync(`out/qa/sync/${i}.txt`, `${t.toFixed(2)}s  "${s.t}"`);
    run(['-ss', String(t), '-i', video, '-frames:v', '1', '-vf',
      `scale=216:-1,drawbox=y=ih-30:w=iw:h=30:color=black@0.75:t=fill,drawtext=fontfile=${FONT}:textfile=out/qa/sync/${i}.txt:x=6:y=h-24:fontsize=15:fontcolor=white`,
      `out/qa/sync/${String(i).padStart(2, '0')}.png`]);
  });
  run(['-i', 'out/qa/sync/%02d.png', '-vf', `tile=7x${Math.ceil(syl.length / 7)}:padding=4:color=magenta`, '-frames:v', '1', 'out/qa/sync-sheet.png']);
}
console.log('Wrote out/qa/contact-sheet.png, transitions.png, loop-seam.png, sync-sheet.png');
console.log('Shot starts (frames): ' + starts.join(' '));
