// Numbers from https://minecraft.wiki/w/Mob and each mob's own page, pinned as exact values.
//
// The showcase tests (mobShowcaseCoverage.test.js) watch mobs behave. These test the rules underneath them, so a wrong
// constant fails here with the wiki's figure in the message instead of showing up as a mob that feels off.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOB_WIKI_DATA, MOB_FALL_RULES, MOB_KILL_XP, MOB_MELEE_DAMAGE, MOB_KNOCKBACK_RESISTANCE } from '../src/mobWikiData.js';
import { DEBUG_MOBS, createMobDebugSession } from '../src/mobDebugSession.js';
import {
  fallDamageFor, meleeDamage, knockbackFactor, rollKillXp, SAFE_FALL_BLOCKS, AIR_SUPPLY_SECONDS, DROWN_DAMAGE, SUN_BURNING_TYPES
} from '../src/mobEnvironment.js';
import {
  explosionDamage, CREEPER_FUSE_SECONDS, CREEPER_IGNITE_RANGE, CREEPER_CANCEL_RANGE, CREEPER_POWER, CHARGED_CREEPER_POWER
} from '../src/creeperBehavior.js';
import { WOLF_ANGER_SECONDS, WOLF_PACK_RADIUS } from '../src/wolfCombat.js';
import {
  FISH_AIR_SECONDS, AXOLOTL_AIR_SECONDS, DRY_DAMAGE
} from '../src/waterAnimalAirSupply.js';

test('the generated wiki table covers every mob the Inspector can show', () => {
  for (const id of DEBUG_MOBS) {
    const row = MOB_WIKI_DATA[id];
    assert.ok(row, `${id} has no wiki row (run: node scripts/generate-mob-wiki-data.mjs)`);
    assert.ok(row.health.length > 0, `${id} has no health on the wiki row`);
    assert.ok(row.behavior, `${id} has no behaviour class`);
    assert.ok(row.size, `${id} has no hitbox`);
  }
});

test('every mob spawns with the wiki health and hitbox', () => {
  const bad = [];
  for (const id of DEBUG_MOBS) {
    const s = createMobDebugSession(new THREE.Scene(), () => {});
    const mob = s.reset(id);
    const row = MOB_WIKI_DATA[id];
    const lo = Math.min(...row.health), hi = Math.max(...row.health);
    if (!(mob.maxHealth >= lo && mob.maxHealth <= hi)) bad.push(`${id}: health ${mob.maxHealth}, wiki ${lo}-${hi}`);
    const base = s.manager.getMobDimensions(id);
    const w = mob.width ?? base.width, h = mob.height ?? base.height;
    if (id !== 'killer_bunny' && !row.sizes.some(z => Math.abs(z.width - w) < 0.011 && Math.abs(z.height - h) < 0.011)) bad.push(`${id}: hitbox ${w}x${h}, wiki ${row.sizes.map(z => `${z.width}x${z.height}`).join(' / ')}`);
  }
  assert.deepEqual(bad, []);
});

test('creeper: 1.5 s fuse inside 3 blocks, wound back beyond 7, power 3 (6 charged)', () => {
  assert.equal(CREEPER_FUSE_SECONDS, 1.5);
  assert.equal(CREEPER_IGNITE_RANGE, 3);
  assert.equal(CREEPER_CANCEL_RANGE, 7);
  assert.equal(CREEPER_POWER, 3);
  assert.equal(CHARGED_CREEPER_POWER, 6);
});

test('explosion damage follows the wiki formula and the difficulty scaling', () => {
  // impact = 1 - d / (2 * power); damage = floor((impact^2 + impact) / 2 * 7 * power + 1)
  assert.equal(explosionDamage(3, 0, 'normal'), 22, 'point blank, power 3');
  assert.equal(explosionDamage(3, 3, 'normal'), 8);
  assert.equal(explosionDamage(3, 6, 'normal'), 0, 'nothing at twice the power in blocks');
  assert.equal(explosionDamage(3, 0, 'hard'), 33, 'Hard is x1.5');
  assert.equal(explosionDamage(3, 0, 'easy'), 12, 'Easy is min(d / 2 + 1, d)');
  assert.equal(explosionDamage(3, 0, 'peaceful'), 0);
  assert.equal(explosionDamage(6, 0, 'normal'), 43, 'a charged creeper, point blank');
});

test('fall damage: 3 free blocks, and the wiki exceptions', () => {
  assert.equal(SAFE_FALL_BLOCKS, 3);
  assert.equal(fallDamageFor('zombie', 3), 0);
  assert.equal(fallDamageFor('zombie', 4), 1);
  assert.equal(fallDamageFor('zombie', 20), 17);
  assert.equal(fallDamageFor('chicken', 100), 0, 'chickens are immune');
  assert.equal(fallDamageFor('cat', 100), 0, 'cats are immune');
  assert.equal(fallDamageFor('iron_golem', 100), 0);
  assert.equal(fallDamageFor('goat', 20), 7, 'goats take 10 less');
  assert.equal(fallDamageFor('goat', 10), 0);
  assert.equal(fallDamageFor('frog', 20), 12, 'frogs take 5 less');
  assert.equal(fallDamageFor('fox', 8), 3, 'foxes fall 5 blocks safely');
  assert.equal(fallDamageFor('camel', 20), 7, 'camels: 6 safe blocks and half damage, rounded up');
  for (const id of ['allay', 'bat', 'bee', 'blaze', 'breeze', 'ghast', 'parrot', 'phantom', 'shulker', 'snow_golem', 'wither']) {
    assert.equal(MOB_FALL_RULES[id].immune, true, `${id} is fall-damage immune on the wiki`);
  }
});

test('drowning: 15 s of air, then 2 damage; fish and axolotls have their own supply', () => {
  assert.equal(AIR_SUPPLY_SECONDS, 15);
  assert.equal(DROWN_DAMAGE, 2);
  assert.equal(FISH_AIR_SECONDS, 15);
  assert.equal(AXOLOTL_AIR_SECONDS, 300);
  assert.equal(DRY_DAMAGE, 2);
});

test('undead that burn in sunlight', () => {
  for (const id of ['zombie', 'zombie_villager', 'skeleton', 'drowned']) assert.ok(SUN_BURNING_TYPES.has(id), id);
  for (const id of ['husk', 'wither_skeleton', 'zombified_piglin', 'skeleton_horse']) assert.ok(!SUN_BURNING_TYPES.has(id), `${id} does not burn`);
});

test('melee damage by difficulty', () => {
  assert.deepEqual(MOB_MELEE_DAMAGE.zombie, { easy: 2.5, normal: 3, hard: 4.5 });
  assert.equal(meleeDamage('zombie', 'easy'), 2.5);
  assert.equal(meleeDamage('zombie', 'hard'), 4.5);
  assert.equal(meleeDamage('spider', 'hard'), 3);
  assert.equal(meleeDamage('wolf', 'normal'), 4);
  assert.equal(meleeDamage('enderman', 'hard'), 10.5);
  assert.equal(meleeDamage('no_such_mob', 'normal', 7), 7, 'a mob the wiki gives nothing for keeps the fallback');
});

test('knockback resistance', () => {
  assert.equal(MOB_KNOCKBACK_RESISTANCE.iron_golem, 1);
  assert.equal(MOB_KNOCKBACK_RESISTANCE.warden, 1);
  assert.equal(knockbackFactor('iron_golem'), 0);
  assert.equal(knockbackFactor('ravager'), 0.25);
  assert.ok(Math.abs(knockbackFactor('hoglin') - 0.4) < 1e-9);
  assert.ok(Math.abs(knockbackFactor('squid') - 0.15) < 1e-9);
  assert.equal(knockbackFactor('cow'), 1);
});

test('experience for a kill by a player', () => {
  const expected = { zombie: 5, ghast: 5, ravager: 20, piglin_brute: 20, shulker: 5, guardian: 10, elder_guardian: 10, warden: 5, vex: 5, giant: 5, zombie_villager: 5 };
  for (const [id, xp] of Object.entries(expected)) assert.deepEqual(MOB_KILL_XP[id], [xp, xp], `${id} drops ${xp} XP on the wiki`);
  assert.equal(rollKillXp('ghast', () => 0.9), 5);
  assert.deepEqual([rollKillXp('cow', () => 0), rollKillXp('cow', () => 0.99)], [1, 3], 'animals drop 1-3');
});

test('wild wolves stay angry for 20-39 s and the pack within 16 blocks joins in', () => {
  assert.deepEqual(WOLF_ANGER_SECONDS, { min: 20, max: 39 });
  assert.equal(WOLF_PACK_RADIUS, 16);
});
