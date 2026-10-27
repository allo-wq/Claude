# Huss Valley Hub (Delta mobile)

A touch-friendly utility menu for [Huss Valley](https://www.roblox.com/games/107535308163741/Huss-Valley), built for the Delta executor on mobile. It also works on PC executors.

## How to run

1. Join Huss Valley.
2. Open Delta, paste the contents of [`HussValley.lua`](HussValley.lua) into the editor, and tap **Execute**.
3. Tap the round green **HV** button to show or hide the menu.

If this repository is public, you can run it with a one-liner instead:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/allo-wq/Claude/main/huss-valley/HussValley.lua"))()
```

If the file hasn't been merged into `main` yet, use the branch name in place of `main`.

## Features

| Tab | Feature | Notes |
| --- | --- | --- |
| Player | Speed + Walk Speed (16-200) | Held every frame so the game can't reset it |
| Player | High Jump + Jump Power (50-300) | |
| Player | Infinite Jump | Hold or tap the normal jump button |
| Player | Noclip | Original collisions are restored when turned off |
| Player | Fly + Fly Speed (10-300) | Steer with the thumbstick and camera. Use the **UP / DOWN** pad to climb or drop (Space / LeftControl on keyboard, since Q is the game's ability key) |
| Visual | Player ESP | Highlights every player with name and distance. Anyone holding a tool (usually the Chaser's knife) is shown in red as **[Knife]**. If the game uses Roblox Teams, team colours are used instead |
| Visual | Fullbright | Removes darkness and fog. Original lighting is restored when turned off |
| Teleport | Save / Return to position | |
| Teleport | Teleport to player | Tap a name in the list |
| Misc | Anti-AFK | On by default |
| Misc | Rejoin Server / Unload Script | **X** in the title bar also unloads everything |

Running the script again unloads the previous copy first, so menus never stack.

## About the game

These notes come from fan wikis and guide sites, since roblox.com wasn't reachable when this was written. Details may be out of date.

- **Identity:** place `107535308163741`, universe `10764627709`, made by the *Huss Valley Official* group. Released August 31, 2026. Up to 30 players per server, R6 avatars. Don't confuse it with *Huss Valley* by Ve3 (place `112568283214131`) or *Escape Huss Valley*. Those are different games with different codes.
- **Rounds:** one player is the **Chaser** with a knife. Everyone else is a **Runner** who has to cross the field **three times**. A knife hit downs a Runner. A teammate can revive them in the danger zone, or the Runner can use a Rescue Kit. Runners who stay down join the Chasers. Chasers win when no Runners are left.
- **Movement:** custom acceleration and momentum, sideways dashes, and Alt for an instant stop. Abilities go on **Q** (Circle / B on controller).
- **Currencies:** Gems buy permanent abilities. Coins buy consumables. XP gives levels and titles.
  - Runner abilities: Cloak, Pocket Door, Emergency Airhorn.
  - Chaser abilities: Rufus's Leash, Rocket Shoes, Big Dagger.
  - Consumables: Adrenaline, Banana Peel, Rescue Kit.
  - Knives are mostly cosmetic.
- **Game passes:** X2 EXP (199 R$), VIP (799 R$: +25% XP, VIP Dagger, chat tag).
- **Events:** Halloween runs from Oct 17 to Nov 7, 2026. Pt. 3 added a new map and knives.

## Notes

- The game uses its own movement system, so the **Speed** toggle (which sets `Humanoid.WalkSpeed`) may be overridden or have less effect than expected. Fly and teleport don't depend on it.

- Using an executor breaks Roblox's Terms of Use. Your account can be kicked or banned, especially if the game has anti-cheat that checks WalkSpeed or flying. Use an alt account and moderate values.
- Features that only work in this game, such as auto-farming coins or gems, need its internal RemoteEvent and object names. They aren't public. To add them, use Delta's Dex / Remote Spy to see what the game fires when you collect something, then extend the script.
