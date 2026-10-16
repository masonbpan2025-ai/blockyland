// Villagers summoning iron golems when panicking (src/golemSummoning.js). Wiki (Iron Golem, Villages; Villager, Panicking).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS as B } from '../src/blocks.js';
import { updateGolemSummoning, PANIC_RADIUS } from '../src/golemSummoning.js';

function rig({ villagers = 3, beds = true, zombieAt = 6 } = {}) {
  const world = { getVoxel: (x, y, z) => (y < 5 ? B.STONE : B.AIR) };
  const mobs = [];
  const game = { world, random: () => 0.5, bedManager: { beds: new Map(beds ? [['b', { footPos: [0, 5, 10] }]] : []) }, mobs: { mobs, spawnMob: (type, x, y, z) => { const m = { type, health: 100, mesh: { position: new THREE.Vector3(x, y, z) } }; mobs.push(m); return m; } } };
  for (let i = 0; i < villagers; i++) mobs.push({ type: 'villager', health: 20, mesh: { position: new THREE.Vector3(i * 2 + 0.5, 5, 0.5) } });
  if (zombieAt !== null) mobs.push({ type: 'zombie', health: 20, mesh: { position: new THREE.Vector3(zombieAt + 0.5, 5, 0.5) } });
  return { game, mobs };
}
const run = (game, mobs, seconds = 29) => { let golems = 0; for (let t = 0; t < seconds; t += 0.5) for (const m of [...mobs]) if (updateGolemSummoning(game, m, 0.5, t)) golems++; return golems; };

test('three panicking villagers with beds summon an iron golem, then not again for 30 s', () => {
  const { game, mobs } = rig();
  assert.equal(PANIC_RADIUS.zombie, 8); assert.equal(PANIC_RADIUS.pillager, 15);
  assert.equal(run(game, mobs, 29), 1, 'one golem within 30 seconds');
  assert.ok(mobs.some((m) => m.type === 'iron_golem'));
});

test('two villagers are not enough; no beds, no golem; no zombie in range, no panic', () => {
  assert.equal(run(...Object.values(rig({ villagers: 2 }))), 0);
  assert.equal(run(...Object.values(rig({ beds: false }))), 0);
  assert.equal(run(...Object.values(rig({ zombieAt: 20 }))), 0);
});

test('Witch (1.21): always 4-8 redstone; the pool gives sticks about twice as often as sugar', async () => {
  const { MobManager } = await import('../src/mobs.js');
  const counts = {}; let minRed = 99, maxRed = 0;
  for (let i = 0; i < 3000; i++) {
    const rows = MobManager.prototype.getMobDeathDrops.call({ game: null, mobs: [] }, { type: 'witch', mesh: { position: new THREE.Vector3() } });
    const red = rows.filter((r) => r[0] === 'redstone').reduce((n, r) => n + r[2], 0);
    minRed = Math.min(minRed, red); maxRed = Math.max(maxRed, red);
    for (const r of rows) counts[r[0]] = (counts[r[0]] ?? 0) + r[2];
  }
  assert.equal(minRed, 4); assert.equal(maxRed, 8);
  assert.ok(counts.gunpowder > 0 && counts.spider_eye > 0, 'gunpowder and spider eyes are in the pool');
  assert.ok(counts.stick / counts.sugar > 1.6 && counts.stick / counts.sugar < 2.5, `stick:sugar ${counts.stick / counts.sugar}`);
});
