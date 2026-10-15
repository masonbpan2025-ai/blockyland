import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { ChestManager } from '../src/chest.js';
import { FurnaceManager } from '../src/furnace.js';

function createTestWorld() {
  const w = new World();
  for (let x = -2; x < 5; x++) {
    for (let z = -2; z < 5; z++) {
      w.chunks.set(w.chunkKey(x, z), new Chunk(x, z));
    }
  }
  return w;
}

const put = (w, p, id, dir = 0) => {
  w.setVoxel(...p, id);
  w.redstone.configure(p, dir);
  return w.redstone.state(p);
};

const ticks = (w, n = 1, actors = []) => {
  for (let i = 0; i < n; i++) w.redstone.tick(actors);
};

test('Sticky Piston 1-tick pulse drops block, subsequent 1-tick pulse grabs it back (T-flip-flop)', () => {
  const w = createTestWorld();
  // Sticky piston at [0,2,0] facing East (+X, dir 0)
  const piston = put(w, [0, 2, 0], B.STICKY_PISTON, 0);
  put(w, [1, 2, 0], B.STONE); // normal solid block in front
  const lever = put(w, [-1, 2, 0], B.LEVER);

  // 1-tick pulse: power on for 1 tick, then off
  lever.on = true;
  ticks(w, 1);
  assert.equal(piston.extended, true);
  assert.equal(w.getVoxel(2, 2, 0), B.STONE);

  lever.on = false;
  ticks(w, 1);
  assert.equal(piston.extended, false);
  // Sticky piston dropped the block! Stone is left at [2,2,0]
  assert.equal(w.getVoxel(2, 2, 0), B.STONE);
  assert.equal(w.getVoxel(1, 2, 0), B.AIR);

  // Another 1-tick pulse: extends, touches stone at [2,2,0], then retracts grabbing it back
  lever.on = true;
  ticks(w, 2); // extended
  lever.on = false;
  ticks(w, 3); // longer off period
  assert.equal(piston.extended, false);
  assert.equal(w.getVoxel(1, 2, 0), B.STONE);
});

test('Pistons refuse immovable containers (Chests, Furnaces, Obsidian, Bedrock)', () => {
  for (const immovable of [B.OBSIDIAN, B.BEDROCK, B.CHEST, B.FURNACE]) {
    const w = createTestWorld();
    const p = put(w, [0, 2, 0], B.PISTON, 0);
    put(w, [1, 2, 0], immovable);
    const lever = put(w, [-1, 2, 0], B.LEVER);
    lever.on = true;
    ticks(w, 2);
    assert.equal(p.extended, false, `Piston should not push ${immovable}`);
    assert.equal(w.getVoxel(1, 2, 0), immovable);
  }
});

test('Hopper transfers items at 2.5 items/sec and respects redstone locking', () => {
  const w = createTestWorld();
  // Hopper at [2,2,2] facing East (dir 0) pointing into Dropper at [3,2,2]
  const hopper = put(w, [2, 2, 2], B.HOPPER, 0);
  const dropper = put(w, [3, 2, 2], B.DROPPER, 0);
  hopper.inventory = [{ id: 'iron_ingot', isBlock: false, count: 5 }];

  // Powered hopper (locked by lever)
  const lever = put(w, [2, 3, 2], B.LEVER);
  lever.on = true;
  ticks(w, 8); // 8 ticks = 2 transfer cycles if unlocked
  assert.equal(hopper.inventory[0].count, 5);
  assert.equal(dropper.inventory.length, 0, 'Locked hopper must not transfer items');

  // Unlock hopper
  lever.on = false;
  ticks(w, 4); // 4 ticks = 1 transfer cycle
  assert.equal(hopper.inventory[0].count, 4);
  assert.equal(dropper.inventory[0].count, 1);
  ticks(w, 4); // another 4 ticks
  assert.equal(hopper.inventory[0].count, 3);
  assert.equal(dropper.inventory[0].count, 2);
});

test('Hopper pushes into Chest and pulls from Chest above', () => {
  const w = createTestWorld();
  const chestMgr = new ChestManager({ world: w });
  w.redstone.game = { chestManager: chestMgr };

  // 1. Chest above hopper at [2,3,2]
  chestMgr.placeChest(w, [2, 3, 2]);
  chestMgr.addItem(2, 3, 2, 'diamond', false, 3);

  // Hopper at [2,2,2] facing East (dir 0)
  const hopper = put(w, [2, 2, 2], B.HOPPER, 0);

  // Chest in front of hopper at [3,2,2]
  chestMgr.placeChest(w, [3, 2, 2]);

  // Run 4 ticks: hopper pulls 1 diamond from chest above
  ticks(w, 4);
  assert.equal(hopper.inventory.length, 1);
  assert.equal(hopper.inventory[0].id, 'diamond');
  assert.equal(hopper.inventory[0].count, 1);

  // Run next 4 ticks: hopper pushes diamond into chest at [3,2,2] and pulls another from above
  ticks(w, 4);
  const destChestItems = chestMgr.getCombinedItems(3, 2, 2);
  const destCount = destChestItems.filter(Boolean).reduce((sum, i) => sum + i.count, 0);
  assert.equal(destCount, 1, 'Diamond should be pushed into destination chest');
});

test('Hopper interfaces with Furnace correctly: top -> input, side -> fuel, bottom pulls output', () => {
  const w = createTestWorld();
  const furnaceMgr = new FurnaceManager({ world: w });
  w.redstone.game = { furnaceManager: furnaceMgr };

  // Place furnace at [5,5,5]
  w.setVoxel(5, 5, 5, B.FURNACE);
  const furnace = furnaceMgr.getOrCreateFurnace(5, 5, 5);

  // 1. Hopper above [5,6,5] pointing down (dir 3 = -Y) -> inserts into furnace.input
  const topHopper = put(w, [5, 6, 5], B.HOPPER, 3);
  topHopper.inventory = [{ id: 'raw_iron', isBlock: false, count: 2 }];

  // 2. Hopper on side [4,5,5] pointing East (dir 0 = +X) -> inserts into furnace.fuel
  const sideHopper = put(w, [4, 5, 5], B.HOPPER, 0);
  sideHopper.inventory = [{ id: 'coal', isBlock: false, count: 2 }];

  // 3. Hopper below [5,4,5] pointing East -> pulls from furnace.output
  furnace.output = { id: 'iron_ingot', isBlock: false, count: 3 };
  const bottomHopper = put(w, [5, 4, 5], B.HOPPER, 0);

  ticks(w, 4);
  assert.equal(furnace.input?.id, 'raw_iron');
  assert.equal(furnace.input?.count, 1);
  assert.equal(furnace.fuel?.id, 'coal');
  assert.equal(furnace.fuel?.count, 1);
  assert.equal(bottomHopper.inventory[0]?.id, 'iron_ingot');
  assert.equal(bottomHopper.inventory[0]?.count, 1);
  assert.equal(furnace.output?.count, 2);
});

test('Hopper collects floating dropped items directly above it', () => {
  const w = createTestWorld();
  const hopper = put(w, [2, 2, 2], B.HOPPER, 0);
  const droppedItems = [
    {
      group: { position: new THREE.Vector3(2.5, 2.8, 2.5) },
      itemType: 'emerald',
      isBlock: false,
      count: 4
    }
  ];
  w.redstone.game = {
    entities: {
      droppedItems,
      itemVisuals: { release() {} },
      scene: { remove() {} }
    }
  };

  ticks(w, 1);
  assert.equal(hopper.inventory.length, 1);
  assert.equal(hopper.inventory[0].id, 'emerald');
  // Item entities are collected as a stack, unlike one-at-a-time container transfers.
  assert.equal(hopper.inventory[0].count, 4);
  assert.equal(droppedItems.length, 0);
});

test('Comparator accurately computes container fullness and reads through solid blocks', () => {
  const w = createTestWorld();
  const chestMgr = new ChestManager({ world: w });
  w.redstone.game = { chestManager: chestMgr };

  // Place Chest at [1,2,0]
  chestMgr.placeChest(w, [1, 2, 0]);
  // Comparator at [3,2,0] facing East (dir 0), with solid Stone at [2,2,0] in between
  put(w, [2, 2, 0], B.STONE);
  const comp = put(w, [3, 2, 0], B.COMPARATOR, 0);

  // Empty chest: comparator signal is 0
  ticks(w, 2);
  assert.equal(comp.output, 0);

  // Add 1 stack of 64 items out of 27*64 (1728 total):
  // Formula: floor(1 + (64 / 1728) * 14) = floor(1 + 0.518) = 1
  chestMgr.addItem(1, 2, 0, 'cobblestone', true, 64);
  ticks(w, 2);
  assert.equal(comp.output, 1, 'Comparator should read chest through solid block');

  // Fill half chest (~864 items): floor(1 + 0.5 * 14) = 8
  for (let i = 0; i < 12; i++) chestMgr.addItem(1, 2, 0, 'cobblestone', true, 64);
  ticks(w, 2);
  assert.equal(comp.output, 7);

  // Fill completely: signal 15
  for (let i = 0; i < 14; i++) chestMgr.addItem(1, 2, 0, 'cobblestone', true, 64);
  ticks(w, 2);
  assert.equal(comp.output, 15);
});

test('Dropper inserts into adjacent containers without dropping, or drops if in air', () => {
  const w = createTestWorld();
  let droppedSpawned = 0;
  w.redstone.game = {
    player: { position: new THREE.Vector3(0, 0, 0) },
    entities: {
      spawnDroppedItem() { droppedSpawned++; }
    }
  };

  // 1. Dropper facing air [0,2,0] facing East (dir 0)
  const dropperAir = put(w, [0, 2, 0], B.DROPPER, 0);
  dropperAir.inventory = [{ id: 'arrow', isBlock: false, count: 2 }];
  const lever1 = put(w, [0, 3, 0], B.LEVER);
  lever1.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(droppedSpawned, 1);
  assert.equal(dropperAir.inventory[0].count, 1);

  // 2. Dropper facing hopper [5,2,0] facing East (dir 0) into Hopper at [6,2,0]
  const dropperContainer = put(w, [5, 2, 0], B.DROPPER, 0);
  const targetHopper = put(w, [6, 2, 0], B.HOPPER, 0);
  dropperContainer.inventory = [{ id: 'gold_ingot', isBlock: false, count: 2 }];
  const lever2 = put(w, [5, 3, 0], B.LEVER);
  lever2.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  // Directly transferred into hopper without dropping
  assert.equal(dropperContainer.inventory[0].count, 1);
  assert.equal(targetHopper.inventory[0].id, 'gold_ingot');
  assert.equal(targetHopper.inventory[0].count, 1);
});

test('Dispenser contextual actions: buckets, sheep shearing and ejecting seeds', () => {
  const w = createTestWorld();
  let shearedSheep = false;
  let boneMealParticles = 0;

  const mockSheep = {
    type: 'sheep',
    isSheared: false,
    woolColor: 'pink',
    position: new THREE.Vector3(2.5, 2.0, 0.5)
  };

  w.redstone.game = {
    player: {
      position: new THREE.Vector3(0, 0, 0),
      gamemode: 'survival'
    },
    inventory: {
      armor: { head: null, chest: null, legs: null, feet: null }
    },
    mobs: {
      mobs: [mockSheep],
      spawnArrow() {}
    },
    entities: {
      spawnDroppedItem() {},
      spawnBoneMealParticles() { boneMealParticles++; }
    }
  };

  // 1. Water Bucket placement
  const dWater = put(w, [0, 2, 0], B.DISPENSER, 0); // facing East [1,2,0]
  dWater.inventory = [{ id: 'water_bucket', isBlock: false, count: 1 }];
  const l1 = put(w, [0, 3, 0], B.LEVER);
  l1.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(w.getVoxel(1, 2, 0), B.WATER);
  assert.equal(dWater.inventory[0].id, 'bucket');

  // 2. Empty Bucket scooping water
  const dBucket = put(w, [2, 2, 0], B.DISPENSER, 1); // facing West [1,2,0] which has water
  dBucket.inventory = [{ id: 'bucket', isBlock: false, count: 1 }];
  const l2 = put(w, [2, 3, 0], B.LEVER);
  l2.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(w.getVoxel(1, 2, 0), B.AIR);
  assert.equal(dBucket.inventory[0].id, 'water_bucket');

  // 3. Shearing sheep
  const dShear = put(w, [1, 2, 0], B.DISPENSER, 0); // facing [2,2,0] near mockSheep
  dShear.inventory = [{ id: 'shears', isBlock: false, count: 1 }];
  const l3 = put(w, [1, 3, 0], B.LEVER);
  l3.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(mockSheep.isSheared, true);

  // Dispensers eject seeds; they do not plant crops on farmland in Java.
  put(w, [4, 1, 0], B.FARMLAND); // farmland below front
  const dPlant = put(w, [3, 2, 0], B.DISPENSER, 0); // facing [4,2,0]
  dPlant.inventory = [{ id: 'wheat_seeds', isBlock: false, count: 3 }];
  const l4 = put(w, [3, 3, 0], B.LEVER);
  l4.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(w.getVoxel(4, 2, 0), B.AIR);
  assert.equal(dPlant.inventory[0].count, 2);
});

test('Target Block accuracy-dependent power outputs', () => {
  const w = createTestWorld();
  const target = put(w, [5, 2, 5], B.TARGET_BLOCK, 0);

  // Bullseye direct center hit
  w.redstone.hitTarget([5, 2, 5], new THREE.Vector3(5.5, 2.5, 5.5));
  ticks(w, 1);
  assert.equal(target.output, 15, 'Center hit should produce full power 15');

  // An arrow holds the target on for 20 game ticks (10 redstone ticks), then it drops.
  ticks(w, 10);
  assert.equal(target.output, 0);

  // Off-center edge hit (distance ~ 0.45)
  w.redstone.hitTarget([5, 2, 5], new THREE.Vector3(5.95, 2.95, 5.5));
  ticks(w, 1);
  assert.ok(target.output >= 1 && target.output <= 3, `Edge hit power should be 1-3, got ${target.output}`);
});

test('Tripwire Hook and string powers when entity crosses', () => {
  const w = createTestWorld();
  // Hook 1 at [0,2,0] facing East (dir 0)
  const hook1 = put(w, [0, 2, 0], B.TRIPWIRE_HOOK, 0);
  // String at [1,2,0] and [2,2,0]
  put(w, [1, 2, 0], B.TRIPWIRE);
  put(w, [2, 2, 0], B.TRIPWIRE);
  // Hook 2 at [3,2,0] facing West (dir 1)
  const hook2 = put(w, [3, 2, 0], B.TRIPWIRE_HOOK, 1);

  // No entity: hooks unpowered
  ticks(w, 2);
  assert.equal(hook1.output, 0);
  assert.equal(hook2.output, 0);

  // Player actor steps on string at [1,2,0]
  const player = { position: new THREE.Vector3(1.5, 2.05, 0.5) };
  ticks(w, 1, [player]);
  assert.equal(hook1.output, 15, 'Tripwire hook should power on entity trip');
  assert.equal(hook2.output, 15);

  // Actor moves away
  ticks(w, 1, []);
  assert.equal(hook1.output, 0);
  assert.equal(hook2.output, 0);
});

test('Dispenser equips armor onto player and ignites fire with flint and steel', () => {
  const w = createTestWorld();
  const player = {
    position: new THREE.Vector3(1.5, 2.0, 0.5),
    gamemode: 'survival'
  };
  const inventory = {
    armor: { head: null, chest: null, legs: null, feet: null }
  };
  w.redstone.game = { player, inventory, mobs: { spawnArrow() {} }, entities: { spawnDroppedItem() {} } };

  // 1. Dispenser at [0,2,0] facing East (dir 0) with diamond helmet
  const dArmor = put(w, [0, 2, 0], B.DISPENSER, 0);
  dArmor.inventory = [{ id: 'diamond_helmet', isBlock: false, count: 1 }];
  const l1 = put(w, [0, 3, 0], B.LEVER);
  l1.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(inventory.armor.head?.id, 'diamond_helmet', 'Dispenser should equip helmet onto player in front');
  assert.equal(dArmor.inventory.length, 0);

  // 2. Dispenser at [3,2,0] facing East (dir 0) into air at [4,2,0] with flint and steel
  const dFlint = put(w, [3, 2, 0], B.DISPENSER, 0);
  dFlint.inventory = [{ id: 'flint_and_steel', isBlock: false, count: 1 }];
  const l2 = put(w, [3, 3, 0], B.LEVER);
  l2.on = true;
  ticks(w, 4); // a dropper or dispenser fires 4 game ticks after it is powered
  assert.equal(w.getVoxel(4, 2, 0), B.FIRE, 'Flint and steel should light fire in front');
});

test('Note Block pitch tuning and instrument selection based on block below', () => {
  const w = createTestWorld();
  let playedOscType = null;
  const mockAudio = {
    soundEnabled: true,
    ensureContext() {},
    ctx: {
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createGain: () => ({
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {}
      }),
      createOscillator: () => ({
        type: '',
        frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
        set type(v) { playedOscType = v; }
      })
    }
  };
  w.redstone.game = { sounds: mockAudio };

  // Note block with Wood below -> Bass (sawtooth)
  put(w, [0, 1, 0], B.OAK_PLANKS);
  const nWood = put(w, [0, 2, 0], B.NOTE_BLOCK, 0);
  w.redstone.interact([0, 2, 0]); // tunes pitch and plays
  assert.equal(nWood.note, 1);
  assert.equal(playedOscType, 'sawtooth');

  // Note block with Stone below -> Bass drum (sine)
  put(w, [2, 1, 0], B.STONE);
  const nStone = put(w, [2, 2, 0], B.NOTE_BLOCK, 0);
  w.redstone.interact([2, 2, 0]);
  assert.equal(playedOscType, 'sine');

  // Note block with Glass below -> Clicks (square)
  put(w, [4, 1, 0], B.GLASS);
  const nGlass = put(w, [4, 2, 0], B.NOTE_BLOCK, 0);
  w.redstone.interact([4, 2, 0]);
  assert.equal(playedOscType, 'square');

  // Note block with Dirt below -> Harp (triangle)
  put(w, [6, 1, 0], B.DIRT);
  const nDirt = put(w, [6, 2, 0], B.NOTE_BLOCK, 0);
  w.redstone.interact([6, 2, 0]);
  assert.equal(playedOscType, 'triangle');
});

test('Daylight Detector responds to sky light and toggles inverted night detection', () => {
  const w = createTestWorld();
  const detector = put(w, [0, 2, 0], B.DAYLIGHT_DETECTOR, 0);

  // Full noon daylight (1.0) -> output 15
  w.redstone.daylight = 1.0;
  ticks(w, 1);
  assert.equal(detector.output, 15);

  // Midnight daylight (0.0) -> output 0
  w.redstone.daylight = 0.0;
  ticks(w, 1);
  assert.equal(detector.output, 0);

  // Toggle inverted mode
  w.redstone.interact([0, 2, 0]);
  assert.equal(detector.inverted, true);
  ticks(w, 1);
  assert.equal(detector.output, 15, 'Inverted detector at night should output 15');

  // Inverted at midday -> output 0
  w.redstone.daylight = 1.0;
  ticks(w, 1);
  assert.equal(detector.output, 0);
});

test('Item Sorter filter threshold: 22 items produces signal 1, 23 items produces signal 2', () => {
  const w = createTestWorld();
  // Hopper with 5 slots: 18 sorted items in slot 0, and 1 item in slots 1, 2, 3, 4 (total 22 items)
  const hopper = put(w, [0, 2, 0], B.HOPPER, 0);
  hopper.inventory = [
    { id: 'iron_ingot', isBlock: false, count: 18 },
    { id: 'stick', isBlock: false, count: 1 },
    { id: 'stick', isBlock: false, count: 1 },
    { id: 'stick', isBlock: false, count: 1 },
    { id: 'stick', isBlock: false, count: 1 }
  ];

  // Comparator reading hopper from behind
  const comp = put(w, [1, 2, 0], B.COMPARATOR, 0);
  ticks(w, 2);
  assert.equal(comp.output, 1, '22 items in hopper must produce comparator signal 1');

  // 23rd item enters hopper
  hopper.inventory[0].count = 19; // total 23 items
  ticks(w, 2);
  assert.equal(comp.output, 2, '23 items in hopper must trigger comparator signal 2 to unlock filter hopper below');
});

