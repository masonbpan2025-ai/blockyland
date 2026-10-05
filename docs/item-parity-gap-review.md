# Item parity gap review — Minecraft in the browser

Scope: the wiki [Item](https://minecraft.wiki/w/Item) page's item lists. **Unimplemented items, Removed
items and Joke items are excluded**, as requested. Every figure below is measured by the Resource Inspector
(`scripts/inspect-resource.mjs`) against the pinned vanilla data in `.cache/mc-data` (pc/1.21.4), and every
one of them can be reproduced with the commands at the end.

> **This is the second pass.** The first was written before the Inspector existed, from a script and a
> reading of the wiki; it reported the gaps but could not check the game's own behaviour. Thirty-odd batches
> later the item side is nearly closed, and what remains has been attributed item by item to the lane that
> has to do it. The figures here are from the current tip rather than that first reading.

## Baselines

| | Have | Vanilla | |
| --- | --- | --- | --- |
| Items (including item forms of blocks) | **1277** | 1385 | 92.2% |
| Vanilla item names absent | **16** | 1385 | 98.8% named |
| Registered blocks | 496 | 1095 | — |
| Recipes | 3609 | 1557 vanilla | — |
| Smelting rows | 90 | — | — |
| Harvest-gated blocks | 1094 | — | — |

The item and recipe columns are the two the Inspector measures directly; the block figure is the block
agents' lane and is quoted only for context.

## The Inspector

Twenty-one checks, each a question asked of every resource. Four have failures, and every failure has an
owner:

| Check | Result | |
| --- | --- | --- |
| `identifier`, `display-name`, `icon-declared` | clean | — |
| `icon-asset` | 14 failed | 496 unsupported — master's newest block items declare a *block* texture as their icon, and those textures are part of the block-art backlog |
| `stack-size`, `stack-size-declared` | clean | — |
| `durability-tracked` | clean | — |
| `has-source` | 192 failed | 220 unsupported — see below; 144 of them are entries with no item form |
| `recipe-parity` | **clean** | — |
| `ingredient-parity` | 3 failed | `map`, `spyglass`, `recovery_compass`: the recipe needs a vanilla ingredient this game has not got |
| `recipe-ingredient-parity` | clean | — |
| `block-id-resolves`, `harvest-data`, `block-drop`, `block-drop-roundtrip` | clean | — |
| `block-drop-parity` | 1 failed | `soul_campfire` drops charcoal instead of a soul soil block, which needs the block |
| `enchantable`, `tool-facts`, `edible`, `spawn-egg-target`, `block-places-block` | clean | — |

## Obtainability: the item side has no provable gap left

`has-source` reports 192 entries with no crafting, smelting, brewing, mob-loot, smithing, interaction or
block-drop source. Split by whether the item is one this game or vanilla can give a source at all:

| | Count | |
| --- | --- | --- |
| Items where vanilla's own recipe, loot and smelting data also gives no source | **42** | parity, not a gap: vanilla's spawn eggs, its creative-only items, `bedrock`, the end portal frame |
| This project's own items, not vanilla names at all | **7** | `golden_spear`, `harness`, `golden_dandelion`, `splash_water_bottle`, `lingering_water_bottle`, `creeper_wall_head`, `bamboo_sapling` |
| Items vanilla's data *does* give a source, and this game does not | **0** | — |
| Entries with no item form (technical blocks, block states) | 144 | the block agents' lane |

The zero is the headline: **for every item this game registers, either it can be obtained, or vanilla's own
data gives no source for it either, or it is content this project invented.** There is no item left that
vanilla can obtain and this game cannot, so far as vanilla's pinned recipe, loot and smelting data can prove.

That is a statement about *obtainability*, not about behaviour. An item can be obtainable and still lack the
feature it exists for, which is what the next section is about.

## The sixteen absent vanilla names, by owner

| Item | Why it is absent | Owner |
| --- | --- | --- |
| `map`, `written_book` | Neither is an item so much as a UI: a map is drawn from a rendered world view and a book is a text editor. Both need a screen, not a definition | engine |
| `spyglass`, `recovery_compass` | A zoom view and a pointer to a place you died. Both need camera and world-history plumbing, and the item-addition path excludes them for that reason: a crafted spyglass with no zoom is a dead item | engine |
| `resin_brick` | Vanilla's route is a creaking heart dropping resin clumps, which are then crafted. The **creaking** exists here; the resin clump block does not | block lane, then item |
| `command_block_minecart`, `knowledge_book`, `debug_stick` | Creative-only and operator-only. Vanilla gives them no survival source either | creative menu only |
| `trial_key`, `ominous_trial_key` | Vanilla's source is a defeated **trial spawner**, and this game's trial spawner is an inert block with no block entity | block entity, then item |
| `flow_banner_pattern`, `guster_banner_pattern` | From *ominous* vaults, which need the trial-spawner chain above | as above |
| `globe_banner_pattern`, `piglin_banner_pattern` | A cartographer trade and a piglin barter. Neither table carries them | trade tables |
| `firework_star` | Deliberately **not** added: this game's rockets carry no burst data, so a star would be an item with nothing to do | engine, if ever |

`firework_star` is the one here worth stating plainly, because it looks like a gap and is not. It is craftable
in vanilla and pointless here until rockets carry colours, so adding it would put an item in the registry that
can be made and cannot be used — the trap this series has avoided at every step.

The list was twenty, then eighteen, then sixteen. `splash_potion` and `lingering_potion` are
vanilla's generic splash and lingering potions, which **are** the water ones -- a potion with no stored effect is
water -- and this game had them all along under the names `splash_water_bottle` and
`lingering_water_bottle`.

The alias route was tried first, since `VANILLA_ID_ALIASES` exists for exactly this, and
`tests/duplicateIds.test.js` refused it: `shadowedVanillaIds` reads that table to tell a duplicate from a
rename, and the rule it enforces is that this game registers vanilla's own spelling rather than a synonym for
it. `slimeball` and `hay_bale` had been fixed that way in earlier rounds, which is why their aliases were
stale and are now gone.

So the rename is what happened, and it is worth recording what it touched, because the ids were not the hard
part. `generate-potion-items.mjs` derives a `splash_` and a `lingering_` form from every core potion;
the two generic forms now take vanilla's names instead. `brewing.js` gained the table that maps them back to
their core, because `potionDataFor` and the splash recogniser both resolve a derived id by stripping its
prefix -- and `splash_potion` does not strip to a core that exists. Without that, brewing into the new id
produced a phantom stack and a thrown splash potion fell through to block placement, which is exactly what
`tests/splashPotion.test.js` caught.

## What landed, by theme

Forty-odd merges, each verified through the Inspector before it went to `main`:

- **Items and their sources**: the fish buckets and their catch-and-release rule, the bundles and the
  pickup-overflow rule that is the only way one fills, the twenty-three pottery sherds and the brush that
  finds them, cake and the seventeen shulker boxes, scaffolding, bamboo and kelp, nether wart, the corals,
  the creeper head, the ender chest and the trapped chest, the sniffer egg and the end gateway, the moving
  piston, the barrier, light and structure void, the potions and their effect readers.
- **New questions for the Inspector**, which is where the real defects came from: `block-drop-parity` found
  nine blocks dropping the wrong item; `recipe-ingredient-parity` found the crop-and-hay class of bug, where
  a recipe asked for the block while the player held the item; the harvest state-variant fallback found
  every door, bed and banner state reporting no harvest row; `tool-facts` and `enchantable` found items
  claiming behaviour they did not have.
- **Tables rebuilt from vanilla**: 42 hand-verified smelting rows and 30 experience values, the fuel table,
  the smithing table, the stack limits, and the recipe generator's ingredient resolution.
- **Durability**: the sixty-five item definitions this branch added now live in `src/addedItems.js`, because
  two concurrent commits rewrote the region of `src/blocks.js` they were in and deleted them.

## Root causes, ranked

1. **A block item carried by numeric id while the tables are keyed by name.** This was the single most
   productive bug class: it was present in the stack limits, the kelp smelting key, the placement lookup and
   the recipe generator's ingredient resolution, and each instance made a working recipe silently
   uncraftable. `slotValue` and `blockIdForPlacement` now normalise, and the generator prefers a plain item
   over the block map.
2. **A check that asked the wrong question.** Spawn eggs were reported as unobtainable until the check
   learned they are creative-only in vanilla; every crop's growth stage was asked where a player obtains it
   until `internal` was honoured. Each false gap made the rest of the report harder to trust.
3. **Concurrent edits to the same hand-written region**, which deleted delivered items three times. The
   answer was structural rather than vigilance: move the definitions to a file nobody else edits.
4. **Content that exists but is inert**: the suspicious blocks that dropped nothing, the vault and trial
   spawner with no block entity. These are the remaining item gaps, and they need engine work.

## Reproducing these figures

```
node scripts/inspect-resource.mjs audit          # every check, with counts
node scripts/inspect-resource.mjs missing        # the absent vanilla names
node scripts/inspect-resource.mjs faults         # the gate: dangling references and duplicate keys
node scripts/inspect-resource.mjs show <item>    # one item: every table it appears in
node scripts/test.mjs survival                   # the suites that guard the item work
```

`tests/itemGapDoc.test.js` checks the headline figures in this document against the Inspector, so a stale
number fails rather than misleads.
