# SideswipeBot

A practice bot for Sideswipe Soccer. Load `SideswipeBot.lua` in a client
environment that can `require` the game's client modules.

**It only drives in the game's local simulation** (freeplay, training,
offline games). In online matches it stands down and your controls work
as normal.

| Key | Action |
| --- | --- |
| F6 | Toggle the bot |
| F7 | Unload (restores the game's input functions) |
| F8 | Compact / detailed panel |
| Any movement key or gamepad input | You take over; let go and the bot resumes after `manualGrace` seconds |

The panel can be dragged by its header. The pill toggles the bot and × unloads it.

## Scripting API

`getgenv().SideswipeBot` (or `_G.SideswipeBot`):

- `Toggle()`, `SetEnabled(bool)`, `Stop()`
- `Config`: live tuning table (see `CONFIG` at the top of the script)
- `Brain`: the decision engine. `Brain.role`, `Brain.status`, `Brain.ourArrival`, etc.
- `ExportTrace()`: writes the last 240 decisions to `SideswipeBot-trace.json`

## How it decides

- **Ball forecast.** The bot runs the game's own physics on a ball-only clone, out to
  1.6 s ahead and a slice per frame. It re-forecasts as soon as the real ball drifts
  from the prediction (someone touched it). Wall and ceiling rebounds are included.
- **Intercepts and arrival times.** It targets the earliest point on that path it
  can reach, and compares when it and each opponent can reach the path to pick
  first touch, challenge or shadow.
- **Threats.** The forecast flags balls that will reach our goal after a rebound.
  Saves aim for the earliest reachable point before the line.
- **Let it score.** It doesn't touch a ball already going in that no opponent can stop.
- **Rollout search.** Shot candidates (gold/purple specials, flips, chips) are simulated
  0.3 s ahead and the best is kept. A final safety rollout vetoes any input that
  knocks the ball toward our own net.
- **Recharging.** Fuel refills on any surface, so a car caught upfield drives back at
  full throttle while it recharges.

Errors don't kill the bot: a failing frame hands that frame back to you, and the bot
unloads only after `maxErrors` errors within `errorWindow` seconds.

## Testing

`tests/` holds a headless harness. `mock.lua` is a crude 2D stand-in for the
game's `World`/`Tuning`, **not** the real physics. It plays the bot against the
previous version (`baseline_v0_6.lua`):

```sh
lua5.1 tests/run.lua SideswipeBot.lua tests/baseline_v0_6.lua new-vs-old 300
python3 -I tests/evaluate.py 300 60 "default="       # many seeds, both sides
```

Treat mock results as a smoke test and a rough comparison only; they say
nothing reliable about play against the real game's physics.
