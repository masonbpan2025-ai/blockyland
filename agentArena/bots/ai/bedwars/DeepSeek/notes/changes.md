# What I changed, and why

The task was to make `bot/` win five-team Bed Wars. The starting bot was the scripted duel bot: a defender who
covers the bed, a collector who runs the diamond islands, and two rushers who bridge to the nearest enemy bed.
Every part of that is wrong for this mode, for one of the reasons in `notes/plan.md`:

- **A bed rush is worth almost nothing**: every bed is destroyed by the clock at 60% of the limit. Breaking one
  earlier only pays off if the whole team is then wiped out before 6:00, which is much harder than it sounds.
- **A collector cannot spend a diamond**: buying needs one of our own shopkeepers within 6 blocks, so anything
  picked up at the middle or a diamond island has to be carried home through the middle of the game.
- **A defender cannot save the bed**: what actually kills teams is the closing zone, and the zone is decided on
  the middle island. A player standing at the base at 9:00 is swallowed there.

## The changes

### `bot/scriptedBot/playbooks/bedwars.mjs` -- rewritten

The new plan, in the playbook's tick order:

1. **Lobby team choice** -- unchanged (joins the emptiest team).
2. **An intruder at my bed while it stands** -- met by whoever is home. With the whole squad still at the base
   through the first half of the game this is rarely needed, but a rush that arrives early meets four players.
3. **A foe within 9 blocks** -- fought. After the zone starts, only if the foe is inside the circle or within 5
   blocks: no chasing into the closing void.
4. **The zone** -- if I am near the shrinking border, below the rising void line, or being counted in the void,
   walk back to the middle at once.
5. **An enemy bed in reach** -- broken (only before Bed Destruction, since after it the beds are gone anyway).
6. **At home** -- buy, farm the forge, and leave exactly when the clock and the gear agree. The buy order is:
   wool for the whole crossing (`voidCellsToward(middle) + 12`), stone sword, iron sword, chainmail, two golden
   apples each, iron armour. Nothing else: no tools, no diamond runs, no bed cover.
7. **On the middle** -- hold a post a couple of blocks from the centre (one per player by slot), face the nearest
   foe. Nothing pulls us off the island.
8. **Between** -- cross; if out of blocks over the void, walk back to the forge and re-gear instead of standing
   at the edge.

The departure time is `0.42 * timeLimit` once the crossing's blocks are in hand (`0.52 * timeLimit` at the
latest, and only with a sword): early enough to be standing on the middle before the zone starts at 60%, late
enough to have the whole kit. All four leave on the same threshold, so they arrive as a squad.

Two details that took the most care:

- **The middle is not always at the base's height.** High Middle and Archipelago put it 3-6 blocks up, and the
  base bot's bridger deliberately flattens a target whose ground is air -- so it will not stair up a cliff, and
  the island's side blocks a flat bridge. `travelToMiddle` therefore probes the actual island edge along the
  line back to the base (`skills.groundAt`), and when it arrives below the top it builds its own step outward
  and climbs it, one block a tick, then walks back in over the steps. The target is a point *inside* the
  island (the hold post), not the rim: aiming at the rim stops the walk one `stopWithin` short of the ground.
- **"On the middle" is a ground test, not a distance guess.** `onMiddle` requires the island under our feet
  and a distance inside the plan radius; a bridge of our own at the same height also has ground below it, so
  the radius test is what stops a bot that is still short of the island from thinking it has arrived.

### `bot/scriptedBot/skills.mjs` -- two new senses

- `arenaMiddle()`: the middle island's centre, standing height and radius, from the host's plan
  (`bedwarsArena.midY`/`midRadius`; the layouts always put the middle at the world origin).
- `arenaIslands()`: the round's islands, for anything that wants them later.

Both are read-only questions over the session's own state, like the base's geometry the playbook already used.

### Kept

`ScriptedBotSession`, `createBotSkills`, `PLAYBOOKS`, `BOT_SKILLS` and the difficulty profiles are untouched
(`check.mjs` compares them with the repository's), as are the exported helpers `teamRole`, `rushPartners`,
`flankVia` and `bedCover`.

## Tests

`tests/middlePlan.test.mjs` (run with `node test.mjs`):

- the playbook ticks at every stage of the clock (5 s, 1:00, 2:30, 3:20, 4:10, 5:30, 7:00, 8:40, 11:40) on three
  recorded rounds, and must not throw or hang;
- `teamRole` gives the four-player split in name order and `solo` alone;
- `bedCover` still returns the eight cells that cover both halves without covering the bed.

## Round 2 (after the arena changed): the clock, the blocks and the sealed bed

Two frozen games were played under the new rules: **practice/2 (highmid) -- our squad won** (Blue Team won Bed
Wars at 331 s, with DeepSeek1/2/4 taking the last four final kills), and practice/3 (archipelago), where the host
dropped every player at 217.9 s and the result says nothing about any bot.

Reading practice/2's timeline turned up two real faults that the win hid:

1. **The round was being read as 10 minutes.** Our four players were still at the forge at 198 s and only
   crossed at ~300 s -- in a 6:00 game whose beds die at 3:36 and whose zone starts at 3:36. `view.rules.timeLimit`
   was not there, and the code fell back to 600, so `leaveAt` was 4:12 instead of 2:31. Every phase of the plan is
   a fraction of the limit, so this one fallback moved the whole game.
   **Fix**: `timeLimitOf()` derives the limit from, in order: `rules.timeLimit`; the next scheduled event when it
   is one defined as a fraction of the round (Bed Destruction 60%, Sudden Death 80%); `timeLeft + elapsed`;
   `zone.closedAt / 0.9`; and only then the arena's 600 s default.
2. **Two players reached the middle with no blocks left.** DeepSeek2 sat at (2.1, 31, -8.1) -- the foot of a
   High Middle island whose top is 33-34 -- from 3:31 to the end, "crossing to the middle", with an empty pack;
   DeepSeek1 turned back at 3:05 with "out of blocks". The crossing budget had only 12 blocks of margin.
   **Fix**: the margin is 20 (`need = voidCellsToward(middle) + 20`, floor 24), which covers the 6-block
   stair/pillar at a raised middle and a fight that costs a few; and the "out of blocks, go home" fallback is now
   disabled once the zone exists -- walking away from the middle at that point is only a longer death.

Two smaller changes in answer to the new rules:

3. **The bed is sealed in end stone before the squad leaves** (`skills.placeOf`, new, and a step in the home
   branch for the anchorman). Wool is 1.2 s a block by hand but end stone is 15 s without a pickaxe, and the
   frozen game lost its bed at 198 s -- 18 s before Bed Destruction would have destroyed it anyway. That only
   matters if one of ours dies in the window between leaving (now 2:31) and Bed Destruction (3:36), but it costs
   24 iron out of an income of ~100 and the 8 placements are cheap. The seal is bought only once, from the forge
   (within 6 blocks of the shopkeeper), and placed one cell a tick from 3 blocks away; the cells come from the
   same `bedCover` the old duel playbook used.
4. **`placeOf(at, block)`** was added to the skills so the seal really is end stone: `placeBlockAt` with no
   preference takes the first placeable stack, which would have been the crossing wool.

Nothing else changed: the doctrine (gear at home, cross as a squad at 42% of the limit, hold the middle) won its
game and is untouched, and the departure fractions were chosen for exactly the timeline the round-length fix
now restores.

## Verification

- `node check.mjs`: **CHECK PASSED** (120 recorded Bed Wars rounds played) after every edit.
- `node test.mjs`: 3/3 passing.
- Round 2: `node practice.mjs archipelago 424242 4` -- **our team won** (Yellow Team won Bed Wars at 326 s). The
  live strategy log shows both fixes working: the anchorman sealed the bed in end stone at 198.9 s and the
  squad's crossing began at 203.9 s -- before the zone starts (216 s in a 6:00 game), where the frozen bot had
  only left at ~300 s.
- **The win exposed the next fault, and it is the one to fix first.** Three of our four were *swallowed by the
  closing void*: DeepSeek3 at 225.9 s (ten seconds after the zone started), DeepSeek2 at 258.6 s, DeepSeek4 at
  310.9 s. Only DeepSeek1 lived to take the last two final kills. The cause is the same late departure: the
  crossing took ~58 s on Archipelago, so the squad met the closing border on the bridge. `mayLeave` waits for
  the *whole* crossing's blocks, and even with `need = voidCellsToward + 20` that shopping list was only complete
  at ~199 s.
  What I would change next, in order: (a) leave at 42% of the limit with *most* of the crossing's blocks rather
  than all of them, and buy the rest on a second trip only if the first finds a foe-free route; (b) measure the
  forge's real income with the four-player split -- the departure timing suggests each player is not receiving
  the whole pile as `collect()`'s split implies, and if so the shop order should buy fewer iron-heavy things
  before the crossing; (c) start the crossing earlier on the layouts with a long base-to-middle gap, since the
  zone notice at 60% leaves no slack for a 58 s bridge.
- `node practice.mjs archipelago 7 4` was requested for a real five-team game. The arena never finished it in
  the time available (its recording stops at ~53 s of game time and the result file was never written, both
  before and after the final edits), so there is no practice summary to report. This is the one thing I would
  do next: the plan is reasoned from the rules and the engine's movement code, not from a finished five-team
  game, and a first practice result may well want the departure time or the gear list tuned.
