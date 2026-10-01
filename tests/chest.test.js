import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { ChestManager, createChestGeometry } from '../src/chest.js';
import { RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { Inventory } from '../src/inventory.js';

function setupWorld() {
  const world = new World();
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
    }
  }

  // Create ground at y = 10
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      world.setVoxel(x, 10, z, BLOCKS.STONE);
    }
  }

  const droppedItems = [];
  const soundCalls = [];

  const fakeGame = {
    world,
    entities: {
      spawnDroppedItem: (pos, id, isBlock, count) => {
        droppedItems.push({ pos, id, isBlock, count });
      }
    },
    sounds: {
      playClick: () => soundCalls.push('click'),
      playChestOpen: () => soundCalls.push('chest_open'),
      playChestClose: () => soundCalls.push('chest_close')
    },
    ui: {
      openChest: (x, y, z) => {},
      closeChestModal: () => {}
    },
    rebuildChunkMesh: () => {}
  };

  const chestManager = new ChestManager(fakeGame);
  fakeGame.chestManager = chestManager;

  return { world, fakeGame, chestManager, droppedItems, soundCalls };
}

test('Chest registration in BLOCKS, BLOCK_DEFS, and ITEMS', () => {
  assert.ok(BLOCKS.CHEST, 'BLOCKS.CHEST exists');
  assert.equal(BLOCK_DEFS[BLOCKS.CHEST].chest, true);
  assert.equal(BLOCK_DEFS[BLOCKS.CHEST].transparent, true);
  assert.equal(BLOCK_DEFS[BLOCKS.CHEST].solid, true);
  assert.equal(BLOCK_DEFS[BLOCKS.CHEST].dropItem, 'chest');
  assert.ok(ITEMS.chest, 'chest item exists in ITEMS');
  assert.equal(ITEMS.chest.blockId, BLOCKS.CHEST);
});

test('Chest Crafting: 8 Planks in hollow 3x3 crafts Chest', () => {
  const grid = [
    { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 },
    { id: BLOCKS.OAK_PLANKS, count: 1 }, null,                                { id: BLOCKS.OAK_PLANKS, count: 1 },
    { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 }
  ];
  const recipeResult = findMatchingRecipe(grid, 3, 3, RECIPES_3X3);
  assert.ok(recipeResult, 'Recipe for chest exists');
  assert.equal(recipeResult.id, BLOCKS.CHEST);
  assert.equal(recipeResult.count, 1);
});

test('Chest 3D Geometry: createChestGeometry produces valid BufferGeometry', () => {
  const singleGeo = createChestGeometry(false, false, 0, null);
  assert.ok(singleGeo, 'Single chest geometry created');
  assert.ok(singleGeo.attributes.position.count > 0, 'Single chest has vertices');

  const doubleLeftGeo = createChestGeometry(true, true, 2, null);
  assert.ok(doubleLeftGeo, 'Double chest left half created');
  assert.ok(doubleLeftGeo.attributes.position.count > 0, 'Double chest has vertices');

  const doubleRightGeo = createChestGeometry(true, false, 2, null);
  assert.ok(doubleRightGeo, 'Double chest right half created');
  assert.ok(doubleRightGeo.attributes.position.count > 0, 'Double chest has vertices');
});

test('Single Chest: placement, storage slots, and opening', () => {
  const { world, chestManager, fakeGame } = setupWorld();

  const chest = chestManager.placeChest(world, [0, 11, 0], 2); // facing North
  assert.ok(chest, 'Chest was placed');
  assert.equal(chest.isDouble, false, 'Is single chest');
  assert.equal(chest.items.length, 27, 'Single chest has 27 slots');
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.CHEST, 'World voxel set to CHEST');

  // Can open when unobstructed
  assert.equal(chestManager.canOpen(0, 11, 0, world), true, 'Unobstructed chest can open');
});

test('Double Chest: adjacent compatible chests automatically link into 54 slots', () => {
  const { world, chestManager } = setupWorld();

  // Facing North (2). Perpendicular is East (+X) and West (-X).
  const chest1 = chestManager.placeChest(world, [0, 11, 0], 2);
  const chest2 = chestManager.placeChest(world, [1, 11, 0], 2);

  assert.equal(chest1.isDouble, true, 'First chest converted to double chest');
  assert.equal(chest2.isDouble, true, 'Second chest converted to double chest');
  assert.deepEqual(chest1.partnerPos, [1, 11, 0], 'First chest partner position is chest 2');
  assert.deepEqual(chest2.partnerPos, [0, 11, 0], 'Second chest partner position is chest 1');
  assert.notEqual(chest1.isLeft, chest2.isLeft, 'One chest is left and one is right');

  const combinedItems = chestManager.getCombinedItems(0, 11, 0);
  assert.equal(combinedItems.length, 54, 'Double chest provides 54 combined slots');
});

test('Obstruction checking: opaque solid block directly above prevents opening', () => {
  const { world, chestManager } = setupWorld();

  chestManager.placeChest(world, [0, 11, 0], 0);

  // AIR above: opens
  assert.equal(chestManager.canOpen(0, 11, 0, world), true);

  // Transparent block (e.g. GLASS) above: opens
  world.setVoxel(0, 12, 0, BLOCKS.GLASS);
  assert.equal(chestManager.canOpen(0, 11, 0, world), true, 'Transparent glass above allows chest to open');

  // Solid opaque block (e.g. STONE) above: blocked!
  world.setVoxel(0, 12, 0, BLOCKS.STONE);
  assert.equal(chestManager.canOpen(0, 11, 0, world), false, 'Solid opaque stone above prevents chest opening');
});

test('Breaking Single Chest: drops all 27 stored items', () => {
  const { world, chestManager, droppedItems } = setupWorld();

  const chest = chestManager.placeChest(world, [2, 11, 2], 0);
  chest.items[0] = { id: 'diamond', isBlock: false, count: 10 };
  chest.items[5] = { id: 'iron_ingot', isBlock: false, count: 64 };

  chestManager.onBlockBroken(2, 11, 2);

  assert.equal(chestManager.getChest(2, 11, 2), null, 'Chest removed from manager');
  assert.equal(droppedItems.length, 2, 'Both stored item stacks were dropped');
  assert.equal(droppedItems[0].id, 'diamond');
  assert.equal(droppedItems[0].count, 10);
  assert.equal(droppedItems[1].id, 'iron_ingot');
  assert.equal(droppedItems[1].count, 64);
});

test('Breaking Double Chest half: unlinks partner, partner reverts to 27 slots with its items preserved', () => {
  const { world, chestManager, droppedItems } = setupWorld();

  const chest1 = chestManager.placeChest(world, [0, 11, 0], 2);
  const chest2 = chestManager.placeChest(world, [1, 11, 0], 2);

  chest1.items[0] = { id: 'gold_ingot', isBlock: false, count: 12 };
  chest2.items[0] = { id: 'emerald', isBlock: false, count: 8 };

  // Break chest 1
  chestManager.onBlockBroken(0, 11, 0);

  // Dropped items should only be chest 1's items
  assert.equal(droppedItems.length, 1);
  assert.equal(droppedItems[0].id, 'gold_ingot');
  assert.equal(droppedItems[0].count, 12);

  // Chest 2 should now be a single chest retaining its emeralds
  const remaining = chestManager.getChest(1, 11, 0);
  assert.ok(remaining, 'Partner chest still exists');
  assert.equal(remaining.isDouble, false, 'Partner reverted to single chest');
  assert.equal(remaining.partnerPos, null, 'Partner unlinked');
  assert.equal(remaining.items[0].id, 'emerald', 'Partner retained stored items');
  assert.equal(remaining.items[0].count, 8);
  assert.equal(chestManager.getCombinedItems(1, 11, 0).length, 27, 'Now has 27 slots');
});

test('Redstone Comparator Signal: outputs 0 to 15 based on container fullness', () => {
  const { world, chestManager } = setupWorld();

  const chest = chestManager.placeChest(world, [0, 11, 0], 0);

  // Empty: 0
  assert.equal(chestManager.getRedstoneSignal(0, 11, 0), 0, 'Empty chest signal is 0');

  // 1 item: 1
  chest.items[0] = { id: 'cobblestone', isBlock: true, count: 1 };
  assert.equal(chestManager.getRedstoneSignal(0, 11, 0), 1, '1 item gives signal 1');

  // Full 27 slots of 64 items: 15
  for (let i = 0; i < 27; i++) {
    chest.items[i] = { id: 'cobblestone', isBlock: true, count: 64 };
  }
  assert.equal(chestManager.getRedstoneSignal(0, 11, 0), 15, 'Completely full chest gives signal 15');
});

test('Quick Transfer: moving items between Chest and Player inventory', () => {
  const { world, chestManager } = setupWorld();
  const inv = new Inventory({ playClick: () => {} });

  const chest = chestManager.placeChest(world, [0, 11, 0], 0);

  const fakeUI = {
    inv,
    game: { chestManager }
  };

  // Mock UI methods
  fakeUI.quickMoveChestToPlayer = (x, y, z, slotIdx) => {
    const item = chestManager.getCombinedSlot(x, y, z, slotIdx);
    if (!item) return;
    const added = inv.addItem(item.id, item.isBlock, item.count);
    if (added) {
      chestManager.setCombinedSlot(x, y, z, slotIdx, null);
    }
  };

  fakeUI.quickMoveToChest = (list, slotIdx, x, y, z) => {
    const item = list[slotIdx];
    if (!item) return;
    const items = chestManager.getCombinedItems(x, y, z);
    for (let i = 0; i < items.length; i++) {
      if (!items[i]) {
        chestManager.setCombinedSlot(x, y, z, i, { ...item });
        list[slotIdx] = null;
        return;
      }
    }
  };

  // 1. Move player item from hotbar to chest
  inv.hotbar[1] = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  fakeUI.quickMoveToChest(inv.hotbar, 1, 0, 11, 0);
  assert.equal(inv.hotbar[1], null, 'Hotbar slot emptied');
  assert.equal(chest.items[0].id, 'diamond_pickaxe', 'Chest slot 0 received pickaxe');

  // 2. Move item from chest back to player inventory
  chest.items[5] = { id: 'golden_apple', isBlock: false, count: 16 };
  fakeUI.quickMoveChestToPlayer(0, 11, 0, 5);
  assert.equal(chest.items[5], null, 'Chest slot 5 emptied');
  const foundInPlayer = inv.hotbar.concat(inv.storage).some(slot => slot && slot.id === 'golden_apple' && slot.count === 16);
  assert.ok(foundInPlayer, 'Player received golden apples');
});

