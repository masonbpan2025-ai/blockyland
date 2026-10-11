import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurvivalFixture } from './playerBotSurvivalScenarios.test.js';
import { BLOCKS } from '../src/blocks.js';
import { calculateBookshelfCount } from '../src/enchanting.js';
import { initVillagerEconomy } from '../src/villagerEconomy.js';

test('Creative Bot Brewing: Multi-stage potion alchemy and splash potion conversion', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';

  // 1. Place brewing stand at (1, 1, 0)
  // 2. Brew water_bottle + nether_wart -> awkward_potion
  // 3. Brew awkward_potion + sugar -> potion_of_swiftness
  // 4. Brew potion_of_swiftness + redstone -> potion_of_swiftness_long (extended)
  // 5. Brew potion_of_swiftness_long + gunpowder -> splash_potion_of_swiftness_long

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place brewing_stand at 1 1 0',
        'brew nether_wart into water_bottle at 1 1 0',
        'brew sugar into awkward_potion at 1 1 0',
        'brew redstone into potion_of_swiftness at 1 1 0',
        'brew gunpowder into potion_of_swiftness_long at 1 1 0'
      ],
      assertions: [
        {
          name: 'brewing stand placed and active',
          check: game => game.world.getVoxel(1, 1, 0) === BLOCKS.BREWING_STAND
        },
        {
          name: 'extended splash swiftness potion successfully created',
          check: (game, bot) => bot.itemCount('splash_potion_of_swiftness_long') > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.ok(f.bot.itemCount('splash_potion_of_swiftness_long') >= 1);
});

test('Creative Bot Brewing: Healing and enhanced tier II potency alchemy', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';

  // 1. Place brewing stand at (1, 1, 0)
  // 2. Brew nether_wart into water_bottle -> awkward_potion
  // 3. Brew glistering_melon_slice into awkward_potion -> potion_of_healing
  // 4. Brew glowstone_dust into potion_of_healing -> potion_of_healing_2 (Tier II)

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'place brewing_stand at 1 1 0',
        'brew nether_wart into water_bottle at 1 1 0',
        'brew glistering_melon_slice into awkward_potion at 1 1 0',
        'brew glowstone_dust into potion_of_healing at 1 1 0'
      ],
      assertions: [
        {
          name: 'potion of healing II successfully created',
          check: (game, bot) => bot.itemCount('potion_of_healing_2') > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.ok(f.bot.itemCount('potion_of_healing_2') >= 1);
});

test('Creative Bot Enchanting: Armor and weapon enchanting without experience level or lapis constraints', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';
  f.player.level = 0; // Confirm zero levels in creative mode works

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
        'enchant diamond_chestplate slot 2 at 0 1 0',
        'enchant diamond_pickaxe slot 2 at 0 1 0'
      ],
      assertions: [
        {
          name: 'bookshelf count is exactly 15 for max enchant level',
          check: game => calculateBookshelfCount(game.world, 0, 1, 0) === 15
        },
        {
          name: 'diamond chestplate received armor enchantments (Protection/Unbreaking/etc)',
          check: game => {
            const cp = [...game.inventory.hotbar, ...game.inventory.storage].find(s => s && s.id === 'diamond_chestplate');
            return cp && Array.isArray(cp.enchantments) && cp.enchantments.length > 0;
          }
        },
        {
          name: 'diamond pickaxe received tool enchantments (Efficiency/Fortune/Unbreaking/etc)',
          check: game => {
            const pick = [...game.inventory.hotbar, ...game.inventory.storage].find(s => s && s.id === 'diamond_pickaxe');
            return pick && Array.isArray(pick.enchantments) && pick.enchantments.length > 0;
          }
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  const cp = [...f.game.inventory.hotbar, ...f.game.inventory.storage].find(s => s && s.id === 'diamond_chestplate');
  assert.ok(cp.enchantments.length >= 1);
  const pick = [...f.game.inventory.hotbar, ...f.game.inventory.storage].find(s => s && s.id === 'diamond_pickaxe');
  assert.ok(pick.enchantments.length >= 1);
});

test('Creative Bot Trading: Multi-profession trading, career level advancement, and wandering trader interaction', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.player.gamemode = 'creative';

  // 1. Farmer villager near bot at (2, 1, 0.5)
  const farmer = {
    type: 'villager',
    name: 'Farmer',
    profession: 'farmer',
    health: 20,
    maxHealth: 20,
    mesh: { position: new THREE.Vector3(2, 1, 0.5) },
    position: new THREE.Vector3(2, 1, 0.5)
  };
  initVillagerEconomy(farmer, 'farmer', { random: () => 0.2 });
  f.game.mobs.mobs.push(farmer);

  // 2. Wandering Trader near bot at (0.5, 1, 2)
  const trader = {
    type: 'wandering_trader',
    name: 'Wandering Trader',
    health: 20,
    maxHealth: 20,
    mesh: { position: new THREE.Vector3(0.5, 1, 2) },
    position: new THREE.Vector3(0.5, 1, 2),
    trades: [
      {
        key: 'trader:0',
        cost: { id: 'emerald', count: 1, name: 'Emerald' },
        cost2: null,
        reward: { id: 'slime_ball', count: 1, name: 'Slimeball' },
        maxUses: 5,
        uses: 0,
        disabled: false
      }
    ]
  };
  f.game.mobs.mobs.push(trader);

  const initialFarmerTrades = farmer.trades.length;

  const report = await f.drive(
    f.bot.runScenario({
      commands: [
        'trade 5 with farmer',
        'trade 1 with wandering_trader'
      ],
      assertions: [
        {
          name: 'farmer reached level 2+ and unlocked new trades',
          check: () => farmer.level >= 2 && farmer.trades.length > initialFarmerTrades
        },
        {
          name: 'wandering trader executed trade successfully in creative mode',
          check: () => trader.trades[0].uses === 1
        },
        {
          name: 'bot received trade reward items in inventory',
          check: (game, bot) => bot.itemCount('bread') > 0 || bot.itemCount('emerald') > 0 || bot.itemCount('slime_ball') > 0
        }
      ]
    })
  );

  assert.equal(report.ok, true, `Scenario failed: ${JSON.stringify(report)}`);
  assert.equal(report.checks.every(c => c.ok), true);
  assert.ok(farmer.level >= 2);
  assert.equal(trader.trades[0].uses, 1);
  assert.ok(f.bot.itemCount('slime_ball') >= 1);
});
