// Cube-mob hopping, shared by slimes and magma cubes.
//
// Reference: https://minecraft.wiki/w/Slime
//
// Slimes and magma cubes "move by hopping", and neither had any locomotion at all: both stood in
// one place forever while the renderer read a vertical velocity nothing ever set. This suite covers
// the hop timing, the one-block jump height, the target search, and the size-scaled contact damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  CUBE_SIZES, CUBE_MIN_SIZE, CUBE_HOP_SECONDS, CUBE_TURN_SECONDS, CUBE_JUMP_VELOCITY,
  CUBE_TARGET_RANGE, cubeHealth, cubeSide, cubeDamage, cubeHopSpeed, rollCubeHopDelay,
  rollCubeTurnDelay, updateCubeHop, cubeSquashOnLand, cubeTargetPosition
} from '../src/cubeMobBehavior.js';

function fixture({ playerAt = new THREE.Vector3(40, 1, 40) } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0, setVoxel() {} };
  const entities = new EntityManager(scene, world, sounds);
  entities.spawnDroppedItem = () => {};
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: playerAt.clone(), velocity: new THREE.Vector3(), gamemode: 'survival', health: 100,
    keys: {}, onGround: true, statusEffects: {}, damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty: 'normal', worldTime: 18000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player };
}

test('the hop timing matches the wiki windows', () => {
  // Wiki: hopping "every 10 to 30 ticks (0.5 to 1.5 seconds)".
  assert.deepEqual(CUBE_HOP_SECONDS.idleMin, 0.5);
  assert.deepEqual(CUBE_HOP_SECONDS.idleMax, 1.5);
  // Wiki: with a target, "the delay before jumping is 1/3 as long (3 to 10 ticks)".
  assert.equal(CUBE_HOP_SECONDS.chaseMin, 0.15);
  assert.equal(CUBE_HOP_SECONDS.chaseMax, 0.5);
  assert.ok(CUBE_HOP_SECONDS.chaseMax <= CUBE_HOP_SECONDS.idleMin,
    'the two windows meet at 0.5s, so chasing is never slower than idling');
  // The wiki calls this "1/3 as long" but then gives the exact tick counts, which is what is
  // implemented: 3-10 ticks is 0.15-0.5s. Note that is not exactly a third of 0.5-1.5s (that would
  // be 0.167-0.5), so the tick figures are the authority rather than the ratio.
  assert.equal(CUBE_HOP_SECONDS.chaseMin, 3 / 20, 'wiki: 3 ticks');
  assert.equal(CUBE_HOP_SECONDS.chaseMax, 10 / 20, 'wiki: 10 ticks');
  assert.equal(CUBE_HOP_SECONDS.idleMin, 10 / 20, 'wiki: 10 ticks');
  assert.equal(CUBE_HOP_SECONDS.idleMax, 30 / 20, 'wiki: 30 ticks');
  // Wiki: an idle cube "changes direction randomly every 40 to 100 ticks (2 to 5 seconds)".
  assert.deepEqual(CUBE_TURN_SECONDS, { min: 2, max: 5 });
  assert.equal(CUBE_TARGET_RANGE, 16, 'wiki: it looks for a target within 16 blocks');
});

test('the hop delays are drawn from the right window for each case', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const idle = rollCubeHopDelay(false, () => r);
    assert.ok(idle >= CUBE_HOP_SECONDS.idleMin && idle <= CUBE_HOP_SECONDS.idleMax, `idle ${idle}`);
    const chase = rollCubeHopDelay(true, () => r);
    assert.ok(chase >= CUBE_HOP_SECONDS.chaseMin && chase <= CUBE_HOP_SECONDS.chaseMax, `chase ${chase}`);
    const turn = rollCubeTurnDelay(() => r);
    assert.ok(turn >= 2 && turn <= 5, `turn ${turn}`);
  }
  assert.equal(rollCubeHopDelay(false, () => 0), 0.5);
  assert.equal(rollCubeHopDelay(true, () => 0), 0.15);
});

test('every cube size jumps exactly one block high', () => {
  // Wiki: "Regardless of size, slimes always jump 1 block high." So the launch velocity is a
  // constant and does not scale with size.
  const heights = new Set();
  for (const size of CUBE_SIZES) {
    const { manager, player } = fixture();
    const mob = manager.spawnSlime(0, 1, 0, size);
    mob.onGround = true;
    mob.hopTimer = 0;
    updateCubeHop(manager, mob, 1 / 60, player, { findTarget: () => null, random: () => 0.5 });
    heights.add(mob.velocity.y);
  }
  assert.equal(heights.size, 1, `every size must launch identically, got ${[...heights].join(', ')}`);
  assert.equal([...heights][0], CUBE_JUMP_VELOCITY);
  assert.ok(CUBE_JUMP_VELOCITY > 0);
});

test('the horizontal reach grows with the cube size', () => {
  // Wiki: "a slime jumps a distance slightly farther than its length".
  const small = cubeHopSpeed(1);
  const medium = cubeHopSpeed(2);
  const large = cubeHopSpeed(4);
  assert.ok(small < medium, `small ${small} should be slower than medium ${medium}`);
  assert.ok(medium < large, `medium ${medium} should be slower than large ${large}`);
  // And the ratio follows the side lengths, which is the wiki's rule.
  assert.ok(Math.abs((large - small) - (cubeSide(4) - cubeSide(1)) * 0.9) < 1e-9);
});

test('a cube with a target points straight at it and hops sooner', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(8, 1, 0) });
  const mob = manager.spawnSlime(0, 1, 0, 2);
  mob.onGround = true;
  mob.hopTimer = 0;
  const outcome = updateCubeHop(manager, mob, 1 / 60, player, { random: () => 0.5 });
  assert.equal(outcome, 'hopping');
  // The heading is set directly toward the target, with no pathfinding.
  assert.ok(Math.abs(mob.yaw - Math.PI / 2) < 1e-6, `yaw ${mob.yaw} should face +x toward the player`);
  assert.ok(mob.velocity.x > 0, 'and it moves that way');
  assert.ok(Math.abs(mob.velocity.z) < 1e-9);
  // The next pause is a chasing pause, so it is short.
  assert.ok(mob.hopTimer <= CUBE_HOP_SECONDS.chaseMax + 1e-9);
});

test('a cube out of range waits rather than drifting', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(400, 1, 400) });
  const mob = manager.spawnSlime(0, 1, 0, 2);
  mob.onGround = true;
  mob.hopTimer = 0.5;
  const outcome = updateCubeHop(manager, mob, 1 / 60, player, { random: () => 0.5 });
  assert.equal(outcome, 'waiting');
  // Between hops it settles, so the movement reads as a hop and not a glide.
  assert.equal(mob.velocity.x, 0);
  assert.equal(mob.velocity.z, 0);
});

test('an idle cube changes direction only when its turn timer expires', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(400, 1, 400) });
  const mob = manager.spawnSlime(0, 1, 0, 2);
  mob.onGround = true;
  mob.hopTimer = 5;
  mob.cubeTurnTimer = 10;
  const before = mob.yaw;
  updateCubeHop(manager, mob, 1 / 60, player, { random: () => 0.5 });
  assert.equal(mob.yaw, before, 'it holds its heading while the turn timer runs');

  mob.cubeTurnTimer = 0;
  updateCubeHop(manager, mob, 1 / 60, player, { random: () => 0.25 });
  assert.notEqual(mob.yaw, before, 'and picks a new one when it expires');
  assert.ok(mob.cubeTurnTimer >= CUBE_TURN_SECONDS.min);
});

test('a cube looks for an iron golem when no player is in range', () => {
  // Wiki: "The slime searches for a player (or, failing that, an iron golem) within 16 blocks."
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(400, 1, 400) });
  const golem = manager.spawnIronGolem(6, 1, 0);
  const mob = manager.spawnSlime(0, 1, 0, 2);
  mob.onGround = true;
  mob.hopTimer = 0;
  updateCubeHop(manager, mob, 1 / 60, player, {
    findTarget: (mgr, cube, range) => {
      if (player && cube.mesh.position.distanceTo(player.position) < range) return player;
      let best = null;
      let bestDist = range;
      for (const other of mgr.mobs) {
        if (other === cube || other.type !== 'iron_golem' || other.health <= 0) continue;
        const d = cube.mesh.position.distanceTo(other.mesh.position);
        if (d < bestDist) { bestDist = d; best = other; }
      }
      return best;
    }
  });
  assert.equal(mob.cubeTarget, golem, 'it targets the golem');
  // Spawning stands the golem in the middle of a block, so the bearing is taken from where it is.
  const bearing = Math.atan2(golem.mesh.position.x - mob.mesh.position.x, golem.mesh.position.z - mob.mesh.position.z);
  assert.ok(Math.abs(mob.yaw - bearing) < 1e-6, 'and faces it');
});

test('a cube only hops when it is on the ground', () => {
  const { manager, player } = fixture();
  const mob = manager.spawnSlime(0, 1, 0, 2);
  mob.onGround = false;
  mob.hopTimer = 0;
  const outcome = updateCubeHop(manager, mob, 1 / 60, player, { findTarget: () => null });
  assert.equal(outcome, 'waiting', 'a cube in the air does not launch again');
  assert.equal(mob.velocity.y, 0);
});

test('contact damage equals the size, and the smallest deals none', () => {
  // Wiki: damage equals the size, except the smallest which does no damage.
  assert.equal(cubeDamage(4), 4);
  assert.equal(cubeDamage(2), 2);
  assert.equal(cubeDamage(1), 0, 'wiki: small slimes deal no damage');
  assert.equal(cubeDamage(0), 0);

  const { manager, player } = fixture({ playerAt: new THREE.Vector3(0.5, 1, 0) });
  const mob = manager.spawnSlime(0, 1, 0, 4);
  const dealt = cubeSquashOnLand(manager, mob, player);
  assert.equal(dealt, 4, 'a large cube hits for its size');
  assert.equal(player.damageTaken, 4);
});

test('damage immunity limits a cube to one hit per half second', () => {
  // Wiki: damage immunity reduces it to "1 attack every half second".
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(0.5, 1, 0) });
  const mob = manager.spawnSlime(0, 1, 0, 4);
  assert.equal(cubeSquashOnLand(manager, mob, player), 4, 'the first hit lands');
  assert.equal(cubeSquashOnLand(manager, mob, player), 0, 'the second is blocked');
  assert.equal(player.damageTaken, 4);
  // After the cooldown it lands again.
  assert.equal(cubeSquashOnLand(manager, mob, player, 0.6), 4);
  assert.equal(player.damageTaken, 8);
});

test('a cube out of reach deals no damage even with no cooldown', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(20, 1, 0) });
  const mob = manager.spawnSlime(0, 1, 0, 4);
  assert.equal(cubeSquashOnLand(manager, mob, player), 0);
  assert.equal(player.damageTaken, 0);
});

test('a small cube never damages anything', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(0.2, 1, 0) });
  const mob = manager.spawnSlime(0, 1, 0, 1);
  assert.equal(cubeSquashOnLand(manager, mob, player), 0, 'wiki: size 1 deals no damage');
  assert.equal(player.damageTaken, 0);
});

test('the target position helper handles players and mobs', () => {
  const player = { position: new THREE.Vector3(1, 2, 3) };
  assert.equal(cubeTargetPosition(player), player.position, 'a player carries the vector directly');
  const mob = { mesh: { position: new THREE.Vector3(4, 5, 6) } };
  assert.equal(cubeTargetPosition(mob), mob.mesh.position, 'a mob carries it on its mesh');
  assert.equal(cubeTargetPosition(new THREE.Vector3(7, 8, 9))?.x, 7, 'a bare vector works');
  assert.equal(cubeTargetPosition(null), null);
  assert.equal(cubeTargetPosition({}), null);
});

test('a cube hops through the real update loop and actually moves', () => {
  for (const type of ['slime', 'magma_cube']) {
    const { manager, player } = fixture({ playerAt: new THREE.Vector3(8, 1, 0) });
    const mob = manager.spawnMob(type, 0, 1, 0);
    const start = mob.mesh.position.clone();
    let maxHeight = 0;
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      manager.update(1 / 60, player);
      moved = Math.max(moved, mob.mesh.position.distanceTo(start));
      maxHeight = Math.max(maxHeight, mob.mesh.position.y - start.y);
    }
    assert.ok(moved > 0.5, `${type} should hop toward the player, moved ${moved.toFixed(3)}`);
    assert.ok(maxHeight > 0.4, `${type} should leave the ground, rose ${maxHeight.toFixed(2)}`);
    assert.ok(maxHeight < 2.0, `${type} should jump about one block, rose ${maxHeight.toFixed(2)}`);
    assert.deepEqual([...(manager.mobErrors || [])], [], `${type} reported a fault`);
  }
});

test('a hopping cube damages a player it lands on', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(2, 1, 0) });
  const mob = manager.spawnMob('slime', 0, 1, 0, 4);
  for (let i = 0; i < 900; i++) manager.update(1 / 60, player);
  assert.ok(player.damageTaken > 0, `the cube should land on the player, dealt ${player.damageTaken}`);
});

test('the cube squash reads as a hop rather than a slide', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(8, 1, 0) });
  const mob = manager.spawnMob('slime', 0, 1, 0, 4);
  const scales = [];
  for (let i = 0; i < 240; i++) {
    manager.update(1 / 60, player);
    scales.push(mob.mesh.scale.y);
  }
  const min = Math.min(...scales);
  const max = Math.max(...scales);
  assert.ok(max > min + 0.05, `the model should squash and stretch, range ${(max - min).toFixed(3)}`);
});

test('helper safety on non-cubes and malformed mobs', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(updateCubeHop(manager, cow, 1 / 60, player), null, 'a cow is not a cube');
  assert.equal(updateCubeHop(manager, null, 1 / 60, player), null);
  assert.equal(updateCubeHop(manager, { slimeSize: 2, mesh: { position: new THREE.Vector3() } }, 1 / 60, player), null,
    'no velocity vector means nothing to do');
  assert.equal(cubeSquashOnLand(manager, null, player), 0);
  assert.equal(cubeSquashOnLand(manager, cow, player), 0);
  assert.equal(cubeSquashOnLand(manager, manager.spawnSlime(0, 1, 0, 4), null), 0);
});
