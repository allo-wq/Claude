// ---------------------------------------------------------------------------
// Everything you are likely to want to change lives in this file.
// Prices are rough retail estimates in USD -- edit them freely, the counter,
// the total and the soundtrack all follow automatically.
// ---------------------------------------------------------------------------
export const CONFIG = {
  width: 1080,
  height: 1920,
  fps: 60,
  bpm: 140, // the whole edit is cut to this tempo

  currency: '$',

  // Three lines that slam in over the battlefield before the first piece.
  hook: ['HOW MUCH DOES', "A SOLDIER'S ARMOR", 'COST?'],

  // Order = order on screen (head to toe).
  pieces: [
    { id: 'helmet', name: 'BALLISTIC HELMET', price: 1150 },
    { id: 'goggles', name: 'BALLISTIC GOGGLES', price: 165 },
    { id: 'vest', name: 'PLATE CARRIER + PLATES', price: 1450 },
    { id: 'gloves', name: 'COMBAT GLOVES', price: 85 },
    { id: 'kneepads', name: 'KNEE PADS', price: 60 },
    { id: 'boots', name: 'COMBAT BOOTS', price: 220 },
  ],

  finale: { name: 'FULL ARMOR SET', tag: 'TOTAL COST' },

  // Beats spent on each section.
  beats: { hook: 4, piece: 8, finale: 14 },
};
