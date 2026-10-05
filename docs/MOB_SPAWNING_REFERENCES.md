# Mob spawning references and licences

Every external source used while building the mob-spawning subsystem, what it was used for, and its
licence. The rule this document exists to enforce: **study behaviour and architecture, then implement
it independently.** No decompiled Mojang source, and no Mojang-derived source from Paper or any other
fork, is copied into this repository.

Target version: **Minecraft Java Edition 1.21.4**. See
[MOB_SPAWNING_PARITY.md](MOB_SPAWNING_PARITY.md) for why that version, and
[research/mob-spawning-1.21.4.md](research/mob-spawning-1.21.4.md) for the claim-by-claim working
notes.

---

## 1. Summary table

| Source | Licence | What it was used for | Copied? |
| --- | --- | --- | --- |
| [misode/mcmeta](https://github.com/misode/mcmeta) `1.21.4-data` | **No licence file** (see §3) | the biome spawn tables; the structure spawn overrides; the dimension-type light rules; the `creature_spawn_probability` values | The numeric data only, as generated configuration. See §3. |
| [minecraft.wiki](https://minecraft.wiki/) | CC BY-NC-SA 3.0 | the mob cap table; the spawn-condition and per-mob rule tables; the pack-spawning description; the despawning description; the light-level model | Short behavioural claims, quoted with attribution in the research notes only. No article text in shipped source. |
| [PaperMC/Paper](https://github.com/PaperMC/Paper) `ver/1.21.4` | **GPL-3.0** | class and method architecture (`NaturalSpawner`, `SpawnState`, `LocalMobCapCalculator`, `SpawnPlacements`, `ChunkMap`, `ServerChunkCache`); structural context visible in patch files | **No.** Architecture and behaviour only. |
| [NeoForge Javadoc for 1.21.x](https://nekoyue.github.io/ForgeJavaDocs-NG/) | documentation, MIT-licensed tooling | method signatures, the four placement types, `Heightmap.Types` | No |
| [NeoForge generated constant values](https://github.com/neoforged/NeoForge) | LGPL-2.1 (NeoForge); the values themselves are Mojang's | `MIN_SPAWN_DISTANCE` 24, `SPAWN_DISTANCE_BLOCK` 128, `SPAWN_DISTANCE_CHUNK` 8, `MobCategory.noDespawnDistance` 32 | No |
| [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) | **MIT** | already used by this repo for blocks, items, loot and foods; consulted for entity ids | No |
| [GlowstoneMC/Glowstone](https://github.com/GlowstoneMC/Glowstone) | **MIT** | architectural ideas around spawn intervals, spawn limits and the world tick | No |
| [cuberite/cuberite](https://github.com/cuberite/cuberite) | **Apache-2.0** | historical spawning concepts and general entity architecture only. **Not** a modern-vanilla oracle. | No |
| [PrismarineJS/prismarine-world](https://github.com/PrismarineJS/prismarine-world), [flying-squid](https://github.com/PrismarineJS/flying-squid) | MIT | chunk/world representation and browser/server integration ideas | No |
| [OpenJDK `java.util.Random`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Random.html) | GPL-2.0-with-classpath-exception | the LCG constants and the `next(bits)` / `nextInt(bound)` algorithm, which are published constants and documented behaviour | The algorithm, reimplemented from the published specification |
| [apollounknowndev/worldgen-docs](https://github.com/apollounknowndev/worldgen-docs) | MIT | the dimension-type field semantics (`monster_spawn_block_light_limit`, `monster_spawn_light_level`) | No |

---

## 2. What each source was actually used for

### misode/mcmeta — the data

`scripts/generate-mob-spawn-data.mjs` fetches, from the `1.21.4-data` branch:

- `data/minecraft/worldgen/biome/*.json` — 65 files. Only each file's `spawners` block is read.
- the directory listing for the biome file names, which is the authority for *which* biomes exist in
  1.21.4. The listing needs the GitHub API, which is rate limited for unauthenticated use, so the
  generator falls back to a pinned list of the 66 vanilla 1.21.4 biome ids and a test asserts the two
  agree rather than letting the fallback drift.

The `.cache/spawn-research/` directory also holds structure JSONs and dimension-type JSONs, downloaded
during research and used to fill in `STRUCTURE_SPAWN_OVERRIDES` and the per-dimension light constants
by hand (they are small and are quoted in the source with their provenance).

**Why the version pin matters.** The `summary` branch tracks the latest snapshot, and its biome
registry is **not** 1.21.4's. Using it silently fetched a later version's `dappled_forest` and 404'd.
That is exactly the version-mixing the task forbids, so the registry and the biome files both come from
the same versioned branch now.

### minecraft.wiki — the behaviour

Used for the rules that are described but not expressible as data: the mob cap table and the
`mobCap × chunks ÷ 289` formula, the pack-spawning mechanics, the spawn-condition tables (hostile,
passive, aquatic, ambient), the per-mob rule table, the despawning description, and the light-level
model.

The wiki's text is CC BY-NC-SA 3.0. **Quotations appear only in `docs/research/mob-spawning-1.21.4.md`
and `docs/mob-spawning-spec-1.21.4.md`, with the URL and section attributed**, because a parity
document that does not quote its source is not checkable. No wiki prose is reproduced in `src/`.

Two caveats found while using it:

1. The **live** wiki now documents 1.21.9+/26.x. Numbers from it are not 1.21.4 numbers unless the
   revision is pinned. The research notes record the revision-pinned text used
   (`rvstart=2025-03-01` via the MediaWiki API).
2. The wiki's mob/weight/group-size tables are in places wrong or Bedrock-flavoured. Where the wiki and
   the 1.21.4 data pack disagree, **the data pack wins** — which is why the biome tables are generated
   rather than transcribed from the wiki.

### PaperMC/Paper — the architecture

Used to learn the *shape* of the system: which classes exist, which one owns which decision, and the
order in which the decisions are made. Class and method names appear in comments and documents
(`NaturalSpawner.SpawnState`, `LocalMobCapCalculator`, `SpawnPlacements`, `collectSpawningChunks`,
`getRandomPosWithin`, `isDarkEnoughToSpawn`) because naming the vanilla concept is how a reader checks
the correspondence.

Paper is **GPL-3.0**. Patch files were read for structural context — for example to establish that the
spawnable-chunk test is `euclideanDistanceSquared < 16384.0`, that the shuffle exists, and that
`Mob.checkDespawn` compares with a strict `>`. No patch text, and no decompiled source, was copied into
this repository. Every claim sourced this way is re-derived as behaviour and reimplemented in
TypeScript-style JavaScript in this repository's own idioms.

**The clean-room boundary, stated plainly:** the implementation in `src/spawning/` was written from the
behavioural specification in `docs/mob-spawning-spec-1.21.4.md` and the research notes, not from Java
source. Where this document says a rule matches vanilla, the evidence is the cited source and the
automated test, not a code comparison.

### NeoForge Javadoc and constant values

Used for exact signatures and constants, which are facts about the API rather than creative work:
`SpawnPlacements.register(EntityType, SpawnPlacementType, Heightmap.Types, SpawnPredicate)`,
`getMaxInstancesPerChunk()`, `MIN_SPAWN_DISTANCE = 24`, `SPAWN_DISTANCE_BLOCK = 128`, and
`MobCategory.noDespawnDistance = 32`.

### java.util.Random

`src/spawning/spawnRandom.js` reimplements `java.util.Random`. The LCG multiplier
(`0x5DEECE66D`), addend (`0xB`) and 48-bit modulus are published constants; the `next(bits)`
truncation and `nextInt(bound)` rejection-sampling loop are documented behaviour. The implementation is
verified against the JDK's own output for seed 42 (`-1170105035, 234785527, -1360544799`) rather than
against a transcription.

Vanilla draws from `Level.random`, so reproducing the generator exactly is what makes a seeded
differential comparison possible at all.

---

## 3. The mcmeta licence question

**`misode/mcmeta` has no licence file.** Verified absent as `LICENSE`, `LICENSE.md` and `COPYING` on
the `main`, `summary`, `data`, `data-json`, `registries`, `assets` and `diff` branches. It is a mirror
of Minecraft's own generated data, not an independently licensed work.

Three honest positions are available, and this repository takes the third:

1. Treat the data as unlicensed and do not use it. Rejected: the alternative is hand-transcribing 65
   biome tables, which is both more error-prone and no more clearly licensed — the numbers are
   Mojang's either way.
2. Treat it as CC0 or MIT. Rejected: that would be an assumption about a licence that is not there.
3. **Use the numeric data as factual configuration, record its provenance clearly, and keep the
   derivative work in one generated file so it is easy to identify and easy to replace.**

What was done, concretely:

- Only the **numeric spawn configuration** is reproduced: `type`, `weight`, `minCount`, `maxCount` per
  biome per category, plus `creature_spawn_probability`. No terrain, feature, effect, temperature,
  downfall or carver data is taken.
- The output lives in exactly one generated file, `src/spawning/vanillaBiomeSpawns.js`, whose header
  names the source, the branch and the generator.
- The generator (`scripts/generate-mob-spawn-data.mjs`) works from a gitignored cache
  (`.cache/mc-data/biomes/`) and can be re-run or replaced. If a licensed source of the same data
  becomes available (a Mojang-authored data pack, or minecraft-data gaining biome support), swapping it
  in is a change to one script.
- The same is true of the player-visible game data this repository already ships from minecraft-data
  (blocks, items, loot, foods) — this is the established pattern here, and the mcmeta tables follow it.

This is a deliberate, documented choice, not an oversight. A reviewer who disagrees can delete one
generated file and re-run one script.

---

## 4. Sources explicitly NOT used as oracles

| Source | Why not |
| --- | --- |
| [Glowstone](https://github.com/GlowstoneMC/Glowstone) | MIT, and useful for architecture, but it does not track current vanilla spawning closely. No behaviour was taken from it. |
| [Cuberite](https://github.com/cuberite/cuberite) | Apache-2.0, and historical concepts only. Its spawning is not modern vanilla. |
| [PrismarineJS/flying-squid](https://github.com/PrismarineJS/flying-squid) | Does **not** reproduce vanilla natural spawning; used for integration ideas only. |
| Bedrock Edition behaviour | Different in many ways that matter here (cluster spawning instead of pack spawning, per-chunk despawning, much larger water attenuation, different hostile-light rules). Mixed in only where the wiki is explicitly Bedrock-flavoured. |
| Pre-1.18 spawning descriptions | The "light level 0" figure and the `nextInt(heightmapY - minY) / 2` style formulas predate the 1.18 light change and the current `MobCategory` design. |
| 1.21.5+ behaviour | `dappled_forest`, the `spawnMonsters` gamerule (25w35a), and other later changes are **not** adopted. Where a later version's rule was encountered it is recorded as a version difference rather than merged. |

---

## 5. Version-pinned data files kept for reproducibility

`.cache/spawn-research/` (gitignored) holds the raw artefacts the research was done against, so a claim
can be re-checked without re-downloading:

| Path | Contents |
| --- | --- |
| `biomes/` | 65 biome JSONs from `1.21.4-data` |
| `structures/` | 34 structure JSONs, including every `spawn_overrides` block |
| `dimension_type/` | the 4 dimension-type JSONs, source of the light constants |
| `structure_set/` | 20 structure-set JSONs |
| `paper/` | Paper patch files, read for structural context only |
| `mcp/` | mapping files, used to translate class and method names |

`.cache/mc-data/biomes/` (also gitignored) is the generator's fetch cache, so
`node scripts/generate-mob-spawn-data.mjs --offline` regenerates the tables with no network.

---

## 6. Citation policy in the source

Every module that implements a vanilla rule cites it in a header comment: the rule, the source, and —
where the implementation deviates — the deviation. The intent is that a reader can check a constant
without reading this document, and that a deviation is visible at the point of code rather than only in
a document nobody opens.

Per-mob predicates carry their rule inline (`/** Wiki: "Spawning block and block below must be water." */`).
Generated data carries its provenance in the file header. Numeric constants that come from a dimension
type or a data pack file are named after the field they come from
(`monsterSpawnBlockLightLimit`, `creatureSpawnProbability`).
