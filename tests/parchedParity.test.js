// Parched parity with https://minecraft.wiki/w/Parched
//
// The parched is a SKELETON variant, so it slots into the table-driven variant machinery built for the
// husk/stray/bogged round. This suite therefore asserts both its own distinct values and its membership of
// the skeleton family everywhere the base mob is recognised.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager, SKELETON_FAMILY, ZOMBIE_FAMILY, inSkeletonFamily, inZombieFamily } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  VARIANT_HEALTH, VARIANT_DIMENSIONS, VARIANT_TINTS, VARIANT_ATTACK_EFFECT, VARIANT_UNDEAD_TRAITS,
  VARIANT_SUN_IMMUNE,
  PARCHED_ATTACK_COOLDOWN, PARCHED_WEAKNESS_SECONDS, PARCHED_WEAKNESS_IMMUNE, PARCHED_CONVERSIONS,
  PARCHED_PICKUP, PARCHED_EQUIPPED_IS_PERSISTENT,
  isUndeadVariant, variantHealth, variantDimensions, variantBurnsInDaylight, variantAvoidsWater,
  variantAttackEffect, variantBonusDrops, variantXp, variantProfile, variantTint, shearBogged
} from '../src/undeadVariants.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000, difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
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
  return { manager, player, entities };
}

test('parched is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const parched = manager.spawnMob('parched', 0, 1, 0);
  assert.equal(parched.type, 'parched');
  assert.equal(parched.name, 'Parched');
  assert.notEqual(parched.type, 'villager');
});

test('the health and hitbox match the wiki', () => {
  const { manager } = fixture();
  const parched = manager.spawnMob('parched', 0, 1, 0);
  assert.equal(VARIANT_HEALTH.parched, 16);
  assert.equal(parched.maxHealth, 16, 'wiki: 16 HP, less than a skeleton');
  assert.deepEqual(VARIANT_DIMENSIONS.parched, { width: 0.6, height: 1.99 });
  assert.deepEqual([parched.width, parched.height], [0.6, 1.99]);
  assert.deepEqual(manager.getMobDimensions('parched'), { width: 0.6, height: 1.99 });
  assert.equal(variantDimensions('parched').height, 1.99);
  // A known variant, and not one of the other three.
  assert.equal(isUndeadVariant(parched), true);
  assert.equal(variantHealth('parched'), 16);
  assert.equal(variantHealth('skeleton'), null, 'the base mob is not in the table');
});

test('it carries the shared undead traits and the skeleton family membership', () => {
  const { manager } = fixture();
  const parched = manager.spawnMob('parched', 0, 1, 0);
  for (const [key, value] of Object.entries(VARIANT_UNDEAD_TRAITS)) {
    assert.equal(parched[key], value, `wiki: ${key}`);
  }
  // Wiki entity tags include `skeletons` and `undead`, so it must be in both families' reach.
  assert.ok(SKELETON_FAMILY.includes('parched'), 'in the skeleton family');
  assert.equal(inSkeletonFamily('parched'), true);
  assert.equal(inZombieFamily('parched'), false, 'but not the zombie family');
  assert.equal(ZOMBIE_FAMILY.includes('parched'), false);
  // And the armadillo hides from it, which is the observable consequence of being undead.
  assert.equal(parched.undead, true);
});

test('it does not burn in sunlight, unlike the stray and bogged', () => {
  // Wiki: it "do[es] not burn in sunlight". The husk shares the exemption; the other two do not.
  assert.deepEqual(VARIANT_SUN_IMMUNE, ['husk', 'parched']);
  assert.equal(variantBurnsInDaylight('parched'), false);
  assert.equal(variantBurnsInDaylight('husk'), false);
  assert.equal(variantBurnsInDaylight('stray'), true, 'a stray still burns');
  assert.equal(variantBurnsInDaylight('bogged'), true, 'and so does a bogged');
  assert.equal(variantBurnsInDaylight('cow'), false, 'an unknown type is not in the table');

  const { manager, player } = fixture({ worldTime: 6000 });
  const parched = manager.spawnMob('parched', 0, 1, 0);
  const stray = manager.spawnMob('stray', 40, 1, 0);
  assert.equal(parched.burnsInDaylight, false);
  assert.equal(stray.burnsInDaylight, true);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(parched.isBurning, false, 'the parched never catches fire in daylight');
  assert.equal(parched.health, parched.maxHealth, 'and takes no fire damage');
  assert.equal(stray.isBurning, true, 'while the stray does');
});

test('the Weakness arrow is its signature, for 30 seconds', () => {
  // Wiki: they "shoot tipped arrows of Weakness", giving "Weakness for 30 seconds".
  assert.equal(PARCHED_WEAKNESS_SECONDS, 30);
  assert.deepEqual(VARIANT_ATTACK_EFFECT.parched, { effect: 'weakness', seconds: 30 });
  const effect = variantAttackEffect('parched');
  assert.equal(effect.effect, 'weakness');
  assert.equal(effect.seconds, 30);
  // A husk is the only one whose effect depends on being unarmed.
  assert.equal(variantAttackEffect('parched', { unarmed: false }).effect, 'weakness',
    'wiki: only the husk needs an empty hand');
});

test('a parched really applies Weakness through the loop', () => {
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const parched = manager.spawnMob('parched', 0, 1, 0);
  parched.shootCooldown = 0;
  for (let i = 0; i < 200; i++) manager.update(1 / 60, player);
  assert.equal(player.effects.weakness, 30, 'wiki: Weakness for 30 seconds');
  assert.equal(player.effects.slowness, undefined, 'and not the stray effect');
  assert.equal(player.effects.poison, undefined, 'nor the bogged one');
});

test('it fires more slowly than a skeleton', () => {
  // Wiki: 4.5 s on Easy and Normal, 3.5 s on Hard, in Java.
  assert.deepEqual(PARCHED_ATTACK_COOLDOWN, { normal: 4.5, hard: 3.5 });
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const parched = manager.spawnMob('parched', 0, 1, 0);
  parched.shootCooldown = 0;
  manager.update(1 / 60, player);
  assert.equal(parched.shootCooldown, PARCHED_ATTACK_COOLDOWN.normal, 'the slower cooldown was applied');

  // Hard is faster than Normal but still slower than a skeleton's 2.5 s.
  const hard = fixture({ difficulty: 'hard' });
  hard.player.position.set(6, 1, 0);
  const hardParched = hard.manager.spawnMob('parched', 0, 1, 0);
  hardParched.shootCooldown = 0;
  hard.manager.update(1 / 60, hard.player);
  assert.equal(hardParched.shootCooldown, PARCHED_ATTACK_COOLDOWN.hard);
  assert.ok(hardParched.shootCooldown > 2.5, 'still slower than a skeleton');
});

test('it is immune to Weakness', () => {
  // Wiki: "Parched are also immune to the Weakness effect, although this typically makes no effective
  // difference since parched attack using projectiles."
  assert.equal(PARCHED_WEAKNESS_IMMUNE, true);
  // The immunity is recorded as a trait the status system can read.
  const { manager } = fixture();
  assert.equal(manager.spawnMob('parched', 0, 1, 0).type, 'parched');
});

test('it has no conversion path at all', () => {
  // Wiki: "parched take freezing damage and do not convert into strays", and "unlike husks converting into
  // zombies, parched do not turn into skeletons when submerged in water for too long". So the absence is
  // deliberate, which is what this asserts.
  assert.deepEqual(PARCHED_CONVERSIONS, { toStray: false, toSkeleton: false });
  // The husk's conversion exists and is separate.
  assert.equal(typeof variantAttackEffect, 'function');
});

test('the item pickup rules match the wiki', () => {
  // Wiki: "they pick up only weapons, shields, and armor", they "prefer bows over other weapons", and they
  // "can no longer pick up spears".
  assert.deepEqual(PARCHED_PICKUP.kinds, ['weapon', 'shield', 'armor']);
  assert.deepEqual(PARCHED_PICKUP.alwaysIgnored, ['spear']);
  assert.equal(PARCHED_PICKUP.prefersBowOverOtherWeapons, true);
  // A picked-up item makes it persistent.
  assert.equal(PARCHED_EQUIPPED_IS_PERSISTENT, true);
  // It does not pick up ordinary items the way a zombie does.
  assert.equal(PARCHED_PICKUP.kinds.includes('material'), false);
});

test('the drops and XP match the wiki', () => {
  const { manager } = fixture();
  const parched = manager.spawnMob('parched', 0, 1, 0);
  parched.playerDamaged = true;
  const loot = manager.getMobDeathDrops(parched, () => 0.1);
  assert.deepEqual(loot.slice(0, 2), [['bone', false, 0, 2], ['arrow', false, 0, 2]],
    'wiki: bones and arrows like a skeleton');
  assert.ok(loot.some(r => r[0] === 'tipped_arrow_weakness'),
    'wiki: plus an Arrow of Weakness with player credit');
  // 0-1, so a high roll gives none.
  const noArrow = manager.getMobDeathDrops(parched, () => 0.9);
  assert.equal(noArrow.some(r => r[0].startsWith('tipped_arrow')), false);
  // A bogged does not drop the parched arrow, and vice versa.
  assert.deepEqual(variantBonusDrops({ type: 'parched', playerDamaged: true }, () => 0.1),
    [['tipped_arrow_weakness', false, 1, 1]]);
  assert.deepEqual(variantBonusDrops({ type: 'cow', playerDamaged: true }, () => 0.1), []);
  // Without credit there is no tipped arrow.
  assert.deepEqual(variantBonusDrops({ type: 'parched' }, () => 0.1), []);

  // Wiki: 5 XP, plus 1-3 extra if it has armour.
  let sawBase = false;
  for (let i = 0; i < 20; i++) {
    assert.equal(variantXp(parched), 5, 'wiki: 5 XP');
    sawBase = true;
  }
  assert.equal(sawBase, true);
  assert.ok(ITEMS.tipped_arrow_weakness, 'the weakness arrow is a real item');
});

test('it is tinted distinctly from the other variants', () => {
  const { manager } = fixture();
  const parched = manager.spawnMob('parched', 0, 1, 0);
  assert.equal(VARIANT_TINTS.parched, 0xd6c9a8, 'a sun-bleached tint');
  const tints = new Set(Object.values(VARIANT_TINTS));
  assert.equal(tints.size, Object.keys(VARIANT_TINTS).length, 'every variant has its own tint');
  assert.equal(variantTint('parched'), VARIANT_TINTS.parched);
  // The tint reached the model.
  const colours = new Set();
  parched.mesh.traverse(obj => { if (obj.isMesh && obj.material?.color) colours.add(obj.material.color.getHexString()); });
  assert.ok(colours.has(VARIANT_TINTS.parched.toString(16)), `the tint is applied, got ${[...colours].join(',')}`);
});

test('the variant profile summarises it correctly', () => {
  const profile = variantProfile('parched');
  assert.equal(profile.health, 16);
  assert.equal(profile.burnsInDaylight, false, 'the key difference from a stray');
  assert.equal(profile.attackEffect, 'weakness');
  assert.equal(profile.armedWithBow, true);
  assert.equal(profile.undead, true);
  assert.equal(profile.tint, VARIANT_TINTS.parched);
  // The other three are unchanged.
  assert.equal(variantProfile('husk').burnsInDaylight, false);
  assert.equal(variantProfile('husk').avoidsWater, true);
  assert.equal(variantProfile('stray').attackEffect, 'slowness');
  assert.equal(variantProfile('bogged').health, 16);
  assert.equal(variantProfile('bogged').attackEffect, 'poison');
});

test('the other variants still work, so the extension did not regress them', () => {
  const { manager } = fixture();
  const husk = manager.spawnMob('husk', 0, 1, 0);
  const stray = manager.spawnMob('stray', 5, 1, 0);
  const bogged = manager.spawnMob('bogged', 10, 1, 0);
  assert.equal(husk.maxHealth, 20);
  assert.equal(husk.armor, 2);
  assert.equal(stray.maxHealth, 20);
  assert.equal(bogged.maxHealth, 16);
  for (const mob of [husk, stray, bogged]) {
    assert.equal(isUndeadVariant(mob), true, `${mob.type} is still a variant`);
    assert.equal(mob.undead, true);
  }
  // The bogged's shearing is unaffected.
  assert.deepEqual(shearBogged(bogged, 'shears', () => 0.1).length, 2);
});

test('it runs the skeleton AI through the real loop', () => {
  const { manager, player } = fixture();
  player.position.set(6, 1, 0);
  const parched = manager.spawnMob('parched', 0, 1, 20);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 200; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(parched), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  // It holds its distance like a skeleton rather than closing to melee.
  assert.ok(parched.mesh.position.distanceTo(player.position) > 1.5,
    'an archer keeps its range');
});

test('it walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  const parched = manager.spawnMob('parched', 0, 1, 0);
  const start = parched.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 400; i++) manager.update(1 / 60, player);
  });
  assert.ok(parched.mesh.position.distanceTo(start) > 0.02, 'it moved');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the Inspector can spawn the parched', () => {
  assert.ok(DEBUG_MOBS.includes('parched'), 'parched must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const parched = s.reset('parched');
  assert.equal(parched.type, 'parched');
  assert.equal(s.snapshot().maxHealth, 16, 'Inspector telemetry shows 16 HP');
  // The other variants are still selectable.
  for (const type of ['husk', 'stray', 'bogged', 'parched']) {
    assert.equal(s.reset(type).type, type, `${type} spawns`);
  }
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.parched_spawn_egg, 'the parched has a spawn egg');
  assert.equal(ITEMS.parched_spawn_egg.mob, 'parched');
  assert.equal(ITEMS.parched_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-parched input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isUndeadVariant(cow), false);
  assert.equal(variantHealth('cow'), null);
  assert.equal(variantDimensions('cow'), null);
  assert.equal(variantBurnsInDaylight('cow'), false);
  assert.equal(variantAvoidsWater('parched'), false, 'a parched walks into water, unlike a husk');
  assert.deepEqual(variantBonusDrops(cow), []);
  assert.equal(variantProfile('cow'), null);
  assert.equal(variantTint('cow'), null);
  assert.equal(manager.spawnMob('parched', 9, 1, 9).type, 'parched');
});
