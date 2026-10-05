# Block parity gap review — Minecraft in the browser

Scope: the wiki [Block](https://minecraft.wiki/w/Block) page's **Blocks with an item form**,
**Technical blocks** and ***Education* blocks** lists. **Removed blocks and Joke blocks are
excluded**, as requested (19 + 113 entries, reported separately only for completeness).

> **Updated after the follow-up fixes.** `COBBLED_DEEPSLATE` is now a real registered block and blast
> resistance is read by explosions instead of being dead data, and name matching between this game and a
> vanilla list now lives in `src/blockNameMatch.js` rather than in a regex per script. The figures below
> are the post-fix ones from `scripts/block-parity/parity-diff.mjs`; the earlier ad-hoc counts were
> inflated by spellings that the shared vocabulary now resolves (see "What the matcher was hiding").

## Baselines

| Measure | Value |
| --- | --- |
| Block keys in `src/blocks.js` (`BLOCKS`) | 948 / 945 distinct ids |
| Block definitions (`BLOCK_DEFS`) | 945 |
| Definitions carrying a shape/behaviour flag | 673 |
| Definitions that are plain full cubes | 272 |
| Wiki list entries in scope | 1353 (1160 item + 145 technical + 48 Education) |
| In-scope wiki names that resolve to a block | 831 |
| In-scope wiki names with no block | 522 |
| Registry keys the wiki list names | 946 of 948 |
| Registry keys no wiki page names | 2 (`LIT_FURNACE`, `PRESSURE_PLATE` — states of `FURNACE` and a generic plate) |
| Repo's own pinned vanilla data (`pc/1.21.4`, 1095 blocks) implemented | 829 (75.7%) |
| Pinned vanilla blocks absent | 266 |

The in-scope gap splits into two different problems:

- **~266** are absent against the repo's own pinned 1.21.4 data.
- **~256** only exist in wiki revisions *newer* than the pinned cache — Sulfur, Cinnabar,
  Poplar wood set, Resin, Shelf, Copper Chest / Golem Statue, Copper Torch, Icicle, Sulfur
  Spike, Bush, Ice Crystals, Wildflowers, Firefly Bush. These need a data refresh before they
  can be added at all; `.cache/mc-data/blocks.json` predates them.

## What the matcher was hiding

The first pass of this review reported 533 missing in-scope names and 268 missing vanilla blocks. If
those counts were taken at face value they would have overstated the gap by more than half, because
most of the residue was not missing content but name disagreement between the two sides. That
disagreement is now handled in one place:

| Cause | Example | Resolution |
| --- | --- | --- |
| One id per state here, one page there | `ACACIA_DOOR_TOP_OPEN` vs "Acacia Door" | state suffixes (`_top_open`, `_top`, `_open`, `_moist`) collapse |
| A block this game splits in two | `RED_BED_HEAD` vs "Red Bed" | `_head`/`_foot`/`_block` fold back |
| "Block of X" vs "X Block" | "Block of Lapis Lazuli" vs `LAPIS_BLOCK` | alias table |
| Trailing nouns | "Hay Bale", "Target", "Chain" | alias table |
| Word order and plurals | "Moist Farmland", "Vines" | alias table |

Crucially, state suffixes that are **real vanilla blocks** are *not* folded: `wall_sign`, `wall_torch`
and the coral wall fans have their own wiki pages, and this game does not implement them, so they stay
in the missing list rather than appearing covered by their floor-standing siblings.

Three defects surfaced while building the vocabulary, all now fixed and pinned by tests:

- `cobbled_deepslate` was aliased to `cobblestone` in `parity-coverage.mjs`, which made a block that did
  not exist count as covered.
- `deepslate` dropped `COBBLESTONE` while the harvest table said `cobbled_deepslate`.
- `BLOCKS.COBBLED_DEEPSLATE` read `undefined` at the two call sites that named it
  (`furnace.js:44`, `redstone.js:284`).

## Missing blocks, by family

| Family | Count | Notes |
| --- | --- | --- |
| Shulker boxes (17) | 17 | Needs a tile entity + oriented model |
| Glazed terracotta | 16 | Oriented model, unique texture per colour |
| Candles on cake | 17 | State of `cake`, not standalone |
| Wall-mounted states | 22 | `wall_torch`, 12 `*_wall_sign`, `redstone_wall_torch`, `soul_wall_torch`, wall skulls/heads, coral wall fans |
| Saplings + potted plants | 46 | Only 7 saplings exist as items, no block form; 1 flower pot def |
| Coral (5 types × alive/dead × block/tail/fan/wall fan) | 40 | Entirely absent |
| Small plants, grass, vines | 26 | `short_grass`, `fern`, `large_fern`, `tall_grass`, `seagrass`, `tall_seagrass`, both `kelp` states, `weeping/twisting/cave_vines` + plant states, `azalea`, `flowering_azalea`, `big/small_dripleaf`, `cobweb`, `dead_bush`, `spore_blossom`, `hanging_roots`, eyeblossoms, `mangrove_propagule` |
| Ores / deepslate ores / infested | 19 | All 7 deepslate ore variants, `copper_ore`, `lapis_ore`, `nether_gold_ore`, `nether_quartz_ore`, all 7 `infested_*` |
| Amethyst | 5 | `budding_amethyst`, `amethyst_cluster`, 3 bud sizes |
| Mob heads | 6 | `skeleton_skull`, `zombie_head`, `player_head`, `creeper_head`, `dragon_head`, `piglin_head` |
| Crops, stems, wart | 10 | `nether_wart`, `cocoa`, `beetroots`, `pumpkin_stem`/`melon_stem` + 2 attached states, `torchflower_crop`, `pitcher_crop`, `big_dripleaf_stem` |
| Command / structure / debug | 10 | `command_block` (+repeating/chain), `barrier`, `structure_block`, `structure_void`, `jigsaw`, `light`, `end_portal_frame`, `end_gateway`, `reinforced_deepslate` |
| Fluid/light helper states | 8 | `cave_air`, `void_air`, `soul_fire`, `moving_piston`, `bubble_column`, `frosted_ice`, `dirt_path` |
| Cauldron fill states | 3 | `water_cauldron`, `lava_cauldron`, `powder_snow_cauldron` |
| Spawners | 3 | `spawner`, `trial_spawner`, `vault` |
| Eggs | 2 | `turtle_egg`, `sniffer_egg` |
| Ungrouped | 23 | `suspicious_sand`, `suspicious_gravel`, `creaking_heart`, `cake`, `resin_clump`/`resin_block`/`resin_bricks`, `ender_chest`, `trapped_chest`, `sea_pickle`, `scaffolding`, `shroomlight`, `ancient_debris`, `cracked_nether_bricks`, `sculk_vein`, `frogspawn`, `pale_hanging_moss` |

**Fixed since this review:** `cobbled_deepslate` was the clearest example of the registry and its own
generated data disagreeing. It was present in the harvest data table, its slab/stair/wall variants
existed, and `BLOCKS.COBBLED_DEEPSLATE` was referenced by `furnace.js` and `redstone.js` — but the base
block itself was never registered, so that reference read `undefined`, deepslate dropped cobblestone
instead of cobbled deepslate, and `parity-coverage.mjs` aliased it to `cobblestone`, which hid all of it
from the coverage number. It is now a real block (id 946), with a generated texture, and the alias is
gone. `scripts/block-parity/parity-harvest-orphans.mjs` reports the remaining 234 harvest entries with
no registered block, which is the standing measure of this class of defect.

## Blocks that exist but lack features

### Structural: the state model

- **No block-state properties.** `World.setVoxel` stores a plain integer id
  (`src/world.js`); there is no `facing`/`half`/`open`/`age`/`powered`/`axis`/`snowy` on the world
  record. Rotation and open/closed live in **out-of-band side tables** — `world.redstone.state([x,y,z])`
  (`src/mesher.js:306,327,337`), `DoorManager` (`src/mesher.js:317`), `BedManager`
  (`src/mesher.js:346`), `ChestManager` (`src/mesher.js:357`). Consequence: state is not saved,
  not queryable uniformly, and any new oriented block needs its own manager.
- **No gravity / falling blocks.** A repo-wide search finds no falling-block entity or
  `sand`/`gravel` support-tick path. Sand, gravel, concrete powder, anvils, dragon egg,
  scaffolding, pointed dripstone and suspicious sand all float.
- **No waterlogging.** The only `waterlogged` references are property reads in
  `src/squidBehavior.js:14,142,147`; no block can hold both water and itself.
- **No general block entity layer.** No `blockEntity`/`tileEntity` concept anywhere. Chests,
  furnaces, hoppers, dispensers, droppers, brewing stands and beds each have a bespoke manager,
  so every new inventory block is a new subsystem rather than a shared one.

### Models

- **Fences and walls do not connect.** Both are drawn as a fixed cross:
  `src/blockGeometry.js:46-52`. 13 fence + 26 wall defs affected.
- **Fence gates are always drawn closed** (`src/blockGeometry.js:69`), 12 defs.
- **Buttons have no per-face placement** — modelled floor-mounted only
  (`src/blockGeometry.js:63-66`, "this project has no per-face placement state for buttons yet"),
  13 defs.
- `flowerPot` is defined once, so the 46 potted plants in the wiki list have no host block.

### Behaviour

- ~~**Explosions ignore blast resistance.**~~ **Fixed since this review.** `src/entities.js` used a flat
  `radius = 3.5` and cleared anything that was not air or bedrock. It now asks
  `isDestroyedByExplosion` (`src/blockHarvestData.js`), which applies vanilla's rule: a block breaks
  when `resistance / 5 < power * (0.3 + 0.7 * roll)`, with TNT at power 4. Resistance 6 — stone,
  cobblestone, every ore, iron blocks — is above even the centre threshold, so it survives, which is
  what real TNT does. One subtlety that made this non-obvious: the data generator writes `resistance`
  only when it *differs* from `hardness`, so an absent field means "equal to hardness" and not
  "unknown", and the helper falls back accordingly. Treating it as unknown had made every soft block
  explosion-proof. This models the threshold rather than a full 16-ray occlusion pass.
- **No crop growth / random tick.** Wheat (8 stages), carrots and potatoes (4 stages each) exist as
  blocks with stage arithmetic in `src/farming.js:35-65` and right-click harvest
  (`src/farming.js:314-335`), but nothing advances a stage on a tick — growth is bonemeal/plant
  driven only. Beetroot, nether wart, cocoa, sweet berry, torchflower and pitcher crop are absent.
- **No fire spread and no block flammability.** The only flammability concept is a local `fuels`
  set inside `src/lavaSimulation.js:8` used for lava ignition; there is no burning block, no
  `fire` spread across blocks, and no `flammable` flag on any definition.
- **Right-click coverage is narrow.** The switch in the interaction path covers roughly 25 blocks
  (crafting table, furnace/lit furnace, chest, enchanting table, brewing stand, beacon, anvil ×3,
  grindstone, bed, doors/trapdoors, TNT, note block, redstone torch, sculk sensor/shrieker,
  nether portal, plus fluid buckets). The following are **registered and textured but have no
  interaction**: `Composter`, `Loom`, `Stonecutter`, `Cartography Table`, `Smithing Table`,
  `Fletching Table`, `Lectern`, `Barrel`, `Smoker`, `Blast Furnace` (all 13 villager workstations
  are defined as data via `workstation:` in `src/blocks.js:921-932` but are inert), `Jukebox`,
  `Crafter`, `Copper Bulb`, `Lightning Rod`, `Chain`, `Cauldron`, `Beehive`/`Bee Nest`,
  `Respawn Anchor`, `Bell`, `Daylight Detector`, `Sculk Catalyst`, `Campfire`/`Soul Campfire`.
  Working: `Beacon` and `Conduit` do compute pyramids and buffs (`src/beaconConduit.js:24,76,111`);
  `Note Block` and `Target Block` are wired into redstone.
- **Copper has no oxidation or waxing.** Only static `copper_block` / `*_copper_block` /
  `lightning_rod` entries exist; there is no weathering tick, no waxing interaction, and no copper
  door/trapdoor/bulb/grate family beyond what the generator emits.
- **Amethyst has no growth.** Only `amethyst_block` exists (`src/blocks.js`); no budding block,
  buds or cluster.
- **No scaffolding, chain climbing, or hanging-sign chain attachment** — `Chain` is geometry only,
  `Scaffolding` is absent.
- **Sculk has no spread/XP mechanic** — `Sculk Sensor`, `Sculk Shrieker` and `Sculk Catalyst` are
  registered (`SCULK_CATALYST`, `SCULK_SHRIEKER`, `SCULK_SENSOR`) with redstone interaction for the
  shrieker/sensor but no catalyst spread.

## What is already at parity

- Redstone: wire, torch, repeater, comparator, observer, lamp, lever, button, pressure plate,
  piston/sticky piston, dispenser, dropper, hopper, note block, daylight detector, target block,
  powered TNT, iron doors, rails — with tick delays (`src/redstone.js`, `src/rails.js`).
- Mining: tool class, tool tier gating, Minecraft's break-time formula, and correct
  drops/no-drops behaviour (`src/miningRules.js:63-154`), generated for 1056 blocks.
- Light emission values for 27 blocks, matching the wiki table (glowstone/beacon/campfire 15,
  conduit 14, torch 14, lit furnace 13, nether portal 11, crying obsidian 10, enchanting table 7,
  redstone torch 7, magma 3, brown mushroom 1).
- Fluids: 7-level water flow with sources and falling water (`src/waterSimulation.js`), lava
  ignition of adjacent flammables (`src/lavaSimulation.js`), bucket interaction
  (`src/buckets.js`).
- Chests (double + orientation), beds (colour + head/foot + explosions), doors/trapdoors
  (84 + 42 defs), furnaces and smelting, crafting, enchanting, brewing, anvils, grindstone,
  villager trading.

## Root causes, ranked

1. **No block-state system.** Every oriented or stateful block needs bespoke out-of-band storage.
   This is the single largest structural blocker and causes most of the "wall variant" and
   "oriented model" gaps.
2. **No tile-entity/inventory abstraction.** Blocks shulker boxes, barrels, ender/trapped chests
   behind a per-block manager.
3. **Mesher has no block-to-block connection pass.** Fences, walls, gates, panes and iron bars can
   never look right until this exists.
4. **Pinned vanilla data predates the current wiki.** ~256 in-scope wiki blocks cannot be generated
   until `.cache/mc-data` is refreshed past `pc/1.21.4`.
5. **No random-tick/tick-scheduling layer.** Blocks crop growth, leaf decay, copper oxidation,
   amethyst growth, ice melting and fire spread.

## Reproducing these figures

Name matching lives in `src/blockNameMatch.js` and is used by the scripts, the gap report and the tests,
so all three agree on what "the same block" means.

| Command | Purpose |
| --- | --- |
| `node scripts/block-parity/parity-fetch-wiki.mjs` | refresh `.cache/wiki` from the wiki API (network) |
| `node scripts/block-parity/parity-extract.mjs` | rebuild `tests/fixtures/wiki-block-list.json` |
| `node scripts/block-parity/parity-diff.mjs` | wiki list vs registry; writes `report.json` |
| `node scripts/block-parity/parity-vs-vanilladata.mjs` | pinned `pc/1.21.4` cache vs registry |
| `node scripts/block-parity/parity-harvest-orphans.mjs` | harvest entries with no registered block |
| `node scripts/block-parity/classify-defs.mjs` | how many defs carry a shape/behaviour flag |
| `node --test tests/blockNameMatch.test.js` | the vocabulary, the fixture comparison and blast rules |

The wiki list is committed as a fixture rather than fetched during tests, so the comparison is
reproducible and a change in the wiki's own list shows up as a reviewable diff.
