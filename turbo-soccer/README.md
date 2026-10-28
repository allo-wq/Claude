# Turbo Soccer Hub (Delta mobile)

An auto-play bot with skill presets for [Turbo Soccer](https://www.roblox.com/games/101880234193261/Turbo-Soccer), Roblox's Rocket League-style car soccer game. Built for the Delta executor on mobile, and it also works on PC executors.

## How to run

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/allo-wq/Claude/claude/awesome-meitner-7m0jm7/turbo-soccer/TurboSoccer.lua"))()
```

1. Join a match, paste the line above into Delta and tap **Execute**.
2. Tap the blue **BOT OFF** pill to start Auto Play. Tap again to stop.
3. Tap the round **TS** button for the full menu.

## Presets

Tap **Preset** to cycle. A preset fills in every Skill setting, and you can still tweak them afterwards. **SSL** is loaded by default.

| Preset | Speed | Boost | Aerials | Auto Save | Perfect Aim | Plays like |
| --- | --- | --- | --- | --- | --- | --- |
| Casual | 60 | off | off | off | off | Chases the ball on the ground |
| Pro | 85 | on | on | on | off | Boosts, goes up for aerials, drops back to save |
| **SSL** | 110 | on | on | on | **on** | Supersonic Legend: fastest rotations, aerials, saves, every touch aimed at the net |

## How the bot plays

- **Finds things by itself:**
  - The **ball** is the biggest part with "ball" in its name.
  - **Your car** is whatever you're seated in or welded to.
  - **The goals** are everything with "goal" in its name, split into the two ends of the field.
- **Your net** is the end nearest where your car spawned. This is re-checked at every kickoff.
- **Predicts the ball** with gravity and works out the earliest point the car can reach it.
- **Lines up behind the ball** on the line to the opponent's net, then drives through it. If it's on the wrong side, it swings around the ball instead of knocking it toward your own net.
- **Auto Save:** when the ball is in your half heading for your net, it gets goal-side and clears it away.
- **Aerials:** when the predicted ball is high and close, it goes up to meet it.
- **Perfect Aim:** when the ball touches your car, it's sent straight at the opponent's net at **Shot Power**. This works whether the bot or you are driving.

The **Bot** tab shows live diagnostics: whether the ball, your car and the goals were found, and what the bot is doing ("Lining up the shot", "Saving", "Aerial"...).

## Drive modes

| Mode | How it drives | Best for |
| --- | --- | --- |
| **Physics (works on mobile)**, default | Steers and speeds the car directly. No key presses needed | Mobile, and the most precise |
| Keys (PC) | Holds W/A/D, holds left mouse to boost, taps right mouse to jump, like a player | PC. Looks more legit |

## If something's off

- **It attacks your own net:** tap **Swap Goals**. It resets itself at the next kickoff.
- **The diagnostics say "not found":** tap **Rescan Ball, Car & Goals** once you're in a match and driving.
- **Perfect Aim does nothing:** the diagnostics will say "(server controls it)". That means the game runs the ball on its server, so only real touches move it. Nothing a script sends can redirect it.
- **The car oversteers or wobbles:** lower **Turn Rate**. If it's too fast to control, lower **Bot Speed**.

## Visual and Misc

- **Ball ESP:** highlights the ball through walls, with distance and speed.
- **Landing Marker:** an orange disc where the ball will land. Only you see it.
- **Fullbright, Anti-AFK, Rejoin, Unload.**

## Notes

- Using an executor breaks Roblox's Terms of Use. Physics mode and Perfect Aim move things in ways a normal player can't, so they are the easiest to spot. Use an alt account and keep speeds moderate.
- The game is in beta and its internals aren't public, so the bot finds things by name and position. If the diagnostics show something wasn't found, tell me what it says.
