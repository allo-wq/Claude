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

| Preset | Speed | Boost | Aerials | Auto Save | Perfect Aim | Air Dribble | Plays like |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Casual | 60 | off | off | off | off | off | Chases the ball on the ground |
| Pro | 85 | on | on | on | off | off | Boosts, goes up for aerials, drops back to save |
| **SSL** | 110 | on | on | on | **on** | **on** | Supersonic Legend: fastest rotations, aerials, air dribbles, saves, every touch aimed at the net |

## How the bot plays

- **Finds things by itself:**
  - The **ball** is the best-scoring part. Points come from "ball", "puck" or "sphere" in its name or its parent's name, a sphere shape, equal size every way, being loose (unanchored), and moving between scans. It rescans every few seconds, so the real moving ball wins over decorations.
  - **Your car** is found by trying, in order:
    1. a car you picked
    2. the seat you're in
    3. whatever the camera follows
    4. being welded into a car
    5. your character being the car itself (car-sized, wheels, no head)
    6. a model tagged with your name or user id

    For steering it learns which way the nose points from how the car moves while you drive.
  - **The goals** are everything with "goal" in its name, split into the two ends of the field.
- **Your net** is the end nearest where your car spawned. This is re-checked at every kickoff.
- **Predicts the ball** with gravity and works out the earliest point the car can reach it.
- **Lines up behind the ball** on the line to the opponent's net, then drives through it. If it's on the wrong side, it swings around the ball instead of knocking it toward your own net.
- **Auto Save:** when the ball is in your half heading for your net, it gets goal-side and clears it away.
- **Aerials:** when the predicted ball is high and close, it goes up to meet it.
- **Air Dribble** (SSL, Physics mode only):
  - **Start:** when the ball is low, right in front of your car, between you and the net, and more than ~45 studs from it, the car pops it up.
  - **Carry:** the car flies just behind and under the ball toward the net, keeping it about 12 studs up.
  - **Finish:** about 35 studs from the net it shoots.
  - **Gives up** if it loses the ball, after 7 seconds, or when it has to defend.

  It works properly when the diagnostics say the ball is controlled by **you**. Then the ball is steered along your car's nose. If the server controls the ball, only real touches keep it up, which drops much more often. The status line reads "Air dribble" while it's happening.
- **Perfect Aim:** when the ball touches your car, it's sent straight at the opponent's net at **Shot Power**. This works whether the bot or you are driving.

The **Bot** tab shows live diagnostics: whether the ball, your car and the goals were found, and what the bot is doing ("Lining up the shot", "Saving", "Aerial"...).

## Drive modes

| Mode | How it drives | Best for |
| --- | --- | --- |
| **Physics (works on mobile)** | Drives the car straight at its target and slows on arrival (except when shooting), applied both after and right before each physics step so the game's own car code can't cancel it. No key presses needed | Mobile, and the most precise. Only works if your device simulates your car (see "Car physics" in the diagnostics) |
| Seat input | Sets the car seat's own throttle and steering, the values the game reads from your controls. No key presses needed | Cars with a VehicleSeat, including when the server controls the car's physics |
| Keys (PC) | Holds W/A/D, holds left mouse to boost, taps right mouse to jump, like a player | PC. Looks more legit |

**Test Drive Methods** tries all three for a moment each (about 3 s in total) and keeps the first one that actually moves your car. It runs by itself the first time you turn the bot on. Run it again while you're free to drive, not during the kickoff countdown.

While the bot is on, a status line under the **BOT** pill shows what it's doing, or why it's stuck.

## If something's off

- **It attacks your own net:** tap **Swap Goals**. It resets itself at the next kickoff.
- **It can't find the ball, or picks the wrong thing:** under **Ball not found?** you have two options:
  - **Pick Ball:** tap it, then tap the ball on your screen. The script remembers its name and size, so it finds the ball again after every goal.
  - **Show Ball Candidates:** lists the 6 best guesses with name, size and score. Tap one to use it.
- **It can't find your car, or picks the wrong one:** under **Car not found?** you have two options:
  - **Pick Car:** tap it, then tap your car on screen.
  - **Show Car Candidates:** lists car-like models nearest your camera. Tap yours.

  Either way it remembers the car's model name and finds it again after respawns.
- **It goes round in circles:** the car now faces the way it's moving rather than spinning toward its target, slows to a stop on its target, and keeps one side when going around the ball. As a safety net, if it covers a lot of ground over 3 s but ends up where it started and no closer to the ball, it drives straight at the ball for 2.5 s. The status line then reads "Was circling: going straight at the ball". If you see that message constantly, send me the diagnostics.
- **It drives all over the place:** turn on **Visual → Bot Target Marker**. The green ball shows where the bot is heading.
  - If the orange-highlighted "ball" isn't the real ball, use **Pick Ball**.
  - If the green target sits on the wrong side of the ball, use **Swap Goals**.
  - If it keeps overshooting, lower **Bot Speed**.

  In Seat and Keys modes it learns within a few seconds whether your car's left and right are swapped, and which way the nose points.
- **The bot does nothing:** read the status line under **BOT**, then tap **Test Drive Methods** while you can drive. If all three results are near 0, the game ignores every way a script can drive, so send me the diagnostics. Without goals it still plays and just chases the ball.
- **Goals say "not found", or things get stuck:** tap **Rescan Ball, Car & Goals** once you're in a match. This also forgets anything you picked.
- **Keys mode steers the wrong way:** drive forward yourself for a few seconds so it learns which way your car's nose points.
- **Perfect Aim does nothing:** the diagnostics will say "(server controls it)". That means the game runs the ball on its server, so only real touches move it. Nothing a script sends can redirect it.
- **The car oversteers or wobbles:** lower **Turn Rate**. If it's too fast to control, lower **Bot Speed**.

## Visual and Misc

- **Ball ESP:** highlights the ball through walls, with distance and speed.
- **Landing Marker:** an orange disc where the ball will land. Only you see it.
- **Bot Target Marker:** a green ball where the bot is heading while Auto Play is on.
- **Fullbright, Anti-AFK, Rejoin, Unload.**

## Notes

- Using an executor breaks Roblox's Terms of Use. Physics mode and Perfect Aim move things in ways a normal player can't, so they are the easiest to spot. Use an alt account and keep speeds moderate.
- The game is in beta and its internals aren't public, so the bot finds things by name and position. If the diagnostics show something wasn't found, tell me what it says.
