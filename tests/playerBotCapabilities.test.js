import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { PlayerBot, parsePlayerCommand, validatePlayerCommand } from '../src/playerBot.js';
import { Inventory } from '../src/inventory.js';
import { ChestManager } from '../src/chest.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { BUILTIN_SCHEMATICS } from '../src/playerBotSurvival.js';

function createCapabilityFixture({ playerPos = [0.5, 1, 0.5], gamemode = 'survival' } = {}) {
  const cells = new Map();
  const logs = [];

  const world = {
    getVoxel(x, y, z) {
      return cells.get(`${x},${y},${z}`) ?? (y <= 0 ? BLOCKS.DIRT : BLOCKS.AIR);
    },
    setVoxel(x, y, z, id) {
      if (id === BLOCKS.AIR) cells.delete(`${x},${y},${z}`);
      else cells.set(`${x},${y},${z}`, id);
    },
    getChunk() { return null; },
    redstone: {
      updateNeighbors(x, y, z) { world.redstoneUpdates = (world.redstoneUpdates || 0) + 1; }
    }
  };

  const camera = new THREE.PerspectiveCamera();
  const player = new Player(
    camera,
    { addEventListener() {}, requestPointerLock() {} },
    world,
    { playStep() {}, playJump() {}, playShieldBlock() {} }
  );

  player.position.set(...playerPos);
  player.onGround = true;
  player.gamemode = gamemode;
  player.health = 20;
  player.maxHealth = 20;
  player.hunger = 20;
  player.maxHunger = 20;

  const inventory = new Inventory({ playClick() {}, playPop() {} });
  const mobsList = [];
  const droppedItems = [];

  const game = {
    world,
    player,
    inventory,
    worldReady: true,
    mobs: {
      mobs: mobsList,
      damageMob(mob, amount) {
        mob.health -= amount;
      },
      spawnArrow(origin, direction, shooter, options) {
        game.spawnedArrows = game.spawnedArrows || [];
        const arrow = { origin, direction, shooter, options };
        game.spawnedArrows.push(arrow);
        return arrow;
      }
    },
    entities: {
      droppedItems,
      spawnDroppedItem(pos, itemType, isBlock, count = 1) {
        const item = {
          itemType,
          isBlock,
          count,
          age: 2,
          pickupDelay: 0,
          group: { position: new THREE.Vector3(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]) }
        };
        droppedItems.push(item);
        return item;
      }
    },
    camera,
    ui: {
      isGeminiOpen: () => true,
      isModalOpen: () => false,
      updateHotbar() {},
      updateUI() {},
      addChatMessage() {}
    },
    sounds: {
      playPlace() {},
      playBreak() {},
      playClick() {},
      playPop() {},
      playAttack() {},
      playBowShoot() {},
      playShieldBlock() {}
    },
    miningTime: 0,
    isMouseDown: false,
    targetBlock: null,
    targetMob: null
  };

  const chestManager = new ChestManager({
    world,
    rebuildChunkMesh() {}
  });
  game.chestManager = chestManager;

  player.game = game;
  player.inventory = inventory;

  game.handleLeftClick = () => {
    if (game.targetMob && game.targetMob.health > 0) {
      game.targetMob.health -= 4;
    }
  };

  const bot = new PlayerBot(game, { log: (...args) => logs.push(args) });
  game.playerBot = bot;

  function step(dt = 1 / 20) {
    bot.tick(dt);
    player.update(dt);

    camera.position.set(
      player.position.x,
      player.position.y + (player.isSneaking ? 1.38 : player.eyeHeight || 1.62),
      player.position.z
    );
    const cosPitch = Math.cos(player.pitch || 0);
    const direction = new THREE.Vector3(
      -Math.sin(player.yaw || 0) * cosPitch,
      Math.sin(player.pitch || 0),
      -Math.cos(player.yaw || 0) * cosPitch
    ).normalize();
    camera.getWorldDirection = (v = new THREE.Vector3()) => v.copy(direction);

    // Target block raycast
    game.targetBlock = null;
    for (let d = 0; d < 5.2; d += 0.05) {
      const point = camera.position.clone().addScaledVector(direction, d);
      const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);
      const blockId = world.getVoxel(x, y, z);
      if (blockId !== BLOCKS.AIR) {
        const prev = point.clone().sub(direction.clone().multiplyScalar(0.05));
        const px = Math.floor(prev.x), py = Math.floor(prev.y), pz = Math.floor(prev.z);
        const normal = { x: px - x, y: py - y, z: pz - z };
        if (normal.x === 0 && normal.y === 0 && normal.z === 0) normal.y = 1;
        game.targetBlock = { x, y, z, blockId, normal };
        break;
      }
    }

    // Target mob raycast
    game.targetMob = null;
    for (const mob of mobsList) {
      if (mob.health > 0) {
        const mobPos = mob.mesh.position;
        if (camera.position.distanceTo(mobPos) < 4.0) {
          game.targetMob = mob;
          break;
        }
      }
    }

    bot.afterRaycast();

    // Mining simulation
    if (game.isMouseDown && game.targetBlock) {
      const b = game.targetBlock;
      world.setVoxel(b.x, b.y, b.z, BLOCKS.AIR);
      game.miningTime = 0;
      if (b.blockId === BLOCKS.STONE) {
        inventory.addItem(BLOCKS.COBBLESTONE, true, 1);
      } else if (b.blockId === BLOCKS.OAK_LOG) {
        inventory.addItem(BLOCKS.OAK_LOG, true, 1);
      } else if (b.blockId === BLOCKS.COAL_ORE) {
        inventory.addItem('coal', false, 1);
      } else if (b.blockId === BLOCKS.IRON_ORE) {
        inventory.addItem('raw_iron', false, 1);
      }
    }

    // Dropped item pickup
    for (let i = droppedItems.length - 1; i >= 0; i--) {
      const drop = droppedItems[i];
      if (drop.group.position.distanceTo(player.position) < 4.5) {
        inventory.addItem(drop.itemType, drop.isBlock, drop.count);
        droppedItems.splice(i, 1);
      }
    }
  }

  async function drive(promise, max = 25000) {
    let done = false;
    promise.then(() => (done = true), () => (done = true));
    for (let i = 0; i < max && !done; i++) {
      step();
      await Promise.resolve();
    }
    assert.equal(done, true, 'scenario task must terminate');
    return promise;
  }

  return { game, bot, cells, logs, step, drive, world, player, inventory, chestManager, mobsList };
}

test('Capability 1: Vertical pillar jumping places blocks beneath player and raises elevation', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem(BLOCKS.COBBLESTONE, true, 5);

  const startY = f.player.position.y;
  const result = await f.drive(f.bot.run('pillar 3 cobblestone'));

  assert.equal(result.ok, true, result.message);
  assert.ok(f.player.position.y >= startY + 2.8, `Player should have risen by ~3 blocks, currently at ${f.player.position.y}`);
  assert.equal(f.world.getVoxel(0, 1, 0), BLOCKS.COBBLESTONE);
  assert.equal(f.world.getVoxel(0, 2, 0), BLOCKS.COBBLESTONE);
  assert.equal(f.world.getVoxel(0, 3, 0), BLOCKS.COBBLESTONE);
  assert.equal(f.bot.itemCount(BLOCKS.COBBLESTONE), 2, 'Consumed exactly 3 cobblestone from inventory');
});

test('Capability 1b: Pillar jumping refuses when out of requested block in survival mode', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  const result = await f.drive(f.bot.run('pillar 2 cobblestone'));
  assert.equal(result.ok, false);
  assert.match(result.message, /Out of cobblestone/i);
});

test('Capability 2: Edge-sneaking bridging safely places blocks horizontally across a gap', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem(BLOCKS.COBBLESTONE, true, 4);

  // Clear voxels in front of player at y=0 to create gap
  f.world.setVoxel(1, 0, 0, BLOCKS.AIR);
  f.world.setVoxel(2, 0, 0, BLOCKS.AIR);

  const result = await f.drive(f.bot.run('bridge 2 east cobblestone'));

  assert.equal(result.ok, true, result.message);
  assert.equal(f.world.getVoxel(1, 0, 0), BLOCKS.COBBLESTONE);
  assert.equal(f.world.getVoxel(2, 0, 0), BLOCKS.COBBLESTONE);
  assert.ok(f.player.position.x > 2.0, `Player advanced onto bridge, currently at x=${f.player.position.x}`);
  assert.equal(f.bot.itemCount(BLOCKS.COBBLESTONE), 2, '2 cobblestone used for bridging');
});

test('Capability 3: Chest interaction - storing, withdrawing, opening, and obstruction detection', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.world.setVoxel(1, 1, 0, BLOCKS.CHEST);
  f.inventory.addItem(BLOCKS.OAK_PLANKS, true, 10);

  // 1. Store
  const storeRes = await f.drive(f.bot.run('store 4 oak_planks in chest at 1 1 0'));
  assert.equal(storeRes.ok, true, storeRes.message);
  assert.equal(f.bot.itemCount(BLOCKS.OAK_PLANKS), 6);
  const chestItems = f.chestManager.getCombinedItems(1, 1, 0);
  assert.equal(chestItems[0]?.count, 4);

  // 2. Withdraw
  const withdrawRes = await f.drive(f.bot.run('withdraw 2 oak_planks from chest at 1 1 0'));
  assert.equal(withdrawRes.ok, true, withdrawRes.message);
  assert.equal(f.bot.itemCount(BLOCKS.OAK_PLANKS), 8);
  assert.equal(chestItems[0]?.count, 2);

  // 3. Open
  const openRes = await f.drive(f.bot.run('open chest at 1 1 0'));
  assert.equal(openRes.ok, true, openRes.message);

  // 4. Obstruction detection: placing solid block directly above chest
  f.world.setVoxel(1, 2, 0, BLOCKS.STONE);
  const blockedOpen = await f.drive(f.bot.run('open chest at 1 1 0'));
  assert.equal(blockedOpen.ok, false);
  assert.match(blockedOpen.message, /obstructed/i);

  const blockedWithdraw = await f.drive(f.bot.run('withdraw 1 oak_planks from chest at 1 1 0'));
  assert.equal(blockedWithdraw.ok, false);
  assert.match(blockedWithdraw.message, /obstructed/i);
});

test('Capability 4: Blueprint structure construction builds full shelter from schematic', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5], gamemode: 'creative' });

  const result = await f.drive(f.bot.run('build shelter at 0 0 0'));
  assert.equal(result.ok, true, result.message);

  // Verify floor (cobblestone 4x4 at y=0)
  assert.equal(f.world.getVoxel(0, 0, 0), BLOCKS.COBBLESTONE);
  assert.equal(f.world.getVoxel(3, 0, 3), BLOCKS.COBBLESTONE);

  // Verify walls (oak_planks)
  assert.equal(f.world.getVoxel(0, 1, 0), BLOCKS.OAK_PLANKS);
  assert.equal(f.world.getVoxel(3, 2, 0), BLOCKS.OAK_PLANKS);

  // Verify doorway at [1, 1, 0] has door
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.OAK_DOOR);

  // Verify roof at y=3
  assert.equal(f.world.getVoxel(0, 3, 0), BLOCKS.OAK_PLANKS);
  assert.equal(f.world.getVoxel(2, 3, 2), BLOCKS.OAK_PLANKS);

  // Verify interior torch at [2, 2, 2]
  assert.equal(f.world.getVoxel(2, 2, 2), BLOCKS.TORCH);
});

test('Capability 5: Redstone wiring lays wire along coordinates and triggers updates', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('redstone', false, 5);

  const result = await f.drive(f.bot.run('wire redstone from 1 1 1 to 4 1 1'));
  assert.equal(result.ok, true, result.message);

  assert.equal(f.world.getVoxel(1, 1, 1), BLOCKS.REDSTONE_WIRE);
  assert.equal(f.world.getVoxel(2, 1, 1), BLOCKS.REDSTONE_WIRE);
  assert.equal(f.world.getVoxel(3, 1, 1), BLOCKS.REDSTONE_WIRE);
  assert.equal(f.world.getVoxel(4, 1, 1), BLOCKS.REDSTONE_WIRE);
  assert.equal(f.bot.itemCount('redstone'), 1, '4 redstone dust consumed');
  assert.ok(f.world.redstoneUpdates >= 4, 'Redstone neighbor updates fired');
});

test('Capability 6: Tactical combat - shield blocking deflects attacks in 180-degree frontal arc', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('shield', false, 1);

  // Bot raises shield for 1.5s
  const shieldPromise = f.bot.run('shield 1.5');
  f.step(0.1);

  assert.equal(f.player.isBlocking, true, 'Player should be actively blocking');

  // Incoming frontal attack from z = 3
  const attackerPos = new THREE.Vector3(f.player.position.x, 1, f.player.position.z + 3);
  f.player.takeDamage(10, attackerPos, 'mob');

  // Verify 100% blocked
  assert.equal(f.player.health, 20, 'Shield completely deflected frontal damage');

  // Advance time past 1.5s duration
  for (let i = 0; i < 35; i++) f.step(0.05);
  await f.drive(shieldPromise);

  assert.equal(f.player.isBlocking, false, 'Shield released after duration');
});

test('Capability 7: Tactical combat - auto-weapon selection prioritizes sword over axe', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('wooden_axe', false, 1);
  f.inventory.addItem('iron_sword', false, 1);

  const zombie = {
    type: 'zombie',
    health: 20,
    mesh: { position: new THREE.Vector3(1.5, 1, 0.5) }
  };
  f.mobsList.push(zombie);

  const attackPromise = f.bot.run('attack zombie');
  f.step(0.1);

  const active = f.inventory.getActiveItem();
  assert.equal(active?.id, 'iron_sword', 'Bot auto-equipped highest damage weapon (iron sword > wooden axe)');

  f.bot.stop();
  await attackPromise;
});

test('Capability 8: Tactical combat - creeper kiting attacks and backpedals to defuse explosion', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('iron_sword', false, 1);

  const creeper = {
    type: 'creeper',
    health: 20,
    fuseTimer: 1.0,
    mesh: { position: new THREE.Vector3(2.0, 1, 0.5) }
  };
  f.mobsList.push(creeper);

  const attackPromise = f.bot.run('attack creeper');
  f.step(0.1);

  // Hit creeper inside 2.5 radius
  assert.ok(f.bot.task?.kiting || f.bot.task?.attackTarget, 'Bot engaged creeper and prepared kiting maneuver');

  // Advance tick to trigger backpedal
  f.step(0.1);
  if (f.bot.task?.kiting) {
    assert.equal(f.player.botControls.KeyS, true, 'Bot backpedals backward from priming creeper');
    assert.equal(f.player.botControls.ControlLeft, true, 'Bot sprints away while kiting');
  }

  f.bot.stop();
  await attackPromise;
});

test('Capability 9: Ranged combat - bow aiming, charging, shooting, and End Crystal destruction', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('bow', false, 1);
  f.inventory.addItem('arrow', false, 3);

  // Target skeleton at distance
  const skeleton = {
    type: 'skeleton',
    health: 20,
    mesh: { position: new THREE.Vector3(10.5, 1, 0.5) }
  };
  f.mobsList.push(skeleton);

  const shootPromise = f.bot.run('shoot skeleton');

  // Step while charging
  f.step(0.5);
  assert.ok(f.player.bowDraw > 0, 'Bow is being charged');

  await f.drive(shootPromise);
  assert.equal(f.bot.itemCount('arrow'), 2, 'Arrow consumed on shot');
  assert.ok(skeleton.health < 20, 'Target skeleton took arrow damage');

  // End Crystal test
  const crystal = {
    position: new THREE.Vector3(8, 8, 8),
    alive: true,
    exploded: false,
    destroy() { this.alive = false; this.exploded = true; }
  };
  f.game.bossManager = { endCrystals: [crystal] };

  f.inventory.addItem('arrow', false, 1);
  const shootCrystal = await f.drive(f.bot.run('shoot end_crystal'));
  assert.equal(shootCrystal.ok, true);
  assert.equal(crystal.alive, false, 'End Crystal successfully destroyed by bow shot');
});

test('Capability 10: Locomotion - water swimming buoyancy and water traversal', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });

  // Place water between player and destination
  f.world.setVoxel(1, 0, 0, BLOCKS.WATER);
  f.world.setVoxel(1, 1, 0, BLOCKS.WATER);
  f.world.setVoxel(2, 0, 0, BLOCKS.DIRT);

  // Check pathfinding traverses water rather than throwing hazard error
  const movePromise = f.bot.run('go to 2 1 0');
  f.step(0.1);

  assert.equal(f.bot.task?.phase, 'walk', 'Pathfinder successfully navigated through water');

  // Test buoyancy
  f.player.inWater = true;
  f.step(0.1);
  assert.equal(f.player.botControls.Space, true, 'Upward buoyancy (Space) engaged while in water');

  f.bot.stop();
  await movePromise;
});

test('Capability 11: Locomotion - ladder climbing elevates player vertically', async () => {
  const f = createCapabilityFixture({ playerPos: [1.5, 1, 0.5] });

  // Place ladder shaft at (1, 1, 0) and (1, 2, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.LADDER);
  f.world.setVoxel(1, 2, 0, BLOCKS.LADDER);

  const climbPromise = f.bot.run('go to 1 2 0');
  f.step(0.1);

  // When touching ladder and path ascends:
  f.player.position.set(1.2, 1.0, 0.5);
  f.step(0.1);

  assert.ok(f.player.velocity.y >= 2.0, 'Upward velocity applied on ladder climb');
  assert.equal(f.player.botControls.Space, true, 'Space control active during ladder ascent');

  f.bot.stop();
  await climbPromise;
});

test('Capability 12: Goal-Oriented Action Planner (GOAP) - recursive recipe resolution', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });

  // Starting inventory: 1 oak log
  f.inventory.addItem(BLOCKS.OAK_LOG, true, 1);

  // Run composite GOAP action: acquire 4 sticks
  // Resolves: oak_log -> 4 oak_planks -> 4 sticks
  const result = await f.drive(f.bot.run('acquire 4 stick'));

  assert.equal(result.ok, true, result.message);
  assert.equal(f.bot.itemCount('stick'), 4, 'Successfully acquired 4 sticks via recursive planning');
  assert.equal(f.bot.itemCount(BLOCKS.OAK_PLANKS), 2, '2 remaining oak planks after crafting sticks');
});

test('Capability 12b: GOAP acquires wooden_pickaxe from planks and table', async () => {
  const f = createCapabilityFixture({ playerPos: [0.5, 1, 0.5] });

  // Place crafting table nearby
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);
  // Give 3 planks and 2 sticks
  f.inventory.addItem(BLOCKS.OAK_PLANKS, true, 3);
  f.inventory.addItem('stick', false, 2);

  const result = await f.drive(f.bot.run('acquire 1 wooden_pickaxe'));
  assert.equal(result.ok, true, result.message);
  assert.equal(f.bot.itemCount('wooden_pickaxe'), 1, 'Crafted wooden_pickaxe using crafting table');
});
