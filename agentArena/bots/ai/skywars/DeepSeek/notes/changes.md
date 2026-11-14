# What changed, and why

The bot starts as a copy of the scripted bot, which was tuned for duels. The task is a five-player
free-for-all on unseen maps, so the playbook (`bot/scriptedBot/playbooks/skywars.mjs`) is the one
file I rewrote; the skills, the fight, the looting, the movement and the bridging are the game's
own and are untouched, so every referee limit (reach, recharge, speeds, brain pace, bridge pause)
still holds.

## The old order

`home chests -> the middle -> "the other player"` (the nearest other spawn). That is a duel plan:
it assumes exactly one opponent, one centre worth taking, and no reason to care where anyone else
is. In a free-for-all it is wrong in four ways:

- it loots only until armed, then leaves blocks behind on its own island;
- it treats every chest as reachable and walks at the middle from wherever it stands;
- it ignores fights it is not already in and ignores wounded players;
- when it runs out of things to do it still walks at "the other player" across the void.

## What the new playbook does

1. **Reads the map from the round, not from a template.** Every chest is tagged with its island in
   `view.objectives`: `slot` for a spawn's chests, `ring: 'center'` for the middle, `ring: 'mid'`
   (or `'sector'`) for connector/sector/sub-mid chests. `view.places` carries all eight spawns and
   the middle. The distances between them and the `voidCellsToward` measurement are enough to know
   the shape of any of the eight map kinds, including maps with several heights and more than one
   middle. Nothing names a map.

2. **A block budget on every crossing.** A chest across the void is only targeted when
   `carrying.blocks >= voidCellsToward(chest) + reserve`, with `reserve = max(6, 0.4 * the void
   cells)`. The reserve covers the corner blocks a diagonal one-wide bridge also lays and the
   blocks needed to arrive with a hand that is not empty. Practice 2 lost the round this way: the
   bot had 16 blocks, the straight line to the middle crossed 22 void cells, and it spent everything
   to stop four blocks short, on a bridge tip, with no way forward or back.

3. **Routes through connector islands.** Among the reachable middle/connector chests, the target is
   the one with the *cheapest crossing*, not the one that is nearest in a straight line. On maps
   with connector or sector islands this picks the connector on my side (a short hop, and a chest
   that refills blocks) before it picks the middle; on maps without connectors it picks the middle
   directly. This is what makes the map's own layout choose the route.

4. **Finishes its own island first.** While I am still standing on my spawn and any chest there is
   unlooted and reachable, that chest is the target, even if a middle chest was already chosen.
   A spawn island's chests hold two to four stacks of 8-16 blocks *in total* (`ref/skywars-loot.js`),
   so leaving one behind can mean a crossing I cannot afford. Looting the last chest costs about a
   second and is worth much more than being first at the middle with half a bridge's blocks.

5. **Commits to one chest.** The chosen chest is remembered (`skyChestTarget`: key + time) for up to
   35 s, and while committed only the hard limit (the void cells between me and it now exceed my
   blocks) drops it. Previously the "nearest reachable" was re-picked every 300 ms tick; as the bot
   took a step, the void count changed by a cell or two and the choice flipped between a north
   connector, a middle chest and the east connector. In practice 1 this made the bot pace on its
   spawn; in practice 2 it made it veer east away from its route and waste the budget. Now a
   marginal recount cannot change the plan.

6. **Fights the fight it is in, then picks targets by value.** A foe inside 6 blocks is answered
   immediately. At 6-12 blocks it is answered when it is hurt (a kill and a placement) or when I
   clearly out-gear it *and* its ground is walkable or the crossing is affordable (`fight` does not
   bridge, so a "chase" across the void just walks to the edge). When choosing whom to hunt: a
   wounded foe within reach is preferred over the nearest healthy one.

7. **Never bridges with a foe inside 10 blocks.** If the next chest needs a bridge and a foe is
   close, the foe is dealt with first. A fight on a one-wide bridge is lost to a snowball; a fight
   begun while bridging is lost to the void.

8. **No freezing on a bridge tip.** The hunt and "go to another spawn" fallbacks are gated by the
   same budget: a foe or island across the void is only walked at when the crossing is affordable.
   If nothing is reachable, the bot walks back to its own solid island (`mySpawn`, else the last
   wide ground it stood on) instead of standing at the end of its bridge. In practice 2 the bot stood
   at (4.3, 31, 10.3) from 17 s to 57 s because `goTo` with `bridge: false` walked it to the edge
   every tick; a single egg from Scripted4 then knocked it into the void. That is now impossible:
   either it can afford the crossing and takes it, or it goes back to the island.

9. **Keeps looting the middle and refills, and hunts when there is nothing left.** Middle chests
   refill at 3:00 and 6:00 (the session clears its looted keys), so the same rule loots them again.
   When all reachable chests are taken, it hunts the best visible foe; if none is visible it walks
   at the nearest other spawn when it can afford to; when it cannot afford anything it holds wide
   ground. Other players' spawn chests are only raided when strong, after 2:30, or when only two
   players are left, because a contested far island is usually a worse trade than the middle.

## Tests and practice

- `node check.mjs` passes: the exports are unchanged, no referee limit is touched, and the 120
  recorded fake rounds play without an error.
- `node test.mjs` passes: across five recorded seeds it asserts the view names every spawn and the
  middle in `places` and tags every chest with its island (`slot` / `ring`), which is exactly what
  the playbook routes on without knowing the template.
- Practice 1 (classic, seed 7, 4 bots): 3rd at 22.5 s -- exposed the chest-target thrash and the
  premature raid on another spawn; fixed with the commitment and the late-raid gate.
- Practice 2 (archipelago, seed 21, 4 bots): 2nd at 59.3 s, one kill (knocked Scripted2 into the
  void). Exposed the budget/route bug (straight at the middle instead of via a connector) and the
  40-second bridge-tip freeze; fixed with the reserve, the cheapest-crossing route, home-first
  looting, the commitment relaxation and the fall-back-to-solid-ground rule.
- Practice 3 (tiers, seed 31, 4 bots) was queued when the arena's turn ran out; the fixes above
  were made after practice 2 from its timeline (`practice/2/timeline.txt`), and the check was run
  again after every edit. The remaining known risk is a map whose cheapest crossing still costs
  more than a fully looted spawn island: the bot now takes the cheapest crossing it can just afford
  (every middle/connector chest holds a block stack to refill from) rather than idling, and if the
  bridge runs short it walks back to its island instead of standing at the tip.
