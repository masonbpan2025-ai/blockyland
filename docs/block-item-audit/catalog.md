# Complete block and item audit inventory

[Read the audit plan](../block-item-audit-plan.md). Generated from runtime definitions; regenerate with `node scripts/generate-resource-audit-plan.mjs`.

1219 block definitions + 1302 item definitions = 2521 explicit rows in 148 batches. Block/item forms are separate responsibilities even when they share a name. All rows start unreviewed; links are Wiki targets, not verified article contents.

Every row inherits all universal gates in the plan and its family checklist below. Metadata is the current implementation, never an assertion of Wiki correctness. Missing bootstrap state metadata means "research required", not "no states".

## A001 — Flowers and small decorative plants 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct plant silhouette in inventory, held view, world and dropped form; alpha holes must reveal the background, never a black cube.
- Substrate/support and placement failures; one/two-block height, upper-half cleanup, collision and hit selection.
- All applicable dye, suspicious-stew, flower-pot, bee/pollination and composting uses; species-specific hazards and open/closed behavior.

**Required Inspector showcase:**

- Equip actual flower in HeldItemRenderer over light and dark backdrops; swing, switch slots, drop and pick up.
- Place on supported/unsupported terrain, remove support, place in pot, convert by recipes; show each state.

Existing test files to inspect (coverage unverified): [tests/item_icons.test.js](../../tests/item_icons.test.js), [tests/itemForms.test.js](../../tests/itemForms.test.js), [tests/placeableItems.test.js](../../tests/placeableItems.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:31` NOT_STARTED | Dandelion · dandelion | [Dandelion](https://minecraft.wiki/w/Dandelion) | No paired form declared | hardness=0; drop=31; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:golden_dandelion` NOT_STARTED | Golden Dandelion | [Golden Dandelion](https://minecraft.wiki/w/Golden_Dandelion) | No paired form declared | type=material; later-version-or-custom-review-required |
| `B:30` NOT_STARTED | Poppy · poppy | [Poppy](https://minecraft.wiki/w/Poppy) | No paired form declared | hardness=0; drop=30; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:414` NOT_STARTED | Allium · allium | [Allium](https://minecraft.wiki/w/Allium) | `I:allium` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:allium` NOT_STARTED | Allium | [Allium](https://minecraft.wiki/w/Allium) | `B:414` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:415` NOT_STARTED | Azure Bluet · azure_bluet | [Azure Bluet](https://minecraft.wiki/w/Azure_Bluet) | `I:azure_bluet` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:azure_bluet` NOT_STARTED | Azure Bluet | [Azure Bluet](https://minecraft.wiki/w/Azure_Bluet) | `B:415` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:416` NOT_STARTED | Blue Orchid · blue_orchid | [Blue Orchid](https://minecraft.wiki/w/Blue_Orchid) | `I:blue_orchid` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:blue_orchid` NOT_STARTED | Blue Orchid | [Blue Orchid](https://minecraft.wiki/w/Blue_Orchid) | `B:416` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:984` NOT_STARTED | Closed Eyeblossom · closed_eyeblossom | [Closed Eyeblossom](https://minecraft.wiki/w/Closed_Eyeblossom) | No paired form declared | hardness=0; drop=984; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:418` NOT_STARTED | Cornflower · cornflower | [Cornflower](https://minecraft.wiki/w/Cornflower) | `I:cornflower` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:cornflower` NOT_STARTED | Cornflower | [Cornflower](https://minecraft.wiki/w/Cornflower) | `B:418` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:661` NOT_STARTED | Lilac · lilac | [Lilac](https://minecraft.wiki/w/Lilac) | `I:lilac` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:lilac` NOT_STARTED | Lilac | [Lilac](https://minecraft.wiki/w/Lilac) | `B:661` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `I:lily_of_the_valley` NOT_STARTED | Lily of the Valley | [Lily of the Valley](https://minecraft.wiki/w/Lily_of_the_Valley) | `B:421` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:421` NOT_STARTED | Lily Of The Valley · lily_of_the_valley | [Lily Of The Valley](https://minecraft.wiki/w/Lily_Of_The_Valley) | `I:lily_of_the_valley` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:983` NOT_STARTED | Open Eyeblossom · open_eyeblossom | [Open Eyeblossom](https://minecraft.wiki/w/Open_Eyeblossom) | No paired form declared | hardness=0; drop=983; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:423` NOT_STARTED | Orange Tulip · orange_tulip | [Orange Tulip](https://minecraft.wiki/w/Orange_Tulip) | `I:orange_tulip` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:orange_tulip` NOT_STARTED | Orange Tulip | [Orange Tulip](https://minecraft.wiki/w/Orange_Tulip) | `B:423` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:424` NOT_STARTED | Oxeye Daisy · oxeye_daisy | [Oxeye Daisy](https://minecraft.wiki/w/Oxeye_Daisy) | `I:oxeye_daisy` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A002 — Flowers and small decorative plants 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct plant silhouette in inventory, held view, world and dropped form; alpha holes must reveal the background, never a black cube.
- Substrate/support and placement failures; one/two-block height, upper-half cleanup, collision and hit selection.
- All applicable dye, suspicious-stew, flower-pot, bee/pollination and composting uses; species-specific hazards and open/closed behavior.

**Required Inspector showcase:**

- Equip actual flower in HeldItemRenderer over light and dark backdrops; swing, switch slots, drop and pick up.
- Place on supported/unsupported terrain, remove support, place in pot, convert by recipes; show each state.

Existing test files to inspect (coverage unverified): [tests/item_icons.test.js](../../tests/item_icons.test.js), [tests/itemForms.test.js](../../tests/itemForms.test.js), [tests/placeableItems.test.js](../../tests/placeableItems.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:oxeye_daisy` NOT_STARTED | Oxeye Daisy | [Oxeye Daisy](https://minecraft.wiki/w/Oxeye_Daisy) | `B:424` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:667` NOT_STARTED | Peony · peony | [Peony](https://minecraft.wiki/w/Peony) | `I:peony` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:peony` NOT_STARTED | Peony | [Peony](https://minecraft.wiki/w/Peony) | `B:667` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:668` NOT_STARTED | Pink Petals · pink_petals | [Pink Petals](https://minecraft.wiki/w/Pink_Petals) | `I:pink_petals` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_petals` NOT_STARTED | Pink Petals | [Pink Petals](https://minecraft.wiki/w/Pink_Petals) | `B:668` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:425` NOT_STARTED | Pink Tulip · pink_tulip | [Pink Tulip](https://minecraft.wiki/w/Pink_Tulip) | `I:pink_tulip` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:pink_tulip` NOT_STARTED | Pink Tulip | [Pink Tulip](https://minecraft.wiki/w/Pink_Tulip) | `B:425` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:670` NOT_STARTED | Pitcher Plant · pitcher_plant | [Pitcher Plant](https://minecraft.wiki/w/Pitcher_Plant) | `I:pitcher_plant` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:pitcher_plant` NOT_STARTED | Pitcher Plant | [Pitcher Plant](https://minecraft.wiki/w/Pitcher_Plant) | `B:670` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:427` NOT_STARTED | Red Tulip · red_tulip | [Red Tulip](https://minecraft.wiki/w/Red_Tulip) | `I:red_tulip` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:red_tulip` NOT_STARTED | Red Tulip | [Red Tulip](https://minecraft.wiki/w/Red_Tulip) | `B:427` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:674` NOT_STARTED | Rose Bush · rose_bush | [Rose Bush](https://minecraft.wiki/w/Rose_Bush) | `I:rose_bush` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:rose_bush` NOT_STARTED | Rose Bush | [Rose Bush](https://minecraft.wiki/w/Rose_Bush) | `B:674` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:146` NOT_STARTED | Sunflower · sunflower | [Sunflower](https://minecraft.wiki/w/Sunflower) | No paired form declared | hardness=0; drop=146; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:677` NOT_STARTED | Torchflower · torchflower | [Torchflower](https://minecraft.wiki/w/Torchflower) | `I:torchflower` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:torchflower` NOT_STARTED | Torchflower | [Torchflower](https://minecraft.wiki/w/Torchflower) | `B:677` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:1170` NOT_STARTED | Torchflower Crop · torchflower_crop | [Torchflower Crop](https://minecraft.wiki/w/Torchflower_Crop) | No paired form declared | hardness=0; dropItem=torchflower_seeds; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:430` NOT_STARTED | White Tulip · white_tulip | [White Tulip](https://minecraft.wiki/w/White_Tulip) | `I:white_tulip` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:white_tulip` NOT_STARTED | White Tulip | [White Tulip](https://minecraft.wiki/w/White_Tulip) | `B:430` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:431` NOT_STARTED | Wither Rose · wither_rose | [Wither Rose](https://minecraft.wiki/w/Wither_Rose) | `I:wither_rose` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A003 — Flowers and small decorative plants 3

Rows: 1. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct plant silhouette in inventory, held view, world and dropped form; alpha holes must reveal the background, never a black cube.
- Substrate/support and placement failures; one/two-block height, upper-half cleanup, collision and hit selection.
- All applicable dye, suspicious-stew, flower-pot, bee/pollination and composting uses; species-specific hazards and open/closed behavior.

**Required Inspector showcase:**

- Equip actual flower in HeldItemRenderer over light and dark backdrops; swing, switch slots, drop and pick up.
- Place on supported/unsupported terrain, remove support, place in pot, convert by recipes; show each state.

Existing test files to inspect (coverage unverified): [tests/item_icons.test.js](../../tests/item_icons.test.js), [tests/itemForms.test.js](../../tests/itemForms.test.js), [tests/placeableItems.test.js](../../tests/placeableItems.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:wither_rose` NOT_STARTED | Wither Rose | [Wither Rose](https://minecraft.wiki/w/Wither_Rose) | `B:431` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A004 — Flower pots and potted states 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Pot body/cavity and contained plant are separate correctly scaled models; all potted variants retain texture transparency.
- Insert/remove supported plants with correct item return; break drops, support, water interaction and persistence.

**Required Inspector showcase:**

- Empty pot → insert selected plant → extract → break; every contained species and empty/full state.

Existing test files to inspect (coverage unverified): [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/placeableItems.test.js](../../tests/placeableItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:938` NOT_STARTED | Flower Pot · flower_pot | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | `I:flower_pot` | hardness=0; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `I:flower_pot` NOT_STARTED | Flower Pot | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | `B:938` | hardness=0; type=block; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1105` NOT_STARTED | Potted Acacia Sapling · potted_acacia_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1105; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1106` NOT_STARTED | Potted Allium · potted_allium | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1106; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1107` NOT_STARTED | Potted Azalea Bush · potted_azalea_bush | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1107; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1108` NOT_STARTED | Potted Azure Bluet · potted_azure_bluet | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1108; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1109` NOT_STARTED | Potted Bamboo · potted_bamboo | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1109; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1110` NOT_STARTED | Potted Birch Sapling · potted_birch_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1110; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1111` NOT_STARTED | Potted Blue Orchid · potted_blue_orchid | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1111; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1112` NOT_STARTED | Potted Brown Mushroom · potted_brown_mushroom | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1112; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1113` NOT_STARTED | Potted Cactus · potted_cactus | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1113; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1114` NOT_STARTED | Potted Cherry Sapling · potted_cherry_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1114; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1115` NOT_STARTED | Potted Closed Eyeblossom · potted_closed_eyeblossom | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1115; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1116` NOT_STARTED | Potted Cornflower · potted_cornflower | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1116; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1117` NOT_STARTED | Potted Crimson Fungus · potted_crimson_fungus | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1117; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1118` NOT_STARTED | Potted Crimson Roots · potted_crimson_roots | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1118; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1119` NOT_STARTED | Potted Dandelion · potted_dandelion | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1119; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1120` NOT_STARTED | Potted Dark Oak Sapling · potted_dark_oak_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1120; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1121` NOT_STARTED | Potted Dead Bush · potted_dead_bush | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1121; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1122` NOT_STARTED | Potted Fern · potted_fern | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1122; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |

## A005 — Flower pots and potted states 2

Rows: 19. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Pot body/cavity and contained plant are separate correctly scaled models; all potted variants retain texture transparency.
- Insert/remove supported plants with correct item return; break drops, support, water interaction and persistence.

**Required Inspector showcase:**

- Empty pot → insert selected plant → extract → break; every contained species and empty/full state.

Existing test files to inspect (coverage unverified): [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/placeableItems.test.js](../../tests/placeableItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1123` NOT_STARTED | Potted Flowering Azalea Bush · potted_flowering_azalea_bush | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1123; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1124` NOT_STARTED | Potted Jungle Sapling · potted_jungle_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1124; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1125` NOT_STARTED | Potted Lily of the Valley · potted_lily_of_the_valley | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1125; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1126` NOT_STARTED | Potted Mangrove Propagule · potted_mangrove_propagule | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1126; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1127` NOT_STARTED | Potted Oak Sapling · potted_oak_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1127; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1128` NOT_STARTED | Potted Open Eyeblossom · potted_open_eyeblossom | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1128; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1129` NOT_STARTED | Potted Orange Tulip · potted_orange_tulip | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1129; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1130` NOT_STARTED | Potted Oxeye Daisy · potted_oxeye_daisy | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1130; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1131` NOT_STARTED | Potted Pale Oak Sapling · potted_pale_oak_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1131; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1132` NOT_STARTED | Potted Pink Tulip · potted_pink_tulip | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1132; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1133` NOT_STARTED | Potted Poppy · potted_poppy | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1133; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1134` NOT_STARTED | Potted Red Mushroom · potted_red_mushroom | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1134; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1135` NOT_STARTED | Potted Red Tulip · potted_red_tulip | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1135; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1136` NOT_STARTED | Potted Spruce Sapling · potted_spruce_sapling | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1136; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1137` NOT_STARTED | Potted Torchflower · potted_torchflower | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1137; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1138` NOT_STARTED | Potted Warped Fungus · potted_warped_fungus | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1138; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1139` NOT_STARTED | Potted Warped Roots · potted_warped_roots | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1139; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1140` NOT_STARTED | Potted White Tulip · potted_white_tulip | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1140; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1141` NOT_STARTED | Potted Wither Rose · potted_wither_rose | [Flower Pot](https://minecraft.wiki/w/Flower_Pot) | No paired form declared | hardness=0; drop=1141; flowerPot=true; transparent=true; present-in-pinned-1.21.4 |

## A006 — Crops, stems, seeds and growth stages 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-stage geometry, texture and hitbox; seeds/crop item must not be confused with placed crop states.
- Valid farmland/support, light/water and growth conditions; deterministic random-tick fixtures and bone meal eligibility.
- Mature/immature harvest, replant, Fortune, trampling/support loss; special stem attachment and fruit generation.

**Required Inspector showcase:**

- Plant → all growth states → bone meal/invalid bone meal → harvest → replant; dry/dark/support-loss controls.

Existing test files to inspect (coverage unverified): [tests/farming.test.js](../../tests/farming.test.js), [tests/recipeIngredients.test.js](../../tests/recipeIngredients.test.js), [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1048` NOT_STARTED | Attached Melon Stem · attached_melon_stem | [Attached Melon Stem](https://minecraft.wiki/w/Attached_Melon_Stem) | No paired form declared | hardness=0; dropItem=melon_seeds; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1047` NOT_STARTED | Attached Pumpkin Stem · attached_pumpkin_stem | [Attached Pumpkin Stem](https://minecraft.wiki/w/Attached_Pumpkin_Stem) | No paired form declared | hardness=0; dropItem=pumpkin_seeds; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:beetroot_seeds` NOT_STARTED | Beetroot Seeds | [Beetroot Seeds](https://minecraft.wiki/w/Beetroot_Seeds) | No paired form declared | type=seed; present-in-pinned-1.21.4 |
| `B:1167` NOT_STARTED | Beetroots · beetroots_stage_3 | [Beetroots](https://minecraft.wiki/w/Beetroots) | No paired form declared | hardness=0; dropItem=beetroot_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:1216` NOT_STARTED | Beetroots · beetroots_stage_0 | [Beetroots](https://minecraft.wiki/w/Beetroots) | No paired form declared | hardness=0; dropItem=beetroot_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:1217` NOT_STARTED | Beetroots · beetroots_stage_1 | [Beetroots](https://minecraft.wiki/w/Beetroots) | No paired form declared | hardness=0; dropItem=beetroot_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:1218` NOT_STARTED | Beetroots · beetroots_stage_2 | [Beetroots](https://minecraft.wiki/w/Beetroots) | No paired form declared | hardness=0; dropItem=beetroot_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:172` NOT_STARTED | Carrots · carrots_stage_0 | [Carrot](https://minecraft.wiki/w/Carrot) | No paired form declared | stage=0; crop=carrots; hardness=0; dropItem=carrot; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:173` NOT_STARTED | Carrots · carrots_stage_1 | [Carrot](https://minecraft.wiki/w/Carrot) | No paired form declared | stage=1; crop=carrots; hardness=0; dropItem=carrot; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:174` NOT_STARTED | Carrots · carrots_stage_2 | [Carrot](https://minecraft.wiki/w/Carrot) | No paired form declared | stage=2; crop=carrots; hardness=0; dropItem=carrot; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:175` NOT_STARTED | Carrots · carrots_stage_3, carrots | [Carrot](https://minecraft.wiki/w/Carrot) | No paired form declared | stage=3; crop=carrots; mature=true; hardness=0; dropItem=carrot; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1041` NOT_STARTED | Cave Vines · cave_vines | [Cave Vines](https://minecraft.wiki/w/Cave_Vines) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1044` NOT_STARTED | Cave Vines Plant · cave_vines_plant | [Cave Vines Plant](https://minecraft.wiki/w/Cave_Vines_Plant) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1168` NOT_STARTED | Cocoa · cocoa | [Cocoa](https://minecraft.wiki/w/Cocoa) | No paired form declared | hardness=0.2; dropItem=cocoa_beans; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:cocoa_beans` NOT_STARTED | Cocoa Beans | [Cocoa Beans](https://minecraft.wiki/w/Cocoa_Beans) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:melon_seeds` NOT_STARTED | Melon Seeds | [Melon Seeds](https://minecraft.wiki/w/Melon_Seeds) | No paired form declared | type=seed; present-in-pinned-1.21.4 |
| `B:1046` NOT_STARTED | Melon Stem · melon_stem | [Melon Stem](https://minecraft.wiki/w/Melon_Stem) | No paired form declared | hardness=0; dropItem=melon_seeds; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1213` NOT_STARTED | Nether Wart · nether_wart | [Nether Wart](https://minecraft.wiki/w/Nether_Wart) | `I:nether_wart` | hardness=0; dropItem=nether_wart; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:nether_wart` NOT_STARTED | Nether Wart | [Nether Wart](https://minecraft.wiki/w/Nether_Wart) | `B:1213` | hardness=0; dropItem=nether_wart; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:123` NOT_STARTED | Nether Wart Block · nether_wart_block | [Nether Wart Block](https://minecraft.wiki/w/Nether_Wart_Block) | No paired form declared | hardness=1; drop=123; present-in-pinned-1.21.4 |

## A007 — Crops, stems, seeds and growth stages 2

Rows: 19. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-stage geometry, texture and hitbox; seeds/crop item must not be confused with placed crop states.
- Valid farmland/support, light/water and growth conditions; deterministic random-tick fixtures and bone meal eligibility.
- Mature/immature harvest, replant, Fortune, trampling/support loss; special stem attachment and fruit generation.

**Required Inspector showcase:**

- Plant → all growth states → bone meal/invalid bone meal → harvest → replant; dry/dark/support-loss controls.

Existing test files to inspect (coverage unverified): [tests/farming.test.js](../../tests/farming.test.js), [tests/recipeIngredients.test.js](../../tests/recipeIngredients.test.js), [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:176` NOT_STARTED | Potatoes · potatoes_stage_0 | [Potato](https://minecraft.wiki/w/Potato) | No paired form declared | stage=0; crop=potatoes; hardness=0; dropItem=potato; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:177` NOT_STARTED | Potatoes · potatoes_stage_1 | [Potato](https://minecraft.wiki/w/Potato) | No paired form declared | stage=1; crop=potatoes; hardness=0; dropItem=potato; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:178` NOT_STARTED | Potatoes · potatoes_stage_2 | [Potato](https://minecraft.wiki/w/Potato) | No paired form declared | stage=2; crop=potatoes; hardness=0; dropItem=potato; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:179` NOT_STARTED | Potatoes · potatoes_stage_3 | [Potato](https://minecraft.wiki/w/Potato) | No paired form declared | stage=3; crop=potatoes; mature=true; hardness=0; dropItem=potato; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `I:pumpkin_seeds` NOT_STARTED | Pumpkin Seeds | [Pumpkin Seeds](https://minecraft.wiki/w/Pumpkin_Seeds) | No paired form declared | type=seed; present-in-pinned-1.21.4 |
| `B:1045` NOT_STARTED | Pumpkin Stem · pumpkin_stem | [Pumpkin Stem](https://minecraft.wiki/w/Pumpkin_Stem) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:428` NOT_STARTED | Sweet Berry Bush · sweet_berry_bush | [Sweet Berry Bush](https://minecraft.wiki/w/Sweet_Berry_Bush) | `I:sweet_berry_bush` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:sweet_berry_bush` NOT_STARTED | Sweet Berry Bush | [Sweet Berry Bush](https://minecraft.wiki/w/Sweet_Berry_Bush) | `B:428` | hardness=0; type=block; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `I:torchflower_seeds` NOT_STARTED | Torchflower Seeds | [Torchflower Seeds](https://minecraft.wiki/w/Torchflower_Seeds) | No paired form declared | type=seed; present-in-pinned-1.21.4 |
| `I:wheat` NOT_STARTED | Wheat | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:164` NOT_STARTED | Wheat Crops · wheat_stage_0 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=0; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:165` NOT_STARTED | Wheat Crops · wheat_stage_1 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=1; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:166` NOT_STARTED | Wheat Crops · wheat_stage_2 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=2; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:167` NOT_STARTED | Wheat Crops · wheat_stage_3 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=3; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:168` NOT_STARTED | Wheat Crops · wheat_stage_4 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=4; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:169` NOT_STARTED | Wheat Crops · wheat_stage_5 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=5; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:170` NOT_STARTED | Wheat Crops · wheat_stage_6 | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=6; crop=wheat; hardness=0; dropItem=wheat_seeds; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:171` NOT_STARTED | Wheat Crops · wheat_stage_7, wheat | [Wheat](https://minecraft.wiki/w/Wheat) | No paired form declared | stage=7; crop=wheat; mature=true; hardness=0; dropItem=wheat; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:wheat_seeds` NOT_STARTED | Wheat Seeds | [Wheat Seeds](https://minecraft.wiki/w/Wheat_Seeds) | No paired form declared | crop=wheat; type=seed; present-in-pinned-1.21.4 |

## A008 — Aquatic plants and coral 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Underwater silhouette/alpha, waterlogging and water-face culling; living/dead, fan/wall-fan and tall variants.
- Required water/substrate/support; death/drying, placement direction, growth/bone meal, harvesting tool and drops.

**Required Inspector showcase:**

- Place submerged and dry, drain/refill water, grow/harvest, inspect fans from both sides and cross chunk borders.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/waterFlow.test.js](../../tests/waterFlow.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1204` NOT_STARTED | Brain Coral · brain_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:brain_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:brain_coral` NOT_STARTED | Brain Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1204` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:995` NOT_STARTED | Brain Coral Block · brain_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1000; present-in-pinned-1.21.4 |
| `B:1030` NOT_STARTED | Brain Coral Fan · brain_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1030; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1160` NOT_STARTED | Brain Coral Wall Fan · brain_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1160; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1205` NOT_STARTED | Bubble Coral · bubble_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:bubble_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:bubble_coral` NOT_STARTED | Bubble Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1205` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:996` NOT_STARTED | Bubble Coral Block · bubble_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1001; present-in-pinned-1.21.4 |
| `B:1031` NOT_STARTED | Bubble Coral Fan · bubble_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1031; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1161` NOT_STARTED | Bubble Coral Wall Fan · bubble_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1161; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1209` NOT_STARTED | Dead Brain Coral · dead_brain_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:dead_brain_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dead_brain_coral` NOT_STARTED | Dead Brain Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1209` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1000` NOT_STARTED | Dead Brain Coral Block · dead_brain_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1000; present-in-pinned-1.21.4 |
| `B:1035` NOT_STARTED | Dead Brain Coral Fan · dead_brain_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1155` NOT_STARTED | Dead Brain Coral Wall Fan · dead_brain_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1210` NOT_STARTED | Dead Bubble Coral · dead_bubble_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:dead_bubble_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dead_bubble_coral` NOT_STARTED | Dead Bubble Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1210` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1001` NOT_STARTED | Dead Bubble Coral Block · dead_bubble_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1001; present-in-pinned-1.21.4 |
| `B:1036` NOT_STARTED | Dead Bubble Coral Fan · dead_bubble_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1156` NOT_STARTED | Dead Bubble Coral Wall Fan · dead_bubble_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A009 — Aquatic plants and coral 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Underwater silhouette/alpha, waterlogging and water-face culling; living/dead, fan/wall-fan and tall variants.
- Required water/substrate/support; death/drying, placement direction, growth/bone meal, harvesting tool and drops.

**Required Inspector showcase:**

- Place submerged and dry, drain/refill water, grow/harvest, inspect fans from both sides and cross chunk borders.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/waterFlow.test.js](../../tests/waterFlow.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1211` NOT_STARTED | Dead Fire Coral · dead_fire_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:dead_fire_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dead_fire_coral` NOT_STARTED | Dead Fire Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1211` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1002` NOT_STARTED | Dead Fire Coral Block · dead_fire_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1002; present-in-pinned-1.21.4 |
| `B:1037` NOT_STARTED | Dead Fire Coral Fan · dead_fire_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1157` NOT_STARTED | Dead Fire Coral Wall Fan · dead_fire_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1212` NOT_STARTED | Dead Horn Coral · dead_horn_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:dead_horn_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dead_horn_coral` NOT_STARTED | Dead Horn Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1212` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1003` NOT_STARTED | Dead Horn Coral Block · dead_horn_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1003; present-in-pinned-1.21.4 |
| `B:1038` NOT_STARTED | Dead Horn Coral Fan · dead_horn_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1158` NOT_STARTED | Dead Horn Coral Wall Fan · dead_horn_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1208` NOT_STARTED | Dead Tube Coral · dead_tube_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:dead_tube_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dead_tube_coral` NOT_STARTED | Dead Tube Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1208` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:999` NOT_STARTED | Dead Tube Coral Block · dead_tube_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=999; present-in-pinned-1.21.4 |
| `B:1034` NOT_STARTED | Dead Tube Coral Fan · dead_tube_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1154` NOT_STARTED | Dead Tube Coral Wall Fan · dead_tube_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=null; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:dried_kelp` NOT_STARTED | Dried Kelp | [Dried Kelp](https://minecraft.wiki/w/Dried_Kelp) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `B:574` NOT_STARTED | Dried Kelp Block · dried_kelp_block | [Dried Kelp Block](https://minecraft.wiki/w/Dried_Kelp_Block) | `I:dried_kelp_block` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:dried_kelp_block` NOT_STARTED | Dried Kelp Block | [Dried Kelp Block](https://minecraft.wiki/w/Dried_Kelp_Block) | `B:574` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:1206` NOT_STARTED | Fire Coral · fire_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:fire_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:fire_coral` NOT_STARTED | Fire Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1206` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A010 — Aquatic plants and coral 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Underwater silhouette/alpha, waterlogging and water-face culling; living/dead, fan/wall-fan and tall variants.
- Required water/substrate/support; death/drying, placement direction, growth/bone meal, harvesting tool and drops.

**Required Inspector showcase:**

- Place submerged and dry, drain/refill water, grow/harvest, inspect fans from both sides and cross chunk borders.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/waterFlow.test.js](../../tests/waterFlow.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:997` NOT_STARTED | Fire Coral Block · fire_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1002; present-in-pinned-1.21.4 |
| `B:1032` NOT_STARTED | Fire Coral Fan · fire_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1032; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1162` NOT_STARTED | Fire Coral Wall Fan · fire_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1162; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1207` NOT_STARTED | Horn Coral · horn_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:horn_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:horn_coral` NOT_STARTED | Horn Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1207` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:998` NOT_STARTED | Horn Coral Block · horn_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=1003; present-in-pinned-1.21.4 |
| `B:1033` NOT_STARTED | Horn Coral Fan · horn_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1033; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1163` NOT_STARTED | Horn Coral Wall Fan · horn_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1163; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1051` NOT_STARTED | Kelp · kelp | [Kelp](https://minecraft.wiki/w/Kelp) | `I:kelp` | hardness=0; dropItem=kelp; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:kelp` NOT_STARTED | Kelp | [Kelp](https://minecraft.wiki/w/Kelp) | `B:1051` | hardness=0; dropItem=kelp; type=food; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1052` NOT_STARTED | Kelp Plant · kelp_plant | [Kelp Plant](https://minecraft.wiki/w/Kelp_Plant) | No paired form declared | hardness=0; dropItem=kelp; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:147` NOT_STARTED | Lily Pad · lily_pad | [Lily Pad](https://minecraft.wiki/w/Lily_Pad) | No paired form declared | hardness=0; drop=147; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1053` NOT_STARTED | Sea Pickle · sea_pickle | [Sea Pickle](https://minecraft.wiki/w/Sea_Pickle) | No paired form declared | light=6; hardness=0; drop=1053; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1049` NOT_STARTED | Seagrass · seagrass | [Seagrass](https://minecraft.wiki/w/Seagrass) | `I:seagrass` | hardness=0; dropItem=seagrass; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:seagrass` NOT_STARTED | Seagrass | [Seagrass](https://minecraft.wiki/w/Seagrass) | `B:1049` | hardness=0; dropItem=seagrass; type=material; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1050` NOT_STARTED | Tall Seagrass · tall_seagrass | [Tall Seagrass](https://minecraft.wiki/w/Tall_Seagrass) | No paired form declared | hardness=0; dropItem=seagrass; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1203` NOT_STARTED | Tube Coral · tube_coral | [Coral](https://minecraft.wiki/w/Coral) | `I:tube_coral` | hardness=0; drop=null; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:tube_coral` NOT_STARTED | Tube Coral | [Coral](https://minecraft.wiki/w/Coral) | `B:1203` | hardness=0; drop=null; type=block; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:994` NOT_STARTED | Tube Coral Block · tube_coral_block | [Coral Block](https://minecraft.wiki/w/Coral_Block) | No paired form declared | hardness=1.5; drop=999; present-in-pinned-1.21.4 |
| `B:1029` NOT_STARTED | Tube Coral Fan · tube_coral_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1029; plant=true; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A011 — Aquatic plants and coral 4

Rows: 1. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Underwater silhouette/alpha, waterlogging and water-face culling; living/dead, fan/wall-fan and tall variants.
- Required water/substrate/support; death/drying, placement direction, growth/bone meal, harvesting tool and drops.

**Required Inspector showcase:**

- Place submerged and dry, drain/refill water, grow/harvest, inspect fans from both sides and cross chunk borders.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/waterFlow.test.js](../../tests/waterFlow.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1159` NOT_STARTED | Tube Coral Wall Fan · tube_coral_wall_fan | [Coral Fan](https://minecraft.wiki/w/Coral_Fan) | No paired form declared | hardness=0; drop=1159; waterPlant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A012 — Saplings and propagules 1

Rows: 11. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held/dropped plant model and hanging/rooted states.
- Substrates, light/space, growth stages, bone meal, required multi-sapling arrangements and failed growth; tree drops.

**Required Inspector showcase:**

- Equip → place → constrained/open growth → harvest; species and multi-sapling variants.

Existing test files to inspect (coverage unverified): [tests/treePlacement.test.js](../../tests/treePlacement.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:963` NOT_STARTED | Acacia Sapling · acacia_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=963; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1202` NOT_STARTED | Bamboo Sapling · bamboo_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | `I:bamboo_sapling` | hardness=1; dropItem=bamboo; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:bamboo_sapling` NOT_STARTED | Bamboo Sapling | [Sapling](https://minecraft.wiki/w/Sapling) | `B:1202` | hardness=1; dropItem=bamboo; type=block; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:961` NOT_STARTED | Birch Sapling · birch_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=961; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:964` NOT_STARTED | Cherry Sapling · cherry_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=964; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:965` NOT_STARTED | Dark Oak Sapling · dark_oak_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=965; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:962` NOT_STARTED | Jungle Sapling · jungle_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=962; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:967` NOT_STARTED | Mangrove Propagule · mangrove_propagule | [Mangrove Propagule](https://minecraft.wiki/w/Mangrove_Propagule) | No paired form declared | hardness=0; drop=967; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:959` NOT_STARTED | Oak Sapling · oak_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=959; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:966` NOT_STARTED | Pale Oak Sapling · pale_oak_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=966; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:960` NOT_STARTED | Spruce Sapling · spruce_sapling | [Sapling](https://minecraft.wiki/w/Sapling) | No paired form declared | hardness=0; drop=960; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A013 — Leaves 1

Rows: 11. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Cutout textures, biome tint, hand/drop/world representations, wind only on foliage, opaque/transparent occlusion.
- Decay, persistent state, logs/distance, waterlogging, shears/Silk Touch/Fortune drops and species-specific fruit/saplings.

**Required Inspector showcase:**

- Place leaves → remove supporting log → decay; harvest with hand, shears and enchanted tool; inspect wind versus stone.

Existing test files to inspect (coverage unverified): [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:93` NOT_STARTED | Acacia Leaves · acacia_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=93; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:136` NOT_STARTED | Azalea Leaves · azalea_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=136; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:84` NOT_STARTED | Birch Leaves · birch_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=84; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:81` NOT_STARTED | Cherry Leaves · cherry_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=81; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:96` NOT_STARTED | Dark Oak Leaves · dark_oak_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=96; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:991` NOT_STARTED | Flowering Azalea Leaves · flowering_azalea_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=null; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:90` NOT_STARTED | Jungle Leaves · jungle_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=90; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:99` NOT_STARTED | Mangrove Leaves · mangrove_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=99; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:9` NOT_STARTED | Oak Leaves · oak_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=9; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:104` NOT_STARTED | Pale Oak Leaves · pale_oak_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=104; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:87` NOT_STARTED | Spruce Leaves · spruce_leaves | [Leaves](https://minecraft.wiki/w/Leaves) | No paired form declared | hardness=0.2; drop=87; transparent=true; solid=true; present-in-pinned-1.21.4 |

## A014 — Mushrooms and Nether fungi 1

Rows: 12. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Small versus huge form, caps/stems/sides, held cutout and spores if applicable.
- Support/light/spreading/growth/bone meal rules, huge-form clearance, harvesting and recipe/food uses.

**Required Inspector showcase:**

- Place → grow with enough/insufficient space → harvest cap/stem and small form.

Existing test files to inspect (coverage unverified): [tests/farming.test.js](../../tests/farming.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:417` NOT_STARTED | Brown Mushroom · brown_mushroom | [Brown Mushroom](https://minecraft.wiki/w/Brown_Mushroom) | `I:brown_mushroom` | light=1; hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:brown_mushroom` NOT_STARTED | Brown Mushroom | [Brown Mushroom](https://minecraft.wiki/w/Brown_Mushroom) | `B:417` | light=1; hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:108` NOT_STARTED | Brown Mushroom Block · brown_mushroom_block | [Brown Mushroom Block](https://minecraft.wiki/w/Brown_Mushroom_Block) | No paired form declared | hardness=0.2; drop=108; present-in-pinned-1.21.4 |
| `B:217` NOT_STARTED | Crimson Fungus · crimson_fungus | [Crimson Fungus](https://minecraft.wiki/w/Crimson_Fungus) | No paired form declared | shape=cross; hardness=0; drop=217; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:109` NOT_STARTED | Mushroom Stem · mushroom_stem | [Mushroom Stem](https://minecraft.wiki/w/Mushroom_Stem) | No paired form declared | hardness=0.2; drop=109; present-in-pinned-1.21.4 |
| `I:mushroom_stew` NOT_STARTED | Mushroom Stew | [Mushroom Stew](https://minecraft.wiki/w/Mushroom_Stew) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |
| `B:106` NOT_STARTED | Mycelium · mycelium | [Mycelium](https://minecraft.wiki/w/Mycelium) | No paired form declared | hardness=0.6; drop=2; present-in-pinned-1.21.4 |
| `B:426` NOT_STARTED | Red Mushroom · red_mushroom | [Red Mushroom](https://minecraft.wiki/w/Red_Mushroom) | `I:red_mushroom` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:red_mushroom` NOT_STARTED | Red Mushroom | [Red Mushroom](https://minecraft.wiki/w/Red_Mushroom) | `B:426` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:107` NOT_STARTED | Red Mushroom Block · red_mushroom_block | [Red Mushroom Block](https://minecraft.wiki/w/Red_Mushroom_Block) | No paired form declared | hardness=0.2; drop=107; present-in-pinned-1.21.4 |
| `B:216` NOT_STARTED | Warped Fungus · warped_fungus | [Warped Fungus](https://minecraft.wiki/w/Warped_Fungus) | No paired form declared | shape=cross; hardness=0; drop=216; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:warped_fungus_on_a_stick` NOT_STARTED | Warped Fungus on a Stick | [Warped Fungus on a Stick](https://minecraft.wiki/w/Warped_Fungus_on_a_Stick) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |

## A015 — Other vegetation, vines and ground cover 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.
- Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.

**Required Inspector showcase:**

- Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/farming.test.js](../../tests/farming.test.js), [tests/ambientParticles.test.js](../../tests/ambientParticles.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1009` NOT_STARTED | Amethyst Cluster · amethyst_cluster | [Amethyst Cluster](https://minecraft.wiki/w/Amethyst_Cluster) | No paired form declared | light=5; hardness=1.5; dropItem=amethyst_shard; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:992` NOT_STARTED | Azalea · azalea | [Azalea](https://minecraft.wiki/w/Azalea) | No paired form declared | hardness=0; drop=992; present-in-pinned-1.21.4 |
| `B:145` NOT_STARTED | Bamboo · bamboo | [Bamboo](https://minecraft.wiki/w/Bamboo) | `I:bamboo` | hardness=1; drop=145; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:bamboo` NOT_STARTED | Bamboo | [Bamboo](https://minecraft.wiki/w/Bamboo) | `B:145` | hardness=1; drop=145; type=material; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:645` NOT_STARTED | Bamboo Block · bamboo_block | [Bamboo Block](https://minecraft.wiki/w/Bamboo_Block) | `I:bamboo_block` | hardness=2; present-in-pinned-1.21.4 |
| `B:270` NOT_STARTED | Bamboo Button · bamboo_button | [Bamboo Button](https://minecraft.wiki/w/Bamboo_Button) | `I:bamboo_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_button` NOT_STARTED | Bamboo Button | [Bamboo Button](https://minecraft.wiki/w/Bamboo_Button) | `B:270` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:837` NOT_STARTED | Bamboo Door · bamboo_door | [Door](https://minecraft.wiki/w/Door) | `I:bamboo_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_door` NOT_STARTED | Bamboo Door | [Door](https://minecraft.wiki/w/Door) | `B:837` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:838` NOT_STARTED | Bamboo Door Open · bamboo_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:839` NOT_STARTED | Bamboo Door Top · bamboo_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:840` NOT_STARTED | Bamboo Door Top Open · bamboo_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:373` NOT_STARTED | Bamboo Fence · bamboo_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:bamboo_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:bamboo_fence` NOT_STARTED | Bamboo Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:373` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:361` NOT_STARTED | Bamboo Fence Gate · bamboo_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:bamboo_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:bamboo_fence_gate` NOT_STARTED | Bamboo Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:361` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:903` NOT_STARTED | Bamboo Hanging Sign · bamboo_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:bamboo_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_hanging_sign` NOT_STARTED | Bamboo Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:903` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:721` NOT_STARTED | Bamboo Mosaic · bamboo_mosaic | [Bamboo Mosaic](https://minecraft.wiki/w/Bamboo_Mosaic) | `I:bamboo_mosaic` | hardness=2; present-in-pinned-1.21.4 |
| `I:bamboo_mosaic` NOT_STARTED | Bamboo Mosaic | [Bamboo Mosaic](https://minecraft.wiki/w/Bamboo_Mosaic) | `B:721` | hardness=2; type=block; present-in-pinned-1.21.4 |

## A016 — Other vegetation, vines and ground cover 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.
- Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.

**Required Inspector showcase:**

- Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/farming.test.js](../../tests/farming.test.js), [tests/ambientParticles.test.js](../../tests/ambientParticles.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:450` NOT_STARTED | Bamboo Mosaic Slab · bamboo_mosaic_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:bamboo_mosaic_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:bamboo_mosaic_slab` NOT_STARTED | Bamboo Mosaic Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:450` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:512` NOT_STARTED | Bamboo Mosaic Stairs · bamboo_mosaic_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:bamboo_mosaic_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:bamboo_mosaic_stairs` NOT_STARTED | Bamboo Mosaic Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:512` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:411` NOT_STARTED | Bamboo Planks · bamboo_planks | [Planks](https://minecraft.wiki/w/Planks) | `I:bamboo_planks` | hardness=2; present-in-pinned-1.21.4 |
| `I:bamboo_planks` NOT_STARTED | Bamboo Planks | [Planks](https://minecraft.wiki/w/Planks) | `B:411` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:433` NOT_STARTED | Bamboo Pressure Plate · bamboo_pressure_plate | [Bamboo Pressure Plate](https://minecraft.wiki/w/Bamboo_Pressure_Plate) | `I:bamboo_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_pressure_plate` NOT_STARTED | Bamboo Pressure Plate | [Bamboo Pressure Plate](https://minecraft.wiki/w/Bamboo_Pressure_Plate) | `B:433` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_raft` NOT_STARTED | Bamboo Raft | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:bamboo_chest_raft` NOT_STARTED | Bamboo Raft with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `B:926` NOT_STARTED | Bamboo Sign · bamboo_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:bamboo_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_sign` NOT_STARTED | Bamboo Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:926` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:451` NOT_STARTED | Bamboo Slab · bamboo_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:bamboo_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:bamboo_slab` NOT_STARTED | Bamboo Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:451` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:513` NOT_STARTED | Bamboo Stairs · bamboo_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:bamboo_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:bamboo_stairs` NOT_STARTED | Bamboo Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:513` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:803` NOT_STARTED | Bamboo Trapdoor · bamboo_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:bamboo_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:bamboo_trapdoor` NOT_STARTED | Bamboo Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:803` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:804` NOT_STARTED | Bamboo Trapdoor Open · bamboo_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:904` NOT_STARTED | Bamboo Wall Hanging Sign · bamboo_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:bamboo_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |

## A017 — Other vegetation, vines and ground cover 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.
- Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.

**Required Inspector showcase:**

- Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/farming.test.js](../../tests/farming.test.js), [tests/ambientParticles.test.js](../../tests/ambientParticles.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:bamboo_wall_hanging_sign` NOT_STARTED | Bamboo Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:904` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1151` NOT_STARTED | Bamboo Wall Sign · bamboo_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1151; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1071` NOT_STARTED | Big Dripleaf · big_dripleaf | [Big Dripleaf](https://minecraft.wiki/w/Big_Dripleaf) | No paired form declared | hardness=0.1; drop=1071; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1072` NOT_STARTED | Big Dripleaf Stem · big_dripleaf_stem | [Big Dripleaf Stem](https://minecraft.wiki/w/Big_Dripleaf_Stem) | No paired form declared | hardness=0.1; drop=1071; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:bamboo_block` NOT_STARTED | Block of Bamboo | [Block of Bamboo](https://minecraft.wiki/w/Block_of_Bamboo) | `B:645` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `I:stripped_bamboo_block` NOT_STARTED | Block of Stripped Bamboo | [Block of Stripped Bamboo](https://minecraft.wiki/w/Block_of_Stripped_Bamboo) | `B:675` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:27` NOT_STARTED | Cactus · cactus | [Cactus](https://minecraft.wiki/w/Cactus) | No paired form declared | hardness=0.4; drop=27; present-in-pinned-1.21.4 |
| `B:982` NOT_STARTED | Cobweb · cobweb | [Cobweb](https://minecraft.wiki/w/Cobweb) | No paired form declared | hardness=4; dropItem=string; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:419` NOT_STARTED | Crimson Roots · crimson_roots | [Crimson Roots](https://minecraft.wiki/w/Crimson_Roots) | `I:crimson_roots` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:crimson_roots` NOT_STARTED | Crimson Roots | [Crimson Roots](https://minecraft.wiki/w/Crimson_Roots) | `B:419` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:981` NOT_STARTED | Dead Bush · dead_bush | [Dead Bush](https://minecraft.wiki/w/Dead_Bush) | No paired form declared | hardness=0; dropItem=stick; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:980` NOT_STARTED | Fern · fern | [Fern](https://minecraft.wiki/w/Fern) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:57` NOT_STARTED | Fire · fire | [Fire](https://minecraft.wiki/w/Fire) | No paired form declared | shape=cross; light=15; lightColor=16746547; hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1220` NOT_STARTED | Firefly Bush · firefly_bush | [Firefly Bush](https://minecraft.wiki/w/Firefly_Bush) | `I:firefly_bush` | light=2; hardness=0; drop=1220; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `I:firefly_bush` NOT_STARTED | Firefly Bush | [Firefly Bush](https://minecraft.wiki/w/Firefly_Bush) | `B:1220` | light=2; hardness=0; drop=1220; type=block; plant=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:993` NOT_STARTED | Flowering Azalea · flowering_azalea | [Flowering Azalea](https://minecraft.wiki/w/Flowering_Azalea) | No paired form declared | hardness=0; drop=993; present-in-pinned-1.21.4 |
| `B:420` NOT_STARTED | Glow Lichen · glow_lichen | [Glow Lichen](https://minecraft.wiki/w/Glow_Lichen) | `I:glow_lichen` | light=7; hardness=0.2; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:glow_lichen` NOT_STARTED | Glow Lichen | [Glow Lichen](https://minecraft.wiki/w/Glow_Lichen) | `B:420` | light=7; hardness=0.2; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1007` NOT_STARTED | Hanging Roots · hanging_roots | [Hanging Roots](https://minecraft.wiki/w/Hanging_Roots) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1010` NOT_STARTED | Large Amethyst Bud · large_amethyst_bud | [Large Amethyst Bud](https://minecraft.wiki/w/Large_Amethyst_Bud) | No paired form declared | light=4; hardness=1.5; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A018 — Other vegetation, vines and ground cover 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.
- Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.

**Required Inspector showcase:**

- Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/farming.test.js](../../tests/farming.test.js), [tests/ambientParticles.test.js](../../tests/ambientParticles.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1005` NOT_STARTED | Large Fern · large_fern | [Large Fern](https://minecraft.wiki/w/Large_Fern) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:100` NOT_STARTED | Mangrove Roots · mangrove_roots | [Mangrove Roots](https://minecraft.wiki/w/Mangrove_Roots) | No paired form declared | hardness=0.7; drop=100; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:1011` NOT_STARTED | Medium Amethyst Bud · medium_amethyst_bud | [Medium Amethyst Bud](https://minecraft.wiki/w/Medium_Amethyst_Bud) | No paired form declared | light=2; hardness=1.5; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:135` NOT_STARTED | Moss Carpet · moss_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | No paired form declared | hardness=0.1; drop=135; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:939` NOT_STARTED | Muddy Mangrove Roots · muddy_mangrove_roots | [Muddy Mangrove Roots](https://minecraft.wiki/w/Muddy_Mangrove_Roots) | `I:muddy_mangrove_roots` | hardness=0.7; present-in-pinned-1.21.4 |
| `I:muddy_mangrove_roots` NOT_STARTED | Muddy Mangrove Roots | [Muddy Mangrove Roots](https://minecraft.wiki/w/Muddy_Mangrove_Roots) | `B:939` | hardness=0.7; type=block; present-in-pinned-1.21.4 |
| `B:422` NOT_STARTED | Nether Sprouts · nether_sprouts | [Nether Sprouts](https://minecraft.wiki/w/Nether_Sprouts) | `I:nether_sprouts` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:nether_sprouts` NOT_STARTED | Nether Sprouts | [Nether Sprouts](https://minecraft.wiki/w/Nether_Sprouts) | `B:422` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1075` NOT_STARTED | Pale Hanging Moss · pale_hanging_moss | [Pale Hanging Moss](https://minecraft.wiki/w/Pale_Hanging_Moss) | No paired form declared | hardness=0; drop=1075; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:310` NOT_STARTED | Pale Moss Carpet · pale_moss_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:pale_moss_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:pale_moss_carpet` NOT_STARTED | Pale Moss Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:310` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:1169` NOT_STARTED | Pitcher Crop · pitcher_crop | [Pitcher Crop](https://minecraft.wiki/w/Pitcher_Crop) | No paired form declared | hardness=0; dropItem=pitcher_pod; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:975` NOT_STARTED | Resin Clump · resin_clump | [Resin Clump](https://minecraft.wiki/w/Resin_Clump) | No paired form declared | hardness=0; drop=975; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1074` NOT_STARTED | Sculk Vein · sculk_vein | [Sculk Vein](https://minecraft.wiki/w/Sculk_Vein) | No paired form declared | hardness=0.2; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:979` NOT_STARTED | Short Grass · short_grass | [Grass](https://minecraft.wiki/w/Grass) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1012` NOT_STARTED | Small Amethyst Bud · small_amethyst_bud | [Small Amethyst Bud](https://minecraft.wiki/w/Small_Amethyst_Bud) | No paired form declared | light=1; hardness=1.5; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1073` NOT_STARTED | Small Dripleaf · small_dripleaf | [Small Dripleaf](https://minecraft.wiki/w/Small_Dripleaf) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1171` NOT_STARTED | Soul Fire · soul_fire | [Soul Fire](https://minecraft.wiki/w/Soul_Fire) | No paired form declared | light=10; lightColor=6080982; hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1006` NOT_STARTED | Spore Blossom · spore_blossom | [Spore Blossom](https://minecraft.wiki/w/Spore_Blossom) | No paired form declared | hardness=0; drop=1006; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:675` NOT_STARTED | Stripped Bamboo Block · stripped_bamboo_block | [Stripped Bamboo Block](https://minecraft.wiki/w/Stripped_Bamboo_Block) | `I:stripped_bamboo_block` | hardness=2; present-in-pinned-1.21.4 |

## A019 — Other vegetation, vines and ground cover 5

Rows: 11. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.
- Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.

**Required Inspector showcase:**

- Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.

Existing test files to inspect (coverage unverified): [tests/hangingPlantGeometry.test.js](../../tests/hangingPlantGeometry.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js), [tests/farming.test.js](../../tests/farming.test.js), [tests/ambientParticles.test.js](../../tests/ambientParticles.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:676` NOT_STARTED | Sugar Cane · sugar_cane | [Sugar Cane](https://minecraft.wiki/w/Sugar_Cane) | `I:sugar_cane` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:sugar_cane` NOT_STARTED | Sugar Cane | [Sugar Cane](https://minecraft.wiki/w/Sugar_Cane) | `B:676` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:1004` NOT_STARTED | Tall Grass · tall_grass | [Grass](https://minecraft.wiki/w/Grass) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1040` NOT_STARTED | Twisting Vines · twisting_vines | [Twisting Vines](https://minecraft.wiki/w/Twisting_Vines) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1043` NOT_STARTED | Twisting Vines Plant · twisting_vines_plant | [Twisting Vines Plant](https://minecraft.wiki/w/Twisting_Vines_Plant) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:678` NOT_STARTED | Vine · vine | [Vine](https://minecraft.wiki/w/Vine) | `I:vine` | hardness=0.2; transparent=true; present-in-pinned-1.21.4 |
| `I:vine` NOT_STARTED | Vines | [Vines](https://minecraft.wiki/w/Vines) | `B:678` | hardness=0.2; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:429` NOT_STARTED | Warped Roots · warped_roots | [Warped Roots](https://minecraft.wiki/w/Warped_Roots) | `I:warped_roots` | hardness=0; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:warped_roots` NOT_STARTED | Warped Roots | [Warped Roots](https://minecraft.wiki/w/Warped_Roots) | `B:429` | hardness=0; type=block; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1039` NOT_STARTED | Weeping Vines · weeping_vines | [Weeping Vines](https://minecraft.wiki/w/Weeping_Vines) | No paired form declared | hardness=0; drop=1039; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1042` NOT_STARTED | Weeping Vines Plant · weeping_vines_plant | [Weeping Vines Plant](https://minecraft.wiki/w/Weeping_Vines_Plant) | No paired form declared | hardness=0; drop=null; plant=true; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A020 — Fluids, buckets and bottle contents 1

Rows: 14. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Source/flow/falling surface, reflection/refraction, held/container fill, alpha, splash/underwater transitions.
- Scoop/place source, container replacements, source regeneration, flow/drainage, dimension rules and fluid mixing.
- Entity transport/damage/fire, waterlogging, fish release, powder snow and milk effects as applicable.

**Required Inspector showcase:**

- Fill/scoop/place/empty → break container → flow/drain; mixing, Nether placement, entity release, reload flowing state.

Existing test files to inspect (coverage unverified): [tests/waterFlow.test.js](../../tests/waterFlow.test.js), [tests/waterRules.test.js](../../tests/waterRules.test.js), [tests/lava.test.js](../../tests/lava.test.js), [tests/bottles.test.js](../../tests/bottles.test.js), [tests/fishBuckets.test.js](../../tests/fishBuckets.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1201` NOT_STARTED | Bubble Column · bubble_column | [Bubble Column](https://minecraft.wiki/w/Bubble_Column) | No paired form declared | hardness=0; drop=null; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:bucket` NOT_STARTED | Bucket | [Bucket](https://minecraft.wiki/w/Bucket) | No paired form declared | stackSize=16; type=tool; present-in-pinned-1.21.4 |
| `I:axolotl_bucket` NOT_STARTED | Bucket of Axolotl | [Bucket of Axolotl](https://minecraft.wiki/w/Bucket_of_Axolotl) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:cod_bucket` NOT_STARTED | Bucket of Cod | [Bucket of Cod](https://minecraft.wiki/w/Bucket_of_Cod) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:pufferfish_bucket` NOT_STARTED | Bucket of Pufferfish | [Bucket of Pufferfish](https://minecraft.wiki/w/Bucket_of_Pufferfish) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:salmon_bucket` NOT_STARTED | Bucket of Salmon | [Bucket of Salmon](https://minecraft.wiki/w/Bucket_of_Salmon) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:tadpole_bucket` NOT_STARTED | Bucket of Tadpole | [Bucket of Tadpole](https://minecraft.wiki/w/Bucket_of_Tadpole) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:tropical_fish_bucket` NOT_STARTED | Bucket of Tropical Fish | [Bucket of Tropical Fish](https://minecraft.wiki/w/Bucket_of_Tropical_Fish) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `B:13` NOT_STARTED | Lava · lava | [Lava](https://minecraft.wiki/w/Lava) | No paired form declared | light=15; lightColor=16740388; hardness=100; drop=null; transparent=false; solid=false; present-in-pinned-1.21.4 |
| `I:lava_bucket` NOT_STARTED | Lava Bucket | [Lava Bucket](https://minecraft.wiki/w/Lava_Bucket) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:milk_bucket` NOT_STARTED | Milk Bucket | [Milk Bucket](https://minecraft.wiki/w/Milk_Bucket) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |
| `I:powder_snow_bucket` NOT_STARTED | Powder Snow Bucket | [Powder Snow Bucket](https://minecraft.wiki/w/Powder_Snow_Bucket) | `B:221` | hardness=0.25; drop=221; stackSize=1; type=tool; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:12` NOT_STARTED | Water · water | [Water](https://minecraft.wiki/w/Water) | No paired form declared | hardness=100; drop=null; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:water_bucket` NOT_STARTED | Water Bucket | [Water Bucket](https://minecraft.wiki/w/Water_Bucket) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |

## A021 — Fire, campfires and torches 1

Rows: 10. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Thin/crossed/burning versus extinguished geometry, support/mounting, lit appearance, smoke, sparks, heat and light/shadows.
- Ignition/extinguishing, fuel/cooking where applicable, spread/flammability, rain/water, soul variants and entity damage.

**Required Inspector showcase:**

- Mount/ignite → lit particles/light → rain/water extinguish → support removal; campfire cook and collect.

Existing test files to inspect (coverage unverified): [tests/fire.test.js](../../tests/fire.test.js), [tests/visualEffects.test.js](../../tests/visualEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:689` NOT_STARTED | Campfire · campfire | [Campfire](https://minecraft.wiki/w/Campfire) | `I:campfire` | light=15; hardness=2; transparent=true; present-in-pinned-1.21.4 |
| `I:campfire` NOT_STARTED | Campfire | [Campfire](https://minecraft.wiki/w/Campfire) | `B:689` | light=15; hardness=2; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:51` NOT_STARTED | Redstone Torch · redstone_torch | [Redstone Torch](https://minecraft.wiki/w/Redstone_Torch) | No paired form declared | shape=torch; light=7; lightColor=16728885; hardness=0; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:1166` NOT_STARTED | Redstone Wall Torch · redstone_wall_torch | [Redstone Wall Torch](https://minecraft.wiki/w/Redstone_Wall_Torch) | No paired form declared | shape=torch; light=7; lightColor=16726832; hardness=0; drop=51; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:693` NOT_STARTED | Soul Campfire · soul_campfire | [Soul Campfire](https://minecraft.wiki/w/Soul_Campfire) | `I:soul_campfire` | light=10; hardness=2; transparent=true; present-in-pinned-1.21.4 |
| `I:soul_campfire` NOT_STARTED | Soul Campfire | [Soul Campfire](https://minecraft.wiki/w/Soul_Campfire) | `B:693` | light=10; hardness=2; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:56` NOT_STARTED | Soul Torch · soul_torch | [Soul Torch](https://minecraft.wiki/w/Soul_Torch) | No paired form declared | shape=torch; light=10; lightColor=6417151; hardness=0; drop=56; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1165` NOT_STARTED | Soul Wall Torch · soul_wall_torch | [Soul Wall Torch](https://minecraft.wiki/w/Soul_Wall_Torch) | No paired form declared | shape=torch; light=10; lightColor=6080982; hardness=0; drop=56; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:24` NOT_STARTED | Torch · torch | [Torch](https://minecraft.wiki/w/Torch) | No paired form declared | shape=torch; light=14; lightColor=16759128; hardness=0; drop=24; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1164` NOT_STARTED | Wall Torch · wall_torch | [Wall Torch](https://minecraft.wiki/w/Wall_Torch) | No paired form declared | shape=torch; light=14; lightColor=16759128; hardness=0; drop=24; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A022 — Candles, lanterns and luminous blocks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct geometry, faces, emissive regions and light level/color; lamps must not illuminate when off.
- Mounting, grouping/count, lighting/extinguishing, waterlogging, powered states and harvest drops.

**Required Inspector showcase:**

- Place variants → light/power → measure illumination/occluded shadow → extinguish/remove; candle count and hanging variants.

Existing test files to inspect (coverage unverified): [tests/visualEffects.test.js](../../tests/visualEffects.test.js), [tests/candleChainGeometry.test.js](../../tests/candleChainGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:282` NOT_STARTED | Black Candle · black_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:black_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:black_candle` NOT_STARTED | Black Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:282` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1103` NOT_STARTED | Black Candle Cake · black_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=black_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:283` NOT_STARTED | Blue Candle · blue_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:blue_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_candle` NOT_STARTED | Blue Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:283` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1099` NOT_STARTED | Blue Candle Cake · blue_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=blue_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:284` NOT_STARTED | Brown Candle · brown_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:brown_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_candle` NOT_STARTED | Brown Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:284` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1100` NOT_STARTED | Brown Candle Cake · brown_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=brown_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:285` NOT_STARTED | Candle · candle | [Candle](https://minecraft.wiki/w/Candle) | `I:candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:candle` NOT_STARTED | Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:285` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1104` NOT_STARTED | Candle Cake · candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:286` NOT_STARTED | Cyan Candle · cyan_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:cyan_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_candle` NOT_STARTED | Cyan Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:286` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1097` NOT_STARTED | Cyan Candle Cake · cyan_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=cyan_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:941` NOT_STARTED | End Rod · end_rod | [End Rod](https://minecraft.wiki/w/End_Rod) | `I:end_rod` | light=14; hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:end_rod` NOT_STARTED | End Rod | [End Rod](https://minecraft.wiki/w/End_Rod) | `B:941` | light=14; hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:35` NOT_STARTED | Glowstone · glowstone | [Glowstone](https://minecraft.wiki/w/Glowstone) | No paired form declared | light=15; hardness=0.3; dropItem=glowstone_dust; present-in-pinned-1.21.4 |
| `I:glowstone_dust` NOT_STARTED | Glowstone Dust | [Glowstone Dust](https://minecraft.wiki/w/Glowstone_Dust) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:287` NOT_STARTED | Gray Candle · gray_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:gray_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO food: Food, stews and edible blocks.**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.
- Showcase: Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

## A023 — Candles, lanterns and luminous blocks 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct geometry, faces, emissive regions and light level/color; lamps must not illuminate when off.
- Mounting, grouping/count, lighting/extinguishing, waterlogging, powered states and harvest drops.

**Required Inspector showcase:**

- Place variants → light/power → measure illumination/occluded shadow → extinguish/remove; candle count and hanging variants.

Existing test files to inspect (coverage unverified): [tests/visualEffects.test.js](../../tests/visualEffects.test.js), [tests/candleChainGeometry.test.js](../../tests/candleChainGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:gray_candle` NOT_STARTED | Gray Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:287` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1095` NOT_STARTED | Gray Candle Cake · gray_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=gray_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:288` NOT_STARTED | Green Candle · green_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:green_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:green_candle` NOT_STARTED | Green Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:288` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1101` NOT_STARTED | Green Candle Cake · green_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=green_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:657` NOT_STARTED | Jack O Lantern · jack_o_lantern | [Jack O Lantern](https://minecraft.wiki/w/Jack_O_Lantern) | `I:jack_o_lantern` | light=15; hardness=1; present-in-pinned-1.21.4 |
| `I:jack_o_lantern` NOT_STARTED | Jack o'Lantern | [Jack o'Lantern](https://minecraft.wiki/w/Jack_o'Lantern) | `B:657` | light=15; hardness=1; type=block; present-in-pinned-1.21.4 |
| `B:388` NOT_STARTED | Lantern · lantern | [Lantern](https://minecraft.wiki/w/Lantern) | `I:lantern` | light=15; hardness=3.5; transparent=true; present-in-pinned-1.21.4 |
| `I:lantern` NOT_STARTED | Lantern | [Lantern](https://minecraft.wiki/w/Lantern) | `B:388` | light=15; hardness=3.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:289` NOT_STARTED | Light Blue Candle · light_blue_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:light_blue_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_candle` NOT_STARTED | Light Blue Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:289` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1091` NOT_STARTED | Light Blue Candle Cake · light_blue_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=light_blue_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:290` NOT_STARTED | Light Gray Candle · light_gray_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:light_gray_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_candle` NOT_STARTED | Light Gray Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:290` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1096` NOT_STARTED | Light Gray Candle Cake · light_gray_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=light_gray_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:291` NOT_STARTED | Lime Candle · lime_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:lime_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_candle` NOT_STARTED | Lime Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:291` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1093` NOT_STARTED | Lime Candle Cake · lime_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=lime_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:292` NOT_STARTED | Magenta Candle · magenta_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:magenta_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:magenta_candle` NOT_STARTED | Magenta Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:292` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO food: Food, stews and edible blocks.**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.
- Showcase: Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

## A024 — Candles, lanterns and luminous blocks 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct geometry, faces, emissive regions and light level/color; lamps must not illuminate when off.
- Mounting, grouping/count, lighting/extinguishing, waterlogging, powered states and harvest drops.

**Required Inspector showcase:**

- Place variants → light/power → measure illumination/occluded shadow → extinguish/remove; candle count and hanging variants.

Existing test files to inspect (coverage unverified): [tests/visualEffects.test.js](../../tests/visualEffects.test.js), [tests/candleChainGeometry.test.js](../../tests/candleChainGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1090` NOT_STARTED | Magenta Candle Cake · magenta_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=magenta_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:582` NOT_STARTED | Ochre Froglight · ochre_froglight | [Ochre Froglight](https://minecraft.wiki/w/Ochre_Froglight) | `I:ochre_froglight` | light=15; hardness=0.3; present-in-pinned-1.21.4 |
| `I:ochre_froglight` NOT_STARTED | Ochre Froglight | [Ochre Froglight](https://minecraft.wiki/w/Ochre_Froglight) | `B:582` | light=15; hardness=0.3; type=block; present-in-pinned-1.21.4 |
| `B:293` NOT_STARTED | Orange Candle · orange_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:orange_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_candle` NOT_STARTED | Orange Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:293` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1089` NOT_STARTED | Orange Candle Cake · orange_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=orange_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:584` NOT_STARTED | Pearlescent Froglight · pearlescent_froglight | [Pearlescent Froglight](https://minecraft.wiki/w/Pearlescent_Froglight) | `I:pearlescent_froglight` | light=15; hardness=0.3; present-in-pinned-1.21.4 |
| `I:pearlescent_froglight` NOT_STARTED | Pearlescent Froglight | [Pearlescent Froglight](https://minecraft.wiki/w/Pearlescent_Froglight) | `B:584` | light=15; hardness=0.3; type=block; present-in-pinned-1.21.4 |
| `B:294` NOT_STARTED | Pink Candle · pink_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:pink_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_candle` NOT_STARTED | Pink Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:294` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1094` NOT_STARTED | Pink Candle Cake · pink_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=pink_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:295` NOT_STARTED | Purple Candle · purple_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:purple_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_candle` NOT_STARTED | Purple Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:295` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1098` NOT_STARTED | Purple Candle Cake · purple_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=purple_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:296` NOT_STARTED | Red Candle · red_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:red_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:red_candle` NOT_STARTED | Red Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:296` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1102` NOT_STARTED | Red Candle Cake · red_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=red_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:52` NOT_STARTED | Redstone Lamp · redstone_lamp | [Redstone Lamp](https://minecraft.wiki/w/Redstone_Lamp) | No paired form declared | light=15; hardness=0.3; redstone=true; present-in-pinned-1.21.4 |
| `B:36` NOT_STARTED | Sea Lantern · sea_lantern | [Sea Lantern](https://minecraft.wiki/w/Sea_Lantern) | No paired form declared | light=15; lightColor=11072749; hardness=0.3; present-in-pinned-1.21.4 |
| `B:985` NOT_STARTED | Shroomlight · shroomlight | [Shroomlight](https://minecraft.wiki/w/Shroomlight) | No paired form declared | light=15; lightColor=16751164; hardness=1; drop=985; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO food: Food, stews and edible blocks.**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.
- Showcase: Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

## A025 — Candles, lanterns and luminous blocks 4

Rows: 10. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct geometry, faces, emissive regions and light level/color; lamps must not illuminate when off.
- Mounting, grouping/count, lighting/extinguishing, waterlogging, powered states and harvest drops.

**Required Inspector showcase:**

- Place variants → light/power → measure illumination/occluded shadow → extinguish/remove; candle count and hanging variants.

Existing test files to inspect (coverage unverified): [tests/visualEffects.test.js](../../tests/visualEffects.test.js), [tests/candleChainGeometry.test.js](../../tests/candleChainGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:940` NOT_STARTED | Soul Lantern · soul_lantern | [Soul Lantern](https://minecraft.wiki/w/Soul_Lantern) | `I:soul_lantern` | light=10; hardness=3.5; transparent=true; present-in-pinned-1.21.4 |
| `I:soul_lantern` NOT_STARTED | Soul Lantern | [Soul Lantern](https://minecraft.wiki/w/Soul_Lantern) | `B:940` | light=10; hardness=3.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:597` NOT_STARTED | Verdant Froglight · verdant_froglight | [Verdant Froglight](https://minecraft.wiki/w/Verdant_Froglight) | `I:verdant_froglight` | light=15; hardness=0.3; present-in-pinned-1.21.4 |
| `I:verdant_froglight` NOT_STARTED | Verdant Froglight | [Verdant Froglight](https://minecraft.wiki/w/Verdant_Froglight) | `B:597` | light=15; hardness=0.3; type=block; present-in-pinned-1.21.4 |
| `B:297` NOT_STARTED | White Candle · white_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:white_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:white_candle` NOT_STARTED | White Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:297` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1088` NOT_STARTED | White Candle Cake · white_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=white_candle; candle=true; present-in-pinned-1.21.4; ALSO food |
| `B:298` NOT_STARTED | Yellow Candle · yellow_candle | [Candle](https://minecraft.wiki/w/Candle) | `I:yellow_candle` | hardness=0.1; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `I:yellow_candle` NOT_STARTED | Yellow Candle | [Candle](https://minecraft.wiki/w/Candle) | `B:298` | hardness=0.1; type=block; candle=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1092` NOT_STARTED | Yellow Candle Cake · yellow_candle_cake | [Cake](https://minecraft.wiki/w/Cake) | No paired form declared | hardness=0.5; dropItem=yellow_candle; candle=true; present-in-pinned-1.21.4; ALSO food |

**Additional requirements for rows marked ALSO food: Food, stews and edible blocks.**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.
- Showcase: Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

## A026 — Pistons, observers and moving structures 1

Rows: 7. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Retracted/extended/head/moving state geometry, facing and attachment.
- Push limits, immovable blocks, sticky attachment, updates/timing, entity displacement, collisions and no item duplication.

**Required Inspector showcase:**

- Power → push/pull chain → blocked push → sticky mixed materials → elevator/flying fixture → reload mid-cycle.

Existing test files to inspect (coverage unverified): [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/redstone.test.js](../../tests/redstone.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:67` NOT_STARTED | Honey Block · honey_block | [Honey Block](https://minecraft.wiki/w/Honey_Block) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:1193` NOT_STARTED | Moving Piston · moving_piston | [Moving Piston](https://minecraft.wiki/w/Moving_Piston) | No paired form declared | hardness=1.5; drop=null; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:62` NOT_STARTED | Observer · observer | [Observer](https://minecraft.wiki/w/Observer) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:63` NOT_STARTED | Piston · piston | [Piston](https://minecraft.wiki/w/Piston) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:65` NOT_STARTED | Piston Head · piston_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | internal=true; hardness=1.5; drop=null; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:66` NOT_STARTED | Slime Block · slime_block | [Slime Block](https://minecraft.wiki/w/Slime_Block) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:64` NOT_STARTED | Sticky Piston · sticky_piston | [Sticky Piston](https://minecraft.wiki/w/Sticky_Piston) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |

## A027 — Redstone signal sources and logic 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.
- Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.

**Required Inspector showcase:**

- Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.

Existing test files to inspect (coverage unverified): [tests/redstone.test.js](../../tests/redstone.test.js), [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/mechanismGeometry.test.js](../../tests/mechanismGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:269` NOT_STARTED | Acacia Button · acacia_button | [Acacia Button](https://minecraft.wiki/w/Acacia_Button) | `I:acacia_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_button` NOT_STARTED | Acacia Button | [Acacia Button](https://minecraft.wiki/w/Acacia_Button) | `B:269` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:432` NOT_STARTED | Acacia Pressure Plate · acacia_pressure_plate | [Acacia Pressure Plate](https://minecraft.wiki/w/Acacia_Pressure_Plate) | `I:acacia_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_pressure_plate` NOT_STARTED | Acacia Pressure Plate | [Acacia Pressure Plate](https://minecraft.wiki/w/Acacia_Pressure_Plate) | `B:432` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:271` NOT_STARTED | Birch Button · birch_button | [Birch Button](https://minecraft.wiki/w/Birch_Button) | `I:birch_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_button` NOT_STARTED | Birch Button | [Birch Button](https://minecraft.wiki/w/Birch_Button) | `B:271` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:434` NOT_STARTED | Birch Pressure Plate · birch_pressure_plate | [Birch Pressure Plate](https://minecraft.wiki/w/Birch_Pressure_Plate) | `I:birch_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_pressure_plate` NOT_STARTED | Birch Pressure Plate | [Birch Pressure Plate](https://minecraft.wiki/w/Birch_Pressure_Plate) | `B:434` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:272` NOT_STARTED | Cherry Button · cherry_button | [Cherry Button](https://minecraft.wiki/w/Cherry_Button) | `I:cherry_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_button` NOT_STARTED | Cherry Button | [Cherry Button](https://minecraft.wiki/w/Cherry_Button) | `B:272` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:435` NOT_STARTED | Cherry Pressure Plate · cherry_pressure_plate | [Cherry Pressure Plate](https://minecraft.wiki/w/Cherry_Pressure_Plate) | `I:cherry_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_pressure_plate` NOT_STARTED | Cherry Pressure Plate | [Cherry Pressure Plate](https://minecraft.wiki/w/Cherry_Pressure_Plate) | `B:435` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:61` NOT_STARTED | Comparator · comparator | [Comparator](https://minecraft.wiki/w/Comparator) | No paired form declared | hardness=1.5; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:273` NOT_STARTED | Crimson Button · crimson_button | [Crimson Button](https://minecraft.wiki/w/Crimson_Button) | `I:crimson_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_button` NOT_STARTED | Crimson Button | [Crimson Button](https://minecraft.wiki/w/Crimson_Button) | `B:273` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:436` NOT_STARTED | Crimson Pressure Plate · crimson_pressure_plate | [Crimson Pressure Plate](https://minecraft.wiki/w/Crimson_Pressure_Plate) | `I:crimson_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_pressure_plate` NOT_STARTED | Crimson Pressure Plate | [Crimson Pressure Plate](https://minecraft.wiki/w/Crimson_Pressure_Plate) | `B:436` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:274` NOT_STARTED | Dark Oak Button · dark_oak_button | [Dark Oak Button](https://minecraft.wiki/w/Dark_Oak_Button) | `I:dark_oak_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_button` NOT_STARTED | Dark Oak Button | [Dark Oak Button](https://minecraft.wiki/w/Dark_Oak_Button) | `B:274` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:437` NOT_STARTED | Dark Oak Pressure Plate · dark_oak_pressure_plate | [Dark Oak Pressure Plate](https://minecraft.wiki/w/Dark_Oak_Pressure_Plate) | `I:dark_oak_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |

## A028 — Redstone signal sources and logic 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.
- Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.

**Required Inspector showcase:**

- Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.

Existing test files to inspect (coverage unverified): [tests/redstone.test.js](../../tests/redstone.test.js), [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/mechanismGeometry.test.js](../../tests/mechanismGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:dark_oak_pressure_plate` NOT_STARTED | Dark Oak Pressure Plate | [Dark Oak Pressure Plate](https://minecraft.wiki/w/Dark_Oak_Pressure_Plate) | `B:437` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:70` NOT_STARTED | Daylight Detector · daylight_detector | [Daylight Detector](https://minecraft.wiki/w/Daylight_Detector) | No paired form declared | hardness=1.5; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:952` NOT_STARTED | Deepslate Redstone Ore · deepslate_redstone_ore | [Deepslate Redstone Ore](https://minecraft.wiki/w/Deepslate_Redstone_Ore) | No paired form declared | hardness=4.5; dropItem=redstone; present-in-pinned-1.21.4 |
| `B:75` NOT_STARTED | Dispenser · dispenser | [Dispenser](https://minecraft.wiki/w/Dispenser) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:76` NOT_STARTED | Dropper · dropper | [Dropper](https://minecraft.wiki/w/Dropper) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:438` NOT_STARTED | Heavy Weighted Pressure Plate · heavy_weighted_pressure_plate | [Heavy Weighted Pressure Plate](https://minecraft.wiki/w/Heavy_Weighted_Pressure_Plate) | `I:heavy_weighted_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:heavy_weighted_pressure_plate` NOT_STARTED | Heavy Weighted Pressure Plate | [Heavy Weighted Pressure Plate](https://minecraft.wiki/w/Heavy_Weighted_Pressure_Plate) | `B:438` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:77` NOT_STARTED | Hopper · hopper | [Hopper](https://minecraft.wiki/w/Hopper) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:72` NOT_STARTED | Iron Door · iron_door | [Door](https://minecraft.wiki/w/Door) | `I:iron_door` | hardness=5; dropItem=iron_door; door=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:190` NOT_STARTED | Iron Door · iron_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=5; drop=72; dropItem=iron_door; door=true; transparent=true; solid=true; redstone=true; later-version-or-custom-review-required |
| `I:iron_door` NOT_STARTED | Iron Door | [Door](https://minecraft.wiki/w/Door) | `B:72` | hardness=5; dropItem=iron_door; type=utility; door=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:78` NOT_STARTED | Iron Door Open · iron_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; hardness=5; drop=72; dropItem=iron_door; door=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:191` NOT_STARTED | Iron Door Open · iron_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=5; drop=72; dropItem=iron_door; door=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:73` NOT_STARTED | Iron Trapdoor · iron_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:iron_trapdoor` | hardness=5; dropItem=iron_trapdoor; trapdoor=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `I:iron_trapdoor` NOT_STARTED | Iron Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:73` | hardness=5; dropItem=iron_trapdoor; type=utility; trapdoor=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:79` NOT_STARTED | Iron Trapdoor Open · iron_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; hardness=5; drop=73; dropItem=iron_trapdoor; trapdoor=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:275` NOT_STARTED | Jungle Button · jungle_button | [Jungle Button](https://minecraft.wiki/w/Jungle_Button) | `I:jungle_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_button` NOT_STARTED | Jungle Button | [Jungle Button](https://minecraft.wiki/w/Jungle_Button) | `B:275` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:439` NOT_STARTED | Jungle Pressure Plate · jungle_pressure_plate | [Jungle Pressure Plate](https://minecraft.wiki/w/Jungle_Pressure_Plate) | `I:jungle_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_pressure_plate` NOT_STARTED | Jungle Pressure Plate | [Jungle Pressure Plate](https://minecraft.wiki/w/Jungle_Pressure_Plate) | `B:439` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |

## A029 — Redstone signal sources and logic 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.
- Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.

**Required Inspector showcase:**

- Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.

Existing test files to inspect (coverage unverified): [tests/redstone.test.js](../../tests/redstone.test.js), [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/mechanismGeometry.test.js](../../tests/mechanismGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:50` NOT_STARTED | Lever · lever | [Lever](https://minecraft.wiki/w/Lever) | No paired form declared | hardness=0.5; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:440` NOT_STARTED | Light Weighted Pressure Plate · light_weighted_pressure_plate | [Light Weighted Pressure Plate](https://minecraft.wiki/w/Light_Weighted_Pressure_Plate) | `I:light_weighted_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:light_weighted_pressure_plate` NOT_STARTED | Light Weighted Pressure Plate | [Light Weighted Pressure Plate](https://minecraft.wiki/w/Light_Weighted_Pressure_Plate) | `B:440` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:942` NOT_STARTED | Lightning Rod · lightning_rod | [Lightning Rod](https://minecraft.wiki/w/Lightning_Rod) | `I:lightning_rod` | hardness=3; transparent=true; redstone=true; present-in-pinned-1.21.4 |
| `I:lightning_rod` NOT_STARTED | Lightning Rod | [Lightning Rod](https://minecraft.wiki/w/Lightning_Rod) | `B:942` | hardness=3; type=block; transparent=true; redstone=true; present-in-pinned-1.21.4 |
| `B:276` NOT_STARTED | Mangrove Button · mangrove_button | [Mangrove Button](https://minecraft.wiki/w/Mangrove_Button) | `I:mangrove_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_button` NOT_STARTED | Mangrove Button | [Mangrove Button](https://minecraft.wiki/w/Mangrove_Button) | `B:276` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:441` NOT_STARTED | Mangrove Pressure Plate · mangrove_pressure_plate | [Mangrove Pressure Plate](https://minecraft.wiki/w/Mangrove_Pressure_Plate) | `I:mangrove_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_pressure_plate` NOT_STARTED | Mangrove Pressure Plate | [Mangrove Pressure Plate](https://minecraft.wiki/w/Mangrove_Pressure_Plate) | `B:441` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:74` NOT_STARTED | Note Block · note_block | [Note Block](https://minecraft.wiki/w/Note_Block) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:277` NOT_STARTED | Oak Button · oak_button | [Oak Button](https://minecraft.wiki/w/Oak_Button) | `I:oak_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:oak_button` NOT_STARTED | Oak Button | [Oak Button](https://minecraft.wiki/w/Oak_Button) | `B:277` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:155` NOT_STARTED | Oak Door · oak_door | [Door](https://minecraft.wiki/w/Door) | `I:oak_door` | hardness=3; dropItem=oak_door; door=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:188` NOT_STARTED | Oak Door · oak_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; drop=155; dropItem=oak_door; door=true; transparent=true; solid=true; redstone=true; later-version-or-custom-review-required |
| `I:oak_door` NOT_STARTED | Oak Door | [Door](https://minecraft.wiki/w/Door) | `B:155` | hardness=3; dropItem=oak_door; type=utility; door=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:156` NOT_STARTED | Oak Door Open · oak_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; hardness=3; drop=155; dropItem=oak_door; door=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:189` NOT_STARTED | Oak Door Open · oak_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; drop=155; dropItem=oak_door; door=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:442` NOT_STARTED | Oak Pressure Plate · oak_pressure_plate | [Oak Pressure Plate](https://minecraft.wiki/w/Oak_Pressure_Plate) | `I:oak_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:oak_pressure_plate` NOT_STARTED | Oak Pressure Plate | [Oak Pressure Plate](https://minecraft.wiki/w/Oak_Pressure_Plate) | `B:442` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:157` NOT_STARTED | Oak Trapdoor · oak_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:oak_trapdoor` | hardness=3; dropItem=oak_trapdoor; trapdoor=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |

## A030 — Redstone signal sources and logic 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.
- Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.

**Required Inspector showcase:**

- Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.

Existing test files to inspect (coverage unverified): [tests/redstone.test.js](../../tests/redstone.test.js), [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/mechanismGeometry.test.js](../../tests/mechanismGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:oak_trapdoor` NOT_STARTED | Oak Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:157` | hardness=3; dropItem=oak_trapdoor; type=utility; trapdoor=true; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `B:158` NOT_STARTED | Oak Trapdoor Open · oak_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; hardness=3; drop=157; dropItem=oak_trapdoor; trapdoor=true; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:278` NOT_STARTED | Pale Oak Button · pale_oak_button | [Pale Oak Button](https://minecraft.wiki/w/Pale_Oak_Button) | `I:pale_oak_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_button` NOT_STARTED | Pale Oak Button | [Pale Oak Button](https://minecraft.wiki/w/Pale_Oak_Button) | `B:278` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:443` NOT_STARTED | Pale Oak Pressure Plate · pale_oak_pressure_plate | [Pale Oak Pressure Plate](https://minecraft.wiki/w/Pale_Oak_Pressure_Plate) | `I:pale_oak_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_pressure_plate` NOT_STARTED | Pale Oak Pressure Plate | [Pale Oak Pressure Plate](https://minecraft.wiki/w/Pale_Oak_Pressure_Plate) | `B:443` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:279` NOT_STARTED | Polished Blackstone Button · polished_blackstone_button | [Polished Blackstone Button](https://minecraft.wiki/w/Polished_Blackstone_Button) | `I:polished_blackstone_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_button` NOT_STARTED | Polished Blackstone Button | [Polished Blackstone Button](https://minecraft.wiki/w/Polished_Blackstone_Button) | `B:279` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:444` NOT_STARTED | Polished Blackstone Pressure Plate · polished_blackstone_pressure_plate | [Polished Blackstone Pressure Plate](https://minecraft.wiki/w/Polished_Blackstone_Pressure_Plate) | `I:polished_blackstone_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_pressure_plate` NOT_STARTED | Polished Blackstone Pressure Plate | [Polished Blackstone Pressure Plate](https://minecraft.wiki/w/Polished_Blackstone_Pressure_Plate) | `B:444` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:154` NOT_STARTED | Powered Rail · powered_rail | [Powered Rail](https://minecraft.wiki/w/Powered_Rail) | No paired form declared | hardness=0.7; drop=154; rail=true; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:69` NOT_STARTED | Pressure Plate · pressure_plate | [Pressure Plate](https://minecraft.wiki/w/Pressure_Plate) | No paired form declared | hardness=1.5; transparent=true; solid=false; redstone=true; later-version-or-custom-review-required |
| `B:153` NOT_STARTED | Rail · rail | [Rail](https://minecraft.wiki/w/Rail) | No paired form declared | hardness=0.7; drop=153; rail=true; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:59` NOT_STARTED | Redstone Block · redstone_block | [Redstone Block](https://minecraft.wiki/w/Redstone_Block) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; present-in-pinned-1.21.4 |
| `I:redstone` NOT_STARTED | Redstone Dust | [Redstone Dust](https://minecraft.wiki/w/Redstone_Dust) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:18` NOT_STARTED | Redstone Ore · redstone_ore | [Redstone Ore](https://minecraft.wiki/w/Redstone_Ore) | No paired form declared | hardness=3; drop=18; present-in-pinned-1.21.4 |
| `B:58` NOT_STARTED | Redstone Wire · redstone_wire | [Redstone Dust](https://minecraft.wiki/w/Redstone_Dust) | No paired form declared | hardness=1.5; dropItem=redstone; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:60` NOT_STARTED | Repeater · repeater | [Repeater](https://minecraft.wiki/w/Repeater) | No paired form declared | hardness=1.5; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:181` NOT_STARTED | Sculk Sensor · sculk_sensor | [Sculk Sensor](https://minecraft.wiki/w/Sculk_Sensor) | No paired form declared | hardness=1.5; drop=181; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:182` NOT_STARTED | Sculk Shrieker · sculk_shrieker | [Sculk Shrieker](https://minecraft.wiki/w/Sculk_Shrieker) | No paired form declared | hardness=3; drop=182; transparent=true; solid=true; present-in-pinned-1.21.4 |

## A031 — Redstone signal sources and logic 5

Rows: 16. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.
- Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.

**Required Inspector showcase:**

- Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.

Existing test files to inspect (coverage unverified): [tests/redstone.test.js](../../tests/redstone.test.js), [tests/advanced_redstone.test.js](../../tests/advanced_redstone.test.js), [tests/mechanismGeometry.test.js](../../tests/mechanismGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:280` NOT_STARTED | Spruce Button · spruce_button | [Spruce Button](https://minecraft.wiki/w/Spruce_Button) | `I:spruce_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_button` NOT_STARTED | Spruce Button | [Spruce Button](https://minecraft.wiki/w/Spruce_Button) | `B:280` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:445` NOT_STARTED | Spruce Pressure Plate · spruce_pressure_plate | [Spruce Pressure Plate](https://minecraft.wiki/w/Spruce_Pressure_Plate) | `I:spruce_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_pressure_plate` NOT_STARTED | Spruce Pressure Plate | [Spruce Pressure Plate](https://minecraft.wiki/w/Spruce_Pressure_Plate) | `B:445` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:68` NOT_STARTED | Stone Button · stone_button | [Stone Button](https://minecraft.wiki/w/Stone_Button) | No paired form declared | hardness=1.5; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:446` NOT_STARTED | Stone Pressure Plate · stone_pressure_plate | [Stone Pressure Plate](https://minecraft.wiki/w/Stone_Pressure_Plate) | `I:stone_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:stone_pressure_plate` NOT_STARTED | Stone Pressure Plate | [Stone Pressure Plate](https://minecraft.wiki/w/Stone_Pressure_Plate) | `B:446` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:392` NOT_STARTED | Target · target | [Target](https://minecraft.wiki/w/Target) | `I:target` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:target` NOT_STARTED | Target | [Target](https://minecraft.wiki/w/Target) | `B:392` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:71` NOT_STARTED | Target Block · target_block | [Target](https://minecraft.wiki/w/Target) | No paired form declared | hardness=1.5; transparent=true; solid=true; redstone=true; later-version-or-custom-review-required |
| `B:187` NOT_STARTED | Tripwire · tripwire | [Tripwire](https://minecraft.wiki/w/Tripwire) | No paired form declared | hardness=0; dropItem=string; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:186` NOT_STARTED | Tripwire Hook · tripwire_hook | [Tripwire Hook](https://minecraft.wiki/w/Tripwire_Hook) | No paired form declared | hardness=0.5; drop=186; transparent=true; solid=false; redstone=true; present-in-pinned-1.21.4 |
| `B:281` NOT_STARTED | Warped Button · warped_button | [Warped Button](https://minecraft.wiki/w/Warped_Button) | `I:warped_button` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_button` NOT_STARTED | Warped Button | [Warped Button](https://minecraft.wiki/w/Warped_Button) | `B:281` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:447` NOT_STARTED | Warped Pressure Plate · warped_pressure_plate | [Warped Pressure Plate](https://minecraft.wiki/w/Warped_Pressure_Plate) | `I:warped_pressure_plate` | hardness=0.5; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_pressure_plate` NOT_STARTED | Warped Pressure Plate | [Warped Pressure Plate](https://minecraft.wiki/w/Warped_Pressure_Plate) | `B:447` | hardness=0.5; type=block; transparent=true; present-in-pinned-1.21.4 |

## A032 — Furnaces, blast furnaces and smokers 1

Rows: 6. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six opaque faces beside carpet/slabs, correct front/facing and lit transitions; hand/icon/drop appearances.
- Allowed recipes, subtype cooking speed, fuel duration/container remainder, progress/cancellation, blocked output, XP, persistence and hopper IO.
- Light/smoke/crackle and contents drops on break; each subtype needs its own authoritative behavior.

**Required Inspector showcase:**

- Load → ignite → smelt → collect/XP → block output → bucket fuel → expire → break; hopper input/output and reload while burning.

Existing test files to inspect (coverage unverified): [tests/furnace.test.js](../../tests/furnace.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js), [tests/resourceBehaviorShowcase.test.js](../../tests/resourceBehaviorShowcase.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:192` NOT_STARTED | Blast Furnace · blast_furnace | [Blast Furnace](https://minecraft.wiki/w/Blast_Furnace) | `I:blast_furnace` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:blast_furnace` NOT_STARTED | Blast Furnace | [Blast Furnace](https://minecraft.wiki/w/Blast_Furnace) | `B:192` | hardness=3.5; type=utility; present-in-pinned-1.21.4 |
| `B:22` NOT_STARTED | Furnace · furnace | [Furnace](https://minecraft.wiki/w/Furnace) | No paired form declared | hardness=3.5; drop=22; present-in-pinned-1.21.4 |
| `B:55` NOT_STARTED | Lit Furnace · lit_furnace | [Furnace](https://minecraft.wiki/w/Furnace) | No paired form declared | light=13; lightColor=16750653; hardness=3.5; drop=22; later-version-or-custom-review-required |
| `B:193` NOT_STARTED | Smoker · smoker | [Smoker](https://minecraft.wiki/w/Smoker) | `I:smoker` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:smoker` NOT_STARTED | Smoker | [Smoker](https://minecraft.wiki/w/Smoker) | `B:193` | hardness=3.5; type=utility; present-in-pinned-1.21.4 |

## A033 — Containers and inventory automation 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Body/lid/opening geometry, lock/latch, orientation, double-container joining, held and dropped shape.
- Capacity/stack limits, opening restrictions, contents transfer, automation rules, comparator fullness, special dispensing and trapped/ender semantics.
- Contents drop or retained-container contents, break/open/reload races and duplication checks.

**Required Inspector showcase:**

- Open/load/move slots → neighbor merge → automate/power → blocked open → break → pick up → reload contents.

Existing test files to inspect (coverage unverified): [tests/chest.test.js](../../tests/chest.test.js), [tests/workstations_functional.test.js](../../tests/workstations_functional.test.js), [tests/redstone.test.js](../../tests/redstone.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:197` NOT_STARTED | Barrel · barrel | [Barrel](https://minecraft.wiki/w/Barrel) | `I:barrel` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:barrel` NOT_STARTED | Barrel | [Barrel](https://minecraft.wiki/w/Barrel) | `B:197` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:1070` NOT_STARTED | Black Shulker Box · black_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:black_shulker_box` | hardness=2; drop=1070; present-in-pinned-1.21.4 |
| `I:black_shulker_box` NOT_STARTED | Black Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1070` | hardness=2; drop=1070; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1066` NOT_STARTED | Blue Shulker Box · blue_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:blue_shulker_box` | hardness=2; drop=1066; present-in-pinned-1.21.4 |
| `I:blue_shulker_box` NOT_STARTED | Blue Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1066` | hardness=2; drop=1066; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1067` NOT_STARTED | Brown Shulker Box · brown_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:brown_shulker_box` | hardness=2; drop=1067; present-in-pinned-1.21.4 |
| `I:brown_shulker_box` NOT_STARTED | Brown Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1067` | hardness=2; drop=1067; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:161` NOT_STARTED | Chest · chest | [Chest](https://minecraft.wiki/w/Chest) | `I:chest` | hardness=2.5; dropItem=chest; chest=true; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `I:chest` NOT_STARTED | Chest | [Chest](https://minecraft.wiki/w/Chest) | `B:161` | hardness=2.5; dropItem=chest; type=utility; chest=true; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:387` NOT_STARTED | Crafter · crafter | [Boat](https://minecraft.wiki/w/Boat) | `I:crafter` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:crafter` NOT_STARTED | Crafter | [Boat](https://minecraft.wiki/w/Boat) | `B:387` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:1064` NOT_STARTED | Cyan Shulker Box · cyan_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:cyan_shulker_box` | hardness=2; drop=1064; present-in-pinned-1.21.4 |
| `I:cyan_shulker_box` NOT_STARTED | Cyan Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1064` | hardness=2; drop=1064; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1189` NOT_STARTED | Ender Chest · ender_chest | [Ender Chest](https://minecraft.wiki/w/Ender_Chest) | `I:ender_chest` | hardness=22.5; drop=20; chest=true; transparent=true; present-in-pinned-1.21.4 |
| `I:ender_chest` NOT_STARTED | Ender Chest | [Ender Chest](https://minecraft.wiki/w/Ender_Chest) | `B:1189` | hardness=22.5; drop=20; type=utility; chest=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1062` NOT_STARTED | Gray Shulker Box · gray_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:gray_shulker_box` | hardness=2; drop=1062; present-in-pinned-1.21.4 |
| `I:gray_shulker_box` NOT_STARTED | Gray Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1062` | hardness=2; drop=1062; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1068` NOT_STARTED | Green Shulker Box · green_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:green_shulker_box` | hardness=2; drop=1068; present-in-pinned-1.21.4 |
| `I:green_shulker_box` NOT_STARTED | Green Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1068` | hardness=2; drop=1068; stackSize=1; type=block; present-in-pinned-1.21.4 |

## A034 — Containers and inventory automation 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Body/lid/opening geometry, lock/latch, orientation, double-container joining, held and dropped shape.
- Capacity/stack limits, opening restrictions, contents transfer, automation rules, comparator fullness, special dispensing and trapped/ender semantics.
- Contents drop or retained-container contents, break/open/reload races and duplication checks.

**Required Inspector showcase:**

- Open/load/move slots → neighbor merge → automate/power → blocked open → break → pick up → reload contents.

Existing test files to inspect (coverage unverified): [tests/chest.test.js](../../tests/chest.test.js), [tests/workstations_functional.test.js](../../tests/workstations_functional.test.js), [tests/redstone.test.js](../../tests/redstone.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1058` NOT_STARTED | Light Blue Shulker Box · light_blue_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:light_blue_shulker_box` | hardness=2; drop=1058; present-in-pinned-1.21.4 |
| `I:light_blue_shulker_box` NOT_STARTED | Light Blue Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1058` | hardness=2; drop=1058; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1063` NOT_STARTED | Light Gray Shulker Box · light_gray_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:light_gray_shulker_box` | hardness=2; drop=1063; present-in-pinned-1.21.4 |
| `I:light_gray_shulker_box` NOT_STARTED | Light Gray Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1063` | hardness=2; drop=1063; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1060` NOT_STARTED | Lime Shulker Box · lime_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:lime_shulker_box` | hardness=2; drop=1060; present-in-pinned-1.21.4 |
| `I:lime_shulker_box` NOT_STARTED | Lime Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1060` | hardness=2; drop=1060; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1057` NOT_STARTED | Magenta Shulker Box · magenta_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:magenta_shulker_box` | hardness=2; drop=1057; present-in-pinned-1.21.4 |
| `I:magenta_shulker_box` NOT_STARTED | Magenta Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1057` | hardness=2; drop=1057; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1056` NOT_STARTED | Orange Shulker Box · orange_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:orange_shulker_box` | hardness=2; drop=1056; present-in-pinned-1.21.4 |
| `I:orange_shulker_box` NOT_STARTED | Orange Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1056` | hardness=2; drop=1056; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1061` NOT_STARTED | Pink Shulker Box · pink_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:pink_shulker_box` | hardness=2; drop=1061; present-in-pinned-1.21.4 |
| `I:pink_shulker_box` NOT_STARTED | Pink Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1061` | hardness=2; drop=1061; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1065` NOT_STARTED | Purple Shulker Box · purple_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:purple_shulker_box` | hardness=2; drop=1065; present-in-pinned-1.21.4 |
| `I:purple_shulker_box` NOT_STARTED | Purple Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1065` | hardness=2; drop=1065; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1069` NOT_STARTED | Red Shulker Box · red_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:red_shulker_box` | hardness=2; drop=1069; present-in-pinned-1.21.4 |
| `I:red_shulker_box` NOT_STARTED | Red Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1069` | hardness=2; drop=1069; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1054` NOT_STARTED | Shulker Box · shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:shulker_box` | hardness=2; drop=1054; present-in-pinned-1.21.4 |
| `I:shulker_box` NOT_STARTED | Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1054` | hardness=2; drop=1054; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1190` NOT_STARTED | Trapped Chest · trapped_chest | [Trapped Chest](https://minecraft.wiki/w/Trapped_Chest) | `I:trapped_chest` | hardness=2.5; drop=1190; chest=true; transparent=true; present-in-pinned-1.21.4 |
| `I:trapped_chest` NOT_STARTED | Trapped Chest | [Trapped Chest](https://minecraft.wiki/w/Trapped_Chest) | `B:1190` | hardness=2.5; drop=1190; type=utility; chest=true; transparent=true; present-in-pinned-1.21.4 |

## A035 — Containers and inventory automation 3

Rows: 4. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Body/lid/opening geometry, lock/latch, orientation, double-container joining, held and dropped shape.
- Capacity/stack limits, opening restrictions, contents transfer, automation rules, comparator fullness, special dispensing and trapped/ender semantics.
- Contents drop or retained-container contents, break/open/reload races and duplication checks.

**Required Inspector showcase:**

- Open/load/move slots → neighbor merge → automate/power → blocked open → break → pick up → reload contents.

Existing test files to inspect (coverage unverified): [tests/chest.test.js](../../tests/chest.test.js), [tests/workstations_functional.test.js](../../tests/workstations_functional.test.js), [tests/redstone.test.js](../../tests/redstone.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1055` NOT_STARTED | White Shulker Box · white_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:white_shulker_box` | hardness=2; drop=1055; present-in-pinned-1.21.4 |
| `I:white_shulker_box` NOT_STARTED | White Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1055` | hardness=2; drop=1055; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `B:1059` NOT_STARTED | Yellow Shulker Box · yellow_shulker_box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `I:yellow_shulker_box` | hardness=2; drop=1059; present-in-pinned-1.21.4 |
| `I:yellow_shulker_box` NOT_STARTED | Yellow Shulker Box | [Shulker Box](https://minecraft.wiki/w/Shulker_Box) | `B:1059` | hardness=2; drop=1059; stackSize=1; type=block; present-in-pinned-1.21.4 |

## A036 — Crafting and processing workstations 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Distinct non-cube geometry, UI and active/content states; orientation and selection hitbox.
- Inputs/outputs/costs, recipes, experience/enchantment/repair semantics, invalid inputs, profession/trade interactions, power/content signals and save/load.
- Each named workstation must exercise its unique mechanic rather than only showing a menu.

**Required Inspector showcase:**

- Open → valid operation/cost → invalid operation → output/consumption → automation or profession interaction → reload/break.

Existing test files to inspect (coverage unverified): [tests/workstations_functional.test.js](../../tests/workstations_functional.test.js), [tests/smithingParity.test.js](../../tests/smithingParity.test.js), [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/enchanting.test.js](../../tests/enchanting.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:205` NOT_STARTED | Anvil · anvil | [Anvil](https://minecraft.wiki/w/Anvil) | `I:anvil` | hardness=5; present-in-pinned-1.21.4 |
| `I:anvil` NOT_STARTED | Anvil | [Anvil](https://minecraft.wiki/w/Anvil) | `B:205` | hardness=5; type=utility; present-in-pinned-1.21.4 |
| `B:208` NOT_STARTED | Beacon · beacon | [Beacon](https://minecraft.wiki/w/Beacon) | `I:beacon` | light=15; hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:beacon` NOT_STARTED | Beacon | [Beacon](https://minecraft.wiki/w/Beacon) | `B:208` | light=15; hardness=3; type=utility; transparent=true; present-in-pinned-1.21.4 |
| `B:688` NOT_STARTED | Bell · bell | [Bell](https://minecraft.wiki/w/Bell) | `I:bell` | hardness=5; present-in-pinned-1.21.4 |
| `I:bell` NOT_STARTED | Bell | [Bell](https://minecraft.wiki/w/Bell) | `B:688` | hardness=5; type=block; present-in-pinned-1.21.4 |
| `B:195` NOT_STARTED | Brewing Stand · brewing_stand | [Brewing Stand](https://minecraft.wiki/w/Brewing_Stand) | `I:brewing_stand` | hardness=0.5; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `I:brewing_stand` NOT_STARTED | Brewing Stand | [Brewing Stand](https://minecraft.wiki/w/Brewing_Stand) | `B:195` | hardness=0.5; type=utility; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:194` NOT_STARTED | Cartography Table · cartography_table | [Cartography Table](https://minecraft.wiki/w/Cartography_Table) | `I:cartography_table` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:cartography_table` NOT_STARTED | Cartography Table | [Cartography Table](https://minecraft.wiki/w/Cartography_Table) | `B:194` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:199` NOT_STARTED | Cauldron · cauldron | [Cauldron](https://minecraft.wiki/w/Cauldron) | `I:cauldron` | hardness=2; present-in-pinned-1.21.4 |
| `I:cauldron` NOT_STARTED | Cauldron | [Cauldron](https://minecraft.wiki/w/Cauldron) | `B:199` | hardness=2; type=utility; present-in-pinned-1.21.4 |
| `B:206` NOT_STARTED | Chipped Anvil · chipped_anvil | [Chipped Anvil](https://minecraft.wiki/w/Chipped_Anvil) | `I:chipped_anvil` | hardness=5; present-in-pinned-1.21.4 |
| `I:chipped_anvil` NOT_STARTED | Chipped Anvil | [Chipped Anvil](https://minecraft.wiki/w/Chipped_Anvil) | `B:206` | hardness=5; type=utility; present-in-pinned-1.21.4 |
| `B:196` NOT_STARTED | Composter · composter | [Composter](https://minecraft.wiki/w/Composter) | `I:composter` | hardness=2; present-in-pinned-1.21.4 |
| `I:composter` NOT_STARTED | Composter | [Composter](https://minecraft.wiki/w/Composter) | `B:196` | hardness=2; type=utility; present-in-pinned-1.21.4 |
| `B:209` NOT_STARTED | Conduit · conduit | [Conduit](https://minecraft.wiki/w/Conduit) | `I:conduit` | light=14; hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:conduit` NOT_STARTED | Conduit | [Conduit](https://minecraft.wiki/w/Conduit) | `B:209` | light=14; hardness=3; type=utility; transparent=true; present-in-pinned-1.21.4 |
| `B:21` NOT_STARTED | Crafting Table · crafting_table | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | hardness=2.5; drop=21; present-in-pinned-1.21.4 |
| `B:207` NOT_STARTED | Damaged Anvil · damaged_anvil | [Damaged Anvil](https://minecraft.wiki/w/Damaged_Anvil) | `I:damaged_anvil` | hardness=5; present-in-pinned-1.21.4 |

## A037 — Crafting and processing workstations 2

Rows: 15. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Distinct non-cube geometry, UI and active/content states; orientation and selection hitbox.
- Inputs/outputs/costs, recipes, experience/enchantment/repair semantics, invalid inputs, profession/trade interactions, power/content signals and save/load.
- Each named workstation must exercise its unique mechanic rather than only showing a menu.

**Required Inspector showcase:**

- Open → valid operation/cost → invalid operation → output/consumption → automation or profession interaction → reload/break.

Existing test files to inspect (coverage unverified): [tests/workstations_functional.test.js](../../tests/workstations_functional.test.js), [tests/smithingParity.test.js](../../tests/smithingParity.test.js), [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/enchanting.test.js](../../tests/enchanting.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:damaged_anvil` NOT_STARTED | Damaged Anvil | [Damaged Anvil](https://minecraft.wiki/w/Damaged_Anvil) | `B:207` | hardness=5; type=utility; present-in-pinned-1.21.4 |
| `B:53` NOT_STARTED | Enchanting Table · enchanting_table | [Enchanting Table](https://minecraft.wiki/w/Enchanting_Table) | No paired form declared | light=7; lightColor=11044095; hardness=5; present-in-pinned-1.21.4 |
| `B:204` NOT_STARTED | Grindstone · grindstone | [Grindstone](https://minecraft.wiki/w/Grindstone) | `I:grindstone` | hardness=2; present-in-pinned-1.21.4 |
| `I:grindstone` NOT_STARTED | Grindstone | [Grindstone](https://minecraft.wiki/w/Grindstone) | `B:204` | hardness=2; type=utility; present-in-pinned-1.21.4 |
| `B:1176` NOT_STARTED | Lava Cauldron · lava_cauldron | [Lava Cauldron](https://minecraft.wiki/w/Lava_Cauldron) | No paired form declared | light=15; hardness=2; drop=199; present-in-pinned-1.21.4 |
| `B:200` NOT_STARTED | Lectern · lectern | [Lectern](https://minecraft.wiki/w/Lectern) | `I:lectern` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:lectern` NOT_STARTED | Lectern | [Lectern](https://minecraft.wiki/w/Lectern) | `B:200` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:202` NOT_STARTED | Loom · loom | [Loom](https://minecraft.wiki/w/Loom) | `I:loom` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:loom` NOT_STARTED | Loom | [Loom](https://minecraft.wiki/w/Loom) | `B:202` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:1177` NOT_STARTED | Powder Snow Cauldron · powder_snow_cauldron | [Powder Snow Cauldron](https://minecraft.wiki/w/Powder_Snow_Cauldron) | No paired form declared | hardness=2; drop=199; present-in-pinned-1.21.4 |
| `B:203` NOT_STARTED | Smithing Table · smithing_table | [Smithing Table](https://minecraft.wiki/w/Smithing_Table) | `I:smithing_table` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:smithing_table` NOT_STARTED | Smithing Table | [Smithing Table](https://minecraft.wiki/w/Smithing_Table) | `B:203` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:201` NOT_STARTED | Stonecutter · stonecutter | [Stonecutter](https://minecraft.wiki/w/Stonecutter) | `I:stonecutter` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:stonecutter` NOT_STARTED | Stonecutter | [Stonecutter](https://minecraft.wiki/w/Stonecutter) | `B:201` | hardness=3.5; type=utility; present-in-pinned-1.21.4 |
| `B:1175` NOT_STARTED | Water Cauldron · water_cauldron | [Water Cauldron](https://minecraft.wiki/w/Water_Cauldron) | No paired form declared | hardness=2; drop=199; present-in-pinned-1.21.4 |

## A038 — Doors and trapdoors 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:817` NOT_STARTED | Acacia Door · acacia_door | [Door](https://minecraft.wiki/w/Door) | `I:acacia_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_door` NOT_STARTED | Acacia Door | [Door](https://minecraft.wiki/w/Door) | `B:817` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:818` NOT_STARTED | Acacia Door Open · acacia_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:819` NOT_STARTED | Acacia Door Top · acacia_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:820` NOT_STARTED | Acacia Door Top Open · acacia_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:793` NOT_STARTED | Acacia Trapdoor · acacia_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:acacia_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_trapdoor` NOT_STARTED | Acacia Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:793` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:794` NOT_STARTED | Acacia Trapdoor Open · acacia_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:809` NOT_STARTED | Birch Door · birch_door | [Door](https://minecraft.wiki/w/Door) | `I:birch_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_door` NOT_STARTED | Birch Door | [Door](https://minecraft.wiki/w/Door) | `B:809` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:810` NOT_STARTED | Birch Door Open · birch_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:811` NOT_STARTED | Birch Door Top · birch_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:812` NOT_STARTED | Birch Door Top Open · birch_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:789` NOT_STARTED | Birch Trapdoor · birch_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:birch_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_trapdoor` NOT_STARTED | Birch Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:789` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:790` NOT_STARTED | Birch Trapdoor Open · birch_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:821` NOT_STARTED | Cherry Door · cherry_door | [Door](https://minecraft.wiki/w/Door) | `I:cherry_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_door` NOT_STARTED | Cherry Door | [Door](https://minecraft.wiki/w/Door) | `B:821` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:822` NOT_STARTED | Cherry Door Open · cherry_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:823` NOT_STARTED | Cherry Door Top · cherry_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |

## A039 — Doors and trapdoors 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:824` NOT_STARTED | Cherry Door Top Open · cherry_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:795` NOT_STARTED | Cherry Trapdoor · cherry_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:cherry_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_trapdoor` NOT_STARTED | Cherry Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:795` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:796` NOT_STARTED | Cherry Trapdoor Open · cherry_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:853` NOT_STARTED | Copper Door · copper_door | [Door](https://minecraft.wiki/w/Door) | `I:copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:copper_door` NOT_STARTED | Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:853` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:854` NOT_STARTED | Copper Door Open · copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:855` NOT_STARTED | Copper Door Top · copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:856` NOT_STARTED | Copper Door Top Open · copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:885` NOT_STARTED | Copper Trapdoor · copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:copper_trapdoor` NOT_STARTED | Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:885` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:886` NOT_STARTED | Copper Trapdoor Open · copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:845` NOT_STARTED | Crimson Door · crimson_door | [Door](https://minecraft.wiki/w/Door) | `I:crimson_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_door` NOT_STARTED | Crimson Door | [Door](https://minecraft.wiki/w/Door) | `B:845` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:846` NOT_STARTED | Crimson Door Open · crimson_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:847` NOT_STARTED | Crimson Door Top · crimson_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:848` NOT_STARTED | Crimson Door Top Open · crimson_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:841` NOT_STARTED | Crimson Trapdoor · crimson_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:crimson_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_trapdoor` NOT_STARTED | Crimson Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:841` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:842` NOT_STARTED | Crimson Trapdoor Open · crimson_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A040 — Doors and trapdoors 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:825` NOT_STARTED | Dark Oak Door · dark_oak_door | [Door](https://minecraft.wiki/w/Door) | `I:dark_oak_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_door` NOT_STARTED | Dark Oak Door | [Door](https://minecraft.wiki/w/Door) | `B:825` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:826` NOT_STARTED | Dark Oak Door Open · dark_oak_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:827` NOT_STARTED | Dark Oak Door Top · dark_oak_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:828` NOT_STARTED | Dark Oak Door Top Open · dark_oak_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:797` NOT_STARTED | Dark Oak Trapdoor · dark_oak_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:dark_oak_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_trapdoor` NOT_STARTED | Dark Oak Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:797` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:798` NOT_STARTED | Dark Oak Trapdoor Open · dark_oak_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:857` NOT_STARTED | Exposed Copper Door · exposed_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:exposed_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:exposed_copper_door` NOT_STARTED | Exposed Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:857` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:858` NOT_STARTED | Exposed Copper Door Open · exposed_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:859` NOT_STARTED | Exposed Copper Door Top · exposed_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:860` NOT_STARTED | Exposed Copper Door Top Open · exposed_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:887` NOT_STARTED | Exposed Copper Trapdoor · exposed_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:exposed_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:exposed_copper_trapdoor` NOT_STARTED | Exposed Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:887` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:888` NOT_STARTED | Exposed Copper Trapdoor Open · exposed_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:813` NOT_STARTED | Jungle Door · jungle_door | [Door](https://minecraft.wiki/w/Door) | `I:jungle_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_door` NOT_STARTED | Jungle Door | [Door](https://minecraft.wiki/w/Door) | `B:813` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:814` NOT_STARTED | Jungle Door Open · jungle_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:815` NOT_STARTED | Jungle Door Top · jungle_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A041 — Doors and trapdoors 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:816` NOT_STARTED | Jungle Door Top Open · jungle_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:791` NOT_STARTED | Jungle Trapdoor · jungle_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:jungle_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_trapdoor` NOT_STARTED | Jungle Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:791` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:792` NOT_STARTED | Jungle Trapdoor Open · jungle_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:833` NOT_STARTED | Mangrove Door · mangrove_door | [Door](https://minecraft.wiki/w/Door) | `I:mangrove_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_door` NOT_STARTED | Mangrove Door | [Door](https://minecraft.wiki/w/Door) | `B:833` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:834` NOT_STARTED | Mangrove Door Open · mangrove_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:835` NOT_STARTED | Mangrove Door Top · mangrove_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:836` NOT_STARTED | Mangrove Door Top Open · mangrove_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:801` NOT_STARTED | Mangrove Trapdoor · mangrove_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:mangrove_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_trapdoor` NOT_STARTED | Mangrove Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:801` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:802` NOT_STARTED | Mangrove Trapdoor Open · mangrove_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:861` NOT_STARTED | Oxidized Copper Door · oxidized_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:oxidized_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:oxidized_copper_door` NOT_STARTED | Oxidized Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:861` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:862` NOT_STARTED | Oxidized Copper Door Open · oxidized_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:863` NOT_STARTED | Oxidized Copper Door Top · oxidized_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:864` NOT_STARTED | Oxidized Copper Door Top Open · oxidized_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:889` NOT_STARTED | Oxidized Copper Trapdoor · oxidized_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:oxidized_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:oxidized_copper_trapdoor` NOT_STARTED | Oxidized Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:889` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:890` NOT_STARTED | Oxidized Copper Trapdoor Open · oxidized_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A042 — Doors and trapdoors 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:829` NOT_STARTED | Pale Oak Door · pale_oak_door | [Door](https://minecraft.wiki/w/Door) | `I:pale_oak_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_door` NOT_STARTED | Pale Oak Door | [Door](https://minecraft.wiki/w/Door) | `B:829` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:830` NOT_STARTED | Pale Oak Door Open · pale_oak_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:831` NOT_STARTED | Pale Oak Door Top · pale_oak_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:832` NOT_STARTED | Pale Oak Door Top Open · pale_oak_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:799` NOT_STARTED | Pale Oak Trapdoor · pale_oak_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:pale_oak_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_trapdoor` NOT_STARTED | Pale Oak Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:799` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:800` NOT_STARTED | Pale Oak Trapdoor Open · pale_oak_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:805` NOT_STARTED | Spruce Door · spruce_door | [Door](https://minecraft.wiki/w/Door) | `I:spruce_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_door` NOT_STARTED | Spruce Door | [Door](https://minecraft.wiki/w/Door) | `B:805` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:806` NOT_STARTED | Spruce Door Open · spruce_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:807` NOT_STARTED | Spruce Door Top · spruce_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |
| `B:808` NOT_STARTED | Spruce Door Top Open · spruce_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:787` NOT_STARTED | Spruce Trapdoor · spruce_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:spruce_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_trapdoor` NOT_STARTED | Spruce Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:787` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:788` NOT_STARTED | Spruce Trapdoor Open · spruce_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:849` NOT_STARTED | Warped Door · warped_door | [Door](https://minecraft.wiki/w/Door) | `I:warped_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_door` NOT_STARTED | Warped Door | [Door](https://minecraft.wiki/w/Door) | `B:849` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4 |
| `B:850` NOT_STARTED | Warped Door Open · warped_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:851` NOT_STARTED | Warped Door Top · warped_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required |

## A043 — Doors and trapdoors 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:852` NOT_STARTED | Warped Door Top Open · warped_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:843` NOT_STARTED | Warped Trapdoor · warped_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:warped_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_trapdoor` NOT_STARTED | Warped Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:843` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4 |
| `B:844` NOT_STARTED | Warped Trapdoor Open · warped_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:869` NOT_STARTED | Waxed Copper Door · waxed_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:waxed_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_copper_door` NOT_STARTED | Waxed Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:869` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:870` NOT_STARTED | Waxed Copper Door Open · waxed_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:871` NOT_STARTED | Waxed Copper Door Top · waxed_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:872` NOT_STARTED | Waxed Copper Door Top Open · waxed_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:893` NOT_STARTED | Waxed Copper Trapdoor · waxed_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:waxed_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_copper_trapdoor` NOT_STARTED | Waxed Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:893` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:894` NOT_STARTED | Waxed Copper Trapdoor Open · waxed_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:873` NOT_STARTED | Waxed Exposed Copper Door · waxed_exposed_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:waxed_exposed_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_exposed_copper_door` NOT_STARTED | Waxed Exposed Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:873` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:874` NOT_STARTED | Waxed Exposed Copper Door Open · waxed_exposed_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:875` NOT_STARTED | Waxed Exposed Copper Door Top · waxed_exposed_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:876` NOT_STARTED | Waxed Exposed Copper Door Top Open · waxed_exposed_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:895` NOT_STARTED | Waxed Exposed Copper Trapdoor · waxed_exposed_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:waxed_exposed_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_exposed_copper_trapdoor` NOT_STARTED | Waxed Exposed Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:895` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:896` NOT_STARTED | Waxed Exposed Copper Trapdoor Open · waxed_exposed_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A044 — Doors and trapdoors 7

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:877` NOT_STARTED | Waxed Oxidized Copper Door · waxed_oxidized_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:waxed_oxidized_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_oxidized_copper_door` NOT_STARTED | Waxed Oxidized Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:877` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:878` NOT_STARTED | Waxed Oxidized Copper Door Open · waxed_oxidized_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:879` NOT_STARTED | Waxed Oxidized Copper Door Top · waxed_oxidized_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:880` NOT_STARTED | Waxed Oxidized Copper Door Top Open · waxed_oxidized_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:897` NOT_STARTED | Waxed Oxidized Copper Trapdoor · waxed_oxidized_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:waxed_oxidized_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_oxidized_copper_trapdoor` NOT_STARTED | Waxed Oxidized Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:897` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:898` NOT_STARTED | Waxed Oxidized Copper Trapdoor Open · waxed_oxidized_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:881` NOT_STARTED | Waxed Weathered Copper Door · waxed_weathered_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:waxed_weathered_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_weathered_copper_door` NOT_STARTED | Waxed Weathered Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:881` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:882` NOT_STARTED | Waxed Weathered Copper Door Open · waxed_weathered_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:883` NOT_STARTED | Waxed Weathered Copper Door Top · waxed_weathered_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |
| `B:884` NOT_STARTED | Waxed Weathered Copper Door Top Open · waxed_weathered_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:899` NOT_STARTED | Waxed Weathered Copper Trapdoor · waxed_weathered_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:waxed_weathered_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_weathered_copper_trapdoor` NOT_STARTED | Waxed Weathered Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:899` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:900` NOT_STARTED | Waxed Weathered Copper Trapdoor Open · waxed_weathered_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:865` NOT_STARTED | Weathered Copper Door · weathered_copper_door | [Door](https://minecraft.wiki/w/Door) | `I:weathered_copper_door` | isTop=false; hardness=3; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:weathered_copper_door` NOT_STARTED | Weathered Copper Door | [Door](https://minecraft.wiki/w/Door) | `B:865` | isTop=false; hardness=3; type=block; door=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:866` NOT_STARTED | Weathered Copper Door Open · weathered_copper_door_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=false; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:867` NOT_STARTED | Weathered Copper Door Top · weathered_copper_door_top | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; later-version-or-custom-review-required; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A045 — Doors and trapdoors 8

Rows: 4. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.
- Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.

**Required Inspector showcase:**

- Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.

Existing test files to inspect (coverage unverified): [tests/doorWoodTypes.test.js](../../tests/doorWoodTypes.test.js), [tests/doors.test.js](../../tests/doors.test.js), [tests/door.test.js](../../tests/door.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:868` NOT_STARTED | Weathered Copper Door Top Open · weathered_copper_door_top_open | [Door](https://minecraft.wiki/w/Door) | No paired form declared | internal=true; isTop=true; hardness=3; door=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |
| `B:891` NOT_STARTED | Weathered Copper Trapdoor · weathered_copper_trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `I:weathered_copper_trapdoor` | isTop=false; hardness=3; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `I:weathered_copper_trapdoor` NOT_STARTED | Weathered Copper Trapdoor | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | `B:891` | isTop=false; hardness=3; type=block; trapdoor=true; transparent=true; present-in-pinned-1.21.4; ALSO copper |
| `B:892` NOT_STARTED | Weathered Copper Trapdoor Open · weathered_copper_trapdoor_open | [Trapdoor](https://minecraft.wiki/w/Trapdoor) | No paired form declared | internal=true; isTop=false; hardness=3; trapdoor=true; transparent=true; solid=false; later-version-or-custom-review-required; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A046 — Fences, gates, walls and bars 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.
- Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.

**Required Inspector showcase:**

- Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.

Existing test files to inspect (coverage unverified): [tests/fenceGeometry.test.js](../../tests/fenceGeometry.test.js), [tests/wallGeometry.test.js](../../tests/wallGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:372` NOT_STARTED | Acacia Fence · acacia_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:acacia_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:acacia_fence` NOT_STARTED | Acacia Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:372` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:360` NOT_STARTED | Acacia Fence Gate · acacia_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:acacia_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:acacia_fence_gate` NOT_STARTED | Acacia Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:360` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:694` NOT_STARTED | Andesite Wall · andesite_wall | [Andesite Wall](https://minecraft.wiki/w/Andesite_Wall) | `I:andesite_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:andesite_wall` NOT_STARTED | Andesite Wall | [Andesite Wall](https://minecraft.wiki/w/Andesite_Wall) | `B:694` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:374` NOT_STARTED | Birch Fence · birch_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:birch_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:birch_fence` NOT_STARTED | Birch Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:374` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:362` NOT_STARTED | Birch Fence Gate · birch_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:birch_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:birch_fence_gate` NOT_STARTED | Birch Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:362` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:695` NOT_STARTED | Blackstone Wall · blackstone_wall | [Blackstone Wall](https://minecraft.wiki/w/Blackstone_Wall) | `I:blackstone_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:blackstone_wall` NOT_STARTED | Blackstone Wall | [Blackstone Wall](https://minecraft.wiki/w/Blackstone_Wall) | `B:695` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:696` NOT_STARTED | Brick Wall · brick_wall | [Brick Wall](https://minecraft.wiki/w/Brick_Wall) | `I:brick_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:brick_wall` NOT_STARTED | Brick Wall | [Brick Wall](https://minecraft.wiki/w/Brick_Wall) | `B:696` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:375` NOT_STARTED | Cherry Fence · cherry_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:cherry_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:cherry_fence` NOT_STARTED | Cherry Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:375` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:363` NOT_STARTED | Cherry Fence Gate · cherry_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:cherry_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:cherry_fence_gate` NOT_STARTED | Cherry Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:363` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:697` NOT_STARTED | Cobbled Deepslate Wall · cobbled_deepslate_wall | [Cobbled Deepslate Wall](https://minecraft.wiki/w/Cobbled_Deepslate_Wall) | `I:cobbled_deepslate_wall` | hardness=3.5; wall=true; present-in-pinned-1.21.4 |
| `I:cobbled_deepslate_wall` NOT_STARTED | Cobbled Deepslate Wall | [Cobbled Deepslate Wall](https://minecraft.wiki/w/Cobbled_Deepslate_Wall) | `B:697` | hardness=3.5; type=block; wall=true; present-in-pinned-1.21.4 |

## A047 — Fences, gates, walls and bars 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.
- Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.

**Required Inspector showcase:**

- Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.

Existing test files to inspect (coverage unverified): [tests/fenceGeometry.test.js](../../tests/fenceGeometry.test.js), [tests/wallGeometry.test.js](../../tests/wallGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:698` NOT_STARTED | Cobblestone Wall · cobblestone_wall | [Cobblestone Wall](https://minecraft.wiki/w/Cobblestone_Wall) | `I:cobblestone_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:cobblestone_wall` NOT_STARTED | Cobblestone Wall | [Cobblestone Wall](https://minecraft.wiki/w/Cobblestone_Wall) | `B:698` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:376` NOT_STARTED | Crimson Fence · crimson_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:crimson_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:crimson_fence` NOT_STARTED | Crimson Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:376` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:364` NOT_STARTED | Crimson Fence Gate · crimson_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:crimson_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:crimson_fence_gate` NOT_STARTED | Crimson Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:364` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:377` NOT_STARTED | Dark Oak Fence · dark_oak_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:dark_oak_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:dark_oak_fence` NOT_STARTED | Dark Oak Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:377` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:365` NOT_STARTED | Dark Oak Fence Gate · dark_oak_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:dark_oak_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:dark_oak_fence_gate` NOT_STARTED | Dark Oak Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:365` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:699` NOT_STARTED | Deepslate Brick Wall · deepslate_brick_wall | [Deepslate Brick Wall](https://minecraft.wiki/w/Deepslate_Brick_Wall) | `I:deepslate_brick_wall` | hardness=3.5; wall=true; present-in-pinned-1.21.4 |
| `I:deepslate_brick_wall` NOT_STARTED | Deepslate Brick Wall | [Deepslate Brick Wall](https://minecraft.wiki/w/Deepslate_Brick_Wall) | `B:699` | hardness=3.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:700` NOT_STARTED | Deepslate Tile Wall · deepslate_tile_wall | [Deepslate Tile Wall](https://minecraft.wiki/w/Deepslate_Tile_Wall) | `I:deepslate_tile_wall` | hardness=3.5; wall=true; present-in-pinned-1.21.4 |
| `I:deepslate_tile_wall` NOT_STARTED | Deepslate Tile Wall | [Deepslate Tile Wall](https://minecraft.wiki/w/Deepslate_Tile_Wall) | `B:700` | hardness=3.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:701` NOT_STARTED | Diorite Wall · diorite_wall | [Diorite Wall](https://minecraft.wiki/w/Diorite_Wall) | `I:diorite_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:diorite_wall` NOT_STARTED | Diorite Wall | [Diorite Wall](https://minecraft.wiki/w/Diorite_Wall) | `B:701` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:702` NOT_STARTED | End Stone Brick Wall · end_stone_brick_wall | [End Stone Brick Wall](https://minecraft.wiki/w/End_Stone_Brick_Wall) | `I:end_stone_brick_wall` | hardness=3; wall=true; present-in-pinned-1.21.4 |
| `I:end_stone_brick_wall` NOT_STARTED | End Stone Brick Wall | [End Stone Brick Wall](https://minecraft.wiki/w/End_Stone_Brick_Wall) | `B:702` | hardness=3; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:703` NOT_STARTED | Granite Wall · granite_wall | [Granite Wall](https://minecraft.wiki/w/Granite_Wall) | `I:granite_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:granite_wall` NOT_STARTED | Granite Wall | [Granite Wall](https://minecraft.wiki/w/Granite_Wall) | `B:703` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |

## A048 — Fences, gates, walls and bars 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.
- Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.

**Required Inspector showcase:**

- Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.

Existing test files to inspect (coverage unverified): [tests/fenceGeometry.test.js](../../tests/fenceGeometry.test.js), [tests/wallGeometry.test.js](../../tests/wallGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:937` NOT_STARTED | Iron Bars · iron_bars | [Iron Bars](https://minecraft.wiki/w/Iron_Bars) | `I:iron_bars` | hardness=5; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:iron_bars` NOT_STARTED | Iron Bars | [Iron Bars](https://minecraft.wiki/w/Iron_Bars) | `B:937` | hardness=5; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:378` NOT_STARTED | Jungle Fence · jungle_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:jungle_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:jungle_fence` NOT_STARTED | Jungle Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:378` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:366` NOT_STARTED | Jungle Fence Gate · jungle_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:jungle_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:jungle_fence_gate` NOT_STARTED | Jungle Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:366` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:379` NOT_STARTED | Mangrove Fence · mangrove_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:mangrove_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:mangrove_fence` NOT_STARTED | Mangrove Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:379` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:367` NOT_STARTED | Mangrove Fence Gate · mangrove_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:mangrove_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:mangrove_fence_gate` NOT_STARTED | Mangrove Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:367` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:704` NOT_STARTED | Mossy Cobblestone Wall · mossy_cobblestone_wall | [Mossy Cobblestone Wall](https://minecraft.wiki/w/Mossy_Cobblestone_Wall) | `I:mossy_cobblestone_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:mossy_cobblestone_wall` NOT_STARTED | Mossy Cobblestone Wall | [Mossy Cobblestone Wall](https://minecraft.wiki/w/Mossy_Cobblestone_Wall) | `B:704` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:705` NOT_STARTED | Mossy Stone Brick Wall · mossy_stone_brick_wall | [Mossy Stone Brick Wall](https://minecraft.wiki/w/Mossy_Stone_Brick_Wall) | `I:mossy_stone_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:mossy_stone_brick_wall` NOT_STARTED | Mossy Stone Brick Wall | [Mossy Stone Brick Wall](https://minecraft.wiki/w/Mossy_Stone_Brick_Wall) | `B:705` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:706` NOT_STARTED | Mud Brick Wall · mud_brick_wall | [Mud Brick Wall](https://minecraft.wiki/w/Mud_Brick_Wall) | `I:mud_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:mud_brick_wall` NOT_STARTED | Mud Brick Wall | [Mud Brick Wall](https://minecraft.wiki/w/Mud_Brick_Wall) | `B:706` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:380` NOT_STARTED | Nether Brick Fence · nether_brick_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:nether_brick_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:nether_brick_fence` NOT_STARTED | Nether Brick Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:380` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:707` NOT_STARTED | Nether Brick Wall · nether_brick_wall | [Nether Brick Wall](https://minecraft.wiki/w/Nether_Brick_Wall) | `I:nether_brick_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:nether_brick_wall` NOT_STARTED | Nether Brick Wall | [Nether Brick Wall](https://minecraft.wiki/w/Nether_Brick_Wall) | `B:707` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |

## A049 — Fences, gates, walls and bars 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.
- Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.

**Required Inspector showcase:**

- Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.

Existing test files to inspect (coverage unverified): [tests/fenceGeometry.test.js](../../tests/fenceGeometry.test.js), [tests/wallGeometry.test.js](../../tests/wallGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:381` NOT_STARTED | Oak Fence · oak_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:oak_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:oak_fence` NOT_STARTED | Oak Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:381` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:368` NOT_STARTED | Oak Fence Gate · oak_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:oak_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:oak_fence_gate` NOT_STARTED | Oak Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:368` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:382` NOT_STARTED | Pale Oak Fence · pale_oak_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:pale_oak_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:pale_oak_fence` NOT_STARTED | Pale Oak Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:382` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:369` NOT_STARTED | Pale Oak Fence Gate · pale_oak_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:pale_oak_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:pale_oak_fence_gate` NOT_STARTED | Pale Oak Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:369` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:708` NOT_STARTED | Polished Blackstone Brick Wall · polished_blackstone_brick_wall | [Polished Blackstone Brick Wall](https://minecraft.wiki/w/Polished_Blackstone_Brick_Wall) | `I:polished_blackstone_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_brick_wall` NOT_STARTED | Polished Blackstone Brick Wall | [Polished Blackstone Brick Wall](https://minecraft.wiki/w/Polished_Blackstone_Brick_Wall) | `B:708` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:709` NOT_STARTED | Polished Blackstone Wall · polished_blackstone_wall | [Polished Blackstone Wall](https://minecraft.wiki/w/Polished_Blackstone_Wall) | `I:polished_blackstone_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_wall` NOT_STARTED | Polished Blackstone Wall | [Polished Blackstone Wall](https://minecraft.wiki/w/Polished_Blackstone_Wall) | `B:709` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:710` NOT_STARTED | Polished Deepslate Wall · polished_deepslate_wall | [Polished Deepslate Wall](https://minecraft.wiki/w/Polished_Deepslate_Wall) | `I:polished_deepslate_wall` | hardness=3.5; wall=true; present-in-pinned-1.21.4 |
| `I:polished_deepslate_wall` NOT_STARTED | Polished Deepslate Wall | [Polished Deepslate Wall](https://minecraft.wiki/w/Polished_Deepslate_Wall) | `B:710` | hardness=3.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:711` NOT_STARTED | Polished Tuff Wall · polished_tuff_wall | [Polished Tuff Wall](https://minecraft.wiki/w/Polished_Tuff_Wall) | `I:polished_tuff_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:polished_tuff_wall` NOT_STARTED | Polished Tuff Wall | [Polished Tuff Wall](https://minecraft.wiki/w/Polished_Tuff_Wall) | `B:711` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:712` NOT_STARTED | Prismarine Wall · prismarine_wall | [Prismarine Wall](https://minecraft.wiki/w/Prismarine_Wall) | `I:prismarine_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:prismarine_wall` NOT_STARTED | Prismarine Wall | [Prismarine Wall](https://minecraft.wiki/w/Prismarine_Wall) | `B:712` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:713` NOT_STARTED | Red Nether Brick Wall · red_nether_brick_wall | [Red Nether Brick Wall](https://minecraft.wiki/w/Red_Nether_Brick_Wall) | `I:red_nether_brick_wall` | hardness=2; wall=true; present-in-pinned-1.21.4 |
| `I:red_nether_brick_wall` NOT_STARTED | Red Nether Brick Wall | [Red Nether Brick Wall](https://minecraft.wiki/w/Red_Nether_Brick_Wall) | `B:713` | hardness=2; type=block; wall=true; present-in-pinned-1.21.4 |

## A050 — Fences, gates, walls and bars 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.
- Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.

**Required Inspector showcase:**

- Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.

Existing test files to inspect (coverage unverified): [tests/fenceGeometry.test.js](../../tests/fenceGeometry.test.js), [tests/wallGeometry.test.js](../../tests/wallGeometry.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:714` NOT_STARTED | Red Sandstone Wall · red_sandstone_wall | [Red Sandstone Wall](https://minecraft.wiki/w/Red_Sandstone_Wall) | `I:red_sandstone_wall` | hardness=0.8; wall=true; present-in-pinned-1.21.4 |
| `I:red_sandstone_wall` NOT_STARTED | Red Sandstone Wall | [Red Sandstone Wall](https://minecraft.wiki/w/Red_Sandstone_Wall) | `B:714` | hardness=0.8; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:715` NOT_STARTED | Resin Brick Wall · resin_brick_wall | [Resin Brick Wall](https://minecraft.wiki/w/Resin_Brick_Wall) | `I:resin_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:resin_brick_wall` NOT_STARTED | Resin Brick Wall | [Resin Brick Wall](https://minecraft.wiki/w/Resin_Brick_Wall) | `B:715` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:716` NOT_STARTED | Sandstone Wall · sandstone_wall | [Sandstone Wall](https://minecraft.wiki/w/Sandstone_Wall) | `I:sandstone_wall` | hardness=0.8; wall=true; present-in-pinned-1.21.4 |
| `I:sandstone_wall` NOT_STARTED | Sandstone Wall | [Sandstone Wall](https://minecraft.wiki/w/Sandstone_Wall) | `B:716` | hardness=0.8; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:383` NOT_STARTED | Spruce Fence · spruce_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:spruce_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:spruce_fence` NOT_STARTED | Spruce Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:383` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:370` NOT_STARTED | Spruce Fence Gate · spruce_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:spruce_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:spruce_fence_gate` NOT_STARTED | Spruce Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:370` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |
| `B:717` NOT_STARTED | Stone Brick Wall · stone_brick_wall | [Stone Brick Wall](https://minecraft.wiki/w/Stone_Brick_Wall) | `I:stone_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:stone_brick_wall` NOT_STARTED | Stone Brick Wall | [Stone Brick Wall](https://minecraft.wiki/w/Stone_Brick_Wall) | `B:717` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:718` NOT_STARTED | Tuff Brick Wall · tuff_brick_wall | [Tuff Brick Wall](https://minecraft.wiki/w/Tuff_Brick_Wall) | `I:tuff_brick_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:tuff_brick_wall` NOT_STARTED | Tuff Brick Wall | [Tuff Brick Wall](https://minecraft.wiki/w/Tuff_Brick_Wall) | `B:718` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:719` NOT_STARTED | Tuff Wall · tuff_wall | [Tuff Wall](https://minecraft.wiki/w/Tuff_Wall) | `I:tuff_wall` | hardness=1.5; wall=true; present-in-pinned-1.21.4 |
| `I:tuff_wall` NOT_STARTED | Tuff Wall | [Tuff Wall](https://minecraft.wiki/w/Tuff_Wall) | `B:719` | hardness=1.5; type=block; wall=true; present-in-pinned-1.21.4 |
| `B:384` NOT_STARTED | Warped Fence · warped_fence | [Fence](https://minecraft.wiki/w/Fence) | `I:warped_fence` | hardness=2; fence=true; present-in-pinned-1.21.4 |
| `I:warped_fence` NOT_STARTED | Warped Fence | [Fence](https://minecraft.wiki/w/Fence) | `B:384` | hardness=2; type=block; fence=true; present-in-pinned-1.21.4 |
| `B:371` NOT_STARTED | Warped Fence Gate · warped_fence_gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `I:warped_fence_gate` | hardness=2; fenceGate=true; present-in-pinned-1.21.4 |
| `I:warped_fence_gate` NOT_STARTED | Warped Fence Gate | [Fence Gate](https://minecraft.wiki/w/Fence_Gate) | `B:371` | hardness=2; type=block; fenceGate=true; present-in-pinned-1.21.4 |

## A051 — Slabs, stairs and panels 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:448` NOT_STARTED | Acacia Slab · acacia_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:acacia_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:acacia_slab` NOT_STARTED | Acacia Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:448` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:510` NOT_STARTED | Acacia Stairs · acacia_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:acacia_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:acacia_stairs` NOT_STARTED | Acacia Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:510` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:449` NOT_STARTED | Andesite Slab · andesite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:andesite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:andesite_slab` NOT_STARTED | Andesite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:449` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:511` NOT_STARTED | Andesite Stairs · andesite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:andesite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:andesite_stairs` NOT_STARTED | Andesite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:511` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:452` NOT_STARTED | Birch Slab · birch_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:birch_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:birch_slab` NOT_STARTED | Birch Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:452` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:514` NOT_STARTED | Birch Stairs · birch_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:birch_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:birch_stairs` NOT_STARTED | Birch Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:514` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:394` NOT_STARTED | Black Stained Glass Pane · black_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:black_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:black_stained_glass_pane` NOT_STARTED | Black Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:394` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:453` NOT_STARTED | Blackstone Slab · blackstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:blackstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:blackstone_slab` NOT_STARTED | Blackstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:453` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:515` NOT_STARTED | Blackstone Stairs · blackstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:blackstone_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:blackstone_stairs` NOT_STARTED | Blackstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:515` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:395` NOT_STARTED | Blue Stained Glass Pane · blue_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:blue_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_stained_glass_pane` NOT_STARTED | Blue Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:395` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |

## A052 — Slabs, stairs and panels 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:454` NOT_STARTED | Brick Slab · brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:brick_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:brick_slab` NOT_STARTED | Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:454` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:516` NOT_STARTED | Brick Stairs · brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:brick_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:brick_stairs` NOT_STARTED | Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:516` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:396` NOT_STARTED | Brown Stained Glass Pane · brown_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:brown_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_stained_glass_pane` NOT_STARTED | Brown Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:396` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:455` NOT_STARTED | Cherry Slab · cherry_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cherry_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:cherry_slab` NOT_STARTED | Cherry Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:455` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:517` NOT_STARTED | Cherry Stairs · cherry_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:cherry_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:cherry_stairs` NOT_STARTED | Cherry Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:517` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:456` NOT_STARTED | Cobbled Deepslate Slab · cobbled_deepslate_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cobbled_deepslate_slab` | hardness=3.5; slab=true; present-in-pinned-1.21.4 |
| `I:cobbled_deepslate_slab` NOT_STARTED | Cobbled Deepslate Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:456` | hardness=3.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:518` NOT_STARTED | Cobbled Deepslate Stairs · cobbled_deepslate_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:cobbled_deepslate_stairs` | hardness=3.5; stair=true; present-in-pinned-1.21.4 |
| `I:cobbled_deepslate_stairs` NOT_STARTED | Cobbled Deepslate Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:518` | hardness=3.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:457` NOT_STARTED | Cobblestone Slab · cobblestone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cobblestone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:cobblestone_slab` NOT_STARTED | Cobblestone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:457` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:519` NOT_STARTED | Cobblestone Stairs · cobblestone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:cobblestone_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:cobblestone_stairs` NOT_STARTED | Cobblestone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:519` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:458` NOT_STARTED | Crimson Slab · crimson_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:crimson_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:crimson_slab` NOT_STARTED | Crimson Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:458` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |

## A053 — Slabs, stairs and panels 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:520` NOT_STARTED | Crimson Stairs · crimson_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:crimson_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:crimson_stairs` NOT_STARTED | Crimson Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:520` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:459` NOT_STARTED | Cut Copper Slab · cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:cut_copper_slab` NOT_STARTED | Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:459` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:521` NOT_STARTED | Cut Copper Stairs · cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:cut_copper_stairs` NOT_STARTED | Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:521` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:460` NOT_STARTED | Cut Red Sandstone Slab · cut_red_sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cut_red_sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:cut_red_sandstone_slab` NOT_STARTED | Cut Red Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:460` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:461` NOT_STARTED | Cut Sandstone Slab · cut_sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:cut_sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:cut_sandstone_slab` NOT_STARTED | Cut Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:461` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:397` NOT_STARTED | Cyan Stained Glass Pane · cyan_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:cyan_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_stained_glass_pane` NOT_STARTED | Cyan Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:397` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:462` NOT_STARTED | Dark Oak Slab · dark_oak_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:dark_oak_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:dark_oak_slab` NOT_STARTED | Dark Oak Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:462` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:522` NOT_STARTED | Dark Oak Stairs · dark_oak_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:dark_oak_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:dark_oak_stairs` NOT_STARTED | Dark Oak Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:522` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:463` NOT_STARTED | Dark Prismarine Slab · dark_prismarine_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:dark_prismarine_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:dark_prismarine_slab` NOT_STARTED | Dark Prismarine Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:463` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:523` NOT_STARTED | Dark Prismarine Stairs · dark_prismarine_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:dark_prismarine_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:dark_prismarine_stairs` NOT_STARTED | Dark Prismarine Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:523` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A054 — Slabs, stairs and panels 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:464` NOT_STARTED | Deepslate Brick Slab · deepslate_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:deepslate_brick_slab` | hardness=3.5; slab=true; present-in-pinned-1.21.4 |
| `I:deepslate_brick_slab` NOT_STARTED | Deepslate Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:464` | hardness=3.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:524` NOT_STARTED | Deepslate Brick Stairs · deepslate_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:deepslate_brick_stairs` | hardness=3.5; stair=true; present-in-pinned-1.21.4 |
| `I:deepslate_brick_stairs` NOT_STARTED | Deepslate Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:524` | hardness=3.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:465` NOT_STARTED | Deepslate Tile Slab · deepslate_tile_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:deepslate_tile_slab` | hardness=3.5; slab=true; present-in-pinned-1.21.4 |
| `I:deepslate_tile_slab` NOT_STARTED | Deepslate Tile Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:465` | hardness=3.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:525` NOT_STARTED | Deepslate Tile Stairs · deepslate_tile_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:deepslate_tile_stairs` | hardness=3.5; stair=true; present-in-pinned-1.21.4 |
| `I:deepslate_tile_stairs` NOT_STARTED | Deepslate Tile Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:525` | hardness=3.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:466` NOT_STARTED | Diorite Slab · diorite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:diorite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:diorite_slab` NOT_STARTED | Diorite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:466` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:526` NOT_STARTED | Diorite Stairs · diorite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:diorite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:diorite_stairs` NOT_STARTED | Diorite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:526` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:467` NOT_STARTED | End Stone Brick Slab · end_stone_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:end_stone_brick_slab` | hardness=3; slab=true; present-in-pinned-1.21.4 |
| `I:end_stone_brick_slab` NOT_STARTED | End Stone Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:467` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:527` NOT_STARTED | End Stone Brick Stairs · end_stone_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:end_stone_brick_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4 |
| `I:end_stone_brick_stairs` NOT_STARTED | End Stone Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:527` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:468` NOT_STARTED | Exposed Cut Copper Slab · exposed_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:exposed_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:exposed_cut_copper_slab` NOT_STARTED | Exposed Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:468` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:528` NOT_STARTED | Exposed Cut Copper Stairs · exposed_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:exposed_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:exposed_cut_copper_stairs` NOT_STARTED | Exposed Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:528` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A055 — Slabs, stairs and panels 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:398` NOT_STARTED | Glass Pane · glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:glass_pane` NOT_STARTED | Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:398` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:469` NOT_STARTED | Granite Slab · granite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:granite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:granite_slab` NOT_STARTED | Granite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:469` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:529` NOT_STARTED | Granite Stairs · granite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:granite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:granite_stairs` NOT_STARTED | Granite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:529` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:399` NOT_STARTED | Gray Stained Glass Pane · gray_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:gray_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:gray_stained_glass_pane` NOT_STARTED | Gray Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:399` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:400` NOT_STARTED | Green Stained Glass Pane · green_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:green_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:green_stained_glass_pane` NOT_STARTED | Green Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:400` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:470` NOT_STARTED | Jungle Slab · jungle_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:jungle_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:jungle_slab` NOT_STARTED | Jungle Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:470` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:530` NOT_STARTED | Jungle Stairs · jungle_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:jungle_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:jungle_stairs` NOT_STARTED | Jungle Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:530` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:401` NOT_STARTED | Light Blue Stained Glass Pane · light_blue_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:light_blue_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_stained_glass_pane` NOT_STARTED | Light Blue Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:401` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:402` NOT_STARTED | Light Gray Stained Glass Pane · light_gray_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:light_gray_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_stained_glass_pane` NOT_STARTED | Light Gray Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:402` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:403` NOT_STARTED | Lime Stained Glass Pane · lime_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:lime_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_stained_glass_pane` NOT_STARTED | Lime Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:403` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |

## A056 — Slabs, stairs and panels 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:404` NOT_STARTED | Magenta Stained Glass Pane · magenta_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:magenta_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:magenta_stained_glass_pane` NOT_STARTED | Magenta Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:404` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:471` NOT_STARTED | Mangrove Slab · mangrove_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:mangrove_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:mangrove_slab` NOT_STARTED | Mangrove Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:471` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:531` NOT_STARTED | Mangrove Stairs · mangrove_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:mangrove_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:mangrove_stairs` NOT_STARTED | Mangrove Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:531` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:472` NOT_STARTED | Mossy Cobblestone Slab · mossy_cobblestone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:mossy_cobblestone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:mossy_cobblestone_slab` NOT_STARTED | Mossy Cobblestone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:472` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:532` NOT_STARTED | Mossy Cobblestone Stairs · mossy_cobblestone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:mossy_cobblestone_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:mossy_cobblestone_stairs` NOT_STARTED | Mossy Cobblestone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:532` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:473` NOT_STARTED | Mossy Stone Brick Slab · mossy_stone_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:mossy_stone_brick_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:mossy_stone_brick_slab` NOT_STARTED | Mossy Stone Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:473` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:533` NOT_STARTED | Mossy Stone Brick Stairs · mossy_stone_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:mossy_stone_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:mossy_stone_brick_stairs` NOT_STARTED | Mossy Stone Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:533` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:474` NOT_STARTED | Mud Brick Slab · mud_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:mud_brick_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:mud_brick_slab` NOT_STARTED | Mud Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:474` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:534` NOT_STARTED | Mud Brick Stairs · mud_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:mud_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:mud_brick_stairs` NOT_STARTED | Mud Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:534` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:475` NOT_STARTED | Nether Brick Slab · nether_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:nether_brick_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:nether_brick_slab` NOT_STARTED | Nether Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:475` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |

## A057 — Slabs, stairs and panels 7

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:535` NOT_STARTED | Nether Brick Stairs · nether_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:nether_brick_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:nether_brick_stairs` NOT_STARTED | Nether Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:535` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:476` NOT_STARTED | Oak Slab · oak_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:oak_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:oak_slab` NOT_STARTED | Oak Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:476` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:536` NOT_STARTED | Oak Stairs · oak_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:oak_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:oak_stairs` NOT_STARTED | Oak Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:536` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:405` NOT_STARTED | Orange Stained Glass Pane · orange_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:orange_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_stained_glass_pane` NOT_STARTED | Orange Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:405` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:477` NOT_STARTED | Oxidized Cut Copper Slab · oxidized_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:oxidized_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:oxidized_cut_copper_slab` NOT_STARTED | Oxidized Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:477` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:537` NOT_STARTED | Oxidized Cut Copper Stairs · oxidized_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:oxidized_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:oxidized_cut_copper_stairs` NOT_STARTED | Oxidized Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:537` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:478` NOT_STARTED | Pale Oak Slab · pale_oak_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:pale_oak_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:pale_oak_slab` NOT_STARTED | Pale Oak Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:478` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:538` NOT_STARTED | Pale Oak Stairs · pale_oak_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:pale_oak_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:pale_oak_stairs` NOT_STARTED | Pale Oak Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:538` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:479` NOT_STARTED | Petrified Oak Slab · petrified_oak_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:petrified_oak_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:petrified_oak_slab` NOT_STARTED | Petrified Oak Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:479` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:406` NOT_STARTED | Pink Stained Glass Pane · pink_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:pink_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_stained_glass_pane` NOT_STARTED | Pink Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:406` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A058 — Slabs, stairs and panels 8

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:480` NOT_STARTED | Polished Andesite Slab · polished_andesite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_andesite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:polished_andesite_slab` NOT_STARTED | Polished Andesite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:480` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:539` NOT_STARTED | Polished Andesite Stairs · polished_andesite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_andesite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_andesite_stairs` NOT_STARTED | Polished Andesite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:539` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:481` NOT_STARTED | Polished Blackstone Brick Slab · polished_blackstone_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_blackstone_brick_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_brick_slab` NOT_STARTED | Polished Blackstone Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:481` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:540` NOT_STARTED | Polished Blackstone Brick Stairs · polished_blackstone_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_blackstone_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_brick_stairs` NOT_STARTED | Polished Blackstone Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:540` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:482` NOT_STARTED | Polished Blackstone Slab · polished_blackstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_blackstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_slab` NOT_STARTED | Polished Blackstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:482` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:541` NOT_STARTED | Polished Blackstone Stairs · polished_blackstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_blackstone_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:polished_blackstone_stairs` NOT_STARTED | Polished Blackstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:541` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:483` NOT_STARTED | Polished Deepslate Slab · polished_deepslate_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_deepslate_slab` | hardness=3.5; slab=true; present-in-pinned-1.21.4 |
| `I:polished_deepslate_slab` NOT_STARTED | Polished Deepslate Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:483` | hardness=3.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:542` NOT_STARTED | Polished Deepslate Stairs · polished_deepslate_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_deepslate_stairs` | hardness=3.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_deepslate_stairs` NOT_STARTED | Polished Deepslate Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:542` | hardness=3.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:484` NOT_STARTED | Polished Diorite Slab · polished_diorite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_diorite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:polished_diorite_slab` NOT_STARTED | Polished Diorite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:484` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:543` NOT_STARTED | Polished Diorite Stairs · polished_diorite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_diorite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_diorite_stairs` NOT_STARTED | Polished Diorite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:543` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |

## A059 — Slabs, stairs and panels 9

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:485` NOT_STARTED | Polished Granite Slab · polished_granite_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_granite_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:polished_granite_slab` NOT_STARTED | Polished Granite Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:485` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:544` NOT_STARTED | Polished Granite Stairs · polished_granite_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_granite_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_granite_stairs` NOT_STARTED | Polished Granite Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:544` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:486` NOT_STARTED | Polished Tuff Slab · polished_tuff_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:polished_tuff_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:polished_tuff_slab` NOT_STARTED | Polished Tuff Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:486` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:545` NOT_STARTED | Polished Tuff Stairs · polished_tuff_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:polished_tuff_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:polished_tuff_stairs` NOT_STARTED | Polished Tuff Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:545` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:487` NOT_STARTED | Prismarine Brick Slab · prismarine_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:prismarine_brick_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:prismarine_brick_slab` NOT_STARTED | Prismarine Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:487` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:546` NOT_STARTED | Prismarine Brick Stairs · prismarine_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:prismarine_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:prismarine_brick_stairs` NOT_STARTED | Prismarine Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:546` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:488` NOT_STARTED | Prismarine Slab · prismarine_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:prismarine_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:prismarine_slab` NOT_STARTED | Prismarine Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:488` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:547` NOT_STARTED | Prismarine Stairs · prismarine_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:prismarine_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:prismarine_stairs` NOT_STARTED | Prismarine Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:547` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:407` NOT_STARTED | Purple Stained Glass Pane · purple_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:purple_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_stained_glass_pane` NOT_STARTED | Purple Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:407` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:489` NOT_STARTED | Purpur Slab · purpur_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:purpur_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:purpur_slab` NOT_STARTED | Purpur Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:489` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |

## A060 — Slabs, stairs and panels 10

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:548` NOT_STARTED | Purpur Stairs · purpur_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:purpur_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:purpur_stairs` NOT_STARTED | Purpur Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:548` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:490` NOT_STARTED | Quartz Slab · quartz_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:quartz_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:quartz_slab` NOT_STARTED | Quartz Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:490` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:549` NOT_STARTED | Quartz Stairs · quartz_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:quartz_stairs` | hardness=0.8; stair=true; present-in-pinned-1.21.4 |
| `I:quartz_stairs` NOT_STARTED | Quartz Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:549` | hardness=0.8; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:491` NOT_STARTED | Red Nether Brick Slab · red_nether_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:red_nether_brick_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:red_nether_brick_slab` NOT_STARTED | Red Nether Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:491` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:550` NOT_STARTED | Red Nether Brick Stairs · red_nether_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:red_nether_brick_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:red_nether_brick_stairs` NOT_STARTED | Red Nether Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:550` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:492` NOT_STARTED | Red Sandstone Slab · red_sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:red_sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:red_sandstone_slab` NOT_STARTED | Red Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:492` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:551` NOT_STARTED | Red Sandstone Stairs · red_sandstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:red_sandstone_stairs` | hardness=0.8; stair=true; present-in-pinned-1.21.4 |
| `I:red_sandstone_stairs` NOT_STARTED | Red Sandstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:551` | hardness=0.8; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:408` NOT_STARTED | Red Stained Glass Pane · red_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:red_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:red_stained_glass_pane` NOT_STARTED | Red Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:408` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:493` NOT_STARTED | Resin Brick Slab · resin_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:resin_brick_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:resin_brick_slab` NOT_STARTED | Resin Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:493` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:552` NOT_STARTED | Resin Brick Stairs · resin_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:resin_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:resin_brick_stairs` NOT_STARTED | Resin Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:552` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |

## A061 — Slabs, stairs and panels 11

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:494` NOT_STARTED | Sandstone Slab · sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:sandstone_slab` NOT_STARTED | Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:494` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:553` NOT_STARTED | Sandstone Stairs · sandstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:sandstone_stairs` | hardness=0.8; stair=true; present-in-pinned-1.21.4 |
| `I:sandstone_stairs` NOT_STARTED | Sandstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:553` | hardness=0.8; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:495` NOT_STARTED | Smooth Quartz Slab · smooth_quartz_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:smooth_quartz_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:smooth_quartz_slab` NOT_STARTED | Smooth Quartz Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:495` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:554` NOT_STARTED | Smooth Quartz Stairs · smooth_quartz_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:smooth_quartz_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:smooth_quartz_stairs` NOT_STARTED | Smooth Quartz Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:554` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:496` NOT_STARTED | Smooth Red Sandstone Slab · smooth_red_sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:smooth_red_sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:smooth_red_sandstone_slab` NOT_STARTED | Smooth Red Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:496` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:555` NOT_STARTED | Smooth Red Sandstone Stairs · smooth_red_sandstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:smooth_red_sandstone_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:smooth_red_sandstone_stairs` NOT_STARTED | Smooth Red Sandstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:555` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:497` NOT_STARTED | Smooth Sandstone Slab · smooth_sandstone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:smooth_sandstone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:smooth_sandstone_slab` NOT_STARTED | Smooth Sandstone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:497` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:556` NOT_STARTED | Smooth Sandstone Stairs · smooth_sandstone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:smooth_sandstone_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:smooth_sandstone_stairs` NOT_STARTED | Smooth Sandstone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:556` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:498` NOT_STARTED | Smooth Stone Slab · smooth_stone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:smooth_stone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:smooth_stone_slab` NOT_STARTED | Smooth Stone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:498` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:499` NOT_STARTED | Spruce Slab · spruce_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:spruce_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:spruce_slab` NOT_STARTED | Spruce Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:499` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |

## A062 — Slabs, stairs and panels 12

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:557` NOT_STARTED | Spruce Stairs · spruce_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:spruce_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:spruce_stairs` NOT_STARTED | Spruce Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:557` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:500` NOT_STARTED | Stone Brick Slab · stone_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:stone_brick_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:stone_brick_slab` NOT_STARTED | Stone Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:500` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:558` NOT_STARTED | Stone Brick Stairs · stone_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:stone_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:stone_brick_stairs` NOT_STARTED | Stone Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:558` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:501` NOT_STARTED | Stone Slab · stone_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:stone_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:stone_slab` NOT_STARTED | Stone Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:501` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:559` NOT_STARTED | Stone Stairs · stone_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:stone_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:stone_stairs` NOT_STARTED | Stone Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:559` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:502` NOT_STARTED | Tuff Brick Slab · tuff_brick_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:tuff_brick_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:tuff_brick_slab` NOT_STARTED | Tuff Brick Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:502` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:560` NOT_STARTED | Tuff Brick Stairs · tuff_brick_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:tuff_brick_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:tuff_brick_stairs` NOT_STARTED | Tuff Brick Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:560` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:503` NOT_STARTED | Tuff Slab · tuff_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:tuff_slab` | hardness=1.5; slab=true; present-in-pinned-1.21.4 |
| `I:tuff_slab` NOT_STARTED | Tuff Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:503` | hardness=1.5; type=block; slab=true; present-in-pinned-1.21.4 |
| `B:561` NOT_STARTED | Tuff Stairs · tuff_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:tuff_stairs` | hardness=1.5; stair=true; present-in-pinned-1.21.4 |
| `I:tuff_stairs` NOT_STARTED | Tuff Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:561` | hardness=1.5; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:504` NOT_STARTED | Warped Slab · warped_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:warped_slab` | hardness=2; slab=true; present-in-pinned-1.21.4 |
| `I:warped_slab` NOT_STARTED | Warped Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:504` | hardness=2; type=block; slab=true; present-in-pinned-1.21.4 |

## A063 — Slabs, stairs and panels 13

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:562` NOT_STARTED | Warped Stairs · warped_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:warped_stairs` | hardness=2; stair=true; present-in-pinned-1.21.4 |
| `I:warped_stairs` NOT_STARTED | Warped Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:562` | hardness=2; type=block; stair=true; present-in-pinned-1.21.4 |
| `B:505` NOT_STARTED | Waxed Cut Copper Slab · waxed_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:waxed_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_cut_copper_slab` NOT_STARTED | Waxed Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:505` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:563` NOT_STARTED | Waxed Cut Copper Stairs · waxed_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:waxed_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_cut_copper_stairs` NOT_STARTED | Waxed Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:563` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:506` NOT_STARTED | Waxed Exposed Cut Copper Slab · waxed_exposed_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:waxed_exposed_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_exposed_cut_copper_slab` NOT_STARTED | Waxed Exposed Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:506` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:564` NOT_STARTED | Waxed Exposed Cut Copper Stairs · waxed_exposed_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:waxed_exposed_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_exposed_cut_copper_stairs` NOT_STARTED | Waxed Exposed Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:564` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:507` NOT_STARTED | Waxed Oxidized Cut Copper Slab · waxed_oxidized_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:waxed_oxidized_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_oxidized_cut_copper_slab` NOT_STARTED | Waxed Oxidized Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:507` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:565` NOT_STARTED | Waxed Oxidized Cut Copper Stairs · waxed_oxidized_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:waxed_oxidized_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_oxidized_cut_copper_stairs` NOT_STARTED | Waxed Oxidized Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:565` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:508` NOT_STARTED | Waxed Weathered Cut Copper Slab · waxed_weathered_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:waxed_weathered_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_weathered_cut_copper_slab` NOT_STARTED | Waxed Weathered Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:508` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `B:566` NOT_STARTED | Waxed Weathered Cut Copper Stairs · waxed_weathered_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:waxed_weathered_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:waxed_weathered_cut_copper_stairs` NOT_STARTED | Waxed Weathered Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:566` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:509` NOT_STARTED | Weathered Cut Copper Slab · weathered_cut_copper_slab | [Slab](https://minecraft.wiki/w/Slab) | `I:weathered_cut_copper_slab` | hardness=3; slab=true; present-in-pinned-1.21.4; ALSO copper |
| `I:weathered_cut_copper_slab` NOT_STARTED | Weathered Cut Copper Slab | [Slab](https://minecraft.wiki/w/Slab) | `B:509` | hardness=3; type=block; slab=true; present-in-pinned-1.21.4; ALSO copper |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A064 — Slabs, stairs and panels 14

Rows: 6. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.
- Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.

**Required Inspector showcase:**

- All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.

Existing test files to inspect (coverage unverified): [tests/slabGeometry.test.js](../../tests/slabGeometry.test.js), [tests/stairGeometry.test.js](../../tests/stairGeometry.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/furnaceRendering.test.js](../../tests/furnaceRendering.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:567` NOT_STARTED | Weathered Cut Copper Stairs · weathered_cut_copper_stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `I:weathered_cut_copper_stairs` | hardness=3; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `I:weathered_cut_copper_stairs` NOT_STARTED | Weathered Cut Copper Stairs | [Stairs](https://minecraft.wiki/w/Stairs) | `B:567` | hardness=3; type=block; stair=true; present-in-pinned-1.21.4; ALSO copper |
| `B:409` NOT_STARTED | White Stained Glass Pane · white_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:white_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:white_stained_glass_pane` NOT_STARTED | White Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:409` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `B:410` NOT_STARTED | Yellow Stained Glass Pane · yellow_stained_glass_pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `I:yellow_stained_glass_pane` | hardness=0.3; pane=true; transparent=true; present-in-pinned-1.21.4 |
| `I:yellow_stained_glass_pane` NOT_STARTED | Yellow Stained Glass Pane | [Glass Pane](https://minecraft.wiki/w/Glass_Pane) | `B:410` | hardness=0.3; type=block; pane=true; transparent=true; present-in-pinned-1.21.4 |

**Additional requirements for rows marked ALSO copper: Copper variants and oxidation.**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.
- Showcase: Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

## A065 — Wool, carpets and beds 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:bed` NOT_STARTED | Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:159` | isHead=false; hardness=0.2; dropItem=red_bed; type=utility; bed=true; transparent=true; solid=true; later-version-or-custom-review-required |
| `B:254` NOT_STARTED | Black Bed · black_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:black_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:black_bed` NOT_STARTED | Black Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:254` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:772` NOT_STARTED | Black Bed Head · black_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:black_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:black_bed_head` NOT_STARTED | Black Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:772` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:299` NOT_STARTED | Black Carpet · black_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:black_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:black_carpet` NOT_STARTED | Black Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:299` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:48` NOT_STARTED | Black Wool · black_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |
| `B:255` NOT_STARTED | Blue Bed · blue_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:blue_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_bed` NOT_STARTED | Blue Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:255` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:773` NOT_STARTED | Blue Bed Head · blue_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:blue_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:blue_bed_head` NOT_STARTED | Blue Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:773` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:300` NOT_STARTED | Blue Carpet · blue_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:blue_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:blue_carpet` NOT_STARTED | Blue Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:300` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:45` NOT_STARTED | Blue Wool · blue_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |
| `B:256` NOT_STARTED | Brown Bed · brown_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:brown_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_bed` NOT_STARTED | Brown Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:256` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:774` NOT_STARTED | Brown Bed Head · brown_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:brown_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:brown_bed_head` NOT_STARTED | Brown Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:774` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:301` NOT_STARTED | Brown Carpet · brown_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:brown_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |

## A066 — Wool, carpets and beds 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:brown_carpet` NOT_STARTED | Brown Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:301` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:762` NOT_STARTED | Brown Wool · brown_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:brown_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:brown_wool` NOT_STARTED | Brown Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:762` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:257` NOT_STARTED | Cyan Bed · cyan_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:cyan_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_bed` NOT_STARTED | Cyan Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:257` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:775` NOT_STARTED | Cyan Bed Head · cyan_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:cyan_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:cyan_bed_head` NOT_STARTED | Cyan Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:775` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:302` NOT_STARTED | Cyan Carpet · cyan_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:cyan_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:cyan_carpet` NOT_STARTED | Cyan Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:302` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:763` NOT_STARTED | Cyan Wool · cyan_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:cyan_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:cyan_wool` NOT_STARTED | Cyan Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:763` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:258` NOT_STARTED | Gray Bed · gray_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:gray_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:gray_bed` NOT_STARTED | Gray Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:258` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:776` NOT_STARTED | Gray Bed Head · gray_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:gray_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:gray_bed_head` NOT_STARTED | Gray Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:776` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:303` NOT_STARTED | Gray Carpet · gray_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:gray_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:gray_carpet` NOT_STARTED | Gray Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:303` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:764` NOT_STARTED | Gray Wool · gray_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:gray_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:gray_wool` NOT_STARTED | Gray Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:764` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:259` NOT_STARTED | Green Bed · green_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:green_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |

## A067 — Wool, carpets and beds 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:green_bed` NOT_STARTED | Green Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:259` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:777` NOT_STARTED | Green Bed Head · green_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:green_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:green_bed_head` NOT_STARTED | Green Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:777` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:304` NOT_STARTED | Green Carpet · green_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:green_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:green_carpet` NOT_STARTED | Green Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:304` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:47` NOT_STARTED | Green Wool · green_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |
| `B:260` NOT_STARTED | Light Blue Bed · light_blue_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:light_blue_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_bed` NOT_STARTED | Light Blue Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:260` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:778` NOT_STARTED | Light Blue Bed Head · light_blue_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:light_blue_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:light_blue_bed_head` NOT_STARTED | Light Blue Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:778` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:305` NOT_STARTED | Light Blue Carpet · light_blue_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:light_blue_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:light_blue_carpet` NOT_STARTED | Light Blue Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:305` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:765` NOT_STARTED | Light Blue Wool · light_blue_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:light_blue_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:light_blue_wool` NOT_STARTED | Light Blue Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:765` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:261` NOT_STARTED | Light Gray Bed · light_gray_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:light_gray_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_bed` NOT_STARTED | Light Gray Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:261` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:779` NOT_STARTED | Light Gray Bed Head · light_gray_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:light_gray_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:light_gray_bed_head` NOT_STARTED | Light Gray Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:779` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:306` NOT_STARTED | Light Gray Carpet · light_gray_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:light_gray_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:light_gray_carpet` NOT_STARTED | Light Gray Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:306` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |

## A068 — Wool, carpets and beds 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:766` NOT_STARTED | Light Gray Wool · light_gray_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:light_gray_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:light_gray_wool` NOT_STARTED | Light Gray Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:766` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:262` NOT_STARTED | Lime Bed · lime_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:lime_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_bed` NOT_STARTED | Lime Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:262` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:780` NOT_STARTED | Lime Bed Head · lime_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:lime_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:lime_bed_head` NOT_STARTED | Lime Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:780` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:307` NOT_STARTED | Lime Carpet · lime_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:lime_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:lime_carpet` NOT_STARTED | Lime Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:307` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:767` NOT_STARTED | Lime Wool · lime_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:lime_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:lime_wool` NOT_STARTED | Lime Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:767` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:263` NOT_STARTED | Magenta Bed · magenta_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:magenta_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:magenta_bed` NOT_STARTED | Magenta Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:263` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:781` NOT_STARTED | Magenta Bed Head · magenta_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:magenta_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:magenta_bed_head` NOT_STARTED | Magenta Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:781` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:308` NOT_STARTED | Magenta Carpet · magenta_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:magenta_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:magenta_carpet` NOT_STARTED | Magenta Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:308` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:768` NOT_STARTED | Magenta Wool · magenta_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:magenta_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:magenta_wool` NOT_STARTED | Magenta Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:768` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:264` NOT_STARTED | Orange Bed · orange_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:orange_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_bed` NOT_STARTED | Orange Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:264` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |

## A069 — Wool, carpets and beds 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:782` NOT_STARTED | Orange Bed Head · orange_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:orange_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:orange_bed_head` NOT_STARTED | Orange Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:782` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:309` NOT_STARTED | Orange Carpet · orange_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:orange_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:orange_carpet` NOT_STARTED | Orange Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:309` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:769` NOT_STARTED | Orange Wool · orange_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:orange_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:orange_wool` NOT_STARTED | Orange Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:769` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:265` NOT_STARTED | Pink Bed · pink_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:pink_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_bed` NOT_STARTED | Pink Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:265` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:783` NOT_STARTED | Pink Bed Head · pink_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:pink_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:pink_bed_head` NOT_STARTED | Pink Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:783` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:311` NOT_STARTED | Pink Carpet · pink_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:pink_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:pink_carpet` NOT_STARTED | Pink Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:311` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:770` NOT_STARTED | Pink Wool · pink_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:pink_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:pink_wool` NOT_STARTED | Pink Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:770` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:266` NOT_STARTED | Purple Bed · purple_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:purple_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_bed` NOT_STARTED | Purple Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:266` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:784` NOT_STARTED | Purple Bed Head · purple_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:purple_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:purple_bed_head` NOT_STARTED | Purple Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:784` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:312` NOT_STARTED | Purple Carpet · purple_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:purple_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:purple_carpet` NOT_STARTED | Purple Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:312` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |

## A070 — Wool, carpets and beds 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:771` NOT_STARTED | Purple Wool · purple_wool | [Wool](https://minecraft.wiki/w/Wool) | `I:purple_wool` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:purple_wool` NOT_STARTED | Purple Wool | [Wool](https://minecraft.wiki/w/Wool) | `B:771` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:159` NOT_STARTED | Red Bed · red_bed_foot, red_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:red_bed`, `I:bed` | isHead=false; hardness=0.2; dropItem=red_bed; bed=true; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `I:red_bed` NOT_STARTED | Red Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:159` | isHead=false; hardness=0.2; dropItem=red_bed; stackSize=1; type=utility; bed=true; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:160` NOT_STARTED | Red Bed Head · red_bed_head | [Bed](https://minecraft.wiki/w/Bed) | No paired form declared | isHead=true; hardness=0.2; dropItem=red_bed; bed=true; transparent=true; solid=true; later-version-or-custom-review-required |
| `B:313` NOT_STARTED | Red Carpet · red_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:red_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:red_carpet` NOT_STARTED | Red Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:313` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:44` NOT_STARTED | Red Wool · red_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |
| `B:1219` NOT_STARTED | Snow · snow_layer | [Snow](https://minecraft.wiki/w/Snow) | No paired form declared | carpetHeight=0.125; hardness=0.1; drop=snowball; dropItem=snowball; carpet=true; transparent=true; solid=false; later-version-or-custom-review-required |
| `B:267` NOT_STARTED | White Bed · white_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:white_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:white_bed` NOT_STARTED | White Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:267` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:785` NOT_STARTED | White Bed Head · white_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:white_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:white_bed_head` NOT_STARTED | White Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:785` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |
| `B:314` NOT_STARTED | White Carpet · white_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:white_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:white_carpet` NOT_STARTED | White Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:314` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:43` NOT_STARTED | White Wool · white_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |
| `B:268` NOT_STARTED | Yellow Bed · yellow_bed | [Bed](https://minecraft.wiki/w/Bed) | `I:yellow_bed` | hardness=0.2; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `I:yellow_bed` NOT_STARTED | Yellow Bed | [Bed](https://minecraft.wiki/w/Bed) | `B:268` | hardness=0.2; stackSize=1; type=block; bed=true; transparent=true; present-in-pinned-1.21.4 |
| `B:786` NOT_STARTED | Yellow Bed Head · yellow_bed_head | [Bed](https://minecraft.wiki/w/Bed) | `I:yellow_bed_head` | isHead=true; hardness=0.2; bed=true; later-version-or-custom-review-required |
| `I:yellow_bed_head` NOT_STARTED | Yellow Bed Head | [Bed](https://minecraft.wiki/w/Bed) | `B:786` | isHead=true; hardness=0.2; type=block; bed=true; later-version-or-custom-review-required |

## A071 — Wool, carpets and beds 7

Rows: 3. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.
- Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.

**Required Inspector showcase:**

- Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.

Existing test files to inspect (coverage unverified): [tests/bedColors.test.js](../../tests/bedColors.test.js), [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:315` NOT_STARTED | Yellow Carpet · yellow_carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `I:yellow_carpet` | hardness=0.1; carpet=true; present-in-pinned-1.21.4 |
| `I:yellow_carpet` NOT_STARTED | Yellow Carpet | [Carpet](https://minecraft.wiki/w/Carpet) | `B:315` | hardness=0.1; type=block; carpet=true; present-in-pinned-1.21.4 |
| `B:46` NOT_STARTED | Yellow Wool · yellow_wool | [Wool](https://minecraft.wiki/w/Wool) | No paired form declared | hardness=0.8; present-in-pinned-1.21.4 |

## A072 — Signs and banners 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:901` NOT_STARTED | Acacia Hanging Sign · acacia_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:acacia_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_hanging_sign` NOT_STARTED | Acacia Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:901` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:925` NOT_STARTED | Acacia Sign · acacia_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:acacia_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_sign` NOT_STARTED | Acacia Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:925` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:902` NOT_STARTED | Acacia Wall Hanging Sign · acacia_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:acacia_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:acacia_wall_hanging_sign` NOT_STARTED | Acacia Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:902` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1145` NOT_STARTED | Acacia Wall Sign · acacia_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1145; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:905` NOT_STARTED | Birch Hanging Sign · birch_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:birch_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_hanging_sign` NOT_STARTED | Birch Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:905` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:927` NOT_STARTED | Birch Sign · birch_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:birch_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_sign` NOT_STARTED | Birch Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:927` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:906` NOT_STARTED | Birch Wall Hanging Sign · birch_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:birch_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_wall_hanging_sign` NOT_STARTED | Birch Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:906` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1144` NOT_STARTED | Birch Wall Sign · birch_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1144; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:222` NOT_STARTED | Black Banner · black_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:black_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:black_banner` NOT_STARTED | Black Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:222` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:223` NOT_STARTED | Black Wall Banner · black_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:black_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:black_wall_banner` NOT_STARTED | Black Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:223` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:224` NOT_STARTED | Blue Banner · blue_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:blue_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_banner` NOT_STARTED | Blue Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:224` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |

## A073 — Signs and banners 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:225` NOT_STARTED | Blue Wall Banner · blue_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:blue_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_wall_banner` NOT_STARTED | Blue Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:225` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:226` NOT_STARTED | Brown Banner · brown_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:brown_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_banner` NOT_STARTED | Brown Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:226` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:227` NOT_STARTED | Brown Wall Banner · brown_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:brown_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_wall_banner` NOT_STARTED | Brown Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:227` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:907` NOT_STARTED | Cherry Hanging Sign · cherry_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:cherry_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_hanging_sign` NOT_STARTED | Cherry Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:907` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:928` NOT_STARTED | Cherry Sign · cherry_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:cherry_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_sign` NOT_STARTED | Cherry Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:928` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:908` NOT_STARTED | Cherry Wall Hanging Sign · cherry_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:cherry_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:cherry_wall_hanging_sign` NOT_STARTED | Cherry Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:908` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1146` NOT_STARTED | Cherry Wall Sign · cherry_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1146; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:909` NOT_STARTED | Crimson Hanging Sign · crimson_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:crimson_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_hanging_sign` NOT_STARTED | Crimson Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:909` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:929` NOT_STARTED | Crimson Sign · crimson_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:crimson_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_sign` NOT_STARTED | Crimson Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:929` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:910` NOT_STARTED | Crimson Wall Hanging Sign · crimson_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:crimson_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:crimson_wall_hanging_sign` NOT_STARTED | Crimson Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:910` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1152` NOT_STARTED | Crimson Wall Sign · crimson_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1152; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |

## A074 — Signs and banners 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:228` NOT_STARTED | Cyan Banner · cyan_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:cyan_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_banner` NOT_STARTED | Cyan Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:228` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:229` NOT_STARTED | Cyan Wall Banner · cyan_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:cyan_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_wall_banner` NOT_STARTED | Cyan Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:229` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:911` NOT_STARTED | Dark Oak Hanging Sign · dark_oak_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:dark_oak_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_hanging_sign` NOT_STARTED | Dark Oak Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:911` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:930` NOT_STARTED | Dark Oak Sign · dark_oak_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:dark_oak_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_sign` NOT_STARTED | Dark Oak Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:930` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:912` NOT_STARTED | Dark Oak Wall Hanging Sign · dark_oak_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:dark_oak_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:dark_oak_wall_hanging_sign` NOT_STARTED | Dark Oak Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:912` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1148` NOT_STARTED | Dark Oak Wall Sign · dark_oak_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1148; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:230` NOT_STARTED | Gray Banner · gray_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:gray_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:gray_banner` NOT_STARTED | Gray Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:230` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:231` NOT_STARTED | Gray Wall Banner · gray_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:gray_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:gray_wall_banner` NOT_STARTED | Gray Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:231` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:232` NOT_STARTED | Green Banner · green_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:green_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:green_banner` NOT_STARTED | Green Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:232` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:233` NOT_STARTED | Green Wall Banner · green_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:green_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:green_wall_banner` NOT_STARTED | Green Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:233` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:913` NOT_STARTED | Jungle Hanging Sign · jungle_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:jungle_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |

## A075 — Signs and banners 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:jungle_hanging_sign` NOT_STARTED | Jungle Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:913` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:931` NOT_STARTED | Jungle Sign · jungle_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:jungle_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_sign` NOT_STARTED | Jungle Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:931` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:914` NOT_STARTED | Jungle Wall Hanging Sign · jungle_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:jungle_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_wall_hanging_sign` NOT_STARTED | Jungle Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:914` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1147` NOT_STARTED | Jungle Wall Sign · jungle_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1147; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:234` NOT_STARTED | Light Blue Banner · light_blue_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:light_blue_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_banner` NOT_STARTED | Light Blue Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:234` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:235` NOT_STARTED | Light Blue Wall Banner · light_blue_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:light_blue_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_wall_banner` NOT_STARTED | Light Blue Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:235` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:236` NOT_STARTED | Light Gray Banner · light_gray_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:light_gray_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_banner` NOT_STARTED | Light Gray Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:236` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:237` NOT_STARTED | Light Gray Wall Banner · light_gray_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:light_gray_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_wall_banner` NOT_STARTED | Light Gray Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:237` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:238` NOT_STARTED | Lime Banner · lime_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:lime_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_banner` NOT_STARTED | Lime Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:238` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:239` NOT_STARTED | Lime Wall Banner · lime_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:lime_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_wall_banner` NOT_STARTED | Lime Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:239` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:240` NOT_STARTED | Magenta Banner · magenta_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:magenta_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:magenta_banner` NOT_STARTED | Magenta Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:240` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |

## A076 — Signs and banners 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:241` NOT_STARTED | Magenta Wall Banner · magenta_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:magenta_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:magenta_wall_banner` NOT_STARTED | Magenta Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:241` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:915` NOT_STARTED | Mangrove Hanging Sign · mangrove_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:mangrove_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_hanging_sign` NOT_STARTED | Mangrove Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:915` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:932` NOT_STARTED | Mangrove Sign · mangrove_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:mangrove_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_sign` NOT_STARTED | Mangrove Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:932` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:916` NOT_STARTED | Mangrove Wall Hanging Sign · mangrove_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:mangrove_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:mangrove_wall_hanging_sign` NOT_STARTED | Mangrove Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:916` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1150` NOT_STARTED | Mangrove Wall Sign · mangrove_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1150; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:917` NOT_STARTED | Oak Hanging Sign · oak_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:oak_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:oak_hanging_sign` NOT_STARTED | Oak Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:917` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:933` NOT_STARTED | Oak Sign · oak_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:oak_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:oak_sign` NOT_STARTED | Oak Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:933` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:918` NOT_STARTED | Oak Wall Hanging Sign · oak_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:oak_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:oak_wall_hanging_sign` NOT_STARTED | Oak Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:918` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1142` NOT_STARTED | Oak Wall Sign · oak_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1142; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:242` NOT_STARTED | Orange Banner · orange_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:orange_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_banner` NOT_STARTED | Orange Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:242` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:243` NOT_STARTED | Orange Wall Banner · orange_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:orange_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_wall_banner` NOT_STARTED | Orange Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:243` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |

## A077 — Signs and banners 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:919` NOT_STARTED | Pale Oak Hanging Sign · pale_oak_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:pale_oak_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_hanging_sign` NOT_STARTED | Pale Oak Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:919` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:934` NOT_STARTED | Pale Oak Sign · pale_oak_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:pale_oak_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_sign` NOT_STARTED | Pale Oak Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:934` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:920` NOT_STARTED | Pale Oak Wall Hanging Sign · pale_oak_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:pale_oak_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:pale_oak_wall_hanging_sign` NOT_STARTED | Pale Oak Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:920` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1149` NOT_STARTED | Pale Oak Wall Sign · pale_oak_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1149; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:244` NOT_STARTED | Pink Banner · pink_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:pink_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_banner` NOT_STARTED | Pink Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:244` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:245` NOT_STARTED | Pink Wall Banner · pink_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:pink_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_wall_banner` NOT_STARTED | Pink Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:245` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:246` NOT_STARTED | Purple Banner · purple_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:purple_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_banner` NOT_STARTED | Purple Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:246` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:247` NOT_STARTED | Purple Wall Banner · purple_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:purple_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_wall_banner` NOT_STARTED | Purple Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:247` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:248` NOT_STARTED | Red Banner · red_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:red_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:red_banner` NOT_STARTED | Red Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:248` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:249` NOT_STARTED | Red Wall Banner · red_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:red_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:red_wall_banner` NOT_STARTED | Red Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:249` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:921` NOT_STARTED | Spruce Hanging Sign · spruce_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:spruce_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |

## A078 — Signs and banners 7

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:spruce_hanging_sign` NOT_STARTED | Spruce Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:921` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:935` NOT_STARTED | Spruce Sign · spruce_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:spruce_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_sign` NOT_STARTED | Spruce Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:935` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:922` NOT_STARTED | Spruce Wall Hanging Sign · spruce_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:spruce_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:spruce_wall_hanging_sign` NOT_STARTED | Spruce Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:922` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1143` NOT_STARTED | Spruce Wall Sign · spruce_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1143; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:923` NOT_STARTED | Warped Hanging Sign · warped_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:warped_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_hanging_sign` NOT_STARTED | Warped Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:923` | hardness=1; stackSize=16; type=block; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:936` NOT_STARTED | Warped Sign · warped_sign | [Sign](https://minecraft.wiki/w/Sign) | `I:warped_sign` | hardness=1; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_sign` NOT_STARTED | Warped Sign | [Sign](https://minecraft.wiki/w/Sign) | `B:936` | hardness=1; stackSize=16; type=block; sign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:924` NOT_STARTED | Warped Wall Hanging Sign · warped_wall_hanging_sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `I:warped_wall_hanging_sign` | hardness=1; hangingSign=true; transparent=true; present-in-pinned-1.21.4 |
| `I:warped_wall_hanging_sign` NOT_STARTED | Warped Wall Hanging Sign | [Hanging Sign](https://minecraft.wiki/w/Hanging_Sign) | `B:924` | hardness=1; type=block; hangingSign=true; transparent=true; later-version-or-custom-review-required |
| `B:1153` NOT_STARTED | Warped Wall Sign · warped_wall_sign | [Sign](https://minecraft.wiki/w/Sign) | No paired form declared | hardness=1; drop=1153; sign=true; wallSign=true; transparent=true; present-in-pinned-1.21.4 |
| `B:250` NOT_STARTED | White Banner · white_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:white_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:white_banner` NOT_STARTED | White Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:250` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:251` NOT_STARTED | White Wall Banner · white_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:white_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:white_wall_banner` NOT_STARTED | White Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:251` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |
| `B:252` NOT_STARTED | Yellow Banner · yellow_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:yellow_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |
| `I:yellow_banner` NOT_STARTED | Yellow Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:252` | hardness=1; stackSize=16; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:253` NOT_STARTED | Yellow Wall Banner · yellow_wall_banner | [Banner](https://minecraft.wiki/w/Banner) | `I:yellow_wall_banner` | hardness=1; transparent=true; present-in-pinned-1.21.4 |

## A079 — Signs and banners 8

Rows: 1. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.
- Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.

**Required Inspector showcase:**

- Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.

Existing test files to inspect (coverage unverified): [tests/signGeometry.test.js](../../tests/signGeometry.test.js), [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/globeBannerPattern.test.js](../../tests/globeBannerPattern.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:yellow_wall_banner` NOT_STARTED | Yellow Wall Banner | [Banner](https://minecraft.wiki/w/Banner) | `B:253` | hardness=1; type=block; transparent=true; later-version-or-custom-review-required |

## A080 — Decorations, heads and displays 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct attached/standing/displayed object, orientation, variants and alpha; head skins, painting sizes and pot designs.
- Attachment/support, insertion/removal/rotation, entity-vs-block handling, special skull activation, breaking and saved contents.

**Required Inspector showcase:**

- Mount/display → rotate/decorate → change content → support loss → damage/break/reload.

Existing test files to inspect (coverage unverified): [tests/armorStand.test.js](../../tests/armorStand.test.js), [tests/paintings.test.js](../../tests/paintings.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:armor_stand` NOT_STARTED | Armor Stand | [Armor Stand](https://minecraft.wiki/w/Armor_Stand) | No paired form declared | stackSize=16; type=utility; present-in-pinned-1.21.4 |
| `B:1199` NOT_STARTED | Creeper Head · creeper_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `I:creeper_head` | hardness=1; drop=1199; head=true; transparent=true; present-in-pinned-1.21.4 |
| `I:creeper_head` NOT_STARTED | Creeper Head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `B:1199` | hardness=1; drop=1199; type=block; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1200` NOT_STARTED | Creeper Wall Head · creeper_wall_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `I:creeper_wall_head` | hardness=1; drop=1199; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `I:creeper_wall_head` NOT_STARTED | Creeper Wall Head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `B:1200` | hardness=1; drop=1199; type=block; wallHead=true; transparent=true; later-version-or-custom-review-required |
| `B:691` NOT_STARTED | Decorated Pot · decorated_pot | [Decorated Pot](https://minecraft.wiki/w/Decorated_Pot) | `I:decorated_pot` | hardness=0; transparent=true; present-in-pinned-1.21.4 |
| `I:decorated_pot` NOT_STARTED | Decorated Pot | [Decorated Pot](https://minecraft.wiki/w/Decorated_Pot) | `B:691` | hardness=0; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:1187` NOT_STARTED | Dragon Head · dragon_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1187; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1188` NOT_STARTED | Dragon Wall Head · dragon_wall_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1187; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `I:glow_item_frame` NOT_STARTED | Glow Item Frame | [Glow Item Frame](https://minecraft.wiki/w/Glow_Item_Frame) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:item_frame` NOT_STARTED | Item Frame | [Item Frame](https://minecraft.wiki/w/Item_Frame) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `I:painting` NOT_STARTED | Painting | [Painting](https://minecraft.wiki/w/Painting) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `B:1181` NOT_STARTED | Piglin Head · piglin_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1181; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1185` NOT_STARTED | Piglin Wall Head · piglin_wall_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1181; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1180` NOT_STARTED | Player Head · player_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1180; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1184` NOT_STARTED | Player Wall Head · player_wall_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1180; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1178` NOT_STARTED | Skeleton Skull · skeleton_skull | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1178; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1182` NOT_STARTED | Skeleton Wall Skull · skeleton_wall_skull | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1178; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `I:skull_banner_pattern` NOT_STARTED | Skull Charge Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:skull_pottery_sherd` NOT_STARTED | Skull Pottery Sherd | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A081 — Decorations, heads and displays 2

Rows: 5. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct attached/standing/displayed object, orientation, variants and alpha; head skins, painting sizes and pot designs.
- Attachment/support, insertion/removal/rotation, entity-vs-block handling, special skull activation, breaking and saved contents.

**Required Inspector showcase:**

- Mount/display → rotate/decorate → change content → support loss → damage/break/reload.

Existing test files to inspect (coverage unverified): [tests/armorStand.test.js](../../tests/armorStand.test.js), [tests/paintings.test.js](../../tests/paintings.test.js), [tests/smallShapes.test.js](../../tests/smallShapes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:185` NOT_STARTED | Wither Skeleton Skull · wither_skeleton_skull_block, wither_skeleton_skull | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `I:wither_skeleton_skull` | hardness=1; drop=185; head=true; transparent=true; present-in-pinned-1.21.4 |
| `I:wither_skeleton_skull` NOT_STARTED | Wither Skeleton Skull | [Mob Head](https://minecraft.wiki/w/Mob_Head) | `B:185` | hardness=1; drop=185; type=utility; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1186` NOT_STARTED | Wither Skeleton Wall Skull · wither_skeleton_wall_skull | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=185; wallHead=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1179` NOT_STARTED | Zombie Head · zombie_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1179; head=true; transparent=true; present-in-pinned-1.21.4 |
| `B:1183` NOT_STARTED | Zombie Wall Head · zombie_wall_head | [Mob Head](https://minecraft.wiki/w/Mob_Head) | No paired form declared | hardness=1; drop=1179; wallHead=true; transparent=true; present-in-pinned-1.21.4 |

## A082 — Rails, boats, minecarts and saddles 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Rail shapes/connections/slopes, vehicle model and held item; container and mob passenger positions.
- Placement/riding/steering/dismount, acceleration/collisions, power, fuel/container variants, item drops, drowning/damage and persistence.

**Required Inspector showcase:**

- Place → ride/accelerate/turn → powered/curved/sloped track or water → passenger/container → collide/dismount/break.

Existing test files to inspect (coverage unverified): [tests/vehicles_transport.test.js](../../tests/vehicles_transport.test.js), [tests/rails.test.js](../../tests/rails.test.js), [tests/riding.test.js](../../tests/riding.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:acacia_boat` NOT_STARTED | Acacia Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:acacia_chest_boat` NOT_STARTED | Acacia Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `B:943` NOT_STARTED | Activator Rail · activator_rail | [Activator Rail](https://minecraft.wiki/w/Activator_Rail) | `I:activator_rail` | hardness=0.7; rail=true; transparent=true; present-in-pinned-1.21.4 |
| `I:activator_rail` NOT_STARTED | Activator Rail | [Activator Rail](https://minecraft.wiki/w/Activator_Rail) | `B:943` | hardness=0.7; type=block; rail=true; transparent=true; present-in-pinned-1.21.4 |
| `I:birch_boat` NOT_STARTED | Birch Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:birch_chest_boat` NOT_STARTED | Birch Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:chest_boat` NOT_STARTED | Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | type=transport; later-version-or-custom-review-required |
| `I:carrot_on_a_stick` NOT_STARTED | Carrot on a Stick | [Carrot on a Stick](https://minecraft.wiki/w/Carrot_on_a_Stick) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:cherry_boat` NOT_STARTED | Cherry Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:cherry_chest_boat` NOT_STARTED | Cherry Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:dark_oak_boat` NOT_STARTED | Dark Oak Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:dark_oak_chest_boat` NOT_STARTED | Dark Oak Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `B:944` NOT_STARTED | Detector Rail · detector_rail | [Detector Rail](https://minecraft.wiki/w/Detector_Rail) | `I:detector_rail` | hardness=0.7; rail=true; transparent=true; present-in-pinned-1.21.4 |
| `I:detector_rail` NOT_STARTED | Detector Rail | [Detector Rail](https://minecraft.wiki/w/Detector_Rail) | `B:944` | hardness=0.7; type=block; rail=true; transparent=true; present-in-pinned-1.21.4 |
| `I:jungle_boat` NOT_STARTED | Jungle Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:jungle_chest_boat` NOT_STARTED | Jungle Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:mangrove_boat` NOT_STARTED | Mangrove Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:mangrove_chest_boat` NOT_STARTED | Mangrove Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:minecart` NOT_STARTED | Minecart | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:chest_minecart` NOT_STARTED | Minecart with Chest | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |

## A083 — Rails, boats, minecarts and saddles 2

Rows: 12. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Rail shapes/connections/slopes, vehicle model and held item; container and mob passenger positions.
- Placement/riding/steering/dismount, acceleration/collisions, power, fuel/container variants, item drops, drowning/damage and persistence.

**Required Inspector showcase:**

- Place → ride/accelerate/turn → powered/curved/sloped track or water → passenger/container → collide/dismount/break.

Existing test files to inspect (coverage unverified): [tests/vehicles_transport.test.js](../../tests/vehicles_transport.test.js), [tests/rails.test.js](../../tests/rails.test.js), [tests/riding.test.js](../../tests/riding.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:command_block_minecart` NOT_STARTED | Minecart with Command Block | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=utility; present-in-pinned-1.21.4 |
| `I:minecart_with_command_block` NOT_STARTED | Minecart with Command Block | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=utility; later-version-or-custom-review-required |
| `I:furnace_minecart` NOT_STARTED | Minecart with Furnace | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:hopper_minecart` NOT_STARTED | Minecart with Hopper | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:tnt_minecart` NOT_STARTED | Minecart with TNT | [Minecart](https://minecraft.wiki/w/Minecart) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:oak_boat` NOT_STARTED | Oak Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:oak_chest_boat` NOT_STARTED | Oak Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:pale_oak_boat` NOT_STARTED | Pale Oak Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:pale_oak_chest_boat` NOT_STARTED | Pale Oak Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:saddle` NOT_STARTED | Saddle | [Saddle](https://minecraft.wiki/w/Saddle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:spruce_boat` NOT_STARTED | Spruce Boat | [Boat](https://minecraft.wiki/w/Boat) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:spruce_chest_boat` NOT_STARTED | Spruce Boat with Chest | [Boat with Chest](https://minecraft.wiki/w/Boat_with_Chest) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |

## A084 — Portals and dimensional blocks 1

Rows: 12. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Portal plane/frame states, eye/charge state, particles, held/drop model where legitimately obtainable.
- Frame construction/activation, eye/charge consumption, dimension travel or spawn semantics, cooldown/destination, teleporting egg and save/load.

**Required Inspector showcase:**

- Invalid/valid frame or charge → activate → travel/use → cooldown/failure → remove/reload; newer behavior requires a version decision.

Existing test files to inspect (coverage unverified): [tests/netherPortal.test.js](../../tests/netherPortal.test.js), [tests/teleport.test.js](../../tests/teleport.test.js), [tests/bed.test.js](../../tests/bed.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:183` NOT_STARTED | Dragon Egg · dragon_egg | [Dragon Egg](https://minecraft.wiki/w/Dragon_Egg) | `I:dragon_egg` | hardness=3; dropItem=dragon_egg; transparent=false; solid=true; present-in-pinned-1.21.4 |
| `I:dragon_egg` NOT_STARTED | Dragon Egg | [Dragon Egg](https://minecraft.wiki/w/Dragon_Egg) | `B:183` | hardness=3; dropItem=dragon_egg; type=utility; transparent=false; solid=true; present-in-pinned-1.21.4 |
| `B:220` NOT_STARTED | Dried Ghast · dried_ghast | [Dried Ghast](https://minecraft.wiki/w/Dried_Ghast) | No paired form declared | hardness=0; drop=220; later-version-or-custom-review-required |
| `B:1192` NOT_STARTED | End Gateway · end_gateway | [End Gateway](https://minecraft.wiki/w/End_Gateway) | No paired form declared | light=15; lightColor=8073150; hardness=-1; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:184` NOT_STARTED | End Portal · end_portal | [End Portal](https://minecraft.wiki/w/End_Portal) | No paired form declared | hardness=-1; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1084` NOT_STARTED | End Portal Frame · end_portal_frame | [End Portal Frame](https://minecraft.wiki/w/End_Portal_Frame) | `I:end_portal_frame` | light=1; hardness=-1; drop=1084; present-in-pinned-1.21.4 |
| `B:1215` NOT_STARTED | End Portal Frame · end_portal_frame_filled | [End Portal Frame](https://minecraft.wiki/w/End_Portal_Frame) | No paired form declared | light=1; hardness=-1; drop=1084; later-version-or-custom-review-required |
| `I:end_portal_frame` NOT_STARTED | End Portal Frame | [End Portal Frame](https://minecraft.wiki/w/End_Portal_Frame) | `B:1084` | light=1; hardness=-1; drop=1084; type=utility; present-in-pinned-1.21.4 |
| `B:389` NOT_STARTED | Lodestone · lodestone | [Lodestone](https://minecraft.wiki/w/Lodestone) | `I:lodestone` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:lodestone` NOT_STARTED | Lodestone | [Lodestone](https://minecraft.wiki/w/Lodestone) | `B:389` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:180` NOT_STARTED | Nether Portal · nether_portal | [Nether Portal](https://minecraft.wiki/w/Nether_Portal) | No paired form declared | light=11; lightColor=9647082; hardness=0; drop=null; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:218` NOT_STARTED | Respawn Anchor · respawn_anchor | [Respawn Anchor](https://minecraft.wiki/w/Respawn_Anchor) | No paired form declared | hardness=50; drop=218; present-in-pinned-1.21.4 |

## A085 — Explosives and projectile ammunition 1

Rows: 17. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held/drop/projectile appearance, launch trail, fuse/charge and explosion particles; no sprite box artifacts.
- Launch velocity/gravity/trajectory, collision/owner attribution, embedding/pickup, damage/knockback, chain reactions and special effects.

**Required Inspector showcase:**

- Launch/prime → hit wall/entity/water → embed or explode → damage/drop/pickup → cleanup; tipped/spectral and shaped firework variants.

Existing test files to inspect (coverage unverified): [tests/arrows.test.js](../../tests/arrows.test.js), [tests/windChargeBreeze.test.js](../../tests/windChargeBreeze.test.js), [tests/visualEffects.test.js](../../tests/visualEffects.test.js), [tests/tippedArrows.test.js](../../tests/tippedArrows.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:arrow` NOT_STARTED | Arrow | [Arrow](https://minecraft.wiki/w/Arrow) | No paired form declared | type=projectile; present-in-pinned-1.21.4 |
| `I:tipped_arrow_poison` NOT_STARTED | Arrow of Poison | [Arrow of Poison](https://minecraft.wiki/w/Arrow_of_Poison) | No paired form declared | type=material; later-version-or-custom-review-required |
| `I:tipped_arrow_slowness` NOT_STARTED | Arrow of Slowness | [Arrow of Slowness](https://minecraft.wiki/w/Arrow_of_Slowness) | No paired form declared | type=material; later-version-or-custom-review-required |
| `I:tipped_arrow_weakness` NOT_STARTED | Arrow of Weakness | [Arrow of Weakness](https://minecraft.wiki/w/Arrow_of_Weakness) | No paired form declared | type=material; later-version-or-custom-review-required |
| `I:egg` NOT_STARTED | Egg | [Egg](https://minecraft.wiki/w/Egg) | No paired form declared | stackSize=16; type=projectile; present-in-pinned-1.21.4 |
| `I:ender_pearl` NOT_STARTED | Ender Pearl | [Ender Pearl](https://minecraft.wiki/w/Ender_Pearl) | No paired form declared | stackSize=16; type=material; present-in-pinned-1.21.4 |
| `I:fire_charge` NOT_STARTED | Fire Charge | [Fire Charge](https://minecraft.wiki/w/Fire_Charge) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:firework_rocket` NOT_STARTED | Firework Rocket | [Firework Rocket](https://minecraft.wiki/w/Firework_Rocket) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `I:firework_star` NOT_STARTED | Firework Star | [Firework Star](https://minecraft.wiki/w/Firework_Star) | No paired form declared | stackSize=64; type=material; present-in-pinned-1.21.4 |
| `B:1191` NOT_STARTED | Sniffer Egg · sniffer_egg | [Sniffer Egg](https://minecraft.wiki/w/Sniffer_Egg) | `I:sniffer_egg` | hardness=0.5; drop=1191; present-in-pinned-1.21.4 |
| `I:sniffer_egg` NOT_STARTED | Sniffer Egg | [Sniffer Egg](https://minecraft.wiki/w/Sniffer_Egg) | `B:1191` | hardness=0.5; drop=1191; type=block; present-in-pinned-1.21.4 |
| `I:snowball` NOT_STARTED | Snowball | [Snowball](https://minecraft.wiki/w/Snowball) | No paired form declared | stackSize=16; type=projectile; present-in-pinned-1.21.4 |
| `I:spectral_arrow` NOT_STARTED | Spectral Arrow | [Spectral Arrow](https://minecraft.wiki/w/Spectral_Arrow) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:tipped_arrow` NOT_STARTED | Tipped Arrow | [Tipped Arrow](https://minecraft.wiki/w/Tipped_Arrow) | No paired form declared | type=projectile; present-in-pinned-1.21.4 |
| `B:23` NOT_STARTED | TNT · tnt | [TNT](https://minecraft.wiki/w/TNT) | No paired form declared | hardness=0; drop=23; present-in-pinned-1.21.4 |
| `B:1085` NOT_STARTED | Turtle Egg · turtle_egg | [Turtle Egg](https://minecraft.wiki/w/Turtle_Egg) | No paired form declared | hardness=0.5; drop=null; present-in-pinned-1.21.4 |
| `I:wind_charge` NOT_STARTED | Wind Charge | [Wind Charge](https://minecraft.wiki/w/Wind_Charge) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A086 — Weapons and shields 1

Rows: 13. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held transform, charging/blocking and projectile or melee animation, third-person attachment and durability UI.
- Attack/draw/release cooldowns, range/accuracy, ammo/offhand, blocking, damage/knockback, durability, enchantments and repairs.

**Required Inspector showcase:**

- Equip → attack/block/draw/release → valid/invalid targets and ammo → enchant/repair → item break/pickup.

Existing test files to inspect (coverage unverified): [tests/arrows.test.js](../../tests/arrows.test.js), [tests/durability.test.js](../../tests/durability.test.js), [tests/shieldDurability.test.js](../../tests/shieldDurability.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:bow` NOT_STARTED | Bow | [Bow](https://minecraft.wiki/w/Bow) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:bowl` NOT_STARTED | Bowl | [Bowl](https://minecraft.wiki/w/Bowl) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:crossbow` NOT_STARTED | Crossbow | [Crossbow](https://minecraft.wiki/w/Crossbow) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:diamond_sword` NOT_STARTED | Diamond Sword | [Diamond Sword](https://minecraft.wiki/w/Diamond_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:golden_spear` NOT_STARTED | Golden Spear | [Golden Spear](https://minecraft.wiki/w/Golden_Spear) | No paired form declared | type=weapon; later-version-or-custom-review-required |
| `I:golden_sword` NOT_STARTED | Golden Sword | [Golden Sword](https://minecraft.wiki/w/Golden_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:iron_sword` NOT_STARTED | Iron Sword | [Iron Sword](https://minecraft.wiki/w/Iron_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:mace` NOT_STARTED | Mace | [Mace](https://minecraft.wiki/w/Mace) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:netherite_sword` NOT_STARTED | Netherite Sword | [Netherite Sword](https://minecraft.wiki/w/Netherite_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:shield` NOT_STARTED | Shield | [Shield](https://minecraft.wiki/w/Shield) | No paired form declared | stackSize=1; type=shield; present-in-pinned-1.21.4 |
| `I:stone_sword` NOT_STARTED | Stone Sword | [Stone Sword](https://minecraft.wiki/w/Stone_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:trident` NOT_STARTED | Trident | [Trident](https://minecraft.wiki/w/Trident) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |
| `I:wooden_sword` NOT_STARTED | Wooden Sword | [Wooden Sword](https://minecraft.wiki/w/Wooden_Sword) | No paired form declared | stackSize=1; type=weapon; present-in-pinned-1.21.4 |

## A087 — Tools and use actions 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held model/pose, action animation, tool tiers, durability overlay and entity/rope/line/zoom visuals.
- Correct target classes, harvest speed/tier/drop requirements, strip/till/path/shear/ignite/brush/fish/leash/zoom uses, cooldown and repair.
- Invalid targets, creative/survival consumption, enchantments, breakage and lost/returned attached entities.

**Required Inspector showcase:**

- Equip → supported/unsupported use → action progress/result → durability/enchantment matrix → repair/break; dedicated action per tool.

Existing test files to inspect (coverage unverified): [tests/durability.test.js](../../tests/durability.test.js), [tests/toolFacts.test.js](../../tests/toolFacts.test.js), [tests/fishingParity.test.js](../../tests/fishingParity.test.js), [tests/archaeology.test.js](../../tests/archaeology.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:black_bundle` NOT_STARTED | Black Bundle | [Black Bundle](https://minecraft.wiki/w/Black_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:blue_bundle` NOT_STARTED | Blue Bundle | [Blue Bundle](https://minecraft.wiki/w/Blue_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:brown_bundle` NOT_STARTED | Brown Bundle | [Brown Bundle](https://minecraft.wiki/w/Brown_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:brush` NOT_STARTED | Brush | [Brush](https://minecraft.wiki/w/Brush) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:bundle` NOT_STARTED | Bundle | [Bundle](https://minecraft.wiki/w/Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:clock` NOT_STARTED | Clock | [Clock](https://minecraft.wiki/w/Clock) | No paired form declared | stackSize=64; type=tool; present-in-pinned-1.21.4 |
| `I:compass` NOT_STARTED | Compass | [Compass](https://minecraft.wiki/w/Compass) | No paired form declared | stackSize=64; type=tool; present-in-pinned-1.21.4 |
| `I:cyan_bundle` NOT_STARTED | Cyan Bundle | [Cyan Bundle](https://minecraft.wiki/w/Cyan_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:debug_stick` NOT_STARTED | Debug Stick | [Debug Stick](https://minecraft.wiki/w/Debug_Stick) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:diamond_axe` NOT_STARTED | Diamond Axe | [Diamond Axe](https://minecraft.wiki/w/Diamond_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:diamond_hoe` NOT_STARTED | Diamond Hoe | [Diamond Hoe](https://minecraft.wiki/w/Diamond_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:diamond_pickaxe` NOT_STARTED | Diamond Pickaxe | [Diamond Pickaxe](https://minecraft.wiki/w/Diamond_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:diamond_shovel` NOT_STARTED | Diamond Shovel | [Diamond Shovel](https://minecraft.wiki/w/Diamond_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:fishing_rod` NOT_STARTED | Fishing Rod | [Fishing Rod](https://minecraft.wiki/w/Fishing_Rod) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:flint_and_steel` NOT_STARTED | Flint and Steel | [Flint and Steel](https://minecraft.wiki/w/Flint_and_Steel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:golden_axe` NOT_STARTED | Golden Axe | [Golden Axe](https://minecraft.wiki/w/Golden_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:golden_hoe` NOT_STARTED | Golden Hoe | [Golden Hoe](https://minecraft.wiki/w/Golden_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:golden_pickaxe` NOT_STARTED | Golden Pickaxe | [Golden Pickaxe](https://minecraft.wiki/w/Golden_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:golden_shovel` NOT_STARTED | Golden Shovel | [Golden Shovel](https://minecraft.wiki/w/Golden_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:gray_bundle` NOT_STARTED | Gray Bundle | [Gray Bundle](https://minecraft.wiki/w/Gray_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |

## A088 — Tools and use actions 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held model/pose, action animation, tool tiers, durability overlay and entity/rope/line/zoom visuals.
- Correct target classes, harvest speed/tier/drop requirements, strip/till/path/shear/ignite/brush/fish/leash/zoom uses, cooldown and repair.
- Invalid targets, creative/survival consumption, enchantments, breakage and lost/returned attached entities.

**Required Inspector showcase:**

- Equip → supported/unsupported use → action progress/result → durability/enchantment matrix → repair/break; dedicated action per tool.

Existing test files to inspect (coverage unverified): [tests/durability.test.js](../../tests/durability.test.js), [tests/toolFacts.test.js](../../tests/toolFacts.test.js), [tests/fishingParity.test.js](../../tests/fishingParity.test.js), [tests/archaeology.test.js](../../tests/archaeology.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:green_bundle` NOT_STARTED | Green Bundle | [Green Bundle](https://minecraft.wiki/w/Green_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:iron_axe` NOT_STARTED | Iron Axe | [Iron Axe](https://minecraft.wiki/w/Iron_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:iron_hoe` NOT_STARTED | Iron Hoe | [Iron Hoe](https://minecraft.wiki/w/Iron_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:iron_pickaxe` NOT_STARTED | Iron Pickaxe | [Iron Pickaxe](https://minecraft.wiki/w/Iron_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:iron_shovel` NOT_STARTED | Iron Shovel | [Iron Shovel](https://minecraft.wiki/w/Iron_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:lead` NOT_STARTED | Lead | [Lead](https://minecraft.wiki/w/Lead) | No paired form declared | stackSize=64; type=tool; present-in-pinned-1.21.4 |
| `I:light_blue_bundle` NOT_STARTED | Light Blue Bundle | [Light Blue Bundle](https://minecraft.wiki/w/Light_Blue_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:light_gray_bundle` NOT_STARTED | Light Gray Bundle | [Light Gray Bundle](https://minecraft.wiki/w/Light_Gray_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:lime_bundle` NOT_STARTED | Lime Bundle | [Lime Bundle](https://minecraft.wiki/w/Lime_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:magenta_bundle` NOT_STARTED | Magenta Bundle | [Magenta Bundle](https://minecraft.wiki/w/Magenta_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:name_tag` NOT_STARTED | Name Tag | [Name Tag](https://minecraft.wiki/w/Name_Tag) | No paired form declared | stackSize=64; type=tool; present-in-pinned-1.21.4 |
| `I:netherite_axe` NOT_STARTED | Netherite Axe | [Netherite Axe](https://minecraft.wiki/w/Netherite_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:netherite_hoe` NOT_STARTED | Netherite Hoe | [Netherite Hoe](https://minecraft.wiki/w/Netherite_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:netherite_pickaxe` NOT_STARTED | Netherite Pickaxe | [Netherite Pickaxe](https://minecraft.wiki/w/Netherite_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:netherite_shovel` NOT_STARTED | Netherite Shovel | [Netherite Shovel](https://minecraft.wiki/w/Netherite_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:orange_bundle` NOT_STARTED | Orange Bundle | [Orange Bundle](https://minecraft.wiki/w/Orange_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:pink_bundle` NOT_STARTED | Pink Bundle | [Pink Bundle](https://minecraft.wiki/w/Pink_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:purple_bundle` NOT_STARTED | Purple Bundle | [Purple Bundle](https://minecraft.wiki/w/Purple_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:recovery_compass` NOT_STARTED | Recovery Compass | [Recovery Compass](https://minecraft.wiki/w/Recovery_Compass) | No paired form declared | stackSize=64; type=tool; present-in-pinned-1.21.4 |
| `I:red_bundle` NOT_STARTED | Red Bundle | [Red Bundle](https://minecraft.wiki/w/Red_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |

## A089 — Tools and use actions 3

Rows: 12. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held model/pose, action animation, tool tiers, durability overlay and entity/rope/line/zoom visuals.
- Correct target classes, harvest speed/tier/drop requirements, strip/till/path/shear/ignite/brush/fish/leash/zoom uses, cooldown and repair.
- Invalid targets, creative/survival consumption, enchantments, breakage and lost/returned attached entities.

**Required Inspector showcase:**

- Equip → supported/unsupported use → action progress/result → durability/enchantment matrix → repair/break; dedicated action per tool.

Existing test files to inspect (coverage unverified): [tests/durability.test.js](../../tests/durability.test.js), [tests/toolFacts.test.js](../../tests/toolFacts.test.js), [tests/fishingParity.test.js](../../tests/fishingParity.test.js), [tests/archaeology.test.js](../../tests/archaeology.test.js), [tests/heldBlockInteraction.test.js](../../tests/heldBlockInteraction.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:shears` NOT_STARTED | Shears | [Shears](https://minecraft.wiki/w/Shears) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:spyglass` NOT_STARTED | Spyglass | [Spyglass](https://minecraft.wiki/w/Spyglass) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:stone_axe` NOT_STARTED | Stone Axe | [Stone Axe](https://minecraft.wiki/w/Stone_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:stone_hoe` NOT_STARTED | Stone Hoe | [Stone Hoe](https://minecraft.wiki/w/Stone_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:stone_pickaxe` NOT_STARTED | Stone Pickaxe | [Stone Pickaxe](https://minecraft.wiki/w/Stone_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:stone_shovel` NOT_STARTED | Stone Shovel | [Stone Shovel](https://minecraft.wiki/w/Stone_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:white_bundle` NOT_STARTED | White Bundle | [White Bundle](https://minecraft.wiki/w/White_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:wooden_axe` NOT_STARTED | Wooden Axe | [Wooden Axe](https://minecraft.wiki/w/Wooden_Axe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:wooden_hoe` NOT_STARTED | Wooden Hoe | [Wooden Hoe](https://minecraft.wiki/w/Wooden_Hoe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:wooden_pickaxe` NOT_STARTED | Wooden Pickaxe | [Wooden Pickaxe](https://minecraft.wiki/w/Wooden_Pickaxe) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:wooden_shovel` NOT_STARTED | Wooden Shovel | [Wooden Shovel](https://minecraft.wiki/w/Wooden_Shovel) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |
| `I:yellow_bundle` NOT_STARTED | Yellow Bundle | [Yellow Bundle](https://minecraft.wiki/w/Yellow_Bundle) | No paired form declared | stackSize=1; type=tool; present-in-pinned-1.21.4 |

## A090 — Armor and wearable equipment 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Icon/held/drop/equipped model, material/color and trims; full slot/variant coverage.
- Equip slots, defense/toughness, damage/durability, enchantments, dye/trim/netherite upgrades, repairs, flight or animal equipment semantics.

**Required Inspector showcase:**

- Equip → take representative damage → enchant/dye/trim → repair/upgrade → break; elytra flight and eligible animal equipment.

Existing test files to inspect (coverage unverified): [tests/armor.test.js](../../tests/armor.test.js), [tests/armor_ui.test.js](../../tests/armor_ui.test.js), [tests/smithingParity.test.js](../../tests/smithingParity.test.js), [tests/trimVisuals.test.js](../../tests/trimVisuals.test.js), [tests/armourDurability.test.js](../../tests/armourDurability.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:chainmail_boots` NOT_STARTED | Chainmail Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:chainmail_chestplate` NOT_STARTED | Chainmail Chestplate | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:chainmail_helmet` NOT_STARTED | Chainmail Helmet | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:chainmail_leggings` NOT_STARTED | Chainmail Leggings | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:diamond_boots` NOT_STARTED | Diamond Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:diamond_chestplate` NOT_STARTED | Diamond Chestplate | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:diamond_helmet` NOT_STARTED | Diamond Helmet | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:diamond_horse_armor` NOT_STARTED | Diamond Horse Armor | [Horse Armor](https://minecraft.wiki/w/Horse_Armor) | No paired form declared | stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:diamond_leggings` NOT_STARTED | Diamond Leggings | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:elytra` NOT_STARTED | Elytra | [Elytra](https://minecraft.wiki/w/Elytra) | No paired form declared | stackSize=1; type=transport; present-in-pinned-1.21.4 |
| `I:golden_boots` NOT_STARTED | Golden Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:golden_chestplate` NOT_STARTED | Golden Chestplate | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:golden_helmet` NOT_STARTED | Golden Helmet | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:golden_horse_armor` NOT_STARTED | Golden Horse Armor | [Horse Armor](https://minecraft.wiki/w/Horse_Armor) | No paired form declared | stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:golden_leggings` NOT_STARTED | Golden Leggings | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:iron_boots` NOT_STARTED | Iron Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:iron_chestplate` NOT_STARTED | Iron Chestplate | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:iron_helmet` NOT_STARTED | Iron Helmet | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:iron_horse_armor` NOT_STARTED | Iron Horse Armor | [Horse Armor](https://minecraft.wiki/w/Horse_Armor) | No paired form declared | stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:iron_leggings` NOT_STARTED | Iron Leggings | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |

## A091 — Armor and wearable equipment 2

Rows: 11. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Icon/held/drop/equipped model, material/color and trims; full slot/variant coverage.
- Equip slots, defense/toughness, damage/durability, enchantments, dye/trim/netherite upgrades, repairs, flight or animal equipment semantics.

**Required Inspector showcase:**

- Equip → take representative damage → enchant/dye/trim → repair/upgrade → break; elytra flight and eligible animal equipment.

Existing test files to inspect (coverage unverified): [tests/armor.test.js](../../tests/armor.test.js), [tests/armor_ui.test.js](../../tests/armor_ui.test.js), [tests/smithingParity.test.js](../../tests/smithingParity.test.js), [tests/trimVisuals.test.js](../../tests/trimVisuals.test.js), [tests/armourDurability.test.js](../../tests/armourDurability.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:leather_boots` NOT_STARTED | Leather Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:leather_helmet` NOT_STARTED | Leather Cap | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:leather_horse_armor` NOT_STARTED | Leather Horse Armor | [Horse Armor](https://minecraft.wiki/w/Horse_Armor) | No paired form declared | stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:leather_leggings` NOT_STARTED | Leather Pants | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:leather_chestplate` NOT_STARTED | Leather Tunic | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:netherite_boots` NOT_STARTED | Netherite Boots | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=feet; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:netherite_chestplate` NOT_STARTED | Netherite Chestplate | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=chest; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:netherite_helmet` NOT_STARTED | Netherite Helmet | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:netherite_leggings` NOT_STARTED | Netherite Leggings | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=legs; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:turtle_helmet` NOT_STARTED | Turtle Shell | [Armor](https://minecraft.wiki/w/Armor) | No paired form declared | armorSlot=head; stackSize=1; type=armor; present-in-pinned-1.21.4 |
| `I:wolf_armor` NOT_STARTED | Wolf Armor | [Wolf Armor](https://minecraft.wiki/w/Wolf_Armor) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |

## A092 — Potions, bottles and effect containers 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:awkward_potion` NOT_STARTED | Awkward Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:glass_bottle` NOT_STARTED | Glass Bottle | [Glass Bottle](https://minecraft.wiki/w/Glass_Bottle) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `I:lingering_awkward_potion` NOT_STARTED | Lingering Awkward Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_mundane_potion` NOT_STARTED | Lingering Mundane Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion` NOT_STARTED | Lingering Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; present-in-pinned-1.21.4 |
| `I:lingering_potion_of_fire_resistance` NOT_STARTED | Lingering Potion of Fire Resistance | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_fire_resistance_long` NOT_STARTED | Lingering Potion of Fire Resistance (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_harming` NOT_STARTED | Lingering Potion of Harming | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_harming_2` NOT_STARTED | Lingering Potion of Harming II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_healing` NOT_STARTED | Lingering Potion of Healing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_healing_2` NOT_STARTED | Lingering Potion of Healing II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_invisibility` NOT_STARTED | Lingering Potion of Invisibility | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_invisibility_long` NOT_STARTED | Lingering Potion of Invisibility (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_leaping` NOT_STARTED | Lingering Potion of Leaping | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_leaping_long` NOT_STARTED | Lingering Potion of Leaping (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_leaping_2` NOT_STARTED | Lingering Potion of Leaping II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_night_vision` NOT_STARTED | Lingering Potion of Night Vision | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_night_vision_long` NOT_STARTED | Lingering Potion of Night Vision (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_poison` NOT_STARTED | Lingering Potion of Poison | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_poison_long` NOT_STARTED | Lingering Potion of Poison (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |

## A093 — Potions, bottles and effect containers 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:lingering_potion_of_poison_2` NOT_STARTED | Lingering Potion of Poison II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_regeneration` NOT_STARTED | Lingering Potion of Regeneration | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_regeneration_long` NOT_STARTED | Lingering Potion of Regeneration (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_regeneration_2` NOT_STARTED | Lingering Potion of Regeneration II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_slow_falling` NOT_STARTED | Lingering Potion of Slow Falling | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_slow_falling_long` NOT_STARTED | Lingering Potion of Slow Falling (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_slowness` NOT_STARTED | Lingering Potion of Slowness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_slowness_long` NOT_STARTED | Lingering Potion of Slowness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_slowness_2` NOT_STARTED | Lingering Potion of Slowness IV | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_strength` NOT_STARTED | Lingering Potion of Strength | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_strength_long` NOT_STARTED | Lingering Potion of Strength (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_strength_2` NOT_STARTED | Lingering Potion of Strength II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_swiftness` NOT_STARTED | Lingering Potion of Swiftness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_swiftness_long` NOT_STARTED | Lingering Potion of Swiftness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_swiftness_2` NOT_STARTED | Lingering Potion of Swiftness II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_turtle_master` NOT_STARTED | Lingering Potion of the Turtle Master | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_turtle_master_long` NOT_STARTED | Lingering Potion of the Turtle Master (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_turtle_master_2` NOT_STARTED | Lingering Potion of the Turtle Master II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_water_breathing` NOT_STARTED | Lingering Potion of Water Breathing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_water_breathing_long` NOT_STARTED | Lingering Potion of Water Breathing (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |

## A094 — Potions, bottles and effect containers 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:lingering_potion_of_weakness` NOT_STARTED | Lingering Potion of Weakness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_potion_of_weakness_long` NOT_STARTED | Lingering Potion of Weakness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:lingering_thick_potion` NOT_STARTED | Lingering Thick Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:mundane_potion` NOT_STARTED | Mundane Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_fire_resistance` NOT_STARTED | Potion of Fire Resistance (3:00) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | type=potion; later-version-or-custom-review-required |
| `I:potion_of_fire_resistance_long` NOT_STARTED | Potion of Fire Resistance (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_harming` NOT_STARTED | Potion of Harming | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_harming_2` NOT_STARTED | Potion of Harming II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_healing` NOT_STARTED | Potion of Healing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_healing_2` NOT_STARTED | Potion of Healing II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_invisibility` NOT_STARTED | Potion of Invisibility | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_invisibility_long` NOT_STARTED | Potion of Invisibility (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_leaping` NOT_STARTED | Potion of Leaping | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_leaping_long` NOT_STARTED | Potion of Leaping (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_leaping_2` NOT_STARTED | Potion of Leaping II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_night_vision` NOT_STARTED | Potion of Night Vision | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_night_vision_long` NOT_STARTED | Potion of Night Vision (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_poison` NOT_STARTED | Potion of Poison | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_poison_long` NOT_STARTED | Potion of Poison (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_poison_2` NOT_STARTED | Potion of Poison II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |

## A095 — Potions, bottles and effect containers 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:potion_of_regeneration` NOT_STARTED | Potion of Regeneration | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_regeneration_long` NOT_STARTED | Potion of Regeneration (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_regeneration_2` NOT_STARTED | Potion of Regeneration II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_slow_falling` NOT_STARTED | Potion of Slow Falling | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_slow_falling_long` NOT_STARTED | Potion of Slow Falling (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_slowness` NOT_STARTED | Potion of Slowness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_slowness_long` NOT_STARTED | Potion of Slowness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_slowness_2` NOT_STARTED | Potion of Slowness IV | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_strength` NOT_STARTED | Potion of Strength | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_strength_long` NOT_STARTED | Potion of Strength (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_strength_2` NOT_STARTED | Potion of Strength II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_swiftness` NOT_STARTED | Potion of Swiftness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_swiftness_long` NOT_STARTED | Potion of Swiftness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_swiftness_2` NOT_STARTED | Potion of Swiftness II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_turtle_master` NOT_STARTED | Potion of the Turtle Master | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_turtle_master_long` NOT_STARTED | Potion of the Turtle Master (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_turtle_master_2` NOT_STARTED | Potion of the Turtle Master II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_water_breathing` NOT_STARTED | Potion of Water Breathing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_water_breathing_long` NOT_STARTED | Potion of Water Breathing (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:potion_of_weakness` NOT_STARTED | Potion of Weakness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |

## A096 — Potions, bottles and effect containers 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:potion_of_weakness_long` NOT_STARTED | Potion of Weakness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_awkward_potion` NOT_STARTED | Splash Awkward Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_mundane_potion` NOT_STARTED | Splash Mundane Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion` NOT_STARTED | Splash Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; present-in-pinned-1.21.4 |
| `I:splash_potion_of_fire_resistance` NOT_STARTED | Splash Potion of Fire Resistance (3:00) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_fire_resistance_long` NOT_STARTED | Splash Potion of Fire Resistance (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_harming` NOT_STARTED | Splash Potion of Harming | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_harming_2` NOT_STARTED | Splash Potion of Harming II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_healing` NOT_STARTED | Splash Potion of Healing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_healing_2` NOT_STARTED | Splash Potion of Healing II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_invisibility` NOT_STARTED | Splash Potion of Invisibility | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_invisibility_long` NOT_STARTED | Splash Potion of Invisibility (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_leaping` NOT_STARTED | Splash Potion of Leaping | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_leaping_long` NOT_STARTED | Splash Potion of Leaping (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_leaping_2` NOT_STARTED | Splash Potion of Leaping II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_night_vision` NOT_STARTED | Splash Potion of Night Vision | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_night_vision_long` NOT_STARTED | Splash Potion of Night Vision (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_poison` NOT_STARTED | Splash Potion of Poison | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_poison_long` NOT_STARTED | Splash Potion of Poison (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_poison_2` NOT_STARTED | Splash Potion of Poison II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |

## A097 — Potions, bottles and effect containers 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:splash_potion_of_regeneration` NOT_STARTED | Splash Potion of Regeneration | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_regeneration_long` NOT_STARTED | Splash Potion of Regeneration (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_regeneration_2` NOT_STARTED | Splash Potion of Regeneration II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_slow_falling` NOT_STARTED | Splash Potion of Slow Falling | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_slow_falling_long` NOT_STARTED | Splash Potion of Slow Falling (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_slowness` NOT_STARTED | Splash Potion of Slowness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_slowness_long` NOT_STARTED | Splash Potion of Slowness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_slowness_2` NOT_STARTED | Splash Potion of Slowness IV | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_strength` NOT_STARTED | Splash Potion of Strength | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_strength_long` NOT_STARTED | Splash Potion of Strength (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_strength_2` NOT_STARTED | Splash Potion of Strength II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_swiftness` NOT_STARTED | Splash Potion of Swiftness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_swiftness_long` NOT_STARTED | Splash Potion of Swiftness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_swiftness_2` NOT_STARTED | Splash Potion of Swiftness II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_turtle_master` NOT_STARTED | Splash Potion of the Turtle Master | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_turtle_master_long` NOT_STARTED | Splash Potion of the Turtle Master (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_turtle_master_2` NOT_STARTED | Splash Potion of the Turtle Master II | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_water_breathing` NOT_STARTED | Splash Potion of Water Breathing | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_water_breathing_long` NOT_STARTED | Splash Potion of Water Breathing (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_potion_of_weakness` NOT_STARTED | Splash Potion of Weakness | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | type=potion; later-version-or-custom-review-required |

## A098 — Potions, bottles and effect containers 7

Rows: 5. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.
- Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.

**Required Inspector showcase:**

- Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.

Existing test files to inspect (coverage unverified): [tests/brewingParity.test.js](../../tests/brewingParity.test.js), [tests/itemPotions.test.js](../../tests/itemPotions.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/statusEffects.test.js](../../tests/statusEffects.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:splash_potion_of_weakness_long` NOT_STARTED | Splash Potion of Weakness (Extended) | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:splash_thick_potion` NOT_STARTED | Splash Thick Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:thick_potion` NOT_STARTED | Thick Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=potion; later-version-or-custom-review-required |
| `I:water_bottle` NOT_STARTED | Water Bottle | [Water Bottle](https://minecraft.wiki/w/Water_Bottle) | No paired form declared | type=potion; later-version-or-custom-review-required |
| `I:potion` NOT_STARTED | Water Bottle / Potion | [Potion](https://minecraft.wiki/w/Potion) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |

## A099 — Food, stews and edible blocks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.

**Required Inspector showcase:**

- Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

Existing test files to inspect (coverage unverified): [tests/foodSaturation.test.js](../../tests/foodSaturation.test.js), [tests/hungerModel.test.js](../../tests/hungerModel.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/farming.test.js](../../tests/farming.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:apple` NOT_STARTED | Apple | [Apple](https://minecraft.wiki/w/Apple) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:baked_potato` NOT_STARTED | Baked Potato | [Baked Potato](https://minecraft.wiki/w/Baked_Potato) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:beetroot` NOT_STARTED | Beetroot | [Beetroot](https://minecraft.wiki/w/Beetroot) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:beetroot_soup` NOT_STARTED | Beetroot Soup | [Beetroot Soup](https://minecraft.wiki/w/Beetroot_Soup) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |
| `I:bread` NOT_STARTED | Bread | [Bread](https://minecraft.wiki/w/Bread) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `B:1087` NOT_STARTED | Cake · cake | [Cake](https://minecraft.wiki/w/Cake) | `I:cake` | hardness=0.5; drop=null; present-in-pinned-1.21.4 |
| `I:cake` NOT_STARTED | Cake | [Cake](https://minecraft.wiki/w/Cake) | `B:1087` | hardness=0.5; drop=null; stackSize=1; type=block; present-in-pinned-1.21.4 |
| `I:carrot` NOT_STARTED | Carrot | [Carrot](https://minecraft.wiki/w/Carrot) | No paired form declared | crop=carrots; type=food; present-in-pinned-1.21.4 |
| `I:chicken_spawn_egg` NOT_STARTED | Chicken Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:chorus_fruit` NOT_STARTED | Chorus Fruit | [Chorus Fruit](https://minecraft.wiki/w/Chorus_Fruit) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_chicken` NOT_STARTED | Cooked Chicken | [Cooked Chicken](https://minecraft.wiki/w/Cooked_Chicken) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_cod` NOT_STARTED | Cooked Cod | [Cooked Cod](https://minecraft.wiki/w/Cooked_Cod) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_mutton` NOT_STARTED | Cooked Mutton | [Cooked Mutton](https://minecraft.wiki/w/Cooked_Mutton) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_porkchop` NOT_STARTED | Cooked Porkchop | [Cooked Porkchop](https://minecraft.wiki/w/Cooked_Porkchop) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_rabbit` NOT_STARTED | Cooked Rabbit | [Cooked Rabbit](https://minecraft.wiki/w/Cooked_Rabbit) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_salmon` NOT_STARTED | Cooked Salmon | [Cooked Salmon](https://minecraft.wiki/w/Cooked_Salmon) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cookie` NOT_STARTED | Cookie | [Cookie](https://minecraft.wiki/w/Cookie) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:enchanted_golden_apple` NOT_STARTED | Enchanted Golden Apple | [Enchanted Golden Apple](https://minecraft.wiki/w/Enchanted_Golden_Apple) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:glistering_melon_slice` NOT_STARTED | Glistering Melon Slice | [Glistering Melon Slice](https://minecraft.wiki/w/Glistering_Melon_Slice) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:glow_berries` NOT_STARTED | Glow Berries | [Glow Berries](https://minecraft.wiki/w/Glow_Berries) | No paired form declared | type=food; present-in-pinned-1.21.4 |

## A100 — Food, stews and edible blocks 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.

**Required Inspector showcase:**

- Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

Existing test files to inspect (coverage unverified): [tests/foodSaturation.test.js](../../tests/foodSaturation.test.js), [tests/hungerModel.test.js](../../tests/hungerModel.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/farming.test.js](../../tests/farming.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:golden_apple` NOT_STARTED | Golden Apple | [Golden Apple](https://minecraft.wiki/w/Golden_Apple) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:golden_carrot` NOT_STARTED | Golden Carrot | [Golden Carrot](https://minecraft.wiki/w/Golden_Carrot) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:honey_bottle` NOT_STARTED | Honey Bottle | [Honey Bottle](https://minecraft.wiki/w/Honey_Bottle) | No paired form declared | stackSize=16; type=food; present-in-pinned-1.21.4 |
| `I:melon_slice` NOT_STARTED | Melon Slice | [Melon Slice](https://minecraft.wiki/w/Melon_Slice) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:ominous_bottle` NOT_STARTED | Ominous Bottle | [Ominous Bottle](https://minecraft.wiki/w/Ominous_Bottle) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:poisonous_potato` NOT_STARTED | Poisonous Potato | [Poisonous Potato](https://minecraft.wiki/w/Poisonous_Potato) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:potato` NOT_STARTED | Potato | [Potato](https://minecraft.wiki/w/Potato) | No paired form declared | crop=potatoes; type=food; present-in-pinned-1.21.4 |
| `I:pufferfish` NOT_STARTED | Pufferfish | [Pufferfish](https://minecraft.wiki/w/Pufferfish) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:pumpkin_pie` NOT_STARTED | Pumpkin Pie | [Pumpkin Pie](https://minecraft.wiki/w/Pumpkin_Pie) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:rabbit_hide` NOT_STARTED | Rabbit Hide | [Rabbit Hide](https://minecraft.wiki/w/Rabbit_Hide) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:rabbit_spawn_egg` NOT_STARTED | Rabbit Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:rabbit_stew` NOT_STARTED | Rabbit Stew | [Rabbit Stew](https://minecraft.wiki/w/Rabbit_Stew) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |
| `I:rabbit_foot` NOT_STARTED | Rabbit's Foot | [Rabbit's](https://minecraft.wiki/w/Rabbit's) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:beef` NOT_STARTED | Raw Beef | [Raw Beef](https://minecraft.wiki/w/Raw_Beef) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:chicken` NOT_STARTED | Raw Chicken | [Raw Chicken](https://minecraft.wiki/w/Raw_Chicken) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cod` NOT_STARTED | Raw Cod | [Raw Cod](https://minecraft.wiki/w/Raw_Cod) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:mutton` NOT_STARTED | Raw Mutton | [Raw Mutton](https://minecraft.wiki/w/Raw_Mutton) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:porkchop` NOT_STARTED | Raw Porkchop | [Raw Porkchop](https://minecraft.wiki/w/Raw_Porkchop) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:rabbit` NOT_STARTED | Raw Rabbit | [Raw Rabbit](https://minecraft.wiki/w/Raw_Rabbit) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:salmon` NOT_STARTED | Raw Salmon | [Raw Salmon](https://minecraft.wiki/w/Raw_Salmon) | No paired form declared | type=food; present-in-pinned-1.21.4 |

## A101 — Food, stews and edible blocks 3

Rows: 6. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held food/edible-block model, eating animation, portions/slices and container appearance.
- Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.

**Required Inspector showcase:**

- Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.

Existing test files to inspect (coverage unverified): [tests/foodSaturation.test.js](../../tests/foodSaturation.test.js), [tests/hungerModel.test.js](../../tests/hungerModel.test.js), [tests/itemPotionDrinking.test.js](../../tests/itemPotionDrinking.test.js), [tests/farming.test.js](../../tests/farming.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:rotten_flesh` NOT_STARTED | Rotten Flesh | [Rotten Flesh](https://minecraft.wiki/w/Rotten_Flesh) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:spider_eye` NOT_STARTED | Spider Eye | [Spider Eye](https://minecraft.wiki/w/Spider_Eye) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:cooked_beef` NOT_STARTED | Steak | [Steak](https://minecraft.wiki/w/Steak) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:suspicious_stew` NOT_STARTED | Suspicious Stew | [Suspicious Stew](https://minecraft.wiki/w/Suspicious_Stew) | No paired form declared | stackSize=1; type=food; present-in-pinned-1.21.4 |
| `I:sweet_berries` NOT_STARTED | Sweet Berries | [Sweet Berries](https://minecraft.wiki/w/Sweet_Berries) | No paired form declared | type=food; present-in-pinned-1.21.4 |
| `I:tropical_fish` NOT_STARTED | Tropical Fish | [Tropical Fish](https://minecraft.wiki/w/Tropical_Fish) | No paired form declared | type=food; present-in-pinned-1.21.4 |

## A102 — Spawn eggs 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.
- Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.

**Required Inspector showcase:**

- Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.

Existing test files to inspect (coverage unverified): [tests/spawnEggCoverage.test.js](../../tests/spawnEggCoverage.test.js), [tests/spawnEggCatalogue.test.js](../../tests/spawnEggCatalogue.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:allay_spawn_egg` NOT_STARTED | Allay Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:armadillo_spawn_egg` NOT_STARTED | Armadillo Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:axolotl_spawn_egg` NOT_STARTED | Axolotl Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:bat_spawn_egg` NOT_STARTED | Bat Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:bee_spawn_egg` NOT_STARTED | Bee Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:blaze_spawn_egg` NOT_STARTED | Blaze Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:bogged_spawn_egg` NOT_STARTED | Bogged Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:breeze_spawn_egg` NOT_STARTED | Breeze Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:camel_husk_spawn_egg` NOT_STARTED | Camel Husk Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:camel_spawn_egg` NOT_STARTED | Camel Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:cat_spawn_egg` NOT_STARTED | Cat Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:cave_spider_spawn_egg` NOT_STARTED | Cave Spider Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:cod_spawn_egg` NOT_STARTED | Cod Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:copper_golem_spawn_egg` NOT_STARTED | Copper Golem Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:cow_spawn_egg` NOT_STARTED | Cow Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:creaking_spawn_egg` NOT_STARTED | Creaking Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:creeper_spawn_egg` NOT_STARTED | Creeper Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:dolphin_spawn_egg` NOT_STARTED | Dolphin Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:donkey_spawn_egg` NOT_STARTED | Donkey Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:drowned_spawn_egg` NOT_STARTED | Drowned Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |

## A103 — Spawn eggs 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.
- Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.

**Required Inspector showcase:**

- Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.

Existing test files to inspect (coverage unverified): [tests/spawnEggCoverage.test.js](../../tests/spawnEggCoverage.test.js), [tests/spawnEggCatalogue.test.js](../../tests/spawnEggCatalogue.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:elder_guardian_spawn_egg` NOT_STARTED | Elder Guardian Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:ender_dragon_spawn_egg` NOT_STARTED | Ender Dragon Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:enderman_spawn_egg` NOT_STARTED | Enderman Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:endermite_spawn_egg` NOT_STARTED | Endermite Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:evoker_spawn_egg` NOT_STARTED | Evoker Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:fox_spawn_egg` NOT_STARTED | Fox Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:frog_spawn_egg` NOT_STARTED | Frog Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:ghast_spawn_egg` NOT_STARTED | Ghast Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:giant_spawn_egg` NOT_STARTED | Giant Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:glow_squid_spawn_egg` NOT_STARTED | Glow Squid Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:goat_spawn_egg` NOT_STARTED | Goat Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:guardian_spawn_egg` NOT_STARTED | Guardian Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:happy_ghast_spawn_egg` NOT_STARTED | Happy Ghast Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:hoglin_spawn_egg` NOT_STARTED | Hoglin Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:horse_spawn_egg` NOT_STARTED | Horse Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:husk_spawn_egg` NOT_STARTED | Husk Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:illusioner_spawn_egg` NOT_STARTED | Illusioner Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:iron_golem_spawn_egg` NOT_STARTED | Iron Golem Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:killer_bunny_spawn_egg` NOT_STARTED | Killer Bunny Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:llama_spawn_egg` NOT_STARTED | Llama Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |

## A104 — Spawn eggs 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.
- Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.

**Required Inspector showcase:**

- Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.

Existing test files to inspect (coverage unverified): [tests/spawnEggCoverage.test.js](../../tests/spawnEggCoverage.test.js), [tests/spawnEggCatalogue.test.js](../../tests/spawnEggCatalogue.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:magma_cube_spawn_egg` NOT_STARTED | Magma Cube Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:mooshroom_spawn_egg` NOT_STARTED | Mooshroom Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:mule_spawn_egg` NOT_STARTED | Mule Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:ocelot_spawn_egg` NOT_STARTED | Ocelot Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:octopus_spawn_egg` NOT_STARTED | Octopus Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:panda_spawn_egg` NOT_STARTED | Panda Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:parched_spawn_egg` NOT_STARTED | Parched Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:parrot_spawn_egg` NOT_STARTED | Parrot Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:phantom_spawn_egg` NOT_STARTED | Phantom Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:pig_spawn_egg` NOT_STARTED | Pig Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:piglin_brute_spawn_egg` NOT_STARTED | Piglin Brute Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:piglin_spawn_egg` NOT_STARTED | Piglin Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:pillager_spawn_egg` NOT_STARTED | Pillager Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:polar_bear_spawn_egg` NOT_STARTED | Polar Bear Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:pufferfish_spawn_egg` NOT_STARTED | Pufferfish Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:ravager_spawn_egg` NOT_STARTED | Ravager Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:salmon_spawn_egg` NOT_STARTED | Salmon Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:sheep_spawn_egg` NOT_STARTED | Sheep Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:shulker_spawn_egg` NOT_STARTED | Shulker Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:silverfish_spawn_egg` NOT_STARTED | Silverfish Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |

## A105 — Spawn eggs 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.
- Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.

**Required Inspector showcase:**

- Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.

Existing test files to inspect (coverage unverified): [tests/spawnEggCoverage.test.js](../../tests/spawnEggCoverage.test.js), [tests/spawnEggCatalogue.test.js](../../tests/spawnEggCatalogue.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:skeleton_horse_spawn_egg` NOT_STARTED | Skeleton Horse Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:skeleton_spawn_egg` NOT_STARTED | Skeleton Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:slime_spawn_egg` NOT_STARTED | Slime Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:sniffer_spawn_egg` NOT_STARTED | Sniffer Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:snow_golem_spawn_egg` NOT_STARTED | Snow Golem Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:spider_spawn_egg` NOT_STARTED | Spider Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:squid_spawn_egg` NOT_STARTED | Squid Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:stray_spawn_egg` NOT_STARTED | Stray Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:strider_spawn_egg` NOT_STARTED | Strider Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:tadpole_spawn_egg` NOT_STARTED | Tadpole Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:trader_llama_spawn_egg` NOT_STARTED | Trader Llama Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:tropical_fish_spawn_egg` NOT_STARTED | Tropical Fish Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:turtle_spawn_egg` NOT_STARTED | Turtle Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:vex_spawn_egg` NOT_STARTED | Vex Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:villager_spawn_egg` NOT_STARTED | Villager Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:vindicator_spawn_egg` NOT_STARTED | Vindicator Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:wandering_trader_spawn_egg` NOT_STARTED | Wandering Trader Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:warden_spawn_egg` NOT_STARTED | Warden Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:witch_spawn_egg` NOT_STARTED | Witch Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:wither_skeleton_spawn_egg` NOT_STARTED | Wither Skeleton Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |

## A106 — Spawn eggs 5

Rows: 8. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.
- Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.

**Required Inspector showcase:**

- Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.

Existing test files to inspect (coverage unverified): [tests/spawnEggCoverage.test.js](../../tests/spawnEggCoverage.test.js), [tests/spawnEggCatalogue.test.js](../../tests/spawnEggCatalogue.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:wither_spawn_egg` NOT_STARTED | Wither Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:wolf_spawn_egg` NOT_STARTED | Wolf Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:zoglin_spawn_egg` NOT_STARTED | Zoglin Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:zombie_horse_spawn_egg` NOT_STARTED | Zombie Horse Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:zombie_pigman_spawn_egg` NOT_STARTED | Zombie Pigman Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; later-version-or-custom-review-required |
| `I:zombie_spawn_egg` NOT_STARTED | Zombie Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:zombie_villager_spawn_egg` NOT_STARTED | Zombie Villager Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |
| `I:zombified_piglin_spawn_egg` NOT_STARTED | Zombified Piglin Spawn Egg | [Spawn Egg](https://minecraft.wiki/w/Spawn_Egg) | No paired form declared | type=spawn_egg; present-in-pinned-1.21.4 |

## A107 — Smithing templates and trim materials 1

Rows: 19. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Distinct template pattern/name/icon; material contrast on icons/doll/worn model if supported.
- Obtainable source, template duplication, smithing slot requirements, exact output metadata, material/trim combinations and invalid inputs.

**Required Inspector showcase:**

- Obtain/duplicate → trim or upgrade → inspect each slot/material → invalid recipe → save/reload metadata.

Existing test files to inspect (coverage unverified): [tests/smithingParity.test.js](../../tests/smithingParity.test.js), [tests/trimVisuals.test.js](../../tests/trimVisuals.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:bolt_armor_trim_smithing_template` NOT_STARTED | Bolt Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:coast_armor_trim_smithing_template` NOT_STARTED | Coast Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:dune_armor_trim_smithing_template` NOT_STARTED | Dune Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:eye_armor_trim_smithing_template` NOT_STARTED | Eye Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:flow_armor_trim_smithing_template` NOT_STARTED | Flow Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:host_armor_trim_smithing_template` NOT_STARTED | Host Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:netherite_upgrade_smithing_template` NOT_STARTED | Netherite Upgrade | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:raiser_armor_trim_smithing_template` NOT_STARTED | Raiser Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:rib_armor_trim_smithing_template` NOT_STARTED | Rib Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:sentry_armor_trim_smithing_template` NOT_STARTED | Sentry Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:shaper_armor_trim_smithing_template` NOT_STARTED | Shaper Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:silence_armor_trim_smithing_template` NOT_STARTED | Silence Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:snout_armor_trim_smithing_template` NOT_STARTED | Snout Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:spire_armor_trim_smithing_template` NOT_STARTED | Spire Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:tide_armor_trim_smithing_template` NOT_STARTED | Tide Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:vex_armor_trim_smithing_template` NOT_STARTED | Vex Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:ward_armor_trim_smithing_template` NOT_STARTED | Ward Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:wayfinder_armor_trim_smithing_template` NOT_STARTED | Wayfinder Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:wild_armor_trim_smithing_template` NOT_STARTED | Wild Armor Trim | [Smithing Template](https://minecraft.wiki/w/Smithing_Template) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A108 — Books, maps, compasses and records of state 1

Rows: 10. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Held map/book/needle/clock face and UI, display-frame form, name/enchantment/page metadata.
- Write/read/copy/sign/enchant/explore/track/name actions, limits, orientation/dimension behavior, crafting and persistent data.

**Required Inspector showcase:**

- Create → use/update state → copy/name/enchant → invalid action → display/frame → reload contents.

Existing test files to inspect (coverage unverified): [tests/mapItem.test.js](../../tests/mapItem.test.js), [tests/enchanting.test.js](../../tests/enchanting.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:book` NOT_STARTED | Book | [Book](https://minecraft.wiki/w/Book) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:writable_book` NOT_STARTED | Book and Quill | [Book and Quill](https://minecraft.wiki/w/Book_and_Quill) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `B:26` NOT_STARTED | Bookshelf · bookshelf | [Bookshelf](https://minecraft.wiki/w/Bookshelf) | No paired form declared | hardness=1.5; drop=26; present-in-pinned-1.21.4 |
| `B:690` NOT_STARTED | Chiseled Bookshelf · chiseled_bookshelf | [Chiseled Bookshelf](https://minecraft.wiki/w/Chiseled_Bookshelf) | `I:chiseled_bookshelf` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:chiseled_bookshelf` NOT_STARTED | Chiseled Bookshelf | [Chiseled Bookshelf](https://minecraft.wiki/w/Chiseled_Bookshelf) | `B:690` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `I:map` NOT_STARTED | Empty Map | [Empty Map](https://minecraft.wiki/w/Empty_Map) | No paired form declared | stackSize=64; type=utility; present-in-pinned-1.21.4 |
| `I:enchanted_book` NOT_STARTED | Enchanted Book | [Enchanted Book](https://minecraft.wiki/w/Enchanted_Book) | No paired form declared | stackSize=1; type=utility; present-in-pinned-1.21.4 |
| `I:knowledge_book` NOT_STARTED | Knowledge Book | [Knowledge Book](https://minecraft.wiki/w/Knowledge_Book) | No paired form declared | stackSize=1; type=utility; present-in-pinned-1.21.4 |
| `I:filled_map` NOT_STARTED | Map | [Map](https://minecraft.wiki/w/Map) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:written_book` NOT_STARTED | Written Book | [Written Book](https://minecraft.wiki/w/Written_Book) | No paired form declared | stackSize=16; type=utility; present-in-pinned-1.21.4 |

## A109 — Music discs, horns and sound blocks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Distinct icon/held/drop and loaded/playing block states.
- Acquire/insert/play/eject, sound range/selection/timing, instrument/pitch/power semantics and cooldown; persistence and item returns.

**Required Inspector showcase:**

- Insert/use → play/listen → change pitch/instrument → eject/stop → reload; every track/horn variant.

Existing test files to inspect (coverage unverified): [tests/musicDiscs.test.js](../../tests/musicDiscs.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:goat_horn` NOT_STARTED | Goat Horn | [Goat Horn](https://minecraft.wiki/w/Goat_Horn) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `B:692` NOT_STARTED | Jukebox · jukebox | [Jukebox](https://minecraft.wiki/w/Jukebox) | `I:jukebox` | hardness=2; present-in-pinned-1.21.4 |
| `I:jukebox` NOT_STARTED | Jukebox | [Jukebox](https://minecraft.wiki/w/Jukebox) | `B:692` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `I:music_disc_11` NOT_STARTED | Music Disc 11 | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_13` NOT_STARTED | Music Disc 13 | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_5` NOT_STARTED | Music Disc 5 | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_blocks` NOT_STARTED | Music Disc Blocks | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_cat` NOT_STARTED | Music Disc Cat | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_chirp` NOT_STARTED | Music Disc Chirp | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_creator` NOT_STARTED | Music Disc Creator | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_creator_music_box` NOT_STARTED | Music Disc Creator (Music Box) | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_far` NOT_STARTED | Music Disc Far | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_mall` NOT_STARTED | Music Disc Mall | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_mellohi` NOT_STARTED | Music Disc Mellohi | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_otherside` NOT_STARTED | Music Disc Otherside | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_pigstep` NOT_STARTED | Music Disc Pigstep | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_precipice` NOT_STARTED | Music Disc Precipice | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_relic` NOT_STARTED | Music Disc Relic | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_stal` NOT_STARTED | Music Disc Stal | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_strad` NOT_STARTED | Music Disc Strad | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |

## A110 — Music discs, horns and sound blocks 2

Rows: 2. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Distinct icon/held/drop and loaded/playing block states.
- Acquire/insert/play/eject, sound range/selection/timing, instrument/pitch/power semantics and cooldown; persistence and item returns.

**Required Inspector showcase:**

- Insert/use → play/listen → change pitch/instrument → eject/stop → reload; every track/horn variant.

Existing test files to inspect (coverage unverified): [tests/musicDiscs.test.js](../../tests/musicDiscs.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:music_disc_wait` NOT_STARTED | Music Disc Wait | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:music_disc_ward` NOT_STARTED | Music Disc Ward | [Music Disc](https://minecraft.wiki/w/Music_Disc) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |

## A111 — Dyes and pattern ingredients 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct colors/pattern identities in all visual contexts.
- Craft sources, apply to every eligible target, mixing/bleaching, slot/count consumption and persisted target metadata.

**Required Inspector showcase:**

- Craft → dye eligible/invalid targets → mix/wash → drop/pickup → reload colored result.

Existing test files to inspect (coverage unverified): [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/bedColors.test.js](../../tests/bedColors.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:black_dye` NOT_STARTED | Black Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:blue_dye` NOT_STARTED | Blue Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:bordure_indented_banner_pattern` NOT_STARTED | Bordure Indented Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:brown_dye` NOT_STARTED | Brown Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:creeper_banner_pattern` NOT_STARTED | Creeper Charge Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:cyan_dye` NOT_STARTED | Cyan Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:field_masoned_banner_pattern` NOT_STARTED | Field Masoned Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:flow_banner_pattern` NOT_STARTED | Flow Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:flower_banner_pattern` NOT_STARTED | Flower Charge Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:globe_banner_pattern` NOT_STARTED | Globe Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:gray_dye` NOT_STARTED | Gray Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:green_dye` NOT_STARTED | Green Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:guster_banner_pattern` NOT_STARTED | Guster Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:light_blue_dye` NOT_STARTED | Light Blue Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:light_gray_dye` NOT_STARTED | Light Gray Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:lime_dye` NOT_STARTED | Lime Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:magenta_dye` NOT_STARTED | Magenta Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:orange_dye` NOT_STARTED | Orange Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:pink_dye` NOT_STARTED | Pink Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:purple_dye` NOT_STARTED | Purple Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A112 — Dyes and pattern ingredients 2

Rows: 6. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct colors/pattern identities in all visual contexts.
- Craft sources, apply to every eligible target, mixing/bleaching, slot/count consumption and persisted target metadata.

**Required Inspector showcase:**

- Craft → dye eligible/invalid targets → mix/wash → drop/pickup → reload colored result.

Existing test files to inspect (coverage unverified): [tests/bannerGeometry.test.js](../../tests/bannerGeometry.test.js), [tests/bedColors.test.js](../../tests/bedColors.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:red_dye` NOT_STARTED | Red Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:piglin_banner_pattern` NOT_STARTED | Snout Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:snout_banner_pattern` NOT_STARTED | Snout Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; later-version-or-custom-review-required |
| `I:mojang_banner_pattern` NOT_STARTED | Thing Banner Pattern | [Banner Pattern](https://minecraft.wiki/w/Banner_Pattern) | No paired form declared | stackSize=1; type=material; present-in-pinned-1.21.4 |
| `I:white_dye` NOT_STARTED | White Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:yellow_dye` NOT_STARTED | Yellow Dye | [Dye](https://minecraft.wiki/w/Dye) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A113 — Ores and raw mineral resources 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-ore/deepslate texture faces, inventory/held/drop identity and emissive exceptions.
- Required harvest tier, Silk Touch/Fortune, quantity/XP, raw/block conversions, smelting/blasting and world generation/loot obtainability.

**Required Inspector showcase:**

- Wrong/right/enchanted tool → drop/pickup/XP → smelt → compact/decompact → reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/harvestVariants.test.js](../../tests/harvestVariants.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:987` NOT_STARTED | Ancient Debris · ancient_debris | [Ancient Debris](https://minecraft.wiki/w/Ancient_Debris) | No paired form declared | hardness=30; drop=987; present-in-pinned-1.21.4 |
| `I:raw_copper_block` NOT_STARTED | Block of Raw Copper | [Block of Raw Copper](https://minecraft.wiki/w/Block_of_Raw_Copper) | `B:611` | hardness=5; type=block; present-in-pinned-1.21.4 |
| `I:raw_gold_block` NOT_STARTED | Block of Raw Gold | [Block of Raw Gold](https://minecraft.wiki/w/Block_of_Raw_Gold) | `B:612` | hardness=5; type=block; present-in-pinned-1.21.4 |
| `I:raw_iron_block` NOT_STARTED | Block of Raw Iron | [Block of Raw Iron](https://minecraft.wiki/w/Block_of_Raw_Iron) | `B:613` | hardness=5; type=block; present-in-pinned-1.21.4 |
| `B:14` NOT_STARTED | Coal Ore · coal_ore | [Coal Ore](https://minecraft.wiki/w/Coal_Ore) | No paired form declared | hardness=3; dropItem=coal; present-in-pinned-1.21.4 |
| `B:955` NOT_STARTED | Copper Ore · copper_ore | [Copper Ore](https://minecraft.wiki/w/Copper_Ore) | No paired form declared | hardness=3; dropItem=raw_copper; present-in-pinned-1.21.4 |
| `B:947` NOT_STARTED | Deepslate Coal Ore · deepslate_coal_ore | [Deepslate Coal Ore](https://minecraft.wiki/w/Deepslate_Coal_Ore) | No paired form declared | hardness=4.5; dropItem=coal; present-in-pinned-1.21.4 |
| `B:954` NOT_STARTED | Deepslate Copper Ore · deepslate_copper_ore | [Deepslate Copper Ore](https://minecraft.wiki/w/Deepslate_Copper_Ore) | No paired form declared | hardness=4.5; dropItem=raw_copper; present-in-pinned-1.21.4 |
| `B:950` NOT_STARTED | Deepslate Diamond Ore · deepslate_diamond_ore | [Deepslate Diamond Ore](https://minecraft.wiki/w/Deepslate_Diamond_Ore) | No paired form declared | hardness=4.5; dropItem=diamond; present-in-pinned-1.21.4 |
| `B:951` NOT_STARTED | Deepslate Emerald Ore · deepslate_emerald_ore | [Deepslate Emerald Ore](https://minecraft.wiki/w/Deepslate_Emerald_Ore) | No paired form declared | hardness=4.5; dropItem=emerald; present-in-pinned-1.21.4 |
| `B:949` NOT_STARTED | Deepslate Gold Ore · deepslate_gold_ore | [Deepslate Gold Ore](https://minecraft.wiki/w/Deepslate_Gold_Ore) | No paired form declared | hardness=4.5; dropItem=raw_gold; present-in-pinned-1.21.4 |
| `B:948` NOT_STARTED | Deepslate Iron Ore · deepslate_iron_ore | [Deepslate Iron Ore](https://minecraft.wiki/w/Deepslate_Iron_Ore) | No paired form declared | hardness=4.5; dropItem=raw_iron; present-in-pinned-1.21.4 |
| `B:953` NOT_STARTED | Deepslate Lapis Lazuli Ore · deepslate_lapis_ore | [Deepslate Lapis Lazuli Ore](https://minecraft.wiki/w/Deepslate_Lapis_Lazuli_Ore) | No paired form declared | hardness=4.5; dropItem=lapis_lazuli; present-in-pinned-1.21.4 |
| `B:17` NOT_STARTED | Diamond Ore · diamond_ore | [Diamond Ore](https://minecraft.wiki/w/Diamond_Ore) | No paired form declared | hardness=3; dropItem=diamond; present-in-pinned-1.21.4 |
| `B:19` NOT_STARTED | Emerald Ore · emerald_ore | [Emerald Ore](https://minecraft.wiki/w/Emerald_Ore) | No paired form declared | hardness=3; dropItem=emerald; present-in-pinned-1.21.4 |
| `B:16` NOT_STARTED | Gold Ore · gold_ore | [Gold Ore](https://minecraft.wiki/w/Gold_Ore) | No paired form declared | hardness=3; dropItem=gold_ingot; present-in-pinned-1.21.4 |
| `B:656` NOT_STARTED | Heavy Core · heavy_core | [Heavy Core](https://minecraft.wiki/w/Heavy_Core) | `I:heavy_core` | hardness=10; present-in-pinned-1.21.4 |
| `I:heavy_core` NOT_STARTED | Heavy Core | [Heavy Core](https://minecraft.wiki/w/Heavy_Core) | `B:656` | hardness=10; type=block; present-in-pinned-1.21.4 |
| `B:15` NOT_STARTED | Iron Ore · iron_ore | [Iron Ore](https://minecraft.wiki/w/Iron_Ore) | No paired form declared | hardness=3; dropItem=iron_ingot; present-in-pinned-1.21.4 |
| `B:956` NOT_STARTED | Lapis Lazuli Ore · lapis_ore | [Lapis Lazuli Ore](https://minecraft.wiki/w/Lapis_Lazuli_Ore) | No paired form declared | hardness=3; dropItem=lapis_lazuli; present-in-pinned-1.21.4 |

## A114 — Ores and raw mineral resources 2

Rows: 9. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Per-ore/deepslate texture faces, inventory/held/drop identity and emissive exceptions.
- Required harvest tier, Silk Touch/Fortune, quantity/XP, raw/block conversions, smelting/blasting and world generation/loot obtainability.

**Required Inspector showcase:**

- Wrong/right/enchanted tool → drop/pickup/XP → smelt → compact/decompact → reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/harvestVariants.test.js](../../tests/harvestVariants.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:957` NOT_STARTED | Nether Gold Ore · nether_gold_ore | [Nether Gold Ore](https://minecraft.wiki/w/Nether_Gold_Ore) | No paired form declared | hardness=3; dropItem=gold_nugget; present-in-pinned-1.21.4 |
| `B:958` NOT_STARTED | Nether Quartz Ore · nether_quartz_ore | [Nether Quartz Ore](https://minecraft.wiki/w/Nether_Quartz_Ore) | No paired form declared | hardness=3; dropItem=quartz; present-in-pinned-1.21.4 |
| `I:netherite_scrap` NOT_STARTED | Netherite Scrap | [Netherite Scrap](https://minecraft.wiki/w/Netherite_Scrap) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:raw_copper` NOT_STARTED | Raw Copper | [Raw Copper](https://minecraft.wiki/w/Raw_Copper) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:611` NOT_STARTED | Raw Copper Block · raw_copper_block | [Raw Copper Block](https://minecraft.wiki/w/Raw_Copper_Block) | `I:raw_copper_block` | hardness=5; present-in-pinned-1.21.4 |
| `I:raw_gold` NOT_STARTED | Raw Gold | [Raw Gold](https://minecraft.wiki/w/Raw_Gold) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:612` NOT_STARTED | Raw Gold Block · raw_gold_block | [Raw Gold Block](https://minecraft.wiki/w/Raw_Gold_Block) | `I:raw_gold_block` | hardness=5; present-in-pinned-1.21.4 |
| `I:raw_iron` NOT_STARTED | Raw Iron | [Raw Iron](https://minecraft.wiki/w/Raw_Iron) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:613` NOT_STARTED | Raw Iron Block · raw_iron_block | [Raw Iron Block](https://minecraft.wiki/w/Raw_Iron_Block) | `I:raw_iron_block` | hardness=5; present-in-pinned-1.21.4 |

## A115 — Logs, stems, wood and planks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.
- Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.

**Required Inspector showcase:**

- Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.

Existing test files to inspect (coverage unverified): [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js), [tests/treePlacement.test.js](../../tests/treePlacement.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:92` NOT_STARTED | Acacia Log · acacia_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=92; present-in-pinned-1.21.4 |
| `B:94` NOT_STARTED | Acacia Planks · acacia_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=94; present-in-pinned-1.21.4 |
| `B:720` NOT_STARTED | Acacia Wood · acacia_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:acacia_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:acacia_wood` NOT_STARTED | Acacia Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:720` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:83` NOT_STARTED | Birch Log · birch_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=83; present-in-pinned-1.21.4 |
| `B:85` NOT_STARTED | Birch Planks · birch_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=85; present-in-pinned-1.21.4 |
| `B:722` NOT_STARTED | Birch Wood · birch_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:birch_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:birch_wood` NOT_STARTED | Birch Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:722` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:80` NOT_STARTED | Cherry Log · cherry_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=80; present-in-pinned-1.21.4 |
| `B:82` NOT_STARTED | Cherry Planks · cherry_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=82; present-in-pinned-1.21.4 |
| `B:723` NOT_STARTED | Cherry Wood · cherry_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:cherry_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:cherry_wood` NOT_STARTED | Cherry Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:723` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:733` NOT_STARTED | Crimson Hyphae · crimson_hyphae | [Wood](https://minecraft.wiki/w/Wood) | `I:crimson_hyphae` | hardness=2; present-in-pinned-1.21.4 |
| `I:crimson_hyphae` NOT_STARTED | Crimson Hyphae | [Wood](https://minecraft.wiki/w/Wood) | `B:733` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:412` NOT_STARTED | Crimson Planks · crimson_planks | [Planks](https://minecraft.wiki/w/Planks) | `I:crimson_planks` | hardness=2; present-in-pinned-1.21.4 |
| `I:crimson_planks` NOT_STARTED | Crimson Planks | [Planks](https://minecraft.wiki/w/Planks) | `B:412` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:122` NOT_STARTED | Crimson Stem · crimson_stem | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=122; present-in-pinned-1.21.4 |
| `B:95` NOT_STARTED | Dark Oak Log · dark_oak_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=95; present-in-pinned-1.21.4 |
| `B:97` NOT_STARTED | Dark Oak Planks · dark_oak_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=97; present-in-pinned-1.21.4 |
| `B:736` NOT_STARTED | Dark Oak Wood · dark_oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:dark_oak_wood` | hardness=2; present-in-pinned-1.21.4 |

## A116 — Logs, stems, wood and planks 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.
- Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.

**Required Inspector showcase:**

- Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.

Existing test files to inspect (coverage unverified): [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js), [tests/treePlacement.test.js](../../tests/treePlacement.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:dark_oak_wood` NOT_STARTED | Dark Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:736` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:89` NOT_STARTED | Jungle Log · jungle_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=89; present-in-pinned-1.21.4 |
| `B:91` NOT_STARTED | Jungle Planks · jungle_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=91; present-in-pinned-1.21.4 |
| `B:739` NOT_STARTED | Jungle Wood · jungle_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:jungle_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:jungle_wood` NOT_STARTED | Jungle Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:739` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:98` NOT_STARTED | Mangrove Log · mangrove_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=98; present-in-pinned-1.21.4 |
| `B:101` NOT_STARTED | Mangrove Planks · mangrove_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=101; present-in-pinned-1.21.4 |
| `B:740` NOT_STARTED | Mangrove Wood · mangrove_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:mangrove_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:mangrove_wood` NOT_STARTED | Mangrove Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:740` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:8` NOT_STARTED | Oak Log · oak_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=8; present-in-pinned-1.21.4 |
| `B:10` NOT_STARTED | Oak Planks · oak_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=10; present-in-pinned-1.21.4 |
| `B:741` NOT_STARTED | Oak Wood · oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:oak_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:oak_wood` NOT_STARTED | Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:741` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:103` NOT_STARTED | Pale Oak Log · pale_oak_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=103; present-in-pinned-1.21.4 |
| `B:105` NOT_STARTED | Pale Oak Planks · pale_oak_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=105; present-in-pinned-1.21.4 |
| `B:742` NOT_STARTED | Pale Oak Wood · pale_oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:pale_oak_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:pale_oak_wood` NOT_STARTED | Pale Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:742` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:86` NOT_STARTED | Spruce Log · spruce_log | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=86; present-in-pinned-1.21.4 |
| `B:88` NOT_STARTED | Spruce Planks · spruce_planks | [Planks](https://minecraft.wiki/w/Planks) | No paired form declared | hardness=2; drop=88; present-in-pinned-1.21.4 |
| `B:748` NOT_STARTED | Spruce Wood · spruce_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:spruce_wood` | hardness=2; present-in-pinned-1.21.4 |

## A117 — Logs, stems, wood and planks 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.
- Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.

**Required Inspector showcase:**

- Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.

Existing test files to inspect (coverage unverified): [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js), [tests/treePlacement.test.js](../../tests/treePlacement.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:spruce_wood` NOT_STARTED | Spruce Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:748` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:614` NOT_STARTED | Stripped Acacia Log · stripped_acacia_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_acacia_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_acacia_log` NOT_STARTED | Stripped Acacia Log | [Log](https://minecraft.wiki/w/Log) | `B:614` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:749` NOT_STARTED | Stripped Acacia Wood · stripped_acacia_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_acacia_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_acacia_wood` NOT_STARTED | Stripped Acacia Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:749` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:615` NOT_STARTED | Stripped Birch Log · stripped_birch_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_birch_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_birch_log` NOT_STARTED | Stripped Birch Log | [Log](https://minecraft.wiki/w/Log) | `B:615` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:750` NOT_STARTED | Stripped Birch Wood · stripped_birch_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_birch_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_birch_wood` NOT_STARTED | Stripped Birch Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:750` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:616` NOT_STARTED | Stripped Cherry Log · stripped_cherry_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_cherry_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_cherry_log` NOT_STARTED | Stripped Cherry Log | [Log](https://minecraft.wiki/w/Log) | `B:616` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:751` NOT_STARTED | Stripped Cherry Wood · stripped_cherry_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_cherry_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_cherry_wood` NOT_STARTED | Stripped Cherry Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:751` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:752` NOT_STARTED | Stripped Crimson Hyphae · stripped_crimson_hyphae | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_crimson_hyphae` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_crimson_hyphae` NOT_STARTED | Stripped Crimson Hyphae | [Wood](https://minecraft.wiki/w/Wood) | `B:752` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:617` NOT_STARTED | Stripped Crimson Stem · stripped_crimson_stem | [Log](https://minecraft.wiki/w/Log) | `I:stripped_crimson_stem` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_crimson_stem` NOT_STARTED | Stripped Crimson Stem | [Log](https://minecraft.wiki/w/Log) | `B:617` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:618` NOT_STARTED | Stripped Dark Oak Log · stripped_dark_oak_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_dark_oak_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_dark_oak_log` NOT_STARTED | Stripped Dark Oak Log | [Log](https://minecraft.wiki/w/Log) | `B:618` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:753` NOT_STARTED | Stripped Dark Oak Wood · stripped_dark_oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_dark_oak_wood` | hardness=2; present-in-pinned-1.21.4 |

## A118 — Logs, stems, wood and planks 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.
- Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.

**Required Inspector showcase:**

- Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.

Existing test files to inspect (coverage unverified): [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js), [tests/treePlacement.test.js](../../tests/treePlacement.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:stripped_dark_oak_wood` NOT_STARTED | Stripped Dark Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:753` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:619` NOT_STARTED | Stripped Jungle Log · stripped_jungle_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_jungle_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_jungle_log` NOT_STARTED | Stripped Jungle Log | [Log](https://minecraft.wiki/w/Log) | `B:619` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:754` NOT_STARTED | Stripped Jungle Wood · stripped_jungle_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_jungle_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_jungle_wood` NOT_STARTED | Stripped Jungle Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:754` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:620` NOT_STARTED | Stripped Mangrove Log · stripped_mangrove_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_mangrove_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_mangrove_log` NOT_STARTED | Stripped Mangrove Log | [Log](https://minecraft.wiki/w/Log) | `B:620` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:755` NOT_STARTED | Stripped Mangrove Wood · stripped_mangrove_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_mangrove_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_mangrove_wood` NOT_STARTED | Stripped Mangrove Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:755` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:621` NOT_STARTED | Stripped Oak Log · stripped_oak_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_oak_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_oak_log` NOT_STARTED | Stripped Oak Log | [Log](https://minecraft.wiki/w/Log) | `B:621` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:756` NOT_STARTED | Stripped Oak Wood · stripped_oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_oak_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_oak_wood` NOT_STARTED | Stripped Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:756` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:622` NOT_STARTED | Stripped Pale Oak Log · stripped_pale_oak_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_pale_oak_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_pale_oak_log` NOT_STARTED | Stripped Pale Oak Log | [Log](https://minecraft.wiki/w/Log) | `B:622` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:757` NOT_STARTED | Stripped Pale Oak Wood · stripped_pale_oak_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_pale_oak_wood` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_pale_oak_wood` NOT_STARTED | Stripped Pale Oak Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:757` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:623` NOT_STARTED | Stripped Spruce Log · stripped_spruce_log | [Log](https://minecraft.wiki/w/Log) | `I:stripped_spruce_log` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_spruce_log` NOT_STARTED | Stripped Spruce Log | [Log](https://minecraft.wiki/w/Log) | `B:623` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:758` NOT_STARTED | Stripped Spruce Wood · stripped_spruce_wood | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_spruce_wood` | hardness=2; present-in-pinned-1.21.4 |

## A119 — Logs, stems, wood and planks 5

Rows: 10. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.
- Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.

**Required Inspector showcase:**

- Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.

Existing test files to inspect (coverage unverified): [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js), [tests/treePlacement.test.js](../../tests/treePlacement.test.js), [tests/smeltingVanilla.test.js](../../tests/smeltingVanilla.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:stripped_spruce_wood` NOT_STARTED | Stripped Spruce Wood | [Wood](https://minecraft.wiki/w/Wood) | `B:758` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:759` NOT_STARTED | Stripped Warped Hyphae · stripped_warped_hyphae | [Wood](https://minecraft.wiki/w/Wood) | `I:stripped_warped_hyphae` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_warped_hyphae` NOT_STARTED | Stripped Warped Hyphae | [Wood](https://minecraft.wiki/w/Wood) | `B:759` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:624` NOT_STARTED | Stripped Warped Stem · stripped_warped_stem | [Log](https://minecraft.wiki/w/Log) | `I:stripped_warped_stem` | hardness=2; present-in-pinned-1.21.4 |
| `I:stripped_warped_stem` NOT_STARTED | Stripped Warped Stem | [Log](https://minecraft.wiki/w/Log) | `B:624` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:761` NOT_STARTED | Warped Hyphae · warped_hyphae | [Wood](https://minecraft.wiki/w/Wood) | `I:warped_hyphae` | hardness=2; present-in-pinned-1.21.4 |
| `I:warped_hyphae` NOT_STARTED | Warped Hyphae | [Wood](https://minecraft.wiki/w/Wood) | `B:761` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:413` NOT_STARTED | Warped Planks · warped_planks | [Planks](https://minecraft.wiki/w/Planks) | `I:warped_planks` | hardness=2; present-in-pinned-1.21.4 |
| `I:warped_planks` NOT_STARTED | Warped Planks | [Planks](https://minecraft.wiki/w/Planks) | `B:413` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:125` NOT_STARTED | Warped Stem · warped_stem | [Log](https://minecraft.wiki/w/Log) | No paired form declared | hardness=2; drop=125; present-in-pinned-1.21.4 |

## A120 — Glass and transparent full blocks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Tint/alpha and neighboring face culling without missing opaque terrain; correct refraction/ordering with fluids.
- Color recipes, Silk Touch drops, placement/support, light and spawn/collision semantics.

**Required Inspector showcase:**

- Place color matrix beside solids/water/glass → inspect all sides → normal/Silk Touch harvest → reload.

Existing test files to inspect (coverage unverified): [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:646` NOT_STARTED | Black Stained Glass · black_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:black_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:black_stained_glass` NOT_STARTED | Black Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:646` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:647` NOT_STARTED | Blue Stained Glass · blue_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:blue_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:blue_stained_glass` NOT_STARTED | Blue Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:647` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:649` NOT_STARTED | Brown Stained Glass · brown_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:brown_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:brown_stained_glass` NOT_STARTED | Brown Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:649` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:652` NOT_STARTED | Cyan Stained Glass · cyan_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:cyan_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:cyan_stained_glass` NOT_STARTED | Cyan Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:652` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:11` NOT_STARTED | Glass · glass | [Glass](https://minecraft.wiki/w/Glass) | No paired form declared | hardness=0.3; drop=null; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:654` NOT_STARTED | Gray Stained Glass · gray_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:gray_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:gray_stained_glass` NOT_STARTED | Gray Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:654` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:655` NOT_STARTED | Green Stained Glass · green_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:green_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:green_stained_glass` NOT_STARTED | Green Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:655` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:659` NOT_STARTED | Light Blue Stained Glass · light_blue_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:light_blue_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:light_blue_stained_glass` NOT_STARTED | Light Blue Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:659` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:660` NOT_STARTED | Light Gray Stained Glass · light_gray_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:light_gray_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:light_gray_stained_glass` NOT_STARTED | Light Gray Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:660` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:662` NOT_STARTED | Lime Stained Glass · lime_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:lime_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:lime_stained_glass` NOT_STARTED | Lime Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:662` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:663` NOT_STARTED | Magenta Stained Glass · magenta_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:magenta_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |

## A121 — Glass and transparent full blocks 2

Rows: 15. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Tint/alpha and neighboring face culling without missing opaque terrain; correct refraction/ordering with fluids.
- Color recipes, Silk Touch drops, placement/support, light and spawn/collision semantics.

**Required Inspector showcase:**

- Place color matrix beside solids/water/glass → inspect all sides → normal/Silk Touch harvest → reload.

Existing test files to inspect (coverage unverified): [tests/paneCarpetGeometry.test.js](../../tests/paneCarpetGeometry.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:magenta_stained_glass` NOT_STARTED | Magenta Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:663` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:664` NOT_STARTED | Orange Stained Glass · orange_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:orange_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:orange_stained_glass` NOT_STARTED | Orange Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:664` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:669` NOT_STARTED | Pink Stained Glass · pink_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:pink_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:pink_stained_glass` NOT_STARTED | Pink Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:669` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:671` NOT_STARTED | Purple Stained Glass · purple_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:purple_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:purple_stained_glass` NOT_STARTED | Purple Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:671` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:673` NOT_STARTED | Red Stained Glass · red_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:red_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:red_stained_glass` NOT_STARTED | Red Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:673` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:393` NOT_STARTED | Tinted Glass · tinted_glass | [Tinted Glass](https://minecraft.wiki/w/Tinted_Glass) | `I:tinted_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:tinted_glass` NOT_STARTED | Tinted Glass | [Tinted Glass](https://minecraft.wiki/w/Tinted_Glass) | `B:393` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:684` NOT_STARTED | White Stained Glass · white_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:white_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:white_stained_glass` NOT_STARTED | White Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:684` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:685` NOT_STARTED | Yellow Stained Glass · yellow_stained_glass | [Glass](https://minecraft.wiki/w/Glass) | `I:yellow_stained_glass` | hardness=0.3; transparent=true; present-in-pinned-1.21.4 |
| `I:yellow_stained_glass` NOT_STARTED | Yellow Stained Glass | [Glass](https://minecraft.wiki/w/Glass) | `B:685` | hardness=0.3; type=block; transparent=true; present-in-pinned-1.21.4 |

## A122 — Snow, ice and frozen surfaces 1

Rows: 6. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- White snow face contrast, distinct ice textures/transparency, layers/levels, held/drop form; static terrain under animated shaders.
- Accumulation/melting/support, harvesting, powder-snow sinking/freezing/boots, slipperiness, water conversions and light/biome rules.

**Required Inspector showcase:**

- Layer/accumulate → warm/light/weather → walk/fall/freeze → harvest → bucket/melt/refreeze → save/reload.

Existing test files to inspect (coverage unverified): [tests/snowLighting.test.js](../../tests/snowLighting.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/weatherParity.test.js](../../tests/weatherParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:120` NOT_STARTED | Blue Ice · blue_ice | [Blue Ice](https://minecraft.wiki/w/Blue_Ice) | No paired form declared | hardness=2.8; drop=120; present-in-pinned-1.21.4 |
| `B:990` NOT_STARTED | Frosted Ice · frosted_ice | [Frosted Ice](https://minecraft.wiki/w/Frosted_Ice) | No paired form declared | hardness=0.5; drop=null; present-in-pinned-1.21.4 |
| `B:29` NOT_STARTED | Ice · ice | [Ice](https://minecraft.wiki/w/Ice) | No paired form declared | hardness=0.5; drop=null; transparent=true; present-in-pinned-1.21.4 |
| `B:119` NOT_STARTED | Packed Ice · packed_ice | [Packed Ice](https://minecraft.wiki/w/Packed_Ice) | No paired form declared | hardness=0.5; drop=119; present-in-pinned-1.21.4 |
| `B:221` NOT_STARTED | Powder Snow · powder_snow | [Powder Snow](https://minecraft.wiki/w/Powder_Snow) | `I:powder_snow_bucket` | hardness=0.25; drop=221; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:28` NOT_STARTED | Snow Block · snow | [Snow Block](https://minecraft.wiki/w/Snow_Block) | No paired form declared | hardness=0.2; drop=28; present-in-pinned-1.21.4 |

## A123 — Sand, gravel and falling materials 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Falling entity, landed block, held/drop textures and scaffold connectivity; suspicious excavation progress.
- Gravity/support and landing, water hardening, damage/drop outcomes, tool/Fortune or brush archaeology, scaffold range/collapse.

**Required Inspector showcase:**

- Place → remove support → fall/land on solid/fluid/partial shape → harvest or brush → reload mid-state.

Existing test files to inspect (coverage unverified): [tests/archaeology.test.js](../../tests/archaeology.test.js), [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:318` NOT_STARTED | Black Concrete Powder · black_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:black_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:black_concrete_powder` NOT_STARTED | Black Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:318` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:321` NOT_STARTED | Blue Concrete Powder · blue_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:blue_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:blue_concrete_powder` NOT_STARTED | Blue Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:321` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:324` NOT_STARTED | Brown Concrete Powder · brown_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:brown_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:brown_concrete_powder` NOT_STARTED | Brown Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:324` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:326` NOT_STARTED | Cyan Concrete Powder · cyan_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:cyan_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:cyan_concrete_powder` NOT_STARTED | Cyan Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:326` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:7` NOT_STARTED | Gravel · gravel | [Gravel](https://minecraft.wiki/w/Gravel) | No paired form declared | hardness=0.6; drop=7; present-in-pinned-1.21.4 |
| `B:329` NOT_STARTED | Gray Concrete Powder · gray_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:gray_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:gray_concrete_powder` NOT_STARTED | Gray Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:329` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:332` NOT_STARTED | Green Concrete Powder · green_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:green_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:green_concrete_powder` NOT_STARTED | Green Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:332` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:335` NOT_STARTED | Light Blue Concrete Powder · light_blue_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:light_blue_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:light_blue_concrete_powder` NOT_STARTED | Light Blue Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:335` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:338` NOT_STARTED | Light Gray Concrete Powder · light_gray_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:light_gray_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:light_gray_concrete_powder` NOT_STARTED | Light Gray Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:338` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:341` NOT_STARTED | Lime Concrete Powder · lime_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:lime_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:lime_concrete_powder` NOT_STARTED | Lime Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:341` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:344` NOT_STARTED | Magenta Concrete Powder · magenta_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:magenta_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |

## A124 — Sand, gravel and falling materials 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Falling entity, landed block, held/drop textures and scaffold connectivity; suspicious excavation progress.
- Gravity/support and landing, water hardening, damage/drop outcomes, tool/Fortune or brush archaeology, scaffold range/collapse.

**Required Inspector showcase:**

- Place → remove support → fall/land on solid/fluid/partial shape → harvest or brush → reload mid-state.

Existing test files to inspect (coverage unverified): [tests/archaeology.test.js](../../tests/archaeology.test.js), [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:magenta_concrete_powder` NOT_STARTED | Magenta Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:344` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:347` NOT_STARTED | Orange Concrete Powder · orange_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:orange_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:orange_concrete_powder` NOT_STARTED | Orange Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:347` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:349` NOT_STARTED | Pink Concrete Powder · pink_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:pink_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:pink_concrete_powder` NOT_STARTED | Pink Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:349` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:352` NOT_STARTED | Purple Concrete Powder · purple_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:purple_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:purple_concrete_powder` NOT_STARTED | Purple Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:352` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:355` NOT_STARTED | Red Concrete Powder · red_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:red_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:red_concrete_powder` NOT_STARTED | Red Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:355` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:111` NOT_STARTED | Red Sand · red_sand | [Red Sand](https://minecraft.wiki/w/Red_Sand) | No paired form declared | hardness=0.5; drop=111; present-in-pinned-1.21.4 |
| `B:6` NOT_STARTED | Sand · sand | [Sand](https://minecraft.wiki/w/Sand) | No paired form declared | hardness=0.5; drop=6; present-in-pinned-1.21.4 |
| `B:1174` NOT_STARTED | Scaffolding · scaffolding | [Scaffolding](https://minecraft.wiki/w/Scaffolding) | `I:scaffolding` | hardness=0; drop=1174; transparent=true; present-in-pinned-1.21.4 |
| `I:scaffolding` NOT_STARTED | Scaffolding | [Scaffolding](https://minecraft.wiki/w/Scaffolding) | `B:1174` | hardness=0; drop=1174; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:41` NOT_STARTED | Soul Sand · soul_sand | [Soul Sand](https://minecraft.wiki/w/Soul_Sand) | No paired form declared | hardness=0.5; present-in-pinned-1.21.4 |
| `B:1173` NOT_STARTED | Suspicious Gravel · suspicious_gravel | [Suspicious Gravel](https://minecraft.wiki/w/Suspicious_Gravel) | No paired form declared | hardness=0.25; drop=null; present-in-pinned-1.21.4 |
| `B:1172` NOT_STARTED | Suspicious Sand · suspicious_sand | [Suspicious Sand](https://minecraft.wiki/w/Suspicious_Sand) | No paired form declared | hardness=0.25; drop=null; present-in-pinned-1.21.4 |
| `B:357` NOT_STARTED | White Concrete Powder · white_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:white_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:white_concrete_powder` NOT_STARTED | White Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:357` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:359` NOT_STARTED | Yellow Concrete Powder · yellow_concrete_powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `I:yellow_concrete_powder` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:yellow_concrete_powder` NOT_STARTED | Yellow Concrete Powder | [Concrete Powder](https://minecraft.wiki/w/Concrete_Powder) | `B:359` | hardness=0.5; type=block; present-in-pinned-1.21.4 |

## A125 — Copper variants and oxidation 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.

**Required Inspector showcase:**

- Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

Existing test files to inspect (coverage unverified): [tests/blockItems.test.js](../../tests/blockItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:copper_block` NOT_STARTED | Block of Copper | [Block of Copper](https://minecraft.wiki/w/Block_of_Copper) | `B:600` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:599` NOT_STARTED | Chiseled Copper · chiseled_copper | [Chiseled Copper](https://minecraft.wiki/w/Chiseled_Copper) | `I:chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:chiseled_copper` NOT_STARTED | Chiseled Copper | [Chiseled Copper](https://minecraft.wiki/w/Chiseled_Copper) | `B:599` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:600` NOT_STARTED | Copper Block · copper_block | [Copper Block](https://minecraft.wiki/w/Copper_Block) | `I:copper_block` | hardness=3; present-in-pinned-1.21.4 |
| `B:601` NOT_STARTED | Copper Bulb · copper_bulb | [Copper Bulb](https://minecraft.wiki/w/Copper_Bulb) | `I:copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:copper_bulb` NOT_STARTED | Copper Bulb | [Copper Bulb](https://minecraft.wiki/w/Copper_Bulb) | `B:601` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:651` NOT_STARTED | Copper Grate · copper_grate | [Copper Grate](https://minecraft.wiki/w/Copper_Grate) | `I:copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:copper_grate` NOT_STARTED | Copper Grate | [Copper Grate](https://minecraft.wiki/w/Copper_Grate) | `B:651` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `I:copper_ingot` NOT_STARTED | Copper Ingot | [Copper Ingot](https://minecraft.wiki/w/Copper_Ingot) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `B:602` NOT_STARTED | Cut Copper · cut_copper | [Cut Copper](https://minecraft.wiki/w/Cut_Copper) | `I:cut_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:cut_copper` NOT_STARTED | Cut Copper | [Cut Copper](https://minecraft.wiki/w/Cut_Copper) | `B:602` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:603` NOT_STARTED | Exposed Chiseled Copper · exposed_chiseled_copper | [Exposed Chiseled Copper](https://minecraft.wiki/w/Exposed_Chiseled_Copper) | `I:exposed_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:exposed_chiseled_copper` NOT_STARTED | Exposed Chiseled Copper | [Exposed Chiseled Copper](https://minecraft.wiki/w/Exposed_Chiseled_Copper) | `B:603` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:604` NOT_STARTED | Exposed Copper · exposed_copper | [Exposed Copper](https://minecraft.wiki/w/Exposed_Copper) | `I:exposed_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:exposed_copper` NOT_STARTED | Exposed Copper | [Exposed Copper](https://minecraft.wiki/w/Exposed_Copper) | `B:604` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:605` NOT_STARTED | Exposed Copper Bulb · exposed_copper_bulb | [Exposed Copper Bulb](https://minecraft.wiki/w/Exposed_Copper_Bulb) | `I:exposed_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:exposed_copper_bulb` NOT_STARTED | Exposed Copper Bulb | [Exposed Copper Bulb](https://minecraft.wiki/w/Exposed_Copper_Bulb) | `B:605` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:653` NOT_STARTED | Exposed Copper Grate · exposed_copper_grate | [Exposed Copper Grate](https://minecraft.wiki/w/Exposed_Copper_Grate) | `I:exposed_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:exposed_copper_grate` NOT_STARTED | Exposed Copper Grate | [Exposed Copper Grate](https://minecraft.wiki/w/Exposed_Copper_Grate) | `B:653` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:606` NOT_STARTED | Exposed Cut Copper · exposed_cut_copper | [Exposed Cut Copper](https://minecraft.wiki/w/Exposed_Cut_Copper) | `I:exposed_cut_copper` | hardness=3; present-in-pinned-1.21.4 |

## A126 — Copper variants and oxidation 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.

**Required Inspector showcase:**

- Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

Existing test files to inspect (coverage unverified): [tests/blockItems.test.js](../../tests/blockItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:exposed_cut_copper` NOT_STARTED | Exposed Cut Copper | [Exposed Cut Copper](https://minecraft.wiki/w/Exposed_Cut_Copper) | `B:606` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:607` NOT_STARTED | Oxidized Chiseled Copper · oxidized_chiseled_copper | [Oxidized Chiseled Copper](https://minecraft.wiki/w/Oxidized_Chiseled_Copper) | `I:oxidized_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:oxidized_chiseled_copper` NOT_STARTED | Oxidized Chiseled Copper | [Oxidized Chiseled Copper](https://minecraft.wiki/w/Oxidized_Chiseled_Copper) | `B:607` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:608` NOT_STARTED | Oxidized Copper · oxidized_copper | [Oxidized Copper](https://minecraft.wiki/w/Oxidized_Copper) | `I:oxidized_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:oxidized_copper` NOT_STARTED | Oxidized Copper | [Oxidized Copper](https://minecraft.wiki/w/Oxidized_Copper) | `B:608` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:609` NOT_STARTED | Oxidized Copper Bulb · oxidized_copper_bulb | [Oxidized Copper Bulb](https://minecraft.wiki/w/Oxidized_Copper_Bulb) | `I:oxidized_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:oxidized_copper_bulb` NOT_STARTED | Oxidized Copper Bulb | [Oxidized Copper Bulb](https://minecraft.wiki/w/Oxidized_Copper_Bulb) | `B:609` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:665` NOT_STARTED | Oxidized Copper Grate · oxidized_copper_grate | [Oxidized Copper Grate](https://minecraft.wiki/w/Oxidized_Copper_Grate) | `I:oxidized_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:oxidized_copper_grate` NOT_STARTED | Oxidized Copper Grate | [Oxidized Copper Grate](https://minecraft.wiki/w/Oxidized_Copper_Grate) | `B:665` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:610` NOT_STARTED | Oxidized Cut Copper · oxidized_cut_copper | [Oxidized Cut Copper](https://minecraft.wiki/w/Oxidized_Cut_Copper) | `I:oxidized_cut_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:oxidized_cut_copper` NOT_STARTED | Oxidized Cut Copper | [Oxidized Cut Copper](https://minecraft.wiki/w/Oxidized_Cut_Copper) | `B:610` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `I:waxed_copper_block` NOT_STARTED | Waxed Block of Copper | [Waxed Block of Copper](https://minecraft.wiki/w/Waxed_Block_of_Copper) | `B:626` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:625` NOT_STARTED | Waxed Chiseled Copper · waxed_chiseled_copper | [Waxed Chiseled Copper](https://minecraft.wiki/w/Waxed_Chiseled_Copper) | `I:waxed_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_chiseled_copper` NOT_STARTED | Waxed Chiseled Copper | [Waxed Chiseled Copper](https://minecraft.wiki/w/Waxed_Chiseled_Copper) | `B:625` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:626` NOT_STARTED | Waxed Copper Block · waxed_copper_block | [Waxed Copper Block](https://minecraft.wiki/w/Waxed_Copper_Block) | `I:waxed_copper_block` | hardness=3; present-in-pinned-1.21.4 |
| `B:627` NOT_STARTED | Waxed Copper Bulb · waxed_copper_bulb | [Waxed Copper Bulb](https://minecraft.wiki/w/Waxed_Copper_Bulb) | `I:waxed_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_copper_bulb` NOT_STARTED | Waxed Copper Bulb | [Waxed Copper Bulb](https://minecraft.wiki/w/Waxed_Copper_Bulb) | `B:627` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:679` NOT_STARTED | Waxed Copper Grate · waxed_copper_grate | [Waxed Copper Grate](https://minecraft.wiki/w/Waxed_Copper_Grate) | `I:waxed_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:waxed_copper_grate` NOT_STARTED | Waxed Copper Grate | [Waxed Copper Grate](https://minecraft.wiki/w/Waxed_Copper_Grate) | `B:679` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:628` NOT_STARTED | Waxed Cut Copper · waxed_cut_copper | [Waxed Cut Copper](https://minecraft.wiki/w/Waxed_Cut_Copper) | `I:waxed_cut_copper` | hardness=3; present-in-pinned-1.21.4 |

## A127 — Copper variants and oxidation 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.

**Required Inspector showcase:**

- Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

Existing test files to inspect (coverage unverified): [tests/blockItems.test.js](../../tests/blockItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:waxed_cut_copper` NOT_STARTED | Waxed Cut Copper | [Waxed Cut Copper](https://minecraft.wiki/w/Waxed_Cut_Copper) | `B:628` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:629` NOT_STARTED | Waxed Exposed Chiseled Copper · waxed_exposed_chiseled_copper | [Waxed Exposed Chiseled Copper](https://minecraft.wiki/w/Waxed_Exposed_Chiseled_Copper) | `I:waxed_exposed_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_exposed_chiseled_copper` NOT_STARTED | Waxed Exposed Chiseled Copper | [Waxed Exposed Chiseled Copper](https://minecraft.wiki/w/Waxed_Exposed_Chiseled_Copper) | `B:629` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:630` NOT_STARTED | Waxed Exposed Copper · waxed_exposed_copper | [Waxed Exposed Copper](https://minecraft.wiki/w/Waxed_Exposed_Copper) | `I:waxed_exposed_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_exposed_copper` NOT_STARTED | Waxed Exposed Copper | [Waxed Exposed Copper](https://minecraft.wiki/w/Waxed_Exposed_Copper) | `B:630` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:631` NOT_STARTED | Waxed Exposed Copper Bulb · waxed_exposed_copper_bulb | [Waxed Exposed Copper Bulb](https://minecraft.wiki/w/Waxed_Exposed_Copper_Bulb) | `I:waxed_exposed_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_exposed_copper_bulb` NOT_STARTED | Waxed Exposed Copper Bulb | [Waxed Exposed Copper Bulb](https://minecraft.wiki/w/Waxed_Exposed_Copper_Bulb) | `B:631` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:680` NOT_STARTED | Waxed Exposed Copper Grate · waxed_exposed_copper_grate | [Waxed Exposed Copper Grate](https://minecraft.wiki/w/Waxed_Exposed_Copper_Grate) | `I:waxed_exposed_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:waxed_exposed_copper_grate` NOT_STARTED | Waxed Exposed Copper Grate | [Waxed Exposed Copper Grate](https://minecraft.wiki/w/Waxed_Exposed_Copper_Grate) | `B:680` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:632` NOT_STARTED | Waxed Exposed Cut Copper · waxed_exposed_cut_copper | [Waxed Exposed Cut Copper](https://minecraft.wiki/w/Waxed_Exposed_Cut_Copper) | `I:waxed_exposed_cut_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_exposed_cut_copper` NOT_STARTED | Waxed Exposed Cut Copper | [Waxed Exposed Cut Copper](https://minecraft.wiki/w/Waxed_Exposed_Cut_Copper) | `B:632` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:633` NOT_STARTED | Waxed Oxidized Chiseled Copper · waxed_oxidized_chiseled_copper | [Waxed Oxidized Chiseled Copper](https://minecraft.wiki/w/Waxed_Oxidized_Chiseled_Copper) | `I:waxed_oxidized_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_oxidized_chiseled_copper` NOT_STARTED | Waxed Oxidized Chiseled Copper | [Waxed Oxidized Chiseled Copper](https://minecraft.wiki/w/Waxed_Oxidized_Chiseled_Copper) | `B:633` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:634` NOT_STARTED | Waxed Oxidized Copper · waxed_oxidized_copper | [Waxed Oxidized Copper](https://minecraft.wiki/w/Waxed_Oxidized_Copper) | `I:waxed_oxidized_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_oxidized_copper` NOT_STARTED | Waxed Oxidized Copper | [Waxed Oxidized Copper](https://minecraft.wiki/w/Waxed_Oxidized_Copper) | `B:634` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:635` NOT_STARTED | Waxed Oxidized Copper Bulb · waxed_oxidized_copper_bulb | [Waxed Oxidized Copper Bulb](https://minecraft.wiki/w/Waxed_Oxidized_Copper_Bulb) | `I:waxed_oxidized_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_oxidized_copper_bulb` NOT_STARTED | Waxed Oxidized Copper Bulb | [Waxed Oxidized Copper Bulb](https://minecraft.wiki/w/Waxed_Oxidized_Copper_Bulb) | `B:635` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:681` NOT_STARTED | Waxed Oxidized Copper Grate · waxed_oxidized_copper_grate | [Waxed Oxidized Copper Grate](https://minecraft.wiki/w/Waxed_Oxidized_Copper_Grate) | `I:waxed_oxidized_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:waxed_oxidized_copper_grate` NOT_STARTED | Waxed Oxidized Copper Grate | [Waxed Oxidized Copper Grate](https://minecraft.wiki/w/Waxed_Oxidized_Copper_Grate) | `B:681` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:636` NOT_STARTED | Waxed Oxidized Cut Copper · waxed_oxidized_cut_copper | [Waxed Oxidized Cut Copper](https://minecraft.wiki/w/Waxed_Oxidized_Cut_Copper) | `I:waxed_oxidized_cut_copper` | hardness=3; present-in-pinned-1.21.4 |

## A128 — Copper variants and oxidation 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.

**Required Inspector showcase:**

- Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

Existing test files to inspect (coverage unverified): [tests/blockItems.test.js](../../tests/blockItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:waxed_oxidized_cut_copper` NOT_STARTED | Waxed Oxidized Cut Copper | [Waxed Oxidized Cut Copper](https://minecraft.wiki/w/Waxed_Oxidized_Cut_Copper) | `B:636` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:637` NOT_STARTED | Waxed Weathered Chiseled Copper · waxed_weathered_chiseled_copper | [Waxed Weathered Chiseled Copper](https://minecraft.wiki/w/Waxed_Weathered_Chiseled_Copper) | `I:waxed_weathered_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_weathered_chiseled_copper` NOT_STARTED | Waxed Weathered Chiseled Copper | [Waxed Weathered Chiseled Copper](https://minecraft.wiki/w/Waxed_Weathered_Chiseled_Copper) | `B:637` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:638` NOT_STARTED | Waxed Weathered Copper · waxed_weathered_copper | [Waxed Weathered Copper](https://minecraft.wiki/w/Waxed_Weathered_Copper) | `I:waxed_weathered_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_weathered_copper` NOT_STARTED | Waxed Weathered Copper | [Waxed Weathered Copper](https://minecraft.wiki/w/Waxed_Weathered_Copper) | `B:638` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:639` NOT_STARTED | Waxed Weathered Copper Bulb · waxed_weathered_copper_bulb | [Waxed Weathered Copper Bulb](https://minecraft.wiki/w/Waxed_Weathered_Copper_Bulb) | `I:waxed_weathered_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_weathered_copper_bulb` NOT_STARTED | Waxed Weathered Copper Bulb | [Waxed Weathered Copper Bulb](https://minecraft.wiki/w/Waxed_Weathered_Copper_Bulb) | `B:639` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:682` NOT_STARTED | Waxed Weathered Copper Grate · waxed_weathered_copper_grate | [Waxed Weathered Copper Grate](https://minecraft.wiki/w/Waxed_Weathered_Copper_Grate) | `I:waxed_weathered_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:waxed_weathered_copper_grate` NOT_STARTED | Waxed Weathered Copper Grate | [Waxed Weathered Copper Grate](https://minecraft.wiki/w/Waxed_Weathered_Copper_Grate) | `B:682` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:640` NOT_STARTED | Waxed Weathered Cut Copper · waxed_weathered_cut_copper | [Waxed Weathered Cut Copper](https://minecraft.wiki/w/Waxed_Weathered_Cut_Copper) | `I:waxed_weathered_cut_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:waxed_weathered_cut_copper` NOT_STARTED | Waxed Weathered Cut Copper | [Waxed Weathered Cut Copper](https://minecraft.wiki/w/Waxed_Weathered_Cut_Copper) | `B:640` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:641` NOT_STARTED | Weathered Chiseled Copper · weathered_chiseled_copper | [Weathered Chiseled Copper](https://minecraft.wiki/w/Weathered_Chiseled_Copper) | `I:weathered_chiseled_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:weathered_chiseled_copper` NOT_STARTED | Weathered Chiseled Copper | [Weathered Chiseled Copper](https://minecraft.wiki/w/Weathered_Chiseled_Copper) | `B:641` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:642` NOT_STARTED | Weathered Copper · weathered_copper | [Weathered Copper](https://minecraft.wiki/w/Weathered_Copper) | `I:weathered_copper` | hardness=3; present-in-pinned-1.21.4 |
| `I:weathered_copper` NOT_STARTED | Weathered Copper | [Weathered Copper](https://minecraft.wiki/w/Weathered_Copper) | `B:642` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:643` NOT_STARTED | Weathered Copper Bulb · weathered_copper_bulb | [Weathered Copper Bulb](https://minecraft.wiki/w/Weathered_Copper_Bulb) | `I:weathered_copper_bulb` | hardness=3; present-in-pinned-1.21.4 |
| `I:weathered_copper_bulb` NOT_STARTED | Weathered Copper Bulb | [Weathered Copper Bulb](https://minecraft.wiki/w/Weathered_Copper_Bulb) | `B:643` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:683` NOT_STARTED | Weathered Copper Grate · weathered_copper_grate | [Weathered Copper Grate](https://minecraft.wiki/w/Weathered_Copper_Grate) | `I:weathered_copper_grate` | hardness=3; transparent=true; present-in-pinned-1.21.4 |
| `I:weathered_copper_grate` NOT_STARTED | Weathered Copper Grate | [Weathered Copper Grate](https://minecraft.wiki/w/Weathered_Copper_Grate) | `B:683` | hardness=3; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:644` NOT_STARTED | Weathered Cut Copper · weathered_cut_copper | [Weathered Cut Copper](https://minecraft.wiki/w/Weathered_Cut_Copper) | `I:weathered_cut_copper` | hardness=3; present-in-pinned-1.21.4 |

## A129 — Copper variants and oxidation 5

Rows: 1. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.
- Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.

**Required Inspector showcase:**

- Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.

Existing test files to inspect (coverage unverified): [tests/blockItems.test.js](../../tests/blockItems.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:weathered_cut_copper` NOT_STARTED | Weathered Cut Copper | [Weathered Cut Copper](https://minecraft.wiki/w/Weathered_Cut_Copper) | `B:644` | hardness=3; type=block; present-in-pinned-1.21.4 |

## A130 — Technical, command and operator-only blocks 1

Rows: 14. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct intended invisibility/debug display, selection and operator-only inventory form; distinguish air from missing geometry.
- Command permissions/execution modes/conditional chains, structure save/load/rotation, jigsaw configuration and barrier/light semantics as applicable.
- No invented survival recipes/drops; negative permission tests and state persistence are mandatory.

**Required Inspector showcase:**

- Operator obtain/configure → valid operation → unauthorized/invalid operation → visualize debug state → save/reload/remove.

Existing test files to inspect (coverage unverified): [tests/commandParity.test.js](../../tests/commandParity.test.js), [tests/structureTemplate.test.js](../../tests/structureTemplate.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:0` NOT_STARTED | Air · air | [Air](https://minecraft.wiki/w/Air) | No paired form declared | transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1194` NOT_STARTED | Barrier · barrier | [Barrier](https://minecraft.wiki/w/Barrier) | `I:barrier` | hardness=-1; drop=1194; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `I:barrier` NOT_STARTED | Barrier | [Barrier](https://minecraft.wiki/w/Barrier) | `B:1194` | hardness=-1; drop=1194; type=block; transparent=true; solid=true; present-in-pinned-1.21.4 |
| `B:1197` NOT_STARTED | Cave Air · cave_air | [Cave Air](https://minecraft.wiki/w/Cave_Air) | No paired form declared | drop=null; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1078` NOT_STARTED | Chain Command Block · chain_command_block | [Chain Command Block](https://minecraft.wiki/w/Chain_Command_Block) | No paired form declared | hardness=-1; drop=1078; present-in-pinned-1.21.4 |
| `B:1076` NOT_STARTED | Command Block · command_block | [Command Block](https://minecraft.wiki/w/Command_Block) | No paired form declared | hardness=-1; drop=1076; present-in-pinned-1.21.4 |
| `B:1080` NOT_STARTED | Jigsaw Block · jigsaw | [Jigsaw Block](https://minecraft.wiki/w/Jigsaw_Block) | No paired form declared | hardness=-1; drop=1080; present-in-pinned-1.21.4 |
| `B:1195` NOT_STARTED | Light · light | [Light](https://minecraft.wiki/w/Light) | `I:light` | light=15; lightColor=16774048; hardness=-1; drop=1195; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:light` NOT_STARTED | Light | [Light](https://minecraft.wiki/w/Light) | `B:1195` | light=15; lightColor=16774048; hardness=-1; drop=1195; type=block; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1077` NOT_STARTED | Repeating Command Block · repeating_command_block | [Repeating Command Block](https://minecraft.wiki/w/Repeating_Command_Block) | No paired form declared | hardness=-1; drop=1077; present-in-pinned-1.21.4 |
| `B:1079` NOT_STARTED | Structure Block · structure_block | [Structure Block](https://minecraft.wiki/w/Structure_Block) | No paired form declared | hardness=-1; drop=1079; present-in-pinned-1.21.4 |
| `B:1196` NOT_STARTED | Structure Void · structure_void | [Structure Void](https://minecraft.wiki/w/Structure_Void) | `I:structure_void` | hardness=0; drop=1196; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `I:structure_void` NOT_STARTED | Structure Void | [Structure Void](https://minecraft.wiki/w/Structure_Void) | `B:1196` | hardness=0; drop=1196; type=block; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:1198` NOT_STARTED | Void Air · void_air | [Void Air](https://minecraft.wiki/w/Void_Air) | No paired form declared | drop=null; transparent=true; solid=false; present-in-pinned-1.21.4 |

## A131 — Stone, dirt and ordinary full building blocks 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:598` NOT_STARTED | Amethyst Block · amethyst_block | [Amethyst Block](https://minecraft.wiki/w/Amethyst_Block) | `I:amethyst_block` | hardness=1.5; present-in-pinned-1.21.4 |
| `B:568` NOT_STARTED | Andesite · andesite | [Andesite](https://minecraft.wiki/w/Andesite) | `I:andesite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:andesite` NOT_STARTED | Andesite | [Andesite](https://minecraft.wiki/w/Andesite) | `B:568` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:128` NOT_STARTED | Basalt · basalt | [Basalt](https://minecraft.wiki/w/Basalt) | No paired form declared | hardness=1.25; drop=128; present-in-pinned-1.21.4 |
| `B:5` NOT_STARTED | Bedrock · bedrock | [Bedrock](https://minecraft.wiki/w/Bedrock) | No paired form declared | hardness=-1; drop=null; present-in-pinned-1.21.4 |
| `B:686` NOT_STARTED | Bee Nest · bee_nest | [Bee Nest](https://minecraft.wiki/w/Bee_Nest) | `I:bee_nest` | hardness=0.3; present-in-pinned-1.21.4 |
| `I:bee_nest` NOT_STARTED | Bee Nest | [Bee Nest](https://minecraft.wiki/w/Bee_Nest) | `B:686` | hardness=0.3; type=block; present-in-pinned-1.21.4 |
| `B:687` NOT_STARTED | Beehive · beehive | [Beehive](https://minecraft.wiki/w/Beehive) | `I:beehive` | hardness=0.6; present-in-pinned-1.21.4 |
| `I:beehive` NOT_STARTED | Beehive | [Beehive](https://minecraft.wiki/w/Beehive) | `B:687` | hardness=0.6; type=block; present-in-pinned-1.21.4 |
| `B:317` NOT_STARTED | Black Concrete · black_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:black_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:black_concrete` NOT_STARTED | Black Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:317` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1028` NOT_STARTED | Black Glazed Terracotta · black_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1028; present-in-pinned-1.21.4 |
| `B:319` NOT_STARTED | Black Terracotta · black_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:black_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:black_terracotta` NOT_STARTED | Black Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:319` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:129` NOT_STARTED | Blackstone · blackstone | [Blackstone](https://minecraft.wiki/w/Blackstone) | No paired form declared | hardness=1.5; drop=129; present-in-pinned-1.21.4 |
| `I:amethyst_block` NOT_STARTED | Block of Amethyst | [Block of Amethyst](https://minecraft.wiki/w/Block_of_Amethyst) | `B:598` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:151` NOT_STARTED | Block of Coal · coal_block | [Block of Coal](https://minecraft.wiki/w/Block_of_Coal) | No paired form declared | hardness=5; drop=151; present-in-pinned-1.21.4 |
| `B:212` NOT_STARTED | Block of Diamond · diamond_block | [Block of Diamond](https://minecraft.wiki/w/Block_of_Diamond) | No paired form declared | hardness=5; present-in-pinned-1.21.4 |
| `B:213` NOT_STARTED | Block of Emerald · emerald_block | [Block of Emerald](https://minecraft.wiki/w/Block_of_Emerald) | No paired form declared | hardness=5; present-in-pinned-1.21.4 |
| `B:211` NOT_STARTED | Block of Gold · gold_block | [Block of Gold](https://minecraft.wiki/w/Block_of_Gold) | No paired form declared | hardness=3; present-in-pinned-1.21.4 |

## A132 — Stone, dirt and ordinary full building blocks 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:210` NOT_STARTED | Block of Iron · iron_block | [Block of Iron](https://minecraft.wiki/w/Block_of_Iron) | No paired form declared | hardness=5; present-in-pinned-1.21.4 |
| `I:lapis_block` NOT_STARTED | Block of Lapis Lazuli | [Block of Lapis Lazuli](https://minecraft.wiki/w/Block_of_Lapis_Lazuli) | `B:658` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:214` NOT_STARTED | Block of Netherite · netherite_block | [Block of Netherite](https://minecraft.wiki/w/Block_of_Netherite) | No paired form declared | hardness=50; present-in-pinned-1.21.4 |
| `I:quartz_block` NOT_STARTED | Block of Quartz | [Block of Quartz](https://minecraft.wiki/w/Block_of_Quartz) | `B:590` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:320` NOT_STARTED | Blue Concrete · blue_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:blue_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:blue_concrete` NOT_STARTED | Blue Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:320` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1024` NOT_STARTED | Blue Glazed Terracotta · blue_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1024; present-in-pinned-1.21.4 |
| `B:322` NOT_STARTED | Blue Terracotta · blue_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:blue_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:blue_terracotta` NOT_STARTED | Blue Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:322` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:648` NOT_STARTED | Bone Block · bone_block | [Bone Block](https://minecraft.wiki/w/Bone_Block) | `I:bone_block` | hardness=2; present-in-pinned-1.21.4 |
| `I:bone_block` NOT_STARTED | Bone Block | [Bone Block](https://minecraft.wiki/w/Bone_Block) | `B:648` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:25` NOT_STARTED | Bricks · bricks | [Bricks](https://minecraft.wiki/w/Bricks) | No paired form declared | hardness=2; drop=25; present-in-pinned-1.21.4 |
| `B:323` NOT_STARTED | Brown Concrete · brown_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:brown_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:brown_concrete` NOT_STARTED | Brown Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:323` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1025` NOT_STARTED | Brown Glazed Terracotta · brown_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1025; present-in-pinned-1.21.4 |
| `B:118` NOT_STARTED | Brown Terracotta · brown_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=118; present-in-pinned-1.21.4 |
| `B:1008` NOT_STARTED | Budding Amethyst · budding_amethyst | [Budding Amethyst](https://minecraft.wiki/w/Budding_Amethyst) | No paired form declared | hardness=1.5; drop=null; present-in-pinned-1.21.4 |
| `B:140` NOT_STARTED | Calcite · calcite | [Calcite](https://minecraft.wiki/w/Calcite) | No paired form declared | hardness=0.75; drop=140; present-in-pinned-1.21.4 |
| `B:385` NOT_STARTED | Calibrated Sculk Sensor · calibrated_sculk_sensor | [Calibrated Sculk Sensor](https://minecraft.wiki/w/Calibrated_Sculk_Sensor) | `I:calibrated_sculk_sensor` | light=1; hardness=1.5; present-in-pinned-1.21.4 |
| `I:calibrated_sculk_sensor` NOT_STARTED | Calibrated Sculk Sensor | [Calibrated Sculk Sensor](https://minecraft.wiki/w/Calibrated_Sculk_Sensor) | `B:385` | light=1; hardness=1.5; type=block; present-in-pinned-1.21.4 |

## A133 — Stone, dirt and ordinary full building blocks 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:650` NOT_STARTED | Carved Pumpkin · carved_pumpkin | [Carved Pumpkin](https://minecraft.wiki/w/Carved_Pumpkin) | `I:carved_pumpkin` | hardness=1; present-in-pinned-1.21.4 |
| `I:carved_pumpkin` NOT_STARTED | Carved Pumpkin | [Carved Pumpkin](https://minecraft.wiki/w/Carved_Pumpkin) | `B:650` | hardness=1; type=block; present-in-pinned-1.21.4 |
| `B:316` NOT_STARTED | Chain · chain | [Chain](https://minecraft.wiki/w/Chain) | `I:chain` | hardness=5; transparent=true; present-in-pinned-1.21.4 |
| `I:chain` NOT_STARTED | Chain | [Chain](https://minecraft.wiki/w/Chain) | `B:316` | hardness=5; type=block; transparent=true; present-in-pinned-1.21.4 |
| `B:724` NOT_STARTED | Chiseled Deepslate · chiseled_deepslate | [Chiseled Deepslate](https://minecraft.wiki/w/Chiseled_Deepslate) | `I:chiseled_deepslate` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:chiseled_deepslate` NOT_STARTED | Chiseled Deepslate | [Chiseled Deepslate](https://minecraft.wiki/w/Chiseled_Deepslate) | `B:724` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:386` NOT_STARTED | Chiseled Nether Bricks · chiseled_nether_bricks | [Chiseled Nether Bricks](https://minecraft.wiki/w/Chiseled_Nether_Bricks) | `I:chiseled_nether_bricks` | hardness=2; present-in-pinned-1.21.4 |
| `I:chiseled_nether_bricks` NOT_STARTED | Chiseled Nether Bricks | [Chiseled Nether Bricks](https://minecraft.wiki/w/Chiseled_Nether_Bricks) | `B:386` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:725` NOT_STARTED | Chiseled Polished Blackstone · chiseled_polished_blackstone | [Chiseled Polished Blackstone](https://minecraft.wiki/w/Chiseled_Polished_Blackstone) | `I:chiseled_polished_blackstone` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:chiseled_polished_blackstone` NOT_STARTED | Chiseled Polished Blackstone | [Chiseled Polished Blackstone](https://minecraft.wiki/w/Chiseled_Polished_Blackstone) | `B:725` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:569` NOT_STARTED | Chiseled Quartz Block · chiseled_quartz_block | [Chiseled Quartz Block](https://minecraft.wiki/w/Chiseled_Quartz_Block) | `I:chiseled_quartz_block` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:chiseled_quartz_block` NOT_STARTED | Chiseled Quartz Block | [Chiseled Quartz Block](https://minecraft.wiki/w/Chiseled_Quartz_Block) | `B:569` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:726` NOT_STARTED | Chiseled Red Sandstone · chiseled_red_sandstone | [Chiseled Red Sandstone](https://minecraft.wiki/w/Chiseled_Red_Sandstone) | `I:chiseled_red_sandstone` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:chiseled_red_sandstone` NOT_STARTED | Chiseled Red Sandstone | [Chiseled Red Sandstone](https://minecraft.wiki/w/Chiseled_Red_Sandstone) | `B:726` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:978` NOT_STARTED | Chiseled Resin Bricks · chiseled_resin_bricks | [Chiseled Resin Bricks](https://minecraft.wiki/w/Chiseled_Resin_Bricks) | No paired form declared | hardness=1.5; drop=978; present-in-pinned-1.21.4 |
| `B:727` NOT_STARTED | Chiseled Sandstone · chiseled_sandstone | [Chiseled Sandstone](https://minecraft.wiki/w/Chiseled_Sandstone) | `I:chiseled_sandstone` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:chiseled_sandstone` NOT_STARTED | Chiseled Sandstone | [Chiseled Sandstone](https://minecraft.wiki/w/Chiseled_Sandstone) | `B:727` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:570` NOT_STARTED | Chiseled Stone Bricks · chiseled_stone_bricks | [Chiseled Stone Bricks](https://minecraft.wiki/w/Chiseled_Stone_Bricks) | `I:chiseled_stone_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:chiseled_stone_bricks` NOT_STARTED | Chiseled Stone Bricks | [Chiseled Stone Bricks](https://minecraft.wiki/w/Chiseled_Stone_Bricks) | `B:570` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:728` NOT_STARTED | Chiseled Tuff · chiseled_tuff | [Chiseled Tuff](https://minecraft.wiki/w/Chiseled_Tuff) | `I:chiseled_tuff` | hardness=1.5; present-in-pinned-1.21.4 |

## A134 — Stone, dirt and ordinary full building blocks 4

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:chiseled_tuff` NOT_STARTED | Chiseled Tuff | [Chiseled Tuff](https://minecraft.wiki/w/Chiseled_Tuff) | `B:728` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:729` NOT_STARTED | Chiseled Tuff Bricks · chiseled_tuff_bricks | [Chiseled Tuff Bricks](https://minecraft.wiki/w/Chiseled_Tuff_Bricks) | `I:chiseled_tuff_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:chiseled_tuff_bricks` NOT_STARTED | Chiseled Tuff Bricks | [Chiseled Tuff Bricks](https://minecraft.wiki/w/Chiseled_Tuff_Bricks) | `B:729` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:149` NOT_STARTED | Chorus Flower · chorus_flower | [Chorus Flower](https://minecraft.wiki/w/Chorus_Flower) | No paired form declared | hardness=0.4; drop=149; present-in-pinned-1.21.4 |
| `B:148` NOT_STARTED | Chorus Plant · chorus_plant | [Chorus Plant](https://minecraft.wiki/w/Chorus_Plant) | No paired form declared | hardness=0.4; drop=148; present-in-pinned-1.21.4 |
| `B:37` NOT_STARTED | Clay Block · clay | [Clay Block](https://minecraft.wiki/w/Clay_Block) | No paired form declared | hardness=0.6; present-in-pinned-1.21.4 |
| `B:571` NOT_STARTED | Coarse Dirt · coarse_dirt | [Coarse Dirt](https://minecraft.wiki/w/Coarse_Dirt) | `I:coarse_dirt` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:coarse_dirt` NOT_STARTED | Coarse Dirt | [Coarse Dirt](https://minecraft.wiki/w/Coarse_Dirt) | `B:571` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:946` NOT_STARTED | Cobbled Deepslate · cobbled_deepslate | [Cobbled Deepslate](https://minecraft.wiki/w/Cobbled_Deepslate) | No paired form declared | hardness=3.5; drop=946; present-in-pinned-1.21.4 |
| `B:4` NOT_STARTED | Cobblestone · cobblestone | [Cobblestone](https://minecraft.wiki/w/Cobblestone) | No paired form declared | hardness=2; drop=4; present-in-pinned-1.21.4 |
| `B:730` NOT_STARTED | Cracked Deepslate Bricks · cracked_deepslate_bricks | [Cracked Deepslate Bricks](https://minecraft.wiki/w/Cracked_Deepslate_Bricks) | `I:cracked_deepslate_bricks` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:cracked_deepslate_bricks` NOT_STARTED | Cracked Deepslate Bricks | [Cracked Deepslate Bricks](https://minecraft.wiki/w/Cracked_Deepslate_Bricks) | `B:730` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:731` NOT_STARTED | Cracked Deepslate Tiles · cracked_deepslate_tiles | [Cracked Deepslate Tiles](https://minecraft.wiki/w/Cracked_Deepslate_Tiles) | `I:cracked_deepslate_tiles` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:cracked_deepslate_tiles` NOT_STARTED | Cracked Deepslate Tiles | [Cracked Deepslate Tiles](https://minecraft.wiki/w/Cracked_Deepslate_Tiles) | `B:731` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:986` NOT_STARTED | Cracked Nether Bricks · cracked_nether_bricks | [Cracked Nether Bricks](https://minecraft.wiki/w/Cracked_Nether_Bricks) | No paired form declared | hardness=2; drop=986; present-in-pinned-1.21.4 |
| `B:732` NOT_STARTED | Cracked Polished Blackstone Bricks · cracked_polished_blackstone_bricks | [Cracked Polished Blackstone Bricks](https://minecraft.wiki/w/Cracked_Polished_Blackstone_Bricks) | `I:cracked_polished_blackstone_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:cracked_polished_blackstone_bricks` NOT_STARTED | Cracked Polished Blackstone Bricks | [Cracked Polished Blackstone Bricks](https://minecraft.wiki/w/Cracked_Polished_Blackstone_Bricks) | `B:732` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:572` NOT_STARTED | Cracked Stone Bricks · cracked_stone_bricks | [Cracked Stone Bricks](https://minecraft.wiki/w/Cracked_Stone_Bricks) | `I:cracked_stone_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:cracked_stone_bricks` NOT_STARTED | Cracked Stone Bricks | [Cracked Stone Bricks](https://minecraft.wiki/w/Cracked_Stone_Bricks) | `B:572` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:989` NOT_STARTED | Creaking Heart · creaking_heart | [Creaking Heart](https://minecraft.wiki/w/Creaking_Heart) | No paired form declared | hardness=10; drop=975; present-in-pinned-1.21.4 |

## A135 — Stone, dirt and ordinary full building blocks 5

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:121` NOT_STARTED | Crimson Nylium · crimson_nylium | [Crimson Nylium](https://minecraft.wiki/w/Crimson_Nylium) | No paired form declared | hardness=0.4; drop=40; present-in-pinned-1.21.4 |
| `B:215` NOT_STARTED | Crying Obsidian · crying_obsidian | [Crying Obsidian](https://minecraft.wiki/w/Crying_Obsidian) | No paired form declared | light=10; lightColor=9643757; hardness=50; drop=215; present-in-pinned-1.21.4 |
| `B:734` NOT_STARTED | Cut Red Sandstone · cut_red_sandstone | [Cut Red Sandstone](https://minecraft.wiki/w/Cut_Red_Sandstone) | `I:cut_red_sandstone` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:cut_red_sandstone` NOT_STARTED | Cut Red Sandstone | [Cut Red Sandstone](https://minecraft.wiki/w/Cut_Red_Sandstone) | `B:734` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:735` NOT_STARTED | Cut Sandstone · cut_sandstone | [Cut Sandstone](https://minecraft.wiki/w/Cut_Sandstone) | `I:cut_sandstone` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:cut_sandstone` NOT_STARTED | Cut Sandstone | [Cut Sandstone](https://minecraft.wiki/w/Cut_Sandstone) | `B:735` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:325` NOT_STARTED | Cyan Concrete · cyan_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:cyan_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:cyan_concrete` NOT_STARTED | Cyan Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:325` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1022` NOT_STARTED | Cyan Glazed Terracotta · cyan_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1022; present-in-pinned-1.21.4 |
| `B:327` NOT_STARTED | Cyan Terracotta · cyan_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:cyan_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:cyan_terracotta` NOT_STARTED | Cyan Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:327` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:144` NOT_STARTED | Dark Prismarine · dark_prismarine | [Dark Prismarine](https://minecraft.wiki/w/Dark_Prismarine) | No paired form declared | hardness=1.5; drop=144; present-in-pinned-1.21.4 |
| `B:133` NOT_STARTED | Deepslate · deepslate | [Deepslate](https://minecraft.wiki/w/Deepslate) | No paired form declared | hardness=3; drop=946; present-in-pinned-1.21.4 |
| `B:737` NOT_STARTED | Deepslate Bricks · deepslate_bricks | [Deepslate Bricks](https://minecraft.wiki/w/Deepslate_Bricks) | `I:deepslate_bricks` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:deepslate_bricks` NOT_STARTED | Deepslate Bricks | [Deepslate Bricks](https://minecraft.wiki/w/Deepslate_Bricks) | `B:737` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:738` NOT_STARTED | Deepslate Tiles · deepslate_tiles | [Deepslate Tiles](https://minecraft.wiki/w/Deepslate_Tiles) | `I:deepslate_tiles` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:deepslate_tiles` NOT_STARTED | Deepslate Tiles | [Deepslate Tiles](https://minecraft.wiki/w/Deepslate_Tiles) | `B:738` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:573` NOT_STARTED | Diorite · diorite | [Diorite](https://minecraft.wiki/w/Diorite) | `I:diorite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:diorite` NOT_STARTED | Diorite | [Diorite](https://minecraft.wiki/w/Diorite) | `B:573` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:2` NOT_STARTED | Dirt · dirt | [Dirt](https://minecraft.wiki/w/Dirt) | No paired form declared | hardness=0.5; drop=2; present-in-pinned-1.21.4 |

## A136 — Stone, dirt and ordinary full building blocks 6

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1214` NOT_STARTED | Dirt Path · dirt_path | [Dirt Path](https://minecraft.wiki/w/Dirt_Path) | `I:dirt_path` | hardness=0.65; drop=2; present-in-pinned-1.21.4 |
| `I:dirt_path` NOT_STARTED | Dirt Path | [Dirt Path](https://minecraft.wiki/w/Dirt_Path) | `B:1214` | hardness=0.65; drop=2; type=block; present-in-pinned-1.21.4 |
| `B:137` NOT_STARTED | Dripstone Block · dripstone_block | [Dripstone Block](https://minecraft.wiki/w/Dripstone_Block) | No paired form declared | hardness=1.5; drop=137; present-in-pinned-1.21.4 |
| `B:42` NOT_STARTED | End Stone · end_stone | [End Stone](https://minecraft.wiki/w/End_Stone) | No paired form declared | hardness=3; present-in-pinned-1.21.4 |
| `B:575` NOT_STARTED | End Stone Bricks · end_stone_bricks | [End Stone Bricks](https://minecraft.wiki/w/End_Stone_Bricks) | `I:end_stone_bricks` | hardness=3; present-in-pinned-1.21.4 |
| `I:end_stone_bricks` NOT_STARTED | End Stone Bricks | [End Stone Bricks](https://minecraft.wiki/w/End_Stone_Bricks) | `B:575` | hardness=3; type=block; present-in-pinned-1.21.4 |
| `B:162` NOT_STARTED | Farmland · farmland | [Farmland](https://minecraft.wiki/w/Farmland) | No paired form declared | hardness=0.6; drop=2; present-in-pinned-1.21.4 |
| `B:198` NOT_STARTED | Fletching Table · fletching_table | [Fletching Table](https://minecraft.wiki/w/Fletching_Table) | `I:fletching_table` | hardness=2.5; present-in-pinned-1.21.4 |
| `I:fletching_table` NOT_STARTED | Fletching Table | [Fletching Table](https://minecraft.wiki/w/Fletching_Table) | `B:198` | hardness=2.5; type=utility; present-in-pinned-1.21.4 |
| `B:1086` NOT_STARTED | Frogspawn · frogspawn | [Frogspawn](https://minecraft.wiki/w/Frogspawn) | No paired form declared | hardness=0; drop=1086; present-in-pinned-1.21.4 |
| `B:576` NOT_STARTED | Gilded Blackstone · gilded_blackstone | [Gilded Blackstone](https://minecraft.wiki/w/Gilded_Blackstone) | `I:gilded_blackstone` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:gilded_blackstone` NOT_STARTED | Gilded Blackstone | [Gilded Blackstone](https://minecraft.wiki/w/Gilded_Blackstone) | `B:576` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:577` NOT_STARTED | Granite · granite | [Granite](https://minecraft.wiki/w/Granite) | `I:granite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:granite` NOT_STARTED | Granite | [Granite](https://minecraft.wiki/w/Granite) | `B:577` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:1` NOT_STARTED | Grass Block · grass, grass_block | [Grass Block](https://minecraft.wiki/w/Grass_Block) | No paired form declared | hardness=0.6; drop=2; present-in-pinned-1.21.4 |
| `B:328` NOT_STARTED | Gray Concrete · gray_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:gray_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:gray_concrete` NOT_STARTED | Gray Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:328` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1020` NOT_STARTED | Gray Glazed Terracotta · gray_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1020; present-in-pinned-1.21.4 |
| `B:330` NOT_STARTED | Gray Terracotta · gray_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:gray_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:gray_terracotta` NOT_STARTED | Gray Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:330` | hardness=1.25; type=block; present-in-pinned-1.21.4 |

## A137 — Stone, dirt and ordinary full building blocks 7

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:331` NOT_STARTED | Green Concrete · green_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:green_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:green_concrete` NOT_STARTED | Green Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:331` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1026` NOT_STARTED | Green Glazed Terracotta · green_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1026; present-in-pinned-1.21.4 |
| `B:333` NOT_STARTED | Green Terracotta · green_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:green_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:green_terracotta` NOT_STARTED | Green Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:333` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `I:hay_block` NOT_STARTED | Hay Bale | [Hay Bale](https://minecraft.wiki/w/Hay_Bale) | `B:578` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:578` NOT_STARTED | Hay Block · hay_block | [Hay Bale](https://minecraft.wiki/w/Hay_Bale) | `I:hay_block` | hardness=0.5; present-in-pinned-1.21.4 |
| `B:579` NOT_STARTED | Honeycomb Block · honeycomb_block | [Honeycomb Block](https://minecraft.wiki/w/Honeycomb_Block) | `I:honeycomb_block` | hardness=0.6; present-in-pinned-1.21.4 |
| `I:honeycomb_block` NOT_STARTED | Honeycomb Block | [Honeycomb Block](https://minecraft.wiki/w/Honeycomb_Block) | `B:579` | hardness=0.6; type=block; present-in-pinned-1.21.4 |
| `B:973` NOT_STARTED | Infested Chiseled Stone Bricks · infested_chiseled_stone_bricks | [Infested Chiseled Stone Bricks](https://minecraft.wiki/w/Infested_Chiseled_Stone_Bricks) | No paired form declared | hardness=0.75; drop=null; present-in-pinned-1.21.4 |
| `B:969` NOT_STARTED | Infested Cobblestone · infested_cobblestone | [Infested Cobblestone](https://minecraft.wiki/w/Infested_Cobblestone) | No paired form declared | hardness=1; drop=null; present-in-pinned-1.21.4 |
| `B:972` NOT_STARTED | Infested Cracked Stone Bricks · infested_cracked_stone_bricks | [Infested Cracked Stone Bricks](https://minecraft.wiki/w/Infested_Cracked_Stone_Bricks) | No paired form declared | hardness=0.75; drop=null; present-in-pinned-1.21.4 |
| `B:974` NOT_STARTED | Infested Deepslate · infested_deepslate | [Infested Deepslate](https://minecraft.wiki/w/Infested_Deepslate) | No paired form declared | hardness=1.5; drop=null; present-in-pinned-1.21.4 |
| `B:971` NOT_STARTED | Infested Mossy Stone Bricks · infested_mossy_stone_bricks | [Infested Mossy Stone Bricks](https://minecraft.wiki/w/Infested_Mossy_Stone_Bricks) | No paired form declared | hardness=0.75; drop=null; present-in-pinned-1.21.4 |
| `B:968` NOT_STARTED | Infested Stone · infested_stone | [Infested Stone](https://minecraft.wiki/w/Infested_Stone) | No paired form declared | hardness=0.75; drop=null; present-in-pinned-1.21.4 |
| `B:970` NOT_STARTED | Infested Stone Bricks · infested_stone_bricks | [Infested Stone Bricks](https://minecraft.wiki/w/Infested_Stone_Bricks) | No paired form declared | hardness=0.75; drop=null; present-in-pinned-1.21.4 |
| `B:49` NOT_STARTED | Ladder · ladder | [Ladder](https://minecraft.wiki/w/Ladder) | No paired form declared | hardness=0.4; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:658` NOT_STARTED | Lapis Block · lapis_block | [Lapis Block](https://minecraft.wiki/w/Lapis_Block) | `I:lapis_block` | hardness=3; present-in-pinned-1.21.4 |
| `B:334` NOT_STARTED | Light Blue Concrete · light_blue_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:light_blue_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:light_blue_concrete` NOT_STARTED | Light Blue Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:334` | hardness=1.8; type=block; present-in-pinned-1.21.4 |

## A138 — Stone, dirt and ordinary full building blocks 8

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:1016` NOT_STARTED | Light Blue Glazed Terracotta · light_blue_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1016; present-in-pinned-1.21.4 |
| `B:336` NOT_STARTED | Light Blue Terracotta · light_blue_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:light_blue_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:light_blue_terracotta` NOT_STARTED | Light Blue Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:336` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:337` NOT_STARTED | Light Gray Concrete · light_gray_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:light_gray_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:light_gray_concrete` NOT_STARTED | Light Gray Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:337` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1021` NOT_STARTED | Light Gray Glazed Terracotta · light_gray_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1021; present-in-pinned-1.21.4 |
| `B:339` NOT_STARTED | Light Gray Terracotta · light_gray_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:light_gray_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:light_gray_terracotta` NOT_STARTED | Light Gray Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:339` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:340` NOT_STARTED | Lime Concrete · lime_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:lime_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:lime_concrete` NOT_STARTED | Lime Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:340` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1018` NOT_STARTED | Lime Glazed Terracotta · lime_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1018; present-in-pinned-1.21.4 |
| `B:342` NOT_STARTED | Lime Terracotta · lime_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:lime_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:lime_terracotta` NOT_STARTED | Lime Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:342` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:343` NOT_STARTED | Magenta Concrete · magenta_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:magenta_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:magenta_concrete` NOT_STARTED | Magenta Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:343` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1015` NOT_STARTED | Magenta Glazed Terracotta · magenta_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1015; present-in-pinned-1.21.4 |
| `B:345` NOT_STARTED | Magenta Terracotta · magenta_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:magenta_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:magenta_terracotta` NOT_STARTED | Magenta Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:345` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:130` NOT_STARTED | Magma Block · magma_block | [Magma Block](https://minecraft.wiki/w/Magma_Block) | No paired form declared | light=3; lightColor=16737792; hardness=0.5; drop=130; present-in-pinned-1.21.4 |
| `B:390` NOT_STARTED | Melon · melon | [Melon](https://minecraft.wiki/w/Melon) | `I:melon` | hardness=1; present-in-pinned-1.21.4 |

## A139 — Stone, dirt and ordinary full building blocks 9

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:melon` NOT_STARTED | Melon | [Melon](https://minecraft.wiki/w/Melon) | `B:390` | hardness=1; type=block; present-in-pinned-1.21.4 |
| `B:163` NOT_STARTED | Moist Farmland · farmland_moist | [Moist Farmland](https://minecraft.wiki/w/Moist_Farmland) | No paired form declared | hardness=0.6; drop=2; later-version-or-custom-review-required |
| `B:1081` NOT_STARTED | Monster Spawner · spawner | [Monster Spawner](https://minecraft.wiki/w/Monster_Spawner) | No paired form declared | hardness=5; drop=null; present-in-pinned-1.21.4 |
| `B:134` NOT_STARTED | Moss Block · moss_block | [Moss Block](https://minecraft.wiki/w/Moss_Block) | No paired form declared | hardness=0.1; drop=134; present-in-pinned-1.21.4 |
| `B:33` NOT_STARTED | Mossy Cobblestone · mossy_cobblestone | [Mossy Cobblestone](https://minecraft.wiki/w/Mossy_Cobblestone) | No paired form declared | hardness=2; drop=33; present-in-pinned-1.21.4 |
| `B:580` NOT_STARTED | Mossy Stone Bricks · mossy_stone_bricks | [Mossy Stone Bricks](https://minecraft.wiki/w/Mossy_Stone_Bricks) | `I:mossy_stone_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:mossy_stone_bricks` NOT_STARTED | Mossy Stone Bricks | [Mossy Stone Bricks](https://minecraft.wiki/w/Mossy_Stone_Bricks) | `B:580` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:102` NOT_STARTED | Mud · mud | [Mud](https://minecraft.wiki/w/Mud) | No paired form declared | hardness=0.5; drop=102; present-in-pinned-1.21.4 |
| `B:581` NOT_STARTED | Mud Bricks · mud_bricks | [Mud Bricks](https://minecraft.wiki/w/Mud_Bricks) | `I:mud_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:mud_bricks` NOT_STARTED | Mud Bricks | [Mud Bricks](https://minecraft.wiki/w/Mud_Bricks) | `B:581` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:219` NOT_STARTED | Nether Bricks · nether_bricks | [Nether Bricks](https://minecraft.wiki/w/Nether_Bricks) | No paired form declared | hardness=2; drop=219; present-in-pinned-1.21.4 |
| `B:40` NOT_STARTED | Netherrack · netherrack | [Netherrack](https://minecraft.wiki/w/Netherrack) | No paired form declared | hardness=0.4; present-in-pinned-1.21.4 |
| `B:20` NOT_STARTED | Obsidian · obsidian | [Obsidian](https://minecraft.wiki/w/Obsidian) | No paired form declared | hardness=50; drop=20; present-in-pinned-1.21.4 |
| `B:346` NOT_STARTED | Orange Concrete · orange_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:orange_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:orange_concrete` NOT_STARTED | Orange Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:346` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1014` NOT_STARTED | Orange Glazed Terracotta · orange_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1014; present-in-pinned-1.21.4 |
| `B:115` NOT_STARTED | Orange Terracotta · orange_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=115; present-in-pinned-1.21.4 |
| `B:583` NOT_STARTED | Packed Mud · packed_mud | [Packed Mud](https://minecraft.wiki/w/Packed_Mud) | `I:packed_mud` | hardness=1; present-in-pinned-1.21.4 |
| `I:packed_mud` NOT_STARTED | Packed Mud | [Packed Mud](https://minecraft.wiki/w/Packed_Mud) | `B:583` | hardness=1; type=block; present-in-pinned-1.21.4 |
| `B:666` NOT_STARTED | Pale Moss Block · pale_moss_block | [Pale Moss Block](https://minecraft.wiki/w/Pale_Moss_Block) | `I:pale_moss_block` | hardness=0.1; present-in-pinned-1.21.4 |

## A140 — Stone, dirt and ordinary full building blocks 10

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:pale_moss_block` NOT_STARTED | Pale Moss Block | [Pale Moss Block](https://minecraft.wiki/w/Pale_Moss_Block) | `B:666` | hardness=0.1; type=block; present-in-pinned-1.21.4 |
| `B:348` NOT_STARTED | Pink Concrete · pink_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:pink_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:pink_concrete` NOT_STARTED | Pink Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:348` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1019` NOT_STARTED | Pink Glazed Terracotta · pink_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1019; present-in-pinned-1.21.4 |
| `B:350` NOT_STARTED | Pink Terracotta · pink_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:pink_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:pink_terracotta` NOT_STARTED | Pink Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:350` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:110` NOT_STARTED | Podzol · podzol | [Podzol](https://minecraft.wiki/w/Podzol) | No paired form declared | hardness=0.5; drop=2; present-in-pinned-1.21.4 |
| `B:138` NOT_STARTED | Pointed Dripstone · pointed_dripstone | [Pointed Dripstone](https://minecraft.wiki/w/Pointed_Dripstone) | No paired form declared | hardness=1.5; drop=138; transparent=true; solid=false; present-in-pinned-1.21.4 |
| `B:585` NOT_STARTED | Polished Andesite · polished_andesite | [Polished Andesite](https://minecraft.wiki/w/Polished_Andesite) | `I:polished_andesite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:polished_andesite` NOT_STARTED | Polished Andesite | [Polished Andesite](https://minecraft.wiki/w/Polished_Andesite) | `B:585` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:743` NOT_STARTED | Polished Basalt · polished_basalt | [Polished Basalt](https://minecraft.wiki/w/Polished_Basalt) | `I:polished_basalt` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:polished_basalt` NOT_STARTED | Polished Basalt | [Polished Basalt](https://minecraft.wiki/w/Polished_Basalt) | `B:743` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:586` NOT_STARTED | Polished Blackstone · polished_blackstone | [Polished Blackstone](https://minecraft.wiki/w/Polished_Blackstone) | `I:polished_blackstone` | hardness=2; present-in-pinned-1.21.4 |
| `I:polished_blackstone` NOT_STARTED | Polished Blackstone | [Polished Blackstone](https://minecraft.wiki/w/Polished_Blackstone) | `B:586` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:744` NOT_STARTED | Polished Blackstone Bricks · polished_blackstone_bricks | [Polished Blackstone Bricks](https://minecraft.wiki/w/Polished_Blackstone_Bricks) | `I:polished_blackstone_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:polished_blackstone_bricks` NOT_STARTED | Polished Blackstone Bricks | [Polished Blackstone Bricks](https://minecraft.wiki/w/Polished_Blackstone_Bricks) | `B:744` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:745` NOT_STARTED | Polished Deepslate · polished_deepslate | [Polished Deepslate](https://minecraft.wiki/w/Polished_Deepslate) | `I:polished_deepslate` | hardness=3.5; present-in-pinned-1.21.4 |
| `I:polished_deepslate` NOT_STARTED | Polished Deepslate | [Polished Deepslate](https://minecraft.wiki/w/Polished_Deepslate) | `B:745` | hardness=3.5; type=block; present-in-pinned-1.21.4 |
| `B:587` NOT_STARTED | Polished Diorite · polished_diorite | [Polished Diorite](https://minecraft.wiki/w/Polished_Diorite) | `I:polished_diorite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:polished_diorite` NOT_STARTED | Polished Diorite | [Polished Diorite](https://minecraft.wiki/w/Polished_Diorite) | `B:587` | hardness=1.5; type=block; present-in-pinned-1.21.4 |

## A141 — Stone, dirt and ordinary full building blocks 11

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:588` NOT_STARTED | Polished Granite · polished_granite | [Polished Granite](https://minecraft.wiki/w/Polished_Granite) | `I:polished_granite` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:polished_granite` NOT_STARTED | Polished Granite | [Polished Granite](https://minecraft.wiki/w/Polished_Granite) | `B:588` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:746` NOT_STARTED | Polished Tuff · polished_tuff | [Polished Tuff](https://minecraft.wiki/w/Polished_Tuff) | `I:polished_tuff` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:polished_tuff` NOT_STARTED | Polished Tuff | [Polished Tuff](https://minecraft.wiki/w/Polished_Tuff) | `B:746` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:142` NOT_STARTED | Prismarine · prismarine | [Prismarine](https://minecraft.wiki/w/Prismarine) | No paired form declared | hardness=1.5; drop=142; present-in-pinned-1.21.4 |
| `B:143` NOT_STARTED | Prismarine Bricks · prismarine_bricks | [Prismarine Bricks](https://minecraft.wiki/w/Prismarine_Bricks) | No paired form declared | hardness=1.5; drop=143; present-in-pinned-1.21.4 |
| `B:945` NOT_STARTED | Pumpkin · pumpkin | [Pumpkin](https://minecraft.wiki/w/Pumpkin) | `I:pumpkin` | hardness=1; present-in-pinned-1.21.4 |
| `I:pumpkin` NOT_STARTED | Pumpkin | [Pumpkin](https://minecraft.wiki/w/Pumpkin) | `B:945` | hardness=1; type=block; present-in-pinned-1.21.4 |
| `B:351` NOT_STARTED | Purple Concrete · purple_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:purple_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:purple_concrete` NOT_STARTED | Purple Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:351` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1023` NOT_STARTED | Purple Glazed Terracotta · purple_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1023; present-in-pinned-1.21.4 |
| `B:353` NOT_STARTED | Purple Terracotta · purple_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `I:purple_terracotta` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:purple_terracotta` NOT_STARTED | Purple Terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | `B:353` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:589` NOT_STARTED | Purpur Block · purpur_block | [Purpur Block](https://minecraft.wiki/w/Purpur_Block) | `I:purpur_block` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:purpur_block` NOT_STARTED | Purpur Block | [Purpur Block](https://minecraft.wiki/w/Purpur_Block) | `B:589` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:672` NOT_STARTED | Purpur Pillar · purpur_pillar | [Purpur Pillar](https://minecraft.wiki/w/Purpur_Pillar) | `I:purpur_pillar` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:purpur_pillar` NOT_STARTED | Purpur Pillar | [Purpur Pillar](https://minecraft.wiki/w/Purpur_Pillar) | `B:672` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:590` NOT_STARTED | Quartz Block · quartz_block | [Quartz Block](https://minecraft.wiki/w/Quartz_Block) | `I:quartz_block` | hardness=0.8; present-in-pinned-1.21.4 |
| `B:391` NOT_STARTED | Quartz Bricks · quartz_bricks | [Quartz Bricks](https://minecraft.wiki/w/Quartz_Bricks) | `I:quartz_bricks` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:quartz_bricks` NOT_STARTED | Quartz Bricks | [Quartz Bricks](https://minecraft.wiki/w/Quartz_Bricks) | `B:391` | hardness=0.8; type=block; present-in-pinned-1.21.4 |

## A142 — Stone, dirt and ordinary full building blocks 12

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:591` NOT_STARTED | Quartz Pillar · quartz_pillar | [Quartz Pillar](https://minecraft.wiki/w/Quartz_Pillar) | `I:quartz_pillar` | hardness=0.8; present-in-pinned-1.21.4 |
| `I:quartz_pillar` NOT_STARTED | Quartz Pillar | [Quartz Pillar](https://minecraft.wiki/w/Quartz_Pillar) | `B:591` | hardness=0.8; type=block; present-in-pinned-1.21.4 |
| `B:354` NOT_STARTED | Red Concrete · red_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:red_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:red_concrete` NOT_STARTED | Red Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:354` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1027` NOT_STARTED | Red Glazed Terracotta · red_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1027; present-in-pinned-1.21.4 |
| `B:747` NOT_STARTED | Red Nether Bricks · red_nether_bricks | [Red Nether Bricks](https://minecraft.wiki/w/Red_Nether_Bricks) | `I:red_nether_bricks` | hardness=2; present-in-pinned-1.21.4 |
| `I:red_nether_bricks` NOT_STARTED | Red Nether Bricks | [Red Nether Bricks](https://minecraft.wiki/w/Red_Nether_Bricks) | `B:747` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:112` NOT_STARTED | Red Sandstone · red_sandstone | [Red Sandstone](https://minecraft.wiki/w/Red_Sandstone) | No paired form declared | hardness=0.8; drop=112; present-in-pinned-1.21.4 |
| `B:114` NOT_STARTED | Red Terracotta · red_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=114; present-in-pinned-1.21.4 |
| `B:988` NOT_STARTED | Reinforced Deepslate · reinforced_deepslate | [Reinforced Deepslate](https://minecraft.wiki/w/Reinforced_Deepslate) | No paired form declared | hardness=55; drop=null; present-in-pinned-1.21.4 |
| `B:976` NOT_STARTED | Resin Block · resin_block | [Resin Block](https://minecraft.wiki/w/Resin_Block) | No paired form declared | hardness=0; drop=976; present-in-pinned-1.21.4 |
| `B:977` NOT_STARTED | Resin Bricks · resin_bricks | [Resin Bricks](https://minecraft.wiki/w/Resin_Bricks) | No paired form declared | hardness=1.5; drop=977; present-in-pinned-1.21.4 |
| `B:592` NOT_STARTED | Rooted Dirt · rooted_dirt | [Rooted Dirt](https://minecraft.wiki/w/Rooted_Dirt) | `I:rooted_dirt` | hardness=0.5; present-in-pinned-1.21.4 |
| `I:rooted_dirt` NOT_STARTED | Rooted Dirt | [Rooted Dirt](https://minecraft.wiki/w/Rooted_Dirt) | `B:592` | hardness=0.5; type=block; present-in-pinned-1.21.4 |
| `B:32` NOT_STARTED | Sandstone · sandstone | [Sandstone](https://minecraft.wiki/w/Sandstone) | No paired form declared | hardness=0.8; drop=32; present-in-pinned-1.21.4 |
| `B:131` NOT_STARTED | Sculk · sculk | [Sculk](https://minecraft.wiki/w/Sculk) | No paired form declared | hardness=0.2; drop=131; present-in-pinned-1.21.4 |
| `B:132` NOT_STARTED | Sculk Catalyst · sculk_catalyst | [Sculk Catalyst](https://minecraft.wiki/w/Sculk_Catalyst) | No paired form declared | light=6; lightColor=440020; hardness=3; drop=132; present-in-pinned-1.21.4 |
| `B:593` NOT_STARTED | Smooth Basalt · smooth_basalt | [Smooth Basalt](https://minecraft.wiki/w/Smooth_Basalt) | `I:smooth_basalt` | hardness=1.25; present-in-pinned-1.21.4 |
| `I:smooth_basalt` NOT_STARTED | Smooth Basalt | [Smooth Basalt](https://minecraft.wiki/w/Smooth_Basalt) | `B:593` | hardness=1.25; type=block; present-in-pinned-1.21.4 |
| `B:594` NOT_STARTED | Smooth Quartz · smooth_quartz | [Smooth Quartz](https://minecraft.wiki/w/Smooth_Quartz) | `I:smooth_quartz` | hardness=2; present-in-pinned-1.21.4 |

## A143 — Stone, dirt and ordinary full building blocks 13

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:smooth_quartz` NOT_STARTED | Smooth Quartz Block | [Smooth Quartz Block](https://minecraft.wiki/w/Smooth_Quartz_Block) | `B:594` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:595` NOT_STARTED | Smooth Red Sandstone · smooth_red_sandstone | [Smooth Red Sandstone](https://minecraft.wiki/w/Smooth_Red_Sandstone) | `I:smooth_red_sandstone` | hardness=2; present-in-pinned-1.21.4 |
| `I:smooth_red_sandstone` NOT_STARTED | Smooth Red Sandstone | [Smooth Red Sandstone](https://minecraft.wiki/w/Smooth_Red_Sandstone) | `B:595` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:596` NOT_STARTED | Smooth Sandstone · smooth_sandstone | [Smooth Sandstone](https://minecraft.wiki/w/Smooth_Sandstone) | `I:smooth_sandstone` | hardness=2; present-in-pinned-1.21.4 |
| `I:smooth_sandstone` NOT_STARTED | Smooth Sandstone | [Smooth Sandstone](https://minecraft.wiki/w/Smooth_Sandstone) | `B:596` | hardness=2; type=block; present-in-pinned-1.21.4 |
| `B:152` NOT_STARTED | Smooth Stone · smooth_stone | [Smooth Stone](https://minecraft.wiki/w/Smooth_Stone) | No paired form declared | hardness=2; drop=152; present-in-pinned-1.21.4 |
| `B:127` NOT_STARTED | Soul Soil · soul_soil | [Soul Soil](https://minecraft.wiki/w/Soul_Soil) | No paired form declared | hardness=0.5; drop=127; present-in-pinned-1.21.4 |
| `B:38` NOT_STARTED | Sponge · sponge | [Sponge](https://minecraft.wiki/w/Sponge) | No paired form declared | hardness=0.6; present-in-pinned-1.21.4 |
| `B:3` NOT_STARTED | Stone · stone | [Stone](https://minecraft.wiki/w/Stone) | No paired form declared | hardness=1.5; drop=4; present-in-pinned-1.21.4 |
| `B:34` NOT_STARTED | Stone Bricks · stone_bricks | [Stone Bricks](https://minecraft.wiki/w/Stone_Bricks) | No paired form declared | hardness=1.5; drop=34; present-in-pinned-1.21.4 |
| `B:139` NOT_STARTED | Sulfur Block · sulfur_block | [Sulfur Block](https://minecraft.wiki/w/Sulfur_Block) | No paired form declared | hardness=1.5; drop=139; later-version-or-custom-review-required |
| `B:113` NOT_STARTED | Terracotta · terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=113; present-in-pinned-1.21.4 |
| `B:1082` NOT_STARTED | Trial Spawner · trial_spawner | [Trial Spawner](https://minecraft.wiki/w/Trial_Spawner) | No paired form declared | hardness=50; drop=1082; present-in-pinned-1.21.4 |
| `B:141` NOT_STARTED | Tuff · tuff | [Tuff](https://minecraft.wiki/w/Tuff) | No paired form declared | hardness=1.5; drop=141; present-in-pinned-1.21.4 |
| `B:760` NOT_STARTED | Tuff Bricks · tuff_bricks | [Tuff Bricks](https://minecraft.wiki/w/Tuff_Bricks) | `I:tuff_bricks` | hardness=1.5; present-in-pinned-1.21.4 |
| `I:tuff_bricks` NOT_STARTED | Tuff Bricks | [Tuff Bricks](https://minecraft.wiki/w/Tuff_Bricks) | `B:760` | hardness=1.5; type=block; present-in-pinned-1.21.4 |
| `B:1083` NOT_STARTED | Vault · vault | [Vault](https://minecraft.wiki/w/Vault) | No paired form declared | light=6; hardness=50; drop=1083; present-in-pinned-1.21.4 |
| `B:124` NOT_STARTED | Warped Nylium · warped_nylium | [Warped Nylium](https://minecraft.wiki/w/Warped_Nylium) | No paired form declared | hardness=0.4; drop=40; present-in-pinned-1.21.4 |
| `B:126` NOT_STARTED | Warped Wart Block · warped_wart_block | [Warped Wart Block](https://minecraft.wiki/w/Warped_Wart_Block) | No paired form declared | hardness=1; drop=126; present-in-pinned-1.21.4 |
| `B:39` NOT_STARTED | Wet Sponge · wet_sponge | [Wet Sponge](https://minecraft.wiki/w/Wet_Sponge) | No paired form declared | hardness=0.6; present-in-pinned-1.21.4 |

## A144 — Stone, dirt and ordinary full building blocks 14

Rows: 8. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.
- Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.
- Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.

**Required Inspector showcase:**

- Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.

Existing test files to inspect (coverage unverified): [tests/blockDropParity.test.js](../../tests/blockDropParity.test.js), [tests/blockRegistryIntegrity.test.js](../../tests/blockRegistryIntegrity.test.js), [tests/terrainStability.test.js](../../tests/terrainStability.test.js), [tests/mesherFaceTextures.test.js](../../tests/mesherFaceTextures.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `B:356` NOT_STARTED | White Concrete · white_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:white_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:white_concrete` NOT_STARTED | White Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:356` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1013` NOT_STARTED | White Glazed Terracotta · white_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1013; present-in-pinned-1.21.4 |
| `B:117` NOT_STARTED | White Terracotta · white_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=117; present-in-pinned-1.21.4 |
| `B:358` NOT_STARTED | Yellow Concrete · yellow_concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `I:yellow_concrete` | hardness=1.8; present-in-pinned-1.21.4 |
| `I:yellow_concrete` NOT_STARTED | Yellow Concrete | [Concrete](https://minecraft.wiki/w/Concrete) | `B:358` | hardness=1.8; type=block; present-in-pinned-1.21.4 |
| `B:1017` NOT_STARTED | Yellow Glazed Terracotta · yellow_glazed_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.4; drop=1017; present-in-pinned-1.21.4 |
| `B:116` NOT_STARTED | Yellow Terracotta · yellow_terracotta | [Terracotta](https://minecraft.wiki/w/Terracotta) | No paired form declared | hardness=1.25; drop=116; present-in-pinned-1.21.4 |

## A145 — Ingredients, loot and remaining special items 1

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct distinct icon, transparent held/drop form, tint/metadata and stack limit; no fallback stick/black box.
- Every source and declared recipe/smelting/trade/barter/interaction use; custom use actions, enchantment/repair eligibility and survival obtainability.
- Read each individual article and add unique actions before closing; absence of an obvious handler is a gap, not proof of inertness.

**Required Inspector showcase:**

- Obtain → equip/drop/pickup → execute every source/use → invalid recipe/target → count/metadata and save/reload.

Existing test files to inspect (coverage unverified): [tests/resourceInspector.test.js](../../tests/resourceInspector.test.js), [tests/itemDefinitions.test.js](../../tests/itemDefinitions.test.js), [tests/interactionSources.test.js](../../tests/interactionSources.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:amethyst_shard` NOT_STARTED | Amethyst Shard | [Amethyst Shard](https://minecraft.wiki/w/Amethyst_Shard) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:angler_pottery_sherd` NOT_STARTED | Angler Pottery Sherd | [Angler Pottery Sherd](https://minecraft.wiki/w/Angler_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:archer_pottery_sherd` NOT_STARTED | Archer Pottery Sherd | [Archer Pottery Sherd](https://minecraft.wiki/w/Archer_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:armadillo_scute` NOT_STARTED | Armadillo Scute | [Armadillo Scute](https://minecraft.wiki/w/Armadillo_Scute) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:arms_up_pottery_sherd` NOT_STARTED | Arms Up Pottery Sherd | [Arms Up Pottery Sherd](https://minecraft.wiki/w/Arms_Up_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:blade_pottery_sherd` NOT_STARTED | Blade Pottery Sherd | [Blade Pottery Sherd](https://minecraft.wiki/w/Blade_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:blaze_powder` NOT_STARTED | Blaze Powder | [Blaze Powder](https://minecraft.wiki/w/Blaze_Powder) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:blaze_rod` NOT_STARTED | Blaze Rod | [Blaze Rod](https://minecraft.wiki/w/Blaze_Rod) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:bone` NOT_STARTED | Bone | [Bone](https://minecraft.wiki/w/Bone) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:bone_meal` NOT_STARTED | Bone Meal | [Bone Meal](https://minecraft.wiki/w/Bone_Meal) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:experience_bottle` NOT_STARTED | Bottle o' Enchanting | [Bottle o' Enchanting](https://minecraft.wiki/w/Bottle_o'_Enchanting) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `I:breeze_rod` NOT_STARTED | Breeze Rod | [Breeze Rod](https://minecraft.wiki/w/Breeze_Rod) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:brewer_pottery_sherd` NOT_STARTED | Brewer Pottery Sherd | [Brewer Pottery Sherd](https://minecraft.wiki/w/Brewer_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:brick` NOT_STARTED | Brick | [Brick](https://minecraft.wiki/w/Brick) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:burn_pottery_sherd` NOT_STARTED | Burn Pottery Sherd | [Burn Pottery Sherd](https://minecraft.wiki/w/Burn_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:charcoal` NOT_STARTED | Charcoal | [Charcoal](https://minecraft.wiki/w/Charcoal) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:clay_ball` NOT_STARTED | Clay Ball | [Clay Ball](https://minecraft.wiki/w/Clay_Ball) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:coal` NOT_STARTED | Coal | [Coal](https://minecraft.wiki/w/Coal) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:danger_pottery_sherd` NOT_STARTED | Danger Pottery Sherd | [Danger Pottery Sherd](https://minecraft.wiki/w/Danger_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:diamond` NOT_STARTED | Diamond | [Diamond](https://minecraft.wiki/w/Diamond) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A146 — Ingredients, loot and remaining special items 2

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct distinct icon, transparent held/drop form, tint/metadata and stack limit; no fallback stick/black box.
- Every source and declared recipe/smelting/trade/barter/interaction use; custom use actions, enchantment/repair eligibility and survival obtainability.
- Read each individual article and add unique actions before closing; absence of an obvious handler is a gap, not proof of inertness.

**Required Inspector showcase:**

- Obtain → equip/drop/pickup → execute every source/use → invalid recipe/target → count/metadata and save/reload.

Existing test files to inspect (coverage unverified): [tests/resourceInspector.test.js](../../tests/resourceInspector.test.js), [tests/itemDefinitions.test.js](../../tests/itemDefinitions.test.js), [tests/interactionSources.test.js](../../tests/interactionSources.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:disc_fragment_5` NOT_STARTED | Disc Fragment | [Disc Fragment](https://minecraft.wiki/w/Disc_Fragment) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:dragon_breath` NOT_STARTED | Dragon's Breath | [Dragon's Breath](https://minecraft.wiki/w/Dragon's_Breath) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:echo_shard` NOT_STARTED | Echo Shard | [Echo Shard](https://minecraft.wiki/w/Echo_Shard) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:emerald` NOT_STARTED | Emerald | [Emerald](https://minecraft.wiki/w/Emerald) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:end_crystal` NOT_STARTED | End Crystal | [End Crystal](https://minecraft.wiki/w/End_Crystal) | No paired form declared | type=utility; present-in-pinned-1.21.4 |
| `I:explorer_pottery_sherd` NOT_STARTED | Explorer Pottery Sherd | [Explorer Pottery Sherd](https://minecraft.wiki/w/Explorer_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:ender_eye` NOT_STARTED | Eye of Ender | [Eye of Ender](https://minecraft.wiki/w/Eye_of_Ender) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:feather` NOT_STARTED | Feather | [Feather](https://minecraft.wiki/w/Feather) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:fermented_spider_eye` NOT_STARTED | Fermented Spider Eye | [Fermented Spider Eye](https://minecraft.wiki/w/Fermented_Spider_Eye) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:flint` NOT_STARTED | Flint | [Flint](https://minecraft.wiki/w/Flint) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:flow_pottery_sherd` NOT_STARTED | Flow Pottery Sherd | [Flow Pottery Sherd](https://minecraft.wiki/w/Flow_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:friend_pottery_sherd` NOT_STARTED | Friend Pottery Sherd | [Friend Pottery Sherd](https://minecraft.wiki/w/Friend_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:ghast_tear` NOT_STARTED | Ghast Tear | [Ghast Tear](https://minecraft.wiki/w/Ghast_Tear) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:glow_ink_sac` NOT_STARTED | Glow Ink Sac | [Glow Ink Sac](https://minecraft.wiki/w/Glow_Ink_Sac) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:gold_ingot` NOT_STARTED | Gold Ingot | [Gold Ingot](https://minecraft.wiki/w/Gold_Ingot) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:gold_nugget` NOT_STARTED | Gold Nugget | [Gold Nugget](https://minecraft.wiki/w/Gold_Nugget) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:gunpowder` NOT_STARTED | Gunpowder | [Gunpowder](https://minecraft.wiki/w/Gunpowder) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:guster_pottery_sherd` NOT_STARTED | Guster Pottery Sherd | [Guster Pottery Sherd](https://minecraft.wiki/w/Guster_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:harness` NOT_STARTED | Harness | [Harness](https://minecraft.wiki/w/Harness) | No paired form declared | type=item; later-version-or-custom-review-required |
| `I:heart_of_the_sea` NOT_STARTED | Heart of the Sea | [Heart of the Sea](https://minecraft.wiki/w/Heart_of_the_Sea) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A147 — Ingredients, loot and remaining special items 3

Rows: 20. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct distinct icon, transparent held/drop form, tint/metadata and stack limit; no fallback stick/black box.
- Every source and declared recipe/smelting/trade/barter/interaction use; custom use actions, enchantment/repair eligibility and survival obtainability.
- Read each individual article and add unique actions before closing; absence of an obvious handler is a gap, not proof of inertness.

**Required Inspector showcase:**

- Obtain → equip/drop/pickup → execute every source/use → invalid recipe/target → count/metadata and save/reload.

Existing test files to inspect (coverage unverified): [tests/resourceInspector.test.js](../../tests/resourceInspector.test.js), [tests/itemDefinitions.test.js](../../tests/itemDefinitions.test.js), [tests/interactionSources.test.js](../../tests/interactionSources.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:heart_pottery_sherd` NOT_STARTED | Heart Pottery Sherd | [Heart Pottery Sherd](https://minecraft.wiki/w/Heart_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:heartbreak_pottery_sherd` NOT_STARTED | Heartbreak Pottery Sherd | [Heartbreak Pottery Sherd](https://minecraft.wiki/w/Heartbreak_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:honeycomb` NOT_STARTED | Honeycomb | [Honeycomb](https://minecraft.wiki/w/Honeycomb) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:howl_pottery_sherd` NOT_STARTED | Howl Pottery Sherd | [Howl Pottery Sherd](https://minecraft.wiki/w/Howl_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:ink_sac` NOT_STARTED | Ink Sac | [Ink Sac](https://minecraft.wiki/w/Ink_Sac) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:iron_ingot` NOT_STARTED | Iron Ingot | [Iron Ingot](https://minecraft.wiki/w/Iron_Ingot) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:iron_nugget` NOT_STARTED | Iron Nugget | [Iron Nugget](https://minecraft.wiki/w/Iron_Nugget) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:lapis_lazuli` NOT_STARTED | Lapis Lazuli | [Lapis Lazuli](https://minecraft.wiki/w/Lapis_Lazuli) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:leather` NOT_STARTED | Leather | [Leather](https://minecraft.wiki/w/Leather) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:magma_cream` NOT_STARTED | Magma Cream | [Magma Cream](https://minecraft.wiki/w/Magma_Cream) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:miner_pottery_sherd` NOT_STARTED | Miner Pottery Sherd | [Miner Pottery Sherd](https://minecraft.wiki/w/Miner_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:mourner_pottery_sherd` NOT_STARTED | Mourner Pottery Sherd | [Mourner Pottery Sherd](https://minecraft.wiki/w/Mourner_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:nautilus_shell` NOT_STARTED | Nautilus Shell | [Nautilus Shell](https://minecraft.wiki/w/Nautilus_Shell) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:nether_brick` NOT_STARTED | Nether Brick | [Nether Brick](https://minecraft.wiki/w/Nether_Brick) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:quartz` NOT_STARTED | Nether Quartz | [Nether Quartz](https://minecraft.wiki/w/Nether_Quartz) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:nether_star` NOT_STARTED | Nether Star | [Nether Star](https://minecraft.wiki/w/Nether_Star) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:netherite_ingot` NOT_STARTED | Netherite Ingot | [Netherite Ingot](https://minecraft.wiki/w/Netherite_Ingot) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:ominous_trial_key` NOT_STARTED | Ominous Trial Key | [Ominous Trial Key](https://minecraft.wiki/w/Ominous_Trial_Key) | No paired form declared | stackSize=64; type=utility; present-in-pinned-1.21.4 |
| `I:paper` NOT_STARTED | Paper | [Paper](https://minecraft.wiki/w/Paper) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:phantom_membrane` NOT_STARTED | Phantom Membrane | [Phantom Membrane](https://minecraft.wiki/w/Phantom_Membrane) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## A148 — Ingredients, loot and remaining special items 4

Rows: 19. Status: see manifest/tracker.

**Parity audit requirements (in addition to universal gates):**

- Correct distinct icon, transparent held/drop form, tint/metadata and stack limit; no fallback stick/black box.
- Every source and declared recipe/smelting/trade/barter/interaction use; custom use actions, enchantment/repair eligibility and survival obtainability.
- Read each individual article and add unique actions before closing; absence of an obvious handler is a gap, not proof of inertness.

**Required Inspector showcase:**

- Obtain → equip/drop/pickup → execute every source/use → invalid recipe/target → count/metadata and save/reload.

Existing test files to inspect (coverage unverified): [tests/resourceInspector.test.js](../../tests/resourceInspector.test.js), [tests/itemDefinitions.test.js](../../tests/itemDefinitions.test.js), [tests/interactionSources.test.js](../../tests/interactionSources.test.js), [tests/itemStackSizes.test.js](../../tests/itemStackSizes.test.js)

| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |
| --- | --- | --- | --- | --- |
| `I:pitcher_pod` NOT_STARTED | Pitcher Pod | [Pitcher Pod](https://minecraft.wiki/w/Pitcher_Pod) | No paired form declared | type=seed; present-in-pinned-1.21.4 |
| `I:plenty_pottery_sherd` NOT_STARTED | Plenty Pottery Sherd | [Plenty Pottery Sherd](https://minecraft.wiki/w/Plenty_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:popped_chorus_fruit` NOT_STARTED | Popped Chorus Fruit | [Popped Chorus Fruit](https://minecraft.wiki/w/Popped_Chorus_Fruit) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:prismarine_crystals` NOT_STARTED | Prismarine Crystals | [Prismarine Crystals](https://minecraft.wiki/w/Prismarine_Crystals) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:prismarine_shard` NOT_STARTED | Prismarine Shard | [Prismarine Shard](https://minecraft.wiki/w/Prismarine_Shard) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:prize_pottery_sherd` NOT_STARTED | Prize Pottery Sherd | [Prize Pottery Sherd](https://minecraft.wiki/w/Prize_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:resin_brick` NOT_STARTED | Resin Brick | [Resin Brick](https://minecraft.wiki/w/Resin_Brick) | No paired form declared | stackSize=64; type=material; present-in-pinned-1.21.4 |
| `I:scrape_pottery_sherd` NOT_STARTED | Scrape Pottery Sherd | [Scrape Pottery Sherd](https://minecraft.wiki/w/Scrape_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:sheaf_pottery_sherd` NOT_STARTED | Sheaf Pottery Sherd | [Sheaf Pottery Sherd](https://minecraft.wiki/w/Sheaf_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:shelter_pottery_sherd` NOT_STARTED | Shelter Pottery Sherd | [Shelter Pottery Sherd](https://minecraft.wiki/w/Shelter_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:shulker_shell` NOT_STARTED | Shulker Shell | [Shulker Shell](https://minecraft.wiki/w/Shulker_Shell) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:slime_ball` NOT_STARTED | Slimeball | [Slimeball](https://minecraft.wiki/w/Slimeball) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:snort_pottery_sherd` NOT_STARTED | Snort Pottery Sherd | [Snort Pottery Sherd](https://minecraft.wiki/w/Snort_Pottery_Sherd) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:stick` NOT_STARTED | Stick | [Stick](https://minecraft.wiki/w/Stick) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:string` NOT_STARTED | String | [String](https://minecraft.wiki/w/String) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:sugar` NOT_STARTED | Sugar | [Sugar](https://minecraft.wiki/w/Sugar) | No paired form declared | type=material; present-in-pinned-1.21.4 |
| `I:totem_of_undying` NOT_STARTED | Totem of Undying | [Totem of Undying](https://minecraft.wiki/w/Totem_of_Undying) | No paired form declared | stackSize=1; type=special; present-in-pinned-1.21.4 |
| `I:trial_key` NOT_STARTED | Trial Key | [Trial Key](https://minecraft.wiki/w/Trial_Key) | No paired form declared | stackSize=64; type=utility; present-in-pinned-1.21.4 |
| `I:turtle_scute` NOT_STARTED | Turtle Scute | [Turtle Scute](https://minecraft.wiki/w/Turtle_Scute) | No paired form declared | type=material; present-in-pinned-1.21.4 |

## Original mod content appendix

These declared items/blocks have no vanilla Wiki counterpart. Audit their mod specification and the same visual, lifecycle, test and showcase gates; do not fabricate a Minecraft Wiki page or count custom rules as a vanilla parity failure.

| Key | Name | Specification | Status |
| --- | --- | --- | --- |
| `rescue_adventure:inferno_sword` | Inferno Sword | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:stormfire_sword` | Stormfire Sword | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:cataclysm_sword` | Cataclysm Sword | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:woodland_armor` | Woodland Armor | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:redstone_armor` | Redstone Armor | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:wraith_armor` | Wraith Armor | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:frost_armor` | Frost Armor | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
| `rescue_adventure:obsidian_armor` | Obsidian Armor | [src/mods/rescue-adventure/mod.json](../../src/mods/rescue-adventure/mod.json) | NOT_STARTED |
