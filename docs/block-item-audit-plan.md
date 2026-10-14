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
