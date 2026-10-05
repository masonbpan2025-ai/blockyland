// Cave Spider parity with https://minecraft.wiki/w/Cave_Spider
//
// Cave Spider was another of the 38 missing types. It shares the spider's model and
// light-based neutrality but is smaller, has less health, and poisons.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  SPIDER_HEALTH, SPIDER_DIMENSIONS, SPIDER_HOSTILE_MAX_LIGHT, SPIDER_XP,
  CAVE_SPIDER_HEALTH, CAVE_SPIDER_DIMENSIONS, CAVE_SPIDER_SCALE, CAVE_SPIDER_POISON,
  CAVE_SPIDER_MELEE_DAMAGE,
  isSpider, isCaveSpider, isSpiderVariant, caveSpiderPoisonFor, caveSpiderMeleeFor,
  applyCaveSpiderPoison, updateSpiderHunt, spiderWantsTarget, angerSpider,
  SPIDER_ATTACK_REACH, SPIDER_ATTACK_COOLDOWN
} from '../src/spiderBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ light = 0, difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => light };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: () => false
  });
  const player = {
    position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {},
    onGround: true, statusEffects: {}, damageEvents: 0,
    takeDamage(n) { this.damageEvents++; this.health = Math.max(0, this.health - n); },
    applyStatusEffect(id, seconds) { this.statusEffects[id] = { seconds }; },
    hasStatusEffect(id) { return !!this.statusEffects[id]; }
  };
  manager.game = { player, difficulty, weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, entities, player };
}

function recordDrops(entities, into = []) {
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    into.push({ itemType, isBlock, count });
    return into[into.length - 1];
  };
  return into;
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('cave spider is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('cave_spider', 0, 1, 0);
  assert.equal(spider.type, 'cave_spider', 'the dispatcher must return a cave spider');
  assert.equal(spider.name, 'Cave Spider');
  assert.notEqual(spider.type, 'villager');
});

test('cave spiders have the reference 12 HP and half-size hitbox', () => {
  const { manager } = fixture();
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  assert.equal(cave.maxHealth, CAVE_SPIDER_HEALTH);
  assert.equal(cave.maxHealth, 12, 'wiki: cave spiders have 12 HP');
  assert.equal(cave.health, 12);
  // Wiki: 0.7 x 0.5 against the spider's 1.4 x 0.9.
  assert.deepEqual(CAVE_SPIDER_DIMENSIONS, { width: 0.7, height: 0.5 });
  assert.deepEqual(manager.getMobDimensions('cave_spider'), { width: 0.7, height: 0.5 });
  assert.deepEqual([cave.width, cave.height], [0.7, 0.5]);
});

test('a cave spider is exactly half the size of a spider', () => {
  const { manager } = fixture();
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  const spider = manager.spawnMob('spider', 4, 1, 0);

  assert.equal(CAVE_SPIDER_SCALE, 0.5, 'wiki: the model is half scale');
  assert.equal(cave.mesh.scale.x, 0.5);
  assert.equal(spider.mesh.scale.x, 1);
  // The wiki hitboxes are not proportional: 1.4 -> 0.7 halves the width, but 0.9 -> 0.5 does
  // not halve the height. Pin the wiki values rather than assuming a uniform scale.
  assert.equal(cave.width, SPIDER_DIMENSIONS.width / 2, 'width is halved');
  assert.equal(cave.height, 0.5, 'height is the wiki 0.5, not 0.45');
  assert.ok(cave.width < spider.width && cave.height < spider.height, 'strictly smaller');
  assert.equal(CAVE_SPIDER_HEALTH, 12);
  assert.ok(CAVE_SPIDER_HEALTH < SPIDER_HEALTH, 'a cave spider has less health than a spider');

  // It reuses the spider model rather than a second mesh.
  assert.equal(cave.legs.length, 8, 'eight legs');
  assert.equal(cave.eyes.length, 4, 'four eyes');
  assert.ok(cave.head && cave.thorax && cave.abdomen, 'same body segments');
});

test('both variants are recognised by the shared spider helpers', () => {
  assert.equal(isSpider({ type: 'spider' }), true);
  assert.equal(isSpider({ type: 'cave_spider' }), false, 'isSpider is strictly the spider');
  assert.equal(isCaveSpider({ type: 'cave_spider' }), true);
  assert.equal(isCaveSpider({ type: 'spider' }), false);
  assert.equal(isSpiderVariant({ type: 'spider' }), true);
  assert.equal(isSpiderVariant({ type: 'cave_spider' }), true);
  assert.equal(isSpiderVariant({ type: 'cow' }), false);
});

test('cave spiders inherit the light-based neutrality rule', () => {
  // Wiki: "They are neutral if under daylight or in light levels of 12 or above, otherwise
  // hostile toward players and iron golems."
  assert.equal(SPIDER_HOSTILE_MAX_LIGHT, 11);
  const target = { position: new THREE.Vector3(0, 1, 3), gamemode: 'survival' };
  for (const light of [0, 11]) {
    const { manager } = fixture({ light });
    const cave = manager.spawnMob('cave_spider', 0, 1, 0);
    assert.equal(spiderWantsTarget(manager, cave, target), true, `hostile at light ${light}`);
  }
  for (const light of [12, 15]) {
    const { manager } = fixture({ light });
    const cave = manager.spawnMob('cave_spider', 0, 1, 0);
    assert.equal(spiderWantsTarget(manager, cave, target), false, `neutral at light ${light}`);
  }
});

test('a provoked cave spider pursues regardless of light', () => {
  const target = { position: new THREE.Vector3(0, 1, 3), gamemode: 'survival' };
  const { manager } = fixture({ light: 15 });
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  assert.equal(spiderWantsTarget(manager, cave, target), false);
  angerSpider(cave, target);
  assert.equal(spiderWantsTarget(manager, cave, target), true, 'retaliation ignores light');
});

test('the poison table matches the wiki for every difficulty', () => {
  // Wiki: Poison on Normal and Hard only, 7 s / 15 s, for 6 / 12 total damage.
  assert.equal(CAVE_SPIDER_POISON.easy, null, 'wiki: no poison on Easy');
  assert.equal(CAVE_SPIDER_POISON.peaceful, null, 'no poison on Peaceful');
  assert.deepEqual(CAVE_SPIDER_POISON.normal, { seconds: 7, damage: 6 });
  assert.deepEqual(CAVE_SPIDER_POISON.hard, { seconds: 15, damage: 12 });
  assert.deepEqual(CAVE_SPIDER_MELEE_DAMAGE, { peaceful: 0, easy: 2, normal: 2, hard: 3 },
    'wiki: melee is 2 on Easy and Normal, 3 on Hard');

  assert.equal(caveSpiderPoisonFor('easy'), null);
  assert.equal(caveSpiderPoisonFor('normal').seconds, 7);
  assert.equal(caveSpiderPoisonFor('hard').seconds, 15);
  assert.equal(caveSpiderPoisonFor('unknown'), CAVE_SPIDER_POISON.normal, 'unknown falls back to normal');
  assert.equal(caveSpiderMeleeFor('hard'), 3);
  assert.equal(caveSpiderMeleeFor('peaceful'), 0);
});

test('poison is applied on Normal and Hard, and never on Easy', () => {
  for (const [difficulty, expectedSeconds] of [['normal', 7], ['hard', 15]]) {
    const { manager, player } = fixture({ difficulty });
    const cave = manager.spawnMob('cave_spider', 0, 1, 0);
    const poison = applyCaveSpiderPoison(manager, cave, player, difficulty);
    assert.ok(poison, `${difficulty}: poison applied`);
    assert.equal(player.statusEffects.poison.seconds, expectedSeconds,
      `wiki: ${difficulty} poisons for ${expectedSeconds}s`);
  }
  for (const difficulty of ['easy', 'peaceful']) {
    const { manager, player } = fixture({ difficulty });
    const cave = manager.spawnMob('cave_spider', 0, 1, 0);
    assert.equal(applyCaveSpiderPoison(manager, cave, player, difficulty), null,
      `wiki: no poison on ${difficulty}`);
    assert.equal(player.hasStatusEffect('poison'), false);
  }
});

test('poison is never applied by a plain spider, or to an immune target', () => {
  const { manager, player } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.equal(applyCaveSpiderPoison(manager, spider, player), null, 'only cave spiders poison');

  const cave = manager.spawnMob('cave_spider', 4, 1, 0);
  // Wiki: cave spiders are immune to Poison, so they cannot poison one another.
  const otherCave = manager.spawnMob('cave_spider', 6, 1, 0);
  assert.equal(applyCaveSpiderPoison(manager, cave, otherCave), null);
  // A target flagged poison-immune is also skipped.
  const immune = { poisonImmune: true, applyStatusEffect() { throw new Error('should not be called'); } };
  assert.equal(applyCaveSpiderPoison(manager, cave, immune), null);
  assert.equal(applyCaveSpiderPoison(manager, cave, null), null);
});

test('the hunt bites the player and poisons on Normal', () => {
  const { manager, player } = fixture({ light: 0, difficulty: 'normal' });
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  // Stand the spider right next to the player, inside the bite reach.
  cave.mesh.position.set(0, 1, SPIDER_ATTACK_REACH - 0.2);
  cave.hitCooldown = 0;

  assert.equal(updateSpiderHunt(manager, cave, 1 / 60, player), true, 'the spider acted');
  assert.equal(player.damageEvents, 1, 'it bit the player');
  assert.equal(player.health, 18, 'wiki: 2 melee damage on Normal');
  assert.ok(player.hasStatusEffect('poison'), 'and poisoned them');
  assert.equal(player.statusEffects.poison.seconds, 7);
  assert.ok(cave.hitCooldown > 0, 'the bite went on cooldown');
});

test('the hunt respects the attack cooldown', () => {
  const { manager, player } = fixture({ light: 0 });
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  cave.mesh.position.set(0, 1, SPIDER_ATTACK_REACH - 0.2);
  cave.hitCooldown = 0;
  updateSpiderHunt(manager, cave, 1 / 60, player);
  const afterFirst = player.damageEvents;
  // Immediately again: still on cooldown.
  updateSpiderHunt(manager, cave, 1 / 60, player);
  assert.equal(player.damageEvents, afterFirst, 'no second bite inside the cooldown');
  // After the cooldown elapses it bites again.
  for (let i = 0; i < 90; i++) updateSpiderHunt(manager, cave, 1 / 60, player);
  assert.ok(player.damageEvents > afterFirst, 'bites again after the cooldown');
  assert.equal(SPIDER_ATTACK_COOLDOWN, 1.0);
});

test('a cave spider in bright light does not chase', () => {
  const { manager, player } = fixture({ light: 15 });
  const cave = manager.spawnMob('cave_spider', 0, 1, 10);
  player.position.set(0, 1, 0);
  const before = cave.mesh.position.clone();
  for (let i = 0; i < 120; i++) updateSpiderHunt(manager, cave, 1 / 60, player);
  const moved = cave.mesh.position.distanceTo(before);
  assert.ok(moved < 0.5, `a neutral cave spider should not close in, moved ${moved}`);
  assert.equal(player.damageEvents, 0, 'and never bites');
});

test('a cave spider in the dark closes on the player', () => {
  const { manager, player } = fixture({ light: 0 });
  const cave = manager.spawnMob('cave_spider', 0, 1, 8);
  player.position.set(0, 1, 0);
  const before = cave.mesh.position.clone();
  // The hunt only sets velocity; the shared mob update applies it. Driving the real loop is
  // what proves the spider actually closes the distance.
  for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  const moved = cave.mesh.position.distanceTo(before);
  assert.ok(moved > 0.5, `a hostile cave spider should chase, moved ${moved}`);
});

test('cave spiders drop what spiders drop and award 5 XP', () => {
  const { manager, entities, player } = fixture();
  recordDrops(entities);
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  assert.deepEqual(manager.getMobDeathDrops(cave, () => 0.99), [['string', false, 0, 2]],
    'wiki: 0-2 string without kill credit');
  cave.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(cave, () => 0.99),
    [['string', false, 0, 2], ['spider_eye', false, 0, 1]],
    'wiki: 0-1 spider eye with player credit');

  cave.playerDamaged = true;
  manager.damageMob(cave, 1000, null, false, player);
  for (let i = 0; i < 12; i++) manager.update(0.1, player);
  assert.equal(xpFrom(entities), SPIDER_XP, `wiki: 5 XP, got ${xpFrom(entities)}`);
});

test('the Inspector can spawn the cave spider and it is in the debug list', () => {
  assert.ok(DEBUG_MOBS.includes('cave_spider'), 'cave_spider must be selectable');
  assert.ok(DEBUG_MOBS.includes('spider'), 'and so must spider');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const cave = s.reset('cave_spider');
  assert.equal(cave.type, 'cave_spider');
  assert.equal(s.snapshot().health, 12, 'Inspector telemetry shows 12 HP');
  assert.equal(s.snapshot().maxHealth, 12);
  assert.equal(s.snapshot().climbing, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 12);
});

test('a cave spider walks and animates without breaking the update loop', () => {
  const { manager, player } = fixture();
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  player.position.set(6, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(cave), 'still alive');
  assert.ok((cave.spiderPhase || 0) > 0, 'the leg walk cycle advanced');
});

test('existing cave spider behaviour is unaffected by plain spiders', () => {
  const { manager, player } = fixture({ light: 0 });
  const spider = manager.spawnMob('spider', 0, 1, 0);
  spider.mesh.position.set(0, 1, SPIDER_ATTACK_REACH - 0.2);
  spider.hitCooldown = 0;
  updateSpiderHunt(manager, spider, 1 / 60, player);
  assert.equal(player.health, 18, 'a plain spider deals 2 damage');
  assert.equal(player.hasStatusEffect('poison'), false, 'and does not poison');
});

test('the cave spider reuses the spider texture path rather than a second texture', () => {
  const { manager } = fixture();
  const cave = manager.spawnMob('cave_spider', 0, 1, 0);
  const spider = manager.spawnMob('spider', 4, 1, 0);
  // Wiki: cave spiders reuse every spider sound and the same texture family.
  assert.equal(typeof cave.bodyMat?.color?.getHex, 'function');
  assert.equal(cave.bodyMat.color.getHex(), spider.bodyMat.color.getHex(), 'same body colour');
  assert.equal(cave.eyeMat.color.getHex(), spider.eyeMat.color.getHex(), 'same emissive eyes');
});
