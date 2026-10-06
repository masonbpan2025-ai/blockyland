// Spider parity with https://minecraft.wiki/w/Spider
//
// Spider was one of the 38 missing types: `spawnMob('spider')` fell through the dispatcher to
// Villager, so there was no model, no AI, no loot and no Inspector entry. This suite pins the
// native implementation against the wiki reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { createSpiderModel, poseSpiderLegs, SPIDER_HITBOX } from '../src/spiderModel.js';
import {
  SPIDER_HEALTH, SPIDER_DIMENSIONS, SPIDER_HOSTILE_MAX_LIGHT, SPIDER_SIGHT_RANGE,
  SPIDER_XP, SPIDER_ANGER_SECONDS, SPIDER_CLIMB_SPEED,
  isSpider, lightAt, spiderIsAngry, spiderWantsTarget, angerSpider, updateSpiderAnger,
  updateSpiderClimbing, spiderDrops
} from '../src/spiderBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

/**
 * Fixture with a configurable light level and solidity so the light rule and the climbing
 * rule can each be driven directly.
 */
function fixture({ light = 0, solid = () => false, terrain = null } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = terrain || {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => light
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {},
    // `solid` overrides for the climbing tests; by default solidity follows the terrain, so
    // a ground-walking test gets a floor instead of falling for ever.
    isBlockSolid: (x, y, z) => (solid(x, y, z) || world.getVoxel(x, y, z) === BLOCKS.STONE)
  });
  const player = { position: new THREE.Vector3(100, 1, 100), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, entities, player, world };
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

test('spider is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.equal(spider.type, 'spider', 'the dispatcher must return a spider, not a villager');
  assert.equal(spider.name, 'Spider');
});

test('spiders have the reference 16 HP and 1.4 x 0.9 hitbox', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.equal(spider.maxHealth, SPIDER_HEALTH);
  assert.equal(spider.maxHealth, 16, 'wiki: spiders have 16 HP (lowered from 20 in Beta 1.9-pre2)');
  assert.equal(spider.health, 16);
  // Wiki: a spider is wider than it is tall.
  assert.deepEqual(SPIDER_DIMENSIONS, { width: 1.4, height: 0.9 });
  assert.deepEqual(manager.getMobDimensions('spider'), { width: 1.4, height: 0.9 });
  assert.deepEqual([spider.width, spider.height], [1.4, 0.9]);
  assert.ok(spider.width > spider.height, 'the hitbox is wider than tall, like the wiki');
});

test('the model has a head, two body segments, eight legs and eight eyes', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.ok(spider.head, 'head');
  assert.ok(spider.thorax, 'thorax');
  assert.ok(spider.abdomen, 'abdomen');
  assert.equal(spider.legs.length, 8, 'wiki: spiders have eight legs');
  // Wiki: a spider has EIGHT eyes in two rows, not four. The previous model had four, which is why this count
  // changed: the face was rebuilt from the real skin and the wiki's actual eye count.
  assert.equal(spider.eyes.length, 8, 'wiki: a spider has eight eyes');
  assert.deepEqual(SPIDER_HITBOX, { width: 1.4, height: 0.9 });

  // Every leg has the two segments the walk cycle animates.
  for (const leg of spider.legs) {
    assert.ok(leg.hip && leg.upper && leg.knee && leg.lower, 'each leg has a hip, upper and knee/lower');
  }
});

test('the legs animate in two alternating tripods', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial();
  const model = createSpiderModel(bodyMat, eyeMat);
  const before = model.legs.map(l => l.hip.rotation.y);
  poseSpiderLegs(model, Math.PI / 2);
  const after = model.legs.map(l => l.hip.rotation.y);
  const deltas = after.map((y, i) => y - before[i]);

  assert.notDeepEqual(after, before, 'the pose changed the legs');
  for (const d of deltas) assert.ok(Math.abs(d) > 1e-9, 'every leg moved');

  // Legs 0 and 1 are in opposite tripods (index % 4 is 0 and 1), so at phase pi/2 they must
  // swing in opposite directions. Same-tripod legs (0 and 3) must swing together.
  assert.equal(Math.sign(deltas[0]), -Math.sign(deltas[1]),
    `legs 0 and 1 belong to opposite tripods, deltas ${deltas[0]} vs ${deltas[1]}`);
  assert.equal(Math.sign(deltas[0]), Math.sign(deltas[3]),
    `legs 0 and 3 belong to the same tripod, deltas ${deltas[0]} vs ${deltas[3]}`);

  // Posing a non-spider must be safe.
  assert.doesNotThrow(() => poseSpiderLegs({}, 1));
  assert.doesNotThrow(() => poseSpiderLegs(null, 1));
});

test('spiders are hostile in the dark and neutral in the light', () => {
  assert.equal(SPIDER_HOSTILE_MAX_LIGHT, 11, 'wiki: hostile at light 11 or less');
  const target = { position: new THREE.Vector3(0, 1, 3), gamemode: 'survival' };

  for (const light of [0, 5, 11]) {
    const { manager } = fixture({ light });
    const spider = manager.spawnMob('spider', 0, 1, 0);
    assert.equal(spiderWantsTarget(manager, spider, target), true,
      `light ${light} is at or below the threshold, so the spider is hostile`);
  }
  for (const light of [12, 15]) {
    const { manager } = fixture({ light });
    const spider = manager.spawnMob('spider', 0, 1, 0);
    assert.equal(spiderWantsTarget(manager, spider, target), false,
      `light ${light} is above the threshold, so the spider is neutral`);
  }
});

test('an attacked spider pursues regardless of light', () => {
  const target = { position: new THREE.Vector3(0, 1, 3), gamemode: 'survival' };
  const { manager } = fixture({ light: 15 });
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.equal(spiderWantsTarget(manager, spider, target), false, 'neutral to start with');

  angerSpider(spider, target);
  assert.equal(spiderIsAngry(spider), true);
  assert.equal(spiderWantsTarget(manager, spider, target), true,
    'wiki: spiders pursue targets regardless of the light level in retaliation to an attack');

  // The anger decays.
  updateSpiderAnger(spider, SPIDER_ANGER_SECONDS + 1);
  assert.equal(spiderIsAngry(spider), false, 'anger expires');
  assert.equal(spiderWantsTarget(manager, spider, target), false, 'and it returns to neutral in light');
});

test('the damage path provokes a spider with no manual setup', () => {
  const { manager, player } = fixture({ light: 15 });
  const spider = manager.spawnMob('spider', 0, 1, 0);
  assert.equal(spider.angerTimer, 0);
  manager.damageMob(spider, 1, null, false, player);
  assert.ok(spider.angerTimer > 0, 'hitting a spider angers it, even in bright light');
  assert.equal(spider.attacker, player);
});

test('spiders see up to 16 blocks and not beyond', () => {
  assert.equal(SPIDER_SIGHT_RANGE, 16);
  const { manager } = fixture({ light: 0 });
  const spider = manager.spawnMob('spider', 0, 1, 0);
  const near = { position: new THREE.Vector3(0, 1, 15) };
  const far = { position: new THREE.Vector3(0, 1, 40) };
  assert.equal(spiderWantsTarget(manager, spider, near), true, 'inside the sight range');
  assert.equal(spiderWantsTarget(manager, spider, far), false, 'outside the sight range');
  assert.equal(spiderWantsTarget(manager, spider, null), false, 'no target');
  assert.equal(spiderWantsTarget(manager, { type: 'cow' }, near), false, 'only spiders');
});

test('the light helper prefers the world query and falls back to day/night', () => {
  const { manager } = fixture({ light: 7 });
  assert.equal(lightAt(manager, 0, 1, 0), 7, 'the world light is used when available');

  // A world with no lighting model falls back to the vanilla day cycle.
  const bare = { world: { getVoxel: () => 0 }, game: { worldTime: 6000 } };
  assert.equal(lightAt(bare, 0, 1, 0), 15, 'daytime is bright');
  bare.game.worldTime = 18000;
  assert.equal(lightAt(bare, 0, 1, 0), 0, 'night is dark');
});

test('a blocked spider climbs, and stops when the way is clear', () => {
  // Solid everywhere at the spider's body height, so a wall is always in the way.
  const { manager } = fixture({ light: 0, solid: () => true });
  const spider = manager.spawnMob('spider', 0, 2, 0);
  spider.onGround = false;
  spider.velocity.y = -3;

  assert.equal(updateSpiderClimbing(manager, spider, 0.1), true, 'it is climbing');
  assert.equal(spider.isClimbing, true);
  assert.ok(spider.velocity.y > 0, 'climbing overrides the downward velocity');
  assert.ok(spider.velocity.y >= SPIDER_CLIMB_SPEED, 'and rises at the climb speed');

  // Clear the wall.
  manager.isBlockSolid = () => false;
  assert.equal(updateSpiderClimbing(manager, spider, 0.1), false, 'no wall, no climbing');
  assert.equal(spider.isClimbing, false);
  assert.equal(spider.climbTimer, 0, 'the climb timer resets');
});

test('a grounded spider does not climb', () => {
  const { manager } = fixture({ light: 0, solid: () => true });
  const spider = manager.spawnMob('spider', 0, 1, 0);
  spider.onGround = true;
  assert.equal(updateSpiderClimbing(manager, spider, 0.1), false, 'on the ground it just walks');
});

test('the climb and anger helpers ignore non-spiders', () => {
  const { manager } = fixture();
  assert.equal(isSpider({ type: 'cow' }), false);
  assert.equal(angerSpider({ type: 'cow' }, null), false);
  assert.equal(updateSpiderClimbing(manager, { type: 'cow' }, 0.1), false);
  assert.doesNotThrow(() => updateSpiderAnger({ type: 'cow' }, 1));
  assert.deepEqual(spiderDrops({ type: 'cow' }), []);
});

test('spiders drop string, and a spider eye only with kill credit', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);

  // No credit: string only.
  assert.deepEqual(manager.getMobDeathDrops(spider, () => 0.99), [['string', false, 0, 2]],
    'wiki: spiders always drop 0-2 string');

  // Player kill: string plus a spider eye.
  const credited = manager.spawnMob('spider', 4, 1, 0);
  credited.playerDamaged = true;
  const rows = manager.getMobDeathDrops(credited, () => 0.99);
  assert.deepEqual(rows, [['string', false, 0, 2], ['spider_eye', false, 0, 1]],
    'wiki: 0-1 spider eye, requiring player or tamed-wolf credit');
});

test('spiders award the reference 5 XP for a credited kill only', () => {
  assert.equal(SPIDER_XP, 5);
  const { manager, entities, player } = fixture();
  recordDrops(entities);
  const spider = manager.spawnMob('spider', 0, 1, 0);
  spider.playerDamaged = true;
  manager.damageMob(spider, 1000, null, false, player);
  for (let i = 0; i < 12; i++) manager.update(0.1, player);
  assert.equal(xpFrom(entities), SPIDER_XP, `wiki: 5 XP, got ${xpFrom(entities)}`);

  // Environmental kill: no XP.
  const env = fixture();
  recordDrops(env.entities);
  const wild = env.manager.spawnMob('spider', 0, 1, 0);
  env.manager.damageMob(wild, 1000, null, false, null);
  for (let i = 0; i < 12; i++) env.manager.update(0.1, env.player);
  assert.equal(xpFrom(env.entities), 0, 'no XP without player or tamed-wolf credit');
});

test('spiders are arthropods and poison-immune', () => {
  const { manager } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  // Wiki: spiders are arthropods, are immune to Poison, and are unaffected by cobwebs.
  assert.equal(spider.isArthropod, true);
  assert.equal(spider.poisonImmune, true);
});

test('the Inspector can spawn the spider and it is in the debug list', () => {
  assert.ok(DEBUG_MOBS.includes('spider'), 'spider must be selectable in the Inspector');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const spider = s.reset('spider');
  assert.equal(spider.type, 'spider', 'the Inspector spawns a real spider, not a villager');
  assert.equal(s.snapshot().health, 16, 'Inspector telemetry shows 16 HP');
  assert.equal(s.snapshot().maxHealth, 16);
  assert.equal(s.snapshot().climbing, false);
  assert.equal(typeof s.snapshot().spiderAnger, 'number');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 16, 'and it survives a tick');
});

test('a spider walks and animates without breaking the update loop', () => {
  const { manager, player } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 0);
  player.position.set(8, 1, 0);
  spider.wanderGoal = new THREE.Vector3(12, 1, 0);
  spider.wanderTimer = 30;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  });
  assert.equal(spider.mesh.parent !== null, true, 'still in the scene');
  assert.ok(manager.mobs.includes(spider), 'and still alive');
  // Animation ran: the leg phase advanced.
  assert.ok((spider.spiderPhase || 0) > 0, 'the leg walk cycle advanced');
});

test('a spider actually moves, rather than only setting a velocity', () => {
  // Regression: the first spider implementation set velocity in its hunt but nothing
  // consumed it, because mob types own their locomotion in this engine. The spider stood
  // still while its velocity vector pointed at the player.
  const { manager, player } = fixture();
  const spider = manager.spawnMob('spider', 0, 1, 8);
  player.position.set(0, 1, 0);
  manager.game.worldTime = 18000; // night, so the light fallback makes it hostile
  const before = spider.mesh.position.clone();

  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  const moved = spider.mesh.position.distanceTo(before);
  assert.ok(moved > 0.5, `the spider should close on the player, moved ${moved}`);

  // And it settles on the ground rather than sinking through it.
  assert.ok(spider.mesh.position.y > 0.9, `expected to rest on the surface, y=${spider.mesh.position.y}`);
});
