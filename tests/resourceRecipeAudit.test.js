// Recipe, smelting, fuel, Fortune and visual parity against the Minecraft Wiki (src/resourceRecipeAudit.js,
// src/resourceVisualAudit.js), the fixes they found, and that a broken fact fails its case.
import test from 'node:test';
import { SMELTING_XP_BY_INPUT } from '../src/furnace.js';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe, WIKI_ADOPTED_RECIPES } from '../src/crafting.js';
import { SMELTING_RECIPES, FUEL_BURN_TIMES, getFuelBurnTime, getKindSmeltingRecipe, furnaceKindOf, COOK_DURATION_BY_KIND, FurnaceManager } from '../src/furnace.js';
import { SMELTING_XP } from '../src/extraSmelting.js';
import { harvestDrops, fortuneOreMultiplier } from '../src/blockDrops.js';
import { cropDrops, getCropInfo, cropStageBlock } from '../src/farming.js';
import { CampfireCooking, CAMPFIRE_COOK_SECONDS } from '../src/campfireCooking.js';
import { WIKI_CRAFTING, WIKI_SMELTING, WIKI_FUEL, WIKI_FORTUNE_AVERAGES } from '../src/resourceWikiRecipes.js';
import { recipeAudit, craftingCase, smeltingCase, fuelCase, fortuneCase, recipeCasesForEntry, cellForName } from '../src/resourceRecipeAudit.js';
import { visualAudit, formProbes, drawnShape, blockVisualCases } from '../src/resourceVisualAudit.js';
import { occludesWholeFace } from '../src/blockOcclusion.js';
import { registry as buildRegistry } from '../src/resourceRegistry.js';

const idOf = (name) => Number(Object.keys(BLOCK_DEFS).find((k) => BLOCK_DEFS[k]?.name === name));
const grid = (cells) => cells.map((c) => (c === null ? null : { id: c, isBlock: typeof c === 'number', count: 1 }));
function withValue(obj, key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(obj, key); const old = obj[key];
  obj[key] = value;
  try { fn(); } finally { if (had) obj[key] = old; else delete obj[key]; }
}

// --- the source ---------------------------------------------------------------------------------------------

test('the wiki recipe data is generated from the pages and pinned', () => {
  assert.ok(WIKI_CRAFTING.length > 1400, `${WIKI_CRAFTING.length} crafting recipes`);
  assert.ok(WIKI_SMELTING.length > 120);
  assert.ok(WIKI_FUEL.length > 300);
  assert.deepEqual(WIKI_FORTUNE_AVERAGES['Diamond Ore'], [1, 1.33, 1.75, 2.2]);
  // Spot values: the torch, a shapeless recipe, the bowl's fuel and an ore's smelting experience.
  assert.ok(WIKI_CRAFTING.some((r) => r.output === 'Torch' && r.count === 4 && r.grid[4] === 'Coal' && r.grid[7] === 'Stick'));
  assert.ok(WIKI_CRAFTING.some((r) => r.output === 'Fire Charge' && r.shapeless));
  assert.equal(WIKI_FUEL.find((f) => f.name === 'Bowl')?.seconds, 5);
  assert.equal(WIKI_SMELTING.find((s) => s.input === 'Raw Iron')?.xp, 0.7);
  // Bedrock-only recipes (dyeing with bone meal) are left out.
  assert.ok(!WIKI_CRAFTING.some((r) => r.output === 'White Wool' && r.grid.includes('Bone Meal')));
});

// --- the sweep --------------------------------------------------------------------------------------------

test('SWEEP: every wiki crafting, smelting, fuel and Fortune fact holds in the game', () => {
  const audit = recipeAudit();
  // A recipe that only fails because of content still being added (docs/missing-content.md) is reported, not hidden.
  assert.deepEqual(audit.failures.map((f) => `${f.id} ${f.label} | wiki ${f.expected} | game ${f.actual}`), []);
  for (const [id, min] of Object.entries({ 'C-CRAFT': 1300, 'S-SMELT': 120, 'F-FUEL': 250, 'F-FORTUNE': 17 })) {
    assert.ok(audit.byCase[id].PASS >= min, `${id} passed ${audit.byCase[id].PASS}`);
  }
});

test('SWEEP: every visual case holds', () => {
  const audit = visualAudit({ assetExists: (p) => existsSync(`public${p}`), ...formProbes() });
  assert.deepEqual(audit.failures.map((f) => `${f.id} ${f.subject}: ${f.expected} / ${f.actual}`), []);
  for (const [id, min] of Object.entries({ 'V-SHAPE': 500, 'V-TEXTURE': 1100, 'V-ICON': 1300, 'V-HELD': 100, 'V-DROPPED': 100 })) {
    assert.ok(audit.byCase[id].PASS >= min, `${id} passed ${audit.byCase[id].PASS}`);
  }
});

// --- sensitivity ----------------------------------------------------------------------------------------------

test('SENSITIVITY: a missing or wrong recipe, smelt, fuel or Fortune rule fails its case', () => {
  const torch = WIKI_CRAFTING.find((r) => r.output === 'Torch' && r.grid.includes('Coal'));
  assert.equal(craftingCase(torch).status, 'PASS');
  assert.equal(craftingCase({ ...torch, count: 8 }).status, 'FAIL', 'a wrong count');
  assert.equal(craftingCase({ ...torch, grid: torch.grid.map((n) => (n === 'Coal' ? 'Diamond' : n)) }).status, 'FAIL', 'a recipe the game lacks');
  const rawIron = WIKI_SMELTING.find((s) => s.input === 'Raw Iron');
  assert.equal(smeltingCase(rawIron).status, 'PASS');
  withValue(SMELTING_RECIPES, 'raw_iron', undefined, () => assert.equal(smeltingCase(rawIron).status, 'FAIL'));
  // Experience is per recipe (keyed by the input) since copper horse armour and a copper axe smelt to the same
  // nugget for different amounts; a wrong value on the recipe fails.
  withValue(SMELTING_XP_BY_INPUT, 'raw_iron', 0.1, () => assert.equal(smeltingCase(rawIron).status, 'FAIL', 'wrong experience'));
  const coal = WIKI_FUEL.find((f) => f.name === 'Coal');
  assert.equal(fuelCase(coal).status, 'PASS');
  withValue(FUEL_BURN_TIMES, 'coal', 60, () => assert.equal(fuelCase(coal).status, 'FAIL'));
  assert.equal(fortuneCase('Diamond Ore', [1, 1.5, 2, 2.5], 2000).status, 'FAIL', 'a wrong Fortune table');
});

test('SENSITIVITY: a block drawn as a full cube that light passes through fails V-SHAPE', () => {
  const cactus = idOf('Cactus');
  assert.equal(blockVisualCases(cactus).find((c) => c.id === 'V-SHAPE').status, 'PASS');
  const model = BLOCK_DEFS[cactus].model;
  withValue(BLOCK_DEFS[cactus], 'model', undefined, () => {
    assert.equal(drawnShape(cactus), 'cube');
    assert.equal(blockVisualCases(cactus).find((c) => c.id === 'V-SHAPE').status, 'FAIL');
  });
  assert.equal(BLOCK_DEFS[cactus].model, model);
});

// --- the fixes: crafting -------------------------------------------------------------------------------------

test('FIX crafting: recipes adopted from the wiki craft, and the replaced ones do not', () => {
  assert.ok(WIKI_ADOPTED_RECIPES.length > 50);
  const c = (name) => cellForName(name).id;
  // Planks from stripped logs and from wood (the game took logs only).
  const planks = findMatchingRecipe(grid([c('Stripped Oak Log'), null, null, null]), 2, 2, RECIPES_2X2);
  assert.deepEqual([planks?.id, planks?.count], [BLOCKS.OAK_PLANKS, 4]);
  // TNT is gunpowder and sand -- the coal recipe is gone -- and red sand mixes in.
  const [g, s, r] = ['gunpowder', c('Sand'), c('Red Sand')];
  assert.equal(findMatchingRecipe(grid([g, s, g, r, g, s, g, r, g]), 3, 3, RECIPES_3X3)?.id, BLOCKS.TNT);
  assert.equal(findMatchingRecipe(grid(['coal', s, 'coal', s, 'coal', s, 'coal', s, 'coal']), 3, 3, RECIPES_3X3), null);
  // Three snow blocks give six snow layers, not six snow blocks.
  const snow = findMatchingRecipe(grid([c('Snow Block'), c('Snow Block'), c('Snow Block'), null, null, null, null, null, null]), 3, 3, RECIPES_3X3);
  assert.equal(BLOCK_DEFS[snow.id].name, 'Snow');
  assert.equal(snow.count, 6);
  // The lead is five string; the lodestone takes an iron ingot.
  assert.deepEqual(findMatchingRecipe(grid(['string', 'string', null, 'string', 'string', null, null, null, 'string']), 3, 3, RECIPES_3X3), { id: 'lead', isBlock: false, count: 2 });
  const csb = c('Chiseled Stone Bricks');
  assert.equal(BLOCK_DEFS[findMatchingRecipe(grid([csb, csb, csb, csb, 'iron_ingot', csb, csb, csb, csb]), 3, 3, RECIPES_3X3)?.id]?.name, 'Lodestone');
  // Re-dyeing: any wool, carpet or bed and one dye, any colour to any colour.
  const red = findMatchingRecipe(grid([c('Blue Wool'), 'red_dye', null, null]), 2, 2, RECIPES_2X2);
  assert.equal(BLOCK_DEFS[red?.id]?.name, 'Red Wool');
  const bed = findMatchingRecipe(grid([c('White Bed'), 'black_dye', null, null]), 2, 2, RECIPES_2X2);
  assert.equal((bed && (BLOCK_DEFS[bed.id]?.name ?? ITEMS[bed.id]?.name)), 'Black Bed');
});

// --- the fixes: furnace, fuel, campfire ------------------------------------------------------------------------

test('FIX furnace: wiki smelting rows, experience and fuel values are in the furnace tables', () => {
  assert.equal(SMELTING_RECIPES[idOf('Stripped Oak Log')]?.id, 'charcoal');
  assert.equal(SMELTING_RECIPES[idOf('Deepslate Diamond Ore')]?.id, 'diamond');
  assert.equal(BLOCK_DEFS[SMELTING_RECIPES[idOf('Red Terracotta')]?.id]?.name, 'Red Glazed Terracotta');
  assert.equal(SMELTING_XP.terracotta, 0.35);
  assert.equal(getFuelBurnTime(idOf('Oak Slab')), 7.5);
  assert.equal(getFuelBurnTime('bowl'), 5);
  assert.equal(getFuelBurnTime(idOf('Dried Kelp Block')), 200);
});

test('FIX furnace kinds: a blast furnace smelts ores and gear twice as fast, a smoker food, both burn fuel twice as fast', () => {
  assert.equal(furnaceKindOf(BLOCKS.BLAST_FURNACE), 'blast_furnace');
  assert.equal(furnaceKindOf(BLOCKS.SMOKER), 'smoker');
  assert.equal(COOK_DURATION_BY_KIND.blast_furnace, 5);
  assert.equal(COOK_DURATION_BY_KIND.smoker, 5);
  assert.equal(getKindSmeltingRecipe('blast_furnace', 'raw_iron')?.id, 'iron_ingot');
  assert.equal(getKindSmeltingRecipe('blast_furnace', 'beef'), null, '"cannot smelt anything else"');
  assert.equal(getKindSmeltingRecipe('smoker', 'beef')?.id, 'cooked_beef');
  assert.equal(getKindSmeltingRecipe('smoker', 'raw_iron'), null);
  // In a world: a smoker cooks one beef in 5 s on one coal, and burns that coal in 40 s.
  const voxels = new Map([['0,0,0', BLOCKS.SMOKER]]);
  const game = { world: { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? 0, setVoxel: () => {}, getChunk: () => null }, scene: null, inventory: { addItem() {} }, entities: { spawnDroppedItem() {} } };
  const manager = new FurnaceManager(game);
  manager.addItem(0, 0, 0, 'beef', false, 2);
  manager.addItem(0, 0, 0, 'coal', false, 1, 'fuel');
  for (let t = 0; t < 5.05; t += 0.05) manager.update(0.05);
  const smoker = manager.getFurnace(0, 0, 0);
  assert.equal(smoker.kind, 'smoker');
  assert.equal(smoker.output?.id, 'cooked_beef');
  assert.ok(smoker.burnTime < 80 - 9 && smoker.burnTime > 80 - 11, `fuel burns twice as fast (${smoker.burnTime})`);
});

test('FIX campfire: four raw foods cook in 30 s with no fuel and drop', () => {
  const dropped = [];
  const fire = new CampfireCooking({ drop: (x, y, z, id, isBlock, count) => dropped.push([id, count]) });
  for (let i = 0; i < 4; i++) assert.equal(fire.add(1, 2, 3, { id: 'beef' }), true);
  assert.equal(fire.add(1, 2, 3, { id: 'beef' }), false, 'four slots');
  assert.equal(fire.add(4, 2, 3, { id: 'raw_iron' }), false, 'food only');
  fire.update(CAMPFIRE_COOK_SECONDS - 0.5);
  assert.equal(dropped.length, 0);
  fire.update(0.6);
  assert.deepEqual(dropped, Array(4).fill(['cooked_beef', 1]));
});

// --- the fixes: Fortune ---------------------------------------------------------------------------------------

test('FIX Fortune: ore multiplier, discrete counts, flint, leaves, grass, nether wart and crops follow the wiki', () => {
  // "the chance for no bonus drops is 2/(level+2)" -- with level 3 a roll under 0.4 gives 1.
  assert.equal(fortuneOreMultiplier(3, () => 0.39), 1);
  assert.equal(fortuneOreMultiplier(0, () => 0.99), 1);
  // Glowstone is capped at 4; flint is certain at Fortune III.
  assert.ok(harvestDrops(idOf('Glowstone'), { fortune: 3 }, () => 0.999)[0].count <= 4);
  assert.equal(harvestDrops(idOf('Gravel'), { toolId: 'iron_shovel', fortune: 3 }, () => 0.9)[0].id, 'flint');
  // Silk Touch wins over Fortune.
  assert.equal(harvestDrops(BLOCKS.DIAMOND_ORE, { silkTouch: true, fortune: 3 })[0].id, BLOCKS.DIAMOND_ORE);
  // Nether wart: young gives one, mature 2-4, Fortune III up to 7.
  assert.equal(harvestDrops(idOf('Nether Wart'), { age: 1 })[0].count, 1);
  assert.equal(harvestDrops(idOf('Nether Wart'), { age: 3 }, () => 0.999)[0].count, 4);
  assert.equal(harvestDrops(idOf('Nether Wart'), { age: 3, fortune: 3 }, () => 0.999)[0].count, 7);
  // Crops: carrots 2 + Binomial(3 + level, 4/7) -- 2 to 8 with Fortune III.
  const carrots = getCropInfo(cropStageBlock('carrots', 3));
  assert.equal(cropDrops(carrots, { random: () => 0.99 })[0].count, 2);
  assert.equal(cropDrops(carrots, { fortune: 3, random: () => 0 })[0].count, 8);
  const beet = getCropInfo(cropStageBlock('beetroots', 3));
  assert.equal(cropDrops(beet, { random: () => 0.99 }).find((d) => d.id === 'beetroot_seeds').count, 1, '"from 1 to 4 seeds"');
});

// --- the fixes: visuals ------------------------------------------------------------------------------------------

test('FIX visuals: non-cube blocks have their shapes and no longer hide their neighbours', () => {
  for (const name of ['Cactus', 'Cauldron', 'Anvil', 'Cake', 'Enchanting Table', 'Dirt Path', 'Lantern', 'Ladder', 'Campfire', 'Brewing Stand', 'Conduit']) {
    const id = idOf(name);
    assert.ok(BLOCK_DEFS[id].model, `${name} has a model`);
    assert.equal(drawnShape(id), 'model', `${name} is drawn with it`);
    assert.equal(occludesWholeFace(BLOCK_DEFS[id]), false, `${name} hides no neighbour face`);
  }
  for (const name of ['Lilac', 'Peony', 'Rose Bush', 'Sugar Cane', 'Torchflower']) {
    const def = BLOCK_DEFS[idOf(name)];
    assert.equal(drawnShape(idOf(name)), 'cross', `${name} is a crossed plant`);
    assert.equal(def.solid, false, `${name} can be walked through`);
    assert.equal(def.sound, 'grass');
  }
  // Glowstone stays a full cube (transparent only for redstone and spawning).
  assert.equal(drawnShape(BLOCKS.GLOWSTONE), 'cube');
  const { heldShape, droppedShape } = formProbes();
  assert.equal(heldShape(BLOCKS.DANDELION), 'flat sprite');
  assert.equal(droppedShape(BLOCKS.DANDELION), 'flat sprite');
  assert.equal(heldShape(BLOCKS.STONE), 'cube');
});

// --- the Inspector -----------------------------------------------------------------------------------------------

test('INSPECTOR: a resource shows the recipes that make it, smelt it and burn it', () => {
  const reg = buildRegistry();
  const torch = [...reg.entries.values()].find((e) => e.name === 'Torch' || e.blockDef?.name === 'Torch');
  const cases = recipeCasesForEntry(torch);
  assert.ok(cases.some((c) => c.id === 'C-CRAFT' && c.status === 'PASS'));
  const coal = reg.entries.get('coal');
  const coalCases = recipeCasesForEntry(coal);
  assert.ok(coalCases.some((c) => c.id === 'F-FUEL' && c.status === 'PASS'), 'coal burns');
  assert.ok(coalCases.some((c) => c.id === 'S-SMELT'), 'and is smelted from coal ore');
});

test('FIX potions and arrows: the 1.21 potions brew, and every effect has a tipped arrow that crafts and applies', async () => {
  const { getBrewingResult, POTION_DATA } = await import('../src/brewing.js');
  const { tippedArrowEffect } = await import('../src/tippedArrows.js');
  const { TIPPED_ARROWS } = await import('../src/tippedArrowItems.js');
  // Brewed from an awkward potion (their wiki pages), the block ingredients arriving as block ids.
  assert.equal(getBrewingResult('awkward_potion', BLOCKS.SLIME_BLOCK), 'potion_of_oozing');
  assert.equal(getBrewingResult('awkward_potion', BLOCKS.COBWEB), 'potion_of_weaving');
  assert.equal(getBrewingResult('awkward_potion', 'breeze_rod'), 'potion_of_wind_charging');
  assert.equal(getBrewingResult('awkward_potion', BLOCKS.STONE), 'potion_of_infestation');
  assert.equal(getBrewingResult('potion_of_oozing', 'gunpowder'), 'splash_potion_of_oozing');
  assert.equal(POTION_DATA.potion_of_weaving.duration, 180);
  for (const id of ['potion_of_oozing', 'splash_potion_of_weaving', 'lingering_potion_of_infestation']) assert.ok(ITEMS[id], `${id} is an item`);
  // Every arrow is an item with art, crafts from eight arrows and its lingering potion, and applies its effect.
  for (const arrow of TIPPED_ARROWS) {
    assert.equal(ITEMS[arrow.id]?.name, arrow.name);
    assert.ok(existsSync(`public${ITEMS[arrow.id].icon}`), `${arrow.id} has an icon`);
    const potion = cellForName(`Lingering ${POTION_DATA[arrow.potion].name}`);
    assert.ok(potion, `the lingering ${arrow.potion} exists`);
    const g = Array(9).fill('arrow'); g[4] = potion.id;
    const made = findMatchingRecipe(grid(g), 3, 3, RECIPES_3X3);
    assert.deepEqual([made?.id, made?.count], [arrow.id, 8], arrow.id);
    const effect = tippedArrowEffect(arrow.id);
    if (!POTION_DATA[arrow.potion].effect) { assert.equal(effect, null, 'an arrow of Splashing behaves like an arrow'); continue; }
    assert.ok(effect && effect.duration >= 1, `${arrow.id} applies ${POTION_DATA[arrow.potion].effect}`);
  }
  // Wiki: an arrow carries an eighth of the potion's time -- Poison 0:45 gives 0:05.
  assert.equal(tippedArrowEffect('tipped_arrow_poison').duration, 5);
});
