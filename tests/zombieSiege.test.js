// Zombie sieges (src/zombieSiege.js) against the wiki's Zombie siege page. Found by the wiki-tutorial play-test (Zombie
// siege defense): sieges did not exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZombieSiege } from '../src/zombieSiege.js';
import { BLOCKS } from '../src/blocks.js';

function game({ beds = [[0, 5, 0]], dark = true } = {}) {
  const spawned = [];
  const world = { getVoxel: (x, y, z) => (y <= 4 ? BLOCKS.GRASS : BLOCKS.AIR), getBlockLight: () => 0, getSkyLight: () => 15, light: { skyDarken: dark ? 11 : 0 }, structureOrientations: new Map() };
  return { spawned, g: { world, worldTime: 17990, difficulty: 'normal', currentDimension: 'overworld', player: { gamemode: 'survival', position: { x: 0.5, y: 5, z: 0.5 } },
    bedManager: { beds: new Map(beds.map((b, i) => [i, { footPos: b }])) }, mobs: { mobs: [], spawnMob: (t, x, y, z) => spawned.push({ t, x, y, z }) } } };
}

test('at midnight, 10% of nights: a player in a village starts a siege of up to 20 zombies, 3 ticks apart', () => {
  const { g, spawned } = game({ beds: [[0, 5, 0], [32, 5, 0], [-32, 5, 0], [0, 5, 32], [0, 5, -32]] });
  const siege = new ZombieSiege(g, () => 0.05);
  siege.update(0.05); g.worldTime = 18000; siege.update(0.05);
  for (let i = 0; i < 100; i++) siege.update(0.05);
  assert.deepEqual(siege.log.map((e) => e.event), ['decided', 'started', 'ended']);
  assert.equal(spawned.length, 20);
  assert.ok(spawned.every((s) => s.t === 'zombie'));
});

test('no siege on the other 90% of nights, outside a village, in daylight or on Peaceful', () => {
  const night = (opts, random, mutate) => { const { g, spawned } = game(opts); mutate?.(g); const s = new ZombieSiege(g, random); s.update(0.05); g.worldTime = 18000; for (let i = 0; i < 60; i++) s.update(0.05); return spawned.length; };
  assert.equal(night({}, () => 0.5), 0, 'the 90%');
  assert.equal(night({ beds: [[200, 5, 200]] }, () => 0.05), 0, 'not in a village');
  assert.equal(night({ dark: false }, () => 0.05), 0, 'daylight');
  assert.equal(night({}, () => 0.05, (g) => { g.difficulty = 'peaceful'; }), 0, 'Peaceful');
});
