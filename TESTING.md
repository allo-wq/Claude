# Veilbreak — How-to-Test Checklist

Use a flat creative world first, then a survival run. Keep the **content log
GUI** enabled (Settings → Creator) — the bar to pass is **zero errors**.

## Import & boot
- [ ] `Veilbreak.mcaddon` double-click imports both packs without errors.
- [ ] Activating the BP on a world auto-adds the RP (UUID dependency).
- [ ] World loads; content log shows `[Veilbreak] scripts loaded` and no errors.

## Summon ritual
- [ ] Craft Dim Iron (8 iron + 1 soul soil) and Wick of Souls (string/soul torch/bone).
- [ ] Wrong/missing frame → actionbar explains the 5×5 ring; wick NOT consumed.
- [ ] Correct frame + use wick on center → souls stream up, roar, Noxhollow spawns,
      camera shakes, exactly one wick consumed.
- [ ] Set `canSummonAnywhere: false` → ritual refuses above Y -40 with a message.

## Phase 1 (100→66%)
- [ ] Boss bar reads "Noxhollow, the Hollow Lantern" and the sky darkens.
- [ ] Boss music starts when you engage (and again ~93s later — loop re-arm).
- [ ] Melee swipe has a visible wind-up; soul embers arc, land, and leave a
      burning cyan-amber patch that damages you for ~3s.

## Phase 2 (≤66%)
- [ ] Roar animation + actionbar "begins to drink the light", 3 Wisps spawn.
- [ ] Wisps float, bob, attack, die, and drop 0–1 Soulforged Iron.
- [ ] **The Snuffing** (~within 3s of the transition, then every ~18s):
      lantern raised (tell) → torches gutter with smoke → screen goes dark + fog.
- [ ] Holding a torch/lantern: shorter darkness, no damage, "your light holds".
- [ ] Empty hands: 5s darkness + 6 damage.
- [ ] Fog pops back off after ~4.5s (run `/fog @s remove veil_snuff` if you
      disconnect mid-snuff).
- [ ] Shadow pools appear near players, damage + wither when stood in (unless
      holding a light), and expire after 10s.

## Phase 3 (≤33%)
- [ ] "HOLLOW RAGE" actionbar; lantern/eyes/core glow visibly brighter
      (render controller texture swap) and attacks speed up.
- [ ] **Soulburst**: warning sound + expanding cyan ring over 2.5s; standing in
      the open ≤14 blocks hurts + knocks back; hiding behind a pillar →
      "You ducked behind cover!" and no damage.

## Death scene & loot
- [ ] At low HP the boss stops fighting, buckles over ~3s, souls stream upward,
      lantern shatters (glass + shake), THEN loot appears and the boss bar fades.
- [ ] Guaranteed drops: Hollow Lantern, Soulrend, Roadster Key, Noxhollow's
      Skull + 4–8 Soulforged Iron + XP orbs.
- [ ] `lootEnabled: false` → only iron + XP drop.
- [ ] One-shot the boss with `/damage` 9999 → loot still drops exactly once.

## Soulrend
- [ ] Held model shows in first and third person (scythe, glowing edges).
- [ ] Hitting mobs: ~30% of hits apply cyan orbiting motes (the mark) for 6s.
- [ ] Hitting a marked mob deals visible bonus damage (test on a high-HP mob).
- [ ] Killing blow: soul stream + the wielder heals 2 hearts.
- [ ] Durability bar visibly drops 1 per hit; at zero the weapon shatters with
      glass sound. Repairs on an anvil with Soulforged Iron.

## Hollow Roadster
- [ ] Use Roadster Key → car spawns where you look, key consumed, start chime.
- [ ] Ride: forward accelerates smoothly to top speed; back brakes (fizz sound)
      then reverses slowly; strafe steers, more strongly at speed.
- [ ] Wheels spin with movement; headlight motes glow while driving; engine hum
      loops while moving. Steps up slabs (auto-step), takes no fall damage.
- [ ] Mobs never mount it; second player can sit in the passenger seat.
- [ ] Drive, quit to menu, reload world → car still exists and still drives.
- [ ] Push it into the void → it removes itself (no ghost entity).

## The Hollow Lantern (item)
- [ ] Holding it: cyan beam motes project where you look + soft hum.
- [ ] Monsters in the cone get Weakness (their hits drop noticeably).
- [ ] Holding it during The Snuffing counts as a held light.

## Multiplayer
- [ ] Summon with 2 players nearby → boss bar shows ~900 HP scale (longer fight).
- [ ] Snuffing/fog/darkness hit every player within 24 blocks independently
      (a lit player and an unlit player get different outcomes).
- [ ] Music starts for everyone within 48 blocks and stops for all on death.

## Reload & stability
- [ ] Quit mid-phase-2 and reload: boss keeps phase (entity property), Snuffing
      resumes, no errors.
- [ ] Quit mid-death-scene and reload: death completes, loot drops once.
- [ ] Leave the boss area (>32 blocks): boss persists (no despawn).
- [ ] Run 10 minutes idle with boss + car loaded: content log stays clean.
