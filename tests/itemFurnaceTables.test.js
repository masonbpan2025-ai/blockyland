// Item parity batch 4: two defect classes that hid because they produce a value rather than an error.
//
// A computed object key collapses to the string "undefined" when the constant behind it is missing, so
// `[BLOCKS.COPPER_ORE]: {...}` did not create a dead row -- it created a row keyed "undefined", and the
// last of five unregistered ores won it: `getSmeltingRecipe('undefined')` returned a copper ingot. And
// seven `raw_*` smelting rows named inputs vanilla spells one way and this game spells another, so
// cooking worked while the table looked twice as complete as it was.
//
// Both classes are now reported by the Resource Inspector (`inspect-resource.mjs faults`), and the
// assertions below are that report stated as an invariant rather than as a fixed list: they keep
// holding as entries are added.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { FOODS } from '../src/foodData.js';
import { SMELTING_RECIPES, FUEL_BURN_TIMES, getSmeltingRecipe, getFuelBurnTime } from '../src/furnace.js';
import {
  danglingReferences,
  duplicateDefinitions,
  registry,
  resolveResource,
  undefinedBlockConstants,
} from '../src/resourceRegistry.js';

const SRC = join(process.cwd(), 'src');
const srcFiles = readdirSync(SRC).filter((name) => name.endsWith('.js'));
const readSrc = (name) => readFileSync(join(SRC, name), 'utf8');

// --- the Inspector's report, as an assertion ---------------------------------

test('the Inspector reports no data faults at all', () => {
  // This is the milestone the batch exists for: every id named by game data resolves, no registry
  // literal defines a key twice, and no computed key is built from an undefined block constant.
  assert.deepEqual(danglingReferences(registry()), [], 'dangling references');
  for (const file of ['blocks.js', 'furnace.js', 'extraItems.js', 'extraContent.js']) {
    for (const literal of ['ITEMS', 'BLOCKS', 'BLOCK_DEFS']) {
      assert.deepEqual(duplicateDefinitions(readSrc(file), literal), [], `${file} ${literal} duplicates`);
    }
  }
  for (const file of srcFiles) {
    assert.deepEqual(undefinedBlockConstants(readSrc(file)), [], `${file} undefined block constant`);
  }
});

test('the undefined-constant scan ignores comments and registered constants', () => {
  // A scan that reads comments reports its own documentation, and both this file and furnace.js explain
  // the idiom by writing it out. The scan blanks comments rather than skipping lines, so the line
  // numbers it reports stay usable.
  const source = [
    'const a = {',
    '  // [BLOCKS.NOT_A_BLOCK]: 1,',
    '  /* [BLOCKS.ALSO_NOT]: 2, */',
    "  const note = '[BLOCKS.NOT_THIS_EITHER]';",
    '};',
  ].join('\n');
  assert.deepEqual(undefinedBlockConstants(source), [], 'comments and strings are not code');

  const real = ['const table = {', '  [BLOCKS.COBBLESTONE]: 1,', '  [BLOCKS.DEFINITELY_MISSING]: 2,', '};'].join('\n');
  const found = undefinedBlockConstants(real);
  assert.equal(found.length, 1);
  assert.equal(found[0].constant, 'DEFINITELY_MISSING');
  assert.equal(found[0].line, 3, 'the line number points at the code, not at the file');
});

// --- the furnace tables ------------------------------------------------------

test('neither furnace table carries a key called "undefined"', () => {
  assert.equal(Object.hasOwn(SMELTING_RECIPES, 'undefined'), false, 'smelting');
  assert.equal(Object.hasOwn(FUEL_BURN_TIMES, 'undefined'), false, 'fuel');
  assert.equal(getSmeltingRecipe('undefined'), null, 'and nothing can ask for it by name');
  assert.equal(getFuelBurnTime('undefined'), 0);
});

test('every smelting input is a registered block or item', () => {
  // Numeric keys are block ids, string keys are item ids. The seven `raw_*` rows failed this: vanilla
  // calls the item `raw_beef`, this game calls it `beef`, and nothing could ever hold the former.
  const reg = registry();
  const unresolved = Object.keys(SMELTING_RECIPES).filter((key) => {
    if (/^[0-9]+$/.test(key)) return BLOCK_DEFS[Number(key)] === undefined;
    return resolveResource(key, reg) === null;
  });
  assert.deepEqual(unresolved, [], 'these smelting inputs cannot be held by anything');
});

test('every smelting output is a registered block or item', () => {
  const reg = registry();
  const unresolved = [];
  for (const [input, output] of Object.entries(SMELTING_RECIPES)) {
    if (output?.id === undefined) { unresolved.push(`${input} -> (no id)`); continue; }
    const ok = typeof output.id === 'number'
      ? BLOCK_DEFS[output.id] !== undefined
      : resolveResource(output.id, reg) !== null;
    if (!ok) unresolved.push(`${input} -> ${output.id}`);
  }
  assert.deepEqual(unresolved, []);
});

test('every fuel key is a registered block or item', () => {
  const reg = registry();
  const unresolved = Object.keys(FUEL_BURN_TIMES).filter((key) => {
    if (/^[0-9]+$/.test(key)) return BLOCK_DEFS[Number(key)] === undefined;
    return resolveResource(key, reg) === null;
  });
  assert.deepEqual(unresolved, []);
});

test('cooking still works through the names this game actually uses', () => {
  // The regression guard for removing the `raw_*` rows: they were redundant aliases, and if they had
  // been the only spelling of a recipe then deleting them would have removed the ability to cook.
  const expected = {
    beef: 'cooked_beef', porkchop: 'cooked_porkchop', chicken: 'cooked_chicken',
    mutton: 'cooked_mutton', rabbit: 'cooked_rabbit', salmon: 'cooked_salmon', cod: 'cooked_cod',
    potato: 'baked_potato', kelp: 'dried_kelp',
    raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_copper: 'copper_ingot', clay_ball: 'brick',
  };
  for (const [input, output] of Object.entries(expected)) {
    const recipe = getSmeltingRecipe(input);
    assert.ok(recipe, `${input} should smelt`);
    assert.equal(recipe.id, output, `${input}`);
  }
});

test('a smelting or fuel entry named for a block is reachable only when that block exists', () => {
  // The invariant this guards is not "these blocks are absent" -- five of them were registered by the
  // ore-parity batch, and the sapling by the one after it -- it is that a name in the smelting or fuel
  // tables is never reachable under a key no item can hold. A lookup keyed on an unregistered block is
  // `undefined`, and `SMELTING_RECIPES[undefined]` is a phantom entry that can never be hit but also
  // cannot be seen to be dead.
  //
  // So for each name the tables mention: either the block exists AND its entry resolves, or the block
  // does not exist AND there is no entry sitting under the undefined key it would produce.
  const pending = ['DEEPSLATE_IRON_ORE', 'DEEPSLATE_GOLD_ORE', 'NETHER_GOLD_ORE', 'COPPER_ORE', 'DEEPSLATE_COPPER_ORE'];
  let registered = 0;
  for (const name of pending) {
    const id = BLOCKS[name];
    if (typeof id === 'number') {
      registered++;
      assert.ok(BLOCK_DEFS[id], `${name} is registered so it must have a definition`);
      assert.ok(SMELTING_RECIPES[id], `${name} is registered so its smelting entry must resolve`);
      continue;
    }
    assert.equal(SMELTING_RECIPES[id], undefined, `${name} is unregistered so nothing may sit under its key`);
  }
  // At least some of them are registered now, which is the whole point of the batch; if this drops to
  // zero the ore work has been undone.
  assert.ok(registered > 0, 'the ore batch registers these; none is registered, so it was reverted');

  // The sapling the fuel table names the same way: listed by name so the entry appears when the block
  // does. The sapling batch has since landed, so the same either-or applies to it, and its burn time is
  // now reachable rather than a key called "undefined".
  const sapling = BLOCKS.OAK_SAPLING;
  if (typeof sapling === 'number') {
    assert.ok(BLOCK_DEFS[sapling], 'the sapling is registered so it must have a definition');
    assert.equal(FUEL_BURN_TIMES[sapling], 5.0, 'and its burn time must be reachable');
  } else {
    assert.equal(FUEL_BURN_TIMES[sapling], undefined, 'while unregistered, nothing may sit under its key');
  }
  assert.equal(Object.hasOwn(FUEL_BURN_TIMES, 'undefined'), false);
});

// --- the last dangling reference ---------------------------------------------

test('the ominous bottle is registered and edible, as the pinned vanilla data says', () => {
  // It was the last id that game data referenced and the registry did not define. The pinned cache
  // lists it as food with one hunger point, and `foodData.js` already agreed.
  const def = ITEMS.ominous_bottle;
  assert.ok(def, 'ominous_bottle must be registered');
  assert.equal(def.food, FOODS.ominous_bottle.hunger);
  assert.equal(def.food, 1);
  assert.ok(readFileSync(join(process.cwd(), 'public', def.icon.replace(/^\//, ''))).length > 0, 'and has art');
});
