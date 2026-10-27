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
| Player | Fly + Fly Speed (10-300) | Steer with the thumbstick and camera. Use the **UP / DOWN** pad to climb or drop (E / Q on keyboard) |
| Visual | Player ESP | Highlights each player in their team colour (Runners and Catchers, if the game uses Teams), with name, team and distance |
| Visual | Fullbright | Removes darkness and fog. Original lighting is restored when turned off |
| Teleport | Save / Return to position | |
| Teleport | Teleport to player | Tap a name in the list |
| Misc | Anti-AFK | On by default |
| Misc | Rejoin Server / Unload Script | **X** in the title bar also unloads everything |

Running the script again unloads the previous copy first, so menus never stack.

## Notes

- Using an executor breaks Roblox's Terms of Use. Your account can be kicked or banned, especially if the game has anti-cheat that checks WalkSpeed or flying. Use an alt account and moderate values.
- Features that only work in this game, such as auto-farming coins or gems, need its internal RemoteEvent and object names. They aren't public. To add them, use Delta's Dex / Remote Spy to see what the game fires when you collect something, then extend the script.
