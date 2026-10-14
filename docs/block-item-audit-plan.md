# Block and item parity audit plan

Inventory date: **2026-10-13**. This is a work plan, not a claim of completed parity.

The current runtime tables contain **1,219 block definitions and 1,302 item definitions: 2,521 audit rows**, assigned to **148 batches of at most 20 rows**. There are also **8 declared original mod items** in a separate appendix. Every runtime block ID and item key is listed explicitly; linked item and placed-block forms retain separate responsibilities. Internal states, crop stages, colors, and open/lit variants are included.

## Documents to use

| Artifact | Purpose |
| --- | --- |
| [Complete inventory and batch checklists](block-item-audit/catalog.md) | Every ID/name, Minecraft Wiki target, paired forms, current variant metadata, family audit requirements and required showcase. |
| [Batch queue](block-item-audit/batches.md) | All 148 batches in recommended order, with links to their exact member lists. |
| [Audit manifest](block-item-audit/manifest.json) | Editable progress source: stable row keys, five gates, evidence, notes, source-review status, full current definitions and bootstrap state properties. |
| [CSV tracker](block-item-audit/tracker.csv) | Export for filtering/review. Do not edit this instead of the manifest; regeneration exports manifest progress. |
| [Inventory generator](../scripts/generate-resource-audit-plan.mjs) | Rebuilds the inventory from the actual code and validates exhaustive membership, unique IDs, linked forms, Wiki targets and batch sizes. |

Regenerate with `node scripts/generate-resource-audit-plan.mjs`. Row keys (`B:31`, `I:allium`, etc.) are stable identifiers; batch numbers describe this snapshot and may shift when definitions are added. Regeneration preserves progress for unchanged definitions and reopens changed definitions. Shared renderer/behavior changes also require manually reopening affected rows, even when their metadata is unchanged. Deleted definitions must be reviewed before removing their old evidence.

## Scope and source policy

1. **Use Java Edition as the default behavior target.** Record the exact edition, release and Wiki revision for each batch before implementing it. Bedrock-only behavior or a release-specific difference needs an explicit decision in the manifest. Do not silently combine incompatible versions.
2. The local `.cache/mc-data` snapshot is pinned to `pc/1.21.4`. It supplies bootstrap names, recipes and state properties, **not the full specification or proof that later content is invalid**. Rows absent from it are flagged `later-version-or-custom-review-required`.
3. Each catalog row links to a Minecraft Wiki article or the relevant family article. Before auditing, resolve redirects, confirm the target covers that exact variant, record revision/date, and extract the applicable sections: obtaining, usage, behavior, block states, data components, drops and edition differences. Repair inaccurate targets before accepting a row.
4. Direct Wiki page reads were blocked by `robots.txt` while preparing this plan. **Targets are provided; all source-review gates remain pending.** Existing local snapshots and search extracts can help discovery, but incomplete extracts cannot certify a behavior. If source access is unavailable, mark the gate `BLOCKED_SOURCE`; continue independent rendering tests without declaring Wiki parity.
5. Capture expected values from sources before reading the implementation's values. Save timing, damage, nutrition, stack limit, durability, light level, geometry/state and loot expectations in per-family fixtures with the source URL and revision. The catalog's metadata describes the code today and is never an oracle for its correctness.
6. Original mod items have no corresponding vanilla Wiki page. Their appendix links to the mod manifest/specification. Apply the same appearance/lifecycle tests, then test the mod's documented mechanics. Do not invent a Wiki counterpart or report intentionally custom mechanics as vanilla defects.
7. Missing vanilla content is a separate discovery backlog: use `node scripts/inspect-resource.mjs missing`. This inventory audits everything already defined, including incomplete definitions, without claiming the repo implements every Minecraft resource.

Useful source entry points: [Block](https://minecraft.wiki/w/Block), [Item](https://minecraft.wiki/w/Item), [Block states](https://minecraft.wiki/w/Block_states), [Data component format](https://minecraft.wiki/w/Data_component_format), [Flower](https://minecraft.wiki/w/Flower), [Furnace](https://minecraft.wiki/w/Furnace). Follow the resource-specific target in the catalog rather than relying only on these overview articles.

## What “complete coverage” means

Every registered definition and every applicable observable rule gets at least one assertion and a reproducible Inspector scenario. Coverage is measured against a **source-derived claim/state inventory**, not simply a source-code coverage percentage. Parameterized tests can share mechanics across variants, but must enumerate every listed variant. Unique exceptions require their own tests.

Each row has five gates: **source, visuals, behavior, tests, showcase**. A row is `VERIFIED` only when all applicable gates pass and required evidence is attached. An internal state may have no legitimate held/item form; mark that view `NOT_APPLICABLE` with a sourced reason, rather than inventing an item, failing intentional invisibility, or omitting the placed-state tests.

| Gate / case IDs | Required audits |
| --- | --- |
| S01–S03: source | Confirm article/edition/revision, enumerate all state properties/components, document unique rules and exceptions; attach source claims and expected values. |
| V01: inventory | Correct icon, silhouette, scale, palette, alpha, tooltip/name, count and durability/metadata overlays; no missing/fallback asset. |
| V02: held form | Use the actual `HeldItemRenderer`: correct model and scale, front/back/side visibility, transparent background, idle/swing/use poses, slot switches and material cleanup. A placeable resource is not automatically a cube. |
| V03: dropped form | Use `ItemVisuals` and the real dropped-entity path: recognizable shape/material, alpha, scale, bob/rotation, stacked quantities, pickup visibility and cleanup. |
| V04: placed/equipped form | Correct full/partial/cutout/entity geometry, UVs on every face, facing/attachment, hitbox/raycast and collision. Use actual chunk meshing or the real entity/equipment renderer. |
| V05–V07: states and rendering | Every color/material/age/lit/open/wet/powered/connected state; neighboring solids, glass, water, carpet, slabs and chunk seams; daylight/night, shader on/off, light/shadow and static-terrain animation checks. State-specific particles/audio are observable outputs. |
| B01: obtaining | Correct survival/creative/operator availability and sources: mining, loot, crafting, smelting, trade/barter, growth, fishing or interactions. A creative-menu entry alone is not a survival source. |
| B02: placing/equipping | Valid and invalid targets/support, orientation, attachment, waterlogging/contents and slot rules; correct stack decrement and failed-action rollback. |
| B03: physical rules | Collision, selection, support, neighboring-face occlusion, gravity, fluids, entity interaction, hazards and light/spawn effects where relevant. |
| B04–B05: using and transforming | Every documented action and state transition, inputs/outputs, costs, cooldown/timing, charges, repair/enchantment/dye/trim, nutrition/effects or damage. Test wrong input/target, cancellation, full output and repetition. |
| B06: harvesting/destruction | Correct tool/tier, break time, drops/counts, XP, Fortune/Silk Touch/shears, stored contents, explosion/fire/liquid behavior and survival versus creative semantics. |
| B07: automation/environment | Applicable redstone/comparator/observer/hopper/dispenser behavior; neighbor updates, light/weather/biome/dimension, growth/random ticks and entity effects. |
| B08–B09: lifecycle/data | Drop→pickup, inventory moves, pause/restart, unload/reload and save/load retain data; no duplication/loss, leftover lights/particles or repeated action on a dead/removed object. Test authoritative multiplayer behavior where the feature is shared. |
| T01–T04: tests | Source-backed unit/state tests, integration through real managers/renderers, deterministic browser/GPU visual tests, and regression tests for the observed defect. Each claim has a case ID and evidence. |
| H01–H03: showcase | The Inspector runs those same behavioral cases visibly with live state, truthful assertions, supported/unsupported distinction, stop/reset/repeat and a saved report. An orbiting model or sequence of registry checks is insufficient. |

Track dimensions separately for a row: registered variants, legal state combinations, visual contexts, operations, positive/negative cases, boundary cases and persistence. Exhaust simple state combinations. For large combinations, record the tested interaction matrix and justify pairwise coverage; enumerate exceptions separately. Use deterministic seeds plus appropriate distribution checks for random behavior. Do not imply that finite tests prove every possible world state.

## Inspector work required before broad audits

The current Resource Inspector has generic registry checks, six model views, and a real furnace showcase. Most other resources do **not** have a specialized behavior simulation. Existing check results and candidate test filenames in the catalog are starting points, not coverage certificates.

1. Add **Inventory / Held / Dropped / Placed or Equipped** view selection. Held mode must render the real overlay scene; dropped mode must use the actual drop model/physics/pickup path. Do not build a separate “perfect” model solely for the Inspector.
2. Introduce a shared visual resolution policy for cube, thin model, cutout plant, sprite, fluid/container, wearable and entity items. Validate every entry's selected policy. Resolve string item keys and numeric block IDs to the same intended resource, without erasing their different visual contexts.
3. Extend the deterministic scenario runner with family adapters that call production managers and input/action handlers. Reuse each scenario in Node/integration tests and the Inspector. Test user action dispatch as well as direct manager calls.
4. Add scenario selection, **Run all / Run selected / Stop / Reset**, speed/pause, current step, live telemetry and assertions. Inspect the newly created object/action result, not only the original resource preview.
5. Support tiny explicit scenes: support/substrate tiles, neighboring partial/full blocks, inventory slots, a test player/target/entity, contained fluid, light/weather/dimension, power source and chunk boundary. Avoid generating or searching a full map.
6. Emit `PASS`, `FAIL`, `UNSUPPORTED`, `ERROR` or `NOT_APPLICABLE` per case. A view requiring manual inspection remains `VISUAL_REVIEW_PENDING` until reviewed. Existing `observed`/`not observed` statuses can map to pass/fail, but `unsupported` never counts as passed.
7. Save JSON results with row key, source revision, exact code revision/workspace fingerprint, state/input, expected/actual values, and screenshot/clip paths. Separate an automated numeric assertion from a reviewed screenshot.
8. On stop, reset, selection change and repeat, release transient meshes/materials/textures, lights, particles, event handlers, entities and timers. Assert no stale inventory or previous scenario state contaminates the next case.

## First batch: reproduce and fix held flowers

Start with **A001**, using `B:31` Dandelion and `B:30` Poppy as the initial regression pair before extending to every member of the flower batches.

Current code evidence: [heldItem.js](../src/heldItem.js) sends block-like items to `createBlockGeometry` and an opaque material without a plant-specific visual policy. [blockGeometry.js](../src/blockGeometry.js) falls back to cube geometry for ordinary plant definitions. [itemVisuals.js](../src/itemVisuals.js) already distinguishes plants for dropped visuals. The supplied screenshot is a known visual failure; this plan does **not** fix that code yet.

| Case | Required result / evidence |
| --- | --- |
| FLOWER-HAND-01 | Equip a numeric flower-block stack in the actual held renderer. Silhouette/background-alpha assertion and screenshot must reject a cube or black backing. |
| FLOWER-HAND-02 | Equip each available string item form pointing to a flower block. Confirm it resolves to the same species and appropriate held form; compare with its numeric placed form. |
| FLOWER-HAND-03 | Inspect over bright/dark scenes from several angles; swing/use, change slots quickly and clear the hand. No disappearing back face, clipping or stale geometry. |
| FLOWER-LIFECYCLE-01 | Inventory→held→placed→broken→dropped→picked-up cycle retains species/count and uses the appropriate model in each context. |
| FLOWER-PLACE-01 | Source-derived support/substrate conditions, valid/invalid placement and support loss. Invalid action must not consume or duplicate the flower. |
| FLOWER-USE-01 | Execute each applicable sourced recipe/pot/compost/pollination interaction with correct costs/returns; test wrong targets. |
| FLOWER-VARIANT-01 | Enumerate catalog species, tall halves, special hazardous/open/closed/later-version flowers and source-specific exceptions. Never assume the Dandelion fix covers all. |
| FLOWER-SAVE-01 | Save/reload held stack, placed flower, pot content and dropped resource as applicable; repeat the showcase with a clean scene. |

A001 may be split into a small prototype fix plus a species sweep, but every member row stays pending until its own gates pass. Later-version entries such as Golden Dandelion need source/version review before applying ordinary flower behavior.

## Execution order and dependencies

The [queue](block-item-audit/batches.md) lists exact members; the [catalog](block-item-audit/catalog.md) supplies the family requirements for every batch. Resolve shared visual infrastructure in A001, then progress by family rather than attempting all 2,521 rows at once.

| Wave | Families and reason |
| --- | --- |
| 1: visible shape failures | Flowers, pots, crops, aquatic plants, saplings, leaves, fungi and other vegetation. Establish alpha, plant/item identity and complete held/drop/placed views. |
| 2: active world mechanics | Fluids/buckets, fire, lights, pistons, circuits and furnaces. Establish tick-based transitions, support/occlusion, light, particles and inventory costs. Furnace is a reusable starting fixture, not a completed parity sign-off. |
| 3: placed structures/UI | Containers, workstations, doors, fences, slabs/stairs/panes, textiles/beds, signs/banners and decoration. Prioritize partial geometry, orientations/connections and stored state. |
| 4: player actions | Transport, portals, explosives/projectiles, weapons, tools, armor, potions, food and spawn eggs. Reuse a production test player and target; test full input→result→cost path. |
| 5: metadata and source chains | Templates/trims, books/maps/compasses, music, dyes, ores, logs/wood, glass, snow, gravity blocks and copper. Add cross-family rules such as oxidation of copper stairs/doors and edible candle cakes. |
| 6: exceptions and closure | Technical/operator resources, remaining terrain/building blocks, ingredients/special items, mod-specific content and missing-vanilla discovery backlog. Every apparently inert resource still needs an article-specific usage review. |

Some mechanisms need prerequisites in later families: a hopper for furnace automation, for example. Build a minimal sourced dependency fixture without declaring the dependency fully audited, then return to its own batch. Share behavior tests across tiers/colors/wood types, but retain an explicit per-variant visual and lifecycle sweep. A row marked `ALSO copper` or `ALSO food` must pass the additional cross-family checklist in its batch.

Choose the size by mechanism complexity: one complex workstation or vehicle may occupy a whole session; 16 recolored variants may fit after their shared mechanic is certified. The 20-row maximum is a queue limit, not a promise that every batch takes the same time. Split further instead of leaving a partially checked batch labeled done.

## Repeatable procedure for each batch

1. Name batch and exact row keys; read its catalog checklist and any paired/supplemental forms. Capture current code revision and existing evidence. Set owner/status to `IN_PROGRESS`.
2. Verify Wiki target and pin source revision/edition/version. Extract a claim list with expected values, states, variants and exceptions. Record discrepancies with the bootstrap dataset; do not normalize them away.
3. Inspect production paths and existing tests. Build a coverage matrix from claims to case IDs and visual contexts. Mark actual missing cases, unsupported mechanics and known defects explicitly.
4. Reproduce defects in the lightweight Inspector and a failing regression test through the production path. Save the before image/state. Prefer a representative fixture that exposes the bug, such as a flower over a contrasting held-view background or a furnace beside carpet.
5. Implement the smallest shared fix plus resource-specific exceptions. Maintain numeric IDs, saved-data compatibility and mod namespaces. Where new mechanics are necessary, implement the real manager/action integration, not a showcase-only imitation.
6. Run the shared scenarios as automated tests and visibly in Inspector. Include invalid input/support, thresholds, cancel/repeat, full output, break/unload and reload. Record expected/actual outcomes.
7. Verify every row/color/tier/state form in the batch; inspect paired forms in other batches where needed. Run focused neighboring-family regressions, shader on/off visual checks and meaningful performance checks for any renderer/tick change.
8. Attach reviewed screenshots/results and case IDs in `manifest.json`; update the five gates. Use `BLOCKED_SOURCE`, `UNSUPPORTED_ENGINE`, `FAIL` or `PARTIAL` honestly if work remains. An unsupported case needs an implementation task or an approved documented exclusion.
9. Mark `VERIFIED` only after all applicable claims pass and visual evidence is reviewed. Regenerate the catalog/CSV, report remaining gaps and pick the next batch. Avoid reopening passed unrelated tests unless the change affects them.

Suggested case naming: `FLOWER-HAND-01`, `DOOR-HINGE-02`, `COPPER-OXIDATION-03`, etc. Keep a fixture per family with explicit per-row variant data. The same scenario IDs must appear in the tests, Inspector results and manifest evidence.

## Required deliverables and completion gate

For every completed batch provide: sourced claim/state matrix, production fix if needed, regression/behavior/visual tests, runnable Inspector scenarios, before/after evidence, and updated manifest gates. Include a short reviewer note with what was wrong, what changed, exact commands/results, and unresolved limitations. Do not substitute a list of test filenames for inspected coverage.

At project closure verify all core row keys are still represented, every new/deleted definition was reviewed, linked forms and state variants are covered, every required case has an assertion and showcase, and no `UNSUPPORTED`/`ERROR`/pending visual review is counted as success. Report excluded/not-applicable cases separately with source-backed reasons. Original mod parity remains a separate result.

Existing entry points to retain: `node scripts/inspect-resource.mjs check <id> --json`, `node scripts/test.mjs resources`, [Item Inspector](http://localhost:3000/item-debug.html), [Block Inspector](http://localhost:3000/block-debug.html), and the current furnace browser fixture `node scripts/preview-resource-showcase.mjs`. These are helpers; generic checks alone do not certify the planned behavioral coverage.

## Next action

Audit **A001** and implement `FLOWER-HAND-01` first, then build its held/drop/placed Inspector views and flower lifecycle showcase. The remaining batches are queued, not automatically started by this planning request.

## Progress log — wiki parity audit, round 1 (2026-10-14)

Built the item/block equivalent of the structure audit: wiki-sourced facts, one case per fact, production code paths
on the game side, a zero-failure sweep in the tests, and the same cases in the Resource Inspector.

**Source** (`scripts/fetch-resource-wiki.mjs` → `docs/block-item-audit/wiki/`, `scripts/generate-resource-wiki-data.mjs`
→ `src/resourceWikiData.js`, revisions pinned): Module:Hardness values, Module:Blast resistance values,
Module:Default data component/items, and each page's infobox (light, tool, tool2/3), `{{breaking row}}` (proper tool,
minimum grade, drop=0) and Breaking prose (Silk Touch sentence). Where a breaking row contradicts its own page, the
prose wins (`WIKI_CORRECTIONS`, quoted).

**Cases** (`src/resourceWikiAudit.js`): B-HARDNESS, B-BLAST, B-LIGHT, B-TOOL, B-BREAK-TIME, B-SELF-DROP, B-SILK,
I-ITEM, I-STACK, I-DURABILITY, I-FOOD, I-ATTACK, I-ARMOR, I-ENCHANTABILITY, I-FIREPROOF. 15,472 cases:
12,059 PASS, 0 FAIL, 0 KNOWN, 3,131 not applicable, 282 no wiki data. `node scripts/wiki-audit.mjs`.

**Fixed** (each was a FAIL first):
- Drops: shears and Silk Touch did nothing. New `harvestDrops` (blockDrops.js) used by the break path: leaves, glass,
  panes, ice, sculk, corals, vines, glow lichen, seagrass, etc. no longer drop themselves without shears/Silk Touch;
  Silk Touch collects ores, stone, glass, etc.; infested → plain block; tall grass/large fern → 2 with shears.
  Counts: ender chest 8 obsidian, copper ore 2–5, lapis 4–9, nether gold 2–6, glowstone 2–4, mushroom blocks 0–2,
  chorus plant 0–1, creaking heart 1–3 resin, soul campfire → soul soil, pumpkin stem → seeds.
- Mining: a proper tool sped a block up only if the block *required* it (axes did nothing on wood, shovels on dirt);
  break time now counted in whole ticks; shears/sword per-block speeds; shears collect cobweb.
- Blocks: light (ender chest 7, conduit 15, sculk sensor 1, dragon egg 1); open copper doors/trapdoors blast
  resistance; bubble column 100; crafter tool pickaxe; pressure plate hardness 0.5.
- Items: potion stack sizes; mace/wolf armour/golden spear durability; pickaxe/shovel/mace attack; bow/crossbow melee
  = fist; fist damage 2 → 1; netherite knockback resistance 0.1; diamond horse armour toughness 2 (used in damage);
  mace enchantability 15; ancient debris and netherite block fireproof; ominous bottle drunk for Bad Omen
  (100 min), not eaten; wolf armour wearable (absorbs all damage until its 64 durability runs out; shears remove,
  scute repairs).

**Inspector**: block-debug/item-debug have a "Wiki parity" panel (cases for the selected resource with wiki links,
Run full wiki audit, Export JSON). Run showcase steps through every wiki case, then breaks the block by hand, with
its proper tool, with shears and with Silk Touch in the inspection world and checks the drops against the wiki.

**Tests**: `tests/resourceWikiAudit.test.js` (sweep, sensitivity — a broken fact must FAIL —, each fix, Inspector).

**Open / not done**: 200 vanilla items are absent, all newer than the 1.21.4 target (copper tools, spears, harnesses,
shelves, poplar/sulfur/cinnabar, spring-drop plants…). Not yet audited: crafting recipes vs wiki, visuals (the
batches' V gates), smelting/fuel, per-state block properties. Fortune is not modelled.

## Progress log — round 2: recipes, smelting, fuel, Fortune, visuals (2026-10-14)

**Missing content**: `docs/missing-content.md` (`node scripts/generate-missing-content-doc.mjs`) lists every vanilla
block (189) and item (84) this game's own content lacks, with wiki pages, from the wiki's *Java Edition data values*
pages. All are post-1.21.4. `src/futureContent.js` (written by another process during this round, not by this audit)
has since registered them; the doc's Note column names the parity cases each still fails.

**New audits** (sources generated by `scripts/generate-wiki-recipes.mjs` → `src/resourceWikiRecipes.js`; aliases from
Module:Inventory slot/Aliases evaluated by `scripts/wiki-lua-to-json.mjs`):
- C-CRAFT — every {{Crafting}} frame laid in a grid and asked of `findMatchingRecipe`. 1,416 pass.
- S-SMELT — every {{Smelting}} row asked of `getSmeltingRecipe` / `getSmeltingXp`. 148 pass.
- F-FUEL — Template:Smelting table asked of `getFuelBurnTime`. 351 pass.
- F-FORTUNE — the Fortune page's average-drop tables sampled through `harvestDrops`. 17 pass.
- V-SHAPE / V-TEXTURE / V-ICON / V-HELD / V-DROPPED (`src/resourceVisualAudit.js`) — light-transparent blocks drawn with
  their own shape, textures and icons present, crossed plants held and dropped as flat sprites.
All are in `node scripts/wiki-audit.mjs`, the Inspector's Wiki parity panel and showcase, and
`tests/resourceRecipeAudit.test.js`.

**Fixed**: 80+ recipes adopted from the wiki (`src/wikiRecipeFixes.js`: planks from wood/stripped logs, tipped arrows,
resin, saddle, name tag, lead, lodestone, copper trapdoor, TNT any sand mix, soul torch/campfire, eyeblossom dyes…) and
four wrong ones removed (TNT from coal, snow blocks → snow blocks, old lead/lodestone/copper trapdoor); re-dyeing wool,
carpets and beds; 99 smelting rows, 30 XP values and 427 fuel values (`src/wikiFurnaceFixes.js`); blast furnace and
smoker work (2× speed, fuel 2× faster, own recipe sets); campfire cooking (4 slots, 30 s); Fortune (ores, discrete,
flint/leaves/grass tables, nether wart, crops' binomial); crop drops (carrots/potatoes/beetroot seeds) corrected;
box models for ~35 non-cube blocks (`src/blockModelShapes.js`, `src/blockModels.js`); six plants generated as solid
stone cubes made crossed, walk-through plants; Java 1.21's four potions (Oozing, Weaving, Wind Charging, Infestation)
and tipped arrows for every effect, with generated icons (`scripts/generate-tinted-icons.mjs`).

**Open**: the failures the audits report on `src/futureContent.js` (wrong stack sizes, missing recipes, unequipped
copper/spear/nautilus gear) belong to that in-progress work. Bedrock-only recipes are out of scope (Java only).

### Round 2b (2026-10-14): the four left open, done
- Arrow of Splashing (lingering water bottle + 8 arrows; flies as a plain arrow) and the plain Tipped Arrow from
  awkward/thick/mundane lingering potions; the bow takes both.
- Ladders and vines hang on the clicked wall (`src/wallAttached.js`; state in `world.structureOrientations`, saved with
  the world), only on full blocks, never on a floor; structures' ladder `facing` and vine faces are read; a ladder drops
  when its wall goes, a vine loses that face. The model turns to its wall.
- Chorus plants grow arms to neighbouring chorus plants/flowers and down to end stone (mesh-time neighbours).
- Food on a campfire is drawn lying on it, one per slot (`showCampfireFood` in main.js).
- Found while checking in the game: every held non-block item rendered as a missing-texture cube (a null/undefined
  check in heldItem.js). Fixed; V-HELD / V-DROPPED now cover all 827 items. Tests: `tests/javaFinishers.test.js`.

## Progress log — round 3: game systems (2026-10-14)

Trading, brewing, enchanting, effects, smithing, Java commands and redstone, each against its wiki pages (Java
Edition, target 1.21.4). Pages saved by `scripts/fetch-system-wiki.mjs` (and the rendered pages the generator fetches
on first run) under `docs/block-item-audit/wiki/systems/`; `scripts/generate-systems-wiki-data.mjs` turns them into
`src/systemsWikiData.js` (283 trades, 22 potion rows, 41 enchantments + 105 table offers, 41 effects, smithing, 94
commands, 18 redstone facts each with the sentence it was read from). `src/systemsWikiAudit.js` asks the game:

| Cases | What is checked | Result |
|---|---|---|
| T-TRADE | every villager (13 professions × 5 levels) and wandering-trader offer: items, counts, stock, XP, price multiplier | 283 pass |
| B-BREW / B-DURATION / B-FORM / B-STAND | every recipe, duration, extended/enhanced form, splash/lingering, 20 s brew, 20 fuel | 114 pass |
| E-MAX / E-CONFLICT / E-ANVIL / E-WEIGHT / E-COST / E-ITEMS | max levels, conflicts, primary vs secondary items, weights, cost ranges, what the table offers each item | 205 pass |
| X-EFFECT / X-NAME / X-TYPE / X-POTENCY | every Java effect, its name, type and whether its level matters | 152 pass |
| M-UPGRADE / M-TEMPLATE / M-MATERIAL / M-TRIM | netherite upgrades, 18 trim templates, 11 materials, the trimming examples | 53 pass |
| K-COMMAND / K-LEVEL | every Java command exists and is a cheat exactly when Java's OP level is 2+ | 74 pass, 31 known |
| R-* | circuits built and ticked: dust reach, repeater/comparator/torch/observer timings, burn-out, piston limit, buttons, plates, dropper, hopper, note block, target, lightning rod, comparator container reading | 36 pass |

Not applicable (36): Bedrock-only, multiplayer-server commands, and content newer than 1.21.4 (spears/Lunge,
nautilus and netherite horse armour, copper armour, Breath of the Nautilus, /dialog, /version, /test…).

**Fixed / added**
- Trading: the Journeyman farmer buys 4 *melons* (blocks), not slices; the mason's "any colour stained terracotta"
  pins White Terracotta rather than plain terracotta.
- Brewing: Turtle Master is brewed from a **Turtle Shell**, not a scute; a water bottle turns mundane with eleven more
  effect ingredients (sugar, rabbit's foot, glistering melon, spider eye, magma cream, blaze powder, ghast tear,
  breeze rod, stone, cobweb, slime block).
- Enchanting: Breach, Density and Wind Burst exist (the mace had none); primary vs secondary items — the table no
  longer offers Thorns on helmets/leggings/boots, sword enchantments on axes, bow enchantments on crossbows, or
  anything on shears/shields/elytra/brushes/sticks, while the anvil (`anvilAccepts`) still takes them; eight cost
  ranges corrected (Fire Protection, Piercing, Impaling, Channeling, Loyalty, Riptide, Luck of the Sea, Lure).
- The mace's smash attack (`src/maceSmash.js`, wired in `main.js` / `mobs.damageMob`): fall ≥ 1.5 blocks, 4/2/1 damage
  per block steps, fall reset, 2.5-block knockback, Density, Breach (armour effectiveness −15%/level), Wind Burst launch.
- Commands (`src/vanillaCommands.js`): /kill, /effect, /enchant, /experience (/xp), /difficulty, /defaultgamemode,
  /gamerule (1.21.4 rules; the game already reads keepInventory, doDaylightCycle, doWeatherCycle, doFireTick,
  doImmediateRespawn…), /fill, /clone, /say, /me, /msg (/tell, /w), /list, /tellraw, /title, /seed, /setworldspawn,
  /spawnpoint (respawn honours it), /random, /damage, /ride, /rotate, /spreadplayers. /time now takes Java's markers
  (day = 1000, noon, night = 13000, midnight), times with t/s/d, add and query; /weather's duration is in ticks (or
  s/d); /clear is Java's inventory clear (the chat window is /clearchat).
- Redstone: all 13 wooden/blackstone buttons and 16 pressure plates are components (`src/redstoneComponents.js`):
  stone buttons 20 game ticks, wooden 30; wooden plates any entity, stone players/mobs, light weighted = count,
  heavy = count/10 rounded up; release after 20 (10 weighted) game ticks. Torch burn-out (more than 8 turn-offs in
  60 game ticks). Droppers/dispensers fire 4 game ticks after being powered. Lightning rod holds 8 game ticks, target
  8 (20 for arrows/tridents). Comparators read containers by each item's own stack size.

**Known (not run, no backing system)**: /advancement, /attribute, /bossbar, /data, /datapack, /debug, /execute,
/fillbiome, /forceload, /function, /item, /jfr, /kick, /loot, /particle, /place, /playsound, /stopsound, /recipe,
/reload, /return, /schedule, /scoreboard, /spectate, /tag, /team, /teammsg, /tm, /tick, /trigger, /worldborder.
Also not modelled: Adventure and Spectator game modes (/gamemode takes survival and creative).

Where to see it: `node scripts/wiki-audit.mjs` (e.g. `R-PLATE --all`), the Resource Inspector's "Run full wiki audit"
and per-resource Wiki parity panel (a potion shows its brewing, a netherite item its upgrade, a button or plate its
redstone probes) and showcase. Tests: `tests/systemsWikiAudit.test.js` (sweep, sensitivity, mace, commands,
components), plus updated `tests/{enchantmentParity,toolFacts,brewingParity,itemDefinitions,tradingParity,commandParity,
cheatsToggle,weatherParity,advanced_redstone,redstone,redstoneGames}.test.js`.

## Progress log — round 4: everything left open, and the other agent's content (2026-10-14)

**Whole audit**: `node scripts/wiki-audit.mjs` — 0 FAIL, 0 KNOWN (block/item, recipes, visuals, systems).

**The post-1.21.4 content `src/futureContent.js` registers** (written by another process from name guesses):
`src/futureContentWiki.js` replaces the guesses with the wiki data when `blocks.js` loads — stack size, durability,
attack, armour and slot, enchantability (Module:Default data component/items), copper's tier (Tiers: level 1,
efficiency 5); hardness, blast resistance, light; harvest rows and drop rules from each block's {{breaking row}}
(`blockHarvestData.js`, `blockDrops.js`); shapes (copper bars/chains/lanterns as their iron/vanilla twins, pots;
shelf and golem-statue box models traced from the renders); sounds in the game's vocabulary; plants transparent;
the Poplar Door's open/top states and the Poplar Trapdoor as a trapdoor. The wiki data was refetched to cover the
new blocks (`fetch-resource-wiki.mjs`). Every wiki {{Crafting}} frame naming one of them is adopted
(`wikiRecipeFixes.js`), so poplar planks make chests, a blue egg makes cake. Poplar leaves drop saplings 5% and sticks
2% (Leaves). Block 139 "Sulfur Block" (no such wiki block) drops the wiki's Sulfur. The default structure set
follows `WORLD_STRUCTURE_IDS` (the agent's Nether additions); Dungeon Rush gains fortress and bastion.

**Also found and fixed**: the furnace never awarded experience — now banked per item and paid when taken
(`furnaceExperience.js`, Smelting page), with per-recipe XP; golden tools' mining level is wood's (Tiers) — the
ladder had gold above iron; the Inspector lists were cut at 400 entries and the Block Inspector omitted placeable
blocks; music discs Tears (ghast killed by a deflected fireball) and Lava Chicken (baby zombie chicken jockey) now
drop, with baby zombies (5%) and chicken jockeys (`chickenJockey.js`); creepers drop discs to bogged, parched and
wither skeletons too.

**Game modes**: Adventure and Spectator (`gameModeRules.js`): Adventure mines and places nothing, still uses,
attacks and trades; Spectator flies through blocks, takes no damage but the void's and /kill's, is unnoticed by mobs,
spawning and despawning, picks nothing up, and can /spectate.

**The 31 commands** (`advancedCommands.js`, state in `commandState.js`, selectors in `targetSelectors.js`, SNBT in
`snbt.js`): /scoreboard (sidebar HUD), /trigger, /tag, /team, /teammsg (/tm), /execute (as, at, positioned, align,
in, on, summon, if/unless block|entity|score|data|biome|loaded|dimension|function, store result|success), /function,
/schedule, /return, /reload, /datapack (data-pack .mcfunction files and function tags), /data (entity, block,
storage), /attribute (applied to speed, jump, gravity, max health, attack), /bossbar (HUD), /worldborder (damage past
the buffer), /tick (world simulation rate, freeze, step, sprint), /forceload (kept by the chunk streamer), /fillbiome,
/item (slots; item modifiers from packs), /loot (structure tables, kill, mine), /place (tree features, structures and
jigsaw pools through the structure engine with its biome check), /particle (the 123 Java particle ids), /playsound,
/stopsound, /recipe (doLimitedCrafting honoured), /advancement (the 126 advancements), /spectate, /kick, /debug, /jfr.
/summon takes Java's [pos]. Tests: `tests/round4Parity.test.js`.
