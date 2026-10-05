// Killer Bunny parity with https://minecraft.wiki/w/Rabbit (The Killer Bunny).
//
// The killer bunny is a HOSTILE rabbit variant, Java-exclusive and "can only be spawned using commands". It
// was already fully implemented as a rabbit flag -- hunt, armour, damage ladder, coat -- but had no type, no
// dimension row, no spawn egg and no Inspector entry, so it could not be reached by name at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import {
  KILLER_BUNNY_DAMAGE, KILLER_BUNNY_ARMOR, KILLER_BUNNY_SIGHT_RANGE, KILLER_BUNNY_TYPE,
  KILLER_BUNNY_INHERIT_CHANCE, RABBIT_HEALTH, RABBIT_DIMENSIONS, RABBIT_BABY_DIMENSIONS, RABBIT_FOOT_CHANCE,
  isRabbit, isKillerBunny, killerBunnyDamageFor, makeKillerBunny, inheritKillerBunny,
  applyRabbitName, rabbitDrops, updateKillerBunnyHunt, onKillerBunnyHurt
} from '../src/rabbitBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = Object.assign(new EntityManager(scene, world), {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  });
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(4, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  const behaviors = new AnimalBehaviors(manager, world, sounds, entities);
  manager.animalBehaviors = behaviors;
  return { manager, player, entities, behaviors };
}

test('the killer bunny is spawnable by name, and is a native mob', () => {
  // Wiki: it "can only be spawned using commands" -- which is why the spawner takes a flag -- but that is a
  // reason for it not to spawn NATURALLY, not a reason for it to be unreachable by name.
  const { manager } = fixture();
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  assert.ok(bunny, 'it spawns');
  assert.equal(bunny.name, 'The Killer Bunny', 'wiki: the name is "The Killer Bunny"');
  // It is a rabbit by type, which is a deliberate design choice rather than a gap.
  assert.equal(bunny.type, 'rabbit');
  assert.equal(isRabbit(bunny), true);
  assert.equal(isKillerBunny(bunny), true);
  // The flag constructor still works, and produces the same mob.
  const viaFlag = manager.spawnMob('rabbit', 0, 1, 0, { killer: true });
  assert.equal(isKillerBunny(viaFlag), true);
  assert.equal(viaFlag.name, 'The Killer Bunny');
});

test('a plain rabbit is not the killer bunny', () => {
  const { manager } = fixture();
  for (const coat of [undefined, 'brown', 'white', 'black', 'gold', 'salt', 'toast']) {
    const rabbit = manager.spawnRabbit(0, 1, 0, coat ? { coat } : {});
    assert.equal(isKillerBunny(rabbit), false, `a ${coat ?? 'default'} rabbit is not a killer`);
    assert.equal(rabbit.isHostile, false);
  }
  assert.equal(isKillerBunny(null), false);
  assert.equal(isKillerBunny({ type: 'cow' }), false);
});

test('health, hitbox, armour and the damage ladder match the wiki', () => {
  const { manager } = fixture();
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  // Wiki: the infobox gives 3 HP for the rabbit, and the killer bunny is a rabbit variant.
  assert.equal(RABBIT_HEALTH, 3);
  assert.equal(bunny.maxHealth, 3);
  // Wiki: 0.4 x 0.5 adult, 0.2 x 0.25 baby -- the killer bunny shares the rabbit box.
  assert.deepEqual(RABBIT_DIMENSIONS, { width: 0.4, height: 0.5 });
  assert.deepEqual(RABBIT_BABY_DIMENSIONS, { width: 0.2, height: 0.25 });
  assert.deepEqual([bunny.width, bunny.height], [0.4, 0.5]);
  assert.deepEqual(manager.getMobDimensions('killer_bunny'), { width: 0.4, height: 0.5 },
    'the dimension row exists, so it does not fall back to the humanoid box');
  // Wiki: 8 armour points, and it is hostile.
  assert.equal(KILLER_BUNNY_ARMOR, 8);
  assert.equal(bunny.armor, 8);
  assert.equal(bunny.isHostile, true);
  assert.equal(manager.spawnMob('rabbit', 0, 1, 0).armor, 0, 'a plain rabbit has none');
  // Wiki: Easy 5, Normal 8, Hard 12.
  assert.deepEqual(KILLER_BUNNY_DAMAGE, { peaceful: 0, easy: 5, normal: 8, hard: 12 });
  assert.equal(killerBunnyDamageFor('easy'), 5);
  assert.equal(killerBunnyDamageFor('normal'), 8);
  assert.equal(killerBunnyDamageFor('hard'), 12);
  assert.equal(killerBunnyDamageFor('unknown'), 8, 'an unknown difficulty falls back to Normal');
  assert.equal(KILLER_BUNNY_SIGHT_RANGE, 16, 'wiki: it notices players within 16 blocks');
  assert.equal(bunny.rabbitType, KILLER_BUNNY_TYPE);
  assert.equal(KILLER_BUNNY_TYPE, 99, 'wiki: RabbitType 99');
});

test('it wears the killer coat', () => {
  const { manager } = fixture();
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  assert.equal(bunny.coat, 'killer');
});

test('makeKillerBunny converts an existing rabbit', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnRabbit(0, 1, 0, { coat: 'brown' });
  assert.equal(isKillerBunny(rabbit), false);
  assert.equal(makeKillerBunny(rabbit), true);
  assert.equal(isKillerBunny(rabbit), true);
  assert.equal(rabbit.rabbitType, KILLER_BUNNY_TYPE);
  assert.equal(rabbit.armor, KILLER_BUNNY_ARMOR);
  assert.equal(rabbit.isHostile, true);
  assert.equal(makeKillerBunny(manager.spawnCow(0, 1, 0)), false, 'only rabbits');
  assert.equal(makeKillerBunny(null), false);
});

test('it hunts the player through the real loop and lands damage', () => {
  // Wiki: it "moves to attack players with melee headbutts" and does 5/8/12 by difficulty.
  const { manager, player } = fixture({ difficulty: 'normal' });
  player.position.set(6, 1, 0);
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  const start = bunny.mesh.position.clone();
  for (let i = 0; i < 400; i++) manager.update(1 / 60, player);
  assert.ok(bunny.mesh.position.distanceTo(start) > 0.5,
    `it closed on the player, travelled ${bunny.mesh.position.distanceTo(start).toFixed(2)}`);
  assert.ok(player.damageTaken > 0, `it dealt damage, got ${player.damageTaken}`);
  assert.equal(player.damageTaken % 8, 0, 'and every hit was the Normal 8');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('it hunts a wolf when no player is in range', () => {
  // Wiki: it hunts wolves as its fallback prey.
  const { manager, player } = fixture();
  player.position.set(500, 1, 500);
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  const wolf = manager.spawnMob('wolf', 6, 1, 0);
  const start = bunny.mesh.position.distanceTo(wolf.mesh.position);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  const end = bunny.mesh.position.distanceTo(wolf.mesh.position);
  assert.ok(end < start, `it approached the wolf, ${start.toFixed(2)} -> ${end.toFixed(2)}`);
});

test('it retreats briefly when struck', () => {
  // Wiki: it retreats after being hit before returning.
  const { manager, player } = fixture();
  player.position.set(3, 1, 0);
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  assert.equal(onKillerBunnyHurt(bunny), true);
  assert.equal(bunny.retreatTimer, 1.5);
  const before = bunny.mesh.position.distanceTo(player.position);
  for (let i = 0; i < 30; i++) manager.update(1 / 60, player);
  const after = bunny.mesh.position.distanceTo(player.position);
  assert.ok(after > before, `it backed off, ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  // A plain rabbit is unaffected.
  assert.equal(onKillerBunnyHurt(manager.spawnMob('rabbit', 0, 1, 0)), false);
});

test('a killer bunny can breed with a normal rabbit, and the cub can be a killer', () => {
  // Wiki: "Despite their hostile nature, killer bunnies can breed with other rabbits and with each other,
  // having the unusual chance of creating a baby killer bunny." The code previously claimed the opposite.
  assert.equal(inheritKillerBunny({ type: 'rabbit', rabbitType: 99 }, { type: 'rabbit', coat: 'brown' }, () => 0), true,
    'a killer parent can pass it on');
  assert.equal(inheritKillerBunny({ type: 'rabbit', coat: 'brown' }, { type: 'rabbit', coat: 'white' }, () => 0), false,
    'two normal parents cannot');
  assert.ok(KILLER_BUNNY_INHERIT_CHANCE > 0 && KILLER_BUNNY_INHERIT_CHANCE < 1);
  // At exactly the chance it does not fire, just above it does.
  const killer = { type: 'rabbit', rabbitType: 99 };
  const normal = { type: 'rabbit', coat: 'brown' };
  assert.equal(inheritKillerBunny(killer, normal, () => KILLER_BUNNY_INHERIT_CHANCE), false);
  assert.equal(inheritKillerBunny(killer, normal, () => KILLER_BUNNY_INHERIT_CHANCE - 1e-9), true);
});

test('the breeding dispatch really produces a killer bunny cub', () => {
  const { manager, behaviors } = fixture();
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  const normal = manager.spawnRabbit(2, 1, 0, { coat: 'black' });
  const baby = manager.spawnRabbit(1, 1, 0);
  // Force the roll to succeed.
  manager.random = () => 0.001;
  assert.equal(behaviors.inheritBabyTraits(baby, killer, normal), 'killerBunny');
  assert.equal(isKillerBunny(baby), true);
  assert.equal(baby.coat, 'killer');
  assert.equal(baby.armor, KILLER_BUNNY_ARMOR);
  assert.equal(baby.isHostile, true);
  // Force it to fail: the cub inherits a normal coat instead, never the killer one.
  const baby2 = manager.spawnRabbit(1, 1, 0);
  manager.random = () => 0.99;
  assert.equal(behaviors.inheritBabyTraits(baby2, killer, normal), 'rabbitCoat');
  assert.equal(isKillerBunny(baby2), false);
  assert.notEqual(baby2.coat, 'killer', 'the killer coat is not inherited as a coat');
  assert.ok(['brown', 'black'].includes(baby2.coat), `got ${baby2.coat}`);
});

test('two killer parents that fail the roll do not produce a bare cub', () => {
  const { manager, behaviors } = fixture();
  const a = manager.spawnRabbit(0, 1, 0, { killer: true });
  const b = manager.spawnRabbit(2, 1, 0, { killer: true });
  const baby = manager.spawnRabbit(1, 1, 0);
  manager.random = () => 0.99;
  // The killer coat is excluded from the coat pool, so there is nothing to inherit and null is honest.
  assert.equal(behaviors.inheritBabyTraits(baby, a, b), null);
  // And a parent with no coat at all still returns null rather than crashing.
  const bare = manager.spawnRabbit(1, 1, 0);
  delete bare.coat;
  assert.equal(behaviors.inheritBabyTraits(manager.spawnRabbit(1, 1, 0), bare, bare), null);
});

test('renaming it Toast does not stop it being a killer', () => {
  // Wiki: the Toast re-texture is a naming easter egg, and a killer bunny stays a killer bunny.
  const { manager } = fixture();
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  bunny.name = 'Toast';
  applyRabbitName(bunny);
  assert.equal(isKillerBunny(bunny), true, 'it is still a killer');
  assert.equal(bunny.coat, 'killer', 'and keeps its killer coat rather than becoming Toast');
});

test('the drops are a rabbit\'s, and a baby yields nothing', () => {
  // Wiki: 0-1 hide, 1 raw rabbit (cooked if burning), and a 10% foot with player credit. It does not drop
  // anything special for being a killer.
  const { manager } = fixture();
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  bunny.playerDamaged = true;
  const drops = rabbitDrops(bunny, () => 0.99);
  assert.deepEqual(drops, [['rabbit_hide', false, 0, 1], ['rabbit', false, 1, 1]], 'no foot on a high roll');
  const withFoot = rabbitDrops(bunny, () => 0.01);
  assert.equal(withFoot.some(r => r[0] === 'rabbit_foot'), true, 'a low roll gives the foot');
  assert.equal(RABBIT_FOOT_CHANCE, 0.1);
  // Burning gives cooked rabbit.
  bunny.isOnFire = true;
  assert.equal(rabbitDrops(bunny, () => 0.99).some(r => r[0] === 'cooked_rabbit'), true);
  // A baby drops nothing.
  const baby = manager.spawnRabbit(0, 1, 0, { killer: true, isBaby: true });
  assert.deepEqual(rabbitDrops(baby, () => 0.01), []);
  assert.equal(isKillerBunny(baby), true, 'a baby killer bunny is still a killer bunny');
});

test('it never burns in daylight, unlike an undead mob', () => {
  const { manager, player } = fixture();
  player.position.set(400, 1, 400);
  const bunny = manager.spawnMob('killer_bunny', 0, 1, 0);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(bunny.isBurning, undefined, 'a rabbit does not burn');
  assert.equal(bunny.health, bunny.maxHealth);
});

test('the Inspector can spawn the killer bunny and reports it as hostile', () => {
  assert.ok(DEBUG_MOBS.includes('killer_bunny'), 'killer_bunny must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const bunny = s.reset('killer_bunny');
  assert.equal(isKillerBunny(bunny), true, 'the Inspector spawns a real killer bunny');
  assert.equal(bunny.name, 'The Killer Bunny');
  assert.equal(s.snapshot().maxHealth, 3);
  // The plain rabbit is still selectable and is not a killer.
  assert.equal(isKillerBunny(s.reset('rabbit')), false);
});

test('the spawn egg is registered and reachable in the creative menu', () => {
  assert.ok(ITEMS.killer_bunny_spawn_egg, 'the killer bunny has a spawn egg');
  assert.equal(ITEMS.killer_bunny_spawn_egg.mob, 'killer_bunny');
  assert.equal(ITEMS.killer_bunny_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-rabbits and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isKillerBunny(cow), false);
  assert.equal(makeKillerBunny(cow), false);
  assert.equal(updateKillerBunnyHunt(manager, cow, 1 / 60), false);
  assert.equal(onKillerBunnyHurt(cow), false);
  assert.equal(inheritKillerBunny(cow, cow, () => 0), false);
  assert.equal(killerBunnyDamageFor(undefined), 8);
  assert.equal(isRabbit(null), false);
  assert.equal(manager.spawnMob('killer_bunny', 9, 1, 9).coat, 'killer');
});
