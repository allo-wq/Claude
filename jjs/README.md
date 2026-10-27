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
| Visual | Player ESP | Highlights every player with name, HP and distance. The colour goes from green at full health to red when nearly dead |
| Visual | Fullbright | Removes darkness and fog. Original lighting is restored when turned off |
| Teleport | Save / Return to position | |
| Teleport | Teleport to player | Tap a name in the list |
| Misc | Anti-AFK | On by default |
| Misc | Rejoin Server / Unload Script | **X** in the title bar also unloads everything |

Running the script again unloads the previous copy first, so menus never stack. It runs alongside the Huss Valley hub without clashing.

## About the game

- Place `9391468976`, universe `3508322461`, made by the *Tze's Shenanigans* group. Released in April 2022.
- It's a free-for-all battlegrounds fighting game with no teams. Default PC keys are **Q** dash, **F** block, **G** awakening and **1-4** moves. Mobile uses on-screen buttons, and the layout can be edited in the game's settings.

## Notes

- Using an executor breaks Roblox's Terms of Use. Players report **bans for flying** in JJS, so keep flights short, use an alt account and keep values moderate.
- Combat automation such as auto-block, auto-combo or kill aura needs the game's internal RemoteEvent names. They aren't public. Use Delta's Remote Spy to capture what fires when you block or attack, then extend the script.
