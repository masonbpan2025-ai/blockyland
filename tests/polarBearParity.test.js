// Polar Bear parity with https://minecraft.wiki/w/Polar_Bear
//
// The bear already had a model, a health value and a wander role, but no hitbox in the dimension
// table (so collision used the humanoid 0.6 x 1.95 default), no baby variant, no stance, no
// cub-defence, no maul animation, and a wrong loot table.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  POLAR_BEAR_HEALTH, POLAR_BEAR_DIMENSIONS, POLAR_BEAR_BABY_DIMENSIONS, POLAR_BEAR_BABY_SCALE,
  POLAR_BEAR_DAMAGE, POLAR_BEAR_KNOCKBACK_RESISTANCE, POLAR_BEAR_SPEED, POLAR_BEAR_CUB_DEFENCE,
  POLAR_BEAR_ADULT_PROVOKE, POLAR_BEAR_PREY, POLAR_BEAR_FREEZE_IMMUNE, POLAR_BEAR_GROWTH_SECONDS,
  POLAR_BEAR_COLORS,
  isPolarBear, polarBearDamageFor, polarBearDimensions, polarBearStance, cubsNear, defendCub,
  provokeNearbyAdults, onPolarBearHurt, findPolarBearTarget, updatePolarBearGrowth,
  polarBearDrops, rollPolarBearFishCount, polarBearXp, canBreedPolarBear, polarBearColors, posePolarBear,
  startPolarBearMaul, updatePolarBearMaul
} from '../src/polarBearBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(6, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  player.inventory = inventory;
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, inventory, entities };
}

test('polar bear is a native type with the wiki health and hitboxes', () => {
  const { manager } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  assert.equal(bear.type, 'polar_bear');
  assert.equal(bear.maxHealth, POLAR_BEAR_HEALTH);
  assert.equal(bear.maxHealth, 30, 'wiki: 30 HP');
  assert.deepEqual(POLAR_BEAR_DIMENSIONS, { width: 1.4, height: 1.4 });
  assert.deepEqual(POLAR_BEAR_BABY_DIMENSIONS, { width: 0.7, height: 0.7 });
  assert.deepEqual(manager.getMobDimensions('polar_bear'), { width: 1.4, height: 1.4 });
  assert.deepEqual([bear.width, bear.height], [1.4, 1.4],
    'the spawner used to leave these undefined, so collision fell back to 0.6 x 1.95');
});

test('a cub is half size with its own hitbox', () => {
  const { manager } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  assert.equal(cub.isBaby, true);
  assert.deepEqual([cub.width, cub.height], [0.7, 0.7]);
  assert.equal(cub.mesh.scale.x, POLAR_BEAR_BABY_SCALE);
  assert.equal(polarBearDimensions(cub).width, 0.7);
  assert.equal(polarBearDimensions(manager.spawnMob('polar_bear', 0, 1, 0)).width, 1.4);
});

test('the damage table matches the wiki', () => {
  // Wiki: 4 on Easy, 6 on Normal, 9 on Hard.
  assert.deepEqual(POLAR_BEAR_DAMAGE, { peaceful: 0, easy: 4, normal: 6, hard: 9 });
  assert.equal(polarBearDamageFor('easy'), 4);
  assert.equal(polarBearDamageFor('normal'), 6);
  assert.equal(polarBearDamageFor('hard'), 9);
  assert.equal(polarBearDamageFor('peaceful'), 0);
  assert.equal(polarBearDamageFor('nonsense'), 6, 'an unknown difficulty falls back to Normal');
});

test('the physical traits match the wiki', () => {
  const { manager } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  assert.equal(bear.knockbackResistance, POLAR_BEAR_KNOCKBACK_RESISTANCE);
  assert.equal(POLAR_BEAR_KNOCKBACK_RESISTANCE, 0.6, 'wiki: 60% knockback resistance');
  assert.equal(bear.freezeImmune, true, 'wiki: immune to freezing from powder snow');
  assert.equal(POLAR_BEAR_FREEZE_IMMUNE, true);
  // Wiki gives it freeze immunity, NOT fall immunity.
  assert.equal(bear.fallDamageImmune, false, 'a bear is not immune to fall damage');
  assert.ok(POLAR_BEAR_SPEED.water > POLAR_BEAR_SPEED.land,
    'wiki: its swim speed equals the player\'s, making water no escape');
});

test('the stance follows the wiki: cubs passive, adults neutral then hostile', () => {
  const { manager } = fixture();
  const adult = manager.spawnMob('polar_bear', 0, 1, 0);
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });

  assert.equal(polarBearStance(adult), 'neutral', 'wiki: adults are neutral');
  assert.equal(polarBearStance(cub), 'passive', 'wiki: babies are passive');
  assert.equal(polarBearStance(adult, { provoked: true }), 'hostile', 'until provoked');
  assert.equal(polarBearStance(adult, { cubThreatened: true }), 'hostile', 'or a cub is threatened');
  assert.equal(polarBearStance(adult, { difficulty: 'peaceful' }), 'passive',
    'wiki: completely passive on Peaceful');
  assert.equal(polarBearStance({ type: 'cow' }), null, 'only polar bears');
});

test('a surviving cub calls every adult in a 41x21x41 area', () => {
  // Wiki: "If a baby polar bear is attacked, unless killed in one hit, all adults within a 41x21x41
  // area become hostile toward the player or mob, regardless of difficulty."
  assert.deepEqual(POLAR_BEAR_CUB_DEFENCE, { halfX: 20, halfY: 10, halfZ: 20 });
  const { manager, player } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const near = manager.spawnMob('polar_bear', 10, 1, 0);
  const far = manager.spawnMob('polar_bear', 40, 1, 0);
  assert.equal(near.isHostile, false);

  const angry = defendCub(manager, cub, player);
  assert.deepEqual(angry, [near], 'the near adult responds and the far one does not');
  assert.equal(near.isHostile, true);
  assert.equal(near.angryAt, player, 'and it blames the attacker');
  assert.equal(far.isHostile, false);
});

test('a one-hit kill on a cub does not call for help', () => {
  // Wiki: "unless killed in one hit" is Java's exemption.
  const { manager, player } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('polar_bear', 5, 1, 0);
  const angry = defendCub(manager, cub, player, { lethal: true });
  assert.deepEqual(angry, [], 'nobody answers');
  assert.equal(adult.isHostile, false);
});

test('the adults still turn on Peaceful, though their blow does nothing', () => {
  // Wiki: the adults become hostile "regardless of difficulty", and on Peaceful their attacks do zero
  // damage to players.
  const { manager, player } = fixture({ difficulty: 'peaceful' });
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('polar_bear', 5, 1, 0);
  const angry = defendCub(manager, cub, player, { difficulty: 'peaceful' });
  assert.equal(angry.length, 1, 'the adult responds even on Peaceful');
  assert.equal(adult.stance, 'passive', 'but its stance stays passive, so it never attacks');
  assert.equal(polarBearDamageFor('peaceful'), 0, 'and the damage is zero');
});

test('attacking an adult near a cub provokes the adults around it', () => {
  // Wiki: "attacking an adult who is within a 16x8x16 area of a cub also provokes other adults within
  // a 21x21x21 area of the attacked adult."
  assert.deepEqual(POLAR_BEAR_ADULT_PROVOKE, {
    cubHalfX: 8, cubHalfY: 4, cubHalfZ: 8, halfX: 10, halfY: 10, halfZ: 10
  });
  const { manager, player } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const attacked = manager.spawnMob('polar_bear', 4, 1, 0);
  const neighbour = manager.spawnMob('polar_bear', 12, 1, 0);
  const provoked = provokeNearbyAdults(manager, attacked, player);
  assert.deepEqual(provoked, [neighbour], 'the neighbour responds');
  assert.equal(neighbour.isHostile, true);
});

test('an adult nowhere near a cub provokes nobody', () => {
  const { manager, player } = fixture();
  const attacked = manager.spawnMob('polar_bear', 0, 1, 0);
  const neighbour = manager.spawnMob('polar_bear', 5, 1, 0);
  assert.deepEqual(provokeNearbyAdults(manager, attacked, player), [],
    'no cub within 16x8x16, so the rule does not apply');
  assert.equal(neighbour.isHostile, false);
});

test('the two provocation rules dispatch from one hurt handler', () => {
  const { manager, player } = fixture();
  // A cub: itself records the attacker and calls the adults.
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('polar_bear', 6, 1, 0);
  const cubResult = onPolarBearHurt(manager, cub, player);
  assert.equal(cubResult.self, false, 'a surviving cub is not itself made hostile');
  assert.deepEqual(cubResult.others, [adult]);

  // An adult with no cub: only itself.
  const loner = manager.spawnMob('polar_bear', 100, 1, 0);
  const adultResult = onPolarBearHurt(manager, loner, player);
  assert.equal(adultResult.self, true, 'the adult itself turns');
  assert.equal(loner.isHostile, true);
  assert.deepEqual(adultResult.others, []);
});

test('a hostile adult hunts the player and foxes, and a neutral one does not', () => {
  const { manager, player } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  player.position.set(5, 1, 0);
  assert.equal(findPolarBearTarget(manager, bear, player), null, 'neutral bears do not hunt');

  bear.isHostile = true;
  assert.equal(findPolarBearTarget(manager, bear, player), player, 'a hostile one does');

  // Wiki: adult polar bears also attack foxes.
  assert.deepEqual(POLAR_BEAR_PREY, ['fox']);
  const fox = manager.spawnMob('fox', 2, 1, 0);
  player.position.set(50, 1, 50);
  assert.equal(findPolarBearTarget(manager, bear, player), fox, 'a nearer fox is the target');

  // A cub never hunts, even if flagged.
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  cub.isHostile = true;
  assert.equal(findPolarBearTarget(manager, cub, player), null, 'a cub is passive');
});

test('the maul rears, then lands the blow', () => {
  // Wiki: "Polar bears attack by rearing on their back legs and mauling down with their front paws."
  const { manager, player } = fixture({ difficulty: 'hard' });
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  assert.equal(startPolarBearMaul(bear), true);
  assert.equal(bear.isMauling, true);
  assert.equal(updatePolarBearMaul(manager, bear, player, 0.1), 'rearing');
  assert.equal(player.damageTaken, 0, 'the blow has not landed yet');
  assert.equal(updatePolarBearMaul(manager, bear, player, 1), 'mauled');
  assert.equal(player.damageTaken, 9, 'wiki: 9 on Hard');
  assert.equal(bear.isMauling, false, 'and the maul is over');
});

test('the rearing pose lifts the bear onto its back legs', () => {
  const { manager } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  const legMeshes = bear.legs;
  posePolarBear(bear, 0);
  const standing = Math.abs(bear.mesh.rotation.x);
  bear.isMauling = true;
  posePolarBear(bear, 0);
  assert.ok(Math.abs(bear.mesh.rotation.x) > standing, 'wiki: it rears on its back legs');
  assert.doesNotThrow(() => posePolarBear(null));
  assert.doesNotThrow(() => posePolarBear({}, 1));
  assert.ok(legMeshes.every(l => l?.rotation), 'the legs have rotations to pose');
});

test('a cub matures in 20 minutes and its growth cannot be sped up', () => {
  // Wiki: 24000 ticks, and "their growth cannot be sped up".
  assert.equal(POLAR_BEAR_GROWTH_SECONDS, 1200);
  const { manager } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  assert.equal(cub.growthTimer, POLAR_BEAR_GROWTH_SECONDS);
  assert.equal(updatePolarBearGrowth(cub, 600), false, 'still a cub halfway');
  assert.equal(updatePolarBearGrowth(cub, 601), true, 'it matures');
  assert.equal(cub.isBaby, false);
  assert.deepEqual([cub.width, cub.height], [1.4, 1.4], 'the adult hitbox is restored');
  // There is deliberately no feeding accelerator to call.
  assert.equal(typeof canBreedPolarBear, 'function');
  assert.equal(canBreedPolarBear(), false, 'wiki: polar bears cannot breed');
});

test('an age-locked cub never matures', () => {
  // Wiki: growth "can be stopped by using a golden dandelion on them".
  const { manager } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  cub.ageLocked = true;
  assert.equal(updatePolarBearGrowth(cub, 100000), false);
  assert.equal(cub.isBaby, true);
});

test('the loot picks one fish, 3/4 cod and 1/4 salmon, cooked if on fire', () => {
  // Wiki: Java picks one of the two on a 3/4 and 1/4 split, 0-2 of it, cooked when the bear died on
  // fire. The base loot table this replaced rolled both, raw, at 0-2 each.
  const { manager } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  bear.playerDamaged = true;
  const seq = (...v) => { let i = 0; return () => v[i++] ?? v[v.length - 1]; };

  assert.deepEqual(polarBearDrops({ type: 'polar_bear' }, seq(0.1, 0.1, 0.1)),
    [['cod', false, 2, 2]], 'a low first roll gives cod, and both 3/4 rolls pass');
  assert.deepEqual(polarBearDrops({ type: 'polar_bear' }, seq(0.1, 0.1, 0.9)),
    [['cod', false, 1, 1]], 'one of the two rolls fails');
  assert.deepEqual(polarBearDrops({ type: 'polar_bear' }, seq(0.1, 0.9, 0.9)), [],
    'both fail, so nothing drops');
  assert.deepEqual(polarBearDrops({ type: 'polar_bear' }, seq(0.9, 0.1, 0.1)),
    [['salmon', false, 2, 2]], 'a high first roll gives salmon instead');
  assert.deepEqual(polarBearDrops({ type: 'polar_bear', onFire: true }, seq(0.1, 0.1, 0.1)),
    [['cooked_cod', false, 2, 2]], 'a burning bear drops cooked fish');
  assert.deepEqual(polarBearDrops({ type: 'polar_bear', isBaby: true }, seq(0.1, 0.1, 0.1)), [],
    'wiki: killing a baby yields no items');
});

test('the fish count uses the per-item multiplier, not a flat uniform roll', () => {
  // The wiki's `multiplychance` applies per item. Reading 0-2 as a uniform roll would make one and
  // two equally likely, when two should be the most likely.
  assert.equal(rollPolarBearFishCount(1, () => 0), 2, 'a certain roll gives both');
  assert.equal(rollPolarBearFishCount(0, () => 0), 0, 'an impossible roll gives neither');
  let seed = 3;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let two = 0;
  let total = 0;
  for (let i = 0; i < 40000; i++) {
    // Force the cod branch by driving the fish choice deterministically.
    const count = rollPolarBearFishCount(0.75, random);
    if (count === 2) two++;
    total++;
  }
  const share = two / total;
  assert.ok(Math.abs(share - 0.5625) < 0.01,
    `two fish should be about 3/4 squared of the cod rolls, got ${share.toFixed(4)}`);
});

test('XP is 1-3 with credit, and none for a cub', () => {
  const { manager } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  bear.playerDamaged = true;
  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = polarBearXp(bear);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(polarBearXp(manager.spawnPolarBear(0, 1, 0, { isBaby: true })), 0,
    'wiki: killing a baby yields no experience');
});

test('a hostile bear really mauls the player through the real update loop', () => {
  const { manager, player } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  bear.isHostile = true;
  player.position.set(2, 1, 0);
  let mauled = false;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (player.damageTaken > 0) { mauled = true; break; }
  }
  assert.equal(mauled, true, `the bear should maul, dealt ${player.damageTaken}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a neutral bear does not attack a player standing next to it', () => {
  const { manager, player } = fixture();
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  player.position.set(2, 1, 0);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(player.damageTaken, 0, 'wiki: adults are neutral until provoked');
});

test('a real hit on a cub turns the adults hostile', () => {
  const { manager, player } = fixture();
  const cub = manager.spawnPolarBear(0, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('polar_bear', 6, 1, 0);
  assert.equal(adult.isHostile, false);
  manager.damageMob(cub, 1, null, false, player);
  assert.equal(adult.isHostile, true, 'the adult is now hostile');
  assert.equal(adult.angryAt, player, 'and blames the attacker');
});

test('a bear walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const bear = manager.spawnMob('polar_bear', 0, 1, 0);
  const start = bear.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(bear), 'still alive');
  assert.ok(bear.mesh.position.distanceTo(start) > 0.25, 'it moved around');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('the Inspector can spawn the polar bear and reports its stance', () => {
  assert.ok(DEBUG_MOBS.includes('polar_bear'), 'polar_bear must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const bear = s.reset('polar_bear');
  assert.equal(bear.type, 'polar_bear', 'the Inspector spawns a real bear');
  const snap = s.snapshot();
  assert.equal(snap.health, 30, 'Inspector telemetry shows 30 HP');
  assert.equal(snap.maxHealth, 30);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 30);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.polar_bear_spawn_egg, 'the bear has a spawn egg');
  assert.equal(ITEMS.polar_bear_spawn_egg.mob, 'polar_bear');
});

test('the helpers are safe on non-bears and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isPolarBear(cow), false);
  assert.equal(polarBearStance(cow), null);
  assert.equal(polarBearDamageFor('normal'), 6);
  assert.deepEqual(cubsNear(manager, cow), []);
  assert.deepEqual(defendCub(manager, cow, player), []);
  assert.deepEqual(provokeNearbyAdults(manager, cow, player), []);
  assert.equal(findPolarBearTarget(manager, cow, player), null);
  assert.equal(updatePolarBearGrowth(cow, 1), false);
  assert.deepEqual(polarBearDrops(cow), []);
  assert.equal(polarBearXp(cow), 0);
  assert.equal(startPolarBearMaul(cow), false);
  assert.equal(updatePolarBearMaul(manager, cow, player, 1), null);
  assert.deepEqual(polarBearColors(), POLAR_BEAR_COLORS);
  assert.doesNotThrow(() => posePolarBear(null));
  assert.equal(polarBearDimensions(null).width, 1.4, 'a malformed mob gets the adult hitbox');
});
