# Structure parity matrix

Target: **Minecraft Java Edition 1.21.4** (see [STRUCTURE_REFERENCES.md](STRUCTURE_REFERENCES.md) for
why, and for the wiki revision ids every number came from).

Statuses are used strictly:

| Status | Means |
| --- | --- |
| `NOT STARTED` | Nothing specific to this structure exists. Its **placement** may still work, because placement is shared infrastructure — see the columns. |
| `INFRASTRUCTURE BLOCKED` | Work has begun but cannot finish until a named subsystem exists (templates, jigsaw, …). |
| `PARTIAL` | Some of the structure exists; the missing parts are named in *Known differences*. |
| `FUNCTIONAL` | It generates, is deterministic and its layout is the intended one, but nothing has been compared against vanilla. |
| `NEAR PARITY` | Compared against reference data with a quantified, small difference. |
| `VERIFIED` | Compared against vanilla/reference output block-for-block for the listed cases. |

**Nothing here is `VERIFIED`** — no differential test against a vanilla oracle has been built yet, and
visual similarity is explicitly not accepted as evidence.

## The nine dimensions, tracked separately

A single "implemented" column would hide exactly the differences that matter, so each structure's status
is the weakest of these:

| Dimension | Shared infrastructure today |
| --- | --- |
| **Placement** | **Implemented.** Random-spread and concentric-rings placement, spacing/separation/salt/spread/frequency, all four frequency reducers, exclusion zones, weighted set selection with vanilla's without-replacement retry, `/locate`. 118/118 wiki biome gates resolve in `src/biomes.js`. |
| **Layout** | Partial. Only `buried_treasure` has a layout generator. |
| **Templates** | **Implemented**: `StructureTemplate`/`StructureTemplateManager` (palette, blocks with block-entity NBT, entities, jigsaw connectors, `structure_block` DATA markers), a dependency-free NBT reader, and block-state rotation. No template *data* ships with the repository — see *Templates are a data problem* in STRUCTURE_REFERENCES.md. |
| **Randomness** | Implemented for placement (deterministic, unit-tested). Piece-level and template-selection randomness are not written. |
| **Processors** | **Implemented**: all 11 vanilla `processor_type` values (`nop`, `block_ignore`, `block_rot`, `protected_blocks`, `jigsaw_replacement`, `rule` with all 5 rule tests and all 3 position tests and all 4 block-entity modifiers, `capped`, `block_age`, `blackstone_replace`, `lava_submerged_block`, `gravity`), plus the template placement pipeline. Three are documented approximations (below). No structure uses them yet. |
| **Terrain** | **Implemented and WIRED** into the engine's realize path: the engine applies a structure's registry `terrain_adaptation` over each piece box, passing the structure's own written blocks as the "do not overwrite" set, and reports the counts. Applying it needs the caller to supply `surfaceY` and a foundation block, so a caller that supplies neither gets the previous behaviour exactly. `adaptToTerrain` covers all five vanilla adaptations (`none`, `beard_thin`, `beard_box`, `bury`, `encapsulate`) as a world-free function over a `surfaceY` callback and an `isStructureBlock` predicate, and `terrain_adaptation` inflation (12 blocks unless `none`) was already correct. The engine's realize path does not CALL it yet, so no structure is bedded into the ground at runtime and the `Terr` column stays "no" everywhere. |
| **Content** | Only `buried_treasure`'s chest with its loot-table reference. No loot-table system, no structure entity spawning, no spawner/vault/trial-spawner block entities. |
| **Chunk safety** | Implemented for planning: a plan is a pure function of (seed, chunk, registry) and realization is clipped per chunk, proven by tests that ask chunks in forward and reverse order. No chunk-status pyramid, no structure references stored in saves yet. |
| **Determinism** | Implemented and tested end-to-end for `buried_treasure` (same seed → identical plan hash, any ask order). |

## Matrix — the 34 Java structure ids of 1.21.4

29 Overworld, 4 Nether, 1 End. `Placement` = the shared placement engine places this id correctly (set,
spacing, salt, biome gate). `Gen` = a layout generator exists. `Tpl` = templates. `Proc` = processors.
`Terr` = terrain adaptation beyond bounding-box inflation. `Content` = loot/entities/spawners.

| Structure | Vanilla id | Family | Placement | Gen | Tpl | Proc | Terr | Content | Det. tested | Vanilla compared | Status | Known differences |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Buried Treasure | `buried_treasure` | hardcoded | yes | yes | n/a | n/a | n/a | chest + loot ref | yes | no | `FUNCTIONAL` | Waterlogging when the chest replaces water is not implemented; only the `ocean_floor` heightmap is used, with a flat preview surface. |
| Mineshaft | `mineshaft` | procedural | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Needs the procedural piece framework (corridors, crossings, stairs, abandoned passages) and the `mineshaft_type` mesa variant. |
| Mineshaft (Badlands) | `mineshaft_mesa` | procedural | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Same, plus dark oak materials and near-surface placement. |
| Stronghold | `stronghold` | procedural | yes (rings) | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Ring positions are computed but **not biome-snapped** (needs a 112-block horizontal biome search), so positions differ from vanilla; `bury` terrain shaping missing; recursive piece graph missing. |
| Ocean Monument | `monument` | procedural | yes (triangular) | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Room graph, wings, 23 pillars and the three elder guardians missing. |
| Nether Fortress | `fortress` | procedural | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Piece graph, blaze spawners, nether wart farms missing. |
| Ruined Portal | `ruined_portal` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Blocked on the template loader + `block_age` processor + the `setups[]` placement logic (air-pocket probability, mossiness, `replace_with_blackstone`). |
| Ruined Portal (Desert) | `ruined_portal_desert` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Partly buried, mossiness 0. |
| Ruined Portal (Jungle) | `ruined_portal_jungle` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Surface, mossiness 0.8. |
| Ruined Portal (Mountain) | `ruined_portal_mountain` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Half inside a mountain, mossiness 0.2. |
| Ruined Portal (Ocean) | `ruined_portal_ocean` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Ocean floor, mossiness 0.8. |
| Ruined Portal (Swamp) | `ruined_portal_swamp` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | Surface, mossiness 0.5. |
| Ruined Portal (Nether) | `ruined_portal_nether` | template | yes | yes | yes | yes | no | chest state | yes | no | `PARTIAL` | The only set member in another dimension; blackstone materials and `blackstone_replace`. The dimension-split set builder already handles it. |
| Igloo | `igloo` | template | yes | yes | yes | yes | no | villager + zombie villager, chest state | yes | no | `PARTIAL` | Geometry is a clean-room approximation of the wiki's description, because this repository ships no vanilla assets; the chest carries a state but not loot-table contents; the basement's iron-bar cell is approximate; the surface is a flat preview height rather than the real heightmap. |
| Shipwreck | `shipwreck` | template | yes | yes | yes | yes | no | chests with loot tables | yes | no | `PARTIAL` | Blocked on templates (20 files across three orientations); chest placement depends on intact sections. |
| Shipwreck (Beached) | `shipwreck_beached` | template | yes | yes | yes | yes | no | chests with loot tables | yes | no | `PARTIAL` | Same templates with `is_beached`. |
| Ocean Ruins (Cold) | `ocean_ruin_cold` | template | yes | yes | yes | yes | no | suspicious blocks with loot tables | yes | no | `PARTIAL` | Templates + structure integrity (0.9/0.8/0.7/0.5) + the 30%-large / 4–8-cluster rule + suspicious gravel. |
| Ocean Ruins (Warm) | `ocean_ruin_warm` | template | yes | yes | yes | yes | no | suspicious blocks with loot tables | yes | no | `PARTIAL` | As cold, plus suspicious sand (the sniffer-egg source). |
| Nether Fossil | `nether_fossil` | template | yes | yes | yes | yes | no | none (no loot, no spawner) | yes | no | `PARTIAL` | Clean-room bone templates. The wiki does not publish the `start_height` values, so Y is uniform over 33..60; vanilla's rotation is applied and recorded as an assumption. Runs NO processors by design, which is the documented difference from the overworld fossil. |
| End City | `end_city` | template | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | 20 templates, tower/bridge/ship assembly rules, shulkers, the elytra item frame. |
| Woodland Mansion | `mansion` | template | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Needs a procedural floor-plan generator over template rooms, three floors, and the room-type tables. |
| Desert Pyramid | `desert_pyramid` | hardcoded | yes | yes | n/a | n/a | yes | 4 chests + armed TNT trap | yes | no | `PARTIAL` | Procedural, clean-room dimensions. Terrain adaptation `beard_thin` is now APPLIED through the engine. The four chests carry conventional loot-table ids because the wiki publishes only the `{{LootChest}}` keys. |
| Jungle Pyramid | `jungle_pyramid` | hardcoded | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Three floors, lever puzzle with sticky piston, two arrow dispensers. |
| Swamp Hut | `swamp_hut` | hardcoded | yes | yes | n/a | n/a | yes | witch + black cat as structure mobs | yes | no | `PARTIAL` | Clean-room dimensions. Terrain adaptation `beard_thin` is now APPLIED. Interior furnishings are NOT implemented, because the wiki does not enumerate them verifiably. |
| Village (Plains) | `village_plains` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Blocked on the jigsaw engine, template pools and `beard_thin` terrain. The villages pool (5 weighted variants) is already correct. |
| Village (Desert) | `village_desert` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus the meeting-point camel. |
| Village (Savanna) | `village_savanna` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus farmland. |
| Village (Snowy) | `village_snowy` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains. |
| Village (Taiga) | `village_taiga` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus the armour stands. |
| Pillager Outpost | `pillager_outpost` | jigsaw | yes | yes | yes | yes | yes | watchtower pillager + caged iron golem | yes | no | `PARTIAL` | The first structure on the jigsaw engine: its pool graph, connector joining and `beard_thin` adaptation are the engine's real behaviour, while every part is a clean-room approximation. The base plate is 15x15 so that 3x3 and 5x5 features fit around the 5x5 tower; a narrower plate silently narrowed the weighted feature pool to the smallest element. Vanilla's area pillager spawning is not reproduced. |
| Bastion Remnant | `bastion_remnant` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Four variants, blackstone processors, the magma-cube spawner, and the floats-over-lava behaviour. |
| Ancient City | `ancient_city` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `beard_box` + the Y=-51 floor rule + sculk/spawner content. |
| Trail Ruins | `trail_ruins` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `bury` + three processor lists + archaeology. |
| Trial Chambers | `trial_chambers` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `encapsulate` + trial spawners, vaults, dispensers and the copper/tuff room set. |

Counts over the 34 ids: **1 `FUNCTIONAL` (buried treasure), 16 `PARTIAL` (+ shipwreck, shipwreck_beached, 2 ocean ruins, desert pyramid, swamp hut), 6 `NOT STARTED`

0d. **The ruined-portals set places far less often than its spacing implies.** Over 18000 chunk probes, only 13-30 portal plans appeared where spacing 40 and separation 15 imply roughly 450 candidate chunks. Either a frequency reducer is being applied that the wiki does not give this set, or candidate chunks are being dropped before selection. Recorded, not explained away.

**Golden seeds now exist**: `tests/golden/structureSeeds.json` records, for each implemented structure, the chunk it is first found at plus a hash of its plan and of every block realization writes, guarded by `tests/structureGoldenSeeds.test.js` and regenerated only by an explicit script. A CORRECTION worth keeping: the first version of this harness scanned a single chunkZ row and reported `ruined_portal_jungle` as not locatable, which I flagged as a possible unreachable structure. It is NOT unreachable -- it appears in every seed once rows beyond row 0 are scanned (seed 20250401 places it at chunk 2164,1). The finding was a sampling artefact of a thin scan, not a defect, and the harness now scans several rows and requires an EMPTY unfound list, so a genuinely unreachable structure fails hard instead of being noted in passing. REMAINING QUESTION: with `biomeAt` fixed to one biome, only 3-7% of the ruined-portals set's candidate chunks produce a plan, which is far below what spacing 40 and separation 15 imply. That is recorded as deviation 0d rather than explained away. These goldens pin THIS ENGINE's behaviour and cannot establish parity, which is why the matrix still records nothing as `VERIFIED`.
(4 hardcoded + 5 procedural minus the implemented one), 11 `INFRASTRUCTURE BLOCKED` (2 template + 9
jigsaw), 0 `NEAR PARITY`, 0 `VERIFIED`.**

## Structure-like features

These generate like ores rather than through structure sets, and cannot be located with `/locate`.

| Feature | Vanilla id | Status | Notes |
| --- | --- | --- | --- |
| Monster Room | `monster_room` | `NOT STARTED` | 14 attempts per chunk, 7×9×6 room, 1–5 wall openings, 50/25/25 spawner, 75% mossy floor, up to 2 chests. Needs a spawner block, which the registry lists only as break-time data (`blockHarvestData.js`) — **the block itself does not exist**. |
| Desert Well | `desert_well_feature` | `NOT STARTED` | 1/1000 per chunk, sand on solid ground in a 5×5 area, two suspicious sand. |
| Bonus Chest | `bonus_chest` | `NOT STARTED` | One per world at spawn, four torches, a `bonus` loot table. |
| Fossil | `fossil_coal` / `fossil_diamonds` | `NOT STARTED` | 1/64 twice, bone + coal/diamond overlay, two processor lists. |
| Amethyst Geode | `amethyst_geode` | `NOT STARTED` | 1/24 per chunk, Y −58..30, three shell layers, 8.3% budding, 95% cracked. |
| End Spike | `end_spike` | `NOT STARTED` | 10 spikes, fixed centres, a 73-iron-bar cage on two of them, an End Crystal each. |
| Exit Portal (End podium) | `end_podium_active` / `_inactive` | `NOT STARTED` | At 0,0, Y from the highest block there. |
| End Gateway | `end_gateway_delayed` / `_return` | `NOT STARTED` | 20 central gateways at Y 75, radius 96; the outer-island search algorithm. |
| End Platform | `end_platform` | `NOT STARTED` | 5×5 obsidian at (100, 48, 0), regenerated on entity entry. |
| Void Start Platform | `void_start_platform` | `NOT STARTED` | 33×33 stone with a cobblestone centre at Y −61. |
| Pile, Coral Reef, Forest Rock, Disk, Ice Spike, Ice Patch, Iceberg | (see the wiki's structure-like list) | `NOT STARTED` | Present on the 1.21.4 page's list; their configs are documented but none is implemented. |

## Known differences that apply to everything

0. **Three processors are documented approximations**, each reported at runtime through its `notes` field:
   `block_age` (the 0.5 roll and obsidian 0.15 are published; which of the four candidates is chosen and how
   `mossiness` biases it are not), `blackstone_replace` (the wiki never prints the full replacement table, so
   the documented core is implemented and unmapped variants are left alone), and `capped` (vanilla's
   finalize pre-pass is not reproduced; the cap is applied greedily in placement order).
0b. **RESOLVED - plan-local piece indices.** `StructurePiece` now accepts an explicit plan-local `index`, every generator supplies one, and `tests/structurePieceIndex.test.js` asserts that the igloo, the multi-piece ocean-ruin cluster, the jigsaw engine and the engine's plan hash are BIT-IDENTICAL before and after a crowd of unrelated pieces is created. The module-level counter is retained only as a fallback for callers that derive nothing from the index. This mattered because `StructurePiece.index` previously depended on how many pieces had been created earlier in the same process, and the igloo and ocean ruins derive per-piece randomness from it, which would have made any golden-seed test compare two processes that could not agree.
0c. **RESOLVED - the jigsaw feature pool's weighted variety.** The pillager outpost's feature mix never varied across 60 chunks. The cause was NOT the engine: my base plate was 9x9, so the 5x5 watchtower left two blocks of margin, every cage and tent candidate was rejected as a collision, and only the 1x1 log could fit -- which looks exactly like an inert weighted draw. The engine's try-and-reject-and-retry is the correct vanilla behaviour. The plate is now 15x15, the mix varies across seeds, and the test asserts BOTH the variety and that no candidate needs a collision rejection, so a plate too small for its features fails loudly instead of quietly narrowing the pool.
1. **Placement parity is not bit-exact.** The mixing is implemented from documented behaviour and
   cross-checked against one MIT implementation, but no structural diff against a vanilla oracle exists,
   so "placement parity" currently means "same rules", not "same chunks".
2. **Xoroshiro seeding is unverified.** `src/worldgen/random.js` implements the generator but not
   vanilla's seed-upgrade path; nothing placement-critical uses it yet.
3. **Biome tags are expanded to explicit lists** for the tag-gated structures (`mineshaft`,
   `trial_chambers`, `fortress`), so a modded biome would not be picked up.
4. **No processor or loot-table data exists**, because the wiki does not publish it (see
   STRUCTURE_REFERENCES.md). Content parity is therefore capped until another data source is used.
5. **Stronghold ring biome snapping is missing**, which changes stronghold positions relative to vanilla.

## Next milestones, in dependency order

1. Template loader + block-state rotation + processors → unlocks igloo, shipwreck, ruined portal, ocean
   ruins, nether fossil, end city, woodland mansion (7 ids, 11 with variants).
2. Template pools + jigsaw engine → unlocks villages (5), pillager outpost, bastion, ancient city,
   trail ruins, trial chambers (11 ids).
3. Procedural piece framework → mineshaft (2), fortress, stronghold, monument (5).
4. Hardcoded layouts → desert pyramid, jungle pyramid, swamp hut (3).
5. Terrain adaptation (beard/bury/encapsulate) and loot/block-entity systems, then the golden-seed and
   differential tests that would let anything be marked `NEAR PARITY` or `VERIFIED`.
