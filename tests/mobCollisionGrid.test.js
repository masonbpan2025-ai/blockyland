// Mob separation through a grid (mobs.js applyMobCollisions). Every pair of mobs used to be tested twice a frame; a
// village of 434 mobs made 190,000 tests and cost 11 ms. Only mobs in neighbouring cells are tested now, and the
// result must be exactly what the full scan gave -- here against the captured original, in the crowds where a mob is
// pushed across cells while the pass runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { originalMobCollisions } from './helpers/reefMobBaseline.js';
import { makeMob, makeManager, snapshot } from './helpers/reefMobFixture.js';

function crowd(count, spread, { x = 0, z = 0, seed = 11 } = {}) {
  let s = seed;
  const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const types = ['villager', 'cow', 'pig', 'iron_golem', 'chicken', 'giant', 'horse', 'cat'];
  const mobs = [];
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(random() * types.length)];
    // Some exactly on top of one another, as a spawner's mobs are.
    const at = i % 17 === 0 && mobs.length ? mobs[mobs.length - 1].mesh.position : { x: x + random() * spread, z: z + random() * spread };
    mobs.push(makeMob(type, at.x, 20, at.z, { isBaby: random() < 0.2 }));
  }
  return makeManager(mobs);
}

for (const [name, count, spread, at] of [
  ['a pile in a two-block pen', 120, 2, {}],
  ['a crowd across cell edges at negative coordinates', 300, 9, { x: -7, z: -7 }],
  ['a village spread over sixty blocks', 434, 60, {}],
]) test(`${name}: the same pushes as testing every pair`, () => {
  const original = crowd(count, spread, at), grid = crowd(count, spread, at);
  for (let frame = 0; frame < 10; frame++) {
    originalMobCollisions.call(original, 1 / 60);
    grid.applyMobCollisions(1 / 60);
    assert.deepEqual(snapshot(grid.mobs), snapshot(original.mobs), `frame ${frame}`);
  }
});
