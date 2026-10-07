// Applying a data pack to the live game, and taking it back off again.
//
// `dataPack.test.js` covers what a file IS and what it MEANS. This covers the part that changes the world:
// the registries the game reads at runtime, and the ability to undo it without a reload.
//
// Almost every test here mutates a global registry, so each one reverts in a `t.after` hook. A leaked biome
// or recipe would make an unrelated test fail later, which is the worst kind of failure to debug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createDataPack, mergePacks } from '../src/dataPack.js';
import {
  applyDataPack, revertDataPack, describeApplied, resetTagRegistry, isPackApplied, appliedPackNames,
  itemTag, blockTag, TAG_REGISTRY, DIMENSION_TYPES, PACK_FEATURES, PACK_STRUCTURES,
} from '../src/dataPackRuntime.js';
import { BIOMES } from '../src/biomes.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { DROP_ITEM_OVERRIDES, BASE_DROP_COUNTS, baseBlockDrop } from '../src/blockDrops.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const FIXTURE_DIR = new URL('./fixtures/misode/', import.meta.url);
const fixture = (rel) => JSON.parse(readFileSync(new URL(rel, FIXTURE_DIR), 'utf8'));

/** Fixture folder -> the data pack directory it belongs in. */
const FIXTURE_DIRS = {
  'biome/': 'worldgen/biome/',
  'dimension_type/': 'dimension_type/',
  'recipe/': 'recipe/',
  'loot_table/': 'loot_table/',
  'placed_feature/': 'worldgen/placed_feature/',
  'structure/': 'worldgen/structure/',
  'tags/item/': 'tags/item/',
  'tags/block/': 'tags/block/',
};

/** Every fixture as one pack, plus the two tags the real recipes need that vanilla ships elsewhere. */
function vanillaFiles(extra = {}) {
  const files = {};
  for (const [from, to] of Object.entries(FIXTURE_DIRS)) {
    const dir = new URL(from, FIXTURE_DIR);
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.json')) {
        files[`data/minecraft/${to}${name}`] = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
      }
    }
  }
  // The real oak_planks recipe needs `#oak_logs`, which is present. `stick` needs `#planks` and `shield`
  // needs `#wooden_tool_materials`; those live in vanilla tags that are not one of the pinned fixtures, so
  // they are supplied the way vanilla defines them rather than by weakening the recipe test.
  files['data/minecraft/tags/item/planks.json'] = { values: ['minecraft:oak_planks'] };
  files['data/minecraft/tags/item/wooden_tool_materials.json'] =
    { values: ['#minecraft:planks', 'minecraft:stick'] };
  return { ...files, ...extra };
}

/**
 * Apply a pack and register its revert.
 *
 * `t.after` runs even when an assertion fails, so a failed test cannot leak a biome into the next one.
 */
function applyFor(t, files, name = 'Test Pack') {
  const resolved = mergePacks([createDataPack({ name, files })]);
  const applied = applyDataPack(resolved, { name });
  t.after(() => { revertDataPack(applied); resetTagRegistry(); });
  return applied;
}

// --- tags come first, because recipes need them -------------------------------------------------------

test('tags land before recipes, which is the whole reason for a resolution pass', (t) => {
  // Reading the tag registry as `{json}` meant `adaptTag(undefined)` and every tag-based recipe produced zero
  // variants, even though the tag had loaded.
  const applied = applyFor(t, vanillaFiles());
  assert.ok(applied.tags.item_tag.length >= 2, 'the tag files loaded');
  assert.deepEqual(itemTag('minecraft:planks'), ['minecraft:oak_planks']);
  // A nested reference is walked.
  assert.deepEqual(itemTag('minecraft:wooden_tool_materials'), ['minecraft:oak_planks', 'minecraft:stick']);
  assert.deepEqual(itemTag('minecraft:not_a_tag'), [], 'an absent tag is empty, not an error');
});

test('block tags load into their own registry', (t) => {
  applyFor(t, vanillaFiles());
  // The fixture file is FLATTENED to `tags/block/mineable_pickaxe.json`, so its id is `mineable_pickaxe`
  // rather than vanilla's `mineable/pickaxe`. Asserting the nested id found nothing and looked like the
  // loader had failed.
  const members = blockTag('minecraft:mineable_pickaxe');
  assert.ok(members.length > 300, 'the real mineable/pickaxe tag loaded, got ' + members.length);
  assert.ok(members.includes('minecraft:stone'));
  assert.ok(!itemTag('minecraft:mineable_pickaxe').length, 'and it is not in the item registry');
});

// --- recipes, and whether the game can actually use them ----------------------------------------------

test('a real recipe from the pack matches in the real crafting matcher', (t) => {
  // The point of applying a recipe at all: `findMatchingRecipe` has to find it.
  applyFor(t, vanillaFiles());

  const cell = (id) => (id === null || id === undefined ? null : { id, count: 1, isBlock: typeof id === 'number' });
  const recipes = [...RECIPES_2X2, ...RECIPES_3X3];
  const planks = findMatchingRecipe([cell(BLOCKS.OAK_LOG)], 1, 1, recipes);
  const result = planks?.result ?? planks;
  assert.ok(result, 'oak_log crafts into something now');
  assert.equal(result.id, BLOCKS.OAK_PLANKS);
  assert.equal(result.count, 4, 'four planks, as vanilla');
});

test('a tag ingredient becomes one variant per member, all of which match', (t) => {
  applyFor(t, vanillaFiles());
  // `#oak_logs` holds four members, so oak_planks is four recipes and every one works.
  const members = itemTag('minecraft:oak_logs');
  assert.ok(members.length >= 4);
  const cell = (id) => ({ id, count: 1, isBlock: typeof id === 'number' });
  const recipes = [...RECIPES_2X2, ...RECIPES_3X3];
  for (const member of members) {
    const id = member.replace('minecraft:', '').toUpperCase();
    if (typeof BLOCKS[id] !== 'number') continue;      // a member the game lacks, skipped by the same rule
    const found = findMatchingRecipe([cell(BLOCKS[id])], 1, 1, recipes);
    assert.ok(found, member + ' should craft planks');
  }
});

test('the variant cap is reported, not silent', (t) => {
  const applied = applyFor(t, vanillaFiles());
  const shield = applied.recipes.find(r => r.id === 'minecraft:shield');
  assert.ok(shield, 'the shield recipe applied');
  // Six cells of `#wooden_tool_materials` (two members) is 64 combinations, exactly the cap.
  assert.equal(shield.count, 64);
  assert.equal(shield.capped, true);
  assert.ok(applied.warnings.some(w => /cap/.test(w)), 'and it is warned about');
});

test('a recipe whose tag is absent is reported with the tag it needs', (t) => {
  const applied = applyFor(t, {
    'data/t/recipe/stick.json': fixture('recipe/stick.json'),
  });
  const entry = applied.unresolved.find(u => u.id === 't:stick');
  assert.ok(entry, 'it is reported rather than silently skipped');
  assert.match(entry.reason, /needs a tag not in the pack/);
  assert.match(entry.reason, /minecraft:planks/);
});

test('a cooking recipe reaches the smelting table', (t) => {
  const applied = applyFor(t, vanillaFiles());
  assert.ok(SMELTING_RECIPES.raw_iron, 'raw iron smelts');
  assert.equal(SMELTING_RECIPES.raw_iron.id, 'iron_ingot');
  const record = [...applied.smelting.added, ...applied.smelting.overwritten]
    .find(s => s.input === 'raw_iron');
  assert.ok(record.xp > 0, 'and its xp came through');
  assert.ok(record.seconds > 0, 'and its cook time');
});

// --- biomes -------------------------------------------------------------------------------------------

test('a real biome overrides the game biome and keeps what it cannot supply', (t) => {
  const priorPlains = BIOMES.plains;
  const applied = applyFor(t, vanillaFiles());
  assert.deepEqual(applied.biomes.overwritten.map(b => b.key).sort(), ['plains', 'the_end', 'warped_forest']);
  assert.equal(BIOMES.plains.skyColor, 7907327, 'the colour is from the file');
  assert.equal(BIOMES.plains.fromDataPack, true);
  // Terrain is NOT in a biome file, so it is inherited from the biome that was there.
  assert.equal(BIOMES.plains.surfaceBlock, priorPlains.surfaceBlock, 'terrain inherited');
  assert.equal(BIOMES.plains.dimension, 'overworld', 'and the dimension is kept');
  assert.equal(applied.biomes.added.length, 0, 'nothing new was invented');
});

test('a biome id the game does not have is ADDED rather than replacing one', (t) => {
  const applied = applyFor(t, {
    'data/t/worldgen/biome/mushroom_island.json': { effects: { sky_color: 111111 }, temperature: 0.9 },
  });
  // `added` holds records, not bare keys: each carries the value the pack installed, so a revert can tell
  // whether its own value is still in place before restoring or deleting.
  assert.deepEqual(applied.biomes.added.map(b => b.key), ['mushroom_island']);
  assert.equal(BIOMES.mushroom_island.skyColor, 111111);
  assert.equal(BIOMES.mushroom_island.id, 'mushroom_island');
  assert.equal(BIOMES.mushroom_island.name, 'Mushroom Island', 'a display name is derived from the id');
});

test('a biome file with nothing in it does not blank an existing biome', (t) => {
  // The file genuinely may not carry a colour. Inheriting beats writing `undefined` over a good value.
  const prior = BIOMES.plains.fogColor;
  applyFor(t, { 'data/t/worldgen/biome/plains.json': { temperature: 0.5 } });
  assert.equal(BIOMES.plains.fogColor, prior, 'the fog colour survives');
  assert.equal(BIOMES.plains.temperature, 0.5, 'and the field that WAS supplied is applied');
});

// --- loot tables -------------------------------------------------------------------------------------

test('a real block loot table reaches the block drop', (t) => {
  applyFor(t, vanillaFiles());
  const drop = baseBlockDrop(BLOCKS.OAK_LOG);
  assert.ok(drop);
  assert.equal(drop.id, BLOCKS.OAK_LOG, 'an oak log still drops an oak log');
});

test('a loot table that names a different item changes the drop', (t) => {
  applyFor(t, {
    'data/t/loot_table/blocks/stone.json': { pools: [{ rolls: 1, entries: [
      { type: 'minecraft:item', name: 'minecraft:diamond', functions: [{ function: 'minecraft:set_count', count: { min: 2, max: 4 } }] },
    ] }] },
  });
  const drop = baseBlockDrop(BLOCKS.STONE, () => 0);
  assert.equal(drop.id, 'diamond', 'stone now drops a diamond');
  assert.equal(drop.isBlock, false, 'which is an item, not a block id');
  assert.ok(BASE_DROP_COUNTS[bonusKeyOf(BLOCKS.STONE)], 'and its range is recorded');
});

/** The key `blockDrops` uses for a block, for the test's own assertions. */
function bonusKeyOf(blockId) {
  return String(BLOCK_DEFS[blockId]?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

test('a loot table naming no block is reported rather than forced onto one', (t) => {
  const applied = applyFor(t, {
    'data/t/loot_table/entities/pig.json': { pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:porkchop' }] }] },
  });
  assert.equal(applied.loot.overrides.length, 0);
  const entry = applied.unresolved.find(u => u.id === 't:entities/pig');
  assert.ok(entry, 'it is reported');
  assert.match(entry.reason, /no block of that name/);
});

test('a multi-drop table keeps the first and counts the rest as dropped', (t) => {
  // The game's drop model has ONE base drop. Extra guaranteed drops cannot be expressed, so they are counted
  // rather than quietly lost.
  applyFor(t, {
    'data/t/loot_table/blocks/stone.json': { pools: [
      { rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }] },
      { rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:flint' }] },
    ] },
  });
  const drop = baseBlockDrop(BLOCKS.STONE);
  assert.equal(drop.id, BLOCKS.COBBLESTONE, 'the first guaranteed drop wins');
});

// --- dimension types, features and structures ----------------------------------------------------------

test('a dimension type loads into a registry with its flags derived', (t) => {
  applyFor(t, vanillaFiles());
  const nether = DIMENSION_TYPES.get('minecraft:the_nether');
  assert.ok(nether);
  assert.equal(nether.isNether, true);
  assert.equal(nether.bedWorks, false, 'a bed explodes there');
  assert.equal(DIMENSION_TYPES.get('minecraft:overworld').isNether, false);
});

test('placed features and structures load and are kept whole', (t) => {
  applyFor(t, vanillaFiles());
  const feature = PACK_FEATURES.get('minecraft:trees_plains');
  assert.ok(feature);
  assert.equal(feature.feature, 'minecraft:trees_plains');
  const structure = PACK_STRUCTURES.get('minecraft:village_plains');
  assert.ok(structure);
  assert.equal(structure.type, 'jigsaw');
  assert.ok(structure.raw, 'the raw file is preserved for a generator that does not exist yet');
});

// --- applying twice, describing, and reverting ---------------------------------------------------------

test('applying the same pack twice is refused, so recipes cannot duplicate', (t) => {
  applyFor(t, vanillaFiles(), 'Twice Pack');
  const count = RECIPES_3X3.length;
  const again = applyDataPack(mergePacks([createDataPack({ name: 'Twice Pack', files: vanillaFiles() })]),
    { name: 'Twice Pack' });
  assert.equal(again.skipped, true);
  assert.equal(again.reason, 'already applied');
  assert.equal(RECIPES_3X3.length, count, 'and nothing was added');
  assert.equal(isPackApplied('Twice Pack'), true);
  assert.ok(appliedPackNames().includes('Twice Pack'));
});

test('a pack that is not resolved is refused rather than half-applied', (t) => {
  const applied = applyDataPack(null);
  assert.equal(applied.skipped, true);
  assert.equal(applied.reason, 'not a resolved pack stack');
  // `describeApplied(null)` is what a caller with NO record at all gets. An `applied` record that was skipped
  // explains itself, which is more use than a bare "nothing applied" -- this expectation was simply wrong.
  assert.equal(describeApplied(null), 'nothing applied');
  assert.match(describeApplied(applied), /skipped \(not a resolved pack stack\)/);
});

test('describeApplied names what changed', (t) => {
  const applied = applyFor(t, vanillaFiles());
  const text = describeApplied(applied);
  assert.match(text, /biome/);
  assert.match(text, /recipe/);
  assert.match(text, /loot table/);
  assert.match(text, /tag/);
  assert.match(text, /dimension type/);
});

test('reverting puts every registry back exactly', (t) => {
  // The reason this matters: a pack can be turned off, and a half-revert is worse than no revert.
  const before = {
    biomeCount: Object.keys(BIOMES).length,
    r2: RECIPES_2X2.length,
    r3: RECIPES_3X3.length,
    smelt: Object.keys(SMELTING_RECIPES).length,
    tags: TAG_REGISTRY.item_tag.size + TAG_REGISTRY.block_tag.size,
    dims: DIMENSION_TYPES.size,
    features: PACK_FEATURES.size,
    structures: PACK_STRUCTURES.size,
    plains: BIOMES.plains,
    rawIron: SMELTING_RECIPES.raw_iron,
    overrides: Object.keys(DROP_ITEM_OVERRIDES).length,
    counts: Object.keys(BASE_DROP_COUNTS).length,
  };
  const resolved = mergePacks([createDataPack({ name: 'Revert Pack', files: vanillaFiles() })]);
  const applied = applyDataPack(resolved, { name: 'Revert Pack' });
  assert.equal(revertDataPack(applied), true);

  assert.equal(Object.keys(BIOMES).length, before.biomeCount);
  assert.equal(RECIPES_2X2.length, before.r2);
  assert.equal(RECIPES_3X3.length, before.r3);
  assert.equal(Object.keys(SMELTING_RECIPES).length, before.smelt);
  assert.equal(TAG_REGISTRY.item_tag.size + TAG_REGISTRY.block_tag.size, before.tags);
  assert.equal(DIMENSION_TYPES.size, before.dims);
  assert.equal(PACK_FEATURES.size, before.features);
  assert.equal(PACK_STRUCTURES.size, before.structures);
  assert.equal(Object.keys(DROP_ITEM_OVERRIDES).length, before.overrides);
  assert.equal(Object.keys(BASE_DROP_COUNTS).length, before.counts);
  // Not just the same COUNT -- the same values.
  assert.equal(BIOMES.plains, before.plains, 'the biome object is the one that was there');
  assert.equal(BIOMES.plains.fromDataPack, undefined);
  assert.equal(SMELTING_RECIPES.raw_iron, before.rawIron);
  assert.equal(isPackApplied('Revert Pack'), false, 'and the pack is no longer listed');
  // Clean up the tags this test reverted into a non-empty state, if the pack had none before.
  resetTagRegistry();
});

test('reverting an applied-that-was-skipped is a no-op', (t) => {
  assert.equal(revertDataPack(null), false);
  assert.equal(revertDataPack({ skipped: true }), false);
});

test('two packs stack, and reverting the top one leaves the bottom one in place', (t) => {
  const base = createDataPack({ name: 'Base', files: {
    'data/t/worldgen/biome/newland.json': { effects: { sky_color: 100 } },
  } });
  const top = createDataPack({ name: 'Top', files: {
    'data/t/worldgen/biome/newland.json': { effects: { sky_color: 200 } },
  } });
  const first = applyDataPack(mergePacks([base]), { name: 'Base' });
  t.after(() => { revertDataPack(first); resetTagRegistry(); });
  const second = applyDataPack(mergePacks([top]), { name: 'Top' });
  t.after(() => revertDataPack(second));

  assert.equal(BIOMES.newland.skyColor, 200, 'the later pack wins');
  revertDataPack(second);
  assert.equal(BIOMES.newland.skyColor, 100, 'and reverting it restores the earlier one');
  revertDataPack(first);
  assert.equal(BIOMES.newland, undefined, 'and reverting the first removes it entirely');
});

test('every fixture loads through the runtime without an exception', (t) => {
  const applied = applyFor(t, vanillaFiles(), 'All Fixtures');
  assert.equal(applied.skipped, false);
  assert.ok(applied.recipeCount > 0, 'recipes applied');
  assert.ok(applied.loot.overrides.length >= 3, 'loot tables applied');
  assert.ok(applied.biomes.overwritten.length >= 3, 'biomes applied');
  // Whatever could not be used is named rather than dropped.
  for (const u of applied.unresolved) {
    assert.ok(u.type && u.id && u.reason, 'every unresolved entry explains itself');
  }
});
