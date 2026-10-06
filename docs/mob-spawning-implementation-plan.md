# Mob spawning repair plan

Target: **Minecraft Java Edition 1.21.4**, matching this repository's existing data generator and
specification. This is an implementation handoff, not a claim that the existing code has parity.

Reference documents: [mob-spawning-spec-1.21.4.md](mob-spawning-spec-1.21.4.md) (the extracted
behavioural specification), [research/mob-spawning-1.21.4.md](research/mob-spawning-1.21.4.md) (the
working notes with a URL per numeric claim), and [MOB_SPAWNING_PARITY.md](MOB_SPAWNING_PARITY.md)
(the status table). **Those documents are hypotheses to verify.** Some of their comments and tests
contradict the implementation, or describe rules from other versions.

## 0. Status of this plan

**Work package 0 and the confirmed defects in WP1–WP3 are DONE and merged.** Every claim in section 3
below was checked against the code before being acted on; the ones marked "confirmed" were reproduced
as failing tests first, and each repair has a positive control.

### What was done

| Item | Result |
| --- | --- |
| WP0 deterministic voxel fixture | `tests/helpers/spawnFixture.js` — hand-authored worlds, loaded-chunk tracking, a recording mob manager |
| WP0 failing regression tests | `tests/spawnPlacementRegression.test.js` (28), `tests/spawnEligibilityRegression.test.js` (10), `tests/spawnConstructionIntegration.test.js` (7) |
| **Root cause found (not in this plan)** | `mobSpawnPredicates.js` was imported by **nothing** under `src/`, so the placement registry was empty at runtime and every mob used the unregistered `ON_GROUND` default. This is what made fish stand on ice. |
| WP1 box collision for all placement families | `validateSpawnSpace` shared by the runtime cycle and chunk generation |
| WP1 heightmap semantics | `WORLD_SURFACE` counts the highest non-air block; the three heightmaps are distinct |
| WP2 per-member pack eligibility | each member re-resolves at its own position; the species is never re-rolled |
| WP2 dimension eligibility from data | `dimensionAllowsType`; Endermen in all three dimensions, skeletons in fortresses |
| WP2 structure data generated | `scripts/generate-mob-spawn-data.mjs` → `src/spawning/vanillaStructureSpawns.js`; the invented bastion override is gone and the missing suppression categories are present |
| WP3 aquatic species | water geometry split from elevation; the lush-cave tropical-fish exemption now fires; squid/dolphin no longer inherit the fish rule; glow squid has its own depth rule |
| WP3 hostile species | ghast's inverted 1-in-20 roll fixed; drowned given a light rule |

### What was NOT done, and why

- **WP4 lifecycle/caching revisions** — deliberately skipped. The plan itself says this comes *after*
  the predicate repairs because "the predicates change how often each path is hit", so tuning it first
  would have meant tuning against behaviour that was about to change. No measurement justifies a change
  yet.
- **WP4 spawn costs** — not started; still recorded in `MOB_SPAWNING_PARITY.md` as a known gap.
- **WP5 real-`MobManager` integration test** — partially done. The integration tests drive the real
  `NaturalSpawner`, `MobSpawnManager`, `SpawnState` and `ChunkGenerationSpawner` with a recording
  `MobManager`-shaped double. A test against the fully real `MobManager` (with `mobs.js` construction)
  is still outstanding.
- **WP3's remaining species** (slime, bat, passive floors, the rest of the Nether) — deferred. Their
  predicates already exist and are now *actually reached* for the first time, so the highest-value
  change was the wiring fix. Auditing each predicate against the spec is worthwhile follow-up.
- **Wiring structure generation into world generation** — out of scope, and it is what makes the whole
  structure-override feature dormant in game. Recorded prominently in `MOB_SPAWNING_PARITY.md`; it is
  the single largest remaining gap in this subsystem.

### The lesson worth carrying forward

The registry defect survived a green 94-test suite because those tests imported the predicate module
directly to test its predicates, which registered everything **as a side effect of the test**. The
suite was measuring a configuration the game never had. The regression test now imports **only the
spawner**, which is the shape the game uses.

Every repaired rule in this document carries a **positive control** — a test that fails if the fix
refuses everything. A suite that only asserts refusals can be satisfied by spawning nothing at all.

## 1. Scope and rules of engagement

Preserve the existing modules in `src/spawning/`. Implement one numbered work package at a time, with
its regression tests, before proceeding. Do not rewrite `mobs.js`, change combat behavior, or replace
the spawning subsystem.

### Expected behavior that must not be "fixed"

- **Endermen in the Overworld are expected.** Mojang describes natural Enderman spawning in all three
  dimensions. Test their eligibility, lighting, clearance and relative frequency; do not ban them from
  the Overworld.
- **A salmon under ice can be valid** when its biome list and water-placement rules allow it.
- **A naturally created fish standing on ice, or intersecting ice, is invalid.**
- A fish seen on land later could have been bucket-released, moved, or exposed by a fluid change. Do
  not treat its current position as proof of a spawn failure.

### Profiles

Two profiles are defined before any elevation-dependent rule changes:

- `java_1_21_4` — exact rule semantics and thresholds where the engine supports them.
- `browser_adapted_1_21_4` — explicitly documented substitutions for this engine's 64-block height,
  compressed sea level, custom biomes, missing block states, and frame budget.

Use shared rule functions with profile-supplied bounds. Do not claim full vanilla parity while using a
2D biome map, simplified collision shapes, substituted slime chunks, or a wall-clock-limited spawn
pass. Prioritize **legal placement first**, population/rate fidelity second, and unsupported
mechanisms third.

## 2. Reference material

Pin every external reference to a commit and version. Record URL, revision, relevant symbol, extracted
rule, and whether it is vanilla behavior or a server modification, in
[MOB_SPAWNING_REFERENCES.md](MOB_SPAWNING_REFERENCES.md). Read only the relevant files/functions.

### Versioned vanilla data

[misode/mcmeta, 1.21.4-data](https://github.com/misode/mcmeta/tree/1.21.4-data) provides generated
game data, not an independent spawning implementation. Study:

- `data/minecraft/worldgen/biome/*.json` — category lists, weights, group bounds, creature
  probability, spawn costs.
- `data/minecraft/worldgen/structure/*.json` — spawn overrides, including explicitly empty lists and
  bounding-box semantics.
- `data/minecraft/dimension_type/*.json` — dimension light rules.
- Relevant block and biome tags: spawnable floor sets, suppressed/reduced aquatic spawning, and
  species-specific biome tags.

`scripts/generate-mob-spawn-data.mjs` already imports biome entries. **Extend it; do not manually
replace its tables.** Vendor small, versioned reference fixtures so tests run without internet. Keep
fixture provenance separate from generated runtime output.

### Paper — Java-version reference and patch context

[Paper's `ver/1.21.4`](https://github.com/PaperMC/Paper/tree/ver/1.21.4), especially
`NaturalSpawner.java.patch`. Search the matching source/patch tree for `SpawnPlacements`,
`LocalMobCapCalculator`, `MobCategory`, `ServerChunkCache`, and species `check*SpawnRules` methods.
Study behavior and write original JavaScript. Distinguish vanilla base logic from Paper's configurable
per-player spawning, custom limits and performance changes. **Do not infer a complete method from a
partial patch hunk.**

### Cuberite — independent open source implementation

[Cuberite](https://github.com/cuberite/cuberite) is useful for approachable spawning architecture
(`MobSpawner`, `CanSpawnHere`, biome selection, pack creation, collision checks). Its supported game
era differs from 1.21.4, so use it for implementation patterns, **not** modern species, weights,
lighting constants or cap semantics.

For exact rules missing from public patch context, obtain the matching vanilla source through the
normal development toolchain or observe a controlled Java 1.21.4 server. **Mark unresolved rules
unverified rather than inventing them.** Bedrock behavior-pack spawn JSON is not a Java Edition oracle.

## 3. Findings from this repository

Code observations, not a completed gameplay reproduction of every reported symptom.

| Priority | Location | Finding | Required repair |
| --- | --- | --- | --- |
| P0 | `spawnValidation.js`, `validateGenericSpawn` | `IN_WATER` and `IN_LAVA` bypass `boxFits`. A water-center candidate with its box extending into adjacent ice returns `ok: true`. | Check solid collision for every placement family; fluid rules remain separate. |
| P0 | `naturalSpawner.js`, `spawnGroup` | A species is selected once, then pack members walk into other biomes/structures without checking that species against the list at the new location. | Re-resolve eligibility for each natural member; preserve pack species and reject an ineligible member. |
| P0 | `chunkGenerationSpawner.js`, `generationPredicateAllows` | Only the species predicate runs; a missing predicate returns true. No generic collision validation runs. | Share placement/bounds checks with runtime spawning, using generation-specific policy. |
| P0 | `mobSpawnManager.js`, `canSpawnInDimension` | Nether allowlist excludes Endermen and ordinary skeletons, even when the biome/fortress tables select them. | Derive valid dimensions from pinned tables/overrides plus explicit special mechanisms. |
| P1 | `mobSpawnPredicates.js`, `fishPredicate` | Shared water/Y test executes before the lush-cave tropical-fish exception, so the exception cannot allow deep cave spawning. | Split water geometry from species-specific elevation rules. |
| P1 | `mobSpawnPredicates.js`, `glowSquidPredicate` | Glow squid inherit the ordinary near-sea-level water band, then get another Y limit. | Implement their own version-specific underground rules. |
| P1 | `mobSpawnPredicates.js`, `drownedPredicate` | Checks water and rarity but never invokes a darkness predicate. Peaceful rejection depends on the caller. | Add the correct drowned lighting/difficulty rules with deterministic tests. |
| P1 | `mobSpawnPredicates.js`, `ghastPredicate` | Comment says 1-in-20 pass; implementation accepts 19 of 20 outcomes, and inherits generic hostile darkness. | Verify 1.21.4 species rules and replace this predicate; test all RNG outcomes. |
| P1 | `biomeSpawnResolver.js` | Handwritten bastion override includes naturally recurring piglin brutes. | Generate overrides from pinned structure data; separate initial structure inhabitants. |
| P1 | `spawnValidation.js`, `heightAt` | `WORLD_SURFACE` skips non-motion-blocking plants although it should count non-air; motion-blocking heightmap variants are conflated. | Implement each heightmap's actual inclusion rules and a clear returned-Y contract. |
| P1 | `naturalSpawner.js`, `buildState` | State can remain cached for 400 ticks when players remain still. Loaded chunks and external entity changes are absent from its cache signature. | Refresh per pass initially; optimize only with explicit mutation revisions. |
| P1 | `spawnState.js` | Local cap uses a custom percentage/fixed limit, friendly exemptions, and first-owner chunks. | Replace with verified vanilla local cap semantics; test overlaps if multiplayer is supported. |
| P1 | `main.js` | `structureAt` delegates to optional `structureIdAt`; no definition exists in `src`. | Wire an actual dimension-aware structure index; test lookup before assuming overrides work. |
| P2 | `mobSpawnManager.js`, `biomeAt` | Ignores Y and falls back to plains when the API is absent. | Introduce a 3D lookup adapter and explicit capability reporting. |
| P2 | `mobSpawnManager.js`, `createMob`; `mobs.js`, `spawnMob` | Size/options may be rolled after validation; several dispatcher cases discard options. | Finalize size/variant/group options before validation and preserve them through construction. |

The pinned
[bastion JSON](https://raw.githubusercontent.com/misode/mcmeta/1.21.4-data/data/minecraft/worldgen/structure/bastion_remnant.json)
has `spawn_overrides: {}`. Natural biome inhabitants can still spawn there; that does not authorize a
brute spawn override.

## 4. Work packages

### WP0 — Establish reproducible evidence

Read the existing spawn tests and helpers. Add a tiny hand-authored voxel-world fixture with explicit
loaded chunks, biomes, lights, fluids and dimensions. Never depend on finding suitable water in a
random generated world; a current test silently returns when it cannot find water.

Extend existing telemetry with spawn reason, requested position, constructed position, species,
category, actual biome, dimension, covering structure/bounds, nearby blocks, lights, and rejection
stage. Record facts at creation time. Add compact JSON export to the existing debug facility rather
than building another UI.

Trace all automatic creation paths into `MobManager.spawnMob` and direct `spawnX` calls. Classify each
as natural, chunk generation, structure generation, spawner/trial, breeding, conversion, event, egg,
bucket, command/debug, or load restoration. Ensure retired automatic spawners remain inactive.

**Deliverable:** a creation-path inventory and deterministic failing tests for confirmed gaps.

### WP1 — Repair shared placement and construction

Change `validateGenericSpawn` so all mobs receive bounds, loaded-terrain, and solid-AABB collision
checks. Verify every chunk touched by the AABB, including negative coordinates and neighbor chunks;
unloaded air must not permit placement. Keep water/lava occupancy checks species-specific where vanilla
differs. Do not require every voxel of every aquatic mob's AABB to be water unless the species rule
actually requires it.

Split reusable spatial checks from natural policy (player/world-spawn distance, caps, difficulty).
Chunk-generation placement should reuse spatial validation without inheriting the runtime
distance/cap policy. Spawners and eggs use their own rules; avoid enforcing natural biome eligibility
on bucket releases, eggs, or commands.

Create a finalized spawn descriptor before collision validation:

```js
{ type, reason, dimension, position, category,
  options: { size, isBaby, variant }, dimensions, groupData }
```

Validate the dimensions that will actually be constructed. Audit `spawnMob` forwarding and
slime/magma-cube constructors. Constructors must preserve validated feet coordinates; record and test
their resulting position. Validate before adding an entity to the scene/list.

**Deliverable:** fish and lava mobs cannot intersect solid blocks, generated animals cannot intersect
ceilings, and constructors honor validated position/options.

### WP2 — Correct eligibility and structure data

For each natural pack member, resolve the actual spawn list at its current position. Validate the
chosen species against the applicable entry using the same membership semantics as the pinned
reference. Reject an invalid member rather than rerolling its species or clamping it back into a biome.
Recompute structure provenance per member. Do not apply this policy blindly to chunk-generation packs.

Extend the generator to emit structure overrides and their bounding-box policy. Preserve three distinct
cases: no override, replacement list, and explicitly empty suppression. Remove invented bastion lists.
Wire the structure index to actual bounds and dimensions. Fortress spawning also has special
bounding/floor logic that generic data overrides alone may not express.

Replace the coarse dimension allowlists with dimension-aware eligibility derived from data and explicit
mechanism rules. Endermen must remain eligible in all three dimensions, and fortress skeletons must not
be rejected simply for being in the Nether. Unknown IDs and missing placement registrations must fail
visibly for automatic spawning.

**Deliverable:** no natural pack leaks across eligibility boundaries, real structures apply the proper
overrides, and structure-generated mobs cannot accidentally become recurring natural entries.

### WP3 — Audit each species predicate

Use a rule matrix with columns: source/version, mechanism, placement, floor tag, fluid requirements,
collision size, lights, Y bounds, sky access, random calls, special state, engine adaptation. Implement
one family and its tests at a time.

Start with cod, salmon, tropical fish, pufferfish, squid, dolphin, glow squid and axolotl. Separate
water geometry from elevation/biome rules; move lush-cave exceptions before irrelevant sea-level gates.
Do not give glow squid the common ocean band. Verify axolotl clay-distance rules. Read relevant tags
from data instead of `includes('river')`/`includes('swamp')` guesses.

Next repair drowned, ghasts, slime/magma cubes, Nether mobs, bats, and passive floor rules. Slime
chunks require world seed and Java-compatible arithmetic; swamp spawning requires actual moon/height/
light rules rather than flat substitutes. Generic dark-monster rules must not be reused for species
with different Nether or light behavior. Remove placeholder fortress ratio logic if the data already
supplies the real weighted ratio.

Audit version contamination: newer mobs can remain available in the mob catalogue but must not gain
invented 1.21.4 natural spawning rules. Creaking, bosses, brutes, shulkers, village inhabitants and
other special creations need the appropriate mechanism, not just a generic predicate.

**Deliverable:** every naturally selectable species has a sourced rule and positive/negative tests.
Unsupported state is documented, not guessed.

### WP4 — Fix state lifecycle and population fidelity

Rebuild counts/eligibility once per spawn pass first. If performance requires caching, introduce
entity/chunk/dimension revisions covering creation, removal/death, load/unload, persistence changes and
dimension switches. Add counts immediately after accepted spawns according to the reference algorithm.
Audit custom persistence alongside ordinary `persistent` state.

Namespace generation-population records by world identity and dimension, persist them as appropriate,
and ensure failed early initialization does not mark a chunk populated before entities can be created.
Switching dimension/reseeding must clear or switch the right spawn caches and special-spawner state.

Verify cap denominator, eligible ticking chunks, category flags/cadence, pack attempt/cluster limits,
and local caps against the versioned source. Cap checks happen at particular algorithm boundaries; do
not enforce a hard per-entity cap that removes vanilla's permitted pack overshoot. Cluster limits must
use the scope in the source.

Generate and implement biome spawn-cost/density constraints where supported. Keep special spawners
separate, honoring the appropriate gamerules and mechanism-specific cooldowns.

**Deliverable:** no stale caps or cross-dimension suppression, correct reference arithmetic/cadence,
and documented browser deviations.

### WP5 — Verify integration and browser performance

Use `scripts/spawn-smoke.mjs`, `scripts/spawn-travel.mjs`, and browser debug facilities. Add at least
one integration test using the real `MobManager` constructors and shared aquatic update handler; stub
renderer/audio services only as needed.

Use an injected deterministic attempt budget or unlimited budget for tests. Wall-clock cutoffs make
exact seeded outcomes machine-dependent. A Java-compatible RNG alone cannot guarantee vanilla's full
spawn sequence: call order, world state, seed derivation and work scheduling also matter.

For browser mode, retain bounded work but add fair scheduling across chunks/categories and preserve
rare-category opportunities. Heightmaps should eventually be cached and invalidated by block changes.
Measure the existing workload first; do not improve rates by biasing candidates toward the surface or
deleting collision checks.

**Deliverable:** controlled spawn legality, working construction/update integration, bounded frame
cost, and no category starvation.

## 5. Required test matrix

Suggested files: `spawnPlacementRegression.test.js`, `spawnEligibilityRegression.test.js`,
`spawnSpeciesRules.test.js`, `spawnLifecycle.test.js`, `spawnConstructionIntegration.test.js`. Prefer
extending an existing file when the case fits. Use `node:test` and `assert/strict`.

| Area | Cases | Assertion |
| --- | --- | --- |
| Ice/water | Fish on air above ice; centered inside ice; centered in water with adjacent ice intersecting its box | Reject; zero constructor calls; correct rejection stage |
| Valid frozen water | A supported salmon biome with a legal water position beneath ice | Accept; constructed position stays in legal water |
| Aquatic distinction | Tropical fish in frozen biome; eligible fish in ordinary ocean; deep lush-cave tropical fish | Match pinned biome lists and species rule, with a positive control |
| Solid collision | Aquatic box touching versus penetrating ice; lava mob under low ceiling | Exact boundary contact allowed where appropriate; penetration rejected |
| Chunk boundaries | Box crosses loaded/unloaded neighbor; negative X/Z; world upper/lower bounds | No reliance on unloaded-as-air; floor division and bounds correct |
| Generation | Animal beneath leaves/ceiling; correct grass surface; initialization before mob manager; duplicate chunk | Spatial checks run; valid control succeeds; no silent lost or repeated population |
| Biome boundaries | Deterministic pack walks from ocean into dry/cold biome, or desert into another biome | Each natural member obeys its destination eligibility; pack species remains fixed |
| Structures | Inside/outside piece/full bounds; empty category override; unspecified category; bastion brutes | Correct replace/suppress/fallback; no invented recurring brute entry |
| Dimensions | Enderman Overworld/Nether/End; ordinary skeleton in fortress; cow in Nether | Valid controls accepted; invalid natural entries rejected |
| Lighting | Drowned bright/dark water; generic monster block light 0/1; passive boundary; species-specific Nether rules | Match pinned predicates, including exact boundary values |
| Species exceptions | Glow squid deep/dark versus bright; axolotl allowed clay distances; slime chunk seeds and moon phases; bat rules | Each exception has independent sourced expected results |
| RNG | Exhaust all scripted outcomes for rarity predicates; all weighted-selection interval boundaries | Correct probability logic and draw order; no flaky randomness |
| Size/options | Small/large slime near wall; adult/baby; fish variant; actual dispatcher | Validated and constructed sizes/options agree |
| Caps | Below/at threshold; pack overshoot; death, egg creation, generation, persistence changes | Reference boundary policy; counts refreshed when relevant state changes |
| Lifecycle | Stationary player while chunks load/unload; same coordinates in another dimension; save/reload/reseed | No reused stale counts or population keys |
| Distance | 24 boundary and epsilon on both sides; fish 64 and others 128 where applicable; vertical distance; spectator; world spawn | Exact source comparisons; no horizontal-only natural distance test |
| Multiplayer | Overlapping and disjoint eligible sets; full cap for one player, available cap for another | Shared chunks and local counts follow verified reference semantics |
| Mechanisms | Natural versus egg/bucket/spawner/generation/restoration | Natural restrictions do not block deliberately different mechanisms |
| Construction/update | Capture spawn frame, then several real aquatic updates beside ice | Separate invalid creation from subsequent movement/fluid-change behavior |
| Distribution | Seeded weighted selection on a frozen list; multiple controlled integration seeds | Weight tests cover selection, not assumed realized-population ratios |
| Scheduling | 30/60/144 FPS equal elapsed ticks; fixed attempt budget; small browser budgets | Legal placements identical in rule terms; no starvation; no exact trace claim under wall time |

Reference expectations must come from immutable external fixtures or a reviewed rule matrix, not from
calling the same production predicate twice. Tests named differential must compare against an
independent oracle. **A green existing suite does not validate missing cases.**

Every repair needs a valid positive control. An implementation that refuses every spawn must fail the
test suite. For probabilistic behavior, prefer enumerating scripted RNG outcomes. For integration
distribution checks, use fixed seeds and broad justified tolerances.

## 6. Execution order

WP0, WP1, WP2, WP3 (split into aquatic, hostile/Nether, slime, passive/ambient), WP4 (split into cache
lifecycle, caps, spawn costs), WP5.

For each package: add a deterministic regression test that **fails** for the identified behavior plus a
**valid positive control**; make the smallest repair in the existing modules; do not rewrite unrelated
systems, weaken assertions, update fixtures to match broken output, or add guessed version-specific
rules; run the focused tests and report results; list unresolved source questions.

Focused command:

```powershell
node --test --test-isolation=none tests/mobSpawningParity.test.js tests/mobSpawningTravel.test.js
```

Then `npm run test:mob` and `npm run test:world`. Inspect `scripts/test.mjs` mappings to ensure new
tests are included. Run `npm run build`. Correct reference-backed expectations that were previously
wrong, documenting the rule change rather than preserving a mistaken test.

### Completion checklist

No illegal placement through any automatic path; per-position eligibility enforced for natural packs;
constructor position/options preserved; source-backed predicates and data; coherent cap/lifecycle
state; positive and negative tests; browser travel/frozen-water smoke coverage; and a concise list of
engine deviations. **Claim Java parity only for mechanisms actually verified.**

## 7. Evidence collected during preparation

- `validateGenericSpawn` accepts a width-0.5 aquatic entity centered at X=0.9 in water while its box
  penetrates ice at X=1.
- `fishPredicate` rejects tropical fish at Y=5 in lush caves in an all-water fixture with sea level 22;
  the intended exception executes too late.
- The existing water-placement test permits a silent early return if its random terrain has no suitable
  water.
- Baseline: all 94 existing spawning/parity/travel tests passed in ~74 s. The two targeted
  reproductions above nevertheless expose missing coverage.

These establish concrete repair targets. They do not prove the reported fish-on-ice sighting came from
natural spawning; creation-time telemetry and the integration test must establish that separately.
