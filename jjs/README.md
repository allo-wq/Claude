# JJS Hub (Delta mobile)

A touch-friendly utility menu for [Jujutsu Shenanigans](https://www.roblox.com/games/9391468976/Jujutsu-Shenanigans), built for the Delta executor on mobile. It also works on PC executors.

## How to run

1. Join Jujutsu Shenanigans.
2. Open Delta, paste the contents of [`JJS.lua`](JJS.lua) into the editor, and tap **Execute**.
3. Tap the round green **JJS** button to show or hide the menu.

If this repository is public, you can run it with a one-liner instead:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/allo-wq/Claude/main/jjs/JJS.lua"))()
```

If the file hasn't been merged into `main` yet, use the branch name in place of `main`.

## Features

| Tab | Feature | Notes |
| --- | --- | --- |
| Player | Speed + Walk Speed (16-200) | Held every frame. This also overrides the slowdowns the game applies during moves and stuns |
| Player | High Jump + Jump Power (50-300) | |
| Player | Infinite Jump | Hold or tap the normal jump button |
| Player | Noclip | Original collisions are restored when turned off |
| Player | Fly + Fly Speed (10-300) | Steer with the thumbstick and camera. Use the **UP / DOWN** pad to climb or drop (Space / LeftControl on keyboard). Q, F and G are left alone for dash, block and awakening |
| Moves | Character + Auto-Detect | Reads your hotbar's move names to work out which character you're using. Tap **Character** to pick one yourself |
| Moves | Combos | Tap one to run it, tap again to stop. The menu hides itself so the M1 clicks reach the game |
| Moves | Custom combo + M1 Gap / Skill Gap | Write your own (syntax below) and tune the timing |
| Moves | Combo Pad | A floating **COMBO** button with **< >** to switch combos mid-fight |
| Moves | Face Nearest Enemy | Turns you toward the closest player in range. Always on while a combo runs, so hits land |
| Moves | Auto M1 | Attacks whenever an enemy is within **Target Range** |
| Moves | Auto Block (experimental) | Holds F while a nearby enemy plays an attack animation |
| Visual | Player ESP | Highlights every player with name, HP and distance. The colour goes from green at full health to red when nearly dead |
| Visual | Fullbright | Removes darkness and fog. Original lighting is restored when turned off |
| Teleport | Save / Return to position | |
| Teleport | Teleport to player | Tap a name in the list |
| Misc | Anti-AFK | On by default |
| Misc | Rejoin Server / Unload Script | **X** in the title bar also unloads everything |

Running the script again unloads the previous copy first, so menus never stack. It runs alongside the Huss Valley hub without clashing.

## Combos

Combos are steps separated by spaces:

| Step | Does |
| --- | --- |
| `M1` | Basic attack |
| `1` `2` `3` `4` | Your character's moves |
| `R` `Q` `F` `G` | Special, dash, block, awakening |
| `R+4` | Hold R while pressing 4 (variant moves) |
| `W0.4` | Wait 0.4 s. This replaces the normal gap after the step before it |

Example: `M1 M1 M1 M1 3 W0.4 3` is four hits, then Divergent Fist pressed twice for a Black Flash.

Built-in presets:

| Character | Presets | Moves (keys 1-4) |
| --- | --- | --- |
| Vessel | Black Flash `3 W0.4 3`, Cursed Chain `1 M1 M1 M1 2`, Crushing Finisher `M1 M1 M1 M1 2 1` | Cursed Strikes, Crushing Blow, Divergent Fist, Manji Kick |
| Honored One | Rapid Kicks `M1 M1 M1 M1 3 4 M1 M1 M1 Q 2`, Red Opener `2 M1 M1 M1 M1 M1 1`, Blue Route `M1 M1 M1 1 R+4 M1 M1 M1 2` | Lapse Blue, Reversal Red, Rapid Punches, Twofold Kick |
| Restless Gambler | universal only | Reserve Balls, Shutter Doors, Rough Energy, Fever Breaker |
| Ten Shadows | universal only | Rabbit Escape, Nue, Toad, Divine Dog |
| Perfection | universal only | Stockpile, Soul Fire, Focus Strike, Body Repel |
| Blood Manipulator | universal only | Piercing Blood, Flowing Red Scale, Supernova, Blood Edge |
| Every character | Basic `M1 M1 M1 M1 1`, Double Skill `M1 M1 M1 M1 3 4`, Dash Extend `M1 M1 M1 M1 Q M1 M1 M1 2` | |

The Vessel and Honored One combos come from community guides (Pro Game Guides and the JJS fan wiki). JJS updates often, so some may need retiming. I didn't find reliable combos for the other characters, so they get the universal ones plus their move list. Add your own in the Custom box.

### Tuning tips

- If hits drop mid-combo, raise **M1 Gap** (default 0.35 s). If moves come out too slowly, lower **Skill Gap** (default 0.6 s).
- Black Flash timing depends on your ping. Try values from `W0.3` to `W0.5`.

## About the game

- Place `9391468976`, universe `3508322461`, made by the *Tze's Shenanigans* group. Released in April 2022.
- It's a free-for-all battlegrounds fighting game with no teams. Default PC keys are **Q** dash, **F** block, **G** awakening and **1-4** moves. Mobile uses on-screen buttons, and the layout can be edited in the game's settings.

## Notes

- Using an executor breaks Roblox's Terms of Use. Players report **bans for flying** in JJS, so keep flights short, use an alt account and keep values moderate.
- The combo system and auto features press keys and click for you through `VirtualInputManager`, the same way a player would. They don't touch the game's internals, so they can't remove cooldowns, give infinite awakening or skip stuns. The server checks all of those.
- On mobile this depends on the game still reading keyboard and mouse input through its touch buttons. If combos do nothing on your phone, tell me. A fallback can tap the game's own on-screen buttons instead.
