// The drowned's nautilus shell and trident, neither of which the game dropped.
//
// `mobLootData.js` -- the pinned vanilla loot dump the Inspector reads -- publishes the drowned as rotten
// flesh and an 11% copper ingot and stops there, while Java also gives it a 3% nautilus shell and an 8.5%
// chance of the trident it was carrying. This game's drowned already *throw* tridents
// (`hostileMobBehaviors.throwTrident`), and nothing ever dropped one, so both items read as unobtainable:
// `nautilus_shell` with 16 recipes needing it, the conduit among them, and `trident` with none.
//
// Two files carry the rows and this test is what keeps them from drifting: the game's own base table in
// `mobs.js`, which is what actually drops, and the generated `mobLootData.js`, which is what the Inspector
// believes. The generator has them written down as `MOB_LOOT_ADDITIONS`, because an edit to the generated
// file alone would survive until the next run and then vanish.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { EntityManager } from '../src/entities.js';
import { MobManager } from '../src/mobs.js';
import { MOB_LOOT } from '../src/mobLootData.js';
import { registry } from '../src/resourceRegistry.js';
import { SMELTING_RECIPES } from '../src/furnace.js';

/** A real manager with an injectable random, which is the seam the death drop rolls through. */
function fixture(roll = () => 0) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => 15,
  };
  const entities = new EntityManager(scene, world, sounds);
  const spawned = [];
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    random: roll,
  });
  // Record what the drop path spawns rather than building meshes for it.
  entities.spawnDroppedItem = (pos, id, isBlock, count) => { spawned.push({ id, isBlock, count }); };
  const player = {
    position: new THREE.Vector3(0, 3, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, player, spawned };
}

/**
 * What a drowned drops when it is actually killed.
 *
 * Not `getMobDeathDrops`: that returns the candidate rows and does **not** roll their chances -- the roll
 * happens in `updateDeath`, which is also what spawns them. So this drives the real path, the way the other
 * mob parity tests do: spawn one, kill it, and tick until its loot has been dropped.
 */
function killDrowned({ manager, player, spawned }, over = {}) {
  const drowned = manager.spawnMob('drowned', 0, 3, 0);
  Object.assign(drowned, over);
  manager.damageMob(drowned, 1000, null, false, player);
  for (let i = 0; i < 20 && !drowned.lootDropped; i++) manager.update(0.1, player);
  return spawned.map((drop) => drop.id);
}

/** One drowned killed with the given random and mob fields, returning what it dropped. */
const dropsWith = (roll, over = {}) => killDrowned(fixture(roll), over);

// --- the rows that were missing -------------------------------------------------

test('a drowned drops a nautilus shell and its trident', () => {
  const ids = dropsWith(() => 0);
  assert.ok(ids.includes('nautilus_shell'), `expected a nautilus shell, got ${ids.join(', ')}`);
  assert.ok(ids.includes('trident'), `expected a trident, got ${ids.join(', ')}`);
  // And the drops it always had are still there (rotten flesh is 0-2, so a roll of 0 may give none).
  assert.ok(ids.includes('copper_ingot'));
});

test("the chances are vanilla's, and a roll between them separates the two", () => {
  // 3% shell, 8.5% trident. A roll of 0.05 is past the shell and short of the trident.
  const mid = dropsWith(() => 0.05);
  assert.equal(mid.includes('nautilus_shell'), false, '5% is past the 3% shell');
  assert.equal(mid.includes('trident'), true, 'and short of the 8.5% trident');

  // Just inside each boundary.
  assert.equal(dropsWith(() => 0.0299).includes('nautilus_shell'), true);
  assert.equal(dropsWith(() => 0.0301).includes('nautilus_shell'), false);
  assert.equal(dropsWith(() => 0.0849).includes('trident'), true);
  assert.equal(dropsWith(() => 0.0851).includes('trident'), false);
});

test('Looting raises both, the way it raises every other chance row', () => {
  // The roll path adds `0.01 * level`, capped at one. A roll of 0.10 misses an 8.5% trident and hits it
  // with Looting III (0.085 + 0.03 = 0.115).
  assert.equal(dropsWith(() => 0.10).includes('trident'), false, 'without Looting');
  assert.equal(dropsWith(() => 0.10, { lootingLevel: 3 }).includes('trident'), true, 'with Looting III');
  // The shell moves the same way, from 3% to 6%.
  assert.equal(dropsWith(() => 0.05).includes('nautilus_shell'), false);
  assert.equal(dropsWith(() => 0.05, { lootingLevel: 3 }).includes('nautilus_shell'), true);
});

test('a drowned with noLoot drops none of it', () => {
  // `noLoot` suppresses the whole table, which is what a creeper that exploded or a mob that despawned on
  // peaceful relies on. The new rows must not be a way around it.
  const { manager, player, spawned } = fixture(() => 0);
  const drowned = manager.spawnMob('drowned', 0, 3, 0);
  drowned.noLoot = true;
  manager.damageMob(drowned, 1000, null, false, player);
  for (let i = 0; i < 20 && !drowned.lootDropped; i++) manager.update(0.1, player);
  assert.deepEqual(spawned, [], 'nothing at all');
});

// --- the two copies of the rule -------------------------------------------------

test('the generated loot data carries both rows, so the Inspector agrees with the game', () => {
  const published = MOB_LOOT.drowned ?? [];
  const ids = published.map((row) => row[0]);
  assert.ok(ids.includes('nautilus_shell'), `the loot data is missing the shell: ${JSON.stringify(published)}`);
  assert.ok(ids.includes('trident'), 'and the trident');
  // The published chance is where the game's roll gets it from, so they have to agree.
  assert.equal(published.find((row) => row[0] === 'nautilus_shell')[1], 0.03);
  assert.equal(published.find((row) => row[0] === 'trident')[1], 0.085);
});

test('the Inspector now finds a source for both, and the conduit is reachable', () => {
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES });
  for (const id of ['nautilus_shell', 'trident']) {
    const entry = reg.entries.get(id);
    assert.ok(entry, `${id} should be registered`);
    assert.ok(entry.lootFrom.some((source) => /drowned/i.test(String(source))),
      `${id} should be sourced from the drowned, got ${JSON.stringify(entry.lootFrom)}`);
  }
  // The shell is what a conduit is made of, which is why it mattered.
  const shell = reg.entries.get('nautilus_shell');
  assert.ok(shell.recipesAsIngredient.length >= 16, `expected the conduit recipes, found ${shell.recipesAsIngredient.length}`);
});

// --- gurgles, the baby drowned ---------------------------------------------------

test('about 5% of NATURAL drowned spawns are baby gurgles, and a summoned one never is', () => {
  // Wiki: baby drowned are "known as gurgles" and "make up 5% of drowned spawns". They are faster, worth 12
  // XP instead of 5, "remain babies indefinitely", and -- the part a drowned farm turns on -- the tutorial
  // notes baby zombies "don't drown because they're too short", so a gurgle never converts.
  //
  // The roll is gated on the NATURAL spawn flag, the way the sheep's colour roll is: `/summon drowned` and a
  // spawn egg must give an adult, and rolling unconditionally would make command spawns randomly baby.
  let gurgles = 0;
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world: { getVoxel: () => BLOCKS.AIR }, scene: new THREE.Scene(),
    sounds: new Proxy({}, { get: () => () => {} }),
    entities: new EntityManager(new THREE.Scene(), { getVoxel: () => BLOCKS.AIR }, new Proxy({}, { get: () => () => {} })),
    mobs: [], arrows: [], customProjectiles: [], textures: {}, isBlockSolid: () => false,
    random: Math.random,
  });
  const TRIES = 4000;
  for (let i = 0; i < TRIES; i++) {
    const mob = manager.spawnMob('drowned', 0, 1, 0, { natural: true });
    if (mob.isBaby) gurgles++;
    manager.mobs.pop();
  }
  const rate = gurgles / TRIES;
  assert.ok(rate > 0.03 && rate < 0.07,
    `expected roughly 5% gurgles, got ${gurgles} of ${TRIES} (${(rate * 100).toFixed(2)}%)`);

  let summoned = 0;
  for (let i = 0; i < 500; i++) {
    const mob = manager.spawnMob('drowned', 0, 1, 0);
    if (mob.isBaby) summoned++;
    manager.mobs.pop();
  }
  assert.equal(summoned, 0, 'a command-spawned drowned is never a baby');

  // A gurgle is smaller, which is what keeps its head out of a two-block water column.
  const baby = manager.spawnMob('drowned', 0, 1, 0, { isBaby: true });
  manager.mobs.pop();
  assert.equal(baby.isBaby, true);
  assert.ok(baby.height < 1.2, `a gurgle should be short, got height ${baby.height}`);
  assert.equal(baby.mesh.scale.x, 0.5, 'and drawn at half scale');
});


// --- wiki-parity gaps found by the bot pass ----------------------------------------

/** Count one item across many kills, with a real random so the ranges are exercised. */
function tally(over, item, kills = 600) {
  const counts = [];
  for (let i = 0; i < kills; i++) {
    const { manager, player, spawned } = fixture(Math.random);
    const drowned = manager.spawnMob('drowned', 0, 3, 0);
    Object.assign(drowned, over);
    manager.damageMob(drowned, 1000, null, false, player);
    for (let t = 0; t < 20 && !drowned.lootDropped; t++) manager.update(0.1, player);
    counts.push(spawned.filter((d) => d.id === item).reduce((n, d) => n + d.count, 0));
  }
  return counts;
}

test('rotten flesh is 0-2, and Looting III widens it to 0-5', () => {
  const base = tally({}, 'rotten_flesh');
  assert.equal(Math.min(...base), 0, 'wiki: "0-2", so none is possible');
  assert.equal(Math.max(...base), 2);
  const looted = tally({ lootingLevel: 3 }, 'rotten_flesh');
  assert.equal(Math.max(...looted), 5, 'wiki: up to 0-5 with Looting III');
});

test('copper ingots are 11%, 17% at Looting III, and only for a player kill', () => {
  // 0.12 is past the base 11% and inside Looting III's 17%.
  assert.equal(dropsWith(() => 0.10).includes('copper_ingot'), true);
  assert.equal(dropsWith(() => 0.12).includes('copper_ingot'), false);
  assert.equal(dropsWith(() => 0.12, { lootingLevel: 3 }).includes('copper_ingot'), true);
  assert.equal(dropsWith(() => 0.16, { lootingLevel: 3 }).includes('copper_ingot'), true);
  assert.equal(dropsWith(() => 0.18, { lootingLevel: 3 }).includes('copper_ingot'), false);

  // Killed by something other than the player (here: environmental damage), no copper at all.
  const { manager, spawned } = fixture(() => 0);
  const drowned = manager.spawnMob('drowned', 0, 3, 0);
  manager.damageMob(drowned, 1000, null, false, null);
  for (let i = 0; i < 20 && !drowned.lootDropped; i++) manager.update(0.1, { position: new THREE.Vector3(0, 3, 0) });
  assert.equal(spawned.some((d) => d.id === 'copper_ingot'), false, 'copper is a player-kill drop');
});

test('a gurgle drops the same loot as an adult (it used to drop nothing)', () => {
  const ids = dropsWith(() => 0, { isBaby: true });
  assert.ok(ids.includes('copper_ingot'), `a baby drowned must still drop loot, got [${ids.join(', ')}]`);
  assert.ok(ids.includes('nautilus_shell') && ids.includes('trident'));
});
