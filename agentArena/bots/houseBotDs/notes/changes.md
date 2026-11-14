# Changes: houseBotDs vs. the house bot

The starting point was `bots/core.js`, `bots/skywars.game.js` and `bots/bedwars.game.js`, copied into
`houseBotDs/`. `node build.mjs` writes the two self-contained files; `node check.mjs` passes for both
(skywars: 0 errors, slowest step 20.1 ms; bedwars: 0 errors, slowest step 3.8 ms). The research behind these
choices, with URLs, is in `notes/research.md`.

## Shared core (`houseBotDs/core.js`)

**Bridging was the biggest loss of time, so it is now a run, not a block.** The old `bridgeTo` placed one
block, walked onto it while sneaking, and re-centred for every block - roughly 1.5-2 s per block. The new
`buildRun` places up to three blocks ahead against the face of the last one (the arena's 4.5-block reach covers
the third), then `walkRun` crosses them at full speed with forward held, turning sneak on and stopping at the
last block. Every placement is checked in the world before the bot steps (`solid(next)`), so a placement that
silently failed can never become a step into the void. Placement failures stop the run and return `stuck`
instead of walking off.

**The planner knows how fast the bridge actually is.** `buildRun` times each `lookAt` + `placeBlock`;
`noteBridge` keeps an exponential average of the per-block time (clamped 0.45-2.5 s) in `mem.bridgeRate`, and
both game models use it instead of a guess. The walk rate is the arena's 3.1 blocks/s.

**Bridges are remembered as built.** The SkyWars model counts gap crossings as bridge time and wool; the Bed
Wars model records a built bridge (`world.bridges`) so the return trip is walking, not a second purchase.

**Chests have refill epochs.** The old loot list marked a chest looted forever. SkyWars refills every chest at
3:00, so `chestKey` includes the refill epoch (`time >= 180`), and the SkyWars model resets both island and
middle chest counts at 180. This is the strongest second-half loot the house bot never takes.

**Combat follows the arena's rules rather than a generic PvP loop.**
- One swing every 0.8 s (`ATTACK_MS = 780`), rather than every tick.
- Jump-crits (1.5x) only while falling and not sprinting: the bot jumps, waits until it is falling, then hits.
- Sprint hits when the enemy is near an edge, on a one-block bridge, or across a gap - the knockback is the kill
  in both games, and the bot aims the hit toward the void.
- Snowballs and eggs are thrown at an enemy bridging 5-16 blocks away (no damage, but it is the cheapest way to
  interrupt a rush).
- A golden apple is eaten at 13 HP, and normal food when the server allows it.
- Strafing is only taken when the side ground is solid, so the bot never strafes itself into the void.
- If the ground in front of the foe runs out, the bot bridges toward them instead of standing still at the gap.
- The auto-engage radius is narrower across a gap (5.5 armed, 3.5 unarmed) so it never chooses to bridge into a
  fight it was not forced into; it still fights anything within 3 that can hit it.

**The foe tracker stores velocity, blocks, sneaking and time**, so both game models can guess where the other
player is heading rather than only where they were.

**The search is the house bot's UCT, unchanged in structure** (900 iterations, two moves deep, rollouts after),
with the models below made less rough. It yields to the event loop every 15 ms to stay well inside the 50 ms
CPU rule, and the only randomness at play time is the seeded search and the once-per-match persona draw.

## SkyWars (`houseBotDs/skywars.game.js`)

**Moves:** `loot_own`, `rush_mid`, `loot_mid`, `hunt`, `camp_mid`, `rush_foe`, `defend`, `wait` (the house bot
had no defend and no wait).

**Chest value is equipment-first and context-aware.** A mid chest is worth more with a weak weapon or armour;
an island chest is worth more early and less once the middle is open. Loot is drawn from the actual chest
contents, weighted armour -> weapon -> blocks -> apples -> throwables, as the guides recommend.

**The model crosses the map and refills.** `moveCost` adds walking and measured bridging, and the rollout resets
all chest counts at 3:00 (4 middle, 3 of my own). The leaf value is discounted by the time left, so looting with
30 s to play is worth almost nothing - a tie is zero.

**Hard endgame overrides.** With 70 s left and a power lead of at most 2, the bot hunts whatever it can see or
the middle; with a lead above 4 and 120 s left it also hunts, because a fight it wins is the only way a lead
becomes a win. `defend` is chosen when an enemy block is seen appearing near the home island within 16 blocks
(the arena sends `blockUpdate` for placed blocks), so a bridger is met at the edge rather than at the chest.

**The fight model** gives an edge to the defender at home and to the more nervous persona in the middle; the
leaf values a survivor with more gear, more chests left and more time.

## Bed Wars (`houseBotDs/bedwars.game.js`)

**The opening is a deterministic state machine, rerun after every respawn**, because a death while the bed
stands takes all carried wool, iron and bought swords. From whatever is in the inventory it does, in order:
cover the bed (0-8 real cells) if it has 4+ blocks; buy a stone sword at 10 iron; buy wool at 4 iron; keep
buying wool up to the measured gap + 10; then rush. This guarantees the fast first rush the guides describe
instead of hoping the search values it. On respawn it naturally rebuilds from zero.

**Shop use is robust and bundled.** The house bot matched offers by a slot `key` that the API does not promise;
`shopVisit` matches by item name and display name (wool, stone/iron sword, chainmail, iron armour as a set),
opens the keeper once, and clicks everything useful in one visit - a sword bought during the wool trip saves a
whole walk. Click failures (unaffordable) are skipped, armour is re-worn and the weapon re-held after shopping.

**The bed is read from the world, both halves.** `bedAt` checks the head and foot blocks, so a half-broken bed
is not mistaken for a live one, and `mem.foeBedGone`/`mem.myBedGone` are logged the moment the state changes.

**Cover is real, 0-8 cells.** `coverCells` builds the two top cells and six bed-level sides; `coverCount` counts
which are actually solid. `coverBed` stands behind the bed (outside the two-block mob reach where possible) and
places tops first against the bed, then the sides against the ground, trying six faces per cell.

**Breaking the bed is persistent and cover-first.** `breakBed` walks to the bed's middle side, then for up to 44
tries: digs an exposed bed half if one is reachable, otherwise digs the nearest cover block, walking closer when
out of reach. It returns `enemy` if a defender comes within 4.5 blocks (the main loop fights, then the next plan
comes back to the bed), logs `BROKE THE BED`, and records the time.

**Hard finish mode - the house bot's known weakness.** The moment the enemy bed is gone, `finishChoice` makes
`hunt` the only strategic choice. `huntFoe` goes to the last sighting within 18 s; if the foe died in the last
9 s it goes straight to their spawn during the 5-second gearless respawn window; otherwise it sweeps their base,
the middle and my own base (in case they counter-rush), waiting and facing the approach when already at a step.
The only exception is having fewer than 4 blocks while not at home to reach them: then it buys/farms just enough
to bridge, never anything else. The clock overrides the plan at 110 s: rush if their bed stands, hunt if it is
gone, and only farm/buy blocks if that is literally what is missing.

**Bed Wars model improvements.**
- Numeric bed cover (0-8) instead of a binary "covered", and `defend` as a move that spends wool 1:1.
- A bed-break cost that reflects digging one cover block and the bed (`1.2 s + 0.5 s per cover block, capped at
  four`), not eight full blocks - the old model made every rush look hopeless.
- The killer takes the victim's iron, gold and wool, and a respawn with the bed standing is gearless
  (`sword 4, wool/iron/gold 0`, armour kept) for 5 s. This makes an early defensive kill an economic win and
  makes the respawn window worth attacking.
- The winner of a fight at the loser's base can break the bed immediately; a rush that arrives while the
  defender is away breaks it too. This is what "the bed is the objective" looks like in the playouts.
- Foe state comes from sightings, the death message (parsed by username) and the respawn timer, not from a guess
  based only on elapsed time.
- Walk and measured bridge rates, the real gap/distance between all three islands, and a leaf value that values
  a bed lead and the clock (a tie is zero).

**Real-game safety.** The reflex fights anything within 8 blocks, or anything within 7 of my bed while I am
within 16 of it - but with my bed gone and under 12 HP the radius shrinks to 4.5, so the last life is not
thrown away at equal gear. Farming checks for a foe every 5 ticks and breaks off if one is within 10 blocks or
at the bed. `farm`, `shopVisit`, `coverBed` and `breakBed` all use bounded waits and return to the main loop, so
no single action can stall the round.

## Build and check

`node build.mjs` writes both strategy files from `core.js` + `<game>.game.js`. `node check.mjs`:
- skywars: 0 errors, 3 s of arena time, slowest step 20.1 ms; actions include chest opening and pathing.
- bedwars: 0 errors, 3 s of arena time, slowest step 3.8 ms; actions include 18 placements (cover) and 19 looks.

The check only proves the code runs on a recorded state; play testing is the next step.

## Round 1 - SkyWars (won, 52 s, last alive)

**Result.** `reviews/iter-1-skywars/`: citadel/end_citadel, HouseBot on island 0, HouseBotDs on island 1.
HouseBotDs won by knocking HouseBot into the void at 52 s with five unanswered iron-sword hits.

**What went well.**
- **The fight was perfect.** Five hits at 44.4-49.7 s (3.09 each) and zero damage taken; the house bot was on
  its return bridge and could not answer. The last hit was a knockback into the void - exactly the SkyWars win
  condition the research pointed at.
- **The kit was better.** By 15 s the bot had an iron sword and iron armour from its island; the house bot had
  a stone sword and leather until 40 s. The chest-priority loot order did that.
- **The bridge was faster than the house bot's.** HouseBotDs started bridging at ~24 s and met the enemy at
  ~44 s; the house bot left at 5 s but only reached the middle at 32 s (27 s of bridging). The 3-block runs are
  already an improvement over the old per-block bridge.

**What went badly.**
- **The first 11 seconds were wasted.** The log at 0-10 s is `defend` / `wait` / `defend` / `wait`, with
  `a0 w1.0 b0` and zero chests open; the first chest was opened at 11 s, the iron sword only at 15 s. The house
  bot looted its first chest at 1 s and already had a stone sword and 15 blocks at 5 s.
- **Why: `defend` was a free camp in the model.** I had added `defend` as `{t: 6, camp: true}` at home with no
  requirement that anyone was coming, and `modelFight` gives a camper +0.9 and the home player +1.1. The search
  could therefore "win" by doing nothing at spawn, so `defend` got 898 of 900 playouts.
- **Why the search never reconsidered `loot_own`:** its one early rollout drew the -1 branch (the model's foe
  policy hunts at t > 80 and won the fight), giving mean -1.00. With explore drawn low (~0.25), `loot_own`'s UCT
  (about -0.35) never beat `defend`'s (about 0.00), so the only useful move stayed at one visit for the whole
  search. A single unlucky sample decided the opening.
- **`wait` was a dodge.** A tie is zero, so waiting out the clock scored 0 in the model, and the real `wait`
  action is just 8 ticks of looking at the middle - it kept being selected when the opening stalled.

**Changes made after the round.**
1. **Deterministic loot-first opening.** At home, with an unlooted chest and no real kit (`weapon < 5`, or
   blocks < 16, or armour < 8), and no threat, `loot_own` is chosen before the search. The search can no longer
   vote for defending an empty island.
2. **`defend` is only a camp when there is a threat.** In the model, defending at home is legal only when
   `world.threat` is true - the foe is at my home, is heading there, or blocks have appeared near my spawn. The
   rollout recomputes threat from the foe's place/destination at each step; otherwise `defend` at home is
   illegal.
3. **`wait` is a fallback, not a plan.** Both games' models drop `wait` from the legal moves whenever anything
   else is legal (in Bed Wars too, where the same dodge existed).
4. **A playout floor stops early lock-in.** `search` gives every first move at least 20 rollouts before UCT
   takes over, so one unlucky -1 cannot bury the only sensible move. This is shared with Bed Wars.
5. **The bridge run now attempts four blocks** instead of three; the existing 4.4-block reach check stops it
   when the fourth face is out of reach. A fourth block extends each run by a third where the bot is centred.

**Check.** skywars 0 errors, slowest step 18.4 ms; bedwars 0 errors, slowest step 4.5 ms; CHECK PASSED. The
skywars check now visibly loots three containers before choosing `rush_mid`, instead of defending at spawn.

## Round 1 - Bed Wars (draw, time_limit)

**Result.** `reviews/iter-1-bedwars/`: map `stepping` (bases at z = -57.5 and z = +58.5, about 116 blocks
apart); HouseBotDs joined first (Red). Neither bed was broken and nobody died; the round ended at the clock.
HouseBotDs never left its own base after the opening.

**What went well.**
- **The early economy was exactly the plan.** Farm to 27 s (i17), stone sword and a wool pack bought at 30 s,
  cover started at 31 s, 7 of 8 cells covered by 56 s. The shop-visit bundling (one activation, several clicks)
  worked: `bought stone_sword,wool` at 30 s.
- **The model and the search behaved.** The farm plans were clean (`farm 900`) and the opening rule took over for
  `buy_sword` / `defend` as intended. No bad gear decisions, no deaths, no lost bed.
- **The 7 cover blocks held for the whole round.** Nothing attacked them, but the goal was met at 56 s.

**What went badly (and why).**
- **The bot defended a 7/8-covered bed for 491 seconds.** From 31 s to 491 s the log alternates
  `rule defend` / `could not cover 0 31 -49` / `bed covered: 7 of 8`, every ~2 s. One cell (0, 31, -49) was out
  of reach from the fixed stand, `coverBed` tried the same faces every time, and the opening rule
  (`cover < 8` → `defend`) therefore returned the same move forever. It never bought more wool, never farmed
  after 30 s and never left home. Fourteen "Path was stopped before reaching the goal" failures came from the
  repeated walks to the same stand.
- **389 of the 406 failed actions were reach errors**: `The place at ... is N blocks from your eyes; reach is ...`.
  They are the same loop: `placeBlock` was attempted on faces 4.5+ blocks away, was rejected, and the failure was
  swallowed, so the cell looked merely "unreachable" and was retried next loop.
- **23 `strategy_error` restarts** at 5, 11, 14, 35, 43, 47, 83, 113, 133, 232-246, 372, 389-435 s. `bwState`
  scans three base-to-base lines with `gapBetween` and had no await between them; on this 116-block map that is
  hundreds of `blockAt` calls in one CPU slice. The reflex check added a fourth full-line scan (`sameLand`) every
  loop. The restarts are why the log shows nine `started` lines and why some defend attempts ran on a fresh
  memory.
- **The one rush was made with 9 wool and failed to zero.** At 491 s (`timeLeft` 109 ≤ 110) the endgame rule fired
  and chose `rush` with 9 blocks, because it compared `root.me.blocks` (undefined) with the needed wool. The
  bridge spent the 9 blocks, and the next five `rush: no blocks` attempts had b0. The same `.blocks` typo was in
  `finishChoice`. This was the intended "with the clock low, break their bed" path; it could not work.
- **Map scale was not priced in.** The opening's wool need was capped at 96 for a base-to-base gap that is over
  100 blocks on this map, and each `buy_wool` bought a single 16-wool pack (the house bot, which farmed
  passively to i89/w73, showed how much iron this map throws away). A rush with 96 wool was never going to
  reach the far base even if the loop had let it start.

**Changes made after the round.**
1. **Cover reachability is checked before the action.** `coverBed` computes each candidate face point
   (`ref + 0.5 ± face/2`) and skips it when it is more than 4.4 from the eyes, so an out-of-reach call is not
   made. If no face works, it walks 1.6 blocks toward the cell and tries once more. This is the direct fix for
   the 389 reach errors.
2. **A stuck cover cell cannot hold the game hostage.** When a `defend` attempt with blocks in hand adds no
   cover, `mem.coverStuckAt` is set to the cover count and the opening rule, the defensive rule and the search
   (a `defend` result is replaced by the best non-defend result) all skip defend while
   `cover >= coverStuckAt && t < coverStuckUntil`. A partial cover (above zero) is marked until cover increases.
   An attempt that covered nothing at all expires after 25 s, so a bad position gets another chance instead of a
   permanent ban. An attempt made with fewer than 4 blocks sets no mark (the wool trip must lead back to cover).
3. **No CPU stall in `bwState`.** It is `async` and `await sleep(0)` after each of the three gap/distance pairs
   (one scan per slice). `sameLand` only scans when the foe is within 12 blocks, and `gapBetween` now samples one
   point per block instead of two, halving the work of every scan (this is shared with SkyWars).
4. **The need scales with the map.** The opening and endgame both use
   `need = min(224, gaps['own>foe'] + 12)`; `buy_wool` reserves 10 iron for a stone sword if one is missing and
   then buys up to four 16-wool packs in one shop visit, and `buy_sword` / `buy_armour` add spare-iron wool
   packs to the same visit. A duplicate stone sword is never bought when `bestWeapon >= 5`.
5. **The endgame uses the wool it has.** `finishChoice` and the low-clock rule compare `root.me.wool` (the field
   `bwState` actually fills), not the undefined `root.me.blocks`. With the enemy bed gone and fewer than 4
   blocks, the bot buys or farms at home; with blocks, it hunts.

**Check.** skywars 0 errors, slowest step 19.5 ms; bedwars 0 errors, slowest step 16.8 ms; CHECK PASSED. The
bedwars check state logs one `could not cover` for the recorded position, then `bed covered: 0 of 8` and moves
on to `farm`; it no longer repeats cover, and the slowest step fell from the round's >50 ms restarts to 16.8 ms.

## Round 2 - SkyWars (lost, 146 s, knocked into the void)

**Result.** `reviews/iter-2-skywars/`: `archipelago`/`sky_ruins`, HouseBotDs on island 0, HouseBot on island 1.
HouseBotDs lost at 146 s: HouseBot's only hit of the round (1.34 damage at 143.6 s, from 2.9 blocks away)
knocked it off the bridge; it fell from y 31 to y 10 by 145 s and was out at 146 s. HouseBot finished with
9.5 HP. Zero program errors and zero restarts this time.

**What went well.**
- **The opening loot was fast and complete.** Iron chestplate at 5 s, iron helmet at 14 s, an iron sword at 10 s
  and 40 blocks at 14 s, while the house bot had only leather and no weapon. It reached the middle at 49 s
  before the house bot got there and looted all four middle chests: diamond sword at 55 s, iron leggings at
  55 s, diamond helmet and boots at 61 s (armour 17, the round's best gear by a wide margin).
- **The clock and the hunting were right.** With a 6.8-8.6 power lead it spent the last ~50 s hunting, closed
  on the enemy at 131 s and landed the first three hits: 6.16 at 135.1 s, 2.16 at 138.3 s, 2.16 at 144.0 s
  (10.48 of the house bot's 20 HP) against 1.34 taken. It was winning the damage race.
- **No CPU restarts, no refused actions except 7 reach errors and 3 path timeouts.** The round-1 Bed Wars fixes
  (yielding scans, one-point-per-block `gapBetween`) held.

**What went badly (and why).**
- **It fought a melee exchange on a one-block bridge and got knocked off.** At 143.6 s it was at
  (-1.3, 31, 15.9) on its own bridge; the house bot was on an adjacent lane at (1.2, 31, 18.6), 3.7 blocks
  apart. The hit's knockback ran along the attacker->victim line: mostly sideways from our lane, and it carried
  the bot from x -1.3 to x -4.3, off the bridge. The bot had 18.66 HP and a diamond sword; the void, not the
  house bot, won that fight. `fight` only treated `solidAround < 6` as "narrow" and otherwise used its normal
  land routine, so a two- or three-wide bridge with the enemy diagonally across it counted as safe ground.
- **Why it stayed in range at all:** the reflex engages any foe within 5.5 blocks, and `fight`'s only response
  at d > 3 was to step forward (or bridge toward them). It never measured whether the ground *behind* it would
  survive a knockback. The house bot, by contrast, logs `hit on a bridge: back to land` at 145 s: it landed its
  hit and left.
- **Thirty-three seconds walked home for a defence that was never needed.** At 68 s the search chose `defend`
  (tied with `loot_mid` at 273 visits, mean +1.00) and `defending home: arrived` at 101 s. `moveCost('defend')`
  was gated on `threat` only when already at home; from mid it always paid the trip home. The model then rated
  it a guaranteed win because its foe policy hunts at t > 80 and a camper at home has +2.0 fight edge. The
  house bot was in fact at mid/its own base and never came. That is 33 s of loot/hunt time (the round's most
  expensive mistake after the fall).

**Changes made after the round.**
1. **No melee with a void at my back.** `fight` now computes `rearSafe = solid(cell 2.0 behind me along the
   foe line)` and treats `narrow || !rearSafe` as a ledge. On a ledge with the foe at more than 2.6 blocks it
   gives ground instead of closing, and after a swing on a one-wide bridge it backs off. `backOff` picks the
   *solid* ground-level neighbour most directly away from the foe and walks to its middle with the pathfinder
   at full walking speed, so the retreat follows the bridge instead of the gaze (pressing `back` while facing a
   diagonal foe would walk off the lane) and is not caught by a foe closing at the same speed. This is the
   direct fix for the death: the scenario that killed it (a diagonal hit at 2.9-3.7 blocks on a 1-wide lane)
   now retreats toward land and only fights where a knockback has ground behind it.
2. **Defend is a response, not a destination.** `moveCost('defend')` now returns null whenever `world.threat`
   is false, from any place, not only at home. The home trip is paid only when the model believes someone is
   coming to my island; the explicit `mem.incomingAt` rule still forces a real defence when blocks appear near
   my spawn.
3. **The fight reflex scans only when it can change the answer.** In the main loop `sameLand` is computed only
   for an armed bot with a foe between the melee radius and 9 blocks; a farther foe no longer costs a
   `gapBetween` scan every loop.

**Check.** skywars 0 errors, slowest step 24.8 ms; bedwars 0 errors, slowest step 24.1 ms; CHECK PASSED. The
skywars check still loots, takes the middle and hunts; the bedwars behaviour is unchanged.

## Learning from the improved house bot (after round 2)

**What changed in it.** `notes/houseBot-changes.md` lists it: it listens for its own hurts (`entityHurt` and
health drops); every long move stops for a threat (`threatened`: hit in the last 1.5 s, or a player seen *or
only heard* within range); a `reactToThreat` first in each main loop; rails either side of every bridge block
while a foe was seen or heard in the last 20 s; the reaction time retuned for 150-210 ms; walks inside a fight
or retreat do not interrupt. Comparing `bots/` with `bots-previous/` confirms this and shows the details (the
`awareness` object, the 0.38 release, the 4-tick wait, the 1 s bow draw).

**The review: right.** Listening to hits is the single best change: in round 1 my Bed Wars bot farmed through a
sword hit from behind because its loop only stopped for a foe *seen*, and in round 2 the house bot logged
`hit on a bridge: back to land` after the hit that ended its own fight. A heard player is a real threat even
without exact sight; a walk that cannot be stopped for one is a walk that walks into a fight. The reaction-time
retune is also correct: every tuned release was half an old reaction-time too early or too late.

**The review: what it gets wrong or misses.**
1. **`travel` bridges after an interrupted walk.** `walkTo` returns `false` both for "no route" and for "a
   threat came up", and `travel` then walks to the launch point and bridges regardless. That is the same
   half-built-bridge fight the change was meant to prevent. I made the two outcomes distinguishable:
   `awareness.walkStoppedAt`, and `travel` returns `'threat'` instead of starting a bridge.
2. **Its bridge retreat is unreachable in the case it was written for.** In `reactToThreat` the fight (<=6) and
   bow (6-25) branches come first, and `if (!foe) { look round; return }` comes before the retreat, so a hit on
   a bridge *by someone unseen* (an arrow, or a heard player behind) turns round and never backs off. In mine
   the hit-on-a-narrow-bridge retreat is checked first (when no foe is within sword reach), which is exactly the
   round-2 death: a hit from an adjacent lane carrying me sideways off the lane.
3. **Rails are unbudgeted.** Two blocks on every bridge block, for 20 s after *any* sight of the foe, is up to
   half the wool and double the placements on a 116-block Bed Wars bridge, and the placements have no reach
   check. Mine are directional and budgeted: one block on the side the knockback would push me toward (both
   sides only when the foe is nearly in line), only while a foe is within 16 blocks, only from blocks beyond
   what the bridge still needs (`blockCount > ceil(distance) + 8`), and reach-checked.
4. **It shoots at any seen foe at 6-25 every loop with no cooldown.** A 1 s draw is a large commitment and
   arrows are finite. Mine shares `mem.shotAt` between the reflex and the fight, 2.5 s apart, and requires
   arrows; the reflex only looks for the bow case when there is one.
5. Small: its health listener would set `lastHealth` to `undefined` if `bot.health` were not a number; guarded.

**What I took, and how it is wired in.**
- **`awareness` + `watchForHits`** (`entityHurt` for me, and any health drop, for an arrow I never saw), in
  both mains.
- **`threatened(bot, range)` gates on every long move**: `walkTo` polls every 2 ticks and drops the walk for a
  hit or a player seen/heard within 6 (returning `false`, with `walkStoppedAt` set); `bridgeTo` returns `'hit'`
  or `'enemy'` (heard within 8, seen within 5) and `walkRun` stops without stepping on; `loot` stops at 8;
  Bed Wars `farm` returns (the round-1 bug); `coverBed` checks per cell and after each step; `breakBed` stops
  digging on a hit; the camp/defend waits and the hunt sweep wait break on a heard foe or a hit.
- **`reactToThreat` first in each main loop**, before the plan: heard within 10 -> turn to it; in sight within
  6 -> `fight`; in sight within 25 with a bow -> `shoot`; hit while on a narrow lane and not in reach -> back to
  `awareness.lastLand`; hit with no foe at all -> turn right round.
- **The shorter reaction time**: `stepTo` releases at 0.38 (was 0.45) and waits 4 ticks (was 6); `walkRun`
  releases at 1.05 (was 1.25) and waits 5 (was 6).
- **A bow at range**: `hasBow` and `shoot` (1 s draw, aim 1.4 + 0.0045 d^2 above the foe); used by the reflex
  and in `fight` when the ground runs out between us and the foe is 6+ away -- a shot, not a bridge into them.

**What is still mine, and why it matters against this opponent.** The run-based bridge (four blocks placed, then
walked) is still roughly twice as fast as the house bot's block-by-block bridge, and the directional rails mean
it keeps that speed where the house bot's double rails do not. `fight` keeps the round-2 ledge logic (`rearSafe`,
`ledged`, `backOff`) rather than the house bot's simpler W-tap; that logic was written for the exact hit that
beat me. `travel` no longer bridges on after a threat. The planner's measured bridge rate, chest refill epochs
and the defend gating stay as they were. The opponent now does all of the house changes too, so none of the
above is a free edge -- but the reaction-time retune and the travel fix are fixes it does not have.

**Check.** skywars 0 errors, slowest step 17.7 ms; bedwars 0 errors, slowest step 16.4 ms; CHECK PASSED.

## Round 2 - Bed Wars (draw, time_limit)

**Result.** `reviews/iter-2-bedwars/`: `stepping`, HouseBotDs (red) spawned at -58.5, HouseBot (blue) at +62.2,
~116 blocks apart. Draw after 610 s. HouseBotDs knocked HouseBot into the void twice (199.3 s -> dead at 201 s,
330.0 s -> dead at 332 s) and was never killed; our bed was covered 8/8 at 23 s and never touched. But **the enemy
bed was never damaged at all -- 0 blocks broken by either bot, 266 placed**, so both deaths became respawns and
the round ran out.

**What went well.**
- **The opening economy was clean.** Wool at 13 s, the bed covered 8/8 at 23 s, a stone sword at 37 s, and a
  second wool purchase at 50 s, all before the house bot had finished its own cover (7/8 at 60 s) or its armour
  (iron at 75 s). No early CPU errors, no deaths, no damage taken until 320.7 s.
- **Both fights were won by knockback, not gear.** We were on leather (a7) and a stone sword; the house bot had
  iron boots and leggings (a11) and the same sword. At 199.3 s it hit for 2.8 from 2.4 blocks and the knockback
  took the house bot off its lane at y 24.4 -> void. At 330.0 s the knockback swing at 2.8 blocks did the same.
  In between, at 320.7 s we took 3.6 and did not fall: the round-2 `rearSafe`/`backOff` logic held.
- **No program errors before 373 s** and the fight reflexes (sprint hit at the edge) worked.

**What went badly (and why).**
- **355 seconds of `wait` (136-491 s).** From 136 s the log is `plan wait | wait 900` every ~1.5 s. The cause is
  in the model, not the game: the bot stood at x~11 (classified `mid`) with 22 wool. `bwState` returned
  `bridges: {}` -- it never recorded that its own rush bridge was under its feet -- so `bwTravel(mid->own)` saw
  the measured gap (>22) with no bridge and returned null. `go_home`, `rush`, `hunt`, `defend`, `farm` and every
  purchase were illegal; `wait` was the only legal move, so the search had one choice and 900 visits went to it.
  It was *stranded in its own model* while standing on a bridge it had built.
- **The rush left short.** At 51 s the search chose `rush` with 72 wool. It crossed from -47 to +28 in 83 s
  (~0.9 blocks/s: on the stepping map the route alternates existing stones and single placed blocks, so
  `stepTo` dominates) and arrived at x 28 with 22 wool, 34 blocks from the bed. The model's gap scan counts void
  columns on the straight landmark line; where the real lane is offset or stepped it undercounts, so `72 > gap`
  let the trip start when the crossing needed ~84.
- **The fight then deadlocked.** At 130-150 s the two bots were 5-6 blocks apart on parallel lanes. Our reflex
  engaged (foe within 8 on the same land), `fight` computed `narrow = solidAround < 6` -- true on nearly every
  lane of this map -- and `ledged = narrow || !rearSafe` was therefore always true, so at d > 2.6 it backed off
  instead of closing. The log shows `back to land` bursts from 134 s to 197 s while the house bot walked slowly
  forward. The bot only fought when the foe came within 2.6 (and then killed it). The same logic produced the
  final standoff: 515-600 s, foe at -38.8, us at -30..-33, no hit either way while `rule buy_wool` fired every
  ~10 s and never bought anything -- each shop trip walked toward the foe, triggered `fight`, and backed off
  again.
- **The 110 s endgame rule aimed at the wrong target and fired late.** At 491 s `timeLeft <= 110` chose `hunt`
  (and `huntFoe` walked to the last sighting at 503/514 s) although the enemy bed was standing: hunting a player
  with a bed only gives them a respawn. The rule also left the bot with no time to buy wool and cross.
- **Four strategy errors, all >50 ms stalls** at 373, 403, 593 and 595 s, every one inside a `wait` plan's search.
  `search` yielded only when `Date.now() - lastYield > 15`; in the check environment time does not advance while
  the program computes (the same code now shows a 5 ms step), so a 900-iteration search can run as one CPU block.
  Each restart re-randomised the persona, which is how we know `mem` does not survive a restart.
- **30 failed actions:** 18 path stops (the stranding loops' timed-out walks), 10 reach refusals in the bed cover,
  2 no-path.

**Changes made after the round.**
1. **The model learns its own routes.** `bwState` now returns `bridges: mem.bridges`, and the main loop marks a
   leg whenever the bot's place (`own`/`mid`/`foe`) changes: `own<->mid`, `mid<->foe`, and both when it moves
   between `own` and `foe` (it must have crossed both; a death trip home proves them too). Two legs infer the
   third. A fresh memory (first loop or after a restart) treats the place it is in as reached and marks the legs
   out of `own`. `go_home`/`hunt`/`rush` over a crossed leg are now walking with no wool, which removes the only
   route by which `wait` could be the sole legal move. The rollout copies `root.bridges`, so the model and the
   search agree.
2. **The wool requirement is no longer the raw gap count.** Each leg's gap is `min(dist, ceil(1.35 * scan) + 4)`:
   the straight-line scan is a lower bound when the walkable route leaves the line. On this map the 72-wool trip
   would have been 88+, so the bot buys one more pack (or farms 6 s) before leaving instead of stranding itself.
3. **The late rule starts at 150 s and targets the bed.** With the enemy bed alive it never chooses `hunt`: at
   home it buys/farms to `need` and rushes; away from home it rushes with any 8+ wool (each trip extends the
   bridge) and otherwise walks home for more. Hunting is only for a bed that is already gone.
4. **A narrow lane is not a ledge.** `fight`'s `ledged` is now `!rearSafe` alone: the test is whether the cell
   two blocks behind, along the attacker->victim line, is air (where a knockback would carry me), not how wide
   the lane is. A one-wide lane with the lane behind me is safe to fight on; the round-2 SkyWars death (a
   diagonal hit from an adjacent lane) still retreats because that cell is off the lane. This ends the 5-8 block
   standoffs: the bot now closes and fights, or (with `rearSafe`) holds its ground and swings.
5. **The reflex only fights what it could reach.** The Bed Wars engage radius for a foe on the same land drops
   from 8 to 5.5 (4.5 when hurt and the bed is gone), matching the SkyWars reflex: a foe at 6-8 cannot hit us,
   and dropping a shop trip for one is how the bot spent the last 80 s oscillating at -30.
6. **The search yields by iteration count, not by wall clock:** `if (it % 16 === 15) await sleep(0)`, and Bed
   Wars uses 600 iterations (nine first moves at most). This is the direct fix for the four restarts; the same
   change dropped the check's slowest step from 24 ms to 5-6 ms (it varies a little per run).

**Research (with sources).** The Hypixel guide on breaking common bed defences confirms the timing model this
round needed: the ~5 s respawn is the window, the break must be reachable within it, and wool is cut fastest by
hand/shears. It also recommends boxing yourself in with 3-4 blocks while mining the inner layer.
<https://hypixel.net/threads/how-to-break-common-bed-defences.4786169/> and a general guide,
<https://www.bitebynightgame.org/zh-CN/t/how-to-break-base-defenses-fast-in-bedwars>. I did not add boxing this
round: our `breakBed` already stops digging on a hit and on a defender within 4.5, the main loop then fights
(the round-2 `rearSafe` rule), and a misplaced shield block can cut off our own reach. It is the next thing to
try if defenders start interrupting the dig. The lesson that did go in is the timing/finish order: kill, then
the bed within the respawn window, then the player -- not `hunt` while the bed stands.

**Check.** skywars 0 errors, slowest step 4.1-4.9 ms; bedwars 0 errors, slowest step 5.5-6.4 ms; CHECK PASSED
(two runs, build after the last code change).

## Round 3 - SkyWars (lost, 60 s, slain at the middle)

**Result.** `reviews/iter-3-skywars/`: `classic`/`frozen_peaks`, both spawned on the central line (x 0.5) at
z = -24.5 and +25.5. The two bots bridged toward each other and met at the middle: HouseBotDs reached z 0.5 at 40 s with the
house bot at z 10.5, then crossed the middle and met it head-on. HouseBot fired a bow at 5.7 at 46 s (missed),
then hit with a stone sword at 47.1, 48.3, 49.5 and 51.5 s: 20 HP to 0 in four unopposed hits, dead at 52 s.
HouseBotDs landed **zero** swings and dealt **zero** damage; 19 walks were stopped before their goal (all
reflex retreats) and main restarted twice.

**What went well.**
- **The loot was fast and complete.** Leather leggings at 5 s, boots at 10 s, helmet at 15 s, a stone sword by
  15 s and 46 blocks by 18 s: the whole island in 15 s, on a par with the house bot's own opening.
- **The route was chosen and held.** The search picked `rush_foe` at 18 s (me own a4 w5.0 b46; foe ~foe a2) and
  the bot crossed its own bridge and the middle, reaching the middle before the house bot (40 s vs 40-43 s), so
  the crossing cost it nothing.
- **It had the kit for the fight it got**: three leather pieces (armour 4 in the plan line), the same stone
  sword as the house bot, full health, and 46 blocks in reserve. This was a winnable fight that was lost to the
  fight logic, not to gear.

**What went badly (and why).**
- **It retreated for the whole fight and never swung.** `fight` gave ground whenever `d > 2.6` and the cell two
  blocks behind was air. The arena's sword reach is 3, so 2.6 is *inside* reach: the house bot's hit knocks us
  back to about 3.0-3.4, the next beat reads that as "ledged" and backs off for 0.8 s, the house bot follows
  and hits again. The 19 "Path was stopped before reaching the goal" failures are those 0.8 s retreats (~2 per
  second for the nine seconds of the fight), and the log's single `back to land` at 43 s is the same rule from
  before the first hit. The cell two blocks back also falls off a one-wide lane whenever the foe is off-axis:
  at 50 s the two positions were x 1.7 and x 0.6, so the diagonal line left the lane though the lane behind us
  was solid. The house bot's `fight` (read in `bots/`)
  has no retreat at all: at d <= 3 it sneaks, turns and swings. That is what won it the fight.
- **It never saw the house bot coming.** It was bridging with its eyes on the place face (pitch down), and this
  arena shows a player only in the field of view (or heard behind); a foe in front, below the view, is neither.
  The first the bot knew of the house bot at 5.7 blocks was the sword at 47.1. The reflex radius of 5.5 was also
  just short of the 5.7 at which the house bot loosed its bow.
- **Two restarts inside the fight wiped its memory.** `strategy_error` at 47 s and 49 s; the log's two new
  `started` lines at 48 s and 50 s (with new personas) show `main` re-entered with a fresh `mem`. In a five
  second fight that is two of the four seconds before the killing blow spent not fighting. This is the same
  cause as round 1 Bed Wars, fixed there and never yet in SkyWars: `modelState` ran its three 50-block
  `gapBetween` scans in one CPU slice with no await between them, and `search` still yielded only every 16
  iterations. The check cannot see it: its recorded SkyWars state spends all 3 s opening three chests and never
  reaches a plan, so the step times reported there cover neither the scans nor the search.
- **All three plans of the opening were negative.** At 18 s the search's means were `rush_foe -0.39`,
  `hunt -0.39`, `rush_mid -0.57`; it still sent 836 of 900 visits to one of them, so the choice was made on a
  coin-flip difference. The model had no way to know the house bot carried a bow, and it prices a head-on
  meeting at the middle as an even fight. With the fight fixed that meeting is winnable, so the plan stays;
  what was wrong was the execution, not the choice.
- **One `stuck` at 41 s** ("to their island: stuck") after crossing the middle: two seconds spent on a route
  that could not progress. It did not decide the round (the fight did), but it is the same bridge routine's
  old failure mode and is still on the list.

**Changes made after the round.**
1. **Retreat only from a foe I cannot hit.** `fight`'s ledged rule now fires at `d > 4.2` (outside sword reach),
   not `d > 2.6`. Between 3 and 4.2 the bot closes - walking when the way is solid, one block of bridge over
   a gap when it is not - and swings at 3. The step back after a swing on a narrow lane is also gone: at that
   distance it only delays the next hit, and leaving after a blow does not undo the knockback.
2. **A heard foe that has just hit me is fought, not inspected.** `reactToThreat` used to answer every heard
   player with a look, even one at 1.5 blocks that had just taken a health bar; with `hit` and a heard foe
   within 4.5 it now fights (the attack uses the entity, so a rough heard position costs aim but not reach).
3. **Eyes along the run, not down at the block.** `walkRun` turns to a point level with the eyes at the far end of the run
   when it is watching for a threat: the yaw is still the run's (so the walk cannot veer), but the pitch rises
   from the placement face to almost level, which is where an approaching player is. One look per run
   (~0.18 s) is the price of not being ambushed, and it applies to Bed Wars too.
4. **SkyWars engages a step earlier.** The fight reflex's armed radius is 6.0, not 5.5: a player at 5-6 closes
   in under a second, and 5.5 was 0.2 short of the house bot's bow range.
5. **No long synchronous scans, and smaller search slices.** `modelState` is now `async` and yields after each
   of its three line scans (the Bed Wars round-1 fix, applied to SkyWars), and `search` yields every 8
   iterations instead of 16 (SkyWars also draws 600 iterations, not 900). Every CPU slice in the planner and
   the state scan is now a single scan or a handful of rollouts.

**Research (with sources).** The bridge-fight guides support exactly the change in (1): sprint-reset hits are
the knockback hits, and a player who backs off a one-wide walkway forfeits both the sprint hit and the solid
block behind them; the Astroworld "step back after a hit" advice is for wide ground, and its first rule is to
fight on solid ground with the void behind the opponent. The same threads confirm the wall on the void side
(we rail only the pushed side, and only when the bridge can spare it) and eggs/snowballs at a player on a lane
(already in `fight`).
<https://www.pika-network.net/threads/skywars-tips-n-tricks.8893/>,
<https://www.cubecraft.net/threads/how-to-play-skywars-thread.186891/>,
<https://guide.astroworldmc.com/minecraft-skywars-pvp-tips>.

**Check.** skywars 0 errors, slowest step 3.8-5.4 ms; bedwars 0 errors, slowest step 3.6-7.9 ms; CHECK PASSED
(two builds, the last after the look-ahead pitch was raised).
