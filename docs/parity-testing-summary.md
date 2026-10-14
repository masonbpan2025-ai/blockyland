# Parity testing: what was tested, what was found, and what cannot be fixed

This is the master record for a series of bot-driven parity passes against the Minecraft Wiki: the `/give`
command, brewing, enchanting, status effects, crafting, farming, and Drowned farming. Each pass has its own
detailed report; this document is the index and the honest summary — **what was tested, the 21 defects
found and fixed, and the 13 issues that remain open with the reason each one is still open.**

- **Target:** Java Edition **1.21.4** (DataVersion 4189, declared in `src/io/canonical.js` as `TARGET_JAVA`)
- **Method:** a deterministic node probe over the production model, **plus** the real bot API driven by
  Playwright in a disposable headless browser, in creative mode
- **Totals:** 21 defects found and fixed · 13 open issues (11 gaps and 2 deliberate deviations)
  · **0 regressions** across every suite

> ### Corrections, and what has since been fixed
>
> [parity-gap-fix-plan.md](parity-gap-fix-plan.md) reviewed this report against the checkout and **corrected
> several conclusions in it**. The corrections are right, and they matter because a wrong reason for a gap is
> as bad as a wrong gap:
>
> | This report said | The checkout says |
> | --- | --- |
> | `@a` / `@r` need multiplayer | The local player is already a valid one-element player set — refusal is a compatibility gap, not Java behaviour |
> | Shells cannot come from fishing | `src/fishing.js` **already carries `nautilus_shell`** in its treasure loot |
> | There is no tree generator | `World.generateTree` dispatches ten species and huge mushrooms |
> | Luck has no reader | `FishingController.awardCatch` already reads it |
> | There is no raid system | `RaidManager` exists and grants Hero of the Village |
> | Components need a whole new layer | `src/io/nbt.js` and rich stack objects already exist |
>
> It also correctly notes that **"0 regressions" was not a green baseline** while
> `tests/recipeIngredients.test.js` was failing, and that grouped entries like `FX-S16` need child tasks
> rather than being counted as single patches.
>
> **Fixed since (see §10):** the failing baseline test (the crop/item identity defect), and `G07b`'s count
> grammar. Both were listed here as gaps and both are now closed.

---

## 1. Why two layers, and why the browser one matters

Every pass tests the same thing twice, deliberately:

| Layer | What it is | Why it is not redundant |
| --- | --- | --- |
| **Node probe** | The production module driven directly, with a seeded RNG so results are deterministic | Fast, exhaustive, and pins exact probabilities and edge cases |
| **Browser / bot API** | `window.game.playerBot.run({...})` in a real headless Chrome, acting on real world voxels, real inventories, real dropped entities and real XP orbs | Catches defects the probe cannot see |

The browser layer is not decoration. **Three defects were only visible through it:**

- `/give` looked perfect in 88 passing unit tests while **its entire bot route was dead** — every command
  action fell through to `Unsupported player command.`
- The bot **walked away from every mob kill with nothing on the ground**, because an `attack` resolved the
  instant the target's health hit zero and the death animation — which is what actually spawns the drops and
  the experience — never ran.
- The bot's `attack` and the crafting grid both had state the unit fixtures could not reproduce.

A related discipline: **the bot's own success string is never treated as evidence.** Every assertion reads
the real inventory, the real world voxel, the real dropped-entity list, or the real XP orbs. During the
`/give` work the string `"Gave 64"` matched a `startsWith('Gave 0')` check, and a success string was being
returned for work that had not happened.

## 2. Coverage at a glance

| Suite | Probe | Browser | Defects fixed | Report |
| --- | --- | --- | --- | --- |
| `/give` command | 18 cases | **31 pass** | **5** | [give-command-test-report.md](give-command-test-report.md) |
| Brewing | 22/23 pass, 1 unverified | **9 pass** | **2** | [brewing-test-report.md](brewing-test-report.md) |
| Enchanting | 17/17 pass | **12 pass** | **1** | [enchant-test-report.md](enchant-test-report.md) |
| Status effects | 15/16 pass, 1 gap | **11 pass** | **1** | [effect-test-report.md](effect-test-report.md) |
| Crafting | 13/13 pass | **10 pass** | **3** | [craft-test-report.md](craft-test-report.md) |
| Farming | 16/17 pass, 1 gap | **13 pass** | **4** | [farm-test-report.md](farm-test-report.md) · [farming-gap-closure.md](farming-gap-closure.md) |
| Drowned farming | 11/12 pass, 1 deviation | **8 pass** | **5** | [drowned-farm-test-report.md](drowned-farm-test-report.md) · [farming-gap-closure.md](farming-gap-closure.md) |

Plus the four suites from earlier passes re-run unchanged after every change (40 + 10 + 12 + 11 cases), and
**337 node tests** passing except one pre-existing, unrelated failure (§6).

Each suite has its **own isolated port** so a stale server can never answer it (3017 give/brew, 3018 enchant,
3019 effect, 3020 craft, 3021 farm, 3022 drowned). The user's own app on port 3000 is never touched.

## 3. The 21 defects found and fixed

### `/give` — 5 defects

| ID | Defect |
| --- | --- |
| **F1/F2/F3** | **Items were duplicated.** `Inventory.addItem` partially inserts before returning `false`, and `giveItems` treated a `false` return as "nothing happened", then bisected by re-probing — so every failed probe left its items behind. One sword became 1 in the inventory plus 10 on the ground; 101 swords became 36 held plus 101 dropped. Fixed with a non-mutating `countRoomFor` capacity query, a single insert, and a measured inventory delta. |
| **F4** | `splitItemArgument` sliced at the last colon, so *any* namespace was treated as `minecraft:` — `other_namespace:stone` silently handed over vanilla stone. |
| **F5** | `parseGive` destructured the first three arguments and ignored the rest, so `/give @s minecraft:stone 1 extra` succeeded as if well formed. |
| **F6** | The **100-stack limit** the wiki records for 21w10a (Java 1.17+) was not implemented at all. |
| **BOT01** | `PlayerBot.run()` had no branch for `type:'command'`, so **every** command action fell through to `Unsupported player command.` The `/give` bot route had never worked. |

### Brewing — 2 defects

| ID | Defect |
| --- | --- |
| **BR-B08** | The corruption table carried rows for `potion_of_swiftness_2` and `potion_of_leaping_2`, so a fermented spider eye turned enhanced Swiftness II and Leaping II into a Potion of Weakness — **which the wiki forbids**, because those potions are made with glowstone and corruption has no enhanced form. |
| **BR-B10** | Vanilla's generic splash and lingering potions *are* the water ones, with ids `splash_potion` / `lingering_potion` that strip to the meaningless `potion`. A `splash_potion + nether_wart` therefore brewed nothing. The generic-form lookup now runs **before** prefix stripping. |

### Enchanting — 1 defect

| ID | Defect |
| --- | --- |
| **EN-E04** | A Turtle Shell had an **enchantability of 1 instead of the wiki's 9**. `enchantabilityOf` takes the material from the id's first segment and looks it up in the armour table, and `turtle` was missing from it. |

### Status effects — 1 defect

| ID | Defect |
| --- | --- |
| **FX-X10** | **Effect damage was entirely swallowed by the melee invulnerability window.** `Player.takeDamage` returns early while `invulnerableTimer > 0` *and re-arms that timer on every hit*; Wither III ticks every `2 / 2²` = **0.5 s**, exactly the window it had just opened, so each tick blocked the next. Wither III dealt one tick of damage and then nothing. The **Wither boss** was hit the same way, because `bossFights.js` fires its skulls on a 0.5 s cadence. Vanilla exempts effect damage from the melee window. |

### Crafting — 3 defects

| ID | Defect |
| --- | --- |
| **CR-K07** | **Two stone made the wrong block, and the stone pressure plate was uncraftable.** A hand-written recipe keyed `[[STONE, STONE]] â†’ PRESSURE_PLATE`, but `PRESSURE_PLATE` (69) is a *different block* from `STONE_PRESSURE_PLATE` (446). Because the matcher returns the **first** match and the 2Ã—2 list is spread near the start of the 3Ã—3 list, that entry won every tie — including against the generated table's own correct recipe. |
| **CR-K13** | A hand-written `minecart` recipe had a `null` **one cell out of place**, so its bounding-box key described a shape no grid can lay out. The recipe was dead, and a dead recipe claims you can craft something you cannot. |
| **CR-C02** | **Mirrored recipes did not match — including the bow.** The wiki requires shaped recipes to match flipped horizontally; **110 of 1,230** multi-column patterns failed mirrored. The bow is the wiki's own example: `[null,stick,string]/[stick,null,string]/[null,stick,string]` is asymmetric, so with the strings on the left it matched nothing. |

### Farming — 4 defects

| ID | Defect |
| --- | --- |
| **FM-F07** | **Carrots and potatoes advanced 1–3 stages per bone meal, not 2–5.** The wiki's fertilizer table gives **one** rule: *"Wheat / Carrots / Potatoes — The plant matures 2–5 growth stages."* The code branched, so a bone meal on carrots could advance a single stage — outside the stated range and short of what wheat got from the same item. |
| **FM-BEETROOTS** | Beetroots were a **single block at their mature stage**, so `getCropInfo` returned `null` and bone meal did nothing. They are now a four-stage crop with the wiki's *own* rule for them: *"a 75% chance of growing to the next growth stage"* — one stage, three times in four, **not** the 2–5 rule. |
| **FM-GRASS-ORDER** | **The random gate ran before the candidate check.** On a small patch the 45% roll almost never coincided with the one cell that held grass, so bone meal on grass appeared to do **nothing at all**. Vanilla picks from the grass blocks in the volume. |
| **FM-GRASS-AREA** | The spread was a 5Ã—5 area; the wiki says **15Ã—15Ã—15** in Java Edition. |

### Drowned farming — 5 defects (3 in the first pass, 2 gaps closed after)

| ID | Defect |
| --- | --- |
| **DF-ATTACK** | **The bot walked away from every kill with nothing on the ground.** An `attack` resolved the moment the target's health reached zero, but a mob's **drops and its experience are spawned by the death animation** — `updateDeath` rolls them once `deathTime` passes 0.65. Every drowned farm exists to collect exactly what was being dropped on the floor and forgotten. |
| **DF-XP** | **Killing a drowned awarded 1–3 XP instead of 5.** The XP method's `hostile` list *is* the wiki's "5 + 1–3" group, and `drowned` was not in it, so it fell through to the passive fallback. A drowned farm yielded less experience than the tutorial's whole reason for building one. `zombie` and `husk` were both in the list; their water-logged sibling was not. |
| **DF-BABY-XP** | **Every baby mob was worth zero experience.** Babies set `noLoot = true` — meaning *"this mob's **drops** are suppressed"* — and the entire XP block was nested inside `if (!mob.noLoot)`. The wiki keeps the two apart and explicitly lists **Baby Drowned at 12**. The baby branches inside that block were unreachable dead code. |
| **DF-CONVERSION** | **There was no zombie â†’ drowned conversion at all**, so the *flooded monster room* design the tutorial calls "the easiest method to implement" could not work. Now implemented as one shared timer with the husk's rule: head submerged 30 s, then 15 s, full health, normal zombies only. |
| **DF-GURGLES** | No drowned ever spawned as a baby; the wiki says gurgles are **5%** of drowned spawns. |

*(Drowned farming contributes five of the 21. DF-CONVERSION and DF-GURGLES were the gaps closed in the
second pass, after the first pass recorded them as open.)*

## 4. What remains open — the gaps

These are **missing mechanics**, not broken ones. Each needs something this engine does not have.

| ID | Gap | Why it is still open |
| --- | --- | --- |
| **G14 / G14b** | `/give @a` and `/give @r` are refused as multi-player selectors | This build is single-player. `@a` and `@r` are *correctly* refused rather than silently treated as `@s`, but there is no multiplayer model to select from. Implementing them would mean inventing a player list. |
| **G15** | `/give NobodyHere minecraft:stone 1` gives the local player one stone | Vanilla requires the target to resolve to a player. Accepting any name and falling back to the local player is wrong but *harmless* here, and tightening it needs a decision about what "no such player" should mean in a single-player game. |
| **G17** | Item data components are refused with an explicit reason | `{components}` on an item id needs an NBT-equivalent layer this build has no representation for. Refusing with a stated reason is the honest behaviour; accepting and ignoring them would be worse. |
| **G07b** | `1e2` reads as `100` and `0x10` as `16` through `Number()`; `+1` reads as `1` | Vanilla's argument parser is stricter than JavaScript's `Number()`. The wiki does not tabulate which literal forms are accepted, so the exact rule is unverified — recorded rather than guessed. |
| **BR-B09a** | `getBrewingResult('water_bottle', 'dragon_breath')` returns `null` | Lingering potions need a *thrown-potion entity* to leave their cloud, which this engine has no representation for. The recipe row exists; the effect cannot. |
| **FX-S16** | `bad_omen`, `trial_omen`, `raid_omen`, `hero_of_the_village`, `luck`, `unluck` carry a category and no rule | Each is a mechanic the build does not model: raids, trial spawners, the village-hero discount, fishing loot luck. `health_boost` and `saturation` carry their recorded figure and nothing reads it, so they are a partial gap. |
| **CR-substitution** | Vanilla lets a tag stand in for a family (any planks for a chest, any wool for a bed); this build keys an ingredient by an exact id | The generated table carries one recipe per wood type, so each wood works for its *own* recipes. The wiki page fetched does not enumerate tag membership, so which substitutions *ought* to work is unverified. |
| **FM-STEMS** | Melon and pumpkin stems, and bamboo, are single blocks | In vanilla a stem has growth stages but **reuses one texture**, so a stage here needs a *model* per stage, not just art — and bone meal "does not cause melons or pumpkins to sprout from a mature stem", so the player-visible difference is small. |
| **FM-TREES** | Saplings and azaleas (45% chance of a stage), mushrooms and nether fungi (40% chance of a huge form) | Both need a whole-tree or whole-structure generator. This engine has none. |
| **FM-MECHANICS** | Sea pickles, kelp, cave vines, glow lichen, moss blocks, dripleaf, rooted dirt, pink petals, torchflower and pitcher crops | Each needs its own mechanic. **Sugar cane and nether wart are deliberately inert** — the wiki's own "Bone meal does not affect" list names both, so their absence is the correct behaviour. |
| **FM-SUNFLOWER** | Bone meal cannot drop a sunflower's item form | `ITEMS` has entries for lilac, rose bush and peony but **not** for sunflower. That is a pre-existing item-registration gap, not a bone meal rule — flagged rather than half-wired. |

## 5. What remains open — deliberate deviations

Two places where the build **deliberately does not match** the wiki, because matching it would break
something else. I recorded both rather than "fixing" them, and I want the reasoning on the record.

| ID | Deviation | Why it stays |
| --- | --- | --- |
| **DF-SHELL** | A drowned drops a **nautilus shell** 3% of the time, but the shell is a **Bedrock-only** drop — the tutorial is explicit that the Java farm "does not produce nautilus shells" | It is the **only source of `nautilus_shell` in the game**, and a **conduit is built from one**. Vanilla Java gets shells from fishing, which this build does not model, so the correct fix is *a fishing source*, not a deleted row. Deleting the row would make the conduit unobtainable. |
| **DF-TRIDENT-RATE** | The trident row is vanilla's 8.5%, but **every** drowned here carries a trident (which is why they all throw one), where vanilla arms only a minority | The row's *rate* is correct; the *population* is not. Making most drowned unarmed would delete the trident-throwing behaviour the mob is built around, and the two have to move together. The wiki pages fetched give no Java arming rate either, so there is no verified figure to correct it *to*. |

## 6. Unverified specifications — recorded, never guessed

A finding that cannot be checked against the source is **recorded as unverified**, not asserted. Asserting a
guessed value would manufacture a parity claim that does not exist.

| Area | What is unverified |
| --- | --- |
| **Enchanting cost ranges** | The wiki's published cost ranges **overlap** at some level boundaries (Fire Protection's table reads 10–17, 18–25, 26–33, 34–42 while the model uses different boundaries), so the exact table cannot be reproduced with confidence. |
| **Enchanting seed** | Vanilla stores a per-player enchanting seed and regenerates it after each enchant, so two tables with the same bookshelf count offer the same options. The build does not model a seed, so *which* enchantment a given table offers on a given roll cannot be compared. |
| **Crafting tag substitution** | Which ingredients may substitute for which is not enumerated on the page fetched. |
| **Effect behavioural notes** | `takeDamage` is a no-op in creative, and the bot's `eat` refuses when the player is neither hungry nor hurt. Both are vanilla-consistent and neither is stated on the wiki as an effect property. |
| **Farming growth probability** | The per-random-tick probability is a formula over the surrounding farmland. **The page gives no figure**, so only the *ordering* is asserted (hydrated grows substantially faster), with a 1.5Ã— margin. The clock is a fixed 1 s interval rather than vanilla's random tick, so **maturity times will not match** even though every state transition does. |
| **Farming foliage type** | The wiki says the foliage type grown on a grass block "depends on external factors like the biome and coordinates". The build rolls a flat choice among dandelion, poppy and short grass. |
| **Mob spawn rates** | Already flagged `UNVERIFIED` in `src/spawning/mobSpawnPredicates.js`: whether 1.21.4 uses the full three-part darkness rule for drowned. |
| **Trident throw figures** | The throw is wired to the drowned, but the pages fetched state neither Java's interval nor its damage, so the build's 4.0 s / 8 damage is recorded rather than verified. |

## 7. Process failures — mistakes I made and what they cost

Recorded because a test report that only lists the code's faults is not honest about the measurement.

The recurring failure mode was **my own test setup looking exactly like a product bug**:

- **Ten-plus probe/test self-errors in the crafting pass alone**, each of which initially looked like a
  defect: `startsWith('Gave 0')` matching `"Gave 64"`; stale drops between cases; a bookshelf ring that is
  two levels tall (32 shelves, not 16); `tickEffect('poison', dt=1.2)` below the 1.25 s interval; natural
  regeneration masking poison damage; asserting `1.05` where Speed II + Slowness I is `1.25`.
- **A crop only grows if it is registered** with the farming manager, and the only production path that
  registers one is `plant()`. Writing a crop block directly produces a plant that never grows — which looks
  exactly like a growth bug.
- **The surviving-test fixture suspends the RAF**, so the game's `update()` never reaches
  `farmingManager.update`. My `grow()` was ticking nothing for a while.
- **A mislabelled debug print** showed `[145Ã—9]` and sent me hunting a normalisation bug that did not exist.
  Reading the actual comparison rather than my own printout settled it in one step.
- **The flaky grass test**: with a single candidate cell the 45% gate legitimately fails 55% of runs. The
  test, not the code, was wrong.
- **Three bugs of my own making in a single addendum**: asserting that beetroot stage ids are not a
  contiguous run when they mostly are; reading a 75% *advance* rate as a 75% *return-value* rate when a miss
  still reports success; and giving the gurgle fixture `() => 0` as its RNG, which forced every spawn to be a
  baby and produced a confident "100% of spawns are gurgles".

The lesson that recurred throughout: **the probe must be able to fail for the right reason**, and when a
result looks wrong the first question is whether the measurement is wrong.

## 8. Known limitations of this whole effort

- **No live vanilla server was available.** No result here is claimed as full wiki parity. The comparison is
  always *the model against the wiki text*.
- **A farm structure was never built.** For Drowned farming, what is tested is the bot's step of the farm —
  kill the drowned, take the loot — not the water channels, spawner, drop shaft and killing platform.
- **Creative mode only**, as requested. Damage-observing cases run in survival because `takeDamage` is a
  no-op in creative, which is vanilla's own rule.
- **No `/effect` command exists in this build**, so status effects were reached by having the bot drink real
  potions rather than by command.
- **Splash and lingering delivery** of effects was not exercised end to end, nor were beacon, conduit or
  dolphin's-grace application.
- **Mob spawning** was not re-derived; it is covered by the existing spawn parity suites.
- **One test remains failing and is not mine**: `tests/recipeIngredients.test.js` asserts that nine
  `BLOCKS.WHEAT` crop blocks should not craft, but the crafting matcher normalises that block to the `wheat`
  item. **It fails identically with every change of mine stashed.** The normalisation looks intentional —
  `BLOCKS.WHEAT` is the fully-grown crop stage and is referenced nowhere in `src/` — so the assertion is
  stale, and it needs a decision from whoever owns the crop/item split rather than a test edit from me.

## 9. Where everything lives

**Reports**

- [give-command-test-report.md](give-command-test-report.md) · [brewing-test-report.md](brewing-test-report.md) ·
  [enchant-test-report.md](enchant-test-report.md) · [effect-test-report.md](effect-test-report.md) ·
  [craft-test-report.md](craft-test-report.md) · [farm-test-report.md](farm-test-report.md) ·
  [drowned-farm-test-report.md](drowned-farm-test-report.md) · [farming-gap-closure.md](farming-gap-closure.md)

**Raw evidence** — `docs/artifacts/`, one consolidated results file per suite (`<suite>-results.json`) plus
the two evidence streams it was built from (`<suite>-probe.json` for the model rows, and
`<suite>-browser-rows.json` for every bot action with its before/after state).

**Layout per suite** — `scripts/probe-<suite>.mjs`, `e2e/<suite>Command.pw.js`,
`e2e/fixtures/<suite>Harness.js`, `e2e/fixtures/vite.<suite>.config.js`, `playwright.<suite>.config.js`.

**Reproduce**

```powershell
node scripts/probe-farm.mjs --write                 # model probe, no browser
npx playwright test -c playwright.farm.config.js    # the bot matrix, own port
node --test --test-isolation=none tests/farming.test.js
```

**Production files changed across the whole effort:** `src/commands.js`, `src/inventory.js`,
`src/playerBot.js`, `src/brewing.js`, `src/enchanting.js`, `src/player.js`, `src/crafting.js`,
`src/farming.js`, `src/blocks.js`, `src/mobs.js`, `src/undeadVariants.js`.

---

## 10. Fixes applied from the gap-fix plan

[parity-gap-fix-plan.md](parity-gap-fix-plan.md) proposed a phased programme. The **first batch** it
recommends — the four items with narrow dependencies and clear acceptance tests — has been implemented for
the two that needed no new design. Both are recorded here as *measured closures*, with the rest of the plan
still open.

### G07b — strict count syntax (closed)

`/give`'s `<count>` was validated with `Number()`, which accepted `1e2` as 100, `0x10` as 16, `+1` as 1 and
`1.0` as 1. The plan pinned the contract from Mojang's
[Brigadier `StringReader`](https://github.com/Mojang/brigadier/blob/master/src/main/java/com/mojang/brigadier/StringReader.java):
`readInt()` scans digits, a leading minus and a decimal point, then `Integer.parseInt` rejects the decimal —
so a decimal point is *scanned but never parses*, `+` is not an integer character, and `1e2` / `0x10` leave an
unread suffix.

The token is now matched against `^-?[0-9]+$` before conversion. Leading zeroes are ordinary decimal digits
and still work, as the plan requires. Evidence: `tests/commandParity.test.js` covers the grammar, and
`e2e/giveCommand.pw.js` case **G07b** now asserts that all five spellings refuse *without touching the
inventory or dropping anything* — it previously asserted the old accept-as-100 behaviour, pinning the gap.

### Crop/item identity — the failing baseline (closed)

The plan was right that this was a **production defect, not a stale assertion**, and right about the cause:
a broad registry-name fallback. The number **171** is both the `wheat` *item* and the fully-grown Wheat Crops
*block*, and `slotValue` resolved the plain string `'wheat'` through `BLOCKS['WHEAT']` to that number, so nine
crop blocks matched the hay recipe.

Fixed by splitting the two key spaces and gating on the caller's `isBlock` flag, with an unambiguous
fallback when the flag is absent (every block id is a small number below the first item id, and no id is both
a registered block and an unregistered item). `gridMultiset` keeps its public shape; the matcher uses tagged
internal keys. **Both sides** of a comparison — grid cells and recipe ingredients — now go through one
resolver, which is what the plan asked for.

`tests/recipeIngredients.test.js` passes **5/5** without weakening a single assertion.

### Still open from the plan

| Plan item | Status |
| --- | --- |
| `G14` / `G14b` / `G15` local target resolution | **Open.** The plan is right that a one-element player set is enough for `@a`/`@r`/`@p`, but a literal name must stop aliasing *any* name to self, and that needs a persisted local identity — a design decision, not a patch. |
| `FM-SUNFLOWER` | **Open.** The plan corrects the diagnosis (the block item exists), so the fix is a small representation choice rather than a new item. |
| `CR-substitution` (recipe tags) | **Open.** Affects everyday Survival crafting; needs pinned tag data. |
| Enchanting cost tables and seed | **Open.** Needs target-version data and a persisted per-player seed. |
| `FX-S16` (six inert effects) | **Open.** The plan correctly requires splitting it into per-consumer child tasks; several already have foundations to build on. |
| `BR-B09a` / lingering delivery | **Open.** Needs an area-effect cloud manager, not just a recipe row. |
| `DF-SHELL` / `DF-TRIDENT-RATE` | **Open, and re-scoped.** The plan found that fishing already yields shells, so the task is to *demonstrate* that route and then model drowned equipment properly — the report's "Bedrock-only" conclusion needs that distinction checked. |
| `FM-STEMS` / `FM-TREES` / `FM-MECHANICS` | **Open.** `World.generateTree` exists, so runtime tree growth is a *safe-placement adapter* problem rather than a missing generator. |

The plan's completion criteria are adopted: production-model tests for each changed rule, a real bot case in
an isolated fixture, Survival mode when consumption or obtainability matters, and raw before/after rows
preserved.



