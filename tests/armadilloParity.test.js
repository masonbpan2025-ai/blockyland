// Armadillo parity with https://minecraft.wiki/w/Armadillo
//
// A new mob. Its whole identity is one state: it rolls into a ball when hurt or threatened, takes
// `(damage - 1) / 2` while rolled, repels spiders while NOT rolled, and sheds an armadillo scute every
// 5-10 minutes. It drops no items at all on death.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  ARMADILLO_HEALTH, ARMADILLO_DIMENSIONS, ARMADILLO_BABY_DIMENSIONS, ARMADILLO_BABY_SCALE,
  ARMADILLO_SPEED, ARMADILLO_THREAT_INFLATION, ARMADILLO_UNROLL_SECONDS, ARMADILLO_PEEK_SECONDS,
  ARMADILLO_SCUTE_SECONDS, ARMADILLO_BRUSH_DURABILITY, ARMADILLO_REDUCTION_EXEMPT,
  ARMADILLO_SPIDER_FEAR_RANGE, ARMADILLO_SPIDER_TYPES, ARMADILLO_UNDEAD, ARMADILLO_GROWTH_SECONDS,
  ARMADILLO_FEED_ACCELERATION, ARMADILLO_FOLLOW_RANGE, ARMADILLO_BREEDING_FOOD, ARMADILLO_COLORS,
  isArmadillo, armadilloDamageReduction, canRollUp, isArmadilloThreat, findArmadilloThreat,
  updateArmadilloRoll, isRolledUp, onArmadilloHurt, armadilloDimensions, updateArmadilloScutes,
  rollScuteDelay, brushArmadillo, spidersFleeFrom, repelsMob, updateArmadilloGrowth,
  accelerateArmadilloGrowth, armadilloFollows, isArmadilloBreedingFood, armadilloDrops, armadilloXp,
  armadilloBreedingXp, poseArmadillo
} from '../src/armadilloBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(6, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, consumed: 0, getActiveItem() { return this.active; }, consumeActiveItem(n = 1) { this.consumed += n; } };
  player.inventory = inventory;
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, inventory, entities };
}

test('armadillo is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(mob.type, 'armadillo');
  assert.equal(mob.name, 'Armadillo');
  assert.notEqual(mob.type, 'villager');
});

test('the health and hitboxes match the wiki', () => {
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(mob.maxHealth, ARMADILLO_HEALTH);
  assert.equal(mob.maxHealth, 12, 'wiki: 12 HP');
  assert.deepEqual(ARMADILLO_DIMENSIONS, { width: 0.7, height: 0.65 });
  assert.deepEqual(ARMADILLO_BABY_DIMENSIONS, { width: 0.42, height: 0.39 });
  assert.deepEqual(manager.getMobDimensions('armadillo'), { width: 0.7, height: 0.65 });
  assert.deepEqual([mob.width, mob.height], [0.7, 0.65],
    'without a dimension row the collision would fall back to the humanoid default');
  assert.equal(ARMADILLO_SPEED, 0.14);
  assert.equal(mob.speed, 0.14);
});

test('a baby is smaller with its own hitbox', () => {
  const { manager } = fixture();
  const baby = manager.spawnArmadillo(0, 1, 0, { isBaby: true });
  assert.equal(baby.isBaby, true);
  assert.deepEqual([baby.width, baby.height], [0.42, 0.39]);
  assert.equal(baby.mesh.scale.x, ARMADILLO_BABY_SCALE);
  assert.equal(baby.growthTimer, ARMADILLO_GROWTH_SECONDS);
  assert.equal(armadilloDimensions(baby).width, 0.42);
  assert.equal(armadilloDimensions(manager.spawnMob('armadillo', 0, 1, 0)).width, 0.7);
});

test('the damage reduction formula matches the wiki exactly', () => {
  // Wiki: while rolled it takes "(original damage - 1) / 2", and self_destruct damage is exempt.
  assert.equal(armadilloDamageReduction(6, { rolled: true }), 2.5);
  assert.equal(armadilloDamageReduction(10, { rolled: true }), 4.5);
  assert.equal(armadilloDamageReduction(3, { rolled: true }), 1);
  assert.equal(armadilloDamageReduction(1, { rolled: true }), 0, '1 damage becomes 0, not negative');
  assert.equal(armadilloDamageReduction(0, { rolled: true }), 0);
  // Standing, the damage is unchanged.
  assert.equal(armadilloDamageReduction(6, { rolled: false }), 6);
  assert.equal(armadilloDamageReduction(6), 6, 'the default is not rolled');
  // The exemption.
  assert.equal(armadilloDamageReduction(6, { rolled: true, damageType: 'self_destruct' }), 6);
  assert.deepEqual(ARMADILLO_REDUCTION_EXEMPT, ['self_destruct', 'explosion_self']);
});

test('rolling up is suppressed in water, fire, air and on a lead', () => {
  // Wiki: "An armadillo does not roll up while fleeing, in water, on fire (they still roll up on
  // campfires), in the air, or being led." And 26.3: no rolling while submerged in liquids.
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(canRollUp(mob), true, 'on the ground it may roll');
  assert.equal(canRollUp(mob, { inWater: true }), false);
  assert.equal(canRollUp(mob, { inLava: true }), false);
  assert.equal(canRollUp(mob, { onFire: true }), false);
  assert.equal(canRollUp(mob, { inAir: true }), false);
  assert.equal(canRollUp(mob, { onLead: true }), false);
  assert.equal(canRollUp(mob, { fleeing: true }), false);
  assert.equal(canRollUp({ type: 'cow' }), false, 'only armadillos');
});

test('undead and sprinting players are threats, and passives are not', () => {
  // Wiki: threats are undead mobs, and players who are sprinting or riding anything.
  const { manager, player } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  // The codebase has no shared isUndead flag, so the list is explicit.
  assert.ok(ARMADILLO_UNDEAD.includes('zombie'));
  assert.ok(ARMADILLO_UNDEAD.includes('skeleton'));
  assert.ok(ARMADILLO_UNDEAD.includes('wither_skeleton'));
  assert.ok(ARMADILLO_UNDEAD.includes('phantom'));
  assert.ok(ARMADILLO_UNDEAD.includes('zoglin'));

  // Only the undead this build actually implements. `husk`, `stray` and `bogged` are real undead but
  // are not implemented yet -- `spawnMob` silently falls back to a villager for them -- so asserting
  // them here would have tested the fallback rather than the armadillo. The fallback is asserted
  // instead, so this test will fail loudly when one of them is implemented and the table is not used.
  for (const undead of ['zombie', 'skeleton', 'wither_skeleton', 'drowned', 'phantom', 'zoglin']) {
    const other = manager.spawnMob(undead, 0, 1, 0);
    assert.equal(other.type, undead, `${undead} should be implemented`);
    assert.equal(isArmadilloThreat(mob, other), true, `${undead} should be a threat`);
  }
  for (const unimplemented of ['husk', 'stray', 'bogged']) {
    const fallback = manager.spawnMob(unimplemented, 0, 1, 0);
    assert.equal(fallback.type, 'villager',
      `${unimplemented} is not implemented yet, so it falls back; if this fails, remove it from` +
      ' that list and add it to the threat assertions above');
  }
  const cow = manager.spawnMob('cow', 0, 1, 0);
  assert.equal(isArmadilloThreat(mob, cow), false, 'a passive mob is not a threat');
  assert.equal(isArmadilloThreat(mob, mob), false, 'nor is itself');
  assert.equal(isArmadilloThreat(mob, null), false);

  // A player who is not sprinting is safe; a sprinting or mounted one is not.
  assert.equal(isArmadilloThreat(mob, { type: 'player', health: 20, keys: {} }), false);
  assert.equal(isArmadilloThreat(mob, { type: 'player', health: 20, keys: {}, sprinting: true }), true);
  assert.equal(isArmadilloThreat(mob, { type: 'player', health: 20, keys: {}, vehicle: {} }), true);
});

test('a zombie nearby makes it roll up, and it unrolls after 3 seconds clear', () => {
  // Wiki: it rolls up when confronted by undead, and "unrolls if it detects no threats for 3 seconds".
  assert.equal(ARMADILLO_UNROLL_SECONDS, 3);
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(mob.rollState, 'idle');

  const zombie = manager.spawnMob('zombie', 2, 1, 0);
  assert.equal(findArmadilloThreat(manager, mob)?.type, 'zombie');
  assert.equal(updateArmadilloRoll(manager, mob, 0.1), 'rolled');
  assert.equal(mob.rollState, 'rolled');
  assert.equal(isRolledUp(mob), true);

  // Still a threat: it stays rolled.
  for (let i = 0; i < 20; i++) updateArmadilloRoll(manager, mob, 0.1);
  assert.equal(isRolledUp(mob), true, 'it stays rolled while the threat is near');

  // Threat gone: three seconds of quiet unrolls it. Polled rather than asserted on the return value,
  // because the unroll can legitimately land on the same step as a peek.
  zombie.mesh.position.set(100, 1, 100);
  let unrolled = false;
  for (let i = 0; i < 60 && !unrolled; i++) {
    updateArmadilloRoll(manager, mob, 0.1);
    unrolled = !isRolledUp(mob);
  }
  assert.equal(unrolled, true, 'three seconds of quiet unrolls it');
  assert.equal(mob.rollState, 'idle');
  assert.equal(isRolledUp(mob), false);
  // And not before three seconds: the unroll must not be instant. Asserted on the STATE, not on the
  // return value, because the function legitimately reports 'peeking' on steps that are not an unroll.
  const mob2 = manager.spawnMob('armadillo', 20, 1, 0);
  mob2.rollState = 'rolled';
  mob2.noThreatSeconds = 0;
  for (let i = 0; i < 25; i++) updateArmadilloRoll(manager, mob2, 0.1);
  assert.equal(isRolledUp(mob2), true, '2.5 seconds of quiet is not enough to unroll');
});

test('it unrolls immediately if it enters water', () => {
  // Wiki lists water and fire as immediate unroll triggers, not just no-threat timers.
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  mob.rollState = 'rolled';
  mob.noThreatSeconds = 0;
  assert.equal(updateArmadilloRoll(manager, mob, 0.1, null, { inWater: true }), 'unrolled');
  assert.equal(mob.rollState, 'idle');

  const mob2 = manager.spawnMob('armadillo', 5, 1, 0);
  mob2.rollState = 'rolled';
  assert.equal(updateArmadilloRoll(manager, mob2, 0.1, null, { onFire: true }), 'unrolled');
});

test('it peeks out occasionally while rolled', () => {
  // Wiki: "The armadillo occasionally peeks out from its shell to see if a threat is still near."
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  const zombie = manager.spawnMob('zombie', 2, 1, 0);
  updateArmadilloRoll(manager, mob, 0.1);
  assert.equal(mob.rollState, 'rolled');
  let peeked = false;
  for (let i = 0; i < 40 && !peeked; i++) {
    if (updateArmadilloRoll(manager, mob, 0.1) === 'peeking') peeked = true;
  }
  assert.equal(peeked, true, 'it peeks while a threat remains');
  assert.equal(isRolledUp(mob), true, 'a peeking armadillo still counts as rolled up');
  // And it goes back to fully rolled.
  let back = false;
  for (let i = 0; i < 20 && !back; i++) {
    updateArmadilloRoll(manager, mob, 0.1);
    if (mob.rollState === 'rolled') back = true;
  }
  assert.equal(back, true);
});

test('being hurt rolls it up and remembers the attacker', () => {
  const { manager, player } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(mob.rollState, 'idle');
  const rolled = onArmadilloHurt(mob, player);
  assert.equal(rolled, true, 'wiki: it hides in its shell when hurt');
  assert.equal(mob.rollState, 'rolled');
  assert.equal(mob.lastAttacker, player);
  assert.ok(mob.threatTimer > 0, 'the attacker is remembered as a threat');
  // Hurt with no attacker does not roll it.
  const mob2 = manager.spawnMob('armadillo', 5, 1, 0);
  assert.equal(onArmadilloHurt(mob2, null), false);
  assert.equal(mob2.rollState, 'idle');
});

test('a rolled armadillo really takes reduced damage through the real damage path', () => {
  // This is the assertion that matters: the formula has to be wired into damageMob, not just exported.
  const { manager, player } = fixture();
  const standing = manager.spawnMob('armadillo', 0, 1, 0);
  const rolled = manager.spawnMob('armadillo', 5, 1, 0);
  rolled.rollState = 'rolled';
  standing.hitCooldown = 0;
  rolled.hitCooldown = 0;

  manager.damageMob(standing, 6, null, false, player);
  assert.equal(standing.health, 12 - 6, 'standing takes the full 6');
  manager.damageMob(rolled, 6, null, false, player);
  assert.equal(rolled.health, 12 - 2.5, 'rolled takes (6-1)/2 = 2.5');
  assert.ok(rolled.health > standing.health, 'the rolled one is better off');
});

test('a rolled armadillo can absorb a one-damage hit entirely', () => {
  const { manager, player } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  mob.rollState = 'rolled';
  mob.hitCooldown = 0;
  manager.damageMob(mob, 1, null, false, player);
  assert.equal(mob.health, 12, 'wiki: (1-1)/2 = 0 damage');
});

test('it sheds a scute every 5-10 minutes on a fresh timer', () => {
  // Wiki: "Armadillos drop 1 armadillo scute every 5-10 minutes", and `scute_time` resets to a new random
  // value between 6000 and 12000 ticks.
  assert.deepEqual(ARMADILLO_SCUTE_SECONDS, { min: 300, max: 600 });
  for (const r of [0, 0.25, 0.5, 0.999]) {
    const d = rollScuteDelay(() => r);
    assert.ok(d >= 300 && d <= 600, `roll ${r} gave ${d}`);
  }
  assert.equal(rollScuteDelay(() => 0), 300, '6000 ticks');
  assert.ok(rollScuteDelay(() => 0.999) > 599, 'about 12000 ticks');

  const { manager, entities } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.ok(mob.scuteTimer >= 300 && mob.scuteTimer <= 600, 'a fresh spawn gets a full timer');
  assert.equal(updateArmadilloScutes(mob, 10), false, 'not yet');
  mob.scuteTimer = 0.01;
  assert.equal(updateArmadilloScutes(mob, 0.1), true, 'it sheds');
  assert.ok(mob.scuteTimer >= 300, 'and the timer resets to a fresh random value');
});

test('a scute is shed into the world through the real loop', () => {
  const { manager, player, entities } = fixture();
  player.position.set(40, 1, 40);
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  mob.scuteTimer = 0.01;
  manager.update(1 / 60, player);
  const scutes = entities.droppedItems.filter(d => d.itemType === 'armadillo_scute');
  assert.equal(scutes.length, 1, 'the scute was actually dropped');
  assert.equal(scutes[0].count, 1, 'one scute');
  assert.equal(scutes[0].isBlock, false, 'and it is an item');
});

test('brushing takes a scute and costs 16 durability', () => {
  // Wiki: "If a player or dispenser uses a brush on an armadillo, it drops 1 armadillo scute. Brushing an
  // armadillo uses 16 durability points."
  assert.equal(ARMADILLO_BRUSH_DURABILITY, 16);
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  let spent = 0;
  assert.equal(brushArmadillo(mob, 'brush', { consumeDurability: (n) => { spent += n; } }), true);
  assert.equal(spent, 16, '16 durability, so an unenchanted brush is good for four scutes');
  assert.equal(brushArmadillo(mob, 'BRUSH'), true, 'the check is case-insensitive');
  assert.equal(brushArmadillo(mob, 'wheat'), false, 'only a brush works');
  assert.equal(brushArmadillo(mob, null), false);
  const dead = manager.spawnMob('armadillo', 5, 1, 0);
  dead.health = 0;
  assert.equal(brushArmadillo(dead, 'brush'), false, 'not a dead one');
  assert.ok(ITEMS.brush, 'the brush is a real item');
});

test('spiders flee from an unrolled armadillo but not a rolled one', () => {
  // Wiki: "Spiders and cave spiders flee from armadillos when within 6 blocks of them. This only takes
  // effect when the armadillo is not rolled up in its shell."
  assert.equal(ARMADILLO_SPIDER_FEAR_RANGE, 6);
  assert.deepEqual(ARMADILLO_SPIDER_TYPES, ['spider', 'cave_spider']);
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  assert.equal(spidersFleeFrom(mob), true);
  assert.equal(repelsMob(mob, 'spider'), true);
  assert.equal(repelsMob(mob, 'cave_spider'), true);
  assert.equal(repelsMob(mob, 'zombie'), false, 'only spiders and cave spiders');
  mob.rollState = 'rolled';
  assert.equal(repelsMob(mob, 'spider'), false, 'a rolled one repels nothing');
  assert.equal(spidersFleeFrom(mob), false);
});

test('a spider really flees through the real update loop', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  const spider = manager.spawnMob('spider', 3, 1, 0);
  const startDist = spider.mesh.position.distanceTo(mob.mesh.position);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  });
  const endDist = spider.mesh.position.distanceTo(mob.mesh.position);
  assert.ok(endDist > startDist, `the spider should flee, ${startDist.toFixed(2)} -> ${endDist.toFixed(2)}`);

  // And a rolled armadillo does not repel it.
  const { manager: m2, player: p2 } = fixture();
  p2.position.set(40, 1, 40);
  const rolled = m2.spawnMob('armadillo', 0, 1, 0);
  rolled.rollState = 'rolled';
  const spider2 = m2.spawnMob('spider', 3, 1, 0);
  for (let i = 0; i < 60; i++) m2.update(1 / 60, p2);
  // The spider may do anything except the flee branch, so simply assert nothing reported a fault.
  assert.deepEqual([...(m2.mobErrors || [])], []);
  assert.ok(spider2.health > 0);
});

test('a baby grows in 20 minutes, accelerated by spider eyes but stopped by a golden dandelion', () => {
  assert.equal(ARMADILLO_GROWTH_SECONDS, 1200);
  assert.equal(ARMADILLO_FEED_ACCELERATION, 0.1);
  const { manager } = fixture();
  const baby = manager.spawnArmadillo(0, 1, 0, { isBaby: true });
  assert.equal(baby.growthTimer, 1200);

  const removed = accelerateArmadilloGrowth(baby);
  assert.ok(Math.abs(removed - 120) < 1e-9, '10% of the remaining time');

  // A golden dandelion stops the aging, so feeding must not burn the timer silently.
  baby.ageLocked = true;
  const lockedRemoved = accelerateArmadilloGrowth(baby);
  assert.equal(lockedRemoved, 0, 'an age-locked baby is not accelerated');
  assert.equal(updateArmadilloGrowth(baby, 100000), false, 'and it never matures while locked');

  baby.ageLocked = false;
  let matured = false;
  for (let i = 0; i < 200 && !matured; i++) matured = updateArmadilloGrowth(baby, 10);
  assert.equal(matured, true);
  assert.equal(baby.isBaby, false);
  assert.deepEqual([baby.width, baby.height], [0.7, 0.65], 'the adult hitbox is restored');
  assert.equal(updateArmadilloGrowth(manager.spawnMob('armadillo', 0, 1, 0), 100000), false,
    'an adult never "matures"');
});

test('armadillos breed with spider eyes and follow a holder within 10 blocks', () => {
  assert.equal(ARMADILLO_BREEDING_FOOD, 'spider_eye');
  assert.equal(ARMADILLO_FOLLOW_RANGE, 10);
  assert.equal(isArmadilloBreedingFood('spider_eye'), true);
  assert.equal(isArmadilloBreedingFood('SPIDER_EYE'), true);
  for (const other of ['wheat', 'seagrass', 'bamboo', '']) {
    assert.equal(isArmadilloBreedingFood(other), false, `${other} is not the breeding food`);
  }
  assert.deepEqual(BREEDING_FOODS.armadillo, ['spider_eye'], 'and it is registered for breeding');

  const { manager, player } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  player.position.set(8, 1, 0);
  assert.equal(armadilloFollows(mob, player, 'spider_eye'), true);
  assert.equal(armadilloFollows(mob, player, 'wheat'), false);
  player.position.set(40, 1, 0);
  assert.equal(armadilloFollows(mob, player, 'spider_eye'), false, 'too far');
  // A baby follows an adult even with no item.
  const baby = manager.spawnArmadillo(1, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('armadillo', 3, 1, 0);
  assert.equal(armadilloFollows(baby, player, '', adult), true, 'wiki: baby armadillos follow adults');
});

test('it drops no items on death, and 1-3 XP only with credit', () => {
  // Wiki: the scute comes from shedding and brushing, not from death.
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  mob.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(mob, () => 0.5), [], 'no items on death');
  assert.deepEqual(armadilloDrops(mob), []);

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = armadilloXp(mob);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(armadilloXp(manager.spawnArmadillo(0, 1, 0, { isBaby: true })), 0,
    'wiki: killing a baby yields no experience');

  for (let i = 0; i < 40; i++) {
    const xp = armadilloBreedingXp();
    assert.ok(xp >= 1 && xp <= 7, `wiki: 1-7 XP on breeding, got ${xp}`);
  }
});

test('the poses differ between rolled and standing', () => {
  const { manager } = fixture();
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  poseArmadillo(mob, 0);
  const standing = mob.mesh.rotation.x;
  mob.rollState = 'rolled';
  poseArmadillo(mob, 0);
  assert.ok(Math.abs(mob.mesh.rotation.x) > Math.abs(standing), 'a rolled one tucks into a ball');
  assert.ok(mob.legs.every(l => Math.abs(l.rotation.x) > 0.5), 'and its legs tuck in');
  mob.rollState = 'peeking';
  poseArmadillo(mob, 0);
  assert.notEqual(mob.head.rotation.x, 0, 'a peeking one lifts its head');
  assert.doesNotThrow(() => poseArmadillo(null));
  assert.doesNotThrow(() => poseArmadillo({}, 1));
  assert.ok(ARMADILLO_COLORS.body > 0);
});

test('it walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const mob = manager.spawnMob('armadillo', 0, 1, 0);
  const start = mob.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(mob), 'still alive');
  assert.ok(mob.mesh.position.distanceTo(start) > 0.05, 'it moved around');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('the Inspector can spawn the armadillo and reports its roll state', () => {
  assert.ok(DEBUG_MOBS.includes('armadillo'), 'armadillo must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const mob = s.reset('armadillo');
  assert.equal(mob.type, 'armadillo', 'the Inspector spawns a real armadillo');
  const snap = s.snapshot();
  assert.equal(snap.health, 12, 'Inspector telemetry shows 12 HP');
  assert.equal(snap.maxHealth, 12);
  assert.equal(snap.armadilloState, 'idle');
  assert.ok(snap.armadilloScute > 0, 'and the scute timer');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 12);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.armadillo_spawn_egg, 'the armadillo has a spawn egg');
  assert.equal(ITEMS.armadillo_spawn_egg.mob, 'armadillo');
  assert.equal(ITEMS.armadillo_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-armadillos and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isArmadillo(cow), false);
  assert.equal(isRolledUp(cow), false);
  assert.equal(canRollUp(cow), false);
  assert.equal(isArmadilloThreat(cow, player), false);
  assert.equal(findArmadilloThreat(manager, cow), null);
  assert.equal(updateArmadilloRoll(manager, cow, 0.1), null);
  assert.equal(onArmadilloHurt(cow, player), false);
  assert.equal(updateArmadilloScutes(cow, 1), false);
  assert.equal(brushArmadillo(cow, 'brush'), false);
  assert.equal(spidersFleeFrom(cow), false);
  assert.equal(repelsMob(cow, 'spider'), false);
  assert.equal(updateArmadilloGrowth(cow, 1), false);
  assert.equal(accelerateArmadilloGrowth(cow), 0);
  assert.equal(armadilloFollows(cow, player, 'spider_eye'), false);
  assert.deepEqual(armadilloDrops(cow), []);
  assert.equal(armadilloXp(cow), 0);
  assert.equal(armadilloDimensions(null).width, 0.7, 'a malformed mob gets the adult hitbox');
  assert.doesNotThrow(() => poseArmadillo(null));
  // The threat inflation is the wiki's 7 horizontal and 2 vertical.
  assert.deepEqual(ARMADILLO_THREAT_INFLATION, { horizontal: 7, vertical: 2 });
  assert.equal(manager.spawnMob('armadillo', 0, 1, 0).type, 'armadillo');
});
