# What I changed in bot/ and why

The baseline practice (compact, seed 11, five squads) showed the problem: **every player at a base was swallowed by the
closing void 35-43 s after the beds went** -- ours and the scripted squads alike -- and only the collectors that happened
to stand on the middle lived. The four of us also sat on our one forge the whole game, each starving the others, so the
rushers never left home. The changes go at both.

## 1. The endgame (bot/scriptedBot/playbooks/bedwars.mjs: `endgameTimes`, `playEndgame`, `shopForTheEnd`)
- All timings are fractions of `view.rules.timeLimit` (practice is 6 min, the real games 10 min).
- `endgameTimes(limit, homeToMid, midR)`: the team leaves for the middle at `0.6*limit - travel`, where travel is
  20 s plus 0.8 s for every block of void (bridging ran at 2-3 blocks a second in practice) between the base's front and the middle (never before 0.42 of the limit);
  it re-gears at home for 0.05 of the limit before that.
- Re-gear (all roles, near home): stand on the forge and buy, one item a tick, toward the final fight: diamond/iron
  armour, iron/diamond sword, 64+ blocks, chain armour, golden apples, and any team upgrade the diamonds carried pay for.
- From the leaving time on (or once the zone exists) nothing else runs but a bed in reach: at home, buy and wait at the
  forge only until the crossing's blocks are carried (while the border still spares home); then **bridge to the
  middle's top** -- aiming at `middle.y + 1`, so on High Middle / Archipelago the bridge stairs up instead of running
  into the island's side -- and hold its centre (within 4 blocks, inside the zone's radius), fighting only foes inside
  the zone and on the middle, never chasing out. A player out of the zone, under its floor or being counted in its void
  goes straight back in.
- The old fallback "their bed is down: hunt them at their base" no longer runs after the beds go (it walked out of the
  zone).

## 2. One forge for four
- Before 0.3 of the limit the defender takes only the iron its bed cover needs and nobody saves gold, so the rushers
  get their stone sword and blocks first and actually go.
- The collector collects until 0.42 of the limit (was a fixed 240 s), and stops 1.2 blocks from a generator (the
  pickup reaches 1.8; at 0.8 it stood a whole game next to one without taking it).
- The upgrade order is Protection I, Sharpness, Forge I, Protection II, Forge II, Protection III.

## 3. The bed's cover
- After the inner layer of wool, the defender buys end stone (24 iron) and builds an outer shell round it
  (`bedShell`): 15 s a block to dig by hand, so a rusher without a pickaxe cannot get through before help comes.
  Never into its own cell.

## 4. Skills (bot/scriptedBot/skills.mjs)
- `middle()` (the middle island: centre, top, radius), `placeWith(at, block)` (a named block, any block as fallback),
  `countBlock(name)`.
- `matchClock()`: the host's `elapsed` and `timeLimit`. The general state's `rules.timeLimit` was not there in practice,
  so the first version fell back to 600 s in a 360 s game and left too late.
- `pillarUp()`: the hard bot's pillar (a block in my own cell as I jump). Practice 2 (High Middle) showed why: a level
  bridge from a low diamond island ran under the high middle, out of blocks against its underside, and the void took
  the player. Now, below the middle's top at the edge of its ground, a player climbs to the middle's height first and
  then bridges level onto it.

## 5. Generators that cannot be reached
- A stocked generator nearby is chased 12 s at most, then left alone for a while (a rusher spent 45 s by one).

## Practice
- 1 (compact, the unchanged bot): a draw; 18 of 20 players swallowed by the void, ours included.
- 2 (highmid, first endgame version): **we won** (Blue); three of ours reached the middle, one died under it (fixed
  since: pillar, host clock).
- 3 (archipelago): the arena stalled (its clock jumped from 88 s to 425 s and the zone took everybody at once); our
  defender was seen climbing at its base's front toward the middle's height.
- 4 (standard, final version): **we won** (Yellow), three of four alive; all four held the middle and took 9 final
  kills there while the scripted squads came over one by one or were swallowed outside the border.

## What I would do next
- A team radio (a shared module) to split the forge between the four instead of the fixed early-priority rule.
- Tools in hand for digging (shears for wool, a pickaxe for end stone) so the rushers break covered beds faster.

## Tests
- `tests/endgame.test.mjs`: the leaving time comes before the beds go and earlier from far bases; the shell never
  overlaps the inner layer.
