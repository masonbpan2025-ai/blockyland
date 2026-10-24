// Iron golems target what the wiki says they do, only what they can see, and walk a route to it
// (ironGolemBehavior.js; https://minecraft.wiki/w/Iron_Golem § Behavior).
//
// In a saved village over a cave, the golem chose a zombie three blocks under the street, charged it in a straight
// line into the ground, and jittered on the spot; skeletons walked past it, because skeletons were not on its list.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import {
  IRON_GOLEM_TARGETS, findGolemTarget, updateGolemTarget, golemCanHit, pursueGolemTarget, GOLEM_FORGET_SECONDS,
} from '../src/ironGolemBehavior.js';

/** Stone below y = 0 and any extra blocks given, as "x,y,z" keys. */
function world(extra = []) {
  const cells = new Set(extra);
  const solid = (x, y, z) => { x = Math.floor(x); y = Math.floor(y); z = Math.floor(z); return y < 0 || cells.has(`${x},${y},${z}`); };
  return { cells, getVoxel: (x, y, z) => (solid(x, y, z) ? BLOCKS.STONE : BLOCKS.AIR), solid };
}

function manager(w) {
  const m = Object.assign(Object.create(MobManager.prototype), {
    world: w, scene: new THREE.Scene(), sounds: new Proxy({}, { get: () => () => {} }), mobs: [], arrows: [], customProjectiles: [],
    isBlockSolid: (x, y, z) => w.solid(x, y, z), getMobDimensions: () => ({ width: 1.4, height: 2.7 }), pathNodesLeft: 1e12,
  });
  m.checkMobCollision = (mob, p) => w.solid(p.x, p.y, p.z) || w.solid(p.x, p.y + 1, p.z);
  return m;
}

function mob(m, type, x, y, z, extra = {}) {
  const it = { type, health: 20, maxHealth: 20, mesh: { position: new THREE.Vector3(x, y, z), rotation: { y: 0 } },
    velocity: new THREE.Vector3(), knockback: new THREE.Vector3(), yaw: 0, onGround: true, height: type === 'iron_golem' ? 2.7 : 1.95, ...extra };
  m.mobs.push(it);
  return it;
}

test('the targets are the wiki\'s: skeletons and zombie villagers among them, creepers and goats not', () => {
  for (const type of ['zombie', 'skeleton', 'zombie_villager', 'husk', 'stray', 'drowned', 'spider', 'pillager', 'vindicator', 'witch', 'slime']) {
    assert.ok(IRON_GOLEM_TARGETS.has(type), `${type} is attacked`);
  }
  for (const type of ['creeper', 'goat', 'villager', 'iron_golem', 'cow', 'player']) assert.ok(!IRON_GOLEM_TARGETS.has(type), `${type} is not`);
  const m = manager(world()), golem = mob(m, 'iron_golem', 0.5, 0, 0.5);
  const skeleton = mob(m, 'skeleton', 6.5, 0, 0.5);
  assert.equal(findGolemTarget(m, golem), skeleton, 'a skeleton in view is a target (it used to be ignored)');
  m.mobs.splice(m.mobs.indexOf(skeleton), 1);
  mob(m, 'creeper', 3.5, 0, 0.5);
  assert.equal(findGolemTarget(m, golem), null, 'a creeper is left alone');
});

test('a zombie under the ground is not a target; the one it can see is, though farther', () => {
  // A stone floor at y = 0..2 over a cave: the golem on top, a zombie in the cave right below it.
  const floor = [];
  for (let x = -4; x <= 12; x++) for (let z = -4; z <= 4; z++) for (let y = 0; y <= 2; y++) floor.push(`${x},${y},${z}`);
  const m = manager(world(floor)), golem = mob(m, 'iron_golem', 0.5, 3, 0.5);
  const buried = mob(m, 'zombie', 1.5, -3, 0.5);
  assert.equal(findGolemTarget(m, golem), null, 'three blocks of stone between them: not seen, not chased');
  const visible = mob(m, 'zombie', 10.5, 3, 0.5);
  assert.equal(findGolemTarget(m, golem), visible, 'the zombie on the street is');
  assert.ok(buried.mesh.position.distanceTo(golem.mesh.position) < visible.mesh.position.distanceTo(golem.mesh.position));
});

test('it keeps one target until it dies, then takes the next', () => {
  const m = manager(world()), golem = mob(m, 'iron_golem', 0.5, 0, 0.5);
  const first = mob(m, 'zombie', 8.5, 0, 0.5);
  assert.equal(updateGolemTarget(m, golem, 0.1), first);
  mob(m, 'zombie', 3.5, 0, 0.5); // nearer, arriving later
  assert.equal(updateGolemTarget(m, golem, 0.1), first, 'wiki: it targets one mob until that mob dies');
  first.health = 0;
  golem.targetScan = 0;
  assert.notEqual(updateGolemTarget(m, golem, 0.1), first, 'then the next');
});

test('a target that stays out of sight is given up after a few seconds', () => {
  const m = manager(world()), golem = mob(m, 'iron_golem', 0.5, 0, 0.5);
  const zombie = mob(m, 'zombie', 6.5, 0, 0.5);
  assert.equal(updateGolemTarget(m, golem, 0.1), zombie);
  // A wall goes up between them.
  for (let z = -3; z <= 3; z++) for (let y = 0; y <= 4; y++) m.world.cells.add(`3,${y},${z}`);
  let held = 0;
  for (let t = 0; t < GOLEM_FORGET_SECONDS + 1; t += 0.1) if (updateGolemTarget(m, golem, 0.1) === zombie) held += 0.1;
  assert.ok(held < GOLEM_FORGET_SECONDS + 0.2, `held ${held.toFixed(1)} s out of sight`);
  assert.equal(golem.golemTarget, null);
});

test('it walks round a wall to the zombie it sees over it, and hits it, rather than charging into the wall', () => {
  // A wall two high with a gap at z = 5; the zombie well beyond it, its eyes visible over the top from the golem's.
  const wall = [];
  for (let z = -6; z <= 6; z++) if (z !== 5) for (let y = 0; y <= 1; y++) wall.push(`4,${y},${z}`);
  const m = manager(world(wall)), golem = mob(m, 'iron_golem', 0.5, 0, 0.5);
  const zombie = mob(m, 'zombie', 11.5, 0, 0.5);
  const dt = 1 / 30;
  let hit = false, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 30 * 15 && !hit; i++) {
    const target = updateGolemTarget(m, golem, dt);
    assert.equal(target, zombie, `frame ${i}: it keeps the zombie it saw over the wall`);
    pursueGolemTarget(m, golem, target, dt);
    const next = golem.mesh.position.clone().addScaledVector(golem.velocity, dt);
    if (!m.checkMobCollision(golem, next)) golem.mesh.position.copy(next);
    minX = Math.min(minX, golem.mesh.position.x); maxX = Math.max(maxX, golem.mesh.position.x);
    hit = golemCanHit(golem, zombie);
  }
  assert.ok(hit, `it reached the zombie: at ${golem.mesh.position.toArray().map((v) => v.toFixed(1))}`);
  assert.ok(golem.mesh.position.x > 4, 'on the far side of the wall, through the gap');
});

test('it cannot hit a target 2.75 blocks or more above it', () => {
  const m = manager(world()), golem = mob(m, 'iron_golem', 0.5, 0, 0.5);
  assert.equal(golemCanHit(golem, mob(m, 'zombie', 1.5, 2.5, 0.5)), true);
  assert.equal(golemCanHit(golem, mob(m, 'zombie', 1.5, 3, 0.5)), false, 'wiki: a three-block pillar is out of reach');
});
