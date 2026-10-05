// The three items the game makes by hand, and the proof that it does.
//
// The inspector reads recipes, smelting, brewing, mob loot, block drops and the smithing table. Filling a
// bucket and milking a cow are none of those, so `water_bucket`, `lava_bucket` and `milk_bucket` were all
// reported as having no source -- true of those six tables, false about the game. Three false gaps make the
// other 178 lines of that report harder to trust, which is the whole reason this table exists.
//
// Every claim here is *executed*: `useBucket` is called with a fake world and asked for its replacement, and
// `AnimalBehaviors.interact` is called with a bucket and a cow and asked what it added. The table says what
// happens; these tests make the game say it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { useBucket } from '../src/buckets.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import { INTERACTION_SOURCES, INTERACTION_ITEMS } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';
import { breezeDrops } from '../src/breezeBehavior.js';
import { turtleMaturationDrops } from '../src/turtleBehavior.js';
import { variantBonusDrops } from '../src/undeadVariants.js';
import { updateArmadilloScutes } from '../src/armadilloBehavior.js';
import { EntityManager } from '../src/entities.js';
import { MobManager } from '../src/mobs.js';
import { registry } from '../src/resourceRegistry.js';
import { SMELTING_RECIPES } from '../src/furnace.js';

// Both tables of sources that live in code: what the player does by hand, and what a mob drops through a
// rule the pinned loot data does not carry. The registry takes them as one kind, so the guards below run
// over the combination rather than over half of it.
const ALL_CODE_SOURCES = [...INTERACTION_SOURCES, ...codeDropSources()];
const ALL_CODE_ITEMS = ALL_CODE_SOURCES.map((entry) => entry.item);

/** An inventory just real enough for `useBucket` and `interact`. */
function fakeInventory(activeId, { gamemode = 'survival' } = {}) {
  const added = [];
  const inventory = {
    hotbar: [{ id: activeId, isBlock: false, count: 1 }],
    storage: [],
    activeSlot: 0,
    gamemode,
    getActiveItem() { return this.hotbar[this.activeSlot] ?? null; },
    consumeActiveItem() { this.hotbar[this.activeSlot] = null; },
    addItem(id, isBlock, count) { added.push({ id, isBlock, count }); return true; },
  };
  return { inventory, added };
}

/** A world with one source block of the given id at the origin. */
function fakeWorld(blockId) {
  const levels = () => (blockId === BLOCKS.LAVA ? 0 : 0);
  const voxels = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    getVoxel: (x, y, z) => (voxels.has(key(x, y, z)) ? voxels.get(key(x, y, z)) : (x === 0 && y === 0 && z === 0 ? blockId : BLOCKS.AIR)),
    setVoxel: (x, y, z, id) => voxels.set(key(x, y, z), id),
    getWaterLevel: levels,
    getLavaLevel: levels,
    getOrCreateChunk: () => ({}),
    water: { onDisplace: () => {} },
  };
}

// --- the claims, executed ------------------------------------------------------

test('filling a bucket at a water source really gives a water bucket', () => {
  const { inventory } = fakeInventory('bucket');
  const world = fakeWorld(BLOCKS.WATER);
  const result = useBucket(world, inventory, 'survival', { x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 }, blockId: BLOCKS.WATER });
  assert.ok(result, 'useBucket should have acted');
  assert.equal(inventory.hotbar[0].id, 'water_bucket', 'and the bucket became a water bucket');
  // And it took the source away, which is what makes it a source rather than a duplicate.
  assert.equal(world.getVoxel(0, 0, 0), BLOCKS.AIR, 'the water source is consumed');
});

test('filling a bucket at a lava source really gives a lava bucket', () => {
  const { inventory } = fakeInventory('bucket');
  const world = fakeWorld(BLOCKS.LAVA);
  const result = useBucket(world, inventory, 'survival', { x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 }, blockId: BLOCKS.LAVA });
  assert.ok(result);
  assert.equal(inventory.hotbar[0].id, 'lava_bucket');
});

test('milking a cow with a bucket really gives a milk bucket', () => {
  const sounds = { playMilk: () => {} };
  const mobManager = { spawnParticleBurst: () => {} };
  const behaviours = new AnimalBehaviors(mobManager, fakeWorld(BLOCKS.AIR), sounds, {});
  const { inventory, added } = fakeInventory('bucket');
  const player = { gamemode: 'survival' };
  const cow = {
    type: 'cow', health: 10, isBaby: false,
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };
  const handled = behaviours.interact(cow, player, inventory);
  assert.equal(handled, true, 'the interaction should be handled');
  assert.deepEqual(added.map((a) => a.id), ['milk_bucket'], 'and it should add exactly one milk bucket');
  // A baby gives nothing: vanilla's rule, and the reason the branch checks for it.
  const baby = { ...cow, isBaby: true, mesh: { position: new THREE.Vector3(0, 0, 0) } };
  const second = fakeInventory('bucket');
  assert.equal(behaviours.interact(baby, player, second.inventory), false);
  assert.deepEqual(second.added, [], 'a baby cow gives no milk');
});

// --- drops that live in code rather than in the loot data -----------------------

/** The MobManager fixture the other parity tests use: real manager, no rendering. */
function mobFixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => 15,
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
  });
  const player = {
    position: new THREE.Vector3(0, 3, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, player };
}

test('the code-drop table is derived from the helpers, and lists what they return', () => {
  const entries = codeDropSources();
  const items = entries.map((e) => e.item).sort();
  // Pinned as a set: the derivation is what keeps it true, and this is what notices if a helper stops
  // returning an item or a new mob drop appears without being described.
  assert.deepEqual(items, [
    'armadillo_scute', 'breeze_rod', 'egg', 'nether_star', 'tipped_arrow_poison',
    'tipped_arrow_slowness', 'tipped_arrow_weakness', 'turtle_scute',
  ]);
  for (const entry of entries) {
    assert.match(entry.how, /^[A-Z].*\.$/, `${entry.item} should have a sentence describing the drop`);
    assert.match(entry.source, /^\S+\.js /, `${entry.item} should name a module`);
  }
  assert.equal(new Set(items).size, items.length, 'no duplicates');
});

test('each code drop is proved by running the code that makes it', () => {
  // Not "the table says so": the helpers are called and asked what they return. A helper that stopped
  // dropping its item would empty the derived table above, and this is the second, narrower check.
  assert.ok(breezeDrops({ type: 'breeze', lootingLevel: 0 }).some((r) => r[0] === 'breeze_rod'));
  assert.ok(turtleMaturationDrops({ type: 'turtle', isBaby: true }, { matured: true })
    .some((r) => r[0] === 'turtle_scute'));
  for (const [type, arrow] of [['stray', 'tipped_arrow_slowness'], ['bogged', 'tipped_arrow_poison'], ['parched', 'tipped_arrow_weakness']]) {
    // With credit and a roll that always succeeds.
    assert.ok(variantBonusDrops({ type, playerDamaged: true }, () => 0).some((r) => r[0] === arrow), type);
    // And without credit it gives nothing, which is vanilla's rule rather than an oversight.
    assert.deepEqual(variantBonusDrops({ type }, () => 0), [], `${type} without credit`);
  }

  // The two timed drops. An armadillo's shedding is a helper that reports the moment, so the helper is
  // executed: a timer part-way through gives nothing, and one at zero sheds. A chicken's egg is not a
  // helper at all -- it is a `spawnDroppedItem` call inside `AnimalBehaviors.update`, a loop broad enough
  // that driving it in a unit test would test the loop rather than the egg -- so the call site is asserted
  // instead, and that is the weaker of the proofs in this file. It is stated rather than glossed.
  assert.equal(updateArmadilloScutes({ type: 'armadillo', scuteTimer: 10 }, 1, () => 0), false, 'not yet');
  assert.equal(updateArmadilloScutes({ type: 'armadillo', scuteTimer: 0.5 }, 1, () => 0), true, 'and now');
  assert.equal(updateArmadilloScutes({ type: 'cow', scuteTimer: 0.5 }, 1, () => 0), false, 'only an armadillo');
  const mobsSource = readFileSync('src/mobs.js', 'utf8');
  assert.match(mobsSource, /updateArmadilloScutes\(mob, dt\)\)[\s\S]{0,160}'armadillo_scute'/,
    'and a true return is what spawns the scute');
  const animalSource = readFileSync('src/animalBehaviors.js', 'utf8');
  assert.match(animalSource, /mob\.type === 'chicken'[\s\S]{0,400}'egg'/,
    'a chicken should still lay an egg from its timer');

  // The nether star is the one entry that could not be derived, so it is proved here instead: a real
  // manager, asked what a wither drops.
  const { manager } = mobFixture();
  const rows = manager.getMobDeathDrops({ type: 'wither', health: 0 }, () => 0.5);
  assert.ok(rows.some((r) => r[0] === 'nether_star'), 'a wither should drop its nether star');
});

test('every claim names a file that exists and an export that is there', () => {
  // The anti-rot guard: a `source` string that names a deleted module, or a symbol that was renamed, would
  // otherwise leave the table claiming a source nothing implements -- exactly the failure mode it exists to
  // prevent. Only the module is checked for existence here; the three tests above are what prove behaviour.
  for (const entry of ALL_CODE_SOURCES) {
    assert.ok(entry.item && entry.how && entry.source, `${entry.item} should be fully described`);
    const file = entry.source.split(/\s+/)[0];
    assert.ok(existsSync(`src/${file}`), `${file} should exist, for ${entry.item}`);
    // And the symbol it names, when one is named, should still appear in that file.
    const symbol = entry.source.split(/\s+/)[1];
    if (symbol) {
      const body = readFileSync(`src/${file}`, 'utf8');
      const last = symbol.split('.').pop();
      assert.match(body, new RegExp(`\\b${last}\\b`), `${file} should still mention ${symbol}`);
    }
  }
  assert.equal(new Set(ALL_CODE_ITEMS).size, ALL_CODE_ITEMS.length, 'no duplicates');
  for (const id of ALL_CODE_ITEMS) assert.ok(registry().entries.get(id), `${id} should be a real item`);
});

test('the table only covers items nothing else produces', () => {
  // Without the interaction provider these three have no source of any other kind, which is why they are
  // here. If one of them gained a recipe or a drop, this table would be dead weight claiming credit.
  const bare = registry({ fresh: true, smelting: SMELTING_RECIPES });
  for (const id of ALL_CODE_ITEMS) {
    const entry = bare.entries.get(id);
    const dataSources = entry.recipesAsResult.length + entry.smeltingFrom.length + entry.brewingFrom.length
      + entry.lootFrom.length + entry.droppedBy.length + entry.smithingFrom.length;
    assert.equal(dataSources, 0, `${id} now has a data source, so it should leave interactionSources.js`);
  }
});

test('the registry records the interaction source, and has-source accepts it', () => {
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES, interactions: ALL_CODE_SOURCES });
  for (const id of ALL_CODE_ITEMS) {
    const entry = reg.entries.get(id);
    assert.equal(entry.codeFrom.length, 1, `${id} should carry exactly one coded source`);
    assert.match(entry.codeFrom[0].how, /\w/, 'and it should say where the item comes from');
  }
  // Nothing else claims to be made by hand, which would be inventing a source.
  const claimed = [...reg.entries.values()].filter((e) => e.codeFrom.length).map((e) => e.id).sort();
  assert.deepEqual(claimed, [...ALL_CODE_ITEMS].sort());
});
