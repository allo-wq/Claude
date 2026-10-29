// MASTER TIMELINE: everything is driven by the song's beat clock (song.json).
// 120 bpm, 48 beats = one 24 s loop. Beat b sounds at OFFSET + b·BEAT seconds; the
// clock wraps, so the first frames (t < OFFSET) belong to the END of the loop and the
// last frame flows straight into the first: the video loops seamlessly.
import SONG from '../song.json' with { type: 'json' };

export { SONG };
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BEAT = 60 / SONG.bpm;
export const OFFSET = SONG.offset;
export const BEATS = SONG.beatsPerLoop;
export const DURATION = BEATS * BEAT;            // 24 s
export const FRAMES = Math.round(DURATION * FPS); // 720

/** Song position (beats, 0 ≤ b < 48) at video time t (s). */
export const beatAt = (t) => ((((t - OFFSET) / BEAT) % BEATS) + BEATS) % BEATS;
export const timeOfBeat = (b) => OFFSET + b * BEAT;

// Six shots, one per sung line. The camera moves continuously through one tiny world,
// so "cuts" are whip pans, fly-throughs and swoops rather than hard edits.
export const SHOTS = [
  { id: '1', start: 0, end: 8, what: 'HOOK: the star pops into the twilight sky, winks, spins, shrinks "little", bursts back big.' },
  { id: '2', start: 8, end: 16, what: 'Whip pan to Pip the bunny at the mushroom-house window: wonder, think bubble, "?" turns into a star.' },
  { id: '3', start: 16, end: 24, what: 'Whip tilt up: the star rockets through the clouds; the tiny world appears below; rainbow orbit and loop.' },
  { id: '4', start: 24, end: 32, what: 'The star spins into a sparkling diamond, throws rainbow light, pops back; the sky fills with little stars.' },
  { id: '5', start: 32, end: 40, what: 'The star swoops down to the window: nose boop, giggle, a tiny star gift, confetti cheer.' },
  { id: '6', start: 40, end: 48, what: 'Pip yawns and dozes on the sill; camera rises to the sky; the star winks and shrinks into the twinkle that starts the loop.' },
];
export function shotAt(b) {
  for (const s of SHOTS) if (b >= s.start && b < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}

/** Every sung syllable with its absolute beat (repeated lines expanded). */
export const LYRICS = SONG.lines.map((line, li) => {
  const src = 'repeatOf' in line ? SONG.lines[line.repeatOf] : line;
  return { index: li, text: line.text, start: line.start, syllables: src.syllables.map((s) => ({ ...s, abs: line.start + s.beat })) };
});
