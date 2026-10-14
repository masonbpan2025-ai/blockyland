// Trial chambers: the described path (corridor end, chambers, intersection, atrium, entrance), the mob categories,
// trial spawners and vaults the game runs, the loot tables; inside this world. Card TC1-TC4 + W1 runs in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialChambers, generateTrialChambers, realizeTrialChambers, MOB_CATEGORIES } from '../src/worldgen/generators/trialChambers.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('implemented; the path is the wiki\'s', () => {
  assert.ok(generatorCoverage().implemented.includes('trial_chambers'));
  for (let s = 1; s <= 8; s++) {
    const { pieces } = buildTrialChambers({ seed: s, x: 0, y: 8, z: 0 });
    assert.equal(pieces[0].kind, 'corridor_end');
    assert.ok(pieces.some((p) => p.kind === 'intersection') && pieces.some((p) => p.kind === 'atrium'));
  }
});

test('one mob per category for the whole structure, the breeze always; even odds within a category', () => {
  const melee = {};
  for (let s = 1; s <= 300; s++) {
    const { mobs, canvas } = buildTrialChambers({ seed: s * 7, x: 0, y: 8, z: 0 });
    assert.equal(mobs.breeze, 'breeze');
    melee[mobs.melee] = (melee[mobs.melee] ?? 0) + 1;
    for (const c of [...canvas.cells.values()].filter((x) => x.name === 'trial_spawner')) assert.equal(c.nbt.trialSpawner.mob, mobs[c.nbt.trialSpawner.category]);
  }
  for (const m of MOB_CATEGORIES.melee) assert.ok(melee[m] > 70 && melee[m] < 130, JSON.stringify(melee));
});

test('vaults (some ominous), chests with trial chamber loot, inside the world, every block resolves', () => {
  let ominous = 0;
  for (let s = 1; s <= 10; s++) {
    const cells = [...buildTrialChambers({ seed: s, x: 0, y: 8, z: 0 }).canvas.cells.values()];
    assert.ok(cells.some((c) => c.name === 'vault'));
    ominous += cells.filter((c) => c.name === 'vault' && c.nbt.vault.ominous).length;
    for (const c of cells.filter((x) => x.name === 'chest')) assert.match(c.nbt.LootTable, /trial_chambers/);
    assert.ok(cells.every((c) => c.y >= 1 && c.y <= 62));
  }
  assert.ok(ominous > 0);
  const st = generateTrialChambers({ seed: 2, chunkX: 34, chunkZ: 0, structureId: 'trial_chambers', context: {} });
  assert.deepEqual(realizeTrialChambers(st, () => true, BLOCKS).missingBlocks, []);
});
