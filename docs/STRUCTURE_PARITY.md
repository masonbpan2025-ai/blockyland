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
| **Terrain** | **Missing.** `terrain_adaptation` inflates a start's bounding box correctly (12 blocks unless `none`), but no beard/bury/encapsulate terrain shaping, no foundations, no heightmap-based Y selection. |
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
| Desert Pyramid | `desert_pyramid` | hardcoded | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | 21×21 layout, the TNT trap, four chests, 6–8 suspicious sand. |
| Jungle Pyramid | `jungle_pyramid` | hardcoded | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Three floors, lever puzzle with sticky piston, two arrow dispensers. |
| Swamp Hut | `swamp_hut` | hardcoded | yes | no | n/a | n/a | no | no | no | no | `NOT STARTED` | Stilt hut; the witch and black cat that spawn with it and never despawn. |
| Village (Plains) | `village_plains` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Blocked on the jigsaw engine, template pools and `beard_thin` terrain. The villages pool (5 weighted variants) is already correct. |
| Village (Desert) | `village_desert` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus the meeting-point camel. |
| Village (Savanna) | `village_savanna` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus farmland. |
| Village (Snowy) | `village_snowy` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains. |
| Village (Taiga) | `village_taiga` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | As plains; plus the armour stands. |
| Pillager Outpost | `pillager_outpost` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `beard_thin` + the watchtower/feature split. Its `legacy_type_1` frequency reducer and its 10-chunk exclusion zone from villages **are** implemented. |
| Bastion Remnant | `bastion_remnant` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Four variants, blackstone processors, the magma-cube spawner, and the floats-over-lava behaviour. |
| Ancient City | `ancient_city` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `beard_box` + the Y=-51 floor rule + sculk/spawner content. |
| Trail Ruins | `trail_ruins` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `bury` + three processor lists + archaeology. |
| Trial Chambers | `trial_chambers` | jigsaw | yes | no | no | no | no | no | no | no | `INFRASTRUCTURE BLOCKED` | Jigsaw + `encapsulate` + trial spawners, vaults, dispensers and the copper/tuff room set. |

Counts over the 34 ids: **1 `FUNCTIONAL` (buried treasure), 13 `PARTIAL` (+ shipwreck, shipwreck_beached, 2 ocean ruins), 8 `NOT STARTED`
(4 hardcoded + 5 procedural minus the implemented one), 12 `INFRASTRUCTURE BLOCKED` (2 template + 10
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
