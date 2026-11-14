# Implementation changes

Sol keeps the scripted session's legal combat, difficulty profiles, reaction delay, reach, weapon recharge, movement speeds, brain interval, and building pauses.

- Replaced the duel-oriented SkyWars playbook with five-player decisions: immediate attackers, wounded isolated targets, contested-chest costs, broad-ground retreats that still counterattack, pre-contact apples, useful safe death drops, and survivor searches that remember visited spawns.
- Added observed-terrain A* navigation, bridge-budget estimates, and routes through actual public island/middle landmarks. No origin, spawn direction, middle count, or fixed surface height is assumed. Verified one-block ascents cross the generic edge buffer as a short ordinary step, preventing intermittent stalls at a raised shore. Nearby completed waypoints are excluded to prevent circling.
- Walks around walls and through stairs, bridges with the existing builder, pillars only when the difficulty permits, and descends with the guest's existing gravity and checked landing/damage rules. Descent can be bounded by the target height.
- Loots reachable upgrades before entering an avoidable contest; leaves spawn once minimally equipped; avoids distant home resupply after spending bridge blocks; temporarily skips objectives that make no progress.
- On exposed bridges near enemies, seeks reachable broad ground; otherwise builds an adjacent backstop one block at a time with the ordinary placement pause. This uses hard difficulty bridge defence and the existing placement API. Preserves rescue pearls during a free-for-all, changes melee target when another opponent is already in reach, and stops pursuing falling victims. Strategic bow shots require a clear line through the observed world.
- When boxed in by solid walls during play, opens a doorway with the normal timed digging API, without digging the floor or containers. This handles cages whose lower walls remain on raised/lowered maps. Resets navigation, visited places, and skipped objectives between rounds.

## Verification

`node check.mjs` has passed after every implementation edit batch (120 supplied recorded rounds, unchanged difficulty/profile checks and import checks).

The final suite contains 53 tests. Route generation covers 24 maps (all eight templates at three seeds, four spawn slots per map). Tests cover the eight map families, multiple spawn slots, walls and doors, stairs, bridge budgets, raised/lower islands, split middles, group target selection, contested upgrades, healing, low supplies, blocked shots, and waypoint completion. Movement integration tests use the actual paced guest walker and gravity; a generated Archipelago replay verifies leaving the decorated middle for a raised connector.

## Practice review (four scripted opponents in every game)

1. Classic, seed 7, spawn slot 0: eliminated first at 16.1 seconds. The initial version retreated instead of opening a reachable middle chest and took damage without answering. This led to reachable-upgrade priority, counterattacks during retreats, and faster opening equipment thresholds. Referee: nothing.
2. Archipelago, seed 23, spawn slot 1: outlasted three opponents, remained at full health in the final two, then the record reports Sol leaving the world at 205.6 seconds. This is a loss, not a win. The pursuit exposed repeated completed-waypoint selection and excessive shooting at a survivor twelve blocks below; both now have fixes and regression coverage. Referee: nothing.
3. Twin Peaks, seed 41, spawn slot 2: killed Scripted4 at 32.5 seconds, then fell to the last knockback at 35.6 seconds while healthy (fourth place). The remaining players eventually drew. This led to combat edge correction searching connected interior ground up to three blocks away and requiring three blocks of knockback room. Referee: nothing.
4. Tiers, seed 67, spawn slot 3: eliminated first at 33.5 seconds after fighting a middle defender from a narrow raised bridge. This prompted bridge-specific cover: retreat along reachable existing ground, counterattack, or build a paced backstop when no island escape exists. Referee: nothing. The final bridge-cover change was tested in synthetic worlds after this practice and was not replayed in a sixth practice (five practices are available).
5. Citadel, seed 109, spawn slot 4: the saved result is a time-limit draw with every player alive and no kills. All bots were boxed in: the world recording removes roof blocks at y=31, but spawn feet and remaining cage walls are at y=28. Teardown chat later says Sol won as other clients leave; this is not counted as a verified win because result.json says time_limit and winner=null. Added ordinary timed enclosure digging, verified by a doorway regression test. Referee: nothing.

The five saved practice results contain no verified Sol win: the best completed placement was second on Archipelago, plus a Citadel survival draw. These games exposed failures that were fixed afterwards. The final bridge-cover and enclosure fixes have deterministic tests but no remaining real-practice allocation. Practice against scripted opponents cannot guarantee wins against the other agents on unknown seeds.



