// Route searches that cannot succeed are not repeated every half second (netherMobAI.js routeAimPoint). A search
// with no way to its goal spends its whole node limit, and a villager city's zombies, each chasing a villager behind
// a wall, searched again twice a second: most of the frame. Every mob that steers to a goal goes through this.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { steerGround, PATH_FRAME_NODES } from '../src/netherMobAI.js';

/** Stone below y=0, open ground above, and a sealed stone box (three high, no door) around (12, 0, 0). */
function boxWorld() {
  const cells = new Map();
  for (let x = 10; x <= 14; x++) for (let z = -2; z <= 2; z++) for (let y = 0; y <= 3; y++) {
    if (x === 10 || x === 14 || z === -2 || z === 2 || y === 3) cells.set(`${x},${y},${z}`, BLOCKS.STONE);
  }
  return {
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      return cells.get(`${x},${y},${z}`) ?? (y < 0 ? BLOCKS.STONE : BLOCKS.AIR);
    },
  };
}

/** A manager over that world that counts the route searches made (each one spends from `pathNodesLeft`). */
function counting(world, budget = 1e12) {
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene: new THREE.Scene(), sounds: new Proxy({}, { get: () => () => {} }), mobs: [], arrows: [], customProjectiles: [],
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    getMobDimensions: () => ({ width: 0.6, height: 1.95 }),
  });
  manager.checkMobCollision = (mob, p) => world.getVoxel(p.x, p.y, p.z) === BLOCKS.STONE;
  let left = budget;
  manager.searches = 0;
  manager.spent = [];
  Object.defineProperty(manager, 'pathNodesLeft', { get: () => left, set: (v) => { manager.searches++; manager.spent.push(left - v); left = v; } });
  manager.setBudget = (v) => { left = v; };
  return manager;
}

function zombie(manager, x = 0.5, z = 0.5) {
  const mob = { type: 'zombie', mesh: { position: new THREE.Vector3(x, 0, z), rotation: { y: 0 } }, velocity: new THREE.Vector3(),
    knockback: new THREE.Vector3(), yaw: 0, health: 20, maxHealth: 20, onGround: true };
  manager.mobs.push(mob);
  return mob;
}

/** Steer for `seconds`, moving the mob by its velocity as the game would. */
function chase(manager, mob, goal, seconds) {
  const dt = 1 / 30;
  for (let i = 0; i < seconds * 30; i++) {
    steerGround(manager, mob, goal, dt, 2.3);
    const next = mob.mesh.position.clone().addScaledVector(mob.velocity, dt);
    if (!manager.checkMobCollision(mob, next)) mob.mesh.position.copy(next);
  }
}

test('a goal no route reaches is searched for less and less often, not twice a second', () => {
  const manager = counting(boxWorld()), mob = zombie(manager);
  const prey = new THREE.Vector3(12.5, 0, 0.5); // inside the sealed box
  chase(manager, mob, prey, 30);
  // Twice a second would be 60 searches. Waiting 1, 2, 4, then 8 s between them is about seven.
  assert.ok(manager.searches >= 3 && manager.searches <= 9, `${manager.searches} searches in 30 s`);
  assert.ok(mob.pathFailures >= 3);
  // The first search looks as far as any; the retries only ask whether the goal has come within reach, and look less far.
  assert.ok(manager.spent[0] > 1000, `the first search expanded ${manager.spent[0]} nodes`);
  for (const nodes of manager.spent.slice(1)) assert.ok(nodes <= 1000, `a retry expanded ${nodes}`);
  // Meanwhile it walks the partial route to the closest point it found: it is at the box, not where it started.
  assert.ok(mob.mesh.position.distanceTo(prey) < 4, `it came to the box, ${mob.mesh.position.distanceTo(prey).toFixed(1)} blocks away`);
});

test('at the closest point to a goal no route reaches, it stands facing the goal rather than pacing to and fro', () => {
  // It used to head straight on from the end of the partial route, into the wall, and its avoidance turned it back:
  // an iron golem facing a skeleton behind a fence paced back and forth at full speed.
  const manager = counting(boxWorld()), mob = zombie(manager);
  const prey = new THREE.Vector3(12.5, 0, 0.5);
  chase(manager, mob, prey, 10);
  let travelled = 0, reversals = 0, lastVx = 0, lastVz = 0;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 6; i++) {
    const before = mob.mesh.position.clone();
    chase(manager, mob, prey, dt);
    travelled += before.distanceTo(mob.mesh.position);
    const vx = mob.velocity.x, vz = mob.velocity.z;
    if (vx * lastVx + vz * lastVz < 0) reversals++;
    if (vx || vz) { lastVx = vx; lastVz = vz; }
  }
  // Six seconds take in a retry (backoff 4 s, then 8 s), which may walk it a step: no more than that.
  assert.ok(travelled < 2, `it moved ${travelled.toFixed(1)} blocks in six seconds at the box`);
  assert.ok(reversals <= 1, `${reversals} about-turns`);
  assert.ok(mob.mesh.position.distanceTo(prey) < 4, 'at the box');
  const facing = Math.atan2(prey.x - mob.mesh.position.x, prey.z - mob.mesh.position.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(mob.yaw - facing), Math.cos(mob.yaw - facing))) < 0.2, 'facing what it wants');
});

test('a goal that moves well away from the one it could not reach is searched for at once', () => {
  const manager = counting(boxWorld()), mob = zombie(manager);
  chase(manager, mob, new THREE.Vector3(12.5, 0, 0.5), 10);
  const before = manager.searches;
  // Beyond the box from where it waits, more than eight blocks from the goal it gave up on: the way there needs a
  // route (round the box), so it searches rather than steering straight.
  chase(manager, mob, new THREE.Vector3(21.5, 0, 0.5), 1 / 30);
  assert.equal(manager.searches, before + 1, 'searched on the first frame, though it was backing off');
  assert.equal(mob.pathFailures, 0, 'the new goal is reachable: the backoff is over');
});

test('a route found keeps the usual half-second cadence', () => {
  // A wall with a gap: the way round is found, so nothing backs off.
  const cells = new Map();
  for (let z = -6; z <= 6; z++) if (z !== 5) for (let y = 0; y <= 2; y++) cells.set(`4,${y},${z}`, BLOCKS.STONE);
  const world = { getVoxel: (x, y, z) => cells.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? (Math.floor(y) < 0 ? BLOCKS.STONE : BLOCKS.AIR) };
  const manager = counting(world), mob = zombie(manager);
  const goal = new THREE.Vector3(8.5, 0, 0.5);
  chase(manager, mob, goal, 8);
  assert.ok(manager.searches >= 1);
  assert.equal(mob.pathFailures ?? 0, 0);
  assert.ok(mob.mesh.position.distanceTo(goal) < 1.5, 'it went round the wall');
});

test('route searches share a budget each frame; a mob due for one when it is spent waits for the next frame', () => {
  const manager = counting(boxWorld(), 0), mob = zombie(manager, 6.5, 0.5);
  const prey = new THREE.Vector3(12.5, 0, 0.5);
  steerGround(manager, mob, prey, 1 / 30, 2.3);
  assert.equal(manager.searches, 0, 'nothing left this frame');
  manager.setBudget(PATH_FRAME_NODES);
  steerGround(manager, mob, prey, 1 / 30, 2.3);
  assert.equal(manager.searches, 1, 'searched in the next');
  // The game refills it at the start of every mob update.
  const mobs = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.match(mobs, /update\(dt, player\) \{\n    dt = Math\.min\(dt, 0\.1\);\n    this\.ensureFaultTracking\(\);\n[^\n]*\n    this\.pathNodesLeft = PATH_FRAME_NODES;/);
});
