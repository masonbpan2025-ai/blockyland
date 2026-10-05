# Mob spawning architecture

How the spawning subsystem is put together, why it is split the way it is, and where each Minecraft
concept lives in the code.

Target version and rule provenance: [MOB_SPAWNING_PARITY.md](MOB_SPAWNING_PARITY.md). References and
licences: [MOB_SPAWNING_REFERENCES.md](MOB_SPAWNING_REFERENCES.md). Working research notes:
[research/mob-spawning-1.21.4.md](research/mob-spawning-1.21.4.md).

---

## 1. The problem this replaces

Before this subsystem, mob creation happened in exactly four places:

1. the spawn-egg chain in `main.js`;
2. the `/summon` command in `main.js`;
3. the agent's own spawn dispatch in `worldAgent.js`;
4. four ad-hoc per-tick functions in `mobs.js` — `updateSquidSpawning`, `updateStriderSpawning`,
   `updateWitherSkeletonSpawning`, `updateDonkeySpawning`.

Nothing else could create a mob. The four ad-hoc functions each hard-coded a cap and a search ring
around the player (`updateSquidSpawning` searched 24–88 blocks from the player at a 5-squid cap;
`updateWitherSkeletonSpawning` 24–64 blocks at 5; `updateStriderSpawning` a ±16 lava scan). They
covered four species out of ninety-odd.

So a world contained whatever those four species produced near wherever the player happened to be, and
nothing anywhere else, ever. That is the reported bug exactly: mobs near spawn and nowhere else, because
past the first few hundred blocks there was **no code path that could create a mob at all**.

There was also no despawning and no `MobManager.removeMob`. `wanderingTraderBehavior.js` already called
`this.removeMob?.(mob)` behind an optional chain, so a timed-out trader was never removed and nothing
reported it. Every other removal path in the codebase open-coded the scene teardown, in five slightly
different versions.

---

## 2. Module map

```
src/spawning/
  mobSpawnManager.js        the top-level owner; the engine adapter; the tick driver
  naturalSpawner.js         the continuous per-tick cycle (the core)
  chunkGenerationSpawner.js CREATURE groups as terrain is generated (separate system)
  despawnManager.js         Mob.checkDespawn, and the cap space it frees
  specialSpawners.js        every non-natural mechanism, as a registry
  spawnState.js             eligible chunks, caps, per-player counts, snapshots
  mobCategories.js          the eight categories, their caps, and the type->category map
  biomeSpawnResolver.js     biome table + structure override -> a weighted list
  vanillaBiomeSpawns.js     GENERATED: the 1.21.4 biome spawn tables
  spawnPlacements.js        the placement registry (type, heightmap, predicate)
  spawnValidation.js        generic position validation + the rejection codes
  mobSpawnPredicates.js     per-mob rules, composed from shared helpers
  lightEngine.js            sky/block light propagation (a prerequisite, see below)
  spawnClock.js             fixed-timestep tick accumulator + the skyDarken model
  spawnRandom.js            a faithful java.util.Random
  spawnTelemetry.js         counters and per-minute windows
  spawnDebugOverlay.js      the readout and the rejection-code explanations
```

Supporting changes outside `src/spawning/`:

| File | Change |
| --- | --- |
| `src/world.js` | owns the per-dimension light engines and the seeded spawn RNG; `getLightLevel`, `getSkyLight`, `getBlockLight`; chunk creation lights the chunk and calls the generation spawner; `setVoxel` marks light dirty |
| `src/chunkStreamer.js` | unloading a chunk drops its light data |
| `src/mobs.js` | gains `removeMob`; the four ad-hoc spawners are retired from the tick loop |
| `src/main.js` | constructs the manager, ticks it, updates light, sets a real `game.difficulty` |

---

## 3. The tick flow

```
Game.animate(dt)                                    main.js
  └ MobSpawnManager.update(dt)
      ├ resolve skyDarken from the clock and weather
      ├ SpawnClock.advance(dt) -> whole game ticks (20/s, clamped to 5 per call)
      └ for each tick:
          ├ DespawnManager.advanceNoActionTime()    every mob, every tick
          ├ DespawnManager.tick(players)            remove -> invalidate the cached SpawnState
          ├ NaturalSpawner.tick(players)
          └ SpecialSpawnerRegistry.tick(players)
```

`NaturalSpawner.tick`:

```
1. buildState(players)                      rebuilt on a cadence, or when the player set moves
2. spawnPassives = tickCount % 400 == 0      the ONLY thing that makes animals rarer
3. filteredCategories(...)                   vanilla's four-term filter
4. collectSpawningChunks(state)              ALL eligible chunks, shuffled
5. for each chunk, for each category:
     spawnForChunk(category, chunk, state)
       ├ cap check, ONCE per chunk
       ├ pick the pack-centre position (uniform over the chunk, uniform over the column)
       ├ reject a centre in a solid full block
       └ spawnGroup(...) x3 group attempts
            ├ triangular offset from the previous member, Y constant
            ├ first legal attempt fixes the species AND the group size
            ├ resolveSpawnList (biome or structure override)
            ├ selectWeightedEntry
            ├ spawnMobAt -> generic validation -> the mob's predicate -> createMob
            └ cluster-size cap
```

Spawning runs **after** the mob update in the frame, so a mob spawned this frame is not also simulated
for a tick it was not alive for, and the despawn pass sees this frame's positions.

---

## 4. Why the tick clock exists

Minecraft spawns on a 20 Hz game tick; this engine updates from a variable `requestAnimationFrame`
delta. A per-category interval ("CREATURE every 400 ticks") is meaningless without a tick, and running
the spawner per frame would multiply every rate by the frame rate.

`SpawnClock` is a fixed-timestep accumulator: `advance(dt)` returns whole ticks and keeps the
remainder, so 10 seconds of simulation is 200 ticks whether the frames are 60 fps or 10 fps (asserted
by a test). It clamps the ticks per call so a long stall — a tab restore, a debugger breakpoint — does
not run thousands of ticks at once and freeze the page again; the clamped ticks are counted as
`droppedTicks` rather than silently lost.

---

## 5. Why a light engine was a prerequisite

Vanilla's hostile rule is a **light** rule: `Monster.isDarkEnoughToSpawn` refuses a position unless it
is dark enough, and "dark" is expressed in the 0–15 scale the lighting engine maintains.

This project had no such engine. `src/lighting.js` is eight `THREE.PointLight`s chosen for the camera
and has no concept of the light level at an arbitrary voxel, and `world.getLightLevel` did not exist.
Every spawn-ish check therefore guessed: `mobs.js` wrote `world.getLightLevel?.(…) ?? 15` (assume
daylight) and `packEquine.js` decided from the clock instead.

That is why spawning a monster in a cave was impossible to get right. A guess cannot distinguish a dark
cave from a lit field at noon, and in vanilla the two are the same rule.

So `src/spawning/lightEngine.js` was written first: sky light and block light, 0–15, propagated per
chunk with vanilla's downward no-attenuation rule, on a per-chunk dirty set with a time budget.

**Design notes that are easy to get wrong and cost real time to find:**

- The engine declares its own `CHUNK_SIZE_X/Z/HEIGHT` rather than importing them from `world.js`.
  `world.js` imports the engine to attach one; importing back would create a cycle that ESM resolves by
  handing one side a partially initialised namespace. A test asserts the two agree.
- Light is stored **per chunk**, and the relight window is the chunk plus a one-cell margin. The margin
  is read-only: if two adjacent chunks both wrote to it, the stored value would depend on relight order.
- The relight precomputes an opacity and emission field for its 18×18×64 window. Calling
  `world.getVoxel` per neighbour in the BFS cost 9.6 ms/chunk; two typed-array reads in the inner loop
  cost under 1 ms. Measured, not guessed.
- There is **one engine per dimension**. The three dimensions reuse the same chunk keys, so a single
  engine would answer with the Overworld's light while the player stood in the Nether.

---

## 6. Why the spawner is split this way

`NaturalSpawner` is the loop; everything it needs is a separate module with a single responsibility:

| Concept | Module | Why separate |
| --- | --- | --- |
| Which chunks may spawn, what the caps are, how full they are | `spawnState.js` | all three must come from ONE view of the world, or the caps leak |
| Which mobs may spawn here | `biomeSpawnResolver.js` | the biome table and the structure override are one question with two sources |
| Is this position legal | `spawnValidation.js` | identical for every mob; keeps the rejection codes in one place |
| Is this position legal for THIS mob | `mobSpawnPredicates.js` | changes between versions and per mob |
| How big is a pack, which species | `naturalSpawner.js` | the pack loop is inseparable from the attempt loop |
| When does a mob go away | `despawnManager.js` | the complement of spawning; it frees the cap space spawning needs |
| Non-natural mechanisms | `specialSpawners.js` | they share only the shape "a timer that calls createMob" |

The split that matters most is validation versus predicates. Collapsing them into one `canSpawn()` per
mob is what produces the familiar bug where forty mobs each reimplement a slightly different collision
check and three of them get it wrong. It also destroys diagnosability: `INVALID_FLOOR` is a generic
failure and `MOB_PREDICATE_FAILED` is a rule of the mob's, and they want different fixes.

---

## 7. The engine adapter surface

`MobSpawnManager` is the only place that knows about the game. It exposes, to the spawner:

| Method | Purpose |
| --- | --- |
| `createMob(type, x, y, z, options)` | build the mob; rolls a slime's size; records the spawn source |
| `dimensionsFor(type)` | the bounding box, from `MobManager.getMobDimensions` |
| `maxSpawnClusterSize(type)` | `Mob.getMaxSpawnClusterSize()` |
| `despawnDistanceFor(mob)` | by **type**, not category — squid 128 vs cod 64 |
| `isSolidAt(x, y, z)` | the voxel box test |
| `isFullSolidBlock(blockId)` | the pack-centre test |
| `biomeAt(x, y, z)` | the biome query |
| `canSpawnInDimension(type)` | the coarse dimension gate |
| `lightLevelAt(position)` | the despawn rule's brightness term |
| `removeMob(mob, reason)` | removal with no death, loot or XP |
| `structureAt(x, y, z)` | the caller-supplied structure lookup |

Two of these were written the wrong way first and both were caught by tests:

- `isSolidAt` originally delegated to `MobManager.isBlockSolid`. Chunk-generation population runs from
  `World.getOrCreateChunk`, which the world-start path reaches **before** `game.mobs` exists, so the
  delegated call would throw — or, worse, answer "not solid" and put every generated animal inside a
  hillside. It now answers from the block registry directly.
- `despawnDistanceFor` originally took a category and the despawn manager passed the mob, which
  silently produced `undefined`, fell back to 128, and left fish holding cap space out to 128 blocks.
  It now takes the mob type.

Keeping this surface explicit — rather than letting the spawner reach into `game` — is what makes the
whole subsystem drivable from a test with a stub world and no scene. The parity suite builds a real
`World` and a ~40-line stub mob manager and drives tens of thousands of spawn attempts.

---

## 8. Data flow for one spawn attempt

```
NaturalSpawner.spawnForChunk(category, chunkEntry, state)
  │  entry = { cx, cz, x, z }        from SpawnState.eligibleChunks
  │  state.ownerOf(cx, cz)           -> which player's cap budget applies
  │  state.canSpawnForCategoryLocal  -> CAP_FULL | LOCAL_CAP_FULL
  │
  ├─ pick the pack centre
  │    x, z uniform in the chunk; y = SpawnState-free uniform over [minY, WORLD_SURFACE+1]
  │    centre in a solid full block -> COLLISION, give up for this chunk
  │
  └─ x3 groups: NaturalSpawner.spawnGroup(...)
       │  maxAttempts = ceil(nextFloat()*4), replaced by the drawn group size on first success
       │
       └─ per member:
            x += nextInt(6)-nextInt(6); z += nextInt(6)-nextInt(6); y unchanged
            │
            ├─ first legal member: resolveSpawnList({ biomeId, category, x, y, z, structureAt })
            │     -> { entries, source: biome|structure|structure_suppressed|none, structureId }
            │     empty -> NO_SPAWN_ENTRIES, break the group
            │     water_ambient in a reduced biome -> 98% refusal (WRONG_BIOME)
            │     selectWeightedEntry
            │     packSizeFor -> the real maxAttempts
            │
            └─ spawnMobAt(type, category, x+0.5, y, z+0.5, ctx)
                 │  predicateContext: blockAt, blockBelow, skyLight, blockLight, skyDarken,
                 │                    thunder, isNight, lightLevel, biomeId, structureId, difficulty
                 ├─ validateGenericSpawn   -> a SpawnRejection code
                 ├─ the mob's own predicate -> MOB_PREDICATE_FAILED
                 ├─ manager.createMob       -> null becomes MOB_PREDICATE_FAILED with a detail
                 ├─ state.noteSpawned (reporting only; NOT a cap re-check)
                 └─ telemetry + onSpawn
```

---

## 9. The rejection-code contract

Every refusal is counted under a machine-readable code, and every code has a row in
`spawnDebugOverlay.js`'s explanation table. A test asserts the table covers the enum, so a new code
cannot be added without a human-readable explanation.

`NO_WORLD`, `CHUNK_NOT_LOADED`, `OUT_OF_WORLD_BOUNDS`, `TOO_CLOSE_TO_PLAYER`, `TOO_FAR_FROM_PLAYER`,
`CAP_FULL`, `LOCAL_CAP_FULL`, `NO_SPAWN_ENTRIES`, `WRONG_BIOME`, `WRONG_DIMENSION`, `WRONG_FLUID`,
`INVALID_FLOOR`, `INVALID_LIGHT`, `COLLISION`, `DIFFICULTY_BLOCKED`, `MOB_PREDICATE_FAILED`,
`STRUCTURE_OVERRIDE`, `INVALID_BLOCK_BELOW`, `DISTANCE_RULE_DISABLED`.

The overlay sorts them by frequency, so the top row of the readout is almost always the answer to "why
is nothing spawning here".

---

## 10. Persistence and lifecycle

| State | Where | Lifetime |
| --- | --- | --- |
| Light arrays | `LightEngine.chunks` | dropped when the chunk is unloaded |
| Population until the next idle tick | `SpawnState`, cached on the manager | rebuilt on a cadence or when the player set moves |
| Chunks already generation-populated | `ChunkGenerationSpawner.populated` | the world's lifetime; cleared on reseed |
| Special-spawner registrations | each mechanism's own map | until the block is broken |
| Per-mob spawn source | on the mob | not yet written to the save format |

The `SpawnState` cache key includes the player's **full position**, not just the chunk. The chunk alone
is not enough: a mob at the edge of a player's sphere goes out of range as the player crosses the
chunk, and a count cached before that would hold cap space the rules no longer assign.

---

## 11. Multi-player shape

The subsystem is multi-player from the start even though the game is normally single-player:

- `players()` returns an array; `SpawnState` takes an array and unions the eligible-chunk sets;
- overlapping cap squares are counted once;
- the per-player cap has one bucket per player;
- `nearestPlayer` reports the nearest player's index, which the local cap uses;
- alternating attempts across players is not implemented (vanilla iterates the chunk list once, not per
  player), but adding a remote player is a change to `MobSpawnManager.players()` alone.

---

## 12. Testing shape

The parity suite builds a real generated `World` plus a small stub mob manager. The stub is deliberate:
it makes a spawn attempt's inputs and outcomes observable without a scene, so a test can assert on
*where* a mob was placed and *what the light was there*, rather than on a mob count.

Two measurement mistakes were made while developing this and are worth recording, because both produced
confident wrong answers:

1. **Reading light at a re-derived position.** The spawner floors with `Math.floor`, and
   `Math.floor(-14.5)` is `-15`; a later comparison against a differently-rounded copy read a
   neighbouring column. Three successive measurements of the light rule disagreed before this was
   traced. The harness now captures light **inside the predicate**, at the exact block the spawner
   tested.
2. **Measuring "on the surface" as `y >= highestSolidY`.** That counts a mob under a tree canopy as
   above ground and a mob on a hillside as underground, and mobs move after spawning, so the
   measurement drifts. Sky light at the spawn position is the quantity the rule actually reads.

Both are the same class of error: measuring a proxy for the rule instead of the rule.

---

## 13. Extension points

Adding a mob: give it a placement registration in `mobSpawnPredicates.js` (a test fails until every mob
named by a biome table has one), and make sure `spawnMob`'s dispatch can build it (also asserted, by
parsing the switch).

Adding a biome: add it to the engine registry. It then needs either a vanilla table (re-run
`scripts/generate-mob-spawn-data.mjs`) or an entry in the generator's alias map. A test fails until
every engine biome resolves.

Adding a structure override: add it to `STRUCTURE_SPAWN_OVERRIDES` with its `boundingBox` and category
lists, from the data pack.

Adding a special spawner: add a mechanism object with `name` and `tick(players)` to
`SpecialSpawnerRegistry.mechanisms` and an `enabled` entry. It must not draw from the natural spawn RNG
and must not count against the caps.
