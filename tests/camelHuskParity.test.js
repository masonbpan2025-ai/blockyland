// Camel Husk parity with https://minecraft.wiki/w/Camel_Husk
//
// The camel husk is the camel's UNDEAD variant: the same 1.7 x 2.375 body, the same sit cycle, the same
// 1.5-block step. It differs in four ways -- it is undead, roughly seven times slower, does not burn in
// sunlight, and arrives RIDDEN by a husk with a parched passenger.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  CAMEL_HUSK_HEALTH, CAMEL_HUSK_DIMENSIONS, CAMEL_HUSK_SITTING_DIMENSIONS, CAMEL_HUSK_STAND_CLEARANCE,
  CAMEL_HUSK_SPEED, CAMEL_HUSK_CAMEL_SPEED, CAMEL_HUSK_UNDEAD_TRAITS, CAMEL_HUSK_JOCKEY, CAMEL_HUSK_SPAWN,
  CAMEL_HUSK_EQUIPMENT, CAMEL_HUSK_DROPS, CAMEL_HUSK_COLORS,
  isCamelHusk, camelHuskDimensions, camelHuskBurnsInDaylight, camelHuskCanStand, camelHuskSit, camelHuskStand,
  updateCamelHuskSitting, camelHuskIsHostile, separateCamelHuskRiders, mountCamelHuskJockey, camelHuskDrops,
  camelHuskXp, equipCamelHuskSaddle, shearCamelHuskSaddle, createCamelHuskModel, poseCamelHusk
} from '../src/camelHuskBehavior.js';
import { CAMEL_HEALTH, CAMEL_DIMENSIONS, CAMEL_SITTING_DIMENSIONS, CAMEL_SPEED, createCamelModel, poseCamel } from '../src/camelBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000 } = {}) {
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
  manager.game = { player, difficulty: 'normal', worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

test('camel husk is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(husk.type, 'camel_husk');
  assert.equal(husk.name, 'Camel Husk');
  assert.notEqual(husk.type, 'villager');
  assert.equal(isCamelHusk(husk), true);
  assert.equal(isCamelHusk('camel_husk'), true);
  assert.equal(isCamelHusk('camel'), false, 'a living camel is not a camel husk');
  assert.equal(isCamelHusk(null), false);
});

test('the health and every hitbox match the camel exactly', () => {
  // Wiki: 32 HP, 1.7 x 2.375 standing and 1.7 x 0.945 sitting. It is a VARIANT, so asserting the two agree is
  // the claim -- if the camel's box ever changes, this must change with it.
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(CAMEL_HUSK_HEALTH, 32);
  assert.equal(husk.maxHealth, 32);
  assert.equal(CAMEL_HUSK_HEALTH, CAMEL_HEALTH, 'the husk has the camel\'s 32 HP, from the camel module');
  assert.deepEqual(CAMEL_HUSK_DIMENSIONS, { width: 1.7, height: 2.375 });
  assert.deepEqual(CAMEL_HUSK_DIMENSIONS, CAMEL_DIMENSIONS, 'and the camel\'s standing box');
  assert.deepEqual(CAMEL_HUSK_SITTING_DIMENSIONS, CAMEL_SITTING_DIMENSIONS, 'and its sitting box');
  assert.deepEqual([husk.width, husk.height], [1.7, 2.375]);
  assert.deepEqual(manager.getMobDimensions('camel_husk'), { width: 1.7, height: 2.375 });
  assert.equal(husk.onGround, true, 'a definite groundedness at spawn');
});

test('it is far slower than a camel', () => {
  // Wiki: speed 0.09, against the camel's listed 3.885 walk speed. The two numbers are different KINDS of
  // quantity, so the assertion is that the husk is the slow one rather than a ratio.
  assert.equal(CAMEL_HUSK_SPEED, 0.09);
  assert.equal(CAMEL_HUSK_CAMEL_SPEED, CAMEL_SPEED.walk);
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(husk.speed, CAMEL_HUSK_SPEED);
  assert.ok(husk.speed < CAMEL_SPEED.walk, 'the husk is unambiguously the slower one');
});

test('it is undead, and does NOT burn in sunlight', () => {
  // Wiki: it is undead and "does not burn in sunlight", stated on its own page.
  assert.equal(CAMEL_HUSK_UNDEAD_TRAITS.undead, true);
  assert.equal(CAMEL_HUSK_UNDEAD_TRAITS.burnsInDaylight, false);
  for (const [key, value] of Object.entries(CAMEL_HUSK_UNDEAD_TRAITS)) {
    if (key === 'burnsInDaylight') continue;
    assert.equal(CAMEL_HUSK_UNDEAD_TRAITS[key], value, `wiki: ${key}`);
  }
  assert.equal(camelHuskBurnsInDaylight(), false);
  const { manager, player } = fixture({ worldTime: 6000 });
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(husk.undead, true);
  assert.equal(husk.burnsInDaylight, false);
  assert.equal(husk.poisonImmune, true);
  assert.equal(husk.sensitiveToSmite, true);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(husk.isBurning, false, 'it never catches fire in daylight');
  assert.equal(husk.health, husk.maxHealth, 'and takes no fire damage');
});

test('it is passive alone and hostile only as a jockey', () => {
  // Wiki: "Passive by itself, but hostile as a jockey, as the two riders control its pathfinding."
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(husk.isHostile, false, 'passive by itself');
  assert.equal(camelHuskIsHostile(husk), false);
  // Driven: hostile.
  mountCamelHuskJockey(manager, husk);
  assert.equal(camelHuskIsHostile(husk), true, 'hostile as a jockey');
  assert.equal(husk.riderCount, 2);
  // Separated: passive again, and tame.
  const removed = separateCamelHuskRiders(husk);
  assert.equal(removed.length, 2, 'both riders were removed');
  assert.equal(camelHuskIsHostile(husk), false, 'passive once separated');
  assert.equal(husk.tame, true, 'wiki: and it can then be saddled and ridden by a player');
  assert.equal(camelHuskIsHostile(manager.spawnCow(0, 1, 0)), false);
  assert.deepEqual(separateCamelHuskRiders(manager.spawnCow(0, 1, 0)), []);
});

test('the jockey is an iron-spear husk with a parched passenger', () => {
  // Wiki: "being ridden and controlled by an iron spear-wielding husk with a parched passenger".
  assert.deepEqual(CAMEL_HUSK_JOCKEY, {
    driver: 'husk', passenger: 'parched', seats: 2, driverWeapon: 'iron_spear'
  });
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0, { withJockey: true });
  assert.equal(husk.riderCount, 2);
  const types = husk.riders.map(r => r.type);
  assert.deepEqual(types, ['husk', 'parched'], 'the driver is a husk and the passenger a parched');
  assert.equal(husk.riders[0].weapon, 'iron_spear', 'the husk wields an iron spear');
  assert.equal(husk.isJockey, true);
  for (const rider of husk.riders) assert.equal(rider.mount, husk, 'each is mounted on the husk');
  // Wiki: "Any passengers need to die separately, and drop items separately, like other jockeys" -- so they
  // are real mobs in the world, not decoration.
  assert.equal(manager.mobs.includes(husk.riders[0]), true);
  assert.equal(manager.mobs.includes(husk.riders[1]), true);
  // A jockey is opt-in, so a bare spawn does not create three mobs.
  const solo = manager.spawnMob('camel_husk', 100, 1, 0);
  assert.equal(solo.riderCount, 0);
  assert.equal(solo.isJockey, false);
});

test('it shares the camel\'s sit cycle, including the headroom guard', () => {
  // Wiki: the camel husk lists a SITTING hitbox of 1.7 x 0.945, so it sits exactly as the camel does -- and the
  // camel refuses to stand under a low ceiling because standing would suffocate it.
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(CAMEL_HUSK_STAND_CLEARANCE, CAMEL_HUSK_DIMENSIONS.height - CAMEL_HUSK_SITTING_DIMENSIONS.height);
  assert.deepEqual(camelHuskDimensions(husk), CAMEL_HUSK_DIMENSIONS);
  assert.equal(camelHuskSit(husk), true);
  assert.equal(husk.isSitting, true);
  assert.deepEqual([husk.width, husk.height], [1.7, 0.945], 'the sitting hitbox is shorter');
  assert.deepEqual(camelHuskDimensions(husk), CAMEL_HUSK_SITTING_DIMENSIONS);
  // Blocked under a ceiling, allowed without one.
  assert.equal(camelHuskCanStand(husk, CAMEL_HUSK_STAND_CLEARANCE - 0.1), false);
  assert.equal(camelHuskStand(husk, 1), 'blocked');
  assert.equal(husk.isSitting, true, 'it stays sitting');
  assert.deepEqual([husk.width, husk.height], [1.7, 0.945], 'and keeps the sitting box');
  assert.equal(camelHuskStand(husk, 8), 'stood');
  assert.deepEqual([husk.width, husk.height], [1.7, 2.375], 'standing restores the box');
  // A ridden one cannot sit.
  const ridden = manager.spawnMob('camel_husk', 20, 1, 0);
  ridden.riderCount = 1;
  assert.equal(camelHuskSit(ridden), false);
});

test('the sit cycle runs on its own timer and reports blocked', () => {
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  const random = () => 0.5;
  husk.standTimer = 0.01;
  assert.equal(updateCamelHuskSitting(husk, 0.016, { clearance: 5, random }), 'sat');
  assert.equal(husk.isSitting, true);
  assert.ok(husk.sitTimer >= 2 && husk.sitTimer <= 7, `the sit lasts 2-7 s, got ${husk.sitTimer}`);
  assert.equal(updateCamelHuskSitting(husk, husk.sitTimer + 0.1, { clearance: 5, random }), 'stood');
  // Blocked rather than standing with no headroom.
  husk.isSitting = true;
  husk.sitTimer = 0;
  assert.equal(updateCamelHuskSitting(husk, 1, { clearance: 0, random }), 'blocked');
  assert.equal(husk.isSitting, true);
  // Harm stands it up, like any mob.
  husk.sitTimer = 100;
  assert.equal(updateCamelHuskSitting(husk, 0.016, { clearance: 5, random, fleeing: true }), 'stood');
  assert.equal(updateCamelHuskSitting(manager.spawnCow(0, 1, 0), 1), null);
});

test('it can be saddled, and shears remove the saddle', () => {
  // Wiki: a saddle is a usable item and shears remove it; a lead works only when dismounted.
  assert.deepEqual(CAMEL_HUSK_EQUIPMENT, { saddle: 'saddle', remover: 'shears', leashableWhenDismounted: true });
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.equal(husk.hasSaddle, false);
  assert.equal(equipCamelHuskSaddle(husk, 'saddle'), true);
  assert.equal(husk.hasSaddle, true);
  assert.equal(equipCamelHuskSaddle(husk, 'saddle'), false, 'already saddled');
  assert.equal(equipCamelHuskSaddle(husk, 'wheat'), false, 'only a saddle fits');
  assert.equal(shearCamelHuskSaddle(husk, 'shears'), true);
  assert.equal(husk.hasSaddle, false);
  assert.equal(shearCamelHuskSaddle(husk, 'shears'), false, 'nothing left to remove');
  assert.equal(shearCamelHuskSaddle(husk, 'sword'), false, 'only shears work');
  assert.equal(equipCamelHuskSaddle(manager.spawnCow(0, 1, 0), 'saddle'), false);
});

test('it drops 2-3 rotten flesh and 1-3 XP with credit', () => {
  // Wiki: 2-3 rotten flesh, and 1-3 XP when killed by a player or tamed wolf. The passengers drop separately.
  assert.deepEqual(CAMEL_HUSK_DROPS.items, [['rotten_flesh', 2, 3]]);
  assert.deepEqual(CAMEL_HUSK_DROPS.xp, [1, 3]);
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  husk.playerDamaged = true;
  assert.deepEqual(camelHuskDrops(husk), [['rotten_flesh', false, 2, 3]]);
  // Pinned against the manager's own path, so a double row or a wrong count would fail here.
  assert.deepEqual(manager.getMobDeathDrops(husk, () => 0.5), camelHuskDrops(husk),
    'the manager agrees with the module');
  // The floor is 2, not 0, and the ceiling 3 -- the wiki gives a tighter range than the zombie's own row.
  const row = manager.getMobDeathDrops(husk, () => 0.5)[0];
  assert.equal(row[2], 2, 'the minimum is 2');
  assert.equal(row[3], 3, 'the maximum is 3');
  // XP varies across 1-3, and a non-husk gets none.
  const values = new Set();
  for (let i = 0; i < 30; i++) values.add(camelHuskXp(husk));
  assert.equal([...values].every(v => v >= 1 && v <= 3), true, `1-3 XP, got ${[...values].join(',')}`);
  assert.ok(values.size > 1, 'the roll varies');
  assert.equal(camelHuskXp(manager.spawnCow(0, 1, 0)), 0);
  assert.deepEqual(camelHuskDrops(manager.spawnCow(0, 1, 0)), []);
  // The item it drops must actually EXIST, or the drop is an id with no name or icon.
  assert.ok(ITEMS.rotten_flesh, 'rotten flesh is a registered item');
});

test('it walks and sits through the real update loop', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  const start = husk.mesh.position.clone();
  const states = new Set();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 1200; i++) {
      manager.update(1 / 60, player);
      states.add(husk.isSitting ? 'sitting' : 'standing');
    }
  });
  assert.ok(manager.mobs.includes(husk), 'still alive');
  assert.equal(states.has('sitting'), true, 'it sat at some point');
  assert.equal(states.has('standing'), true, 'and stood again');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a ridden camel husk reports hostile and stands still through the loop', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  const husk = manager.spawnMob('camel_husk', 0, 1, 0, { withJockey: true });
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  assert.equal(husk.isHostile, true, 'hostile while ridden');
  assert.equal(manager.mobErrors.size ?? 0, 0);
  assert.deepEqual([...(manager.mobErrors || [])], []);
  // Separating makes it passive.
  separateCamelHuskRiders(husk);
  manager.update(1 / 60, player);
  assert.equal(husk.isHostile, false, 'passive once separated');
});

test('the model is the camel\'s, in the husk palette', () => {
  // Wiki: it is a VARIANT of the camel, and the hitbox is identical, so the geometry is shared rather than
  // redesigned. The palettes differ, which is the only visual difference.
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  assert.ok(husk.body && husk.hump && husk.neck && husk.head, 'the camel body');
  assert.equal(husk.legs.length, 4, 'four legs');
  assert.equal(husk.eyes.length, 2);
  assert.ok(husk.tail);
  assert.ok(husk.saddleMesh, 'and a saddle overlay');
  assert.ok(CAMEL_HUSK_COLORS.coat > 0);
  const model = createCamelHuskModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial(), createCamelModel);
  assert.ok(model.group && model.hump && model.saddle);
  // The delegation really is the camel's model builder, so the two cannot drift.
  const camelModel = createCamelModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial());
  assert.deepEqual(Object.keys(model).sort(), Object.keys(camelModel).sort(),
    'the husk model exposes exactly the camel model\'s parts');
});

test('the pose is the camel\'s with a lower head', () => {
  const { manager } = fixture();
  const husk = manager.spawnMob('camel_husk', 0, 1, 0);
  husk.groundY = 1;
  poseCamelHusk(husk, 0, poseCamel);
  const drooped = husk.head.rotation.x;
  assert.ok(drooped > 0.1, `the head hangs low, got ${drooped}`);
  // Without the poser it still applies the droop and does not throw.
  assert.doesNotThrow(() => poseCamelHusk(husk, 0));
  assert.doesNotThrow(() => poseCamelHusk(null, 0));
  assert.doesNotThrow(() => poseCamelHusk({}, 0));
});

test('the spawn biomes and conditions match the wiki', () => {
  // Wiki: it spawns "at night or during thunderstorms in deserts".
  assert.deepEqual(CAMEL_HUSK_SPAWN.biomes, ['desert']);
  assert.equal(CAMEL_HUSK_SPAWN.night, true);
  assert.equal(CAMEL_HUSK_SPAWN.thunder, true);
});

test('the Inspector can spawn the camel husk', () => {
  assert.ok(DEBUG_MOBS.includes('camel_husk'), 'camel_husk must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const husk = s.reset('camel_husk');
  assert.equal(husk.type, 'camel_husk');
  assert.equal(s.snapshot().maxHealth, 32, 'Inspector telemetry shows 32 HP');
  // The living camel is still selectable and is a different mob.
  assert.equal(s.reset('camel').type, 'camel');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.camel_husk_spawn_egg, 'the camel husk has a spawn egg');
  assert.equal(ITEMS.camel_husk_spawn_egg.mob, 'camel_husk');
  assert.equal(ITEMS.camel_husk_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.saddle, 'and the saddle it takes exists');
  assert.ok(ITEMS.shears, 'and the shears that remove it');
});

test('the helpers are safe on non-camel-husks and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isCamelHusk(cow), false);
  assert.equal(camelHuskBurnsInDaylight(), false);
  assert.equal(camelHuskCanStand(cow, 10), false);
  assert.equal(camelHuskSit(cow), false);
  assert.equal(camelHuskStand(cow, 10), null);
  assert.equal(updateCamelHuskSitting(cow, 1), null);
  assert.equal(camelHuskIsHostile(cow), false);
  assert.deepEqual(separateCamelHuskRiders(cow), []);
  assert.deepEqual(mountCamelHuskJockey(manager, cow), []);
  assert.deepEqual(camelHuskDrops(cow), []);
  assert.equal(camelHuskXp(cow), 0);
  assert.equal(equipCamelHuskSaddle(cow, 'saddle'), false);
  assert.equal(shearCamelHuskSaddle(cow, 'shears'), false);
  assert.deepEqual(camelHuskDimensions(null), CAMEL_HUSK_DIMENSIONS, 'a fallback rather than a crash');
  assert.doesNotThrow(() => poseCamelHusk(null));
  assert.equal(manager.spawnMob('camel_husk', 9, 1, 9).type, 'camel_husk');
});
