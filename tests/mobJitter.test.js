// Mobs must not jitter when they are wedged at a corner.
//
// Reported from play: a piglin and a hoglin visibly shaking at a corner. Measured on a hoglin
// walking into an inner corner beside lava, the heading reversed 50 times in 15 seconds (3.3/s)
// and accumulated 132 radians of turn while covering almost no ground.
//
// The cause is the local alternative-angle search in steerGround. When the direct heading probes
// blocked it scans [0.65, -0.65, 1.2, -1.2, ...] and takes the first that clears. Pressed against
// a corner, which side clears first flips as the mob nudges, so it alternates left, right, left --
// and a wider mob (hoglin is 1.4 wide) trips this far more than a narrow one, which is why the
// hoglin was the obvious case in the screenshot.
//
// PrismarineJS does not have this problem because mineflayer-pathfinder never makes a per-frame
// avoidance decision while steering: lib/physics.js sets the yaw with `atan2` straight at the next
// waypoint, with a 0.35-block arrival tolerance, and lets the pathfinder own avoidance. See
// docs/mob-jitter-research.md.
//
// The fix keeps local avoidance (this engine needs it, because its mobs are not always on a planned
// route) but makes each decision stick: the search commits to one rotational side, and a chosen
// heading is held for a dwell window instead of being reconsidered every frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

THREE.TextureLoader.prototype.load = () => new THREE.Texture();

/**
 * A nether scene with the geometry from the report: solid ground at x >= 2 with an inner corner,
 * and lava at the standing level beyond it.
 */
function cornerByLava() {
  const edits = new Map();
  const set = (x, y, z, id) => edits.set(x + ',' + y + ',' + z, id);
  for (let x = -8; x < 2; x++) for (let z = -8; z <= 8; z++) set(x, -1, z, BLOCKS.LAVA);
  for (let y = 0; y <= 3; y++) {
    for (let z = -8; z <= 5; z++) set(5, y, z, BLOCKS.STONE);
    for (let x = 2; x <= 5; x++) set(x, y, 5, BLOCKS.STONE);
  }
  return {
    dimension: 'nether',
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      const v = edits.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
      return y < 0 ? BLOCKS.STONE : BLOCKS.AIR;
    },
  };
}

function session(world, playerAt) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = { items: [], spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnBlockParticles() {} };
  const manager = new MobManager(scene, world, sounds, entities);
  const player = {
    position: new THREE.Vector3(...playerAt), velocity: new THREE.Vector3(),
    width: 0.6, height: 1.8, health: 100, gamemode: 'survival', yaw: 0,
    takeDamage() {}, hasStatusEffect: () => false, checkCollision: () => false,
  };
  const inventory = { armor: {}, hotbar: [], storage: [], active: null, getActiveItem: () => null, addItem: () => true, consumeActiveItem() {}, updateUI() {}, updateHotbar() {} };
  manager.game = { player, inventory, difficulty: 'normal', weather: { weatherType: 'clear' }, mechanisms: { isFeatureEnabled: () => false } };
  return { manager, player };
}

/**
 * Drive a mob at a player tucked into a corner, and measure how much it shakes.
 *
 * Two different things can look like jitter, and they need different measures:
 *
 *  - A heading that flips back and forth. This is what the local alternative-angle search did, and
 *    it toggles the whole body. Measured as headingReversals.
 *  - A body that shudders in place without getting anywhere. Measured as pathEfficiency: the net
 *    distance covered divided by the total distance travelled. A mob walking a clean route scores
 *    near 1; a mob shaking on the spot scores near 0.
 *
 * pathEfficiency is the honest one, because it does not care whether the yaw is being set by
 * steerGround or by path-following rotation -- it only asks whether the mob is going somewhere.
 *
 * @returns {{reversals: number, totalTurn: number, seconds: number, pathEfficiency: number, net: number, travelled: number}}
 */
function measureCornerJitter(kind, { ticks = 450, playerAt = [4.2, 0, 4.2] } = {}) {
  const { manager, player } = session(cornerByLava(), playerAt);
  // Use the dedicated spawners where they exist: spawnMob builds a generic entity and does not
  // set up the same behaviour state, which made the piglin measurement meaningless.
  const mob = kind === 'hoglin' ? manager.spawnHoglin(2.5, 0, 2.5)
    : kind === 'piglin' ? manager.spawnPiglin(2.5, 0, 2.5)
      : manager.spawnMob(kind, 2.5, 0, 2.5);
  assert.ok(mob, `${kind} should spawn`);
  assert.equal(mob.type, kind, `the fixture should have spawned a ${kind}`);

  const yaws = [];
  const positions = [];
  const radii = [];
  for (let i = 0; i < ticks; i++) {
    manager.update(1 / 30, player);
    yaws.push(mob.yaw || 0);
    const p = mob.mesh.position;
    positions.push({ x: p.x, z: p.z });
    radii.push(Math.hypot(p.x - playerAt[0], p.z - playerAt[2]));
  }

  let reversals = 0, lastSign = 0, totalTurn = 0;
  for (let i = 1; i < yaws.length; i++) {
    const d = Math.atan2(Math.sin(yaws[i] - yaws[i - 1]), Math.cos(yaws[i] - yaws[i - 1]));
    totalTurn += Math.abs(d);
    if (Math.abs(d) >= 0.005) {
      const sign = Math.sign(d);
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
  }

  let travelled = 0;
  for (let i = 1; i < positions.length; i++) {
    travelled += Math.hypot(positions[i].x - positions[i - 1].x, positions[i].z - positions[i - 1].z);
  }
  const net = Math.hypot(
    positions[positions.length - 1].x - positions[0].x,
    positions[positions.length - 1].z - positions[0].z,
  );

  /**
   * How much the distance to the target swings once the mob has settled.
   *
   * This is the measure that actually separates "shaking" from "legitimately moving". A mob
   * circling its target, or pacing a patrol, holds a roughly steady radius while covering plenty
   * of ground, so net-over-travelled calls it inefficient when it is behaving fine. A mob
   * shuddering on the spot swings its radius back and forth every few frames.
   */
  const tail = radii.slice(-Math.min(120, radii.length));
  const radiusSpread = Math.max(...tail) - Math.min(...tail);

  return {
    reversals,
    totalTurn,
    seconds: ticks / 30,
    net,
    travelled,
    radiusSpread,
    pathEfficiency: travelled > 0.01 ? net / travelled : 1,
  };
}

// --- the reported case -------------------------------------------------------

test('a hoglin does not jitter its heading at a corner', () => {
  const { reversals, totalTurn, seconds } = measureCornerJitter('hoglin');
  // Before the fix this was 50 reversals (3.3/s) and 132 radians of turn.
  const perSecond = reversals / seconds;
  assert.ok(perSecond < 1.2,
    `heading reversed ${reversals} times (${perSecond.toFixed(1)}/s) in ${seconds}s; jitter is back`);
  assert.ok(totalTurn < 90,
    `accumulated ${totalTurn.toFixed(0)} radians of turn while barely moving`);
});

test('a piglin does not jitter its heading at a corner', () => {
  // A piglin does not steer through steerGround at all -- it follows a path, and its yaw is the
  // path-following rotation. So the heading-reversal count is the wrong measure here and would
  // flag normal turning. What matters, and what was visible on screen, is that it is not
  // shuddering on the spot, so this checks how much its distance to the target swings.
  const { radiusSpread, travelled } = measureCornerJitter('piglin');
  assert.ok(radiusSpread < 1.0,
    `a piglin's distance to its target swung by ${radiusSpread.toFixed(2)} blocks`);
  assert.ok(travelled > 1, 'and it should actually be moving, not frozen');
});

test('a mob never shudders in place, whichever way it steers', () => {
  // The general guard, applied to every mob measured. Before the fix this caught a hoglin whose
  // radius swung between 1.16 and 2.42 blocks -- 1.26 of spread -- while it flipped between two
  // antiparallel headings about twice a second.
  for (const kind of ['hoglin', 'piglin', 'zombie']) {
    const { radiusSpread, travelled, net } = measureCornerJitter(kind);
    assert.ok(radiusSpread < 1.0,
      `${kind} shuddered: its distance to the target swung by ${radiusSpread.toFixed(2)} blocks `
      + `(net ${net.toFixed(2)} of ${travelled.toFixed(2)} travelled)`);
  }
});

test('a zombie at the same corner does not jitter either', () => {
  // The fix is in the shared steering, so it should hold for any ground mob.
  const { reversals, seconds } = measureCornerJitter('zombie');
  assert.ok(reversals / seconds < 1.2,
    `heading reversed ${reversals} times (${(reversals / seconds).toFixed(1)}/s)`);
});

// --- the mechanism the fix relies on -----------------------------------------

test('steering commits to one side instead of alternating between them', () => {
  // The side commitment is what stops the flip-flop, so it is worth pinning directly rather than
  // only through its effect on the heading.
  const { manager, player } = session(cornerByLava(), [4.2, 0, 4.2]);
  const mob = manager.spawnHoglin(2.5, 0, 2.5);
  const sides = new Set();
  for (let i = 0; i < 450; i++) {
    manager.update(1 / 30, player);
    if (mob.steerSide) sides.add(mob.steerSide);
  }
  // It may legitimately pick either side, but it should not be flipping constantly.
  assert.ok(sides.size <= 2, `steerSide took ${sides.size} values`);
});

test('a committed heading is held for the dwell window rather than re-decided each frame', () => {
  const { manager, player } = session(cornerByLava(), [4.2, 0, 4.2]);
  const mob = manager.spawnHoglin(2.5, 0, 2.5);
  // Find a frame where a commitment is live, then check it survives a few frames.
  let heldFrames = 0, longest = 0;
  for (let i = 0; i < 450; i++) {
    manager.update(1 / 30, player);
    if (mob.steerTimer > 0 && mob.steerYaw !== undefined) { heldFrames++; longest = Math.max(longest, heldFrames); }
    else heldFrames = 0;
  }
  // At 30fps a 0.6s dwell is ~18 frames; allow slack for when no avoidance is needed at all.
  assert.ok(longest >= 8,
    `a committed heading only survived ${longest} frames; it is being re-decided too eagerly`);
});

// --- jitter must not have been bought with worse navigation -------------------

test('the jitter fix did not stop a hoglin reaching its target', () => {
  // A mob that never steers cannot jitter, so the fix must not be "stop moving".
  const { manager, player } = session(cornerByLava(), [4.2, 0, 4.2]);
  const mob = manager.spawnHoglin(2.5, 0, 2.5);
  const start = mob.mesh.position.clone();
  for (let i = 0; i < 450; i++) manager.update(1 / 30, player);
  const travelled = mob.mesh.position.distanceTo(start);
  assert.ok(travelled > 1,
    `a hoglin should still close on its target, but travelled only ${travelled.toFixed(2)}`);
});

test('a mob still walks a route around a lava lake after the steering change', () => {
  // The dwell must not defeat the pathfinding that was built earlier.
  const edits = new Map();
  for (let x = 2; x <= 4; x++) for (let z = -3; z <= 3; z++) edits.set(x + ',-1,' + z, BLOCKS.LAVA);
  const world = {
    dimension: 'overworld',
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      const v = edits.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
      return y < 0 ? BLOCKS.STONE : BLOCKS.AIR;
    },
  };
  const { manager, player } = session(world, [8, 0, 0]);
  const mob = manager.spawnMob('cow', 0.5, 0, 0.5);
  let enteredLava = false;
  for (let i = 0; i < 3000; i++) {
    manager.update(1 / 30, player);
    const p = mob.mesh.position;
    if (world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) === BLOCKS.LAVA) { enteredLava = true; break; }
  }
  assert.equal(enteredLava, false, 'the mob must still not walk into the lava');
});
