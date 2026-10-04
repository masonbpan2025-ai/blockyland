// Vanilla crafting recipes, generated from minecraft-data and merged into the recipe list.
//
// The game shipped ~53 hand-written recipes against vanilla's 1,557. These tests pin what the
// generated set actually provides, and guard the two ways it could silently go wrong:
//
//   1. A generated recipe shadowing a hand-written one, which would produce the wrong item while
//      looking like it worked.
//   2. A malformed pattern, which the grid matcher compares by bounding box, so a wrong width would
//      not throw -- it would simply never match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES_2X2, RECIPES_3X3, GENERATED_RECIPE_COUNT, findMatchingRecipe } from '../src/crafting.js';
import { EXTRA_RECIPES, EXTRA_RECIPE_COUNT, EXTRA_RECIPE_STATS } from '../src/extraRecipes.js';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';

/** Build a craft grid the way the inventory does: { id, isBlock, count } per slot. */
function grid3(placements) {
  const grid = new Array(9).fill(null);
  for (const [row, col, id, isBlock = true, count = 1] of placements) {
    grid[row * 3 + col] = { id, isBlock, count };
  }
  return grid;
}

/** Every ingredient value in a pattern must be a real block id or a real item name. */
function ingredientValues(pattern) {
  return pattern.flat().filter(v => v !== null);
}

test('generated recipes were merged into both grids', () => {
  assert.equal(EXTRA_RECIPES.length, EXTRA_RECIPE_COUNT, 'the count must match the array');
  assert.ok(GENERATED_RECIPE_COUNT > 300,
    `expected a few hundred generated recipes, got ${GENERATED_RECIPE_COUNT}`);
  // Every generated recipe is in 3x3, and the ones that fit 2x2 are in the inventory grid too.
  for (const r of EXTRA_RECIPES) {
    assert.ok(RECIPES_3X3.includes(r), 'every generated recipe must be in RECIPES_3X3');
  }
  const fits2 = EXTRA_RECIPES.filter(r => r.pattern.length <= 2 && r.pattern[0].length <= 2);
  for (const r of fits2) {
    assert.ok(RECIPES_2X2.includes(r), 'a recipe that fits 2x2 must also work in the inventory grid');
  }
  assert.ok(RECIPES_3X3.length > 400, `expected the merged list to be large, got ${RECIPES_3X3.length}`);
});

test('every generated recipe has a well-formed pattern and real content', () => {
  for (const [i, r] of EXTRA_RECIPES.entries()) {
    const h = r.pattern.length;
    const w = r.pattern[0].length;
    assert.ok(h >= 1 && h <= 3, `recipe ${i}: height ${h} is outside 1..3`);
    assert.ok(w >= 1 && w <= 3, `recipe ${i}: width ${w} is outside 1..3`);
    for (const row of r.pattern) {
      assert.equal(row.length, w, `recipe ${i}: rows must be the same width`);
    }
    assert.ok(r.pattern.some(row => row.some(v => v !== null)),
      `recipe ${i}: a pattern of all nulls can never match`);
    // Ingredients must resolve. A numeric id must be a defined block; a string must be a known item
    // or a known block name.
    for (const v of ingredientValues(r.pattern)) {
      if (typeof v === 'number') {
        assert.ok(BLOCK_DEFS[v], `recipe ${i}: block id ${v} has no definition`);
      } else {
        assert.ok(ITEMS[v] !== undefined || BLOCKS[String(v).toUpperCase()] !== undefined,
          `recipe ${i}: item '${v}' does not exist`);
      }
    }
    // The result must resolve too.
    if (r.result.isBlock) {
      assert.ok(BLOCK_DEFS[r.result.id], `recipe ${i}: result block ${r.result.id} has no definition`);
    } else {
      assert.ok(ITEMS[r.result.id] !== undefined, `recipe ${i}: result item '${r.result.id}' does not exist`);
    }
    assert.ok(r.result.count >= 1 && r.result.count <= 64,
      `recipe ${i}: result count ${r.result.count} is outside 1..64`);
  }
});

test('a hand-written recipe always wins over a generated one with the same pattern', () => {
  // The generated recipes are appended last for exactly this reason. Checked through the REAL matcher
  // rather than by array index, because array order is an implementation detail and this is the
  // behaviour that matters.
  const generated = new Set(EXTRA_RECIPES);
  let shared = 0;
  for (const r of RECIPES_3X3) {
    if (generated.has(r)) continue;
    const clash = EXTRA_RECIPES.find(g => JSON.stringify(g.pattern) === JSON.stringify(r.pattern));
    if (!clash) continue;
    shared++;
    const placements = [];
    for (let row = 0; row < r.pattern.length; row++) {
      for (let col = 0; col < r.pattern[row].length; col++) {
        const v = r.pattern[row][col];
        if (v !== null) placements.push([row, col, v, typeof v === 'number']);
      }
    }
    const result = findMatchingRecipe(grid3(placements), 3, 3, RECIPES_3X3);
    assert.ok(result, 'a shared pattern must still match something');
    assert.equal(result.id, r.result.id,
      `the hand-written result for ${JSON.stringify(r.pattern)} was shadowed by a generated recipe`);
  }
  // Not zero: a few hand-written recipes intentionally coincide with a vanilla shape. What must hold
  // is that they keep winning.
  assert.ok(shared >= 1, 'expected at least one shared pattern, so this test is actually exercising precedence');
});

test('the recipes the survival game depends on are correct', () => {
  // The early-game chain, matched end to end. These are the recipes a player uses in the first few
  // minutes, so a wrong one is immediately visible.
  const cases = [
    ['a log makes 4 planks', grid3([[0, 0, BLOCKS.OAK_LOG]]), RECIPES_2X2, { id: BLOCKS.OAK_PLANKS, count: 4 }],
    ['2 planks make 4 sticks', grid3([[0, 0, BLOCKS.OAK_PLANKS], [1, 0, BLOCKS.OAK_PLANKS]]), RECIPES_2X2, { id: 'stick', count: 4 }],
    ['4 planks make a crafting table', grid3([
      [0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS],
      [1, 0, BLOCKS.OAK_PLANKS], [1, 1, BLOCKS.OAK_PLANKS]]), RECIPES_2X2, { id: BLOCKS.CRAFTING_TABLE, count: 1 }],
    ['8 cobblestone make a furnace', grid3([
      [0, 0, BLOCKS.COBBLESTONE], [0, 1, BLOCKS.COBBLESTONE], [0, 2, BLOCKS.COBBLESTONE],
      [1, 0, BLOCKS.COBBLESTONE], [1, 2, BLOCKS.COBBLESTONE],
      [2, 0, BLOCKS.COBBLESTONE], [2, 1, BLOCKS.COBBLESTONE], [2, 2, BLOCKS.COBBLESTONE]]),
      RECIPES_3X3, { id: BLOCKS.FURNACE, count: 1 }],
    ['a wooden pickaxe', grid3([
      [0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS], [0, 2, BLOCKS.OAK_PLANKS],
      [1, 1, 'stick'], [2, 1, 'stick']]), RECIPES_3X3, { id: 'wooden_pickaxe', count: 1 }],
    ['a stone pickaxe', grid3([
      [0, 0, BLOCKS.COBBLESTONE], [0, 1, BLOCKS.COBBLESTONE], [0, 2, BLOCKS.COBBLESTONE],
      [1, 1, 'stick'], [2, 1, 'stick']]), RECIPES_3X3, { id: 'stone_pickaxe', count: 1 }],
    ['an iron pickaxe', grid3([
      [0, 0, 'iron_ingot', false], [0, 1, 'iron_ingot', false], [0, 2, 'iron_ingot', false],
      [1, 1, 'stick', false], [2, 1, 'stick', false]]), RECIPES_3X3, { id: 'iron_pickaxe', count: 1 }],
    ['a chest', grid3([
      [0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS], [0, 2, BLOCKS.OAK_PLANKS],
      [1, 0, BLOCKS.OAK_PLANKS], [1, 2, BLOCKS.OAK_PLANKS],
      [2, 0, BLOCKS.OAK_PLANKS], [2, 1, BLOCKS.OAK_PLANKS], [2, 2, BLOCKS.OAK_PLANKS]]),
      RECIPES_3X3, { id: BLOCKS.CHEST, count: 1 }],
  ];

  for (const [label, grid, list, expected] of cases) {
    const result = findMatchingRecipe(grid, 3, 3, list);
    assert.ok(result, `${label}: nothing matched`);
    assert.equal(result.id, expected.id, `${label}: wrong item`);
    assert.equal(result.count, expected.count, `${label}: wrong count`);
  }
});

test('every plank type crafts from the wood it is made of', () => {
  // Vanilla defines these per wood type, and this is the family the game was previously missing
  // beyond oak, spruce, birch and jungle.
  //
  // The input is named differently by family: overworld woods take a log, the nether woods take a
  // stem, and bamboo takes a bamboo BLOCK. An earlier version of this test assumed a log for all of
  // them, so three woods were skipped while the test still passed -- the assertion counted what it
  // covered rather than what it claimed to.
  //
  // bamboo is the one that genuinely does not work, and the reason is content, not recipes: vanilla's
  // bamboo planks come from `bamboo_block`, which this game does not have. It is listed as a known
  // gap below so it cannot be forgotten, and so this test does not have to be weakened to pass.
  const woods = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'bamboo', 'crimson', 'warped'];
  const knownMissingInput = { bamboo: 'bamboo_block' };
  let covered = 0;
  let gapCount = 0;
  for (const wood of woods) {
    // Vanilla names the input differently by wood family: overworld woods use a log, the nether
    // woods use a stem, and bamboo uses a block. Assuming a log for all of them silently skipped
    // three woods rather than failing.
    const source = wood === 'bamboo' ? 'bamboo_block'
      : (wood === 'crimson' || wood === 'warped') ? `${wood}_stem`
      : `${wood}_log`;
    const planksName = `${wood}_planks`;
    const logId = BLOCKS[source.toUpperCase()];
    const planksId = BLOCKS[planksName.toUpperCase()];
    if (planksId === undefined) continue;
    if (logId === undefined) {
      // Only the documented gap may be skipped, so a new missing wood type fails loudly.
      assert.equal(knownMissingInput[wood], source,
        `${wood}: ${source} is missing but is not a documented gap`);
      gapCount++;
      continue;
    }
    const result = findMatchingRecipe(grid3([[0, 0, logId]]), 3, 3, RECIPES_3X3);
    assert.ok(result, `${wood}: no recipe from ${source}`);
    assert.equal(result.id, planksId, `${wood}: ${source} did not produce ${planksName}`);
    assert.equal(result.count, 4, `${wood}: planks recipe should yield 4`);
    covered++;
  }
  assert.equal(covered, 11, `expected 11 of 12 wood types to craft planks, got ${covered}`);
  assert.equal(gapCount, 1, 'exactly one wood type should hit the documented gap');
  // And the reason must be the missing input, not a generator bug: the recipe exists in vanilla.
  assert.equal(BLOCKS.BAMBOO_BLOCK, undefined, 'bamboo_block is absent, which is the documented gap');
});

test('generated recipes match only the arrangement they were authored for', () => {
  // A pattern must not match a different arrangement. This is the failure mode that would matter most
  // in play: placing eight cobblestone in a ring must not also produce, say, a chest.
  const ring = grid3([
    [0, 0, BLOCKS.COBBLESTONE], [0, 1, BLOCKS.COBBLESTONE], [0, 2, BLOCKS.COBBLESTONE],
    [1, 0, BLOCKS.COBBLESTONE], [1, 2, BLOCKS.COBBLESTONE],
    [2, 0, BLOCKS.COBBLESTONE], [2, 1, BLOCKS.COBBLESTONE], [2, 2, BLOCKS.COBBLESTONE]]);
  const result = findMatchingRecipe(ring, 3, 3, RECIPES_3X3);
  assert.ok(result, 'a cobblestone ring should make a furnace');
  assert.equal(result.id, BLOCKS.FURNACE, 'a cobblestone ring must not match a non-cobblestone recipe');

  // A full 3x3 of cobblestone must NOT match the ring pattern, because the matcher compares the
  // grid's bounding box: 3x3 of solid cobblestone is a different shape from a ring with a hole.
  const solid = grid3([0, 1, 2].flatMap(r => [0, 1, 2].map(c => [r, c, BLOCKS.COBBLESTONE])));
  const solidResult = findMatchingRecipe(solid, 3, 3, RECIPES_3X3);
  if (solidResult) {
    assert.notEqual(solidResult.id, BLOCKS.FURNACE,
      'a solid block of cobblestone must not craft a furnace, which is a ring');
  }
});

test('the generator reports what it could not express', () => {
  // The output must not look complete while quietly dropping things. These counters are what make the
  // shortfall visible, and the missing-result count is the single largest remaining gap.
  assert.ok(EXTRA_RECIPE_STATS.vanillaTotal > 1500,
    `expected the whole vanilla recipe set, saw ${EXTRA_RECIPE_STATS.vanillaTotal}`);
  assert.equal(EXTRA_RECIPE_STATS.emitted, EXTRA_RECIPE_COUNT);
  // Balance on the count emitted BEFORE de-duplication. Vanilla contains recipes that differ only in
  // a way this game's representation erases -- two wood varieties that map onto the same block, for
  // instance -- so collapsing them is correct, but the difference has to be named or the totals
  // silently fail to add up. That is exactly how this assertion caught a seven-recipe leak.
  const accounted = EXTRA_RECIPE_STATS.emittedBeforeDedupe
    + EXTRA_RECIPE_STATS.skippedMissingResult
    + EXTRA_RECIPE_STATS.skippedMissingIngredient
    + EXTRA_RECIPE_STATS.shapelessWithoutFaithfulPattern
    + EXTRA_RECIPE_STATS.rejectedRaggedPattern
    + EXTRA_RECIPE_STATS.rejectedLargerThan3x3
    + EXTRA_RECIPE_STATS.rejectedEmptyPattern
    + EXTRA_RECIPE_STATS.unclassified;
  assert.equal(accounted, EXTRA_RECIPE_STATS.vanillaTotal,
    'every vanilla recipe must be either emitted or counted as skipped; none may vanish');
  assert.equal(EXTRA_RECIPE_STATS.emittedBeforeDedupe - EXTRA_RECIPE_STATS.duplicatesCollapsed,
    EXTRA_RECIPE_COUNT, 'de-duplication must account for the difference exactly');
  // Most of the shortfall is missing RESULTS, not missing ingredients: the game can express the
  // ingredients of many recipes whose output it simply does not have yet.
  assert.ok(EXTRA_RECIPE_STATS.skippedMissingResult > EXTRA_RECIPE_STATS.skippedMissingIngredient,
    'the dominant gap should be missing results, which is what the backlog prioritises');
  console.log(`  vanilla ${EXTRA_RECIPE_STATS.vanillaTotal}, emitted ${EXTRA_RECIPE_COUNT}, `
    + `missing result ${EXTRA_RECIPE_STATS.skippedMissingResult}, `
    + `missing ingredient ${EXTRA_RECIPE_STATS.skippedMissingIngredient}, `
    + `unrepresentable shapeless ${EXTRA_RECIPE_STATS.shapelessWithoutFaithfulPattern}`);
});
