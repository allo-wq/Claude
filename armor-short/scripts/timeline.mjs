// Writes build/timeline.json (event times) for the soundtrack generator.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { CONFIG } from '../src/config.js';
import { buildTimeline } from '../src/timeline.js';

const TL = buildTimeline(CONFIG);
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'timeline.json'), JSON.stringify({ ...TL, bpm: CONFIG.bpm, beats: CONFIG.beats }, null, 1));
console.log(`timeline: ${TL.duration.toFixed(2)}s, ${TL.pieces.length} pieces, total ${CONFIG.currency}${TL.finale.total}`);
