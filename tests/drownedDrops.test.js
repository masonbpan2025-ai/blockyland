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
  // And the drops it always had are still there.
  assert.ok(ids.includes('rotten_flesh'));
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
