// A villager with no job site in reach looks for one less and less often (mobs.js villager update), and at once again
// when one is placed. A search reads ~9,800 cells; a village of 105 job seekers spent 3 ms a frame finding nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { MobManager } from '../src/mobs.js';

function village() {
  const world = new World(77);
  world.reseed(77);
  const manager = new MobManager(new THREE.Scene(), world, null, null);
  const player = {
    position: new THREE.Vector3(40, 10, 40), velocity: new THREE.Vector3(), gamemode: 'creative', health: 20, keys: {}, onGround: true,
    statusEffects: new Map(), inventory: { hotbar: [], storage: [], active: null, getActiveItem() { return null; } },
    hasStatusEffect: () => false, takeDamage() {},
  };
  Object.assign(manager, { game: { player, worldTime: 6000, dayCount: 1, difficulty: 'peaceful', controls: {}, weather: { weatherType: 'clear' } } });
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) world.getOrCreateChunk(cx, cz);
  const villager = manager.spawnVillager(0.5, world.getHighestSolidY(0, 0) + 1, 0.5, 'unemployed');
  const run = (seconds) => { for (let i = 0; i < seconds * 10; i++) manager.update(0.1, player); };
  return { world, manager, villager, run };
}

test('a villager with no job site near looks again less and less often, every 30 s at most', () => {
  const { villager, run } = village();
  run(60);
  assert.equal(villager.workstation ?? null, null, 'no job site within reach of this spot');
  assert.ok(villager.jobSearchFailures >= 3, `${villager.jobSearchFailures} searches came up empty`);
  assert.ok(villager.workstationCheckTimer > 2 && villager.workstationCheckTimer <= 30, `next search in ${villager.workstationCheckTimer.toFixed(1)} s`);
});

test('a job site placed brings it back to the two-second check, and it takes the job', () => {
  const { world, villager, run } = village();
  run(60);
  assert.ok(villager.workstationCheckTimer > 2);
  const p = villager.mesh.position;
  world.setVoxel(Math.floor(p.x) + 2, Math.floor(p.y), Math.floor(p.z), BLOCKS.COMPOSTER);
  run(2.5);
  assert.ok(villager.workstation, 'it found the composter within the usual two seconds');
  assert.equal(villager.profession, 'farmer');
  assert.equal(villager.jobSearchFailures, 0);
});
