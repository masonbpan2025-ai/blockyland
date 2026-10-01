import { BLOCKS, ITEMS } from './blocks.js';

export const RECIPES_2X2 = [
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
  }
];

export const RECIPES_3X3 = [
  ...RECIPES_2X2,
  // 8 Cobblestone -> 1 Furnace
  {
    pattern: [
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE],
      [BLOCKS.COBBLESTONE, null, BLOCKS.COBBLESTONE],
      [BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE, BLOCKS.COBBLESTONE]
    ],
    result: { id: BLOCKS.FURNACE, isBlock: true, count: 1 }
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

export const VILLAGER_TRADES = [
  {
    cost: { id: 'wheat', isBlock: false, count: 10, name: '10 Wheat', icon: '/assets/items/wheat.png' },
    reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }
  },
  {
    cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' },
    reward: { id: 'bread', isBlock: false, count: 6, name: '6 Bread', icon: '/assets/items/bread.png' }
  },
  {
    cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' },
    reward: { id: 'diamond_sword', isBlock: false, count: 1, name: 'Diamond Sword', icon: '/assets/items/diamond_sword.png' }
  },
  {
    cost: { id: 'iron_ingot', isBlock: false, count: 3, name: '3 Iron Ingots', icon: '/assets/items/iron_ingot.png' },
    reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }
  },
  {
    cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' },
    reward: { id: 'totem_of_undying', isBlock: false, count: 1, name: 'Totem of Undying', icon: '/assets/items/totem_of_undying.png' }
  }
];

// Helper to check 2D grid matching against a recipe
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

  for (const recipe of recipesList) {
    const pat = recipe.pattern;
    const patH = pat.length;
    const patW = pat[0].length;

    if (patH !== shapeH || patW !== shapeW) continue;

    let match = true;
    for (let pr = 0; pr < patH; pr++) {
      for (let pc = 0; pc < patW; pc++) {
        const expected = pat[pr][pc];
        const actualSlot = grid[(minR + pr) * width + (minC + pc)];
        const actualId = (actualSlot && actualSlot.count > 0) ? actualSlot.id : null;

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
  {pattern:[['redstone','iron_ingot','redstone'],['iron_ingot','stick','iron_ingot'],['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.POWERED_RAIL,isBlock:true,count:6}},
  {pattern:[['iron_ingot','stick','iron_ingot']],result:{id:BLOCKS.RAIL,isBlock:true,count:16}},
  {pattern:[[BLOCKS.OAK_PLANKS,null,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:'oak_boat',isBlock:false,count:1}},
  {pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:BLOCKS.OAK_DOOR,isBlock:true,count:3}},
  {pattern:[[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS],[BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS,BLOCKS.OAK_PLANKS]],result:{id:BLOCKS.OAK_TRAPDOOR,isBlock:true,count:2}}
);
