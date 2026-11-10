# Armor price short

A vertical (1080×1920, 60 fps) 3D YouTube Short, generated entirely from code:

> war in the background → each piece of a military armor set flies in from the
> left, slams into the centre, gets scanned **green**, and its price counts up
> from **$1** to the real number → repeat for every piece → the full set
> assembles and the total counts up.

**The finished video is [`out/armor-price-short.mp4`](out/armor-price-short.mp4).**

Everything on screen is procedural – the six armor models, the burning
battlefield, the type, and the soundtrack – so there are no third-party assets
or licences to worry about.

## Change the script

All the knobs are in [`src/config.js`](src/config.js):

```js
pieces: [
  { id: 'helmet',  name: 'BALLISTIC HELMET',       price: 1150 },
  { id: 'goggles', name: 'BALLISTIC GOGGLES',      price: 165 },
  { id: 'vest',    name: 'PLATE CARRIER + PLATES', price: 1450 },
  ...
],
hook: ['HOW MUCH DOES', "A SOLDIER'S ARMOR", 'COST?'],
bpm: 140,           // the whole edit (and the music) is cut to this tempo
```

Prices are rough retail estimates – put in your own numbers. Reorder or remove
entries freely; the counter, the total and the soundtrack follow automatically.
(`id` picks the 3D model: `helmet`, `goggles`, `vest`, `gloves`, `kneepads`, `boots`.)

## Re-render

```bash
npm install
npm run render     # full quality -> out/armor-price-short.mp4
npm run preview    # quick half-res 30 fps draft -> build/preview.mp4
npm run dev        # live preview in your browser
```

Needs Node 18+, `ffmpeg`, Python 3 with `numpy` + `scipy` (soundtrack), and
Playwright's Chromium (`npm i -D playwright && npx playwright install chromium`
if you don't already have it). No GPU is required: frames are rendered in
headless Chromium with software WebGL, cached in `build/`, and an interrupted
render picks up where it left off. A full render takes roughly 35–60 minutes
on 4 CPU cores.

## How it is put together

| File | What it does |
| --- | --- |
| `src/config.js` | Pieces, prices, hook text, tempo |
| `src/timeline.js` | When everything happens (shared by picture and sound) |
| `src/models.js` | The six armor pieces, built from lofted/swept surfaces |
| `src/materials.js` | Camo/wear shading and the "turns green" sweep |
| `src/battlefield.js` | Burning skyline, explosions, tracers, jets, embers |
| `src/choreo.js` | Motion of every piece, camera cuts, shake/blur/flash |
| `src/hud.js` | Titles, labels and the price counter |
| `src/main.js` | Scene assembly and the post-processing chain |
| `scripts/render.mjs` | Frame-by-frame render + encode |
| `scripts/audio.py` | Synthesized soundtrack (music + sound effects) |
