import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
// Vanilla recipes transcribed from minecraft-data. Generated, and merged at the END of RECIPES_3X3
// below so that a hand-written recipe always wins a tie -- several hand-written redstone recipes
// deliberately differ from vanilla, and silently losing them to a generated duplicate would be a
// regression that no coverage number would show.
import { EXTRA_RECIPES } from './extraRecipes.js';
import { applyWikiRecipeFixes, redyeResult } from './wikiRecipeFixes.js';

export const RECIPES_2X2 = [
  { pattern: [['iron_ingot']], result: { id: 'iron_nugget', isBlock: false, count: 9 } },
  { pattern: [['nether_brick', 'nether_brick'], ['nether_brick', 'nether_brick']], result: { id: BLOCKS.NETHER_BRICKS, isBlock: true, count: 1 } },
  // 1 Log -> 4 Planks
  {
    pattern: [[BLOCKS.OAK_LOG]],
    result: { id: BLOCKS.OAK_PLANKS, isBlock: true, count: 4 }
  },
  // 4 Planks -> 1 Crafting Table
  {
    pattern: [
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS],
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS]
    ],
    result: { id: BLOCKS.CRAFTING_TABLE, isBlock: true, count: 1 }
  },
  // A 2x2 of planks used to be listed here as "4 Planks -> 4 Planks". That is not a vanilla recipe -- it
  // consumes four planks to produce the same four -- and because `findMatchingRecipe` returns the first
  // match and `RECIPES_3X3` spreads this list near its start, it won every tie against every other recipe
  // that fits a 2x2 block of one ingredient. The only one in the table was the oak trapdoor entry below, so
  // a player who laid out four planks to make trapdoors got their planks back. The vanilla trapdoor is 3x2
  // planks -> 2 trapdoors, and the generated table already carries it correctly.
  // 2 Planks -> 4 Sticks
  {
    pattern: [
      [BLOCKS.OAK_PLANKS],
      [BLOCKS.OAK_PLANKS]
    ],
    result: { id: 'stick', isBlock: false, count: 4 }
  },
  // 1 Coal + 1 Stick -> 4 Torches
  {
    pattern: [
      ['coal'],
      ['stick']
    ],
    result: { id: BLOCKS.TORCH, isBlock: true, count: 4 }
  },
  // 1 Charcoal + 1 Stick -> 4 Torches
  {
    pattern: [
      ['charcoal'],
      ['stick']
    ],
    result: { id: BLOCKS.TORCH, isBlock: true, count: 4 }
  },
  // 1 Bone -> 3 Bone Meal
  {
    pattern: [
      ['bone']
    ],
    result: { id: 'bone_meal', isBlock: false, count: 3 }
  }
];

export const RECIPES_3X3 = [
  { pattern: [['ghast_tear','ghast_tear','ghast_tear'], ['ghast_tear',BLOCKS.SOUL_SAND,'ghast_tear'], ['ghast_tear','ghast_tear','ghast_tear']], result: { id: BLOCKS.DRIED_GHAST, isBlock: true, count: 1 } },
  { pattern: Array.from({length:3}, () => ['iron_nugget','iron_nugget','iron_nugget']), result: { id: 'iron_ingot', isBlock: false, count: 1 } },
  ...RECIPES_2X2,
  // Hay Block -> 9 Wheat. Vanilla has this uncrafting recipe, and the Inspector reported it as the one
  // crafting gap whose ingredients both exist here: `recipe-parity` asked for a recipe for `wheat` and
  // found none. The generator had dropped it because the block was registered twice, as `hay_bale` and as
  // the vanilla `hay_block`, and the recipe names the vanilla spelling. The duplicate is gone; the recipe
  // stays, because it is vanilla's and it is what makes a hay block give wheat back.
  // The hay-block recipe that used to live here was the same one the generator emits, and it keyed its
  // ingredient by the *name* `hay_block` while the game carries a hay block by its block id -- so the matcher
  // compared `'hay_block'` against `578` and found nothing, and a hay block could not be uncrafted. The
  // generated entry keys it correctly; the hand-written twin is gone.
  // 8 Cobblestone -> 1 Furnace
  {
    pattern: [
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE],
      [BLOCKS.COBBLESTONE, null, BLOCKS.COBBLESTONE],
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE]
    ],
    result: { id: BLOCKS.FURNACE, isBlock: true, count: 1 }
  },
  // 8 Planks -> 1 Chest
  {
    pattern: [
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS],
      [BLOCKS.OAK_PLANKS, null, BLOCKS.OAK_PLANKS],
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS]
    ],
    result: { id: BLOCKS.CHEST, isBlock: true, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.BIRCH_PLANKS, BLOCKS.BIRCH_PLANKS, BLOCKS.BIRCH_PLANKS],
      [BLOCKS.BIRCH_PLANKS, null, BLOCKS.BIRCH_PLANKS],
      [BLOCKS.BIRCH_PLANKS, BLOCKS.BIRCH_PLANKS, BLOCKS.BIRCH_PLANKS]
    ],
    result: { id: BLOCKS.CHEST, isBlock: true, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.SPRUCE_PLANKS, BLOCKS.SPRUCE_PLANKS, BLOCKS.SPRUCE_PLANKS],
      [BLOCKS.SPRUCE_PLANKS, null, BLOCKS.SPRUCE_PLANKS],
      [BLOCKS.SPRUCE_PLANKS, BLOCKS.SPRUCE_PLANKS, BLOCKS.SPRUCE_PLANKS]
    ],
    result: { id: BLOCKS.CHEST, isBlock: true, count: 1 }
  },
  // 3 Red Wool + 3 Planks -> Red Bed
  {
    pattern: [
      [BLOCKS.RED_WOOL, BLOCKS.RED_WOOL, BLOCKS.RED_WOOL],
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS]
    ],
    result: { id: 'red_bed', isBlock: false, count: 1 }
  },
  // 3 White Wool + 3 Planks -> White Bed (Vanilla Minecraft 1.12+)
  {
    pattern: [
      [BLOCKS.WHITE_WOOL, BLOCKS.WHITE_WOOL, BLOCKS.WHITE_WOOL],
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS]
    ],
    result: { id: 'white_bed', isBlock: false, count: 1 }
  },
  // 3 Diamond + 2 Stick -> Diamond Pickaxe
  {
    pattern: [
      ['diamond', 'diamond', 'diamond'],
      [null, 'stick', null],
      [null, 'stick', null]
    ],
    result: { id: 'diamond_pickaxe', isBlock: false, count: 1 }
  },
  // 2 Diamond + 1 Stick -> Diamond Sword
  {
    pattern: [
      ['diamond'],
      ['diamond'],
      ['stick']
    ],
    result: { id: 'diamond_sword', isBlock: false, count: 1 }
  },
  // 3 Iron + 2 Stick -> Iron Pickaxe
  {
    pattern: [
      ['iron_ingot', 'iron_ingot', 'iron_ingot'],
      [null, 'stick', null],
      [null, 'stick', null]
    ],
    result: { id: 'iron_pickaxe', isBlock: false, count: 1 }
  },
  // 2 Iron + 1 Stick -> Iron Sword
  {
    pattern: [
      ['iron_ingot'],
      ['iron_ingot'],
      ['stick']
    ],
    result: { id: 'iron_sword', isBlock: false, count: 1 }
  },
  // 3 Stone + 2 Stick -> Stone Pickaxe
  {
    pattern: [
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE],
      [null, 'stick', null],
      [null, 'stick', null]
    ],
    result: { id: 'stone_pickaxe', isBlock: false, count: 1 }
  },
  // 3 Planks + 2 Stick -> Wooden Pickaxe
  {
    pattern: [
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS],
      [null, 'stick', null],
      [null, 'stick', null]
    ],
    result: { id: 'wooden_pickaxe', isBlock: false, count: 1 }
  },
  // 3 Wheat -> 1 Bread
  {
    pattern: [
      ['wheat', 'wheat', 'wheat']
    ],
    result: { id: 'bread', isBlock: false, count: 1 }
  },
  // Hoes (Diamond, Iron, Stone, Wooden, Golden) - Left & Right Facing
  {
    pattern: [
      ['diamond', 'diamond'],
      [null, 'stick'],
      [null, 'stick']
    ],
    result: { id: 'diamond_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      ['diamond', 'diamond'],
      ['stick', null],
      ['stick', null]
    ],
    result: { id: 'diamond_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      ['iron_ingot', 'iron_ingot'],
      [null, 'stick'],
      [null, 'stick']
    ],
    result: { id: 'iron_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      ['iron_ingot', 'iron_ingot'],
      ['stick', null],
      ['stick', null]
    ],
    result: { id: 'iron_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE],
      [null, 'stick'],
      [null, 'stick']
    ],
    result: { id: 'stone_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE],
      ['stick', null],
      ['stick', null]
    ],
    result: { id: 'stone_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS],
      [null, 'stick'],
      [null, 'stick']
    ],
    result: { id: 'wooden_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS],
      ['stick', null],
      ['stick', null]
    ],
    result: { id: 'wooden_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      ['gold_ingot', 'gold_ingot'],
      [null, 'stick'],
      [null, 'stick']
    ],
    result: { id: 'golden_hoe', isBlock: false, count: 1 }
  },
  {
    pattern: [
      ['gold_ingot', 'gold_ingot'],
      ['stick', null],
      ['stick', null]
    ],
    result: { id: 'golden_hoe', isBlock: false, count: 1 }
  },
  // 5 Coal + 4 Sand -> TNT
  {
    pattern: [
      ['coal', BLOCKS.SAND, 'coal'],
      [BLOCKS.SAND, 'coal', BLOCKS.SAND],
      ['coal', BLOCKS.SAND, 'coal']
    ],
    result: { id: BLOCKS.TNT, isBlock: true, count: 1 }
  }
];

export {
  PROFESSIONS,
  WORKSTATION_TO_PROFESSION,
  VILLAGER_LEVELS,
  PROFESSION_TRADES,
  initVillagerEconomy,
  unlockTradesForLevel,
  calculateTradeCost,
  executeTrade,
  restockVillager,
  updateVillagerWorkstation,
  startZombieVillagerCure,
  updateZombieVillagerCuring
} from './villagerEconomy.js';

import { PROFESSION_TRADES } from './villagerEconomy.js';

export const VILLAGER_TRADES = PROFESSION_TRADES.farmer.slice(0, 5);

/**
 * The two key spaces a crafting comparison uses, and why they must stay apart.
 *
 * A block's id and an item's id live in the same number space, and in one case they genuinely collide: the
 * number **171** is both the `wheat` ITEM and the fully-grown Wheat Crops BLOCK. Comparing the raw number
 * therefore made nine crop blocks craft a hay block, which is what `tests/recipeIngredients.test.js` asserts
 * against. So there are two tagged key spaces, and a caller's `isBlock` flag is what chooses between them:
 *
 *   - **item space** -- `item:<name>` for something held as an item, whether the caller passed the item name
 *     or the item's numeric id.
 *   - **block space** -- `<block_key>` for something placed as a block, whether the caller passed the block
 *     constant (BLOCKS.OAK_PLANKS is the number 10) or its name.
 *
 * They cannot collide, because the item space is always prefixed. Both sides of a match then meet in one
 * language: nine wheat ITEMS are nine `item:wheat` and match the hay recipe, and nine Wheat Crops BLOCKS are
 * nine `wheat_crops` and match nothing.
 *
 * A recipe writes its ingredient as a name (usually) or as a block constant (when it means a block), so a
 * recipe number is read as a block and a recipe string through the same resolver a cell uses.
 */
function canonicalSlotValue(id, isBlock) {
  if (typeof id === 'number') return isBlock ? (blockKeyFor(id) ?? id) : itemKeyFor(id);
  const item = ITEMS[id];
  if (item) {
    // A string naming an item is that item. The previous version fell through to a
    // `BLOCKS[name.toUpperCase()]` lookup whenever the item carried no `blockId`, and `BLOCKS['WHEAT']` is
    // 171 -- so the plain string `'wheat'` was silently turned into the crop block: the same defect from
    // the other direction.
    if (typeof item.blockId === 'number') return blockKeyFor(item.blockId) ?? item.blockId;
    return itemKeyFor(id);
  }
  if (typeof BLOCKS[id.toUpperCase()] === 'number') return blockKeyFor(BLOCKS[id.toUpperCase()]) ?? BLOCKS[id.toUpperCase()];
  return isBlock ? `block:${id}` : `item:${id}`;
}

/** `item:<name>` for an item given by name or by its numeric id. */
let ID_TO_ITEM_NAME = null;
function itemKeyFor(value) {
  if (typeof value === 'string') return `item:${value}`;
  if (ID_TO_ITEM_NAME === null) {
    ID_TO_ITEM_NAME = new Map();
    for (const name of Object.keys(ITEMS)) {
      const def = ITEMS[name];
      if (def && typeof def.blockId === 'number') continue; // carried as a block, so not an item id
      if (typeof def?.id === 'number' && !ID_TO_ITEM_NAME.has(def.id)) ID_TO_ITEM_NAME.set(def.id, name);
    }
  }
  return ID_TO_ITEM_NAME.has(value) ? `item:${ID_TO_ITEM_NAME.get(value)}` : `item:${value}`;
}

/** A block id's catalogue key, so a grid and a recipe can be written the same way. Built once. */
let ID_TO_BLOCK_KEY = null;
function blockKeyFor(blockId) {
  if (ID_TO_BLOCK_KEY === null) {
    ID_TO_BLOCK_KEY = new Map();
    for (const key of Object.keys(BLOCKS).sort()) {
      const value = BLOCKS[key];
      if (typeof value !== 'number') continue;
      const name = BLOCK_DEFS[value]?.name;
      if (!name) continue;
      // Normalised the same way `blockHarvestData` normalises a block's name, so one block has one key
      // everywhere: "Oak Planks" and `'oak_planks'` are the same thing.
      const normalised = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!ID_TO_BLOCK_KEY.has(value)) ID_TO_BLOCK_KEY.set(value, normalised);
    }
  }
  return ID_TO_BLOCK_KEY.get(blockId);
}
/**
 * The value `gridMultiset` reports for a cell: the block id for a block carried by id, otherwise the caller's
 * own value. This is the PUBLIC shape of the multiset, used by tests and by the bot, so it stays in the
 * caller's terms rather than in the tagged comparison space below.
 */
function slotValue(cell) {
  if (!cell || !(cell.count > 0)) return null;
  const def = typeof cell.id === 'string' ? ITEMS[cell.id] : undefined;
  if (def && typeof def.blockId === 'number') return def.blockId;
  return cell.id;
}

/** The tagged comparison key for a grid cell. */
function matchValue(cell) {
  if (!cell || !(cell.count > 0)) return null;
  return canonicalSlotValue(cell.id, cellHoldsBlock(cell));
}

/**
 * Does this cell hold a BLOCK rather than an item?
 *
 * An explicit `isBlock` decides when it is present, and that is the only way to be *sure*: the number 171 is
 * both the `wheat` item and the Wheat Crops block, and no amount of inspection can tell those apart.
 *
 * When the flag is absent the id decides, in this order:
 *
 *   1. a **number** that is a registered block is a block. This is what the real inventory does -- a stack's
 *      `isBlock` is set for block items -- and a caller that passes a numeric block id without the flag means
 *      the block. Treating it as an item made every recipe unreachable for such a caller.
 *   2. a **string** naming an `ITEMS` entry is that item (this is what keeps `'wheat'` from becoming the crop
 *      through `BLOCKS['WHEAT']`, which is 171).
 *   3. otherwise the `BLOCKS` lookup decides, which is what lets a recipe or grid write `'torch'` and mean the
 *      block.
 */
function cellHoldsBlock(cell) {
  if (cell.isBlock !== undefined) return Boolean(cell.isBlock);
  if (typeof cell.id === 'number') return Boolean(BLOCK_DEFS[cell.id]);
  if (ITEMS[cell.id]) return false;
  return typeof BLOCKS[String(cell.id).toUpperCase()] === 'number';
}

/** The tagged comparison key for a recipe's own ingredient. */
function ingredientValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return canonicalSlotValue(value, true);
  return canonicalSlotValue(value, false);
}

/** The grid as tagged comparison keys in sort order, for the shapeless match. */
function matchMultiset(grid, width, height) {
  const values = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = matchValue(grid[r * width + c]);
      if (v !== null) values.push(v);
    }
  }
  return values.sort();
}

/**
 * Collect the grid's contents as a sorted multiset of slot values, ignoring layout.
 *
 * Duplicates are preserved, because a shapeless recipe can legitimately require the same item more
 * than once -- nine coal for a block, four planks for a crafting table -- and collapsing them would
 * let a grid with one coal and eight of something else match.
 */
export function gridMultiset(grid, width, height) {
  const values = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = slotValue(grid[r * width + c]);
      if (v !== null) values.push(v);
    }
  }
  return values.sort();
}

// A shapeless recipe's ingredients as sorted comparison keys, kept per ingredient list (the list object is the
// key, so a recipe given a new list is worked out again). The keys rest on the same id tables the matcher
// already builds once (blockKeyFor, itemKeyFor).
const SORTED_INGREDIENTS = new WeakMap();
function sortedIngredients(ingredients) {
  let sorted = SORTED_INGREDIENTS.get(ingredients);
  if (sorted === undefined || sorted.length !== ingredients.length) {
    sorted = ingredients.map(ingredientValue).sort();
    SORTED_INGREDIENTS.set(ingredients, sorted);
  }
  return sorted;
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Helper to check 2D grid matching against a recipe
//
// Two recipe shapes are supported:
//   { pattern: [[...]], result }                     shaped, matched by layout
//   { shapeless: true, ingredients: [...], result }  shapeless, matched as a multiset
//
// Shapeless recipes cannot be expressed as a shaped pattern without changing what they accept. Vanilla
// has 59 of them that no 1x1 or square pattern can represent, so a shape-only matcher silently drops
// them; treating one as a square would make it match arrangements it should not.
export function findMatchingRecipe(grid, width, height, recipesList) {
  // Trim bounding box of grid
  let minR = height, maxR = -1, minC = width, maxC = -1;
  let hasItem = false;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const item = grid[r * width + c];
      if (item && item.count > 0) {
        hasItem = true;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  if (!hasItem) return null;

  const shapeH = maxR - minR + 1;
  const shapeW = maxC - minC + 1;

  // Computed once, and only if a shapeless recipe is actually reached, so the shaped path -- which is
  // the overwhelmingly common case -- is not slowed down.
  let multiset = null;
  // The trimmed grid's comparison keys, worked out once. They were recomputed for every cell of every
  // same-sized recipe (two thousand recipes), and building those keys was most of a lookup's cost.
  const actual = new Array(shapeH * shapeW);
  for (let r = 0; r < shapeH; r++) for (let c = 0; c < shapeW; c++) actual[r * shapeW + c] = matchValue(grid[(minR + r) * width + (minC + c)]);

  for (const recipe of recipesList) {
    if (recipe.shapeless) {
      const ingredients = recipe.ingredients;
      if (!ingredients || ingredients.length === 0) continue;
      // A shapeless recipe cannot need more items than the grid holds.
      const cells = width * height;
      if (ingredients.length > cells) continue;
      // The TAGGED keys, not the public multiset: the tagged space is what keeps an item id apart from a
      // block id that happens to share the number.
      if (multiset === null) multiset = matchMultiset(grid, width, height);
      // A different item count cannot match; checked before normalising and sorting the recipe's list, which
      // was most of the cost of a lookup (every shapeless recipe was mapped and sorted on every grid change).
      if (ingredients.length !== multiset.length) continue;
      // The same normaliser the grid went through, so both sides speak one language.
      if (sameMultiset(multiset, sortedIngredients(ingredients))) return recipe.result;
      continue;
    }

    const pat = recipe.pattern;
    if (!pat || !pat.length) continue;
    const patH = pat.length;
    const patW = pat[0].length;

    if (patH !== shapeH || patW !== shapeW) continue;

    // Shaped recipes are matched in either orientation. The wiki: shaped recipes "can be made using the top,
    // middle, or bottom row", and "can also be flipped horizontally, but not vertically." The trim above
    // gives the first half of that; this gives the second. Without it the bow -- whose recipe is
    // [null, stick, string] / [stick, null, string] / [null, stick, string] -- could not be made with the
    // strings on the left, and 110 of the 1,230 multi-column shaped recipes were in the same position.
    for (const mirrored of patW > 1 ? [false, true] : [false]) {
      let match = true;
      for (let pr = 0; pr < patH && match; pr++) {
        for (let pc = 0; pc < patW; pc++) {
          const expected = pat[pr][mirrored ? patW - 1 - pc : pc];
          const actualId = actual[pr * shapeW + pc];

          if (expected === null && actualId !== null) { match = false; break; }
          if (expected !== null) {
            const expNorm = ingredientValue(expected);
            if (actualId !== expNorm) { match = false; break; }
          }
        }
      }
      if (match) return recipe.result;
    }
  }

  // Re-dyeing a wool, carpet or bed: one item of any colour and one dye (wikiRecipeFixes.js).
  return redyeResult(grid);
}

// Core redstone recipes. Numeric entries are blocks; strings are inventory items.
//
// The pressure plate was `[[BLOCKS.STONE, BLOCKS.STONE]] -> BLOCKS.PRESSURE_PLATE`, and `PRESSURE_PLATE` (69)
// is a different block from `STONE_PRESSURE_PLATE` (446). Because `findMatchingRecipe` returns the FIRST
// match and this list is spread near the start of `RECIPES_3X3`, two stone in a row produced the wrong block
// and the correct stone pressure plate -- which the generated table already carries, with the same pattern
// -- could never be crafted at all. The entry is gone and the generated one is what answers.
RECIPES_2X2.push({pattern:[['stick'],[BLOCKS.COBBLESTONE]],result:{id:BLOCKS.LEVER,isBlock:true,count:1}},{pattern:[['redstone'],['stick']],result:{id:BLOCKS.REDSTONE_TORCH,isBlock:true,count:1}},{pattern:[[BLOCKS.STONE]],result:{id:BLOCKS.STONE_BUTTON,isBlock:true,count:1}});
RECIPES_3X3.push(...RECIPES_2X2.slice(-4),{pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.COBBLESTONE,'iron_ingot',BLOCKS.COBBLESTONE],[BLOCKS.COBBLESTONE,'redstone',BLOCKS.COBBLESTONE]],result:{id:BLOCKS.PISTON,isBlock:true,count:1}},{pattern:[['slime_ball'],[BLOCKS.PISTON]],result:{id:BLOCKS.STICKY_PISTON,isBlock:true,count:1}},{pattern:[[BLOCKS.REDSTONE_TORCH,'redstone',BLOCKS.REDSTONE_TORCH],[BLOCKS.STONE,BLOCKS.STONE,BLOCKS.STONE]],result:{id:BLOCKS.REPEATER,isBlock:true,count:1}},{pattern:[['redstone','redstone','redstone'],['redstone','redstone','redstone'],['redstone','redstone','redstone']],result:{id:BLOCKS.REDSTONE_BLOCK,isBlock:true,count:1}});

// Dyeing a bundle, vanilla's sixteen recipes. The plain bundle itself is in the generated table -- it is
// one string and one leather, straight out of the pinned data -- but the *coloured* bundles have no entry
// there, so without these sixteen the dyed ones would exist and be unobtainable. Shapeless, any dye, one
// result, exactly as vanilla has it.
const BUNDLE_DYES = {
  white: 'white_dye', orange: 'orange_dye', magenta: 'magenta_dye', light_blue: 'light_blue_dye',
  yellow: 'yellow_dye',
  lime: 'lime_dye', pink: 'pink_dye', gray: 'gray_dye', light_gray: 'light_gray_dye',
  cyan: 'cyan_dye', purple: 'purple_dye', blue: 'blue_dye', brown: 'brown_dye',
  green: 'green_dye', red: 'red_dye', black: 'black_dye',
};
RECIPES_2X2.push(
  ...Object.entries(BUNDLE_DYES).map(([colour, dye]) => ({
    shapeless: true,
    ingredients: ['bundle', dye],
    result: { id: `${colour}_bundle`, isBlock: false, count: 1 },
  })),
);

// Rails, minecarts and boats. Rails are iron on sticks; a cart is iron in a U; a
// boat is planks in a shallow V. Powered rail adds redstone, as it does in
// Minecraft, so a station can be built from scratch.
RECIPES_3X3.push(
  // A second, unreachable "minecart" entry used to sit here:
  //   [['iron_ingot', null, null], ['iron_ingot', 'stick', null], ['iron_ingot', null, null]]
  // The `null` at row 1 column 2 makes the shape asymmetric by one cell, and the grid matcher trims to the
  // bounding box -- so this keyed a 3x3 shape whose grid could never be laid out. The vanilla recipe is
  // `[[iron_ingot, null, iron_ingot], [iron_ingot, iron_ingot, iron_ingot]]`, which the generated table
  // already carries correctly. Nothing used the dead one, and a recipe that can never match is a claim that
  // a player can craft something they cannot.
  {pattern:[[BLOCKS.CHEST],['minecart']],result:{id:'chest_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.FURNACE],['minecart']],result:{id:'furnace_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.HOPPER],['minecart']],result:{id:'hopper_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.TNT],['minecart']],result:{id:'tnt_minecart',isBlock:false,count:1}},
  {pattern:[['redstone','iron_ingot','redstone'],['iron_ingot','stick','iron_ingot'],['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.POWERED_RAIL,isBlock:true,count:6}},
  {pattern:[['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.RAIL,isBlock:true,count:16}},
  {pattern:[[BLOCKS.OAK_PLANKS,null,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:'oak_boat',isBlock:false,count:1}},
  {pattern:[[BLOCKS.CHEST],['oak_boat']],result:{id:'chest_boat',isBlock:false,count:1}},
  {pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:BLOCKS.OAK_DOOR,isBlock:true,count:3}},
  {pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:BLOCKS.OAK_TRAPDOOR,isBlock:true,count:2}},
  // Shield
  {pattern:[[BLOCKS.OAK_PLANKS,'iron_ingot',BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[null,BLOCKS.OAK_PLANKS,null]],result:{id:'shield',isBlock:false,count:1}},
  // Helmets
  {pattern:[['iron_ingot','iron_ingot','iron_ingot'],['iron_ingot',null,'iron_ingot']],result:{id:'iron_helmet',isBlock:false,count:1}},
  {pattern:[['diamond','diamond','diamond'],['diamond',null,'diamond']],result:{id:'diamond_helmet',isBlock:false,count:1}},
  // Chestplates
  {pattern:[['iron_ingot',null,'iron_ingot'],['iron_ingot','iron_ingot','iron_ingot'],['iron_ingot','iron_ingot','iron_ingot']],result:{id:'iron_chestplate',isBlock:false,count:1}},
  {pattern:[['diamond',null,'diamond'],['diamond','diamond','diamond'],['diamond','diamond','diamond']],result:{id:'diamond_chestplate',isBlock:false,count:1}},
  // Leggings
  {pattern:[['iron_ingot','iron_ingot','iron_ingot'],['iron_ingot',null,'iron_ingot'],['iron_ingot',null,'iron_ingot']],result:{id:'iron_leggings',isBlock:false,count:1}},
  {pattern:[['diamond','diamond','diamond'],['diamond',null,'diamond'],['diamond',null,'diamond']],result:{id:'diamond_leggings',isBlock:false,count:1}},
  // Boots
  {pattern:[['iron_ingot',null,'iron_ingot'],['iron_ingot',null,'iron_ingot']],result:{id:'iron_boots',isBlock:false,count:1}},
  {pattern:[['diamond',null,'diamond'],['diamond',null,'diamond']],result:{id:'diamond_boots',isBlock:false,count:1}}
);

// Vanilla recipes from src/extraRecipes.js, appended last so hand-written recipes take precedence.
//
// Anything that fits a 2x2 grid is also added to RECIPES_2X2, because vanilla allows those in the
// inventory's own grid. Without this, planks and sticks -- the two most-used recipes in the game --
// would require a crafting table.
//
// Shapeless recipes are included on the same terms: one needing at most four items fits the 2x2 grid.
// Reading `recipe.pattern` without checking the shape first threw on every shapeless recipe, which is
// the failure this loop now avoids.
for (const recipe of EXTRA_RECIPES) {
  RECIPES_3X3.push(recipe);
  if (recipe.shapeless) {
    if (recipe.ingredients.length <= 4) RECIPES_2X2.push(recipe);
    continue;
  }
  const h = recipe.pattern.length;
  const w = recipe.pattern[0].length;
  if (h <= 2 && w <= 2) RECIPES_2X2.push(recipe);
}

// The recipe parity audit's fixes: recipes adopted from the wiki, and the few the wiki does not have removed.
export const WIKI_ADOPTED_RECIPES = applyWikiRecipeFixes(RECIPES_2X2, RECIPES_3X3, findMatchingRecipe);

/** How many generated vanilla recipes were merged, for tests and reporting. */
export const GENERATED_RECIPE_COUNT = EXTRA_RECIPES.length;


