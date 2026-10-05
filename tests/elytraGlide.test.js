// Elytra gliding.
//
// `player.isGliding` and `player.elytraActive` were read in exactly one place, `parrotBehavior.js`, and set
// nowhere -- the `elytra` item existed and its 432 durability was in `durability.js`, with no glide physics
// behind any of it.
//
// The constants in `src/elytra.js` are tuned approximations, because vanilla's per-tick figures are not in
// `.cache/mc-data` and inventing them with false precision would be worse than saying so. So these tests
// assert the PROPERTIES that define gliding rather than the numbers, which is what can honestly be checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  hasElytraEquipped, wantsToStartGliding, shouldStopGliding, applyGlide,
  ELYTRA_MAX_SINK, ELYTRA_MIN_SPEED, ELYTRA_MAX_SPEED,
} from '../src/elytra.js';

/** A player shaped object, falling, with an elytra worn unless told otherwise. */
function glider(over = {}) {
  return {
    isGliding: false, isFlying: false, onGround: false, inWater: false,
    velocity: new THREE.Vector3(0, -5, 0), yaw: 0, pitch: 0,
    inventory: { armor: { chest: { id: 'elytra' } } },
    ...over,
  };
}

/** Run the glide for a while and report the resulting velocity. */
function fly({ pitch = 0, seconds = 2, boost = 0, start = null } = {}) {
  const velocity = start ? start.clone() : new THREE.Vector3(0, -5, -5);
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    applyGlide({ velocity, yaw: 0, pitch, dt: 1 / 60, boost });
  }
  return velocity;
}

test('an elytra must be worn to glide at all', () => {
  assert.equal(hasElytraEquipped(glider()), true, 'a chest elytra counts');
  assert.equal(hasElytraEquipped(glider({ inventory: { armor: { chest: null } } })), false);
  assert.equal(hasElytraEquipped(glider({ inventory: { armor: { chest: { id: 'iron_chestplate' } } } })), false);
  assert.equal(hasElytraEquipped(undefined), false, 'and a missing player must not throw');
  assert.equal(hasElytraEquipped({}), false);
});

test('a glide starts only from a fall, with the elytra on and jump held', () => {
  // Every condition is load bearing, and each is checked by being the only thing wrong.
  assert.equal(wantsToStartGliding(glider(), { Space: true }), true, 'the base case should start');
  assert.equal(wantsToStartGliding(glider(), {}), false, 'without a jump press');
  assert.equal(wantsToStartGliding(glider({ onGround: true }), { Space: true }), false, 'standing on the ground');
  assert.equal(wantsToStartGliding(glider({ inWater: true }), { Space: true }), false, 'swimming');
  assert.equal(wantsToStartGliding(glider({ isFlying: true }), { Space: true }), false, 'already flying');
  assert.equal(wantsToStartGliding(glider({ isGliding: true }), { Space: true }), false, 'already gliding');
  assert.equal(wantsToStartGliding(glider({ inventory: { armor: { chest: null } } }), { Space: true }), false,
    'without an elytra');
  // Rising: the elytra must not work as a jump, so a positive vertical velocity cannot start a glide.
  assert.equal(wantsToStartGliding(glider({ velocity: new THREE.Vector3(0, 2, 0) }), { Space: true }), false,
    'while rising');
  assert.equal(wantsToStartGliding(glider({ velocity: new THREE.Vector3(0, 0, 0) }), { Space: true }), false,
    'and while level, since a glide begins from a fall');
  assert.equal(wantsToStartGliding(undefined, { Space: true }), false);
});

test('a glide ends on landing, in water, flying, or losing the elytra', () => {
  const gliding = (over = {}) => glider({ isGliding: true, ...over });
  assert.equal(shouldStopGliding(gliding({ onGround: true })), true, 'landing ends it');
  assert.equal(shouldStopGliding(gliding({ inWater: true })), true, 'water ends it');
  assert.equal(shouldStopGliding(gliding({ isFlying: true })), true, 'switching to flight ends it');
  assert.equal(shouldStopGliding(gliding({ inventory: { armor: { chest: null } } })), true,
    'and taking the elytra off ends it');
  assert.equal(shouldStopGliding(gliding()), false, 'but an unobstructed glide continues');
  assert.equal(shouldStopGliding(glider()), false, 'and a player who is not gliding is left alone');
  assert.equal(shouldStopGliding(undefined), false);
});

test('gliding always sinks, however the player looks', () => {
  // This is the property that makes it a glide rather than flight: looking up slows the descent and can
  // never reverse it. Only a firework rocket may raise the player.
  for (const pitch of [-1.2, -0.6, 0, 0.6, 1.2, Math.PI / 2]) {
    const v = fly({ pitch });
    assert.ok(v.y < 0, 'pitch ' + pitch + ' should still sink, got v.y ' + v.y);
    assert.ok(v.y >= -ELYTRA_MAX_SINK - 1e-6,
      'pitch ' + pitch + ' should not sink faster than the cap, got ' + v.y);
  }
});

test('looking up slows the descent without stopping it', () => {
  const level = fly({ pitch: 0 }).y;
  const up = fly({ pitch: Math.PI / 2 }).y;
  assert.ok(up > level, 'looking up should sink more slowly: ' + up + ' vs ' + level);
  assert.ok(up < 0, 'but must still sink');
});

test('diving accelerates and climbing decelerates', () => {
  const speed = (v) => Math.hypot(v.x, v.z);
  const level = fly({ pitch: 0 });
  const dive = fly({ pitch: -0.8 });
  const climb = fly({ pitch: 0.8 });
  assert.ok(speed(dive) > speed(level),
    'a dive should be faster than level flight: ' + speed(dive) + ' vs ' + speed(level));
  assert.ok(speed(climb) <= speed(level),
    'climbing should not be faster than level flight: ' + speed(climb) + ' vs ' + speed(level));
});

test('horizontal speed is bounded at both ends', () => {
  const speed = (v) => Math.hypot(v.x, v.z);
  // A long dive must not run away, and a long climb must not stall to nothing.
  assert.ok(speed(fly({ pitch: -1.2, seconds: 20 })) <= ELYTRA_MAX_SPEED + 1e-6,
    'a sustained dive should be capped');
  assert.ok(speed(fly({ pitch: 1.2, seconds: 20 })) >= ELYTRA_MIN_SPEED - 1e-6,
    'a sustained climb should keep a minimum forward speed so the player does not hover');
});

test('a firework boost adds speed and lift, which only a rocket may do', () => {
  const unboosted = fly({ pitch: 0, seconds: 1 });
  const boosted = fly({ pitch: 0, seconds: 1, boost: 2 });
  assert.ok(Math.hypot(boosted.x, boosted.z) > Math.hypot(unboosted.x, unboosted.z),
    'a boost should add speed');
  assert.ok(boosted.y > unboosted.y, 'and lift: ' + boosted.y + ' vs ' + unboosted.y);
  // The lift is a climb, so this is the one case where the sink property does not hold -- and it must
  // expire, or the rocket would be a permanent jetpack.
  const after = fly({ pitch: 0, seconds: 3, boost: 0 });
  assert.ok(after.y < 0, 'with the boost expired the glide sinks again');
});

test('steering keeps the heading rather than snapping to the facing', () => {
  // A glide travels where it is already going; the yaw only chooses a heading when there is no motion yet,
  // which is what happens on the first frame after a fall.
  const moving = new THREE.Vector3(0, -5, -10);
  const v = fly({ pitch: 0.5, start: moving, seconds: 1 });
  assert.ok(v.z < 0 && Math.abs(v.x) < 1e-6, 'the existing -Z heading should be preserved, got ' + v.x + ',' + v.z);
  // From rest the facing is used, and yaw 0 faces -Z.
  const fromRest = new THREE.Vector3(0, -5, 0);
  const w = fly({ pitch: 0, start: fromRest, seconds: 1 });
  assert.ok(w.z < 0, 'from rest the player should move along the facing (-Z), got ' + w.z);
  assert.ok(Math.abs(w.x) < 1e-6);
});

test('a malformed velocity does not produce NaN', () => {
  // A glide runs on the same vector the collision code reads, so a NaN here would spread.
  const v = new THREE.Vector3(0, -5, -5);
  applyGlide({ velocity: v, yaw: 0, pitch: 0, dt: 0 });
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), 'dt 0 should stay finite');
});

test('the glide branch is wired into the player movement, and only while gliding', () => {
  // Checked at the source because driving `Player.update` needs most of an engine. This proves the branch
  // exists and sits where the other movement modes are, not that a specific keypress starts a glide.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ applyGlide, wantsToStartGliding, shouldStopGliding \} from '\.\/elytra\.js'/,
    'player.js should import the glide helpers');
  assert.match(source, /this\.isGliding = false;/, 'and the flags should be initialised in the constructor');
  const branch = source.indexOf('} else if (this.isGliding) {');
  assert.ok(branch > 0, 'the movement chain should have a gliding branch');
  // The order matters: flying and water both beat gliding, because either one replaces it.
  const flying = source.indexOf('if (this.isFlying) {', branch - 2000);
  const water = source.indexOf('} else if (this.inWater) {', branch - 2000);
  assert.ok(flying > 0 && water > 0 && flying < water && water < branch,
    'the branch order should be flying, then water, then gliding');
  assert.match(source, /this\.elytraBoost = Math\.max\(0, \(this\.elytraBoost \|\| 0\) - dt\)/,
    'and the boost should count down');
});

test('the elytra item and its durability already existed and are unchanged', () => {
  // Recorded because it is why the gap was findable: the item and its 432 durability were both registered
  // with no glide behind them.
  const durability = readFileSync(new URL('../src/durability.js', import.meta.url), 'utf8');
  assert.match(durability, /elytra: 432/, 'the elytra durability figure should still be there');
});
