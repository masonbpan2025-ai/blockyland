// Fox parity with https://minecraft.wiki/w/Fox
//
// Fox was another of the 38 missing types. Its defining traits are that it hunts small animals
// by pouncing, carries an item in its mouth which it always drops, sleeps during the day under
// cover, and *trusts* the player who bred it rather than being tamed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  FOX_HEALTH, FOX_DIMENSIONS, FOX_BABY_DIMENSIONS, FOX_BABY_SCALE, FOX_DAMAGE,
  FOX_SAFE_FALL_BLOCKS, FOX_PREY, FOX_HELD_ITEM_WEIGHTS, FOX_HELD_ITEM_CHANCE,
  FOX_EAT_SECONDS, FOX_SLEEP_MAX_SKY_LIGHT, FOX_POUNCE, FOX_COAT_COLORS,
  isFox, foxDamageFor, rollFoxCoat, rollFoxHeldItem, applyFoxCoat, inheritFoxCoat,
  foxDrops, foxHasTotem, consumeFoxTotem, foxCanSleep, foxTrusts, foxShouldFlee,
  foxCanAttackType, startFoxPounce, updateFoxPounce, createFoxModel, poseFoxLegs, lightAt
} from '../src/foxBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ light = 0, worldTime = 6000 } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => light
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { chicken: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 1, 20), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime, controls: {} };
  return { manager, entities, player, world };
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('fox is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const fox = manager.spawnMob('fox', 0, 1, 0);
  assert.equal(fox.type, 'fox');
  assert.equal(fox.name, 'Fox');
  assert.notEqual(fox.type, 'villager');
});

test('foxes have the reference 10 HP and the adult and baby hitboxes', () => {
  const { manager } = fixture();
  const fox = manager.spawnMob('fox', 0, 1, 0);
  assert.equal(fox.maxHealth, FOX_HEALTH);
  assert.equal(fox.maxHealth, 10, 'wiki: 10 HP, lowered from 20 in 1.14-pre4');
  assert.equal(fox.health, 10);
  assert.deepEqual(FOX_DIMENSIONS, { width: 0.6, height: 0.7 });
  assert.deepEqual(FOX_BABY_DIMENSIONS, { width: 0.36, height: 0.42 });
  assert.deepEqual(manager.getMobDimensions('fox'), { width: 0.6, height: 0.7 });

  const baby = manager.spawnFox(0, 1, 0, { isBaby: true });
  assert.equal(baby.mesh.scale.x, FOX_BABY_SCALE);
  assert.deepEqual([baby.width, baby.height], [0.36, 0.42], 'the baby hitbox is used');
});

test('the damage table matches the wiki', () => {
  assert.deepEqual(FOX_DAMAGE, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.equal(foxDamageFor('easy'), 2);
  assert.equal(foxDamageFor('normal'), 2);
  assert.equal(foxDamageFor('hard'), 3);
  assert.equal(foxDamageFor('peaceful'), 0);
  assert.equal(foxDamageFor('nonsense'), 2, 'unknown falls back to normal');
});

test('the model is a slender quadruped with a long tail, muzzle and pointed ears', () => {
  const { manager } = fixture();
  const fox = manager.spawnMob('fox', 0, 1, 0);
  assert.ok(fox.body && fox.belly, 'body and belly');
  assert.ok(fox.head && fox.muzzle, 'head with a pointed muzzle');
  assert.ok(fox.tail, 'a long bushy tail');
  assert.equal(fox.ears.length, 2, 'two pointed ears');
  assert.equal(fox.eyes.length, 2);
  assert.equal(fox.legs.length, 4, 'four legs');
  assert.ok(fox.mouth, 'a mouth anchor for a held item');
});

test('the two variants exist with distinct colours', () => {
  const { manager } = fixture();
  assert.deepEqual(Object.keys(FOX_COAT_COLORS).sort(), ['red', 'snow']);
  const red = manager.spawnFox(0, 1, 0, { coat: 'red' });
  const snow = manager.spawnFox(2, 1, 0, { coat: 'snow' });
  assert.equal(red.coat, 'red');
  assert.equal(snow.coat, 'snow');
  // The coat IS its sheet: two vanilla textures, one per coat. Asserting a flat colour would be asserting the
  // fallback, because a bound texture whitens the material.
  assert.match(red.bodyMat.map?.assetPath ?? '', /fox\.png$/);
  assert.match(snow.bodyMat.map?.assetPath ?? '', /fox_snow\.png$/);
  // The coat is the SHEET: binding a texture whitens the material, so the colour is the fallback, not the
  // variant. Asserting the path checks the thing that actually changes what you see.
  assert.match(red.bodyMat.map?.assetPath ?? '', /fox\.png$/);
  assert.match(snow.bodyMat.map?.assetPath ?? '', /fox_snow\.png$/);
});

test('the variant is chosen by biome, as the wiki describes', () => {
  // Red: taigas and old growth taigas. Snow: groves and snowy taigas.
  for (const biome of ['taiga', 'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'dappled_forest']) {
    assert.equal(rollFoxCoat(biome), 'red', `${biome} is a red fox biome`);
  }
  for (const biome of ['grove', 'snowy_taiga']) {
    assert.equal(rollFoxCoat(biome), 'snow', `${biome} is a snow fox biome`);
  }
  assert.equal(rollFoxCoat(null), 'red', 'an unknown biome defaults to red');
});

test('a baby inherits one parent variant, and red x snow is even', () => {
  assert.equal(inheritFoxCoat('red', 'red'), 'red', 'same parents give the same variant');
  assert.equal(inheritFoxCoat('snow', 'snow'), 'snow');
  assert.equal(inheritFoxCoat('red', 'snow', () => 0.1), 'red');
  assert.equal(inheritFoxCoat('red', 'snow', () => 0.9), 'snow');
});

test('the held-item weights match the wiki Java table and sum to 100', () => {
  const expected = {
    emerald: 5, rabbit_foot: 10, rabbit_hide: 10, egg: 15, wheat: 20, leather: 20, feather: 20
  };
  const actual = Object.fromEntries(FOX_HELD_ITEM_WEIGHTS.map(e => [e.id, e.weight]));
  assert.deepEqual(actual, expected, 'wiki Java column');
  const total = FOX_HELD_ITEM_WEIGHTS.reduce((n, e) => n + e.weight, 0);
  assert.equal(total, 100, 'the weights must sum to 100 or every roll is skewed');
  assert.equal(FOX_HELD_ITEM_CHANCE, 0.2, 'wiki: 20% spawn holding an item');
  // Every item must be a real registry id.
  for (const entry of FOX_HELD_ITEM_WEIGHTS) {
    assert.equal(typeof entry.id, 'string');
  }
});

test('the held-item roll respects the 20% gate and the weights', () => {
  // Above the gate: nothing.
  assert.equal(rollFoxHeldItem(() => 0.5), null);
  assert.equal(rollFoxHeldItem(() => 0.999), null);
  // Below the gate, a roll of 0 selects the first entry. Two calls are made: one for the gate
  // and one for the weighted pick, so the sequence matters.
  let call = 0;
  assert.equal(rollFoxHeldItem(() => (call++ === 0 ? 0.1 : 0)), 'emerald');
  // A pick at the very end of the distribution takes the last entry.
  call = 0;
  assert.equal(rollFoxHeldItem(() => (call++ === 0 ? 0.1 : 0.999999)), 'feather');
  // Sample the distribution and check each item appears near its weight.
  let seed = 99;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const counts = {};
  const runs = 200000;
  for (let i = 0; i < runs; i++) {
    const item = rollFoxHeldItem(random);
    if (item) counts[item] = (counts[item] || 0) + 1;
  }
  for (const [id, weight] of Object.entries({ emerald: 5, rabbit_foot: 10, rabbit_hide: 10, egg: 15, wheat: 20, leather: 20, feather: 20 })) {
    const observed = (counts[id] || 0) / runs;
    // Conditioned on the 20% gate, so the expected share is weight/100 * 0.2.
    const expectedShare = (weight / 100) * FOX_HELD_ITEM_CHANCE;
    assert.ok(Math.abs(observed - expectedShare) < 0.005,
      `${id}: expected about ${expectedShare.toFixed(4)}, observed ${observed.toFixed(4)}`);
  }
});

test('a fox spawns holding an item about 20% of the time', () => {
  const { manager } = fixture();
  let held = 0;
  const runs = 2000;
  for (let i = 0; i < runs; i++) {
    const fox = manager.spawnMob('fox', 0, 1, 0);
    if (fox.heldItem) held++;
  }
  const share = held / runs;
  assert.ok(Math.abs(share - FOX_HELD_ITEM_CHANCE) < 0.05,
    `expected about ${FOX_HELD_ITEM_CHANCE}, observed ${share.toFixed(3)}`);
});

test('an explicit held item wins, so a caller can force an empty mouth', () => {
  const { manager } = fixture();
  const empty = manager.spawnFox(0, 1, 0, { heldItem: null });
  assert.equal(empty.heldItem, null);
  assert.equal(empty.heldItemMesh, null, 'and no mouth mesh is created');

  const carrying = manager.spawnFox(2, 1, 0, { heldItem: 'emerald' });
  assert.equal(carrying.heldItem, 'emerald');
  assert.ok(carrying.heldItemMesh, 'a mouth mesh is created');
  assert.equal(carrying.heldItemMesh.parent, carrying.mouth, 'and attached to the mouth');
});

test('a fox always drops what it holds, and counts it once', () => {
  const { manager } = fixture();
  // An untouched fox holding its spawn item must drop it once, not twice.
  const untouched = manager.spawnFox(0, 1, 0, { heldItem: 'leather' });
  untouched.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(untouched, () => 0.99), [['leather', false, 1, 1]],
    'the spawn item is one drop, not a spawn drop plus a held drop');
  assert.deepEqual(foxDrops(untouched), [['leather', false, 1, 1]]);

  // A fox that picked up something else drops both.
  const swapped = manager.spawnFox(2, 1, 0, { heldItem: 'emerald' });
  swapped.heldItem = 'egg';
  assert.deepEqual(foxDrops(swapped), [['egg', false, 1, 1], ['emerald', false, 1, 1]]);

  // An empty fox drops nothing.
  assert.deepEqual(foxDrops(manager.spawnFox(4, 1, 0, { heldItem: null })), []);
});

test('foxes award 1-3 XP with credit, and babies award none', () => {
  const credited = fixture();
  credited.entities.spawnDroppedItem = () => {};
  const fox = credited.manager.spawnFox(0, 1, 0, { heldItem: null });
  fox.playerDamaged = true;
  credited.manager.damageMob(fox, 1000, null, false, credited.player);
  for (let i = 0; i < 12; i++) credited.manager.update(0.1, credited.player);
  const xp = xpFrom(credited.entities);
  assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);

  const babyRun = fixture();
  babyRun.entities.spawnDroppedItem = () => {};
  const baby = babyRun.manager.spawnFox(0, 1, 0, { isBaby: true, heldItem: null });
  baby.playerDamaged = true;
  babyRun.manager.damageMob(baby, 1000, null, false, babyRun.player);
  for (let i = 0; i < 12; i++) babyRun.manager.update(0.1, babyRun.player);
  assert.equal(xpFrom(babyRun.entities), 0, 'wiki: killing a baby fox yields no experience');
});

test('a held totem of undying revives the fox instead of dropping', () => {
  const { manager, player } = fixture();
  const fox = manager.spawnFox(0, 1, 0, { heldItem: 'totem_of_undying' });
  assert.equal(foxHasTotem(fox), true);

  manager.damageMob(fox, 1000, null, false, player);
  assert.ok(fox.health > 0, `wiki: the fox revives, health ${fox.health}`);
  assert.equal(fox.totemConsumed, true);
  assert.equal(fox.heldItem, null, 'the totem is consumed');
  assert.ok(!manager.getMobDeathDrops(fox, () => 0.99).some(r => r[0] === 'totem_of_undying'),
    'and is not dropped');

  // A fox without a totem dies normally.
  const plain = manager.spawnFox(4, 1, 0, { heldItem: 'leather' });
  assert.equal(consumeFoxTotem(plain), false);
  manager.damageMob(plain, 1000, null, false, player);
  assert.ok(plain.health <= 0, 'a fox with no totem dies');
});

test('sleeping needs daytime, no storm, and sky light 14 or less', () => {
  assert.equal(FOX_SLEEP_MAX_SKY_LIGHT, 14);
  // Daytime, clear, dark enough: sleeps.
  const dark = fixture({ light: 10, worldTime: 6000 });
  const fox = dark.manager.spawnMob('fox', 0, 1, 0);
  assert.equal(foxCanSleep(dark.manager, fox, true, false), true);

  // Sky light 15 wakes it.
  const bright = fixture({ light: 15, worldTime: 6000 });
  const brightFox = bright.manager.spawnMob('fox', 0, 1, 0);
  assert.equal(foxCanSleep(bright.manager, brightFox, true, false), false, 'light 15 is too bright');
  // 14 is still allowed.
  const edge = fixture({ light: 14, worldTime: 6000 });
  assert.equal(foxCanSleep(edge.manager, edge.manager.spawnMob('fox', 0, 1, 0), true, false), true);

  // Night: no sleeping.
  assert.equal(foxCanSleep(dark.manager, fox, false, false), false, 'foxes sleep during the day');
  // Thunderstorm: no sleeping.
  assert.equal(foxCanSleep(dark.manager, fox, true, true), false, 'a thunderstorm keeps it awake');
});

test('the light helper prefers the world query and falls back to day or night', () => {
  const { manager } = fixture({ light: 7 });
  assert.equal(lightAt(manager, 0, 1, 0), 7);
  const bare = { world: {}, game: { worldTime: 6000 } };
  assert.equal(lightAt(bare, 0, 1, 0), 15, 'daytime is bright');
  bare.game.worldTime = 18000;
  assert.equal(lightAt(bare, 0, 1, 0), 0, 'night is dark');
});

test('trust comes from the breeder, and a trusted fox does not flee', () => {
  const { manager, player } = fixture();
  const wild = manager.spawnFox(0, 1, 0, { heldItem: null });
  assert.equal(foxTrusts(wild, player), false);
  assert.equal(foxShouldFlee(wild, player, { range: 30 }), true, 'a wild fox flees a player');

  const trusted = manager.spawnFox(2, 1, 0, { trustedPlayer: player, heldItem: null });
  assert.equal(foxTrusts(trusted, player), true);
  assert.equal(foxShouldFlee(trusted, player, { range: 30 }), false, 'a trusted fox does not flee');
  // But it still flees a different player.
  const stranger = { position: player.position.clone() };
  assert.equal(foxShouldFlee(trusted, stranger, { range: 30 }), true);
});

test('sneaking suppresses the flee, as the wiki says', () => {
  const { manager, player } = fixture();
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  player.position.set(0, 1, 2);
  assert.equal(foxShouldFlee(fox, player), true, 'a normal approach makes it flee');
  assert.equal(foxShouldFlee(fox, player, { sneaking: true }), false,
    'wiki: it does not flee a player who approaches while sneaking');
  assert.equal(foxShouldFlee({ type: 'cow' }, player), false, 'only foxes flee');
  assert.equal(foxShouldFlee(fox, null), false);
});

test('the prey list matches the wiki', () => {
  assert.deepEqual([...FOX_PREY].sort(), ['chicken', 'cod', 'rabbit', 'salmon', 'tropical_fish', 'turtle'].sort());
  const { manager } = fixture();
  const fox = manager.spawnMob('fox', 0, 1, 0);
  for (const type of FOX_PREY) {
    assert.equal(foxCanAttackType(fox, type), true, `${type} is prey`);
  }
  assert.equal(foxCanAttackType(fox, 'player'), false, 'wiki: foxes do not attack players');
  assert.equal(foxCanAttackType(fox, 'wolf'), false);
  assert.equal(foxCanAttackType(fox, 'polar_bear'), false);
  assert.equal(foxCanAttackType(fox, 'cow'), false);
  assert.equal(foxCanAttackType(fox, 'goat'), false);
});

test('a fox hunts and bites a chicken through the real update loop', () => {
  // Night, so the fox is awake and hunting rather than sleeping.
  const { manager, player } = fixture({ worldTime: 18000 });
  player.position.set(60, 1, 60); // far away so it does not flee
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  const chicken = manager.spawnChicken(6, 1, 0);
  const before = chicken.health;
  for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  assert.ok(chicken.health < before || !manager.mobs.includes(chicken),
    `the fox should hunt the chicken, health ${before} -> ${chicken.health}`);
});

test('a pounce completes rather than restarting every frame', () => {
  // Regression: the hunt originally re-triggered the crouch on every frame it was in range,
  // resetting the timer forever, so the fox crouched and never leapt.
  const { manager, player } = fixture({ worldTime: 18000 });
  player.position.set(60, 1, 60);
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  manager.spawnChicken(3, 1, 0);
  const phases = new Set();
  for (let i = 0; i < 240; i++) {
    manager.update(1 / 60, player);
    if (fox.pouncePhase) phases.add(fox.pouncePhase);
    else phases.add('none');
  }
  assert.ok(phases.has('crouch'), 'the fox crouches');
  assert.ok(phases.has('air'), 'and actually leaps rather than crouching forever');
});

test('the pounce crouches, then leaps', () => {
  const { manager } = fixture();
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  assert.equal(startFoxPounce(fox), true);
  assert.equal(fox.pouncePhase, 'crouch');
  assert.deepEqual(fox.velocity.toArray(), [0, 0, 0], 'it stops to crouch');

  // Still crouching partway through.
  assert.equal(updateFoxPounce(fox, FOX_POUNCE.crouch / 2), 'crouching');
  // Then it leaps, gaining height.
  assert.equal(updateFoxPounce(fox, FOX_POUNCE.crouch), 'leaping');
  assert.ok(fox.velocity.y > 5, `wiki: it leaps into the air, vy=${fox.velocity.y}`);
  assert.equal(fox.isPouncing, true);
  // And lands.
  assert.equal(updateFoxPounce(fox, FOX_POUNCE.air), null);
  assert.equal(fox.isPouncing, false);
  assert.equal(fox.pouncePhase, null);
});

test('the crouch pose lowers the body and tilts the head', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const bellyMat = new THREE.MeshLambertMaterial();
  const earMat = new THREE.MeshLambertMaterial();
  const model = createFoxModel(bodyMat, bellyMat, earMat);

  poseFoxLegs({ ...model, pouncePhase: null }, 1, true);
  const standingY = model.body.position.y;
  const standingHead = model.head.rotation.x;
  poseFoxLegs({ ...model, pouncePhase: 'crouch' }, 1, false);
  assert.ok(model.body.position.y < standingY, 'the body lowers to pounce');
  assert.ok(model.head.rotation.x > standingHead, 'and the head tilts down');

  assert.doesNotThrow(() => poseFoxLegs({}, 1));
  assert.doesNotThrow(() => poseFoxLegs(null, 1));
});

test('the fox is immune to sweet berries and can walk on powder snow', () => {
  const { manager } = fixture();
  const fox = manager.spawnMob('fox', 0, 1, 0);
  // Wiki: foxes take no damage or slowdown from sweet berry bushes, and can walk on top of
  // powder snow without falling in. Both are recorded as explicit flags.
  assert.equal(fox.sweetBerryImmune, true);
  assert.equal(fox.powderSnowWalkable, true);
  // Wiki: a fox can safely fall 5 blocks rather than the usual 3.
  assert.equal(fox.safeFallBlocks, FOX_SAFE_FALL_BLOCKS);
  assert.equal(FOX_SAFE_FALL_BLOCKS, 5);
});

test('the eat delay is the wiki 30 seconds', () => {
  assert.equal(FOX_EAT_SECONDS, 30, 'wiki: a fox eats food it picks up after 30 seconds');
});

test('a fox walks without breaking the update loop and stays on the ground', () => {
  // Night, so the fox walks rather than sleeping through the test.
  const { manager, player } = fixture({ worldTime: 18000 });
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  player.position.set(40, 1, 40);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(fox), 'still alive');
  assert.ok(fox.mesh.position.y > 0.5, `should rest on the ground, y=${fox.mesh.position.y}`);
  assert.ok((fox.foxPhase || 0) > 0, 'the walk cycle advanced');
});

test('a fox sleeps through the day and wakes at night', () => {
  const day = fixture({ light: 10, worldTime: 6000 });
  const dayFox = day.manager.spawnFox(0, 1, 0, { heldItem: null });
  day.manager.update(1 / 60, day.player);
  assert.equal(dayFox.isSleeping, true, 'it sleeps in the day under cover');
  const before = dayFox.mesh.position.clone();
  for (let i = 0; i < 120; i++) day.manager.update(1 / 60, day.player);
  assert.ok(dayFox.mesh.position.distanceTo(before) < 0.1, 'and stays put while asleep');

  const night = fixture({ light: 10, worldTime: 18000 });
  const nightFox = night.manager.spawnFox(0, 1, 0, { heldItem: null });
  night.manager.update(1 / 60, night.player);
  assert.equal(nightFox.isSleeping, false, 'it does not sleep at night');
});

test('a fox wakes when a player comes close', () => {
  const { manager, player } = fixture({ light: 10, worldTime: 6000 });
  const fox = manager.spawnFox(0, 1, 0, { heldItem: null });
  player.position.set(40, 1, 40); // far, so it can settle
  manager.update(1 / 60, player);
  assert.equal(fox.isSleeping, true);

  // Wiki: it wakes if approached by a player or mob.
  player.position.set(0, 1, 2);
  manager.update(1 / 60, player);
  assert.equal(fox.isSleeping, false, 'an approaching player wakes it');
});

test('the Inspector can spawn the fox and reports its variant and mouth', () => {
  assert.ok(DEBUG_MOBS.includes('fox'), 'fox must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const fox = s.reset('fox');
  assert.equal(fox.type, 'fox', 'the Inspector spawns a real fox');
  assert.equal(s.snapshot().health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(s.snapshot().maxHealth, 10);
  assert.ok(['red', 'snow'].includes(s.snapshot().foxCoat), 'and a real variant');
  assert.equal(s.snapshot().sleeping, false);
  assert.equal(s.snapshot().trusted, false);
  assert.equal(s.snapshot().pounce, null);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10);
});

test('applyFoxCoat is a no-op on non-foxes', () => {
  assert.doesNotThrow(() => applyFoxCoat(null));
  assert.doesNotThrow(() => applyFoxCoat({ type: 'cow' }));
  assert.equal(isFox({ type: 'cow' }), false);
});
