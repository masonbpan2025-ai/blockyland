// Woodland mansions: the Blueprints page's rooms on our floor plan -- three floors (the top one smaller), corridors,
// a secret room, walls, the entrance, the cobblestone foundation; vindicators, evokers above the ground floor, allays
// in jails; mansion loot. Card WM1-WM5 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMansion, generateMansion, realizeMansion, ROOMS, JAILS, SECRET_ROOMS, MANSION_LOOT } from '../src/worldgen/generators/mansion.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('the rooms are the Blueprints page\'s drawings', () => {
  assert.ok(generatorCoverage().implemented.includes('mansion'));
  assert.ok(ROOMS.length >= 50);
  for (const r of [...JAILS, ...SECRET_ROOMS]) assert.ok(ROOMS.includes(r), r);
});

test('three floors with the top one smaller, a foundation down to the ground, mobs where the wiki puts them', () => {
  for (let s = 1; s <= 5; s++) {
    const { canvas, pieces } = buildMansion({ seed: s, x: 0, y: 30, z: 0, groundAt: (x) => (x < 30 ? 22 : 28) });
    const floors = [...new Set(pieces.filter((p) => p.kind === 'room').map((p) => p.box.minY))];
    assert.equal(floors.length, 3);
    const cells = [...canvas.cells.values()];
    assert.equal(cells.find((c) => c.x === 5 && c.y === 25 && c.z === 5)?.name, 'cobblestone', 'the foundation fills the gap');
    for (const e of canvas.entities) {
      if (e.type === 'evoker') assert.ok(e.y >= 38, 'no evoker on the ground floor');
      if (e.type === 'allay') assert.ok(pieces.some((p) => JAILS.includes(p.name) && p.box.contains(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))));
    }
    for (const c of cells.filter((x) => x.name === 'chest')) assert.equal(c.nbt.LootTable, MANSION_LOOT);
    assert.ok(cells.every((c) => c.y <= 62));
  }
});

test('realization resolves every block', () => {
  const st = generateMansion({ seed: 3, chunkX: 8, chunkZ: 8, structureId: 'mansion', context: { surfaceY: () => 28 } });
  assert.deepEqual(realizeMansion(st, () => true, BLOCKS).missingBlocks, []);
});
