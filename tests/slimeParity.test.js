// Slime parity with https://minecraft.wiki/w/Slime
//
// The audit recorded slime health as `size * 4` against a reference of size squared, which
// gave 8 for a medium slime instead of 4 and 4 for a small one instead of 1. Three further
// defects were found while fixing it:
//   - slimes had no loot row at all, so they dropped no slimeballs
//   - slimes were not in the dimension table, so they fell through to the humanoid default
//   - the shared split path wrote the same wrong `nextSize * 4` health onto every child
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import {
  CUBE_SIZES, CUBE_MIN_SIZE, CUBE_SIDE_PER_SIZE,
  cubeHealth, cubeSide, cubeDamage, cubeChildSize, cubeSplitCount, applyCubeSize
} from '../src/cubeMobBehavior.js';
import { setMagmaSize } from '../src/netherCombat.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, setVoxel() {} };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  manager.hostileBehaviors = new HostileMobBehaviors(manager, world, sounds, entities);
  const player = { position: new THREE.Vector3(100, 1, 100), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player };
}

test('cube health is the size squared, not size times four', () => {
  // Wiki: "A slime's maximum health is equal to its size squared."
  assert.equal(cubeHealth(4), 16, 'large');
  assert.equal(cubeHealth(2), 4, 'medium: was 8 under the old size * 4 rule');
  assert.equal(cubeHealth(1), 1, 'small: was 4 under the old size * 4 rule');
});

test('spawned slimes carry the reference health at every size', () => {
  const expected = { 4: 16, 2: 4, 1: 1 };
  for (const [size, hp] of Object.entries(expected)) {
    const { manager } = fixture();
    const slime = manager.spawnSlime(0, 1, 0, Number(size));
    assert.equal(slime.maxHealth, hp, `size ${size} should have ${hp} HP`);
    assert.equal(slime.health, hp);
    assert.equal(slime.slimeSize, Number(size));
  }
});

test('the default spawned slime is the large one with the wiki reference stats', () => {
  const { manager } = fixture();
  const slime = manager.spawnSlime(0, 1, 0);
  assert.equal(slime.slimeSize, 4, 'the default spawn is large');
  assert.equal(slime.maxHealth, 16, 'wiki: large slimes have 16 HP');
  assert.equal(slime.width, 2.08, 'wiki: large slimes are 2.08 blocks');
});

test('the hitbox side is the size times 0.52, and slimes are no longer humanoid-sized', () => {
  assert.equal(CUBE_SIDE_PER_SIZE, 0.52);
  assert.equal(cubeSide(4), 2.08, 'large');
  assert.equal(cubeSide(2), 1.04, 'medium');
  assert.equal(cubeSide(1), 0.52, 'small');

  const { manager } = fixture();
  // Slimes were absent from the dimension table and fell through to the humanoid default
  // of 0.6 x 1.95, which is taller than it is wide and not cube-shaped at all.
  assert.deepEqual(manager.getMobDimensions('slime'), { width: 2.08, height: 2.08 });
  for (const size of CUBE_SIZES) {
    const slime = manager.spawnSlime(0, 1, 0, size);
    assert.equal(slime.width, cubeSide(size), `size ${size} width`);
    assert.equal(slime.height, cubeSide(size), `size ${size} height`);
    assert.equal(slime.width, slime.height, 'a cube mob must be cubic');
  }
});

test('contact damage is the raw size, and the smallest slimes deal none', () => {
  // Wiki: damage equals the size, except size 1 which deals none. This is the reference
  // value the mob update loop should be using; it is exported so the gap is visible.
  assert.equal(cubeDamage(4), 4, 'large hits for 4, not for its 16 HP');
  assert.equal(cubeDamage(2), 2);
  assert.equal(cubeDamage(1), 0, 'wiki: small slimes deal no damage');
});

test('a dying slime splits into 2-4 children of half its size with squared health', () => {
  const { manager, entities } = fixture();
  recordDrops(entities);
  const big = manager.spawnSlime(0, 1, 0, 4);
  manager.hostileBehaviors.handleMobDeathSplitting(big);

  const children = manager.mobs.filter(m => m !== big);
  assert.ok(children.length >= 2 && children.length <= 4, `expected 2-4 children, got ${children.length}`);
  for (const child of children) {
    assert.equal(child.slimeSize, 2, 'children are half the size');
    assert.equal(child.maxHealth, 4, 'wiki: a medium slime has 4 HP');
    assert.equal(child.health, 4, 'the old split path wrote 8 here');
    assert.equal(child.width, 1.04, 'and the hitbox follows the child size');
  }
});

test('a medium slime splits into small slimes, and a small one never splits', () => {
  const { manager, entities } = fixture();
  recordDrops(entities);
  const medium = manager.spawnSlime(0, 1, 0, 2);
  manager.hostileBehaviors.handleMobDeathSplitting(medium);
  const smalls = manager.mobs.filter(m => m !== medium);
  assert.ok(smalls.length >= 2, 'medium splits into smalls');
  for (const s of smalls) {
    assert.equal(s.slimeSize, 1);
    assert.equal(s.maxHealth, 1, 'wiki: a small slime has 1 HP');
    assert.equal(s.width, 0.52);
  }

  // The smallest size is terminal.
  assert.equal(cubeChildSize(1), null);
  const before = manager.mobs.length;
  assert.equal(manager.hostileBehaviors.handleMobDeathSplitting(smalls[0]), false);
  assert.equal(manager.mobs.length, before, 'a small slime spawns nothing');
});

test('a slime cannot split twice', () => {
  const { manager } = fixture();
  const big = manager.spawnSlime(0, 1, 0, 4);
  manager.hostileBehaviors.handleMobDeathSplitting(big);
  const after = manager.mobs.length;
  assert.equal(manager.hostileBehaviors.handleMobDeathSplitting(big), false);
  assert.equal(manager.mobs.length, after, 'the same corpse must not split again');
});

test('the split count helper stays within the wiki 2-4 range', () => {
  assert.equal(cubeSplitCount(() => 0), 2);
  assert.equal(cubeSplitCount(() => 0.999999), 4);
  for (const r of [0, 0.34, 0.67, 0.99]) {
    const n = cubeSplitCount(() => r);
    assert.ok(n >= 2 && n <= 4, `roll ${r} gave ${n}`);
  }
});

test('only small slimes drop slimeballs, and only for a player kill', () => {
  const { manager } = fixture();
  const small = manager.spawnSlime(0, 1, 0, 1);
  small.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(small, () => 0.99), [['slime_ball', false, 0, 2]],
    'wiki: small slimes drop 0-2 slimeballs');

  // Medium and large slimes drop nothing; their loot comes from the children they split into.
  for (const size of [2, 4]) {
    const big = manager.spawnSlime(0, 1, 0, size);
    big.playerDamaged = true;
    assert.deepEqual(manager.getMobDeathDrops(big, () => 0.99), [],
      `a size ${size} slime should drop no slimeballs directly`);
  }

  // An environmental kill drops nothing, like other mobs' player-credited loot.
  const environmental = manager.spawnSlime(0, 1, 0, 1);
  assert.deepEqual(manager.getMobDeathDrops(environmental, () => 0.99), []);
});

test('magma cubes keep their own squared-health rule and gain the correct hitbox', () => {
  const { manager } = fixture();
  const cube = manager.spawnMagmaCube(0, 1, 0);
  assert.equal(cube.maxHealth, 16, 'wiki: a large magma cube has 16 HP');
  for (const size of CUBE_SIZES) {
    setMagmaSize(cube, size);
    assert.equal(cube.maxHealth, cubeHealth(size), `size ${size} health`);
    assert.equal(cube.width, cubeSide(size), `size ${size} width`);
    assert.equal(cube.armor, size * 3, 'magma cubes keep their size-scaled armour');
  }
  // Its table entry was 2.04, which is size 4 * 0.51 rather than * 0.52.
  assert.deepEqual(manager.getMobDimensions('magma_cube'), { width: 2.08, height: 2.08 });
});

test('applyCubeSize is the single place the size-derived stats come from', () => {
  const { manager } = fixture();
  const slime = manager.spawnSlime(0, 1, 0, 4);
  applyCubeSize(slime, 2);
  assert.equal(slime.slimeSize, 2);
  assert.equal(slime.maxHealth, 4);
  assert.equal(slime.width, 1.04);
  assert.equal(slime.height, 1.04);
});

/** Record drops as data; the real spawnDroppedItem needs `document` for icons. */
function recordDrops(entities, into = []) {
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    into.push({ itemType, isBlock, count });
    return into[into.length - 1];
  };
  return into;
}

/** Total XP the manager has spawned as orbs. */
function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('slime XP follows the size rather than the flat hostile value', () => {
  // Wiki: 4 XP large, 2 medium, 1 small. Pinned through the live death path rather than the
  // helper, so the wiring is what is under test.
  for (const [size, expected] of [[4, 4], [2, 2], [1, 1]]) {
    const { manager, entities, player } = fixture();
    recordDrops(entities);
    const slime = manager.spawnSlime(0, 1, 0, size);
    slime.playerDamaged = true;
    manager.damageMob(slime, 1000, null, false, player);
    for (let i = 0; i < 12; i++) manager.update(0.1, player);
    assert.ok(xpFrom(entities) > 0, `size ${size} should have awarded XP`);
    for (const orb of entities.xpOrbs) {
      assert.ok(orb.value <= expected, `size ${size} orb value ${orb.value} exceeds ${expected}`);
    }
    assert.ok(xpFrom(entities) <= expected * 2, `size ${size} awarded too much XP: ${xpFrom(entities)}`);
  }
});

test('the Inspector can spawn the slime and reports the reference health and size', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const slime = s.reset('slime');
  assert.equal(slime.type, 'slime');
  assert.equal(s.snapshot().health, 16, 'Inspector telemetry shows 16 HP for the default large slime');
  assert.equal(s.snapshot().maxHealth, 16);
  assert.equal(s.snapshot().cubeSize, 4);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 16);
});

test('the cube constants are internally consistent', () => {
  assert.deepEqual(CUBE_SIZES, [4, 2, 1]);
  assert.equal(CUBE_MIN_SIZE, 1);
  // Splitting walks 4 -> 2 -> 1 and then stops.
  assert.equal(cubeChildSize(4), 2);
  assert.equal(cubeChildSize(2), 1);
  for (const size of CUBE_SIZES) {
    assert.equal(cubeHealth(size), size ** 2);
    assert.equal(cubeSide(size), size * CUBE_SIDE_PER_SIZE);
    // Health must never be below the damage it deals, or a cube would kill itself.
    assert.ok(cubeHealth(size) >= cubeDamage(size), `size ${size} health vs damage`);
  }
});
