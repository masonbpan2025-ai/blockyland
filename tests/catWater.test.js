// A cat by a sunken pool walked over the rim, dropped into the water and drowned (play-test screenshot).
// Two rules were missing: stepping off a ledge into water counts as walking into water, and land mobs with
// Java's FloatGoal swim up to the surface instead of sinking.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob, FLOATS_IN_WATER } from '../src/mobMotion.js';

/** Ground is y<0; `cells` lists [x,y,z,id] overrides. */
function rig(cells) {
  const edits = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  const world = {
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      return edits.get(`${x},${y},${z}`) ?? (y < 0 ? BLOCKS.STONE : BLOCKS.AIR);
    },
  };
  const solid = v => v !== BLOCKS.AIR && v !== BLOCKS.WATER;
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene: new THREE.Scene(), mobs: [], arrows: [], customProjectiles: [],
    sounds: new Proxy({}, { get: () => () => {} }),
    isBlockSolid: (x, y, z) => solid(world.getVoxel(x, y, z)),
    getMobDimensions: () => ({ width: 0.6, height: 0.7 }),
  });
  manager.checkMobCollision = (mob, p) => solid(world.getVoxel(p.x, p.y, p.z));
  return manager;
}

function cat(manager, at) {
  const mob = {
    type: 'cat', height: 0.7, mesh: { position: new THREE.Vector3(...at), rotation: { y: 0 } },
    velocity: new THREE.Vector3(), knockback: new THREE.Vector3(), yaw: Math.PI / 2,
    health: 10, maxHealth: 10, onGround: true,
  };
  manager.mobs.push(mob);
  return mob;
}

/** A pool x=2..4 whose surface is `drop` blocks below the ground the cat walks on, with a stone floor under it. */
function pool(drop) {
  const cells = [];
  for (let x = 2; x <= 4; x++) for (let z = -2; z <= 2; z++) {
    for (let y = -1; y > -drop; y--) cells.push([x, y, z, BLOCKS.AIR]);
    cells.push([x, -drop, z, BLOCKS.WATER]);
  }
  return cells;
}

for (const drop of [1, 2]) test(`a cat does not walk into a pond whose surface is ${drop} below its feet`, () => {
  const manager = rig(pool(drop));
  const mob = cat(manager, [0.5, 0, 0.5]);
  for (let i = 0; i < 300; i++) {
    mob.yaw = Math.PI / 2; mob.velocity.x = 2.5; mob.velocity.z = 0;
    moveGroundMob(manager, mob, 1 / 30);
    const p = mob.mesh.position;
    // Refused at the rim, it turns and walks along it, and may go round the pool's corner: only being over the water counts.
    const overPool = p.x >= 2 && p.x < 5 && p.z >= -2 && p.z < 3;
    assert.ok(p.y > -0.5 && !overPool, `the cat went into the water at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
  }
});

test('a cat in water floats with its head above the surface and does not drown', () => {
  // Water from y=-3 to y=0, surface at y=1: deeper than the cat is tall.
  const cells = [];
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = -3; y <= 0; y++) cells.push([x, y, z, BLOCKS.WATER]);
  const manager = rig(cells);
  const mob = cat(manager, [0.5, -2.5, 0.5]);
  for (let i = 0; i < 300; i++) { mob.velocity.x = mob.velocity.z = 0; moveGroundMob(manager, mob, 1 / 30); }
  const head = mob.mesh.position.y + mob.height * 0.9;
  assert.ok(head > 1, `the cat's head is at ${head.toFixed(2)}, under the surface at 1`);
  assert.ok(FLOATS_IN_WATER.has('cat') && FLOATS_IN_WATER.has('ocelot'));
  assert.ok(!FLOATS_IN_WATER.has('zombie'), 'a zombie still sinks, which is how it becomes a drowned');
});

test('a floating cat climbs out onto a bank level with the water', () => {
  // A pond x<=2 with its surface at y=0, the bank at x>=3 one block up from the water.
  const cells = [];
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 3; z++) for (let y = -3; y <= -1; y++) cells.push([x, y, z, BLOCKS.WATER]);
  const manager = rig(cells);
  const mob = cat(manager, [0.5, -1.5, 0.5]);
  for (let i = 0; i < 300; i++) {
    mob.yaw = Math.PI / 2; mob.velocity.x = 2; mob.velocity.z = 0;
    moveGroundMob(manager, mob, 1 / 30);
  }
  const p = mob.mesh.position;
  assert.ok(p.x > 3 && p.y >= -0.01, `the cat is still in the pond at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`);
});
