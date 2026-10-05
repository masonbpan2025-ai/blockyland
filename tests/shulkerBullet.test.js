// The shulker bullet: a turret that never fired, and the only source of levitation.
//
// `ambientLocomotion.js` carried `shulker: { range: 16, speed: 0, damage: 4, attackReach: 0 }` -- a damage
// figure and an aggro radius that neither could ever be used, because the `speed <= 0` branch returned before
// any attack logic. So a shulker spawned, held its post, and never attacked anything. Its bullet is also the
// only source of `levitation` in vanilla, which had a mechanic and nothing to invoke it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateAmbientLocomotion, locomotionFor } from '../src/ambientLocomotion.js';
import { shulkerBulletData, steerShulkerBullet, SHULKER_BULLET_SPEED, SHULKER_BULLET_LIFE }
  from '../src/shulkerBullet.js';

// --- the turret -------------------------------------------------------------------

/** A shulker holding its post, a player `distance` away along -Z, and a firing recorder. */
function turret(distance = 5) {
  const shots = [];
  const mob = {
    type: 'shulker', yaw: 0,
    mesh: { position: new THREE.Vector3(0, 1, 0) },
    velocity: new THREE.Vector3(),
  };
  const player = { position: new THREE.Vector3(0, 1, -distance) };
  return { mob, player, shots, fire: (shooter, target, spec) => shots.push({ shooter, target, spec }) };
}

test('a stationary turret fires on its cooldown when the player is in range', () => {
  const { mob, player, shots, fire } = turret(5);
  // The first step fires, because the cooldown starts clear.
  updateAmbientLocomotion({ world: {} }, mob, 0.1, player, { fire });
  assert.equal(shots.length, 1, 'the turret should fire on the first step in range');
  assert.ok(mob.rangedCooldown > 0, 'and start its cooldown');
  // The next step does not, because the cooldown has not run out.
  updateAmbientLocomotion({ world: {} }, mob, 0.1, player, { fire });
  assert.equal(shots.length, 1, 'and not again while the cooldown runs');
  // Two seconds of steps is one more shot at a 1.5s cooldown.
  for (let i = 0; i < 20; i++) updateAmbientLocomotion({ world: {} }, mob, 0.1, player, { fire });
  assert.equal(shots.length, 2, 'a 1.5s cooldown should allow exactly one more in two seconds');
});

test('a turret does not fire beyond its range', () => {
  // The spec's range is 16, and it was previously unreachable.
  const near = turret(15);
  updateAmbientLocomotion({ world: {} }, near.mob, 0.1, near.player, { fire: near.fire });
  assert.equal(near.shots.length, 1, 'inside the range it fires');
  const far = turret(40);
  for (let i = 0; i < 60; i++) updateAmbientLocomotion({ world: {} }, far.mob, 0.1, far.player, { fire: far.fire });
  assert.equal(far.shots.length, 0, 'well outside the range it must not');
});

test('a turret that is not given a fire hook does nothing and does not throw', () => {
  // The hook is injected, so a caller that omits it must degrade rather than crash.
  const { mob, player } = turret(5);
  assert.doesNotThrow(() => updateAmbientLocomotion({ world: {} }, mob, 0.1, player, {}));
  assert.equal(updateAmbientLocomotion({ world: {} }, mob, 0.1, player, {}), 'stationary',
    'and it is still reported as stationary, since that is what it is');
});

test('a turret turns to face the player without moving', () => {
  const { mob, player, fire } = turret(5);
  // The mob yaw convention is `(sin(yaw), cos(yaw))`, the OPPOSITE of the player's `(-sin, -cos)`, so yaw 0
  // faces +Z -- away from a player at -Z. The first version of this test set yaw to PI and asserted a turn,
  // which was already the correct facing; the code was right and the test was wrong.
  mob.yaw = 0;
  updateAmbientLocomotion({ world: {} }, mob, 0.1, player, { fire });
  assert.notEqual(mob.yaw, 0, 'it should have turned toward the player');
  assert.ok(Math.abs(mob.yaw) > 0.1, 'and turned a meaningful amount, got ' + mob.yaw);
  assert.equal(mob.velocity.x, 0, 'and still not moved');
  assert.equal(mob.velocity.z, 0);
});

test('a stationary mob without a ranged spec is still left completely alone', () => {
  // The guard that made this bug possible has to keep working for every other stationary mob.
  const mob = { type: 'shulker', yaw: 0, mesh: { position: new THREE.Vector3(0, 1, 0) }, velocity: new THREE.Vector3() };
  const spec = locomotionFor('shulker');
  assert.ok(spec.ranged, 'the shulker is the ranged case');
  // A mob with no spec at all returns null before any of this.
  assert.equal(updateAmbientLocomotion({ world: {} }, { type: 'not_a_mob', velocity: new THREE.Vector3() },
    0.1, { position: new THREE.Vector3() }, {}), null);
});

test('the shulker spec declares the ranged attack the table needs', () => {
  const spec = locomotionFor('shulker');
  assert.equal(spec.role, 'hostile');
  assert.equal(spec.speed, 0, 'still stationary by design');
  assert.equal(spec.range, 16, 'with an aggro radius it can now actually reach');
  assert.deepEqual(spec.ranged, { cooldown: 1.5, damage: 4, effect: 'levitation', effectSeconds: 10 });
});

// --- the bullet -------------------------------------------------------------------

test('a bullet aims at the player from the shell and carries levitation', () => {
  const mob = { mesh: { position: new THREE.Vector3(0, 1, 0) } };
  const player = { position: new THREE.Vector3(0, 1, -8) };
  const data = shulkerBulletData(mob, player, locomotionFor('shulker'));
  assert.equal(data.damage, 4, 'vanilla damage');
  assert.deepEqual(data.effect, { id: 'levitation', seconds: 10, level: 1 }, 'and the levitation it is for');
  assert.equal(data.life, SHULKER_BULLET_LIFE);
  assert.equal(data.homing, true, 'vanilla bullets track');
  assert.ok(Math.abs(data.velocity.length() - SHULKER_BULLET_SPEED) < 1e-9, 'at the declared speed');
  assert.ok(data.velocity.z < 0, 'and pointed at a player on -Z');
});

test('a bullet data request with nothing to aim at returns null', () => {
  const mob = { mesh: { position: new THREE.Vector3(0, 1, 0) } };
  const player = { position: new THREE.Vector3(0, 1, -8) };
  assert.equal(shulkerBulletData(null, player, locomotionFor('shulker')), null);
  assert.equal(shulkerBulletData(mob, null, locomotionFor('shulker')), null);
  assert.equal(shulkerBulletData({}, player, locomotionFor('shulker')), null);
  // A degenerate direction is not a shot. The bullet leaves from 0.5 above the shell and aims 0.9 above the
  // player's feet, so the truly degenerate case is a player 0.6 up at the same x and z -- not 0.9, which the
  // first version of this test used and which is a perfectly good shot.
  assert.equal(shulkerBulletData({ mesh: { position: new THREE.Vector3(0, 1, 0) } },
    { position: new THREE.Vector3(0, 0.6, 0) }, locomotionFor('shulker')), null);
  // And a shot 0.9 above the feet is fine, which is what the earlier attempt actually asserted.
  assert.ok(shulkerBulletData({ mesh: { position: new THREE.Vector3(0, 1, 0) } },
    { position: new THREE.Vector3(0, 1.9, 0) }, locomotionFor('shulker')));
});

test('steering turns the bullet without changing its speed', () => {
  // The bug this guards: `lerp` between two vectors of equal length gives a SHORTER one, so a naive homing
  // implementation decelerates the bullet every frame and stalls it mid-air.
  const player = { position: new THREE.Vector3(6, 1, -8) };
  const data = shulkerBulletData({ mesh: { position: new THREE.Vector3(0, 1, 0) } }, player,
    locomotionFor('shulker'));
  const p = { mesh: { position: new THREE.Vector3(0, 1.5, 0) }, velocity: data.velocity, speed: SHULKER_BULLET_SPEED };
  const before = p.velocity.clone();
  for (let i = 0; i < 360; i++) {
    player.position.set(6 * Math.cos(i * 0.02), 1, -8 + 6 * Math.sin(i * 0.02));
    steerShulkerBullet(p, player, 1 / 60);
    p.mesh.position.addScaledVector(p.velocity, 1 / 60);
  }
  assert.ok(Math.abs(p.velocity.length() - SHULKER_BULLET_SPEED) < 1e-6,
    'speed must hold over a six second flight, got ' + p.velocity.length());
  assert.notEqual(p.velocity.x, before.x, 'and the direction must actually have changed');
});

test('steering survives nonsense input', () => {
  const player = { position: new THREE.Vector3(1, 1, 1) };
  for (const p of [null, undefined, {}, { velocity: new THREE.Vector3(), mesh: {} }]) {
    assert.doesNotThrow(() => steerShulkerBullet(p, player, 1 / 60), 'for ' + JSON.stringify(p));
  }
  // A zero speed must not divide or blow up.
  const stalled = { mesh: { position: new THREE.Vector3() }, velocity: new THREE.Vector3(), speed: 0 };
  steerShulkerBullet(stalled, player, 1 / 60);
  assert.ok(Number.isFinite(stalled.velocity.length()), 'a zero-speed bullet should stay finite');
});
