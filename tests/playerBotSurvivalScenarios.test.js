import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { PlayerBot } from '../src/playerBot.js';
import { Inventory } from '../src/inventory.js';
import { BedManager } from '../src/bed.js';
import { DoorManager } from '../src/door.js';
import { FurnaceManager } from '../src/furnace.js';
import { FarmingManager, isHoe, getSeedCrop } from '../src/farming.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { breakTimeSeconds, harvestsNothing } from '../src/miningRules.js';
import { blockDrops } from '../src/blockDrops.js';

function createSurvivalFixture({ playerPos = [0.5, 1, 0.5] } = {}) {
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
    getChunk() {
      return null;
    }
  };

  const camera = new THREE.PerspectiveCamera();
  const player = new Player(
    camera,
    { addEventListener() {}, requestPointerLock() {} },
    world,
    { playStep() {}, playJump() {} }
  );

  player.position.set(...playerPos);
  player.onGround = true;
  player.gamemode = 'survival';
  player.health = 20;
  player.maxHealth = 20;
  player.hunger = 20;
  player.maxHunger = 20;
  player.saturation = 5;

  const inventory = new Inventory({ playClick() {}, playPop() {} });
  const bedManager = new BedManager({
    world,
    currentDimension: 'overworld',
    worldTime: 13000,
    ui: { addChatMessage() {} },
    sounds: { playClick() {} }
  });
  const furnaceManager = new FurnaceManager({ world });
  const mobsList = [];
  const droppedItems = [];

  const game = {
    world,
    player,
    inventory,
    bedManager,
    furnaceManager,
    worldReady: true,
    mobs: { mobs: mobsList },
    entities: {
      droppedItems,
      spawnDroppedItem(pos, itemType, isBlock, count = 1) {
        const item = {
          itemType,
          isBlock,
          count,
          age: 2,
          pickupDelay: 0,
          group: {
            position: new THREE.Vector3(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2])
          }
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
      playAttack() {}
    },
    currentDimension: 'overworld',
    worldTime: 13000,
    miningTime: 0,
    isMouseDown: false,
    targetBlock: null,
    targetMob: null
  };

  const doorManager = new DoorManager(game);
  game.doorManager = doorManager;
  world.doorManager = doorManager;

  const farmingManager = new FarmingManager(game);
  game.farmingManager = farmingManager;

  player.game = game;
  player.inventory = inventory;
  bedManager.game = game;
  furnaceManager.game = game;

  game.handleLeftClick = () => {
    if (game.targetMob && game.targetMob.health > 0) {
      const held = inventory.getActiveItem();
      const dmg = held?.id?.includes('sword') ? 4 : held?.id?.includes('axe') ? 3 : 2;
      game.targetMob.health -= dmg;
      if (game.targetMob.health <= 0) {
        const pos = game.targetMob.mesh.position;
        for (const drop of game.targetMob.drops || []) {
          game.entities.spawnDroppedItem(pos, drop.id, drop.isBlock, drop.count);
        }
      }
    }
  };

  game.handleRightClick = () => {
    const active = inventory.getActiveItem();
    if (!active) return;
    if (active.id && (ITEMS[active.id]?.type === 'food' || ['beef', 'cooked_beef', 'bread', 'apple'].includes(active.id))) {
      inventory.consumeActiveItem();
      player.hunger = Math.min(20, player.hunger + 8);
      return;
    }
    if (active && isHoe(active.id) && game.targetBlock) {
      if (farmingManager.till(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, player)) {
        return;
      }
    }
    if (active && active.id === 'bone_meal' && game.targetBlock) {
      if (farmingManager.applyBoneMeal(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, player)) {
        return;
      }
    }
    if (active && getSeedCrop(active.id) && game.targetBlock) {
      if (farmingManager.plant(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, active.id, player)) {
        return;
      }
    }
    if (game.targetMob) {
      const cleanId = String(active?.id || '').toLowerCase();
      if (game.targetMob.type === 'cow' && cleanId.includes('wheat')) {
        game.targetMob.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
      if (game.targetMob.type === 'chicken' && cleanId.includes('seed')) {
        game.targetMob.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
    }
    if (active && ITEMS[active.id]?.armorSlot && inventory.equipArmorItem) {
      inventory.equipArmorItem(true);
      return;
    }
    if ((String(active.id).endsWith('_bed') || active.id === 'bed' || active.id === BLOCKS.RED_BED_FOOT) && game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const look = new THREE.Vector3();
      camera.getWorldDirection(look);
      let dir = 3;
      if (Math.abs(look.x) > Math.abs(look.z)) {
        dir = look.x > 0 ? 0 : 1;
      } else {
        dir = look.z > 2 ? 2 : 3;
      }
      const res = bedManager.placeBed(world, placePos, dir);
      if (res.success) {
        inventory.consumeActiveItem();
      }
      return;
    }
    if ((String(active.id).endsWith('_door') || active.id === 'door' || active.id === BLOCKS.OAK_DOOR || active.id === BLOCKS.IRON_DOOR) && game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const isIron = active.id === 'iron_door' || active.id === BLOCKS.IRON_DOOR;
      const res = doorManager.placeDoor(world, placePos, 3, isIron);
      if (res.success) {
        inventory.consumeActiveItem();
      }
      return;
    }
    if (game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const blockId = active.isBlock
        ? (active.blockId ?? (typeof active.id === 'number' ? active.id : BLOCKS[String(active.id).toUpperCase()]))
        : (ITEMS[active.id]?.blockId ?? BLOCKS[String(active.id).toUpperCase()]);
      if (typeof blockId === 'number' && world.getVoxel(...placePos) === BLOCKS.AIR) {
        world.setVoxel(...placePos, blockId);
        inventory.consumeActiveItem();
      }
    }
  };

  const bot = new PlayerBot(game, { log: (...args) => logs.push(args) });
  game.playerBot = bot;

  function step(dt = 1 / 20) {
    bot.tick(dt);
    player.update(dt);
    if (furnaceManager) furnaceManager.update(dt * 10);
    if (bedManager) bedManager.update(dt * 10);

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

    // Target block raycasting
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

    // Target mob raycasting
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

    // Mining completion
    if (game.isMouseDown && game.targetBlock) {
      const b = game.targetBlock;
      const held = inventory.getActiveItem();
      game.miningTime += dt;
      const breakTime = Math.min(0.2, breakTimeSeconds(b.blockId, ITEMS[held?.id], held?.id));
      if (game.miningTime >= breakTime) {
        world.setVoxel(b.x, b.y, b.z, BLOCKS.AIR);
        game.miningTime = 0;
        if (!harvestsNothing(b.blockId, ITEMS[held?.id], held?.id)) {
          const drops = blockDrops(b.blockId, () => 0.05);
          for (const drop of drops) {
            game.entities.spawnDroppedItem({ x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }, drop.id, drop.isBlock, drop.count);
          }
        }
      }
    }

    // Dropped item collection (standard reach magnet)
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
      if (bot.active) step();
      await Promise.resolve();
    }
    assert.equal(done, true, 'scenario task must terminate');
    return promise;
  }

  return { game, bot, cells, logs, step, drive, world, player, inventory, bedManager, furnaceManager, mobsList };
}

test('Survival Scenario 1: Tool progression loop (logs -> planks -> table -> wooden pick -> stone -> stone pick -> furnace)', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Place 3 oak logs nearby at y = 1..3
  f.world.setVoxel(2, 1, 0, BLOCKS.OAK_LOG);
  f.world.setVoxel(2, 2, 0, BLOCKS.OAK_LOG);
  f.world.setVoxel(2, 3, 0, BLOCKS.OAK_LOG);

  // Place stone blocks accessible at ground level y = 1 within reach of crafting table (1, 1, 0)
  for (let x = 1; x <= 3; x++) {
    for (let z = 1; z <= 4; z++) {
      f.world.setVoxel(x, 1, z, BLOCKS.STONE);
    }
  }

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'mine 3 oak log',
        'craft 3 oak_planks',
        'craft 1 stick',
        'craft 1 crafting_table',
        'place crafting_table at 1 1 0',
        'craft 1 wooden_pickaxe',
        'mine 3 stone',
        'craft 1 stone_pickaxe',
        'mine 8 stone',
        'craft 1 furnace',
        'place furnace at 2 1 0'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'crafting table placed in world',
          check: game => game.world.getVoxel(1, 1, 0) === BLOCKS.CRAFTING_TABLE
        },
        {
          name: 'furnace placed in world',
          check: game => game.world.getVoxel(2, 1, 0) === BLOCKS.FURNACE
        },
        {
          name: 'stone pickaxe crafted',
          check: (game, bot) => bot.itemCount('stone_pickaxe') >= 1
        },
        {
          name: 'wooden pickaxe crafted',
          check: (game, bot) => bot.itemCount('wooden_pickaxe') >= 1
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test('Survival Scenario 2: House shelter construction, bed crafting, and night sleep', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Place crafting table within reach at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);

  // Give player materials for shelter and bed
  f.inventory.addItem(BLOCKS.OAK_PLANKS, true, 8);
  f.inventory.addItem(BLOCKS.WHITE_WOOL, true, 3);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place oak_planks at 0 1 -1',
        'place oak_planks at 1 1 -1',
        'place oak_planks at -1 1 -1',
        'craft 1 white_bed',
        'place white_bed at 0 1 1',
        'sleep at 0 1 1'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'shelter walls placed',
          check: game => game.world.getVoxel(0, 1, -1) === BLOCKS.OAK_PLANKS && game.world.getVoxel(1, 1, -1) === BLOCKS.OAK_PLANKS
        },
        {
          name: 'bed placed in world',
          check: game => game.world.getVoxel(0, 1, 1) === BLOCKS.RED_BED_FOOT
        },
        {
          name: 'spawn point set after sleeping in bed',
          check: game => game.player.bedSpawnPosition !== null
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test('Survival Scenario 3: Hunting animal, smelting meat in furnace, and eating cooked food', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Setup a furnace at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.FURNACE);

  // Give player coal for fuel
  f.inventory.addItem('coal', false, 2);

  // Lower player hunger
  f.player.hunger = 10;

  // Spawn cow mob nearby at y = 1
  const cowMesh = new THREE.Object3D();
  cowMesh.position.set(0.5, 1, 2.0);
  const cow = {
    type: 'cow',
    health: 4,
    height: 1.4,
    mesh: cowMesh,
    drops: [{ id: 'beef', isBlock: false, count: 1 }]
  };
  f.mobsList.push(cow);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'attack cow',
        'cook beef with coal at 1 1 0',
        'eat cooked_beef'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'cow defeated',
          check: () => cow.health <= 0
        },
        {
          name: 'hunger restored by eating cooked food',
          check: game => game.player.hunger > 10
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test('Survival Scenario 4: Error handling and assertion failures are reported cleanly', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Try to craft without table and without materials
  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'craft 1 diamond_pickaxe',
        'jump'
      ],
      assertions: [
        {
          name: 'should fail',
          check: () => false
        }
      ]
    })
  );

  assert.equal(report.ok, false);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].ok, false);
  assert.match(report.results[0].message, /recipe/i);
  assert.equal(f.player.botControls, null);
});

test("Survival Scenario 5: Beginner's Guide Step 3.2 - Complete Stone Age tool progression (pickaxe, axe, sword, shovel, hoe, furnace)", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Place crafting table at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);

  // Give cobblestone and sticks sufficient for all tools + furnace
  f.inventory.addItem(BLOCKS.COBBLESTONE, true, 20);
  f.inventory.addItem('stick', false, 12);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'craft 1 stone_pickaxe',
        'craft 1 stone_axe',
        'craft 1 stone_sword',
        'craft 1 stone_shovel',
        'craft 1 stone_hoe',
        'craft 1 furnace',
        'place furnace at 0 1 -1'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'stone pickaxe crafted',
          check: (game, bot) => bot.itemCount('stone_pickaxe') >= 1
        },
        {
          name: 'stone axe crafted',
          check: (game, bot) => bot.itemCount('stone_axe') >= 1
        },
        {
          name: 'stone sword crafted',
          check: (game, bot) => bot.itemCount('stone_sword') >= 1
        },
        {
          name: 'stone shovel crafted',
          check: (game, bot) => bot.itemCount('stone_shovel') >= 1
        },
        {
          name: 'stone hoe crafted',
          check: (game, bot) => bot.itemCount('stone_hoe') >= 1
        },
        {
          name: 'furnace placed in world',
          check: game => game.world.getVoxel(0, 1, -1) === BLOCKS.FURNACE
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test("Survival Scenario 6: Beginner's Guide Step 3.4 & 4.1 - Shelter door placement, charcoal smelting in furnace, torch crafting and placement", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Crafting table at (1, 1, 0) and furnace at (2, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);
  f.world.setVoxel(2, 1, 0, BLOCKS.FURNACE);

  // Wall block for door support / shelter
  f.world.setVoxel(0, 1, -1, BLOCKS.OAK_PLANKS);

  // Give player oak planks, log for smelting charcoal, stick for torches
  f.inventory.addItem(BLOCKS.OAK_PLANKS, true, 8);
  f.inventory.addItem(BLOCKS.OAK_LOG, true, 1);
  f.inventory.addItem('stick', false, 4);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'craft 1 oak_door',
        'place oak_door at 0 1 1',
        'cook charcoal with oak_planks at 2 1 0',
        'craft 1 torch',
        'place torch at 0 2 -1'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'door placed at shelter entrance (bottom and top voxels)',
          check: game => game.world.getVoxel(0, 1, 1) === BLOCKS.OAK_DOOR && game.world.getVoxel(0, 2, 1) === BLOCKS.OAK_DOOR_TOP
        },
        {
          name: 'charcoal was smelted and used for torches',
          check: (game, bot) => bot.itemCount('torch') >= 3
        },
        {
          name: 'torch placed on shelter wall',
          check: game => game.world.getVoxel(0, 2, -1) === BLOCKS.TORCH
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test("Survival Scenario 7: Beginner's Guide Step 4.2.2 - Mining underground during the first night (coal ore, iron ore, and smelting iron ingots)", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Furnace at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.FURNACE);

  // Stone pickaxe in inventory
  f.inventory.addItem('stone_pickaxe', false, 1);

  // Place coal ore vein (2 blocks) and iron ore nearby
  f.world.setVoxel(2, 1, 0, BLOCKS.COAL_ORE);
  f.world.setVoxel(2, 1, -1, BLOCKS.COAL_ORE);
  f.world.setVoxel(2, 1, 1, BLOCKS.IRON_ORE);

  // Sticks for crafting torches after mining coal
  f.inventory.addItem('stick', false, 2);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'mine 2 coal ore',
        'mine 1 iron ore',
        'craft 1 torch',
        'cook iron_ingot with coal at 1 1 0'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'coal ore was harvested into coal and crafted into torches',
          check: (game, bot) => bot.itemCount('torch') >= 4
        },
        {
          name: 'iron ore was mined and smelted into iron ingot',
          check: (game, bot) => bot.itemCount('iron_ingot') >= 1
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test("Survival Scenario 8: Beginner's Guide Step 5 - Food and farming (breaking grass for seeds, crafting hoe, tilling near water, planting seeds, bone meal, harvesting, crafting bread, eating, and breeding animals)", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Crafting table at (-1, 1, 0)
  f.world.setVoxel(-1, 1, 0, BLOCKS.CRAFTING_TABLE);

  // Water source at (1, 0, 1) for hydrating farmland
  f.world.setVoxel(1, 0, 1, BLOCKS.WATER);

  // Dirt block at (1, 0, 0) adjacent to water
  f.world.setVoxel(1, 0, 0, BLOCKS.DIRT);

  // Short grass at (0, 1, 1) to mine for wheat seeds
  f.world.setVoxel(0, 1, 1, BLOCKS.SHORT_GRASS);

  // Give player cobblestone and sticks to craft stone_hoe
  f.inventory.addItem('cobblestone', true, 2);
  f.inventory.addItem('stick', false, 2);

  // Also give 3 bone_meal for fertilizing crop to full maturity
  f.inventory.addItem('bone_meal', false, 3);

  // Lower player hunger so eating bread can be asserted
  f.player.hunger = 12;

  // Spawn cow mob nearby at y = 1
  const cowMesh = new THREE.Object3D();
  cowMesh.position.set(2.0, 1, 0.0);
  const cow = {
    type: 'cow',
    health: 10,
    height: 1.4,
    mesh: cowMesh,
    inLove: 0
  };
  f.mobsList.push(cow);

  // Give player 3 wheat so after harvesting 1 wheat, player has 4 wheat (3 to craft bread, 1 to feed cow)
  f.inventory.addItem('wheat', false, 3);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'mine 1 short_grass',
        'craft 1 stone_hoe',
        'till at 1 0 0',
        'place wheat_seeds at 1 1 0',
        'use bone_meal at 1 1 0',
        'mine 1 wheat',
        'craft 1 bread',
        'eat bread',
        'feed wheat to cow'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'dirt was tilled into hydrated farmland',
          check: game => game.world.getVoxel(1, 0, 0) === BLOCKS.FARMLAND_MOIST || game.world.getVoxel(1, 0, 0) === BLOCKS.FARMLAND
        },
        {
          name: 'bread was crafted and eaten, restoring hunger',
          check: game => game.player.hunger > 12
        },
        {
          name: 'cow was fed wheat and entered breeding love mode',
          check: () => cow.inLove > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test("Survival Scenario 9: Beginner's Guide Steps 6 & 7 - Combat, shields, hostile mob drops, bone meal crafting, and iron age tools", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Crafting table at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);

  // Hostile mobs nearby
  const zombieMesh = new THREE.Object3D();
  zombieMesh.position.set(0.5, 1, 2.0);
  const zombie = {
    type: 'zombie',
    health: 4,
    height: 1.9,
    mesh: zombieMesh,
    drops: [{ id: 'rotten_flesh', isBlock: false, count: 1 }]
  };

  const skeletonMesh = new THREE.Object3D();
  skeletonMesh.position.set(2.0, 1, 0.5);
  const skeleton = {
    type: 'skeleton',
    health: 4,
    height: 1.9,
    mesh: skeletonMesh,
    drops: [
      { id: 'bone', isBlock: false, count: 1 },
      { id: 'arrow', isBlock: false, count: 2 }
    ]
  };

  const spiderMesh = new THREE.Object3D();
  spiderMesh.position.set(-1.0, 1, 0.5);
  const spider = {
    type: 'spider',
    health: 4,
    height: 0.9,
    mesh: spiderMesh,
    drops: [{ id: 'string', isBlock: false, count: 1 }]
  };

  f.mobsList.push(zombie, skeleton, spider);

  // Give player stone sword for combat
  f.inventory.addItem('stone_sword', false, 1);

  // Materials for Shield (1 iron ingot + 6 planks), Iron Chestplate (8 iron ingots),
  // Iron Sword (2 iron ingots + 1 stick), Iron Pickaxe (3 iron ingots + 2 sticks), Bucket (3 iron ingots)
  // Total iron ingots: 1 + 8 + 2 + 3 + 3 = 17 iron ingots, 6 oak planks, 3 sticks
  f.inventory.addItem('iron_ingot', false, 17);
  f.inventory.addItem('oak_planks', true, 6);
  f.inventory.addItem('stick', false, 3);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'attack zombie',
        'attack skeleton',
        'attack spider',
        'craft 1 bone_meal',
        'craft 1 shield',
        'craft 1 iron_chestplate',
        'equip iron_chestplate',
        'craft 1 iron_sword',
        'craft 1 iron_pickaxe',
        'craft 1 bucket'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'all hostile night mobs defeated',
          check: () => zombie.health <= 0 && skeleton.health <= 0 && spider.health <= 0
        },
        {
          name: 'mob drops collected (rotten flesh, arrows, string)',
          check: (game, bot) => bot.itemCount('rotten_flesh') >= 1 && bot.itemCount('arrow') >= 2 && bot.itemCount('string') >= 1
        },
        {
          name: 'bone was crafted into bone meal',
          check: (game, bot) => bot.itemCount('bone_meal') >= 3
        },
        {
          name: 'shield crafted',
          check: (game, bot) => bot.itemCount('shield') >= 1
        },
        {
          name: 'iron chestplate crafted and equipped',
          check: game => game.inventory.armor.chest?.id === 'iron_chestplate'
        },
        {
          name: 'iron age tools crafted (iron sword, iron pickaxe, bucket)',
          check: (game, bot) => bot.itemCount('iron_sword') >= 1 && bot.itemCount('iron_pickaxe') >= 1 && bot.itemCount('bucket') >= 1
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});

test("Survival Scenario 10: Beginner's Guide Step 8 - What next? (chests, fences, sand smelting into glass windows, mining diamonds, diamond tools)", async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });

  // Crafting table at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);

  // Furnace at (-1, 1, 0)
  f.world.setVoxel(-1, 1, 0, BLOCKS.FURNACE);

  // Solid block wall for window at (0, 1, 2), air at (0, 2, 2)
  f.world.setVoxel(0, 1, 2, BLOCKS.STONE);

  // Diamond ore vein at (2, 1, 1) and (2, 1, 2)
  f.world.setVoxel(2, 1, 1, BLOCKS.DIAMOND_ORE);
  f.world.setVoxel(2, 1, 2, BLOCKS.DIAMOND_ORE);

  // Iron pickaxe required to mine diamonds
  f.inventory.addItem('iron_pickaxe', false, 1);

  // Sand and coal for smelting glass in furnace
  f.inventory.addItem(BLOCKS.SAND, true, 1);
  f.inventory.addItem('coal', false, 1);

  // Materials for Chest (8 planks), Oak Fence (4 planks + 2 sticks), Oak Fence Gate (2 planks + 4 sticks)
  // Total planks: 8 + 4 + 2 = 14 planks. Sticks: 2 + 4 + 3 (for diamond tools) = 9 sticks
  // Also 3 extra diamonds already in inventory, so mining 2 diamonds yields 5 diamonds total (3 for pick, 2 for sword)
  f.inventory.addItem('oak_planks', true, 14);
  f.inventory.addItem('stick', false, 9);
  f.inventory.addItem('diamond', false, 3);

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'craft 1 chest',
        'place chest at 1 1 1',
        'craft 1 oak_fence',
        'craft 1 oak_fence_gate',
        'cook glass with coal at -1 1 0',
        'place glass at 0 2 2',
        'mine 2 diamond ore',
        'craft 1 diamond_pickaxe',
        'craft 1 diamond_sword'
      ],
      assertions: [
        {
          name: 'controls released',
          check: game => game.player.botControls === null
        },
        {
          name: 'chest placed in world',
          check: game => game.world.getVoxel(1, 1, 1) === BLOCKS.CHEST
        },
        {
          name: 'fences and fence gate crafted',
          check: (game, bot) => bot.itemCount('oak_fence') >= 3 && bot.itemCount('oak_fence_gate') >= 1
        },
        {
          name: 'sand was smelted into glass and placed as window',
          check: game => game.world.getVoxel(0, 2, 2) === BLOCKS.GLASS
        },
        {
          name: 'diamond tools crafted (diamond pickaxe and diamond sword)',
          check: (game, bot) => bot.itemCount('diamond_pickaxe') >= 1 && bot.itemCount('diamond_sword') >= 1
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
});


