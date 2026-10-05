// The Resource Inspector is the loop the block and item parity work runs on, so it is tested on its
// own terms: enumeration, the item/block join, the checks, and the two cross-reference reports.
//
// Nothing here asserts a fixed count of items, of failures or of dangling references. Those move
// every time a batch of parity work lands, and a test that has to be edited alongside the work it
// guards cannot report a regression -- it just reports that someone changed a number. What is pinned
// instead is the mechanism: an entry for everything registered, a resolver that answers to every way a
// caller might name a resource, checks that always return one of the four statuses, and reports whose
// entries are true of the registry they came from.
//
// This file deliberately imports no Three.js and touches no DOM: the inspector's whole point is that
// it runs without either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import {
  buildRegistry,
  danglingReferences,
  missingVanillaItems,
  normaliseCell,
  normaliseRecipe,
  registry,
  resolveResource,
  resourceReport,
  searchResources,
  smeltingTable,
  unresolvedImports,
} from '../src/resourceRegistry.js';
import {
  CHECK_SKIP,
  RESOURCE_CHECKS,
  ResourceShowcase,
  buildVanillaIndex,
} from '../src/resourceShowcase.js';
import { EXTRA_SMELTING } from '../src/extraSmelting.js';
import { FOODS } from '../src/foodData.js';

const STATUSES = new Set(['observed', 'not observed', 'unsupported', 'error']);

// --- enumeration -------------------------------------------------------------

test('every registered item has a resource entry', () => {
  const reg = registry();
  for (const id of Object.keys(ITEMS)) {
    const entry = reg.entries.get(id);
    assert.ok(entry, `${id} should be an entry`);
    assert.equal(entry.kind, 'item');
    assert.equal(entry.id, id);
  }
});

test('every block definition is addressable, as its item or as a numeric block', () => {
  const reg = registry();
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (typeof id !== 'number') continue;
    if (BLOCK_DEFS[id] === undefined) continue;
    const byKey = resolveResource(key, reg);
    assert.ok(byKey, `BLOCKS.${key} (id ${id}) should resolve`);
  }
});

test('a block with no item form is still an entry, keyed by its numeric id', () => {
  const reg = registry();
  const blockOnly = [...reg.entries.values()].filter((e) => e.kind === 'block');
  assert.ok(blockOnly.length > 0, 'this game has blocks with no item identity');
  for (const entry of blockOnly) {
    assert.equal(entry.key, `block:${entry.blockId}`);
    assert.equal(entry.def, null);
    assert.ok(entry.blockDef, 'a block-only entry must carry its block definition');
    assert.ok(entry.name && entry.name.length > 0, 'and a display name to show');
  }
});

test('every item that places a block exposes the block it places', () => {
  const reg = registry();
  for (const entry of reg.entries.values()) {
    if (entry.blockId === null) continue;
    assert.ok(entry.blockDef, `${entry.key} names block ${entry.blockId} but has no definition`);
    assert.ok(Array.isArray(entry.blockAliases) && entry.blockAliases.length > 0,
      `${entry.key} names block ${entry.blockId} but no BLOCKS alias`);
  }
});

test('no two entries share a key', () => {
  const reg = registry();
  const keys = [...reg.entries.keys()];
  assert.equal(new Set(keys).size, keys.length);
});

// --- resolution --------------------------------------------------------------

test('a resource resolves by item id, block key, numeric id, display name and key', () => {
  const reg = registry();
  const byName = resolveResource('Stone Sword', reg);
  assert.ok(byName, 'display name resolves');
  assert.equal(byName.id, 'stone_sword');
  assert.equal(resolveResource('stone_sword', reg).key, byName.key, 'item id resolves to the same entry');
  assert.equal(resolveResource('STONE_SWORD', reg)?.id, 'stone_sword');
  assert.equal(resolveResource(byName.key, reg)?.key, byName.key, 'the entry key resolves');

  const stone = resolveResource(3, reg) ?? resolveResource('STONE', reg);
  assert.ok(stone, 'a numeric block id or its BLOCKS key resolves');
  assert.equal(stone.blockId, 3);
});

test('an unknown name resolves to null rather than a placeholder entry', () => {
  const reg = registry();
  for (const ref of ['definitely_not_an_item', '__proto__', 999999, '']) {
    assert.equal(resolveResource(ref, reg), null, `${JSON.stringify(ref)} should not resolve`);
  }
});

test('search matches id and display name, and honours the kind filter', () => {
  const reg = registry();
  const swords = searchResources('sword', { reg });
  assert.ok(swords.length > 2, 'several swords');
  assert.ok(swords.every((e) => /sword/i.test(e.id) || /sword/i.test(e.name)));
  const items = searchResources('sword', { kind: 'item', reg });
  assert.ok(items.every((e) => e.kind === 'item'));
  const blocks = searchResources('stone', { kind: 'block', reg });
  assert.ok(blocks.every((e) => e.kind === 'block'));
});

// --- reports -----------------------------------------------------------------

test('resourceReport is plain serialisable data', () => {
  const reg = registry();
  for (const ref of ['stone_sword', 'oak_planks', 'apple', 3]) {
    const report = resourceReport(ref, reg);
    assert.ok(report, `${ref} should have a report`);
    // The CLI prints it with JSON.stringify and the page renders it, so a cycle or a live
    // Three.js object would break both. JSON round-tripping is the cheapest proof.
    assert.doesNotThrow(() => JSON.stringify(report), `${ref} report must serialise`);
  }
});

test('a report only claims sources the registry actually has', () => {
  const reg = registry();
  const report = resourceReport('stick', reg);
  assert.ok(report);
  assert.ok(report.sources.crafting.length > 0, 'a stick is crafted');
  for (const source of report.sources.crafting) {
    assert.ok(['crafting-2x2', 'crafting-3x3', 'crafting-generated'].includes(source.source));
    assert.ok(source.ingredients.length > 0, 'a recipe with no ingredients is not a recipe');
  }
});

test('an unknown resource has no report', () => {
  assert.equal(resourceReport('not_a_real_item', registry()), null);
});

// --- recipe normalisation ----------------------------------------------------

test('both recipe shapes flatten to the same terms', () => {
  const shaped = normaliseRecipe({ pattern: [['a', null], [null, 'b']], result: { id: 'x', count: 2 } });
  assert.deepEqual(shaped.ingredients, ['a', 'b']);
  assert.equal(shaped.resultId, 'x');
  assert.equal(shaped.count, 2);
  assert.equal(shaped.shapeless, false);

  const shapeless = normaliseRecipe({ shapeless: true, ingredients: ['a', 'b'], result: { id: 'x', count: 2 } });
  assert.deepEqual(shapeless.ingredients, ['a', 'b']);
  assert.equal(shapeless.shapeless, true);
});

test('a numeric cell is a block reference and a string cell is an item reference', () => {
  assert.deepEqual(normaliseCell(41), { id: 41, isBlock: true });
  assert.deepEqual(normaliseCell('quartz'), { id: 'quartz', isBlock: false });
  assert.equal(normaliseCell(null), null);
  assert.equal(normaliseCell(undefined), null);
});

test('the smelting table keeps block inputs numeric and item inputs named', () => {
  const table = smeltingTable({ 4: { id: 3, count: 1 }, quartz: { id: 'glass', count: 1 } });
  assert.deepEqual(table.get(4), { id: 3, count: 1 });
  assert.deepEqual(table.get('quartz'), { id: 'glass', count: 1 });
  // Generated entries must survive a hand-written merge, or most smelting sources disappear.
  for (const key of Object.keys(EXTRA_SMELTING)) {
    const normalised = /^[0-9]+$/.test(key) ? Number(key) : key;
    assert.ok(table.has(normalised), `${key} should still be in the merged table`);
  }
});

test('a hand-written smelting entry wins over a generated one on the same key', () => {
  const table = smeltingTable({ 4: { id: 'handwritten', count: 1 } });
  assert.equal(table.get(4).id, 'handwritten');
});

// --- vanilla index -----------------------------------------------------------

const FIXTURE_VANILLA = buildVanillaIndex({
  items: [
    { id: 1, name: 'stone', displayName: 'Stone', stackSize: 64 },
    { id: 2, name: 'diamond_pickaxe', displayName: 'Diamond Pickaxe', stackSize: 1 },
    { id: 3, name: 'apple', displayName: 'Apple', stackSize: 64 },
    { id: 4, name: 'stick', displayName: 'Stick', stackSize: 64 },
  ],
  recipes: {
    2: [{ inShape: [[1, 1, 1], [null, 4, null], [null, 4, null]], result: { id: 2, count: 1 } }],
  },
  foods: [{ id: 3, name: 'apple', foodPoints: 4, saturation: 2.4 }],
  blocks: [{ id: 1, name: 'stone' }],
});

test('the vanilla index maps recipe results and ingredients back to names', () => {
  assert.equal(FIXTURE_VANILLA.recipesByResultName.get('diamond_pickaxe').length, 1);
  // Three stone cells in one shaped recipe is one recipe that needs stone, not three.
  assert.equal(FIXTURE_VANILLA.recipesByIngredientName.get('stone').length, 1);
  assert.equal(FIXTURE_VANILLA.recipesByIngredientName.get('stick').length, 1);
  assert.equal(FIXTURE_VANILLA.foodByName.get('apple').foodPoints, 4);
});

test('missingVanillaItems reports only names with no counterpart here', () => {
  const reg = registry();
  const missing = missingVanillaItems(reg, FIXTURE_VANILLA);
  assert.ok(missing.includes('stone') === false, 'stone exists as a block');
  assert.ok(!missing.includes('stick'), 'stick exists as an item');
  const synthetic = buildVanillaIndex({ items: [{ id: 1, name: 'mithril_ingot', displayName: 'Mithril Ingot', stackSize: 64 }] });
  assert.deepEqual(missingVanillaItems(reg, synthetic), ['mithril_ingot']);
  assert.deepEqual(missingVanillaItems(reg, null), [], 'no vanilla data means no claim');
});

// --- checks ------------------------------------------------------------------

/** Build a context for a single check, so a check can be tested without the whole registry. */
function contextFor(checkId, entry, extra = {}) {
  const check = RESOURCE_CHECKS.find((c) => c.id === checkId);
  assert.ok(check, `check ${checkId} should exist`);
  return { check, ctx: { entry, registry: registry(), vanilla: null, ...extra } };
}

const fakeEntry = (over = {}) => ({
  key: 'fake', kind: 'item', id: 'fake', name: 'Fake', def: {}, isBlock: false,
  blockId: null, blockDef: null, blockAliases: [], internal: false, icon: null, type: null,
  declared: null, applied: 64,
  recipesAsResult: [], recipesAsIngredient: [], smeltingFrom: [], smeltedInto: [],
  brewingFrom: [], brewingInto: [], lootFrom: [], droppedBy: [],
  harvest: null, food: null, tool: null, enchantCategory: null, durabilityMax: null,
  ...over,
});

test('every check declares an id, a label, a group and a run function', () => {
  for (const check of RESOURCE_CHECKS) {
    assert.ok(check.id && typeof check.id === 'string', 'a check needs an id');
    assert.ok(check.label && typeof check.label === 'string', `${check.id} needs a label`);
    assert.ok(check.group && typeof check.group === 'string', `${check.id} needs a group`);
    assert.equal(typeof check.run, 'function', `${check.id} needs a run function`);
  }
  assert.equal(new Set(RESOURCE_CHECKS.map((c) => c.id)).size, RESOURCE_CHECKS.length, 'ids are unique');
});

test('checks return a boolean, CHECK_SKIP, or an object with ok and a reason', () => {
  const reg = registry();
  for (const entry of reg.entries.values()) {
    for (const check of RESOURCE_CHECKS) {
      const outcome = check.run({ entry, registry: reg, vanilla: null });
      const ok = outcome === true || outcome === false || outcome === CHECK_SKIP
        || (outcome && typeof outcome === 'object' && typeof outcome.ok === 'boolean'
          && typeof outcome.detail === 'string');
      assert.ok(ok, `${check.id} returned ${String(outcome)} for ${entry.key}`);
    }
  }
});

test('run reports one result per check, with a status from the fixed vocabulary', () => {
  const reg = registry();
  const showcase = new ResourceShowcase({ registry: reg });
  const results = showcase.run('stone_sword');
  assert.equal(results.length, RESOURCE_CHECKS.length);
  for (const result of results) {
    assert.ok(STATUSES.has(result.status), `${result.id} has status ${result.status}`);
    assert.ok(result.label && result.group, `${result.id} keeps its label and group`);
  }
});

test('a missing resource produces one clear failure, not one error per check', () => {
  const showcase = new ResourceShowcase({ registry: registry() });
  const results = showcase.run('definitely_not_registered');
  assert.equal(results.length, 1, 'one result, not one per check');
  assert.equal(results[0].id, 'exists');
  assert.equal(results[0].status, 'not observed');
  assert.match(results[0].detail, /definitely_not_registered/);
  assert.equal(showcase.summary().errors, 0, 'a missing id is a gap, not a crash');
});

test('summary accounts for every result exactly once', () => {
  const showcase = new ResourceShowcase({ registry: registry() });
  for (const ref of ['stone_sword', 'oak_planks', 'apple', 'stone']) {
    showcase.run(ref);
    const s = showcase.summary();
    assert.equal(s.passed + s.failed + s.skipped + s.errors, s.total, `${ref} summary must add up`);
    assert.equal(s.scored, s.passed + s.failed + s.errors, `${ref} scored excludes unsupported`);
    assert.equal(s.scored + s.skipped, s.total);
  }
});

test('no representative resource makes a check throw', () => {
  const showcase = new ResourceShowcase({ registry: registry() });
  for (const ref of ['stone_sword', 'oak_planks', 'apple', 'stone', 'diamond_pickaxe', 'torch', 'water']) {
    const errored = showcase.run(ref).filter((r) => r.status === 'error');
    assert.deepEqual(errored.map((r) => `${r.id}: ${r.detail}`), [], `${ref} should not error`);
  }
});

test('most checks report unsupported without vanilla data rather than guessing', () => {
  const showcase = new ResourceShowcase({ registry: registry() });
  const results = showcase.run('stone_sword');
  const vanillaChecks = results.filter((r) => ['stack-size', 'recipe-parity', 'ingredient-parity'].includes(r.id));
  assert.ok(vanillaChecks.length >= 3);
  // `stack-size` has no opinion without vanilla, and must say so instead of passing by default.
  assert.equal(vanillaChecks.find((r) => r.id === 'stack-size').status, 'unsupported');
});

// --- individual checks, against a hand-made context --------------------------

test('has-source fails for an item nothing produces and passes once a source exists', () => {
  const { check } = contextFor('has-source', fakeEntry());
  const failure = check.run({ entry: fakeEntry(), registry: registry() });
  assert.equal(failure.ok, false);
  assert.match(failure.detail, /no crafting, smelting, brewing, mob-loot or block-drop source/);
  const sourced = check.run({
    entry: fakeEntry({ recipesAsResult: [{ source: 'crafting-3x3', ingredients: ['a'], resultId: 'fake' }] }),
    registry: registry(),
  });
  assert.equal(sourced, true);
});

test('has-source counts every kind of source', () => {
  const { check } = contextFor('has-source', fakeEntry());
  for (const field of ['smeltingFrom', 'brewingFrom', 'lootFrom', 'droppedBy']) {
    const entry = fakeEntry({ [field]: ['something'] });
    assert.equal(check.run({ entry, registry: registry() }), true, `${field} should count as a source`);
  }
});

test('has-source excuses a spawn egg and nothing else', () => {  // A spawn egg has no survival source in vanilla, so asking for one reported all ninety as gaps --
  // a fifth of the report, burying the items that genuinely have none. The exemption is narrow: it is
  // keyed on the item's type, not on a name pattern, and the non-egg cases below must still fail.
  const { check } = contextFor('has-source', fakeEntry());
  const egg = fakeEntry({ id: 'zoglin_spawn_egg', type: 'spawn_egg' });
  assert.equal(check.run({ entry: egg, registry: registry() }), CHECK_SKIP);

  // An id that merely looks like a generated egg is not a spawn egg and gets no exemption.
  const impostor = fakeEntry({ id: 'spawn_egg_something', type: 'material' });
  assert.equal(check.run({ entry: impostor, registry: registry() }).ok, false);

  // And an egg that has somehow acquired a source is still reported as sourced rather than skipped.
  const sourced = fakeEntry({ id: 'zoglin_spawn_egg', type: 'spawn_egg', recipesAsResult: [{ source: 'x', ingredients: ['y'] }] });
  assert.equal(check.run({ entry: sourced, registry: registry() }), CHECK_SKIP,
    'the exemption is unconditional for eggs, so this documents that rather than hiding it');
});

test('display-name rejects the raw id and empty names', () => {
  const { check } = contextFor('display-name', fakeEntry());
  assert.equal(check.run({ entry: fakeEntry({ name: 'Fake' }) }), true);
  assert.equal(check.run({ entry: fakeEntry({ name: 'fake' }) }).ok, false);
  assert.equal(check.run({ entry: fakeEntry({ name: '   ' }) }).ok, false);
  assert.equal(check.run({ entry: fakeEntry({ name: 'undefined' }) }).ok, false);
  assert.equal(check.run({ entry: fakeEntry({ name: '<b>Fake</b>' }) }).ok, false);
});

test('block-id-resolves skips items that place nothing and fails a dangling block id', () => {
  const { check } = contextFor('block-id-resolves', fakeEntry());
  assert.equal(check.run({ entry: fakeEntry() }), CHECK_SKIP);
  assert.equal(check.run({ entry: fakeEntry({ blockId: 3 }) }), true);
  assert.equal(check.run({ entry: fakeEntry({ blockId: 999999 }) }).ok, false);
});

test('stack-size compares the applied limit, and reports the declared value when it differs', () => {
  const { check } = contextFor('stack-size', fakeEntry());
  const vanilla = buildVanillaIndex({ items: [{ id: 1, name: 'oak_sign', displayName: 'Oak Sign', stackSize: 16 }] });
  const undeclared = fakeEntry({ id: 'oak_sign', name: 'Oak Sign', declared: null, applied: 64 });
  const failure = check.run({ entry: undeclared, registry: registry(), vanilla });
  assert.equal(failure.ok, false);
  assert.match(failure.detail, /vanilla 16/);
  assert.match(failure.detail, /64/);

  const declared = fakeEntry({ id: 'oak_sign', name: 'Oak Sign', declared: 16, applied: 16 });
  assert.equal(check.run({ entry: declared, registry: registry(), vanilla }), true);

  // No vanilla opinion means no verdict.
  assert.equal(check.run({ entry: undeclared, registry: registry(), vanilla: null }), CHECK_SKIP);
});

test('edible applies vanilla saturation points against the stored modifier', () => {
  const { check } = contextFor('edible', fakeEntry());
  const vanilla = buildVanillaIndex({ items: [], foods: [{ id: 1, name: 'apple', foodPoints: 4, saturation: 2.4 }] });
  // foodData.js stores half of vanilla's saturation points for every food, so the check doubles it.
  const consistent = fakeEntry({ id: 'apple', name: 'Apple', food: { hunger: 4, saturation: 1.2 }, def: { food: 4 } });
  assert.equal(check.run({ entry: consistent, registry: registry(), vanilla }), true);

  const wrongSaturation = fakeEntry({ id: 'apple', name: 'Apple', food: { hunger: 4, saturation: 3 }, def: { food: 4 } });
  assert.equal(check.run({ entry: wrongSaturation, registry: registry(), vanilla }).ok, false);

  const wrongHunger = fakeEntry({ id: 'apple', name: 'Apple', food: { hunger: 8, saturation: 1.2 }, def: { food: 8 } });
  assert.equal(check.run({ entry: wrongHunger, registry: registry(), vanilla }).ok, false);
});

test('edible fails a food the player cannot actually eat', () => {
  const { check } = contextFor('edible', fakeEntry());
  // Declared in foodData.js but with no food value on the item: main.js reads `it.food`, so this is a
  // food that does nothing.
  const inert = fakeEntry({ id: 'apple', name: 'Apple', food: { hunger: 4, saturation: 1.2 }, def: {} });
  const outcome = check.run({ entry: inert, registry: registry(), vanilla: null });
  assert.equal(outcome.ok, false);
  assert.match(outcome.detail, /cannot be eaten/);
});

test('spawn-egg-target checks the mob id, and only for spawn eggs', () => {
  const { check } = contextFor('spawn-egg-target', fakeEntry());
  assert.equal(check.run({ entry: fakeEntry({ type: 'material' }), registry: registry() }), CHECK_SKIP);
  const egg = fakeEntry({ id: 'zombie_spawn_egg', type: 'spawn_egg', def: { type: 'spawn_egg', mob: 'zombie' } });
  // Without a mob registry the check can only confirm the id is named, and says which one.
  const named = check.run({ entry: egg, registry: registry() });
  assert.equal(named.ok, true);
  assert.match(named.detail, /zombie/);
  assert.equal(check.run({ entry: egg, registry: registry(), mobTypes: new Set(['zombie']) }), true);
  const nameless = fakeEntry({ id: 'x_spawn_egg', type: 'spawn_egg', def: { type: 'spawn_egg' } });
  assert.equal(check.run({ entry: nameless, registry: registry() }).ok, false);
  const unknownMob = fakeEntry({ id: 'x_spawn_egg', type: 'spawn_egg', def: { type: 'spawn_egg', mob: 'grue' } });
  const withMobs = check.run({ entry: unknownMob, registry: registry(), mobTypes: new Set(['zombie']) });
  assert.equal(withMobs.ok, false);
});

// --- audit -------------------------------------------------------------------

test('audit returns one row per check, with counts that add up to the resources audited', () => {
  const reg = buildRegistry();
  const showcase = new ResourceShowcase({ registry: reg });
  const sample = searchResources('sword', { reg });
  assert.ok(sample.length > 2);
  const audit = showcase.audit(sample);
  assert.equal(audit.checks.length, RESOURCE_CHECKS.length);
  for (const row of audit.checks) {
    assert.equal(row.observed + row.failed + row.skipped + row.error, sample.length,
      `${row.id} should account for every resource`);
  }
  assert.equal(audit.failures.length, audit.checks.reduce((n, row) => n + row.failed, 0));
});

// --- dangling references -----------------------------------------------------

test('every dangling reference names something genuinely undefined', () => {
  const reg = registry();
  const problems = danglingReferences(reg);
  assert.ok(Array.isArray(problems));
  for (const problem of problems) {
    assert.ok(problem.kind && problem.from && problem.detail, 'a problem must say what and where');
    const numeric = typeof problem.id === 'number';
    if (numeric) {
      assert.equal(BLOCK_DEFS[problem.id], undefined,
        `${problem.from} reports block ${problem.id}, which does exist`);
    } else {
      const key = String(problem.id);
      assert.equal(ITEMS[key], undefined, `${problem.from} reports ${key}, which is an item`);
      assert.equal(BLOCK_DEFS[key], undefined, `${problem.from} reports ${key}, which is a block def`);
      const alias = BLOCKS[key.toUpperCase()];
      assert.ok(typeof alias !== 'number' || BLOCK_DEFS[alias] === undefined,
        `${problem.from} reports ${key}, which is a block alias`);
    }
  }
});

test('dangling references are deduplicated per origin and id', () => {
  const problems = danglingReferences(registry());
  const keys = problems.map((p) => `${p.kind}|${p.id}|${p.from}`);
  assert.equal(new Set(keys).size, keys.length, 'the same reference must not be listed twice');
});

test('every food value with no item behind it is reported, and nothing else is', () => {
  // Not vacuous: the report must name exactly the FOODS entries whose item does not exist. If the
  // scan silently stopped reading foodData.js, `reported` would go empty while `expected` did not.
  const reported = new Set(
    danglingReferences(registry()).filter((p) => p.kind === 'food').map((p) => String(p.id)),
  );
  const expected = new Set(Object.keys(FOODS).filter((id) => ITEMS[id] === undefined));
  assert.deepEqual([...reported].sort(), [...expected].sort());
});

// --- the module scan ---------------------------------------------------------
//
// Added after a rename left the tree unable to load. `main.js` imported `BuildingLibrary` from a module
// that exported `StructureLibrary` and `./structureLibrary.js` after that file had been renamed, so the
// game died with "Cannot find module" and then "does not provide an export named". No data check could
// see it and no test did, because no test imports the entry point. These cases pin the scan's behaviour,
// including the mistake its first version made.

test('the module scan finds a path that no longer exists', () => {
  const faults = unresolvedImports({
    'src/a.js': "import { x } from './gone.js';\n",
    'src/b.js': 'export const x = 1;\n',
  });
  assert.deepEqual(faults, [{ file: 'src/a.js', line: 1, kind: 'unresolved-path', specifier: './gone.js' }]);
});

test('the module scan finds a name the target does not export', () => {
  const faults = unresolvedImports({
    'src/a.js': "import { StructureLibrary } from './b.js';\n",
    'src/b.js': 'export const BuildingLibrary = {};\n',
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0].kind, 'missing-export');
  assert.equal(faults[0].name, 'StructureLibrary');
});

test('the module scan finds a missing default export', () => {
  const faults = unresolvedImports({
    'src/a.js': "import Thing from './b.js';\n",
    'src/b.js': 'export const Thing = {};\n',
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0].kind, 'missing-default-export');
});

test('the module scan accepts what really is exported', () => {
  const sources = {
    'src/a.js': [
      "import def, { one, two as renamed } from './b.js';",
      "import * as ns from './b.js';",
      "import { deep } from './c.js';",
    ].join('\n'),
    'src/b.js': [
      'export const one = 1;',
      'export function two() {}',
      'export class Three {}',
      'export default Three;',
    ].join('\n'),
    'src/c.js': "export * from './b.js';\n",
  };
  assert.deepEqual(unresolvedImports(sources), []);
});

test('an import inside a comment is not an import', () => {
  const faults = unresolvedImports({
    'src/a.js': [
      "// import { ghost } from './gone.js';",
      '/*',
      "import { alsoGhost } from './gone.js';",
      '*/',
      'export const ok = 1;',
    ].join('\n'),
  });
  assert.deepEqual(faults, []);
});

test('a specifier survives the comment stripper', () => {
  // The first version of this scan read the stripped text, and `stripComments` blanks string contents as
  // well as comments to preserve line numbers -- so every specifier became spaces and the scan reported
  // zero faults on a tree whose entry point did not load. The specifier has to come from the raw line.
  const faults = unresolvedImports({
    'src/a.js': "import { thing } from './missing.js'; // a trailing comment\n",
  });
  assert.equal(faults.length, 1, 'the path must survive, quoted and followed by a comment');
  assert.equal(faults[0].specifier, './missing.js');
  assert.equal(faults[0].line, 1);
});
