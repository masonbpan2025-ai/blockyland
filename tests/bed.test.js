import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { BedManager, createBedGeometry } from '../src/bed.js';
import { RECIPES_3X3 } from '../src/crafting.js';

function setupWorld() {
  const world = new World();
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
    }
  }

  // Create solid ground at y = 10
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      world.setVoxel(x, 10, z, BLOCKS.STONE);
    }
  }

  const droppedItems = [];
  const chatMessages = [];
  const soundCalls = [];

  const fakeGame = {
    world,
    worldTime: 18000, // midnight by default for sleep tests
    weather: {
      weatherType: 'clear',
      setWeather(type) { this.weatherType = type; }
    },
    sky: {
      setTime(t) { fakeGame.worldTime = t; }
    },
    entities: {
      spawnDroppedItem: (pos, id, isBlock, count) => {
        droppedItems.push({ pos, id, isBlock, count });
      },
      spawnBlockParticles: () => {}
    },
    sounds: {
      playClick: () => soundCalls.push('click'),
      playPlace: (sound) => soundCalls.push(`place_${sound}`),
      playExplosion: () => soundCalls.push('explosion'),
      playBedBounce: () => soundCalls.push('bounce')
    },
    ui: {
      addChatMessage: (msg, type) => chatMessages.push({ msg, type })
    },
    mobs: {
      mobs: []
    },
    player: {
      position: new THREE.Vector3(0.5, 11, 0.5),
      velocity: new THREE.Vector3(),
      health: 12,
      maxHealth: 20,
      hunger: 15,
      isDead: false,
      isSleeping: false,
      spawnPosition: new THREE.Vector3(0, 20, 0),
      takeDamage(amount) { this.health = Math.max(0, this.health - amount); }
    },
    rebuildChunkMesh: () => {}
  };

  const bedManager = new BedManager(fakeGame);
  fakeGame.bedManager = bedManager;

  return { world, fakeGame, bedManager, droppedItems, chatMessages, soundCalls };
}

test('Bed registration and definitions in BLOCKS and ITEMS', () => {
  assert.ok(BLOCKS.RED_BED_FOOT, 'RED_BED_FOOT exists');
  assert.ok(BLOCKS.RED_BED_HEAD, 'RED_BED_HEAD exists');
  assert.equal(BLOCK_DEFS[BLOCKS.RED_BED_FOOT].bed, true);
  assert.equal(BLOCK_DEFS[BLOCKS.RED_BED_HEAD].bed, true);
  assert.equal(BLOCK_DEFS[BLOCKS.RED_BED_FOOT].dropItem, 'red_bed');
  assert.equal(BLOCK_DEFS[BLOCKS.RED_BED_HEAD].dropItem, 'red_bed');
  assert.ok(ITEMS.red_bed, 'red_bed item exists in ITEMS');
  assert.equal(ITEMS.red_bed.blockId, BLOCKS.RED_BED_FOOT);
});

test('Bed Crafting: 3 wool + 3 planks crafts red_bed', () => {
  const redBedRecipe = RECIPES_3X3.find(r => r.result?.id === 'red_bed');
  assert.ok(redBedRecipe, 'A crafting recipe for red_bed must exist');
});

test('Bed placement: requires solid ground and unobstructed space for 2 blocks', () => {
  const { world, bedManager } = setupWorld();

  // Try placing in the air without solid ground underneath:
  const airRes = bedManager.placeBed(world, [0, 15, 0], 3); // facing north
  assert.equal(airRes.success, false, 'Cannot place bed floating in air');

  // Ground is solid at y=10. Placing foot at [0, 11, 0] with head at [0, 11, -1]
  const validRes = bedManager.placeBed(world, [0, 11, 0], 3);
  assert.equal(validRes.success, true, 'Should successfully place bed on solid ground');
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.RED_BED_FOOT, 'Foot block placed');
  assert.equal(world.getVoxel(0, 11, -1), BLOCKS.RED_BED_HEAD, 'Head block placed');

  // Obstructed space: trying to place another bed on top of it fails
  const blockRes = bedManager.placeBed(world, [0, 11, 0], 3);
  assert.equal(blockRes.success, false, 'Cannot place bed when space is occupied');
});

test('Bed breaking: breaking either half destroys both and drops 1 red_bed item', () => {
  const { world, bedManager, droppedItems } = setupWorld();

  // Place bed
  bedManager.placeBed(world, [1, 11, 1], 3); // foot [1, 11, 1], head [1, 11, 0]
  assert.equal(world.getVoxel(1, 11, 1), BLOCKS.RED_BED_FOOT);
  assert.equal(world.getVoxel(1, 11, 0), BLOCKS.RED_BED_HEAD);

  // Break head
  bedManager.onBlockBroken(1, 11, 0);

  // Both should now be AIR
  assert.equal(world.getVoxel(1, 11, 0), BLOCKS.AIR, 'Head removed');
  assert.equal(world.getVoxel(1, 11, 1), BLOCKS.AIR, 'Foot companion removed');

  // Should have dropped exactly 1 red_bed item
  assert.equal(droppedItems.length, 1);
  assert.equal(droppedItems[0].id, 'red_bed');
  assert.equal(droppedItems[0].count, 1);
});

test('Bed sleeping: sets respawn point and checks night / daytime conditions', () => {
  const { world, fakeGame, bedManager, chatMessages } = setupWorld();

  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5); // close to bed

  // 1. Daytime test: worldTime = 6000 (midday)
  fakeGame.worldTime = 6000;
  const dayRes = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(dayRes.success, false);
  assert.ok(chatMessages.some(m => m.msg.includes('only at night or during thunderstorms')));
  // The respawn point DOES still bind when you click a bed in the day -- that is vanilla. What it must not do
  // is overwrite the WORLD spawn, which the old code did with `player.spawnPosition.copy(safeSpawn)`.
  assert.ok(chatMessages.some(m => m.msg.includes('Respawn point set')), 'Respawn point still sets on click');
  assert.ok(fakeGame.player.bedSpawnPosition, 'the bed binding is set');
  assert.equal(fakeGame.player.spawnPosition.x, 0, 'and the WORLD spawn is untouched');
  assert.equal(fakeGame.player.spawnPosition.y, 20);
  assert.equal(fakeGame.player.spawnPosition.z, 0);

  // 2. Thunderstorm during day allows sleep
  chatMessages.length = 0;
  fakeGame.weather.weatherType = 'thunder';
  const thunderRes = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(thunderRes.success, true, 'Can sleep during thunderstorm');
  assert.equal(bedManager.isSleeping, true);
  bedManager.leaveBed();
  fakeGame.weather.weatherType = 'clear';

  // 3. Night test: worldTime = 18000 (midnight)
  chatMessages.length = 0;
  fakeGame.worldTime = 18000;
  const nightRes = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(nightRes.success, true, 'Can sleep at night');
  assert.equal(bedManager.isSleeping, true);
  assert.equal(fakeGame.player.isSleeping, true);
});

test('Bed sleeping: monsters nearby prevent sleep', () => {
  const { world, fakeGame, bedManager, chatMessages } = setupWorld();

  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5);
  fakeGame.worldTime = 18000;

  // Add a hostile zombie 3 blocks away
  fakeGame.mobs.mobs.push({
    type: 'zombie',
    position: new THREE.Vector3(2.5, 11, 0.5)
  });

  const res = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(res.success, false);
  assert.ok(chatMessages.some(m => m.msg.includes('there are monsters nearby')));
  assert.equal(bedManager.isSleeping, false);
});

test('Bed in Nether: explodes on right click', () => {
  const { world, fakeGame, bedManager, soundCalls } = setupWorld();

  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5);
  fakeGame.world.selectedBiome = 'nether_wastes';
  fakeGame.currentDimension = 'nether';

  const res = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(res.exploded, true);
  assert.ok(soundCalls.includes('explosion'));
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.AIR, 'Bed destroyed in explosion');
  assert.ok(fakeGame.player.health < 20, 'Player damaged by nether bed explosion');
});

test('A bed explodes in the End too, by dimension rather than by biome name', () => {
  // The old test was `game.isNether || selectedBiome.includes('nether')`, so the End was never covered --
  // and a bed in a biome whose name merely contained "nether" would have detonated.
  const { world, fakeGame, bedManager, soundCalls } = setupWorld();
  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5);
  fakeGame.world.selectedBiome = 'the_end';
  fakeGame.currentDimension = 'the_end';

  const res = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(res.exploded, true, 'sleeping is not possible in the End');
  assert.ok(soundCalls.includes('explosion'));
});

test('An obstructed bed is refused rather than putting the player inside a block', () => {
  // `getSafeBedSpawn` used to fall back to `bed.position + 0.6 up`, which is inside the bed itself.
  const { world, fakeGame, bedManager, chatMessages } = setupWorld();
  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5);
  fakeGame.worldTime = 18000;

  // Wall the bed in on all eight sides.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    world.setVoxel(dx, 11, dz, BLOCKS.STONE);
    world.setVoxel(dx, 12, dz, BLOCKS.STONE);
  }
  const res = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(res.success, false);
  assert.ok(chatMessages.some(m => m.msg.includes('obstructed')), 'and says so');
  // `assert.ok`, not `assert.equal(..., null)`: this file's strict assert treats `undefined` and `null` as
  // different, and an unset field is `undefined`.
  assert.ok(!fakeGame.player.bedSpawnPosition, 'no binding is made to a bed you cannot use');
});

test('A bed out of reach does not become your respawn point', () => {
  // Reach used to be checked AFTER the binding, so a bed across the world still bound.
  const { world, fakeGame, bedManager } = setupWorld();
  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(100.5, 11, 100.5);

  const res = bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(res.success, false);
  assert.equal(res.reason, 'Bed is too far away');
  assert.ok(!fakeGame.player.bedSpawnPosition, 'and binds nothing');
});

test('Full sleep cycle: advances to the next morning and clears weather, but does NOT heal', () => {
  const { world, fakeGame, bedManager } = setupWorld();

  bedManager.placeBed(world, [0, 11, 0], 3);
  fakeGame.player.position.set(0.5, 11, 1.5);
  fakeGame.player.health = 8;
  fakeGame.player.hunger = 6;
  fakeGame.player.saturation = 0;
  fakeGame.worldTime = 18000;
  fakeGame.weather.weatherType = 'rain';

  bedManager.interact(0, 11, 0, fakeGame.player);
  assert.equal(bedManager.isSleeping, true);

  // Advance time past sleep duration (3.5s)
  bedManager.update(4.0);

  // Wakes up at dawn of the next day. This used to be 1000, which is mid-morning and skips the sunrise.
  assert.equal(bedManager.isSleeping, false);
  assert.equal(fakeGame.worldTime, 0, 'Time advanced to dawn of the next day');
  assert.equal(fakeGame.weather.weatherType, 'clear', 'Rain cleared after sleeping');

  // And this is the assertion the old test got backwards. Sleeping has never healed in Minecraft, and
  // asserting that it did is what kept the free full restore in the game.
  assert.equal(fakeGame.player.health, 8, 'Sleep does NOT restore health');
  assert.equal(fakeGame.player.hunger, 6, 'and does NOT feed you');
  assert.equal(fakeGame.player.saturation, 0);
});

test('Bed bouncing: negates fall damage and reflects velocity upwards by 66%', () => {
  const { fakeGame, bedManager, soundCalls } = setupWorld();

  fakeGame.player.velocity.y = -10.0;
  fakeGame.player.fallDistance = 8.0;

  const bounced = bedManager.handleBedBounce(fakeGame.player, BLOCKS.RED_BED_FOOT);
  assert.equal(bounced, true);
  assert.equal(fakeGame.player.fallDistance, 0, 'Fall damage negated');
  assert.ok(Math.abs(fakeGame.player.velocity.y - 6.6) < 0.01, 'Velocity bounced upwards at 66%');
  assert.ok(soundCalls.includes('bounce'));
});

test('createBedGeometry produces valid 3D BufferGeometry', () => {
  const footGeo = createBedGeometry(false, 3, null);
  const headGeo = createBedGeometry(true, 3, null);
  assert.ok(footGeo.attributes.position);
  assert.ok(headGeo.attributes.position);
  assert.ok(footGeo.attributes.uv);
  assert.ok(headGeo.attributes.color);
});
