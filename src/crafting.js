import { BLOCKS, ITEMS } from './blocks.js';
// Vanilla recipes transcribed from minecraft-data. Generated, and merged at the END of RECIPES_3X3
// below so that a hand-written recipe always wins a tie -- several hand-written redstone recipes
// deliberately differ from vanilla, and silently losing them to a generated duplicate would be a
// regression that no coverage number would show.
import { EXTRA_RECIPES } from './extraRecipes.js';

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
  // found none. The generator dropped it because this game registers the block twice, as `hay_bale` and
  // as `hay_block`, and the recipe names the vanilla spelling.
  { shapeless: true, ingredients: ['hay_block'], result: { id: 'wheat', isBlock: false, count: 9 } },
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
  // 3 White Wool + 3 Planks -> Red Bed (Classic Minecraft default)
  {
    pattern: [
      [BLOCKS.WHITE_WOOL, BLOCKS.WHITE_WOOL, BLOCKS.WHITE_WOOL],
      [BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS, BLOCKS.OAK_PLANKS]
    ],
    result: { id: 'red_bed', isBlock: false, count: 1 }
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

/** The value a recipe slot holds for a grid cell: a block id or an item name. */
function slotValue(cell) {
  return cell && cell.count > 0 ? cell.id : null;
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

  for (const recipe of recipesList) {
    if (recipe.shapeless) {
      const ingredients = recipe.ingredients;
      if (!ingredients || ingredients.length === 0) continue;
      // A shapeless recipe cannot need more items than the grid holds.
      const cells = width * height;
      if (ingredients.length > cells) continue;
      if (multiset === null) multiset = gridMultiset(grid, width, height);
      if (sameMultiset(multiset, [...ingredients].sort())) return recipe.result;
      continue;
    }

    const pat = recipe.pattern;
    if (!pat || !pat.length) continue;
    const patH = pat.length;
    const patW = pat[0].length;

    if (patH !== shapeH || patW !== shapeW) continue;

    let match = true;
    for (let pr = 0; pr < patH; pr++) {
      for (let pc = 0; pc < patW; pc++) {
        const expected = pat[pr][pc];
        const actualId = slotValue(grid[(minR + pr) * width + (minC + pc)]);

        if (expected === null && actualId !== null) {
          match = false; break;
        }
        if (expected !== null && actualId !== expected) {
          match = false; break;
        }
      }
      if (!match) break;
    }

    if (match) return recipe.result;
  }

  return null;
}

// Core redstone recipes. Numeric entries are blocks; strings are inventory items.
RECIPES_2X2.push({pattern:[['stick'],[BLOCKS.COBBLESTONE]],result:{id:BLOCKS.LEVER,isBlock:true,count:1}},{pattern:[['redstone'],['stick']],result:{id:BLOCKS.REDSTONE_TORCH,isBlock:true,count:1}},{pattern:[[BLOCKS.STONE]],result:{id:BLOCKS.STONE_BUTTON,isBlock:true,count:1}},{pattern:[[BLOCKS.STONE,BLOCKS.STONE]],result:{id:BLOCKS.PRESSURE_PLATE,isBlock:true,count:1}});
RECIPES_3X3.push(...RECIPES_2X2.slice(-4),{pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.COBBLESTONE,'iron_ingot',BLOCKS.COBBLESTONE],[BLOCKS.COBBLESTONE,'redstone',BLOCKS.COBBLESTONE]],result:{id:BLOCKS.PISTON,isBlock:true,count:1}},{pattern:[['slime_ball'],[BLOCKS.PISTON]],result:{id:BLOCKS.STICKY_PISTON,isBlock:true,count:1}},{pattern:[[BLOCKS.REDSTONE_TORCH,'redstone',BLOCKS.REDSTONE_TORCH],[BLOCKS.STONE,BLOCKS.STONE,BLOCKS.STONE]],result:{id:BLOCKS.REPEATER,isBlock:true,count:1}},{pattern:[['redstone','redstone','redstone'],['redstone','redstone','redstone'],['redstone','redstone','redstone']],result:{id:BLOCKS.REDSTONE_BLOCK,isBlock:true,count:1}});

// Rails, minecarts and boats. Rails are iron on sticks; a cart is iron in a U; a
// boat is planks in a shallow V. Powered rail adds redstone, as it does in
// Minecraft, so a station can be built from scratch.
RECIPES_3X3.push(
  {pattern:[['iron_ingot',null,null],['iron_ingot','stick',null],['iron_ingot',null,null]],result:{id:'minecart',isBlock:false,count:1}},
  {pattern:[['chest'],['minecart']],result:{id:'chest_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.FURNACE],['minecart']],result:{id:'furnace_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.HOPPER],['minecart']],result:{id:'hopper_minecart',isBlock:false,count:1}},
  {pattern:[[BLOCKS.TNT],['minecart']],result:{id:'tnt_minecart',isBlock:false,count:1}},
  {pattern:[['redstone','iron_ingot','redstone'],['iron_ingot','stick','iron_ingot'],['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.POWERED_RAIL,isBlock:true,count:6}},
  {pattern:[['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.RAIL,isBlock:true,count:16}},
  {pattern:[[BLOCKS.OAK_PLANKS,null,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:'oak_boat',isBlock:false,count:1}},
  {pattern:[['chest'],['oak_boat']],result:{id:'chest_boat',isBlock:false,count:1}},
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

/** How many generated vanilla recipes were merged, for tests and reporting. */
export const GENERATED_RECIPE_COUNT = EXTRA_RECIPES.length;
