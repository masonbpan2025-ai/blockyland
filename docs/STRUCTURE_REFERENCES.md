# Structure references, licences and clean-room policy

## Target version: Minecraft Java Edition 1.21.4

Chosen because it is the newest version **this repository can express blocks and items for**:
`.cache/mc-data/blocks.json` and `items.json` are pinned at `pc/1.21.4` by
[`scripts/generate-mc-data.mjs`](../scripts/generate-mc-data.mjs) (`blocks`, `items`), with loot data
frozen earlier (`entityLoot` at `pc/1.20`, `foods` at `pc/1.21.1`). Building structures against a newer
version's data would silently mix two versions, which the mission forbids.

The wiki has moved on: it documents up to 26.x. **Every value in this engine was read from the
1.21.4-era revision of the page**, not the current one. Anything newer is excluded by name and recorded
below, so a later upgrade is a decision rather than an accident.

### 1.21.4-era wiki revisions used

| Page | revid | timestamp |
| --- | --- | --- |
| `Structure_set` | 2780415 | 2024-12-02 |
| `Structure_set/JSON_format` | 2689189 | 2024-09-17 |
| `Structure_definition` | 2780398 | 2024-12-02 |
| `Processor_list` | 2780403 | 2024-12-02 |
| `Structure` | 2781479 | 2024-12-03 |
| `World_generation` (§ Structures) | 2743815 | 2024-11-08 |
| `Jigsaw_Block` | 2696143 | 2024-09-24 |
| `Jigsaw_structure` | 2774144 | 2024-11-29 |
| `Feature` | 2705599 | 2024-10-02 |

Method that worked, and is worth reusing: `https://minecraft.wiki/api.php?action=query&prop=revisions&rvstart=2024-12-04T00:00:00Z&rvdir=older`
to pin a revision, then `index.php?title=<Page>&action=raw&oldid=<revid>` for the wikitext. The wiki
returns **HTTP 403 without a User-Agent header**.

### Content that exists only after 1.21.4, and is therefore absent by design

| Item | Added/changed in |
| --- | --- |
| Abandoned Camp (structure, and its `#abandoned_camp` tag) | 26.3 snap1 / snap3 |
| Woodland Mansion in Pale Garden | 1.21.5 (25w02a) |
| `#on_ocean_explorer_maps` → `#on_ocean_monument_maps` and four sibling tag renames | 26.3 snap10 |
| `frequency_reduction_method` `default`/`legacy_type_2` MC-307874 caveat | 1.21.5+ |
| Trial Chambers frequency published | after 1.21.4 (the 1.21.4 set table has the set, the 1.21.4 generation table does not list it) |
| Nether fossil dried ghasts; monster-room saddle→leather; copper horse armour; diamond spears | 1.21.6, 1.21.9, 1.21.11 |
| Void start platform in Bedrock's "The Void" preset | BE 1.21.100 |

## Reference implementations

| Project | Language | Licence | How it may be used |
| --- | --- | --- | --- |
| [Steel-Foundation/SteelMC](https://github.com/Steel-Foundation/SteelMC) | Rust | **AGPL-3.0-or-later** | **Behavioural oracle only.** No code may be copied or translated: a Rust→JS port is a derivative work, and AGPL §13 attaches to network use, which a browser game is. Read for decomposition, algorithm names and known gaps. |
| [BlueDragonMC/SteelWorldGen](https://github.com/BlueDragonMC/SteelWorldGen) | Rust + Java | Split: `steel-provider/` **AGPL-3.0**, everything else **Apache-2.0** | The Java client (socket framing, Minestom adapter) is permissively reusable with attribution; the Rust provider is a thin wrapper over SteelMC and adds nothing we need. GitHub's licence detector reports `NOASSERTION` because of the split — the `LICENSE.md` text is authoritative. `BlueDragonMC/SteelMC` does not exist (404); the live project is the Steel-Foundation one. |
| [misode/deepslate](https://github.com/misode/deepslate) | TypeScript | **MIT** | Reusable with attribution. It implements structure-set placement maths, template NBT reading and position rotation faithfully, but **no jigsaw assembly** and no block-state rotation (`// TODO? Rotate state`). npm is unreachable from this sandbox, so it is used here as a **cross-check on formulas**, not as a dependency. |
| [PrismarineJS](https://github.com/PrismarineJS) (`prismarine-world`, `prismarine-chunk`, `minecraft-data`, `prismarine-nbt`) | JS | MIT (npm metadata; **no LICENSE file** in `minecraft-data` or `prismarine-nbt`) | **No vanilha structure generation exists in any of them.** `minecraft-data@pc/1.21.4` publishes no `worldgen/*` at all (verified by parsing `dataPaths.json` across all 72 PC versions and by a deliberate 404 probe on `worldgen/structure_set/villages.json`). `prismarine-nbt` is not browser-safe (`require('zlib')`), so it is not used. |
| [nbtify](https://github.com/nbtify/nbtify), [@taku128/java-schematic](https://github.com/taku128/java-schematic) | JS | MIT | Candidate browser-safe NBT readers if structure templates are ever loaded from files. Both use native `CompressionStream`/pako rather than Node `zlib`. |
| `@enginehub/schematicjs` | JS | **GPL-3.0** | **Avoid.** |

### What was taken from where

Behaviour and formulas come from **the wiki and from reading two independent implementations as
oracles**; no code was copied from an AGPL project, and the MIT one was used to *validate* formulas this
engine implements itself. Specifically:

- The random-spread region maths, the four frequency reducers, exclusion zones and the concentric-ring
  sequence were confirmed against deepslate's `StructurePlacement.ts` (MIT, attributed). This corrected
  two errors: the default `frequency_reduction_method` is `default` (not `legacy_type_1`), and placement
  mixes **region** coordinates while the frequency check mixes **candidate chunk** coordinates.
- SteelMC's published notes were used as a checklist of *what vanilla does* (structure sets, the
  `structure_starts` / `structure_references` / `features` split, terrain-adaptation weights, the
  fastutil iteration-order hazard). Nothing was transcribed.
- `src/worldgen/random.js` implements `java.util.Random` from the JDK specification and is verified
  against the published seed-0 sequence. Xoroshiro128++ is implemented from the published transition
  function; its **seeding is marked unverified** because vanilla's seed-upgrade path was not reproduced
  from a primary source.

## What the wiki does NOT publish (verified by full-text search, recorded rather than guessed)

1. **Vanilla processor-list resource locations.** `Processor` is a disambiguation page about *blocks*
   (anvil, cauldron, …). `intitle:processor` returns only `Processor list`, which documents processor
   *types* (`rule`, `block_rot`, `block_age`, `block_ignore`, `gravity`, `protected_blocks`,
   `blackstone_replace`, `jigsaw_replacement`, `lava_submerged_block`, `capped`, `nop`) and rule tests —
   but no table of default list names. Searches for `bastion_generic_degradation` and
   `mossify_10_percent` return zero hits. Only Trail Ruins ("one of three processor lists") and Ruined
   Portal (`block_age`) are tied to processors in prose.
2. **Namespaced loot-table ids.** Structure pages print `{{LootChest}}` keys (e.g. `buried-treasure`,
   `end-city`), not `minecraft:chests/...`. Stronghold's page is the exception, giving three explicit
   `loot_tables/chests/...` paths.
3. **Jigsaw `start_pool` values per structure.** Template `.nbt` file names and (for villages only) pool
   names are published; the `start_pool` field is not.
4. **`ocean_ruin` config fields** (`biome_temp`, `large_probability`, `cluster_probability`) — the page
   transcludes a section from a disambiguation page, so nothing renders. Only behaviour is published
   (30% large, a large ruin seeds 4–8 small ones, integrity 0.9/0.8/0.7/0.5).
5. **`TerrainPopulated`** appears on the `Structure` page but not on the modern `Chunk format` page —
   a wiki inconsistency. This engine implements the three named generation steps instead.

**Consequence for parity:** placement and layout parity are achievable from public sources; **content
parity (exact chest contents, exact processor-list behaviour) is not**, and is recorded as a deviation in
`STRUCTURE_PARITY.md` rather than approximated silently.

## Structural decisions that follow from the above

- **The engine is data-driven and world-free.** Structure definitions live in `src/worldgen/registry.js`
  as data; placement is a pure function of (seed, chunk, registry). Terrain arrives as callbacks, which
  is what makes a plan independent of which chunk loads first.
- **Templates are a data problem, not a code problem.** Vanilla's `.nbt` templates are Mojang assets and
  are not distributed with this repository. Two honest options remain, and the choice is the user's:
  (a) author clean-room templates as JSON in this repository, or (b) have the engine load
  vanilla-shaped `worldgen/*.json` + `.nbt` files that the user supplies. The loader should support
  both; until then, structures whose layout *is* data (igloo, shipwreck, ruined portal, …) stay at
  "not started".
- **Block-state rotation must be written here.** Neither deepslate nor PrismarineJS rotates block states
  (stairs facing, rails shape, jigsaw orientation). It is ~150–250 lines of property maps and is a
  prerequisite for any template-based structure.
