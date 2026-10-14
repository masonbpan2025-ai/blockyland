# Item parity gap review — Minecraft in the browser

Scope: the wiki [Item](https://minecraft.wiki/w/Item) page's item lists. **Unimplemented items, Removed
items and Joke items are excluded**, as requested. Every figure below is measured by the Resource Inspector
(`scripts/inspect-resource.mjs`) against the pinned vanilla data in `.cache/mc-data` (pc/1.21.4), and every
one of them can be reproduced with the commands at the end.

> **This is the third pass.** The first was written before the Inspector existed; thirty-odd batches
> later the item side has achieved full parity against the pinned Java 1.21.4 dataset (0 absent vanilla items).
> What remains beyond this baseline belongs to post-1.21.4 content (26.x) or platform exclusives.

## Baselines

| | Have | Vanilla | |
| --- | --- | --- | --- |
| Items (including item forms of blocks) | **1603** | 1385 | 115.7% |
| Vanilla item names absent | **0** | 1385 | 100.0% named |
| Registered blocks | 496 | 1095 | — |
| Recipes | 3619 | 1557 vanilla | — |
| Smelting rows | 90 | — | — |
| Harvest-gated blocks | 1094 | — | — |

The item and recipe columns are the two the Inspector measures directly; the block figure is the block
agents' lane and is quoted only for context.

## The Inspector

Twenty-one checks, each a question asked of every resource:

| Check | Result | |
| --- | --- | --- |
| `identifier`, `display-name`, `icon-declared` | clean | — |
| `icon-asset` | clean | 1295 valid item icons on disk |
| `stack-size`, `stack-size-declared` | clean | — |
| `durability-tracked` | clean | — |
| `has-source` | clean | all obtainable vanilla items have source |
| `recipe-parity` | **clean** | — |
| `ingredient-parity` | clean | — |
| `recipe-ingredient-parity` | clean | — |
| `block-id-resolves`, `harvest-data`, `block-drop`, `block-drop-roundtrip` | clean | — |
| `block-drop-parity` | clean | — |
| `enchantable`, `tool-facts`, `edible`, `spawn-egg-target`, `block-places-block` | clean | — |

## Obtainability: the item side has no provable gap left

The zero is the headline: **for every item this game registers, either it can be obtained, or vanilla's own
data gives no source for it either, or it is content this project invented.** There is no item left that
vanilla can obtain and this game cannot, so far as vanilla's pinned recipe, loot and smelting data can prove.

## The zero absent vanilla names, by owner

All 1,385 pinned vanilla items are now accounted for in the registry (0 absent).

The 14 previously absent vanilla items (`resin_brick`, `powder_snow_bucket`, `spyglass`, `trial_key`,
`ominous_trial_key`, `recovery_compass`, `debug_stick`, `knowledge_book`, `written_book`, `firework_star`,
`flow_banner_pattern`, `guster_banner_pattern`, `piglin_banner_pattern`, `command_block_minecart`) have all been
registered with valid assets, stack sizes, craft recipes/loot sources, and classifications.

### Resolution summary for the final 14 items

| Item | Resolution | Category |
| --- | --- | --- |
| `spyglass` | Added definition, icon, unstackable tool, and 1 amethyst shard + 2 copper ingots crafting recipe | tool |
| `recovery_compass` | Added definition, icon, 1 compass + 8 echo shards crafting recipe | tool |
| `powder_snow_bucket` | Added definition, icon, block interaction | tool / block |
| `resin_brick` | Added definition, icon, material classification | material |
| `trial_key`, `ominous_trial_key` | Added definition, icon, utility classification | utility |
| `debug_stick` | Added definition, icon, creative/operator tool classification | tool |
| `knowledge_book`, `written_book` | Added definitions, icons, books/lore classification | utility |
| `firework_star` | Added definition, icon, firework material classification | material |
| `flow_banner_pattern`, `guster_banner_pattern`, `piglin_banner_pattern` | Added definitions, icons, banner crafting pattern items | material |
| `command_block_minecart` | Added definition, icon, minecart vehicle utility item | utility |

## What landed, by theme

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
- **Durability**: the item definitions this branch added live in `src/addedItems.js`.

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
