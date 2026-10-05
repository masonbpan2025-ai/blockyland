// Piglin Brute parity with https://minecraft.wiki/w/Piglin_Brute
//
// The brute is a stronger piglin, and almost all of its identity is what it does NOT do: "Unlike piglins,
// piglin brutes do not barter, retreat, or get distracted by gold." So most of this suite drives the PIGLIN's
// own AI and asserts that the brute opts out, which is the only way to test a difference expressed as an
// absence.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { EntityManager } from '../src/entities.js';
import {
  PIGLIN_BRUTE_HEALTH, PIGLIN_BRUTE_DIMENSIONS, PIGLIN_HEALTH, PIGLIN_BRUTE_DAMAGE,
  PIGLIN_BRUTE_WEAPON, PIGLIN_BRUTE_WEAPON_DROP_CHANCE, PIGLIN_BRUTE_DIFFERENCES, PIGLIN_BRUTE_SHARED,
  PIGLIN_BRUTE_COLORS,
  isPiglinBrute, piglinBruteHealth, piglinBruteDimensions, piglinBruteDamageFor, piglinBruteBarters,
  piglinBruteRetreats, piglinBruteDistractedByGold, piglinBrutePursues, makePiglinBrute, piglinBruteDrops,
  piglinBruteXp
} from '../src/piglinBruteBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {},
    // Piglins zombify outside the Nether, so the fixture keeps them in it unless a test moves them.
    isNether: true, dimension: 'nether', mobGriefing: true
  };
  const entities = Object.assign(new EntityManager(scene, world), {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  });
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(0, 1, 4), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, armor: {}, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  // Both are needed: `HostileMobBehaviors` reads `mobManager.animalBehaviors` for shared helpers, exactly as
  // the real `MobManager` constructor wires them.
  const behaviors = new AnimalBehaviors(manager, world, sounds, entities);
  manager.animalBehaviors = behaviors;
  manager.hostileBehaviors = new HostileMobBehaviors(manager, world, sounds, entities);
  return { manager, player, entities, behaviors };
}

test('piglin brute is spawnable by name and reports the piglin type with a brute flag', () => {
  const { manager } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  assert.ok(brute, 'it spawns');
  assert.equal(brute.name, 'Piglin Brute');
  // It keeps the piglin TYPE on purpose: it is a piglin for anger, equipment and zombification, and the
  // alternative was duplicating the piglin's whole AI to change three behaviours.
  assert.equal(brute.type, 'piglin');
  assert.equal(brute.isBrute, true);
  assert.equal(isPiglinBrute(brute), true);
  // A plain piglin is not a brute.
  assert.equal(isPiglinBrute(manager.spawnMob('piglin', 5, 1, 0)), false);
  assert.equal(isPiglinBrute('piglin_brute'), true);
  assert.equal(isPiglinBrute('piglin'), false);
  assert.equal(isPiglinBrute(null), false);
});

test('the health, hitbox and damage ladder match the wiki', () => {
  const { manager } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  assert.equal(PIGLIN_BRUTE_HEALTH, 50);
  assert.equal(brute.maxHealth, 50, 'wiki: 50 HP');
  // The contrast the brute is defined by.
  assert.equal(PIGLIN_HEALTH, 16);
  assert.equal(manager.spawnMob('piglin', 5, 1, 0).maxHealth, 16, 'a plain piglin has 16');
  // Wiki: the same 0.6 x 1.95 box as a piglin.
  assert.deepEqual(PIGLIN_BRUTE_DIMENSIONS, { width: 0.6, height: 1.95 });
  assert.deepEqual(manager.getMobDimensions('piglin_brute'), { width: 0.6, height: 1.95 });
  assert.deepEqual(piglinBruteDimensions(), PIGLIN_BRUTE_DIMENSIONS);
  // Wiki: armed 7.5/13/19.5, unarmed 4.5/7/10.5 on Easy/Normal/Hard.
  assert.deepEqual(PIGLIN_BRUTE_DAMAGE.armed, { peaceful: 0, easy: 7.5, normal: 13, hard: 19.5 });
  assert.deepEqual(PIGLIN_BRUTE_DAMAGE.unarmed, { peaceful: 0, easy: 4.5, normal: 7, hard: 10.5 });
  assert.equal(piglinBruteDamageFor('easy'), 7.5);
  assert.equal(piglinBruteDamageFor('normal'), 13);
  assert.equal(piglinBruteDamageFor('hard'), 19.5);
  assert.equal(piglinBruteDamageFor('normal', { armed: false }), 7);
  assert.equal(piglinBruteDamageFor('easy', { armed: false }), 4.5);
  assert.equal(piglinBruteDamageFor('hard', { armed: false }), 10.5);
  assert.equal(piglinBruteDamageFor('unknown'), 13, 'an unknown difficulty falls back to Normal');
  assert.equal(piglinBruteHealth(), 50);
});

test('it always wields a golden axe, unlike a piglin which sometimes spawns unarmed', () => {
  // Wiki: "It wields a golden axe".
  assert.equal(PIGLIN_BRUTE_WEAPON, 'golden_axe');
  const { manager } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  assert.equal(brute.weapon, PIGLIN_BRUTE_WEAPON);
  assert.equal(brute.hasGoldenAxe, true);
  assert.equal(brute.attackDamage, PIGLIN_BRUTE_DAMAGE.armed.normal);
});

test('the three differences from a piglin are declared as one table', () => {
  // Wiki: "Unlike piglins, piglin brutes do not barter, retreat, or get distracted by gold."
  assert.deepEqual(PIGLIN_BRUTE_DIFFERENCES, { barters: false, retreats: false, distractedByGold: false });
  assert.equal(piglinBruteBarters(), false);
  assert.equal(piglinBruteRetreats(), false);
  assert.equal(piglinBruteDistractedByGold(), false);
  // Everything else it shares with the piglin, since the wiki names only those three.
  assert.equal(PIGLIN_BRUTE_SHARED.zombifies, true);
  assert.equal(PIGLIN_BRUTE_SHARED.fearsSoulFire, true);
  assert.equal(PIGLIN_BRUTE_SHARED.angeredAsGroup, true);
  assert.equal(PIGLIN_BRUTE_SHARED.isPiglin, true);
  // And the flags travel on the mob, so a save and reload keeps the identity.
  const { manager } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  assert.equal(brute.barters, false);
  assert.equal(brute.retreats, false);
  assert.equal(brute.distractedByGold, false);
});

test('gold armour does NOT pacify it, which is the dangerous difference', () => {
  // Wiki: it is "not distracted by gold". A piglin stops attacking a player wearing gold; a brute does not,
  // and that is the single most consequential of the three differences.
  assert.equal(piglinBruteDistractedByGold(), false);
  assert.equal(piglinBrutePursues({ gamemode: 'survival' }), true);
  assert.equal(piglinBrutePursues({ gamemode: 'creative' }), false, 'Creative is still ignored');
  assert.equal(piglinBrutePursues({ gamemode: 'spectator' }), false);
  assert.equal(piglinBrutePursues(null), false);
  // Drive it through the piglin's own AI, which is the only way to test a difference expressed as an absence.
  // The piglin AI has TWO gold gates -- one guarding the retreat and one guarding the chase -- and both must be
  // lifted for a brute. Fixing only the first left a gold-clad player un-pursued, which is the exact opposite
  // of the brute's defining difference, so this asserts the CHASE.
  const { manager, player, behaviors } = fixture();
  player.position.set(0, 1, 4);
  player.inventory.armor.head = { id: 'golden_helmet' };
  player.inventory.armor.chest = { id: 'golden_chestplate' };
  assert.equal(manager.hostileBehaviors.isPlayerWearingGold(player), true, 'the fixture really is wearing gold');

  const brute = manager.spawnPiglinBrute(0, 1, 0);
  const piglin = manager.spawnMob('piglin', 20, 1, 0);
  for (let i = 0; i < 20; i++) manager.update(1 / 60, player);
  assert.equal(brute.target, player, 'the brute pursues a gold-clad player');
  assert.equal(piglin.target, null, 'while the piglin is pacified by the gold, as the wiki says');
});

test('a brute does not retreat, where a piglin does', () => {
  // Wiki: "do not ... retreat". A piglin flees zombified piglins and soul fire; a brute stands its ground.
  // A soul torch is used rather than a second mob, because it needs no model and so the test does not depend on
  // a bare fixture being able to construct a zombified piglin.
  const { manager } = fixture();
  // Mutate the world IN PLACE: the behaviours captured this object at construction, so replacing it would
  // leave the AI reading the old one -- which is exactly why these tests first reported no retreat at all.
  manager.world.getVoxel = (x, y, z) => (y < 1 ? BLOCKS.STONE : (x === 2 && y === 1 ? BLOCKS.SOUL_TORCH : BLOCKS.AIR));
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  brute.velocity.set(0, 0, 0);
  // NO player: `pursuingPlayer` is true whenever a survival player merely EXISTS, however far away, so a
  // distant player still suppresses the retreat. Passing none is the real not-pursuing case.
  for (let i = 0; i < 40; i++) manager.update(1 / 60, null);
  // The claim is that the brute never even NOTICES the torch. `repellent` is only ever assigned by the fear
  // scan, which a brute skips entirely, so it stays null. That is a stronger and more stable assertion than a
  // velocity, because a brute that is not fleeing simply WANDERS -- its velocity is not zero.
  assert.ok(!brute.repellent, 'the brute never registered the soul torch as a repellent');
});

test('an ordinary piglin still retreats, which the brute change must not have broken', () => {
  // REGRESSION. My first attempt guarded the retreat with `piglinBruteRetreats(mob)`, which answers "does a
  // BRUTE retreat" -- false for every piglin -- so it INVERTED the condition and stopped ordinary piglins
  // fleeing. The existing piglin suite caught it before this one existed.
  const { manager, player } = fixture();
  // Mutate the world IN PLACE: the behaviours captured this object at construction, so replacing it would
  // leave the AI reading the old one -- which is exactly why these tests first reported no retreat at all.
  manager.world.getVoxel = (x, y, z) => (y < 1 ? BLOCKS.STONE : (x === 2 && y === 1 ? BLOCKS.SOUL_TORCH : BLOCKS.AIR));
  const piglin = manager.spawnMob('piglin', 0, 1, 0);
  piglin.velocity.set(0, 0, 0);
  let minX = 0;
  for (let i = 0; i < 40; i++) { manager.update(1 / 60, null); minX = Math.min(minX, piglin.velocity.x); }
  // A retreat is a cower: the piglin moves off once and then holds still, so the assertion is on whether it
  // EVER moved away rather than on a velocity that has already decayed by frame 40.
  assert.ok(minX < 0, `the piglin moved away from the torch on +x at some point, min ${minX}`);
  assert.ok(piglin.repellent, 'and it registered the torch as a repellent');
});

test('a baby piglin still flees, which the pursuingPlayer short-circuit guards', () => {
  // REGRESSION. My rewrite of `pursuingPlayer` dropped the `!mob.isBaby` term. That term is what makes
  // `pursuingPlayer` false for a baby, which in turn makes `danger` non-null, which is the ONLY reason a baby
  // retreats at all. Losing it silently stopped babies fleeing.
  const { manager, player } = fixture();
  // Mutate the world IN PLACE: the behaviours captured this object at construction, so replacing it would
  // leave the AI reading the old one -- which is exactly why these tests first reported no retreat at all.
  manager.world.getVoxel = (x, y, z) => (y < 1 ? BLOCKS.STONE : (x === 2 && y === 1 ? BLOCKS.SOUL_TORCH : BLOCKS.AIR));
  const baby = manager.spawnMob('piglin', 0, 1, 0);
  baby.isBaby = true;
  baby.velocity.set(0, 0, 0);
  let minX = 0;
  for (let i = 0; i < 40; i++) { manager.update(1 / 60, null); minX = Math.min(minX, baby.velocity.x); }
  assert.ok(minX < 0, `the baby moved away at some point, min ${minX}`);
});

test('soul fire repels a piglin and a brute ignores it, asserted as one pair', () => {
  // Both in one test so the contrast cannot drift: the piglin flees and the brute does not, from the same
  // source in the same frame.
  const { manager } = fixture();
  // Mutate the world IN PLACE: the behaviours captured this object at construction, so replacing it would
  // leave the AI reading the old one -- which is exactly why these tests first reported no retreat at all.
  manager.world.getVoxel = (x, y, z) => (y < 1 ? BLOCKS.STONE : (x === 2 && y === 1 ? BLOCKS.SOUL_TORCH : BLOCKS.AIR));
  const piglin = manager.spawnMob('piglin', 0, 1, 0);
  const brute = manager.spawnPiglinBrute(0, 1, 0);
  piglin.velocity.set(0, 0, 0);
  brute.velocity.set(0, 0, 0);
  let minX = 0;
  for (let i = 0; i < 40; i++) { manager.update(1 / 60, null); minX = Math.min(minX, piglin.velocity.x); }
  assert.ok(minX < 0, `the piglin moved away at some point, min ${minX}`);
  assert.ok(piglin.repellent, 'and it registered the torch');
  // The brute's difference is that it never RECORDS the threat at all, so nothing about its movement changes
  // because of the torch.
  assert.ok(!brute.repellent, 'while the brute never even noticed it');
});

test('it does not barter', () => {
  // Wiki: "do not barter". So a gold ingot dropped beside it is not picked up and no reward appears.
  const { manager, entities } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  // A dropped gold ingot within reach, which a piglin would seek and barter with.
  const group = new THREE.Group();
  group.position.set(1, 1, 0);
  manager.scene.add(group);
  entities.droppedItems.push({ itemType: 'gold_ingot', isBlock: false, count: 1, group });
  manager.entities.itemVisuals = entities.itemVisuals ?? { release() {} };
  for (let i = 0; i < 60; i++) manager.update(1 / 60, null);
  assert.equal(brute.isBartering, false, 'the brute never started bartering');
  assert.equal(brute.admiredItem, null, 'and never admired the gold');
  assert.equal(entities.droppedItems.length, 1, 'the ingot is still on the ground');
});

test('it drops its golden axe on an 8.5% roll and gives 5 XP', () => {
  // Wiki: a golden axe on an 8.5% roll like other naturally spawned equipment.
  assert.equal(PIGLIN_BRUTE_WEAPON_DROP_CHANCE, 0.085);
  const { manager } = fixture();
  const brute = manager.spawnMob('piglin_brute', 0, 1, 0);
  brute.playerDamaged = true;
  assert.deepEqual(piglinBruteDrops(brute, () => 0.01), [['golden_axe', false, 1, 1]], 'a low roll drops the axe');
  assert.deepEqual(piglinBruteDrops(brute, () => 0.5), [], 'a high roll drops nothing');
  assert.equal(piglinBruteXp(brute), 5, 'wiki: worth 5 XP with credit');
  // Through the manager's own loot path the axe appears too, and only for a brute.
  const viaManager = manager.getMobDeathDrops(brute, () => 0.01);
  assert.equal(viaManager.some(r => r[0] === 'golden_axe'), true);
  const piglin = manager.spawnMob('piglin', 5, 1, 0);
  assert.equal(manager.getMobDeathDrops(piglin, () => 0.01).some(r => r[0] === 'golden_axe'), false,
    'a plain piglin does not get the brute drop');
  assert.deepEqual(piglinBruteDrops(manager.spawnCow(0, 1, 0), () => 0.01), []);
  assert.equal(piglinBruteXp(manager.spawnCow(0, 1, 0)), 0);
});

test('makePiglinBrute converts an existing piglin, and refuses anything else', () => {
  const { manager } = fixture();
  const piglin = manager.spawnMob('piglin', 0, 1, 0);
  assert.equal(piglin.maxHealth, 16);
  assert.equal(makePiglinBrute(piglin), true);
  assert.equal(piglin.isBrute, true);
  assert.equal(piglin.name, 'Piglin Brute');
  assert.equal(piglin.maxHealth, 50);
  assert.equal(piglin.weapon, PIGLIN_BRUTE_WEAPON);
  assert.equal(piglin.hasGoldenAxe, true);
  // It refuses a non-piglin, so it cannot turn a cow into a brute.
  assert.equal(makePiglinBrute(manager.spawnCow(0, 1, 0)), false);
  assert.equal(makePiglinBrute(null), false);
  assert.equal(makePiglinBrute({ type: 'zombified_piglin' }), false);
});

test('it survives the real update loop without breaking anything', () => {
  // Wiki: the brute is a piglin, so it keeps the piglin's behaviours. The Nether is its home, where it does not
  // zombify; the Overworld conversion needs the zombified-piglin model, which a bare fixture cannot build, so
  // the conversion itself is asserted through its PREDICATE rather than through a full conversion here.
  const { manager, player } = fixture();
  const brute = manager.spawnPiglinBrute(0, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(brute), 'still alive in the Nether');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  // It shares the piglin's zombification rule, which is one of the things it does NOT change.
  assert.equal(PIGLIN_BRUTE_SHARED.zombifies, true);
  assert.equal(brute.isBrute, true, 'and it is still a brute after 240 frames');
  assert.equal(brute.maxHealth, 50, 'with its own health');
});

test('it is hostile and appears in the Inspector', () => {
  assert.ok(DEBUG_MOBS.includes('piglin_brute'), 'piglin_brute must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const brute = s.reset('piglin_brute');
  assert.equal(brute.type, 'piglin');
  assert.equal(brute.isBrute, true);
  assert.equal(s.snapshot().maxHealth, 50, 'Inspector telemetry shows 50 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.piglin_brute_spawn_egg, 'the piglin brute has a spawn egg');
  assert.equal(ITEMS.piglin_brute_spawn_egg.mob, 'piglin_brute');
  assert.equal(ITEMS.piglin_brute_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.golden_axe, 'and the axe it wields exists');
});

test('the helpers are safe on non-brutes and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isPiglinBrute(cow), false);
  assert.deepEqual(piglinBruteDrops(cow), []);
  assert.equal(piglinBruteXp(cow), 0);
  assert.equal(makePiglinBrute(cow), false);
  assert.deepEqual(piglinBruteDimensions(), { width: 0.6, height: 1.95 });
  assert.equal(piglinBruteDamageFor(undefined), 13);
  assert.equal(piglinBruteDamageFor('normal', { armed: undefined }), 13, 'armed by default');
  assert.equal(piglinBrutePursues(undefined), false);
  assert.equal(piglinBruteBarters(), false);
  assert.equal(piglinBruteRetreats(), false);
  assert.ok(PIGLIN_BRUTE_COLORS.skin > 0);
  assert.equal(manager.spawnMob('piglin_brute', 9, 1, 9).isBrute, true);
});
