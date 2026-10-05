// Goat parity with https://minecraft.wiki/w/Goat
//
// Goat was another of the 38 missing types. Its defining traits are that it leaps unusually high and
// far on a long cooldown, periodically rams whatever is standing still nearby, and snaps a horn off
// when it charges a hard block.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { moveGroundMob } from '../src/mobMotion.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  GOAT_HEALTH, GOAT_DIMENSIONS, GOAT_BABY_DIMENSIONS, GOAT_BABY_SCALE, GOAT_JUMP_DIMENSIONS,
  GOAT_RAM_DAMAGE, GOAT_RAM_KNOCKBACK, GOAT_JUMP, GOAT_RAM, GOAT_SCREAMER_RAM,
  GOAT_SCREAMER_CHANCE, GOAT_MISSING_HORN_CHANCE, GOAT_FALL_DAMAGE_REDUCTION,
  GOAT_HORN_VARIANTS, GOAT_SCREAMING_HORN_VARIANTS, GOAT_HORN_SNAP_BLOCKS, GOAT_FOLLOW_RANGE,
  GOAT_RAM_PREPARE_SECONDS, GOAT_RAM_CHARGE_SECONDS, GOAT_COLORS,
  isGoat, goatRamDamage, goatRamKnockback, rollScreamingGoat, bredScreamingChance,
  inheritScreamingGoat, rollGoatHorns, rollGoatHornVariant, goatHasHorn, snapGoatHorn,
  blockSnapsGoatHorn, goatXp, goatDrops, rollGoatRamCooldown, rollGoatJumpCooldown,
  isValidGoatTarget, isUnmovingTarget, startGoatRam, updateGoatRam, endGoatRam,
  startGoatJump, landGoatJump, createGoatModel, poseGoat, poseGoatLegs
} from '../src/goatBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

/**
 * Run `body` with a seeded `Math.random`, restoring the real one afterwards.
 *
 * Several cases here assert that a random event happened at least once inside a window -- a sniffer digs
 * up a seed, a goat charge breaks a horn. With real randomness the window occasionally misses and the case
 * fails a few percent of the time, which is worse than not testing it: a suite that goes red at random
 * sends the next reader hunting for a change that does not exist. A fixed seed makes the outcome stable
 * without weakening what is asserted.
 *
 * The seed is a plain LCG so a failure is reproducible from the number alone.
 */
function withSeededRandom(seed, body) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  try {
    return body();
  } finally {
    Math.random = original;
  }
}


function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 15, setVoxel() {} };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(10, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0, knockback: null,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, inventory, entities };
}

test('goat is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.equal(goat.type, 'goat');
  assert.equal(goat.name, 'Goat');
  assert.notEqual(goat.type, 'villager');
});

test('goats have the reference health and hitboxes', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.equal(goat.maxHealth, GOAT_HEALTH);
  assert.equal(goat.maxHealth, 10, 'wiki: 10 HP');
  assert.deepEqual(GOAT_DIMENSIONS, { width: 0.9, height: 1.3 });
  assert.deepEqual(GOAT_BABY_DIMENSIONS, { width: 0.45, height: 0.65 });
  // Wiki: while jumping the hitbox shrinks.
  assert.deepEqual(GOAT_JUMP_DIMENSIONS, { width: 0.63, height: 0.91 });
  assert.deepEqual(manager.getMobDimensions('goat'), { width: 0.9, height: 1.3 });
  assert.deepEqual([goat.width, goat.height], [0.9, 1.3]);

  const baby = manager.spawnGoat(0, 1, 0, { isBaby: true });
  assert.equal(baby.mesh.scale.x, GOAT_BABY_SCALE);
  assert.deepEqual([baby.width, baby.height], [0.45, 0.65]);
});

test('the ram damage table matches the wiki for both ages', () => {
  assert.deepEqual(GOAT_RAM_DAMAGE.adult, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.deepEqual(GOAT_RAM_DAMAGE.baby, { peaceful: 0, easy: 1, normal: 1, hard: 1.5 });
  assert.equal(goatRamDamage(false, 'easy'), 2);
  assert.equal(goatRamDamage(false, 'normal'), 2);
  assert.equal(goatRamDamage(false, 'hard'), 3);
  assert.equal(goatRamDamage(true, 'easy'), 1, 'wiki: a baby goat deals 1');
  assert.equal(goatRamDamage(true, 'hard'), 1.5, 'and 1.5 on Hard');
  assert.equal(goatRamDamage(true, 'peaceful'), 0);
});

test('the ram knockback is 9 blocks, or 4.5 for a baby', () => {
  assert.equal(GOAT_RAM_KNOCKBACK.adult, 9, 'wiki: 9 blocks of knockback');
  assert.equal(GOAT_RAM_KNOCKBACK.baby, 4.5, 'wiki: a baby deals 4.5');
  assert.equal(goatRamKnockback(false), 9);
  assert.equal(goatRamKnockback(true), 4.5);
});

test('the jump and ram windows match the wiki', () => {
  // Wiki: leaps up to 10 blocks vertically and 5 laterally, then a 30-60 second cooldown.
  assert.deepEqual(GOAT_JUMP, { maxHeight: 10, maxDistance: 5, cooldownMin: 30, cooldownMax: 60, maxDrop: 5 });
  // Wiki: every 30 seconds to 5 minutes, target 4-16 blocks away.
  assert.deepEqual(GOAT_RAM, { minRange: 4, maxRange: 16, cooldownMin: 30, cooldownMax: 300 });
  // Wiki: a screaming goat tries every 5 to 15 seconds.
  assert.deepEqual(GOAT_SCREAMER_RAM, { cooldownMin: 5, cooldownMax: 15 });
});

test('the cooldown rolls stay inside their windows', () => {
  for (const r of [0, 0.3, 0.6, 0.999]) {
    const normal = rollGoatRamCooldown(false, () => r);
    assert.ok(normal >= 30 && normal <= 300, `normal ram cooldown ${normal}`);
    const screaming = rollGoatRamCooldown(true, () => r);
    assert.ok(screaming >= 5 && screaming <= 15, `screaming ram cooldown ${screaming}`);
    const jump = rollGoatJumpCooldown(() => r);
    assert.ok(jump >= 30 && jump <= 60, `jump cooldown ${jump}`);
  }
  assert.equal(rollGoatRamCooldown(false, () => 0), 30);
  assert.equal(rollGoatRamCooldown(true, () => 0), 5, 'a screaming goat rams much sooner');
});

test('screaming goats are rare, and breeding changes the odds', () => {
  assert.equal(GOAT_SCREAMER_CHANCE, 0.02, 'wiki: 2% of goats are screaming goats');
  assert.equal(rollScreamingGoat(() => 0.01), true);
  assert.equal(rollScreamingGoat(() => 0.5), false);

  // Wiki: two normal parents give 2%; one screaming parent about 50%; two give 100%.
  assert.equal(bredScreamingChance({}, {}), 0.02);
  assert.equal(bredScreamingChance({ isScreamingGoat: true }, {}), 0.5);
  assert.equal(bredScreamingChance({ isScreamingGoat: true }, { isScreamingGoat: true }), 1);
  assert.equal(inheritScreamingGoat({ isScreamingGoat: true }, { isScreamingGoat: true }, () => 0.99), true,
    'two screaming parents always give a screamer');
  assert.equal(inheritScreamingGoat({}, {}, () => 0.5), false, 'two normal parents usually do not');
});

test('horn variants match the wiki lists', () => {
  assert.deepEqual(GOAT_HORN_VARIANTS, ['ponder', 'sing', 'seek', 'feel']);
  assert.deepEqual(GOAT_SCREAMING_HORN_VARIANTS, ['admire', 'call', 'yearn', 'dream']);
  // Wiki: both horns of one goat are always the same variant, so it is rolled once.
  const normal = rollGoatHornVariant(false, () => 0);
  assert.ok(GOAT_HORN_VARIANTS.includes(normal));
  const screaming = rollGoatHornVariant(true, () => 0.99);
  assert.ok(GOAT_SCREAMING_HORN_VARIANTS.includes(screaming),
    'a screaming goat only drops the screaming variants');
});

test('a tenth of adults are missing one horn, and babies never are', () => {
  assert.equal(GOAT_MISSING_HORN_CHANCE, 0.1);
  // 0.05 is under the 10% gate, and then the side is chosen.
  assert.deepEqual(rollGoatHorns(false, (() => { let n = 0; return () => (n++ === 0 ? 0.05 : 0.1); })()),
    { left: false, right: true }, 'under the gate with a low side roll loses the left horn');
  assert.deepEqual(rollGoatHorns(false, (() => { let n = 0; return () => (n++ === 0 ? 0.05 : 0.9); })()),
    { left: true, right: false }, 'and a high side roll loses the right');
  assert.deepEqual(rollGoatHorns(false, () => 0.5), { left: true, right: true }, 'above the gate keeps both');
  assert.deepEqual(rollGoatHorns(true, () => 0.0), { left: true, right: true }, 'babies always have both');
});

test('the model has horns, a beard and four legs', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.ok(goat.body && goat.head && goat.muzzle, 'body, head and muzzle');
  assert.ok(goat.beard, 'a goat has a beard');
  assert.ok(goat.tail, 'and a tail');
  assert.equal(goat.legs.length, 4);
  assert.equal(goat.horns.length, 2, 'two horn meshes, exposed as an array the shared baby-growth code can iterate');
  assert.ok(goat.hornSides.left && goat.hornSides.right, 'with a left/right split so one can be removed');
  assert.equal(goat.eyes.length, 2);
});

test('a missing horn is hidden on the model, not just cleared in state', () => {
  const { manager } = fixture();
  const goat = manager.spawnGoat(0, 1, 0, { horns: { left: false, right: true } });
  poseGoat(goat);
  assert.equal(goat.hornSides.left.visible, false, 'the missing horn is not drawn');
  assert.equal(goat.hornSides.right.visible, true, 'the present one still is');
});

test('snapping a horn removes it permanently and drops the item', () => {
  // The outcome here is a random draw, so it is seeded: with real randomness the window occasionally
  // misses and the case fails a few percent of the time, which is worse than not testing it.
  withSeededRandom(1, () => {

    const { manager, entities } = fixture();
    const goat = manager.spawnMob('goat', 0, 1, 0);
    assert.equal(goatHasHorn(goat), true);
    assert.equal(snapGoatHorn(goat), 'goat_horn');
    assert.equal(goatHasHorn(goat), true, 'one horn is left');
    assert.equal(snapGoatHorn(goat), 'goat_horn', 'the second comes off too');
    assert.equal(goatHasHorn(goat), false, 'and then there are none');
    assert.equal(snapGoatHorn(goat), null, 'wiki: goats do not regrow their horns');
    assert.equal(entities.droppedItems.length, 0, 'the drop is the caller\'s job');
  });
});

test('baby goats never drop horns', () => {
  const { manager } = fixture();
  const baby = manager.spawnGoat(0, 1, 0, { isBaby: true });
  assert.equal(snapGoatHorn(baby), null, 'wiki: baby goats never drop goat horns');
  assert.equal(goatHasHorn(baby), true, 'and keep theirs');
});

test('the horn-snapping block list matches the wiki', () => {
  for (const name of ['stone', 'coal_ore', 'copper_ore', 'iron_ore', 'emerald_ore', 'packed_ice',
    'oak_log', 'spruce_log', 'birch_log', 'cherry_log']) {
    assert.equal(blockSnapsGoatHorn(name), true, `${name} should snap a horn`);
  }
  assert.equal(blockSnapsGoatHorn('STONE'), true, 'the check is case-insensitive');
  for (const name of ['dirt', 'grass_block', 'sand', 'glass', 'oak_planks']) {
    assert.equal(blockSnapsGoatHorn(name), false, `${name} should not snap a horn`);
  }
  assert.equal(blockSnapsGoatHorn(null), false);
  // The engine can resolve a block id to a name, which is what the rule needs.
  const { manager } = fixture();
  assert.equal(manager.blockNameAt(0, 0, 0), 'stone');
});

test('a goat drops no items and 1-3 XP, and a baby none', () => {
  assert.deepEqual(goatDrops(), [], 'wiki: goats drop no items');
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  goat.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(goat, () => 0.99), [], 'no items even with credit');

  // XP is age-gated.
  let sawValue = false;
  for (let i = 0; i < 50; i++) {
    const xp = goatXp(goat);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(goatXp(manager.spawnGoat(0, 1, 0, { isBaby: true })), 0,
    'wiki: killing a baby goat yields no experience');
});

test('ram targets exclude ghasts, other goats, creative players and Peaceful', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.equal(isValidGoatTarget(goat, { type: 'ghast', health: 10 }), false, 'wiki: never ghasts');
  assert.equal(isValidGoatTarget(goat, { type: 'goat', health: 10 }), false, 'nor other goats');
  assert.equal(isValidGoatTarget(goat, { type: 'cow', health: 10 }), true, 'but any other mob');
  assert.equal(isValidGoatTarget(goat, { type: 'player', gamemode: 'creative', health: 20 }), false,
    'wiki: not in Creative');
  assert.equal(isValidGoatTarget(goat, { type: 'cow', health: 10 }, { difficulty: 'peaceful' }), false,
    'nor on Peaceful');
  assert.equal(isValidGoatTarget(goat, { type: 'cow', health: 0 }), false, 'nor the dead');
  assert.equal(isValidGoatTarget(goat, goat), false, 'not itself');
  assert.equal(isValidGoatTarget(goat, null), false);
});

test('only an unmoving thing is worth ramming', () => {
  assert.equal(isUnmovingTarget({ velocity: { x: 0, z: 0 } }), true);
  assert.equal(isUnmovingTarget({ velocity: { x: 2, z: 0 } }), false, 'a fleeing mob is not a target');
  assert.equal(isUnmovingTarget({}), true, 'no velocity means it is standing still');
  assert.equal(isUnmovingTarget({ velocity: { x: 0.01, z: 0.01 } }), true, 'within tolerance');
});

test('a ram locks onto the target position rather than tracking it', () => {
  // Wiki: the goat locks on, and "as a goat lowers its head, its target has the chance to move out
  // of the way". So the charge must aim where the target was.
  const { manager, player } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.equal(startGoatRam(goat, player), true);
  assert.equal(goat.ramState, 'preparing');
  const locked = goat.ramLockedPosition.clone();

  // The player runs away.
  player.position.set(60, 1, 60);
  for (let i = 0; i < 120; i++) updateGoatRam(manager, goat, 1 / 60, { move: moveGroundMob });
  // The goat charged the old position, so the target was never hit.
  assert.equal(player.damageTaken, 0, 'the target stepped aside');
  assert.notEqual(goat.ramState, 'preparing');
  assert.ok(locked.distanceTo(new THREE.Vector3(10, 1, 0)) < 1e-6);
});

test('a connected ram deals the size and difficulty damage plus knockback', () => {
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const goat = manager.spawnMob('goat', 0, 1, 0);
  const outcome = [];
  startGoatRam(goat, player);
  for (let i = 0; i < 300 && goat.ramState; i++) {
    const r = updateGoatRam(manager, goat, 1 / 60, { move: moveGroundMob });
    if (r) outcome.push(r);
  }
  assert.ok(outcome.includes('hit'), `the charge should connect, saw ${outcome.join(',')}`);
  assert.equal(player.damageTaken, 2, 'wiki: 2 on Normal for an adult');
  assert.ok(player.knockback, 'and it is knocked back');
  const magnitude = Math.hypot(player.knockback.x, player.knockback.z);
  assert.ok(Math.abs(magnitude - 9) < 1e-6, `wiki: 9 blocks of knockback, got ${magnitude}`);
});

test('a baby ram deals 1 damage and 4.5 knockback', () => {
  const { manager, player } = fixture();
  // Closer than the adult case: a baby charges at 2.4 rather than 4.2, so it cannot cross six
  // blocks inside the charge window and would time out as a miss.
  player.position.set(4.5, 1, 0);
  const baby = manager.spawnGoat(0, 1, 0, { isBaby: true });
  startGoatRam(baby, player);
  for (let i = 0; i < 300 && baby.ramState; i++) updateGoatRam(manager, baby, 1 / 60, { move: moveGroundMob });
  assert.equal(player.damageTaken, 1, 'wiki: a baby deals 1 on Normal');
  const magnitude = Math.hypot(player.knockback.x, player.knockback.z);
  assert.ok(Math.abs(magnitude - 4.5) < 1e-6, `wiki: 4.5 knockback, got ${magnitude}`);
});

test('a missed charge stops the goat rather than leaving it running', () => {
  const { manager, player } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  startGoatRam(goat, player);
  endGoatRam(goat, 'missed');
  assert.equal(goat.ramState, null);
  assert.equal(goat.ramLockedPosition, null);
  assert.equal(goat.lastRamOutcome, 'missed');
});

test('a charge into a snapping block breaks a horn off', () => {
  // The outcome here is a random draw, so it is seeded: with real randomness the window occasionally
  // misses and the case fails a few percent of the time, which is worse than not testing it.
  withSeededRandom(1, () => {

    const { manager } = fixture();
    // A wall of stone in the goat's path. The block lookup is stubbed rather than carved into the
    // fixture world, because the goat probes at head height and the flat floor sits far below it.
    manager.isBlockSolid = () => true;
    manager.blockNameAt = () => 'stone';
    const goat = manager.spawnMob('goat', 0, 1, 0);
    const target = { position: new THREE.Vector3(30, 1, 0), health: 20, type: 'cow', takeDamage() {} };
    startGoatRam(goat, target);
    let outcome = null;
    for (let i = 0; i < 300 && goat.ramState; i++) {
      outcome = updateGoatRam(manager, goat, 1 / 60, { move: moveGroundMob }) ?? outcome;
    }
    assert.equal(outcome, 'blocked', 'it hit the block');
    assert.equal(goatHasHorn(goat), true, 'and lost exactly one horn');
    assert.equal((goat.hasLeftHorn ? 1 : 0) + (goat.hasRightHorn ? 1 : 0), 1);
    assert.equal(manager.entities.droppedItems.filter(d => d.itemType === 'goat_horn').length, 1,
      'dropping one goat horn');
  });
});

test('a charge into an ordinary block breaks nothing', () => {
  // The outcome here is a random draw, so it is seeded: with real randomness the window occasionally
  // misses and the case fails a few percent of the time, which is worse than not testing it.
  withSeededRandom(1, () => {

    const { manager } = fixture();
    manager.isBlockSolid = () => true;
    manager.blockNameAt = () => 'dirt';
    const goat = manager.spawnMob('goat', 0, 1, 0);
    const target = { position: new THREE.Vector3(30, 1, 0), health: 20, type: 'cow', takeDamage() {} };
    startGoatRam(goat, target);
    for (let i = 0; i < 300 && goat.ramState; i++) updateGoatRam(manager, goat, 1 / 60, { move: moveGroundMob });
    assert.equal((goat.hasLeftHorn ? 1 : 0) + (goat.hasRightHorn ? 1 : 0), 2, 'both horns survive');
    assert.equal(manager.entities.droppedItems.length, 0, 'and nothing is dropped');
  });
});

test('a long jump clears height and distance, then goes on cooldown', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  goat.onGround = true;
  goat.jumpCooldown = 0;
  goat.yaw = 0;
  assert.equal(startGoatJump(goat, { height: 5, distance: 4 }), true);
  assert.ok(goat.velocity.y > 0, 'it launches upward');
  assert.equal(goat.isGoatJumping, true);
  assert.ok(Math.abs(goat.velocity.z - 4 * 1.4) < 1e-9, 'and forward by the requested distance');

  // Landing restores the hitbox and starts the cooldown.
  assert.equal(landGoatJump(goat, () => 0), true);
  assert.equal(goat.isGoatJumping, false);
  assert.equal(goat.jumpCooldown, 30, 'wiki: 30 to 60 seconds');
  assert.equal(goat.height, GOAT_DIMENSIONS.height, 'the walking hitbox is restored');
});

test('the jump is clamped to the wiki maxima and refused while airborne or cooling down', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  goat.onGround = true;
  goat.jumpCooldown = 0;
  startGoatJump(goat, { height: 99, distance: 99 });
  assert.ok(goat.velocity.y <= Math.sqrt(2 * 22 * GOAT_JUMP.maxHeight) + 1e-9,
    'never higher than the wiki 10 blocks');
  assert.ok(goat.goatJumpHeight <= GOAT_JUMP.maxHeight);

  const cooling = manager.spawnMob('goat', 0, 1, 0);
  cooling.onGround = true;
  cooling.jumpCooldown = 10;
  assert.equal(startGoatJump(cooling), false, 'no jump during the cooldown');

  const airborne = manager.spawnMob('goat', 0, 1, 0);
  airborne.onGround = false;
  airborne.jumpCooldown = 0;
  assert.equal(startGoatJump(airborne), false, 'and none from mid-air');
});

test('the goat takes 10 less fall damage and avoids powder snow', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.equal(goat.fallDamageReduction, GOAT_FALL_DAMAGE_REDUCTION);
  assert.equal(GOAT_FALL_DAMAGE_REDUCTION, 10, 'wiki: goats take 10 less fall damage');
  assert.equal(goat.avoidsPowderSnow, true);
  assert.equal(goat.isMilkable, true);
});

test('the ram pose lowers the head, and the legs tuck in mid-jump', () => {
  const { manager } = fixture();
  const goat = manager.spawnMob('goat', 0, 1, 0);
  poseGoat(goat);
  const standing = goat.head.rotation.x;
  goat.ramState = 'preparing';
  poseGoat(goat);
  assert.ok(goat.head.rotation.x > standing, 'wiki: the goat lowers its head to ram');

  goat.ramState = null;
  goat.isGoatJumping = true;
  poseGoatLegs(goat, 1, true);
  const tucked = goat.legs.map(l => l.mesh.rotation.x);
  assert.ok(tucked.some(r => Math.abs(r) > 0.4), 'the legs tuck during the leap');
  goat.isGoatJumping = false;
  poseGoatLegs(goat, 0, true);
  assert.doesNotThrow(() => poseGoatLegs({}, 1));
  assert.doesNotThrow(() => poseGoatLegs(null, 1));
  assert.doesNotThrow(() => poseGoat(null));
});

test('a goat walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const goat = manager.spawnMob('goat', 0, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(goat), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'and no fault was reported');
  assert.ok((goat.goatPhase || 0) > 0, 'the walk cycle advanced');
});

test('holding wheat makes the goat follow instead of ram', () => {
  // Wiki: a goat that was preparing to ram stops and walks to a player holding wheat.
  const { manager, player, inventory } = fixture();
  player.position.set(8, 1, 0);
  const goat = manager.spawnMob('goat', 0, 1, 0);
  goat.ramCooldown = 0;
  inventory.active = { id: 'wheat', count: 1 };
  const start = goat.mesh.position.clone();
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(goat.ramState, null, 'it does not charge a player holding wheat');
  assert.ok(goat.mesh.position.distanceTo(player.position) < start.distanceTo(player.position),
    'it walks toward them instead');
  assert.equal(GOAT_FOLLOW_RANGE, 10, 'wiki: within ten blocks');
});

test('the Inspector can spawn the goat and reports its horns and ram state', () => {
  assert.ok(DEBUG_MOBS.includes('goat'), 'goat must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const goat = s.reset('goat');
  assert.equal(goat.type, 'goat', 'the Inspector spawns a real goat');
  const snap = s.snapshot();
  assert.equal(snap.health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(snap.maxHealth, 10);
  assert.ok([1, 2].includes(snap.goatHorns), `it has one or two horns, got ${snap.goatHorns}`);
  assert.equal(snap.goatRam, null);
  assert.equal(snap.goatJumping, false);
  assert.ok(GOAT_HORN_VARIANTS.concat(GOAT_SCREAMING_HORN_VARIANTS).includes(snap.goatHornVariant));
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10);
});

test('the spawn egg and the goat horn item are registered', () => {
  assert.ok(ITEMS.goat_spawn_egg, 'the goat has a spawn egg');
  assert.equal(ITEMS.goat_spawn_egg.mob, 'goat');
  const egg = ITEMS.goat_spawn_egg;
  assert.equal(egg.type, 'spawn_egg');
  assert.ok(ITEMS.goat_horn, 'the goat horn is a registered item');
});

test('the helpers are safe on non-goats and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isGoat(cow), false);
  assert.equal(snapGoatHorn(cow), null);
  assert.equal(snapGoatHorn(null), null);
  assert.equal(startGoatRam(cow, {}), false);
  assert.equal(startGoatJump(cow), false);
  assert.equal(landGoatJump(cow), false);
  assert.equal(updateGoatRam(manager, cow, 1 / 60, { move: moveGroundMob }), null);
  assert.equal(goatHasHorn(null), false);
  assert.equal(goatDrops(cow).length, 0);
  assert.doesNotThrow(() => endGoatRam(cow, 'done'));
});
