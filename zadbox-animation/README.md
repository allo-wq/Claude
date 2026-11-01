# Zadbox hero animation

A looping animation for the zadbox.net website. It shows the site's two ways to eat ("Order Now" and "Meal Subscription") in a small working copy of the Zadbox app, then ends on customer reviews and contact.

Everything in it comes from the live site (EN, mobile), not from guesses:

| | Source |
|---|---|
| Colors | Sampled from the screenshots' pixels: purple `#673F9D`, lavender `#F1EBFB`, ink `#211B2A`, muted `#6D6879`, border `#E8E7EC`, disabled `#A38BC3` |
| Font | **Plus Jakarta Sans**, matched glyph-for-glyph against the site's headline and body text |
| Icons | Lucide (same set the site uses: utensils-crossed, calendar-plus, cart, clock, message-circle…) |
| Photos and logo | Cropped from the site's own dish cards and header |
| Copy and prices | Verbatim from the site: 19 / 25 SAR wraps, Balanced plan macros, 49 / 239 / 879 SAR durations, "Delivered in 35–59 min", "Fixed price, delivery and VAT included", "Delivery runs Sunday to Thursday only.", review quotes, WhatsApp +966 56 414 4050 |

## The story (22.6 s loop)

| Chapter | What happens |
|---|---|
| **Order Now** (0–8.4 s) | Categories and dishes come in. Two wraps are tapped and fly into the cart. The cart badge and total count up to 2 items · 44.00 SAR. "Continue to cart" opens a "Delivered in 35–59 min" sheet. |
| **Meal Subscription** (8.4–16.6 s) | The tab switches. The Balanced plan's macros count up, "5 days · 239 SAR" is picked, and the Sun–Thu week fills with dishes. Tuesday's dish is swapped: "Pause your subscription or change your dish at any time". |
| **Reviews** (16.6–22.6 s) | Verified customer reviews ★★★★★, the review carousel, and the WhatsApp contact card. Then it resets back to the start without a visible jump. |

A 1-second intro (headline word reveal, app rising in) plays once before the first loop.

## Files

```
dist/
  zadbox-animation.html            ← single self-contained file (fonts, images, code inlined; ~650 KB)
  zadbox-animation-landscape.mp4   ← 1920×1080, 60 fps (ads, YouTube, desktop)
  zadbox-animation-portrait.mp4    ← 1080×1920, 60 fps (Reels, Stories, TikTok, WhatsApp status)
src/
  index.html  styles.css  animation.js
  assets/     fonts (Plus Jakarta Sans, OFL), logo, dish photos
  vendor/     gsap.min.js 3.15.0
tools/
  build.cjs          src → dist/zadbox-animation.html
  qa.cjs             automated behaviour checks (18)
  snapshots.cjs      exact-frame screenshots for review
  render-video.cjs   frame-accurate MP4 export
```

## Putting it on the website

### Option A: iframe (simplest)

Upload `dist/zadbox-animation.html` to the site. It needs nothing else. Place it where the "How would you like to eat today?" block sits now:

```html
<div class="zadbox-hero-frame">
  <iframe src="/zadbox-animation.html" title="How Zadbox works" loading="lazy"></iframe>
</div>

<style>
  .zadbox-hero-frame { position: relative; width: 100%; aspect-ratio: 420 / 747; }   /* phones: 9:16 */
  @media (min-width: 760px) { .zadbox-hero-frame { aspect-ratio: 16 / 9; } }         /* tablet/desktop */
  .zadbox-hero-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
```

### Option B: inline in the page

Copy the `<section class="zb" id="zadbox-hero">…</section>` markup, `styles.css`, `vendor/gsap.min.js` and `animation.js` into the site. Change `data-fit="contain"` to `data-fit="width"`. The section will then scale to its container's width and set its own height. Drop the `html, body { … }` rule at the top of `styles.css`, because the page already has its own.

### Behaviour

- **Layout:** picks itself by width. Below 760 px it uses the portrait (phone) layout; otherwise landscape.
- **Viewport:** starts when it scrolls into view, and pauses when off-screen or when the tab is hidden.
- **Controls:** a pause/play button (WCAG 2.2.2), plus chapter buttons that jump to each part.
- **`prefers-reduced-motion`:** nothing autoplays. A still frame of each chapter is shown instead; the chapter buttons switch between them, and the play button still works.
- **Accessibility:** the app mock-up is decorative (`aria-hidden`). The headline and captions are real text.

## Editing

- **Colors:** the CSS custom properties at the top of `styles.css` (`--zb-purple`, …).
- **Timing:** the `CHAPTERS`, `END` and `POSTERS` constants in `animation.js`. Every beat is one line in `buildMaster()`, timed in seconds.
- **Copy, prices and photos:** plain HTML in `src/index.html`.

After editing, rebuild and re-check:

```bash
node tools/build.cjs                      # → dist/zadbox-animation.html
node tools/qa.cjs                         # 18 behaviour checks
node tools/render-video.cjs landscape     # → dist/zadbox-animation-landscape.mp4
node tools/render-video.cjs portrait      # → dist/zadbox-animation-portrait.mp4
```

The tools need Node 18+, Playwright with Chromium, and ffmpeg (for the videos).

## Still to replace

- **Logo.** It was cropped from a phone screenshot, so it is only 76×46 px. That is sharp at the size used, but please swap in the original logo file (`src/assets/images/logo.png`, SVG preferred).
- **Arabic version.** The site has an ع / EN toggle. An RTL Arabic version needs the site's Arabic copy, which wasn't in the screenshots.

## Licences

- GSAP 3.15.0: GreenSock "Standard No-Charge" licence (free, including commercial use). https://gsap.com/standard-license
- Plus Jakarta Sans: SIL Open Font License 1.1 (`src/assets/fonts/OFL.txt`).
- Lucide icons: ISC.
