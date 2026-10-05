// Archaeology: brushing a suspicious block for a pottery sherd.
//
// This game had the two halves already -- `SUSPICIOUS_SAND` and `SUSPICIOUS_GRAVEL` registered as blocks that
// drop nothing, and a brush with durability -- and not the twenty-three sherds, so brushing a suspicious block
// had nothing to give. They were the largest cluster left in the "vanilla item name(s) absent" report.
//
// Vanilla picks the sherd from a per-structure pool, and this game has no structures, so there is one pool of
// all twenty-three and the roll is uniform. Every sherd is obtainable; the distribution is not vanilla's. That
// is stated in `src/archaeology.js` and repeated here, because a simplification that only lives in a comment
// is one nobody reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';
import {
  BRUSH_DURABILITY_PER_USE, BRUSH_USES, SHERD_POOL, SUSPICIOUS_BLOCKS, brushSuspiciousBlock,
  isSuspiciousBlock, sherdDrop, sherdPool,
} from '../src/archaeology.js';
import { codeDropSources } from '../src/codeDropSources.js';

test('every pottery sherd is an item with an icon', () => {
  assert.equal(SHERD_POOL.length, 23, 'vanilla has twenty-three pottery sherds');
  assert.equal(new Set(SHERD_POOL).size, SHERD_POOL.length, 'and no duplicates');
  for (const sherd of SHERD_POOL) {
    assert.ok(ITEMS[sherd], `${sherd} should be an item`);
    assert.match(sherd, /_pottery_sherd$/, `${sherd} should be named like one`);
    assert.equal(ITEMS[sherd].isBlock, undefined, 'a sherd is not placed');
    assert.equal(stackLimitFor(sherd), 64, 'and it stacks, unlike the pot it decorates');
    assert.equal(existsSync(`public/assets/items/${sherd}.png`), true, `${sherd} has no icon`);
  }
  // The names are vanilla's, so a typo cannot quietly create a twenty-fourth.
  const vanilla = new Set(JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8')).map((item) => item.name));
  for (const sherd of SHERD_POOL) assert.ok(vanilla.has(sherd), `${sherd} is not a vanilla item name`);
});

test('the brush works on a suspicious block and on nothing else', () => {
  // The two blocks, by the names the game registers them under.
  for (const name of SUSPICIOUS_BLOCKS) {
    assert.equal(isSuspiciousBlock(name), true, `${name} should be brushable`);
    const found = brushSuspiciousBlock({ id: 'brush' }, name, () => 0);
    assert.ok(found, `${name} should give something up`);
    assert.equal(found.sherd, SHERD_POOL[0], 'the first of the pool at roll zero');
    assert.equal(found.durabilityUsed, BRUSH_DURABILITY_PER_USE);
  }
  // The blocks are really registered, and they really drop nothing: the brush is what empties them, which is
  // why their definitions have no drop.
  for (const name of SUSPICIOUS_BLOCKS) {
    const id = BLOCKS[name.toUpperCase().replace(/^SUSPICIOUS_/, 'SUSPICIOUS_')];
    assert.equal(typeof id, 'number', `${name} should be a registered block`);
    assert.equal(BLOCK_DEFS[id]?.drop, null, `${name} should drop nothing when mined`);
    assert.equal(BLOCK_DEFS[id]?.dropItem, undefined, 'and name no item either');
  }
  // Negatives: not a brush, not a suspicious block.
  assert.equal(brushSuspiciousBlock({ id: 'shovel' }, 'suspicious_sand', () => 0), null);
  assert.equal(brushSuspiciousBlock({ id: 'brush', isBlock: true }, 'suspicious_sand', () => 0), null);
  assert.equal(brushSuspiciousBlock(null, 'suspicious_sand', () => 0), null);
  assert.equal(brushSuspiciousBlock({ id: 'brush' }, 'sand', () => 0), null);
  assert.equal(brushSuspiciousBlock({ id: 'brush' }, 'suspicious_sandstone', () => 0), null,
    'a name that merely starts the same way is not a suspicious block');
});

test('a brush lasts four suspicious blocks, which is what its durability says', () => {
  assert.equal(BRUSH_DURABILITY_PER_USE * BRUSH_USES, ITEMS.brush.durability,
    'sixteen times four should be the sixty-four durability the brush declares');
});

test('every sherd is reachable, and the roll covers the whole pool', () => {
  // Roll zero gives the first and a roll just short of one gives the last, so the floor arithmetic is
  // exercised at both ends rather than trusted.
  assert.equal(sherdDrop(() => 0), SHERD_POOL[0]);
  assert.equal(sherdDrop(() => 0.999999), SHERD_POOL[SHERD_POOL.length - 1]);
  assert.equal(sherdDrop(() => 1), SHERD_POOL[SHERD_POOL.length - 1], 'a roll of exactly one stays in range');
  assert.equal(sherdDrop(() => -1), SHERD_POOL[0], 'and so does a negative one');
  // Every sherd comes up for some roll, which is the claim "every one is obtainable".
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(sherdDrop(() => i / 200));
  assert.equal(seen.size, SHERD_POOL.length, 'the pool should be fully covered');
  assert.deepEqual(sherdPool().sort(), [...SHERD_POOL].sort(), 'and the exposed pool is the whole pool');
});

test('the Inspector is told where a sherd comes from', () => {
  // Derived from the pool, so a sherd that left the pool takes its entry with it.
  const entries = codeDropSources().filter((entry) => entry.item.endsWith('_pottery_sherd'));
  assert.equal(entries.length, SHERD_POOL.length, 'every sherd should have a source entry');
  for (const entry of entries) {
    assert.match(entry.source, /^archaeology\.js /, `${entry.item} should name the module`);
    assert.match(entry.how, /Brushed/, `${entry.item} should say how`);
  }
});

test('the brush is wired to the block, not merely written', () => {
  // A deliberate wiring check, as for the fish buckets and bundles: a rule in a module nobody calls is a rule
  // that does nothing. `main.js` owns using an item on the world.
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /brushSuspiciousBlock\(/, 'the brush rule is never called');
  assert.match(main, /BLOCKS\.SUSPICIOUS_GRAVEL \? BLOCKS\.GRAVEL : BLOCKS\.SAND/,
    'and an emptied block becomes plain sand or gravel');
});
