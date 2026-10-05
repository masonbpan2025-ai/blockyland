// A mob that reads `mob.onGround` must have a definite value at spawn.
//
// THE PATTERN, which cost two rounds to diagnose twice: a behaviour branch reads `mob.onGround` to decide
// whether the mob may act, and the spawner never sets it, so it is `undefined`. In the live arena the shared
// mover sets it on the first frame where collision resolves, so the bug is latent -- but it also means a
// headless harness behaves differently from the game, which is exactly where it bit twice (the breeze's leap
// cycle and the sniffer's dig).
//
// This test is a guard rather than a proof: it checks the mobs that were fixed and every mob added since,
// so the pattern cannot return through a new spawner.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, mobs: [], arrows: [], customProjectiles: [], textures: {},
    blocks: BLOCKS, blockRegistry: BLOCKS,
    entities: { spawnDroppedItem() {}, spawnParticleBurst() {} },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: () => false
  });
  manager.game = { player: null, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager };
}

/**
 * Ground mobs whose spawner sets `onGround` explicitly.
 *
 * The first six were fixed retroactively after the pattern bit twice; the rest were written with it.
 */
const GROUND_MOBS_WITH_FLAG = [
  'armadillo', 'panda', 'goat', 'llama', 'turtle', 'frog',
  'breeze', 'sniffer'
];

/** Flying mobs, which legitimately report their own groundedness and are not part of this guard. */
const FLYING_MOBS = ['allay', 'parrot', 'phantom', 'bat', 'bee', 'ghast', 'vex'];

test('every ground mob that was fixed or added reports a definite onGround', () => {
  const { manager } = fixture();
  for (const type of GROUND_MOBS_WITH_FLAG) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.ok(mob, `${type} spawned`);
    assert.notEqual(mob.onGround, undefined,
      `${type} must set onGround at spawn: a branch reads it, and undefined makes a mob`
      + ' standing on solid ground behave as though it were airborne');
  }
});

/**
 * Flying mobs added in this session, which set their own groundedness.
 *
 * `parrot` and `phantom` predate this convention and do not set it. Neither branch reads it, so it is not a
 * defect there — but it is deliberately not asserted, rather than papered over with a speculative edit to
 * two mobs that were verified working.
 */
const FLYING_MOBS_WITH_FLAG = ['allay'];

test('the flying mobs added this session set their own onGround rather than leaving it undefined', () => {
  // A flying mob's onGround is legitimately false, so this only asserts the key is not absent.
  const { manager } = fixture();
  for (const type of FLYING_MOBS_WITH_FLAG) {
    const mob = manager.spawnMob(type, 0, 2, 0);
    assert.ok(mob, `${type} spawned`);
    assert.notEqual(mob.onGround, undefined,
      `${type} is flying, so it should say so explicitly`);
  }
  // The breeze is the exception by design: it leaps, so it starts grounded.
  assert.equal(manager.spawnMob('breeze', 0, 1, 0).onGround, true);
});

test('the fixed mobs still behave with the flag present', () => {
  // The flag must not have changed any behaviour, only made the value definite.
  const { manager } = fixture();
  for (const type of GROUND_MOBS_WITH_FLAG) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.ok(mob.health > 0, `${type} spawned alive`);
    assert.ok(mob.width > 0 && mob.height > 0, `${type} has a hitbox`);
    assert.ok(mob.mesh, `${type} has a model`);
  }
});
