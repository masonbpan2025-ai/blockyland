# Structure audit plan

**Goal:** audit every structure in the wiki's [Structure](https://minecraft.wiki/w/Structure) article against what this
game really generates, fix what differs, and track each structure from "not looked at" to "audited" one at a time.

This document is the plan and the progress tracker. It builds on, and does not replace:

| Existing doc | What it is | What this plan changes about it |
|---|---|---|
| [STRUCTURE_PARITY.md](STRUCTURE_PARITY.md) | Per-id status matrix and the list of known deviations | Its statuses describe the **engine**; they never looked at the **game**. They are stale (it still says villages place no villagers). Section 7 replaces its status column as the thing we update. |
| [structure-inspector.md](structure-inspector.md) | How the Inspector page works | Section 5 lists what to add to it. |
| [STRUCTURE_ARCHITECTURE.md](STRUCTURE_ARCHITECTURE.md), [STRUCTURE_REFERENCES.md](STRUCTURE_REFERENCES.md) | Design, sources, licences | Unchanged. Target version and clean-room rule still apply (Section 8). |
| [mob-parity-audit.md](mob-parity-audit.md) | The model we copy: wiki facts in a generated data file, a checklist per mob, results shown in the Inspector | Section 4 and 5 do the same for structures. |

---

## 1. Why the existing tests did not catch the village

The village looked wrong in the game while its engine tests were green. Following that failure end to end shows
**six layers where a structure can be wrong**, and the existing tests only covered the first three:

| Layer | Question | Covered before? | The village's bug here |
|---|---|---|---|
| L1 Placement | Does the right set place it in the right biome at the right spacing? | Yes | Fine |
| L2 Layout | Are the right pieces in the right arrangement? | Partly | A "farm" was a checkerboard of logs; houses were empty boxes |
| L3 Content | Does it hold what the wiki says: blocks, furniture, loot, block entities, mobs? | Barely | No beds, no job sites, no crops, no water, no villagers |
| L4 Integration | Does the **game** receive it: chunk-by-chunk writing, the world's height, mobs, block orientation, loot, saves, speed? | **No** | Structure Hunter never reached the structure engine (reseed ran before the pack applied); villagers had nowhere to spawn; doors, beds and stairs had no facing |
| L5 Visual | Does it look like the real thing in the running game? | **No** | Only noticed from a screenshot |
| L6 Persistence | Does it survive save and load, and a different seed? | **No** | Facing was lost on load |

The plan below is built so **no structure can be called audited until it has passed all six layers.**

### Cross-cutting findings from this session (these affect many structures)

1. **The game world is 64 blocks tall; the structure engine targets 384.** Measured by realizing each structure on a
   Y=28 surface and counting blocks that land inside 0..63:
   - `ancient_city`: **0%** of its blocks fit (it sits at Y -51).
   - `trial_chambers`: **0%** (Y -15).
   - `bastion_remnant`: 78% (Y 60..65).
   - Everything else fits. So two structures were being "generated" while writing nothing. They are now excluded
     from the Structure Hunter pack (`INVISIBLE_IN_SHORT_WORLD` in `src/dataPackPresets.js`) so `/locate` totals are
     honest. A taller world, or a Y remap, is a **prerequisite** for the underground group (Section 6, Phase 0).
2. **Four structures have no generator at all:** `mineshaft`, `mineshaft_mesa`, `stronghold`, `fortress`.
3. **The world stores only block ids.** A door, bed, chest or stair's facing lives in a manager, not the chunk. Fixed
   this session for structures (`applyStructureOrientation`, saved with the world); every other structure that has
   doors, chests, beds or stairs must now be re-checked against it.
4. **No loot-table engine for chests.** Village chests now use a hand-written approximation (`src/villageLoot.js`).
   Every other structure's chests are empty or carry only a table id.
5. **Missing block entities and mobs:** spawners (monster room, mineshaft, trial chambers, fortress), vaults, sculk
   sensors/shriekers/catalysts behaviour, armor stands (there is only an item, no entity), copper golem statues and
   copper chests (Abandoned Camp), straw beds, ice box. `scripts/structure-parity/check-prerequisites.mjs` lists the
   current gaps.
6. **Parts are clean-room.** The repository ships no vanilla assets, so every floor plan is an approximation of the
   wiki's description. Parity therefore has to be defined against **wiki-stated facts** (counts, materials, rooms,
   contents), not against vanilla block-for-block output. Section 3 makes that precise.
7. **The in-game and Inspector paths differ.** The Inspector draws a flat surface, coloured cubes and no mobs, so it
   cannot see findings 1, 3, 4 or 5 or any terrain interaction. Section 5 closes that gap.
8. **A hidden browser tab throttles the game to ~1 chunk per second** (`requestAnimationFrame`), so in-game checks
   must run in a visible window or headless Playwright, not a background tab.

---

## 2. What the wiki lists

Source: the wiki *Structure* article (read in full for this plan). **Target version is 1.21.4 for numbers**, but the
current wiki has moved on; items newer than 1.21.4 are marked **post-1.21.4** and need a scope decision (Section 8).

### 2.1 Structures (locatable with `/locate`)

| # | Wiki structure | Dimension / group | Registry ids (1.21.4) | Generator today |
|---|---|---|---|---|
| 1 | Ancient City | Overworld, underground | `ancient_city` | yes (invisible: Y -51) |
| 2 | Buried Treasure | Overworld, coastal | `buried_treasure` | yes |
| 3 | Mineshaft | Overworld, underground | `mineshaft`, `mineshaft_mesa` | **no** |
| 4 | Stronghold | Overworld, underground | `stronghold` | **no** |
| 5 | Trail Ruins | Overworld, underground | `trail_ruins` | yes |
| 6 | Trial Chambers | Overworld, underground | `trial_chambers` | yes (invisible: Y -15) |
| 7 | Abandoned Camp | Overworld, above ground | **not in 1.21.4** (post-1.21.4) | **no** |
| 8 | Desert Pyramid | Overworld, above ground | `desert_pyramid` | yes |
| 9 | Igloo | Overworld, above ground | `igloo` | yes |
| 10 | Jungle Pyramid | Overworld, above ground | `jungle_pyramid` | yes |
| 11 | Pillager Outpost | Overworld, above ground | `pillager_outpost` | yes |
| 12 | Swamp Hut | Overworld, above ground | `swamp_hut` | yes |
| 13 | Village (plains, desert, savanna, snowy, taiga; rare abandoned variant) | Overworld, above ground | `village_plains`, `village_desert`, `village_savanna`, `village_snowy`, `village_taiga` | yes (audit started) |
| 14 | Woodland Mansion | Overworld, above ground | `mansion` | yes (reduced scale) |
| 15 | Ruined Portal (overworld, desert, jungle, mountain, ocean, swamp) | Overworld, both | `ruined_portal`, `_desert`, `_jungle`, `_mountain`, `_ocean`, `_swamp` | yes |
| 16 | Ocean Monument | Overworld, underwater | `monument` | yes (reduced scale) |
| 17 | Ocean Ruins (cold, warm) | Overworld, underwater | `ocean_ruin_cold`, `ocean_ruin_warm` | yes |
| 18 | Shipwreck (and beached) | Overworld, underwater/coast | `shipwreck`, `shipwreck_beached` | yes |
| 19 | Bastion Remnant | Nether | `bastion_remnant` | yes (78% fits) |
| 20 | Nether Fortress | Nether | `fortress` | **no** |
| 21 | Nether Fossil | Nether | `nether_fossil` | yes |
| 22 | Ruined Portal (Nether) | Nether | `ruined_portal_nether` | yes |
| 23 | End City (and End ship) | End | `end_city` | yes |

That is 23 wiki entries covering the 34 Java ids of 1.21.4 (plus Abandoned Camp).

### 2.2 Structure-like features (generate with "Generate Structures" off; not locatable)

| # | Feature | Notes |
|---|---|---|
| 24 | Amethyst Geode | shell layers, budding amethyst |
| 25 | Bonus Chest | spawn chest, only if enabled |
| 26 | Desert Well | sandstone over water, two suspicious sand |
| 27 | Fossil (coal / diamond) | buried bone blocks |
| 28 | Monster Room (dungeon) | cobblestone room, spawner, chests |
| 29 | Void Start Platform | superflat "The Void" only |
| 30 | End Gateway | after the dragon |
| 31 | End Platform | obsidian, self-repairing |
| 32 | End Spike (obsidian pillars) | crystals, some caged in iron bars |
| 33 | Exit Portal | fountain, dragon egg |

Also present in the repo's older list but not on this wiki page: pile, coral reef, forest rock, disk, ice spike, ice
patch, iceberg. These are terrain **features**, not wiki "structures". **Out of scope** unless you decide otherwise.

### 2.3 Excluded

Removed structures (Brick Pyramid, Glass Pillar, Starting House, Monolith, Obsidian Wall) and Bedrock-only ones
(Nether Reactor, Nether Spire, Bedrock-only biome variants). Not part of Java 1.21.4.

---

## 3. What "audited" means

Parity is defined against **facts the wiki states**, since the parts are clean-room. For each structure we write a
**spec card** (Section 4, step 1): a list of checkable facts, each tagged with the layer it belongs to. Example facts
for a village: *"has a bell"*, *"villagers only in houses with beds"*, *"at least one iron golem near the meeting
point; none in abandoned villages"*, *"desert paths are smooth sandstone, the others dirt paths"*, *"cats: one per 4
beds up to 5"*, *"taiga has two armor stands holding iron armor"*.

A fact is **verified** when a test asserts it (or, for L5 only, when a reviewed screenshot is attached). A structure
is **AUDITED** only when every fact on its card is verified or explicitly waived with a reason.

Status ladder (replaces the existing `PARTIAL`/`FUNCTIONAL` vocabulary for tracking, which stays in STRUCTURE_PARITY.md):

| Status | Meaning |
|---|---|
| `NOT AUDITED` | No spec card yet. |
| `CARD WRITTEN` | Spec card exists; no fixes made. |
| `IN PROGRESS` | Some facts failing; being fixed. |
| `GAME-VERIFIED` | All L1-L4 facts pass in tests **including a real `World`**. L5/L6 pending. |
| `AUDITED` | All six layers done, evidence linked. |
| `BLOCKED` | Cannot finish until a named prerequisite exists (Section 6). |

Waivers are allowed but must be written down (e.g. "elder guardian spawning is via spawn overrides, not placed").

---

## 4. The per-structure audit procedure

One structure at a time, in the order of Section 6. Each step produces an artifact.

1. **Spec card** (`docs/structure-audit/<id>.md`). Read the structure's own wiki page in full (not just the summary
   in *Structure*), plus the `Structure` article's sections that name it. Record the wiki **revision id**. List every
   checkable fact as `[layer] statement`. Include per-variant differences (biome, material), counts, sizes, loot
   tables, mobs, block entities, Y range, terrain behaviour, and what the wiki says is **not** there.
2. **Machine-readable data.** Put the numbers in `src/structureWikiData.js`, generated like `src/mobWikiData.js` by a
   script (`scripts/generate-structure-wiki-data.mjs`) so facts are not retyped into tests by hand.
3. **Failing tests first.** One test per fact in `tests/structureAudit<Name>.test.js`, using the shared helpers
   (Section 5.4). They must fail for the facts we know are wrong; that proves the test can see the bug.
4. **Fix.** Prefer fixing shared infrastructure (orientation, loot, spawns, world height) once, then the structure.
5. **Real-world test.** Generate a real `World`, locate the structure, generate its chunks, and assert on the voxels,
   the mob requests, the registered managers and a save/load round trip. (`tests/villageParity.test.js` is the
   template.)
6. **Inspector review.** Open the structure in the upgraded Inspector (Section 5), several seeds and every variant;
   save screenshots to `docs/structure-audit/evidence/<id>/`.
7. **In-game check** in a visible window or headless Playwright, using `/locate` and a flight along the structure;
   attach a screenshot.
8. **Update the tracker** (Section 7) and the existing parity matrix row; regenerate the goldens deliberately
   (`node scripts/update-structure-goldens.mjs`) because layout changes are intended.
9. **Close the card.** Every fact is `verified` or `waived: reason`.

### 4.1 The wiki comparison rule (mandatory for every structure)

Reading the wiki's prose is not enough. The first swamp hut passed a 29-fact card and still looked smaller and plainer
than the wiki's hut, because the prose never mentions the oak fences, the windows or where the flower pot sits: they
are only in the infobox and the pictures. So, for **every** structure, before it can leave `IN PROGRESS`:

1. **Fetch the page and its pictures:** `node scripts/fetch-wiki-structure.mjs <Wiki_Page_Name>` saves the wikitext,
   the infobox **Blocks** list and every image into `docs/structure-audit/wiki/<Page>/`.
2. **Look at every image** (open each file; do not skip the interior, top-down and side views), and write down what
   they show that the text does not: block shapes, openings, furniture positions, proportions, how high it stands
   above the ground, what is on top, what is beside it.
3. **Put the infobox Blocks list on the card** as `infoboxBlocks`. The audit then runs fact `W1`: the structure uses
   every listed block and no block that is not listed. A block we cannot place yet is a failing fact, not an omission.
4. **Compare side by side:** the Inspector's textured view (and the walk-through) from the same angle as each wiki
   picture; export evidence (`Export evidence`) next to the wiki image in `docs/structure-audit/evidence/<id>/` and
   state in the tracker note what was compared and what still differs.
5. **Measure:** wiki dimensions (spawn box, size, heights, counts) become facts with numbers, and each picture-only
   detail from step 2 becomes a fact too, so it can fail.
6. **A human reviews the comparison** before `AUDITED` (the user did for the swamp hut and found the size gap).

Rules we keep from earlier rounds (see STRUCTURE_PARITY.md deviations): bound branching and depth before raising them;
check a changed line after editing; do not commit a structure whose tests fail; clean-room only.

---

## 5. Changes to the Structure Inspector

Today the Inspector (`structure-inspector.html`, `src/structureInspector*.js`) shows the plan, pieces, coloured cubes
on a **flat** surface within Y 40..120, placement overlay, and a determinism check. It cannot show mobs, loot,
orientation, the real world height, real terrain, or the wiki's facts. Planned changes, in priority order:

### 5.1 Must have (Phase 0)

1. **Audit panel.** Loads the structure's spec card from `structureWikiData` and shows each fact as a row:
   `verified` / `failing` / `unchecked` / `waived`, evaluated live against the generated structure where a fact is
   machine-checkable (counts of blocks, presence of blocks, spawn counts, materials per variant). Failing rows show
   what was found. This is the mob Inspector's showcase, for structures.
2. **Real-world mode.** A toggle from "flat preview" to "real world": builds a real `World` (the game's terrain,
   biomes, 64-block height, chunk-clipped writing, structure integration) at the chosen seed and shows the result.
   This is what exposes terrain adaptation, floating buildings, trees inside rooms, and height clipping.
3. **World-height gauge.** A vertical bar showing the 0..63 game world against the structure's Y range, and a count
   of blocks **clipped** (the `outOfWorld` stat). Turns the ancient-city/trial-chamber finding into something visible.
4. **Entities panel.** Every mob the structure requests (type, position, piece), with counts per type, and the
   expected counts from the card. (Villagers vs beds, golems, pen animals, shulkers, guardians, witches, ...)
5. **Orientation-aware rendering.** Draw doors, beds, stairs, chests with their real facing and real textures (the
   game's texture atlas), not coloured cubes, so rotation bugs are visible. Keep the block legend.
6. **Variant and seed gallery.** Pick a variant (e.g. all five villages, six ruined portals) and render N seeds in a
   grid, so one lucky seed cannot hide a bug.

### 5.2 Should have (Phase 1)

7. **Loot panel.** Roll each chest's loot table N times, show item frequencies against the wiki's table, and flag
   missing items. (Requires the chest loot engine, Section 6 Phase 0.)
8. **Block-entity panel.** Spawners (mob type), vaults, trial spawners, sculk sensors/shriekers, brewing stands,
   lecterns: list each with its data and whether the game implements its behaviour.
9. **Piece/jigsaw graph.** Show the pool graph: which pools were drawn from, depth, rejected candidates (the existing
   `exhaustedPools`/`rejectedByCollision` signatures), so layout bugs and branching blow-ups are diagnosable.
10. **Density report.** For the chosen set: structures per 1024x1024 area, nearest-to-spawn distance, and the same for
    Structure Hunter. Replaces the ad-hoc scripts used this session.
11. **Evidence export.** One button saves screenshots (several angles, top-down map, interior cutaway) and the audit
    panel result as JSON into `docs/structure-audit/evidence/<id>/`.

### 5.3 Nice to have (later)

12. **Open in game.** A link or `/structure_audit <id>` command that generates a world, teleports the player beside
    the nearest instance in Creative, and sets time/weather for a clean look.
13. **Cutaway/slice view** for interiors (mansion, monument, ancient city, trial chambers).
14. **Progress dashboard page** (`structure-audit.html`) rendering the tracker (Section 7).

### 5.4 Shared test helpers

Create `tests/helpers/structureAudit.js` so each structure's test file stays short: `generateInWorld(id, {seed})`
(real `World`, locate, generate chunks), `surveyBlocks(...)`, `collectSpawns(...)`, `rollChests(...)`,
`assertSaveRoundTrip(...)`, `assertClippedToChunk(...)`. The village tests already contain working versions.

---

## 6. Order of work

Ordered by what players meet first, what Structure Hunter exposes, and what unblocks other work.

### Phase 0: foundations (before auditing individual structures)

| Task | Why | Unblocks |
|---|---|---|
| P0.1 Decide target version and scope (Section 8) | Numbers depend on it | everything |
| P0.2 Generate `structureWikiData` + spec-card format + tracker + validator test | Gives every later step a place to write | all |
| P0.3 Inspector 5.1 items 1-6 and shared test helpers 5.4 | Needed to see L4/L5 bugs | all |
| P0.4 **World height** (taller world, or a documented Y remap for underground structures) | 0% of ancient city and trial chambers fit | ancient city, trial chambers, mineshaft, stronghold, monster room, geodes, fossils, fortress |
| P0.5 **Chest loot-table engine** (data-driven, seeded, deterministic; village tables are the first tenant) | All structures have loot | every structure with chests |
| P0.6 **Block entities and mobs the structures need:** spawner, vault, trial spawner, sculk sensor/shrieker/catalyst behaviour, armor stand entity, cats at villages, copper golem statue | Content layer | monster room, mineshaft, fortress, trial chambers, ancient city, village taiga, abandoned camp |
| P0.7 Headless in-game check harness (Playwright, visible viewport, fixed seed, `/locate`, flight path, screenshot) | L5 evidence without a hidden tab | all |

### Phase 1: surface structures players see first

Village x5 (finish), pillager outpost, desert pyramid, jungle pyramid, igloo, swamp hut, desert well, ruined portals x6,
buried treasure, abandoned camp (if in scope).

### Phase 2: water

Shipwreck x2, ocean ruins x2, ocean monument (full 58x58 scale, currently 23x23), buried treasure coast check.

### Phase 3: underground (needs P0.4)

Monster room, mineshaft x2 (**new generator**), stronghold (**new**, plus ring biome snapping), amethyst geode, fossils,
trail ruins, ancient city, trial chambers.

### Phase 4: Nether and End

Nether fortress (**new**), bastion remnant, nether fossil, nether ruined portal, end city + ship, end spike, exit
portal, end gateway, end platform, void start platform, bonus chest.

### Phase 5: large buildings

Woodland mansion (full scale, inhabitants), and a second pass on anything left `GAME-VERIFIED` but not `AUDITED`.

---

## 7. Progress tracker

Update this table in the same commit as the work. Layers: `-` not started, `~` partly, `ok` done. **Spec** is the card,
**Gen** = L1+L2, **Cont** = L3, **Game** = L4, **Vis** = L5, **Save** = L6.

Current statuses are **honest first guesses from this session's findings**, not audits. "Last repo status" is the
engine-level status in STRUCTURE_PARITY.md.

| # | Structure | Phase | Spec | Gen | Cont | Game | Vis | Save | Status | Notes / known gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| 13a | Village (plains) | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Full wiki audit (round 3). 34 plains structures from Village/Structure (5 meeting points, lamp, houses, job sites, farms, pens, stables, temples) built from their descriptions; infobox block list enforced (W1); white/yellow beds, wheat/carrots/potatoes/beetroot. Round 4: buildings are the wiki's blueprints block for block; abandoned villages use their own pools; armor stands usable. **Open:** pool weights are ours (the wiki does not publish them); visual review in the Inspector and in game. Evidence: `docs/structure-audit/evidence/village_plains/` |
| 13b | Village (desert) | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Full wiki audit (round 3). 31 desert structures; jungle doors/fences/trapdoors, no glass, no planks, flat sandstone roofs, terracotta, potted cacti; cyan/green/lime beds; wheat, beetroot, melon stems; camel at the meeting point (not when abandoned). **Open:** as plains. Evidence: `docs/structure-audit/evidence/village_desert/` |
| 13c | Village (savanna) | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Full wiki audit (round 3). 34 savanna structures incl. stilt houses, brown banners, orange/yellow/red terracotta, glazed terracotta; orange/red beds; melons only; no furnace. **Open:** as plains. Evidence: `docs/structure-audit/evidence/village_savanna/` |
| 13d | Village (snowy) | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Full wiki audit (round 3). 36 snowy structures incl. snow/packed-ice/blue-ice igloo houses, diorite chimneys, lanterns (3 lamp designs), icicle meeting points; blue/white/red beds; no crafting table, no hay. Stonecutter allowed from its own building descriptions though missing from the infobox. **Open:** as plains. Evidence: `docs/structure-audit/evidence/village_snowy/` |
| 13e | Village (taiga) | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Full wiki audit (round 3). 34 taiga structures + 6 decorations; spruce-log roofs, campfires, mossy cobblestone, signs; purple/blue beds; wheat/potatoes/pumpkins; **two armor stands (iron helmet + iron chestplate) at taiga_armorer_2** (new armor stand entity); weaponsmiths weighted to be likelier than elsewhere. **Open:** as plains. Evidence: `docs/structure-audit/evidence/village_taiga/` |
| 11 | Pillager Outpost | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Watchtower and its five features are the wiki's /Structure blueprints; 15 feature spots, each feature 1 in 13 (empty 7/13), at most 4; golem cage = 1 iron golem, allay cage = 2 allays; 8 pillagers incl. captain; outpost chest loot; layer-6 stairs upside down and top slabs (top slabs newly supported by the game). Card O1-O7 + W1. **Open:** ominous banner pattern (white wall banner), exact jigsaw spot positions (not drawn), captain banner, MC-139711 trenches; visual review. Evidence: `docs/structure-audit/evidence/pillager_outpost/` |
| 8 | Desert Pyramid | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). The wiki's /Structure blueprint block for block (matches its materials table exactly); cellar sand with 5-7 suspicious sand, collapsed roof 33% sandstone + 1 suspicious, the green-wool pair; 4 chests (desert pyramid loot) facing the plate; plate under the blue terracotta over 9 TNT; archaeology loot on suspicious sand. Card P1-P8 + W1. **Open:** foundation down into ravines; visual review. Evidence: `docs/structure-audit/evidence/desert_pyramid/` |
| 9 | Igloo | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). The wiki's /Structure blueprint: dome (94 snow, 95 without basement) and 23-deep basement in one frame, random rotation; 50% basement; brewing stand with splash potion of Weakness, water cauldron level 2, igloo chest, potted cactus, iron bars, cleric villager + zombie villager (persistent); infested bricks 2/1/6 placed at random (the drawing does not mark them). Card G1-G6 + W1. **Open:** blueprint vs table differ by 4 stone bricks and 1 ladder (pinned); visual review. Evidence: `docs/structure-audit/evidence/igloo/` |
| 10 | Jungle Pyramid | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). The wiki's /Structure blueprint block for block, with its Blueprint table's facings (24 stairs, both chests, 3 sticky pistons incl. the one facing up, repeater); exactly the materials table (1157 cobblestone or mossy cobblestone, coin toss per block as the wiki gives no ratio); 2 chests (jungle temple loot), 2 dispensers facing their vines (dispenser loot), 2 tripwire lines with 4 hooks facing along them, 3 levers on chiseled stone bricks. Card J1-J6 + W1. **Open:** the trap and puzzle as working redstone; mossy ratio; visual review. Evidence: `docs/structure-audit/evidence/jungle_pyramid/` |
| 12 | Swamp Hut | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | **First structure taken to parity.** Card H1-H20 (28 pass, 1 waived: vines) passes in flat and real-world mode on 5 seeds; 15 hut tests + 20 audit tests. Rebuilt: 7x7x9 spawn box, spruce planks / oak-log pillars reaching the ground, stairs roof, porch, no door, crafting table + empty cauldron + potted red mushroom, no chest, witch + black cat persistent (witch not on Peaceful), `terrain_adaptation` none. Game fixes: structure spawn box now works (`structureIdAt`, was never wired), persistence flag, black cat breed. **Round 2:** rebuilt after the user compared it with the wiki pictures (fences, windows, sill pot, open front); W1 infobox fact added. **Open:** L5 re-review against the wiki images and a second human look (earlier review was coloured cubes, one seed; screenshot in `docs/structure-audit/evidence/swamp_hut/`); no in-game flight yet; vines waived |
| 15 | Ruined Portal x6 | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). All 13 designs: portal_1-3 and giant_portal_1 are the wiki's blueprints; the other 9 (no drawing on the wiki) are built to their description with exactly their materials table. 5% giant, even odds per design. Every setup is the Generation table's (standard and mountain each a 50/50 pair; jungle overgrown + vines; swamp vines; air pockets by probability); vertical rules (underground 15..n-n2, partly buried n-n2+2..8, ocean floor, in mountain); the full replacement table (gold 30% air, lava/magma/netherrack incl. cold biomes, 7% magma, 15% crying obsidian, block ageing by mossiness); netherrack spread over the terrain round the portal; ruined portal chest loot. Cards R1-R5 + W1 for each of the six ids. **Open:** 9 shapes are ours; the ageing split between block and stair, leaf/vine density and which setups can be cold are not on the wiki; visual review. Evidence: `docs/structure-audit/evidence/ruined_portal*/` |
| 7 | Abandoned Camp | 1 | - | - | - | - | - | - | `BLOCKED` | **post-1.21.4**, needs copper chest, copper golem statue, wool stairs; scope decision |
| 2 | Buried Treasure | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). One chest at chunk-relative 9, 9 facing east (now passed to the game as an oriented chest), buried one block under the ground top ("almost always buried"), beaches and snowy beaches. **Chest loot is now real for every structure:** `src/structureLoot.js` rolls the wiki's own chest tables (Module:LootChest, 66 tables incl. villages and archaeology), and the buried treasure always holds a heart of the sea. Card B1-B4 + W1. **Open:** waterlogging (the game has none); explorer maps are plain maps. Evidence: `docs/structure-audit/evidence/buried_treasure/` |
| 26 | Desert Well | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: the wiki's /Structure blueprint block for block (89 sandstone, 4 sand, 12 slabs, 5 water, 2 suspicious sand with desert well archaeology loot, one under the water and one below that); desert only, 1/1000 per chunk (a feature, `feature: true` set). Card DW1-DW3 + W1. **Open:** the solid-sand ground test; visual review. Evidence: `docs/structure-audit/evidence/desert_well/` |
| 18 | Shipwreck x2 | 1 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). All 20 templates: the 12 the /Structure page draws, and 8 stubs cut from the drawn whole ship of the same orientation and trimmed to their materials tables; the 8 wood pairs (logs in the primary); chest loot by place (supply in the bow, treasure in the upper stern, map in the lower stern, map in an upside-down bow; 2+ chests always include the map). Ocean and beached ids. Card S1-S4 + W1 each. **Open:** template and wood odds, beached templates (upright only) and sink depth are ours; drawn templates differ from the tables by up to 12 blocks (pinned); visual review. Evidence: `docs/structure-audit/evidence/shipwreck*/` |
| 17 | Ocean Ruins x2 | 2 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). The /Structure drawings: 12 cold designs x brick/cracked/mossy, 12 warm. 30% large; a large ruin brings 4-8 small ones 90% of the time (multi-piece starts); integrity per the pages (0.9/0.8, cracked 0.7, mossy 0.5); suspicious gravel (cold) / sand (warm) with the archaeology loot; big/small chest loot; drowned per design (persistent, thinned by integrity); warm light blue terracotta. Card OR1-OR6 + W1 each. **Open:** design and material odds, suspicious rate (1/25), cluster spread and drowned spots are ours; zombie nautiluses are newer than the game; visual review. Evidence: `docs/structure-audit/evidence/ocean_ruin_*/` |
| 16 | Ocean Monument | 2 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). **Full 58x58x22 scale.** The /Structure page's room-maze algorithm step by step (46 units, core at the back, random wall closing that keeps every unit connected to the entry, then DXY/DYZ/DZ/DX/DY/sponge/small rooms by the first rule that fits); every room, the core, the penthouse and both wings are the page's drawings, each wall from the exits/no-exits drawing by whether it is open; sponge columns 1/3 empty, 1/2 one, 1/6 two; 8 gold in dark prismarine; 3 elder guardians (top, each wing); 23 pillars to the floor; water fills the box. Card M1-M6 + W1. **Open:** where the grid, wings, hallway and pillars sit in the square is ours (not on the wiki); the roof sits just under this world's sea level, so in shallow oceans it is buried; visual review. Evidence: `docs/structure-audit/evidence/monument/` |
| 28 | Monster Room | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: a feature with 14 attempts per chunk and the wiki's ground test (solid floor and ceiling, 1-5 two-high openings), read from the world's own terrain noise (`World.solidAtGen`) so planning never loads a chunk; 7 or 9 each way; cobblestone where the ground was solid, 75% mossy floor; two chests (3 tries, exactly one solid side, dungeon loot); spawner in the middle, zombie 50 / skeleton 25 / spider 25. **New: monster spawners run in the game** (`src/monsterSpawner.js`: 16-block activation, 4 tries in 9x3x9, 200-799 tick wait, cap of 6, light rules, Peaceful) and are saved with the world. Features no longer stop structures in their chunk. Card MR1-MR5 + W1. **Open:** P0.4 remap of the Y bands onto the 64-tall world; visual review. Evidence: `docs/structure-audit/evidence/monster_room/` |
| 3 | Mineshaft x2 | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator (`mineshaft.js`, on the new `cellStructure.js`): the 10x10 arched room with 1-4 exits a side; 3x3 corridors with supports five apart (the drawing: fences either side, planks over), rails, cobwebs only against solid roof, torches; crossings (some dual-floor) with corner columns; staircases one down per block; abandoned passageways full of cobwebs round a cave spider spawner; chest minecarts with mineshaft loot (the game's rail system takes them); plank bridges over caves with a chain or log pillar; badlands variant in dark oak near the surface; 0.4% per chunk; at most 8 pieces deep and 80 blocks from the room. Neighbouring mineshafts may overlap (the audit now discounts blocks another start writes). Cards MS1-MS4 + W1 each. **Open:** piece odds, lengths and shares are ours (not on the wiki); P0.4 Y remap; visual review. Evidence: `docs/structure-audit/evidence/mineshaft*/` |
| 4 | Stronghold | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: the wiki's pieces (straight corridor with 50% side exits and 10% torches, turns, spiral and straight staircases, five-way crossing with its exit odds, prison hall, chest corridor, room crossing in four variants, large/small library with 7% cobwebs, portal room) under its per-stronghold limits; start spiral at chunk-local 4,4 then a five-way crossing; within 112 blocks; restart until a portal room exists (never within 5 rooms, libraries never within 4); doors opening 2 : grates : wood : iron; filler corridors of plain bricks; brick mix 45/30/20/5 infested; the portal room is the /Structure drawing with 12 frames (10% eyes) and a silverfish spawner; corridor/crossing/library loot; land bias for the start. **Also fixed: `/locate` only ever looked at the corners of each search shell** (a structure due north/south/east/west of you was never the nearest), and every structure set now plans independently in a chunk (vanilla: a mineshaft and a shipwreck can share a chunk). Structures are searched 8 chunks round each chunk (a stronghold reaches 112 blocks). Card SH1-SH6 + W1. **Open:** piece weights, the 120-piece cap and the room interiors other than the portal room are ours; P0.4 depth; visual review. Evidence: `docs/structure-audit/evidence/stronghold/` |
| 24 | Amethyst Geode | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: 1/24 chunks; smooth basalt / calcite / amethyst shells round a hollow (radii ours, sized to the wiki's drawn geode: basalt 697, calcite 253, amethyst 183), 8.3% budding, crystals on budding amethyst facing out, 95% cracked; overrides caves. The parser now reads `{{Layered blueprint}}` with a capital L. Card AG1-AG5 + W1. **Open:** the shape is procedural and ours; P0.4 Y remap; visual review. Evidence: `docs/structure-audit/evidence/amethyst_geode/` |
| 27 | Fossil | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: deserts, swamps, mangrove swamps; two attempts per chunk at 1/64 (upper: coal ore; deep: deepslate diamond ore); the eight /Structure drawings (now all matching their tables: the parser reads en-dash layer ranges like 'Layer 1–2'); bone integrity 0.9, ore overlay 0.1; buried. Card F1-F4 + W1. **Open:** P0.4 Y remap; visual review. Evidence: `docs/structure-audit/evidence/fossil/` |
| 5 | Trail Ruins | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt to the wiki's description: buried under the lowest ground along each part with only the tower top above ground; a stained/glazed terracotta tower with two halls beside it; 2-4 roads of cobblestone, stone and stone bricks with buildings and mud brick decor; solid, gravel-filled; the processors exactly as the page states (20% dirt, then 10% coarse dirt, then 2 common suspicious gravel in the tower top and roads, 6 common + 3 rare elsewhere) with the trail ruins archaeology loot; the old version's chests and suspicious sand (neither exists in trail ruins) are gone. Card TR1-TR4 + W1. **Open:** the shapes are ours (the wiki lists each piece's materials but draws none); visual review. Evidence: `docs/structure-audit/evidence/trail_ruins/` |
| 1 | Ancient City | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt from the Ancient City/Structure/Blueprints drawings (36 fetched: the centre (drawn half, mirrored), entrance connector and paths, walls, barracks, camps, chambers, ice box, pillars, ruins, sauna, statue, tall ruins); our plan puts the centre in the middle with its reinforced deepslate frame, the entrance south, buildings on a ring of plots joined by two-deep gray-wool corridors, and walls; chests with the ancient city loot (the ice box's own); no mob placed. **Fits the world now** (was 0%): one fixed floor at y 13 (Y -51 is 13 above vanilla's floor). Card AC1-AC5 + W1. **Open:** the plan is ours (the wiki does not draw joints); about 150 across, not 220; the basement redstone is not wired; visual review. Evidence: `docs/structure-audit/evidence/ancient_city/` |
| 6 | Trial Chambers | 3 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt to the wiki's description from its materials: corridor end -> chamber -> corridor -> intersection -> chamber -> corridor -> atrium -> entrance, plus 2-4 branch chambers; the eight chamber kinds; one mob per category per structure (breeze always; melee/ranged 1/3 each; small melee 1/4); trial spawners and vaults (normal + ominous); chests with the entrance/intersection/supply tables. **New: trial spawners and vaults work in the game** (`src/trialSpawner.js`: range 14 with line of sight, the trial chambers' interval/total/simultaneous values incl. breeze and slow spawners, completion reward 50% trial key, 30-minute cooldown; vaults open once per player with a trial key and eject 2-5 stacks). **Fits the world now** (start at y 4-12). Card TC1-TC4 + W1. **Open:** shapes are ours (no drawings on the wiki); barrel/pot/dispenser loot is recorded but those containers do not hold it in game; ominous trials; visual review. Evidence: `docs/structure-audit/evidence/trial_chambers/` |
| 20 | Nether Fortress | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New generator: all 12 /Structure drawings as pieces (bridge, plain and arched crossings, small room, blaze platform, lava well room; corridor, crossing, turn, stairway, balcony, nether wart garden), joined at the doorways found in the drawings themselves (new `drawnPieces.js`), exterior and interior kept apart with the lava well room between; start crossing centred at chunk-local 11,11; the wiki's piece limits; blaze spawners (they run in game); 1/3 of turns with a nether bridge chest; pillars down to the ground; the interior cleared through netherrack. Generated in real Nether worlds. Card NF1-NF5 + W1. **Open:** piece weights, the lava well limit and the spread limits are ours; the start's walkway at y 40 in the 64-tall Nether; visual review. Evidence: `docs/structure-audit/evidence/fortress/` |
| 19 | Bastion Remnant | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt to the wiki's four types: bridge (piglin-face rampart, lava-ringed walkways in the mouth, damaged double-deck bridge with a far pillar, 16 gold), hoglin stables (three-part rampart, pens with hoglins, stable loot), housing units (ramparts round a courtyard with nether wart, units with generic chests), treasure room (rampart on buttresses, lava floor, bridges, magma cube spawner hanging from a chain, gold ring and 1-2 treasure chests). Piglins 10% brute / 40% sword / 40% crossbow / 10% none (the game now honours the weapon), persistent; floats (no pillars) and now fits the 64-tall Nether (was 22% above it). Card BR1-BR5 + W1. **Open:** the wiki draws only some bridge-type templates and not how they join, so all four layouts are ours; visual review. Evidence: `docs/structure-audit/evidence/bastion_remnant/` |
| 21 | Nether Fossil | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). All 14 variants are the /Structure drawings (each matches its table, 5-26 bone blocks), no integrity and no ores; soul sand valleys; on the valley floor, rotated; a dried ghast beside 1/3 of them (the game has the block). Card NX1-NX3 + W1. **Open:** the floor placement and the ghast's side are ours; visual review. Evidence: `docs/structure-audit/evidence/nether_fossil/` |
| 22 | Ruined Portal (Nether) | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Same 13 designs and rules; blackstone replacement per the Nether table (polished blackstone bricks, slabs, stairs, walls, chiseled, cracked; chains for bars); Nether Y rules (air pocket 32-100, else 27-29 / 29-100). **The game now generates structures in the Nether and the End** (per-dimension engines in worldStructures.js; the Nether and End chunk generators now call the structure pass). Card R1-R4 + W1 in a real Nether world. **Open:** Y above 63 is outside this world (P0.4); visual review. Evidence: `docs/structure-audit/evidence/ruined_portal_nether/` |
| 23 | End City + ship | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt from the /Structure drawings: base, empty room, small tower base + extensions + banner room, large tower floor + two/three-storey large room + loot room, bridge pieces, stairs and dock, and the End ship (fetched from its own subpage); the parser now reads legends without a leading pipe; green/red wool markers flip stairs and are not placed. 50% bridge per tower side, 12.5% ship, at most one, stern toward the city; shulkers per piece (persistent); End city treasure loot; the elytra go in the ship's first chest (no item frame entity in this game). The game now generates End structures. Card EC1-EC5 + W1. **Open:** how pieces stack and the bridge lengths are ours; towers are cut by the 64-tall End's ceiling; visual review. Evidence: `docs/structure-audit/evidence/end_city/` |
| 32 | End Spike | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New feature (`endFeatures.js`): the ten fixed centres, the ten radius/height pairs shuffled per world, cross-sections that reproduce the wiki's obsidian totals exactly (dx^2+dz^2 <= (r-1)^2+1), from y 0 to the top, bedrock and fire on top, the 2nd and 3rd shortest caged in 73 iron bars each. The dragon fight now puts its 10 End crystals on the spike tops (was 8 floating). Card ES1-ES3 + W1. **Open:** heights mapped onto the 64-tall End (y' = 32 + (y - 64) x 0.75, P0.4); visual review. Evidence: `docs/structure-audit/evidence/end_spike/` |
| 33 | Exit Portal | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New feature: the End podium at 0,0 from the wiki's top-view grid, portal level one above the island top (the End's height function now matches its terrain), 16 rim bedrock over 16 End stone, bedrock pillar with four torches, inactive at generation; on the dragon's defeat it turns active with 20 portal blocks and the egg on the pillar (first time only). Card EP1-EP2 + W1. **Open:** torch facings when placed by the fight; visual review. |
| 30 | End Gateway | 4 | ok | ok | ok | ok | ~ | - | `GAME-VERIFIED` | Round 1 (this session). The twenty fixed spots 96 blocks out (the wiki's table), opened one per dragon defeat in a per-world order; each the /Structure drawing (12 bedrock round one gateway block). Not a world-gen structure, so unit tests (`tests/structureEndFeatures.test.js`) stand in for a located card. **Open:** gateway teleport to the outer islands and the return gateway; Y mapped (75 -> 40). |
| 31 | End Platform | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New feature: 5x5 obsidian at (100, y, 0) with three layers cleared above; players now arrive on it facing west (was a 12-block end-stone disc at the island centre), and it regenerates on every entry. Card EL1 + W1. **Open:** y 48 mapped to 20 (P0.4). |
| 29 | Void Start Platform | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New feature: 33x33 stone from -8 to 24 with one cobblestone at 8,8 (was an 8x8 bedrock/obsidian pad); the Void world's chunk generator now runs the structure pass. Card VP1 + W1. **Open:** at y 30, the Void world's existing spawn level, not -61. |
| 25 | Bonus Chest | 4 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). New: a Bonus Chest option on the create-world screen (setting `bonusChest`, off by default); one chest on the highest block in the spawn chunk with a torch on each free side, spawn bonus chest loot (the wiki's table via `structureLoot.js`). Unit tests (`tests/bonusChest.test.js`). **Open:** a browser check of the option. |
| 14 | Woodland Mansion | 5 | ok | ok | ok | ok | ~ | ok | `GAME-VERIFIED` | Round 1 (this session). Rebuilt from the Woodland Mansion/Structure/Blueprints drawings (62: every room in its 1x1, 1x2 and 2x2 footprint, the hallways, the outer wall segments with and without windows, the entrance and foyer staircases) on our floor plan: a corridor spine from the foyer with a cross corridor, rooms tiling the rest, three floors with the top one on the middle half, one secret room a floor (obsidian, lava, spider with its spawner, fake end portal...), a cobblestone foundation down to the ground, a flat roof. Mobs per the page: vindicators, evokers (with vindicators) only above the ground floor, allays only in jails with a guard, all persistent; mansion chest loot. Card WM1-WM5 + W1. **Open:** vanilla's floor-plan algorithm is not on the wiki, so the plan is ours; the roof is flat; visual review. Evidence: `docs/structure-audit/evidence/mansion/` |

`?` means a generator exists but the layer has not been looked at. Counts today: **0 AUDITED (no visual review yet),
every row GAME-VERIFIED except Abandoned Camp, which stays BLOCKED** (post-1.21.4; this game has no copper chest, copper
golem statue or wool stairs, and `tests/structureEngine.test.js` pins it out of the registry -- a version decision).

### Per-structure must-haves from the wiki (seed for the spec cards)

Short lists to start each card from. They are the facts the *Structure* article states; the full card comes from the
structure's own page.

- **Village:** meeting point with bell; dirt paths (smooth sandstone in desert); lamp posts, hay bales, melon/pumpkin
  patches, farms; houses with beds -> villagers; job-site buildings generate empty; cats one per 4 beds up to 5;
  iron golem near the meeting point (up to two); cows, pigs, sheep, horses; desert camel at the meeting point and warm
  pig/cow variants; taiga: two armor stands with iron armor, sweet berry bushes, pumpkins; savanna: farmland with melon;
  snowy: snow, ice, lanterns; rare abandoned villages: zombie villagers, cobwebs, no iron golems, no torches.
- **Pillager Outpost:** watchtower with a chest on top; up to four small structures (tents, scarecrows, cages with an
  iron golem or up to three allays); pillagers; not generated close to villages.
- **Desert Pyramid:** sandstone temple, four chests over an armed TNT trap under a pressure plate, a buried side room
  with suspicious sand.
- **Jungle Pyramid:** overgrown cobblestone; two chests, one guarded by dispensers (arrow trap), one behind a lever
  puzzle.
- **Igloo:** snow building; 50% have a basement with a captive villager and a zombie villager, weakness potion and a
  golden apple.
- **Swamp Hut:** stilted wooden hut, cauldron and crafting table; a witch and a black cat that do not despawn.
- **Ruined Portal:** incomplete portal, netherrack platform, chest, gold blocks; variants by biome; surface,
  underwater or cave.
- **Woodland Mansion:** three floors of dark oak, many rooms, loot chests, vindicators and evokers that do not respawn,
  allays in cells.
- **Ocean Monument:** guardians, three elder guardians in fixed places, eight gold blocks, wet sponges, maze interior.
- **Ocean Ruins:** small stone-brick (cold) or sandstone (warm) buildings; loot chests; suspicious sand/gravel;
  warm ruins' suspicious sand is the only sniffer egg source; drowned may spawn.
- **Shipwreck:** wooden wreck, up to three chests, sometimes on land.
- **Buried Treasure:** hidden chest with a guaranteed Heart of the Sea plus diamonds, ingots, emeralds, TNT, potions.
- **Mineshaft:** oak-fence-supported corridors, rails, minecarts with chests, cave spider spawners in cobwebs; mesa
  variant in dark oak and can reach the surface.
- **Stronghold:** maze of rooms incl. the End portal room, libraries, prison cells, storage; located with eyes of ender.
- **Trail Ruins:** buried ruined buildings except a tower tip; suspicious gravel with archaeology items.
- **Trial Chambers:** copper and tuff complex, trial spawners, vaults.
- **Ancient City:** deepslate/wool corridors, a central warden-shaped reinforced-deepslate building, loot chests, sculk
  sensors, shriekers, catalysts.
- **Bastion Remnant:** blackstone castle, piglins and piglin brutes, bridges, housing, hoglin stables, treasure rooms,
  gold blocks.
- **Nether Fortress:** nether-brick castle, blaze spawners, wart farms, ramparts, chests; wither skeletons spawn only
  here.
- **Nether Fossil:** incomplete bone-block fossil in soul sand valley.
- **End City:** purpur, end stone brick, magenta stained glass towers guarded by shulkers; loot chests; end ship with
  elytra.
- **Features:** amethyst geode (shell layers, budding amethyst); monster room (spawner of zombie/skeleton/spider, up
  to two chests); desert well (water, suspicious sand); fossil (coal or diamond depending on altitude); end spike
  (crystals, some in iron bars); exit portal (dragon egg); end gateway; end platform; bonus chest; void platform.

---

## 8. Decisions needed before Phase 0

1. **Target version.** The repository targets Java **1.21.4** and its numbers (spacing, salts) come from there; the
   current wiki also describes newer content (Abandoned Camp, copper golem statues, dried ghasts near nether fossils,
   Pale Garden gates). *Recommendation:* keep 1.21.4 as the parity target, record newer wiki facts in the card as
   `post-1.21.4`, and decide Abandoned Camp separately.
2. **World height.** Options: (a) make the world taller (large engine change: chunk arrays, lighting, meshing,
   saves, performance); (b) a documented Y remap so underground structures sit in the 0..63 band. *Recommendation:*
   (b) first, because it unblocks Phase 3 sooner and keeps saves compatible; revisit (a) later.
3. **Scale.** Monument (23x23 vs 58x58) and mansion are reduced "to keep the suite fast". *Recommendation:* restore
   wiki sizes once the real-world mode and the in-game speed check exist.
4. **Vanilla templates.** No vanilla assets ship. *Recommendation:* continue clean-room, measuring sizes/counts from
   the wiki, and never claim `VERIFIED` against vanilla block-for-block.
5. **Feature scope.** Whether the pile/coral reef/forest rock/disk/ice spike/iceberg terrain features are in scope.
   *Recommendation:* out of scope for this plan.

---

## 9. Risks

- **Spec drift:** wiki pages change. Mitigation: record revision ids, regenerate `structureWikiData` deliberately.
- **Speed:** denser structure sets cost generation time (measured: a Structure Hunter world generates ~4.4x slower
  than vanilla in Node). Add the density/time numbers to the Inspector report and set a budget per structure.
- **Branching blow-ups** in new maze structures (mineshaft, fortress, stronghold): bound branching and depth first.
- **Overlap** between neighbouring structures in dense packs (Structure Hunter): add a test that no two structure
  boxes overlap in a real-world sample, or document the rule.
- **Test cost:** real-world tests are slow (seconds each). Keep them per-structure and run the engine-level tests by
  default; gate the slow tier behind a script, as the existing structure tests do.
- **Goldens churn:** every layout fix changes `tests/golden/structureSeeds.json`; regenerate deliberately and review.

---

## 10. Immediate next steps

1. You confirm the Section 8 decisions (or accept the recommendations).
2. Phase 0: P0.2 and P0.3 first (spec-card format, tracker validator, Inspector audit panel and real-world mode), since
   they make every later structure cheaper.
3. Finish the village: cats, second golem, abandoned variant, taiga armor stands (needs the armor-stand entity),
   per-biome building weights, then a visual review in the upgraded Inspector. That becomes the first `AUDITED`
   structure and the worked example for the rest.
4. Then Phase 1 in the order of the tracker.

### Work already done toward this (this session)

- Village generator rebuilt to the wiki's description (see row 13).
- Structure Hunter pack now reaches the structure engine (the reseed/apply ordering bug) and is denser; village
  spacing 5 chunks; invisible-in-64-blocks structures excluded.
- Structure mob spawning with per-chunk de-duplication and a wait-and-deliver queue; structure block orientation
  (doors, beds, chests, stairs) registered with the managers, saved and restored.
- `/locate` ends with a total, and `countStructures` reports per-type counts.
- Tests: `tests/villageParity.test.js`, `tests/structureHunterWorld.test.js`; goldens regenerated.


---

## 11. Progress log

### Inspector upgrades done (Section 5)

- **Audit panel** with a flat/real-world switch (`src/structureAudit.js`, `src/structureAuditCards.js`, `src/structureInspectorAudit.js`): spec-card facts by layer, failures first, with the wiki text and what was found.
- **Real-world mode:** a real `World` with the game's terrain, 64-block height, mob requests, orientation and a save round trip.
- **Entities panel**, **world-height gauge**, and **Audit all structures** (universal facts U1-U9 for every structure; click a row to select it).
- **Textured view (default):** the structure is generated in a real `World` and drawn with the game's own `ChunkMesher` and block atlas, with real terrain, so doors, beds, chests and stairs show in their stored orientation (`src/structureInspectorWorld.js`, `src/structureInspectorWorldView.js`). Water is a flat translucent blue (no water shader), one fixed sun, mobs are coloured markers. The coloured-cube view is still there as "flat preview".
- **Walk-through:** "Walk through it" stands the player outside the structure facing it; WASD, mouse look, jump, sneak, sprint, F to fly, E or click to open/close the door being looked at (closed doors block, open ones do not). Physics in `src/structureWalker.js` (same speeds, gravity and jump as the game). Click a row in the block-entity table to jump next to a chest, door, bed or mob.
- **Seed gallery:** renders the structure at several seeds as thumbnails; click one to switch to that seed.
- **Loot panel** (chests the game created, with contents) and **block-entity panel** (chests, doors, beds, requested mobs with positions).
- **Evidence export:** downloads `<structure>-seed-<seed>.json` (blocks, loot, entities, audit result) and a `.png`; move both into `docs/structure-audit/evidence/<structure>/`.
- **Tracker validator:** `node scripts/validate-structure-tracker.mjs` and `tests/structureAuditTracker.test.js` reject GAME-VERIFIED/AUDITED rows without ok layers, a spec card, evidence, or a passing real-world audit.
- **`/teleport <x> <y> <z>` and `/teleport <structure>`** (alias `/tp`, cheats/Creative): `/teleport swamp_hut` generates and goes to the nearest one this world has, landing on dry ground outside it, facing it (`src/teleport.js`).
- Not done yet: `structureWikiData` generator; the textured view does not draw mob models or the water shader.

### Findings from the universal audit (flat mode)

- **U4 (does not fit the 64-block world):** `ancient_city`, `trial_chambers`, `ruined_portal_nether`.
- **U6 (oriented blocks without a facing: chests, stairs, doors):** `buried_treasure`, `jungle_pyramid`, `ruined_portal` (5 overworld variants), `end_city`, `mansion`, `bastion_remnant`, `trail_ruins`. Each needs its facing added to its parts.
- Villages: cats (V8) are done (one per four beds, max five, at the meeting point). The taiga village V10 (armor stands) is still open: the game has no armor stand entity.

### Swamp hut (first structure)

Done as described in the tracker row. Remaining to mark `AUDITED`: an in-game flight check (needs a visible window) and your sign-off on the waived vines. Inspector screenshot saved in `docs/structure-audit/evidence/swamp_hut/`.

### Review round 2 (user feedback)

- **Inspector opened on `buried_treasure` and hung:** the session default was the first registry entry, and in the
  textured view it took very long. The default is now `swamp_hut`.
- **Swamp hut looked smaller than the wiki's:** the card had been written from the page's prose only. The infobox lists
  Oak Fence and the pictures show windows, porch fence posts, fences on the wall tops, the pot on a window sill and an
  open front block; the hut had none of these. Rebuilt (4 oak fences, 3 windows, sill pot, open front, porch pillar),
  new facts `H10b`, `H10c` and the infobox fact `W1`, and the rule in 4.1 so no structure is audited from prose alone.
  This is still the clean-room plan inside the wiki's 7x7x9 box, not vanilla's exact block list.
- **Village street holes:** connector tiles where two street/plaza pieces join had no replacement block and became
  air, so stone showed through the path. Every connector now defaults to the village's path block; test
  `streets and plazas have no holes` fails without the fix.

### Villages: full wiki audit (round 3)

Spec: `Village`, `Village/Structure` and `Village/Loot`, fetched with `scripts/fetch-wiki-structure.mjs` into
`docs/structure-audit/wiki/`, and turned into `src/villageWikiData.js` by `scripts/generate-village-wiki-data.mjs`
(a test fails if the data file drifts from the saved pages).

What changed:
- **Per-type villages.** The old generator built the same generic houses for all five types and swapped materials
  (a test even asserted "the five villages differ in materials, not in their shape"). Now each type draws from its own
  catalogue: every structure the wiki lists for that type, by its template name, built from its one-line description
  (`src/worldgen/generators/villageCatalogue.js`, `villageBuild.js`, `villageStyles.js`). 18 meeting points, every
  lamp-post design, houses with the described bed counts and colours, job sites with their workstations, farms,
  pens, stables, temples, igloos, stilt houses and taiga decorations.
- **Block lists.** Every block a type writes is in that type's infobox list (the snowy stonecutter is allowed because
  its own building descriptions name it). Each type uses all but at most four of its listed blocks.
- **Abandoned villages (2%)**, chosen the vanilla way (abandoned meeting points in the town-centre pool at weight
  1 to 49): zombie villagers, no doors or torches, mossy cobblestone (plains/taiga), cobwebs, brown glass, no iron
  golem, no camel; cats and livestock stay.
- **Mobs.** Villager per bed, zombie villager per bed when abandoned, one iron golem, a desert camel, cats one per
  four beds, two sheep at shepherds, pen livestock, and **armor stands** -- a new frozen entity in `mobs.js` -- at
  the taiga armorer, wearing an iron helmet and an iron chestplate.
- **Chests** follow `Village/Loot` (which job buildings have one), with job loot table names.
- **Paths** are dirt path with grass (gravel too in taiga), smooth sandstone in the desert; a path over water
  becomes the type's planks.
- **Placement.** The type is checked against the biome at the meeting point (it was 9 blocks into the chunk), so a
  snowy village can no longer start in a grove. Biome lists, the shared set (spacing 34, separation 8) and the
  outposts' 10-chunk exclusion are tested in a real world.

Two **engine bugs** found on the way, affecting every jigsaw structure:
- `rotateBlockState` rotated only vertical jigsaw orientations (`up_north`), so a rotated street's side connectors
  kept pointing their original way and buildings joined to them were placed back over the street and rejected.
  Villages went from ~14 to ~37 pieces when this was fixed.
- `addPieces` always started with the pool's first element and no rotation, so every village had the same meeting
  point facing the same way, and a weighted variant (the abandoned village) could never be drawn.
  Goldens were regenerated for both.

Facts: card V1-V14 plus W1 (infobox subset) per type, all passing in flat and real-world mode on several seeds;
`tests/villageWiki.test.js` (20 tests) checks every building against its wiki description independently.

**Still open for villages:** layouts match the descriptions, not vanilla's templates block for block (clean room);
vanilla pool weights are not published, so ours are our own (with the wiki's "weaponsmith likelier in taiga" rule);
"slightly more buildings in abandoned villages" is not modelled; the textured Inspector review and an in-game walk are
pending; the armor stand cannot yet be picked up or have armor swapped.

### Villages: round 4 (the open items)

- **Layouts are now the wiki's blueprints, block for block.** `Village/Structure/Blueprints` has a layer-by-layer
  drawing of every village building (181 pages; `scripts/fetch-village-blueprints.mjs` saves them under
  `docs/structure-audit/wiki/Village_Blueprints/`). `scripts/generate-village-blueprints.mjs` turns them into
  `src/worldgen/generators/villageBlueprintData.js` (180 templates; the plains shepherd's house has no blueprint page
  and stays procedural). Rules the wiki does not state, derived from the drawings and tested in
  `tests/villageBlueprints.test.js`: `-rotN` turns a sprite N degrees clockwise from a per-block base (beds east --
  67 of 67 agree --, stairs north, chests and furnaces south, wall torches north); doors, ladders, trapdoors, banners
  and buttons take their facing from their neighbours; `+up+right` on a door is the lower half with a right hinge;
  the street connector is outside the lowest door (or a pen's gate, or each side of a meeting point). Spot check:
  plains_small_house_1 has exactly the blueprint's 43 cobblestone, 16 stripped logs, 34 planks, 50 stairs, 3 panes.
- **Two wiki sources now cross-check.** Every building's one-line description (Village/Structure) is checked against
  its blueprint: beds/villagers, workstations and named blocks all agree. Disagreements are pinned in tests: the
  infobox lists omit a few drawn blocks (desert dirt/sandstone stairs/smooth stone, plains ladder, savanna wheat, taiga
  smooth stone and spruce slab); Village/Loot says every weaponsmith has a chest but the blueprints of
  savanna_weaponsmith_1 and taiga_weaponsmith_2 have none (the blueprint is followed); water troughs are waterlogged
  blocks the drawings (and this world) cannot hold.
- **Crops.** The blueprints draw every field as wheat; fields now grow the type's crops (savanna gained wheat, which
  its blueprint shows). Vanilla varies crops with a processor the wiki does not document, so the mix is ours.
- **Abandoned villages have their own pools** (village/<type>/zombie/... from the wiki's file tree): an abandoned
  meeting point leads to abandoned streets that draw only from the type's zombie house list. With vanilla's empty
  pool element now honoured (drawing it leaves a plot empty -- the engine used to skip it, making it weightless), normal
  house pools leave 15% of plots empty and abandoned ones 4%, so abandoned villages average 0.6-4 more buildings
  ("slightly more"). The two shares are ours; the wiki gives no numbers.
- **Armour stands are usable** (`src/armorStand.js`): placed from the item on top of a block facing the player, armour
  put on / swapped / taken back by using it, broken by a hit dropping itself and its armour (nothing in Creative).
- **Pool weights stay ours.** The wiki does not publish them (its Template pool page documents only the format); the
  only source is the game's own data files, which this project's clean-room rule excludes. Decision needed from the
  owner if that rule should change for numeric data.

Engine fix (affects every jigsaw structure): an empty pool element ends the attempt, as in vanilla.

### Desert pyramid, igloo, pillager outpost (round 1 each)

Picked from Phase 1 because each has a full layered blueprint on its wiki "/Structure" page, so parity could be
block-for-block. `scripts/generate-structure-blueprints.mjs` converts them (sharing the village converter's tested
facing rules, now in `scripts/blueprintStates.mjs`; the parser handles several blueprints per page, one-line legends,
"Layer -1 to -18", "Layers 1-3" and variant layers "4a"/"4b"). Every structure passes its card (P1-P8, G1-G6, O1-O7,
plus W1 against the infobox) in flat and real-world mode, with sensitivity tests. Where a blueprint and its own page's
materials table disagree, the drawing is followed and the difference pinned in a test.

Engine/game changes: top slabs are remembered and rendered (they always rendered as bottom slabs); structure chests
now pass their loot table to the world for the igloo; the igloo rotates like vanilla.

### Housekeeping

Pre-existing test fixes made along the way: snow layer harvest row, fire shader cache key, and a flaky farming test (an unpinned random roll).

### All remaining structures (round 1 each)

Every structure left in the tracker now has a wiki card that passes in flat mode and in real worlds on several seeds
(`tests/structureWikiCards.test.js` sweeps all of them), unit tests, and evidence. What was built along the way:

* **Blueprint pipeline.** `scripts/generate-all-structure-blueprints.mjs` converts every `{{layered blueprint}}` on the
  wiki's /Structure pages and subpages (plus Ancient City and Woodland Mansion /Structure/Blueprints) into
  `src/worldgen/generators/blueprints/*.js`. Parser fixes found by the counts: en-dash layer ranges ("Layer 1–2"),
  `{{Layered blueprint}}` with a capital L, legend lines without a leading pipe, door tops, drawing names that are not
  block ids. `blueprintStructure.js` (single drawings), `cellStructure.js` (procedural piece structures) and
  `drawnPieces.js` (drawings joined at doorways found in the drawings) carry them into the game.
* **Real chest loot everywhere.** `structureLoot.js` rolls the wiki's own chest tables (Module:LootChest: 66 tables incl.
  villages, archaeology, trial chambers); only items newer than the game are skipped.
* **Game systems the structures needed:** monster spawners (`monsterSpawner.js`), trial spawners and vaults
  (`trialSpawner.js`), chest minecarts in mineshafts, piglin weapons, the End's spikes/podium/gateways/platform
  wired to the dragon fight and the portal arrival, the Bonus Chest create-world option, Nether and End structure
  generation (per-dimension engines; those chunk generators now run the structure pass).
* **Engine fixes:** `/locate` only looked at the corners of each search shell; every structure set now plans on its own
  in a chunk (features never block structures); structures are searched 8 chunks round each chunk; the Y bands of
  underground structures are mapped onto this 64-tall world (P0.4, documented per structure).
* **Tracker validation** understands rows that cover several ids (`ROW_CARDS` in `structureAuditTracker.js`).

What is ours rather than the wiki's is listed in each generator's header and in each tracker row's **Open** note.

