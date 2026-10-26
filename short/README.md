# Your Cart vs Your Body — vertical short

An ~86 s, 1080×1920, 30 fps short: a shopper walks the junk aisle, ten items
get a see-through red scan with the diseases they're linked to and their sodium,
sugar, chemicals and calories (☠ LETHAL where one package is over half a day's
limit). The camera dives into the worst bag, then follows the food down his
throat, stomach, intestines and bloodstream to the outcome. A rewind replays it
with real food: green scans, benefits, a zoom on the price tags and a cart-total
comparison, the same trip through the body and the healthy outcome.

There are two versions with the same edit, overlays and soundtrack:

- **Animated (`animate.py` + `art.py`)**: every frame is drawn in code as
  flat vector art with cairo (character with walk/run cycles, cart, aisles,
  the 20 foods, the oily bag interior, x-ray, throat tunnel, stomach,
  intestines, artery, heart and liver, couch, park). No AI imagery.
- **AI stills (`render.py`)**: 18 AI stills (Higgsfield: Z Image for scenes,
  Seedream 5 Flash with the hero shot as a reference so the main character
  stays the same), animated with camera moves.

## Render

```
pip install numpy pillow cairocffi   # plus ffmpeg and the cairo library
python3 animate.py --out your_cart_vs_your_body_animated.mp4   # drawn version
python3 render.py --timeline                    # scene list and timings
python3 render.py --preview 5,18.7,40 --scale .4 # review frames into preview/
python3 render.py --out your_cart_vs_your_body.mp4
```

Stills go in `assets/` as PNGs named below. Missing ones render as labeled
placeholders, so the edit can be checked before the images exist. Item boxes
and the x-ray landmarks for the generated stills live in `data.py` (`LAYOUT`);
a `layout.json` next to the script overrides them for new images.

## Shot list

| Time | Scene | Transition in |
|---|---|---|
| 0:00 | Hook: walking with the cart, "What's really in your cart?" | — |
| 0:02 | Reaching for chips, "The junk aisle" | whip pan |
| 0:04 | Shelf pan right: 10 items scan red one by one, diseases + stats, 10/10 pull-back | whip pan |
| 0:18 | The worst one: cheese puffs, 4-row breakdown with lethal signs | zoom punch |
| 0:23 | Inside the oily, wrinkled bag: 85 g of fat ≈ 6 tbsp oil | fly-through |
| 0:26 | X-ray of the main character, zoom to the throat | glitch |
| 0:28 | Throat → stomach → intestines → bloodstream (stage 1–4/5) | fly-through, then camera drops |
| 0:37 | Outcome: his heart pulsing red; obesity, T2 diabetes, heart disease, fatty liver | drop |
| 0:40 | On the couch: "Tired. Bloated. At risk." | glitch |
| 0:42 | VHS rewind through the junk half | cut |
| 0:43 | Produce section: "Now the real food cart" | flash |
| 0:45 | Shelf pan: 10 items scan green, benefits, checks, price tags | whip pan |
| 1:00 | Zoom on prices ($1.99, $0.69, $3.99), cart totals, "you save" | continuous |
| 1:04 | X-ray in green, zoom to the throat | light leak |
| 1:07 | Throat → stomach → intestines → bloodstream | fly-through, drops |
| 1:15 | Outcome: stronger heart, healthy gut, steady energy, lower disease risk | drop |
| 1:19 | Jogging at sunrise | light leak |
| 1:21 | Split screen, "Your cart = your future", disclaimer | zoom punch |

## Stills

| File | Model | Prompt (abridged) |
|---|---|---|
| `hero` | Z Image | Man early 30s, dark curly hair, stubble, mustard-yellow hoodie, pushing a cart down a bright supermarket aisle |
| `shelf_junk` (16:9) | Z Image | Front view of a two-row shelf: cheese puffs, cola, donuts, ramen, frozen pizza / candy bar, energy drink, hot dogs, ice cream, toaster pastries; no logos |
| `shelf_healthy` (16:9) | Z Image | Two-row shelf: broccoli, apples, bananas, spinach, salmon / eggs, oats, blueberries, sweet potatoes, avocados |
| `bag` | Z Image | Extreme close-up of a crinkly orange cheese-puff bag, moody light |
| `bag_inside` | Z Image | Inside an opened chip bag: oily silver foil, a couple of big wrinkles, light from the top |
| `j_throat`, `j_stomach`, `j_intestine`, `j_artery` | Z Image | Medical 3D views: greasy cheese puffs in the throat; acid + soda + grease in the stomach; fat and sugar past inflamed villi; plaque narrowing an artery |
| `h_throat`, `h_stomach`, `h_intestine`, `h_artery` | Z Image | Same stages, healthy: broccoli and apple, leafy food digesting, villi absorbing glowing nutrients, clean artery |
| `c_reach`, `c_xray`, `c_produce`, `c_couch`, `c_jog` | Seedream 5 Flash + `hero` as reference | Same man: reaching for chips; semi-transparent x-ray torso; produce section with a full cart; slumped on a couch with wrappers; jogging at sunrise |

Nutrition numbers are approximate values for typical US products (see `data.py`).
The piece is educational and not medical advice.
