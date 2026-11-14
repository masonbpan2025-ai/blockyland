# Plan: how four Opus bots win five-team Bed Wars

## What decides a game
- Points come from **outlasting** teams. At 0.6 of the time limit (6:00) every bed is destroyed and every death becomes
  final; from 6:00 to 9:00 the zone closes on a ~9-block circle round the middle and the void rises to one block under
  the middle's tops. So nearly every game is decided **in the middle, between 6:00 and 10:00**, by which team arrives there
  with the most players, the best gear and the blocks to get there.
- Before 6:00 a death costs only 5 s and the kit (bed standing). The bed only buys respawns until 6:00.
- Therefore: (1) keep the bed alive until 6:00 so early deaths are free, (2) build an economy that turns into permanent
  gear (armour, team Protection/Sharpness) and good consumables (iron sword, golden apples, 64+ blocks), (3) be in the
  middle **together** before the border passes the bases, (4) fight as a group there and never leave the zone.

## Time is a fraction of the limit
All timings use `view.elapsed / view.rules.timeLimit` (practice games are 6 min, the real ones 10 min), never fixed seconds.
- f < 0.50: build-up (roles below).
- f >= 0.50: everyone **re-gears at home** (iron armour, iron sword, apples, 64+ blocks) when there.
- f >= 0.53 (or as soon as geared after 0.50): everyone **moves to the middle**, bridging with stairs to its top (the high
  middle stands 3-6 above the bases: aim at `middle.y + 1` so the bridge stairs upward).
- f >= 0.6: no bed; deaths final. Inside the zone: stay within `radius - margin` of its centre, above the floor; fight
  only foes inside the zone and near us; collect the emeralds on the middle; never chase out.

## Roles (by name order, as the scripted bot shares them)
- **Defender (Opus1)**: covers the bed (layer of wool on it and around, then an outer layer of end stone -- 15 s to dig
  by hand, a scripted rusher has no pickaxe), holds the front of the base, keeps the forge iron flowing, buys its kit.
- **Collector (Opus2)**: diamonds (and emeralds) for team upgrades: Protection I, Sharpness, Forge, Protection II, ...
  -- permanent for the whole team and the biggest edge in the final fight.
- **Rushers (Opus3, Opus4)**: as a pair to the nearest enemy bed early (beds broken early turn that team's deaths final
  long before 6:00 -- the teams that fall first are the points). They stop rushing at f >= 0.45 to re-gear.

## Who to attack / who attacks us
- The two neighbours are nearest; the scripted squads rush the nearest bed, so we will be rushed by neighbours: the
  defender plus the bed cover hold until the respawned team gets back.
- Rushers go for the neighbouring bed nearest our base (both pick the same one).

## The end
- Leave home early enough: on archipelago the bases are ~60 out and the border passes them ~25-40 s after 6:00.
- Carry 64+ blocks; aim at the middle's top, so the bridge climbs; then hold near the centre, fight together.
- After 0.6 no player ever goes "hunting at their base" (the old fallback walked out of the zone).
