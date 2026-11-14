# Plan: a SkyWars bot for unseen maps, 5-player free-for-all

## What changes from map to map
- **Layout**: ring radius (21-34), one middle (classic, citadel, rush), a small middle plus connector/sector/sub-mid
  islands (archipelago, sectors, sub_mids), two middles at different heights and *nothing at 0,0* (twin_peaks), a tower
  with chests six blocks up a staircase (tiers), ready-made one-wide bridges (rush).
- **Heights**: spawns may sit 1-3 below the middle (citadel), side islands +-2/3 (archipelago, tiers, sub_mids), peaks
  +-4..6 (twin_peaks). The walk never builds upward far from a target, so a target at another height must be reached by
  walking/stairs near it, or bridged at my own height and then climbed.
- **Chests**: always 3 on my spawn island (`slot` = mine, `ring: 'island'`); others are `ring: 'center'` (best loot) or
  `ring: 'mid'` (connector/sector/sub-mid islands: one or two chests, middle-grade loot). The view lists every chest of
  the map from the first tick, with `looted` (cleared by every refill, at 3:00 and 6:00).
- **Dangers**: the void everywhere (falling below y=-4 kills), narrow bridges (knock-back), height drops (fall damage),
  arrows and snowballs while bridging, being caught between two players.

## What the scripted bot gets wrong on these maps and in a 5-way game
- It "holds the middle" at (0.5, 31, 0.5) whatever the map: on twin_peaks that is the void.
- It picks middle chests only by `ring`, nearest first, regardless of how much void/height lies between, or who stands
  there; `mid` and `center` are worth the same to it.
- It fights the *nearest* player, always, from 3:20 on -- including walking into a fight two others are having, where
  the winner (or both) turn on it.
- It hunts a spawn island where nobody may be (every player's live position is known).

## Strategy
1. **Loot home first** (3 chests: armour, sword, blocks) -- safe, nobody else has a reason to be there.
2. **Then the best reachable chest by value / cost**: value center 3 > mid 2 > a dead player's island 1; cost is the
   walk plus the void to bridge (x2) plus the climb; skip a chest with a foe standing near it, or one I lack blocks to
   bridge to. Side islands are usually closer and emptier than the middle, where the scripted bots all converge.
3. **Re-loot after refills** when cheap (home chests, then the rest by the same score).
4. **Free-for-all fighting**:
   - Answer any foe in reach, or one who has just hit me (never be a free punching bag).
   - **Third party**: two foes fighting each other near me -> I stay out of reach on wide ground, throw/shoot at them
     (knock-back near edges), and only go in when one is down: the survivor is hurt, the kill is cheap.
   - Choose the target by cost and weakness (armour seen on them, weapon in hand, on narrow ground), not by distance alone.
   - Low on health with two foes close: back off away from both to heal.
5. **When to hunt**: alone with one foe -> hunt once looted; otherwise from about 4:30 when geared and healthy, and from
   6:30 regardless (each player outlasted is a point; a tie at 8:00 is shared). Hunting goes to the foe's *live*
   position, bridging at my own height, then the fight's own code takes over within 8 blocks.
6. **Holding** (nothing to loot, not time to hunt): wide ground (island interior) near where I am -- not the void at
   0,0 -- facing the nearest foe; the scripted bots come to me over narrow bridges, where the hard bridge defence and
   snowballs win.
7. **Unstuck**: if a walk makes no progress for several ticks, unstick, and blacklist that chest for a while.

## Testing
`tests/` with recorded-round fakes for crash-safety; practice games on several templates with 4 scripted bots.
