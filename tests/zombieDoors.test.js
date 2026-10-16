// Zombies breaking wooden doors (src/zombieDoors.js). Wiki (Zombie): on Hard, up to 10% of zombies break a closed wooden
// door's top half in about 10 seconds; Tutorial:Trapdoor uses: not trapdoors.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS as B } from '../src/blocks.js';
import { updateDoorBreaking, rollCanBreakDoors, DOOR_BREAK_SECONDS } from '../src/zombieDoors.js';

function rig(difficulty = 'hard') {
  const voxels = new Map();
  const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? B.AIR, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id) };
  const game = { world, difficulty, player: { position: new THREE.Vector3(4.5, 5, 0.5), isDead: false } };
  const mob = { type: 'zombie', health: 20, canBreakDoors: true, mesh: { position: new THREE.Vector3(0.5, 5, 0.5) } };
  world.setVoxel(1, 5, 0, B.OAK_DOOR); world.setVoxel(1, 6, 0, B.OAK_DOOR_TOP);
  return { world, game, mob };
}

test('on Hard a door-breaking zombie takes about 10 seconds to break a closed wooden door', () => {
  const { world, game, mob } = rig();
  let r; for (let t = 0; t < DOOR_BREAK_SECONDS - 0.5; t += 0.5) r = updateDoorBreaking(game, mob, 0.5);
  assert.equal(r, 'breaking'); assert.equal(world.getVoxel(1, 6, 0), B.OAK_DOOR_TOP);
  r = updateDoorBreaking(game, mob, 0.6);
  assert.equal(r, 'broken'); assert.equal(world.getVoxel(1, 6, 0), B.AIR); assert.equal(world.getVoxel(1, 5, 0), B.AIR);
});

test('not on Normal, not an iron door, not a trapdoor', () => {
  const normal = rig('normal'); for (let i = 0; i < 30; i++) updateDoorBreaking(normal.game, normal.mob, 0.5);
  assert.equal(normal.world.getVoxel(1, 6, 0), B.OAK_DOOR_TOP);
  const iron = rig(); iron.world.setVoxel(1, 5, 0, B.IRON_DOOR); iron.world.setVoxel(1, 6, 0, B.IRON_DOOR_TOP);
  for (let i = 0; i < 30; i++) updateDoorBreaking(iron.game, iron.mob, 0.5);
  assert.equal(iron.world.getVoxel(1, 6, 0), B.IRON_DOOR_TOP);
  const trap = rig(); trap.world.setVoxel(1, 5, 0, B.AIR); trap.world.setVoxel(1, 6, 0, B.OAK_TRAPDOOR);
  for (let i = 0; i < 30; i++) updateDoorBreaking(trap.game, trap.mob, 0.5);
  assert.equal(trap.world.getVoxel(1, 6, 0), B.OAK_TRAPDOOR);
});

test('"Up to 10% of zombies", by regional difficulty', () => {
  let n = 0; let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) if (rollCanBreakDoors(rnd, 1)) n++;
  assert.ok(Math.abs(n / 20000 - 0.1) < 0.01);
  assert.equal(rollCanBreakDoors(() => 0.01, 0), false);
});
