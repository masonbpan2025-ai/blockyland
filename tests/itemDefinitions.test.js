// Item parity batch 1: ids the game already names but never defined, plus the two silently
// overridden definitions that bug hid behind.
//
// The failures this pins were all invisible at runtime. A zombie's `rotten_flesh` drop spawned a
// placeholder sprite that became a phantom stack on pickup; a `golden_carrot` was overridden by a
// later definition without a food value, so it could be held but not eaten; brewing named `scute`
// where the item is `turtle_scute`, so a Turtle Master potion could never be made. None of them threw,
// none failed a test, and all of them were found by the Resource Inspector's cross-reference scan.
//
// The assertions below are deliberately of two kinds. The first kind names the specific items, so a
// regression is obvious. The second kind states a whole-category invariant -- no mob loot table names
// an undefined id, no registry literal defines a key twice -- which cannot be satisfied by adding a
// special case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { FOODS } from '../src/foodData.js';
import { BASE_BREWING_RECIPES, getBrewingResult } from '../src/brewing.js';
import { MOB_LOOT, rollLoot } from '../src/mobLootData.js';
import { danglingReferences, duplicateDefinitions, registry, resolveResource } from '../src/resourceRegistry.js';
import { ResourceShowcase, buildVanillaIndex } from '../src/resourceShowcase.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const blocksSource = read('src/blocks.js');

// --- the items that were named but never defined -----------------------------

test('rotten flesh is a real, edible item', () => {
  const def = ITEMS.rotten_flesh;
  assert.ok(def, 'rotten_flesh must be registered');
  assert.equal(def.name, 'Rotten Flesh');
  assert.equal(def.type, 'food');
  assert.equal(def.food, 4, 'vanilla restores four hunger');
  assert.equal(FOODS.rotten_flesh.hunger, 4, 'and foodData.js agrees');
});

test('tropical fish, seagrass, tipped arrow and chorus fruit are registered', () => {
  const expected = {
    tropical_fish: { name: 'Tropical Fish', type: 'food', food: 1 },
    seagrass: { name: 'Seagrass', type: 'material' },
    tipped_arrow: { name: 'Tipped Arrow', type: 'projectile' },
    chorus_fruit: { name: 'Chorus Fruit', type: 'food', food: 4 },
  };
  for (const [id, want] of Object.entries(expected)) {
    const def = ITEMS[id];
    assert.ok(def, `${id} must be registered`);
    assert.equal(def.name, want.name, `${id} name`);
    assert.equal(def.type, want.type, `${id} type`);
    if (want.food !== undefined) assert.equal(def.food, want.food, `${id} food`);
  }
});

test('every item added in this batch has an icon file at the path it declares', () => {
  // Not merely "an icon is declared": `tests/item_icons.test.js` cannot see the difference between a
  // declared path and one that 404s, and the fallback sprite silently hides a missing asset.
  for (const id of ['rotten_flesh', 'tropical_fish', 'seagrass', 'tipped_arrow', 'chorus_fruit']) {
    const icon = ITEMS[id].icon;
    assert.ok(icon, `${id} declares an icon`);
    const file = join(process.cwd(), 'public', icon.replace(/^\//, ''));
    assert.ok(existsSync(file), `${id} icon must exist at ${file}`);
  }
});

test('no mob loot table names an id the registry does not define', () => {
  // The whole category, not just the four ids this batch fixed: every entry in this table is a drop
  // that could otherwise spawn a placeholder. This is the invariant the Inspector scan reported and
  // the reason the batch exists.
  const offenders = danglingReferences(registry()).filter((p) => p.kind === 'mob-loot');
  assert.deepEqual(offenders.map((p) => `${p.from} -> ${p.id}`), []);
});

test('the live drop table in mobs.js names only defined items', () => {
  // `mobLootData.js` is the generated canonical table and is not what runs; `mobs.js` has its own
  // hand-written loot map. Checking only the generated one would have missed the reachable bug, so the
  // string ids inside that literal are extracted and resolved.
  const source = read('src/mobs.js');
  const start = source.indexOf('const loot = {');
  assert.ok(start > 0, 'the live loot table should exist in mobs.js');
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > start, 'the loot literal should close');
  const body = source.slice(start, end);

  const ids = new Set();
  // `['item_id', ...]` and the `? 'a' : 'b'` cooked/raw ternaries both name items.
  for (const m of body.matchAll(/\['([a-z_]+)'/g)) ids.add(m[1]);
  for (const m of body.matchAll(/\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g)) { ids.add(m[1]); ids.add(m[2]); }
  assert.ok(ids.size > 20, `expected a broad id list, extracted ${ids.size}`);

  const unresolved = [...ids].filter((id) => !resolveResource(id, registry()));
  assert.deepEqual(unresolved, [], 'these ids are dropped by mobs but do not exist');
});

test('a mob that drops rotten flesh yields a resolvable item', () => {
  // End to end through the generated roller, so the fix is verified where drops are produced rather
  // than only in the registry.
  for (const mob of ['zombie', 'drowned', 'zoglin']) {
    const drops = rollLoot(mob, () => 0.5, { playerKill: true });
    assert.ok(drops.length > 0, `${mob} should drop something`);
    for (const drop of drops) {
      assert.ok(resolveResource(drop.item, registry()), `${mob} drops ${drop.item}, which must exist`);
    }
  }
  assert.ok(MOB_LOOT.zombie.some(([id]) => id === 'rotten_flesh'));
});

// --- foods that could be held but not eaten ----------------------------------

test('pufferfish and golden carrot are edible, at vanilla hunger values', () => {
  // Both were in foodData.js all along. Eating reads `ITEMS[id].food`, and neither item declared one,
  // so neither could be eaten: a food that does nothing is indistinguishable from a bug.
  assert.equal(ITEMS.pufferfish.food, FOODS.pufferfish.hunger, 'pufferfish hunger');
  assert.equal(ITEMS.golden_carrot.food, FOODS.golden_carrot.hunger, 'golden carrot hunger');
  assert.equal(ITEMS.golden_carrot.food, 6, 'vanilla golden carrot restores six hunger');
});

test('every food declared in foodData.js that has an item can be eaten', () => {
  const inert = Object.keys(FOODS)
    .filter((id) => ITEMS[id] !== undefined && !ITEMS[id].food);
  assert.deepEqual(inert, [], 'these are declared as food but the item carries no food value');
});

test('food hunger values match the pinned vanilla data', () => {
  // The cache is gitignored and regenerated rather than committed, so a fresh checkout has no vanilla
  // data. Absence skips the comparison instead of failing it, the same contract the Inspector keeps.
  const cache = '.cache/mc-data/foods.json';
  if (!existsSync(cache)) return;
  const vanilla = buildVanillaIndex({ foods: JSON.parse(readFileSync(cache, 'utf8')) });
  const showcase = new ResourceShowcase({ registry: registry(), vanilla });
  const wrong = [];
  for (const id of Object.keys(FOODS)) {
    if (!ITEMS[id]) continue;
    const result = showcase.run(id).find((r) => r.id === 'edible');
    if (result.status === 'not observed') wrong.push(`${id}: ${result.detail}`);
  }
  assert.deepEqual(wrong, []);
});

// --- brewing named an ingredient that does not exist -------------------------

test('a Turtle Master potion can actually be brewed', () => {
  assert.equal(getBrewingResult('awkward_potion', 'turtle_scute'), 'potion_of_turtle_master');
  assert.equal(getBrewingResult('awkward_potion', 'scute'), null, 'the old name must not work');
});

test('every brewing ingredient is a defined item', () => {
  // The ingredient is what this batch fixed: `scute` did not exist, so the recipe could never run.
  // A potion id used as a *bottle* (a corruption row's input, or a levelled result) is a different
  // gap -- the potion items themselves -- and is asserted separately below rather than folded in.
  const unresolved = new Set();
  for (const row of BASE_BREWING_RECIPES) {
    if (row.ingredient && !resolveResource(row.ingredient, registry())) unresolved.add(row.ingredient);
  }
  assert.deepEqual([...unresolved], []);
});

test('the only brewing ids still undefined are potions, not ingredients', () => {
  // Shape, not a pinned list: when potion items land this array empties and the assertion still holds,
  // whereas a list of names would have to be edited alongside the work it guards. A non-potion id
  // appearing here is the `scute` regression returning, and fails.
  const unresolved = new Set();
  for (const row of BASE_BREWING_RECIPES) {
    for (const field of ['bottle', 'result']) {
      const id = row[field];
      if (id && !resolveResource(id, registry())) unresolved.add(id);
    }
  }
  const notPotions = [...unresolved].filter((id) => !/potion/.test(id));
  assert.deepEqual(notPotions, [], 'these are neither potions nor defined items');
});

// --- the silent override that hid part of it ---------------------------------

test('no registry literal defines the same key twice', () => {
  // A repeated key in an object literal is legal, so the earlier definition disappears with no
  // warning. `golden_carrot` lost `food: 6` that way, `chest` lost its first form, and `BLOCKS.ANVIL`
  // was declared as both 54 and 205.
  for (const literal of ['ITEMS', 'BLOCKS', 'BLOCK_DEFS']) {
    const found = duplicateDefinitions(blocksSource, literal);
    assert.deepEqual(found.map((d) => `${literal}.${d.key} at ${d.lines.join(', ')}`), []);
  }
});

test('the duplicate detector finds a duplicate it is given', () => {
  const source = [
    'export const THINGS = {',
    "  a: { name: 'first' },",
    "  b: { name: 'only' },",
    "  a: { name: 'second' },",
    '};',
  ].join('\n');
  const found = duplicateDefinitions(source, 'THINGS');
  assert.equal(found.length, 1);
  assert.equal(found[0].key, 'a');
  assert.deepEqual(found[0].lines, [2, 4], 'both definitions are reported, in file order');
});

test('the duplicate detector ignores a nested key of the same name', () => {
  // `textures: { all: ... }` and a top-level `all` are different keys; only the two-space indentation
  // of a registry entry counts, which is the property that keeps this from reporting false positives.
  const source = [
    'export const THINGS = {',
    "  a: { name: 'x', textures: { all: 'a.png' } },",
    "  all: { name: 'y' },",
    '};',
  ].join('\n');
  assert.deepEqual(duplicateDefinitions(source, 'THINGS'), []);
});

test('the duplicate detector reports nothing for a literal that is not present', () => {
  assert.deepEqual(duplicateDefinitions('export const OTHER = {};', 'ITEMS'), []);
});

// --- the registry still answers for everything -------------------------------

test('the five new ids resolve by name and by id', () => {
  const reg = registry();
  for (const id of ['rotten_flesh', 'tropical_fish', 'seagrass', 'tipped_arrow', 'chorus_fruit']) {
    assert.equal(resolveResource(id, reg)?.id, id);
  }
  assert.equal(resolveResource('Rotten Flesh', reg)?.id, 'rotten_flesh');
});

test('BLOCKS and BLOCK_DEFS stay consistent after the dead alias was removed', () => {
  // The dead `ANVIL: 54` was removed; a stale alias is exactly the kind of thing a later reader would
  // trust, so every alias must still name a defined block.
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (typeof id !== 'number') continue;
    assert.ok(BLOCK_DEFS[id], `BLOCKS.${key} names ${id}, which has no definition`);
  }
  assert.ok(BLOCK_DEFS[BLOCKS.ANVIL], 'ANVIL still resolves to a defined block');
  assert.equal(BLOCKS.ANVIL, 205, 'and to the id the functional-workstation cluster declares');
});
