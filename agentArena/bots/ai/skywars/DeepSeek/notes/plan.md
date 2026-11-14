# Plan: a SkyWars bot for any map, in a five-player free-for-all

## 1. What changes from map to map

Every template keeps the same contract (`ref/skywars-maps.js`): one spawn island per player, void
between them, chests on the spawns and better loot in the middle(s), and at least
`ARENA.minGap` blocks of void so nobody reaches anyone without bridging. Everything else varies:

| Template | Layout | What it demands |
| --- | --- | --- |
| Classic Ring | 8 spawns in a ring (r≈23-25, y 30) round one middle (r≈8-9) | one straight bridge to the middle (≈11 blocks) |
| Archipelago | spawns far out (r≈33), 4 or 8 one-chest connector islands at mixed heights | hop through connector islands; direct bridge ≈23 blocks |
| Citadel | spawns low, big middle **higher** (y+1..2), four corner towers holding chests | bridge up; tower chests may be behind walls |
| Sectors | 4 sectors of 2 spawns, a sector island with 2 chests each, small middle | sector islands are the way in; fights happen on them |
| Twin Peaks | **no island in the middle**: a high peak east and a low peak west, stepping islands north/south | the middle is two places at different heights; choose the reachable one |
| Sky Tiers | middle tower with a platform 6 blocks up (best chests on top) and a staircase; stepping islands at y±3 | vertical movement, not just bridging; foot chests first |
| Sub-Mid Cross | small middle, four sub-mid islands 3 blocks lower with 2 good chests each | sub-mids are the fight ground; they are the cheap loot |
| Rush | close spawns (r≈22) with ready-made one-wide bridges to the middle | fights come in seconds; the bridge is the danger |

Chests are the map's own, seed-dependent geometry: spawn chests are tagged `slot` and `ring:
'island'`, center chests `ring: 'center'`, connector/sector/sub-mid chests `ring: 'mid'`. Reading the
objectives therefore tells the bot where every island is, on every template, without knowing the
template. The middle place and all eight spawn places come from `view.places`.

Dangers: void (below y=-4), fall damage from drops over 3 blocks, one-wide bridges, elevated
middle platforms, and (in a free-for-all) being third-partied while bridging.

## 2. What a bot must handle to win on all of them

- **Loot before crossing.** A starting island holds 2-4 stacks of blocks (8-16 each, *in total* over
  its chests) and 1-3 swords; crossing needs roughly `voidCellsToward(target)` blocks, and a
  diagonal one-wide bridge also lays a corner block each step. The bot loots **every chest on its
  island** before it leaves: one chest left behind is a crossing it cannot finish. It crosses only
  with `voidCellsToward + reserve` blocks (reserve `max(6, 0.4 x void)`); if nothing is "safe" it
  takes the cheapest crossing it can just afford, because every middle/connector chest holds a
  block stack to refill from.
- **Route through what is reachable.** Never start a 40-block bridge with 16 blocks. A chest is a
  valid target only if it is on my island (no void on the straight line) or if
  `blocks >= voidCellsToward(chest)+2`. That rule picks connector/sector/sub-mid islands on the maps
  that have them and the middle on the maps that do not, without any template-specific code.
- **Different heights.** `moveStepToward` stair-bridges toward a higher target, so an elevated
  middle (Citadel, Sky Tiers, Twin Peaks' high peak) is reachable; the bot aims at the chest's own
  `y`. If a chest cannot be reached (tower, platform, wall) the loot attempt fails — the bot records
  it and tries another instead of retrying forever.
- **Never fight over void.** The existing session already: holds below a higher foe, steps off the
  void line, refuses to trade with the void behind it, bridge-defends, uses pearl clutches, and
  throws snowballs/eggs at anyone on narrow ground. I keep all of it and only feed it better targets.
- **Refills.** Chests refill at 3:00 and 6:00; the session clears `lootedChestKeys` on the refill
  event, so the same rule automatically loots them again. Unreachable-chest marks expire, so a chest
  that was unreachable from where I stood is retried from a new position.

## 3. Coming out on top of a free-for-all

Scoring is placement: every player outlasted counts, and the winner outlasts all four. Four
opponents mean:

1. **Fight the fight you are in, not the one you want.** Any foe inside ~6 blocks is answered at
   once (the session's melee, bow, throws, edge play). Ignoring a close foe to chase another is a
   free hit taken.
2. **Pick targets by value.** When choosing whom to chase, the closest foe is preferred, but a
   wounded foe (≤8 health) within reach is worth a detour: it is a kill, a placement, and its loot.
   Only start a fight at 6-12 blocks when the foe is hurt or we clearly out-gear it.
3. **Do not bridge into a contested middle.** If a foe is within 10 blocks, only loot chests that
   are on my own island (no void on the line); otherwise deal with the foe first. A fight on a
   one-wide bridge is lost to a snowball, and a fight started while bridging is lost to the void.
4. **Keep looting while it is free.** Middle/connector chests hold the diamond gear, pearls, golden
   apples and the bow; taking them before the others arrive is the game's biggest edge. After the
   middle and connectors are done, other spawns' chests are the fallback — only when clearly strong
   or when few opponents remain.
5. **Convert a lead into kills.** Once geared (weapon ≥6, 2+ armour pieces) and after the first
   minute, a visible foe is hunted rather than avoided: the round is only won by outlasting everyone,
   and a tie at the time limit scores nothing. From the last two opponents on, hunt continuously.
6. **The clock.** The first chest refill (3:00) is worth looting again; the second (6:00) adds a
   pearl to every chest. With 8 minutes of play the bot keeps looting refills and hunting instead of
   camping, so it does not arrive at the limit with four players alive.

## 4. Strategy, in the order the playbook checks it each tick

1. Not playing → reset the round clock and the per-round chest memory.
2. `heal()` (the session refuses an in-reach apple; a 1.6 s eat inside a swing is a free hit).
3. A foe within 6 → fight the nearest; a foe within 12, hurt or out-geared → fight it.
4. A foe on narrow ground within a throw's range → snowball/egg (one clean hit is a fall).
5. An apple before a melee that is 9-12 blocks away and closing.
6. **Loot**, in this order:
   - **every** chest on my spawn island (it holds the blocks all the later crossings need);
   - the middle/connector chests (the good loot), the **cheapest crossing first** -- a connector
     island on my side before the middle, so each hop refills the block supply;
   - other spawns' chests when strong, after 2:30, or when only two remain.
   A chest is taken only when it is reachable: same island, or `blocks >= void + reserve`
   (`reserve = max(6, 0.4 x void)`); if nothing is affordable, the cheapest crossing with
   `void + 1` blocks; and never while a foe is inside 10 and the chest needs a bridge. One chest is
   committed to for 35 s, so a marginal recount does not make the bot change its mind.
7. Nothing to loot: chase the best visible foe (wounded first, then nearest) only when its ground
   is walkable or the crossing is affordable; if no foe is visible, hunt the nearest other spawn
   under the same rule. With no affordable move, walk back to solid ground -- never stand at the
   tip of a one-wide bridge, where one egg is the void.

All of this is expressed through the general view and the existing skills, so no game module is
touched and the referee's rules (reach, recharge, speeds, bridge pause) are unchanged.
