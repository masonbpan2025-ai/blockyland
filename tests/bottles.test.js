// Filling a glass bottle with water: the root of every potion in the game.
//
// `brewing.js` declares all thirty-nine potions against a `water_bottle`. Nothing could produce one -- a
// search for `water_bottle` across `src/` finds consumers and no producer -- so the brewing stand was
// furniture and no potion, splash or lingering, was reachable in survival. The Resource Inspector showed it
// as one line: `water_bottle` with no source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { useGlassBottle, isGlassBottle, FILLED_BOTTLE } from '../src/bottles.js';
import { POTION_DATA, BASE_BREWING_RECIPES } from '../src/brewing.js';
import { registry } from '../src/resourceRegistry.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';

/** A world with one source block of the given id at the origin, and a water level to report. */
function fakeWorld(blockId, { level = 0 } = {}) {
  const voxels = new Map([[`0,0,0`, blockId]]);
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    getVoxel: (x, y, z) => (voxels.has(key(x, y, z)) ? voxels.get(key(x, y, z)) : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => voxels.set(key(x, y, z), id),
    getWaterLevel: () => level,
    getLavaLevel: () => 0,
  };
}

function fakeInventory(activeId, count = 1) {
  const added = [];
  return {
    inventory: {
      hotbar: [{ id: activeId, isBlock: false, count }],
      storage: [],
      activeSlot: 0,
      getActiveItem() { return this.hotbar[this.activeSlot] ?? null; },
      // `addItem` puts the item into the inventory as well as recording it. Without that the creative
      // branch's "do I already have one of these" check can never be satisfied, which is a property of this
      // fixture rather than of the game.
      addItem(id, isBlock, n) {
        added.push({ id, isBlock, count: n });
        this.storage.push({ id, isBlock, count: n });
        return true;
      },
      consumeActiveItem() {
        const item = this.hotbar[this.activeSlot];
        if (item) item.count -= 1;
        if (item && item.count <= 0) this.hotbar[this.activeSlot] = null;
      },
    },
    added,
  };
}

const hitAtOrigin = (blockId) => ({ x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 }, blockId });

// --- filling -------------------------------------------------------------------

test('a glass bottle on a water source becomes a water bottle', () => {
  assert.equal(isGlassBottle({ id: 'glass_bottle' }), true);
  assert.equal(isGlassBottle({ id: 'water_bottle' }), false, 'a full bottle is not fillable');
  assert.equal(isGlassBottle({ id: 'glass_bottle', isBlock: true }), false, 'and a block is not a bottle');

  const { inventory } = fakeInventory('glass_bottle');
  const world = fakeWorld(BLOCKS.WATER);
  const result = useGlassBottle(world, inventory, 'survival', hitAtOrigin(BLOCKS.WATER));
  assert.ok(result, 'the bottle should have filled');
  assert.equal(inventory.hotbar[0].id, FILLED_BOTTLE);
  assert.equal(FILLED_BOTTLE, 'water_bottle');
});

test('the water stays in the world, unlike a bucket', () => {
  // The one place this differs from `buckets.js`, and the reason it is a separate module: a bottle of water
  // from an ocean does not drain the ocean.
  const { inventory } = fakeInventory('glass_bottle');
  const world = fakeWorld(BLOCKS.WATER);
  useGlassBottle(world, inventory, 'survival', hitAtOrigin(BLOCKS.WATER));
  assert.equal(world.getVoxel(0, 0, 0), BLOCKS.WATER, 'the source block is untouched');
});

test('a stack of bottles gives one water bottle and keeps the rest', () => {
  const { inventory, added } = fakeInventory('glass_bottle', 3);
  useGlassBottle(fakeWorld(BLOCKS.WATER), inventory, 'survival', hitAtOrigin(BLOCKS.WATER));
  assert.equal(inventory.hotbar[0].id, 'glass_bottle', 'the stack is still glass bottles');
  assert.equal(inventory.hotbar[0].count, 2, 'one of them was used');
  assert.deepEqual(added.map((a) => a.id), ['water_bottle']);
});

test('flowing water gives nothing, and so does anything that is not water', () => {
  // Vanilla fills only from a source block.
  const flowing = fakeInventory('glass_bottle');
  assert.equal(useGlassBottle(fakeWorld(BLOCKS.WATER, { level: 4 }), flowing.inventory, 'survival', hitAtOrigin(BLOCKS.WATER)), false);
  assert.equal(flowing.inventory.hotbar[0].id, 'glass_bottle', 'and the bottle is unchanged');

  for (const blockId of [BLOCKS.AIR, BLOCKS.STONE, BLOCKS.CAULDRON]) {
    const { inventory } = fakeInventory('glass_bottle');
    assert.equal(useGlassBottle(fakeWorld(blockId), inventory, 'survival', hitAtOrigin(blockId)), false, `block ${blockId}`);
  }
  // A bucket is not a bottle.
  const wrongItem = fakeInventory('bucket');
  assert.equal(useGlassBottle(fakeWorld(BLOCKS.WATER), wrongItem.inventory, 'survival', hitAtOrigin(BLOCKS.WATER)), false);
  // And nothing at all is not a hit.
  const noHit = fakeInventory('glass_bottle');
  assert.equal(useGlassBottle(fakeWorld(BLOCKS.WATER), noHit.inventory, 'survival', null), false);
});

test('creative keeps the empty bottle and adds one filled bottle', () => {
  const { inventory, added } = fakeInventory('glass_bottle');
  useGlassBottle(fakeWorld(BLOCKS.WATER), inventory, 'creative', hitAtOrigin(BLOCKS.WATER));
  assert.equal(inventory.hotbar[0].id, 'glass_bottle', 'the empty bottle stays');
  assert.deepEqual(added.map((a) => a.id), ['water_bottle']);
  // Once only: a second dip does not add another, which is what the bucket does in creative as well.
  useGlassBottle(fakeWorld(BLOCKS.WATER), inventory, 'creative', hitAtOrigin(BLOCKS.WATER));
  assert.equal(added.length, 1, 'and not twice');
});

// --- the chain this unlocks -----------------------------------------------------

test('the brewing recipes are rooted at the bottle this fills', () => {
  // Every recipe in `brewing.js` names its input bottle, and the roots are the water bottle. If that id
  // ever changes, this fails rather than the potions quietly becoming unreachable again.
  const recipes = BASE_BREWING_RECIPES ?? [];
  assert.ok(recipes.length, 'there should be brewing recipes');
  const bottles = new Set(recipes.map((r) => r.bottle));
  assert.ok(bottles.has('water_bottle'), `the root bottle should be water_bottle, found ${[...bottles].join(', ')}`);
  assert.equal(POTION_DATA.water_bottle?.type, 'base', 'and it is a base potion');
});

test('the Inspector can see where a water bottle comes from', () => {
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES, interactions: INTERACTION_SOURCES });
  const entry = reg.entries.get('water_bottle');
  assert.ok(entry, 'water_bottle should be registered');
  assert.equal(entry.codeFrom.length, 1, 'and carry the one interaction source');
  assert.match(entry.codeFrom[0].source, /bottles\.js useGlassBottle/);
  // No data source, which is why it belongs in the interaction table at all.
  const dataSources = entry.recipesAsResult.length + entry.smeltingFrom.length + entry.brewingFrom.length
    + entry.lootFrom.length + entry.droppedBy.length + entry.smithingFrom.length;
  assert.equal(dataSources, 0);
  // And the first step of the chain is sourced from it, so the chain has a beginning.
  const awkward = reg.entries.get('awkward_potion');
  assert.ok(awkward.brewingFrom.some((r) => JSON.stringify(r).includes('water_bottle')),
    'an awkward potion should be brewed from a water bottle');
});
