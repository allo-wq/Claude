// Technical verification of the finished MP4 (ffprobe + black-frame scan).
// Usage: node scripts/verify.mjs [video=final-animation.mp4]
import { spawnSync } from 'node:child_process';
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
  ['frame count 1440', Number(v.nb_read_frames) === 1440, v.nb_read_frames],
  ['duration 48.0 s', Math.abs(Number(info.format.duration) - 48) < 0.05, info.format.duration],
];
const bd = spawnSync('ffmpeg', ['-hide_banner', '-i', video, '-vf', 'blackdetect=d=0.03:pic_th=0.97:pix_th=0.08', '-an', '-f', 'null', '-']);
const black = (bd.stderr.toString().match(/black_start:[^\n]+/g) || []);
checks.push(['no black frames', black.length === 0, black.length ? black.join('; ') : 'none']);
for (const [name, ok, val] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} ${val}`);
console.log(`INFO  audio stream             ${a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : 'none (silent render; narration to be added — see NARRATION_GUIDE.md)'}`);
console.log(`INFO  file size                ${(Number(info.format.size) / 1e6).toFixed(1)} MB, bitrate ${(Number(info.format.bit_rate) / 1e6).toFixed(1)} Mb/s`);
process.exit(checks.every((c) => c[1]) ? 0 : 1);
