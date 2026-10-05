# Structure architecture

How vanilla's structure-generation concepts map onto this repository's code, what is missing, and in what
order the missing pieces unlock structures. Companion documents: [STRUCTURE_PARITY.md](STRUCTURE_PARITY.md)
(what works per structure), [STRUCTURE_REFERENCES.md](STRUCTURE_REFERENCES.md) (sources, licences, target
version).

## The one architectural decision everything else follows from

**Planning is separated from realization, and planning is world-free.**

A plan is a pure function of `(seed, chunk, registry)`. Terrain arrives as *callbacks* (`biomeAt`,
`surfaceY`), never as a `World`. This is the single property that makes a structure spanning four chunks
deterministic regardless of the order the player walks into them, and it is the design lesson taken from
reading SteelMC's `StructureGenerationContext` as an oracle (no code reused; AGPL — see
STRUCTURE_REFERENCES.md).

The repository's existing `World`/`Chunk` model is *not* extended for generation. `world.js` generates
terrain per chunk with no notion of a structure start, a piece or a reference; adding one there would put
structure state inside the chunk cache and make it load-order dependent. Instead:

| Vanilla concept | Here | Status |
| --- | --- | --- |
| `ChunkGeneratorStructureState` | `StructurePlacementEngine` (`placement.js`) | done |
| `StructureSet` | `StructureSet` / `createSets` (`registry.js`) | done |
| `StructurePlacement`, `RandomSpread`, `ConcentricRings` | `RandomSpreadStructurePlacement`, `ConcentricRingsStructurePlacement` | done, except ring biome snapping |
| `FrequencyReductionMethod` (4 types) | `FrequencyReducer` | done |
| `StructurePlacement.ExclusionZone` | `ExclusionZone` (with cycle detection) | done |
| `Structure` (abstract), `findGenerationPoint` | the `generate` callback in `createStructureEngine` | done |
| `StructureStart` | `StructureStart` (`start.js`) | done |
| `StructurePiece` | `StructurePiece` (`start.js`) | done |
| `BoundingBox` | `BlockBox` (`geometry.js`) | done, inclusive semantics |
| `Rotation`, `Mirror` | `Rotation`, `Mirror` (`geometry.js`) | done for positions |
| `Rotation.rotate(BlockState)`, `Mirror.mirror(BlockState)` | `rotateBlockState` (`blockState.js`) | done for facing/axis/rotation/orientation/directional booleans; **reports** anything else |
| `RandomSource`, `LegacyRandomSource`, positional factory | `LegacyRandom`, `XoroshiroRandom`, `PositionalRandomFactory` (`random.js`) | legacy path verified against the JDK; Xoroshiro seeding unverified |
| `StructureTemplate`, `StructureTemplateManager` | `StructureTemplate`, `StructureTemplateManager` (`template.js`) | done: palette, blocks, block entities, entities, jigsaw markers, data markers |
| `NbtIo` | `nbt.js` (dependency-free, browser-safe, `DecompressionStream` for gzip) | done |
| `StructureProcessor`, `StructureProcessorList` | `createProcessor`, `createProcessorList`, `ProcessorList` (`processors.js`); `placeTemplate` (`templatePlacement.js`) | done: all 11 types; three are documented approximations |
| `StructureTemplatePool`, `PoolElement` | — | **missing** |
| `JigsawPlacement` | — | **missing** |
| `StructurePiece` *families* (mineshaft, fortress, stronghold, monument, mansion, end city) | — | **missing** |
| `Beardifier`, `TerrainAdjustment` | bounding-box inflation only | **missing** the terrain shaping |
| `StructureManager` (starts + references per chunk) | `planChunk` / `chunksForStart` | planning done; nothing is persisted per chunk yet |
| `TerrainPopulated` / the chunk-status pyramid | — | **missing**; this engine plans lazily per chunk instead |
| Loot tables, `spawn_overrides`, block-entity initialisation | — | **missing** |

## How a structure is planned today

```
planChunk(cx, cz)
  └─ for every set whose placement accepts (cx, cz)          placement.js
       ├─ pick a weighted member, without replacement        vanilla's retry loop
       ├─ generate(seed, structureId, cx, cz)                the structure's findGenerationPoint
       │    ├─ biome gate                                    registry.js entry
       │    └─ the family generator                          generators/*.js
       └─ StructureStart { pieces, terrainAdaptation, set }   start.js
```

Realization is separate: `realize(start, setBlock, { chunkX, chunkZ })` clips every piece to the requested
chunk, so a structure never forces its neighbours to load. Tests ask the same chunks in forward and reverse
order and compare plan hashes.

## What is missing, ranked by how many structures it unlocks

| Rank | Subsystem | Unlocks | Why it is the right next step |
| --- | --- | --- | --- |
| — | ✅ **Templates + processors + placement pipeline** | the machinery for 15 template ids | Done in phases 4-5. What remains for those ids is DATA (template files) and per-structure placement rules, not engine work. |
| 1 | **Template data + per-structure placement rules** (igloo first) | 15 template ids (igloo, shipwreck, 7 ruined portals, 2 ocean ruins, nether fossil, end city, mansion) | The engine is ready; each structure now needs its templates and its documented placement/variant logic. |
| 2 | **Template pools + jigsaw engine** | 10 jigsaw ids (5 villages, pillager outpost, bastion, ancient city, trail ruins, trial chambers) | The largest single group, and the most complex; needs pool element types, connector matching, two priorities, free-space collision, depth/distance limits and the expansion hack. |
| 3 | **Procedural piece framework** | 5 ids (2 mineshafts, fortress, stronghold, monument) | Shares the piece/box machinery already present; each family is then a self-contained algorithm. |
| 4 | **Terrain adaptation** (beard/bury/encapsulate) | quality of everything jigsaw/stronghold/trial-chamber | Without it, underground structures float and village roads cut through hills. Depends on real terrain queries, so it wants the world-facing adapter. |
| 5 | **Loot tables, block-entity and entity initialization** | content parity for every structure | The wiki does not publish loot-table ids (STRUCTURE_REFERENCES.md), so this needs a data decision before it needs code. |
| 6 | Golden-seed + differential testing | the ability to claim `NEAR PARITY` or `VERIFIED` at all | Without it the matrix is capped at `FUNCTIONAL`, by policy. |

## Reuse: what this engine deliberately does NOT re-implement

Per mission §25, the existing systems were inspected first:

| Need | Existing thing | Decision |
| --- | --- | --- |
| Voxel storage, chunk meshes | `world.js` (`Chunk`, `ChunkVoxelWriter`) | **Reuse** for realization targets; do not add structure state to `Chunk`. |
| Block ids and definitions | `blocks.js` (`BLOCKS`, `BLOCK_DEFS`, 970 keys) | **Reuse**. `StructureTemplate` emits block *names*; a name → id resolver is the one missing adapter. |
| Biome registry | `biomes.js` (`BIOMES`, 60+ ids) | **Reuse** as the placement gate; the registry validator fails if a gate names a biome that is not there. |
| Seeded noise | `FastNoise`, `mulberry32` in `world.js` | **Do not reuse** for structures: vanilla structure placement uses `java.util.Random` mixing, and substituting a different generator would move every structure. |
| NBT | none | **Write our own** (`nbt.js`); prismarine-nbt is Node-only. |
| Block-state rotation | none | **Write our own** (`blockState.js`); nothing in the ecosystem has it. |
| Loot rolls | `mobLootData.js` `rollLoot` | **Generalise later** for chest loot; mob drops and chest loot share the weighted-roll shape. |
| Persistence | `mapManager.js` (voxels + `builtBuildings`) | **Extend later** with structure starts/references so a re-entered chunk does not re-plan. |

## Phase plan with dependencies

Each phase is a branch, and each is testable without finishing the next.

| Phase | Work | Depends on | Verification |
| --- | --- | --- | --- |
| 1 ✅ | Deterministic RNG, geometry, piece/start, placement, registry | — | 33 tests, `structureEngine.test.js` |
| 2 ✅ | Structure Inspector (page + headless session) | 1 | 14 tests + `vite build` |
| 3 ✅ | Docs, target version | 1 | doc guards, `structureParityDoc.test.js` |
| 4 ✅ | Template loader, block-state rotation, NBT | 1 | 18 tests, `structureTemplate.test.js` |
| 5 | Processors + one template structure end to end (igloo, then ruined portal) | 4 | Inspector: place it, compare against the wiki's described layout |
| 6 | Terrain adaptation + a world-facing adapter (real biome/heightmap queries) | 5 | Inspector with real terrain; underground structures do not float |
| 7 | Template pools + jigsaw engine | 4, 5 | Inspector: piece boxes, connectors, pools, depth; determinism across chunk orders |
| 8 | Procedural families: mineshaft, fortress, stronghold (rings + snapping), monument | 1, 6 | Piece-count and bounding-box assertions per the wiki |
| 9 | Hardcoded layouts: desert pyramid, jungle pyramid, swamp hut | 1, 6 | Inspector layout comparison |
| 10 | Loot, block entities, entities, spawners | 5, 7 | Contents asserted, not screenshotted |
| 11 | Golden seeds + differential harness | 5–10 | The only route to `NEAR PARITY`/`VERIFIED` |

## Known architectural risks

1. **Reference iteration order.** Vanilla iterates structure references in a fastutil `LongOpenHashSet`
   order, and a feature stage that iterates differently consumes RNG in a different order. This engine
   returns covered chunks in box order and does not yet depend on reference order — if a later phase does,
   the order must be reproduced deliberately rather than inherited from `Map` insertion order.
2. **Block-state coverage is open-ended.** `rotateBlockState` names what it could not transform; stair
   `shape`, door `hinge` and comparator/repeater `facing`-dependent states are currently in that list. The
   Inspector should surface the aggregated list so a template is never silently mis-rotated.
3. **Template provenance.** Vanilla `.nbt` files are Mojang assets; this repository ships none. The loader
   accepts clean-room data or user-supplied files, and every template-backed structure is gated behind that
   decision (STRUCTURE_REFERENCES.md).
5. **A bounded scan measures the scan, not the engine.** Twice I reported a structure as unreachable or implausibly rare -- the jungle ruined portal, then the ruined-portals placement density -- and both times the cause was sampling rather than generation: a single chunkZ row for a sparse set, and three rows of a 40x40 region. Placement regions are spacing x spacing, so a count of candidates is only meaningful when NORMALISED by how much of a region was sampled. 	ests/structurePlacementDensity.test.js enforces the normalised form. The rule for any future measurement: state the sampling fraction before drawing a conclusion from a count.
4. **No chunk-status pyramid.** Planning is lazy per chunk rather than driven by declared chunk
   dependencies, so a future structure that reads a neighbouring chunk's *generated* blocks (rather than
   recomputing them) would break determinism. The callback interface is the guard: keep terrain queries
   pure functions of (seed, coordinates).
