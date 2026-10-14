// Frog breeding: https://minecraft.wiki/w/Frog#Breeding and https://minecraft.wiki/w/Frogspawn
//   - breeding makes no baby; one frog becomes pregnant and lays frogspawn on water (water block, air above)
//   - the frogspawn hatches after 3-10 minutes into 2-5 tadpoles
//   - breaking the frogspawn cancels the hatch
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { BLOCKS } from '../src/blocks.js';
import { FROGSPAWN_HATCH_SECONDS, findFrogspawnSpot, layFrogspawn, updateFrogspawn, makeFrogPregnant, updatePregnantFrog } from '../src/frogspawn.js';

function pond() {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  s.reset('frog');
  s.world.dimension = 'overworld';
  for (let x = 3; x <= 5; x++) for (let z = -1; z <= 1; z++) s.world.setVoxel(x, -1, z, BLOCKS.WATER);
  return s;
}

test('the hatch time is 3 to 10 minutes', () => {
  assert.deepEqual(FROGSPAWN_HATCH_SECONDS, { min: 180, max: 600 });
});

test('a frog finds water with air above it and lays frogspawn there', () => {
  const s = pond();
  const spot = findFrogspawnSpot(s.manager, s.mob);
  assert.ok(spot, 'a pond within 10 blocks is found');
  assert.equal(s.world.getVoxel(spot.x, spot.y - 1, spot.z), BLOCKS.WATER);
  assert.equal(s.world.getVoxel(spot.x, spot.y, spot.z), BLOCKS.AIR);

  makeFrogPregnant(s.mob);
  s.mob.mesh.position.set(spot.x + 0.5, 0, spot.z + 0.5);
  updatePregnantFrog(s.manager, s.mob, 0.05);
  assert.equal(s.world.getVoxel(spot.x, spot.y, spot.z), BLOCKS.FROGSPAWN);
  assert.equal(s.mob.isPregnant, false);
});

test('frogspawn hatches into 2-5 tadpoles after its timer, and not before', () => {
  const s = pond();
  const spot = findFrogspawnSpot(s.manager, s.mob);
  layFrogspawn(s.manager, spot, () => 0); // shortest timer: 180 s
  const before = s.manager.mobs.filter(m => m.type === 'tadpole').length;
  updateFrogspawn(s.manager, 170);
  assert.equal(s.world.getVoxel(spot.x, spot.y, spot.z), BLOCKS.FROGSPAWN, 'still frogspawn at 170 s');
  updateFrogspawn(s.manager, 15);
  assert.equal(s.world.getVoxel(spot.x, spot.y, spot.z), BLOCKS.AIR, 'hatched at 185 s');
  const hatched = s.manager.mobs.filter(m => m.type === 'tadpole').length - before;
  assert.ok(hatched >= 2 && hatched <= 5, `hatched ${hatched}`);
});

test('breaking the frogspawn cancels the hatch', () => {
  const s = pond();
  const spot = findFrogspawnSpot(s.manager, s.mob);
  layFrogspawn(s.manager, spot, () => 0);
  s.world.setVoxel(spot.x, spot.y, spot.z, BLOCKS.AIR);
  updateFrogspawn(s.manager, 1000);
  assert.equal(s.manager.mobs.filter(m => m.type === 'tadpole').length, 0);
  assert.equal(s.manager.frogspawn.length, 0);
});
