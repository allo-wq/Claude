// Technical verification of the finished MP4 (ffprobe + black-frame scan).
// Usage: node scripts/verify.mjs [video=final-animation.mp4]
import { spawnSync } from 'node:child_process';
import { FRAMES, DURATION } from '../src/timeline.js';
const video = process.argv[2] || 'final-animation.mp4';
const p = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-count_frames', '-of', 'json', video]);
if (p.status) { console.error(p.stderr.toString()); process.exit(1); }
const info = JSON.parse(p.stdout.toString());
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
const checks = [
  ['resolution 1080x1920', v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`],
  ['frame rate 30 fps', v.r_frame_rate === '30/1' && v.avg_frame_rate === '30/1', `${v.r_frame_rate} (avg ${v.avg_frame_rate})`],
  ['codec H.264', v.codec_name === 'h264', `${v.codec_name} ${v.profile}`],
  ['pixel format yuv420p', v.pix_fmt === 'yuv420p', v.pix_fmt],
  [`frame count ${FRAMES}`, Number(v.nb_read_frames) === FRAMES, v.nb_read_frames],
  [`video duration ${DURATION.toFixed(3)} s`, Math.abs(Number(v.duration) - DURATION) < 0.04, v.duration],
];
if (a) {
  checks.push(['audio AAC 48 kHz stereo', a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2, `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch`]);
  checks.push(['audio length = video', Math.abs(Number(a.duration) - DURATION) < 0.05, `${a.duration} s`]);
  const lr = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  const I = Number((lr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  const TP = Number((lr.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  checks.push(['loudness ≈ -14 LUFS', Math.abs(I + 14) <= 1.5, `${I} LUFS integrated`]);
  checks.push(['true peak ≤ -1 dBTP', TP <= -0.9, `${TP} dBTP`]);
}
const bd = spawnSync('ffmpeg', ['-hide_banner', '-i', video, '-vf', 'blackdetect=d=0.03:pic_th=0.97:pix_th=0.08', '-an', '-f', 'null', '-']);
const black = (bd.stderr.toString().match(/black_start:[^\n]+/g) || []);
checks.push(['no black frames', black.length === 0, black.length ? black.join('; ') : 'none']);
for (const [name, ok, val] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} ${val}`);
if (!a) console.log('FAIL  audio stream             none');
if (!a) checks.push(['audio', false]);
console.log(`INFO  file size                ${(Number(info.format.size) / 1e6).toFixed(1)} MB, bitrate ${(Number(info.format.bit_rate) / 1e6).toFixed(1)} Mb/s`);
process.exit(checks.every((c) => c[1]) ? 0 : 1);
