# Plan: winning five-team Bed Wars (4v4v4v4v4, hard)

## What the five-team game actually is

Five bases (Red, Blue, Green, Yellow, Aqua) evenly on a ring round the middle; our team's colour changes
every game, so everything is read from `me.team` and `landmarks`/the view each round. Four of us (DeepSeek1-4)
are the same bot; the other four teams are Opus, Sol, Gemini and the unchanged scripted squad.

The two facts that decide the game:

- **Every bed is destroyed at 6:00** (60% of the 10-minute limit), whether or not anyone touched it. After
  6:00 every death is final. A bed broken before 6:00 only pays off if the whole team is then wiped out --
  and the wipe itself is the hard part. **Rushing beds is therefore close to worthless in this mode.**
- **The zone closes 6:00 -> 9:00** to a circle of ~9 blocks round the middle, with the void rising to just
  under the tops of the islands in it. Outside the border, below the void line, or standing on your own
  blocks with the map's island over your head = in the void; 10 seconds all told and you are out for good.
  **The game is decided on top of the middle island.** Teams that are elsewhere at 9:00 are swallowed.

Scoring is by outlasting, so the minimum goal is to be alive at 10:00; the win needs everyone else gone.

## The doctrine: gear at home, then hold the middle

### Phase 1 -- the economy, at home (0:00 -> ~52% of the limit: 5:12)

All four stay on our island and farm the forge together. The host's forge split means teammates standing
near the generator share the pile, so four of us at the forge multiply our income.

Buy order (each player, individually):
1. **Wool** until we carry the blocks for the whole crossing: `voidCellsToward(middle) + 12`, at least 16.
2. **Stone sword** (10 iron) once there are blocks to go with it.
3. **Chainmail armour** (24 iron) -- permanent, kept through death.
4. **Iron sword** (7 gold).
5. **Golden apples**, two each (3 gold) -- 8 absorption + Regeneration II is the real endgame health pool.
6. **Iron armour** (12 gold) with whatever gold is left.

No tools, no pickaxe, no axe, no diamond runs: iron is the currency of the middle, and nothing at a
shopkeeper can be bought once we leave the island.

Staying home this long is deliberate. It is the safest place in the first minutes (four of us answer any
early rush with numbers), our gear is complete before we ever meet anyone, and the middle has no value
until the zone starts closing at 6:00 -- the emerald generators cannot even be spent without a trip home.
We leave at ~5:12 (forced by 5:48, i.e. before the beds die) so we are standing on the middle before the
zone starts to close.

### Phase 2 -- the crossing

All four cross at the same clock threshold, so we arrive as a squad. The route is the straight line to the
middle, bridged block by block; the walk stairs itself up the last blocks and, where the middle is 4-6
blocks above the bases (High Middle, Archipelago), we pillar up the last few blocks at the rim one block a
step (place under the feet, step up) rather than trying to walk through the island's cliff. The target is
the rim cell on our side, not the island centre: the stair/pillar has to be finished before the wall.

This is a heading, not a script: the rim is found by probing `skills.groundAt` along the line from the
middle towards us, so it works on any seed.

### Phase 3 -- hold the middle (5:12 -> 6:00)

Four of us on the island, within a couple of blocks of the centre. Anyone who comes to the middle is met
by the nearest of us and focus-fired. Nothing pulls us off the island: a fight is only taken up when the
foe is close or is himself inside the zone.

### Phase 4 -- Bed Destruction and the closing zone (6:00 -> 9:00)

- Never leave the middle. A foe outside the border is not chased: the void will do the work.
- The zone walk pulls us back to the centre whenever we are near the shrinking border, below the rising
  void line, or being counted in the void.
- Fights are taken only inside the circle; we keep off the rim (the edge sense, `holdGroundAgainst` and
  the safer-spot step already in the base bot) and let enemies bridge into us.
- We do not build a roof: the rules only forgive the map's own island, but we also gain nothing from one.
  We do not pillar up: the reach model favours the lower fighter.

### Phase 5 -- the last minute (9:00 -> 10:00)

Everyone else is either already swallowed or on the island with us. We fight 4vX with the better gear and
the numbers; the last team standing wins. If more than one team is still up at 10:00 the place is shared.

## Roles

In this mode the four players do the same job -- that is the point. Their only differentiation is the
hold post they take on the middle (four points a couple of blocks round the centre), so the squad covers
every approach without stacking on one cell. The old defender/collector/rusher split belongs to a duel:
a defender cannot save a bed that is destroyed by the clock, a collector cannot spend an emerald away
from the shop, and rushers spend the crossing twice for nothing.

## The other teams

- We expect every squad to be near its own base until the middle matters, and to contest the middle from
  ~6:00. Our edge is arriving as four, armed and fed, before the zone starts, and never crossing again
  afterwards.
- The teams that rush beds early are the ones we are happy to leave alone: they spend the first minutes
  crossing, break a bed that would have died at 6:00 anyway, and then have to cross back to the middle
  while the zone closes.
- The dangerous case is another team with four alive on the middle. Against it we hold the centre, fight
  the nearest, keep the void behind them, and use the apples before the blows.

## Risks and answers

## The digging rule (current arena)

Since the arena changed, digging takes Java's time and each `breakBlockAt` call digs on until the block breaks
(calling something else restarts it). Wool is 1.2 s by hand, end stone 15 s without a pickaxe, a bed 0.3 s. That
does not make bed rushing any more attractive -- the beds still die at 6:00 -- but it makes our own bed cheap to
protect: eight end-stone cells round it cost 24 iron, and a rusher without a pickaxe cannot open one of them
before Bed Destruction. The anchorman seals the bed on the way out; nobody carries tools, because nothing in
this plan digs an enemy block.

| Risk | Answer |
| --- | --- |
| Falling in the void on the crossing | bridge only with blocks in hand; stop at the edge when out; the walk never steps into air |
| The middle higher than the base (highmid, archipelago) | probe the rim, pillar the last blocks, then walk in |
| A respawn after a pre-6:00 death | re-gear at the forge (the shop step runs whenever we are home) and cross again |
| Being pulled off the island chasing | fights after the zone starts only on foes inside the circle |
| Meeting a squad on the bridge | hold wide ground against bridge-crossers, knock them in; do not walk out |
