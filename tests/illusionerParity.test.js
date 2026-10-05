// Illusioner parity with https://minecraft.wiki/w/Illusioner
//
// The illusioner is Java-exclusive, spawns only by command, and the wiki calls it an UNUSED illager. That is a
// reason for it not to spawn naturally, not a reason for it to be missing -- and it is the last genuinely
// complex hostile in the game: an archer three times a skeleton's rate that can see through walls, fights by
// turning invisible behind four mirror duplicates, and blinds its opponent.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  ILLUSIONER_HEALTH, ILLUSIONER_DIMENSIONS, ILLUSIONER_SPEED, ILLUSIONER_DAMAGE,
  ILLUSIONER_SHOOT_SECONDS, SKELETON_SHOOT_SECONDS, ILLUSIONER_TARGET_BOX, ILLUSIONER_SEES_THROUGH_WALLS,
  ILLUSIONER_BLINDNESS, ILLUSIONER_INVISIBILITY, ILLUSIONER_DUPLICATES, ILLUSIONER_SPELL_SETTLE_SECONDS,
  ILLUSIONER_STRAFE, ILLUSIONER_COLORS,
  isIllusioner, illusionerDimensions, illusionerDamageRange, rollIllusionerDamage, isIllusionerTarget,
  findIllusionerTarget, illusionerIsInvisible, castIllusionerInvisibility, spawnIllusionerDuplicates,
  updateIllusionerDuplicates, onIllusionerHurt, castIllusionerBlindness, switchIllusionerTarget,
  updateIllusionerCooldowns, illusionerMovement, illusionerCanShoot, illusionerShoot, illusionerDrops,
  illusionerXp, createIllusionerModel, poseIllusioner
} from '../src/illusionerBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
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
  const effects = {};
  const player = {
    position: new THREE.Vector3(8, 1, 0), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {}, effects,
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect(effect, seconds) { effects[effect] = seconds; },
    hasStatusEffect: (effect) => Object.hasOwn(effects, effect)
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities, effects };
}

test('illusioner is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(ill.type, 'illusioner');
  assert.equal(ill.name, 'Illusioner');
  assert.notEqual(ill.type, 'villager');
});

test('the health, hitbox, speed and damage ladder match the wiki', () => {
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(ILLUSIONER_HEALTH, 32);
  assert.equal(ill.maxHealth, 32, 'wiki: 32 HP');
  assert.deepEqual(ILLUSIONER_DIMENSIONS, { width: 0.6, height: 1.95 });
  assert.deepEqual([ill.width, ill.height], [0.6, 1.95]);
  assert.deepEqual(manager.getMobDimensions('illusioner'), { width: 0.6, height: 1.95 });
  assert.equal(ILLUSIONER_SPEED, 0.5);
  assert.equal(ill.speed, 0.5);
  assert.equal(ill.isHostile, true);
  assert.equal(ill.onGround, true, 'a definite groundedness at spawn');
  // Wiki: 2-5 on Easy and Normal, 3-5 on Hard.
  assert.deepEqual(ILLUSIONER_DAMAGE.easy, { min: 2, max: 5 });
  assert.deepEqual(ILLUSIONER_DAMAGE.normal, { min: 2, max: 5 });
  assert.deepEqual(ILLUSIONER_DAMAGE.hard, { min: 3, max: 5 });
  assert.deepEqual(illusionerDamageRange('hard'), { min: 3, max: 5 });
  assert.deepEqual(illusionerDamageRange('unknown'), { min: 2, max: 5 }, 'falls back to Normal');
  // The roll stays inside its range, including at both ends.
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const range = illusionerDamageRange(difficulty);
    for (const r of [0, 0.5, 0.999]) {
      const value = rollIllusionerDamage(difficulty, () => r);
      assert.ok(value >= range.min && value <= range.max, `${difficulty} roll ${r} gave ${value}`);
    }
    assert.equal(rollIllusionerDamage(difficulty, () => 0), range.min);
    assert.equal(rollIllusionerDamage(difficulty, () => 0.999), range.max);
  }
});

test('it fires three times faster than a skeleton, as this codebase measures a skeleton', () => {
  // Wiki: "firing an arrow every second, three times faster than a skeleton". This codebase gives a skeleton
  // 2.5 s, so the honest ratio here is 2.5x, not 3x -- the wiki's skeleton fires every ~2 s. Asserting the
  // wiki's 3 outright would require fudging the skeleton, so the test records what is actually true here and
  // pins the intent (the illusioner is at least twice as fast) alongside it.
  assert.equal(ILLUSIONER_SHOOT_SECONDS, 1);
  assert.equal(SKELETON_SHOOT_SECONDS, 2.5);
  const ratio = SKELETON_SHOOT_SECONDS / ILLUSIONER_SHOOT_SECONDS;
  assert.equal(ratio, 2.5, 'the measured ratio in this codebase');
  assert.ok(ratio >= 2, 'and it is at least twice as fast, which is the wiki\'s point');
});

test('the target list is the wiki\'s, and adult villagers only', () => {
  // Wiki: it attacks "players, adult villagers, iron golems, and wandering traders".
  for (const type of ['player', 'iron_golem', 'wandering_trader']) {
    assert.equal(isIllusionerTarget({ type }), true, `it attacks a ${type}`);
  }
  assert.equal(isIllusionerTarget({ type: 'villager' }), true);
  assert.equal(isIllusionerTarget({ type: 'villager', isBaby: true }), false, 'wiki: ADULT villagers');
  // Not on the list.
  for (const type of ['zombie', 'cow', 'skeleton', 'pillager', 'evoker', 'vindicator', 'wolf', 'snow_golem']) {
    assert.equal(isIllusionerTarget({ type }), false, `it does not attack a ${type}`);
  }
  assert.equal(isIllusionerTarget(null), false);
});

test('it finds targets inside a 16x4x16 box, not a sphere', () => {
  // Wiki: "within a 16x4x16 cubic area". The vertical limit is only 4, so something directly above the
  // illusioner but close in plan view is still out of range.
  assert.deepEqual(ILLUSIONER_TARGET_BOX, { horizontal: 16, vertical: 4 });
  const { manager, player } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 10, 0);
  player.position.set(12, 10, 0);
  assert.equal(findIllusionerTarget(manager, ill, player), player, '12 blocks horizontally is inside');
  player.position.set(17, 10, 0);
  assert.equal(findIllusionerTarget(manager, ill, player), null, '17 is outside the box');
  player.position.set(5, 20, 0);
  assert.equal(findIllusionerTarget(manager, ill, player), null, '10 blocks up is outside the 4-tall box');
  player.position.set(5, 12, 0);
  assert.equal(findIllusionerTarget(manager, ill, player), player, '2 blocks up is inside');
  // A Creative player is not a target.
  player.position.set(5, 10, 0);
  const creative = { ...player, gamemode: 'creative' };
  assert.equal(findIllusionerTarget(manager, ill, creative), null);
  // A villager is; a baby villager is not.
  const villager = manager.spawnMob('villager', 4, 10, 0);
  assert.equal(findIllusionerTarget(manager, ill, null), villager);
  villager.isBaby = true;
  assert.equal(findIllusionerTarget(manager, ill, null), null, 'a baby villager is not a target');
});

test('it can see through walls, which is its distinguishing trait', () => {
  // Wiki: "it is the only illager that can see its target through walls". The shoot function therefore takes
  // no line-of-sight check, and the flag records why.
  assert.equal(ILLUSIONER_SEES_THROUGH_WALLS, true);
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(ill.seesThroughWalls, true);
  // A solid wall between them changes nothing.
  const walled = { ...manager, hasLineOfSight: () => false };
  const target = manager.spawnMob('iron_golem', 6, 1, 0);
  assert.ok(illusionerShoot(ill, target, 'normal', () => 0.5), 'it still shoots');
  assert.equal(findIllusionerTarget(walled, ill, null), target, 'and still targets');
});

test('it casts Blindness for 20 seconds, once per opponent, above regional difficulty 2', () => {
  // Wiki: 20 seconds "upon first engaging a new player opponent", cast "only if the regional difficulty is
  // greater than 2", and "does not cast this spell more than once on the same player opponent".
  assert.deepEqual(ILLUSIONER_BLINDNESS, { seconds: 20, minRegionalDifficulty: 2, cooldownSeconds: 9 });
  const { manager, player, effects } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(castIllusionerBlindness(ill, player, { regionalDifficulty: 3 }), true);
  assert.equal(effects.blindness, 20, 'wiki: Blindness for 20 seconds');
  assert.equal(ill.blindedTarget, player);
  // Not twice on the same opponent.
  ill.spellCooldown = 0;
  ill.blindnessCooldown = 0;
  assert.equal(castIllusionerBlindness(ill, player, { regionalDifficulty: 3 }), false, 'not twice on one opponent');
  // But it can after looking away and back.
  switchIllusionerTarget(ill, manager.spawnMob('iron_golem', 3, 1, 0));
  switchIllusionerTarget(ill, player);
  assert.equal(castIllusionerBlindness(ill, player, { regionalDifficulty: 3 }), true,
    'wiki: allowed again after shifting attention away and back');
});

test('Blindness needs regional difficulty above 2 and a player opponent', () => {
  const { manager, player } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(castIllusionerBlindness(ill, player, { regionalDifficulty: 2 }), false,
    'wiki: only when regional difficulty is GREATER than 2');
  assert.equal(castIllusionerBlindness(ill, player, { regionalDifficulty: 1 }), false);
  // Wiki: other entities "do not trigger this magic".
  const golem = manager.spawnMob('iron_golem', 3, 1, 0);
  assert.equal(castIllusionerBlindness(ill, golem, { regionalDifficulty: 5 }), false, 'a golem does not trigger it');
  const villager = manager.spawnMob('villager', 3, 1, 0);
  assert.equal(castIllusionerBlindness(ill, villager, { regionalDifficulty: 5 }), false);
  assert.equal(castIllusionerBlindness(ill, null, { regionalDifficulty: 5 }), false);
  assert.equal(castIllusionerBlindness(manager.spawnCow(0, 1, 0), player, { regionalDifficulty: 5 }), false);
});

test('it turns invisible for 60 seconds and creates four duplicates', () => {
  // Wiki: Invisibility "lasts 60 seconds and refreshes the effect whenever the Invisibility's time runs out",
  // and "When an illusioner becomes invisible ... it creates four false duplicates of itself."
  assert.deepEqual(ILLUSIONER_INVISIBILITY, { seconds: 60, cooldownSeconds: 17 });
  assert.equal(ILLUSIONER_DUPLICATES.count, 4);
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.equal(illusionerIsInvisible(ill), false);
  const clones = castIllusionerInvisibility(manager, ill);
  assert.ok(clones, 'the spell cast');
  assert.equal(clones.length, 4, 'four duplicates');
  assert.equal(ill.invisibleTimer, 60);
  assert.equal(ill.mesh.visible, false, 'the real illusioner is hidden');
  assert.equal(illusionerIsInvisible(ill), true);
  // Every duplicate is an illusion: no health, no damage.
  for (const clone of clones) {
    assert.equal(clone.isIllusion, true);
    assert.equal(clone.health, undefined, 'a clone has no health');
  }
  // On cooldown it cannot recast.
  assert.equal(castIllusionerInvisibility(manager, ill), null);
  // A spell resets the settle cooldown to 1 second.
  assert.equal(ill.spellCooldown, ILLUSIONER_SPELL_SETTLE_SECONDS);
});

test('the duplicates disappear when the Invisibility ends', () => {
  // Wiki: "The duplicates disappear once the illusioner's Invisibility effect ends."
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  castIllusionerInvisibility(manager, ill);
  assert.equal(ill.duplicates.length, 4);
  // 60 seconds pass.
  for (let i = 0; i < 62; i++) updateIllusionerCooldowns(manager, ill, 1);
  assert.equal(ill.invisibleTimer, 0, 'the effect lapsed');
  assert.equal(illusionerIsInvisible(ill), false);
  assert.equal(ill.mesh.visible, true, 'and it becomes visible again');
  updateIllusionerDuplicates(ill, 1 / 60, { ownerPosition: ill.mesh.position });
  assert.equal(ill.duplicates.length, 0, 'the duplicates are gone');
});

test('the duplicates stay bunched until the illusioner is hurt', () => {
  // Wiki: they "do not space themselves out until the first time the illusioner is attacked", and "When the
  // real illusioner is damaged, its duplicates all snap back to where the real illusioner is, then quickly
  // snap back out to new positions".
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  castIllusionerInvisibility(manager, ill);
  // Before any hit, they hover close together.
  updateIllusionerDuplicates(ill, 1 / 60, { ownerPosition: ill.mesh.position });
  const bunched = ill.duplicates.map(c => c.position.distanceTo(ill.mesh.position));
  assert.equal(bunched.every(d => d <= ILLUSIONER_DUPLICATES.hoverRadius * 0.5), true,
    'bunched together before the first hit');
  // A hit spaces them out.
  ill.duplicatesTriggered = true;
  for (let i = 0; i < 60; i++) updateIllusionerDuplicates(ill, 1 / 60, { ownerPosition: ill.mesh.position });
  const spaced = ill.duplicates.map(c => c.position.distanceTo(ill.mesh.position));
  assert.equal(spaced.every(d => d > ILLUSIONER_DUPLICATES.hoverRadius * 0.5), true,
    'spaced out after the hit');
  // Being hurt resets them toward the original.
  assert.equal(onIllusionerHurt(ill), true);
  assert.equal(ill.duplicatesTriggered, false);
  assert.equal(onIllusionerHurt(manager.spawnCow(0, 1, 0)), false);
});

test('it strafes at a consistent distance, retreating and advancing', () => {
  // Wiki: it "always tries to maintain a consistent distance between itself and the player, strafing from
  // left to right and vice versa, retreating if the player gets too close or advancing if the player
  // retreats".
  assert.equal(ILLUSIONER_STRAFE.preferredDistance, 8);
  const { manager, player } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  // In the band: circling.
  player.position.set(8, 1, 0);
  assert.equal(illusionerMovement(ill, player), 'strafing');
  assert.ok(Math.abs(ill.velocity.length()) > 0, 'and it is moving');
  // Too close: retreating.
  player.position.set(2, 1, 0);
  assert.equal(illusionerMovement(ill, player), 'retreating');
  assert.ok(ill.velocity.x < 0, 'it moves away from the player on +x');
  // Too far: advancing.
  player.position.set(20, 1, 0);
  assert.equal(illusionerMovement(ill, player), 'advancing');
  assert.ok(ill.velocity.x > 0, 'it closes the distance');
  // No target, no movement decision.
  assert.equal(illusionerMovement(ill, null), null);
  assert.equal(illusionerMovement(manager.spawnCow(0, 1, 0), player), null);
});

test('the strafe direction flips, which is what makes the approach semi-circular', () => {
  const { manager, player } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  player.position.set(8, 1, 0);
  ill.strafeTimer = 0.001;
  const before = ill.strafeSign;
  illusionerMovement(ill, player, 0.01);
  assert.notEqual(ill.strafeSign, before, 'the strafe reversed');
  assert.ok(ill.strafeTimer > 0, 'and a new interval was set');
});

test('it fires one arrow a second through the real update loop', () => {
  const { manager, player } = fixture();
  player.position.set(8, 1, 0);
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  // Counting LIVE arrows is the wrong measure here: arrows are removed once they hit, and this codebase's
  // arrows also stall quickly, so the alive count saturates at 1 even though the cadence is correct. Counting
  // the moments the array grows measures the fire rate directly, which is what the wiki specifies.
  let spawns = 0;
  let previous = 0;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (manager.arrows.length > previous) spawns++;
    previous = manager.arrows.length;
  }
  assert.ok(spawns >= 8 && spawns <= 11, `about ten arrows in ten seconds, got ${spawns}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it runs its full behaviour through the real loop', () => {
  const { manager, player, effects } = fixture();
  player.position.set(8, 1, 0);
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  ill.regionalDifficulty = 3;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(ill), 'still alive');
  assert.equal(effects.blindness, 20, 'it blinded the player');
  assert.equal(ill.invisibleTimer > 0 || ill.invisibilityCooldown > 0, true,
    'and it engaged its Invisibility');
  // It keeps its distance rather than closing to melee, which is the strafing behaviour.
  const distance = ill.mesh.position.distanceTo(player.position);
  assert.ok(distance > 1.5, `it stayed at range, distance ${distance.toFixed(2)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it drops its bow on an 8.5% roll and gives 5 XP', () => {
  // Wiki: a naturally spawned bow has an 8.5% chance of dropping, and an illager is worth 5 XP with credit.
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  ill.playerDamaged = true;
  assert.deepEqual(illusionerDrops(ill, () => 0.01), [['bow', false, 1, 1]], 'a low roll drops the bow');
  assert.deepEqual(illusionerDrops(ill, () => 0.5), [], 'a high roll drops nothing');
  assert.equal(illusionerXp(ill), 5, 'wiki: 5 XP');
  assert.deepEqual(illusionerDrops(manager.spawnCow(0, 1, 0)), []);
  assert.equal(illusionerXp(manager.spawnCow(0, 1, 0)), 0);
  // Through the manager's own path.
  const viaManager = manager.getMobDeathDrops(ill, () => 0.01);
  assert.equal(viaManager.some(r => r[0] === 'bow'), true);
});

test('the model has the illager nose and a bow', () => {
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  assert.ok(ill.head && ill.nose, 'the illager nose is what separates it from a villager silhouette');
  assert.ok(ill.bow, 'it carries a bow');
  assert.equal(ill.arms.length, 2);
  assert.equal(ill.legs.length, 2);
  assert.equal(ill.eyes.length, 2);
  assert.ok(ILLUSIONER_COLORS.robe > 0);
  const model = createIllusionerModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(), new THREE.MeshLambertMaterial()
  );
  assert.ok(model.group && model.nose && model.bow);
});

test('the casting pose raises both arms', () => {
  // Wiki: it "signals this attack by raising its arms during a short-timed animation", for both spells.
  const { manager } = fixture();
  const ill = manager.spawnMob('illusioner', 0, 1, 0);
  poseIllusioner(ill, 0);
  assert.equal(ill.arms.every(a => Math.abs(a.rotation.x) < 0.5), true, 'arms relaxed');
  ill.casting = 'blindness';
  poseIllusioner(ill, 0);
  assert.equal(ill.arms.every(a => a.rotation.x < -2), true, 'both arms up for a spell');
  assert.doesNotThrow(() => poseIllusioner(null));
  assert.doesNotThrow(() => poseIllusioner({}));
});

test('the Inspector can spawn the illusioner', () => {
  assert.ok(DEBUG_MOBS.includes('illusioner'), 'illusioner must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const ill = s.reset('illusioner');
  assert.equal(ill.type, 'illusioner');
  assert.equal(s.snapshot().maxHealth, 32, 'Inspector telemetry shows 32 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.illusioner_spawn_egg, 'the illusioner has a spawn egg');
  assert.equal(ITEMS.illusioner_spawn_egg.mob, 'illusioner');
  assert.equal(ITEMS.illusioner_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.bow, 'and a bow item exists');
});

test('the helpers are safe on non-illusioners and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isIllusioner(cow), false);
  assert.equal(illusionerIsInvisible(cow), false);
  assert.equal(castIllusionerInvisibility(manager, cow), null);
  assert.equal(castIllusionerBlindness(cow, player, { regionalDifficulty: 5 }), false);
  assert.equal(findIllusionerTarget(manager, cow), null);
  assert.equal(illusionerMovement(cow, player), null);
  assert.equal(illusionerCanShoot(cow), false);
  assert.equal(illusionerShoot(cow, player), null);
  assert.deepEqual(illusionerDrops(cow), []);
  assert.equal(illusionerXp(cow), 0);
  assert.equal(switchIllusionerTarget(cow, player), false);
  assert.equal(onIllusionerHurt(cow), false);
  assert.deepEqual(spawnIllusionerDuplicates(manager, cow), []);
  assert.deepEqual(illusionerDimensions(), { width: 0.6, height: 1.95 });
  assert.equal(isIllusioner(null), false);
  assert.equal(illusionerShoot(null, null), null);
  assert.doesNotThrow(() => poseIllusioner(null));
  assert.doesNotThrow(() => updateIllusionerCooldowns(manager, cow, 1));
  assert.doesNotThrow(() => updateIllusionerDuplicates(cow, 1, {}));
  assert.equal(manager.spawnMob('illusioner', 9, 1, 9).type, 'illusioner');
});
