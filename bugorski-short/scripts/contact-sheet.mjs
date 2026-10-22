// Builds inspection images from a rendered MP4:
//   out/qa/contact-sheet.png  – one frame per second across the whole timeline
//   out/qa/transitions.png    – the last frame before and first frame after every cut
// Usage: node scripts/contact-sheet.mjs [video=final-animation.mp4]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SHOTS, FPS, realTime, DURATION } from '../src/timeline.js';

const video = process.argv[2] || 'final-animation.mp4';
fs.mkdirSync('out/qa', { recursive: true });
const run = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(r.stderr.toString()); };

// 1 frame per second at t = n + 0.5, labelled with its timestamp
run(['-i', video, '-vf', `select='eq(mod(n\\,30)\\,15)',scale=216:-1,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x${Math.ceil(DURATION / 8)}:padding=4:color=magenta`, '-frames:v', '1', '-vsync', 'vfr', 'out/qa/contact-sheet.png']);

// frames on both sides of every cut
const cuts = SHOTS.slice(1).map((s) => Math.ceil(realTime(s.start) * FPS - 1e-6)); // first frame of each shot (real clock)
const picks = cuts.flatMap((f) => [f - 1, f]);
const expr = picks.map((f) => `eq(n\\,${f})`).join('+');
run(['-i', video, '-vf', `select='${expr}',scale=180:-1,drawtext=text='f%{n}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=10x${Math.ceil(picks.length / 10)}:padding=4:color=magenta`, '-frames:v', '1', '-vsync', 'vfr', 'out/qa/transitions.png']);
console.log('Wrote out/qa/contact-sheet.png and out/qa/transitions.png');
console.log('Cut frames (before|after): ' + cuts.map((f) => `${f - 1}|${f}`).join('  '));

// Sync sheet: the frame 0.4 s into every spoken line, labelled with that line, so each
// visual can be checked against its words (times come from the measured voiceover).
import { NARRATION_TIMING } from '../src/narrationTiming.js';
if (NARRATION_TIMING) {
  fs.rmSync('out/qa/sync', { recursive: true, force: true });
  fs.mkdirSync('out/qa/sync', { recursive: true });
  NARRATION_TIMING.lines.forEach((l, i) => {
    const label = `out/qa/sync/${String(i).padStart(2, '0')}.txt`;
    const wrapped = l.text.length > 34 ? l.text.replace(new RegExp(`^(.{1,34}) `), '$1\n') : l.text;
    fs.writeFileSync(label, `${(l.start + 0.4).toFixed(2)}s  ${wrapped}`);
    run(['-ss', String(l.start + 0.4), '-i', video, '-frames:v', '1', '-vf',
      `scale=270:-1,drawbox=y=ih-58:w=iw:h=58:color=black@0.75:t=fill,drawtext=fontfile=assets/fonts/Inter-Bold.otf:textfile=${label}:x=6:y=h-52:fontsize=13:fontcolor=white:line_spacing=2`,
      `out/qa/sync/${String(i).padStart(2, '0')}.png`]);
  });
  run(['-i', 'out/qa/sync/%02d.png', '-vf', `tile=6x${Math.ceil(NARRATION_TIMING.lines.length / 6)}:padding=4:color=magenta`, '-frames:v', '1', 'out/qa/sync-sheet.png']);
  console.log('Wrote out/qa/sync-sheet.png (frame 0.4 s into every spoken line)');
}
