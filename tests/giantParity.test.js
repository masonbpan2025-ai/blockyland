// Giant parity with https://minecraft.wiki/w/Giant
//
// The giant is the strangest mob to test here, because its defining property is an ABSENCE: "Giants currently
// have no AI ... they always face south when summoned, and they always stay that way, never wandering. They
// cannot turn their head, chase the player, or respond to damage." So most of this suite is NEGATIVE, and the
// negative assertions are the specification rather than a gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  GIANT_HEALTH, GIANT_DIMENSIONS, ZOMBIE_DIMENSIONS, GIANT_SCALE, GIANT_DAMAGE, GIANT_UNDEAD_PROPERTIES,
  GIANT_DROWNING, GIANT_FACING_YAW, GIANT_HAS_AI, GIANT_COLORS,
  isGiant, giantDimensions, giantDamageFor, giantBurnsInDaylight, giantFacing, giantMoves,
  giantReactionToDamage, giantAcceptsEffect, giantPotionOutcome, giantScaresArmadillos, giantUnderwaterOutcome,
  giantDrops, giantXp, giantAttack, createGiantModel, poseGiant
} from '../src/giantBehavior.js';
import { ARMADILLO_UNDEAD } from '../src/armadilloBehavior.js';
import { SNOW_GOLEM_HOSTILES, snowGolemTargets } from '../src/snowGolemBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000 } = {}) {
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
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(500, 1, 300), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

test('giant is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(giant.type, 'giant');
  assert.equal(giant.name, 'Giant');
  assert.notEqual(giant.type, 'villager');
  assert.equal(isGiant(giant), true);
  assert.equal(isGiant('giant'), true);
  assert.equal(isGiant(null), false);
  assert.equal(isGiant({ type: 'zombie' }), false);
});

test('the health, hitbox and damage ladder match the wiki', () => {
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(GIANT_HEALTH, 100);
  assert.equal(giant.maxHealth, 100, 'wiki: 100 HP');
  assert.deepEqual(GIANT_DIMENSIONS, { width: 3.6, height: 12 });
  assert.deepEqual([giant.width, giant.height], [3.6, 12]);
  assert.deepEqual(manager.getMobDimensions('giant'), { width: 3.6, height: 12 });
  assert.equal(giant.isHostile, true);
  assert.equal(giant.onGround, true, 'a definite groundedness at spawn');
  // Wiki: Easy 26, Normal 50, Hard 75.
  assert.deepEqual(GIANT_DAMAGE, { peaceful: 0, easy: 26, normal: 50, hard: 75 });
  assert.equal(giantDamageFor('easy'), 26);
  assert.equal(giantDamageFor('normal'), 50);
  assert.equal(giantDamageFor('hard'), 75);
  assert.equal(giantDamageFor('unknown'), 50, 'an unknown difficulty falls back to Normal');
});

test('it is a six-times-enlarged zombie, exactly', () => {
  // Wiki: "they use a six-times-enlarged zombie model." So the giant's box must BE the zombie's times six --
  // asserting the number rather than restating it is what keeps the two in step if either changes.
  assert.equal(GIANT_SCALE, 6);
  assert.deepEqual(ZOMBIE_DIMENSIONS, { width: 0.6, height: 1.95 });
  assert.ok(Math.abs(GIANT_DIMENSIONS.width - ZOMBIE_DIMENSIONS.width * GIANT_SCALE) < 1e-9,
    `3.6 should be 6 x 0.6, got ${ZOMBIE_DIMENSIONS.width * GIANT_SCALE}`);
  // 1.95 x 6 is 11.7, and the wiki states 12 -- so the height is the stated value, not the product. Recorded
  // because the two disagree by 0.3 and that is the wiki's own inconsistency, not a rounding slip here.
  assert.equal(GIANT_DIMENSIONS.height, 12, 'the wiki states 12 blocks');
  assert.deepEqual(giantDimensions(), GIANT_DIMENSIONS);
});

test('it is NOT undead, and every consequence follows', () => {
  // Wiki: "Giants are not undead mobs." That sentence drives six separate differences from the zombie, so the
  // test asserts each one rather than trusting a single flag.
  assert.equal(GIANT_UNDEAD_PROPERTIES.undead, false);
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(giant.undead, false, 'the mob itself carries the flag as false');
  // Wiki: "they do not burn in sunlight".
  assert.equal(giantBurnsInDaylight(), false);
  assert.equal(giant.burnsInDaylight, false);
  // Wiki: "damaged by potions of Harming and healed by potions of Healing" -- the OPPOSITE of an undead mob.
  assert.equal(giantPotionOutcome('healing'), 'heal');
  assert.equal(giantPotionOutcome('harming'), 'damage');
  assert.equal(giantPotionOutcome('swiftness'), 'none');
  // Wiki: "immune to Smite", "affected by Regeneration and Poison".
  assert.equal(giantAcceptsEffect('smite'), false);
  assert.equal(giantAcceptsEffect('regeneration'), true);
  assert.equal(giantAcceptsEffect('poison'), true);
  assert.equal(giant.immuneToSmite, true);
  // Wiki: "do not scare armadillos".
  assert.equal(giantScaresArmadillos(), false);
  // Wiki: "do not convert into drowned when submerged in water; instead, they slowly suffocate and die."
  assert.equal(GIANT_DROWNING.converts, false);
  assert.equal(giantUnderwaterOutcome(), 'suffocates');
});

test('the armadillo does not treat it as undead, which the wiki calls out', () => {
  // Wiki: giants "do not scare armadillos". The armadillo's own list is explicit, so this asserts the pair
  // agree rather than that one derives from the other.
  assert.equal(ARMADILLO_UNDEAD.includes('giant'), false, 'the giant is not on the armadillo threat list');
  assert.equal(giantScaresArmadillos(), false);
  // And the mob does not carry an undead flag that the armadillo would pick up instead.
  const { manager } = fixture();
  assert.equal(manager.spawnMob('giant', 0, 1, 0).undead, false);
});

test('the snow golem attacks it, because the wiki lists giants among its targets', () => {
  // Wiki: "Iron golems and snow golems attack giants as they attack other monster mobs." The snow golem's
  // provocation table in this codebase is explicit, so the giant had to be ADDED to it -- which this test
  // found, and which is why the assertion is on the behaviour rather than only on the list.
  assert.ok(SNOW_GOLEM_HOSTILES.includes('giant'), 'the giant is on the snow golem provocation table');
  assert.equal(snowGolemTargets('giant'), true, 'so a snow golem will actually shoot at one');
});

test('it has NO AI: it never moves, never turns, and never reacts', () => {
  // Wiki: "Giants currently have no AI. The consequence of this is that they always face south when summoned,
  // and they always stay that way, never wandering. They cannot turn their head, chase the player, or respond
  // to damage."
  assert.equal(GIANT_HAS_AI, false);
  assert.equal(giantMoves(), false);
  assert.equal(giantReactionToDamage(), null, 'it does not flee or retaliate');
  const { manager, player } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(giant.hasAI, false);
  assert.equal(giant.immobile, true);
  assert.equal(giant.speed, 0, 'it has no speed to use');
  // Six seconds with the player close by: not one block of movement, and no rotation.
  const start = giant.mesh.position.clone();
  player.position.set(4, 1, 0);
  for (let i = 0; i < 360; i++) manager.update(1 / 60, player);
  assert.equal(giant.mesh.position.distanceTo(start), 0, 'it did not move at all');
  assert.equal(giant.mesh.rotation.y, GIANT_FACING_YAW, 'and did not turn');
  assert.equal(giant.yaw, GIANT_FACING_YAW);
  assert.equal(player.damageTaken, 0, 'and it never attacks');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it always faces south, which is yaw 0 here', () => {
  // Wiki: "they always face south when summoned, and they always stay that way". In this codebase the model
  // faces +z at yaw 0, and +z is south.
  assert.equal(GIANT_FACING_YAW, 0);
  assert.equal(giantFacing(), 0);
  const { manager, player } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(giant.mesh.rotation.y, 0, 'facing south at spawn');
  // A player circling it does not change that.
  for (const [x, z] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
    player.position.set(x, 1, z);
    for (let i = 0; i < 10; i++) manager.update(1 / 60, player);
    assert.equal(giant.mesh.rotation.y, 0, `still facing south with the player at ${x},${z}`);
  }
});

test('it does not burn in daylight, unlike the zombie it is modelled on', () => {
  const { manager, player } = fixture({ worldTime: 6000 });
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.equal(giant.burnsInDaylight, false, 'the giant says so itself');
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(giant.isBurning, false, 'the giant never catches fire');
  assert.equal(giant.health, giant.maxHealth, 'and takes no fire damage');
  // What makes the negative meaningful is that the flag is explicitly FALSE rather than merely absent, since
  // an absent flag is also falsy. Asserting `false` is the stronger claim.
  assert.equal(giantBurnsInDaylight(), false);
  assert.equal(GIANT_UNDEAD_PROPERTIES.burnsInDaylight, false);
  // SCOPE NOTE: a plain zombie in this codebase does NOT burn in daylight either -- only the skeleton variants
  // and the undead horses carry a `burnsInDaylight` flag. That is a pre-existing gap unrelated to the giant, so
  // it is recorded in the parity doc rather than asserted around here.
});

test('the attack exists but is unreachable unless it is ridden', () => {
  // Wiki: it has no AI, so it cannot attack. Its infobox still gives a damage ladder, and "Giants can move if
  // ridden by another mob" is the one case where the damage is reachable -- so the gate is explicit.
  const { manager, player } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  player.position.set(2, 1, 0);
  assert.equal(giantAttack(giant, player), null, 'an unridden giant never attacks');
  assert.equal(giantAttack(giant, player, { ridden: true, difficulty: 'hard' }).damage, 75);
  assert.equal(giantAttack(giant, player, { ridden: true, difficulty: 'normal' }).damage, 50);
  // Out of its reach, even ridden.
  player.position.set(60, 1, 0);
  assert.equal(giantAttack(giant, player, { ridden: true }), null);
  // Its reach scales with the six-times model rather than a zombie's arm.
  const reach = GIANT_DIMENSIONS.width * 0.5 + 1.5;
  player.position.set(reach + 0.1, 1, 0);
  assert.equal(giantAttack(giant, player, { ridden: true }), null, 'just beyond reach');
  player.position.set(reach - 0.1, 1, 0);
  assert.ok(giantAttack(giant, player, { ridden: true }), 'just inside reach');
  assert.equal(giantAttack(manager.spawnCow(0, 1, 0), player, { ridden: true }), null);
  assert.equal(giantAttack(giant, null, { ridden: true }), null);
});

test('it drops nothing and gives no experience', () => {
  // Wiki: the giant's page gives no drop table and no XP value.
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  giant.playerDamaged = true;
  assert.deepEqual(giantDrops(), []);
  assert.deepEqual(manager.getMobDeathDrops(giant, () => 0.5), [], 'nothing through the manager either');
  assert.equal(giantXp(), 0);
});

test('it survives the real update loop under several world states', () => {
  const { manager, player } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.doesNotThrow(() => {
    for (const [time, weather] of [[6000, 'clear'], [18000, 'clear'], [6000, 'rain'], [18000, 'thunder']]) {
      manager.game.worldTime = time;
      manager.game.weather.weatherType = weather;
      for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
      assert.equal(giant.isBurning, false, `no burning at time ${time} / ${weather}`);
    }
  });
  assert.ok(manager.mobs.includes(giant), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the model is the zombie silhouette at six times scale', () => {
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  assert.ok(giant.body && giant.head, 'a body and head');
  assert.equal(giant.arms.length, 2, 'two arms');
  assert.equal(giant.legs.length, 2);
  assert.equal(giant.eyes.length, 2);
  // The zombie's outstretched arms are what make the silhouette read as a zombie at any scale.
  assert.ok(Math.abs(giant.arms[0].rotation.x + Math.PI / 2) < 1e-9, 'the arms are held out forward');
  // The six-times scale lives on the model, which is what turns the zombie's box into the giant's.
  assert.equal(giant.body.parent.scale.x, GIANT_SCALE);
  assert.ok(GIANT_COLORS.skin > 0);
  const model = createGiantModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial());
  assert.ok(model.group && model.head && model.arms.length === 2);
  assert.equal(model.group.scale.x, GIANT_SCALE);
});

test('the pose leaves it standing, since it has no gait', () => {
  const { manager } = fixture();
  const giant = manager.spawnMob('giant', 0, 1, 0);
  giant.legs[0].rotation.x = 1.2;
  poseGiant(giant, 5);
  assert.equal(giant.legs[0].rotation.x, 0, 'the legs are never animated');
  // The pose is safe on anything, so a caller can call it every frame.
  assert.doesNotThrow(() => poseGiant(null));
  assert.doesNotThrow(() => poseGiant({}));
  assert.doesNotThrow(() => poseGiant(manager.spawnCow(0, 1, 0)));
});

test('the Inspector can spawn the giant', () => {
  assert.ok(DEBUG_MOBS.includes('giant'), 'giant must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const giant = s.reset('giant');
  assert.equal(giant.type, 'giant');
  assert.equal(s.snapshot().maxHealth, 100, 'Inspector telemetry shows 100 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.giant_spawn_egg, 'the giant has a spawn egg');
  assert.equal(ITEMS.giant_spawn_egg.mob, 'giant');
  assert.equal(ITEMS.giant_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-giants and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isGiant(cow), false);
  assert.equal(giantAttack(cow, { position: new THREE.Vector3() }, { ridden: true }), null);
  assert.deepEqual(giantDrops(), []);
  assert.equal(giantXp(), 0);
  assert.deepEqual(giantDimensions(), { width: 3.6, height: 12 });
  assert.equal(giantDamageFor(undefined), 50);
  assert.equal(giantAcceptsEffect(null), true);
  assert.equal(giantPotionOutcome(null), 'none');
  assert.equal(giantBurnsInDaylight(), false);
  assert.equal(giantMoves(), false);
  assert.equal(giantReactionToDamage(), null);
  assert.doesNotThrow(() => poseGiant(null));
  assert.equal(manager.spawnMob('giant', 9, 1, 9).type, 'giant');
});
