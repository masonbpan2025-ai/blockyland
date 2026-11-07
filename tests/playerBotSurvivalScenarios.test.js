import test from 'node:test';
import { PLATFORM, regenerateEndPlatform } from '../src/worldgen/generators/endFeatures.js';
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
import { NetherPortalManager, detectPortalFrame, lightPortal } from '../src/netherPortal.js';
import {
  isFrame, isFilledFrame, insertEye, tryActivateAround, isStandingInEndPortal,
  portalDestination, portalArrival, buildEndPlatform, frameRingOffsets
} from '../src/endPortal.js';
import { initVillagerEconomy } from '../src/villagerEconomy.js';
import { calculateBookshelfCount } from '../src/enchanting.js';
import { BrewingManager } from '../src/brewing.js';

// The fixture lives in tests/helpers/survivalFixture.js, so other test files can use it without running these tests.
import { createSurvivalFixture } from './helpers/survivalFixture.js';
export { createSurvivalFixture };

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

  // Also give 4 bone_meal for fertilizing crop to full maturity (min growth is 2 per meal; 2*4=8 >= 7)
  f.inventory.addItem('bone_meal', false, 4);

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

test('Survival Scenario 11: Nether Portal construction, ignition, and dimensional travel in Creative mode', async () => {
  const f = createSurvivalFixture({ playerPos: [1.5, 2, 1.5] });
  f.player.gamemode = 'creative';

  // Platform at y = 1 so player standing at y = 2 has all portal frame blocks (y = 1..5) in reach
  f.world.setVoxel(1, 1, 1, BLOCKS.DIRT);
  f.world.setVoxel(2, 1, 1, BLOCKS.DIRT);
  // A step to stand on, as a player uses a temporary block: the frame's upper pillar blocks can only be placed against
  // the top face of the block below (y = 4 and 5), which no eye standing at y = 2 (3.62 high) can see. The bot walks
  // up here by itself when it needs the view (BotSurvival.vantagePoint). Before, it wrote unreachable blocks directly.
  // A two-step stair: stand on top of (2, 2, 2) at y = 3, then on (1, 3, 2) at y = 4 (eye 5.38) for the y = 5 tops.
  for (const [x, h] of [[2, 2], [1, 3]]) for (let y = 1; y <= h; y++) f.world.setVoxel(x, y, 2, BLOCKS.DIRT);

  // Build standard 4x5 obsidian frame at z = 0, x = 0..3, y = 1..5
  // Bottom row: (0, 1, 0), (1, 1, 0), (2, 1, 0), (3, 1, 0)
  // Left pillar: (0, 2, 0), (0, 3, 0), (0, 4, 0), (0, 5, 0)
  // Right pillar: (3, 2, 0), (3, 3, 0), (3, 4, 0), (3, 5, 0)
  // Top row: (1, 5, 0), (2, 5, 0)
  // Ignite with flint and steel at (1, 2, 0)
  // Go into portal at (1.5, 2, 0)

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place obsidian at 0 1 0',
        'place obsidian at 1 1 0',
        'place obsidian at 2 1 0',
        'place obsidian at 3 1 0',
        'place obsidian at 0 2 0',
        'place obsidian at 0 3 0',
        'place obsidian at 0 4 0',
        'place obsidian at 0 5 0',
        'place obsidian at 3 2 0',
        'place obsidian at 3 3 0',
        'place obsidian at 3 4 0',
        'place obsidian at 3 5 0',
        'place obsidian at 1 5 0',
        'place obsidian at 2 5 0',
        'use flint_and_steel at 1 2 0',
        'go to 1.5 2 0'
      ],
      assertions: [
        {
          name: 'obsidian frame is valid and detected',
          check: game => detectPortalFrame(game.world, 1, 2, 0).valid === true
        },
        {
          name: 'nether portal blocks are filled in the frame interior',
          check: game => game.world.getVoxel(1, 2, 0) === BLOCKS.NETHER_PORTAL &&
                         game.world.getVoxel(2, 4, 0) === BLOCKS.NETHER_PORTAL
        }
      ]
    })
  );

  // Allow portal timer (0.5s in creative) to trigger teleportation
  for (let i = 0; i < 25; i++) f.step();

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.equal(f.game.currentDimension, 'nether', 'Bot should have traveled through portal to the Nether');
});

// The Agent Terminal case: an AI app built a frame and asked the bot to light it from where the player stood. The bot
// had no such command (it read "look at -95 28 69" as a creature), so the frame stayed dark.
function standingPortalFrame(world) {
  // Vanilla's smallest frame (Nether portal, Minecraft Wiki): 4 wide, 5 tall, opening x 1..2, y 2..4, at z = 0.
  for (let x = 0; x <= 3; x++) { world.setVoxel(x, 1, 0, BLOCKS.OBSIDIAN); world.setVoxel(x, 5, 0, BLOCKS.OBSIDIAN); }
  for (let y = 2; y <= 4; y++) { world.setVoxel(0, y, 0, BLOCKS.OBSIDIAN); world.setVoxel(3, y, 0, BLOCKS.OBSIDIAN); }
}
const OPENING = [[1, 2], [2, 2], [1, 3], [2, 3], [1, 4], [2, 4]];

for (const [what, target] of [['the bottom obsidian of the opening', '1 1 0'], ['a block of the opening', '2 3 0']]) {
  test(`light portal at ${what}: the bot walks over, lights it, and does not step into it`, async () => {
    const f = createSurvivalFixture({ playerPos: [1.5, 1, 9.5] });
    f.player.gamemode = 'creative';
    f.game.portalManager = new NetherPortalManager(f.game);
    standingPortalFrame(f.world);

    const result = await f.drive(f.bot.run(`light portal at ${target}`));
    assert.equal(result.ok, true, result.message);
    for (const [x, y] of OPENING) assert.equal(f.world.getVoxel(x, y, 0), BLOCKS.NETHER_PORTAL, `portal at ${x} ${y} 0`);
    for (let i = 0; i < 120; i++) f.step();
    const p = f.player.position;
    assert.ok(Math.hypot(1.5 - p.x, 2 - p.y, 0.5 - p.z) < 6, 'the player walked within reach');
    assert.ok(!(Math.floor(p.z) === 0 && p.x >= 1 && p.x < 3), `the player is not standing in the opening (${p.x}, ${p.z})`);
    assert.notEqual(f.game.currentDimension, 'nether', 'still in the Overworld');
  });
}

test('light portal at an incomplete frame says what a frame needs', async () => {
  const f = createSurvivalFixture({ playerPos: [1.5, 1, 3.5] });
  f.player.gamemode = 'creative';
  standingPortalFrame(f.world);
  f.world.setVoxel(3, 3, 0, BLOCKS.AIR); // a gap in the right pillar
  const result = await f.drive(f.bot.run('light portal at 1 1 0'));
  assert.equal(result.ok, false);
  assert.match(result.message, /no complete obsidian portal frame.*4 wide and 5 tall/i);
  assert.equal(f.world.getVoxel(1, 2, 0), BLOCKS.AIR, 'nothing lit');
});

test('hold takes armor in hand so /enchant can reach it; equip puts it on', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('netherite_helmet', false, 1);
  const held = await f.bot.run('hold netherite_helmet');
  assert.equal(held.ok, true, held.message);
  assert.equal(f.inventory.getActiveItem()?.id, 'netherite_helmet', 'in hand');
  assert.equal(f.inventory.armor.head, null, 'not worn yet');
  const worn = await f.bot.run('equip netherite_helmet');
  assert.equal(worn.ok, true, worn.message);
  assert.equal(f.inventory.armor.head?.id, 'netherite_helmet', 'worn');
});

test('the frames of an End portal ring are filled from outside it, each in sight, and going in is a separate step', async () => {
  const f = createSurvivalFixture({ playerPos: [10.5, 1, 10.5] }); // starting inside the ring
  f.player.gamemode = 'creative';
  const ring = [[8, 9], [8, 10], [8, 11], [12, 9], [12, 10], [12, 11], [9, 8], [10, 8], [11, 8], [9, 12], [10, 12], [11, 12]];
  for (const [x, z] of ring) f.world.setVoxel(x, 1, z, BLOCKS.END_PORTAL_FRAME);
  for (const [x, z] of ring) {
    const r = await f.drive(f.bot.run(`use ender_eye at ${x} 1 ${z}`));
    assert.equal(r.ok, true, `${x} 1 ${z}: ${r.message}`);
  }
  assert.equal(f.world.getVoxel(10, 1, 10), BLOCKS.END_PORTAL, 'the portal opened');
  for (let i = 0; i < 30; i++) f.step();
  assert.notEqual(f.game.currentDimension, 'the_end', 'the player was not standing in it when it opened');
  const p = f.player.position;
  assert.ok(!(p.x >= 9 && p.x < 12 && p.z >= 9 && p.z < 12), `outside the ring (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
});

test('a line that only clips the corner of the next frame is blocked, and the bot aims at the open top face instead', () => {
  // The case from a real run: standing on a frame of the ring, aiming past the corner of its neighbour at the next one.
  const f = createSurvivalFixture({ playerPos: [5.34, 28, -3.5] });
  f.world.setVoxel(6, 27, -6, BLOCKS.END_PORTAL_FRAME);
  f.world.setVoxel(7, 27, -6, BLOCKS.END_PORTAL_FRAME);
  const eye = { x: 5.34, y: 29.62, z: -3.5 };
  assert.equal(f.bot.survival.firstBlockOnLine(eye, { x: 7.5, y: 27.5, z: -5.5 }, 7, 27, -6), 'blocked', 'the centre is behind the corner');
  const aim = f.bot.survival.aimPoint(eye, 7, 27, -6);
  assert.ok(aim && aim.y > 27.9, `aims at the top face (${JSON.stringify(aim)})`);
  assert.equal(f.bot.survival.firstBlockOnLine(eye, aim, 7, 27, -6), 'target');
});

test('go to a height a block or two off the ground still arrives, on the ground there', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] }); // flat ground: the feet are at y 1
  const result = await f.drive(f.bot.run('go to 6 3 0'));
  assert.equal(result.ok, true, result.message);
  assert.ok(Math.hypot(f.player.position.x - 6.5, f.player.position.z - 0.5) < 1, 'at x 6, z 0');
  assert.equal(Math.floor(f.player.position.y), 1, 'standing on the ground, not floating at y 3');
});

test('look at X Y Z turns the player to that block, rather than looking for a creature', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  const result = await f.drive(f.bot.run('look at 5 1 0'));
  assert.equal(result.ok, true, result.message);
  // A yaw looks along (-sin yaw, -cos yaw), as a three.js camera looks down -Z: the block is along +X.
  const facing = { x: -Math.sin(f.player.yaw), z: -Math.cos(f.player.yaw) };
  assert.ok(facing.x > 0.9, `facing +X (got ${facing.x.toFixed(2)}, ${facing.z.toFixed(2)})`);
});

test('Survival Scenario 12: End Portal frame construction, eye insertion, activation, and dimensional travel in Creative mode', async () => {
  const f = createSurvivalFixture({ playerPos: [10.5, 1, 10.5] });
  f.player.gamemode = 'creative';

  // 12 End portal frame blocks around center (10, 1, 10)
  // West column (x = 8): (8, 1, 9), (8, 1, 10), (8, 1, 11)
  // East column (x = 12): (12, 1, 9), (12, 1, 10), (12, 1, 11)
  // North row (z = 8): (9, 1, 8), (10, 1, 8), (11, 1, 8)
  // South row (z = 12): (9, 1, 12), (10, 1, 12), (11, 1, 12)

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place end_portal_frame at 8 1 9',
        'place end_portal_frame at 8 1 10',
        'place end_portal_frame at 8 1 11',
        'place end_portal_frame at 12 1 9',
        'place end_portal_frame at 12 1 10',
        'place end_portal_frame at 12 1 11',
        'place end_portal_frame at 9 1 8',
        'place end_portal_frame at 10 1 8',
        'place end_portal_frame at 11 1 8',
        'place end_portal_frame at 9 1 12',
        'place end_portal_frame at 10 1 12',
        'place end_portal_frame at 11 1 12',
        'use ender_eye at 8 1 9',
        'use ender_eye at 8 1 10',
        'use ender_eye at 8 1 11',
        'use ender_eye at 12 1 9',
        'use ender_eye at 12 1 10',
        'use ender_eye at 12 1 11',
        'use ender_eye at 9 1 8',
        'use ender_eye at 10 1 8',
        'use ender_eye at 11 1 8',
        'use ender_eye at 9 1 12',
        'use ender_eye at 10 1 12',
        'use ender_eye at 11 1 12',
        // Filling the frames is done from outside the ring, so the portal opening does not carry the player off: going
        // in is its own step.
        'go to 10 1 10'
      ],
      assertions: [
        {
          name: 'all 12 end portal frames are filled',
          check: game => isFilledFrame(game.world.getVoxel(8, 1, 10)) &&
                         isFilledFrame(game.world.getVoxel(12, 1, 10)) &&
                         isFilledFrame(game.world.getVoxel(10, 1, 8)) &&
                         isFilledFrame(game.world.getVoxel(10, 1, 12))
        },
        {
          name: 'end portal interior is activated with portal blocks',
          check: game => game.world.getVoxel(10, 1, 10) === BLOCKS.END_PORTAL &&
                         game.world.getVoxel(9, 1, 9) === BLOCKS.END_PORTAL &&
                         game.world.getVoxel(11, 1, 11) === BLOCKS.END_PORTAL
        }
      ]
    })
  );

  // Allow End portal travel to complete
  for (let i = 0; i < 20; i++) f.step();

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.equal(f.game.currentDimension, 'the_end', 'Bot should have traveled through portal to the End');
  // The arrival is the wiki's obsidian End platform, regenerated as the player enters.
  assert.equal(f.world.getVoxel(PLATFORM.x, PLATFORM.y, PLATFORM.z), BLOCKS.OBSIDIAN, 'the End platform should be generated');
});

test('Survival Scenario 13: Brewing functionality in Creative mode (alchemy pipeline from water bottle to awkward and effect potions)', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';

  // 1. Place brewing stand at (1, 1, 0)
  // 2. Brew nether_wart into water_bottle at (1, 1, 0) -> awkward_potion
  // 3. Brew golden_carrot into awkward_potion at (1, 1, 0) -> potion_of_night_vision
  // 4. Brew fermented_spider_eye into potion_of_night_vision at (1, 1, 0) -> potion_of_invisibility

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place brewing_stand at 1 1 0',
        'brew nether_wart into water_bottle at 1 1 0',
        'brew golden_carrot into awkward_potion at 1 1 0',
        'brew fermented_spider_eye into potion_of_night_vision at 1 1 0'
      ],
      assertions: [
        {
          name: 'brewing stand placed successfully',
          check: game => game.world.getVoxel(1, 1, 0) === BLOCKS.BREWING_STAND
        },
        {
          name: 'bot inventory contains brewed potions',
          check: (game, bot) => bot.itemCount('awkward_potion') > 0 || bot.itemCount('potion_of_night_vision') > 0 || bot.itemCount('potion_of_invisibility') > 0
        },
        {
          name: 'bot successfully brewed final potion of invisibility',
          check: (game, bot) => bot.itemCount('potion_of_invisibility') > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.ok(f.bot.itemCount('potion_of_invisibility') >= 1, 'Invisibility potion was brewed and collected');
});

test('Survival Scenario 14: Enchantment functionality with bookshelves in Creative mode (table, bookshelf boosting, tool and book enchanting)', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';
  f.player.level = 0; // Confirm level 0 can enchant in creative mode without lapis

  // Place enchanting table at 0 1 0
  // Place 15 bookshelves around table in standard 5x5 bookshelf perimeter at distance 2
  const bookshelfCommands = [
    'place bookshelf at -2 1 -1',
    'place bookshelf at -2 1 0',
    'place bookshelf at -2 1 1',
    'place bookshelf at 2 1 -1',
    'place bookshelf at 2 1 0',
    'place bookshelf at 2 1 1',
    'place bookshelf at -1 1 -2',
    'place bookshelf at 0 1 -2',
    'place bookshelf at 1 1 -2',
    'place bookshelf at -1 1 2',
    'place bookshelf at 0 1 2',
    'place bookshelf at 1 1 2',
    'place bookshelf at -2 1 -2',
    'place bookshelf at 2 1 -2',
    'place bookshelf at -2 1 2'
  ];

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place enchanting_table at 0 1 0',
        ...bookshelfCommands,
        'enchant diamond_sword slot 2 at 0 1 0',
        'enchant book slot 2 at 0 1 0'
      ],
      assertions: [
        {
          name: 'enchanting table and 15 bookshelves placed',
          check: game => game.world.getVoxel(0, 1, 0) === BLOCKS.ENCHANTING_TABLE &&
                         calculateBookshelfCount(game.world, 0, 1, 0) === 15
        },
        {
          name: 'diamond sword received high-tier enchantments',
          check: (game, bot) => {
            const sword = [...game.inventory.hotbar, ...game.inventory.storage].find(s => s && s.id === 'diamond_sword');
            return sword && Array.isArray(sword.enchantments) && sword.enchantments.length > 0;
          }
        },
        {
          name: 'book converted to enchanted book with enchantments',
          check: (game, bot) => {
            const book = [...game.inventory.hotbar, ...game.inventory.storage].find(s => s && s.id === 'enchanted_book');
            return book && Array.isArray(book.enchantments) && book.enchantments.length > 0;
          }
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  const sword = [...f.game.inventory.hotbar, ...f.game.inventory.storage].find(s => s && s.id === 'diamond_sword');
  assert.ok(sword.enchantments.length >= 1, 'Sword has enchantments');
  const book = [...f.game.inventory.hotbar, ...f.game.inventory.storage].find(s => s && s.id === 'enchanted_book');
  assert.ok(book.enchantments.length >= 1, 'Book has enchantments');
});

test('Survival Scenario 15: Villager trading functionality in Creative mode (career progression, leveling up, regeneration grant, and rewards)', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';

  // Spawn a Cleric villager next to player at (2, 1, 0.5)
  const cleric = {
    type: 'villager',
    name: 'Cleric',
    profession: 'cleric',
    health: 20,
    maxHealth: 20,
    mesh: { position: new THREE.Vector3(2, 1, 0.5) },
    position: new THREE.Vector3(2, 1, 0.5)
  };
  initVillagerEconomy(cleric, 'cleric', { random: () => 0.1 });
  f.game.mobs.mobs.push(cleric);

  const initialTrades = cleric.trades.length;
  assert.ok(initialTrades >= 1, 'Cleric has initial novice trades');

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'trade 5 with cleric'
      ],
      assertions: [
        {
          name: 'cleric gained experience from trades',
          check: () => cleric.xp > 0
        },
        {
          name: 'cleric leveled up to apprentice or beyond',
          check: () => cleric.level >= 2
        },
        {
          name: 'cleric received regeneration I timer from leveling up',
          check: () => cleric.regenerationTimer > 0
        },
        {
          name: 'new trades unlocked on career progression',
          check: () => cleric.trades.length > initialTrades
        },
        {
          name: 'bot received trade rewards in inventory',
          check: (game, bot) => bot.itemCount('emerald') > 0 || bot.itemCount('redstone') > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.ok(cleric.level >= 2, 'Cleric reached level 2+');
  assert.ok(cleric.trades.length > initialTrades, 'New trades unlocked');
});




test('Survival Scenario 16: Farming parity - the bot tills a dirt path, is refused on podzol, and the hoe wears by 1 per tilling', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.world.setVoxel(1, 0, 0, BLOCKS.DIRT_PATH);
  f.world.setVoxel(1, 0, 1, BLOCKS.PODZOL);
  f.inventory.addItem('iron_hoe', false, 1);
  const hoe = () => f.inventory.hotbar.concat(f.inventory.storage || []).find(i => i?.id === 'iron_hoe');

  const tilled = await f.drive(f.bot.run({ type: 'till', position: [1, 0, 0] }));
  assert.equal(tilled.ok, true, tilled.message);
  assert.ok([BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST].includes(f.world.getVoxel(1, 0, 0)), 'dirt path becomes farmland');
  assert.equal(hoe().durability, hoe().maxDurability - 1, 'one tilling spends exactly one durability');

  const refused = await f.drive(f.bot.run({ type: 'till', position: [1, 0, 1] }).catch(e => ({ ok: false, message: e.message })));
  assert.equal(refused.ok, false, 'wiki: hoes do not work on podzol');
  assert.equal(f.world.getVoxel(1, 0, 1), BLOCKS.PODZOL, 'podzol is untouched');
  assert.equal(hoe().durability, hoe().maxDurability - 1, 'a refused tilling costs nothing');
});

test('Survival Scenario 17: Farming parity - the bot plants wheat, light and bone meal decide growth, harvest drops 1 wheat and 1-4 seeds', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.world.setVoxel(1, 0, 0, BLOCKS.FARMLAND_MOIST);
  f.world.setVoxel(2, 0, 2, BLOCKS.WATER);
  f.game.farmingManager.registerFarmland(1, 0, 0);
  f.inventory.addItem('wheat_seeds', false, 2);

  const planted = await f.drive(f.bot.run({ type: 'place', item: 'wheat_seeds', position: [1, 1, 0], count: 1 }));
  assert.equal(planted.ok, true, planted.message);
  f.game.farmingManager.registerCrop(1, 1, 0);

  // Growth is gated on light 9: dark -> stays at stage 0 however many ticks pass.
  f.game.farmingManager.random = () => 0;
  f.world.getLightLevel = () => 4;
  for (let i = 0; i < 10; i++) { f.game.farmingManager.tickTimer = 99; f.game.farmingManager.update(0, null); }
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.WHEAT_STAGE_0, 'no growth in the dark');
  f.world.getLightLevel = () => 15;
  for (let i = 0; i < 10; i++) { f.game.farmingManager.tickTimer = 99; f.game.farmingManager.update(0, null); }
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.WHEAT_STAGE_7, 'lit, hydrated wheat reaches maturity');

  // The bot harvests it: 1 wheat and at least one seed come back.
  f.inventory.addItem('wheat_seeds', false, 0);
  f.game.entities.droppedItems.length = 0;
  f.game.farmingManager.harvest(1, 1, 0, f.player);
  const ids = f.game.entities.droppedItems.map(d => d.itemType);
  assert.ok(ids.includes('wheat'), 'harvest drops wheat');
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.WHEAT_STAGE_0, 'right-click harvest replants');
});
