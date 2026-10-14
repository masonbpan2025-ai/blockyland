// Mineshafts: the room, corridors with supports five apart and rails, crossings, staircases, abandoned passageways
// with cave spider spawners, chest minecarts, bridges over caves, badlands wood. Cards MS1-MS4 + W1 run in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMineshaft, generateMineshaft, realizeMineshaft, MAX_REACH, MINESHAFT_LOOT } from '../src/worldgen/generators/mineshaft.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

const solidBelow = (top) => (x, y) => y <= top;

test('both ids are implemented', () => {
  for (const id of ['mineshaft', 'mineshaft_mesa']) assert.ok(generatorCoverage().implemented.includes(id));
});

test('pieces: one 10x10 room, corridors, crossings and staircases, all within reach and none overlapping', () => {
  const kinds = {};
  for (let s = 1; s <= 25; s++) {
    const { pieces } = buildMineshaft({ seed: s, x: 0, y: 20, z: 0, solidAt: solidBelow(60) });
    const rooms = pieces.filter((p) => p.kind === 'room');
    assert.equal(rooms.length, 1);
    for (const p of pieces) {
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      assert.ok(Math.max(Math.abs(p.box.minX - 5), Math.abs(p.box.maxX - 5), Math.abs(p.box.minZ - 5), Math.abs(p.box.maxZ - 5)) <= MAX_REACH);
    }
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) assert.ok(!pieces[i].box.intersects(pieces[j].box), `seed ${s}: pieces ${i} and ${j} overlap`);
  }
  for (const k of ['corridor', 'crossing', 'stairs']) assert.ok(kinds[k] > 0, k);
});

test('supports and rails; abandoned passageways; chest minecarts; badlands dark oak', () => {
  let spawners = 0; let carts = 0;
  for (let s = 1; s <= 40; s++) {
    const { canvas } = buildMineshaft({ seed: s, x: 0, y: 20, z: 0, solidAt: solidBelow(60) });
    const cells = [...canvas.cells.values()];
    assert.equal(cells.filter((c) => c.name === 'oak_fence').length % 2, 0);
    assert.ok(cells.some((c) => c.name === 'rail'));
    for (const sp of cells.filter((c) => c.name === 'spawner')) {
      spawners++;
      assert.equal(sp.nbt.SpawnData.entity.id, 'minecraft:cave_spider');
      assert.ok(cells.filter((c) => c.name === 'cobweb' && Math.abs(c.x - sp.x) <= 2 && Math.abs(c.y - sp.y) <= 2 && Math.abs(c.z - sp.z) <= 2).length >= 8);
    }
    for (const e of canvas.entities) { carts++; assert.equal(e.type, 'chest_minecart'); assert.equal(e.options.lootTable, MINESHAFT_LOOT); }
    assert.ok(!cells.some((c) => c.name === 'chest'));
  }
  assert.ok(spawners > 0 && carts > 0);
  const mesa = buildMineshaft({ seed: 3, x: 0, y: 20, z: 0, mesa: true, solidAt: solidBelow(60) });
  const names = new Set([...mesa.canvas.cells.values()].map((c) => c.name));
  assert.ok(names.has('dark_oak_planks') && !names.has('oak_planks'));
});

test('a corridor over a cave becomes a plank bridge held by a chain or a log', () => {
  // A cave: no ground between y 5 and 18 for x >= 20.
  const cave = (x, y) => (x >= 20 && y >= 5 && y <= 18 ? false : y <= 60);
  let bridges = 0; let holders = 0;
  for (let s = 1; s <= 20; s++) {
    const { canvas } = buildMineshaft({ seed: s, x: 0, y: 18, z: 0, solidAt: cave });
    for (const c of canvas.cells.values()) {
      if (c.x >= 20 && c.y === 18 && c.name === 'oak_planks') bridges++;
      if (c.x >= 20 && (c.name === 'chain' || c.name === 'oak_log')) holders++;
    }
  }
  assert.ok(bridges > 0 && holders > 0, `${bridges} bridge planks, ${holders} holders`);
});

test('realization resolves every block and stays above the world floor', () => {
  for (let i = 0; i < 6; i++) {
    const s = generateMineshaft({ seed: 4, chunkX: i * 9, chunkZ: 1, structureId: 'mineshaft', context: { surfaceY: () => 30 } });
    const r = realizeMineshaft(s, () => true, BLOCKS);
    assert.deepEqual(r.missingBlocks, []);
    assert.ok(s.box.minY >= 0);
  }
});
