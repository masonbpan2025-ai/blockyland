// Bat parity with https://minecraft.wiki/w/Bat
//
// Bat was another of the 38 missing types. It is the game's only ambient mob, and its defining
// behaviours are hanging upside down, fleeing nearby players even while hanging, and despawning
// past 32 blocks. It also drops nothing at all, which is asserted rather than assumed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  BAT_HEALTH, BAT_DIMENSIONS, BAT_DROPS, BAT_FLEE_RANGE, BAT_DESPAWN_RANGE,
  BAT_HANG_SECONDS, BAT_FLY_SECONDS,
  isBat, batDrops, canHang, disturbBat, startHanging, flySeconds, updateBatFlight,
  updateBatDespawn, createBatModel, poseBatWings
} from '../src/batBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ ceiling = false } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  // A floor at y<1, and optionally a ceiling block at y=4 so a bat can hang from it.
  const world = {
    getVoxel: (x, y, z) => {
      if (y < 1) return BLOCKS.STONE;
      if (ceiling && y === 4) return BLOCKS.STONE;
      return BLOCKS.AIR;
    },
    getHeightAt: () => 0,
    getLightLevel: () => 0
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 3, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, entities, player };
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('bat is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  assert.equal(bat.type, 'bat');
  assert.equal(bat.name, 'Bat');
  assert.notEqual(bat.type, 'villager');
});

test('bats have the reference 6 HP and 0.5 x 0.9 hitbox', () => {
  const { manager } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  assert.equal(bat.maxHealth, BAT_HEALTH);
  assert.equal(bat.maxHealth, 6, 'wiki: 6 HP');
  assert.equal(bat.health, 6);
  assert.deepEqual(BAT_DIMENSIONS, { width: 0.5, height: 0.9 });
  assert.deepEqual(manager.getMobDimensions('bat'), { width: 0.5, height: 0.9 });
  assert.deepEqual([bat.width, bat.height], [0.5, 0.9]);
});

test('the model has a body, head, two wings and two ears', () => {
  const { manager } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  assert.ok(bat.body, 'body');
  assert.ok(bat.head, 'head');
  assert.equal(bat.wings.length, 2, 'two wings');
  assert.equal(bat.ears.length, 2, 'two pointed ears');
  assert.equal(bat.eyes.length, 2, 'two eyes');
  for (const wing of bat.wings) {
    assert.ok(wing.pivot && wing.wing, 'each wing has a pivot so it can flap');
  }
});

test('the bat is an ambient, flying mob immune to fall damage', () => {
  const { manager } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  // Wiki: the only mob in the Ambient category, which does not count toward the passive cap;
  // and it carries the fall_damage_immune entity tag.
  assert.equal(bat.isAmbient, true);
  assert.equal(bat.isFlying, true);
  assert.equal(bat.fallDamageImmune, true);
});

test('bats drop no items and award no experience', () => {
  // Wiki: "Bats do not drop any items or experience upon death." Asserted explicitly so the
  // rule is distinguishable from a mob nobody wired up.
  assert.deepEqual(BAT_DROPS, []);
  assert.deepEqual(batDrops({ type: 'bat' }), []);

  const { manager, entities, player } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  bat.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(bat, () => 0.001), [], 'no items even with credit');

  manager.damageMob(bat, 1000, null, false, player);
  for (let i = 0; i < 12; i++) manager.update(0.1, player);
  assert.equal(xpFrom(entities), 0, `wiki: no XP either, got ${xpFrom(entities)}`);
});

test('a bat can hang from a solid block and not from air', () => {
  const without = fixture({ ceiling: false });
  const openBat = without.manager.spawnMob('bat', 0, 3, 0);
  assert.equal(canHang(without.manager, openBat), false, 'nothing solid above it');

  const withCeiling = fixture({ ceiling: true });
  // Positioned so the bat's back is against the ceiling block at y=4.
  const bat = withCeiling.manager.spawnMob('bat', 0, 3.1, 0);
  assert.equal(canHang(withCeiling.manager, bat), true, 'a solid block above it');
});

test('hanging moves the bat flush under the block and stops it', () => {
  const { manager } = fixture({ ceiling: true });
  const bat = manager.spawnMob('bat', 0, 3.1, 0);
  bat.velocity.set(1, 1, 1);
  assert.equal(startHanging(manager, bat), true);
  assert.equal(bat.isHanging, true);
  assert.deepEqual(bat.velocity.toArray(), [0, 0, 0], 'a hanging bat does not move');
  assert.ok(bat.hangTimer >= BAT_HANG_SECONDS.min, 'and gets a hang duration');
  // The bat's back sits flush against the underside of the ceiling block at y=4.
  assert.ok(bat.mesh.position.y < 4 && bat.mesh.position.y > 2.5, `y=${bat.mesh.position.y}`);
});

test('a disturbed bat takes off', () => {
  const { manager } = fixture({ ceiling: true });
  const bat = manager.spawnMob('bat', 0, 3.1, 0);
  startHanging(manager, bat);
  assert.equal(bat.isHanging, true);
  assert.equal(disturbBat(bat), true);
  assert.equal(bat.isHanging, false, 'it lets go');
  assert.ok(bat.flyTimer > 0, 'and starts a flight period');
  assert.equal(disturbBat({ type: 'cow' }), false, 'only bats');
});

test('the hang and flight durations are within the documented windows', () => {
  for (const r of [0, 0.5, 0.999999]) {
    const fly = flySeconds(() => r);
    assert.ok(fly >= BAT_FLY_SECONDS.min && fly <= BAT_FLY_SECONDS.max, `flySeconds(${r}) = ${fly}`);
  }
  assert.equal(flySeconds(() => 0), BAT_FLY_SECONDS.min);
  assert.ok(BAT_HANG_SECONDS.max > BAT_HANG_SECONDS.min);
});

test('an approaching player disturbs a hanging bat', () => {
  const { manager, player } = fixture({ ceiling: true });
  const bat = manager.spawnMob('bat', 0, 3.1, 0);
  startHanging(manager, bat);
  assert.equal(bat.isHanging, true, 'it is hanging to begin with');
  // Far away: it stays hanging.
  player.position.set(40, 3, 40);
  updateBatFlight(manager, bat, 1 / 60, player);
  assert.equal(bat.isHanging, true, 'undisturbed at range');

  // Inside the flee range: it drops off and flies away.
  player.position.set(0, 3, 2);
  updateBatFlight(manager, bat, 1 / 60, player);
  assert.equal(bat.isHanging, false, 'wiki: a nearby player makes it fly away');
  assert.equal(bat.isFleeing, true);
  assert.ok(Math.hypot(bat.velocity.x, bat.velocity.z) > 0.5, 'and it moves away');
});

test('invisibility does not save the player, as the wiki says', () => {
  const { manager, player } = fixture({ ceiling: true });
  const bat = manager.spawnMob('bat', 0, 3, 0);
  startHanging(manager, bat);
  // The wiki: it flies away "even if the player is invisible". The player here has no
  // invisibility handling at all, which is the point — nothing may consult it.
  player.statusEffects = { invisibility: { seconds: 30 } };
  player.position.set(0, 3, 2);
  updateBatFlight(manager, bat, 1 / 60, player);
  assert.equal(bat.isHanging, false, 'it still flees');
  assert.equal(bat.isFleeing, true);
});

test('a bat whose hanging block is removed falls off', () => {
  const { manager } = fixture({ ceiling: true });
  const bat = manager.spawnMob('bat', 0, 3, 0);
  startHanging(manager, bat);
  assert.equal(bat.isHanging, true);
  // Remove the ceiling.
  manager.isBlockSolid = () => false;
  updateBatFlight(manager, bat, 1 / 60, null);
  assert.equal(bat.isHanging, false, 'wiki: breaking the block drops the bat');
});

test('a bat with nowhere to hang keeps flying', () => {
  const { manager, player } = fixture({ ceiling: false });
  const bat = manager.spawnMob('bat', 0, 3, 0);
  bat.flyTimer = 0.01;
  player.position.set(500, 3, 500);
  for (let i = 0; i < 60; i++) updateBatFlight(manager, bat, 1 / 60, player);
  assert.equal(bat.isHanging, false, 'no ceiling means no hanging');
  assert.ok(Math.hypot(bat.velocity.x, bat.velocity.z) > 0.1, 'so it keeps moving');
});

test('a flying bat actually moves through the real update loop', () => {
  const { manager, player } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  // The player must be inside the despawn range or the bat is removed on the first frame.
  player.position.set(0, 3, 5);
  const before = bat.mesh.position.clone();
  for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  assert.ok(manager.mobs.includes(bat), 'the bat is still in the world');
  assert.ok(bat.mesh.position.distanceTo(before) > 0.5,
    `a bat should fly around, moved ${bat.mesh.position.distanceTo(before)}`);
});

test('the floor keeps a bat from flying into the ground', () => {
  const { manager, player } = fixture();
  const bat = manager.spawnMob('bat', 0, 1.2, 0);
  player.position.set(0, 3, 5);
  for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  assert.ok(bat.mesh.position.y >= 0.9, `a bat should stay above the floor, y=${bat.mesh.position.y}`);
});

test('a bat despawns past 32 blocks and not before', () => {
  assert.equal(BAT_DESPAWN_RANGE, 32);
  const { manager, player } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);

  player.position.set(0, 3, 30);
  assert.equal(updateBatDespawn(manager, bat, player), false, '30 blocks is inside the range');
  assert.equal(manager.mobs.includes(bat), true);

  player.position.set(0, 3, 40);
  assert.equal(updateBatDespawn(manager, bat, player), true, '40 blocks despawns it');
  assert.equal(manager.mobs.includes(bat), false, 'and it leaves the mob list');
  assert.equal(bat.mesh.parent, null, 'and the scene');
  assert.equal(bat.despawned, true);
});

test('a named bat does not despawn', () => {
  const { manager, player } = fixture();
  const bat = manager.spawnMob('bat', 0, 3, 0);
  bat.name = 'Batty';
  player.position.set(0, 3, 200);
  assert.equal(updateBatDespawn(manager, bat, player), false, 'a named bat is permanent');
  assert.equal(manager.mobs.includes(bat), true);

  const flagged = manager.spawnMob('bat', 0, 3, 0);
  flagged.persistent = true;
  assert.equal(updateBatDespawn(manager, flagged, player), false, 'the persistent flag is enough');
});

test('the despawn helper ignores non-bats, the dead and a missing player', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  player.position.set(0, 3, 500);
  assert.equal(updateBatDespawn(manager, cow, player), false, 'a cow is not a bat');
  const dead = manager.spawnMob('bat', 0, 3, 0);
  dead.health = 0;
  assert.equal(updateBatDespawn(manager, dead, player), false, 'the dead are skipped');
  const alive = manager.spawnMob('bat', 0, 3, 0);
  assert.equal(updateBatDespawn(manager, alive, null), false, 'no player, no despawn check');
  assert.equal(isBat(cow), false);
});

test('the wings expose the shared flying-mob contract and fold while hanging', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const wingMat = new THREE.MeshLambertMaterial();
  const earMat = new THREE.MeshLambertMaterial();
  const model = createBatModel(bodyMat, wingMat, earMat);

  // moveFlyingMob addresses the wings as `mob.wings.left.rotation` and `...right.rotation`, so
  // the model must expose that shape or the shared flight animation throws and freezes the mob.
  assert.ok(model.wings.left, 'wings.left exists');
  assert.ok(model.wings.right, 'wings.right exists');
  assert.ok(model.wings.left.rotation && model.wings.right.rotation, 'each wing has a rotation');
  assert.equal(model.wings.length, 2, 'and can still be counted by index');

  // Folding is the bat-specific part: while hanging the wings tuck against the body and the
  // body turns upside down, which is the wiki's hanging pose.
  const mesh = new THREE.Group();
  poseBatWings({ ...model, isHanging: true, mesh }, 1);
  assert.ok(model.wings.every(w => Math.abs(w.pivot.rotation.z) > 1), 'the wings fold');
  assert.equal(mesh.rotation.x, Math.PI, 'and the bat hangs upside down');

  // While flying the body is upright; the flapping itself belongs to the shared helper.
  const flyingMesh = new THREE.Group();
  flyingMesh.rotation.x = 1;
  poseBatWings({ ...model, isHanging: false, mesh: flyingMesh }, 1);
  assert.equal(flyingMesh.rotation.x, 0, 'a flying bat is upright');

  assert.doesNotThrow(() => poseBatWings({}, 1));
  assert.doesNotThrow(() => poseBatWings(null, 1));
});

test('the Inspector can spawn the bat and reports its hang state', () => {
  assert.ok(DEBUG_MOBS.includes('bat'), 'bat must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const bat = s.reset('bat');
  assert.equal(bat.type, 'bat', 'the Inspector spawns a real bat');
  assert.equal(s.snapshot().health, 6, 'Inspector telemetry shows 6 HP');
  assert.equal(s.snapshot().maxHealth, 6);
  assert.equal(s.snapshot().hanging, false);
  assert.equal(s.snapshot().batFleeing, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 6);
});
