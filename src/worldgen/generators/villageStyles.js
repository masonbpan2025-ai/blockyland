// Village styles: the materials each of the five village types builds with.
//
// SOURCE: the Minecraft Wiki's `Village` infobox, which lists the blocks of each village type separately (saved in
// docs/structure-audit/wiki/Village/wiki.txt), plus the blocks named in each type's building descriptions on
// `Village/Structure` (docs/structure-audit/wiki/Village_Structure/wiki.txt). A style may only name blocks from its
// own type's list; `tests/villageWiki.test.js` checks every block a generated village writes against that list.
//
// Facts from the lists that shaped these choices (they are easy to get wrong from memory):
//   * plains has no crafting table (Bedrock only); snowy has neither a crafting table nor hay; savanna has no furnace;
//   * the desert has no wood except JUNGLE doors, fences, gates, trapdoors and buttons, no glass and no planks;
//   * no type has an anvil; taiga has no spruce slab (it uses smooth stone slabs);
//   * beds: plains white/yellow, desert cyan/green/lime, savanna orange/red, snowy blue/red/white, taiga purple/blue;
//   * crops: plains wheat/carrots/potatoes/beetroot, desert wheat/beetroot/melon stems, savanna melons, snowy
//     wheat/carrots/potatoes, taiga wheat/potatoes/pumpkins;
//   * snowy uses packed ice and blue ice (not plain ice) and lanterns; taiga uses campfires and mossy cobblestone.

export const VILLAGE_TYPES = ['plains', 'desert', 'savanna', 'snowy', 'taiga'];

/** Registry id -> village type. */
export const VILLAGE_TYPE_OF = {
  village_plains: 'plains', village_desert: 'desert', village_savanna: 'savanna', village_snowy: 'snowy', village_taiga: 'taiga'
};

export const STYLES = {
  plains: {
    type: 'plains', biome: 'plains',
    path: 'dirt_path', pathGrass: 'grass_block', ground: 'grass_block', underground: 'dirt',
    planks: 'oak_planks', wall: 'oak_planks', corner: 'stripped_oak_log', log: 'oak_log', wood: 'stripped_oak_wood',
    floor: 'oak_planks', foundation: 'cobblestone', stoneStairs: 'cobblestone_stairs', stoneWall: 'cobblestone_wall',
    stairs: 'oak_stairs', slab: 'oak_slab', roofSlab: 'smooth_stone_slab', fence: 'oak_fence', gate: 'oak_fence_gate',
    door: 'oak_door', trapdoor: 'oak_trapdoor', pressurePlate: 'oak_pressure_plate', leaves: 'oak_leaves',
    window: 'glass_pane', stainedWindows: ['white_stained_glass_pane', 'yellow_stained_glass_pane'],
    roof: 'gable', roofMaterial: 'oak_planks',
    beds: ['white', 'yellow'], carpets: ['white', 'yellow', 'green'], wool: ['white_wool', 'yellow_wool'],
    terracotta: ['white_terracotta', 'terracotta'], chimney: 'cobblestone', chimneyBase: 'bricks', pileBlock: 'white_terracotta',
    crops: ['wheat', 'carrots', 'potatoes', 'beetroots'], flowers: ['poppy', 'dandelion', 'cornflower', 'azure_bluet', 'oxeye_daisy'],
    potted: 'potted_dandelion', grassPlant: 'short_grass', crafting: false, furnace: true, hay: true, ladder: false,
    forgeFloor: 'smooth_stone', lamp: 'plains', abandonedMossy: true, plants: ['short_grass', 'tall_grass']
  },
  desert: {
    type: 'desert', biome: 'desert',
    path: 'smooth_sandstone', pathGrass: null, ground: 'sand', underground: 'sandstone',
    planks: 'cut_sandstone', wall: 'sandstone', corner: 'cut_sandstone', log: 'chiseled_sandstone', wood: 'cut_sandstone',
    floor: 'smooth_sandstone', foundation: 'sandstone', stoneStairs: 'smooth_sandstone_stairs', stoneWall: 'sandstone_wall',
    stairs: 'smooth_sandstone_stairs', slab: 'smooth_sandstone_slab', roofSlab: 'smooth_stone_slab', fence: 'jungle_fence', gate: 'jungle_fence_gate',
    door: 'jungle_door', trapdoor: 'jungle_trapdoor', pressurePlate: null, leaves: null,
    // No glass anywhere in the desert list: windows are open, and pots stand in them.
    window: null, stainedWindows: [],
    roof: 'flat', roofMaterial: 'smooth_sandstone',
    beds: ['cyan', 'green', 'lime'], carpets: ['green', 'lime', 'white'], wool: [],
    terracotta: ['terracotta', 'lime_terracotta'], chimney: 'terracotta', chimneyBase: 'granite', pileBlock: 'lime_terracotta',
    crops: ['wheat', 'beetroots', 'melon_stem'], flowers: ['dead_bush', 'cactus'],
    potted: 'potted_cactus', grassPlant: 'dead_bush', crafting: true, furnace: true, hay: true, ladder: true,
    forgeFloor: 'cobblestone', lamp: 'desert', abandonedMossy: false, plants: ['dead_bush', 'short_grass']
  },
  savanna: {
    type: 'savanna', biome: 'savanna',
    path: 'dirt_path', pathGrass: 'grass_block', ground: 'grass_block', underground: 'dirt',
    planks: 'acacia_planks', wall: 'acacia_planks', corner: 'acacia_log', log: 'acacia_log', wood: 'acacia_wood',
    floor: 'acacia_planks', foundation: 'cobblestone', stoneStairs: 'acacia_stairs', stoneWall: 'cobblestone_wall',
    stairs: 'acacia_stairs', slab: 'acacia_slab', roofSlab: 'smooth_stone_slab', fence: 'acacia_fence', gate: 'acacia_fence_gate',
    door: 'acacia_door', trapdoor: null, pressurePlate: 'acacia_pressure_plate', leaves: 'acacia_leaves',
    window: 'glass_pane', stainedWindows: ['orange_stained_glass_pane', 'yellow_stained_glass_pane'],
    roof: 'gable', roofMaterial: 'acacia_planks',
    beds: ['orange', 'red'], carpets: ['orange', 'red', 'white'], wool: [],
    terracotta: ['orange_terracotta', 'yellow_terracotta', 'red_terracotta'], chimney: 'orange_terracotta', chimneyBase: 'orange_glazed_terracotta', pileBlock: 'clay',
    crops: ['wheat', 'melon_stem'], flowers: ['poppy', 'dandelion', 'acacia_sapling'],
    potted: 'potted_dandelion', grassPlant: 'tall_grass', crafting: true, furnace: false, hay: true, ladder: false,
    forgeFloor: 'smooth_stone', lamp: 'savanna', abandonedMossy: false, plants: ['short_grass', 'tall_grass']
  },
  snowy: {
    type: 'snowy', biome: 'snowy_plains',
    path: 'dirt_path', pathGrass: 'grass_block', ground: 'grass_block', underground: 'dirt',
    planks: 'spruce_planks', wall: 'spruce_planks', corner: 'stripped_spruce_log', log: 'spruce_log', wood: 'stripped_spruce_wood',
    floor: 'spruce_planks', foundation: 'cobblestone', stoneStairs: 'diorite_stairs', stoneWall: 'diorite_wall',
    stairs: 'spruce_stairs', slab: 'spruce_slab', roofSlab: 'smooth_stone_slab', fence: 'spruce_fence', gate: 'spruce_fence_gate',
    door: 'spruce_door', trapdoor: null, pressurePlate: null, leaves: 'spruce_leaves',
    window: 'glass_pane', stainedWindows: [],
    roof: 'gable', roofMaterial: 'spruce_planks',
    beds: ['blue', 'white', 'red'], carpets: ['blue', 'red'], wool: ['light_gray_wool'],
    terracotta: [], chimney: 'diorite', chimneyBase: 'stone_bricks', pileBlock: 'stone_bricks',
    crops: ['wheat', 'carrots', 'potatoes'], flowers: [],
    potted: null, grassPlant: 'snow', crafting: false, furnace: true, hay: false, ladder: false,
    forgeFloor: 'smooth_stone', lamp: 'snowy', abandonedMossy: false, plants: ['short_grass']
  },
  taiga: {
    type: 'taiga', biome: 'taiga',
    path: 'dirt_path', pathGrass: 'grass_block', ground: 'grass_block', underground: 'dirt',
    planks: 'spruce_planks', wall: 'spruce_planks', corner: 'spruce_log', log: 'spruce_log', wood: 'spruce_wood',
    floor: 'spruce_planks', foundation: 'cobblestone', stoneStairs: 'cobblestone_stairs', stoneWall: 'cobblestone_wall',
    stairs: 'spruce_stairs', slab: 'smooth_stone_slab', roofSlab: 'smooth_stone_slab', fence: 'spruce_fence', gate: 'spruce_fence_gate',
    door: 'spruce_door', trapdoor: 'spruce_trapdoor', pressurePlate: 'spruce_pressure_plate', leaves: 'spruce_leaves',
    window: 'glass_pane', stainedWindows: [],
    // "roofs made of spruce logs" -- the wiki's caption for the taiga village.
    roof: 'logs', roofMaterial: 'spruce_log',
    beds: ['purple', 'blue'], carpets: ['purple', 'white', 'red'], wool: [],
    terracotta: [], chimney: 'cobblestone', chimneyBase: 'mossy_cobblestone', pileBlock: 'clay',
    crops: ['wheat', 'potatoes', 'pumpkin_stem'], flowers: ['poppy', 'fern', 'large_fern', 'sweet_berry_bush'],
    potted: 'potted_poppy', grassPlant: 'fern', crafting: true, furnace: true, hay: true, ladder: true,
    forgeFloor: 'cobblestone', lamp: 'taiga', abandonedMossy: true, plants: ['short_grass', 'fern', 'large_fern'],
    pathMix: ['grass_block', 'gravel'], sign: 'spruce_wall_sign', jackOLantern: true
  }
};

/** The mature block for a crop or gourd name. */
export const CROP_BLOCK = {
  wheat: 'wheat_stage_7', carrots: 'carrots_stage_3', potatoes: 'potatoes_stage_3', beetroots: 'beetroots_stage_3',
  melon_stem: 'melon_stem', pumpkin_stem: 'pumpkin_stem'
};
/** The fruit beside a gourd stem. */
export const GOURD_FRUIT = { melon_stem: 'melon', pumpkin_stem: 'pumpkin' };
