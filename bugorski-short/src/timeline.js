// MASTER TIMELINE — single source of truth for timing.
// No voiceover file was supplied, so narration timestamps are estimated from the
// script at a natural Shorts pace (~2.5 words/s) inside the section markers the
// script itself gives ([0:00-0:04], [0:04-0:14], ...). If a real voiceover is
// recorded later, adjust the `start`/`end` values here; every shot, caption and
// transition is keyed off these numbers.

export const FPS = 30;
export const DURATION = 48;            // seconds
export const FRAMES = FPS * DURATION;  // 1440
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const NARRATION = [
  { start: 0.0, end: 1.4, section: 'HOOK', text: 'In 1978, a Soviet scientist' },
  { start: 1.4, end: 2.9, section: 'HOOK', text: 'stuck his head into a particle accelerator...' },
  { start: 2.9, end: 4.0, section: 'HOOK', text: 'while it was running.' },
  { start: 4.0, end: 5.4, section: 'SETUP', text: 'Anatoli Bugorski.' },
  { start: 5.4, end: 6.8, section: 'SETUP', text: 'A physicist in Russia.' },
  { start: 6.8, end: 8.3, section: 'SETUP', text: 'The machine was glitching,' },
  { start: 8.3, end: 10.0, section: 'SETUP', text: 'and the safety system failed.' },
  { start: 10.0, end: 11.9, section: 'SETUP', text: 'He leaned in to check it.' },
  { start: 11.9, end: 14.0, section: 'SETUP', text: 'Just a quick look.' },
  { start: 14.0, end: 15.1, section: 'BEAM', text: 'A beam of protons,' },
  { start: 15.1, end: 16.6, section: 'BEAM', text: 'traveling near the speed of light,' },
  { start: 16.6, end: 18.0, section: 'BEAM', text: 'shot through the back of his skull' },
  { start: 18.0, end: 19.0, section: 'BEAM', text: 'and out his face.' },
  { start: 19.0, end: 21.4, section: 'BEAM', text: 'He saw a flash brighter than a thousand suns.' },
  { start: 21.4, end: 22.4, section: 'BEAM', text: 'And felt nothing.' },
  { start: 22.4, end: 23.2, section: 'BEAM', text: 'No pain.' },
  { start: 23.2, end: 24.0, section: 'BEAM', text: 'No sound.' },
  { start: 24.0, end: 25.6, section: 'AFTERMATH', text: 'Then his face swelled up.' },
  { start: 25.6, end: 28.2, section: 'AFTERMATH', text: 'Skin peeled away along the path of the beam.' },
  { start: 28.2, end: 31.4, section: 'AFTERMATH', text: 'The radiation dose should have killed him many times over.' },
  { start: 31.4, end: 34.0, section: 'AFTERMATH', text: 'Doctors gave him days.' },
  { start: 34.0, end: 35.4, section: 'SURVIVAL', text: "He didn't die." },
  { start: 35.4, end: 37.0, section: 'SURVIVAL', text: 'Half his face froze.' },
  { start: 37.0, end: 38.8, section: 'SURVIVAL', text: 'He lost hearing in one ear.' },
  { start: 38.8, end: 40.2, section: 'SURVIVAL', text: 'Seizures came.' },
  { start: 40.2, end: 41.4, section: 'SURVIVAL', text: 'But his mind?' },
  { start: 41.4, end: 43.0, section: 'SURVIVAL', text: 'Completely intact.' },
  { start: 43.0, end: 44.6, section: 'CLOSER', text: 'He finished his PhD.' },
  { start: 44.6, end: 46.2, section: 'CLOSER', text: 'And went right back to work...' },
  { start: 46.2, end: 48.0, section: 'CLOSER', text: 'around particle accelerators.' },
];

// Major scenes (~10 s each, following the script's own sections).
export const SCENES = [
  { id: 'S1', name: 'Hook', start: 0, end: 4 },
  { id: 'S2', name: 'Setup: the glitch', start: 4, end: 14 },
  { id: 'S3', name: 'The beam', start: 14, end: 24 },
  { id: 'S4', name: 'Aftermath', start: 24, end: 34 },
  { id: 'S5', name: 'Survival', start: 34, end: 43 },
  { id: 'S6', name: 'Closer', start: 43, end: 48 },
];

// Shot list: a new camera angle / action every ~1–3 s, each tied to the words above.
export const SHOTS = [
  { id: '1A', start: 0.0, end: 1.4, set: 'ring', what: 'Aerial: synchrotron ring at dusk, beam circulating. "1978 · USSR".' },
  { id: '1B', start: 1.4, end: 2.9, set: 'hall', what: 'Wide: scientist leaning with his head in the open gap of the beam line.' },
  { id: '1C', start: 2.9, end: 4.0, set: 'hall', what: 'Low close-up: proton bunches streaming, BEAM ON beacon spinning.' },
  { id: '2A', start: 4.0, end: 5.4, set: 'hall', what: 'Portrait push-in, name card.' },
  { id: '2B', start: 5.4, end: 6.8, set: 'hall', what: 'At the chalkboard writing physics; "Physicist · Protvino, Russia".' },
  { id: '2C', start: 6.8, end: 8.3, set: 'hall', what: 'Console close-up: gauge needle jitters, scope ERROR, FAULT lamp.' },
  { id: '2D', start: 8.3, end: 10.0, set: 'hall', what: 'Safety interlock lamps die one by one, red X.' },
  { id: '2E', start: 10.0, end: 11.9, set: 'hall', what: 'He leans into the gap to check the equipment.' },
  { id: '2F', start: 11.9, end: 12.9, set: 'hall', what: 'Profile close-up: a quick look down the line.' },
  { id: '2G', start: 12.9, end: 14.0, set: 'hall', what: 'Down-the-line view: a proton bunch races toward the back of his head → flash.' },
  { id: '3A', start: 14.0, end: 16.6, set: 'tunnel', what: 'Inside the beam pipe riding with the protons; "99.99% speed of light".' },
  { id: '3B', start: 16.6, end: 19.0, set: 'studio', what: 'X-ray sweep; beam enters back of skull, exits beside the nose. Orbit back → front.' },
  { id: '3C', start: 19.0, end: 19.8, set: 'studio', what: 'Eye close-up: blinding flash inside the eye.' },
  { id: '3D', start: 19.8, end: 21.4, set: 'suns', what: 'Metaphor: a thousand suns ignite (his own words).' },
  { id: '3E', start: 21.4, end: 24.0, set: 'studio', what: 'Calm face; crossed-out pain and sound icons.' },
  { id: '4A', start: 24.0, end: 25.6, set: 'studio', what: 'Left side of the face swells.' },
  { id: '4B', start: 25.6, end: 28.2, set: 'studio', what: 'Skin peels at the wounds; dashed line shows the beam path.' },
  { id: '4C', start: 28.2, end: 29.4, set: 'dose', what: 'One lethal-dose block (~5 Gy).' },
  { id: '4D', start: 29.4, end: 31.4, set: 'dose', what: 'Wall of 400 blocks (~2,000 Gy) builds; camera pulls back.' },
  { id: '4E', start: 31.4, end: 34.0, set: 'hospital', what: 'Hospital: doctor shakes head, calendar at 13 July 1978.' },
  { id: '5A', start: 34.0, end: 35.4, set: 'hospital', what: 'Calendar flips through weeks; ECG steady; he sits up.' },
  { id: '5B', start: 35.4, end: 37.0, set: 'studio', what: 'He smiles — only the right side moves; left half frozen.' },
  { id: '5C', start: 37.0, end: 38.8, set: 'studio', what: 'Sound waves reach the right ear; die before the left ear.' },
  { id: '5D', start: 38.8, end: 40.2, set: 'studio', what: 'X-ray brain with electrical storm (seizures, metaphor).' },
  { id: '5E', start: 40.2, end: 43.0, set: 'studio', what: 'Storm stops; brain glows calm; equations orbit — mind intact.' },
  { id: '6A', start: 43.0, end: 44.6, set: 'desk', what: 'Dissertation lands; PhD stamp.' },
  { id: '6B', start: 44.6, end: 46.2, set: 'hall', what: 'He walks back along the running beam line.' },
  { id: '6C', start: 46.2, end: 48.0, set: 'hall', what: 'Crane up: the beam line and accelerator hall; he keeps working.' },
];

export function shotAt(t) {
  for (const s of SHOTS) if (t >= s.start && t < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}
