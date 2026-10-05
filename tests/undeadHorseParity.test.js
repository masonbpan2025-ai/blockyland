// Skeleton Horse and Zombie Horse parity.
//
// References: https://minecraft.wiki/w/Skeleton_Horse · https://minecraft.wiki/w/Zombie_Horse
//
// The two are implemented and tested together because they are an undead HORSE pair sharing almost everything:
// the horse hitbox, speed 0.2, passive-alone/hostile-as-a-jockey, becoming passive once separated, and no
// breeding. They differ in health, sunlight, and the skeleton horse's trap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  UNDEAD_HORSE_HEALTH, UNDEAD_HORSE_DIMENSIONS, UNDEAD_HORSE_BABY_DIMENSIONS, UNDEAD_HORSE_BABY_SCALE,
  UNDEAD_HORSE_SPEED, SKELETON_TRAP, UNDEAD_HORSE_SUN, UNDEAD_HORSE_TRAITS, UNDEAD_HORSE_TRANSPORT,
  UNDEAD_HORSE_EQUIPMENT, UNDEAD_HORSE_COLORS,
  isUndeadHorse, isSkeletonHorse, isZombieHorse, undeadHorseHealth, undeadHorseDimensions,
  undeadHorseBurnsInDaylight, undeadHorseIsHostile, undeadHorseSeparateFromRider, equipUndeadHorse,
  shearUndeadHorse, skeletonTrapReady, springSkeletonTrap, zombieHorseWantsRider, undeadHorseCanBreed,
  undeadHorseDrops, undeadHorseEquipmentDrops, undeadHorseXp, createUndeadHorseModel, poseUndeadHorse
} from '../src/undeadHorseBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000, weatherType = 'clear' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(300, 1, 300), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime, controls: {}, weather: { weatherType }, ui: null };
  return { manager, player, entities };
}

test('both are native types, not the Villager fallback', () => {
  const { manager } = fixture();
  const skeleton = manager.spawnMob('skeleton_horse', 0, 1, 0);
  const zombie = manager.spawnMob('zombie_horse', 6, 1, 0);
  assert.equal(skeleton.type, 'skeleton_horse');
  assert.equal(skeleton.name, 'Skeleton Horse');
  assert.equal(zombie.type, 'zombie_horse');
  assert.equal(zombie.name, 'Zombie Horse');
  assert.notEqual(skeleton.type, 'villager');
  assert.notEqual(zombie.type, 'villager');
  assert.equal(isUndeadHorse(skeleton), true);
  assert.equal(isUndeadHorse(zombie), true);
  assert.equal(isSkeletonHorse(skeleton), true);
  assert.equal(isZombieHorse(zombie), true);
  assert.equal(isSkeletonHorse(zombie), false);
  assert.equal(isZombieHorse(skeleton), false);
});

test('the health, hitbox and speed match the wiki', () => {
  const { manager } = fixture();
  const skeleton = manager.spawnMob('skeleton_horse', 0, 1, 0);
  const zombie = manager.spawnMob('zombie_horse', 6, 1, 0);
  // Wiki: skeleton horse 15 HP, zombie horse 25 HP.
  assert.deepEqual(UNDEAD_HORSE_HEALTH, { skeleton_horse: 15, zombie_horse: 25 });
  assert.equal(skeleton.maxHealth, 15);
  assert.equal(zombie.maxHealth, 25);
  assert.equal(undeadHorseHealth('skeleton_horse'), 15);
  assert.equal(undeadHorseHealth('zombie_horse'), 25);
  // Wiki: both 1.3965 x 1.6, babies 0.6982 x 0.8 -- the horse box exactly.
  assert.deepEqual(UNDEAD_HORSE_DIMENSIONS, { width: 1.3965, height: 1.6 });
  assert.deepEqual(UNDEAD_HORSE_BABY_DIMENSIONS, { width: 0.6982, height: 0.8 });
  for (const horse of [skeleton, zombie]) {
    assert.deepEqual([horse.width, horse.height], [1.3965, 1.6], `${horse.type} box`);
    assert.deepEqual(manager.getMobDimensions(horse.type), { width: 1.3965, height: 1.6 });
    assert.equal(horse.speed, UNDEAD_HORSE_SPEED);
    assert.equal(horse.onGround, true, `${horse.type} has a definite groundedness`);
  }
  assert.equal(UNDEAD_HORSE_SPEED, 0.2);
  // The horse's own dimensions agree, since it is the same box.
  assert.deepEqual(manager.getMobDimensions('horse'), { width: 1.4, height: 1.6 },
    'the living horse states 1.4, and the undead pair 1.3965 -- both are the wiki\'s numbers');
});

test('a baby is half size with its own hitbox', () => {
  const { manager } = fixture();
  for (const type of ['skeleton_horse', 'zombie_horse']) {
    const baby = manager.spawnMob(type, 0, 1, 0, { isBaby: true });
    assert.equal(baby.isBaby, true);
    assert.deepEqual([baby.width, baby.height], [0.6982, 0.8], `${type} baby box`);
    assert.equal(baby.mesh.scale.x, UNDEAD_HORSE_BABY_SCALE);
    assert.deepEqual(undeadHorseDimensions(type, { isBaby: true }), UNDEAD_HORSE_BABY_DIMENSIONS);
  }
  assert.deepEqual(undeadHorseDimensions('skeleton_horse'), UNDEAD_HORSE_DIMENSIONS);
  assert.equal(undeadHorseDimensions('cow'), null);
});

test('both are undead and share the undead traits', () => {
  const { manager } = fixture();
  for (const type of ['skeleton_horse', 'zombie_horse']) {
    const horse = manager.spawnMob(type, 0, 1, 0);
    for (const [key, value] of Object.entries(UNDEAD_HORSE_TRAITS)) {
      assert.equal(horse[key], value, `${type}: ${key}`);
    }
  }
  assert.equal(UNDEAD_HORSE_TRAITS.canBreatheUnderwater, true, 'wiki: undead mobs breathe underwater');
  assert.equal(UNDEAD_HORSE_TRAITS.sensitiveToSmite, true, 'and are hurt more by Smite');
});

test('the skeleton horse does NOT burn in sunlight, and the zombie horse does', () => {
  // Wiki: the skeleton horse "do[es] not burn under direct sunlight", called out as unlike most undead mobs.
  // The zombie horse's page grants no such exemption, so this is a real difference between the pair.
  assert.deepEqual(UNDEAD_HORSE_SUN, { skeleton_horse: false, zombie_horse: true });
  assert.equal(undeadHorseBurnsInDaylight('skeleton_horse'), false);
  assert.equal(undeadHorseBurnsInDaylight('zombie_horse'), true);
  assert.equal(undeadHorseBurnsInDaylight('cow'), false, 'an unknown type is not in the table');

  const { manager } = fixture({ worldTime: 6000 });
  const skeleton = manager.spawnMob('skeleton_horse', 0, 1, 0);
  const zombie = manager.spawnMob('zombie_horse', 20, 1, 0);
  assert.equal(skeleton.burnsInDaylight, false);
  assert.equal(zombie.burnsInDaylight, true);
});

test('both are passive alone and hostile only as a jockey', () => {
  // Wiki: "Passive by itself, but hostile as a jockey, as the rider controls its pathfinding."
  const { manager } = fixture();
  const zombie = manager.spawnMob('zombie_horse', 0, 1, 0);
  assert.equal(zombie.isHostile, false, 'passive alone');
  assert.equal(undeadHorseIsHostile(zombie), false);
  zombie.rider = { type: 'zombie' };
  assert.equal(undeadHorseIsHostile(zombie), true, 'hostile as a jockey');
  assert.equal(undeadHorseIsHostile(manager.spawnCow(0, 1, 0)), false);
});

test('it becomes passive once separated, and can then be saddled', () => {
  // Wiki: it "becomes passive once separated from its skeleton/zombie rider, allowing it to be tamed and
  // ridden".
  const { manager } = fixture();
  const zombie = manager.spawnMob('zombie_horse', 0, 1, 0);
  zombie.rider = { type: 'zombie' };
  zombie.riderCount = 1;
  const rider = undeadHorseSeparateFromRider(zombie);
  assert.ok(rider, 'the rider was returned');
  assert.equal(zombie.rider, null);
  assert.equal(zombie.riderCount, 0);
  assert.equal(zombie.tame, true, 'wiki: it can then be tamed');
  assert.equal(undeadHorseIsHostile(zombie), false, 'and is passive again');
  assert.equal(undeadHorseSeparateFromRider(manager.spawnCow(0, 1, 0)), null);
});

test('the equipment rules differ between the two, as the wiki says', () => {
  // Wiki: both take a saddle; the zombie horse also takes horse armour, and the skeleton horse does not.
  assert.deepEqual(UNDEAD_HORSE_EQUIPMENT.skeleton_horse, { saddle: true, armor: false, remover: 'shears' });
  assert.deepEqual(UNDEAD_HORSE_EQUIPMENT.zombie_horse, { saddle: true, armor: true, remover: 'shears' });
  const { manager } = fixture();
  const skull = manager.spawnMob('zombie_horse', 0, 1, 0);
  assert.equal(equipUndeadHorse(skull, 'saddle'), true);
  assert.equal(skull.hasSaddle, true);
  assert.equal(equipUndeadHorse(skull, 'saddle'), false, 'already saddled');
  assert.equal(equipUndeadHorse(skull, 'iron_horse_armor'), true, 'the zombie horse takes armour');
  assert.equal(skull.horseArmor, 'iron_horse_armor');
  // Shears remove the armour first, then the saddle.
  assert.equal(shearUndeadHorse(skull, 'shears'), 'iron_horse_armor');
  assert.equal(skull.horseArmor, null);
  assert.equal(shearUndeadHorse(skull, 'shears'), 'saddle');
  assert.equal(skull.hasSaddle, false);
  assert.equal(shearUndeadHorse(skull, 'shears'), null, 'nothing left');
  assert.equal(shearUndeadHorse(skull, 'sword'), null, 'only shears work');
  assert.equal(equipUndeadHorse(skull, 'wheat'), false, 'and only gear fits');

  // The skeleton horse is spawned saddled as a trap, and cannot take armour.
  const boney = manager.spawnMob('skeleton_horse', 0, 1, 0);
  assert.equal(boney.hasSaddle, true, 'the trap horse arrives saddled');
  assert.equal(equipUndeadHorse(boney, 'iron_horse_armor'), false, 'wiki: no horse armour on a skeleton horse');
  assert.equal(boney.horseArmor, null);
  // A non-trap skeleton horse is unsaddled and can be saddled.
  const plain = manager.spawnMob('skeleton_horse', 0, 1, 0, { isTrap: false });
  assert.equal(plain.hasSaddle, false);
  assert.equal(equipUndeadHorse(plain, 'saddle'), true);
});

test('the skeleton trap springs into four skeleton horsemen, in a thunderstorm, when approached', () => {
  // Wiki: it "sometimes spawns from lightning strikes during thunderstorms, as a skeleton trap. When this
  // trap is approached, it transforms into four skeleton horsemen."
  assert.deepEqual(SKELETON_TRAP, { riders: 4, requiresThunder: true, triggerRange: 10 });
  const { manager } = fixture({ weatherType: 'thunder' });
  const trap = manager.spawnMob('skeleton_horse', 0, 1, 0, { isTrap: true });
  assert.equal(trap.isTrap, true);
  // Not during clear weather.
  assert.equal(skeletonTrapReady(trap, { weatherType: 'clear', distanceToPlayer: 2 }), false);
  // Not during plain rain either -- it needs a thunderstorm.
  assert.equal(skeletonTrapReady(trap, { weatherType: 'rain', distanceToPlayer: 2 }), false);
  // Not from far away.
  assert.equal(skeletonTrapReady(trap, { weatherType: 'thunder', distanceToPlayer: 40 }), false);
  // But yes when approached in a thunderstorm.
  assert.equal(skeletonTrapReady(trap, { weatherType: 'thunder', distanceToPlayer: 5 }), true);
  // A zombie horse is never a trap.
  assert.equal(skeletonTrapReady(manager.spawnMob('zombie_horse', 0, 1, 0), { weatherType: 'thunder', distanceToPlayer: 1 }), false);

  const riders = springSkeletonTrap(manager, trap, () => 0);
  assert.equal(riders.length, SKELETON_TRAP.riders, 'four horsemen');
  assert.equal(trap.isTrap, false, 'the trap is spent');
  for (const rider of riders) {
    assert.equal(rider.type, 'skeleton', 'each is a skeleton');
    assert.ok(rider.mount, 'and is mounted');
    assert.equal(rider.enchanted, true, 'wiki: with an enchanted bow and an enchanted iron helmet');
  }
  // The trap cannot spring twice.
  assert.deepEqual(springSkeletonTrap(manager, trap, () => 0), []);
  assert.deepEqual(springSkeletonTrap(manager, manager.spawnMob('zombie_horse', 0, 1, 0), () => 0), []);
});

test('the trap springs through the real update loop', () => {
  const { manager, player } = fixture({ weatherType: 'thunder' });
  player.position.set(3, 1, 0);
  const trap = manager.spawnMob('skeleton_horse', 0, 1, 0, { isTrap: true });
  for (let i = 0; i < 10; i++) manager.update(1 / 60, player);
  assert.equal(trap.isTrap, false, 'it sprang');
  const skeletons = manager.mobs.filter(m => m.type === 'skeleton');
  assert.equal(skeletons.length, 4, `four skeletons appeared, got ${skeletons.length}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  // In clear weather it does not spring.
  const clear = fixture({ weatherType: 'clear' });
  clear.player.position.set(3, 1, 0);
  const held = clear.manager.spawnMob('skeleton_horse', 0, 1, 0, { isTrap: true });
  for (let i = 0; i < 10; i++) clear.manager.update(1 / 60, clear.player);
  assert.equal(held.isTrap, true, 'it stays a trap in clear weather');
});

test('a zombie horse wants a rider in the dark, not in daylight', () => {
  // Wiki: it "rarely spawns in dark areas as a hostile mob being ridden and controlled by a zombie horseman".
  const { manager } = fixture();
  const horse = manager.spawnMob('zombie_horse', 0, 1, 0);
  assert.equal(zombieHorseWantsRider(horse, { lightLevel: 15, night: false }), false, 'daylight, no rider');
  assert.equal(zombieHorseWantsRider(horse, { lightLevel: 4, night: false }), true, 'dark');
  assert.equal(zombieHorseWantsRider(horse, { lightLevel: 15, night: true }), true, 'night');
  // Already ridden: no second rider.
  horse.rider = { type: 'zombie' };
  assert.equal(zombieHorseWantsRider(horse, { lightLevel: 0, night: true }), false);
  assert.equal(zombieHorseWantsRider(manager.spawnMob('skeleton_horse', 0, 1, 0), { night: true }), false);
});

test('the rider is opt-in, so a dispatched horse does not mount one and freeze', () => {
  // REGRESSION. This started automatic: a zombie horse from the generic dispatcher acquired a rider on its
  // first frame, became 'ridden', and therefore never moved. The shared frozen-mob guard caught it as
  // "zombie_horse (moved 0.020)". The rider is now a spawn-time option, which is what the wiki describes.
  const { manager, player } = fixture({ worldTime: 18000 });
  player.position.set(300, 1, 300);
  const plain = manager.spawnMob('zombie_horse', 0, 1, 0);
  assert.equal(plain.wantsRider, false, 'the dispatcher does not ask for a rider');
  const start = plain.mesh.position.clone();
  for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  assert.equal(plain.rider, null, 'no rider appeared');
  assert.equal(plain.state !== 'ridden', true, 'and it is not stuck in the ridden state');
  assert.ok(plain.mesh.position.distanceTo(start) > 0.25,
    `it moved, travelled ${plain.mesh.position.distanceTo(start).toFixed(3)}`);
  // Opting in does mount one.
  const dark = fixture({ worldTime: 18000 });
  dark.player.position.set(300, 1, 300);
  const mounted = dark.manager.spawnMob('zombie_horse', 0, 1, 0, { wantsRider: true });
  dark.manager.update(1 / 60, dark.player);
  assert.ok(mounted.rider, 'a zombie horseman appeared when asked for');
  assert.equal(mounted.rider.type, 'zombie');
});

test('neither can be bred', () => {
  // Wiki: neither page gives a breeding route, and the zombie horse is created rather than bred.
  assert.equal(undeadHorseCanBreed(), false);
  const { manager } = fixture();
  assert.equal(manager.spawnMob('skeleton_horse', 0, 1, 0).canBreed, false);
  assert.equal(manager.spawnMob('zombie_horse', 0, 1, 0).canBreed, false);
});

test('the death drops match the wiki, and a baby yields nothing', () => {
  // Wiki: the skeleton horse drops 0-2 bones and the zombie horse 2-3 rotten flesh, plus a saddle (and for the
  // zombie horse its horse armour) when equipped, and 1-3 XP with player credit.
  //
  // I first asserted these dropped NOTHING on the assumption the pages gave no drops. They do, and the
  // zombie horse's base row was also 0-2 rather than 2-3, which is a real error this test found. The assertion
  // now also pins the base table and the module's helper AGAINST EACH OTHER, which is what caught it.
  const { manager, entities } = fixture();
  const skeleton = manager.spawnMob('skeleton_horse', 0, 1, 0);
  const zombie = manager.spawnMob('zombie_horse', 6, 1, 0);
  skeleton.playerDamaged = true;
  zombie.playerDamaged = true;
  assert.deepEqual(undeadHorseDrops(skeleton), [['bone', false, 0, 2]]);
  assert.deepEqual(undeadHorseDrops(zombie), [['rotten_flesh', false, 2, 3]]);
  assert.deepEqual(manager.getMobDeathDrops(skeleton, () => 0.5), undeadHorseDrops(skeleton),
    'the base table and the helper agree for the skeleton horse');
  assert.deepEqual(manager.getMobDeathDrops(zombie, () => 0.5), undeadHorseDrops(zombie),
    'and for the zombie horse');

  // Equipped gear is dropped as well as being shearable.
  skeleton.hasSaddle = true;
  zombie.horseArmor = 'iron_horse_armor';
  assert.deepEqual(undeadHorseEquipmentDrops(skeleton), [['saddle', false, 1, 1]]);
  assert.deepEqual(undeadHorseEquipmentDrops(zombie), [['iron_horse_armor', false, 1, 1]]);

  // XP is 1-3 with credit, and none without.
  for (const horse of [skeleton, zombie]) {
    const values = new Set();
    for (let i = 0; i < 30; i++) values.add(undeadHorseXp(horse));
    assert.equal([...values].every(v => v >= 1 && v <= 3), true, `1-3 XP, got ${[...values].join(',')}`);
    assert.ok(values.size > 1, 'the roll varies');
  }
  assert.equal(undeadHorseXp({ type: 'skeleton_horse' }, () => 0.5) >= 1, true);

  // Wiki: "Killing a baby skeleton horse yields no items or experience", and the same on the zombie page.
  // The suppression lives in the manager's drop entry point rather than in the loot table, so the drop path
  // is what proves it -- and the helper reports nothing for a baby either.
  const baby = manager.spawnMob('skeleton_horse', 20, 1, 0, { isBaby: true });
  baby.playerDamaged = true;
  assert.deepEqual(undeadHorseDrops(baby), [], 'the helper reports nothing for a baby');
  assert.equal(undeadHorseXp(baby), 0, 'and no experience');
  entities.droppedItems.length = 0;
  manager.updateDeath(baby, 1 / 60);
  assert.deepEqual(entities.droppedItems, [], 'and the drop path drops nothing for a baby');

  assert.deepEqual(undeadHorseDrops(manager.spawnCow(0, 1, 0)), []);
  assert.equal(undeadHorseXp(manager.spawnCow(0, 1, 0)), 0);
  assert.deepEqual(undeadHorseEquipmentDrops(manager.spawnCow(0, 1, 0)), []);
});

test('both walk through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  const horses = [
    manager.spawnMob('skeleton_horse', 0, 1, 0),
    manager.spawnMob('zombie_horse', 20, 1, 0)
  ];
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  for (const horse of horses) {
    assert.ok(manager.mobs.includes(horse), `${horse.type} is still alive`);
    assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  }
});

test('the model is a horse silhouette in the right materials, with a saddle overlay', () => {
  const { manager } = fixture();
  const skeleton = manager.spawnMob('skeleton_horse', 0, 1, 0);
  const zombie = manager.spawnMob('zombie_horse', 6, 1, 0);
  for (const horse of [skeleton, zombie]) {
    assert.ok(horse.body && horse.neck && horse.head && horse.mane, `${horse.type} is a horse`);
    assert.equal(horse.legs.length, 4, 'four legs');
    assert.equal(horse.eyes.length, 2);
    assert.ok(horse.tail);
    assert.ok(horse.saddle, 'a saddle overlay');
  }
  // The two are differently coloured, which is the only visual difference the wiki gives.
  assert.notEqual(UNDEAD_HORSE_COLORS.skeleton_horse.coat, UNDEAD_HORSE_COLORS.zombie_horse.coat);
  assert.ok(UNDEAD_HORSE_COLORS.skeleton_horse.coat > UNDEAD_HORSE_COLORS.zombie_horse.coat, 'bone is paler than rot');
  const model = createUndeadHorseModel('skeleton_horse',
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(), new THREE.MeshLambertMaterial());
  assert.ok(model.group && model.saddle && model.mane);
});

test('the saddle overlay tracks the equipped flag', () => {
  const { manager } = fixture();
  const horse = manager.spawnMob('zombie_horse', 0, 1, 0);
  poseUndeadHorse(horse, 0);
  assert.equal(horse.saddle.visible, false, 'hidden when unsaddled');
  equipUndeadHorse(horse, 'saddle');
  poseUndeadHorse(horse, 0);
  assert.equal(horse.saddle.visible, true, 'shown when saddled');
  // The undead head droop, which is what distinguishes the pose from a living horse.
  assert.ok(horse.head.rotation.x > 0.1, 'the head sits low');
  assert.doesNotThrow(() => poseUndeadHorse(null));
  assert.doesNotThrow(() => poseUndeadHorse({}));
});

test('the Inspector can spawn both horses', () => {
  for (const type of ['skeleton_horse', 'zombie_horse']) {
    assert.ok(DEBUG_MOBS.includes(type), `${type} must be selectable`);
  }
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  assert.equal(s.reset('skeleton_horse').type, 'skeleton_horse');
  assert.equal(s.snapshot().maxHealth, 15, 'Inspector telemetry shows 15 HP');
  assert.equal(s.reset('zombie_horse').type, 'zombie_horse');
  assert.equal(s.snapshot().maxHealth, 25, 'and 25 for the zombie horse');
});

test('both spawn eggs are registered', () => {
  for (const type of ['skeleton_horse', 'zombie_horse']) {
    const egg = ITEMS[`${type}_spawn_egg`];
    assert.ok(egg, `${type} has a spawn egg`);
    assert.equal(egg.mob, type);
    assert.equal(egg.type, 'spawn_egg');
  }
});

test('the helpers are safe on non-horses and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isUndeadHorse(cow), false);
  assert.equal(isSkeletonHorse(cow), false);
  assert.equal(isZombieHorse(cow), false);
  assert.equal(undeadHorseBurnsInDaylight(cow), false);
  assert.equal(undeadHorseIsHostile(cow), false);
  assert.equal(undeadHorseSeparateFromRider(cow), null);
  assert.equal(equipUndeadHorse(cow, 'saddle'), false);
  assert.equal(shearUndeadHorse(cow, 'shears'), null);
  assert.equal(skeletonTrapReady(cow, { weatherType: 'thunder', distanceToPlayer: 1 }), false);
  assert.deepEqual(springSkeletonTrap(manager, cow), []);
  assert.equal(zombieHorseWantsRider(cow, { night: true }), false);
  assert.deepEqual(undeadHorseDrops(cow), []);
  assert.equal(undeadHorseXp(cow), 0);
  // A string argument works, since the predicates accept either.
  assert.equal(isUndeadHorse('skeleton_horse'), true);
  assert.equal(isUndeadHorse('cow'), false);
  assert.equal(isUndeadHorse(null), false);
  assert.equal(undeadHorseHealth('cow'), UNDEAD_HORSE_HEALTH.skeleton_horse, 'a fallback rather than a crash');
  assert.doesNotThrow(() => poseUndeadHorse(null));
  assert.equal(manager.spawnMob('skeleton_horse', 9, 1, 9).type, 'skeleton_horse');
  assert.equal(manager.spawnMob('zombie_horse', 9, 1, 9).type, 'zombie_horse');
});
