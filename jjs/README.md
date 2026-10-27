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
| Moves | Black Flash | **Do Black Flash** presses the move and times the second press to the white flash. **Auto Black Flash** finishes it whenever you use the move yourself. See below |
| Moves | Dash Behind | Gets you behind the nearest enemy within **Dash Range** using the game's own dash. See below. Use **Dash Behind Now**, the combo pad's **DASH BEHIND** button, a `BEHIND` step in a combo, or the toggle that does it automatically before every combo and Black Flash |
| Moves | Star Rage black hole | **Auto Black Hole on death**: when Yuki dies it presses G to latch on, then holds R. **Black Hole Now** does it on demand |
| Moves | Custom combo + M1 Gap / Skill Gap | Write your own (syntax below) and tune the timing |
| Moves | Combo Pad | A floating **COMBO** button with **< >** to switch combos mid-fight, plus **BLACK FLASH** and **DASH BEHIND** buttons |
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
| `BF` | A timed Black Flash using the Black Flash settings |
| `BEHIND` | Dash behind the nearest enemy |

Examples:
- `M1 M1 M1 M1 BF` is four hits into a Black Flash.
- `BEHIND M1 M1 M1 M1 BEHIND BF` opens from behind, then gets behind them again before the Black Flash, since knockback moves them.

## Black Flash

| Character | Black Flash move | Default timing |
| --- | --- | --- |
| Vessel (Yuji) | Divergent Fist (**3**), pressed again on the white flash | 0.40 s |
| Switcher (Todo) | Brute Force (**2**), pressed again on the flash | 0.40 s, a guess. Tune it |
| Perfection | Awakened only: **G** while awakened (preset combo) | n/a |
| Honored One, Cursed Partners, Salaryman, Strongest of History | Also Black Flash users, but I couldn't find reliable inputs | Set **Black Flash Key** and **Flash Timing** yourself |

How it works:

1. **Do Black Flash** presses the move, waits for your attack animation to start, then presses again **Flash Timing** seconds after that. Timing from the animation start, not from the button press, keeps ping from throwing it off.
2. The first run also **learns** the move's animation. After that, with **Auto Black Flash** on, whenever you use that move yourself (keyboard or on-screen button), the script does the second press for you.
3. **Detect White Flash (beta)** presses as soon as a highlight appears on your character, if that happens before the timing runs out. It can only make the press earlier, never later.

If it lands too early or too late, adjust **Flash Timing** in 0.02 s steps. Selecting a character loads its default key and timing.

## Dash Behind

JJS dashes with **Q** toward whichever movement key you hold, and movement keys follow the camera. Dash Behind uses that:

1. It picks a spot **Distance Behind** studs behind the nearest enemy, offset to the side you're already on so you don't run into them.
2. It swings your camera to look along that path, holds **W** and taps **Q**. That's the game's real dash, with its normal animation.
3. It waits **Dash Wait** seconds (default 0.35 s) for the dash to finish, then turns the camera back onto the enemy.

**Dash Style** (tap to cycle):

| Style | What happens |
| --- | --- |
| Game Dash (Q) | Only the real dash. If they're farther away than one dash covers, you land short |
| Game Dash + Snap | Real dash, then a 0.1 s slide into the exact spot behind them. Most reliable |
| Slide | No dash. Just the 0.1 s slide (the old behaviour) |

## Star Rage black hole

Star Rage's ultimate only works after she dies. You press G to latch onto someone, then hold R to summon the black hole. With **Auto Black Hole on death** on and Character set to **Star Rage**, the script does this 0.5 s after you die. It waits 1 s after G, then holds R for **Hold R for** seconds (2 s by default).

Built-in presets:

| Character | Presets | Moves (keys 1-4) |
| --- | --- | --- |
| Vessel | Black Flash `BF`, M1s into Black Flash `M1 M1 M1 M1 BF`, Cursed Chain `1 M1 M1 M1 2`, Crushing Finisher `M1 M1 M1 M1 2 1` | Cursed Strikes, Crushing Blow, Divergent Fist, Manji Kick |
| Switcher | Brute Force Black Flash `BF` | Swift Kick, Brute Force, Pebble Throw, Elbow Drop |
| Star Rage | universal only | Garuda Rebound, Rising Rage, Mass Breaker, Garuda Stab |
| Salaryman | universal only | Cleaving Whirlwind, Severance Kick, Blunt Cut, Stabilize |
| Cursed Partners | universal only | Severing Path, Resolute Slash, Outburst, Second Wind |
| Honored One | Rapid Kicks `M1 M1 M1 M1 3 4 M1 M1 M1 Q 2`, Red Opener `2 M1 M1 M1 M1 M1 1`, Blue Route `M1 M1 M1 1 R+4 M1 M1 M1 2` | Lapse Blue, Reversal Red, Rapid Punches, Twofold Kick |
| Restless Gambler | universal only | Reserve Balls, Shutter Doors, Rough Energy, Fever Breaker |
| Ten Shadows | universal only | Rabbit Escape, Nue, Toad, Divine Dog |
| Perfection | Awakened Black Flash `G` | Stockpile, Soul Fire, Focus Strike, Body Repel |
| Blood Manipulator | universal only | Piercing Blood, Flowing Red Scale, Supernova, Blood Edge |
| Every character | Basic `M1 M1 M1 M1 1`, Double Skill `M1 M1 M1 M1 3 4`, Dash Extend `M1 M1 M1 M1 Q M1 M1 M1 2` | |

The Vessel and Honored One combos come from community guides (Pro Game Guides and the JJS fan wiki). JJS updates often, so some may need retiming. I didn't find reliable combos for the other characters, so they get the universal ones plus their move list. Add your own in the Custom box.

### Tuning tips

- If hits drop mid-combo, raise **M1 Gap** (default 0.35 s). If moves come out too slowly, lower **Skill Gap** (default 0.6 s).
- For Black Flash, tune **Flash Timing** rather than adding `W` steps. `BF` handles the timing itself.

## About the game

- Place `9391468976`, universe `3508322461`, made by the *Tze's Shenanigans* group. Released in April 2022.
- It's a free-for-all battlegrounds fighting game with no teams. Default PC keys are **Q** dash, **F** block, **G** awakening and **1-4** moves. Mobile uses on-screen buttons, and the layout can be edited in the game's settings.

## Notes

- Using an executor breaks Roblox's Terms of Use. Players report **bans for flying** in JJS, so keep flights short, use an alt account and keep values moderate.
- **Game Dash (Q)** only presses keys, so it's as safe as dashing yourself. **Game Dash + Snap** and **Slide** also move your character directly, like a short teleport. Long ones are the easiest thing for anti-cheat to spot, so keep **Dash Range** modest. The default is 25 studs.
- The combo system and auto features press keys and click for you through `VirtualInputManager`, the same way a player would. They don't touch the game's internals, so they can't remove cooldowns, give infinite awakening or skip stuns. The server checks all of those.
- On mobile this depends on the game still reading keyboard and mouse input through its touch buttons. If combos do nothing on your phone, tell me. A fallback can tap the game's own on-screen buttons instead.
