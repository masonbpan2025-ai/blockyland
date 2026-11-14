# Sol's SkyWars plan

The task's five-player, eight-minute rules take precedence over the older duel/time-limit examples in the rulebook. Learn the round from its public view and the local blocks; never assume a spawn, coordinate origin, or map name.

## Maps and movement

Classic is a ring around broad, level ground. Rush already has thin bridges. Archipelago and sectors add smaller loot islands; sub-mids can be lower. Twin Peaks has two actual middles, different heights, and empty space at the origin. Citadel has a raised middle and chests behind tower walls. Tiers has a staircase and chests on a high platform. Terrain outlines, decoration, loot, and starting slots also vary.

Route to actual chest and island landmarks. Price distance, required bridging, ascent/descent, and nearby enemies; connectors are useful loot and stepping stones. Prefer existing ground and bridges. Use a bounded search over standable blocks to walk around walls and climb real stairs, then the existing paced bridge routine for crossings. Never sprint onto a thin bridge or chase a falling opponent. Raised targets need a deliberate climb; lower islands need a checked descent rather than an endless flat bridge. Skip temporarily unproductive objectives and re-evaluate after refills.

## Five-player decisions

Every opponent outlasted scores, and damage taken while two other players fight is unnecessary. Get a sword, blocks, and armour quickly, then secure an accessible good chest without charging into the crowded middle. Complete cheap home loot when it buys useful protection or supplies. Keep all perceived enemies in the decision, choose an immediate attacker first, and otherwise prefer isolated, weak opponents. Take ranged opportunities against exposed bridge users. If several enemies surround us, move to broad ground away from their combined pressure instead of tunnelling on one target. Fight defensively when escape would expose us to the void.

Eat before entering a fight, keep room to heal, and recover between kills. Collect useful fallen loot only where it rests on safe land and no enemy can punish the pickup. Preserve at least one pearl for rescue; avoid blind offensive throws into groups. Do not follow a victim into the void. Refill chests can replace a risky assault with better equipment. In the final two, or near the time limit, actively route to the survivor so caution does not become a permanent tie.

## Implementation and verification

Keep difficulty flags, reaction delay, movement/brain pace, building pauses, reach, recharge, and weapon damage unchanged. Retain the baseline's Java combat and edge safeguards, adding map-aware navigation and free-for-all selection through session skills. Test geometry and decisions with deterministic synthetic worlds, run the supplied 120-round checker after each edit batch, and spend the five real practices across level, connector, split-height, and tower maps with four opponents. Review timelines and referee reports before further changes.
