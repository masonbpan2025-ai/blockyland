# What I changed, and why

All the game's limits are untouched (BOT_SKILLS, profiles, reach, recharge, damage); `node check.mjs` passes.

## `bot/scriptedBot/playbooks/skywars.mjs` -- rewritten (the strategy)
The scripted playbook was a duel playbook for the Classic Ring. The new one reads every map from the view each tick.

- **Chests by value / cost, any map.** My island's 3 chests first. Then every unlooted chest is scored:
  value `center` 3, `mid`/`sector` 2.2, my own (after a refill) 1.6, an empty or dead player's island 1.0 (an island whose
  owner is alive is skipped). Cost: distance + 2.5 x void cells to bridge + 2 x height difference + danger. A chest with
  a foe within 8 is skipped; foes within 16 add cost. Chests I lack blocks to bridge to are skipped. This finds the
  connector/sector/sub-mid islands as well as the middle, whatever the template. Late in the game (5:30+), far
  low-value chests are ignored. Refills clear `looted`, so the bot goes back for them on its own.
- **Chests at another height.** The old bot stood 190 s above a chest 3 blocks below it on Sky Tiers (practice 1). Now:
  a chest 2.5+ below and close -> `climbDown` (safe drop, never into the void); 2.5+ above and close -> pillar up a block
  at a time (new skill `pillarUp`, the fight's own pillar). A chest that cannot be opened from close by after 7 tries,
  or a walk that makes no progress for 5 ticks, is blacklisted for 25-40 s, and the bot unsticks.
- **Free-for-all fighting.**
  - A foe within 5.5 blocks, or one who hit me in the last 1.5 s, is fought; among several close ones, the one not busy
    with someone else (he is coming for me).
  - Two or more on me, at 10 health or less with a heal: back out of the crowd (away from their centre) and heal.
  - **Third party:** the nearest foe busy fighting another foe (within 4.5 of each other) and up to 14 blocks off ->
    keep out of reach (back off when nearer than 7.5), shoot / throw at them, wait up to 14 s. When the alive count drops,
    a 9 s "cleanup" window attacks the (hurt) survivor within 16 blocks.
  - **Narrow ground:** a foe 4.5-10 away while I am not on an island's inside -> step to the nearest cell with ground
    on all 8 sides first (practice 2: knocked off a radius-3 stepping island at full health).
- **When to hunt.** Last two alive: at once (with a weapon). Otherwise from 4:30 if geared (sword 5+, armour 4+ points)
  and at 14+ health, and from 6:30 regardless (the games last 8:00; each player outlasted is a point). The target is
  chosen by cost: distance, void to bridge, height, their visible gear (armour worn, weapon held), with a bonus for a foe
  on narrow ground or busy with someone else. The hunt walks/bridges at my own height to their *live* position and
  hands over to the fight within 9 blocks; the bow is used on the way at 12-30 blocks. Nobody in sight: a live player's
  spawn.
- **Holding.** Nothing to loot and not time to hunt: stay on wide ground (back to my island or the `middle` place,
  whichever is nearer *and has ground* -- the old bot walked to (0.5, 31, 0.5), which is the void on Twin Peaks),
  facing the nearest foe, shooting anyone 12-30 blocks off.

## `bot/scriptedBot/skills.mjs` -- new skills
`hurtAgo`, `islandSpot`, `armorPoints`, `position`, `hasBow`, `drawing`, `pillarUp`.

## Tests
- `tests/playbook.test.mjs`: plays the recorded rounds through the playbook, prints what it chose.
- `tests/viewDump.mjs`: prints a view's objectives and places (how I learned the tags: `ring`, `slot`, `middle`).

## Practice
1. tiers 3, old bot: stuck 190 s by a chest 3 blocks below; knocked off at 265 s (outlasted 1).
2. tiers 3, new bot: looted 9 chests in 50 s (diamond sword, golden apple), then knocked off a small high stepping
   island at full health -> the narrow-ground rule and the bigger danger radius around chests.
3. archipelago 11, new bot (narrow-ground rule in): knocked Scripted2 into the void, then lost the final duel to
   Scripted3 in the small middle with only a stone sword -> **2nd of 5** (outlasted 3). The game was over 50 s into
   play: every bot rushed the middle. So the middle's chests are now worth less (1.8, not 3) in the first 60 s unless
   I am geared; nearer connector/side chests come first. (Not yet played in a practice game.)

## Known weaknesses left
- Knock-back into the void is still how it dies. The fight's own retreat to heal (base `backOffSpot`) can back toward
  a small island's rim.
- Hunting walks at my own height. A target far above or below is reached only by the fight's climb-down and pillar
  near them.
