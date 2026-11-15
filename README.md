# Venom Mode

A symbiote add-on for Minecraft Bedrock / Pocket Edition. Bond with a symbiote to get a full-body suit, new powers, a hunger to manage and two weaknesses to watch out for.

![Venom, Carnage and a wild symbiote](docs/preview.png)

This is a fan-made add-on. It is not affiliated with Marvel, Mojang or Microsoft. The art is original and the sounds are built from public-domain recordings; see [CREDITS.md](CREDITS.md).

## Install

Needs Minecraft Bedrock **1.21.90 or newer** (Android, iOS or Windows).

1. Download [`dist/VenomMode.mcaddon`](dist/VenomMode.mcaddon) on the device.
2. Open the file with Minecraft. It imports both packs.
3. Create or edit a world and turn on **Venom Mode [Behavior]** under Behavior Packs. The resource pack is added with it.
4. Play. No experimental toggles are needed.

## How to become Venom

Any one of these:

- **Craft a Symbiote Sample** and use it: an Eye of Ender in the middle, Slimeballs on the four sides, Ink Sacs in the four corners.
- **Get touched by a wild Symbiote.** They spawn in the dark, and at night one sometimes falls from the sky near a player who has none. Killing one drops a sample instead.
- In creative, take a Symbiote Sample from the Items tab.

"Use" means tap-and-hold on touch screens (or the Use button), right-click on PC.

## Powers

| Power | How |
| --- | --- |
| Claws | Hit with an empty hand |
| Strength, speed, jump, healing, night vision | Always on |
| Wall-crawl | Hold jump while pushing into a wall |
| Ground slam | Sneak while high in the air |
| No fall damage | Always on |
| Blob form | Sneak and use the Symbiote Core (see below) |

Bonding puts six items in your inventory: the Symbiote Core and five abilities. They cannot be dropped and stay with you through death. Each symbiote has its own set.

**Venom** is the tank: tough, heals by eating, and controls a crowd.

| Item | What it does | Recharge |
| --- | --- | --- |
| Tendril Lash | Drags a mob to you. Aimed at a block, or while sneaking, it pulls you there instead | 1.5 s |
| Web Swing | Hooks onto whatever is above and ahead and swings you forward. Use it again in mid-air to keep swinging. With nothing to hook onto, you leap | 0.6 s |
| Devour | A huge bite. Prey at 12 hearts or less is eaten whole, which heals you | 5 s |
| Roar | Staggers and weakens every mob within 12 blocks | 15 s |
| Spike Burst | Spikes erupt around you | 10 s |

**Carnage** is faster and far deadlier, but less tough.

| Item | What it does | Recharge |
| --- | --- | --- |
| Tendril Lash | Same as Venom's | 1.5 s |
| Web Swing | Same as Venom's | 0.6 s |
| Blade Slash | Your arms become blades and cut every mob in a wide arc in front of you. Victims keep bleeding | 2 s |
| Tendril Spears | Spears shoot out where you look and run through every mob in the line, pinning them | 6 s |
| Frenzy | Ten seconds of extra strength and speed. Every claw hit heals you | 30 s |

The **Symbiote Core** opens a menu: a guide, blob form, camouflage, night vision, wall-crawl, the status bar, and separating.

Claws and abilities never hurt other players or tamed pets.

## Blob form

Sneak and use the Symbiote Core to melt into a small blob. Do it again to rise back into the suit.

- A blob is fast, cannot be seen as a player, and climbs walls.
- It slips into gaps one block high: walk into the hole and keep going.
- It has no armor and cannot use abilities or claws.

## Biomass

The bar next to your name is the symbiote's hunger, from 0 to 100. It drains slowly and abilities cost a little.

- Kills, Devour, **chocolate**, cookies and raw meat fill it. Chocolate Bars are crafted from 2 Cocoa Beans and 1 Sugar.
- Above 60 you heal fast. Below 20 you stop healing. At 0 the symbiote feeds on you.

## Weaknesses

- **Fire** burns much harder and stops your healing.
- **Loud noise** sickens you: bells, note blocks, goat horns, a Warden's sonic boom, lightning. Three in a row tear the symbiote off and throw its sample on the ground.

## Carnage

A rare red boss that hunts at night (160 health, weak to fire). It drops a **Carnage Symbiote Sample**, which bonds you with Carnage instead of Venom.

## Commands

With cheats on:

```
/scriptevent venom:bond            bond with the black symbiote
/scriptevent venom:bond carnage    bond with Carnage
/scriptevent venom:separate
/scriptevent venom:feed            fill biomass
/summon venom:symbiote
/summon venom:crimson_symbiote
```

## Building from source

```
npm install
npm run build       # redraws textures and models, writes dist/VenomMode.mcaddon
npm test            # runs the scripts against a stand-in for the game
npm run typecheck   # checks the scripts against the Script API 2.0.0 typings
npm run sounds      # rebuilds the sound effects from their CC0 sources
```

`npm run build` needs Python 3 with Pillow. `npm run sounds` also needs numpy, ffmpeg and access to opengameart.org; the finished sounds are committed, so it is only needed to change them.

| Path | Contents |
| --- | --- |
| `behavior_packs/venom_mode_bp` | Items, mobs, recipes, spawn rules and the scripts. Every number worth tuning is in `scripts/config.js` |
| `resource_packs/venom_mode_rp` | Models, textures, animations, particles and names |
| `tools/build_assets.py` | Draws every texture and builds every model |
| `tools/build_sounds.py` | Cuts and layers the sound effects from CC0 recordings |
| `tools/package.py` | Zips the two packs into the `.mcaddon` |
| `tests/` | Script tests and the stand-in for the game they run against |
