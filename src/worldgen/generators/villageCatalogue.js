// The village building catalogue: every structure the wiki's `Village/Structure` page lists for each village type,
// by its vanilla template name, with the features its one-line description names.
//
// SOURCE: docs/structure-audit/wiki/Village_Structure/wiki.txt ("All structures" table). The descriptions are the
// spec: "A building containing a large granite chimney with a blast furnace and three stone buttons at the base"
// becomes `chimney: { base: 'blast_furnace', material: 'granite' }, front: ['stone_button' x3]`. The layouts are built
// by code (`villageBuild.js`) -- this repository ships no vanilla templates -- so a building matches its description,
// not vanilla's exact block placement. `tests/villageWiki.test.js` reads the wiki descriptions independently and
// checks each built element for the beds, workstations and named blocks.
//
// WEIGHTS. The wiki does not publish vanilla's pool weights; it says only that buildings "have different
// probabilities of generating, depending on village type; for example, a weaponsmith shop is more likely to appear
// in a Taiga village than in other villages." Weights here are therefore our own, chosen so houses outnumber job
// sites and that rule holds (taiga weaponsmiths weigh 3, everyone else's 1).
//
// Kinds: meeting (town centre), house (has beds), job (workstation, no beds), farm, pen, decor, lamp.

const pots = (name, n) => Array(n).fill(name);

export const CATALOGUE = {
  desert: {
    lamp: { name: 'desert_lamp_1', design: 'desert' },
    meetings: [
      { name: 'desert_meeting_point_1', design: 'fountain', material: 'cut_sandstone', trim: 'terracotta', front: ['potted_cactus'] },
      { name: 'desert_meeting_point_2', design: 'well', material: 'smooth_sandstone', trim: 'cut_sandstone' },
      { name: 'desert_meeting_point_3', design: 'stalls', stalls: 3, cloth: 'white_glazed_terracotta', front: ['potted_cactus', 'potted_dead_bush', 'hay_block', 'hay_block'], smallWell: true, torchPillar: true }
    ],
    buildings: [
      { name: 'desert_animal_pen_1', kind: 'pen', shelter: 'small', trough: 'smooth_sandstone_stairs' },
      { name: 'desert_animal_pen_2', kind: 'pen', shelter: 'long', trough: 'smooth_sandstone_stairs' },
      { name: 'desert_armorer_1', kind: 'job', chimney: { base: 'blast_furnace', material: 'granite', stairs: 'granite_stairs' }, front: pots('stone_button', 3) },
      { name: 'desert_butcher_shop_1', kind: 'job', chimney: { base: 'smoker', material: 'terracotta' }, pen: { animals: [] } },
      { name: 'desert_cartographer_house_1', kind: 'job', job: ['cartography_table'], front: ['potted_cactus', 'potted_cactus'], stories: 2 },
      { name: 'desert_farm_1', kind: 'farm', patches: 3, composters: 1 },
      { name: 'desert_farm_2', kind: 'farm', patches: 2, composters: 1, trapdoorRing: true },
      { name: 'desert_fisher_1', kind: 'job', job: ['barrel'], items: pots('barrel', 3), front: ['barrel', 'barrel', 'hay_block', 'hay_block', 'potted_cactus', 'potted_cactus', 'potted_dead_bush', 'potted_dead_bush'], pond: { pillars: true } },
      { name: 'desert_fletcher_house_1', kind: 'job', job: ['fletching_table'], items: ['ladder'], windowPots: pots('potted_cactus', 3), tower: true },
      { name: 'desert_large_farm_1', kind: 'farm', patches: 4, composters: 2, hay: 6, trough: 'smooth_sandstone' },
      { name: 'desert_library_1', kind: 'job', job: ['lectern'], items: pots('bookshelf', 6), windowPots: pots('potted_cactus', 4), carpets: ['white', 'lime'] },
      { name: 'desert_mason_1', kind: 'job', job: ['stonecutter'], front: ['clay', 'lime_terracotta', 'white_glazed_terracotta'], veranda: true },
      { name: 'desert_medium_house_1', kind: 'house', beds: 2, front: ['potted_cactus'], items: ['potted_cactus'] },
      { name: 'desert_medium_house_2', kind: 'house', beds: 2, bed: 'lime', items: ['chest'], front: ['potted_cactus', 'potted_cactus'], stories: 2, vigas: true },
      { name: 'desert_shepherd_house_1', kind: 'job', job: ['loom', 'loom'], items: ['hay_block', 'hay_block'], front: ['potted_cactus', 'potted_cactus'], pen: { animals: ['sheep', 'sheep'] } },
      { name: 'desert_small_house_1', kind: 'house', beds: 1, bed: 'cyan', windowPots: ['potted_cactus'] },
      { name: 'desert_small_house_2', kind: 'house', beds: 1, bed: 'green', carpets: ['green', 'green'], windowPots: ['potted_cactus'], veranda: true, front: ['jungle_button'] },
      { name: 'desert_small_house_3', kind: 'house', beds: 1, bed: 'green', items: ['potted_dead_bush'], vigas: true },
      { name: 'desert_small_house_4', kind: 'house', beds: 1, bed: 'cyan', items: ['chest'], roofTrim: 'terracotta' },
      { name: 'desert_small_house_5', kind: 'house', beds: 1, bed: 'lime', items: ['crafting_table'], front: ['potted_cactus'], vigas: true },
      { name: 'desert_small_house_6', kind: 'house', beds: 1, bed: 'green', items: ['chest'], tower: true, stories: 2 },
      { name: 'desert_small_house_7', kind: 'house', beds: 1, front: ['cactus', 'potted_dead_bush', 'potted_dead_bush'] },
      { name: 'desert_small_house_8', kind: 'house', beds: 1, bed: 'lime', items: ['crafting_table', 'sea_pickle', 'sea_pickle'], corner: 'terracotta' },
      { name: 'desert_tannery_1', kind: 'job', job: ['water_cauldron'], stories: 2, roofTrim: 'terracotta', front: ['potted_cactus', 'potted_cactus'], doors: 3 },
      { name: 'desert_temple_1', kind: 'job', job: ['brewing_stand'], items: ['chest'], glazed: 'white_glazed_terracotta', windowPots: pots('potted_cactus', 8), towers: 4 },
      { name: 'desert_temple_2', kind: 'job', job: ['brewing_stand'], glazed: 'lime_glazed_terracotta', front: ['potted_cactus', 'potted_cactus'] },
      { name: 'desert_tool_smith_1', kind: 'job', job: ['smithing_table'], items: ['chest'], front: ['potted_cactus', 'potted_cactus'], glazed: 'light_blue_glazed_terracotta', stories: 2, vigas: true },
      { name: 'desert_weaponsmith_1', kind: 'job', job: ['grindstone'], items: ['chest', 'furnace', 'furnace'], front: ['potted_cactus'], forge: true }
    ],
    decorations: [{ name: 'desert_hay_pile', design: 'hay_pile' }]
  },

  plains: {
    lamp: { name: 'plains_lamp_1', design: 'plains' },
    meetings: [
      { name: 'plains_fountain_01', design: 'fountain', material: 'cobblestone', pillar: true },
      { name: 'plains_meeting_point_1', design: 'well', material: 'cobblestone', roofSlab: 'cobblestone_slab' },
      { name: 'plains_meeting_point_2', design: 'stalls', stalls: 3, cloth: ['white_wool', 'yellow_wool'], bellOn: 'oak_planks' },
      { name: 'plains_meeting_point_3', design: 'tree', base: 'cobblestone', arches: 2 },
      { name: 'plains_meeting_point_4', design: 'stalls', stalls: 2, cloth: ['white_wool', 'yellow_wool'], scatter: 'cobblestone', bellOn: 'oak_planks' },
      { name: 'plains_meeting_point_5', design: 'stalls', stalls: 3, cloth: ['white_wool', 'yellow_wool'], hangingBell: true }
    ],
    buildings: [
      { name: 'plains_accessory_1', kind: 'decor', design: 'flowerbed' },
      { name: 'plains_animal_pen_1', kind: 'pen', tree: true },
      { name: 'plains_animal_pen_2', kind: 'pen', tree: true, hay: 1 },
      { name: 'plains_animal_pen_3', kind: 'pen', wateringHole: true },
      { name: 'plains_armorer_house_1', kind: 'job', chimney: { base: 'blast_furnace', material: 'cobblestone', footing: 'bricks' } },
      { name: 'plains_big_house_1', kind: 'house', beds: 4, bed: 'white', items: ['chest'], stories: 2 },
      { name: 'plains_butcher_shop_1', kind: 'job', chimney: { base: 'smoker', material: 'cobblestone' }, front: ['potted_dandelion'], pen: { animals: [], hay: 2 } },
      { name: 'plains_butcher_shop_2', kind: 'job', chimney: { base: 'smoker', material: 'cobblestone' }, stories: 2, pen: { animals: [] } },
      { name: 'plains_cartographer_1', kind: 'job', job: ['cartography_table'], items: ['chest'], flowerbeds: 2, carpets: ['white', 'yellow'] },
      { name: 'plains_fisher_cottage_1', kind: 'job', job: ['barrel'], items: ['chest'], pond: { barrels: 2, dock: true } },
      { name: 'plains_fletcher_house_1', kind: 'job', job: ['fletching_table'], items: ['potted_dandelion'], wool: true, carpets: ['yellow'] },
      { name: 'plains_large_farm_1', kind: 'farm', patches: 4, composters: 2 },
      { name: 'plains_library_1', kind: 'job', job: ['lectern', 'lectern'], items: pots('bookshelf', 6), stories: 2 },
      { name: 'plains_library_2', kind: 'job', job: ['lectern'], items: pots('bookshelf', 4), stories: 2 },
      { name: 'plains_masons_house_1', kind: 'job', job: ['stonecutter'], wall: 'white_terracotta', veranda: true, flowerbeds: 1, front: ['terracotta', 'clay'] },
      { name: 'plains_medium_house_1', kind: 'house', beds: 2, bed: 'white', corner: 'stripped_oak_log', items: ['oak_stairs', 'oak_pressure_plate'] },
      { name: 'plains_medium_house_2', kind: 'house', beds: 2, bed: 'yellow', items: ['chest'] },
      { name: 'plains_shepherds_house_1', kind: 'job', job: ['loom', 'loom'], wool: true, carpets: ['white', 'yellow'], pen: { animals: ['sheep', 'sheep'] } },
      { name: 'plains_small_farm_1', kind: 'farm', patches: 2, composters: 1 },
      { name: 'plains_small_house_1', kind: 'house', beds: 1, bed: 'white', corner: 'stripped_oak_log' },
      { name: 'plains_small_house_2', kind: 'house', beds: 1, bed: 'yellow', wall: 'white_terracotta', corner: 'stripped_oak_log' },
      { name: 'plains_small_house_3', kind: 'house', beds: 1, bed: 'yellow' },
      { name: 'plains_small_house_4', kind: 'house', beds: 1, bed: 'white', items: ['cobblestone_stairs'] },
      { name: 'plains_small_house_5', kind: 'house', beds: 1, bed: 'white', carpets: ['green'], stories: 2 },
      { name: 'plains_small_house_6', kind: 'house', beds: 1, bed: 'white', flowerbeds: 2 },
      { name: 'plains_small_house_7', kind: 'house', beds: 1, bed: 'yellow', items: ['chest'] },
      { name: 'plains_small_house_8', kind: 'house', beds: 1, bed: 'white', farmland: 3 },
      { name: 'plains_stable_1', kind: 'pen', stable: true, hay: 3, trough: 'water', animals: ['horse', 'horse'] },
      { name: 'plains_stable_2', kind: 'pen', stable: true, wall: 'white_terracotta', hay: 3, trough: 'water', animals: ['horse', 'horse'] },
      { name: 'plains_tannery_1', kind: 'job', job: ['water_cauldron'], items: ['chest'], front: pots('water_cauldron', 3), veranda: true },
      { name: 'plains_temple_3', kind: 'job', job: ['brewing_stand'], wall: 'white_terracotta', windows: 'stained' },
      { name: 'plains_temple_4', kind: 'job', job: ['brewing_stand'], windows: 'stained', tower: true },
      { name: 'plains_tool_smith_1', kind: 'job', job: ['smithing_table'] },
      { name: 'plains_weaponsmith_1', kind: 'job', job: ['grindstone'], items: ['chest', 'furnace', 'furnace'], forge: true }
    ],
    decorations: [{ name: 'plains_hay_pile', design: 'hay_pile' }]
  },

  savanna: {
    lamp: { name: 'savanna_lamp_post_01', design: 'savanna' },
    meetings: [
      { name: 'savanna_meeting_point_1', design: 'stalls', stalls: 3, banners: 6 },
      { name: 'savanna_meeting_point_2', design: 'fountain', material: 'orange_terracotta', trim: 'yellow_terracotta', banners: 4, bells: 2, torchPillars: 2 },
      { name: 'savanna_meeting_point_3', design: 'twin_wells', material: 'cobblestone', hangingBell: true },
      { name: 'savanna_meeting_point_4', design: 'plus_well', material: 'cobblestone', hangingBell: true }
    ],
    buildings: [
      { name: 'savanna_animal_pen_1', kind: 'pen', shelter: 'slanted', trough: 'water' },
      { name: 'savanna_animal_pen_2', kind: 'pen', arch: true, wateringHole: true },
      { name: 'savanna_animal_pen_3', kind: 'pen', shelter: 'square', tree: true },
      { name: 'savanna_armorer_1', kind: 'job', chimney: { base: 'blast_furnace', material: 'orange_terracotta', footing: 'orange_glazed_terracotta' } },
      { name: 'savanna_butchers_shop_1', kind: 'job', chimney: { base: 'smoker', material: 'orange_terracotta' }, pen: { animals: [] } },
      { name: 'savanna_butchers_shop_2', kind: 'job', job: ['smoker'], items: ['chest'], stilts: true, pen: { animals: [] } },
      { name: 'savanna_cartographer_1', kind: 'job', job: ['cartography_table'], items: ['chest'], stilts: true, banners: 8 },
      { name: 'savanna_fisher_cottage_1', kind: 'job', job: ['barrel'], stilts: true, pond: { barrels: 2 } },
      { name: 'savanna_fletcher_house_1', kind: 'job', job: ['fletching_table'], wall: 'yellow_terracotta', doors: 2, banners: 7 },
      { name: 'savanna_large_farm_1', kind: 'farm', patches: 4, composters: 2, walkway: true },
      { name: 'savanna_large_farm_2', kind: 'farm', patches: 3, composters: 1, grassPaths: true },
      { name: 'savanna_library_1', kind: 'job', job: ['lectern'], items: pots('bookshelf', 6), wall: 'orange_terracotta', flowerbeds: 2, carpets: ['orange', 'white'], windowPots: ['potted_dandelion'] },
      { name: 'savanna_mason_1', kind: 'job', job: ['stonecutter'], items: ['chest', 'clay', 'clay'], overDoor: 'yellow_glazed_terracotta' },
      { name: 'savanna_medium_house_1', kind: 'house', beds: 2, items: ['chest', 'crafting_table'], farmland: 2 },
      { name: 'savanna_medium_house_2', kind: 'house', beds: 2, items: ['chest', 'crafting_table'] },
      { name: 'savanna_shepherd_1', kind: 'job', job: ['loom'], pen: { animals: ['sheep', 'sheep'], wateringHole: true } },
      { name: 'savanna_small_farm', kind: 'farm', patches: 1, composters: 1, melonOnly: true },
      { name: 'savanna_small_house_1', kind: 'house', beds: 1, bed: 'orange', wall: 'yellow_terracotta' },
      { name: 'savanna_small_house_2', kind: 'house', beds: 1, bed: 'red', items: ['chest'], wall: 'red_terracotta' },
      { name: 'savanna_small_house_3', kind: 'house', beds: 1, bed: 'orange', items: ['crafting_table'], wall: 'orange_terracotta' },
      { name: 'savanna_small_house_4', kind: 'house', beds: 1, bed: 'orange', items: ['chest'], doors: 2, veranda: true, banners: 11 },
      { name: 'savanna_small_house_5', kind: 'house', beds: 1, bed: 'orange', tower: true, towerMaterial: 'yellow_terracotta', windows: 'fence' },
      { name: 'savanna_small_house_6', kind: 'house', beds: 1, bed: 'orange' },
      { name: 'savanna_small_house_7', kind: 'house', beds: 1, bed: 'orange', items: ['chest'], carpets: ['red'], corner: 'acacia_wood' },
      { name: 'savanna_small_house_8', kind: 'house', beds: 1, corner: 'yellow_terracotta' },
      { name: 'savanna_tannery_1', kind: 'job', job: ['water_cauldron', 'water_cauldron'], items: ['chest'], wall: 'yellow_terracotta', banners: 2 },
      { name: 'savanna_temple_1', kind: 'job', job: ['brewing_stand'], windows: 'stained', corner: 'stripped_acacia_log', front: ['orange_terracotta', 'orange_terracotta', 'orange_terracotta', 'orange_terracotta'], banners: 2 },
      { name: 'savanna_temple_2', kind: 'job', job: ['brewing_stand'], roofTrim: 'red_terracotta', corner: 'yellow_terracotta' },
      { name: 'savanna_tool_smith_1', kind: 'job', job: ['smithing_table'], doors: 3, banners: 14 },
      { name: 'savanna_weaponsmith_1', kind: 'job', job: ['grindstone'], items: ['chest'], banners: 2, front: ['acacia_fence', 'acacia_fence'] },
      { name: 'savanna_weaponsmith_2', kind: 'job', job: ['grindstone'], items: ['chest'], front: ['grindstone'], forge: true }
    ],
    decorations: [{ name: 'savanna_melon_patch', design: 'melon_patch' }, { name: 'savanna_hay_pile', design: 'hay_pile' }]
  },

  snowy: {
    lamp: { name: 'snowy_lamp_post_01', design: 'snowy', lanterns: 2 },
    lamps: [
      { name: 'snowy_lamp_post_01', design: 'snowy', lanterns: 2 },
      { name: 'snowy_lamp_post_02', design: 'snowy', lanterns: 1 },
      { name: 'snowy_lamp_post_03', design: 'snowy', lanterns: 4 }
    ],
    meetings: [
      { name: 'snowy_meeting_point_1', design: 'icicle', height: 6, bellOn: 'packed_ice' },
      { name: 'snowy_meeting_point_2', design: 'icicle', height: 3, onStairs: true },
      { name: 'snowy_meeting_point_3', design: 'lantern_shrine', lanterns: 4, hangingBell: true }
    ],
    buildings: [
      { name: 'snowy_animal_pen_1', kind: 'pen', trough: 'spruce_stairs' },
      { name: 'snowy_animal_pen_2', kind: 'pen', wateringHole: true, snowPile: true },
      { name: 'snowy_armorer_house_1', kind: 'job', items: ['chest'], front: ['lantern'], chimney: { base: 'blast_furnace', material: 'diorite', footing: 'stone_bricks', stairs: 'diorite_stairs' } },
      { name: 'snowy_armorer_house_2', kind: 'job', front: ['lantern'], chimney: { base: 'blast_furnace', material: 'diorite' } },
      { name: 'snowy_butchers_shop_1', kind: 'job', front: ['lantern'], chimney: { base: 'smoker', material: 'diorite' }, pen: { animals: [] } },
      { name: 'snowy_butchers_shop_2', kind: 'job', job: ['smoker'], igloo: ['snow_block'], pen: { animals: [] } },
      { name: 'snowy_cartographer_house_1', kind: 'job', job: ['cartography_table'], items: ['chest'] },
      { name: 'snowy_farm_1', kind: 'farm', patches: 2, composters: 1, border: 'stripped_spruce_wood', lantern: true },
      { name: 'snowy_farm_2', kind: 'farm', patches: 2, composters: 1, border: 'snow_block', lantern: true },
      { name: 'snowy_fisher_cottage', kind: 'job', job: ['barrel'], items: ['barrel', 'barrel'], front: ['lantern', 'lantern'], pond: { barrels: 0 } },
      { name: 'snowy_fletcher_house_1', kind: 'job', job: ['fletching_table'], carpets: ['blue'] },
      { name: 'snowy_library_1', kind: 'job', job: ['lectern'], items: pots('bookshelf', 8) },
      { name: 'snowy_masons_house_1', kind: 'job', job: ['stonecutter'], items: ['furnace', 'furnace', 'furnace'], carpets: ['red', 'blue'] },
      { name: 'snowy_masons_house_2', kind: 'job', job: ['stonecutter'], front: ['lantern', 'lantern'], chimney: { base: 'furnace', material: 'diorite' } },
      { name: 'snowy_medium_house_1', kind: 'house', beds: 2, bed: 'white', igloo: ['snow_block'] },
      { name: 'snowy_medium_house_2', kind: 'house', beds: 2, items: ['furnace'], stories: 2, doors: 2 },
      { name: 'snowy_medium_house_3', kind: 'house', beds: 2, items: ['furnace'], igloo: ['packed_ice', 'blue_ice'] },
      { name: 'snowy_shepherds_house_1', kind: 'job', job: ['loom', 'loom'], items: ['chest'], front: ['lantern'], wool: true, pen: { animals: ['sheep', 'sheep'] } },
      { name: 'snowy_small_house_1', kind: 'house', beds: 1, bed: 'blue', igloo: ['packed_ice'] },
      { name: 'snowy_small_house_2', kind: 'house', beds: 1, bed: 'blue', chimney: { base: 'furnace', material: 'diorite' } },
      { name: 'snowy_small_house_3', kind: 'house', beds: 1, bed: 'blue', items: ['furnace', 'furnace'], front: ['lantern', 'lantern'] },
      { name: 'snowy_small_house_4', kind: 'house', beds: 1, items: ['furnace'], igloo: ['snow_block'] },
      { name: 'snowy_small_house_5', kind: 'house', beds: 1, items: ['chest'], igloo: ['snow_block', 'blue_ice'] },
      { name: 'snowy_small_house_6', kind: 'house', beds: 1, bed: 'blue', items: ['chest'], front: ['lantern'], chimney: { base: 'furnace', material: 'diorite' } },
      { name: 'snowy_small_house_7', kind: 'house', beds: 1, bed: 'white', front: ['lantern', 'lantern'] },
      { name: 'snowy_small_house_8', kind: 'house', beds: 1, bed: 'white', igloo: ['snow_block'] },
      { name: 'snowy_tannery_1', kind: 'job', job: ['water_cauldron', 'water_cauldron'], items: ['chest'], front: ['lantern'], chimney: { base: 'furnace', material: 'diorite' } },
      { name: 'snowy_temple_1', kind: 'job', job: ['brewing_stand'], tower: true, towerMaterial: 'spruce_log' },
      { name: 'snowy_tool_smith_1', kind: 'job', job: ['smithing_table'] },
      { name: 'snowy_weapon_smith_1', kind: 'job', job: ['grindstone'], items: ['chest'], front: ['grindstone'], forge: true }
    ],
    decorations: [{ name: 'snowy_snow_patch', design: 'snow_patch' }, { name: 'snowy_ice_patch', design: 'ice_patch' }]
  },

  taiga: {
    lamp: { name: 'taiga_lamp_post_1', design: 'taiga' },
    meetings: [
      { name: 'taiga_meeting_point_1', design: 'path_square' },
      { name: 'taiga_meeting_point_2', design: 'well', material: 'cobblestone', hangingBell: true }
    ],
    buildings: [
      { name: 'taiga_animal_pen_1', kind: 'pen', arch: true, trough: 'spruce_trapdoor', tree: true },
      { name: 'taiga_armorer_2', kind: 'job', outdoor: true, corner: 'spruce_wood', chimney: { base: 'blast_furnace', material: 'cobblestone' }, front: ['campfire'], armorStands: ['iron_helmet', 'iron_chestplate'] },
      { name: 'taiga_armorer_house_1', kind: 'job', job: ['blast_furnace'], chimney: { base: 'blast_furnace', material: 'cobblestone' } },
      { name: 'taiga_butcher_shop_1', kind: 'job', chimney: { base: 'smoker', material: 'cobblestone', fire: 'campfire' }, pen: { animals: [] } },
      { name: 'taiga_cartographer_house_1', kind: 'job', job: ['cartography_table'], items: ['chest'], stories: 2 },
      { name: 'taiga_fisher_cottage_1', kind: 'job', job: ['barrel'], pond: { barrels: 1, dock: true } },
      { name: 'taiga_fletcher_house_1', kind: 'job', job: ['fletching_table'], items: ['chest'], flowerbeds: 2 },
      { name: 'taiga_large_farm_1', kind: 'farm', patches: 2, composters: 1, pumpkins: true, torchPillars: 2 },
      { name: 'taiga_large_farm_2', kind: 'farm', patches: 2, composters: 1, pumpkins: true, torchPillars: 2 },
      { name: 'taiga_library_1', kind: 'job', job: ['lectern'], items: pots('bookshelf', 6), flowerbeds: 2, stories: 2 },
      { name: 'taiga_masons_house_1', kind: 'job', job: ['stonecutter'], items: ['potted_spruce_sapling', 'clay'], flowerbeds: 2, emptyFlowerbeds: true },
      { name: 'taiga_medium_house_1', kind: 'house', beds: 2, bed: 'purple', items: ['chest'], stories: 2 },
      { name: 'taiga_medium_house_2', kind: 'house', beds: 2, bed: ['blue', 'purple'], items: ['crafting_table', 'chest'], stories: 2 },
      { name: 'taiga_medium_house_3', kind: 'house', beds: 2, items: ['crafting_table', 'chest', 'bookshelf', 'bookshelf'], doors: 2 },
      { name: 'taiga_medium_house_4', kind: 'house', beds: 2, chimney: { base: 'campfire', material: 'cobblestone' } },
      { name: 'taiga_shepherds_house_1', kind: 'job', job: ['loom', 'loom'], carpets: ['purple', 'white'], doors: 2, pen: { animals: ['sheep', 'sheep'] } },
      { name: 'taiga_small_farm_1', kind: 'farm', patches: 1, composters: 1, pumpkinOnly: true, border: 'cobblestone' },
      { name: 'taiga_small_house_1', kind: 'house', beds: 1, bed: 'purple', items: ['spruce_stairs'] },
      { name: 'taiga_small_house_2', kind: 'house', beds: 1, bed: 'purple' },
      { name: 'taiga_small_house_3', kind: 'house', beds: 1, bed: 'blue', items: ['crafting_table', 'chest'] },
      { name: 'taiga_small_house_4', kind: 'house', beds: 1, bed: 'blue', items: ['crafting_table'], doors: 2 },
      { name: 'taiga_small_house_5', kind: 'house', beds: 1, bed: 'purple', items: ['chest'], carpets: ['red'] },
      { name: 'taiga_tannery_1', kind: 'job', job: ['water_cauldron', 'water_cauldron'], items: ['chest'], flowerbeds: 1, front: ['spruce_trapdoor', 'spruce_trapdoor'] },
      { name: 'taiga_temple_1', kind: 'job', job: ['brewing_stand'], flowerbeds: 2, tower: true, items: ['potted_poppy'], windows: 'fence' },
      { name: 'taiga_tool_smith_1', kind: 'job', job: ['smithing_table'], items: ['chest'], doors: 2 },
      { name: 'taiga_weaponsmith_1', kind: 'job', job: ['grindstone'], items: ['chest'], front: ['grindstone'], flowerbeds: 1, weight: 3 },
      { name: 'taiga_weaponsmith_2', kind: 'job', outdoor: true, job: ['grindstone'], items: ['chest'], logRoof: true, weight: 3 }
    ],
    decorations: [
      { name: 'taiga_decoration_1', design: 'trapdoor_trough' },
      { name: 'taiga_decoration_2', design: 'cobble_stairs', stairs: 4 },
      { name: 'taiga_decoration_3', design: 'cobble_stairs', stairs: 1, wall: true },
      { name: 'taiga_decoration_4', design: 'cobble_stairs', stairs: 2 },
      { name: 'taiga_decoration_5', design: 'campfire' },
      { name: 'taiga_decoration_6', design: 'campfire_hay' },
      { name: 'taiga_pumpkin_patch', design: 'pumpkin_patch' }
    ]
  }
};

/** Default pool weight for an entry: houses most common, farms next, job sites and decorations least. */
export function weightOf(entry) {
  if (entry.weight) return entry.weight;
  if (entry.kind === 'house') return entry.beds >= 2 ? 3 : 4;
  if (entry.kind === 'farm') return 6;
  if (entry.kind === 'pen') return 3;
  if (entry.kind === 'decor' || entry.design) return 2;
  return 1;
}

/** Every catalogue entry of a type that can be drawn from the houses pool. */
export function houseEntries(type) {
  const cat = CATALOGUE[type];
  return [...cat.buildings, ...cat.decorations.map((d) => ({ ...d, kind: 'decor' }))];
}

/** Which entries are weaponsmiths (for the wiki's "more likely in a taiga village" rule). */
export const isWeaponsmith = (entry) => /weapon_?smith/.test(entry.name);
