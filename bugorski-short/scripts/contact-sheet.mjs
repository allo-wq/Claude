// Builds inspection images from a rendered MP4:
//   out/qa/contact-sheet.png  – 48 frames spread across the whole timeline (1/s)
//   out/qa/transitions.png    – the last frame before and first frame after every cut
// Usage: node scripts/contact-sheet.mjs [video=final-animation.mp4]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SHOTS, FPS } from '../src/timeline.js';

const video = process.argv[2] || 'final-animation.mp4';
fs.mkdirSync('out/qa', { recursive: true });
const run = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(r.stderr.toString()); };

// 1 frame per second at t = n + 0.5, labelled with its timestamp
run(['-i', video, '-vf', "select='eq(mod(n\\,30)\\,15)',scale=216:-1,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x6:padding=4:color=magenta", '-frames:v', '1', '-vsync', 'vfr', 'out/qa/contact-sheet.png']);

// frames on both sides of every cut
const cuts = SHOTS.slice(1).map((s) => Math.round(s.start * FPS));
const picks = cuts.flatMap((f) => [f - 1, f]);
const expr = picks.map((f) => `eq(n\\,${f})`).join('+');
run(['-i', video, '-vf', `select='${expr}',scale=180:-1,drawtext=text='f%{n}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=10x${Math.ceil(picks.length / 10)}:padding=4:color=magenta`, '-frames:v', '1', '-vsync', 'vfr', 'out/qa/transitions.png']);
console.log('Wrote out/qa/contact-sheet.png and out/qa/transitions.png');
console.log('Cut frames (before|after): ' + cuts.map((f) => `${f - 1}|${f}`).join('  '));
