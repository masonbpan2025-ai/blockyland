import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { DoorManager, createDoorGeometry, createTrapdoorGeometry } from '../src/door.js';
import { Redstone } from '../src/redstone.js';
import { Inventory } from '../src/inventory.js';

test('Door block definitions and item entries exist with correct icon paths', () => {
  // Check Block IDs
  assert.ok(BLOCKS.OAK_DOOR, 'OAK_DOOR block ID exists');
  assert.ok(BLOCKS.IRON_DOOR, 'IRON_DOOR block ID exists');
  assert.ok(BLOCKS.DARK_OAK_DOOR, 'DARK_OAK_DOOR block ID exists');
  assert.ok(BLOCKS.OAK_TRAPDOOR, 'OAK_TRAPDOOR block ID exists');
  assert.ok(BLOCKS.IRON_TRAPDOOR, 'IRON_TRAPDOOR block ID exists');
  assert.ok(BLOCKS.DARK_OAK_TRAPDOOR, 'DARK_OAK_TRAPDOOR block ID exists');
  assert.ok(BLOCKS.OAK_DOOR_TOP, 'OAK_DOOR_TOP block ID exists');
  assert.ok(BLOCKS.IRON_DOOR_TOP, 'IRON_DOOR_TOP block ID exists');
  assert.ok(BLOCKS.DARK_OAK_DOOR_TOP, 'DARK_OAK_DOOR_TOP block ID exists');

  // Check Item entries
  assert.ok(ITEMS.oak_door, 'ITEMS.oak_door exists');
  assert.ok(ITEMS.iron_door, 'ITEMS.iron_door exists');
  assert.ok(ITEMS.dark_oak_door, 'ITEMS.dark_oak_door exists');
  assert.ok(ITEMS.oak_trapdoor, 'ITEMS.oak_trapdoor exists');
  assert.ok(ITEMS.iron_trapdoor, 'ITEMS.iron_trapdoor exists');
  assert.ok(ITEMS.dark_oak_trapdoor, 'ITEMS.dark_oak_trapdoor exists');

  assert.equal(ITEMS.oak_door.icon, '/assets/items/oak_door.png');
  assert.equal(ITEMS.iron_door.icon, '/assets/items/iron_door.png');
  assert.equal(ITEMS.dark_oak_door.icon, '/assets/items/dark_oak_door.png');
  assert.equal(ITEMS.oak_trapdoor.icon, '/assets/items/oak_trapdoor.png');
  assert.equal(ITEMS.iron_trapdoor.icon, '/assets/items/iron_trapdoor.png');
  assert.equal(ITEMS.dark_oak_trapdoor.icon, '/assets/items/dark_oak_trapdoor.png');

  // Check Block Defs icons & textures
  assert.equal(BLOCK_DEFS[BLOCKS.OAK_DOOR].icon, '/assets/items/oak_door.png');
  assert.equal(BLOCK_DEFS[BLOCKS.IRON_DOOR].icon, '/assets/items/iron_door.png');
  assert.equal(BLOCK_DEFS[BLOCKS.DARK_OAK_DOOR].icon, '/assets/items/dark_oak_door.png');
  assert.equal(BLOCK_DEFS[BLOCKS.DARK_OAK_DOOR].textures.bottom, 'dark_oak_door_bottom.png');
  assert.equal(BLOCK_DEFS[BLOCKS.DARK_OAK_DOOR].textures.top, 'dark_oak_door_top.png');
  assert.notEqual(BLOCK_DEFS[BLOCKS.DARK_OAK_DOOR].textures.all, 'dark_oak_planks.png');
  assert.equal(BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR].icon, '/assets/items/oak_trapdoor.png');
  assert.equal(BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR].icon, '/assets/items/iron_trapdoor.png');
  assert.equal(BLOCK_DEFS[BLOCKS.DARK_OAK_TRAPDOOR].icon, '/assets/items/dark_oak_trapdoor.png');
  assert.equal(BLOCK_DEFS[BLOCKS.DARK_OAK_TRAPDOOR].textures.all, 'dark_oak_trapdoor.png');

  // Check asset files on disk
  const assetsToCheck = [
    'public/assets/items/oak_door.png',
    'public/assets/items/iron_door.png',
    'public/assets/items/dark_oak_door.png',
    'public/assets/items/oak_trapdoor.png',
    'public/assets/items/iron_trapdoor.png',
    'public/assets/items/dark_oak_trapdoor.png',
    'public/assets/blocks/oak_door_top.png',
    'public/assets/blocks/oak_door_bottom.png',
    'public/assets/blocks/dark_oak_door_top.png',
    'public/assets/blocks/dark_oak_door_bottom.png',
    'public/assets/blocks/iron_door_top.png',
    'public/assets/blocks/iron_door_bottom.png',
    'public/assets/blocks/oak_trapdoor.png',
    'public/assets/blocks/iron_trapdoor.png',
    'public/assets/blocks/dark_oak_trapdoor.png'
  ];

  for (const p of assetsToCheck) {
    assert.ok(fs.existsSync(path.resolve(p)), `Asset exists on disk: ${p}`);
    const stat = fs.statSync(path.resolve(p));
    assert.ok(stat.size > 50, `Asset ${p} has non-empty valid content (size: ${stat.size})`);
  }
});

test('Dark oak door inventory representation uses door icon instead of plank texture', () => {
  const inventory = new Inventory();
  const meta = inventory.getItemMeta({ id: BLOCKS.DARK_OAK_DOOR, isBlock: true, count: 3 });
  assert.equal(meta.name, 'Dark Oak Door');
  assert.equal(meta.icon, '/assets/items/dark_oak_door.png');
  assert.notEqual(meta.icon, '/assets/blocks/dark_oak_planks.png');

  // Also check if item passed as string key 'dark_oak_door'
  const itemMeta = inventory.getItemMeta({ id: 'dark_oak_door', count: 3 });
  assert.equal(itemMeta.name, 'Dark Oak Door');
  assert.equal(itemMeta.icon, '/assets/items/dark_oak_door.png');
});

test('DoorManager places 2-block tall door and registers both halves', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);

  // Set ground below at y = 0
  mockWorld.setVoxel(5, 0, 5, BLOCKS.STONE);

  // Placing at y = 1 should occupy y = 1 (bottom) and y = 2 (top)
  const res = doorManager.placeDoor(mockWorld, [5, 1, 5], 3, false);
  assert.ok(res.success, 'Door placement succeeds');
  assert.equal(mockWorld.getVoxel(5, 1, 5), BLOCKS.OAK_DOOR, 'Bottom half is OAK_DOOR');
  assert.equal(mockWorld.getVoxel(5, 2, 5), BLOCKS.OAK_DOOR_TOP, 'Top half is OAK_DOOR_TOP');

  // Both halves reference the door
  const doorFromBottom = doorManager.getDoor(5, 1, 5);
  const doorFromTop = doorManager.getDoor(5, 2, 5);
  assert.ok(doorFromBottom, 'Door found via bottom half coordinates');
  assert.ok(doorFromTop, 'Door found via top half coordinates');
  assert.equal(doorFromBottom, doorFromTop, 'Both halves point to the same door object');
  assert.equal(doorFromBottom.open, false, 'Door starts closed');
});

test('DoorManager toggles oak door open and closed from either half', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
    },
    getChunk: () => ({ dirty: false })
  };

  let doorSoundPlayed = 0;
  const mockGame = {
    world: mockWorld,
    sounds: {
      playDoor: (open, isIron) => { doorSoundPlayed++; },
      playClick: () => {},
      playPlace: () => {}
    },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockWorld.setVoxel(10, 0, 10, BLOCKS.OAK_PLANKS);
  doorManager.placeDoor(mockWorld, [10, 1, 10], 0, false);

  // Toggle by clicking top half at y = 2
  const toggleRes1 = doorManager.toggleDoor(10, 2, 10);
  assert.ok(toggleRes1.success, 'Top half click succeeds');
  assert.equal(toggleRes1.open, true, 'Door is now open');
  assert.equal(mockWorld.getVoxel(10, 1, 10), BLOCKS.OAK_DOOR_OPEN, 'Bottom voxel is OAK_DOOR_OPEN');
  assert.equal(mockWorld.getVoxel(10, 2, 10), BLOCKS.OAK_DOOR_TOP_OPEN, 'Top voxel is OAK_DOOR_TOP_OPEN');
  assert.equal(doorSoundPlayed, 1, 'Door sound played on open');

  // Toggle by clicking bottom half at y = 1
  const toggleRes2 = doorManager.toggleDoor(10, 1, 10);
  assert.ok(toggleRes2.success, 'Bottom half click succeeds');
  assert.equal(toggleRes2.open, false, 'Door is now closed');
  assert.equal(mockWorld.getVoxel(10, 1, 10), BLOCKS.OAK_DOOR, 'Bottom voxel is OAK_DOOR');
  assert.equal(mockWorld.getVoxel(10, 2, 10), BLOCKS.OAK_DOOR_TOP, 'Top voxel is OAK_DOOR_TOP');
  assert.equal(doorSoundPlayed, 2, 'Door sound played on close');
});

test('Iron door cannot be opened by manual hand click, but opens with redstone', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockWorld.setVoxel(20, 0, 20, BLOCKS.STONE);
  doorManager.placeDoor(mockWorld, [20, 1, 20], 2, true);

  // Manual hand click without redstone
  const manualClick = doorManager.toggleDoor(20, 1, 20, false);
  assert.equal(manualClick.success, false, 'Manual click on iron door fails');
  assert.ok(manualClick.reason.includes('Redstone'), 'Provides helpful redstone explanation');
  assert.equal(doorManager.getDoor(20, 1, 20).open, false, 'Iron door stays closed');

  // Redstone power opens it
  const redstoneOpen = doorManager.setDoorOpen(20, 1, 20, true, true);
  assert.ok(redstoneOpen.success, 'Redstone successfully opens iron door');
  assert.equal(doorManager.getDoor(20, 1, 20).open, true, 'Iron door is now open');
  assert.equal(mockWorld.getVoxel(20, 1, 20), BLOCKS.IRON_DOOR_OPEN, 'Bottom half is IRON_DOOR_OPEN');
  assert.equal(mockWorld.getVoxel(20, 2, 20), BLOCKS.IRON_DOOR_TOP_OPEN, 'Top half is IRON_DOOR_TOP_OPEN');
});

test('Breaking either door half breaks companion half and spawns dropped item', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
    },
    getChunk: () => ({ dirty: false })
  };

  let droppedItem = null;
  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    entities: {
      spawnDroppedItem: (pos, item, isBlock, count) => {
        droppedItem = { item, isBlock, count };
      }
    },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockWorld.setVoxel(30, 0, 30, BLOCKS.STONE);
  doorManager.placeDoor(mockWorld, [30, 1, 30], 1, false);

  // Break top half
  const broken = doorManager.onBlockBroken(30, 2, 30);
  assert.ok(broken, 'Break handler succeeds');
  assert.equal(mockWorld.getVoxel(30, 1, 30), BLOCKS.AIR, 'Bottom half is cleared to AIR');
  assert.equal(mockWorld.getVoxel(30, 2, 30), BLOCKS.AIR, 'Top half is cleared to AIR');
  assert.equal(doorManager.getDoor(30, 1, 30), null, 'Door deregistered from bottom key');
  assert.equal(doorManager.getDoor(30, 2, 30), null, 'Door deregistered from top key');
  assert.deepEqual(droppedItem, { item: 'oak_door', isBlock: false, count: 1 }, '1 oak_door item dropped');
});

test('createDoorGeometry and createTrapdoorGeometry construct valid 3D geometries', () => {
  const doorBottomGeo = createDoorGeometry(false, 0, false, false);
  assert.ok(doorBottomGeo instanceof THREE.BufferGeometry, 'Door bottom geometry is a BufferGeometry');
  assert.ok(doorBottomGeo.attributes.position.count > 0, 'Door bottom geometry has vertices');
  assert.ok(doorBottomGeo.attributes.uv, 'Door bottom geometry has UVs');

  const doorTopGeo = createDoorGeometry(true, 1, true, true);
  assert.ok(doorTopGeo instanceof THREE.BufferGeometry, 'Door top geometry is a BufferGeometry');
  assert.ok(doorTopGeo.attributes.position.count > 0, 'Door top geometry has vertices');

  const trapdoorGeo = createTrapdoorGeometry(2, false, false);
  assert.ok(trapdoorGeo instanceof THREE.BufferGeometry, 'Trapdoor geometry is a BufferGeometry');
  assert.ok(trapdoorGeo.attributes.position.count > 0, 'Trapdoor geometry has vertices');
});

test('Oak door right-clicked to open STAYS open across subsequent redstone ticks without closing prematurely', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
      mockWorld.redstone?.notify(x, y, z);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockGame.doorManager = doorManager;
  mockWorld.doorManager = doorManager;

  const redstone = new Redstone(mockWorld);
  redstone.game = mockGame;
  mockWorld.redstone = redstone;

  // Place solid block at y = 0
  mockWorld.setVoxel(5, 0, 5, BLOCKS.STONE);

  // Place oak door at y = 1 (bottom = 5,1,5, top = 5,2,5)
  doorManager.placeDoor(mockWorld, [5, 1, 5], 3, false);
  assert.equal(doorManager.getDoor(5, 1, 5).open, false, 'Door is initially closed');

  // Player right clicks door to open it
  const toggleRes = doorManager.toggleDoor(5, 1, 5);
  assert.ok(toggleRes.success, 'Toggle succeeded');
  assert.equal(toggleRes.open, true, 'Door is opened by click');
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door manager reports open');
  assert.equal(mockWorld.getVoxel(5, 1, 5), BLOCKS.OAK_DOOR_OPEN, 'Bottom voxel is OAK_DOOR_OPEN');
  assert.equal(mockWorld.getVoxel(5, 2, 5), BLOCKS.OAK_DOOR_TOP_OPEN, 'Top voxel is OAK_DOOR_TOP_OPEN');

  // Simulate multiple redstone ticks (e.g. 10 ticks = 1 second)
  for (let t = 0; t < 10; t++) {
    redstone.tick();
  }

  // The door MUST STILL BE OPEN! (This proves it does not snap shut after a moment)
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door is STILL open after 10 redstone ticks');
  assert.equal(mockWorld.getVoxel(5, 1, 5), BLOCKS.OAK_DOOR_OPEN, 'Bottom voxel remains OAK_DOOR_OPEN');
  assert.equal(mockWorld.getVoxel(5, 2, 5), BLOCKS.OAK_DOOR_TOP_OPEN, 'Top voxel remains OAK_DOOR_TOP_OPEN');
});

test('Oak door right-clicked to close STAYS closed across subsequent redstone ticks', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
      mockWorld.redstone?.notify(x, y, z);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockGame.doorManager = doorManager;
  mockWorld.doorManager = doorManager;

  const redstone = new Redstone(mockWorld);
  redstone.game = mockGame;
  mockWorld.redstone = redstone;

  mockWorld.setVoxel(5, 0, 5, BLOCKS.STONE);
  doorManager.placeDoor(mockWorld, [5, 1, 5], 3, false);

  // Open then close by clicking
  doorManager.toggleDoor(5, 1, 5); // open
  doorManager.toggleDoor(5, 1, 5); // close
  assert.equal(doorManager.getDoor(5, 1, 5).open, false, 'Door closed by click');

  // Run redstone ticks
  for (let t = 0; t < 10; t++) {
    redstone.tick();
  }

  // Remains closed
  assert.equal(doorManager.getDoor(5, 1, 5).open, false, 'Door remains closed after redstone ticks');
  assert.equal(mockWorld.getVoxel(5, 1, 5), BLOCKS.OAK_DOOR, 'Bottom voxel remains OAK_DOOR');
  assert.equal(mockWorld.getVoxel(5, 2, 5), BLOCKS.OAK_DOOR_TOP, 'Top voxel remains OAK_DOOR_TOP');
});

test('Redstone power opens door and when power turns off it returns to manualOpen state', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
      mockWorld.redstone?.notify(x, y, z);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockGame.doorManager = doorManager;
  mockWorld.doorManager = doorManager;

  const redstone = new Redstone(mockWorld);
  redstone.game = mockGame;
  mockWorld.redstone = redstone;

  mockWorld.setVoxel(5, 0, 5, BLOCKS.STONE);
  mockWorld.setVoxel(5, 0, 4, BLOCKS.STONE);

  doorManager.placeDoor(mockWorld, [5, 1, 5], 3, false);
  assert.equal(doorManager.getDoor(5, 1, 5).open, false, 'Door starts closed');

  // Place lever at [5, 1, 4] adjacent to door
  mockWorld.setVoxel(5, 1, 4, BLOCKS.LEVER);
  const leverState = redstone.state([5, 1, 4]);
  leverState.on = true; // Lever turned ON
  redstone.tick();

  // Powered door opens
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door opened by powered lever');

  // Lever turned OFF
  leverState.on = false;
  redstone.tick();

  // Because manualOpen was false, door returns to closed!
  assert.equal(doorManager.getDoor(5, 1, 5).open, false, 'Door returns to closed when lever turns off');

  // Now, player manually opens the door
  doorManager.toggleDoor(5, 1, 5);
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door manually opened');

  // Lever turned ON and then OFF again
  leverState.on = true;
  redstone.tick();
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door remains open with lever on');

  leverState.on = false;
  redstone.tick();
  // Because manualOpen is true, door remains OPEN even after lever turns off!
  assert.equal(doorManager.getDoor(5, 1, 5).open, true, 'Door remains open after lever turns off because manualOpen is true');
});

test('Oak trapdoor right-clicked stays open across redstone ticks', () => {
  const voxelData = new Map();
  const mockWorld = {
    getVoxel: (x, y, z) => voxelData.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      if (id === BLOCKS.AIR) voxelData.delete(`${x},${y},${z}`);
      else voxelData.set(`${x},${y},${z}`, id);
      mockWorld.redstone?.notify(x, y, z);
    },
    getChunk: () => ({ dirty: false })
  };

  const mockGame = {
    world: mockWorld,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {}
  };

  const doorManager = new DoorManager(mockGame);
  mockGame.doorManager = doorManager;
  mockWorld.doorManager = doorManager;

  const redstone = new Redstone(mockWorld);
  redstone.game = mockGame;
  mockWorld.redstone = redstone;

  // Place oak trapdoor
  mockWorld.setVoxel(15, 1, 15, BLOCKS.OAK_TRAPDOOR);
  assert.equal(mockWorld.getVoxel(15, 1, 15), BLOCKS.OAK_TRAPDOOR, 'Trapdoor is placed');

  // Toggle open
  const toggleRes = doorManager.toggleTrapdoor(15, 1, 15);
  assert.ok(toggleRes.success, 'Trapdoor toggled');
  assert.equal(toggleRes.open, true, 'Trapdoor is open');
  assert.equal(mockWorld.getVoxel(15, 1, 15), BLOCKS.OAK_TRAPDOOR_OPEN, 'Voxel is OAK_TRAPDOOR_OPEN');

  // Redstone ticks
  for (let t = 0; t < 10; t++) {
    redstone.tick();
  }

  // Trapdoor stays open!
  assert.equal(mockWorld.getVoxel(15, 1, 15), BLOCKS.OAK_TRAPDOOR_OPEN, 'Trapdoor remains open after redstone ticks');
});
