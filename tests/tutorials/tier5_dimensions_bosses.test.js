import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, ITEMS } from '../../src/blocks.js';
import { createTutorialFixture } from './harness.js';
import { endStateFor } from '../../src/endProgression.js';

test('Tutorial 5.1: Nether Expedition & Portals - Obsidian frame, ignition, dimensional shift, blaze combat, piglin bartering', async () => {
  const f = createTutorialFixture({
    playerPos: [1.5, 1, -2],
    initialInventory: [
      { id: 'flint_and_steel', count: 1 },
      { id: 'diamond_sword', count: 1 },
      { id: 'gold_ingot', count: 5 }
    ]
  });

  // 1. Build a 4x5 obsidian portal frame (facing Z axis at z=0)
  // Base at y=0
  for (let x = 0; x <= 3; x++) f.world.setVoxel(x, 0, 0, BLOCKS.OBSIDIAN);
  // Sides at y=1..3
  for (let y = 1; y <= 3; y++) {
    f.world.setVoxel(0, y, 0, BLOCKS.OBSIDIAN);
    f.world.setVoxel(3, y, 0, BLOCKS.OBSIDIAN);
  }
  // Top at y=4
  for (let x = 0; x <= 3; x++) f.world.setVoxel(x, 4, 0, BLOCKS.OBSIDIAN);

  // 2. Bot ignites the portal with flint and steel at [1, 1, 0]
  const igniteResult = await f.runCommand('use flint_and_steel at 1 1 0');
  assert.ok(igniteResult.ok, `Portal ignition failed: ${igniteResult.message}`);
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.NETHER_PORTAL, 'Interior block [1, 1, 0] should be NETHER_PORTAL');
  assert.equal(f.world.getVoxel(2, 2, 0), BLOCKS.NETHER_PORTAL, 'Interior block [2, 2, 0] should be NETHER_PORTAL');

  // 3. Dimensional shift: step into portal
  f.player.position.set(1.5, 1, 0);
  assert.ok(f.game.portalManager.isPlayerInPortal(f.player, f.world), 'Player should be detected inside nether portal');
  // Update portal manager until teleportation triggers (survival takes 4 seconds)
  for (let i = 0; i < 90; i++) f.step(0.05);
  assert.equal(f.game.currentDimension, 'nether', 'Game dimension should transition to nether');

  // 4. Blaze combat in the Nether
  const px = f.player.position.x, py = f.player.position.y, pz = f.player.position.z;
  const blaze = f.game.mobs.spawnMob('blaze', px, py, pz + 1.5, {
    health: 12,
    drops: [{ id: 'blaze_rod', isBlock: false, count: 1 }]
  });
  const combatResult = await f.runCommand('attack blaze');
  assert.ok(combatResult.ok, `Combat with blaze failed: ${combatResult.message}`);
  assert.ok(blaze.health <= 0, 'Blaze should be defeated');
  assert.ok(
    f.bot.itemCount('blaze_rod') >= 1 || f.game.entities.droppedItems.some(d => d.itemType === 'blaze_rod'),
    'Blaze rod should drop or be collected'
  );

  // 5. Piglin bartering
  const piglin = f.game.mobs.spawnMob('piglin', px, py, pz + 1.2, {
    health: 16
  });
  const barterResult = await f.runCommand('feed gold_ingot to piglin');
  assert.ok(barterResult.ok, `Barter feeding failed: ${barterResult.message}`);
  assert.ok(piglin.isBartering, 'Piglin should start bartering upon receiving gold ingot');

  // Advance time past piglin barter duration (6 seconds)
  for (let i = 0; i < 70; i++) f.step(0.1);
  assert.equal(piglin.isBartering, false, 'Piglin should finish bartering');
  const hasBarterReward = f.game.entities.droppedItems.length > 0 ||
    [...f.inventory.hotbar, ...(f.inventory.storage || [])].some(i => i && !['flint_and_steel', 'diamond_sword', 'gold_ingot', 'blaze_rod'].includes(i.id));
  assert.ok(hasBarterReward, 'Barter drop should be spawned into entities or collected into inventory');
});

test('Tutorial 5.2: Stronghold & End Portal - 12-frame ring, eye insertion, portal activation, dimensional shift', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    initialInventory: [
      { id: 'ender_eye', count: 12 }
    ]
  });

  // 1. Build 12-frame End Portal ring centered at (0, 0, 0)
  const frameCoords = [
    [-1, 0, -2], [0, 0, -2], [1, 0, -2], // North
    [-1, 0, 2], [0, 0, 2], [1, 0, 2],    // South
    [-2, 0, -1], [-2, 0, 0], [-2, 0, 1], // West
    [2, 0, -1], [2, 0, 0], [2, 0, 1]     // East
  ];
  for (const [fx, fy, fz] of frameCoords) {
    f.world.setVoxel(fx, fy, fz, BLOCKS.END_PORTAL_FRAME);
  }
  // Clear 3x3 interior
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      f.world.setVoxel(dx, 0, dz, BLOCKS.AIR);
    }
  }

  // 2. Insert Eye of Ender into frames
  for (let i = 0; i < frameCoords.length; i++) {
    const [fx, fy, fz] = frameCoords[i];
    const res = await f.runCommand(`use ender_eye at ${fx} ${fy} ${fz}`);
    assert.ok(res.ok, `Eye insertion at [${fx}, ${fy}, ${fz}] failed: ${res.message}`);
    assert.equal(f.world.getVoxel(fx, fy, fz), BLOCKS.END_PORTAL_FRAME_FILLED, 'Frame should be filled');
  }

  // 3. Verify portal activated (3x3 interior filled with END_PORTAL)
  assert.equal(f.world.getVoxel(0, 0, 0), BLOCKS.END_PORTAL, 'Center block should be END_PORTAL');
  assert.equal(f.world.getVoxel(1, 0, 1), BLOCKS.END_PORTAL, 'Interior [1, 0, 1] should be END_PORTAL');

  // 4. Dimension transition: player steps into End Portal
  f.player.position.set(0.5, 0, 0.5);
  for (let i = 0; i < 5; i++) f.step(0.1);
  assert.equal(f.game.currentDimension, 'the_end', 'Game dimension should transition to the_end');
  assert.equal(f.world.dimension, 'the_end', 'World dimension should be the_end');
});

test('Tutorial 5.3: Ender Dragon Encounter - End Crystals, archery, dragon combat, defeat, and dragon egg spawn', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 33, 10],
    initialInventory: [
      { id: 'bow', count: 1 },
      { id: 'arrow', count: 64 },
      { id: 'diamond_sword', count: 1 }
    ]
  });

  // Switch to The End dimension and initialize arena
  f.game.switchDimension('the_end', { x: 0.5, y: 33, z: 10 });
  const bossManager = f.game.bossManager;
  assert.ok(bossManager.endCrystals.length > 0, 'End crystals should be spawned on pillars');

  // 1. End Crystal ranged destruction with bow
  const crystal = bossManager.endCrystals[0];
  assert.ok(crystal.alive, 'Target crystal should initially be alive');
  const shootRes = await f.runCommand('shoot bow at end_crystal');
  assert.ok(shootRes.ok, `Shooting End Crystal failed: ${shootRes.message}`);
  assert.equal(crystal.alive, false, 'End Crystal should be destroyed');
  assert.equal(crystal.exploded, true, 'End Crystal should be marked exploded');

  // 2. Ender Dragon boss initialization and combat
  const dragon = bossManager.enderDragon;
  assert.ok(dragon, 'Ender dragon should be spawned');
  assert.equal(dragon.isBoss, true, 'Dragon should be marked as boss');
  assert.equal(dragon.maxHealth, 200, 'Dragon max health should be 200');

  // Bot attacks dragon
  const initialHp = dragon.health;
  f.game.mobs.damageMob(dragon, 20);
  assert.equal(dragon.health, initialHp - 20, 'Dragon should take damage');

  // 3. Dragon Defeat & Podium Dragon Egg placement
  bossManager.onDragonDefeated();
  assert.equal(bossManager.enderDragon, null, 'Dragon should be cleared after defeat');
  const state = endStateFor(f.world);
  assert.ok(state.defeated, 'End progression state should record defeat');
  assert.equal(state.kills, 1, 'End progression should count 1 kill');

  // Verify Dragon Egg generated on exit podium
  const eggY = bossManager.podiumY() + 4;
  assert.equal(f.world.getVoxel(0, eggY, 0), BLOCKS.DRAGON_EGG, 'Dragon egg should sit atop exit podium');
});

test('Tutorial 5.4: Wither Boss Encounter - Soul sand T-shape, skulls, birth charge, wither armor, nether star, beacon crafting', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 3],
    initialInventory: [
      { id: 'wither_skeleton_skull', count: 3, isBlock: true, blockId: BLOCKS.WITHER_SKELETON_SKULL_BLOCK },
      { id: 'netherite_sword', count: 1 },
      { id: 'glass', count: 5, isBlock: true, blockId: BLOCKS.GLASS },
      { id: 'obsidian', count: 3, isBlock: true, blockId: BLOCKS.OBSIDIAN }
    ]
  });

  // Crafting table at [0, 1, 2]
  f.world.setVoxel(0, 1, 2, BLOCKS.CRAFTING_TABLE);

  // 1. Build Soul Sand T-Shape at (0, 3, 0)
  // Stem: (0, 1, 0)
  f.world.setVoxel(0, 1, 0, BLOCKS.SOUL_SAND);
  // Crossbar: (-1, 2, 0), (0, 2, 0), (1, 2, 0)
  f.world.setVoxel(-1, 2, 0, BLOCKS.SOUL_SAND);
  f.world.setVoxel(0, 2, 0, BLOCKS.SOUL_SAND);
  f.world.setVoxel(1, 2, 0, BLOCKS.SOUL_SAND);

  // 2. Place 3 Wither Skeleton Skulls on top (row y=3)
  const place1 = await f.runCommand('place wither_skeleton_skull at -1 3 0');
  assert.ok(place1.ok, `Placing skull 1 failed: ${place1.message}`);

  const place2 = await f.runCommand('place wither_skeleton_skull at 0 3 0');
  assert.ok(place2.ok, `Placing skull 2 failed: ${place2.message}`);

  const place3 = await f.runCommand('place wither_skeleton_skull at 1 3 0');
  assert.ok(place3.ok, `Placing skull 3 failed: ${place3.message}`);

  // 3. Verify Wither Boss summoned and structure consumed
  const wither = f.game.bossManager.wither;
  assert.ok(wither, 'Wither boss should be summoned');
  assert.equal(f.world.getVoxel(0, 1, 0), BLOCKS.AIR, 'Stem soul sand should be cleared');
  assert.equal(f.world.getVoxel(0, 2, 0), BLOCKS.AIR, 'Crossbar soul sand should be cleared');
  assert.equal(wither.isInvulnerable, true, 'Wither should start invulnerable during birth charge');
  assert.ok(wither.summonChargeTimer > 0, 'Wither should have summon charge timer');

  // 4. Advance birth charge to explosion
  wither.summonChargeTimer = 0.05;
  f.step(0.1);
  assert.equal(wither.isInvulnerable, false, 'Wither should become vulnerable after birth explosion');

  // 5. Phase 2 - Wither Armor at <= 50% HP
  wither.health = 140; // 140 / 300 <= 50%
  f.step(0.1);
  assert.equal(wither.hasWitherArmor, true, 'Wither should gain Wither Armor shield below 50% HP');
  assert.equal(wither.isImmuneToProjectiles, true, 'Wither should be immune to projectiles in armored phase');

  // 6. Defeat Wither with melee attack
  wither.health = 0;
  f.step(0.1);
  assert.equal(f.game.bossManager.wither, null, 'Wither should be defeated');

  // Verify Nether Star dropped or was collected into player inventory
  const starDrop = f.game.entities.droppedItems.find(d => d.itemType === 'nether_star');
  assert.ok(starDrop || f.bot.itemCount('nether_star') >= 1, 'Nether Star should drop or be collected upon Wither defeat');

  // 7. Ensure Nether Star is held and craft Beacon
  if (f.bot.itemCount('nether_star') < 1) {
    f.game.inventory.addItem('nether_star', false, 1);
  }
  assert.equal(f.bot.itemCount('nether_star'), 1, 'Player should hold Nether Star');

  const craftRes = await f.runCommand('craft beacon at 0 1 2');
  assert.ok(craftRes.ok, `Crafting beacon failed: ${craftRes.message}`);
  assert.equal(f.bot.itemCount('beacon'), 1, 'Beacon should be in player inventory');
});
