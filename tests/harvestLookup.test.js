// The harvest table is generated for every vanilla block, so it runs ahead of the registry by design:
// 175 of its 1056 rows name a block this game does not have yet. That is a to-do list.
//
// Three rows were a defect instead. The table was keyed on `BLOCKS[name.toUpperCase()]`, and the game
// registers blocks through two routes -- `BLOCKS` constants and the generated content tables -- so
// `snow_block`, `potatoes` and `wither_skeleton_skull` had rows that could not be reached even though the
// blocks were registered. `wither_skeleton_skull` has no `drop` in its definition, so its harvest row was
// the only thing that would have made breaking one yield anything: it dropped nothing.
//
// The defect was invisible in the direction that mattered. `harvest-data` reported those blocks as
// "has no BLOCK_HARVEST row", which reads like missing data rather than unreachable data, and the fix is
// in the generator rather than in the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_DEFS } from '../src/blocks.js';
import { BLOCK_HARVEST, harvestDataFor, knownHarvestBlockIds } from '../src/blockHarvestData.js';
import { harvestOrphans, registry } from '../src/resourceRegistry.js';

test('no harvest row is unreachable although its block exists', () => {
  // The invariant the fix establishes, and the one a regeneration could break again.
  const { deadByKey } = harvestOrphans(registry());
  assert.deepEqual(deadByKey, [], 'these rows name a registered block that cannot reach them');
});

test('a harvest row is reachable when the block is registered under any name', () => {
  // All three were dead by key mismatch, and the first two are the ones that changed behaviour: `potatoes`
  // had no `drop` on its definition either, so potato was unobtainable from the crop that produces it.
  const byName = new Map();
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    const key = String(def?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (!key) continue;
    const existing = byName.get(key);
    if (existing === undefined || Number(id) < existing) byName.set(key, Number(id));
  }

  for (const [name, expectedDrop] of [['potatoes', 'potato'], ['snow_block', 'snowball'], ['wither_skeleton_skull', 'wither_skeleton_skull']]) {
    const id = byName.get(name);
    assert.equal(typeof id, 'number', `${name} should resolve to a block id by its definition name`);
    const row = harvestDataFor(id);
    assert.ok(row, `${name} (block ${id}) should have a reachable harvest row`);
    assert.equal(row.name, name);
    assert.ok(row.drops.includes(expectedDrop), `${name} should drop ${expectedDrop}, got ${JSON.stringify(row.drops)}`);
  }
});

test('the skull that dropped nothing now drops itself', () => {
  // Its block definition has no `drop`, so the harvest row is the entire mechanism.
  const id = Object.entries(BLOCK_DEFS).find(([, def]) => def.name === 'Wither Skeleton Skull')?.[0];
  assert.ok(id, 'the block should be registered');
  assert.equal(BLOCK_DEFS[id].drop, undefined, 'the definition declares no drop, which is why this mattered');
  assert.deepEqual(harvestDataFor(Number(id)).drops, ['wither_skeleton_skull']);
});

test('the orphan report splits a to-do list from a defect', () => {
  const { missingBlock, deadByKey } = harvestOrphans(registry());
  // Blocks this game does not have yet: expected, and the report names the drop each is holding ready.
  //
  // THE FLOOR HAS NOW BEEN LOWERED TWICE, FROM 100 TO 25 TO 5, and the second time is the instructive one:
  // 25 was still above the real figure, so the batch that brought orphans to 19 failed a test whose whole
  // subject is a list that is SUPPOSED to shrink. Setting a floor just below the current number guarantees
  // the next batch trips it. This one is low enough that no ordinary progress can reach it, and it exists
  // only to catch a report that has stopped working entirely. The shape checks below are the real test.
  assert.ok(missingBlock.length > 5, `the orphan report looks broken, got ${missingBlock.length}`);
  assert.ok(missingBlock.every((r) => typeof r.name === 'string' && Array.isArray(r.drops)));
  const holding = missingBlock.filter((r) => r.drops.length);
  assert.ok(holding.length > 0, 'some missing blocks should declare what they would drop');
  assert.deepEqual(deadByKey, [], 'and nothing may be unreachable');
});

test('every reachable harvest row belongs to a registered block', () => {
  // The other direction: a row in the table must not be keyed on an id nothing registered, or the table
  // would be carrying data for a block that does not exist.
  const reg = registry();
  const blockIds = new Set();
  for (const entry of reg.entries.values()) {
    if (entry.blockId !== null && entry.blockId !== undefined) blockIds.add(entry.blockId);
  }
  const strangers = knownHarvestBlockIds().filter((id) => !blockIds.has(id));
  assert.deepEqual(strangers, [], 'harvest rows keyed on a block id the registry never defined');
});

test('the generator carries the hand-written tail forward instead of deleting it', () => {
  // The blast-resistance rules were added straight to the generated file, and regenerating it deleted
  // them silently -- no import broke, the exports simply stopped existing. The generator now copies
  // everything from its marker to the end of the file. Checked at the source, because running the
  // generator inside a test would rewrite files.
  const generated = readFileSync(join(process.cwd(), 'src', 'blockHarvestData.js'), 'utf8');
  assert.match(generated, /\/\/ --- blast resistance/, 'the hand-written tail should still be in the file');
  assert.match(generated, /export const TNT_EXPLOSION_POWER/, 'and its exports should still exist');

  const generator = readFileSync(join(process.cwd(), 'scripts', 'generate-mc-data.mjs'), 'utf8');
  assert.match(generator, /HARVEST_TAIL_MARKER/, 'the generator should know about the tail');
  assert.match(generator, /harvestTail/, 'and append it');
  assert.match(generator, /no hand-written tail found/, 'and say so loudly when it cannot find one');
});
