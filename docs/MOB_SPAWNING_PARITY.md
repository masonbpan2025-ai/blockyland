# Mob spawning parity

Target: **Minecraft Java Edition 1.21.4**.

Why that version: it is the version this repository already pins its other vanilla parity work to.
`scripts/generate-mc-data.mjs` fetches `pc/1.21.4` blocks and items, `docs/block-parity-gap-review.md`
measures the block registry against a pinned `pc/1.21.4` data cache, and `docs/survival-parity-rules.md`
is measured against minecraft-data 1.21.4. Pinning spawning to the same version means a number in this
document and a number in the block registry are describing the same game.

Rules from other versions are **not** mixed in. Where a rule changed after 1.21.4 (most relevantly the
`spawnMonsters` gamerule added in 25w35a, and `dappled_forest` added in 1.21.5) this document says so
rather than adopting it.

The authoritative working notes, with a source URL per numeric claim, are in
[research/mob-spawning-1.21.4.md](research/mob-spawning-1.21.4.md). The full extracted behavioural
specification is [mob-spawning-spec-1.21.4.md](mob-spawning-spec-1.21.4.md). The repair plan that
produced the fixes recorded below is
[mob-spawning-implementation-plan.md](mob-spawning-implementation-plan.md).
Architecture is in [MOB_SPAWNING_ARCHITECTURE.md](MOB_SPAWNING_ARCHITECTURE.md); references and
licences in [MOB_SPAWNING_REFERENCES.md](MOB_SPAWNING_REFERENCES.md).

## Repair log: what was wrong and why the reported symptoms happened

A player reported *"as I explore the world I found many inconsistency in terms of mob spawn logic,
for example fish are spawn on the ice"*. The cause turned out to be a single upstream defect that had
gone unnoticed because the tests imported the predicate module directly and so registered everything
as a side effect **of the test**.

**The placement registry was empty in the running game.** `mobSpawnPredicates.js` calls
`registerDefaultSpawnPlacements()` at module scope, and **nothing under `src/` imported that module**.
`spawnPlacementFor(type)` therefore returned its unregistered default for every mob:

```js
{ placement: ON_GROUND, heightmap: MOTION_BLOCKING_NO_LEAVES, predicate: null }
```

The consequences:

| Effect | Symptom |
| --- | --- |
| Every aquatic mob was placed as a **ground** mob, so the ON_GROUND floor test ran instead of the fluid test, and **ice counts as a valid floor** | **fish standing on ice** — the reported bug |
| Every per-mob predicate vanished (`predicate: null`) | no glow-squid light rule, no drowned light rule, no `bats_spawnable_on`, no passive light-9 rule, no slime rules, no nether-wart refusal |
| Every mob used `MOTION_BLOCKING_NO_LEAVES` instead of its own heightmap | aquatic mobs bounded against the terrain surface rather than the sea bed |

The regression test that now pins this is
`tests/spawnPlacementRegression.test.js` → *"importing the spawner is enough to register every mob
placement"*, which imports **only the spawner**, which is the shape the game uses.

The rest of this section records the other repairs made in the same pass, each with the test that
holds it.

| Area | Was | Now | Test |
| --- | --- | --- | --- |
| `IN_WATER` / `IN_LAVA` / `NO_RESTRICTIONS` placement | skipped the bounding-box test entirely | every placement family checks the box; only the fluid and floor rules differ | *"a fish whose box penetrates an adjacent ice wall is refused"* + positive control |
| `WORLD_SURFACE` heightmap | skipped non-motion-blocking blocks, so a flower was invisible and the candidate-Y bound was a block low | counts the highest **non-air** block; the three heightmaps are implemented separately | *"WORLD_SURFACE counts non-air blocks that do not block motion"* |
| Pack member eligibility | species chosen once and never re-checked, so a pack spawned its origin species across a biome or structure boundary | each member re-resolves the list at **its own** position and is rejected if the species is absent; the species is never re-rolled | `spawnConstructionIntegration` → *"refuses a member whose species is not listed at its destination"* |
| Dimension eligibility | hand-written allowlists banned **Endermen from the Nether** and **ordinary skeletons from fortresses** | derived from the generated biome tables plus structure overrides, each structure carrying its own dimension | `spawnEligibilityRegression` → *"endermen may spawn naturally in all three dimensions"* |
| `fishPredicate` | tested the water column **and** the elevation band before the lush-cave exemption, which therefore never fired | water geometry and elevation are separate; the tropical-fish exemption is evaluated first | *"tropical fish may spawn deep in lush caves"* + a cod control |
| `squidPredicate` / `dolphinPredicate` | inherited the fish rule, including "water above", which the wiki states only for fish | the stated rule is "the spawning block must be water" | *"squid does not require water above it, unlike a fish"* |
| `glowSquidPredicate` | inherited the ocean sea-level band, the opposite of its habitat | its own rule: light 0 and a depth below the band | *"glow squid can spawn in deep, dark, underground water"* |
| `ghastPredicate` | `nextInt(20) !== 0` accepted **19 of 20** — a 95 % success rate, the exact inverse — and applied the generic hostile darkness test | `nextInt(20) === 0`, and the light test is not applied (ghasts spawn regardless of light) | *"ghast refuses exactly 19 of every 20 RNG outcomes"* (all 20 enumerated) |
| `drownedPredicate` | ran no light test at all, so a drowned could spawn in a sunlit puddle at noon | the monster darkness rule applies, in addition to the water column and the rarity rolls | *"drowned requires darkness as well as water"* |
| Chunk-generation placement | ran only the species predicate, and treated a **missing** predicate as success, so a generated animal could intersect solid blocks | shares `validateSpawnSpace` with the runtime cycle | *"chunk generation refuses a candidate that intersects solid blocks"* + positive control |
| Structure overrides | hand-written, and the `bastion_remnant` entry was **invented** — the data pack gives bastions `spawn_overrides: {}` — while the monument's and swamp hut's suppression categories were **missing** | **generated** by `scripts/generate-mob-spawn-data.mjs` into `src/spawning/vanillaStructureSpawns.js`, preserving no-override / replacement / empty-suppression as three distinct cases | *"the bastion has NO spawn override"*, *"the monument and swamp hut suppress the categories the data pack empties"* |

Three test-setup errors found while writing those tests are worth recording, because each produced a
confident wrong answer first:

1. `frozenWaterFixture` puts ice at `seaLevel + 1` — a horizontal **sheet** above the top water block,
   so a mob in the top water block does not intersect it. Proving penetration needs an ice **wall**
   (`frozenWaterWallFixture`).
2. The small grass fixture spans x = -16..31, so a "distant" player at x = 60 sat in an **unloaded**
   chunk and candidates were refused for the wrong reason. `wideGrassFieldFixture` exists for this.
3. `warm_ocean` does **not** list cod — it lists pufferfish and tropical fish. A test asserting "a cod
   at its origin is accepted" in a warm ocean was asserting the opposite of the data, and the
   implementation was right to refuse it.

## Status vocabulary

| Status | Means |
| --- | --- |
| NOT STARTED | Nothing exists. |
| PARTIAL | Something exists but a named part of the rule is missing. |
| FUNCTIONAL | The mechanism works end to end; some sub-rules are simplified. |
| NEAR PARITY | Every rule studied is implemented; remaining differences are listed. |
| VERIFIED | Asserted by an automated test against an external source, not just by observation. |

Nothing is marked VERIFIED because mobs appear plausible. Every VERIFIED row names the test that
asserts it against a number taken from the vanilla data pack, the Paper/NeoForge API surface, or a
revision-pinned wiki revision.

---

## Summary

| Area | Status |
| --- | --- |
| Active / eligible spawning chunks | VERIFIED |
| Mob categories | VERIFIED |
| Global mob caps | VERIFIED |
| Per-player caps | FUNCTIONAL |
| Biome spawn tables | VERIFIED |
| Weighted mob selection | VERIFIED |
| Pack / group spawning | NEAR PARITY |
| Per-member pack eligibility | VERIFIED |
| Candidate position selection | VERIFIED |
| Generic spawn placement | VERIFIED — every placement family checks the bounding box |
| Spawn placement registry wired at runtime | VERIFIED |
| Lighting | NEAR PARITY |
| Mob-specific predicates | FUNCTIONAL |
| Player-distance rules | VERIFIED |
| Dimension-specific rules | VERIFIED — derived from the generated tables, not an allowlist |
| Despawning | NEAR PARITY |
| Entity persistence | FUNCTIONAL |
| Chunk unload / reload | FUNCTIONAL |
| Chunk-generation spawning | FUNCTIONAL — now shares spatial validation |
| Structure spawn overrides | VERIFIED — generated from the pinned 1.21.4 data; **dormant in-game because no structures are placed** |
| Special spawners | PARTIAL |
| Difficulty | VERIFIED |
| Spawn costs (warped forest, soul sand valley) | NOT STARTED |
| Structures placed in the world at all | NOT STARTED — blocks every override above |
| Debug overlay | FUNCTIONAL |
| Telemetry | FUNCTIONAL |
| Differential / golden tests | FUNCTIONAL |
| Travel regression test | VERIFIED |
| Performance | FUNCTIONAL |

---

## ACTIVE-CHUNK PARITY — VERIFIED

Does spawning occur in approximately the same active region around players?

Minecraft: a chunk is spawn-eligible when a non-spectator player is within **128 blocks of the chunk
CENTRE** (Paper `ChunkMap.playerIsCloseEnoughForSpawning`: `euclideanDistanceSquared(chunkPos, player)
< 16384.0`) and the chunk is entity-ticking. The union over all players is used, so overlapping player
regions cost nothing extra.

Implemented in `src/spawning/spawnState.js`. Both halves matter and both are asserted:

- the distance test is against the chunk centre, not the player's own chunk;
- the comparison is strictly `<`, so a chunk whose centre is exactly 128 blocks away is excluded;
- an unloaded chunk is never eligible however close the player is.

The 17×17 chunk square (289 chunks) is **only** the mob-cap denominator. It is not the spawn region.
Conflating the two is a common error and is called out in the test suite.

**Deviation.** Vanilla additionally requires the position to be inside the world border. This engine
has no world border, so that check does not exist. Documented, not worked around.

Tests: `tests/mobSpawningParity.test.js` — "a chunk is eligible only if a non-spectator player is
within 128 blocks of its CENTRE", "an unloaded chunk is never eligible, however close the player is",
"the cap square is counted even where the chunk is not loaded".

### Which chunks are attempted

Minecraft 1.21.4 collects **every** eligible chunk, shuffles the list, and iterates all of it. Each
eligible chunk gets an attempt per due category per tick.

The widely repeated rule "one random chunk per player's 17×17 area per tick" is **not** 1.21.4. The
research report lists it against the sources it inspected. Implementing that version produces a spawn
rate roughly two orders of magnitude too low — which is precisely the reported symptom of a world with
mobs only near spawn.

Implemented as `NaturalSpawner.collectSpawningChunks` (Fisher-Yates from the project RNG, so the
order is reproducible for a seed). The shuffle matters when the category cap stops a category early:
it decides which chunks lose.

---

## MOB-CATEGORY PARITY — VERIFIED

Eight categories, each with independent caps, spawn passes and biome lists. There is no single
`maxMobs`.

| Category | Cap per 289 chunks | Persistent (400-tick gate)? | Friendly (per-player-cap exempt)? | Despawn distance |
| --- | --- | --- | --- | --- |
| `monster` | 70 | no | no | 128 |
| `creature` | 10 | yes | yes | 128 |
| `ambient` | 15 | no | no | 128 |
| `axolotls` | 5 | yes | yes | 128 |
| `underground_water_creature` | 5 | yes | yes | 128 |
| `water_creature` | 5 | yes | yes | 128 |
| `water_ambient` | 20 | no | no | **64** |
| `misc` | unlimited (-1) | yes | yes | 128 |

"Persistent" here is `MobCategory.isPersistent()`, which does **not** mean "this mob is persistent".
It means "this category only spawns on the slow pass". `monster`, `ambient` and `water_ambient` are the
three that are not persistent.

**Deviation, corrected during development.** An earlier version of the type table put `cod`, `salmon`,
`pufferfish` and `tropical_fish` in `water_creature`. They are `water_ambient`. The effect was an ocean
with roughly three times its fish population (cap 20 vs 5) and fish that never despawned inside 128
blocks (distance 128 vs 64). The test suite now asserts the category of each fish explicitly.

Tests: "the eight mob categories and their caps match Java Edition 1.21.4", "only MONSTER is
non-persistent…", "fish despawn at 64 blocks and everything else at 128", "mob types map to the
categories the wiki lists".

---

## MOB-CAP PARITY — VERIFIED

Vanilla:

```
globalCap = mobCap × spawnableChunkCount ÷ 289
```

where `spawnableChunkCount` is the size of the **union** of every player's 17×17 chunk square. Two
players standing together therefore do not double the cap; two players apart do increase it.

Three quantities use three **different** chunk sets, and getting them confused is the classic source
of a mob farm that produces nothing:

| Quantity | Chunk set |
| --- | --- |
| Where spawning may happen | chunks with a player within 128 blocks of the centre, and loaded |
| The cap divisor | the 17×17 square around each player, unioned, **whether loaded or not** |
| What is counted | every non-persistent loaded mob, **anywhere loaded**, including chunks no player is near |

The third row is the one that makes despawning load-bearing: a mob abandoned 20 chunks away still
occupies global cap space until it is removed.

Implemented in `SpawnState.#computeCaps` and `SpawnState.#countMobsGlobally`.

**Persistent mobs do not count toward either cap.** A name-tagged pet does not stop the world
spawning. This is asserted directly because the opposite assumption is easy to make and produces a
cap that silently shrinks as the player names things.

**The cap is checked once per chunk, not per pack member.** Vanilla: "The mob caps are checked once
for each spawn-eligible chunk. The group size … is not taken into account, meaning the spawning of a
group of mobs may cause the total number of mobs for that category to exceed the respective cap."
Re-checking between members would silently apply a cap vanilla does not have; this implementation
deliberately does not.

Tests: "the global cap is mobCap * chunks / 289, and 289 is the 17x17 square", "two players standing
together do not double the cap", "persistent mobs do not occupy cap space", "a full category reports
no room, and one under the cap reports room".

---

## LOCAL / PER-PLAYER CAP — FUNCTIONAL

Minecraft has a per-player cap in addition to the global one: every non-persistent mob in a chunk
whose centre is within 128 blocks horizontally of a player counts toward that player's budget, and "for
each chunk, spawns are only allowed if at least one player has that chunk in range and has not reached
their per-player mob cap".

Implemented as the local cap in `SpawnState.canSpawnForCategoryLocal`, with a radius of 128 blocks and
a per-player allowance of `min(70, ceil(globalCap × 0.45))`.

**Deviations.**

1. The research report found no `LocalMobCapCalculator`-equivalent with the "120 blocks" radius that
   appears in some secondary write-ups; the 128-block figure is used, matching the global player
   sphere. Recorded here rather than silently using 120.
2. The 0.45 fraction is a choice, not a vanilla constant, and it is configurable
   (`manager.localCapEnabled = false` disables the local cap entirely, which is the pure-vanilla
   global-cap behaviour).
3. Vanilla's rule is "at least ONE player has room", i.e. an OR over players. This implementation
   resolves the chunk's owner to the first player whose range contains it and applies that player's
   budget. In single-player the two are identical; in multi-player this is stricter than vanilla when
   the first owner is full and a second player has room.

Tests: "a full category reports no room, and one under the cap reports room" covers the global path;
the local-cap arithmetic is covered by the snapshot assertions.

---

## BIOME PARITY — VERIFIED

Spawn tables are **generated data**, not hand-written code. `scripts/generate-mob-spawn-data.mjs`
fetches all 65 biome files of Java Edition 1.21.4 from the vanilla data pack mirror
`misode/mcmeta@1.21.4-data` and emits `src/spawning/vanillaBiomeSpawns.js`. Only each biome's
`spawners` block is reproduced: `{ type, weight, minCount, maxCount }` per category.

Regenerate with `node scripts/generate-mob-spawn-data.mjs`. It works offline from
`.cache/mc-data/biomes`.

Why generated: hand-typed biome tables are the single most common way a spawning port stops matching
the version it claims, because the drift is invisible. A generated file plus a coverage test removes
the class of error.

**Coverage.** The engine's registry has 69 biome ids. 66 come from the data pack. The remaining three
and the one that needs a runtime alias are recorded as data, not folded in silently:

| Engine biome | Borrows | Why |
| --- | --- | --- |
| `nether` | `nether_wastes` | the engine's id for the Nether's default biome; generated at build time |
| `ice_caves` | `dripstone_caves` | engine-only cave variant; nearest vanilla table |
| `sulfur_caves` | `lush_caves` | engine-only cave variant; **generous** — it inherits lush caves' axolotl, glow squid and tropical fish tiers, which vanilla would not put in a sulfur cave |
| `dappled_forest` | `forest` | a real vanilla biome in **1.21.5+** but not 1.21.4; resolved at lookup time |

A biome this engine does not know spawns **nothing**. `resolveBiomeTable` returns `null` rather than
falling back to plains, which is asserted by a test: a typo must not populate a custom biome with cows
and zombies.

**A structure override with an EMPTY list suppresses spawning rather than falling through.** The
1.21.4 data pack gives `trial_chambers` and `ancient_city` an override for all eight categories with
empty lists precisely to stop natural spawning inside themselves. Treating "empty" as "absent" would
populate them with the surrounding biome's monsters. Asserted by a test.

Tests: "the generated tables cover every engine biome, directly or through an alias", "plain vanilla
biome tables match the 1.21.4 data pack", "the Nether biomes carry the Nether mobs and no bat", "the
engine-only biomes resolve to a documented vanilla table", "an unknown biome spawns nothing", "the void
spawns nothing at all", "every natural-spawn mob type can actually be built by the engine".

---

## WEIGHTED MOB SELECTION — VERIFIED

`WeightedRandom.getRandomItem` reproduced exactly: draw `nextInt(totalWeight)`, then walk the list
subtracting each weight until the running total exceeds the draw. Reproducing the draw's range and
order matters because the same seed must select the same entry.

The species is chosen **once per pack**, at the position of the first successful attempt. Later members
re-validate that same species at their own offsets rather than re-rolling.

The RNG is `src/spawning/spawnRandom.js`, a faithful `java.util.Random` (verified against the JDK's
values for seed 42). `Math.random()` is not used anywhere in the spawn path.

Tests: "JavaRandom reproduces java.util.Random exactly", "JavaRandom.nextInt(bound) is unbiased and in
range", "weighted selection follows the weights", "an empty or zero-weight list selects nothing rather
than guessing".

---

## PACK / GROUP SPAWNING — NEAR PARITY

The vanilla structure, implemented in `NaturalSpawner.spawnForChunk` / `spawnGroup`:

```
for groupCount in 0..2:                              // 3 group attempts per (chunk, category, tick)
    x = startX; z = startZ                           // re-taken from the pack centre each group
    maxAttempts = ceil(nextFloat() * 4)              // 0..4 position attempts
    for attempt in 0..maxAttempts-1:
        x += nextInt(6) - nextInt(6)                 // triangular +-5, applied to the PREVIOUS member
        z += nextInt(6) - nextInt(6)
        pos = (x, startY, z)                         // Y is CONSTANT for the whole pack
        if species not yet chosen:
            data = weighted pick at pos
            if none: break                           // ends this group
            maxAttempts = minCount + nextInt(1 + maxCount - minCount)
        validate and place; a failure skips only this member
        if clusterSize >= mob.getMaxSpawnClusterSize(): return
```

Implemented and asserted:

- 3 group attempts (`SPAWN_GROUP_ATTEMPTS`);
- the initial `ceil(nextFloat() * 4)` member bound, replaced by the drawn group size on the first
  legal species pick (`initialMemberAttempts`);
- the triangular ±5 offset from the previous member (`nextInt(6) - nextInt(6)`), asserted to have the
  triangular distribution rather than a uniform one;
- **Y constant for the whole pack**;
- partial packs are allowed and nothing is rolled back;
- per-mob cluster caps: 8 for wolf/cod/tropical fish, 6 for horse/donkey/mule, 1 for ghast, 4 default;
- a group whose first species lookup is empty breaks out of the attempt loop.

**Deviations.**

1. `mob.isMaxGroupSizeReached(groupSize)` — the spec marks the call site as inferred rather than
   confirmed, and this engine has no equivalent per-mob group ceiling, so it is not implemented. The
   cluster-size cap covers the observable effect.
2. `finalizeSpawn(..., spawnGroupData)` threading (one leader plus followers sharing state) has no
   equivalent; group state is not propagated. Affects wolf packs and llama caravans, not population.
3. `getMaxSpawnClusterSize` values are the wiki's list, which the spec flags as `[W]` rather than `[C]`.

Tests: "the pack offset is triangular and centred, not uniform", "pack size is uniform over
minCount..maxCount inclusive", "a maxCount below minCount is clamped rather than rolling backwards",
"cluster sizes cap a pack: 8 for cod, 6 for horses, 4 by default".

---

## POSITION PARITY — VERIFIED

`NaturalSpawner.getRandomPosWithin`, reproduced:

```
x = minBlockX + nextInt(16)
z = minBlockZ + nextInt(16)
surfaceY = chunk.getHeight(WORLD_SURFACE, x, z) + 1
y = randomBetweenInclusive(minY, surfaceY)        // uniform over [minY, surfaceY]
```

Two corrections this forced on a naive implementation, both load-bearing:

1. **Y is a UNIFORM draw over the whole column**, not "the terrain height plus one" and not a
   surface/underground split. This is the rule that makes caves fill up: the overwhelming majority of
   attempts land below the surface. `pickY` is asserted to put about half its draws below the column
   midpoint and only 2 of 32 outcomes at or above the surface. The classic "always spawn at terrain
   height + 1" port leaves every cave empty.
2. **The heightmap is `WORLD_SURFACE`** — the highest non-air block, fluids included — **not**
   `MOTION_BLOCKING_NO_LEAVES`. The per-entity heightmap is used later, by the placement check.

Also implemented: a pack centre exactly at the world floor is rejected (`startY < minY + 1`), and a
pack centre inside a solid full block cancels the category for that chunk that tick (vanilla's
`isRedstoneConductor` test, the wiki's "if the block in which a pack spawn occurs is an opaque full
cube, further pack spawn attempts are cancelled").

Tests: "Y is drawn uniformly over the whole column, which is what makes caves fill up", "the
WORLD_SURFACE heightmap is the highest non-air block, including fluids".

---

## PLACEMENT PARITY — VERIFIED

`src/spawning/spawnPlacements.js` is a registry, not a single `canSpawn()`. Each mob registers a
**placement type** (`ON_GROUND`, `IN_WATER`, `IN_LAVA`, `NO_RESTRICTIONS`), a **heightmap**
(`MOTION_BLOCKING_NO_LEAVES`, `OCEAN_FLOOR`, `WORLD_SURFACE`) and a **predicate**. The generic checks
live in `spawnValidation.js` and are identical for every mob; the predicate is the mob's own rules and
never repeats the generic ones.

Generic checks, in the order they run (cheapest and most fundamental first):

difficulty → world bounds → dimension → chunk loaded → player distance → fluid/floor per placement →
bounding box.

**The bounding box is checked for EVERY placement family**, including `IN_WATER`, `IN_LAVA` and
`NO_RESTRICTIONS`. It previously was not, and that omission — combined with the registry never being
populated at runtime, so that aquatic mobs were treated as ground mobs — is what produced the reported
"fish spawn on the ice". A test now asserts both halves: that an aquatic box penetrating an ice wall is
refused, and that a clear-water fish in the same world is still accepted.

The spatial rules live in `validateSpawnSpace`, which `validateGenericSpawn` (the runtime policy
wrapper) and the chunk-generation spawner both call. That is what keeps the two paths from drifting:
they differ only in the policy around the call — player distance, caps, difficulty — not in collision,
fluid or floor handling.

Every refusal produces a **machine-readable code**: `NO_WORLD`, `CHUNK_NOT_LOADED`,
`OUT_OF_WORLD_BOUNDS`, `TOO_CLOSE_TO_PLAYER`, `TOO_FAR_FROM_PLAYER`, `CAP_FULL`, `LOCAL_CAP_FULL`,
`NO_SPAWN_ENTRIES`, `WRONG_BIOME`, `WRONG_DIMENSION`, `WRONG_FLUID`, `INVALID_FLOOR`, `INVALID_LIGHT`,
`COLLISION`, `DIFFICULTY_BLOCKED`, `MOB_PREDICATE_FAILED`, `STRUCTURE_OVERRIDE`, `INVALID_BLOCK_BELOW`.

**Deviations.**

1. Vanilla's "the mob's collision box must not collide with another collision box" (entity-vs-entity)
   is not implemented. Spawning a mob inside another mob is prevented in practice by the voxel box
   test and by mob separation, but the rule itself is absent.
2. Vanilla's block tags `prevent_mob_spawning_inside` (rails) and `bats_spawnable_on` are reproduced
   by name matching rather than by tag data, because this engine has no block tags.
3. Vanilla's "the mob must be immune to the damage of the spawning block and the block below" is
   approximated by an explicit damaging-block list (fire, soul fire, lava, magma, cactus, powder snow,
   wither rose, sweet berry bush) rather than by a damage-immunity query.
4. Vanilla's directional opacity (a top slab blocks light from above but not from the side) is not
   modelled; `src/spawning/lightEngine.js` uses a two-level opacity model plus water/leaves.

Tests: "a position inside 24 blocks of a player is refused", "a position outside the player sphere is
refused", "an unloaded chunk is refused before the expensive checks", "PEACEFUL blocks every hostile
placement…", "a ground spawn with no floor underneath is refused", "a water placement refuses dry land
and vice versa", "a fish whose box penetrates an adjacent ice wall is refused" (with a clear-water
positive control), "a lava mob whose box penetrates a ceiling is refused", "NO_RESTRICTIONS still
checks that the box fits solid blocks", "the box test reaches into neighbour chunks when the mob
straddles a border", and the registry-wiring test.

---

## LIGHT PARITY — NEAR PARITY

This project had **no lighting engine**. `src/lighting.js` is eight `THREE.PointLight`s chosen for the
camera, and `world.getLightLevel` did not exist — every spawn-ish check that wanted light wrote
`world.getLightLevel?.(…) ?? 15`, i.e. "assume daylight", while `packEquine.js` decided from the clock
instead. A guess cannot tell a dark cave from a lit field at noon, and in vanilla those are the same
rule.

`src/spawning/lightEngine.js` now maintains real sky light and block light, 0–15, propagated per chunk:

- sky light 15 above the terrain, falling by one per step, with vanilla's downward rule where a
  full-strength column propagates straight down without loss — this is what makes an overhang's shadow
  edge correct;
- block light emitted from the engine's own `light` values on `BLOCK_DEFS` and falling by one per step;
- per-chunk dirty set with a time budget, so an edit or a chunk arriving is relit over a frame or two.

Measured: **2.15 ms per chunk** steady state (289 chunks in 622 ms).

### The monster light rule

`Monster.isDarkEnoughToSpawn`, reproduced in full. It has **three** parts, and the first is the one
usually omitted:

```
(A) skyLight > random.nextInt(32)                                  -> refuse
(B) monsterSpawnBlockLightLimit(dimension) < 15
      && blockLight > that limit                                   -> refuse
(C) max(blockLight, skyLight - skyDarken) <= sample(random)        -> else refuse
```

with, from the 1.21.4 dimension-type data:

| Dimension | `monster_spawn_block_light_limit` | `monster_spawn_light_level` |
| --- | --- | --- |
| `overworld` | 0 | uniform 0..7 → `nextInt(8)` |
| `the_end` | 0 | uniform 0..7 |
| `the_nether` | **15** (clause disabled) | constant **7** |

Part (A) is why an exposed surface at night is roughly three times slower to populate than a dark
cave: at sky light 15 the lottery fails about 47 % of the time, while in a cave with sky light 0 it
always passes. A port that implements only `light <= 0` gets both directions wrong — it refuses the
dimmer part of dusk and dawn that vanilla spawns through, and it would allow any light in the Nether.

The RNG order is part of parity and is asserted: `nextInt(32)`, then no draw for (B), then the sampled
bound.

`skyDarken`: 0 at clear noon, 3 in rain, 5 in thunder, 11 at midnight. The thunder path substitutes
**10** for the internal-light comparison specifically (not the ambient 5), so sky light 15 reads as 5
for spawning. Recorded separately because conflating the two is easy.

**Deviations.**

1. `skyDarken` is derived from the engine's clock with a short ramp at the two twilights rather than
   from vanilla's celestial-angle step function. The endpoints (0 and 11) and the weather values match.
2. Emission comes from this engine's `BLOCK_DEFS.light` values, which do not always equal vanilla's
   (e.g. vanilla's respawn anchor is 0 uncharged / 15 charged; this engine does not model the charge).
   The spawning subsystem consumes what the engine emits, so visible lighting and spawn rules cannot
   disagree with each other — but both can disagree with vanilla.
3. Opacity is a two-level model plus explicit cases for water (1) and leaves (1). No block in the
   registry is partially attenuating today. Vanilla's per-block opacity table and its shape-aware
   directional opacity are not modelled.
4. The light engine declares its own `CHUNK_SIZE_X/Z/HEIGHT` to avoid an import cycle with `world.js`.
   A test asserts they equal `world.js`'s, so a change there fails a test rather than silently
   misindexing every light array.
5. Corruption was found and fixed during development: light reads for negative coordinates were
   compared against a differently-rounded position, which produced three contradictory measurements of
   the rule before it was traced. The light-rule tests now capture the light inside the predicate, at
   the exact block the spawner tested.

Tests: "the monster light rule refuses full daylight and always passes in a dark cave", "the sky-light
lottery makes surface night spawning rarer than cave spawning", "block light at or above the dimension
limit refuses a monster spawn", "the Nether samples a constant light bound of 7…", "the three RNG draws
happen in vanilla order", "skyDarken is 0 at clear noon and 11 at midnight", "rain and thunder darken
the sky to 3 and 5", "a dimension with no sky light has no sky darken", "sky light is 15 above the
terrain and 0 at bedrock", "a torch lights its neighbours and falls off by one per block", plus the two
end-to-end day/night tests.

---

## MOB-RULE PARITY — FUNCTIONAL

Per-mob rules live in `src/spawning/mobSpawnPredicates.js`, each citing the rule it implements. Every
predicate composes a shared helper rather than repeating a generic check.

Fully implemented: the common hostile rules (dark enough plus a solid, non-glass/ice/leaves floor that
does not emit light 14+); husk and stray sky access; drowned water column with the 1/15 river and 1/40
ocean rarity rolls and the 5-below-sea-level gate; guardian water column with the 95 % sky-exposure
failure; ghast 95 % failure; magma cube no-liquid; slime's two disjoint rules (swamp Y 51–69 with the
50 % and moon rolls; slime chunk below Y 40 with a 90 % failure); nether wart refusal for
piglin/hoglin/zombified piglin; fortress-only blaze and wither skeleton; zombie horse grass; creaking
pale-garden-at-night; bat's stone-family floor, no sky exposure and light ≤ 4; the passive light ≥ 9
rule; per-mob passive floor blocks (mooshroom mycelium, turtle sand ≤ Y 66, parrot grass/leaves/logs,
rabbit grass/sand/snow, wolf and fox grass/podzol/coarse dirt/snow, polar bear grass/ice, goat
stone/gravel/packed ice/snow, armadillo grass/coarse dirt/terracotta/red sand, frog grass/mud/mangrove
roots, camel sand, ocelot jungle with 1/3 failure); aquatic water-column rules; glow squid light 0 and
Y < 30; axolotl clay below and non-solid above; strider lava with air above; tadpole water.

**Deviations.**

1. **Slime chunks.** This engine has no per-chunk slime flag, so the slime-chunk branch uses a
   deterministic hash of the chunk coordinates at the vanilla 1-in-10 density. The *rate* matches; the
   *which chunks* does not.
2. **Moon phase.** No moon-phase model, so the swamp slime moon roll is a flat 50 %.
3. **The 80 % wither skeleton ratio in fortresses** is implemented as a predicate on the skeleton entry
   rather than as a post-hoc swap. The spec marks the wiki's claim for this as `{{verify}}` and notes
   that 1.21.4's actual mechanism is the fortress weight table (wither skeleton weight 8 vs skeleton 2),
   which is also in the override data here.
4. **Glow squid's Y ceiling** is vanilla's "level 30 or lower" translated to this engine's compressed
   world height. This engine's `CHUNK_HEIGHT` is 64 against vanilla's 384, so absolute Y values in
   per-mob rules are mapped into the engine's range and documented per rule.
5. **The drowned/guardian Y windows** are expressed relative to this engine's `seaLevel` (22 by
   default) rather than vanilla's absolute 50–63 band, for the same reason. The *shape* of the rule (a
   13-block window ending at sea level) is preserved.
6. Mobs whose per-mob rules were not individually studied get the generic monster or generic passive
   rules. `registeredSpawnTypes()` and a test make the coverage explicit: every mob named by any biome
   table is registered, and every one can be constructed by the engine.

Tests: "every natural-spawn mob type can actually be built by the engine", "drowned requires water
above and below", "glow squid needs light 0 and a Y below 30", "the bat refuses sky exposure and a floor
that is not stone-family", "a passive mob needs light 9 or brighter", "an axolotl needs clay below and
a non-solid block above", "a strider needs lava with air above".

---

## PLAYER-DISTANCE PARITY — VERIFIED

| Rule | Value | Source |
| --- | --- | --- |
| Minimum spawn distance | **24 blocks**, spherical, from any player **and the world spawn point** | wiki spawn conditions |
| Maximum, general | **128 blocks**, spherical | wiki |
| Maximum, fish (`water_ambient`) | **64 blocks** | wiki |
| `SPAWN_DISTANCE_CHUNK` | 8 | NeoForge constant values |

Implemented in `validateGenericSpawn`. The maximum is resolved per category
(`maxDistanceForCategory`), so fish are held to the tighter sphere.

**Deviation.** The 24-block exclusion uses the world spawn point only if the game supplies one; this
engine has no persistent world spawn point concept wired into the spawner, so only players are
excluded. `manager.worldSpawnPoint` is the hook.

Tests: "the minimum spawn distance is 24 blocks and fish are held to a 64-block sphere", "a position
inside 24 blocks of a player is refused", "a position outside the player sphere is refused", "a
spectator is not a spawn reference point".

---

## DESPAWN PARITY — NEAR PARITY

Despawning is not optional polish: the caps are global, so mobs left behind hold cap space and every
newly loaded area stays empty. This is half of the reported bug, and `MobManager` had **no**
`removeMob` at all — `wanderingTraderBehavior.js` already called `this.removeMob?.(mob)` behind an
optional chain, so a timed-out trader was never removed and nothing reported it.

`Mob.checkDespawn` reproduced:

```
if difficulty == PEACEFUL && shouldDespawnInPeaceful(): discard(); return
if isPersistenceRequired() || requiresCustomPersistence(): return
nearest = nearest non-spectator player; if none: return
d = nearest.distanceToSqr(this)                        // 3-D Euclidean, squared
if d > despawnDistance² && removeWhenFarAway(d): discard()
if noActionTime > 600 && random.nextInt(800) == 0 && d > 32² && removeWhenFarAway(d): discard()
else if d < 32²: noActionTime = 0
```

Three exactness points that change observable behaviour and are implemented deliberately:

1. The comparisons are **strict `>`**. A mob at exactly 128 blocks is not removed; at exactly 32 it is
   not "close".
2. `random.nextInt(800)` is only **evaluated** when `noActionTime > 600`, because Java's `&&`
   short-circuits. A port that draws unconditionally consumes a different number of random values per
   tick. Asserted by counting draws with a stub.
3. The `else if (d < 32²)` reset binds to the **second** `if` only.

`noActionTime` advances by 1 per tick, +2 extra when the mob's internal light is over 12, and +2 extra
for raiders — so an illager gives up after about 200 ticks rather than 600.

`removeWhenFarAway`: driven by **category** first (monster, ambient and all three aquatic categories
despawn; `creature` land animals and `misc` do not), then by explicit exceptions. `shulker`, `wither`,
`elder_guardian` and `ender_dragon` never despawn; `cat`, `ocelot`, `wandering_trader` and
`trader_llama` do despite being animals. Hoglins, zoglins, piglins and shulkers survive a switch to
Peaceful.

**Deviation, corrected during development.** An earlier version derived `removeWhenFarAway` from
`CATEGORY_INFO.isFriendly`, which made every squid and glow squid immortal — `isFriendly` is the
per-player-cap exemption (an optimisation this implementation has and vanilla does not), not the
despawn rule. Now driven by category explicitly.

**Other deviations.**

1. `Entity.checkBelowWorld()` (discard below `minY - 64`) is not implemented; this engine has no void
   and clamps voxel reads instead.
2. Endermite's 2400-tick and warden's 1200-tick custom lifetimes are implemented in their own
   behaviour modules, not here, and are not asserted by this suite.
3. The wandering trader's 48000-tick timer lives in `wanderingTraderBehavior.js`; it can now actually
   remove its mob, which it could not before.
4. Egg-, command-, breeding- and spawner-spawned mobs are marked with their source and are excluded
   from the natural distance rule where vanilla excludes them; the persistence flag is the mechanism.

Tests: "the despawn constants match the spec", "a mob past 128 blocks is removed immediately; one at
exactly 128 is not", "the random despawn roll is only drawn when noActionTime exceeds 600", "being
within 32 blocks resets noActionTime", "a persistent mob is never removed for distance", "farm animals
do not despawn but cats and wandering traders do", "PEACEFUL removes hostiles but leaves hoglins,
piglins and shulkers", "fish despawn at 64 blocks, not 128", "the despawn distance is 3-D Euclidean,
not a cylinder", "mobs actually get removed as the player leaves them behind".

---

## PERSISTENCE PARITY — FUNCTIONAL

Persistent mobs are skipped by `checkDespawn` **and** excluded from both cap counts.

Honoured: `mob.persistent` (set by naming, leads, taming, picked-up equipment), `persistenceRequired`,
being a passenger (`mob.vehicle`), a carrying enderman, and a tamed animal. The engine's existing
`mobState.js` already persists `persistent` across save/load, so a named mob stays named and stays
persistent.

**Deviation.** Vanilla's persistence triggers are a longer list than the flags this engine carries:
a renamed spawn egg does *not* persist in Java (this engine treats any name as persistence), and
bred/tamed/converted origins are covered by their own behaviour modules rather than by a single query.
`requiresCustomPersistence(mob)` is the hook for a mob-specific answer.

---

## CHUNK UNLOAD / RELOAD — FUNCTIONAL

- `ChunkStreamer.unloadChunk` now calls `world.light.removeChunk`, so light data does not outlive its
  chunk.
- `World.getOrCreateChunk` calls `light.initChunk` and then the chunk-generation spawner, so a chunk is
  lit and any generated animals are placed exactly once.
- The chunk-generation spawner keeps its own `populated` set, so the streamer's border ring, the world
  start burst and `placePlayerOnSurface`'s padding cannot populate the same chunk twice.
- Mob persistence across save/load already existed (`mapManager.js` + `mobState.js`); the new fields
  `naturalSpawn`, `spawnCategory`, `spawnBiome`, `spawnSource` and `spawnStructure` are recorded on the
  mob but are **not** yet written to the save format. A reloaded mob therefore loses its spawn source.
  Recorded as a gap rather than assumed.
- `noActionTime` is not persisted, which is harmless: it resets to 0 on load, which is the conservative
  direction (a loaded mob is not despawned immediately).

---

## CHUNK-GENERATION SPAWNING — FUNCTIONAL

A separate system from the runtime cycle, in `src/spawning/chunkGenerationSpawner.js`, as the task
requires and as Minecraft's own structure expresses:

| | Chunk generation | Runtime cycle |
| --- | --- | --- |
| when | once, as the chunk is generated | every tick |
| cap | ignored | enforced |
| spawn costs | ignored | (not implemented) |
| structure overrides | ignored | applied |
| biome source | the chunk's north-west corner | the position's biome |
| Y per member | recomputed per member | constant for the pack |
| position | snapped to the column top | uniform over the whole column |

Implemented: one biome lookup per chunk at the north-west corner; the per-biome
`creature_spawn_probability` loop (0.03 badlands/eroded badlands, 0.04 wooded badlands, 0.07 snowy
plains/ice spikes, 0.1 default); the weighted CREATURE pick; the drawn pack size; up to four position
attempts per member with fresh offsets; the box nudged inside the chunk; Y from the mob's own
heightmap; the mob's own predicate.

**Deviations.**

1. The probability loop is capped at 16 iterations as a guard against a malformed table. Vanilla has no
   such cap; the loop terminates naturally because each iteration is an independent probability check.
2. The biome is taken at the chunk's north-west corner at the surface rather than at maximum world
   height, because this engine's `getBiome` is two-dimensional.
3. Generation-spawned animals are not marked persistent. In vanilla they are not persistent either
   (the wiki's "structure mobs do not despawn" applies to structure placement, not to chunk
   generation), so this matches; recorded for clarity.

---

## STRUCTURE-SPECIFIC SPAWNING — VERIFIED

**Generated, not hand-written.** `scripts/generate-mob-spawn-data.mjs` fetches each structure's
`spawn_overrides` block from the same pinned `1.21.4-data` branch as the biome tables and emits
`src/spawning/vanillaStructureSpawns.js`. `src/spawning/biomeSpawnResolver.js` consumes it through a
small alias map and keeps only the engine-specific knowledge (which engine structure id maps to which
generated id) plus one documented special case.

An override **replaces** the biome list for the categories it names (**no merge**); other categories
fall through to the biome.

Three cases are preserved as data, and the resolver must tell them apart:

| Case | Meaning | Example in 1.21.4 |
| --- | --- | --- |
| category key **absent** | the biome's list applies | the fortress says nothing about `creature`, so striders come from the biome |
| key present with **entries** | that list replaces the biome's | the fortress's `monster` list |
| key present and **empty** | natural spawning is **suppressed** for that category | the ocean monument's `axolotls` and `underground_water_creature`; all eight categories in `trial_chambers` and `ancient_city` |

Implemented from the data pack: nether fortress (`monster`, `piece`), ocean monument (`monster` plus
two suppression categories, `full`), pillager outpost (`monster`, `full`), swamp hut (`monster` and
`creature`, `piece`), and the full-suppression overrides for trial chambers and ancient city.
`bastion_remnant` and `end_city` are present with **no** categories, recording that they were checked
and have `spawn_overrides: {}` upstream.

`STRUCTURE_FULLY_SUPPRESSING` is **derived** from the data (every category present and empty) rather
than annotated by hand, so a structure that gains suppression categories upstream is picked up by
re-running the generator.

Each structure carries its **dimension**, which is what stops a Nether override from authorising an
Overworld spawn — see the dimension section.

The engine asks one question — `resolveSpawnList({ biomeId, category, x, y, z, structureAt })` — which
returns the entries, their source (`biome` / `structure` / `structure_suppressed` / `none`), the
structure id and the bounding box, so the debug overlay can report `STRUCTURE_OVERRIDE` rather than
leaving the player to guess why a blaze appeared in a soul sand valley.

**Deviations.**

1. **The override machinery is dormant in the running game, because the game places no structures.**
   This is the most important limitation in this section and it is a *precondition*, not a detail.
   `structureAt` is a caller-supplied predicate, and `main.js` wires it as
   `(x, y, z) => this.structureIdAt?.(x, y, z) ?? null`. **`structureIdAt` is never defined anywhere in
   `src/`**, so `structureAt` is permanently `null` and no override can ever apply.

   The reason there is no index to wire is upstream: `src/worldgen/` contains a real structure
   planner (`createStructureEngine`, with `planChunk` / `planArea` / `realize`), but the **only** caller
   is the Structure Inspector (`src/structureInspectorSession.js`). Nothing in the world-generation or
   tick path plans, realises or records a structure, and `world.netherFortresses` — the one store
   `witherSkeleton.js` consults — is never assigned by anything either. So the running game contains no
   fortresses, monuments, outposts, huts or trial chambers to stand inside.

   The override resolution itself is fully implemented and tested (it is what the structure tests
   exercise); what is missing is a world that contains structures. Wiring `structureIdAt` to
   `planChunk` would be roughly 0.1 ms per chunk in isolation, but it would produce a *structure id*
   without generating the structure's blocks, so mobs would be overridden in empty terrain. The honest
   fix is to generate structures first, which is a separate work package and is **not** claimed here.
2. **The nether fortress is not special-cased.** Vanilla short-circuits to a hard-coded
   `FORTRESS_ENEMIES` list and additionally requires nether bricks below the position. This
   implementation uses the fortress's JSON override without the nether-bricks condition, so the
   override also applies outside the brick corridors. `STRUCTURE_SPECIAL_CASES` names the case.
3. `boundingBox` (`piece` vs `full`) is **recorded per category and asserted by a test, but not
   enforced**, because the engine's structure records do not expose per-piece bounds to the spawner.
   Vanilla scopes a `piece` override to the individual structure pieces, so a fortress override does
   not reach the terrain between its corridors; this implementation would apply it to the whole area.

Tests: "a structure override replaces the biome list for the categories it names", "a category the
structure does not name falls through to the biome", "the fortress override matches the 1.21.4 data
pack", "the bastion has NO spawn override, so it must not invent one", "the monument and swamp hut
suppress the categories the data pack empties", "a structure with an empty override list suppresses
spawning rather than falling through", "a Nether structure override cannot authorise an Overworld
spawn", "the biome and structure mob-type sets are separate, and both are covered".

---

## SPECIAL SPAWNERS — PARTIAL

`src/spawning/specialSpawners.js` holds the non-natural mechanisms as a registry, so a mechanism that
is absent is visible rather than silent. None of them consumes the natural spawn RNG (they share a
separate `specialRandom`), and none counts against the mob caps — both are vanilla rules.

| Mechanism | Status | Notes |
| --- | --- | --- |
| Monster spawner block | FUNCTIONAL | 16-block activation sphere, 9×3×9 volume, 4 per batch, 200–799-tick delay, `MaxNearbyEntities` 6 |
| Trial spawner | FUNCTIONAL | 14-block radius, interval by player count, total budget 6 (+2/player), 4-block sphere, 36000-tick cooldown |
| Patrols | FUNCTIONAL | 5 in-game days, 20 % success, 1–5 pillagers, 24–48 blocks away, light ≤ 8, leader marked |
| Wandering trader | FUNCTIONAL | 24000-tick counter −1200/min, 25/50/75 %, 90 % failure, 10 attempts within ±48 |
| Phantoms | FUNCTIONAL | 72000-tick insomnia timer, 1200-tick attempts, `(x−72000)/x` chance, 21×15×21 box 28 above, density cap 5 |
| Village cats and iron golems | PARTIAL | Registered and driven by a village registry; the engine has no village/POI model, so with no village registered it does nothing |
| Raids | elsewhere | `raidManager.js` |
| Breeding | elsewhere | `animalBehaviors.js` |
| Zombie reinforcements | elsewhere | `zombifiedPiglin.js` (its own spec) |
| Zombie → drowned conversion | NOT STARTED | not modelled |

**Deviations.** The monster and trial spawner volumes are axis-aligned boxes rather than the vanilla
volumes; line-of-sight checks for the trial spawner are not implemented; the monster spawner does not
run the mob's own placement predicate, so a spawner could place a mob in a position natural spawning
would refuse.

Tests: the registry's presence and per-mechanism telemetry are asserted in the debug snapshot; the
mechanisms themselves have no differential test yet.

---

## DIFFICULTY — VERIFIED

`game.difficulty` is now a real property. It was previously read as `this.game?.difficulty ?? 'normal'`
in `mobs.js` and a dozen behaviour modules but **set nowhere**, so the default was doing all the work
and no caller could actually change it.

- PEACEFUL removes every category whose `requiresHostileDifficulty` is set (MONSTER only), so a
  Peaceful world has animals and no hostile natural spawning.
- The `monster` category is also removed from the filtered category list entirely, which is cheaper
  than refusing each position.
- The first branch of `checkDespawn` removes hostiles on Peaceful regardless of distance or
  persistence — except hoglins, zoglins, piglins and shulkers.
- Per-mob difficulty predicates already existed in the behaviour modules and continue to read
  `game.difficulty`.

Difficulty checks are not scattered: `validateGenericSpawn` owns the spawn-time one, `checkDespawn`
owns the despawn-time one, and the category filter owns the "run at all" one.

Tests: "PEACEFUL blocks every hostile placement regardless of light or position", "PEACEFUL spawns no
hostile mobs, and animals still spawn", "PEACEFUL removes hostiles but leaves hoglins, piglins and
shulkers".

---

## DIMENSION-SPECIFIC RULES — VERIFIED

- The light engine is **one instance per dimension**. The three dimensions reuse the same chunk keys
  (`0,0` names a chunk in each), so a single engine would answer with the Overworld's light while the
  player stood in the Nether.
- `skyDarkenForDimension` returns 0 for the Nether and the End: a dimension without sky light has no
  day/night cycle and no sky light to darken.
- `monsterSpawnBlockLightLimit` is 15 for the Nether (clause disabled) and 0 for the Overworld and the
  End.
- `sampleMonsterSpawnLightLevel` is the constant 7 for the Nether and `nextInt(8)` elsewhere.
- Nether biomes carry the Nether mobs and no bat category, from the generated data.

**Eligibility is derived from data, not from an allowlist.** `dimensionAllowsType(dimension, type)`
answers "may this mob spawn naturally in this dimension at all" by asking whether any spawn list
reachable in that dimension names it: the generated biome tables for the dimension's own biomes, plus
the generated structure overrides whose recorded `dimension` matches.

The previous implementation used hand-written `NETHER_MOB_TYPES` / `END_MOB_TYPES` sets, and they were
wrong in both directions:

- **Endermen were banned from the Nether**, although `nether_wastes`, `soul_sand_valley` and
  `warped_forest` all list `enderman`. Mojang describes natural Enderman spawning in all three
  dimensions.
- **Ordinary skeletons were banned from the Nether**, although the pinned fortress override lists them
  at weight 2.

The allowlists are retained in `mobSpawnManager.js` as documentation and for the special spawners, but
they no longer gate natural spawning. A test asserts that every mob named by any Nether biome's tables
is eligible in the Nether, so the gate cannot silently become a second, narrower filter.

**Deviation.** `has_ceiling`, `min_y` and the Nether's `fixed_time` from the dimension-type data are
not used; this engine's dimensions are its own construction with `CHUNK_HEIGHT` 64 and `minY` 0.

Tests: "a dimension with no sky light has no sky darken", "the Nether samples a constant light bound of
7 and the Overworld a uniform 0..7", "the Nether biomes carry the Nether mobs and no bat", "endermen
may spawn naturally in all three dimensions", "ordinary skeletons may spawn in the Nether, because the
fortress lists them", "mobs with no list in a dimension are refused there", "a Nether structure override
cannot authorise an Overworld spawn", "the dimension gate does not silently drop mobs the data lists".

---

## RANDOMNESS — VERIFIED

`src/spawning/spawnRandom.js` is a faithful `java.util.Random`: the same 48-bit LCG, the same
`next(bits)` truncation, the same `nextInt(bound)` rejection sampling, `nextDouble`, `nextFloat`,
`nextGaussian` and `Mth.triangle`.

Nothing in the spawn path calls `Math.random()`. The natural cycle draws from `world.spawnRandom`
(seeded from the world seed) and the special spawners from a **separate** `specialRandom`, because
vanilla's special mechanisms do not share the natural stream and sharing one would make a phantom roll
shift every subsequent natural spawn.

Which parts are deterministic: everything except the player's own movement. Given a seed, a fixed
player position and a fixed number of ticks, the sequence of spawn decisions replays exactly, which is
what the tests rely on.

Tests: "JavaRandom reproduces java.util.Random exactly" (asserted against the JDK's own values for
seed 42), "JavaRandom.nextInt(bound) is unbiased and in range", "JavaRandom.triangle produces a
triangular distribution, not a uniform one".

---

## PERFORMANCE — FUNCTIONAL

Measured on the development machine, 197 eligible chunks (a radius-8 world with the corners unloaded):

| Metric | Value |
| --- | --- |
| Light relight, steady state | 2.15 ms/chunk (289 chunks in 622 ms) |
| Light relight, first (cold, JIT) | ~6 ms/chunk |
| Spawn tick, average | 1.0–2.0 ms |
| Spawn tick, worst observed | 9.2 ms |
| Chunk-generation population | not separately measured |

The spawn pass is **budgeted** at 2.5 ms per tick, which vanilla does not do: a server's chunk loop
sits inside its 50 ms tick, while a browser frame gives 16 ms total and the spawn loop shares it with
rendering. Chunks skipped by the budget are re-collected next tick, and the shuffle means the same
chunks do not always lose. `telemetry().truncatedTicks` counts how often this happens.

Performance work done:

- the light relight precomputes opacity and emission for its 18×18×64 window and reads two typed arrays
  in the BFS inner loop instead of calling `world.getVoxel` per neighbour — this took a chunk from
  9.6 ms to under 1 ms;
- a direct-mapped chunk-data cache replaces template-string `Map` keys in the relight;
- the light relight is budgeted and spread across frames;
- the `SpawnState` is rebuilt on a cadence rather than per tick;
- caps are checked once per chunk, before any position work.

**Deviation.** Vanilla has no spawn budget. The budget changes *when* spawning happens, not *whether* —
but on a machine slow enough that the budget is always hit, the effective spawn rate would be lower than
vanilla's. Recorded rather than hidden, and visible as `truncatedTicks`.

---

## MULTIPLAYER — FUNCTIONAL

The architecture is multi-player from the start, even though the game is normally single-player:

- `players()` returns an array; `SpawnState` takes an array and unions the eligible-chunk sets.
- Overlapping squares are counted once, so two players together do not raise the cap (asserted).
- The per-player cap has one bucket per player.
- `nearestPlayer` resolves the nearest non-spectator player and reports its index, which is what the
  local cap uses.
- `MobSpawnManager.players()` currently returns the single local player; adding a remote player is a
  change to that one method, not to the subsystem.

**Deviation.** The local cap applies the chunk owner's budget rather than vanilla's "any player with
room" OR. See the local-cap section.

---

## DEBUG OVERLAY — FUNCTIONAL

`src/spawning/spawnDebugOverlay.js`. `formatSpawnDebug(snapshot)` renders, as copy-pasteable text:

current difficulty and dimension; world time and the resolved skyDarken; spawn ticks; eligible chunk
count against the cap square; chunks awaiting relight; the full cap table with counts, caps and a
`FULL` marker; attempt counts (chunks, groups, positions, spawns) and success rate; tick cost;
**rejection reasons sorted by frequency with a plain-English explanation each**; spawns by mob and by
biome; despawn counts by reason and by mob; the last 12 attempts with their position, biome, mob and
reason code; and per-minute rates once a window closes.

Rejection codes are machine-readable (see the placement section) and every code has an explanation,
which is asserted by a test so a new code cannot be added without a row.

`installSpawnDebugOverlay({ game, element })` refreshes a DOM element on a timer. The game's debug
panel is the natural host; `game.spawnManager.debugSnapshot()` and
`game.spawnManager.telemetry.snapshot()` are the two entry points for an agent or a console.

---

## TELEMETRY — FUNCTIONAL

`src/spawning/spawnTelemetry.js` accumulates per-minute windows: spawn attempts and successes,
despawns, attempts and successes by category, failures by reason, spawns by biome, eligible chunk
count, and average spawn distance.

Always on, because the counters are a handful of integer increments next to the position validation,
and a metric that has to be enabled is a metric that is not there when the bug happens.

---

## DETERMINISTIC TESTING — FUNCTIONAL

**141 spawning tests, all passing**, across five files:

| File | Tests | Subject |
| --- | --- | --- |
| `mobSpawningParity.test.js` | 91 | caps, the light rule, generated tables, structures, despawning, difficulty, dimensions |
| `spawnPlacementRegression.test.js` | 28 | collision, fluids, heightmaps, aquatic species rules, RNG enumeration, distance boundaries, and the registry-wiring regression |
| `spawnEligibilityRegression.test.js` | 10 | per-member biome membership, structure provenance, dimension eligibility |
| `spawnConstructionIntegration.test.js` | 7 | the real spawner and constructor path, pack walks, chunk-generation validation |
| `mobSpawningTravel.test.js` | 5 | the travel regression |

All five are registered in the `mob` area of `scripts/test.mjs`, so `npm run test:mob` includes them.

They assert against external numbers, not against the implementation:

- the JDK's own `java.util.Random` output for seed 42;
- the caps, despawn distances and `isPersistent` flags of the 1.21.4 category table;
- the cap formula's `289` and the union-over-players behaviour;
- the 128-block chunk-centre eligibility test including its strict inequality;
- the three-part monster light rule with its worked probabilities (about 33 % at a night surface,
  100 % in a dark cave, 0 % in daylight);
- the `nextInt(32)` / `nextInt(8)` draw order;
- `skyDarken` 0/3/5/11;
- the uniform-over-the-column Y draw;
- the triangular pack offset distribution, against its exact probabilities (24/36 within ±2, 2/36 at ±5);
- the raw weight ratios of the plains table (sheep 12, pig 10, chicken 10, cow 8, horse 5 2–6,
  donkey 1 1–3) against `misode/mcmeta@1.21.4-data`;
- the structure overrides and their bounding boxes from the same data, including the empty-suppression
  categories and the fact that bastions have none;
- the ghast's 95 % failure rate **enumerated over all 20 RNG outcomes** rather than sampled, because a
  sampled test does not reliably catch an inverted comparison;
- every spawn rejection code having an explanation;
- every mob named by a biome table having a placement **and** being constructible by the engine (the
  latter parsed out of `spawnMobs`'s own dispatch switch, so it cannot drift);
- the light engine's constants agreeing with `world.js`'s;
- **that importing only the spawner populates the placement registry** — the shape the game uses, and
  the regression that pins the fish-on-ice defect;
- that a refused position produces **zero** constructor calls, rather than a spawn that is created and
  deleted afterwards.

The fixture worlds are hand-authored (`tests/helpers/spawnFixture.js`) rather than generated, because
a test that has to *find* suitable water in random terrain can pass by never finding any. The previous
water test did exactly that: it returned early when the seed produced no sea, asserting nothing.

Golden scenarios are covered by the end-to-end tests (plains day, plains night, PEACEFUL, night
without animals, monochrome and multi-biome worlds) and by `scripts/spawn-smoke.mjs`, which prints a
per-scenario population and rejection report for plains, desert, ocean, Nether, mushroom fields and an
all-biomes world.

Full golden test **worlds** as data fixtures do not exist; the scenarios are generated from seeds. That
is a deviation from the task's section 32 and is recorded rather than claimed.

---

## TRAVEL REGRESSION — VERIFIED

`scripts/spawn-travel.mjs` moves a player 800 blocks in 100-block steps, streaming chunks the way the
game does (generate ahead, unload behind) and simulating 12 s at each stop.

Measured:

| At | Mobs | Near original spawn | Near the player | Above ground | Below |
| --- | --- | --- | --- | --- | --- |
| spawn | 129 | 129 | 0 | 34 | 95 |
| x=108 | 80 | 74 | 6 | 32 | 48 |
| x=208 | 61 | 20 | 41 | 30 | 31 |
| x=408 | 72 | 10 | 62 | 25 | 47 |
| x=808 | 76 | 10 | 66 | 51 | 25 |

Despawns over the trip: **337 hard** (beyond 128 blocks) and 25 random. Spawns covered **18 biomes**.

The script asserts, and fails if any is false: mobs exist at the end of the trip; mobs exist far from
the original spawn; the old area is not the only place with mobs; mobs kept despawning as the player
travelled; spawns cover more than one biome.

**The test fails against the previous implementation** — not because the spawn rate changed, but
because before this work there was no code path that could create a mob away from the start point at
all. That is the underlying defect the task describes, and this is the test that pins it.

---

## PARITY: WHAT IS NOT DONE

Recorded deliberately rather than implied by a green test suite.

1. **Spawn costs / spawn density** (warped forest and soul sand valley). Vanilla limits these two
   biomes with a charge-per-distance potential. Not implemented. Both biomes therefore spawn more than
   vanilla at the same mob count, and the parity document claims no parity for `soul_sand_valley` or
   `warped_forest` density.
2. **Ancient city / trial chambers** are suppressed, but neither structure has its own generation-driven
   mob placement.
3. **Entity-vs-entity collision** at spawn time is not checked.
4. **The `mobs.js` ad-hoc spawners are retired, not deleted.** `updateSquidSpawning`,
   `updateStriderSpawning`, `updateWitherSkeletonSpawning` and `updateDonkeySpawning` still exist and
   are still exported (tests and inspectors call their `spawn*` helpers), but nothing drives them from
   the tick loop. Their caps and search patterns are now dead code that should be removed once their
   tests are rewritten against the natural cycle.
5. **The spawn source fields are not saved.** `naturalSpawn`, `spawnCategory`, `spawnBiome`,
   `spawnSource`, `spawnStructure` are on the mob but not in the save format, so a reloaded mob loses
   them.
6. **`isMaxGroupSizeReached`** and **`finalizeSpawn` group-data threading** are not implemented.
7. **Moon phase** is not modelled; the swamp slime moon roll is a flat 50 %.
8. **Slime chunks** use a coordinate hash, not vanilla's seed-derived chunk flags.
9. **Village cats and iron golems** only run when a village is registered, which nothing currently does.
10. **`dappled_forest`** is a 1.21.5+ biome; borrowing `forest` here means this engine's `dappled_forest`
   has a table vanilla 1.21.4 does not have a definition for.
11. **`sulfur_caves` borrows `lush_caves`**, which is generous: a sulfur cave in this engine can spawn
    axolotls and tropical fish, which vanilla would not do.
12. **The spawn budget** can lower the effective spawn rate on a slow machine.
13. **Golden test worlds as data fixtures** do not exist; scenarios are seed-driven.
14. **`bounding_box` (`piece` vs `full`) is recorded but not enforced.** The generated structure data
    carries vanilla's value per category, and the parity test asserts it, but the engine's structure
    records do not expose per-piece bounds to the spawner, so an override applies to the whole
    structure area. This means a fortress override also applies outside its brick corridors.
15. **The Nether fortress is not special-cased.** Vanilla short-circuits to a hard-coded
    `FORTRESS_ENEMIES` list and additionally requires nether bricks below the candidate; this
    implementation uses the structure JSON override without the block requirement.
    `STRUCTURE_SPECIAL_CASES` in `src/spawning/biomeSpawnResolver.js` names the case.
16. **The drowned's exact light rule is INFERRED, not verified.** The wiki's hostile bullet lists
    "guardians, drowned and phantoms" as exempt from the solid-floor and block-light restrictions,
    which is about the FLOOR, so the full `Monster.isDarkEnoughToSpawn` rule is applied. Whether
    1.21.4's `Drowned.checkDrownedSpawnRules` uses the full three-part rule or a reduced form was not
    confirmed against source. Treating drowned as light-independent would be the larger claim, so the
    conservative reading is implemented and flagged here.
17. **The axolotl's clay rule uses "directly below"** rather than vanilla's distance-to-clay form. The
    plan flags the distance form as worth verifying; the immediate form is what the wiki's wording
    states, and the difference is unverified rather than guessed.
18. **Slime chunks and moon phase** (items 7 and 8) remain flat substitutes, as above.

## Confirmed-absent vs. approximated

For a reviewer's convenience, the rules that are *absent* rather than approximate: spawn costs,
entity-vs-entity collision at spawn time, `bounding_box` enforcement, per-block light opacity tables,
shape-aware directional light opacity, world border, void cull, moon phase, per-chunk slime flags,
block tags (`prevent_mob_spawning_inside`, `bats_spawnable_on`), trial spawner line of sight, and
zombie→drowned conversion.

## Rules that WERE wrong and are now fixed

Listed separately from the "not done" section above, because these are corrections rather than missing
features. Each has a test.

| Rule | The error |
| --- | --- |
| Placement registry wiring | nothing imported the module that registers placements, so every mob used the unregistered default — this is what produced fish on ice |
| Bounding box for fluid placements | `IN_WATER` / `IN_LAVA` / `NO_RESTRICTIONS` skipped the box test |
| `WORLD_SURFACE` heightmap | skipped non-motion-blocking blocks, so a flower did not count and the candidate-Y bound was a block low |
| Per-member pack eligibility | a pack kept its origin species across a biome or structure boundary |
| Nether / End dimension gate | banned Endermen from the Nether and ordinary skeletons from fortresses |
| Tropical-fish lush-cave exemption | unreachable: the elevation band was tested first |
| Squid and dolphin | given the fish's "water above" requirement, which the wiki states only for fish |
| Glow squid | given the ocean sea-level band rather than its own depth rule |
| Ghast spawn chance | inverted: accepted 19 of 20 instead of 1 of 20 |
| Drowned light rule | no light test at all |
| Chunk-generation placement | no spatial validation; a missing predicate meant "allowed" |
| Bastion structure override | invented; the data pack gives bastions no override |
| Structure override data | hand-written rather than generated, and missing the monument's and swamp hut's suppression categories |




