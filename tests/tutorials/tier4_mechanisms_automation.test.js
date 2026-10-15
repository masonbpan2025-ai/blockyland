import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTutorialFixture } from './harness.js';
import { BLOCKS } from '../../src/blocks.js';

test('Tutorial 4.1: Basic Redstone Circuits - Signal decay, repeater delay/amplification, and NOT gate inverter', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // 1. Signal Decay over Redstone Wire line (16 blocks)
  // Bot lays wire from [1, 1, 0] to [16, 1, 0]
  f.inventory.addItem('redstone', false, 32);
  const wireResult = await f.runCommand('wire redstone from 1 1 0 to 16 1 0');
  assert.equal(wireResult.ok, true, `Wiring succeeded: ${wireResult.message}`);

  // Power source: Place lever at [0, 1, 0]
  f.world.setVoxel(0, 1, 0, BLOCKS.LEVER);
  const lever = f.world.redstone.state([0, 1, 0]);
  assert.ok(lever, 'Lever state initialized');
  lever.on = true;
  f.world.redstone.mark([0, 1, 0]);

  // Tick redstone
  for (let i = 0; i < 4; i++) f.world.redstone.tick([f.player]);

  // Signal decay parity checks:
  // Starts at 15 right next to power source
  assert.equal(f.world.redstone.state([1, 1, 0])?.power, 15, 'Signal is 15 at distance 1');
  // Decays by 1 each block down to 1 at distance 15
  assert.equal(f.world.redstone.state([15, 1, 0])?.power, 1, 'Signal decayed to 1 at distance 15');
  // Extinguishes to 0 at block 16
  assert.equal(f.world.redstone.state([16, 1, 0])?.power, 0, 'Signal is 0 at distance 16 (15-block transmission limit)');

  // 2. Repeater Amplification & Delay
  // Place Repeater at [15, 1, 0] facing East (dir 0 = +X) with 2-tick delay
  f.world.setVoxel(15, 1, 0, BLOCKS.REPEATER);
  f.world.redstone.configure([15, 1, 0], 0);
  const repeater = f.world.redstone.state([15, 1, 0]);
  repeater.delay = 2;
  f.world.setVoxel(16, 1, 0, BLOCKS.REDSTONE_WIRE);
  f.world.redstone.mark([15, 1, 0]);

  // Tick 1: Repeater is still in delay phase (output 0)
  f.world.redstone.tick([f.player]);
  assert.equal(repeater.output, 0, 'Repeater output is 0 before configured delay completes');

  // Tick 2: Repeater delay expires, amplifies signal back to 15!
  f.world.redstone.tick([f.player]);
  f.world.redstone.tick([f.player]);
  assert.equal(repeater.output, 15, 'Repeater output amplified signal back to 15');
  assert.equal(f.world.redstone.state([16, 1, 0])?.power, 15, 'Wire beyond repeater now carries full power 15');

  // 3. NOT Gate / Inverter (Torch inverts supporting solid block)
  f.world.setVoxel(5, 1, 5, BLOCKS.STONE); // solid supporting block
  f.world.setVoxel(5, 2, 5, BLOCKS.REDSTONE_TORCH); // torch on top
  const torch = f.world.redstone.state([5, 2, 5]);

  // When supporting stone is unpowered, torch output is 15
  f.world.redstone.tick([f.player]);
  assert.equal(torch?.output, 15, 'Unpowered NOT gate torch emits power 15');

  // Power the supporting stone block via lever at [4, 1, 5]
  f.world.setVoxel(4, 1, 5, BLOCKS.LEVER);
  const notLever = f.world.redstone.state([4, 1, 5]);
  notLever.on = true;
  f.world.redstone.mark([4, 1, 5]);

  for (let i = 0; i < 3; i++) f.world.redstone.tick([f.player]);
  assert.equal(torch?.output, 0, 'Powered supporting block turned torch OFF (output 0, inverted)');
});

test('Tutorial 4.2: Automatic Smelting - Top input hopper, side fuel hopper, and bottom collection chest', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // Place furnace at [5, 2, 5]
  f.world.setVoxel(5, 2, 5, BLOCKS.FURNACE);
  const furnace = f.game.furnaceManager.getOrCreateFurnace(5, 2, 5);

  // 1. Top Hopper at [5, 3, 5] pointing down (dir 3 = -Y) -> feeds furnace input
  f.world.setVoxel(5, 3, 5, BLOCKS.HOPPER);
  f.world.redstone.configure([5, 3, 5], 3);
  const topHopper = f.world.redstone.state([5, 3, 5]);
  topHopper.inventory = [{ id: 'raw_iron', isBlock: false, count: 2 }];

  // 2. Side Hopper at [4, 2, 5] pointing East (dir 0 = +X) -> feeds furnace fuel
  f.world.setVoxel(4, 2, 5, BLOCKS.HOPPER);
  f.world.redstone.configure([4, 2, 5], 0);
  const sideHopper = f.world.redstone.state([4, 2, 5]);
  sideHopper.inventory = [{ id: 'coal', isBlock: false, count: 2 }];

  // 3. Collection Chest at [6, 1, 5]
  f.game.chestManager.placeChest(f.world, [6, 1, 5], 0);

  // 4. Bottom Hopper at [5, 1, 5] pointing East (dir 0 = +X) into chest -> pulls furnace output
  f.world.setVoxel(5, 1, 5, BLOCKS.HOPPER);
  f.world.redstone.configure([5, 1, 5], 0);
  const bottomHopper = f.world.redstone.state([5, 1, 5]);

  // Run 4 ticks for item insertion into furnace
  for (let i = 0; i < 4; i++) f.world.redstone.tick([f.player]);
  assert.equal(furnace.input?.id, 'raw_iron', 'Top hopper inserted raw_iron into furnace input');
  assert.equal(furnace.fuel?.id, 'coal', 'Side hopper inserted coal into furnace fuel');

  // Smelt raw iron in furnace
  furnace.output = { id: 'iron_ingot', isBlock: false, count: 1 };
  furnace.input.count--;

  // Run 4 ticks for bottom hopper to pull output from furnace and push into chest
  for (let i = 0; i < 4; i++) f.world.redstone.tick([f.player]);
  assert.equal(bottomHopper.inventory[0]?.id, 'iron_ingot', 'Bottom hopper pulled iron_ingot from furnace');

  // Run next 4 ticks: hopper transfers iron_ingot into collection chest
  for (let i = 0; i < 4; i++) f.world.redstone.tick([f.player]);
  const chestItems = f.game.chestManager.getCombinedItems(6, 1, 5);
  const ironInChest = chestItems.find(i => i?.id === 'iron_ingot');
  assert.ok(ironInChest, 'Smelted iron ingot was automatically deposited into the collection chest');
  assert.equal(ironInChest.count, 1, 'Collection chest has 1 iron ingot');
});

test('Tutorial 4.3: Piston Contraptions - Sticky piston extension, block pushing, and pressure plate triggers', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // 1. Place Sticky Piston at [2, 1, 2] facing East (dir 0 = +X)
  f.world.setVoxel(2, 1, 2, BLOCKS.STICKY_PISTON);
  f.world.redstone.configure([2, 1, 2], 0);
  const piston = f.world.redstone.state([2, 1, 2]);

  // Place solid stone block in front at [3, 1, 2]
  f.world.setVoxel(3, 1, 2, BLOCKS.STONE);

  // Place Pressure Plate at [1, 1, 2] (adjacent to piston)
  f.world.setVoxel(1, 1, 2, BLOCKS.PRESSURE_PLATE);
  const plate = f.world.redstone.state([1, 1, 2]);

  // Step actor onto pressure plate at [1, 1, 2]
  const plateActor = { position: new THREE.Vector3(1.5, 1.05, 2.5) };
  for (let i = 0; i < 4; i++) f.world.redstone.tick([plateActor]);

  // Assertions: Plate active, piston extended, stone pushed to [4, 1, 2]
  assert.equal(plate.output, 15, 'Pressure plate output is 15 while stepped on');
  assert.equal(piston.extended, true, 'Sticky piston extended');
  assert.equal(f.world.getVoxel(4, 1, 2), BLOCKS.STONE, 'Stone block pushed to [4, 1, 2]');

  // Step actor off pressure plate and wait for release timeout (20 game ticks / 10 redstone ticks)
  for (let i = 0; i < 25; i++) f.world.redstone.tick([]);
  assert.equal(plate.output, 0, 'Pressure plate output reset to 0');
  assert.equal(piston.extended, false, 'Sticky piston retracted');
  assert.equal(f.world.getVoxel(3, 1, 2), BLOCKS.STONE, 'Sticky piston pulled stone block back to [3, 1, 2]');
  assert.equal(f.world.getVoxel(4, 1, 2), BLOCKS.AIR, 'Old pushed position [4, 1, 2] is air again');

  // 2. Push Limit Parity (12-block limit)
  // Place 13 consecutive stone blocks from [3, 2, 2] to [15, 2, 2]
  f.world.setVoxel(2, 2, 2, BLOCKS.PISTON);
  f.world.redstone.configure([2, 2, 2], 0);
  const p13 = f.world.redstone.state([2, 2, 2]);
  for (let x = 3; x <= 15; x++) f.world.setVoxel(x, 2, 2, BLOCKS.STONE);

  // Power piston with a redstone block behind it
  f.world.setVoxel(1, 2, 2, BLOCKS.REDSTONE_BLOCK);
  for (let i = 0; i < 4; i++) f.world.redstone.tick([]);

  // Piston must refuse to extend past 12 blocks
  assert.equal(p13.extended, false, 'Piston refused to push 13 blocks (12-block push limit enforced)');
});
