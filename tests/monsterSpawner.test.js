// Monster spawners: range, the four attempts, the 200-799 tick wait, the cap of six, light, room and Peaceful.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MonsterSpawners, lightAllows, SPAWNER_RANGE, MIN_DELAY, MAX_DELAY } from '../src/monsterSpawner.js';
import { BLOCKS } from '../src/blocks.js';

function fixture({ light = 0, solidAbove = false, mob = 'zombie' } = {}) {
  const spawner = { x: 0, y: 10, z: 0, mob };
  const world = {
    getVoxel: (x, y, z) => (x === 0 && y === 10 && z === 0 ? BLOCKS.SPAWNER : y < 9 || (solidAbove && y > 9) ? BLOCKS.STONE : BLOCKS.AIR),
    getLightLevel: () => light,
    spawners: () => [spawner]
  };
  const mobs = { mobs: [], spawnMob(type, x, y, z) { const m = { type, mesh: { position: { x, y, z } } }; this.mobs.push(m); return m; } };
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return { spawners: new MonsterSpawners({ world, mobs, random }), mobs, spawner };
}
const near = { position: { x: 3, y: 10, z: 3 }, gamemode: 'survival' };
const run = (s, player, ticks, opts) => { let n = 0; for (let i = 0; i < ticks; i++) n += s.tick(player, opts); return n; };

test('a spawner spawns its mob only with a player within 16 blocks, never in spectator', () => {
  const a = fixture();
  assert.equal(run(a.spawners, { position: { x: SPAWNER_RANGE + 2, y: 10, z: 0 }, gamemode: 'survival' }, 400), 0);
  assert.equal(run(a.spawners, { ...near, gamemode: 'spectator' }, 400), 0);
  const b = fixture();
  assert.ok(run(b.spawners, near, 40) > 0);
  assert.ok(b.mobs.mobs.every((m) => m.type === 'zombie' && Math.abs(m.mesh.position.x) <= 4.5 && Math.abs(m.mesh.position.y - 10) <= 1));
});

test('after a successful cycle it waits 200-799 ticks; six nearby stop it', () => {
  const a = fixture();
  run(a.spawners, near, 21);
  const first = a.mobs.mobs.length;
  assert.ok(first >= 1 && first <= 4);
  const wait = a.spawners.delays.get('0,10,0');
  assert.ok(wait >= MIN_DELAY - 1 && wait <= MAX_DELAY);
  run(a.spawners, near, 3000);
  assert.ok(a.mobs.mobs.length <= 6 + 3, `${a.mobs.mobs.length} mobs: the cap holds`);
});

test('light and Peaceful', () => {
  assert.equal(lightAllows('zombie', 1), false);
  assert.equal(lightAllows('zombie', 0), true);
  assert.equal(lightAllows('blaze', 11), true);
  assert.equal(lightAllows('blaze', 12), false);
  assert.equal(lightAllows('magma_cube', 15), true);
  assert.equal(run(fixture({ light: 7 }).spawners, near, 400), 0, 'a lit zombie spawner is off');
  assert.equal(run(fixture().spawners, near, 400, { difficulty: 'peaceful' }), 0);
  assert.equal(run(fixture({ solidAbove: true }).spawners, near, 400), 0, 'no room for a two-block-tall zombie');
  assert.ok(run(fixture({ solidAbove: true, mob: 'silverfish' }).spawners, near, 400) > 0, 'a silverfish fits in one block');
});
