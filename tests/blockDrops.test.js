// What a broken block yields, and the two ways it was wrong.
//
// The game had one drop per block: `BLOCK_DEFS[id].drop` or `.dropItem`, resolved by `getBlockDrop`. That
// covers the always-drops and nothing else, so the probabilistic extras vanilla has were simply absent --
// no leaf ever gave an apple, and `short_grass` and its three relatives declared `drop: null`, which is
// why wheat seeds could not be obtained from grass at all.
//
// `blockDrops` returns the whole answer for a block: the base drop plus whatever the rolls produced. The
// base-drop rule moved into the same headless module so a test can reach it without Three.js, and
// `getBlockDrop` still exists under its old name for the five callers that had it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { BONUS_DROPS, REPLACEMENT_DROPS, baseBlockDrop, blockDrops, bonusDropsFor, bonusKeyFor, replacementDropFor } from '../src/blockDrops.js';
import { getBlockDrop } from '../src/itemVisuals.js';

const always = () => 0;
const never = () => 1;

// --- the base drop, which must not have changed ------------------------------

test('the base drop rule is exactly what it was', () => {
  // Contract pinned by tests/visualEffects.test.js and tests/blockRegistryIntegrity.test.js; the rule
  // moved modules and must behave identically.
  assert.deepEqual(baseBlockDrop(BLOCKS.OAK_LOG), { id: BLOCKS.OAK_LOG, isBlock: true });
  assert.deepEqual(baseBlockDrop(BLOCKS.GRASS), { id: BLOCKS.DIRT, isBlock: true });
  assert.deepEqual(baseBlockDrop(BLOCKS.DIAMOND_ORE), { id: 'diamond', isBlock: false });
  assert.equal(baseBlockDrop(BLOCKS.GLASS), null);
  assert.equal(baseBlockDrop(BLOCKS.WATER), null);
  // And the name the five existing callers use still resolves to it.
  assert.deepEqual(getBlockDrop(BLOCKS.DIAMOND_ORE), { id: 'diamond', isBlock: false });
});

test('a block that yields nothing yields an empty list, not a null', () => {
  assert.deepEqual(blockDrops(BLOCKS.GLASS, always), []);
  assert.deepEqual(blockDrops(BLOCKS.WATER, always), []);
});

// --- the bug this batch fixes ------------------------------------------------

test('an ore drops an item and a sapling drops a block', () => {
  // The break path passed `drop.count` where `isBlock` belongs, so the third argument was always
  // `undefined` and every drop defaulted to `isBlock: true`. For the 56 blocks whose drop is an item --
  // every ore, every door -- breaking one by hand put an item in the inventory claiming to be a block,
  // while blowing the same block up with TNT produced a correct one.
  const ore = blockDrops(BLOCKS.DIAMOND_ORE, never);
  assert.equal(ore.length, 1);
  assert.equal(ore[0].isBlock, false, 'a diamond is an item');

  const leaf = blockDrops(BLOCKS.OAK_LEAVES, always);
  const sapling = leaf.find((d) => d.id === 'oak_sapling');
  assert.ok(sapling, 'an oak leaf should be able to give a sapling');
  assert.equal(sapling.isBlock, true, 'a sapling is a block');

  const apple = leaf.find((d) => d.id === 'apple');
  assert.equal(apple.isBlock, false, 'and an apple is not');
});

test('every drop carries a count the spawner can use', () => {
  // The old call site read `drop.count`, which only ever existed as a misreading of `isBlock`.
  for (const drop of blockDrops(BLOCKS.OAK_LEAVES, always)) {
    assert.ok(Number.isInteger(drop.count) && drop.count >= 1, `${drop.id} should carry a count`);
  }
});

// --- the probabilistic extras ------------------------------------------------

test('an oak leaf gives an apple, a stick and a sapling when the rolls land', () => {
  const drops = blockDrops(BLOCKS.OAK_LEAVES, always).map((d) => d.id);
  assert.ok(drops.includes('apple'));
  assert.ok(drops.includes('stick'));
  assert.ok(drops.includes('oak_sapling'));
});

test('when no roll lands, only the base drop is left', () => {
  const leaves = blockDrops(BLOCKS.OAK_LEAVES, never);
  assert.deepEqual(leaves, [{ id: BLOCKS.OAK_LEAVES, isBlock: true, count: 1 }]);
  // A dark oak leaf is the other block with an apple on its table; a birch leaf has no apple at all.
  assert.deepEqual(bonusDropsFor(BLOCKS.BIRCH_LEAVES, always).map((d) => d.id).sort(),
    ['birch_sapling', 'stick']);
  assert.deepEqual(bonusDropsFor(BLOCKS.DARK_OAK_LEAVES, always).map((d) => d.id).sort(),
    ['apple', 'dark_oak_sapling', 'stick']);
});

test('grass gives a seed, which is its only drop', () => {
  // `drop: null` on the definition and a 12.5% seed on the table: the roll is the entire mechanism.
  for (const key of ['SHORT_GRASS', 'FERN', 'TALL_GRASS', 'LARGE_FERN']) {
    const id = BLOCKS[key];
    if (id === undefined) continue;
    assert.deepEqual(blockDrops(id, never), [], `${key} should yield nothing when the roll misses`);
    assert.deepEqual(blockDrops(id, always), [{ id: 'wheat_seeds', isBlock: false, count: 1 }]);
  }
});

test('the chance of each bonus drop is a probability, not a percentage', () => {
  // A typo of 5 for 0.05 would make the drop certain, and nothing else here would notice.
  for (const [block, table] of Object.entries(BONUS_DROPS)) {
    assert.ok(table.length, `${block} has an empty table`);
    for (const [item, chance] of table) {
      assert.equal(typeof item, 'string', `${block} names a non-string drop`);
      assert.ok(chance > 0 && chance < 1, `${block} -> ${item} has chance ${chance}, which is not a probability`);
    }
  }
});

test('every name the bonus table uses is a block the game has', () => {
  // Keyed by the block's registered name, so a typo would make the whole row dead and silent.
  const names = new Map();
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    const key = String(def?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (key && !names.has(key)) names.set(key, Number(id));
  }
  // Short grass is a name two blocks share -- the plant and its "top" half -- so a row can legitimately
  // answer to either, and only the base id has to exist.
  for (const block of Object.keys(BONUS_DROPS)) {
    assert.ok(names.has(block), `BONUS_DROPS.${block} names no block the game registers`);
  }
  // The other direction, so a registered leaf cannot quietly lose its table.
  for (const [key, id] of names) {
    if (!/_leaves$/.test(key)) continue;
    assert.ok(BONUS_DROPS[key], `${key} is a leaf block with no bonus drops`);
    assert.equal(bonusKeyFor(id), key);
  }
});

test('every item a bonus table drops is something the game knows', () => {
  const known = new Set(Object.keys(ITEMS));
  const blocks = new Set();
  for (const def of Object.values(BLOCK_DEFS)) {
    const key = String(def?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (key) blocks.add(key);
  }
  for (const [block, table] of Object.entries(BONUS_DROPS)) {
    for (const [item] of table) {
      assert.ok(known.has(item) || blocks.has(item), `${block} drops ${item}, which does not exist`);
    }
  }
});

// --- the drop that replaces the base one -------------------------------------

test('gravel gives flint instead of gravel, never both', () => {
  const gravel = BLOCKS.GRAVEL;
  // Vanilla's 10%, and the two sides of it. `flint` had no source anywhere in the game and is an ingredient
  // in fifty-three recipes -- `arrow` among them -- so without this nothing could be crafted from flint.
  assert.deepEqual(blockDrops(gravel, () => 0.05), [{ id: 'flint', isBlock: false, count: 1 }]);
  assert.deepEqual(blockDrops(gravel, () => 0.5)[0].id, gravel, 'a miss gives the gravel itself');
  assert.equal(blockDrops(gravel, () => 0.0999)[0].id, 'flint');
  assert.equal(blockDrops(gravel, () => 0.1001)[0].id, gravel);
  // "Instead of", not "as well as": one row either way.
  assert.equal(blockDrops(gravel, always).length, 1);
  assert.equal(blockDrops(gravel, never).length, 1);
});

test('a replacement rule does not disturb the blocks around it', () => {
  // The base drop and the bonus tables have to behave exactly as they did. Stone is the useful control: it
  // drops cobblestone rather than itself, so this also checks that the replacement rule has not flattened
  // the `drop`/`dropItem` distinction into "always the block".
  assert.deepEqual(blockDrops(BLOCKS.STONE, never), [{ id: BLOCKS.COBBLESTONE, isBlock: true, count: 1 }]);
  const leaves = blockDrops(BLOCKS.OAK_LEAVES, always);
  assert.equal(leaves[0].id, BLOCKS.OAK_LEAVES, 'a leaf still drops itself first');
  assert.ok(leaves.some((d) => d.id === 'apple'), 'and still rolls its bonuses');
  // Nothing else in the game has a replacement rule, which is the point of a named table.
  assert.deepEqual(Object.keys(REPLACEMENT_DROPS), ['gravel']);
});

test('every replacement names a registered block and a real item, at a real probability', () => {
  const names = new Set(Object.keys(BONUS_DROPS).length ? [] : []);
  for (const def of Object.values(BLOCK_DEFS)) {
    const key = String(def?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (key) names.add(key);
  }
  const known = new Set(Object.keys(ITEMS));
  for (const [block, rule] of Object.entries(REPLACEMENT_DROPS)) {
    assert.ok(names.has(block), `REPLACEMENT_DROPS.${block} names no block the game registers`);
    assert.ok(known.has(rule.id), `${block} replaces itself with ${rule.id}, which is not an item`);
    assert.ok(rule.chance > 0 && rule.chance < 1, `${block} has chance ${rule.chance}, which is not a probability`);
  }
  // And the block still drops itself when the roll misses, or the rule would be a way to delete blocks.
  const gravelId = BLOCKS.GRAVEL;
  assert.ok(baseBlockDrop(gravelId), 'the block a replacement belongs to must still have a base drop');
});

test('an item that flint is needed for is craftable now', () => {
  // The reason this mattered: `arrow` is flint and stick and feather, so with no flint there were no arrows.
  const source = readFileSync(join(process.cwd(), 'src', 'extraRecipes.js'), 'utf8');
  assert.match(source, /'flint'/, 'the arrow recipe should still name flint');
  // And gravel is what produces it, which is what the registry now records.
  assert.equal(replacementDropFor(BLOCKS.GRAVEL, always).id, 'flint');
  assert.equal(replacementDropFor(BLOCKS.STONE, always), null, 'stone has no replacement');
});

// --- the wiring --------------------------------------------------------------

test('the break path spawns every drop with its own isBlock', () => {
  // Checked at the source, because the bug was an argument in the wrong position and would read as
  // correct to anything but a reader who knows the signature. `spawnDroppedItem(pos, id, isBlock, count)`.
  const source = readFileSync(join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(source, /spawnDroppedItem\(pos, drop\.id, drop\.isBlock, drop\.count \?\? 1\)/,
    'the drop must be spawned with its own isBlock and a count');
  assert.doesNotMatch(source, /spawnDroppedItem\([^)]*drop\.count\)/,
    'and never with the count where isBlock belongs');
});
