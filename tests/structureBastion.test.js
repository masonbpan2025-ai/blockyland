// Bastion remnants: the four types built to the wiki's descriptions, their loot, the piglin odds, hoglins in the
// stables, the treasure room's gold, chests and magma cube spawner, floating. Card BR1-BR5 + W1 runs in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBastion, generateBastion, realizeBastion, BASTION_TYPES, BASTION_LOOT, PIGLIN_ODDS } from '../src/worldgen/generators/bastion.js';
import { createStructureEngine, generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

const cellsOf = (b) => [...b.canvas.cells.values()];

test('registered in the Nether, never in the basalt deltas, and it floats', () => {
  assert.ok(generatorCoverage().implemented.includes('bastion_remnant'));
  const engine = createStructureEngine({ seed: 1, dimension: 'nether', blockIds: BLOCKS, biomeAt: () => 'nether_wastes', surfaceY: () => 20 });
  assert.ok(!engine.registry.bastion_remnant.biomes.includes('basalt_deltas'));
  assert.equal(engine.registry.bastion_remnant.terrainAdaptation ?? 'none', 'none');
});

test('each type has what the wiki says', () => {
  const t = (type) => cellsOf(buildBastion({ seed: 4, type, x: 0, y: 28, z: 0 }));
  const housing = t('housing');
  assert.ok(housing.some((c) => c.name === 'nether_wart') && housing.some((c) => c.name === 'soul_sand'), 'nether wart in the courtyard');
  const stables = buildBastion({ seed: 4, type: 'hoglin_stable', x: 0, y: 28, z: 0 });
  assert.ok(stables.canvas.entities.filter((e) => e.type === 'hoglin').length >= 6, 'hoglins in the stables');
  const treasure = t('treasure');
  const spawners = treasure.filter((c) => c.name === 'spawner');
  assert.equal(spawners.length, 1);
  assert.equal(spawners[0].nbt.SpawnData.entity.id, 'minecraft:magma_cube');
  assert.ok(treasure.some((c) => c.name === 'chain' && c.x === spawners[0].x && c.y === spawners[0].y + 1), 'hanging from a chain');
  const chests = treasure.filter((c) => c.name === 'chest');
  const treasures = chests.filter((c) => c.nbt.LootTable === BASTION_LOOT.treasure).length;
  assert.ok(treasures >= 1 && treasures <= 2);
  assert.ok(chests.some((c) => c.nbt.LootTable === BASTION_LOOT.generic));
  assert.ok(treasure.some((c) => c.name === 'lava') && treasure.filter((c) => c.name === 'gold_block').length >= 8);
  const bridge = t('bridge');
  assert.ok(bridge.filter((c) => c.name === 'gold_block').length >= 16 && bridge.some((c) => c.nbt?.LootTable === BASTION_LOOT.bridge));
});

test('piglins: 10% brute, 40% sword, 40% crossbow, 10% none', () => {
  const n = { brute: 0, sword: 0, crossbow: 0 }; let rolls = 0;
  for (let s = 1; s <= 120; s++) {
    for (const type of BASTION_TYPES) {
      const b = buildBastion({ seed: s, type, x: 0, y: 28, z: 0 });
      for (const e of b.canvas.entities) {
        if (e.type === 'piglin_brute') n.brute++;
        else if (e.type === 'piglin') n[e.options.weapon === 'golden_sword' ? 'sword' : 'crossbow']++;
      }
    }
  }
  const spawned = n.brute + n.sword + n.crossbow;
  assert.ok(Math.abs(n.brute / spawned - PIGLIN_ODDS.brute / 0.9) < 0.04, JSON.stringify(n));
  assert.ok(Math.abs(n.sword / spawned - PIGLIN_ODDS.sword / 0.9) < 0.05, JSON.stringify(n));
});

test('all four types occur; every block resolves; inside this world', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const s = generateBastion({ seed: 3, chunkX: i * 5, chunkZ: 2, structureId: 'bastion_remnant', context: { surfaceY: () => 20 } });
    seen.add(s.meta.type);
    assert.ok(s.box.minY >= 1 && s.box.maxY <= 63, s.box.toArray().join());
    if (i < 4) assert.deepEqual(realizeBastion(s, () => true, BLOCKS).missingBlocks, []);
  }
  assert.deepEqual([...seen].sort(), [...BASTION_TYPES].sort());
});
