# Change log: houseBotDs

`houseBotDs/houseAutopilotDs.mjs` starts as an exact copy of the house bot. Everything below is a change to its
**decisions and tactics**; `HOUSE_SKILLS`, `DIFFICULTY_PROFILES` and the exported names are untouched, and every tactic
that uses a skill is gated on the same `this.skills` flag the house bot uses for it (so a difficulty that lacks a skill
never uses it). Verified with `node check.mjs` after every edit (`CHECK PASSED`).

## Round 1 (2026-11-11): the opening and the plan, before the first reviews

Goal: win the first 30-60 s in each game -- the part decided by what the bot chooses to do, not by reflexes -- and
remove the house bot's wasteful habits from the copy.

### Shared helpers (new, before `engageTactics`)

| Helper | What it is for |
| --- | --- |
| `houseElapsed(game)` | Seconds into the round from my own clock at the round's first playing tick. Uses the host's `elapsed` only when it agrees with mine. The host field could be a countdown (or a clock from an earlier start); reading it backwards would have sent the bot off half-looted on tick one. |
| `resetHouseClock(game)` | Called whenever the state is not in its playing phase (lobby, between rounds): the next round's clock starts at its own first playing tick even if the state carries no round id. |
| `bestWeaponDamage()` | Best melee damage carried, including sharpness (`0.5*level+0.5`, as `swingArm` adds). Used to decide "geared enough", "buy a sword?", "am I the stronger fighter?". |
| `armorPoints()` / `armorPieces()` | Armour value and piece count (the `ARMOR_SCORE` table is not exported, so it is duplicated). "One piece of armour" is part of the SkyWars geared test; armour value informs the Bed Wars shop. |
| `standable(x,y,z)` | Ground under a cell, body and head free: where a guard post or a herd spot must be. |
| `holdGroundAgainst(foe,d)` | True when I am on wide ground and the foe is on a bridge/edge and not yet within 4. Used only where `skills.bridgeDefence` allows the wait (hard). |
| `backOffSpot(fx,fz)` | Nine directions at 4 blocks, with the 2-block step safe; where to give ground after a trade. (Helper added for the round-1 engagement rewrite; the current `engageTactics` does not call it yet -- kept for round 2 if the reviews show a disengage is needed.) |
| `edgeSpot(f,reach)` | 16 angles on two rings inside reach, standable, with **no ground 1-2 blocks behind the foe** on the line: the spot that puts their back to the void. |

### Melee engagement (`engageTactics`, rewritten)

Before: the house bot's loop -- bow first, swing when in reach, step off the void line, pillar, wait out a bridge foe
(hard), approach with `stopWithin: reach - 0.55`.

Changes and why:
- **Proactive golden apple** at `health <= 13`, foe farther than 7.5 blocks, not already eating: eaten *before* the
  blows, not after. `healIfNeeded` only eats at 8 health, which is one hit too late against a 6-damage sword; 7.5
  blocks of separation is enough for the 1.6 s eat. Still the shared `startEating`/`healIfNeeded` rules.
- **Throws during the loop**, not only as an opener: `if (skills.throwables && d > reach) throwAtFoe(f, d)` every step,
  and `equipBest()` straight after a throw -- the thrown stack can be the slot in hand, and a swing with an empty hand is
  a 1-damage fist. The house bot throws once before closing; a foe on a bridge at 5-15 blocks is worth a second throw as
  the distance changes. Gated on `throwables` (normal/hard) and the shared `projectileEveryMs` cooldown.
- **Herd to the void side**: when edge sense is on, the foe has no void behind them, and `1.5 < d < 7`, walk to
  `edgeSpot` (throttled to once per 900 ms so it cannot pace in circles). This is the play the guides describe: take the
  side that makes the *next* hit a fall. At hard the existing `voidBehindOf` sprint-reset choice then turns it into a
  knock-back off the island.
- **Pressure**: the swing happens before any movement each step, and the approach ends just inside 3 blocks; the loop
  spends its action budget swinging rather than waiting. With the 0.5 s hurt window, the first clean hit of an exchange
  is the one that counts.
- **Void-behind safety kept**, but with the same throttle-free guard as before (`saferSpot`); the width is now
  `reach + 0.7` so it reacts a moment earlier.
- **Bow/pearl opening kept** as the house bot had it (gated by `bowRange` / `pearls`).

### SkyWars (`brainSkyWars`, rewritten; new `skywarsEnemyPlace`)

Before: looted every chest in order and only hunted when nothing was left; the house bot finishes all three spawn
chests before mid.

The new order, each step returning after one action:
1. **Fight** a foe within 8 blocks.
2. **Throw** at a foe within 18 on narrow ground (normal/hard).
3. **The clock**: the round is a tie at 5:00 and every chest refills at 3:00 (the guest's state handler clears
   `lootedChestKeys` on the refill event). The brain loots that last wave as if the chests were new, then from 3:20 goes
   to the other player regardless -- a round that ends with both alive is a tie, which scores nothing.
4. **Home chests only until geared**: a weapon of 5+ damage, blocks for the void to mid (+4, capped at 24), one armour
   piece. Only then leave for the middle. If the middle has no chests left, the remaining home chests are looted.
5. **The middle**: while the foe is more than 9 blocks away, loot the four centre chests (`bridge: true`). Mid chests
   hold the diamond gear, pearls, the knock-back stick and the bow; beating the house bot there is the opening.
6. **Hunt**: if the foe is known, engage; otherwise bridge to the nearest other spawn (`skywarsEnemyPlace`); otherwise
   hold the middle.

Why the thresholds: the house bot's own loot order is three spawn chests, then mid; skipping the third home chest when
already armed is worth 4-6 s of bridging, and the mid chests are strictly better loot. `blocks >= 4` prevents heading to
mid with no blocks at all; the geared test is skipped when no home chests remain (nothing to gain by staying).

### Bed Wars (`brainBedWars`, rewritten)

Before: the house bot's order -- cover the bed, buy apples, pickaxe and axe, rush with 48-63 blocks, defend a 7-block
radius -- and no plan once its bed is gone (its brain only reacts to a foe within ~7 blocks).

Changes, in the brain's step order:
1. **Lobby** team selection unchanged.
2. **Intruder at my bed** (`atBed <= 14` and I am near home or they are near me) is met first. On hard, if they are on
   the bridge and I am on my ground, wait instead of walking onto the void (`holdGroundAgainst`, gated on
   `bridgeDefence`); easier difficulties meet them as the house bot does (their skill set has no bridge defence).
3. **Targets**: the nearest enemy bed; `needBlocks = max(48, voidCellsToward(bed)+6)` from home, and `needNow =
   voidCellsToward(bed)+4` from where I stand (a bridge already built counts for nothing). The original house bot's
   first rush stalls a few blocks short; both numbers exist so the restock happens before the void, not on it.
4. **Break their bed first** when it is within 4.2 blocks: clear the cover at `by+1` if it is not air/bed, then
   `breakBlockAt` the foot. A defender is fought after the bed, not before.
5. **A foe within 8** is fought, except on hard when they are on narrow ground and I am on wide ground.
6. **Shop order** (no tools, no bed cover -- a bed is broken through its cover in one action):
   - stone sword (10 iron, only once 16 blocks are stocked), iron sword (7 gold), diamond sword (3 emeralds, hard);
   - wool up to the crossing need;
   - hard: iron armour (12 gold), a golden apple (3 gold), chain (24 iron), sharpness (8 diamonds), protection (5
     diamonds), diamond armour (6 emeralds), pearl (4 emeralds), in that priority.
   The house bot spends its first 6 gold on two apples, delaying its iron sword to about 78 s, and 20 iron on a pickaxe
   and an axe that do nothing here. Ours gets the sword first; a one-apple reserve is bought only at hard, after the
   sword.
   **Generator** (hard, `bedwarsShop: 'full'`, as the house bot's own pick-up): a stocked diamond or emerald generator
   within 10 blocks, no foe within 10, and not while their bed is open during a respawn window -- move to it and
   collect. This is what pays for sharpness (8 diamonds), the diamond sword (3 emeralds) and the pearl (4 emeralds);
   the house bot at hard does the same within 14 blocks, so without this step the shop branches above would never fire
   against it.
7. **Farm the forge** while it is safe (foe >26 blocks or unseen): when short of the blocks' iron, the sword, or the
   armour iron; and always when short of blocks with no iron while pushing (`stranded`, measured with `needNow`).
   `collect` is sent only after `moveStepToward` reports `reached`, so no remote vacuuming.
8. **When to push**: after a kill window (foe dead/respawning for 5 s, after 25 s, with a real sword), when my bed is
   gone, at 8:00, or -- once geared -- when the foe is far and 2:30 has passed.
9. **Push**: if blocks are still below `needNow` (or below 4), go back for more first; otherwise bridge to their bed
   and stop within 2.2 (step 4 breaks it on arrival).
10. **After their bed is down**: hunt the foe, or bridge to their spawn (where a respawned player is) -- the house bot
    has no such step.
11. **Hold** otherwise at the guard post `bed + facing*3` (the block the enemy's bridge lands on), facing the approach
    (or the foe), standing on wide ground; if my bed is gone, push their base directly.

Why these choices: the guides' Bed Wars first rush is wool + stone sword, not a full kit; the arena breaks beds through
cover instantly, so cover and tools are dead iron, and defence means winning the fight on the approach. The economy
edge (sword first, no apples before it, no tools) and the plan after the bed (break on the respawn window, then hunt)
are the two structural differences from the house bot, and neither uses a skill above the difficulty's set.

### Correctness / fairness checks

- `HOUSE_SKILLS`, `DIFFICULTY_PROFILES`, class and export names: unchanged (`check.mjs` deep-compares them).
- No new imports; only `ref/guestPeer.js` and `ref/projectiles.js` at the top, as before.
- Skill gating exercised: `throwables` (throws), `edge` (void-behind/edge spots/herding), `bridgeDefence` (the wait),
  `pillar`, `pearls` ('clutch' vs 'full'), `bowRange`, `crits`/`sprintResets` (inside the shared `meleeHit`),
  `bedwarsShop` ('wool' = nothing but wool; 'basic' = sword/wool/chain; 'full' = apples, armour, upgrades, emeralds),
  and the shared pace values (`stepDelayMs`, `brainMoveDurationMs`, `projectileEveryMs`, turn speed via `faceToward`).
- No bypass of the referee's rules: all hits go through `meleeHit` (which uses the shared cooldown/reach/facing gates),
  and throws go through the shared `throwAt` with the projectile cooldown.

### Rejected / deferred (with reasons)

- **Bed cover / pickaxe / axe**: useless against a one-action bed break; iron is better spent on wool and a sword.
- **A disengage / retreat stage** (BedwarsPracticeBot's FSM): equal walk/sprint speeds and the 0.5 s hurt window make
  running away mostly a donation of tempo; `backOffSpot` is in place for round 2 if the reviews show a losing trade
  pattern.
- **A knockback stick** (in the Bed Wars shop and in the SkyWars middle chests): checked and dropped -- the host's
  knock-back is `hit.knockbackLevel || (hit.isSprint ? 1 : 0)`, and at normal/hard a full-charge hit is already a
  sprint hit with level 1, so the stick adds no knock-back and costs the sword's damage for the exchange.
- **Strafing**: `DIFFICULTY_PROFILES.strafe` is false at every difficulty (and the profile is fixed), so no strafe
  movement.
- **Map-specific routes**: the maps are random; the brain uses `voidCellsToward` and `wideAt` so the same plan adapts.

### Verification

`node check.mjs` -> `CHECK PASSED` (after each edit, including the final round-1 state: clock and its per-round reset,
gearing, gold/stranding and bridge-defence gates).

## Round 1 games (2026-11-11): 2 won, 2 lost

Results: SkyWars normal **won** (51 s), Bed Wars hard **won** (271 s); SkyWars easy **lost** (130 s), SkyWars hard
**lost** (33 s). Every referee file: game 4's nine "speed" lines, game 4's `-0.1 s` pair is the host placing **both**
bots on their islands at the start (57.8 and 57.7 blocks/s in the same sample), the other seven are the **house bot**
being knocked into the void and respawning (its own teleports, at 132.8, 137.4, 167.9, 172.4, 184.5, 189.0, 261.5 s);
no hit was dropped against houseBotDs in any game, and nothing moved faster than sprinting.

### What the games showed, moment by moment

**Game 1, SkyWars easy (lost 130 s).** Both bots loot one spawn chest and cross at easy pace; DS's middle chest at
41.4 s, the house's at 39.2 s (the house then loots a second 14-item chest at 52.6 s and a golden apple). Three
separate losses in the same fight:
- **The tower race** (62-122 s): from the first exchange both bots climb, `y 32 -> 33 -> 34 -> ... -> 45`, "moving
  toward" each other with misses. Cause: the shared `moveStepToward` turns a target *above* me into a stair
  (`if (options.bridge && ty > this.position.y && (dist > 6 || !groundAt(target))) ty = this.position.y`), and
  `engageTactics` was passing the foe's `fy` -- each stair made the other bot's target higher, so they built each
  other up. Easy has `pillar: false`: houseBotDs was using a skill its difficulty does not have.
- **Fist hits**: from 86.3 s on, "attacking HouseBot with fist" while the hand column shows `stone_axe`. The walk
  places a block with `takePlaceableBlock` (which selects the block slot) and nothing puts the weapon back before
  `meleeHit` reads `getActiveItem()`. Those hits did 0.35 instead of the axe's 3.17 -- the 84.2 s axe hit is the only
  full one before 95.6 s. (The house bot has the same bug -- at 86.3 s it swung "with fist" holding a block -- but it
  had a diamond sword when it mattered.)
- **No heal, no sword**: the house looted the diamond sword at 39.2 s and a golden apple (eaten at 90.7 s, 6.27 ->
  ~20 with absorption); DS never found a gapple and stayed on its stone axe. At 1.34 hp it had nothing left to play.

**Game 2, SkyWars normal (won 51 s).** The middle loot worked: a 26-item chest at 15.7 s, the first exchange won,
an egg at 29.7 s, a bow shot at 25.4 s, a **pearl clutch** from y 17.3 back to y 30 at 37.0 s (normal's
`pearls: 'clutch'`), and the winning trade from **below** the foe (DS y 30, house y 32) at 38-42.9 s. A useful
confirmation: the lower fighter's eyes reach the higher fighter's body, while the higher fighter's eyes skim over the
lower one's -- fighting from below is an advantage in this reach model.

**Game 3, SkyWars hard (lost 33 s).** DS looted a 22-item middle chest at 12.4 s -- better loot than the house's --
and then lost the fight in eight seconds:
- 20.3 s and 21.8 s: real iron-axe hits (3.46 each on the house's diamond-grade armour).
- 22.3 s and 23.4 s: **fist hits** (0.38 each) -- the hand column shows planks in the 22.3-25.0 s samples while DS
  "moved toward" the foe. Two of its four swings in the decisive exchange were one-damage hits. The house's iron-axe
  crits did 5.75.
- 23.9 s: "healed with golden_apple" at 4.67 hp with the house 3.5 blocks off; the 1.6 s eat means no swing, and DS
  was dead at 25.2 s. `healIfNeeded`'s golden-apple branch has no foe-distance gate.
- 18.2-19.2 s: two bow draws started at ~9 blocks against a foe closing at sprint speed: the 1.05 s draw cannot
  finish before they arrive (the arrow never left).

**Game 4, Bed Wars hard (won 271 s).** Won on the bed-watch: the house's three rushes crossed to x -22.5, -45.6 and
back; DS met it on the bridge at 128.6 s and knocked it into the void (132.4 s), again at 167.5 s and 184.1 s,
destroyed the blue bed at 187.5 s and finished it at 261.2 s. But the first 125 s were wasted: DS stood at its own
forge from 0.2 s to 124.8 s with an iron sword from 60.6 s and a full wool stock. Cause: `wantsGold` contained a
standing `gold < 7`, and the forge step returns before the "when to go" step every tick -- so the "plan" step was
never reached, and every purchase put gold back under seven. The label "bridging to the undefined bed" is a bad
field read (`target.team` instead of `target.base.team`). No dropped hits, no illegal movement by DS.

### What I changed for round 2

1. **`equipBattleGear()`** (new, before `engageTactics`): `equipBest()` for the armour, then the weapon with the best
   **damage per second**, not the biggest hit, with the rate capped at two hits a second (the 0.5 s hurt window) and
   sharpness counted the same way `meleeHit` counts it. A diamond sword (7 at 625 ms, 11.2/s) beats an iron or stone
   axe (9 at 1250 ms, 7.2/s), which the shared `equipBest` picks by raw damage. `meleeHit()` calls it at the top (after
   the eating check), so a block left in the hand by the walk or the builder can never be the swing -- the 0.38-damage
   fist hits of games 1 and 3 are gone. It also replaces every "restore the weapon" call in the fight loop, the bow
   teardown, `engageEnemyOriginal` and the SkyWars throw.
2. **Never build upward toward a foe** (`engageTactics` approach): the walk target's height is `min(fy, p.y)` -- no
   stair can be placed toward a higher foe, so the tower race cannot start; the bot also steps *down* toward a foe
   below it, taking the reach advantage the game-2 win showed. Pillaring stays where the skill is: the explicit pillar
   branch, gated on `pillar` (normal/hard only).
3. **Eat only with room**: `consumeHealingItem()` in a fight only when the foe is more than 6 blocks away, and the
   proactive golden apple at 15 health or less with the foe more than 8 away (was 13/7.5). A 1.6 s eat with no swing
   inside their reach is a free hit -- game 3 died doing it.
4. **Bow draws only from 12 blocks** (was 8): a 1.05 s draw against a sprinting foe closer than that is a draw that
   cannot finish (game 3, 18.2 s). Release and drop rules unchanged.
5. **Bed Wars economy and timing**:
   - `wantsGold` is now only true for a purchase the shop will actually make next (iron sword 7, iron armour 12,
     the one apple 3); no standing `gold < 7`. This is what kept the bot at the forge for two minutes.
   - **The push decision now precedes the forge step** (which returns early every tick), so a finished plan can go;
     and there is a new `gearedPush`: sword 6 (or the wool-only shop) with the whole crossing stocked and the foe
     more than 25 blocks off, from 55 s (40 s at easy). The old first push was the 8:00 clock or a kill window.
   - **Wool no longer starves the stone sword**: while `sword < 5`, wool is bought only from 14 iron (10 for the
     sword, 4 for the 16 blocks it needs). At 4 iron a tick the wool branch had spent every ingot and the sword was
     not affordable -- game 4's stone sword came at 46 s and its iron sword at 60.6 s.
   - **My bed is defended when I am away too**: a foe within 14 of my bed now brings me back whenever I am not
     already at their bed (`targetDist > 12`), not only when I am within 26 of home.
   - Fixed the `target.team` label (the arena base carries the team, the push target does not).
6. **Referee**: nothing to fix. The one line with houseBotDs' name is the host's spawn placement at -0.1 s (both bots
   in the same sample); the eight others are the house bot's void falls and respawns. No hit was dropped.

### Verification (round 1)

`node check.mjs` -> `CHECK PASSED` (after every edit above).

## Round 2 games (2026-11-11): 2 won, 2 lost

Official: SkyWars easy **lost** (84 s), SkyWars normal **lost** (57 s), SkyWars hard **won** (56 s), Bed Wars
hard **won** (177 s). Referee: game 4 has seven lines, all the hosting/void-fall speeds described below; games 1-3
have **no lines at all** -- not one hit dropped, nothing over sprint speed. The round-1 fist hits and floor bow
draws did not come back: `equipBattleGear` held every swing.

### What the games showed, moment by moment

**Game 1, SkyWars easy, frozen_peaks (lost 84 s).** DS looted its spawn chest and the middle; the house got the
better loot (two golden apples and a diamond sword) and, more to the point, the better shape of the fight:
- 30-62 s: the same **tower race** as round 1, in its easy form: DS `y 31 -> 36` climbing after the house ("moving
  toward", no hits); easy has no pillaring, so no bot should be building at all, and no bot could hit the other.
- 63.2 s and 65.3 s: the house ate both apples at 7.86 hp and came back to ~20 with absorption while DS, on a stone
  axe with **16 food and no apple left**, had nothing. From 65 s to the end it was a losing trade at 3 HP a hit.
- 76.4 s: DS slain (timeline ends 84 s). Death at ~2 HP with food in the pack: `healIfNeeded` refuses ordinary food
  while a foe is within 6, and DS never opened the distance to eat.

**Game 2, SkyWars normal, meadow (lost 57 s).** Good start, fatal middle:
- 11.3 s: diamond sword out of the spawn chest (round 1's loot-order change doing its job).
- 29.8 s: **ate a golden apple at 7.15 hp with the house bot in its reach** and paid for the 1.6 s: this is the
  round-1 bug the round-1 fix was supposed to stop, and it was still there -- the brain calls `consumeHealingItem()`
  at the top of every tick, and `healIfNeeded`'s gapple branch has no foe check, so the round-1 "only from 6 blocks"
  gate was bypassed every time.
- 40.9 s and 41.4 s: the house's two apples (the loot edge that decided game 1 as well).
- 46.2 s: DS at **1.67 hp** still trading in reach instead of leaving; slain at 48.5 s (timeline 57 s). Its
  snowballs, though, were clean: hits at 14.5, 18.7, 28.0, 32.0 and 45.0 s -- the throwable skill worked.

**Game 3, SkyWars hard, archipelago (won 56 s).** The good one, and it shows why:
- DS made the bridge crossing and **held** its side; its snowballs landed at 43.2 and 45.6 s, and the house bot's
  pearl at 48.0 s was its attempt to escape -- it went into the void ("HouseBot knocked into the void", 48.0 s).
- DS dealt no damage at all in the game; it won by *not* following the house onto narrow ground and letting the
  void and its own projectiles do the work. Position first, hits later.

**Game 4, Bed Wars hard, compact (won 177 s).** Won, but the middle was rough in a new way:
- 12.4 s: the house's first rush; DS answered at the bridge.
- 46.3 s: DS knocked the house into the void (its first real Bed Wars kill of the series).
- 66.3 s: **ate a golden apple at 7.8 hp with the house in reach** -- same bypass as game 2 -- then 67.5 s DS was
  killed by the house bot: respawn at 72.6 s. The kill window at 46 s had sent DS across the ~70-block crossing
  with a stone sword; it arrived as the house came back, lost the trade, lost the gear.
- 104.5 s: second knock-in. 163.1 s: blue bed destroyed. 167.3 s: final kill, team eliminated, Red won.
- Referee lines: `-0.0 s` 34.5 both (the host placing both bots at spawn), 72.4 s DS 34.7 (its own **respawn
  teleport** -- spectator at 72.1 s, red forge at 72.6 s), the rest (46.7, 51.3, 104.9, 109.4 s) the house's void
  falls and respawns. Nothing to fix.

### The three causes, in order of how many games they cost

1. **Eating inside the foe's reach.** The round-1 gate lived at the call sites; the gold-apple branch of
   `healIfNeeded` ignores distance, and the brains call it unconditionally every tick. Cost games 2 and 4 and
   contributed to game 1.
2. **Climbing after a foe.** Both SkyWars losses turned into vertical chases (easy 31->36, normal's pillar branch
   at 32.5/33.0/35.1/35.6/39.3 s) where neither could hit: the walk stair-builds toward a higher target, and a
   *higher* fighter is the worse half of the reach model anyway.
3. **No exit at the bottom of the bar.** At 1.67 hp (normal) and ~2 hp (easy) DS kept trading; even with food, the
   eat was refused because a foe was within 6 and DS never made room.

### What I changed for round 2

1. **The distance guard moved inside `consumeHealingItem()`**, the single choke point every caller goes through: at
   8 health or less, with any live peer within `AUTOPILOT_MELEE_REACH + 0.6` (3.6) blocks, refuse to start a heal.
   One place, not three call sites -- the round-1 gate cannot be bypassed again. `hasCombatHeal()` (new) reports a
   gapple or a healing/regen potion in the pack.
2. **Low-health break-off (`engageTactics`)**: at 7.5 health or less, with *something to heal with* and a foe still
   worth escaping (over 5 health), for a bounded **2 s**, step to `backOffSpot()`; while a heal was started below 12
   health keep opening the distance until it lands (eat at under 4.5, back off; the eat is 1.6 s with no swing).
   With nothing to heal with, fight -- running with no heal only loses the position. "Something to heal with" is a
   gapple or a healing/regen potion (`hasCombatHeal`, new) **or ordinary food while the bar is not full**
   (`hasFood`, new, over `JAVA_FOODS`): game 1 had 16 food and no apple and died never having opened the 6 blocks
   the shared ordinary-food rule needs. The bar fills, then a full bar with saturation regenerates 1 health a half
   second -- and the entry `consumeHealingItem()` does the eating once the distance is there.
3. **Hold below a higher foe**: a foe 1.5 or more above within 6 blocks across gets **1.5 s** of holding at my own
   level, facing it ("holding below ..."), before anything else. If they stay up there the pillar branch (where the
   difficulty has the skill) can still chase; easy and normal never build. This kills the tower race at the source
   -- the walk no longer receives a higher `ty` in the meantime.
4. **Bridge only over a real gap** (`voidOnLineTo`, new): the approach calls `moveStepToward` with `bridge: true`
   only when the line to the foe at **my own foot height** has a missing floor (`hasGroundAt(..., 1) === null`) --
   otherwise `bridge: false` and the shared walk cannot fill cells under its own feet and ratchet the ground up.
5. **Bed Wars kill-window gate**: a kill-window push (foe seen, 25 s in, no foes alive) now needs `sword >= 6` or
   the wool-only shop or **their bed within 40 blocks**. Game 4's 46.9 s window across ~70 blocks with a stone
   sword was a window that closed in transit.
6. **Referee**: nothing against houseBotDs to fix. Game 4's seven lines are the spawn pair, DS's respawn teleport
   and the house's void falls; the other three games are clean.

### Verification (round 2)

`node check.mjs` -> `CHECK PASSED` (after every edit above).

## Round 3 games (2026-11-11): 4 won, 0 lost

Official: SkyWars easy **won** (75 s), SkyWars normal **won** (55 s), SkyWars hard **won** (76 s), Bed Wars hard
**won** (208 s). Referee: three lines in all, every one the house bot's own fall or respawn (SkyWars normal 46.9 s
12.5 blocks/s as it drops; SkyWars hard 68.6 s 10.2 blocks/s; Bed Wars 71.7, 76.2, 120.7, 173.7, 185.6, 190.2 and
197.9 s its void falls and respawn teleports, plus the 0.0 s host spawn pair). **No hit was dropped against
houseBotDs in any game and nothing of its moved faster than sprinting.** The round-2 changes all held: no fist hits
(iron/diamond sword in hand at every swing), no in-reach gapple that lost a fight, no tower race.

### What the games showed, moment by moment

**Game 1, SkyWars easy, citadel (won 75 s).** The two looted for the first minute (the house until 57 s, DS until
58.7) and then fought once, at 63-67.8 s:
- 0.7 s spawn chest (6 items), 4.9-31.8 s the long walk to the middle (0.65 blocks/s -- easy's pace), a 12-item
  chest at 31.8 s, a 16-item chest and an **iron axe at 46.1 s**.
- 63.5-67.2 s: the trade, at y 28, toe to toe: the house 20 -> 1.87 with DS's iron axe, DS 20 -> 16.81 (the house's
  iron-axe hits did 1.7-1.9 each through DS's armour; DS's did 3.5).
- 66.2-67.2 s: the house ate **two golden apples at 4.23 and 1.87 health while in DS's reach** -- the same bug DS
  had in round 2 -- and DS killed it at 67.8 s still swinging. `equipBattleGear` kept the axe in hand throughout.
- Badly: DS's middle chests at [6, 32, -6] were on the raised centre and it looted at y 28 under them, never
  climbing; it still found an iron axe and won on gear, but the y-32 chests (diamond gear, pearls, the bow) were
  left to nobody.

**Game 2, SkyWars normal, archipelago (won 55 s).** DS's positioning won this one without a melee hit:
- 0.6 s spawn chest 11 items, middle chests at 2.8-17.1 s, **diamond sword at 29.2 s**.
- 33.8 s and 38.1 s: **egg hits on the house bot** (the first was thrown at 34.0 s).
- 34.5 s and 36.1 s: "**holding below**" the house, which was one block up on the middle's edge; 36.6 s "stepping
  off the edge line of HouseBot" (edge sense), 38.2 s another egg.
- 43.7 s the house's arrow hit DS (17.12 -> 14.56).
- 45.0-46.1 s: DS stood at (3.1, 31, -5.5) with the house at (6.9, 30.9, -9.1) moving at it; the house went
  (7.4, 22.1, -9.8) then (7.7, 7.7, -10) -- **it walked off the island chasing DS**, and was knocked into the void at
  46.7 s. The hold-below and edge-line steps are what put DS on the safe side of that edge.

**Game 3, SkyWars hard, sectors (won 76 s).** The hard fight, and the only real scare of the round:
- 11.3 s a 35-item middle chest, iron axe; **diamond sword by 16.0 s**; the house's bow at 16.0-17.1 s hit DS
  (20 -> 16.99).
- 16.6-20.8 s "**holding for HouseBot on the bridge**" (bridge defence) while the house crossed.
- 21-56 s: the fight on the middle's towers, both at y 33-34: DS 20 -> 15.65 -> 11.14 with the house at 9.85-13.6;
  at 52.5 s a crit took DS 11.14 -> 6.63, and at 54.1 s another took it to **3.62** -- the lowest of any game.
- 53.0, 54.6 and 56.2 s: **three golden apples started back to back**, the first one's Regeneration II still running
  through all three (its 4 absorption does not stack with a second; the second and third only refreshed the
  timers). It worked -- 3.62 + 4 absorption into 20 + 4 by 61.5 s -- but two of those 1.6 s no-swing windows bought
  nothing.
- 63.6-64.1 s the crits that turned it (the house 7.99 -> 6.29 -> 3.74); at 66.8 s the house started **pumpkin pie
  at 2.04 health** as it moved at DS and stepped off the tower (67.3 s, y 22.3 -> 8.4); knocked into the void at
  68.4 s. DS then drew its bow at the spectator until 73.2 s (harmless; the game was over).
- Badly: the 52.5-54.1 s sequence (edge-herding "taking the island side" at 11 health against a foe above) and the
  three-apple chug.

**Game 4, Bed Wars hard, compact (won 208 s).** DS won every fight and finished the bed, but the middle was idle:
- 0-48.4 s: **48 s at its own forge** collecting (stone sword at 22.0 s); the house fortified its bed at 7.2 s,
  stocked 46 blocks by 12.5 s and was bridging to the red bed from 18.8 s.
- 48.4-52.1 s: DS walked out to meet it ("holding the way to my bed"), 52.6 s engaged; the fight from 52-70 s ended
  with the house **knocked into the void at 71.2 s** (chat).
- 71.1-81.2 s: DS collected the **d0 and e0/e1 generators** (its only diamond/emerald income of the game).
- 81.7-135.3 s: `collecting at the red forge` -- but it stood still at x -12.8 the whole time: **the forge at x
  -45.4 was unreachable** (the middle island's ledge / the walk's 2-block step limit) and the step kept asking for
  it because `wantsGold` still wanted the iron sword and `wantsIron` the chain armour. **53 s of standing with a
  false label.** The emerald generators were 13 blocks away and stocked; the 10-block radius of the generator step
  never looked.
  The upshot: the diamond sword came at 169.4 s instead of ~100 s.
- 93-115.8 s: the house's second rush; DS engaged at 101.7 (the house's iron-sword crits did 6.5 and 5.9), dropped
  to **4.56 at 108.8 s**, broke off ("making room to heal"), started the apple at ~4.7 blocks and took hits to 2.4
  before it landed at 110.9 s (+4 absorption), regenerated to 20 + 4 by 118 s; the house died at 115.8 s. The
  round-2 eat-guard and break-off are exactly what this was.
- 121-168.8 s: the third rush, another fight at the bridge (DS 20 + 4 vs the house's wooden axe), the house at 1
  health at 167.7 s from DS's crit, dead at 168.8 s.
- 169.4-187.6 s: **DS bridged the 45-block crossing to the blue bed** (18 s) and broke it while the house, respawned
  at 173.8 s, crossed to red (the house's wood-axe rushes never reached the bed). DS then fought the intercept at
  182.5-198 s (DS 10.08 vs the house 12.72, the house healing a gapple at 194.2), held the edge of its own bridge
  and the house **stepped off it** at 195.3-198 s; final kill 197.5 s, team eliminated.
- Referee: nothing against DS except the 0.0 s host spawn pair; its one "fall" is a kill, not a fall.

### The two things to fix, and what I changed

1. **The Bed Wars forge dead-end (badly, game 4: 53 s).** The forge step walks home with `bridge: false` and trusts
   `moveStepToward` to arrive; on this map it cannot (a ledge between the middle and the bed island), so the bot
   stood at the gap with "collecting at the red forge" while its wants never cleared. The fix is not to change the
   forge walk (bridging home would spend the crossing's wool and could stair-ratchet) but to make the **generator
   step look further for emeralds**: an emerald-stocked generator is now worth a walk of **18 blocks** (diamond
   still 10). Three emeralds are the diamond sword, and the walk that pays is the one the bot never considered. At
   x -12.8 the e1/e0/d1 generators are 13-15 blocks away, so this puts the game's best weapon in reach while the
   forge is unreachable.
2. **Back-to-back golden apples (badly, game 3: three in 3.2 s).** `consumeHealingItem` now refuses a golden apple
   when its own effects are still on -- absorption **≥ 3.5** and Regeneration II with **more than 2.5 s** left, and
   no enchanted apple (16 absorption) or healing potion (instant) in the pack to make a real difference. Java's
   absorption does not stack (a second apple only resets the timer -- Minecraft Wiki, Golden Apple; the datapacks
   that make it stack exist precisely because vanilla does not), and this engine's `startEating` uses
   `Math.max(absorption, 4)`. The saved apple is health insurance for the next exchange, and the 1.6 s is a swing.
3. **What I deliberately did not change**: the 3.6-block eat guard and the low-health break-off (game 4's 108.8 s
   proves them: eating at 4.7 blocks with absorption landing at 2.4 health beat waiting for six blocks of room that
   a same-speed chaser never gives), the hold-below window, and the kill-window gate. Game 3's 4.2-block apple was
   the design working, not failing.

Sources: [Minecraft Wiki - Golden Apple](https://minecraft.wiki/w/Golden_Apple), [Absorption Effect - Metabot](https://metabot.gg/en/minecraft/effects/absorption), [Stackable Absorption Hearts (the vanilla behaviour is non-stacking)](https://modrinth.com/datapack/stackable-absorption-hearts)

### Verification (round 3)

`node check.mjs` -> `CHECK PASSED` (after every edit above).

## Round 4 (2026-11-11): the final's two SkyWars losses, the new fall damage, and the way down

### The brief

Three changes landed in the engine and in both bots since round 3 (all already in this file, the house bot and the
refreshed `ref/guestPeer.js`):

1. **Fall damage** for every guest, as Java's: from the highest point of a fall to the landing, each block past 3
   hurts 1 (rounded up). `ref/guestPeer.js:1876-1881` tracks `fallPeakY` and calls `hurtSelf(Math.ceil(fell - 3))`;
   an ender pearl's landing is damage too (5, and armour does not lessen it, `ref/guestPeer.js:2147`). Dropping off a
   tower now costs health.
2. **`climbDown(tx, tz)`** (merged into `houseBotDs/houseAutopilotDs.mjs:456-485` from the house bot): walks off the
   nearest edge with ground below -- the smallest fall first, never one that would leave under 6 health, never the
   void. `engageTactics` calls it when the foe is 2+ blocks below and out of reach (`:949`); `unstick` drops up to 3
   blocks at every difficulty and falls back to `climbDown` (`:665-697`). `HOUSE_SKILLS.easy.towerDrop` is now `true`,
   so every difficulty gets down from a tower.
3. **The opponent** (`house/houseAutopilot.mjs`) has the same two fixes and no longer stays stuck on a tower or a
   tree when its foe is below.

The final measure after round 3 finished 6 won, 2 lost. Both losses were SkyWars and both ended in the void.

### What the two losses show

**final-skywars-hard-3 (classic/frozen_peaks, lost 30 s, slain at 22.6 s; referee: nothing).**
- 11.6 s: the house's arrow hit DS while DS looted the middle chest (20 -> 17.51), the knock-back lifting it to y 32.
- 13.6-15.8 s: "**holding for HouseBot on the bridge**" -- bridge defence, with the house still coming over the
  bridge. At 15.8 s the house was at (0.5, 32, 0.5), DS at (0.5, 31, -2.5): 3.0 apart, just outside reach, and DS
  stood still in the hold instead of setting the distance itself. The first free hits landed at 16.3-17.4 s
  (20 -> 14.75 -> 14.09).
- 20.0 s: "**stepping off the edge line of HouseBot**" at (0.3, 32.2, -10.1); by 20.6 s DS was at y 28.7 and falling.
  The step had picked a **corner** of the island: ground at the spot and "behind" it along one edge, void along the
  other. The pearl clutch at 20.7 s landed on the block at **[0, 31, -9]** -- the rim it had just left -- for 5
  health, and at 21.1 s DS was at 3.97 with the house at 15.93.
- 21.6 s: "healed with golden_apple" **at 3.97 health on the rim**; 22.2 s falling again (y 25.4); 22.3 s the second
  pearl, landing on the block at **[0, 31, -10]**; 22.6 s slain.
- The pattern: every movement that lost this game was DS *walking itself* towards the rim -- a hold at the bridge
  head, a corner step, then a low-health retreat (the apple at 21.6 s) that the next step carried over the edge.

**final-skywars-normal-5 (archipelago/tropical_atoll, lost 128 s, knocked into the void at 120.3 s).**
- Long ranged game, DS ahead on damage for most of it (house arrow-hit at 66.5, 74.6, 83.6 s against DS's 70.1,
  87.2, 93.2, 111.3), but **DS spent all four of its pearls first** (71.7, 88.2, 90.2, 100.7 s) while the house still
  had one at 110.2 s.
- 100.1 s: "**taking the island side of HouseBot**" (edge herd) at 19.95 health. By 100.7 s DS had fallen off the
  island and pearled back onto the block at **[10, 30, 19]** -- a rim cell -- for 5 health (19.95 -> 15). The herd
  walks to a one-cell ledge; `standable` passes an edge block.
- 106.7 s the house ate at **3.92 health** and 112.8 s at **12.92 health with DS 3 blocks away**; it came back to 20.
  DS at 111.7 s was at 11.27 health with the house **6.5 blocks off** and no absorption -- the last moment the apple
  could have gone down with room -- and fought on instead.
- 115.6 s 5.23 health; 116.1 s "making room to heal"; 117.2 s the house's sprint hit took it to **2.21** and carried
  it x 9.1 -> 12.3; 118.3 s "healed with golden_apple" at **x 12.3 on the rim**; 118.9 s y 28.3, 119.5 s y 16.6,
  120.0 s y -2.1, 120.3 s "knocked into the void by HouseBot" -- with no pearl left.
- Referee "120.4 s HouseBotDs: speed: 24.5 blocks/s over a second" is the void fall and the spectator respawn
  teleport that follows it (the same line the hard-6 record gives the house at 33.1 s, 0.3 s after it was knocked
  into the void at 32.8 s). It is not a movement input; the way to keep it out of the record is to not be on the rim
  when the hit comes, which is what the changes below are for. Nothing was dropped from either game against DS.

### What I changed

The common cause is a rim: a sprint hit carries about **three blocks** (the figure the web guides give; base melee
knock-back ~1.55, roughly doubled by a sprint), so a cell with the void two steps behind it is the edge.
Fall damage and the 5-damage pearl landing make every one of those steps cost real health now. Five of the fixes are
about never choosing such a cell; two are about eating early enough not to need one.

1. **`islandSpot(x, y, z)`** (new, next to `groundAt`): ground under the cell and on **all eight** sides of it -- the
   inside of an island, not its rim. `wideAt` (6 of 9) passes a rim cell; this does not.
2. **`backOffSpot`** (the low-health retreat) now wants **room**: the cell 4 blocks from the foe must have ground 1,
   2 and 3 blocks further along the line of retreat (a knock-back lands in it, not over a rim), and it prefers an
   `islandSpot`, falling back to a room-passing cell on a bridge, then to `wideAt`. This is the change for the
   normal-5 118.3-118.9 s apple/knock-back and for hard-3's 21.6-22.2 s retreat after the pearl.
3. **`saferSpot`** (the edge-line step) now rejects **corners**: besides ground behind the cell on the line from the
   foe, it needs ground on both sides across that line, and it prefers `islandSpot`. This is hard-3's 20.0 s fall.
4. **`voidBehind`** samples **four** blocks, not two: a sprint hit carries three, so "the void is three blocks behind
   me" is standing on the edge.
5. **`edgeSpot`** (the herd that takes the island side) now only accepts an `islandSpot` cell, and the herd is off
   at 10 health or less unless absorption is up. This is normal-5's 100.3 s fall and the 5-health pearl that came
   with it -- and stops it doing that while one hit from death.
6. **Bridge defence holds only out of reach** (`d > 4.2`, was every distance under 14). Standing still 3.0-4.2
   blocks from a foe who is closing is how hard-3 took free hits at 13.6-15.8 s; inside 4.2 the normal approach and
   swing now run instead.
7. **Golden apple before the blows**: at easy and normal (where the foe's hits are not critical, so a hit taken
   during the 1.6 s is affordable) DS eats at **14 health or less with the foe more than 5.5 blocks off** -- the
   house's own play in normal-5 (it ate at 12.92 health with DS 3 blocks away and came back to 20). The old "15
   health, more than 8 blocks" rule also now requires **absorption below 2**, so an apple is not wasted while one
   is still on. At hard the early eat stays at >8 blocks: a crit is x1.5 and can take 10 at once.
8. **The low-health retreat lasts 3 s** (was 2) and calls `consumeHealingItem()` after each step, so the apple starts
   the moment the retreat opens 3.6 blocks -- `healIfNeeded`'s own room rule -- instead of waiting for the next brain
   tick at the old position.
9. **`lastLandInterior()`** (new) for pearl clutches: the last wide ground, or the nearest `islandSpot` within 3
   cells of it. hard-3's two pearls landed on the blocks at [0, 31, -9] and [0, 31, -10], both on the rim; a clutch
   has to buy more than half a second.

What I deliberately did not change: `climbDown`/`unstick` (the merge is correct, and its 6-health floor and
smallest-fall-first choice is the right reading of Java's fall damage), the 3.6-block eat guard, the hold-below
window, the Bed Wars plans, and the gapple-redundancy guard from round 3. `HOUSE_SKILLS`, the profiles and the
exports are untouched.

Sources: [Minecraft Wiki - Tutorials/Player versus Player](https://minecraft.wiki/w/Tutorials/Player_versus_Player),
[Minecraft Wiki - Golden Apple](https://minecraft.wiki/w/Golden_Apple),
[Craftdex - Knockback Mechanics](https://craftdex.net/articles/knockback-mechanics-explained),
[MMC - Positioning](https://mmcpvp.com/lessons/intermediate/positioning),
[CubeCraft - how to play skywars](https://www.cubecraft.net/threads/how-to-play-skywars-thread.186891/).

### Verification (round 4)

`node check.mjs` -> `CHECK PASSED` (after every edit above).

## Round 4 reviews (2026-11-11): the normal win and the hard sustain loss

Round 4 of 6: 1 won, 1 lost, 0 drawn -- round-4-skywars-normal-1 won in 42 s, round-4-skywars-hard-2 lost in 42 s.
Both records show referee "(nothing)": no dropped hits, no movement line.

### round-4-skywars-normal-1 -- WON (sectors/sweet_slices), 42 s

- 1.7-25.5 s: DS looted its start chests and both middle chests and had the diamond sword out by 25.5 s, while the
  house was still looting its own start chest and then bridging. The loot pace is the profile's; the choice to take
  the mid chests was right, and the house reached mid late.
- 25.5 s: the house drew a bow at DS from ~6 blocks. 27.1 s the arrow landed (20 -> 17.82; the knock-back lifted DS
  to y 31.9) -- the only hit DS took in the game.
- 27.1-28.8 s: with the bar at 20, DS regenerated 17.82 -> 18.82 -> 19.82 -> 20: exactly 1 health a half-second, the
  full-bar rate ([Minecraft Wiki - Hunger](https://minecraft.wiki/w/Hunger)). This is what a filled bar buys and
  what hard-2 did not have.
- 29.3-30.4 s: DS took the house 20 -> 16.24 -> 12.48. 30.9 s the house pearled away ("falling: ender pearl back to
  land", -2.1,31,4.2 -> -6.7,26.3,10.8) and landed at 7.48 health -- the pearl's 5 damage. It stepped the edge
  line at 31.5-32.0 s, came back at 32.6 s on 3.72, and was slain at 33.6 s.
- What went well: a direct approach with the better sword, every swing in reach, and 19.04 health left at the kill
  against 0. The house's escape cost it 5 health of its own. Nothing here needs a change.

### round-4-skywars-hard-2 -- LOST (citadel/end_citadel), 42 s

- 14.4-15.5 s: the house drew a bow at DS while DS looted the middle chest at [-6, 33, -6]; its arrow hit the block
  at [-3, 30, -5] (projectiles.txt) -- 1.5 s of draw for nothing. The only projectile either side threw.
- 17.1 s: the duel started at **1.7 blocks** (house (-2.3, 29, -2.4), DS (-2.4, 29, -0.7)) and neither moved for the
  next 16 s. DS's diamond-sword crits took **3.76 net** a hit (house 17.13 -> 15.26 -> 14.39 -> 12.52 -> 9.65 ->
  6.78); the house's iron-axe crits **3.28** (DS 16.72 -> ... -> 10.88 at 20.4 s). DS was ahead on both health and
  damage per hit.
- 20.9-29.0 s: the house ate golden apples, one label after another (six starts), and its health went
  6.78 -> 3.91 -> 2.04+4 -> ... -> 9.17+1.13 at 29.5 s, with **absorption 4 renewed again and again** (22.5, 24.2,
  25.8, 27.4, 27.9 s). DS hit it on every cadence it had and could not out-damage a fresh 4 absorption plus
  Regeneration II. That is what a re-eaten apple is worth: the renewal, not the raw healing, wins this race.
- **The loss inside the loss**: DS took **no hit at all from 20.4 to 29.5 s** -- nine seconds -- and its health went
  10.88 -> 11.88 and then **sat at 11.88 for six seconds with food 17**. Food 17 is below 18, where Java has **no**
  natural regeneration; at 20 with saturation it is 1 health a half-second
  ([Minecraft Wiki - Hunger](https://minecraft.wiki/w/Hunger)). DS did not eat: every gapple route in its code needs
  8 health or less (`healIfNeeded`) or the foe beyond 8 blocks (the hard pre-fight rule), and at 10.88 health with
  the foe at 1.7 neither held; the low-health retreat needs low health before it opens room. The house, 1.7 blocks
  away, was in exactly that gap and used it.
- 29.5-33.3 s: the house swung again and DS went 8.6 -> 5.32 -> 2.04 while the house climbed 9.17 -> 9.68. Slain at
  33.3 s.
- What went well: the opening trade, reach discipline, and forcing the house to 2.04 health. What went badly: no
  sustain of its own in the one window the fight offered, and a bar one point short of regeneration.

### What I changed

All four changes are inside `engageTactics`/`consumeHealingItem`; `HOUSE_SKILLS`, the profiles and the exports are
untouched, and none of them uses a skill a difficulty lacks.

1. **`foeQuiet()`** (new): a hit landed on me **within the last 10 s** and **none for 1.5 s**. Every guest's eat is
   1.6 s with no swing (`startEating`; `isEating` gates `meleeHit`), so a foe who was swinging and is not now is
   eating or has broken off. The 10 s bound keeps a stale `lastHurtAt` from an earlier exchange from licensing an
   eat in front of a foe I have not traded with yet -- `#onHurt` in ref/guestPeer.js sets the stamp, and fall damage
   does not, so a fresh fall cannot fake it either.
2. **Golden apple on a quiet foe, in reach, at any difficulty**: 15 health or less, absorption below 1. This is
   hard-2 at 21.9-29.5 s exactly: 10.88-11.88 health, the house at 1.7 blocks, nine seconds of no hits. Eating at
   21.9 s puts 4 absorption and Regeneration II down before the house's next swing at 29.5 s. (The two older early
   eats stay: >8 blocks at any difficulty, >5.5 blocks at easy/normal.)
3. **The 8-health guard now allows the eat while the foe is quiet** (was: always refused with a foe inside reach
   plus 0.6). A foe who has not hit for 1.5 s can land at most one hit inside the eat, and one crit is 3.28 -- it
   cannot kill at 8. The guards from rounds 1-2 were about a foe *swinging now*, and that case still refuses.
4. **`bestFood()` + ordinary food on a quiet foe**: health 16 or less, bar not full, at any difficulty. A filled bar
   with saturation is the fast regeneration -- normal-1's own 17.82 -> 20 in 1.6 s is the measurement -- and
   `healIfNeeded` will not touch ordinary food with a foe inside 6 blocks, so the quiet window is the only place a
   mid-fight meal can happen. This one works even when the pack holds no apple, which hard-2 cannot rule out.

What I deliberately did not change: the round-3 gapple-redundancy guard (the house's re-eats only topped absorption
back to 4 and renewed Regeneration II -- each re-eat is still worth it once absorption is spent, which is what the
new rule uses), the attack cadence (the referee dropped nothing; DS's 3.76 net beats the house's 3.28), the bow (a
draw that misses, as at 14.4 s, is the mistake -- not closing), and the low-health retreat.

Sources: [Minecraft Wiki - Hunger](https://minecraft.wiki/w/Hunger),
[Minecraft Wiki - Golden Apple](https://minecraft.wiki/w/Golden_Apple),
[Minecraft Wiki - Tutorials/Player versus Player](https://minecraft.wiki/w/Tutorials/Player_versus_Player),
[CubeCraft - The Golden Apple Guide](https://www.cubecraft.net/threads/the-golden-apple-guide.191656/).

### Verification (round 4 reviews)

`node check.mjs` -> `CHECK PASSED` after the quiet-window apple and the relaxed guard, and again after `foeQuiet()`
and the ordinary-food branch.

## Round 5 reviews (2026-11-11): four wins, and the moment each one nearly went wrong

Round 5 of 6: 4 won, 0 lost, 0 drawn. All four records show referee "(nothing)".

### skywars easy-1 (archipelago/mushroom_isles), won 86 s

- 0-70 s: DS looted its start chests and every middle chest on its side (the chest at 52.6-60.4 s held 19 items, the
  one at [-3, 31, 3] took 60.9-70.1 s), and held an iron axe from 25.7 s. The house looted its own start, bridged to
  mid at 7.8 s, reached a diamond sword at 33.7 s and came for DS at 70.1 s.
- 70.7-77.2 s: the fight. DS hit for **5.29** a swing (house 20 -> 14.71 -> 11.42 -> 8.67 -> 6.04 -> 3.3 -> 0.68);
  the house never touched DS, which finished on **20 health**, and the kill was at 77.9 s.
- What went well: the gear and the full health at the first blow. What went badly: nothing that cost anything. The
  one thing to note is the 70 s of looting -- the pace is the profile's and fixed, and at easy the house has no bow
  and half-charge swings, so buying time was cheap here. There is nothing to fix in this game.

### skywars normal-2 (citadel/desert_fortress), won 40 s

- 18.6 s: DS's snowball hit the house (its throwables landed and are in projectiles.txt).
- 21.3-22.9 s: the house drew a bow while DS walked in; the arrow hit at 22.9 s (20 -> 16.13, 3.87 + knock-back).
  DS closed anyway and the first exchange was its own: 23.4 s house 16.88.
- 25.5-31.9 s: the fight around the mid structure. The house pearled at 28.2 s (projectiles: to the block at
  [3, 31, 10]) and DS spent 27.6-30.8 s stepping off the edge line and "climbing down (1 blocks)" after it -- the foe
  was 2 blocks below and out of reach, so the descent was the right play, and DS paid 3.48 a hit twice for it while
  taking the house 15.76 -> 11.64 -> 6.64 -> 3.52. At 32.6 s the kill. DS finished on 6.69.
- What went well: the throw, the trade (DS's 5.2 a hit against the house's 3.48), and not falling off the mid
  structure. What went badly: the arrow at 22.9 s (a straight walk at a drawing bow) and nothing else. The descent
  cost two hits but bought the kill -- no change needed.

### skywars hard-3 (archipelago/tropical_atoll), won 42 s

- 19.0-20.2 s: the house drew at DS while DS looted; the arrow hit at 20.2 s (20 -> 18.23).
- 21.7-24.3 s: DS took the house from 17.55 to **8.21** (5.17 a hit). The house's axe crits cost DS **5.34** --
  armour-light this game -- and at 24.9 s DS was at **8.32**, one hit from the retreat rule's floor.
- 25.4 s: the house splashed a healing potion (8.21 -> 8.76) and pearled down at 26.0 s; at 26.5 s its crit took DS
  **8.32 -> 3.98**. Only then did DS flee ("making room to heal from HouseBot"), and **at 28.0 s the quiet-foe rule
  from round 4 allowed the apple** -- the effect landed at 29.6 s (3.98+4, food to 20), Regeneration II ran it back
  to 20 by 36 s while the house gave chase and could not finish it. The house died at 33.7 s.
- What went well: the quiet-window apple and the retreat, exactly as built in round 4. What went badly: the retreat
  was **one exchange too late** -- the fixed floor is 7.5 health, and against 5.34-damage crits that is already
  inside the two-hit window. This is the change below.

### bedwars normal-4 (stepping), won 222 s

- 0-24.1 s: both collected at their forges. The house fortified (7.2 s), stocked 48 blocks and **left at 24.1 s**,
  bridging a straight line through the middle. DS stayed at its forge until **55.2 s**, buying a stone sword
  (21.9 s) and an iron sword (42.5 s), then bridged the other way.
- 47.0-51.8 s: the house reached x 9.5 on its bridge and turned back ("collecting resources at blue forge"): its
  crossing had run out of blocks before DS's island (x ~58). The two bridges never met.
- 55.2-114.7 s: DS's crossing, ~100 blocks at the profile's bridge pace. At 93-109 s the house met it on the bridge
  near x -35 with a wooden sword and lost: DS (iron sword, 5.2 a hit) took it 20 -> 0 while going 20 -> 5.72. DS
  broke the **blue bed at 114.7 s** -- the game's decisive act.
- 114.7-123.8 s: DS then **walked toward the respawned, full-health house at 5.72 health with nothing to heal with**
  (its food was 16 and it held no gapple: the shop buys one for 3 gold only after 12 gold of iron armour) and lost
  5.72 -> 5 -> 4.28 -> 3.56 -> 2.84 to a **fist** before the sword finished it. With its own bed standing, this death
  cost only the respawn and the kit; the next one did not.
- 129.2-162.9 s: DS respawned **with the starting wooden sword, no iron and no blocks** and marched 40 blocks at the
  house -- which now had an **iron sword** -- and lost the trade 16.68 -> 0.52, dying at 162.9 s. It respawned again
  at 167.8 and did the same thing again (wooden sword, 167.8-175.8 s). The reason is in the brain: once the enemy
  bed is broken `targetBed` is null, the "stranded" forge branch needs a target bed, and the other economy branch is
  gated on `!housePushing`, which never resets -- so **after a bed kill DS has no way back to the forge and no way to
  buy a sword**. It hunted the house across the whole map with a wooden sword for 40 s (170-209 s).
- 209.6-211.8 s: the house turned at its base with a wooden axe and DS killed it with the wooden sword (3 hits of
  ~2.44) for the FINAL KILL. It won with the starting kit, which is the point: it should not have had to.
- What went well: the crossing, the bridge fight, the bed break, and the final kill. What went badly: no re-gear
  after a respawn once their bed was gone -- two lives spent fighting an iron sword with a wooden one.

### What I changed

1. **The retreat costs two measured hits, not a flat 7.5 health** (SkyWars). The fight loop now records the largest
   drop in its own health in a step where the foe was in reach (`this.fightHp` / `this.hitSizeEst`), and the
   low-health retreat triggers at `2 x` that, capped at 11 (from 8). Round-5 hard-3 is the case: at 8.32 health with
   the house's crits costing 5.34, the old floor never fired and the next crit put DS at 3.98; the new floor is
   10.68 and the retreat opens before that exchange. Against cheap hits nothing changes (hard-2's 3.28 stays at the
   7.5 floor). The estimate is reset in `resetHouseClock`, so a new round starts from zero.
2. **Re-gear at home before hunting with the starting sword** (Bed Wars). A new `regear` condition joins the forge
   step: shop not wool-only, the foe farther than 26 blocks, my base within 26 blocks, and either the sword is still
   the starting one (damage < 5) or I am out of blocks with no iron. The shop step above then buys the stone sword
   (and the iron sword at 7 gold) from the iron the forge pays. This is round-5 normal-4's 129.2 s and 167.8 s: it
   covers the respawn after a bed kill, when `targetBed` is null and `housePushing` is stuck true.

What I deliberately did not change: the mid-structure descent in normal-2 (a foe 2 below is out of reach; DS paid
two hits and got the kill), the easy looting length (the pace is the profile's and the house cannot punish it), the
5.72-health re-engage at 114.7-123.8 s in normal-4 (with its own bed standing a death costs ~5 s and the kit, and
the fix above is what makes the *next* life count), and the shop's order (iron armour before the 3-gold apple).

Sources: [Minecraft Wiki - Hunger](https://minecraft.wiki/w/Hunger),
[Minecraft Wiki - Bed Wars tutorial (zh)](https://zh.minecraft.wiki/w/Tutorial:%E8%B5%B7%E5%BA%8A%E6%88%98%E4%BA%89),
[Hypixel - Overcoming Common Issues in Bedwars](https://hypixel.net/threads/overcoming-common-issues-in-bedwars-the-path-to-power.5946598/),
[MinecraftPatchs - Bedwars Guide](https://minecraftpatchs.com/minecraft-bedwars/).

### Verification (round 5)

`node check.mjs` -> `CHECK PASSED` after the measured-hit retreat, the Bed Wars re-gear, and the per-round reset.

## Round 6 reviews (2026-11-11): the easy loss, and the apple that decided it

Round 6 of 6: 3 won, 1 lost, 0 drawn. All four records show referee "(nothing)".

### skywars easy-1 (citadel/end_citadel), lost 81 s (killed 72.8 s)

- 0-48 s: both looted their own halves. DS took its starting chest (11 items, stone sword at 3.3 s), a 14-item chest
  at its side of the middle (30.6-36.6 s) and a 7-item chest (44.8-48.0 s); the house took 9, then 16 (31.7-43.7 s)
  and 14 (43.7-49.8 s) -- 39 items to DS's 32. The raised centre chests at y 32 ([6,32,-6] and [-6,32,-6]) are four
  blocks above the walk on this map and easy has no pillaring (HOUSE_SKILLS.easy.pillar is false): DS walked under
  them from 38.8 to 53.0 s at y 28 and could not open either, then held the middle until the house came.
- 53.6-58.4 s: the house abandoned its middle chest and walked at DS; DS walked at it. Both at 20 health, both with
  the iron axe.
- 58.4-63.2 s: the exchange. DS dealt 11.39 and took 15.34 (20 -> 4.66; the house 20 -> 8.61 at 63.2 s). Nothing
  was wrong with DS's swings: at easy both bots half-charge (swingAtCharge 0.5), so both hit for roughly 1.5-3.4 and
  the difference is armour and apples.
- 63.7-67.5 s: the decision, and it was an apple. At 63.7 s the house started a golden apple at **7.09 health** --
  the shared healIfNeeded eats at 8 health whatever the foe is doing, so it ate inside DS's reach -- and the
  Regeneration II that landed at 65.3 s carried it from 7.09 to **13.34** by 68 s while it kept eating. DS's own
  apple only started at **65.9 s** (the quiet-foe gate opened at 64.7 s: the house's last hit on DS was 63.2 s, and
  the brain tick took a second more), so its absorption and regeneration did not land until 67.5 s -- four seconds
  after the house's. DS hovered at 5.66 the whole time.
- 67.5-72.8 s: DS (5.22) against the house (8.67+4) was the rest of the race with DS a heal behind. The house hit
  it down 4.28, 4.29, 5.29 (regen), 4.43, 3.69, 1.91, 0.05 and the axe finished it at 72.4-72.8 s. DS never had a
  back-off spot (the fight was on the middle's narrow ground, `backOffSpot` returned nothing), so the retreat branch
  had no room to run to. The fight was decided before either was low: DS fought it from 20 health with no
  absorption, and the house's first apple went down first.

### skywars normal-2 (citadel/stone_keep), won 38 s

- DS looted its start (12), the middle chest (12, at 14.6 s), a chest of 8 (19.8 s) and drew an iron sword at
  23.0 s. The house drew its bow at 22.4 s; the arrow at 23.6 s missed (projectiles: arrow -> block).
- 28.3 s: they met (DS 16.3 health after the house's first axe hit, the house 14.67). DS's iron sword hit 4.6-5 a
  swing against the house's 3.5 axe; the exchange walked the house back over the platform edge and the hit at 28.8 s
  knocked it off (y 27.4, then 16.6, then -2.1): chat "HouseBot was knocked into the void by HouseBotDs" at 30.0 s.
  DS finished on 18.3.
- What went well: the sword before the meeting, the edge play, and not following the house off the platform. Nothing
  to change.

### skywars hard-3 (archipelago/sky_ruins), won 56 s

- DS looted 10 at its start, 12 at 4.4 s, 5 at 10.2 s (iron axe), then the 16-item chest at 15.4 s, which is the
  diamond sword. The house got a diamond sword at 17.0 s too but lost it: at 19.6 s it pearled down to y 20 and fell
  (ender pearl back to land at 20.1 s, 20 -> 16 health); at 27.1 s it was back on an iron axe.
- DS threw snowballs through the approach and fight (projectiles: hits at 17.9, 28.5, 30.8, 33.3 and 41.8 s). The
  house's arrows hit at 31.6 and 37.0 s (DS 20 -> 18.16 -> 13.7).
- 41.4-47.8 s: the fight. DS ate an apple at ~39.3 s (absorption shows at 40.9 s) before the blows -- the existing
  "eat at 15 health with the foe far" branch -- and its diamond-sword crits took 3.3-5.0 a swing while the house's
  iron axe took about 1.6-1.9 from DS. The house ate at 43.6 s (7.13 health) and 47.4 s (2.25+4); DS drove it to
  1.25 at 46.9 s, it pearled at 46.3 s and fell to the void at 48.0 s (hp 0+4 at the spawn sentinel). Chat 47.8 s:
  "HouseBot was slain by HouseBotDs".
- What went well: the 16-item chest (the diamond sword won the damage exchange), the pre-fight apple (already the
  health<=15 branch), and keeping the edge behind the house. The round-6 pre-arm changes only move that apple
  earlier.

### bedwars normal-4 (standard), won 124 s

- 0-55.6 s: both farmed. The house stocked 48 blocks and left at 26.3 s "bridging to destroy blue bed"; DS bought
  the stone sword (23.7 s) and the iron sword (42.8 s) at its forge and did not leave until 55.6 s. The house's
  bridge reached z 22.8 (24 blocks short of DS's blue bed at z 47) and turned back at 57.2 s, so DS's slow start
  cost nothing.
- 55.6-103.8 s: DS crossed the map (bridge from z 47 to -38) and met the house near its red bed at 85.8 s. The
  house had only a wooden sword; DS (iron sword) traded 20 -> 8.6 and killed it at 103.8 s, then broke the red bed
  at 107.2 s.
- 109.1-114.3 s: the house respawned with the starting kit, took an iron sword at 110.7 s, hit DS 8.6 -> 4.28 at
  ~112.0 s, then bridged for blue bed and fell into the void at 114.4 s (chat: "HouseBot was knocked into the void
  by HouseBotDs. FINAL KILL").
- What went well: the economy (the iron sword was ready before the interception), the kill, the bed break, and
  surviving on 4.28. Nothing to change: the round-5 re-gear branch was not needed because DS never died.

### What I changed

1. **A golden apple before the blows, at range** (SkyWars, all difficulties). In `brainSkyWars`, when a foe is
   within 12 blocks (past the throw branch and past the melee engage), DS has no absorption, more than 14 health and
   an apple, it eats the apple now: the 1.6 s costs no swings because neither of us is in reach, and the 4
   absorption and 4 regeneration are on the bar at the first blow. Round-6 easy-1 is this loss exactly: the house's
   first apple at 63.7 s (7.09 health, from the shared healIfNeeded, which has no foe check) out-sustained DS from
   8.61 to 13.34 while DS's first apple could not land until 67.5 s. An apple eaten at 20 health in the 9-12 block
   window is the same effect, earned before the trade, and it denies the house its 8-health window.
2. **The same, one exchange earlier at easy.** In `engageTactics`' pre-fight chain (the foe is already inside 8
   blocks, so the fight has started): at easy only (`skills.swingAtCharge < 1`), with no absorption, more than 15
   health and the foe 4.5+ blocks off, eat the apple before closing. Half-charged hits are 1.5-3.4, so the 1.6 s
   costs two or three of them -- less than the 8 effective health it adds -- and the bar it starts from is the
   difference between the house's 8-health apple winning the race and DS's arriving after it. This is the same
   trade the house already makes inside reach; it is restricted to the difficulty where hits are small.

What I deliberately did not change:

- **The y-32 middle chests in end_citadel** (easy-1): four blocks above the walk, and easy has no pillaring. DS's
  38.8-53.0 s of retries bought nothing, but those were the blocks it had to walk to reach the middle anyway, and
  both bots looted every chest they could open. A skip rule would save seconds, not the fight.
- **The fight itself**: the retreat branch did fire at 4.66 health (the measured-hit floor was 7.5), but
  `backOffSpot` found no ground with room behind on the middle's narrow top, so it had to keep fighting. With
  absorption from the pre-arm it does not get to 4.66 in the first place.
- **Bed Wars**: no change this round; the round-5 re-gear was not exercised (DS never died) and the iron sword was
  bought before the only fight that mattered.

Sources: [Minecraft Wiki - Golden Apple](https://minecraft.wiki/w/Golden_Apple) (1.6 s to eat; Absorption I for
4 HP; Regeneration II for 5 s), [Minecraft Wiki - Tutorial: PvP (Java Edition)](https://minecraft.wiki/w/Tutorial:PvP_(Java_Edition)),
[CubeCraft - The Golden Apple Guide](https://www.cubecraft.net/threads/the-golden-apple-guide.191656/) (eat the
apple before the fight; a second apple resets the buffer rather than stacking),
[Minecraft Wiki - Hunger](https://minecraft.wiki/w/Hunger).

### Verification (round 6)

`node check.mjs` -> `CHECK PASSED` after both pre-fight apple branches.
