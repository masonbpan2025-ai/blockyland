// Husk, Stray and Bogged parity.
//
// Three new mob types that are variants of the zombie and skeleton. References:
//   https://minecraft.wiki/w/Husk · https://minecraft.wiki/w/Stray · https://minecraft.wiki/w/Bogged
//
// The point of testing them together is that they are variants: the *geometry* is shared with the base
// mob and only the appearance, stats and one signature behaviour differ, so the suite asserts both that
// each is distinct and that they are wired into every shared list their base mob appears in.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager, ZOMBIE_FAMILY, SKELETON_FAMILY, inZombieFamily, inSkeletonFamily } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  VARIANT_HEALTH, VARIANT_DIMENSIONS, HUSK_BABY_DIMENSIONS, HUSK_BABY_SCALE, HUSK_ARMOR,
  HUSK_SPEED, HUSK_DAMAGE, HUSK_HUNGER_SECONDS, HUSK_DROWNING, STRAY_SLOWNESS_SECONDS,
  BOGGED_POISON_SECONDS, BOGGED_ATTACK_COOLDOWN, BOGGED_SHEAR_DROPS, VARIANT_UNDEAD_TRAITS,
  VARIANT_ATTACK_EFFECT, VARIANT_TINTS, isUndeadVariant, variantHealth, variantDimensions,
  variantBurnsInDaylight, variantAvoidsWater, variantAttackEffect, updateHuskDrowning,
  boggedAttackCooldown, shearBogged, variantBonusDrops, variantXp, huskDamageFor, variantTint,
  variantProfile
} from '../src/undeadVariants.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000, difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = { droppedItems: [], spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); }, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {} };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(300, 1, 300), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {}, effects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect(effect, seconds) { this.effects[effect] = seconds; },
    hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities, world };
}

test('all three are native types, not the Villager fallback', () => {
  const { manager } = fixture();
  for (const [type, name] of [['husk', 'Husk'], ['stray', 'Stray'], ['bogged', 'Bogged']]) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.equal(mob.type, type);
    assert.equal(mob.name, name);
    assert.notEqual(mob.type, 'villager');
  }
});

test('the health, hitboxes and armour match the wiki', () => {
  const { manager } = fixture();
  assert.equal(VARIANT_HEALTH.husk, 20);
  assert.equal(VARIANT_HEALTH.stray, 20);
  assert.equal(VARIANT_HEALTH.bogged, 16, 'wiki: a bogged has less health than a skeleton');
  assert.deepEqual(VARIANT_DIMENSIONS.husk, { width: 0.6, height: 1.95 });
  assert.deepEqual(VARIANT_DIMENSIONS.stray, { width: 0.6, height: 1.99 });
  assert.deepEqual(VARIANT_DIMENSIONS.bogged, { width: 0.6, height: 1.99 });

  const husk = manager.spawnMob('husk', 0, 1, 0);
  const stray = manager.spawnMob('stray', 0, 1, 0);
  const bogged = manager.spawnMob('bogged', 0, 1, 0);
  assert.equal(husk.maxHealth, 20);
  assert.equal(stray.maxHealth, 20);
  assert.equal(bogged.maxHealth, 16);
  assert.equal(husk.armor, HUSK_ARMOR, 'wiki: a husk has a natural armour rating of 2');
  assert.equal(stray.armor, undefined, 'a stray has none');
  assert.deepEqual([husk.width, husk.height], [0.6, 1.95]);
  assert.deepEqual([stray.width, stray.height], [0.6, 1.99]);
  // And the dimension table agrees, so collision uses the same numbers.
  assert.deepEqual(manager.getMobDimensions('husk'), { width: 0.6, height: 1.95 });
  assert.deepEqual(manager.getMobDimensions('stray'), { width: 0.6, height: 1.99 });
  assert.deepEqual(manager.getMobDimensions('bogged'), { width: 0.6, height: 1.99 });
});

test('a husk baby is smaller and faster', () => {
  // Wiki: baby husk 0.49 x 0.98, and speed 0.345 against the adult 0.23.
  assert.deepEqual(HUSK_BABY_DIMENSIONS, { width: 0.49, height: 0.98 });
  assert.equal(HUSK_SPEED.adult, 0.23);
  assert.equal(HUSK_SPEED.baby, 0.345);
  const { manager } = fixture();
  const baby = manager.spawnZombieVariant(0, 1, 0, 'husk', { isBaby: true });
  assert.equal(baby.type, 'husk');
  assert.equal(baby.isBaby, true);
  assert.deepEqual([baby.width, baby.height], [0.49, 0.98]);
  assert.equal(baby.speed, HUSK_SPEED.baby);
  assert.equal(baby.mesh.scale.x, HUSK_BABY_SCALE);
  const adult = manager.spawnMob('husk', 0, 1, 0);
  assert.equal(adult.speed, HUSK_SPEED.adult);
  assert.equal(variantDimensions('husk', true).width, 0.49);
  assert.equal(variantDimensions('husk', false).width, 0.6);
  assert.equal(variantDimensions('bogged', true).width, 0.6, 'only the husk has a baby hitbox');
});

test('all three carry the shared undead traits', () => {
  const { manager } = fixture();
  for (const type of ['husk', 'stray', 'bogged']) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.equal(mob.undead, true, `${type} is undead`);
    assert.equal(mob.poisonImmune, true);
    assert.equal(mob.invertedHealing, true);
    assert.equal(mob.canBreatheUnderwater, true);
    assert.equal(mob.sensitiveToSmite, true);
  }
  assert.equal(VARIANT_UNDEAD_TRAITS.undead, true);
  // The armadillo's threat table lists them, which is the observable consequence of being undead.
  assert.equal(isUndeadVariant({ type: 'husk' }), true);
  assert.equal(isUndeadVariant({ type: 'zombie' }), false, 'the base mobs are not in this table');
  assert.equal(isUndeadVariant(null), false);
});

test('the husk alone is immune to burning in sunlight', () => {
  // Wiki: "Husks are one of the few undead mobs that are immune to burning in sunlight." The stray and
  // bogged both carry `burn_in_daylight`.
  assert.equal(variantBurnsInDaylight('husk'), false);
  assert.equal(variantBurnsInDaylight('stray'), true);
  assert.equal(variantBurnsInDaylight('bogged'), true);
  assert.equal(variantBurnsInDaylight('cow'), false, 'an unknown type does not burn here');

  const { manager, player } = fixture({ worldTime: 6000 });
  const husk = manager.spawnMob('husk', 0, 1, 0);
  const stray = manager.spawnMob('stray', 20, 1, 0);
  const bogged = manager.spawnMob('bogged', 40, 1, 0);
  assert.equal(husk.burnsInDaylight, false);
  assert.equal(stray.burnsInDaylight, true);
  assert.equal(bogged.burnsInDaylight, true);

  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(husk.isBurning, false, 'a husk does not catch fire in daylight');
  assert.equal(husk.health, husk.maxHealth, 'and takes no fire damage');
  assert.equal(stray.isBurning, true, 'a stray burns');
  assert.ok(stray.health < stray.maxHealth, 'and takes fire damage');
  assert.equal(bogged.isBurning, true, 'so does a bogged');
});

test('nothing burns at night', () => {
  const { manager, player } = fixture({ worldTime: 18000 });
  const stray = manager.spawnMob('stray', 0, 1, 0);
  const bogged = manager.spawnMob('bogged', 20, 1, 0);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(stray.isBurning, false);
  assert.equal(bogged.isBurning, false);
  assert.equal(stray.health, stray.maxHealth);
});

test('each variant applies its own status effect, and a husk only when unarmed', () => {
  // Wiki: a husk applies Hunger "unless the husk is holding an item in its main hand"; a stray's Slowness
  // and a bogged's Poison come from the arrow itself.
  assert.equal(STRAY_SLOWNESS_SECONDS, 30);
  assert.equal(BOGGED_POISON_SECONDS, 4);
  assert.deepEqual(HUSK_HUNGER_SECONDS, { min: 7, max: 21 });
  assert.deepEqual(VARIANT_ATTACK_EFFECT.husk.effect, 'hunger');
  assert.deepEqual(VARIANT_ATTACK_EFFECT.stray.effect, 'slowness');
  assert.deepEqual(VARIANT_ATTACK_EFFECT.bogged.effect, 'poison');

  assert.equal(variantAttackEffect('stray').effect, 'slowness');
  assert.equal(variantAttackEffect('stray').seconds, 30);
  assert.equal(variantAttackEffect('bogged').effect, 'poison');
  assert.equal(variantAttackEffect('bogged').seconds, 4);
  assert.equal(variantAttackEffect('husk', { unarmed: true }).effect, 'hunger');
  assert.equal(variantAttackEffect('husk', { unarmed: false }), null,
    'wiki: not when its main hand holds an item');
  assert.equal(variantAttackEffect('cow'), null);
});

test('a stray really applies Slowness through the loop', () => {
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const stray = manager.spawnMob('stray', 0, 1, 0);
  stray.shootCooldown = 0;
  for (let i = 0; i < 200; i++) manager.update(1 / 60, player);
  assert.equal(player.effects.slowness, 30, 'wiki: Slowness for 30 seconds');
});

test('a bogged really applies Poison through the loop', () => {
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const bogged = manager.spawnMob('bogged', 0, 1, 0);
  bogged.shootCooldown = 0;
  for (let i = 0; i < 200; i++) manager.update(1 / 60, player);
  assert.equal(player.effects.poison, 4, 'wiki: Poison for 4 seconds');
  assert.equal(player.effects.slowness, undefined, 'and not Slowness');
});

test('the bogged fires more slowly than a skeleton', () => {
  // Wiki: 4.5 s on Easy and Normal, 3.5 s on Hard, against a skeleton's faster cadence.
  assert.deepEqual(BOGGED_ATTACK_COOLDOWN, { normal: 4.5, hard: 3.5 });
  assert.equal(boggedAttackCooldown('easy'), 4.5);
  assert.equal(boggedAttackCooldown('normal'), 4.5);
  assert.equal(boggedAttackCooldown('hard'), 3.5);
  assert.equal(boggedAttackCooldown('peaceful'), 4.5, 'an unknown difficulty uses the normal value');
});

test('a husk converts to a zombie when submerged long enough', () => {
  // Wiki: 30 s submerged begins the conversion, which takes 15 s more and "cannot be stopped even if the
  // husk leaves water". The zombie has full health even if the husk was damaged.
  assert.deepEqual(HUSK_DROWNING, { submergedSeconds: 30, convertSeconds: 15 });
  const { manager } = fixture();
  const husk = manager.spawnMob('husk', 0, 1, 0);
  husk.health = 5;

  assert.equal(updateHuskDrowning(husk, 10, { submerged: true, manager }), 'counting');
  assert.equal(updateHuskDrowning(husk, 10, { submerged: false, manager }), null,
    'out of water the count resets');
  assert.equal(husk.submergedSeconds, 0, 'and the counter is cleared');
  // Three lots of 10 s reach the 30 s the wiki requires, and conversion begins.
  assert.equal(updateHuskDrowning(husk, 10, { submerged: true, manager }), 'counting');
  assert.equal(updateHuskDrowning(husk, 10, { submerged: true, manager }), 'counting');
  assert.equal(updateHuskDrowning(husk, 10, { submerged: true, manager }), 'converting');
  assert.equal(husk.convertTimer, 15, 'wiki: the conversion itself takes 15 s');
  // Once begun it cannot be stopped: out of water it keeps converting rather than resetting.
  assert.equal(updateHuskDrowning(husk, 5, { submerged: false, manager }), 'converting');
  assert.ok(husk.convertTimer > 0, 'and the timer keeps running');
  assert.equal(updateHuskDrowning(husk, 20, { submerged: true, manager }), 'converted');
  const replacement = manager.mobs.find(m => m.type === 'zombie');
  assert.ok(replacement, 'a zombie replaced it');
  assert.equal(replacement.maxHealth, 20, 'at the zombie maximum');
  assert.equal(replacement.health > 0, true, 'and alive');
  assert.equal(manager.mobs.includes(husk), false, 'the husk is gone');
  assert.equal(updateHuskDrowning({ type: 'zombie' }, 10, { submerged: true }), null, 'only husks');
});

test('the husk avoids water and the archers do not', () => {
  assert.equal(variantAvoidsWater('husk'), true);
  assert.equal(variantAvoidsWater('stray'), false);
  assert.equal(variantAvoidsWater('bogged'), false);
  const { manager } = fixture();
  assert.equal(manager.spawnMob('husk', 0, 1, 0).avoidsWater, true);
  assert.equal(manager.spawnMob('stray', 0, 1, 0).avoidsWater, false);
});

test('the husk damage table has the wiki fractions', () => {
  // Wiki: 2.5 on Easy, 3 on Normal, 4.5 on Hard -- the only fractional melee values among these variants.
  assert.deepEqual(HUSK_DAMAGE, { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 });
  assert.equal(huskDamageFor('easy'), 2.5);
  assert.equal(huskDamageFor('normal'), 3);
  assert.equal(huskDamageFor('hard'), 4.5);
  assert.equal(huskDamageFor('peaceful'), 0);
  assert.equal(huskDamageFor('nonsense'), 3, 'an unknown difficulty falls back to Normal');
});

test('shearing a bogged drops two mushrooms, once', () => {
  // Wiki: "A bogged drops 2 mushrooms when sheared. Each individual mushroom has an equal chance of
  // dropping as either a brown or red mushroom. Afterward, it cannot be sheared again."
  assert.deepEqual(BOGGED_SHEAR_DROPS, { count: 2, types: ['red_mushroom', 'brown_mushroom'] });
  const { manager } = fixture();
  const bogged = manager.spawnMob('bogged', 0, 1, 0);
  const both = shearBogged(bogged, 'shears', () => 0.1);
  assert.equal(both.length, 2, 'two mushrooms');
  assert.deepEqual(both, ['red_mushroom', 'red_mushroom'], 'a low roll gives red ones');
  assert.equal(bogged.isSheared, true);
  assert.deepEqual(shearBogged(bogged, 'shears', () => 0.1), [], 'it cannot be sheared again');

  const other = manager.spawnMob('bogged', 5, 1, 0);
  assert.deepEqual(shearBogged(other, 'shears', () => 0.9), ['brown_mushroom', 'brown_mushroom'],
    'a high roll gives brown ones');
  assert.deepEqual(shearBogged(manager.spawnMob('bogged', 9, 1, 0), 'wheat'), [], 'only shears work');
  assert.deepEqual(shearBogged(manager.spawnMob('husk', 9, 1, 0), 'shears'), [], 'only a bogged');
  assert.deepEqual(shearBogged(null, 'shears'), []);
  const dead = manager.spawnMob('bogged', 9, 1, 0);
  dead.health = 0;
  assert.deepEqual(shearBogged(dead, 'shears'), [], 'not a dead one');
});

test('the variants are wired into their base mobs family lists', () => {
  // This is the assertion that matters for the shared code: the codebase identifies mobs by literal type
  // strings in many places, so a variant that is not in its family list silently is not a zombie.
  assert.ok(ZOMBIE_FAMILY.includes('zombie'));
  assert.ok(ZOMBIE_FAMILY.includes('husk'));
  assert.ok(SKELETON_FAMILY.includes('skeleton'));
  assert.ok(SKELETON_FAMILY.includes('stray'));
  assert.ok(SKELETON_FAMILY.includes('bogged'));
  assert.equal(inZombieFamily('husk'), true);
  assert.equal(inZombieFamily('stray'), false);
  assert.equal(inSkeletonFamily('stray'), true);
  assert.equal(inSkeletonFamily('husk'), false);
  assert.equal(inZombieFamily('cow'), false);
});

test('a husk runs the zombie AI and a stray the skeleton AI', () => {
  // Observable consequence: a husk chases the player like a zombie, and a stray keeps its distance and
  // shoots like a skeleton. The bogged is a skeleton.
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const husk = manager.spawnMob('husk', 0, 1, 0);
  const stray = manager.spawnMob('stray', 0, 1, 20);
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  // The husk closes in; the stray holds at range and fires.
  assert.ok(husk.mesh.position.distanceTo(player.position) < 6.2,
    `the husk should approach, at ${husk.mesh.position.distanceTo(player.position).toFixed(2)}`);
  assert.ok(manager.mobs.includes(stray), 'the stray is still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'and nothing reported a fault');
});

test('the drops match the wiki', () => {
  const { manager } = fixture();
  const husk = manager.spawnMob('husk', 0, 1, 0);
  husk.playerDamaged = true;
  const huskLoot = manager.getMobDeathDrops(husk, () => 0.99);
  // Asserts the CONTENT rather than the exact table.
  //
  // This read `assert.deepEqual(huskLoot, [['rotten_flesh', false, 0, 2]])`, which pins the row list to a
  // single four-element tuple. That makes the drop table unextendable: a husk also drops iron_ingot,
  // carrot and potato sometimes, and those rows cannot be represented at all in a four-element form --
  // they need a probability, so adding them changes the tuple length and fails this assertion even though
  // the wiki claim it tests ("a husk drops rotten flesh") is still true.
  //
  // The claim is that rotten flesh is a guaranteed drop, so that is what is checked.
  assert.ok(huskLoot.some(r => r[0] === 'rotten_flesh' && r[1] === false && r[2] === 0 && r[3] === 2),
    'wiki: a husk drops 0-2 rotten flesh, got ' + JSON.stringify(huskLoot));
  assert.equal(huskLoot.length >= 1, true, 'and the table is not empty');

  const stray = manager.spawnMob('stray', 0, 1, 0);
  stray.playerDamaged = true;
  // A low roll is what produces the tipped arrow, so the sequence is asserted rather than a constant.
  const strayLoot = manager.getMobDeathDrops(stray, () => 0.1);
  assert.deepEqual(strayLoot.slice(0, 2), [['bone', false, 0, 2], ['arrow', false, 0, 2]],
    'wiki: bones and arrows like a skeleton');
  assert.ok(strayLoot.some(r => r[0] === 'tipped_arrow_slowness'),
    'wiki: plus an Arrow of Slowness with player credit');
  assert.deepEqual(manager.getMobDeathDrops(stray, () => 0.99).some(r => r[0].startsWith('tipped_arrow')),
    false, 'wiki: and 0-1, so a high roll gives none');

  const bogged = manager.spawnMob('bogged', 0, 1, 0);
  bogged.playerDamaged = true;
  const boggedLoot = manager.getMobDeathDrops(bogged, () => 0.1);
  assert.ok(boggedLoot.some(r => r[0] === 'tipped_arrow_poison'),
    'wiki: a bogged drops an Arrow of Poison');
  assert.equal(boggedLoot.some(r => r[0] === 'tipped_arrow_slowness'), false,
    'and not the stray one');

  // Without credit, no tipped arrow.
  const unc = manager.spawnMob('stray', 5, 1, 0);
  assert.equal(manager.getMobDeathDrops(unc, () => 0.99).some(r => r[0].startsWith('tipped_arrow')), false);
  assert.deepEqual(variantBonusDrops({ type: 'husk', playerDamaged: true }), [], 'a husk has no tipped arrow');
  assert.deepEqual(variantBonusDrops({ type: 'cow', playerDamaged: true }), []);
});

test('all three give 5 XP with credit', () => {
  // Wiki: 5 experience orbs when killed by a player or a tamed wolf.
  const { manager } = fixture();
  for (const type of ['husk', 'stray', 'bogged']) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.equal(variantXp(mob), 5, `${type} gives 5`);
    mob.playerDamaged = true;
    assert.equal(variantXp(mob), 5);
  }
  assert.equal(variantXp({ type: 'zombie' }), 0, 'the base mobs are not in this table');
  assert.equal(variantXp(null), 0);
});

test('the appearance is tinted, and the three differ from each other and their base', () => {
  const { manager } = fixture();
  const tints = new Set();
  for (const type of ['husk', 'stray', 'bogged']) {
    const tint = variantTint(type);
    assert.equal(typeof tint, 'number', `${type} has a tint`);
    tints.add(tint);
  }
  assert.equal(tints.size, 3, 'each variant has its own tint');
  // Each exposes the tint through the profile as well.
  for (const type of ['husk', 'stray', 'bogged']) {
    assert.equal(variantProfile(type).tint, variantTint(type));
  }
  assert.equal(variantTint('cow'), null);
  assert.ok(Object.keys(VARIANT_TINTS).length >= 3);
  // A headless manager has no canvas, so `createVariantTexture` falls back to the base image rather than
  // throwing. What has to hold is that the model was built and shares the zombie geometry.
  const husk = manager.spawnMob('husk', 0, 1, 0);
  assert.ok(husk.head, 'the husk has a head mesh');
  // The zombie model exposes `mat`, a head and two legs rather than named arms, so the contract is that
  // the husk carries the same handles as the zombie it was built from.
  const zombie = manager.spawnMob('zombie', 5, 1, 0);
  for (const key of ['head', 'leftLeg', 'rightLeg', 'mat']) {
    assert.ok(husk[key], `the husk has the zombie's ${key}`);
  }
  assert.equal(husk.mesh.children.length, zombie.mesh.children.length,
    'and the same mesh structure, so the variant reuses the base model');
  assert.equal(husk.head.geometry.parameters?.width, zombie.head.geometry.parameters?.width,
    'with matching geometry');
});

test('the variant profile summarises the differences in one place', () => {
  const husk = variantProfile('husk');
  assert.equal(husk.health, 20);
  assert.equal(husk.burnsInDaylight, false);
  assert.equal(husk.avoidsWater, true);
  assert.equal(husk.attackEffect, 'hunger');
  assert.equal(husk.armedWithBow, false, 'a husk is melee');

  const stray = variantProfile('stray');
  assert.equal(stray.health, 20);
  assert.equal(stray.burnsInDaylight, true);
  assert.equal(stray.attackEffect, 'slowness');
  assert.equal(stray.armedWithBow, true);

  const bogged = variantProfile('bogged');
  assert.equal(bogged.health, 16);
  assert.equal(bogged.attackEffect, 'poison');
  assert.equal(variantProfile('cow'), null);
});

test('the Inspector can spawn all three and they are distinct ids', () => {
  for (const type of ['husk', 'stray', 'bogged']) {
    assert.ok(DEBUG_MOBS.includes(type), `${type} must be selectable`);
  }
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const husk = s.reset('husk');
  assert.equal(husk.type, 'husk');
  assert.equal(s.snapshot().maxHealth, 20);
  assert.equal(s.reset('bogged').type, 'bogged');
  assert.equal(s.snapshot().maxHealth, 16, 'the Inspector shows the bogged\u2019s smaller health');
  assert.equal(s.reset('stray').type, 'stray');
  assert.equal(s.snapshot().maxHealth, 20);
});

test('the spawn eggs and the tipped arrows are registered', () => {
  for (const type of ['husk', 'stray', 'bogged']) {
    const key = `${type}_spawn_egg`;
    assert.ok(ITEMS[key], `${key} exists`);
    assert.equal(ITEMS[key].mob, type);
    assert.equal(ITEMS[key].type, 'spawn_egg');
  }
  assert.ok(ITEMS.tipped_arrow_slowness, 'the stray drop is a real item');
  assert.ok(ITEMS.tipped_arrow_poison, 'so is the bogged drop');
});

test('all three walk through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  for (const type of ['husk', 'stray', 'bogged']) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    const start = mob.mesh.position.clone();
    assert.doesNotThrow(() => {
      for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
    }, `${type} updated without throwing`);
    assert.ok(mob.health > 0, `${type} survived`);
    assert.ok(mob.mesh.position.distanceTo(start) > 0.02, `${type} moved`);
  }
  assert.deepEqual([...(manager.mobErrors || [])], [], 'no fault reported');
});

test('the helpers are safe on non-variants and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isUndeadVariant(cow), false);
  assert.equal(variantHealth('cow'), null);
  assert.equal(variantHealth(null), null);
  assert.equal(variantDimensions('cow'), null);
  assert.equal(variantBurnsInDaylight('cow'), false);
  assert.equal(variantAvoidsWater('cow'), false);
  assert.equal(variantAttackEffect('cow'), null);
  assert.equal(updateHuskDrowning(cow, 10, { submerged: true }), null);
  assert.equal(updateHuskDrowning(null, 10), null);
  assert.deepEqual(shearBogged(cow, 'shears'), []);
  assert.deepEqual(variantBonusDrops(cow), []);
  assert.equal(variantXp(cow), 0);
  assert.equal(variantTint('cow'), null);
  assert.equal(variantProfile('cow'), null);
  assert.doesNotThrow(() => updateHuskDrowning({ type: 'husk' }, 1, {}));
});
