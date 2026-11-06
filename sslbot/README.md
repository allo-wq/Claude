# SSLBot for Turbo Soccer (Delta mobile)

A separate auto-play bot for [Turbo Soccer](https://www.roblox.com/games/101880234193261/Turbo-Soccer). It's a Luau port of **SSLBot**, a hand-coded Rocket League bot for the RLBot framework (Python). Built for the Delta executor on mobile, and it also works on PC executors.

## How to run

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/allo-wq/Claude/claude/awesome-meitner-7m0jm7/sslbot/SSLBot.lua"))()
```

1. Join a match, paste the line above into Delta and tap **Execute**.
2. Tap the purple **BOT OFF** pill to start. The first time, it spends about 3 s testing which drive method moves your car.
3. Tap the round **SSL** button for the menu.

Only one bot drives at a time. Running SSLBot closes Turbo Soccer Hub, and running the hub closes SSLBot.

## What was ported

| Original (Python) | Job | In the Luau script |
| --- | --- | --- |
| `util/game.py`, `util/vec.py`, `util/orientation.py` | Game state, vectors, car axes | `buildState`, field-frame helpers, `makeCarState` |
| `mechanics/drive.py` | Throttle and boost curves, speed-dependent turn radius, reach tables, `drive_to` with turn-circle awareness | `Drive` |
| `mechanics/sequences.py` | Timed flips, half-flips, jump shots, jump curve | `Seq` |
| `mechanics/air.py` | PD orientation control, aerial feasibility, aerials, air recovery | `Air` |
| `strategy/intercept.py` | Earliest reachable intercept along the real approach path, goal threats, shot and save directions | `Strat` |
| `strategy/kickoff.py` | Closest car goes, speed-dodge, dodge into the ball | `Kickoff` |
| `strategy/brain.py` | Roles (attack / support / back), shadowing, retreating, saves, going to net, travel with half-flips and flips | `Brain` |

The decision logic and its tuning (`ARRIVE_EARLY`, `MIN_APPROACH_SPEED`, the PD gains, `JUMP_REACH`...) are unchanged. The `tests/` sim and the RLBot glue (`bot.py`, the `.cfg` files) are not needed in Roblox.

## How it fits Rocket League logic onto Turbo Soccer

- **Field frame:** the bot thinks in Rocket League units (uu) on a frame fitted to the pitch: x across, y toward the opponent's net, z up. It always plays as "blue", so your net is at -y.
- **Scale:** the pitch's half length, measured to the end walls above the goals, becomes 5120 uu, which sets studs per uu. The side walls, the ceiling and the ball's radius are measured too. Distances and speeds keep the original's proportions.
- **Ball prediction:** 6 s at 60 Hz, using the game's real gravity, with bounces off the floor, ceiling and walls, and goals.
- **Kickoffs:** Roblox has no kickoff flag, so the ball sitting still on the centre spot counts as a kickoff.
- **Teammates and opponents:** any car model whose owner is on your Team is a teammate, everything else is an opponent. They're used for role ranking and for working out who reaches the ball first.
- **Boost:** Turbo Soccer's boost meter isn't readable, so the bot assumes it has boost. There are no boost-pad grabs.

## Drive modes

SSLBot outputs controller inputs (throttle, steer, pitch, yaw, roll, jump, boost, handbrake). They're turned into driving three ways:

| Mode | How |
| --- | --- |
| **Physics (works on mobile)** | A Rocket League car model drives your car directly: throttle and boost curves, turn radius by speed, jumps, double jumps, dodges, air control, and RL gravity in the air. No key presses needed |
| Seat input | Sets the car seat's throttle and steering. Mouse buttons for boost and jump, Shift for powerslide |
| Keys (PC) | W/S drive (pitch in the air), A/D steer (yaw in the air), Q/E air roll, left mouse boost, right mouse jump, Shift powerslide |

**Test Drive Methods** tries each one and keeps the first that moves your car. In Seat and Keys modes, it learns within a few seconds if left and right are swapped.

## Menu

- **Auto Play** (or the **BOT** pill), **Drive** mode, **Test Drive Methods**, **Aerials**.
- **Field:**
  - **Swap Goals** if it attacks your own net. This resets itself at the next kickoff.
  - **Rescan**.
  - **Pick Ball** / **Pick Car**: tap it, then tap the thing on screen. It's remembered after goals and respawns.
- **Diagnostics:** what it found (ball, car, goals), the measured pitch size and studs-to-uu scale, teammates and opponents, the drive test, and what the bot is doing.
- **Debug Markers**, like the original's render: a cyan line and ball to the current target, and a red box at the chosen intercept. The status under **BOT** shows the original's state labels: `attack`, `shadow`, `support`, `save`, `net`, `retreat`, `back`, `kickoff:diag`, `aerial`, `flip`, `jump_shot`, `recover`...

## Notes

- Using an executor breaks Roblox's Terms of Use. Physics mode moves your car in ways a player can't, so it's the easiest to spot. Use an alt account.
- As the original's README says, a hand-coded bot like this plays solid fundamentals but isn't truly SSL-level. That would take a reinforcement-learning policy.
- The game is in beta and its internals aren't public, so the bot finds things by name, shape and position. If something in the diagnostics says "not found", use Pick Ball / Pick Car, or send me what it says.
