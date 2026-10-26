// Status effects on mobs (src/mobEffects.js): every mob can now hold the effects potions, tipped arrows and stings give
// it, with the player's rules (statusEffects.js) -- and they do what the wiki says on a mob: Poison and Regeneration
// tick, Speed and Slowness change how far it goes, Strength and Weakness its hit, Resistance what it takes, Slow Falling
// its fall, Invisibility whether it is seen; Infested, Oozing, Weaving and Wind Charged leave something behind. Before
// this only the wither skeleton and the zombified piglin could hold an effect, so a splash of Weakness could not start a
// zombie villager's cure.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { installMobEffects, updateMobEffects, applyMobEffect, scaleMobMotion, mobMeleeDamage, mobDamageTaken, onMobHurt, onMobDeath, INFESTED_CHANCE } from '../src/mobEffects.js';
import { throwSplashPotion } from '../src/splashPotion.js';
import { tippedArrowEffect } from '../src/tippedArrows.js';
import { startZombieVillagerCure } from '../src/villagerEconomy.js';
import { serializeMobState, restoreMobState } from '../src/mobState.js';
import { trackFall } from '../src/mobEnvironment.js';

function fixture(voxels = new Map()) {
  const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? 0, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id), getChunk: () => null };
  const manager = new MobManager(new THREE.Scene(), world, {});
  const spawn = (type, x = 0, y = 0, z = 0) => installMobEffects(manager, manager.spawnMob(type, x, y, z));
  return { manager, world, voxels, spawn };
}

test('every mob can hold an effect, and a splash potion gives it one', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow'), zombie = spawn('zombie', 1, 0, 0);
  throwSplashPotion({ mobs: manager }, { x: 0, y: 0, z: 0 }, 'splash_potion_of_slowness');
  assert.ok(cow.hasStatusEffect('slowness') && zombie.hasStatusEffect('slowness'));
  assert.deepEqual([cow.effects.get('slowness').duration, cow.effects.get('slowness').level], [90, 1]);
  // The same rule as the player's: a weaker effect does not replace a stronger one.
  cow.applyStatusEffect('slowness', 300, 1); cow.applyStatusEffect('slowness', 20, 4); cow.applyStatusEffect('slowness', 400, 2);
  assert.deepEqual([cow.effects.get('slowness').duration, cow.effects.get('slowness').level], [20, 4]);
});

test('the immune are immune: undead to Poison and Regeneration, spiders to Poison', () => {
  const { spawn } = fixture();
  const zombie = spawn('zombie'), spider = spawn('spider'), cow = spawn('cow');
  assert.equal(zombie.applyStatusEffect('poison', 45, 1), false);
  assert.equal(zombie.applyStatusEffect('regeneration', 45, 1), false);
  assert.equal(spider.applyStatusEffect('poison', 45, 1), false);
  assert.equal(cow.applyStatusEffect('poison', 45, 1), true);
});

test('Poison ticks a mob down to 1 HP and no further; Regeneration heals; Wither can kill', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow');
  cow.applyStatusEffect('poison', 60, 1);
  for (let i = 0; i < 60 * 20 + 2; i++) updateMobEffects(manager, 0.05);
  assert.equal(cow.health, 1, 'poison never kills');
  assert.equal(cow.hasStatusEffect('poison'), false, 'and it wears off');
  cow.applyStatusEffect('regeneration', 11, 1);
  for (let i = 0; i < 11 * 20 + 2; i++) updateMobEffects(manager, 0.05);
  assert.equal(cow.health, 5, 'one HP every 2.5 s: four in 11 s');
  const pig = spawn('pig');
  pig.applyStatusEffect('wither', 10, 1);
  assert.ok(pig.witherEffect, 'Wither goes through the existing wither ticking');
  assert.ok(pig.hasStatusEffect('wither'));
});

test('Healing and Harming are instant on a mob, and reversed on the undead', () => {
  const { spawn } = fixture();
  const cow = spawn('cow'), zombie = spawn('zombie', 3, 0, 0);
  cow.health = 5; zombie.health = 10;
  cow.applyStatusEffect('instant_health', 0, 1);
  zombie.applyStatusEffect('instant_damage', 0, 1);
  assert.equal(cow.health, 9);
  assert.equal(zombie.health, 14);
  assert.equal(cow.hasStatusEffect('instant_health'), false, 'nothing is held');
});

test('Speed and Slowness change how far a mob goes in a step; Speed never carries it into a wall', () => {
  const voxels = new Map();
  const { spawn, world } = fixture(voxels);
  const cow = spawn('cow');
  cow.applyStatusEffect('slowness', 30, 1);
  cow.mesh.position.set(1, 0, 0);
  scaleMobMotion(world, cow, 0, 0, 0, 0.05);
  assert.ok(Math.abs(cow.mesh.position.x - 0.85) < 1e-9, 'Slowness I: 15% less');
  const pig = spawn('pig');
  pig.applyStatusEffect('speed', 30, 2);
  pig.mesh.position.set(1, 0, 0);
  scaleMobMotion(world, pig, 0, 0, 0, 0.05);
  assert.ok(Math.abs(pig.mesh.position.x - 1.4) < 1e-9, 'Speed II: 40% more');
  voxels.set('2,0,0', BLOCKS.STONE); voxels.set('2,1,0', BLOCKS.STONE);
  pig.mesh.position.set(1.9, 0, 0);
  scaleMobMotion(world, pig, 0.9, 0, 0, 0.05);
  assert.equal(pig.mesh.position.x, 1.9, 'not into the stone');
});

test('Strength and Weakness on a mob\'s hit; Resistance on what it takes', () => {
  const { spawn } = fixture();
  const zombie = spawn('zombie');
  assert.equal(mobMeleeDamage(zombie, 3), 3);
  zombie.applyStatusEffect('strength', 30, 2);
  assert.equal(mobMeleeDamage(zombie, 3), 9, '+3 a level');
  const husk = spawn('husk');
  husk.applyStatusEffect('weakness', 30, 1);
  assert.equal(mobMeleeDamage(husk, 3), 0, '-4, never below nothing');
  husk.applyStatusEffect('resistance', 30, 2);
  assert.ok(Math.abs(mobDamageTaken(husk) - 0.6) < 1e-9, '20% less a level');
});

test('a splash of Weakness lets a golden apple start a zombie villager\'s cure', () => {
  const { manager, spawn } = fixture();
  const zv = spawn('zombie_villager');
  const apple = { id: 'golden_apple', count: 1 };
  assert.equal(startZombieVillagerCure(zv, apple), false, 'no Weakness, no cure');
  throwSplashPotion({ mobs: manager }, { x: 0, y: 0, z: 0 }, 'splash_potion_of_weakness');
  assert.equal(startZombieVillagerCure(zv, apple), true);
});

test('a tipped arrow\'s effect reaches the mob it hits', () => {
  const { spawn } = fixture();
  const cow = spawn('cow');
  const effect = tippedArrowEffect('tipped_arrow_poison');
  cow.applyStatusEffect(effect.id, effect.duration, effect.level);
  assert.ok(cow.hasStatusEffect('poison'));
});

test('Invisibility hides a mob until it wears off', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow');
  cow.applyStatusEffect('invisibility', 1, 1);
  assert.equal(cow.mesh.visible, false);
  updateMobEffects(manager, 0.5); cow.mesh.visible = true; updateMobEffects(manager, 0.1);
  assert.equal(cow.mesh.visible, false, 'kept hidden while it lasts');
  updateMobEffects(manager, 0.6);
  assert.equal(cow.mesh.visible, true);
});

test('Slow Falling: no fall damage; Jump Boost takes its level off the fall', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow'), pig = spawn('pig', 3, 0, 0);
  const fall = (mob) => {
    const before = mob.health;
    mob.onGround = false; trackFall(manager, mob, { x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: 0 });
    mob.onGround = true; mob.hitCooldown = 0; trackFall(manager, mob, { x: 0, y: 3.5, z: 0 }, { x: 0, y: 3, z: 0 });
    return before - mob.health;
  };
  cow.applyStatusEffect('slow_falling', 30, 1);
  assert.equal(fall(cow), 0);
  pig.applyStatusEffect('jump_boost', 30, 2);
  assert.equal(fall(pig), 2, 'a 7-block fall, less 2 for Jump Boost II, less the 3 free');
});

test('Infested: a 10% chance, when hurt, of 1-2 silverfish', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow');
  cow.applyStatusEffect('infested', 180, 1);
  assert.equal(INFESTED_CHANCE, 0.1);
  assert.deepEqual(onMobHurt(manager, cow, () => 0.5), [], 'no luck');
  const rolls = [0.05, 0.9, 0.5, 0.5, 0.5, 0.5];
  const spawned = onMobHurt(manager, cow, () => rolls.shift() ?? 0.5);
  assert.equal(spawned.length, 2);
  assert.ok(spawned.every((m) => m.type === 'silverfish'));
});

test('Oozing: two medium slimes on death, up to 24 slimes in the 5x5x5 cube', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow');
  cow.applyStatusEffect('oozing', 180, 1);
  const before = manager.mobs.filter((m) => m.type === 'slime').length;
  assert.equal(onMobDeath(manager, cow, () => 0.5).slimes, 2);
  const slimes = manager.mobs.filter((m) => m.type === 'slime');
  assert.equal(slimes.length - before, 2);
  assert.ok(slimes.every((s) => s.slimeSize === 2), 'medium');
  assert.equal(onMobDeath(manager, cow).slimes, 0, 'once per death');
  // Crammed: 23 slimes about, room for one.
  const { manager: m2, spawn: spawn2 } = fixture();
  for (let i = 0; i < 23; i++) m2.spawnSlime(0, 0, 0, 1);
  const pig = spawn2('pig');
  pig.applyStatusEffect('oozing', 180, 1);
  assert.equal(onMobDeath(m2, pig, () => 0.5).slimes, 1);
});

test('Weaving: 2-3 cobwebs on death, on top of solid blocks in the 3x3x3 round it', () => {
  const voxels = new Map();
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) voxels.set(`${x},-1,${z}`, BLOCKS.STONE);
  const { manager, spawn } = fixture(voxels);
  const cow = spawn('cow');
  cow.applyStatusEffect('weaving', 180, 1);
  const { cobwebs } = onMobDeath(manager, cow, () => 0.99);
  assert.equal(cobwebs.length, 3);
  for (const [x, y, z] of cobwebs) {
    assert.equal(voxels.get(`${x},${y},${z}`), BLOCKS.COBWEB);
    assert.equal(voxels.get(`${x},${y - 1},${z}`), BLOCKS.STONE, 'on a solid top');
  }
});

test('Wind Charged: a wind burst on death that throws what is near', () => {
  const { manager, spawn } = fixture();
  const cow = spawn('cow'), pig = spawn('pig', 1, 0, 0);
  pig.velocity.set(0, 0, 0);
  cow.applyStatusEffect('wind_charged', 180, 1);
  assert.equal(onMobDeath(manager, cow).burst, true);
  assert.ok(pig.velocity.y > 0 && pig.velocity.x > 0, 'pushed up and away');
});

test('a mob\'s effects are saved and come back', () => {
  const { spawn, manager } = fixture();
  const cow = spawn('cow');
  cow.applyStatusEffect('slowness', 90, 2);
  const state = serializeMobState(cow);
  assert.deepEqual(state.effects, [['slowness', 90, 2]]);
  const { spawn: spawn2 } = fixture();
  const again = restoreMobState(spawn2('cow'), state);
  again.effectsInstalled = false; installMobEffects(manager, again);
  assert.deepEqual([again.effects.get('slowness').duration, again.effects.get('slowness').level], [90, 2]);
});

test('a mob with its own effect handling keeps it', () => {
  const { manager } = fixture();
  const own = { type: 'wither_skeleton', health: 20, applyStatusEffect: () => 'own' };
  installMobEffects(manager, own);
  assert.equal(own.applyStatusEffect(), 'own');
  assert.equal(applyMobEffect(manager, { type: 'wither', health: 10, mesh: null }, 'poison', 10), false, 'the wither is immune to everything');
});
