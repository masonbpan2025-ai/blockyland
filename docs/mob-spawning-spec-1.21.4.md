# Natural Mob Spawning in Minecraft: Java Edition 1.21.4 â€” Clean-Room Behavioural Specification

**Audience:** an engineer re-implementing natural mob spawning in TypeScript/JavaScript.
**Target version:** Minecraft Java Edition **1.21.4** (data pack version 61, resource pack version 46), Overworld/Nether/End.
**Status of this document:** behavioural specification only. It contains **no verbatim Mojang or Paper-decompiled Java**. Method/class/field names are given because a re-implementation needs a vocabulary, and because they are the *architecture* a port must mirror; every behaviour is restated in prose or language-neutral pseudocode.

## How to read the citations

| Marker | Meaning |
| --- | --- |
| **[C]** | Confirmed against a primary artefact (vanilla data JSON, a javadoc/constant-value page generated from 1.21/1.21.4 mappings, or a Paper/Canvas patch diff whose *context* lines are vanilla 1.21.4 code). |
| **[W]** | Sourced from minecraft.wiki (the revision pinned to the 1.21.4 era where possible). |
| **[I]** | Inference: consistent with all evidence seen, but I did not see the authoritative artefact. Treat as high-confidence, verify before shipping. |
| **UNVERIFIED** | I could not confirm it. Do not guess from this document. |

Version drift is called out inline as **1.21.5+** / **1.21.9+** / **Bedrock**.

### Primary artefacts used

* Vanilla **1.21.4 generated data**, extracted by misode/mcmeta at tag `1.21.4-data` â€” biomes, dimension types, structures. Fetched file-by-file, e.g.
  <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/biome/plains.json>,
  <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/dimension_type/overworld.json>,
  <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/structure/fortress.json>.
* **PaperMC/Paper**, branch `ver/1.21.4`, patch files (vanilla code appears in diff **context** lines; I read them, I did not copy them):
  `NaturalSpawner.java.patch`, `Mob.java.patch`, `Monster.java.patch`, `ServerChunkCache.java.patch`, `ChunkMap.java.patch`, `DistanceManager.java.patch`
  under <https://github.com/PaperMC/Paper/tree/ver/1.21.4/paper-server/patches/sources/net/minecraft>.
* **CraftCanvasMC/Canvas** (Folia/Paper fork) per-file patches under
  <https://github.com/CraftCanvasMC/Canvas/tree/main/canvas-server/minecraft-patches/sources/net/minecraft> â€” used because Canvas's diffs are wider, exposing more vanilla context.
* **NeoForge 1.21.0 javadoc** generated from 1.21 mappings â€” <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/> (signatures + a constant-values page). 1.21.0â†’1.21.4 method names in this area are stable except where noted.
* **minecraft.wiki**, pinned revision of `Mob spawning` from 2025-02-24 (`revid 2874883`) â€” <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> â€” used instead of the live page, because the live page already documents 1.21.9+/26.x content.
* minecraft.wiki `Light`, revision 2025-02-22 (`revid 2872432`) â€” <https://minecraft.wiki/w/Light?oldid=2872432>.

> **Version caveat.** minecraft.wiki's live pages document the latest version (they already list `camel_husk`, `parched`, `sulfur_cube`, `copper_golem`, `mannequin`, and the `spawnMonsters` gamerule added in 25w35a). Numbers taken from the pinned revisions or from `1.21.4-data` are 1.21.4-accurate; live-page numbers are marked as such.

---

## 1. MobCategory

`MobCategory` is an enum in `net.minecraft.world.entity` implementing `StringRepresentable`. It has exactly **eight** constants in 1.21.4, declared in this order (order = `ordinal()` and therefore iteration order of `values()`): **MONSTER, CREATURE, AMBIENT, AXOLOTLS, UNDERGROUND_WATER_CREATURE, WATER_CREATURE, WATER_AMBIENT, MISC**. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/MobCategory.html>

Its private constructor has the shape `MobCategory(String name, int max, boolean isFriendly, boolean isPersistent, int despawnDistance)`, and the class has exactly these private fields: `max`, `isFriendly`, `isPersistent`, `name`, `noDespawnDistance`, `despawnDistance`. [C] (same javadoc)
`noDespawnDistance` is a single constant for the whole enum, hard-coded to **32**. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/constant-values.html> (`net.minecraft.world.entity.MobCategory.noDespawnDistance = 32`)

### 1.1 The table

| Constant | `getName()` | `getMaxInstancesPerChunk()` | `getDespawnDistance()` | `getNoDespawnDistance()` | `isFriendly()` | `isPersistent()` | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MONSTER` | `"monster"` | **70** | **128** | 32 | `false` | `false` | [W] cap; [C] noDespawn 32; [I] 128/true-false flags |
| `CREATURE` | `"creature"` | **10** | **128** | 32 | `true` | `true` | [W] cap; [C] noDespawn |
| `AMBIENT` | `"ambient"` | **15** | **128** | 32 | `true` | `true` | [W] cap; [C] noDespawn |
| `AXOLOTLS` | `"axolotls"` | **5** | **128** | 32 | `true` | `true` | [W] cap; [C] noDespawn |
| `UNDERGROUND_WATER_CREATURE` | `"underground_water_creature"` | **5** | **128** | 32 | `true` | `true` | [W] cap |
| `WATER_CREATURE` | `"water_creature"` | **5** | **128** | 32 | `true` | `true` | [W] cap |
| `WATER_AMBIENT` | `"water_ambient"` | **20** | **64** | 32 | `true` | `true` | [W] cap + fish 64-block rule |
| `MISC` | `"misc"` | **âˆ’1** | **128** | 32 | `false` | `true` | [W] cap âˆ’1; [I] flags |

Cap values are confirmed by both the pinned 1.21.4-era wiki table [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> and the live wiki [W] <https://minecraft.wiki/w/Mob_spawning>. `MISC = âˆ’1` is a sentinel meaning "no cap"; `MISC` is excluded from the spawner's category array (see Â§4.2), so its `âˆ’1` is never used in the cap arithmetic.

**`WATER_AMBIENT` = 64 is the one non-128 despawn distance.** The wiki states "Mobs other than fish despawn immediately if no player is within 128 blocks of it, while fish despawn if no player is within **64** blocks", citing snapshot 20w10a. [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

### 1.2 The three flags, and what they actually do

* **`isFriendly()`** is *not* "is this mob friendly". It is a **gate selector**: in the per-tick category filter (Â§4.3) a category is only considered if `spawnFriendlies || !isFriendly()` **and** `spawnEnemies || isFriendly()`. So `isFriendly() == false` (only `MONSTER`) requires the "enemies may spawn" flag, and `isFriendly() == true` requires the "friendlies may spawn" flag.
* **`isPersistent()`** is the **400-tick / "passive" gate**: a category is only considered if `spawnPassives || !isPersistent()`. `spawnPassives` is true only on ticks where `gameTime % 400 == 0` (Â§4.2). So `MONSTER` (`isPersistent=false`) is attempted **every tick**, while every other category is attempted **only every 400 ticks (20 s)**. This is the mechanism behind the wiki's "passive mobs have only one spawning cycle every 400 game ticks". [C] (Paper `NaturalSpawner`/`ServerChunkCache` context) + [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>
* **`getDespawnDistance()` / `getNoDespawnDistance()`** drive Â§10.

Terminology note: the names are confusing. In this document I use **"400-tick categories"** for `isPersistent()==true` and **"every-tick category"** for `MONSTER`.

### 1.3 Which category a given mob belongs to (1.21.4)

Derived from the `spawners` blocks of the 1.21.4 biome JSON (full data in Â§16) and from the wiki's per-category membership lists [W].

* `MONSTER`: zombie, zombie_villager, husk, drowned, skeleton, stray, bogged, wither_skeleton, creeper, spider, cave_spider, slime, magma_cube, enderman, endermite, witch, blaze, ghast, guardian, elder_guardian, shulker, silverfish, phantom, piglin, piglin_brute, hoglin, zoglin, zombified_piglin, pillager, vindicator, evoker, illusioner, ravager, vex, warden, breeze, creaking, giant, wither, ender_dragon, ocelot (**yes â€” ocelot is MONSTER, weight 2 in jungle**).
* `CREATURE`: sheep, cow, pig, chicken, horse, donkey, mule, wolf, cat, ocelot-free list otherwise, fox, rabbit, panda, parrot, polar_bear, turtle, llama, trader_llama, goat, frog, camel, armadillo, sniffer, allay, bee, strider, wandering_trader, tadpole, skeleton_horse, mooshroom, happy_ghast.
* `AMBIENT`: bat only.
* `AXOLOTLS`: axolotl only.
* `UNDERGROUND_WATER_CREATURE`: glow_squid only.
* `WATER_CREATURE`: squid, dolphin.
* `WATER_AMBIENT`: cod, salmon, pufferfish, tropical_fish.
* `MISC`: villager, iron_golem, snow_golem, copper_golem, plus all non-mob entities (players, items, boats, â€¦).

`AXOLOTLS` and `UNDERGROUND_WATER_CREATURE` were split in 21w37a; before that they shared one cap. **1.21.4 keeps the split.** [W]

---

## 2. The global mob cap

### 2.1 Formula

```
globalCap(category) = floor( category.getMaxInstancesPerChunk() * spawnableChunkCount / 289 )
spawn allowed  <=>  currentCount(category) < globalCap(category)
```

* `289` is the constant `NaturalSpawner.MAGIC_NUMBER` (package-private `static final int`). It is referenced in the cap arithmetic in the 1.21.4 patch context: `int i = limit * this.spawnableChunkCount / NaturalSpawner.MAGIC_NUMBER;` [C] (Paper `NaturalSpawner.java.patch` hunk at `@@ -501,8 +_,10 @@`). The **value** 289 comes from the wiki's explicit formula `globalCap = mobCap Ã— chunks Ã· 289` [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>; `MAGIC_NUMBER` itself has no entry on the JavaDoc constant-values page (it is package-private), so **289 is [W], not [C]**.
* `289 = 17 Ã— 17`. The wiki's History section states: "The spawning area used to be 17Ã—17 chunks rather than 15Ã—15. The area was reduced, but the old size is still used to calculate mob caps." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> So the divisor is a *frozen legacy constant*: the cap scale no longer matches the actual spawn-radius area.
* **Rounding is integer division (floor toward zero)**. `spawnableChunkCount` â‰¥ 0 and the numerator â‰¥ 0, so floor == truncation. There is **no** `Math.max(1, â€¦)` clamp in the cap expression [C] (the expression is exactly `limit * spawnableChunkCount / MAGIC_NUMBER`). With one player and a normally-loaded view, `spawnableChunkCount` is close to 289, giving a monster cap of `70 * 289 / 289 = 70`.
* The **group size is not considered** when checking the cap: "The mob caps are checked once for each spawn-eligible chunk. The group size in which particular mobs spawn is not taken into account, meaning the spawning of a group of mobs may cause the total number of mobs for that category to exceed the respective cap." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

### 2.2 What is counted

`NaturalSpawner.createState(spawnableChunkCount, entities, chunkGetter, localMobCapCalculator)` walks every loaded entity in the level and, for each one:

1. Skips it if `entity instanceof Mob && (mob.isPersistenceRequired() || mob.requiresCustomPersistence())` â€” i.e. **persistent mobs are not counted**. [C]
2. Reads `category = entity.getType().getCategory()`; skips `MISC`. [C]
3. Increments `mobCategoryCounts[category]`. [C]
4. Looks up `MobSpawnSettings.getMobSpawnCost(entityType)` for the entity's rough biome; if the biome defines a charge, adds it to a `PotentialCalculator` (`spawnPotential.addCharge(pos, charge)`). [C] â€” **the spawn-charge/"density" system still exists in 1.21.4**; see Â§9.6.
5. If a `LocalMobCapCalculator` was supplied, `localMobCapCalculator.addMob(chunk.getPos(), category)`. [C]

Critically: **the scan is over all loaded entities in the level, including entities in chunks that are not near any player and are not spawn-eligible.** [W] "All non-persistent loaded mobs are counted against the global cap, including those in chunks not in range of a player or eligible for spawns."

`SpawnState` is rebuilt periodically, not every tick â€” see Â§4.2.

### 2.3 `spawnableChunkCount`

* Named `NaturalSpawner.SPAWN_DISTANCE_CHUNK = 8` and `SPAWN_DISTANCE_BLOCK = 128` (both `public static final int`). [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/constant-values.html>
* It is the size of the **union of the squares of chunks within 8 chunks (Chebyshev) of each player**, counted **once per chunk** even when several players cover it. [W] "The cap is scaled by the total number of chunks within a 17Ã—17 chunk square around any player â€¦ Because chunks that are in the range of multiple players are counted once, more chunks and higher mob caps result from the players spreading out."
* 17Ã—17 = 289 is exactly the single-player maximum, which is why the divisor is 289: **one lone player in open terrain gives every category its nominal cap.**
* In vanilla the value comes from the chunk-distance bookkeeping (`DistanceManager`'s natural-spawn chunk counter, updated in `addPlayer`/`removePlayer`); Paper's `DistanceManager.java.patch` shows vanilla touching `this.naturalSpawnChunkCounter.update(packedChunkPos, Integer.MAX_VALUE, false)` when the last player for a chunk is removed [C]. The *exact* vanilla accessor name (`DistanceManager#getNaturalSpawnChunkCount` vs a `ChunkMap` delegate) is **UNVERIFIED** for 1.21.4 â€” but note that `ServerChunkCache` passes an `int chunkCount` into the two `NaturalSpawner.createState(...)` call sites in Canvas's 1.21.4-era patch [C], so the shape is "compute an int, hand it to `createState`".
* **Gamerule interaction:** the cap is computed and the spawn pass is skipped entirely when `doMobSpawning` is false. There is **no `spawn_mobs` gamerule in 1.21.4** â€” that was added in 25w35a (**1.21.9+**) and only toggles natural *monster* spawning. [W] <https://minecraft.wiki/w/Mob_spawning>
* Vanilla also skips the whole pass when there are no players: `doMobSpawning && !level.players().isEmpty()`. [C] (Paper context line)

---

## 3. `LocalMobCapCalculator` â€” the per-player cap

**Class:** `net.minecraft.world.level.LocalMobCapCalculator` (note: package is `world.level`, **not** `server.level`). [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/level/LocalMobCapCalculator.html>

Fields and public surface as of 1.21.4 [C] (same javadoc):
`Long2ObjectMap<List<ServerPlayer>> playersNearChunk`, `Map<ServerPlayer, MobCounts> playerMobCounts`, `ChunkMap chunkMap`; methods `getPlayersNear(ChunkPos)` (private), `addMob(ChunkPos, MobCategory)`, `canSpawn(MobCategory, ChunkPos)`; nested `static class MobCounts`.

### 3.1 Why it exists

It was added in the **1.18 experimental snapshot 3** together with "per-player mob caps", and the wiki describes it as the second of Java Edition's two caps: "Environmental mob spawning in Java Edition is subject to two mob caps, a global cap and a per-player cap." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

The purpose is to stop one player's farm from being starved by, or from starving, other players: the global cap scales with the union of all players' 17Ã—17 areas, so without a local cap two nearby players would let a single area accumulate twice the intended density.

### 3.2 Semantics

```
// build phase (inside createState, once per SpawnState rebuild)
for each loaded Mob entity E that is not persistent and not MISC:
    for each player P in chunkMap.getPlayersCloseForSpawning(E.chunkPos):   // see 3.3
        playerMobCounts[P].add(E.category)                                  // +1

// spawn phase (per chunk, per category)
canSpawnForCategoryLocal(category, chunkPos):
    for P in getPlayersNear(chunkPos):
        if localMobCapCalculator.canSpawn(category, P):   // P has room
            return true
    return false
```
* `canSpawn(category, player)` is true when that player's `MobCounts` entry for the category is **below the category's own cap**, i.e. `count < category.getMaxInstancesPerChunk()` â€” the same numbers as the global cap (**70** for `MONSTER`), just counted over a smaller area. [W] (the pinned wiki's "Per-player mob cap" section lists the same 70/10/15/5/5/5/20 numbers) + [I] for the exact comparison operator.
* A player with no entry in `playerMobCounts` counts as having room. [I]
* **A spawn is rejected by the local cap when *no* player that has this chunk in range still has room.** "For each chunk, spawns are only allowed if at least one player has that chunk in range and has not reached their per-player mob cap." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> This is an **OR over players**, not an AND.
* The rejection is per-category and happens **before** any position is chosen: the category simply is not attempted for that chunk this tick.

### 3.3 The local radius, and the "120 blocks" claim

* The player set for a chunk comes from `ChunkMap.getPlayersCloseForSpawning(ChunkPos)`, which uses the same predicate as chunk eligibility:
  `playerIsCloseEnoughForSpawning(player, chunkPos)` â†’ `false` if the player is a spectator, otherwise
  `euclideanDistanceSquared(chunkPos, player) < 16384.0`.
  16384.0 = 128Â², and the comparison is **strict `<`**. [C] (Paper `ChunkMap.java.patch`, context lines: `double d = euclideanDistanceSquared(chunkPos, player); return d < 16384.0;`)
* So the radius is **128 blocks from the chunk centre** â€” equivalently the Â±8-chunk square, i.e. the `SPAWN_DISTANCE_BLOCK = 128` / `SPAWN_DISTANCE_CHUNK = 8` pair. [C]
* **"120 blocks" is not a vanilla constant I could find anywhere in this subsystem.** The only 120 in the vicinity is `OminousItemSpawner.SPAWN_ITEM_DELAY_MAX = 120` (ticks), which is unrelated. Report "120" as **UNVERIFIED / probably a confusion**.
* Paper's description of its own "per-player mob spawns" option talks about an 8-chunk (128-block) spawn range, consistent with the above. [I]

### 3.4 Paper / forks

* **Paper** implements a different, more granular per-player system: when `entities.spawning.perPlayerMobSpawns` is enabled, Paper passes `null` for the `LocalMobCapCalculator` and instead gates each chunk on `chunkMap.getMobCountNear(player, category)` versus a per-player limit, with a "failure player mob type map" backoff. [C] (Paper `NaturalSpawner.java.patch` `spawnForChunk` hunk; Canvas `ServerChunkCache.java.patch` shows the two `createState` call sites: `â€¦ !this.level.paperConfig().entities.spawning.perPlayerMobSpawns ? new LocalMobCapCalculator(this.chunkMap) : null â€¦`)
* **Canvas/Folia** additionally regionises the whole thing (`RegionizedWorldData`). Not vanilla. [C]
* A re-implementation targeting vanilla 1.21.4 should implement the vanilla `LocalMobCapCalculator`, not Paper's replacement.

---

## 4. Spawn timing â€” the per-tick flow

### 4.1 `ServerChunkCache.tickChunks()` overview

Reconstructed from vanilla context lines in Paper's and Canvas's `ServerChunkCache.java.patch` [C]:

```
tickChunks():
    timeDiff = gameTime - lastInhabitedUpdate
    lastInhabitedUpdate = gameTime

    randomTickSpeed = gamerule(randomTickSpeed)
    doMobSpawning   = gamerule(doMobSpawning) && level.players().notEmpty()      // Paper context shows the && !players.isEmpty() as its own addition; treat "no players => no spawning" as [C] for Paper, [I] for vanilla

    // 1) build the spawn state (mob counts / caps) â€” only every 400 ticks (see 4.2)
    spawnState = lastSpawnState   // reused on ordinary ticks

    // 2) decide which categories may run this tick
    if doMobSpawning && (spawnEnemies || spawnFriendlies):
        spawnPassives = (level.getLevelData().getGameTime() % 400L == 0L)
        spawningCategories = NaturalSpawner.getFilteredSpawningCategories(
                                 spawnState, spawnFriendlies, spawnEnemies, spawnPassives)
    else:
        spawningCategories = []

    // 3) collect the candidate chunks, shuffle, then attempt each one
    spawningChunks = []
    chunkMap.collectSpawningChunks(spawningChunks)
    shuffleRandom.setSeed(level.getRandom().nextLong())
    Util.shuffle(spawningChunks, level.getRandom())     // Paper wraps this in "if (!perPlayerMobSpawns)"; treat the shuffle as vanilla
    for chunk in spawningChunks:
        tickSpawningChunk(chunk, timeDiff, spawningCategories, spawnState)

    // 4) block ticking happens in the same chunk loop (level.tickChunk)
```

`tickSpawningChunk(chunk, timeDiff, spawningCategories, spawnState)` increments the chunk's inhabited time, then:

```
tickSpawningChunk(chunk, timeDiff, categories, state):
    chunk.incrementInhabitedTime(timeDiff)
    if categories.notEmpty() && level.getWorldBorder().isWithinBounds(chunk.pos):
        NaturalSpawner.spawnForChunk(level, chunk, state, categories)
```
[C] (Paper patch: `if (!filteredSpawningCategories.isEmpty() && this.level.getWorldBorder().isWithinBounds(pos)) { NaturalSpawner.spawnForChunk(...) }`; Paper/Spigot adds an extra `chunkMap.anyPlayerCloseEnoughForSpawning(pos, true)` in the same condition â€” the vanilla condition is the two-clause form, which is why the extra clause appears as a `+` line.)

### 4.2 The 400-tick constants

| Quantity | Value | Where |
| --- | --- | --- |
| `spawnPassives` period | `gameTime % 400 == 0`, i.e. once per **400 ticks = 20 s** | [C] vanilla context `boolean flag = this.level.getLevelData().getGameTime() % 400L == 0L;` |
| `SpawnState` rebuild | the state is *not* rebuilt every tick. Canvas's patch shows exactly two branches around a cookie refresh, one of which passes `countMobs = true`; the vanilla driver rebuilds the counts roughly every 400 ticks (in practice tied to the same 20 s cadence as `spawnPassives`). **The precise gating expression is UNVERIFIED.** | [C] partial |
| `NaturalSpawner.MIN_SPAWN_DISTANCE` | **24** (blocks) | [C] constant-values page |
| `NaturalSpawner.SPAWN_DISTANCE_BLOCK` | **128** | [C] constant-values page |
| `NaturalSpawner.SPAWN_DISTANCE_CHUNK` | **8** | [C] constant-values page |
| `NaturalSpawner.MAGIC_NUMBER` | **289** | [W] |

**There is no per-category `spawnTickRate` table in 1.21.4.** Earlier designs (and CraftBukkit/Spigot's `ticks-per-spawn` config, which Paper exposes as `level.ticksPerSpawnCategory`) used a per-category interval, and you will see that shape in Paper's diff; **vanilla 1.21.4 instead uses the single boolean `spawnPassives`** plus the `isPersistent()` flag, i.e. two buckets: "every tick" (`MONSTER`) and "every 400 ticks" (everything else). [C] + [W]

**1.21.9+ note:** a `spawnMonsters` gamerule was added in 25w35a that disables natural monster spawning only. It does not exist in 1.21.4. [W]

### 4.3 Category filter â€” exact predicate

```
getFilteredSpawningCategories(spawnState, spawnFriendlies, spawnEnemies, spawnPassives):
    out = []
    for category in SPAWNING_CATEGORIES:          // = every MobCategory except MISC, in enum order
        if (spawnFriendlies || !category.isFriendly())
           && (spawnEnemies  ||  category.isFriendly())
           && (spawnPassives  || !category.isPersistent())
           && spawnState.canSpawnForCategoryGlobal(category):
            out.add(category)
    return out
```
[C] â€” verbatim branch structure visible in Paper's `NaturalSpawner.java.patch` context; the `canSpawnForCategoryGlobal` call is the only part Paper modifies (it substitutes a configurable limit for the enum cap).

`SPAWNING_CATEGORIES` is a private static array of the categories the spawner iterates; Canvas's optimisation comment plus its `for (MobCategory category : MobCategory.values()) { if (category == MobCategory.MISC) continue; }` confirms it is **all eight minus MISC**. [C] (Canvas `NaturalSpawner.java.patch`, `calculateLimits`) [I] for the array's exact definition.

`spawnFriendlies` / `spawnEnemies`: `spawnEnemies` is the "monsters may spawn" switch (false on Peaceful); `spawnFriendlies` is the "animals may spawn" switch. Note a **vanilla quirk** that Paper explicitly fixes: vanilla's `ServerChunkCache.setSpawnSettings(boolean)` contains `this.spawnEnemies = spawnEnemies; this.spawnFriendlies = this.spawnFriendlies;` â€” a self-assignment, so `spawnFriendlies` is not updated by that setter. Paper changes it to a two-argument setter. The **initialisation source of `spawnFriendlies` in vanilla 1.21.4 is UNVERIFIED**; for a re-implementation the useful contract is the semantic one above (animals still spawn on Peaceful, monsters do not). [C]

---

## 5. Candidate chunk selection

### 5.1 The pipeline

```
ChunkMap.collectSpawningChunks(List<LevelChunk> out)
    forEachSpawnCandidateChunk(holder -> {
        chunk = holder.getTickingChunk()
        if (chunk != null && anyPlayerCloseEnoughForSpawning(holder.getPos())) out.add(chunk)
    })

anyPlayerCloseEnoughForSpawning(ChunkPos p):
    distanceManager.hasPlayersNearby(p) && anyPlayerCloseEnoughForSpawningInternal(p)

anyPlayerCloseEnoughForSpawningInternal(ChunkPos p):
    for player in playerMap.getAllPlayers():
        if playerIsCloseEnoughForSpawning(player, p): return true
    return false

playerIsCloseEnoughForSpawning(player, chunkPos):
    if player.isSpectator(): return false
    return euclideanDistanceSquared(chunkPos, player) < 16384.0
```
[C] â€” `anyPlayerCloseEnoughForSpawning`, `anyPlayerCloseEnoughForSpawningInternal`, `playerIsCloseEnoughForSpawning`, `getPlayersCloseForSpawning`, and the sibling method name `forEachSpawnCandidateChunk(Consumer<ChunkHolder>)` are all visible as vanilla context in Paper's `ChunkMap.java.patch`; the `< 16384.0` and the spectator check are vanilla context there. Note the doubly-nested search is vanilla's, and `distanceManager.hasPlayersNearby` is a cheap pre-filter.

### 5.2 What makes a chunk ineligible

A chunk is **not** attempted when any of:

1. **No player within 128 blocks of the chunk centre** (or only spectators) â€” Â§5.1. [C]
2. **Not entity-ticking / not loaded to a `LevelChunk`.** The candidate chunks come from chunk holders with a non-null *ticking* chunk; force-loaded-but-not-ticking chunks and unloaded chunks are excluded. [C]/[I] â€” the exact ticket level (`FullChunkStatus.ENTITY_TICKING` vs `BLOCK_TICKING`) is **UNVERIFIED**, but the wiki's older note matches the "entity ticking" notion: a `ChunkMap.anyPlayerCloseEnoughForSpawning()` guard sits in front of `NaturalSpawner.spawnForChunk` *and* `ServerLevel.tickChunk()`. [W] (HTML comment preserved in the wiki source: `ServerChunkCache::tickChunks calls ChunkMap::anyPlayerCloseEnoughForSpawning() before calling NaturalSpawner::spawnForChunk() (and ServerLevel::tickChunk(), for that matter).`)
3. **Outside the world border:** `level.getWorldBorder().isWithinBounds(chunkPos)` is checked before `spawnForChunk`. [C]
4. **The whole pass is off:** `doMobSpawning == false`, no players, `!(spawnEnemies || spawnFriendlies)`, or the filtered category list is empty. [C]
5. **The per-category local cap rejects this chunk** (Â§3.2). [C]
6. **Individual positions inside an otherwise-eligible chunk can still be rejected** â€” see Â§6/Â§7; and the world border is re-checked per candidate position. [C] (Canvas context: `border.isWithinBounds(pos)`)

There is **no "forced-empty" check**: the spawner does not care whether a chunk was force-loaded or is a "spawn chunk"; only the conditions above.

### 5.3 "One random chunk per player per tick" â€” correction

The widely repeated rule "each tick one random chunk inside each player's 17Ã—17 area gets a spawn attempt" is **not what 1.21.4 does**. In 1.21.4:

* `collectSpawningChunks` **collects all** eligible chunks into a list, which is then shuffled and iterated in full; every eligible chunk gets a spawn attempt per due category per tick. [C] (the `collectSpawningChunks` â†’ `Util.shuffle` â†’ `for (LevelChunk chunk : spawningChunks)` shape is vanilla context in the ServerChunkCache patches)
* The 17Ã—17/289 square only survives as the **cap divisor** (Â§2).

The claim may reflect (a) much older versions, (b) Bedrock's cluster spawning, or (c) confusion with Paper's per-player mode. Treat it as **UNVERIFIED for 1.21.4 and contradictory to the sources I inspected**.

The shuffle exists (and is reseeded from the level RNG each tick) so that no chunk systematically wins when the cap or the tick budget cuts the loop short. [C]

---

## 6. Candidate position selection

### 6.1 `NaturalSpawner.getRandomPosWithin(Level, LevelChunk)` â€” the chunk "start" position

Signature confirmed: `private static BlockPos getRandomPosWithin(Level p_47063_, LevelChunk p_47064_)`. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/level/NaturalSpawner.html>

Canvas's 1.21.4-era optimisation replaces the call with an inlined, behaviour-preserving equivalent, which exposes the vanilla computation [C] (Canvas `NaturalSpawner.java.patch`, with the comment "using the min bounds and then adding an RNG with bound of 16 means it won't escape this chunk"):

```
getRandomPosWithin(level, chunk):
    minX = chunk.pos.getMinBlockX();  minZ = chunk.pos.getMinBlockZ()
    x  = minX + level.random.nextInt(16)          // [minX, minX+15]
    z  = minZ + level.random.nextInt(16)          // [minZ, minZ+15]
    surfaceY = chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) + 1
    y  = Mth.randomBetweenInclusive(level.random, level.getMinY(), surfaceY)
    return new BlockPos(x, y, z)
```

Facts to carry into a port:

* **X and Z are uniform over the 16Ã—16 chunk columns, inclusive of both ends.** There is *no* 1-block inset and *no* centre bias here. [C]
* **The heightmap used is `WORLD_SURFACE`, plus 1.** `WORLD_SURFACE` is "the highest non-air block" â€” so `surfaceY` is the first air block above the surface. **`WORLD_SURFACE`, not `MOTION_BLOCKING_NO_LEAVES` and not `OCEAN_FLOOR`.** [C] (Canvas's inlined version). `MOTION_BLOCKING_NO_LEAVES` / `OCEAN_FLOOR` are used by the *per-entity* `SpawnPlacements` heightmap (Â§7) and by chunk-generation spawning (Â§11), not here.
* **Y is uniform over `[level.getMinY(), surfaceY]` inclusive** (`Mth.randomBetweenInclusive`, i.e. `min + random.nextInt(max âˆ’ min + 1)`). For the Overworld `getMinY() = -64` and `height = 384`, so `surfaceY âˆˆ [-63, 320]`. **This is the "random Y below the heightmap" rule**: the chunk's *centre* of the pack is placed anywhere from bedrock to one block above the surface, so the overwhelming majority of attempts land underground, and lowering the terrain ceiling directly increases spawn rate. [C] + [W] ("The Y coordinate is a random coordinate between the block above the highest block in the column and the world minimum â€¦ This makes lower maximum elevations a strong way to increase spawn rates and is the reason why perimeters are so effective.")
* **"Half of the heightmap" behaviour:** I found **no** halving term in 1.21.4. The rule is a plain uniform pick over the full `[minY, surface+1]` range. Reports of a "half of the heightmap" or `random.nextInt(heightmapY - minY) / 2` style formula refer to older algorithms (pre-1.18) and/or to `Mob`-specific `getTopNonCollidingPos` behaviour; treat them as **UNVERIFIED for 1.21.4**.
* **`surfaceY` cannot exceed the build limit âˆ’ 1:** since `y` is clamped to `minY..surfaceY`, if the column is full of blocks the "+1" is harmless because `WORLD_SURFACE` already caps at the top.
* **`getTopNonCollidingPos(LevelReader, EntityType, int x, int z)`** still exists in 1.21.4 as a `private static BlockPos` helper [C] (javadoc). It is used by the **chunk-generation** path (Â§11) to snap each individual animal attempt onto the top of the column using the entity's own `SpawnPlacements` heightmap; it is **not** used by the per-tick spawn cycle. The name `getTopNonCollidingY` (singular, `int` return) that appears in older write-ups is the pre-refactor spelling; **do not assume it exists in 1.21.4** â€” only `getTopNonCollidingPos` is attested. [C]

### 6.2 What happens with the start position

```
spawnCategoryForChunk(category, level, chunk, extraTest, afterSpawn):
    start = getRandomPosWithin(level, chunk)
    if start.getY() >= level.getMinY() + 1:          // i.e. reject exactly Y == minY
        spawnCategoryForPosition(category, level, chunk, start, extraTest, afterSpawn)
```
[C] (vanilla context in both Paper's and Canvas's `NaturalSpawner.java.patch`; the `< minY + 1` guard is literal)

So the only guard on the start position itself is **`y >= minY + 1`** â€” a pack centre exactly at the world floor is rejected, because mobs are placed with their feet at `y` and the collision checks would fail anyway.

Then, in `spawnCategoryForPosition`, one more coarse gate on the start block:

```
if !chunk.getBlockState(start).isRedstoneConductor(chunk, start):   // i.e. the pack centre must NOT be a "solid render" full block
    ... run the 3 group attempts ...
```
[C] (vanilla context: `BlockState blockState = chunk.getBlockState(pos); if (!blockState.isRedstoneConductor(chunk, pos)) { ... }`; the wiki's phrasing is "If the block in which a pack spawn occurs is an opaque full cube, further pack spawn attempts are cancelled." [W])

`isRedstoneConductor` here means "full cube that blocks redstone" â€” i.e. an opaque, shape-full block. So **a pack whose centre lands inside solid stone produces no spawns for that category in that chunk that tick.** Note this is a *centre-only* test; individual members may be placed in non-full blocks (torches, ladders, etc.).

### 6.3 The attempt structure (what "3 attempts" actually means)

There are **two nested attempt counts**, and they are the most commonly mis-stated part of the algorithm. From the vanilla context in the Canvas diff together with Paper's diff [C]:

```
spawnCategoryForPosition(category, level, chunk, start, extraTest, afterSpawn):
    if chunk.getBlockState(start).isRedstoneConductor(chunk, start): return     // centre blocked => give up
    mutPos = new MutableBlockPos()
    clusterSize = 0                                    // "i"     : mobs spawned by this call
    for groupCount in 0..2:                            // "j < 3" : 3 group attempts
        x = start.getX();  z = start.getZ()
        spread = 6
        currentSpawnData = null
        groupData = null
        maxAttempts = Mth.ceil(level.random.nextFloat() * 4.0F)   // 0..4  : pack member attempts
        groupSize   = 0                                // "i3"    : mobs spawned in this group
        for attempt in 0..maxAttempts-1:               // "ll < max"
            x += level.random.nextInt(6) - level.random.nextInt(6)   // triangular offset, -5..+5
            z += level.random.nextInt(6) - level.random.nextInt(6)
            mutPos.set(x, start.getY(), z)              // NOTE: Y is fixed for the whole pack
            ... checks and spawn, see 6.4 ...
```

Consequences:

* **`maxAttempts = ceil(random.nextFloat() * 4)`** â€” this is why the wiki says "There are a maximum of 3 pack spawn attempts per mob category" for the *outer* loop and "4 for any other mob" for the *pack size*: the "4" is `Mth.ceil(nextFloat()*4)` (values 0,1,2,3,4 â€” 0 only when `nextFloat()` returns exactly 0.0) and the "3" is the outer `groupCount < 3`. [C] + [W]
* **The horizontal offset is triangular over Â±5** (`nextInt(6) âˆ’ nextInt(6)`), applied to the *previous* member's position (a random walk), not to the group centre. [C] The resulting spread is â‰ˆ 85 % within 5 blocks and 99 % within 10 blocks of the centre for a 4-member group. [W]
* **Y is constant for the whole pack** â€” taken from the group start. [C] This is the key difference from chunk-generation spawning (Â§11), where Y is recomputed per member.
* Offsets are applied to `x`/`z` *before* the mob is placed, and there is **no clamping into the chunk** in vanilla: the position can wander outside the spawn chunk (Canvas clamps it as an optimisation and notes the deviation). Vanilla's `isRightDistanceToPlayerAndSpawnPoint` then requires the position's chunk to equal the spawn chunk **or** the level to allow natural spawning there (Â§7.2). [C]
* The group start is re-taken from `start` at the beginning of **each** of the 3 group attempts, so a failed group does not shift the next group. [C]

### 6.4 Per-attempt validation chain (order matters for RNG parity)

```
nearestPlayer = level.getNearestPlayer(x + 0.5, y, z + 0.5, -1.0, false)
if nearestPlayer == null: continue                     // no RNG consumed
d2 = nearestPlayer.distanceToSqr(x + 0.5, y, z + 0.5)
if !(posIsLoadedAndInBounds && isRightDistanceToPlayerAndSpawnPoint(level, chunk, pos, d2)):
    continue
if currentSpawnData == null:
    data = getRandomSpawnMobAt(level, structureManager, generator, category, level.random, pos)
    if data is empty: BREAK out of the attempt loop         // ends this group AND (vanilla) this group loop iteration
    currentSpawnData = data
    maxAttempts = data.minCount + level.random.nextInt(1 + data.maxCount - data.minCount)
if !(isValidSpawnPostitionForType(...) && extraTest.test(data.type, pos, chunk)):
    continue                                            // next attempt, same currentSpawnData
mob = getMobForSpawn(level, data.type)
if mob == null: RETURN
mob.snapTo(x + 0.5, y, z + 0.5, level.random.nextFloat() * 360.0F, 0.0F)
if isValidPositionForMob(level, mob, d2):
    groupData = mob.finalizeSpawn(level, level.getCurrentDifficultyAt(mob.blockPosition()), EntitySpawnReason.NATURAL, groupData)
    level.addFreshEntityWithPassengers(mob)
    ++clusterSize; ++groupSize
    afterSpawn.run(mob, chunk)
    if clusterSize >= mob.getMaxSpawnClusterSize(): RETURN
    if mob.isMaxGroupSizeReached(groupSize): break      // abandon the rest of this group
```
[C] â€” every element above comes from a vanilla context line in Paper's or Canvas's diff: `getNearestPlayer(d, y, d1, -1.0, false)`, `distanceToSqr(d, y, d1)`, the `currentSpawnData == null` block, `ceil.nextFloat() * 4.0F`, `nextInt(6) - nextInt(6)`, `mob.snapTo(..., nextFloat() * 360.0F, 0.0F)`, `finalizeSpawn(..., EntitySpawnReason.NATURAL, ...)`, `if (i >= mob.getMaxSpawnClusterSize()) return;`. The `break` on `isMaxGroupSizeReached` is **[I]** (the method exists on `Mob` [C]; its exact call site is just past the last context line I could see).

RNG-parity notes for a port:
* the pack-size roll (`nextFloat`) happens **before** the first member offset;
* `getNearestPlayer` is called **before** any spawn RNG for the member;
* the **first successful** `getRandomSpawnMobAt` call fixes the species *and* the final pack size (`maxAttempts`), which is why the wiki says "the species for the entire pack is chosen randomly, but based on a weight system from those eligible to spawn at the location of the first spawn attempt in the pack"; later members that the species cannot legally occupy simply fail that attempt. [W]
* a **partial group is allowed**: nothing rolls back already-spawned members, and `break`/`return` never removes them.

---

## 7. `SpawnPlacements` and the generic spawn checks

### 7.1 The registry

`SpawnPlacements` (package `net.minecraft.world.entity`) holds a private `Map<EntityType<?>, SpawnPlacements.Data> DATA_BY_TYPE`, where `Data` is a package-private record. Registration is `register(EntityType<T>, SpawnPlacementType, Heightmap.Types, SpawnPlacements.SpawnPredicate<T>)`. Public API: `getPlacementType(EntityType)`, `getHeightmapType(EntityType)`, `isSpawnPositionOk(EntityType, LevelReader, BlockPos)`, `checkSpawnRules(EntityType<T>, ServerLevelAccessor, <SpawnReason>, BlockPos, RandomSource)`. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/SpawnPlacements.html>

The "type" is **an interface `SpawnPlacementType`** in 1.21.4, with the four constants living in `SpawnPlacementTypes`: **`NO_RESTRICTIONS`, `IN_WATER`, `IN_LAVA`, `ON_GROUND`**. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/SpawnPlacementTypes.html>

> **1.21.4 vs older:** pre-1.21 the placement type was an **enum `SpawnPlacements.Type`** with the same four constants, and the per-entity predicate took `(EntityType, ServerLevelAccessor, MobSpawnType, BlockPos, Random)`. In **1.21.2+** `MobSpawnType` was renamed **`EntitySpawnReason`** and `Type` became the `SpawnPlacementType` interface. 1.21.4 code and data use the new names. [C] (Paper's 1.21.4 `NaturalSpawner` context uses `EntitySpawnReason.NATURAL`.) NeoForge 1.21.0 javadoc still says `MobSpawnType` â€” one version earlier.

`Heightmap.Types` used per entity: `MOTION_BLOCKING_NO_LEAVES` for the overwhelming majority (all land mobs, monsters, and non-aquatic animals), and `OCEAN_FLOOR` for aquatic types (squid, fish, drowned, guardian, axolotl, glow squid, dolphin, turtle â€” turtle is `ON_GROUND` + `MOTION_BLOCKING_NO_LEAVES`, verify per type). `WORLD_SURFACE` is used by the *chunk* start position (Â§6.1) and by chunk-generation spawning (Â§11). **[C] for the existence and role of `getHeightmapType`; [I] for the per-entity assignment table â€” I did not see the registration table itself. Expect ~90 % `MOTION_BLOCKING_NO_LEAVES` / ~10 % `OCEAN_FLOOR`.**

`SpawnPlacements.isSpawnPositionOk(type, level, pos)` dispatches to the registered `SpawnPlacementType`; `checkSpawnRules(...)` dispatches to the registered `SpawnPredicate`. Both must be recorded per entity type in a port's data table. [C]

### 7.2 The *generic* checks â€” `NaturalSpawner.isValidSpawnPostitionForType`

These are the checks the spawner itself applies to **every** candidate, independent of the mob:

```
isValidSpawnPostitionForType(level, category, structureManager, generator, data, pos, distanceSqr):
    type = data.type
    return type.getCategory() != MISC
        && ( type.canSpawnFarFromPlayer()
             || !(distanceSqr > type.getCategory().getDespawnDistance() ** 2) )   // 128^2 = 16384, or 64^2 for WATER_AMBIENT
        && type.canSummon()                                                     // i.e. !isAbstract / isSummonable
        && canSpawnMobAt(level, structureManager, generator, category, data, pos)  // species still valid here (biome/structure)
        && SpawnPlacements.isSpawnPositionOk(type, level, pos)
        && SpawnPlacements.checkSpawnRules(type, level, EntitySpawnReason.NATURAL, pos, level.random)
        && level.noCollision(type.getSpawnAABB(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5))
```
[C] â€” every clause is a vanilla context line in Paper's or Canvas's `NaturalSpawner.java.patch` (note the misspelling `isValidSpawnPostitionForType` is Mojang's and is preserved in the mappings).

Notable points:
* **`canSpawnFarFromPlayer()`** is the escape hatch from the 128-block rule; in vanilla it is essentially always false, so every natural spawn must be within `despawnDistance` of the nearest player, as a **Euclidean sphere**. [C] for the clause; **UNVERIFIED** which types set it true.
* **`level.noCollision(aabb)`** uses the entity type's *spawn AABB* â€” the full collision box, centred at `x+0.5, y, z+0.5` with the box's bottom at `y`. A mob may not spawn if its box overlaps **any** collision shape (blocks or other entities). [C]
* The **24-block rule** lives in `isRightDistanceToPlayerAndSpawnPoint`, checked earlier (per attempt):

```
isRightDistanceToPlayerAndSpawnPoint(level, chunk, pos, distanceSqr):
    if (distanceSqr <= 576.0) return false        // 576 = 24^2 = MIN_SPAWN_DISTANCE^2, strict
    if (level.getSharedSpawnPos() is within 24.0 of (x+0.5, y, z+0.5)) return false
    return Objects.equals(new ChunkPos(pos), chunk.getPos()) || level.isNaturalSpawningAllowed(pos)
```
[C] â€” the three-clause return is vanilla context in Paper's patch (`@@ -225,7 +_,15 @@`), with `MIN_SPAWN_DISTANCE = 24` [C] constant-values. The middle clause uses `MIN_SPAWN_DISTANCE` too, so **players and the world spawn point both suppress spawning in a spherical 24-block radius**, and the comparison against the player is **`<= 24Â²`**, i.e. a spawn is rejected at exactly 24 blocks. [C]/[I] for the `<=` vs `<` on the shared-spawn clause.
* **`level.isNaturalSpawningAllowed(pos)`** allows a pack member to leave the spawn chunk *if* the destination chunk is in a state that permits spawning (this is the "natural spawning allowed" chunk-state predicate). [C]
* **`canSpawnMobAt`** re-derives the weighted list at the candidate position (`mobsAt(...)`) and checks that the chosen `SpawnerData` is still a member of it. This is what makes a pack member fail when the random walk crosses into a different biome or into a structure with an override. [C] (`mobsAt(...).contains(spawnerData)` is vanilla context)
* **Difficulty is *not* checked here.** It is checked by the per-mob predicate (Â§8) â€” or by the category filter (Â§4.3).

### 7.3 The three placement types â€” functional behaviour

Reconstructed to the level I can support; where I could not see the implementation the item is marked.

* **`NO_RESTRICTIONS`** â€” always `true`. Used by entities that manage their own placement (and by modded/utility types). [C] for existence.
* **`ON_GROUND`** â€” the block below must present a **sturdy top face** (`BlockState.isFaceSturdy(level, below, Direction.UP)`), and the spawn position itself must be an **"empty spawn block"**: not a collision-full block, not a redstone-signal source, no fluid, not in the `PREVENT_MOB_SPAWNING_INSIDE` family (rails, redstone components, â€¦), and not dangerous to the entity type (wither rose, sweet berry bush, magma block, â€¦). [C] for `NaturalSpawner.isValidEmptySpawnBlock(BlockGetter, BlockPos, BlockState, FluidState, EntityType)` existing as the public predicate; [W] for the user-visible rules ("the block directly below it must have a solid, opaque, top surface (this includes top slabs, upside-down stairs, and others) or be soul sand or a slime block"; "the block directly below it must not be bedrock, barrier, or any type of trapdoor or glass"; "the spawning block and the block above â€¦ cannot be rails â€¦ redstone power components, wither roses (except for wither skeletons) or sweet berry bushes (except for foxes)"). The **exact clause order inside `isValidEmptySpawnBlock` is [I]**.
* **`IN_WATER`** â€” the position must be inside a **water** fluid (this is the 1.18.2 rule: aquatic mobs may spawn only if the block above is a *non-waterlogged* water block, which prevents fish spawning inside bubble elevators), and the block below must also be water/water-like. [W] ("Spawning block and block below must be water, including waterlogged blocks and bubble columns" â€” the wiki's guardian line; "In rivers, has 1/15 chance to spawn â€¦ In oceans, has 1/40 chance to spawn and must be 5 blocks below sea level" for drowned) + [I] for the exact predicate body.
* **`IN_LAVA`** â€” the position must be inside a **lava** fluid source with air above. Used by **strider** (weight 60 in every Nether biome, `1â€“2` per pack, any light level). [C] (biome data Â§16; the 1.21.4 `nether_wastes`/`crimson_forest`/`warped_forest`/`soul_sand_valley`/`basalt_deltas` all list `strider` in the **`creature`** category) + [W] ("in lava sources with air above, at any light level")

### 7.4 Spawn reasons and which checks they skip

The reason enum is `EntitySpawnReason` in 1.21.4 with (at least) these members: `NATURAL`, `CHUNK_GENERATION`, `SPAWNER`, `STRUCTURE`, `BREEDING`, `MOB_SUMMONED`, `JOCKEY`, `EVENT`, `CONVERSION`, `REINFORCEMENT`, `TRIGGERED`, `BUCKET`, `SPAWN_EGG`, `COMMAND`, `DISPENSER`, `LOAD`, `DIMENSION_TRAVEL`, `TRIAL_SPAWNER`, `POTION_EFFECT`, `PATROL`, `PIGLIN_BRUTE_HELPER` (**list not verified exhaustively**). [C]/[I]

Live behaviour relevant to a port:
* `NaturalSpawner` calls `SpawnPlacements.checkSpawnRules(type, level, EntitySpawnReason.NATURAL, pos, random)`. [C]
* **Light requirements are bypassed for spawner-driven reasons.** `Monster.checkMonsterSpawnRules` guards the darkness test with "unless the reason ignores light requirements" (Â§8.1). The reasons that ignore light requirements are the spawner/trial-spawner/brewing-style ones â€” **the exact set is UNVERIFIED**; treat `SPAWNER`, `TRIAL_SPAWNER` as ignoring light, `NATURAL`, `CHUNK_GENERATION` and `STRUCTURE` as not. [I]
* **`CHUNK_GENERATION`** is used by `spawnMobsForChunkGeneration` (Â§11) and **skips the 24-block player-distance check and the local/global mob cap entirely** (it runs during worldgen where no players exist). [C] (the chunk-gen path calls `finalizeSpawn(..., EntitySpawnReason.CHUNK_GENERATION, ...)` and never consults a `SpawnState`) + [W] ("ignoring the mob cap, any applicable spawn costs, and the setting of /gamerule doMobSpawning")
* `STRUCTURE` is used by jigsaw/`StructurePiece` spawners (Â§13) and by hard-coded spawn spots (Â§14); those mobs are marked persistent. [W]

---

## 8. Per-mob predicates and the light rule

### 8.1 The monster light rule â€” exact 1.21.4 form

`Monster.checkMonsterSpawnRules(<EntityType>, ServerLevelAccessor, <reason>, BlockPos, RandomSource)` is implemented as

```
checkMonsterSpawnRules(type, level, reason, pos, random):
    return level.getDifficulty() != Difficulty.PEACEFUL
        && (reason.ignoresLightRequirements() || isDarkEnoughToSpawn(level, pos, random))
        && Mob.checkMobSpawnRules(type, level, reason, pos, random)
```
[I] for the shape (it is the standard pre-1.21 shape, and the light helper is confirmed present and static by javadoc).

`Monster.isDarkEnoughToSpawn(ServerLevelAccessor, BlockPos, RandomSource)` is `public static boolean` in 1.21.4. [C] <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/monster/Monster.html> Its body is exposed by Paper's 1.21.4 patch context [C] (`Monster.java.patch`, which patches only **one** line inside it):

```
isDarkEnoughToSpawn(level, pos, random):
    // (A) raw sky-light lottery
    if level.getBrightness(LightLayer.SKY, pos) > random.nextInt(32):
        return false

    // (B) block-light ceiling from the DIMENSION TYPE
    dimensionType = level.dimensionType()
    limit = dimensionType.monsterSpawnBlockLightLimit()
    if limit < 15 && level.getBrightness(LightLayer.BLOCK, pos) > limit:
        return false

    // (C) internal light level vs a sampled bound
    i = level.getLevel().isThundering()
            ? level.getMaxLocalRawBrightness(pos, 10)     // 10 = skyDarken override during thunder
            : level.getMaxLocalRawBrightness(pos)
    return i <= dimensionType.monsterSpawnLightTest().sample(random)
```
* **(A) is real and is a `nextInt(32)`.** This is the part most secondary sources omit. The exact vanilla line, visible as context in Paper's `Monster.java.patch`, is a comparison of `LightLayer.SKY` brightness against `random.nextInt(32)`. Consequence: at an **exposed surface at night** (`skyLight = 15`) the check fails with probability `15/32 â‰ˆ 46.9 %`, which is *the* reason open-surface night spawning is much slower than pitch-dark cave spawning (where `skyLight = 0` and the check always passes).
* **(B)** is `monsterSpawnBlockLightLimit`: the **maximum block light at which monsters may spawn**. 1.21.4 values [C] (the dimension-type JSON files):
  | Dimension | `monster_spawn_block_light_limit` | `monster_spawn_light_level` |
  | --- | --- | --- |
  | `minecraft:overworld` | **0** | `{type: minecraft:uniform, min_inclusive: 0, max_inclusive: 7}` |
  | `minecraft:overworld_caves` | **0** | same as Overworld |
  | `minecraft:the_end` | **0** | same as Overworld |
  | `minecraft:the_nether` | **15** | **7** (a constant, not a provider) |
  Sources: <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/dimension_type/overworld.json> and siblings. Note the `if (limit < 15 && â€¦)` short-circuit: a limit of 15 disables the check entirely (that is how the Nether expresses "block light never blocks spawning").
  This is the mechanism behind the 1.18 change "hostile mobs now spawn only in complete darkness â€¦ this only affects block-light, not sky-light". [W] <https://minecraft.wiki/w/Light?oldid=2872432>
* **(C)** `getMaxLocalRawBrightness(pos)` is `max(blockLight, skyLight âˆ’ skyDarken)`. During a thunderstorm the game substitutes `skyDarken = 10`; combined with `skyLight = 15` that yields an effective internal sky light of **5** at noon, matching the wiki footnote "During thunderstorms, hostile mobs are allowed to spawn as if the internal sky light level were actually 5". [W] <https://minecraft.wiki/w/Light?oldid=2872432>
* The block-light test is evaluated **after** the sky-light lottery and **before** the internal-light comparison. **RNG call order for parity: (1) `nextInt(32)`, (2) [no RNG], (3) `sample(random)` = `nextInt(8)` for the Overworld.** [C] + [I] for the `sample` â†’ `nextInt(8)` equivalence (the Overworld provider is `uniform 0..7` inclusive, so `sample` is exactly a `nextInt(8)`).
* The dimension-type semantics: "`monster_spawn_block_light_limit`: the maximum block light level where mobs can spawn"; "`monster_spawn_light_level`: the range of light levels where mobs can spawn, **taking into account sky light**". [C] <https://raw.githubusercontent.com/apollounknowndev/worldgen-docs/gh-pages/docs/docs/dimensions/dimension-types.md>

To restate the practical Overworld rule for a port:

> A monster spawn attempt at `pos` succeeds on light grounds iff
> `skyLight(pos) <= random.nextInt(32)` **and** `blockLight(pos) == 0` **and** `max(blockLight, skyLight âˆ’ skyDarken) <= random.nextInt(8)`,
> where `skyDarken` is `0` at clear noon, `3` in rain/snow at noon, `5` in a thunderstorm at noon, `11` at midnight (`skyDarken â‰ˆ 15 âˆ’ internalSkyLight`).

### 8.2 Mob-specific deviations

The wiki's per-mob rule table (pinned 1.21.4-era revision) is the best consolidated source. [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> Combined with the 1.21.4 biome data [C]:

| Mob | Deviation from the plain dark-enough rule |
| --- | --- |
| **blaze** | Spawns **only inside nether fortresses** (`fortress.json` `spawn_overrides.monster`, `bounding_box: piece`, weight 10, 2â€“3). Light-independent in practice because the fortress path still requires `isDarkEnoughToSpawn`, but the Nether's `monster_spawn_block_light_limit = 15` makes the block-light clause vacuous and `monster_spawn_light_level = 7` bounds it at 7. |
| **wither_skeleton** | Nether fortress only (weight 8, exactly 5 per pack). Immune to wither roses, so it can spawn in them. |
| **magma_cube** | Nether: nether_wastes (weight 2), **basalt_deltas (weight 100, 2â€“5)**. "Cannot spawn on liquid." |
| **ghast** | nether_wastes / soul_sand_valley (weight 50, 4 per pack); **basalt_deltas weight 40, exactly 1 per pack** (`getMaxSpawnClusterSize() == 1`). "95 % chance of spawn failure." Light-independent. |
| **strider** | `IN_LAVA` placement; in the **`creature`** category with weight 60, 1â€“2, in all five Nether biomes; "in lava sources with air above, at any light level". Also cannot be produced by chunk generation, because the top block of a Nether column is bedrock. [W] footnote |
| **skeleton / wither_skeleton in a fortress** | Nether-fortress skeleton packs are size 5; "there is an 80 % chance of spawning a wither skeleton instead" is marked `{{verify}}` on the wiki â€” treat as **UNVERIFIED**; the actual mechanism in 1.21.4 is the fortress **weight table** (wither_skeleton weight 8 vs skeleton weight 2), not a post-hoc swap. |
| **drowned** | Water placement. River: `weight 100, 1 per pack`; ocean: `weight 5, 1 per pack`; dripstone_caves: `weight 95, 4 per pack`. Wiki rules: "spawning block and block below must be water"; "in rivers, 1/15 chance to spawn"; "in oceans, 1/40 chance and must be 5 blocks below sea level". [W] |
| **guardian** | Ocean monument only (`monument.json` `spawn_overrides.monster`, `bounding_box: full`, guardian weight 1, 2â€“4). "Spawning block and block below must be water, including waterlogged blocks and bubble columns"; "95 % chance of failure if the spawning block has sky exposure". In practice spawned by the monument's dedicated structure-spawn path (Â§14). |
| **squid / glow squid** | Water placement; `WATER_CREATURE` (squid weight 1 in ocean/river, 1â€“4) and `UNDERGROUND_WATER_CREATURE` (glow_squid weight 10, 4â€“6) respectively. Glow squid: **any biome except deep_dark**, and the wiki's ambient table says it spawns at block light â‰¤ 4 and Y 0â€“62 for bats / glow squids at low light â€” treat the precise glow-squid light rule as **[I]**. |
| **bat** | `AMBIENT`, weight 10, exactly 8 per pack, in nearly every biome. Light-independent in the "dark enough" sense â€” bats spawn at block light â‰¤ 4 in the Y range 0â€“62. [W] Light-page ambient table |
| **slime** | Two disjoint rules. (a) **Swamp**: only in the swamp/mangrove biome list (weight 100, 4, plus a secondary `weight 1, 1` entry), **Y 50â€“70**, "chance of failure based on the phase of the moon", "50 % chance of failure". (b) **Slime chunk**: any biome, **Y below 40** (wiki elsewhere says âˆ’64â€¦40), "90 % chance of failure". Both are light-independent once placed. [W] |
| **husk / stray / bogged** | Biome-limited monsters with a light rule like a normal monster, plus a location requirement (husk: sky access in desert; stray: sky access in snowy biomes; bogged: swamp/mangrove). [W] |
| **ocelot** | Categorised **MONSTER** in 1.21.4, jungle only (`weight 2`, 1â€“3). The wiki notes the 1.18 "difficulty must not be Peaceful" change "also affects ocelots" (MC-1788). [W] |
| **hoglin / piglin / zoglin** | The Nether exceptions: they **do not despawn on Peaceful** and are light-independent. `crimson_forest`: zombified_piglin weight 1 (2â€“4), hoglin weight 9 (3â€“4), piglin weight 5 (3â€“4). Hoglins and piglins "cannot spawn on nether wart block". | 
| **enderman** | `warped_forest` weight 1 (4), `nether_wastes` weight 1 (4), `soul_sand_valley` weight 1 (4), `the_end` weight 10 (4), and weight 10 with 1â€“4 in most Overworld biomes. Light-independent in the Nether/End (no skylight there); in the Overworld it obeys the normal monster rule. Holds-block endermen are despawn-immune. |
| **witch** | Plain monster rule, weight 5, exactly 1 per pack, in most Overworld biomes; swamp hut override (weight 1, 1). |
| **phantom** | **Not** produced by `NaturalSpawner` in Java Edition. Driven by the "player hasn't slept" insomnia timer (Â§14). [W] |

For a port: model the light rule once (in the "monster" predicate) and model all per-mob deviations as **data** (placement type, heightmap, extra predicate id), not as code branches.

---

## 9. Pack / group spawning

### 9.1 `SpawnerData`

`MobSpawnSettings.SpawnerData` is the per-entry record. Its JSON shape in 1.21.4 [C] (all biome files) is:

```json
{ "type": "minecraft:zombie", "weight": 95, "minCount": 4, "maxCount": 4 }
```
Field order in the emitted JSON is `type`, `maxCount`, `minCount`, `weight`, but the field *names* are the contract. `MobSpawnSettings` groups these into a `WeightedRandomList<SpawnerData>` per `MobCategory`, keyed by the category's `getName()` string, and a `Map<EntityType, MobSpawnCost>` from the biome's `spawn_costs` object. [C]

* Group size: `minCount + random.nextInt(1 + maxCount - minCount)` â†’ **uniform over `[minCount, maxCount]` inclusive**. [C] (vanilla context line in Canvas's diff)
* The biome's `spawners` object in 1.21.4 always contains **all eight** category keys, including `"misc": []` and empty arrays for categories the biome does not use. [C] A port should therefore distinguish "absent" (no spawning) from "present but empty" (explicitly no spawning) â€” see Â§13, where empty arrays are how structures suppress spawning.

### 9.2 The biome-vs-structure resolution: `mobsAt`

```
mobsAt(level, structureManager, generator, category, pos, biome?):
    if isInNetherFortressBounds(pos, level, category, structureManager):
        return NetherFortressStructure.FORTRESS_ENEMIES      // a hard-coded weighted list, not the JSON override
    return generator.getMobsAt(biome != null ? biome : level.getBiome(pos), structureManager, category, pos)
```
[C] (vanilla context in Canvas's diff; the fortress short-circuit and the `NetherFortressStructure.FORTRESS_ENEMIES` constant are vanilla).

* `ChunkGenerator.getMobsAt(Holder<Biome>, StructureManager, MobCategory, BlockPos)` implements the **override-then-biome** rule: if a structure with a `spawn_overrides` entry for that category covers `pos`, the structure's list **replaces** the biome list for that category (**no merge**); otherwise the biome's list is used. [C] for the call shape and the data (Â§13); [W] for the semantics: "structure-based spawns take priority over biome for hostile spawns".
* **The nether-fortress path is special and does not use `spawn_overrides` at all** â€” vanilla hard-codes `FORTRESS_ENEMIES` and additionally requires the block **below the position to be nether bricks**. [C] (the `level.getBlockState(pos.below()).is(Blocks.NETHER_BRICKS)` condition is vanilla context in Canvas's diff) + [W] ("nether fortress (outer bounding box only when there is nether bricks below it)"). This is why the fortress's *lava-sea* and corridor positions behave differently, and why the fortress's own JSON override (`monster`, `piece`, see Â§13) only matters for the inner pieces.
* `isInNetherFortressBounds` is only consulted for `MobCategory.MONSTER`. [C]
* **`getRandomSpawnMobAt`** additionally implements one hard-coded biome behaviour:

```
getRandomSpawnMobAt(level, structureManager, generator, category, random, pos):
    biome = level.getBiome(pos)
    if category == WATER_AMBIENT && biome.is(BiomeTags.REDUCED_WATER_AMBIENT_SPAWNS) && random.nextFloat() < 0.98F:
        return empty            // 98 % rejection in "reduced water ambient" biomes (e.g. lush caves / mangrove swamp)
    return mobsAt(...).getRandom(random)
```
[C] â€” this is a vanilla context line in Canvas's diff (`0.98F`, `BiomeTags.REDUCED_WATER_AMBIENT_SPAWNS`). **This is a second RNG consumer to reproduce**, and it fires before the weighted pick. Note the tag name `REDUCED_WATER_AMBIENT_SPAWNS`; the wiki's `tropical_fish` entry in `lush_caves` (weight 25, exactly 8) and `mangrove_swamp` are the intended targets. [C]/[I]

### 9.3 How the pack is actually executed

The mechanics are the code in Â§6.3/Â§6.4. The behavioural contract:

1. **Up to 3 group attempts** per (chunk, category, tick).
2. Each group attempt draws `maxAttempts = ceil(nextFloat() * 4)` â€” a hard upper bound of 4 placement attempts per group, **unless** the first attempt finds a legal species, in which case `maxAttempts` is **replaced** by the drawn group size `minCount + nextInt(1 + maxCount âˆ’ minCount)`.
3. Each group is fixed-species from its first successful `getRandomSpawnMobAt`. Later members that the species cannot occupy at their new position fail that attempt only.
4. **`getMaxSpawnClusterSize()` caps the whole `spawnCategoryForPosition` call** â€” `if (clusterSize >= mob.getMaxSpawnClusterSize()) return;`. This is where the wiki's "pack spawn attempts max out at 8 wolves, cod and tropical fish; 6 horses and donkeys; 1 ghast; 4 for any other mob" comes from; it is a per-call total, and it is **checked after each successful spawn**. [C] for the method and the check; [W] for the per-mob values.
5. `isMaxGroupSizeReached(groupSize)` is consulted after each successful spawn and, when true, abandons the rest of the current group. [I]
6. **A partial group is always allowed.** Nothing is rolled back. A group of 4 whose 3rd member fails leaves 2 mobs.
7. `finalizeSpawn(...)` is called with the **group data threaded through the group** (`groupData` starts null per group, and is passed to each member's `finalizeSpawn`), which is how "one leader + followers" group types (e.g. wolf packs, llama caravans, zombie reinforcement leaders) share state. [C] (`spawnGroupData = mob.finalizeSpawn(level, level.getCurrentDifficultyAt(...), EntitySpawnReason.NATURAL, spawnGroupData)` is a vanilla context line)
8. The mob is placed with its **feet** at `y = start.getY()` and its horizontal centre at `(x + 0.5, z + 0.5)`, facing a uniformly random yaw `nextFloat() * 360`. [C]

### 9.4 Babies in naturally spawned groups

"When breedable mobs spawn naturally in a group, the group now sometimes includes babies" â€” added in 19w37a with "a 5 % or 10 % chance depending on the animal". [W] In a port this is a per-animal, post-spawn `finalizeSpawn`/`getBreedOffspring`-style decision; the exact per-mob percentages are **UNVERIFIED** (the two documented values are 5 % and 10 %). [W]

### 9.5 The "one pack per chunk per category per tick" limit

Enforced by the call structure, not by a counter: `spawnForChunk` iterates the filtered categories and calls `spawnCategoryForChunk` **once per category per chunk per tick**, and `spawnCategoryForChunk` runs the 3-group loop internally. [C]

### 9.6 Spawn costs / "charge" â€” still present in 1.21.4

This is a correction to a widespread claim that the 1.20-era spawn-cost system was removed:

* `NaturalSpawner.createState` adds a charge to a `PotentialCalculator` (`spawnPotential`) for each counted mob whose **rough biome** defines a `MobSpawnCost`. It looks up `getRoughBiome(pos, chunk).getMobSettings().getMobSpawnCost(entityType)` and, if non-null, calls `spawnPotential.addCharge(pos, mobSpawnCost.charge())`. [C] (vanilla context in both Paper's and Canvas's diffs â€” Canvas only wraps it in an optimisation guard, it does not remove it.)
* Only **two** biomes define non-empty `spawn_costs` in 1.21.4 [C] (data):
  * `minecraft:soul_sand_valley`: enderman, ghast, skeleton, strider â€” each `{ "charge": 0.7, "energy_budget": 0.15 }`
  * `minecraft:warped_forest`: enderman â€” `{ "charge": 1.0, "energy_budget": 0.12 }`
* `SpawnState` also holds a `PotentialCalculator` and a `canSpawn(EntityType, BlockPos, ChunkAccess)` method whose job is to test the accumulated charge; the exact budget comparison is **UNVERIFIED** (the classic form is `charge <= 1 + energyBudget`-style, with the calculator pre-seeded from the biome's `energy_budget`). A port should carry the two tables above and the "accumulated charge per chunk-position" concept, and leave the comparison configurable until verified. [C] for `SpawnState.canSpawn` existing as a private method [C] (Canvas hunk at `@@ -617,18 +_,22 @@` shows `private boolean canSpawn(final EntityType<?> type, final BlockPos testPos, final ChunkAccess chunk)`), **UNVERIFIED** for its body.

---

## 10. Despawning

`Mob.checkDespawn()` runs from `Mob.baseTick()`/`serverAiStep()` every tick on both client-predicted and server entities; only the server's result matters. The 1.21.4 body is exposed almost in full by Paper's `Mob.java.patch` [C]:

```
checkDespawn():
    if level.getDifficulty() == Difficulty.PEACEFUL && shouldDespawnInPeaceful():
        discard(); return

    if isPersistenceRequired() || requiresCustomPersistence():
        return                                    // persistent: never despawn by distance

    nearest = level.getNearestPlayer(this, -1.0)
    if nearest == null: return                    // no non-spectator player in the dimension => nothing despawns

    d  = nearest.distanceToSqr(this)              // 3-D Euclidean, squared
    dd = getType().getCategory().getDespawnDistance();  hardSq = dd * dd
    if d > hardSq && removeWhenFarAway(d):
        discard()

    nd = getType().getCategory().getNoDespawnDistance(); softSq = nd * nd     // always 32*32 = 1024
    if noActionTime > 600 && random.nextInt(800) == 0 && d > softSq && removeWhenFarAway(d):
        discard()
    else if d < softSq:
        noActionTime = 0
```
Key exactness points:

* **Comparisons are strict `>`** for both the 128-block hard despawn and the 32-block soft window; the reset uses strict `<`. A mob at *exactly* 128 blocks from a player is not instantly despawned; at exactly 32 it is not "close". [C]
* **Distances are squared 3-D Euclidean** distances to the nearest player's position, not chunk- or cylinder-based. [C] + [W] ("This is a Euclidean sphere, not a cylinder from map top to bottom and not a taxicab sphere (an octahedron). Example: A mob at 0/y/0 remains at least 10 seconds â€¦ if the player moves to 65/y/65 (real distance 91.9), but despawns immediately if the player moves to 91/y/91 (real distance 128.7).")
* **`random.nextInt(800)` is only evaluated when `noActionTime > 600`** (Java `&&` short-circuits left to right). Any RNG-parity port must preserve that: no random draw for mobs that are not yet eligible. [C]
* The **soft window is not also gated on the hard window**: the two `if`s are independent. A mob beyond 128 blocks is discarded by the first `if` and the second `if` then runs on an already-discarded entity, which is harmless in practice. [C]
* The **`else if (d < softSq)` belongs to the second `if` only** â€” so being close to a player resets `noActionTime`, but a *successful* random despawn does not re-enter the reset branch. [C]
* `discard()` is `Entity.discard()` (removal reason DISCARDED). Paper wraps it in an event; vanilla just discards. [C]

### 10.1 `noActionTime` â€” how "30 seconds" becomes 600 ticks

| Rule | Value |
| --- | --- |
| Increment per tick, all mobs | **+1** (`Mob.serverAiStep()` does `noActionTime++`) |
| Extra increment when the mob's internal light level is **over 12** | **+2** (so +3 total) |
| Extra increment for illagers and their allies (raiders) | **+2** (so +3 total; **+5** if also brightly lit) |
| Reset | a player is within 32 blocks (`d < 1024`), **or** the mob is damaged by any damage type, **or** (special cases) the wither; pillagers/piglins pulling a crossbow; illagers targeting golems/players in a raid; illagers sweeping a village; vindicators breaking doors |
| Consequence for normal despawning mobs | minimum survival **600 ticks (30 s)** outside 32 blocks, average despawn at â‰ˆ **1400 ticks (70 s)** |
| Consequence for illagers/ravagers/vexes/witches and brightly-lit monsters | minimum **200 ticks (10 s)**, average â‰ˆ **1000 ticks (50 s)** |

Sources: [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> for the numbers; [C] for `noActionTime++` in `Mob.serverAiStep()`, for `noActionTime` being a field on `LivingEntity`, and for the existence of the `protected void updateNoActionTime()` hook on `Monster` (javadoc) which is where the "bright" and raider extras are applied. The **exact body of `Monster.updateNoActionTime()` is UNVERIFIED**; reproduce the numbers from the table.

`noActionTime` has a second, independent effect: `RandomStrollGoal.canUse()` refuses while `mob.getNoActionTime() >= 100`, which is why the wiki says mobs stop wandering when the counter exceeds 100 â€” with the documented exception list (iron golems, villagers, axolotls, camels, frogs, goats, sniffers, hoglins, zoglins, piglins, piglin brutes, wardens, breezes). [W] + [I] for the goal-level mechanism.

### 10.2 `removeWhenFarAway(double)`

`Mob.removeWhenFarAway(double distanceSquared)` returns `true` by default. Decide this per mob in a port's data table:

* **`false` (never despawn by distance):** the wiki's exclusion list is "All monster, ambient, and aquatic mobs **excluding shulkers, withers, elder guardians, and ender dragons** despawn unless persistent", and "Other mobs that are not monster, ambient, or aquatic that do despawn include, stray cats, untamed ocelots, wandering traders, and untamed trader llamas." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883> Read together with the code this gives:
  * **Shulker, WitherBoss, ElderGuardian, EnderDragon** â†’ `false`.
  * **`Animal` (cow, pig, sheep, chicken, horse, wolf, â€¦) â†’ `false`** â€” Java Edition farm animals do *not* despawn. (This is the class-level override that makes the wiki's sentence work; the class is not named in the wiki, so treat the mechanism as [I] and the *behaviour* as [W].)
  * `IronGolem`, `SnowGolem`, `Villager`, `Allay`, `ArmorStand` â†’ `false`. [W]/[I]
  * `PiglinBrute`, `Evoker`, `Vindicator`, `Illusioner` â†’ **UNVERIFIED**; the Bedrock persistent list includes piglin brute/evoker/vindicator/allay/iron golem/snow golem/villager, and Java's behaviour is not the same list. Verify per mob.
* **`true` (normal despawning):** every `Monster`, plus `Bat` (`AMBIENT`), all aquatic categories, and the specific exceptions **`Cat`, `Ocelot`, `WanderingTrader`, `TraderLlama`** which re-enable despawning on top of `Animal`. [W] + [I] for the override mechanism.
* Hoglins, piglins and shulkers **also survive a switch to Peaceful** (see Â§12); that is a separate override, `Monster.shouldDespawnInPeaceful()` returning `false` (javadoc confirms `shouldDespawnInPeaceful()` exists as a `protected boolean` on `Monster`). [C]/[W]

### 10.3 Persistence (`isPersistenceRequired()` / `requiresCustomPersistence()`)

Persistent mobs are skipped by `checkDespawn` **and** excluded from the mob-cap counts (Â§2.2). Triggers: [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

1. Named with a name tag (but **not** a renamed spawn egg â€” that one still despawns).
2. Has something added to its inventory (picked up an item, or had one dispensed onto it e.g. a saddle) â€” but never for equipment it *spawned* with.
3. Is a passenger of another mob, a boat or a minecart.
4. Was spawned as part of a generated structure.
5. Was bred / born from breeding / tamed by a player (via `requiresCustomPersistence()` or an explicit `setPersistenceRequired()`).
6. Has the NBT tag `PersistenceRequired: 1b` set (the only way to stop a wandering trader despawning).
7. `Enderman` while holding a block (a *conditional* non-persistence: it is excluded from counts and despawn while carrying). [W]
8. Bucket-spawned fish/axolotls/tadpoles; zombie villagers converted from traded-with villagers (still counted against the hostile cap); zombified piglins/witches converted by lightning; hoglins fed a crimson fungus. [W]

Mobs spawned by `NaturalSpawner` are **not** persistent by default; only the members' own `requiresCustomPersistence()` (e.g. for a jockey's mount, or zombies that become leaders) changes that. [I]

### 10.4 Special despawning that is *not* `checkDespawn`

| Mobs | Rule | Number |
| --- | --- | --- |
| Everything (including persistent mobs) | Below-world cull. `Entity.checkBelowWorld()` discards any entity whose Y is below `dimensionType.minY() - 64`. Overworld `minY = -64` â†’ **Y â‰¤ âˆ’128**; Nether/End `minY = 0` â†’ Y â‰¤ âˆ’64. | [W] "All mobs (including persistent mobs) despawn immediately at Y=-128 and below"; [C] `Entity.checkBelowWorld()` exists (listed in the `Monster` javadoc method summary); [I] for `minY âˆ’ 64` vs a literal âˆ’128 |
| `Endermite` | Custom lifetime counter: despawns after **2400 ticks = 2 minutes** unless persistent/named. | [W] |
| `Warden` | Custom: despawns after **1200 ticks = 60 s** without detecting a vibration or a smell. | [W] |
| `WanderingTrader` + its `TraderLlama`s | `DespawnDelay` NBT, initialised to **48000 ticks = 40 min**, decremented only while loaded; despawns at 0, taking its llamas with it. Ticks with the trade UI open are not counted (Java: the timer simply does not tick while unloaded). Naming it does **not** save it; only `PersistenceRequired: 1b` does. | [W] <https://minecraft.wiki/w/Wandering_Trader> (revision pinned via the MediaWiki API at 2025-03-01) |
| Player-spawned (`SPAWN_EGG`, `COMMAND`) | Do **not** gain persistence in Java (unlike Bedrock). | [W] |
| Chicken jockeys | The *chicken* follows zombie despawn rules rather than chicken rules. | [W] |
| `Phantom` | Does not despawn at daytime (that was 18w09a and was reverted). | [W] |
| Fish | `WATER_AMBIENT`'s `getDespawnDistance()` is 64, so the hard-despawn sphere is 64 blocks, not 128. | [W] + Â§1.1 |

### 10.5 The Peaceful path

`if (difficulty == PEACEFUL && shouldDespawnInPeaceful()) discard();` is the **first** branch of `checkDespawn`, so it fires regardless of player position and regardless of persistence. [C] `shouldDespawnInPeaceful()` is `protected` on `Monster` and defaults to true. [C]/[I] Documented survivors: **hoglins, piglins, shulkers** (all editions) and **piglin brutes** (Bedrock only), plus ocelots which *do* despawn in Peaceful per MC-1788. [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

---

## 11. Chunk-generation spawning

This is a **completely separate code path** from the per-tick spawner; it never consults a `SpawnState`, the mob caps, or `spawnCosts`.

```
spawnMobsForChunkGeneration(ServerLevelAccessor level, Holder<Biome> biome, ChunkPos chunkPos, RandomSource random):
    settings = biome.value().getMobSettings()
    list = settings.getMobs(MobCategory.CREATURE)
    if list.isEmpty(): return
    // repeat whole packs while the biome's creature probability roll succeeds
    while random.nextFloat() < biome.value().getMobSettings().getCreatureProbability():
        data = list.getRandom(random)                       // one weighted species for the pack
        groupSize = data.minCount + random.nextInt(1 + data.maxCount - data.minCount)
        groupData = null
        x = chunkPos.getMinBlockX() + random.nextInt(16)    // pack centre within the chunk
        z = chunkPos.getMinBlockZ() + random.nextInt(16)
        for member in 0 .. groupSize-1:
            placed = false
            for attempt in 0 .. 3:                          // four attempts per member
                pos = getTopNonCollidingPos(level, data.type, x, z)   // per-member Y!
                if canSpawn(data) and SpawnPlacements.isSpawnPositionOk(...) and checkSpawnRules(..., CHUNK_GENERATION, ...):
                    mob = create(...); mob.moveTo(...); mob.finalizeSpawn(level, difficulty, EntitySpawnReason.CHUNK_GENERATION, groupData)
                    level.addFreshEntityWithPassengers(mob); placed = true; break
                // random walk for the next attempt
                x += random.nextInt(5) - random.nextInt(5)
                z += random.nextInt(5) - random.nextInt(5)
                if (x,z) left the chunk: re-derive from the pack centre
            if !placed: break? / continue?                      // UNVERIFIED which
```
Attested parts and their sources:

* Signature `spawnMobsForChunkGeneration(ServerLevelAccessor, Holder<Biome>, ChunkPos, RandomSource)` [C] (javadoc).
* Always the **`CREATURE` category**, always the biome **of the chunk's north-west corner at maximum world height**, and **structure spawn overrides are ignored** â€” "Even though biome distribution within the chunk is already known at this point in the generation, the biome of the north west corner of the chunk at the maximum world height is used to make all decisions about this spawning process. As a result, biomes that generate only underground can never affect the initially spawned mobs. Similarly, although structures have been generated already, their potentially configured spawn overrides are ignored." [W] <https://minecraft.wiki/w/Mob_spawning>
* **Per-member Y**, on top of the highest block with a non-empty collision shape, using the member entity's own `SpawnPlacements` heightmap â€” this is `getTopNonCollidingPos(LevelReader, EntityType, int x, int z)`, `private static BlockPos` [C] (javadoc). This is the **contractual difference** from the runtime cycle, where Y is one uniform draw for the whole pack (Â§6.1, Â§6.3). [W] "The vertical position of each individual spawn attempts is on top of the highest block with a non-empty collision shape at the selected horizontal position. (This is different from spawn cycle spawns, which happen at the same Y-level for the entire pack.)"
* **Up to four attempts per pack member**, each with a fresh triangular Â±5 horizontal offset about the centre; if a jittered position leaves the chunk, it is re-derived from the original centre. [W]
* The mob's bounding box is **nudged so it fits inside the chunk** if it would straddle the border. [W] "if a mob's collision box would be partially outside the chunk this way, e.g. because it is wider than a block, its precise position is adjusted to fits the mob's collision box into the bounds of the chunk."
* The usual per-mob spawn conditions apply (light, valid floor, no obstructions), and the ususal animal rules keep most animals off structure roofs. [W]
* **Randomness is keyed to the world seed and the chunk position**, so the same seed reproduces the same animals in the same places. [W]
* The wiki's older description ("one in ten chunks", "1â€“4 mobs per chunk") is the **pre-1.13-era** behaviour; the current description is the probability loop above, and 1.21.4's biome data carries the per-biome probability (Â§16.1) which only exists for that loop. [W] (live page) + [C] (the four biome files that carry the field)

`ChunkGenerator` drives this from its `spawnOriginalMobs`-equivalent step during `ChunkGenerator.fillFromNoise`/`buildSurface`-style post-processing. The 1.21.4 method name on `ChunkGenerator` is **UNVERIFIED**; only `NaturalSpawner.spawnMobsForChunkGeneration` is attested. [C]/UNVERIFIED

---

## 12. Difficulties

### 12.1 Peaceful

* The category filter excludes `MONSTER` because `spawnEnemies == false` (Â§4.3). [C]/[I]
* Every existing monster whose `shouldDespawnInPeaceful()` is true is discarded by the first branch of `checkDespawn` (Â§10.5). [C]
* Documented survivors: hoglins, piglins, shulkers (Java), piglin brutes (Bedrock only). [W]
* Some non-monsters are also gated: "The difficulty must not be Peaceful, **excluding piglins and hoglins**. This also affects ocelots (MC-1788)." [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>
* Spawn eggs and `summon` can still create monsters except shulkers/ender dragons. [W]

### 12.2 Rules that change with difficulty, relevant to spawning

| Rule | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Monster spawning | on | on | on |
| **Zombie reinforcements** | no | no | **yes** |
| Villager killed by zombie â†’ zombie villager | **0 %** | **50 %** | **100 %** |
| Phantom group size | 1â€“2 | 1â€“3 | 1â€“4 |
| Leader zombies (bonus reinforcement chance) | no | no | 0â€“5 % chance depending on regional difficulty |

Sources: [W] <https://minecraft.wiki/w/Phantom> for phantom group sizes; [W] <https://minecraft.wiki/w/Zombie> for reinforcements and for the villager-conversion table (the conversion table also appears on the Drowned page). [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

### 12.3 Zombie reinforcements â€” full spec

* Trigger: a zombie-variant mob is **damaged** (by an entity, or while targeting an entity), with `doMobSpawning == true`. [W]
* Gate: **Hard difficulty only.** [W]
* Per-zombie attribute `SPAWN_REINFORCEMENTS_CHANCE` in **0â€“10 %**; a **leader** zombie adds **50â€“75 percentage points**. Leader spawn chance **0â€“5 %**, scaling with clamped regional difficulty. [W]
* Algorithm: **up to 50 attempts** to pick a spawn location at **0 or Â±7â€“40 blocks** away in **all three axes**, requiring: a block with a solid top surface below; **light level 0**; **no players within 7 blocks**; no colliding entities or blocks. [W]
* Cost: each attempt applies a **âˆ’5 percentage-point penalty** to both the damaged zombie's and the new zombie's reinforcement statistic, which bounds the chain. [W]
* Reinforcements **ignore the hostile mob cap** and can appear in biomes where zombies cannot naturally spawn (mushroom fields, the End, the Nether). They are positioned at the **north-west corner** of the chosen block rather than the block centre. [W]
* Zombies within a **67Ã—21Ã—67 to 111Ã—21Ã—111** box around the damaged zombie are alerted onto the attacker; the box size comes from the mob's `followRange` (base **35**, Â±5 % random spawn bonus, plus a 0â€“50 % random zombie spawn bonus). [W]
* **1.21.2 change (24w33a): zombie villagers, husks, drowned and zombified piglins no longer spawn *regular* zombies** â€” they call their own kind. In 1.21.4 a reinforcement is therefore always the same variant as the caller, and may be a baby (including a chicken jockey). [W]

### 12.4 Regional difficulty

Every natural spawn calls `mob.finalizeSpawn(level, level.getCurrentDifficultyAt(mob.blockPosition()), EntitySpawnReason.NATURAL, groupData)`. [C] (vanilla context in Paper's and Canvas's diffs). `getCurrentDifficultyAt` returns a `LocalDifficulty` that combines the world's `Difficulty` with the **clamped regional difficulty** â€” the well-known function of the chunk's **inhabited time** and the **moon phase**, clamped to `[0, 1]`. [C] for the call and the type; **UNVERIFIED** for the exact clamp formula in 1.21.4 (do not guess it; the historical formula is `clamp(regionalDifficulty, 0, 1)` where regional difficulty itself is a piecewise function of inhabited time and the moon-phase multiplier).

It is consumed by: leader-zombie chance, zombie reinforcement bonus, mob armour/weapon/tool generation (`Mob.MAX_WEARING_ARMOR_CHANCE`, `MAX_ENCHANTED_ARMOR_CHANCE`, `MAX_ENCHANTED_WEAPON_CHANCE`, `MAX_PICKUP_LOOT_CHANCE`, `PRESERVE_ITEM_DROP_CHANCE` are all real fields on `Mob` [C] â€” javadoc field list â€” but their **values are UNVERIFIED**), and phantom spawn rolls. [W]/[I]

---

## 13. Structures with spawn overrides in 1.21.4

### 13.1 The complete list (exhaustive)

Every structure JSON under `data/minecraft/worldgen/structure/` in **1.21.4** was inspected. **Exactly six** structures carry a non-empty `spawn_overrides` object, plus **two** that carry an object whose per-category lists are all **empty** (which is a deliberate *suppression*, not a no-op). Everything else has no `spawn_overrides` key at all. [C] â€” all files fetched from
`https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/structure/<id>.json`

| Structure id | Category | `bounding_box` | Spawns (type, weight, minâ€“max) |
| --- | --- | --- | --- |
| `minecraft:fortress` (nether fortress) | `monster` | `piece` | blaze w10 2â€“3; zombified_piglin w5 4â€“4; wither_skeleton w8 5â€“5; skeleton w2 5â€“5; magma_cube w3 4â€“4 |
| `minecraft:monument` (ocean monument) | `monster` | `full` | guardian w1 2â€“4 |
| | `axolotls` | `full` | *(empty list)* |
| | `underground_water_creature` | `full` | *(empty list)* |
| `minecraft:pillager_outpost` | `monster` | `full` | pillager w1 1â€“1 |
| `minecraft:swamp_hut` | `monster` | `piece` | witch w1 1â€“1 |
| | `creature` | `piece` | cat w1 1â€“1 |
| `minecraft:trial_chambers` | all eight: `ambient`, `axolotls`, `creature`, `misc`, `monster`, `underground_water_creature`, `water_ambient`, `water_creature` | `piece` | **all empty** |
| `minecraft:ancient_city` | all eight | `full` | **all empty** |

Everything else â€” `bastion_remnant`, `mansion` (woodland mansion), `end_city`, `igloo`, `desert_pyramid`, `jungle_pyramid`, `mineshaft`, `mineshaft_mesa`, `stronghold`, `buried_treasure`, `nether_fossil`, `ocean_ruin_cold`, `ocean_ruin_warm`, `ruined_portal*` (all 7 variants), `shipwreck`, `shipwreck_beached`, `trail_ruins`, `village_*` (all 5) â€” has **no `spawn_overrides`** in 1.21.4. [C]

**This is a significant, easily-missed design point:** `trial_chambers` and `ancient_city` suppress *all* natural spawning inside their pieces by overriding every category with an empty list. A port that treats "empty list" as "fall through to the biome" will spawn mobs inside ancient cities and trial chambers â€” a visible behavioural bug.

### 13.2 `StructureSpawnOverride.BoundingBoxType` semantics

* **Serialized names in 1.21.4 are `"piece"` and `"full"`.** The code enum constant for the whole-structure case is `RIGID` in mappings, but the **JSON value is `"full"`** [C] (verbatim in all eight override files above). If you port from a document that says `"rigid"`, that spelling is wrong for 1.21.4 data packs â€” verify against your target version's codec.
* `piece` â€” the override applies while the candidate position falls inside the bounding box of the individual structure **piece** whose bounding box contains it. [I] (semantics; the string value is [C])
* `full` â€” the override applies anywhere inside the **whole structure's** bounding box. [I]
* Resolution order: for a candidate position, `mobsAt` first checks the nether-fortress special case (Â§9.2), then asks the generator; the generator returns the structure's list **instead of** the biome's list for that category, if any structure with an override for that category covers the position. There is **no merging** of structure and biome lists. [C] (the `mobsAt`/`canSpawnMobAt` shape in the diffs) + [W] ("structure-based spawns take priority over biome for hostile spawns â€¦ one sees only the corresponding hostile mobs for that structure within that structure")
* Overrides are only reachable from the **`getMobsAt`** path, which means they affect the per-tick cycle **and** the `canSpawnMobAt` re-validation of each pack member â€” but **not** chunk-generation spawning (Â§11). [C]/[W]

### 13.3 Hard-coded spawn spots are a *different* mechanism

Separate from `spawn_overrides`, four structures have **hard-coded spawn spots** handled outside the JSON: swamp huts, ocean monuments, pillager outposts, nether fortresses. [W] <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>

* A hard-coded spot is a fixed relative X/Z inside the structure with a structure-specific Y band; the spawner scans down from the top of that band and uses the **first** spawnable block found.
* The mob list is hard-coded in Java, not read from JSON: swamp huts â†’ witches; ocean monuments â†’ guardians; pillager outposts â†’ pillagers (including patrol captains); nether fortresses â†’ skeletons, wither skeletons, blazes, magma cubes. [W]
* The mob lists the wiki gives match the JSON overrides for those structures, which is exactly why the two paths are easy to confuse: **in 1.21.4 both exist and produce overlapping results for the same structures.** The fortress additionally uses the hard-coded `FORTRESS_ENEMIES` list gated on "nether bricks below" (Â§9.2) *in addition to* its `piece`-scoped JSON override. [C]/[W]
* Spawns from this path are marked persistent. [W]

---

## 14. Special spawners (not `NaturalSpawner`)

Each of these is a separate subsystem. Constants are given with citations; where I could not confirm a number it is marked.

### 14.1 Monster spawner block (`BaseSpawner` block entity)

| Quantity | Value |
| --- | --- |
| Activation radius | **16 blocks spherical** from the block's centre (i.e. 15.5 blocks from the spawner block itself), measured to the player's **foot-level coordinate**; spectators do not activate it |
| Spawn volume | **9Ã—3Ã—9** centred on the spawner (horizontal Â±4 blocks, vertical 0 / +1 / âˆ’1 relative to the spawner's Y). Horizontal coordinates are **fractional and triangular** (denser near the centre); vertical is an **integer** |
| Mobs attempted per cycle (`SpawnCount`) | **4** |
| Delay between cycles (`MinSpawnDelay`/`MaxSpawnDelay`) | **200 â€¦ 799 ticks** (10 s â€¦ 39.95 s); the stored `Delay` starts at **20** ticks |
| Nearby-entity limit (`MaxNearbyEntities`) | **6** of the same type, tested **before each of the 4 attempts**; box = `SpawnRange*2+1 Ã— SpawnRange*2+1 Ã— 8` centred on the spawner (the prose elsewhere says 9Ã—9Ã—9 â€” the NBT field documentation gives the 9Ã—9Ã—8 form) |
| `SpawnRange` | **4** (default) |
| Failure behaviour | If **no** mob spawned, retry **every tick** until at least one spawns; the 200â€“799-tick wait only starts after a successful spawn |
| Spawn reason | `SPAWNER`, which **ignores light requirements**; the general solid-block requirement is relaxed but per-mob rules (collision box, floor block, etc.) remain |
| Peaceful | Spawners still activate but spawn nothing |
| Block light to disable | A torch (block light 15) disables a "dark-only" spawner; a **blaze or silverfish** spawner needs block light **12** to be suppressed |

Source: [W] <https://minecraft.wiki/w/Monster_Spawner> (revision pinned via the MediaWiki API at 2025-03-01). The 1.18-experimental "light 12 for zombie/skeleton/spider/cave-spider spawners" change was **reverted in 21w37a**, so it is not in 1.21.4.

### 14.2 Trial spawner

| Quantity | Value |
| --- | --- |
| Activation | player in **Survival/Adventure**, within **14 blocks** (NBT `required_player_range`, default **14**, range 1â€“128) of the spawner centre, with **direct line of sight** (visual-shape raycast, not collision shape); once activated it no longer needs proximity/LOS |
| Activation gates | `doMobSpawning` must be true; the `spawner_blocks_work` gamerule must be true; difficulty must not be Peaceful |
| Light | Irrelevant |
| Spawn interval | **40 ticks (2 s)** default (hand-placed); naturally generated trial-chamber spawners use **20 ticks**, and "slow" ones (in `chamber_8`/`encounter_4`) use **160 ticks** |
| Total mobs (base) | **6**, **+2 per additional player** (breeze spawners: 2, +1) |
| Simultaneous mobs (base) | **2**, **+1 per additional player** (default); naturally generated non-breeze/non-baby-zombie spawners use **3**, **+0.5 per player**; breeze **1**, +0.5; slow versions **4**, +2; baby-zombie spawners keep the default simultaneous count but **+0.5 per player** |
| Spawn position | within a **4-block spherical radius** of the spawner, with line of sight to it; standard mob spawn rules otherwise |
| Cooldown | **30 minutes = 36000 ticks** (NBT `target_cooldown_length`, default **36000**), which keeps counting while unloaded |
| Reward ejection | after all spawned mobs are defeated: wait **40 ticks**, then eject one item per player every **30 ticks**; **50 %** chance the roll is a trial key (given to all players) |
| Despawning of its mobs | Trial-spawner mobs do **not** naturally despawn; the spawner only detects living mobs in loaded chunks, so moving them into unloaded chunks lets the spawner keep spawning |
| Ominous | A player with Bad Omen inside the range receives Trial Omen; nearby trial spawners convert to **ominous trial spawners**, despawning their current mobs and skipping any cooldown |

Source: [W] <https://minecraft.wiki/w/Trial_Spawner> (revision pinned via the MediaWiki API at 2025-03-01) + the 1.21.4 `<id>:trial_spawner` data (Â§13 shows trial chambers override every category with empty lists, so trial spawners â€” not `NaturalSpawner` â€” are the only mob source inside them). Note the block's states: `inactive`, `waiting_for_players`, `active`, `waiting_for_reward_ejection`, `ejecting_reward`, `cooldown`, plus the `ominous` boolean.

### 14.3 Pillager patrols

* Group of **1â€“5 pillagers** (Java), one of which is the **raid captain** (always a pillager, wearing an ominous banner). [W]
* Enabled only while `doPatrolSpawning` is true. **World age must reach 100 minutes (5 in-game days)** before the first attempt; thereafter an attempt is made after a **10â€“11 minute** delay with a **20 %** success chance, and the delay resets after every attempt. [W]
* Placement: a random location **24â€“48 blocks** away along **each** of X and Z from a player. The captain is attempted first; **if the captain cannot spawn, nothing spawns.** If it can, the game tries `ceil(localDifficulty)` further pillagers, each within a **4-block radius square** of the previous one. [W]
* Block/light rules: any non-fluid block with a motion-blocking material **except leaves**; block light **â‰¤ 8** (daytime patrols are possible); never if a player is within a **5Ã—5Ã—5 subchunk** cube around a village. Mushroom fields excluded. Not in Peaceful. [W]
* Hard-coded comment in the wiki source (kept as evidence of the predicate): patrol spawning checks `levelAccessor.getBrightness(LightLayer.BLOCK, pos) > 8` and rejects. [W]
* Patrol spawns use the dedicated `PatrollingMonster` predicate, **not** `Monster.checkMonsterSpawnRules`. [W]/[I]

### 14.4 Wandering trader

* A world-level counter starts at **24000 ticks (1 in-game day)** on world creation/upgrade. Every **1200 ticks (1 minute)**, if `doTraderSpawning` is true, the counter is decremented by **1200**. On reaching 0 it resets to 24000 and, if `doMobSpawning` is true, a spawn attempt may occur. [W]
* Attempt chance: **25 %** the first time, **50 %** the second, **75 %** thereafter, until a trader spawns or no player is found. [W]
* A random player is selected. If none, nothing spawns and the chance resets to **25 %**. If one is found, **90 %** of the time the attempt immediately fails. [W]
* Otherwise **10 attempts** are made to find a valid spawn on the uppermost block of a random X/Z within **âˆ’48 â€¦ +47** of the target (i.e. a 96Ã—96 square). [W]
* On success, **two trader llamas** are spawned with **10 attempts each** within **âˆ’4 â€¦ +3** of the trader, leashed to it. [W]
* The trader (and its llamas) may spawn **even when the `CREATURE` cap is full**, but they *are* counted against that cap (MC-272975). [W]
* Despawn: **48000 ticks (40 min)** loaded, timer frozen while unloaded; naming does not help; only `PersistenceRequired: 1b` does (Â§10.4). [W]
* While alive it prefers to stay within **16 blocks** of its spawn target. [W]

### 14.5 Phantoms

* Enabled while `doInsomnia` is true. Requires the player's **"Time Since Last Rest"** statistic â‰¥ **72000 ticks (3 in-game days)**; reset by sleeping **or dying**. Multiplayer: any qualifying player is enough. The player must have **no light-blocking block overhead**. [W]
* Spawn attempt every **1200â€“2400 ticks (1â€“2 minutes)**. [W]
* Conditions: it is night **or** a thunderstorm; the player is above sea level (**y â‰¥ 64**) with sky visible directly overhead; **local difficulty > a random value in [0.0, 3.0]**; the block chosen must have light level **â‰¤ 7** and be a surface block; spawns are limited by the monster cap (but, per MC-198101, they do not *adhere* to it) and are additionally subject to a **density cap of 5**. [W]
* Success probability once eligible: `(x âˆ’ 72000) / x` where `x` = ticks since last rest â†’ ~25 % on day 4, 40 % on day 5, 50 % on day 6, 57.1 % on day 7, â€¦ [W]
* Where they appear: a **21Ã—15Ã—21 cube centred 28 blocks above the player** (the wiki also says "20â€“34 blocks above the player, and off to the side by a Chebyshev distance of up to 10 blocks"). Group size: **1â€“2 Easy, 1â€“3 Normal, 1â€“4 Hard**. [W]
* Independent of biome (can spawn in mushroom fields and the void). Not produced by `NaturalSpawner`. [W]

### 14.6 Cats in villages

* Attempt every **1200 ticks (1 minute)**. A random player (spectators included) is chosen, and a random position **8â€“32 blocks** away horizontally **at the same height**. The chosen block must be **< 2 chunks from a village with fewer than 5 cats**, or inside a swamp hut. [W]
* Village validity: at least **five claimed beds within 48 blocks**, and **at most four cats within a 97Ã—17Ã—97 box** centred on the spawn position. [W]
* Cats are spawned **in the north-west corner** of the block (they then fall to the ground). They may spawn on fences (but not a fence with a torch on top). [W]
* **25 %** of cats spawn as babies; during a full moon **50 %** are black. [W]
* Village cats spawned during world generation never despawn; cats spawned later by this routine **can** despawn (they are the `Cat` exception to `Animal`'s non-despawn rule, Â§10.2). [W]
* Cat spawning is **not** affected by the `CREATURE` mob cap. [W]
* Swamp hut: one black cat per hut from world generation, never despawns; the routine adds more only if grass blocks exist inside the hut's bounding box, and never if a cat is already within a **16Ã—8Ã—16** volume. [W]

### 14.7 Iron golems in villages

* A villager may summon a golem while **gossiping** or **panicking**, subject to: it has slept in the last **20 minutes**; it has not detected a golem in the last **30 s** (golem search radius **Â±16 X/Y/Z**, scanned every **10 s**); it has not been near another summoning in the last **30 s** (within **10 blocks** of a villager that successfully summoned); and there are enough participants within **10 blocks** â€” **5 or more** when gossiping, **3 or more** when panicking. [W]
* Spawn-point search: up to **10 attempts** inside a **17Ã—13Ã—17** box centred on the villager (block position **Â±8 X/Z**, **Â±6 Y**); a random Y column is chosen and the topmost block that is air/liquid with a solid-blocking block beneath is taken. The target block and the two above must not be full blocks, redstone-powered or rails, and the two above must not be water. The golem must not collide with entities. [W]
* Iron golems spawn even when `doMobSpawning` is false (MC-111004). [W]
* Naturally spawned/created golems are persistent (`removeWhenFarAway == false`) and count as `MISC`. [I]

### 14.8 Breeding

Breeding is `Animal.spawnChildFromBreeding`-driven: it creates a baby via `getBreedOffspring`, calls `setBaby(true)`, `setPersistenceRequired()` (or `requiresCustomPersistence`), awards XP, and applies a **`BREEDING`** spawn reason so **all natural spawn conditions (light, floor, distance, caps) are skipped**. The offspring is placed adjacent to the parents, not at a spawn position. Numbers of interest: egg-based spawning (chicken â†’ 1 baby, 1/256 chance of 4), turtle eggs hatching, and the **5 %/10 %** natural-group baby chance (Â§9.4). [W]/[I]

### 14.9 Raids

* Started by a player with **Bad Omen** entering a village; wave composition and size scale with the **raid omen level** and with difficulty and local difficulty (Bedrock gives explicit per-wave tables; Java computes it). [W]
* Raid mobs spawn inside/around the village with the **`EVENT`/`RAID`** reason and gain persistence; they are **not** subject to the natural caps. Waves spawn over time with a cooldown between waves and a final "bonus wave" on Hard. [W]/[I] The exact Java wave-size arithmetic is **UNVERIFIED** here â€” do not take the Bedrock tables as Java behaviour.

### 14.10 Reinforcements

See Â§12.3. Summary: Hard-only, up to 50 attempts, 0 or Â±7â€“40 blocks in all three axes, light 0, no player within 7 blocks, ignores the monster cap, âˆ’5 pp cost per attempt, same-variant only in 1.21.4.

### 14.11 Zombie â†’ drowned conversion

* If a zombie's **head** (not the legs) is continuously submerged in water for **30 seconds (600 ticks)**, conversion begins and cannot be stopped; **15 seconds (300 ticks)** later it becomes a drowned with **full health**, regardless of its previous health or equipment durability. [W]
* Only **normal zombies** convert. Husks first convert to a normal zombie, then proceed. Zombie villagers and zombified piglins cannot convert. [W]
* Converted drowned never receive new equipment and never get a trident. [W]
* There is no random roll â€” the trigger is purely the submerged timer. [W]

---

## 15. The light model

### 15.1 Two stored channels, four derived values

| Concept | Range | Definition |
| --- | --- | --- |
| **Block light** | 0â€“15 | Emitted by light-emitting blocks; propagates by flood fill |
| **Sky light** | 0â€“15 | 15 for columns vertically exposed to the sky; does **not** change with time of day |
| **Internal sky light** (darkened sky light) | can be negative in principle; clamped in practice at 0 when used | `skyLight âˆ’ skyDarken` |
| **Internal light level** | 0â€“15 for decisions | `max(blockLight, internalSkyLight)` â€” this is the value mob spawning consults |
| **Client light** (rendering/crop growth only) | 0â€“15 | `max(skyLight, blockLight)`; time- and weather-independent |

Sources: [W] <https://minecraft.wiki/w/Light?oldid=2872432> ("The internal light level â€¦ It's calculated as the maximum level of the block light and the internal sky light (formula: `max(internal sky light, block light)`)"); [C] for `Level.getMaxLocalRawBrightness(BlockPos)` = `max(blockLight, skyLight âˆ’ skyDarken)`, and for the two-argument overload `getMaxLocalRawBrightness(pos, skyDarken)` used by the thunder path in `Monster.isDarkEnoughToSpawn` (Paper's `Monster.java.patch` context).

### 15.2 Propagation rules

* **Block light** decreases by **exactly 1 per block of taxicab (Manhattan) distance** from the source, along all three axes; so diagonal spread is attenuated by the sum of the axis distances. Example from the wiki: a torch (14) on the floor gives 13 to the four adjacent floor blocks and 12 to the four diagonal floor blocks. [W]
* **Sky light**:
  * straight **down** through a transparent block: **no attenuation**;
  * **horizontally or upward**: **âˆ’1** per step;
  * through a **light-filtering block**: the block's own attenuation applies instead;
  * a sky light value **< 15** propagates like block light, attenuating by 1 in all six directions until 0. [W]
* **Light-filtering blocks** (Java) each reduce **sky light only** by exactly **1** level: water, all transparent waterlogged blocks, bubble column, ice, frosted ice, cobweb, leaves, slime block, honey block, monster spawner, lava, beacon, end gateway, chorus plant, chorus flower, every shulker box. (This is Java's list; **Bedrock** uses much larger attenuations, e.g. water 2, leaves 1, powder snow 1, slabs 1, beacon 14.) [W]
* Directional opacity: pistons, daylight detectors, enchanting tables, farmland, lecterns, stonecutters, dirt paths, snow, end portal frames, slabs and stairs are shape-aware, so a dirt path blocks downward light but not sideways light. [W]
* Light-emitting values a port will need most: **15** beacon/conduit/end gateway/end portal/fire/glowstone/lantern/lava/sea lantern/shroomlight/light block-set, **14** torch/end rod, **13** lit furnace, **12** lit candle group of 4 / active vault, **11** nether portal, **10** soul torch/soul lantern/crying obsidian, **9** lit deepslate redstone ore, **8** active trial spawner, **7** redstone torch/glow lichen/enchanting table, **6** sculk catalyst, **5** amethyst cluster, **4** large amethyst bud / waiting trial spawner, **3** magma block, **2** medium amethyst bud, **1** brown mushroom/brewing stand/dragon egg. [W]

### 15.3 `skyDarken` â€” the ambient-darkness table

`Level.getSkyDarken()` is `0` in the day and rises to `11` at night, reduced by rain/snow and further by thunder; the *internal* sky light at sky light 15 is `15 âˆ’ skyDarken`, and for a sky light `s < 15` it is `s âˆ’ skyDarken`. [W]

| Weather / time | Internal sky light (at skyLight = 15) | Implied `skyDarken` |
| --- | --- | --- |
| noon, clear | **15** | **0** |
| noon, rain or snowfall | **12** | **3** |
| noon, thunderstorm | **10** (and monsters are allowed to spawn "as if the internal sky light level were actually **5**") | **5** (monster rule uses `skyDarken = 10` via the two-argument overload) |
| midnight, any weather | **4** | **11** |

[C] for the thunder override value **10** (the literal `getMaxLocalRawBrightness(pos, 10)` in `Monster.isDarkEnoughToSpawn`, Paper `Monster.java.patch` context); [W] for the 15/12/10/4 table. Note the apparent tension between "internal sky light 10 at noon during thunder" and "monsters behave as if it were 5": the two-argument overload substitutes `skyDarken = 10` (not 5), so `15 âˆ’ 10 = 5` â€” the **monster rule's** effective sky light is 5, while the *ambient* internal sky light is 10. [W] explains the discrepancy. `dimensionType.hasSkyLight() == false` â‡’ `skyDarken` is 0 and there is no sky light at all (Nether, End). [I]

**A worked monster roll (Overworld, clear night, surface, `blockLight = 0`, `skyLight = 15`):**
`skyDarken = 11` â†’ internal = `max(0, 15 âˆ’ 11) = 4`.
(A) `15 > nextInt(32)` fails with probability 15/32 â‰ˆ 46.9 %.
(B) `limit = 0 < 15` and `blockLight = 0`, so it passes.
(C) `4 <= nextInt(8)` succeeds with probability 5/8 = 62.5 %.
Net â‰ˆ 33 % of position candidates pass the light test â€” which is why open-surface spawning is roughly three times slower than a pitch-dark cave, where (A) always passes (`0 > nextInt(32)` is false) and (C) always passes (`0 <= nextInt(8)` is true). [C]

### 15.4 Other light-driven behaviours a port may need

* Animals ("friendly" mobs) require internal light **â‰¥ 9** in Java (**â‰¥ 7** in Bedrock); mooshrooms, polar bears and rabbits require **â‰¥ 12** in Bedrock only. [W]
* Frosted ice, snow/ice forming and melting, mushroom spreading/uprooting, crop growth and sapling growth all use block light / internal light as tabulated by the wiki; smooth lighting affects only rendered brightness. [W]

---

## 16. Biome spawn tables

### 16.1 Where the data lives

* Path: `data/minecraft/worldgen/biome/<id>.json` inside the vanilla data pack. [C]
* Keys consumed by natural spawning:
  * `"spawners"` â€” an object keyed by the **`MobCategory.getName()` strings**: `ambient`, `axolotls`, `creature`, `misc`, `monster`, `underground_water_creature`, `water_ambient`, `water_creature`. Each value is an **array** of `{ "type": <entity id>, "weight": <int>, "minCount": <int>, "maxCount": <int> }`. All eight keys are present even when the array is empty. [C]
  * `"spawn_costs"` â€” an object keyed by entity id, each `{ "charge": <float>, "energy_budget": <float> }`. Empty `{}` in all biomes except two (Â§9.6). [C]
  * `"creature_spawn_probability"` â€” a float; **present in exactly four 1.21.4 biomes** (verified by scanning all 64 biome files): [C]
    | Biome | `creature_spawn_probability` |
    | --- | --- |
    | `minecraft:badlands` | **0.03** |
    | `minecraft:eroded_badlands` | **0.03** |
    | `minecraft:wooded_badlands` | **0.04** |
    | `minecraft:snowy_plains` | **0.07** |
    | `minecraft:ice_spikes` | **0.07** |
    | *(all other biomes: key absent)* | **0.1** (the default, per the wiki) |
    These six match the wiki's table exactly. [W] <https://minecraft.wiki/w/Mob_spawning> (`Badlands 0.03, Eroded Badlands 0.03, Ice Spikes 0.07, Snowy Plains 0.07, Wooded Badlands 0.04, all others 0.1`). Note the wiki's *older* revision did not document the probability at all.
* The `misode/mcmeta` **`summary` / `data/data.json` style aggregated dumps do not carry a 1.21.4 snapshot**: `summary` tracks the newest version, and `https://raw.githubusercontent.com/misode/mcmeta/summary/data/biome/data.json` and `https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/summary/data/biome/data.json` both return **HTTP 404**. The per-file paths under the `1.21.4-data` tag **do** work and are the authoritative source used below. [C]

### 16.2 Complete `spawners` sections, 1.21.4 (verbatim data)

The following are the **complete** `spawners` objects as they appear in the 1.21.4 generated data, re-keyed to per-entry objects for compactness (each entry is exactly `{type, weight, minCount, maxCount}`). Files:
`https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/biome/<name>.json`

**`minecraft:plains`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:sheep","weight":12,"minCount":4,"maxCount":4},{"type":"minecraft:pig","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:chicken","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:cow","weight":8,"minCount":4,"maxCount":4},{"type":"minecraft:horse","weight":5,"minCount":2,"maxCount":6},{"type":"minecraft:donkey","weight":1,"minCount":1,"maxCount":3}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:forest`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:sheep","weight":12,"minCount":4,"maxCount":4},{"type":"minecraft:pig","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:chicken","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:cow","weight":8,"minCount":4,"maxCount":4},{"type":"minecraft:wolf","weight":5,"minCount":4,"maxCount":4}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:desert`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:rabbit","weight":4,"minCount":2,"maxCount":3}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":19,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":1,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:husk","weight":80,"minCount":4,"maxCount":4}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```
(`"creature_spawn_probability": 0.03` is not present here â€” desert is the default 0.1. The 0.03 belongs to `badlands`.)

**`minecraft:snowy_plains`** (also has `"creature_spawn_probability": 0.07`)
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:rabbit","weight":10,"minCount":2,"maxCount":3},{"type":"minecraft:polar_bear","weight":1,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":20,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:stray","weight":80,"minCount":4,"maxCount":4}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:jungle`** (note the **duplicate `chicken` entry** â€” two independent weight-10 entries, so chickens are double-weighted here)
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:sheep","weight":12,"minCount":4,"maxCount":4},{"type":"minecraft:pig","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:chicken","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:cow","weight":8,"minCount":4,"maxCount":4},{"type":"minecraft:chicken","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:parrot","weight":40,"minCount":1,"maxCount":2},{"type":"minecraft:panda","weight":1,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:ocelot","weight":2,"minCount":1,"maxCount":3}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:swamp`** (two `slime` entries: the weight-100 4-pack and a weight-1 singleton)
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:sheep","weight":12,"minCount":4,"maxCount":4},{"type":"minecraft:pig","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:chicken","weight":10,"minCount":4,"maxCount":4},{"type":"minecraft:cow","weight":8,"minCount":4,"maxCount":4},{"type":"minecraft:frog","weight":10,"minCount":2,"maxCount":5}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":70,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:slime","weight":1,"minCount":1,"maxCount":1},{"type":"minecraft:bogged","weight":30,"minCount":4,"maxCount":4}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:ocean`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[], "creature":[], "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:drowned","weight":5,"minCount":1,"maxCount":1}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[{"type":"minecraft:cod","weight":10,"minCount":3,"maxCount":6}],
 "water_creature":[{"type":"minecraft:squid","weight":1,"minCount":1,"maxCount":4},{"type":"minecraft:dolphin","weight":1,"minCount":1,"maxCount":2}]}
```

**`minecraft:river`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[], "creature":[], "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:drowned","weight":100,"minCount":1,"maxCount":1}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[{"type":"minecraft:salmon","weight":5,"minCount":1,"maxCount":5}],
 "water_creature":[{"type":"minecraft:squid","weight":2,"minCount":1,"maxCount":4}]}
```

**`minecraft:dripstone_caves`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[], "creature":[], "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:drowned","weight":95,"minCount":4,"maxCount":4}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:lush_caves`**
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[{"type":"minecraft:axolotl","weight":10,"minCount":4,"maxCount":6}],
 "creature":[], "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[{"type":"minecraft:tropical_fish","weight":25,"minCount":8,"maxCount":8}],
 "water_creature":[]}
```

**`minecraft:deep_dark`** â€” every category empty:
```json
{"ambient":[],"axolotls":[],"creature":[],"misc":[],"monster":[],
 "underground_water_creature":[],"water_ambient":[],"water_creature":[]}
```

**`minecraft:mushroom_fields`** â€” `monster` empty too:
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:mooshroom","weight":8,"minCount":4,"maxCount":8}],
 "misc":[], "monster":[],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

**`minecraft:nether_wastes`**
```json
{"ambient":[], "axolotls":[],
 "creature":[{"type":"minecraft:strider","weight":60,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:ghast","weight":50,"minCount":4,"maxCount":4},{"type":"minecraft:zombified_piglin","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:magma_cube","weight":2,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":1,"minCount":4,"maxCount":4},{"type":"minecraft:piglin","weight":15,"minCount":4,"maxCount":4}],
 "underground_water_creature":[], "water_ambient":[], "water_creature":[]}
```

**`minecraft:soul_sand_valley`** (the only Overworld-or-Nether biome with skeleton packs of **5**; and one of the two biomes with non-empty `spawn_costs`)
```json
{"ambient":[], "axolotls":[],
 "creature":[{"type":"minecraft:strider","weight":60,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:skeleton","weight":20,"minCount":5,"maxCount":5},{"type":"minecraft:ghast","weight":50,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":1,"minCount":4,"maxCount":4}],
 "underground_water_creature":[], "water_ambient": [], "water_creature": []}
```
`"spawn_costs": {"minecraft:enderman":{"charge":0.7,"energy_budget":0.15},"minecraft:ghast":{"charge":0.7,"energy_budget":0.15},"minecraft:skeleton":{"charge":0.7,"energy_budget":0.15},"minecraft:strider":{"charge":0.7,"energy_budget":0.15}}`

**`minecraft:warped_forest`**
```json
{"ambient":[], "axolotls":[],
 "creature":[{"type":"minecraft:strider","weight":60,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:enderman","weight":1,"minCount":4,"maxCount":4}],
 "underground_water_creature":[], "water_ambient": [], "water_creature": []}
```
`"spawn_costs": {"minecraft:enderman":{"charge":1.0,"energy_budget":0.12}}`

**`minecraft:crimson_forest`**
```json
{"ambient":[], "axolotls":[],
 "creature":[{"type":"minecraft:strider","weight":60,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:zombified_piglin","weight":1,"minCount":2,"maxCount":4},{"type":"minecraft:hoglin","weight":9,"minCount":3,"maxCount":4},{"type":"minecraft:piglin","weight":5,"minCount":3,"maxCount":4}],
 "underground_water_creature":[], "water_ambient": [], "water_creature": []}
```

**`minecraft:basalt_deltas`** (ghast 1-per-pack via `getMaxSpawnClusterSize() == 1`; magma cube packs up to 5)
```json
{"ambient":[], "axolotls":[],
 "creature":[{"type":"minecraft:strider","weight":60,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:ghast","weight":40,"minCount":1,"maxCount":1},{"type":"minecraft:magma_cube","weight":100,"minCount":2,"maxCount":5}],
 "underground_water_creature":[], "water_ambient": [], "water_creature": []}
```

**`minecraft:the_end`**
```json
{"ambient":[], "axolotls":[], "creature":[], "misc":[],
 "monster":[{"type":"minecraft:enderman","weight":10,"minCount":4,"maxCount":4}],
 "underground_water_creature":[], "water_ambient": [], "water_creature": []}
```

**`minecraft:ice_spikes`** (probability 0.07; otherwise identical to `snowy_plains`)
```json
{"ambient":[{"type":"minecraft:bat","weight":10,"minCount":8,"maxCount":8}],
 "axolotls":[],
 "creature":[{"type":"minecraft:rabbit","weight":10,"minCount":2,"maxCount":3},{"type":"minecraft:polar_bear","weight":1,"minCount":1,"maxCount":2}],
 "misc":[],
 "monster":[{"type":"minecraft:spider","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:zombie","weight":95,"minCount":4,"maxCount":4},{"type":"minecraft:zombie_villager","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:skeleton","weight":20,"minCount":4,"maxCount":4},{"type":"minecraft:creeper","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:slime","weight":100,"minCount":4,"maxCount":4},{"type":"minecraft:enderman","weight":10,"minCount":1,"maxCount":4},{"type":"minecraft:witch","weight":5,"minCount":1,"maxCount":1},{"type":"minecraft:stray","weight":80,"minCount":4,"maxCount":4}],
 "underground_water_creature":[{"type":"minecraft:glow_squid","weight":10,"minCount":4,"maxCount":6}],
 "water_ambient":[], "water_creature":[]}
```

### 16.3 Observations that a port must reproduce

1. **The wiki's mob/group-size/weight tables are wrong or Bedrock-flavoured in places.** For Java 1.21.4 the authoritative table is the JSON above. Two concrete traps:
   * The wiki's creature list says `sheep weight 6, chicken 5, pig 5, cow 4`; the actual 1.21.4 Java data is `sheep 12, pig 10, chicken 10, cow 8, horse 5, donkey 1`.
   * The wiki's monster list says `zombie 100, skeleton 80, creeper 100, spider 100, enderman 10, witch 5` and gives spider a singleton pack; the actual data is `spider 100, zombie 95, zombie_villager 5, skeleton 100, creeper 100, slime 100, enderman 10 (1â€“4), witch 5 (1â€“1)`, all 4-packs except the singletons.
2. **`slime` appears in the `monster` list of nearly every Overworld biome** (weight 100, 4-pack), plus a second weight-1 singleton in swamps. The fine-grained slime rules (Y < 40, swamp Y 50â€“70, moon-phase failure) are enforced by the mob's own predicate, not by the biome table. [C]/[W]
3. **Duplicate entries are legal and multiply the weight** (jungle's two `chicken` entries). A port must keep the array as-is and weight by entry, not de-duplicate by type.
4. **`misc` is always `[]`**; and `deep_dark` has all eight arrays empty, which is how the deep dark suppresses spawning. [C]
5. Overworld biomes with `creature: []` (no passive land animals at all): all ocean variants, river/frozen_river, snowy_beach, stony_shore, all cave biomes, the End, the void. [W] + [C]

---

## 17. Licensing

| Project | License | Can I vendor it? |
| --- | --- | --- |
| **PaperMC/Paper** | **GPL-3.0** (inherited from Spigot â†’ Bukkit â†’ CraftBukkit). `LICENSE.md` states: "Paper inherits its licensing from the included upstream projects. As such, Paper is licensed under the GNU General Public License version 3; as it inherits it from Spigot, who in turn inherits it from the original Bukkit and CraftBukkit projects." Individual contributors listed in that file have additionally released their contributions under **MIT**; the default for anyone not listed is GPL. | **No â€” do not copy Paper/Spigot patch text or code into a non-GPL project.** This document used Paper/Canvas *only* as an architectural and behavioural reference and contains no copied source. <https://raw.githubusercontent.com/PaperMC/Paper/ver/1.21.4/LICENSE.md> |
| **Glowstone** | **MIT** â€” the `LICENSE` file reproduces the MIT permission text ("Permission is hereby granted, free of charge, to any person obtaining a copy of this softwareâ€¦"), with notices for The Glowstone Project (2015â€“2022), Tad Hardesty (2011â€“2014) and Graham Edgecombe / Lightstone (2010â€“2011). | Yes, with the copyright notice and permission notice retained. <https://raw.githubusercontent.com/GlowstoneMC/Glowstone/master/LICENSE> |
| **Cuberite** | **Apache-2.0** â€” `LICENSE` is the full Apache License 2.0 text, prefixed with "Cuberite: A lightweight, fast and extensible game server for Minecraft â€¦ Copyright 2011-2025 Cuberite Contributors". | Yes, under Apache-2.0 terms (retain notices, state changes, include the licence, no trademark use). <https://raw.githubusercontent.com/cuberite/cuberite/master/LICENSE> |
| **PrismarineJS / minecraft-data** | **MIT** â€” the README's `## License` section reads "MIT", with the caveat "If required by one of the sources the license might change to something more appropriate." | Yes, with the MIT notice retained; note that minecraft-data is *data*, and its own content is derived from Minecraft (see the caveat below). <https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/README.md> |
| **misode/mcmeta** | **No LICENSE file exists.** I probed `LICENSE`, `LICENSE.md` and `COPYING` on the `main`, `summary`, `data`, `data-json`, `registries`, `assets` and `diff` branches â€” all return HTTP 404. The README has a `## Disclaimer` but **no licence grant**: "mcmeta is not an official Minecraft product, and is not endorsed by or associated with Mojang Studios. All data and assets were obtained through Mojang's internal data generator and public API. If Mojang ever has something against this data existing here, the repository will be promptly removed." | **Do not treat mcmeta as CC0 or MIT.** Absent a licence file, the default is "all rights reserved" for any copyrightable expression misode holds, and the *underlying* data is Mojang's. The safe reading: mcmeta is a **convenience mirror of Mojang-generated data**, so the licence question is really "may I redistribute Minecraft's generated data JSON?" â€” which is governed by the Minecraft EULA / the Minecraft Usage Guidelines, not by an open-source licence. |

### 17.1 Practical guidance for the re-implementation

* **Do not vendor Paper/Spigot/CraftBukkit source.** GPL-3.0 is viral for a distributed derivative work. Use their patch files as a *specification reference* only, exactly as this document does.
* **Glowstone (MIT)** and **Cuberite (Apache-2.0)** are the safe code references if you need a permissively licensed prior implementation to compare behaviour against. Both are server re-implementations, so their code is not Mojang-derived.
* **minecraft-data (MIT)** is fine to vendor for entity/biome/item *names and ids*, but it does not contain the mob-spawn tables you need at 1.21.4 resolution.
* **mob-spawn JSON from mcmeta: do not assume it is vendorable.** Because there is no licence file, the conservative options are:
  1. Generate the tables yourself from a legitimately obtained 1.21.4 client/server jar (Â§16.1 shows the exact path and shape), or
  2. Hand-transcribe only the numeric spawn tables (facts/numbers are generally not copyrightable, and the tables in Â§16.2 are small), with attribution, or
  3. Ask misode for a licence, or use the `data-json` branch contents under whatever terms you can establish.
  Note that even option 2 imports Mojang's game data; the *compilation* of vanilla data as a data pack is what most community projects redistribute, and Mojang has historically tolerated rather than licensed it. Get legal advice before shipping a commercial product.
* This document itself is a **behavioural description**, not a copy of any of the above; the only verbatim material is (a) short identifier/method names, which are necessary for interoperability, (b) numeric constants, and (c) the biome `spawners` JSON of Â§16.2, which is reproduced as *data* per the task's request.

---

## Appendix A â€” End-to-end pseudocode for the per-tick cycle

```ts
// Executed once per server tick, after the level's chunks have been ticked.
function tickChunks(level, chunkMap, chunkSource): void {
  const timeDiff = level.gameTime - chunkSource.lastInhabitedUpdate;
  chunkSource.lastInhabitedUpdate = level.gameTime;

  // ---- 1. (Re)build the spawn state, ~every 400 ticks ----
  if (level.gameTime % 400 === 0) {                       // [I] exact gate UNVERIFIED
    const spawnableChunkCount = distanceManager.getNaturalSpawnChunkCount(); // [I] accessor name
    const localCap = perPlayerCapsEnabled ? null
                   : new LocalMobCapCalculator(chunkMap);
    chunkSource.spawnState = createState(
        spawnableChunkCount, level.allLoadedEntities(), chunkMap::getFullChunk,
        localCap, /*countMobs*/ true);
  }
  const state = chunkSource.spawnState;

  // ---- 2. Which categories run this tick ----
  const doMobSpawning = level.gameRules.doMobSpawning && level.players.length > 0;
  let categories: MobCategory[] = [];
  if (doMobSpawning && (chunkSource.spawnEnemies || chunkSource.spawnFriendlies)) {
    const spawnPassives   = (level.gameTime % 400n) === 0n;
    const spawnFriendlies = chunkSource.spawnFriendlies;
    const spawnEnemies    = chunkSource.spawnEnemies;      // false on Peaceful
    for (const c of SPAWNING_CATEGORIES) {                 // all categories except MISC
      if ((spawnFriendlies || !c.isFriendly())
       && (spawnEnemies    ||  c.isFriendly())
       && (spawnPassives   || !c.isPersistent())
       && state.canSpawnForCategoryGlobal(c)) {
        categories.push(c);
      }
    }
  }

  // ---- 3. Candidate chunks: all eligible ones, shuffled ----
  const chunks: LevelChunk[] = [];
  chunkMap.collectSpawningChunks(chunks);                  // filters on 128-block player proximity + ticking
  Util.shuffle(chunks, level.random);

  for (const chunk of chunks) {
    chunk.incrementInhabitedTime(timeDiff);
    if (categories.length > 0 && level.worldBorder.isWithinBounds(chunk.pos)) {
      spawnForChunk(level, chunk, state, categories);
    }
    if (level.shouldTickBlocksAt(chunk.pos)) level.tickChunk(chunk, randomTickSpeed);
  }
}

function spawnForChunk(level, chunk, state, categories): void {
  for (const category of categories) {
    if (!state.canSpawnForCategoryLocal(category, chunk.pos)) continue;  // per-player cap
    spawnCategoryForChunk(category, level, chunk, state.canSpawn, state.afterSpawn);
  }
}

function spawnCategoryForChunk(category, level, chunk, extraTest, afterSpawn): void {
  const start = getRandomPosWithin(level, chunk);           // see Â§6.1
  if (start.y >= level.minY + 1) {
    spawnCategoryForPosition(category, level, chunk, start, extraTest, afterSpawn);
  }
}

function getRandomPosWithin(level, chunk): BlockPos {
  const x = chunk.pos.minBlockX + level.random.nextInt(16);
  const z = chunk.pos.minBlockZ + level.random.nextInt(16);
  const surfaceY = chunk.getHeight(Heightmap.WORLD_SURFACE, x, z) + 1;
  const y = randomBetweenInclusive(level.random, level.minY, surfaceY);
  return new BlockPos(x, y, z);
}
```
Then `spawnCategoryForPosition` as given in Â§6.3/Â§6.4, and the per-mob predicates in Â§7/Â§8.

## Appendix B â€” Everything I could not verify (do not guess from this document)

1. **`MAGIC_NUMBER == 289`** is [W], not [C] (the field is package-private and therefore absent from javadoc constant tables).
2. Vanilla's **`spawnFriendlies` initialisation** and the meaning/independence of the two spawn-settings booleans (there is a self-assignment in `setSpawnSettings`).
3. The exact **`SpawnState` rebuild cadence** in `tickChunks` (I confirmed the state object is cached between ticks and that a `countMobs = true` rebuild happens, but not the precise gate).
4. **`SpawnState.canSpawn(EntityType, BlockPos, ChunkAccess)`** â€” the spawn-charge/energy-budget comparison body. The two `spawn_costs` tables are [C].
5. **`SpawnPlacements`' per-entity registration table** (which entity uses which `SpawnPlacementType` and which `Heightmap.Types`), and the **bodies** of `SpawnPlacementTypes.ON_GROUND`, `IN_WATER`, `IN_LAVA`, `isValidEmptySpawnBlock`.
6. Which **`EntitySpawnReason`s** set `ignoresLightRequirements()`.
7. The precise **order of clauses** inside `SpawnPlacements`/`isValidEmptySpawnBlock` (matters if you need bit-exact RNG parity, since some clauses consume randomness).
8. **`Monster.updateNoActionTime()` body** (the +2/+2 extras are [W]).
9. The **clamped regional difficulty formula** and `Mob`'s armour/weapon chance constants.
10. The threshold constant for the below-world cull (**`minY âˆ’ 64`** vs a literal âˆ’128) and the End/Nether values.
11. **`EntityType.canSpawnFarFromPlayer()`** â€” which types set it true.
12. `Mob.removeWhenFarAway` overrides for **piglin brute / evoker / vindicator / illusioner / warden / sniffer / camel / allay** in Java 1.21.4.
13. `Mob.getMaxSpawnClusterSize()` / `Mob.isMaxGroupSizeReached(int)` **per-mob values** in 1.21.4 (the wiki's 8/6/1/4 table is [W]); and `Mob.isMaxGroupSizeReached`'s default body.
14. The per-mob **natural-group baby chance** (5 % vs 10 %).
15. The **1.21.4 Java raid wave arithmetic** (the Bedrock tables are not Java behaviour).
16. Whether `NaturalSpawner.getRandomPosWithin` still routes through a `MOTION_BLOCKING_NO_LEAVES` heightmap in some code path â€” the 1.21.4 evidence points to `WORLD_SURFACE`.
17. The **"half of the heightmap"** rule, the **"one random chunk per player per tick"** rule, and the **"120-block per-player radius"** â€” all three are absent from / contradicted by the 1.21.4 evidence I inspected.
18. Chunk-eligibility ticket level (ENTITY_TICKING vs BLOCK_TICKING) for `collectSpawningChunks`.
19. `DistanceManager`'s natural-spawn chunk-count **accessor name**.
20. The 1.21.4-era wiki pages for `Spawn`, `Mob cap`, `Despawn`, `Difficulty`, `Spawner`, `Structure` were not individually revision-pinned; numbers taken from the live pages are flagged in-line.

## Appendix C â€” Source index

Vanilla 1.21.4 generated data (mcmeta tag `1.21.4-data`):
* Biome: <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/biome/plains.json> (and 63 siblings; all fetched)
* Dimension types: <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/dimension_type/overworld.json>, `â€¦/the_nether.json`, `â€¦/the_end.json`, `â€¦/overworld_caves.json`
* Structures: <https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/structure/fortress.json>, `â€¦/monument.json`, `â€¦/pillager_outpost.json`, `â€¦/swamp_hut.json`, `â€¦/trial_chambers.json`, `â€¦/ancient_city.json` (all 34 fetched)
* Repo root/README: <https://github.com/misode/mcmeta>, <https://raw.githubusercontent.com/misode/mcmeta/main/README.md>

Paper/Canvas diffs (architecture + vanilla context only):
* <https://github.com/PaperMC/Paper/tree/ver/1.21.4/paper-server/patches/sources/net/minecraft> â€” `world/level/NaturalSpawner.java.patch`, `world/entity/Mob.java.patch`, `world/entity/monster/Monster.java.patch`, `server/level/ServerChunkCache.java.patch`, `server/level/ChunkMap.java.patch`, `server/level/DistanceManager.java.patch`
* <https://github.com/CraftCanvasMC/Canvas/tree/main/canvas-server/minecraft-patches/sources/net/minecraft> â€” `world/level/NaturalSpawner.java.patch`, `server/level/ServerChunkCache.java.patch`, `server/level/ChunkMap.java.patch`

Signatures and constants:
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/MobCategory.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/level/NaturalSpawner.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/level/LocalMobCapCalculator.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/SpawnPlacements.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/SpawnPlacementTypes.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/monster/Monster.html>
* <https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/constant-values.html>

Wiki (revision-pinned where possible):
* Mob spawning, revid 2874883 (2025-02-24): <https://minecraft.wiki/w/Mob_spawning?oldid=2874883>
* Mob spawning, live (documents 1.21.9+): <https://minecraft.wiki/w/Mob_spawning>
* Light, revid 2872432 (2025-02-22): <https://minecraft.wiki/w/Light?oldid=2872432>
* Monster Spawner: <https://minecraft.wiki/w/Monster_Spawner>
* Trial Spawner: <https://minecraft.wiki/w/Trial_Spawner>
* Phantom, Wandering Trader, Patrol, Zombie, Drowned, Cat, Iron Golem, Raid, Village (revision-pinned via the MediaWiki API at 2025-03-01)

Dimension-type field semantics:
* <https://raw.githubusercontent.com/Apollounknowndev/worldgen-docs/gh-pages/docs/docs/dimensions/dimension-types.md>

Licences:
* Paper: <https://raw.githubusercontent.com/PaperMC/Paper/ver/1.21.4/LICENSE.md>
* Glowstone: <https://raw.githubusercontent.com/GlowstoneMC/Glowstone/master/LICENSE>
* Cuberite: <https://raw.githubusercontent.com/cuberite/cuberite/master/LICENSE>
* minecraft-data: <https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/README.md>
* mcmeta: no LICENSE file (verified absent on 7 branches)

