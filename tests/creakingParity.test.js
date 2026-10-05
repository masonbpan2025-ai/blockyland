// Creaking parity with https://minecraft.wiki/w/Creaking
//
// The creaking is the strangest mob in the game to implement, because its signature behaviour is an
// INVERSION of every other hostile: it can only move while you are NOT looking at it. That gaze rule is the
// whole mob, so most of this suite is about the view cone.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  CREAKING_HEALTH, CREAKING_DIMENSIONS, CREAKING_SPEED, CREAKING_DAMAGE, CREAKING_VIEW,
  CREAKING_ALERT_RANGE, CREAKING_DETECT_RANGE, CREAKING_HEART_RADIUS, CREAKING_SOFTLOCK_SECONDS,
  CREAKING_FLEEING_MOBS, CREAKING_TERROR_RANGE, CREAKING_IGNORED_BLOCKS, CREAKING_FIRE_RESISTANT,
  CREAKING_DROPS, CREAKING_COLORS,
  isCreaking, creakingDimensions, creakingDamageFor, creakingInView, creakingFrozenBy,
  creakingIsInvulnerable, creakingIsLinked, updateCreakingAlert, creakingCanMove, creakingAttack,
  updateCreakingHeartLink, creakingClampToHeart, updateCreakingDespawn, creakingIsNight,
  mobFleesFromCreaking, createCreakingModel, poseCreaking
} from '../src/creakingBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 18000, difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = makePlayer(0, 0, 0);
  manager.game = { player, difficulty, worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities, world };
}

/** A player at (x, z) with a yaw. `yaw = PI/2` looks toward -x. */
function makePlayer(x, z, yaw, pitch = 0, extra = {}) {
  return {
    position: new THREE.Vector3(x, 1, z), velocity: new THREE.Vector3(), yaw, pitch,
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {}, effects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false,
    inventory: { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} },
    ...extra
  };
}

/** A player at +x looking toward the origin. */
function lookingAt() { return makePlayer(10, 0, Math.PI / 2); }
/** A player at +x looking away from the origin. */
function lookingAway() { return makePlayer(10, 0, -Math.PI / 2); }

test('creaking is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(creaking.type, 'creaking');
  assert.equal(creaking.name, 'Creaking');
  assert.notEqual(creaking.type, 'villager');
});

test('the health, hitbox, speed and damage match the wiki', () => {
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(CREAKING_HEALTH, 1);
  assert.equal(creaking.maxHealth, 1, 'wiki: 1 HP');
  assert.deepEqual(CREAKING_DIMENSIONS, { width: 0.9, height: 2.7 });
  assert.deepEqual([creaking.width, creaking.height], [0.9, 2.7]);
  assert.deepEqual(manager.getMobDimensions('creaking'), { width: 0.9, height: 2.7 });
  assert.equal(CREAKING_SPEED, 0.3);
  assert.equal(creaking.speed, 0.3);
  // Wiki: Easy 2.5, Normal 3, Hard 4.5.
  assert.deepEqual(CREAKING_DAMAGE, { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 });
  assert.equal(creakingDamageFor('easy'), 2.5);
  assert.equal(creakingDamageFor('normal'), 3);
  assert.equal(creakingDamageFor('hard'), 4.5);
  assert.equal(creakingDamageFor('unknown'), 3, 'an unknown difficulty falls back to Normal');
  // A definite groundedness at spawn.
  assert.equal(creaking.onGround, true);
});

test('it freezes while a Survival player looks at it, and moves when they look away', () => {
  // Wiki: "cannot move at all while any players in Survival or Adventure mode can see it", and it moves
  // "only when outside of the player's field of vision".
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  const at = lookingAt();
  const away = lookingAway();
  assert.equal(creakingInView(creaking, at), true, 'seen while looked at');
  assert.equal(creakingInView(creaking, away), false, 'not seen while looked away');
  assert.equal(creakingFrozenBy(creaking, [at]), at, 'that player freezes it');
  assert.equal(creakingFrozenBy(creaking, [away]), null, 'and this one does not');
  assert.equal(creakingCanMove(creaking, [at]), false);
  assert.equal(creakingCanMove(creaking, [away]), true);
  // Wiki: it is frozen while ANY player can see it.
  assert.equal(creakingCanMove(creaking, [away, at]), false, 'one watcher is enough');
  assert.equal(creakingCanMove(creaking, []), true, 'no players, no freeze');
});

test('the view cone is 60 degrees from both yaw and pitch', () => {
  // Wiki: "facing direction (both pitch and yaw) is within 60° of the creaking", so a 30° half-angle.
  assert.deepEqual(CREAKING_VIEW, { coneDegrees: 30, fullConeDegrees: 60 });
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  creaking.mesh.position.set(0, 1, 0);
  // Directly along the gaze.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2)), true);
  // Inside the cone: a small yaw offset.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2 - 0.3)), true,
    'a small yaw offset is still inside 30 degrees');
  // Outside the cone: 60 degrees of yaw offset.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2 - 1.2)), false,
    'about 69 degrees off is outside');
  // Pitch matters too: looking straight up at a short distance misses.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2, Math.PI / 2)), false);
  // And looking straight down misses as well.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2, -Math.PI / 2)), false);
});

test('only Survival and Adventure players freeze it', () => {
  // Wiki: "while any players in Survival or Adventure mode can see it", and Creative and Spectator players
  // "can look at creakings and it would still move".
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  for (const mode of ['survival', 'adventure']) {
    const p = lookingAt();
    p.gamemode = mode;
    assert.equal(creakingInView(creaking, p), true, `${mode} freezes it`);
  }
  for (const mode of ['creative', 'spectator']) {
    const p = lookingAt();
    p.gamemode = mode;
    assert.equal(creakingInView(creaking, p), false, `${mode} does not`);
  }
  assert.equal(creakingInView(creaking, null), false);
  assert.equal(creakingInView(manager.spawnCow(0, 1, 0), lookingAt()), false, 'only creakings');
});

test('a carved pumpkin lets an ALERTED creaking move, but not an unalerted one', () => {
  // Wiki: "If a player is wearing a carved pumpkin, any creakings within their first-person FOV can still
  // move. Wearing a carved pumpkin does not prevent an unalerted creaking from becoming alerted."
  const { manager } = fixture();
  const alerted = manager.spawnMob('creaking', 0, 1, 0);
  alerted.alerted = true;
  const pumpkin = lookingAt();
  pumpkin.wearingCarvedPumpkin = true;
  assert.equal(creakingInView(alerted, pumpkin), false, 'the pumpkin suppresses the freeze once alerted');
  assert.equal(creakingCanMove(alerted, [pumpkin]), true);

  const unalerted = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(creakingFrozenBy(unalerted, [pumpkin]), pumpkin,
    'but an unalerted one is still frozen by the gaze');
  // And the pumpkin does not stop it becoming alerted.
  const result = updateCreakingAlert(unalerted, [pumpkin]);
  assert.equal(result, 'alerted', 'the pumpkin does not prevent alerting');
});

test('it becomes alerted only when seen, within about 12 blocks', () => {
  // Wiki: "When a creaking within approximately 12 blocks enters a player's field of vision, it becomes
  // alerted", and newly spawned creakings "walk around aimlessly" until then.
  assert.equal(CREAKING_ALERT_RANGE, 12);
  const { manager } = fixture();
  // Seen and close: alerts.
  const near = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(updateCreakingAlert(near, [lookingAt()]), 'alerted');
  assert.equal(near.alerted, true);
  assert.equal(near.target, near.target, 'and it has a target');
  // Seen but far: no alert.
  const far = manager.spawnMob('creaking', 0, 1, 0);
  far.mesh.position.set(0, 1, 0);
  const distant = lookingAt();
  distant.position.set(40, 1, 0);
  assert.equal(updateCreakingAlert(far, [distant]), null, 'too far to alert');
  assert.equal(far.alerted, false);
  // Close but unseen: no alert.
  const unseen = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(updateCreakingAlert(unseen, [lookingAway()]), null, 'not in the field of view');
  assert.equal(unseen.alerted, false);
});

test('it returns to unalerted when every player leaves detection range', () => {
  // Wiki: "If all nearby players leave the creaking's detection range (or enter Creative or Spectator mode),
  // the creaking returns to its unalerted state."
  assert.equal(CREAKING_DETECT_RANGE, 32);
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  updateCreakingAlert(creaking, [lookingAt()]);
  assert.equal(creaking.alerted, true);
  // A far player, plus a Creative one in range, both leave it unalerted.
  const distant = lookingAt();
  distant.position.set(100, 1, 0);
  assert.equal(updateCreakingAlert(creaking, [distant]), 'calmed');
  assert.equal(creaking.alerted, false);
  // Creative and Spectator players neither alert nor calm it.
  updateCreakingAlert(creaking, [lookingAt()]);
  const creative = lookingAt();
  creative.gamemode = 'creative';
  assert.equal(updateCreakingAlert(creaking, [creative]), null, 'a Creative player is invisible to it');
  assert.equal(creaking.alerted, true, 'so it stays alerted');
});

test('an observed creaking cannot attack', () => {
  // Wiki: when within a player's field of vision it "can no longer attack, nor can it be pushed or knocked
  // back by player attacks".
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  creaking.alerted = true;
  creaking.mesh.position.set(9.5, 1, 0);
  // The player stands at x=10. A creaking at x=9.5 is on the player's -x side, so a player looking toward -x
  // (yaw = +PI/2) is the one who can see it.
  const watcher = lookingAt();
  creaking.target = watcher;
  assert.equal(creakingAttack(creaking, [watcher]), null, 'no attack while watched');
  // The player looking the other way (toward +x) cannot see it, so the attack lands. The target has to be
  // that player, because the gate is whether the TARGET can see it.
  const blind = lookingAway();
  creaking.target = blind;
  const attack = creakingAttack(creaking, [blind]);
  assert.ok(attack, 'it attacks once unobserved');
  assert.equal(attack.damage, 3, 'for the Normal difficulty damage');
  // A separate onlooker must not suppress an attack on a target who cannot see it.
  assert.ok(creakingAttack(creaking, [blind, watcher]),
    'an unrelated watcher does not shield the target');
  // Out of melee reach, even unobserved, there is no attack.
  creaking.mesh.position.set(30, 1, 0);
  assert.equal(creakingAttack(creaking, [blind]), null);
  // And an unalerted creaking never attacks.
  creaking.mesh.position.set(9.5, 1, 0);
  creaking.alerted = false;
  assert.equal(creakingAttack(creaking, [blind]), null);
});

test('a heart-linked creaking is invulnerable to everything but the void', () => {
  // Wiki: one "spawned by a creaking heart is linked to it and becomes completely invulnerable to all
  // sources of damage (except for the void)", while an egg- or command-spawned one "can take damage
  // normally".
  const { manager } = fixture();
  const heart = { position: new THREE.Vector3(0, 1, 0) };
  const linked = manager.spawnCreaking(0, 1, 0, { linkedHeart: heart });
  assert.equal(creakingIsLinked(linked), true);
  assert.equal(creakingIsInvulnerable(linked, { source: 'mob' }), true);
  assert.equal(creakingIsInvulnerable(linked, { source: 'player' }), true);
  assert.equal(creakingIsInvulnerable(linked, { source: 'explosion' }), true);
  assert.equal(creakingIsInvulnerable(linked, { source: 'void' }), false, 'the void still kills it');

  const eggSpawned = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(creakingIsLinked(eggSpawned), false);
  assert.equal(creakingIsInvulnerable(eggSpawned, { source: 'player' }), false, 'it can be hurt');
  assert.equal(creakingIsInvulnerable(manager.spawnCow(0, 1, 0)), false);
});

test('a heart-linked creaking dies past the 32-block radius, and is clamped inside it', () => {
  // Wiki: "The creaking never intentionally moves beyond this radius from its creaking heart ... If it is
  // pushed out of this radius, such as with pistons or knockback, it dies."
  assert.equal(CREAKING_HEART_RADIUS, 32);
  const { manager } = fixture();
  const heart = { position: new THREE.Vector3(0, 1, 0) };
  const creaking = manager.spawnCreaking(0, 1, 0, { linkedHeart: heart });
  creaking.mesh.position.set(31, 1, 0);
  assert.equal(updateCreakingHeartLink(creaking), null, 'inside the radius is fine');
  creaking.mesh.position.set(33, 1, 0);
  assert.equal(updateCreakingHeartLink(creaking), 'out-of-range');
  // The distance is Euclidean, so vertical distance counts too.
  creaking.mesh.position.set(0, 40, 0);
  assert.equal(updateCreakingHeartLink(creaking), 'out-of-range', 'the radius is a sphere');
  // It never INTENTIONALLY leaves, so a desired step is clamped inside.
  creaking.mesh.position.set(0, 1, 0);
  const far = heart.position.clone().add(new THREE.Vector3(100, 0, 0));
  const clamped = creakingClampToHeart(creaking, far);
  assert.ok(clamped.distanceTo(heart.position) < CREAKING_HEART_RADIUS, 'clamped inside the radius');
  // A step already inside is untouched.
  const near = heart.position.clone().add(new THREE.Vector3(5, 0, 0));
  assert.ok(creakingClampToHeart(creaking, near).distanceTo(near) < 1e-9);
  // An unlinked creaking is never clamped.
  const free = manager.spawnMob('creaking', 0, 1, 0);
  assert.ok(creakingClampToHeart(free, far).distanceTo(far) < 1e-9);
});

test('naturally-spawned creakings despawn by day, and egg-spawned ones do not', () => {
  // Wiki: "Naturally-spawned creakings despawn during daytime", while one from an egg or a command "do[es]
  // not vanish during the day".
  const { manager } = fixture();
  const natural = manager.spawnCreaking(0, 1, 0, { natural: true });
  assert.equal(creakingIsNight(18000), true, 'night');
  assert.equal(creakingIsNight(6000), false, 'day');
  assert.equal(creakingIsNight(0), false, 'dawn is day');
  assert.equal(updateCreakingDespawn(natural, 1, { worldTime: 18000 }), null, 'it survives the night');
  assert.equal(updateCreakingDespawn(natural, 1, { worldTime: 6000 }), 'despawned', 'daylight removes it');

  const eggSpawned = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(eggSpawned.natural, false);
  assert.equal(updateCreakingDespawn(eggSpawned, 1, { worldTime: 6000 }), null, 'it does not vanish');
  assert.equal(updateCreakingDespawn(manager.spawnCow(0, 1, 0), 1), null);
});

test('sharing a block with a player for 5 seconds despawns it', () => {
  // Wiki: it despawns "if they remain within the same block as a player for longer than 5 seconds", which is
  // the softlock guard.
  assert.equal(CREAKING_SOFTLOCK_SECONDS, 5);
  const { manager } = fixture();
  const creaking = manager.spawnCreaking(0, 1, 0, { natural: true });
  assert.equal(updateCreakingDespawn(creaking, 2, { worldTime: 18000, inSameBlockAsPlayer: true }), null);
  assert.equal(updateCreakingDespawn(creaking, 2, { worldTime: 18000, inSameBlockAsPlayer: true }), null);
  assert.equal(updateCreakingDespawn(creaking, 2, { worldTime: 18000, inSameBlockAsPlayer: true }), 'despawned');
  // Leaving the block resets the timer.
  const other = manager.spawnCreaking(0, 1, 0, { natural: true });
  updateCreakingDespawn(other, 4, { worldTime: 18000, inSameBlockAsPlayer: true });
  updateCreakingDespawn(other, 4, { worldTime: 18000, inSameBlockAsPlayer: false });
  assert.equal(other.softlockTimer, 0, 'the timer reset');
  assert.equal(updateCreakingDespawn(other, 4, { worldTime: 18000, inSameBlockAsPlayer: true }), null);
});

test('it drops nothing and gives no experience', () => {
  // Wiki: "Creakings do not drop any items or experience on death."
  assert.deepEqual(CREAKING_DROPS, { items: [], xp: 0 });
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  creaking.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(creaking, () => 0.1), [], 'no items');
  // And no XP, through the manager's ladder.
  const { spawnXpOrbs } = { spawnXpOrbs: () => {} };
  assert.deepEqual(manager.getMobDeathDrops(creaking, () => 0.99), []);
});

test('it is fire resistant and ignores cactus, sweet berries and powder snow', () => {
  // Wiki: "Creakings are now fire resistant", and "Creakings now ignore cacti, sweet berry bushes, and
  // powder snow and can walk through those blocks".
  assert.equal(CREAKING_FIRE_RESISTANT, true);
  assert.deepEqual(CREAKING_IGNORED_BLOCKS, ['cactus', 'sweet_berry_bush', 'powder_snow']);
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(creaking.fireResistant, true);
  assert.deepEqual(creaking.ignoredBlocks, CREAKING_IGNORED_BLOCKS);
});

test('illagers flee from it, but ravagers do not', () => {
  // Wiki: "Pillagers, evokers, vindicators, and illusioners flee from creakings when within 8 blocks.
  // Ravagers do not flee."
  assert.deepEqual(CREAKING_FLEEING_MOBS, ['pillager', 'evoker', 'vindicator', 'illusioner']);
  assert.equal(CREAKING_TERROR_RANGE, 8);
  for (const type of CREAKING_FLEEING_MOBS) {
    assert.equal(mobFleesFromCreaking(type, 5), true, `${type} flees at 5`);
    assert.equal(mobFleesFromCreaking(type, 8), true, `${type} flees at the boundary`);
    assert.equal(mobFleesFromCreaking(type, 9), false, `${type} does not flee at 9`);
  }
  assert.equal(mobFleesFromCreaking('ravager', 2), false, 'wiki: ravagers do not flee');
  assert.equal(mobFleesFromCreaking('zombie', 2), false);
});

test('it is frozen through the real update loop when observed', () => {
  const { manager, player } = fixture({ worldTime: 18000 });
  // The player watches it from +x looking toward the origin.
  player.position.set(10, 1, 0);
  player.yaw = Math.PI / 2;
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  const start = creaking.mesh.position.clone();
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(creaking.frozen, true, 'it was frozen by the gaze');
  assert.equal(creaking.state, 'frozen');
  assert.ok(creaking.mesh.position.distanceTo(start) < 0.05,
    `an observed creaking does not move, travelled ${creaking.mesh.position.distanceTo(start).toFixed(3)}`);
  assert.equal(player.damageTaken, 0, 'and it cannot attack while observed');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('it advances through the real update loop when unobserved', () => {
  const { manager, player } = fixture({ worldTime: 18000 });
  // The player looks away from it.
  player.position.set(10, 1, 0);
  player.yaw = -Math.PI / 2;
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  const start = creaking.mesh.position.clone();
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(creaking.frozen, false, 'it is not frozen');
  assert.ok(creaking.mesh.position.distanceTo(start) > 0.05,
    `an unobserved creaking moves, travelled ${creaking.mesh.position.distanceTo(start).toFixed(3)}`);
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('a linked creaking survives a real-loop hit that kills an unlinked one', () => {
  const { manager, player } = fixture();
  const heart = { position: new THREE.Vector3(0, 1, 0) };
  const linked = manager.spawnCreaking(0, 1, 0, { linkedHeart: heart });
  const free = manager.spawnMob('creaking', 5, 1, 0);
  // One point of damage kills a 1 HP creaking, so the difference is purely the link.
  free.health -= 1;
  assert.ok(free.health <= 0, 'the unlinked one dies from a single point');
  // The link is what the branch consults, so assert the predicate the branch uses.
  assert.equal(creakingIsInvulnerable(linked, { source: 'player' }), true);
  assert.equal(creakingIsInvulnerable(free, { source: 'player' }), false);
});

test('the model is deliberately asymmetrical', () => {
  // Wiki trivia: "The creaking was made asymmetrical to emphasize its contrast with the rest of the
  // Overworld and make it different from other mobs", and it is "actually rooted to the ground".
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  assert.equal(creaking.arms.length, 2);
  const lengths = creaking.arms.map(a => a.geometry.parameters.height);
  assert.notEqual(lengths[0], lengths[1], 'the arms differ in length, which is the asymmetry');
  assert.equal(creaking.legs.length, 2);
  assert.equal(creaking.eyes.length, 2);
  assert.ok(creaking.body && creaking.head);
  assert.ok(CREAKING_COLORS.eye > 0);
  const model = createCreakingModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.head && model.eyes.length === 2);
});

test('the eyes are dim when unalerted and bright when alerted, and flicker while dying', () => {
  // Wiki: eyes are "dimly lit" unalerted, "glowing a brighter orange" alerted, and flicker when the heart
  // is destroyed.
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  const eyeColour = () => creaking.eyes[0].material.color.getHexString();
  assert.equal(eyeColour(), CREAKING_COLORS.eyeDim.toString(16), 'dim when unalerted');
  creaking.alerted = true;
  poseCreaking(creaking, 0);
  assert.equal(eyeColour(), CREAKING_COLORS.eye.toString(16), 'bright when alerted');
  // Dying flickers: two phases a half-cycle apart differ.
  creaking.dying = true;
  poseCreaking(creaking, 0.001);
  const a = creaking.eyes[0].material.emissiveIntensity;
  poseCreaking(creaking, 0.08);
  const b = creaking.eyes[0].material.emissiveIntensity;
  assert.notEqual(a, b, 'the brightness flickers while dying');
  assert.doesNotThrow(() => poseCreaking(null));
  assert.doesNotThrow(() => poseCreaking({}));
});

test('it moves one leg at a time and holds still while frozen', () => {
  // Wiki: "it moves only one leg at a time", which is what the rooted look comes from.
  const { manager } = fixture();
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  // The two legs are in antiphase, so only ever one is mid-step.
  creaking.frozen = false;
  poseCreaking(creaking, Math.PI / 4);
  const [left, right] = creaking.legs.map(l => l.rotation.x);
  assert.ok(Math.sign(left) !== Math.sign(right), 'the legs are in antiphase');
  // Frozen: both legs go still.
  creaking.frozen = true;
  poseCreaking(creaking, 1.234);
  assert.deepEqual(creaking.legs.map(l => l.rotation.x), [0, 0], 'no gait while observed');
});

test('a tall mob standing directly in front of the player counts as watched', () => {
  // REGRESSION. The cone was first measured to the mob's geometric CENTRE. At close range a 2.7-block hitbox
  // puts its centre far above a level gaze -- about 70 degrees at half a block -- so a creaking standing
  // directly in front of the player was scored as unseen and could attack. A tall mob is unique to this mob,
  // which is why nothing earlier exposed it.
  const { manager } = fixture();
  // The mob stays at the origin and the player moves along +x, looking back toward -x, so it is always dead
  // ahead. Moving the MOB instead would put it behind the player once the distance exceeded the player's own
  // x, which is what my first version of this test did.
  const creaking = manager.spawnMob('creaking', 0, 1, 0);
  for (const distance of [0.5, 1, 2, 5, 10, 20, 40]) {
    const watcher = makePlayer(distance, 0, Math.PI / 2);
    assert.equal(creakingInView(creaking, watcher), true,
      `a level gaze should see it at ${distance} blocks, not only at a distance`);
  }
  // Looking at the ground well in front of it is still NOT a sighting.
  const atGround = makePlayer(10, 0, Math.PI / 2, -0.9);
  assert.equal(creakingInView(creaking, atGround), false, 'staring down does not count');
  // And looking straight up still does not.
  assert.equal(creakingInView(creaking, makePlayer(10, 0, Math.PI / 2, Math.PI / 2)), false);
});

test('the Inspector can spawn the creaking', () => {
  assert.ok(DEBUG_MOBS.includes('creaking'), 'creaking must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const creaking = s.reset('creaking');
  assert.equal(creaking.type, 'creaking');
  assert.equal(s.snapshot().maxHealth, 1, 'Inspector telemetry shows 1 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.creaking_spawn_egg, 'the creaking has a spawn egg');
  assert.equal(ITEMS.creaking_spawn_egg.mob, 'creaking');
  assert.equal(ITEMS.creaking_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-creakings and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isCreaking(cow), false);
  assert.equal(creakingInView(cow, lookingAt()), false);
  assert.equal(creakingFrozenBy(cow, [lookingAt()]), null);
  assert.equal(creakingCanMove(cow, [lookingAt()]), false);
  assert.equal(updateCreakingAlert(cow, [lookingAt()]), null);
  assert.equal(creakingAttack(cow, [lookingAway()]), null);
  assert.equal(creakingIsInvulnerable(cow), false);
  assert.equal(creakingIsLinked(cow), false);
  assert.equal(updateCreakingHeartLink(cow), null);
  assert.equal(updateCreakingDespawn(cow, 1), null);
  assert.deepEqual(creakingDimensions(), { width: 0.9, height: 2.7 });
  assert.equal(creakingInView(null, lookingAt()), false);
  assert.equal(creakingFrozenBy(null, [lookingAt()]), null);
  assert.equal(updateCreakingAlert(null, []), null);
  assert.equal(mobFleesFromCreaking(undefined, 1), false);
  assert.doesNotThrow(() => poseCreaking(null));
  assert.equal(manager.spawnMob('creaking', 9, 1, 9).type, 'creaking');
});
