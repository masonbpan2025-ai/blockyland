import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { UIManager } from '../src/ui.js';
import {
  BrewingStand,
  getBrewingResult,
  POTION_DATA
} from '../src/brewing.js';
import {
  calculateAnvilResult,
  getAnvilDegradation,
  REPAIR_MATERIALS
} from '../src/anvil.js';
import {
  calculateGrindstoneResult
} from '../src/grindstone.js';
import {
  calculateBeaconPyramid,
  applyBeaconBuffs,
  calculateConduitFrame,
  applyConduitPower
} from '../src/beaconConduit.js';

test('Brewing & Alchemy Engine: Recipes, Potion tiers, Fuel, and BrewingStand execution', () => {
  // 1. Base recipe transformations
  assert.equal(getBrewingResult('water_bottle', 'nether_wart'), 'awkward_potion');
  assert.equal(getBrewingResult('water_bottle', 'fermented_spider_eye'), 'potion_of_weakness');
  assert.equal(getBrewingResult('awkward_potion', 'sugar'), 'potion_of_swiftness');
  assert.equal(getBrewingResult('awkward_potion', 'blaze_powder'), 'potion_of_strength');
  assert.equal(getBrewingResult('awkward_potion', 'glistering_melon_slice'), 'potion_of_healing');
  assert.equal(getBrewingResult('awkward_potion', 'ghast_tear'), 'potion_of_regeneration');
  assert.equal(getBrewingResult('awkward_potion', 'magma_cream'), 'potion_of_fire_resistance');

  // 2. Corruptions
  assert.equal(getBrewingResult('potion_of_night_vision', 'fermented_spider_eye'), 'potion_of_invisibility');
  assert.equal(getBrewingResult('potion_of_healing', 'fermented_spider_eye'), 'potion_of_harming');

  // 3. Modifiers (Redstone = Long, Glowstone = II, Gunpowder = Splash, Dragon's Breath = Lingering)
  assert.equal(getBrewingResult('potion_of_strength', 'redstone'), 'potion_of_strength_long');
  assert.equal(getBrewingResult('potion_of_strength', 'glowstone_dust'), 'potion_of_strength_2');
  assert.equal(getBrewingResult('potion_of_healing', 'gunpowder'), 'splash_potion_of_healing');
  assert.equal(getBrewingResult('splash_potion_of_healing', 'dragon_breath'), 'lingering_potion_of_healing');

  // 4. BrewingStand state machine
  const stand = new BrewingStand();
  assert.equal(stand.canBrew(), false, 'Cannot brew without fuel, ingredients, or bottles');

  // Add Blaze Powder Fuel
  assert.equal(stand.addFuel({ id: 'blaze_powder' }), true);
  assert.equal(stand.fuel, 20);

  // Setup Awkward Potion brewing: Nether Wart + 3 Water Bottles
  stand.ingredient = { id: 'nether_wart', count: 3 };
  stand.bottles[0] = { id: 'water_bottle', count: 1 };
  stand.bottles[1] = { id: 'water_bottle', count: 1 };
  stand.bottles[2] = { id: 'water_bottle', count: 1 };

  assert.equal(stand.canBrew(), true);

  // Complete brewing operation
  const success = stand.completeBrew();
  assert.equal(success, true);
  assert.equal(stand.fuel, 19, 'Fuel consumed by 1');
  assert.equal(stand.ingredient.count, 2, 'Consumed 1 Nether Wart');
  assert.equal(stand.bottles[0].id, 'awkward_potion');
  assert.equal(stand.bottles[1].id, 'awkward_potion');
  assert.equal(stand.bottles[2].id, 'awkward_potion');
});

test('Anvil Engine: Repair, Renaming, Enchantment merging, Prior Work Penalty, and Degradation', () => {
  // 1. Material Unit Repair: Damaged Iron Sword + Iron Ingot
  const damagedSword = {
    id: 'iron_sword',
    durability: 100,
    maxDurability: 250,
    repairCost: 0
  };
  const ironIngots = { id: 'iron_ingot', count: 2 };

  const repairCalc = calculateAnvilResult(damagedSword, ironIngots, '', 'survival');
  assert.equal(repairCalc.valid, true);
  assert.ok(repairCalc.result.durability > 100, 'Durability was restored');
  assert.ok(repairCalc.levelCost > 0, 'Cost in player levels required');
  assert.equal(repairCalc.result.repairCost, 1, 'Prior work penalty incremented (2*0 + 1 = 1)');

  // 2. Renaming item
  const renameCalc = calculateAnvilResult(damagedSword, null, 'Excalibur', 'survival');
  assert.equal(renameCalc.valid, true);
  assert.equal(renameCalc.result.customName, 'Excalibur');
  assert.equal(renameCalc.levelCost, 1, 'Renaming costs 1 level');

  // 3. Enchantment Merging from Book
  const basePickaxe = {
    id: 'diamond_pickaxe',
    durability: 1561,
    maxDurability: 1561,
    enchantments: [{ id: 'efficiency', level: 2 }],
    repairCost: 1
  };
  const book = {
    id: 'enchanted_book',
    enchantments: [{ id: 'efficiency', level: 2 }, { id: 'fortune', level: 2 }]
  };

  const enchantCalc = calculateAnvilResult(basePickaxe, book, '', 'survival');
  assert.equal(enchantCalc.valid, true);
  // Efficiency II + Efficiency II -> Efficiency III
  const eff = enchantCalc.result.enchantments.find(e => e.id === 'efficiency');
  assert.equal(eff.level, 3, 'Matching enchantment levels combine to level+1');
  const fort = enchantCalc.result.enchantments.find(e => e.id === 'fortune');
  assert.equal(fort.level, 2, 'Added new enchantment from book');

  // 4. "Too Expensive!" Rule (levelCost >= 40 in Survival)
  const hyperExpensive = {
    ...basePickaxe,
    repairCost: 31 // 2^5 - 1
  };
  const heavyBook = {
    id: 'enchanted_book',
    repairCost: 15,
    enchantments: [{ id: 'efficiency', level: 4 }]
  };
  const expensiveCalc = calculateAnvilResult(hyperExpensive, heavyBook, '', 'survival');
  assert.equal(expensiveCalc.tooExpensive, true);
  assert.equal(expensiveCalc.valid, false, 'Rejected because cost exceeds survival limit 39');

  // In Creative mode, valid despite cost >= 40
  const creativeCalc = calculateAnvilResult(hyperExpensive, heavyBook, '', 'creative');
  assert.equal(creativeCalc.valid, true, 'Allowed in creative mode');

  // 5. Anvil Degradation
  const degraded = getAnvilDegradation(BLOCKS.ANVIL);
  assert.equal(degraded === BLOCKS.ANVIL || degraded === BLOCKS.CHIPPED_ANVIL, true);
  assert.equal(getAnvilDegradation(BLOCKS.ANVIL, true), BLOCKS.CHIPPED_ANVIL);
  assert.equal(getAnvilDegradation(BLOCKS.CHIPPED_ANVIL, true), BLOCKS.DAMAGED_ANVIL);
  assert.equal(getAnvilDegradation(BLOCKS.DAMAGED_ANVIL, true), BLOCKS.AIR);
});

test('Grindstone Engine: Disenchanting, Combination Repair, and Experience Points Refund', () => {
  // 1. Single Enchanted Sword -> Disenchant & XP refund
  const enchantedSword = {
    id: 'diamond_sword',
    durability: 1200,
    maxDurability: 1561,
    enchantments: [
      { id: 'sharpness', level: 4 },
      { id: 'fire_aspect', level: 2 }
    ],
    repairCost: 7
  };

  const singleRes = calculateGrindstoneResult(enchantedSword, null);
  assert.equal(singleRes.valid, true);
  assert.equal(singleRes.result.enchantments.length, 0, 'All enchantments stripped');
  assert.equal(singleRes.result.repairCost, 0, 'Prior work penalty reset to 0');
  assert.ok(singleRes.xpDrop > 10, 'Refunded experience points from enchantments');

  // 2. Two Damaged Items -> Repair + Disenchant + 5% bonus durability
  const swordA = { id: 'iron_sword', durability: 50, maxDurability: 250, enchantments: [{ id: 'smite', level: 1 }] };
  const swordB = { id: 'iron_sword', durability: 50, maxDurability: 250, enchantments: [] };

  const comboRes = calculateGrindstoneResult(swordA, swordB);
  assert.equal(comboRes.valid, true);
  assert.equal(comboRes.consumedBoth, true);
  // 50 + 50 + 12 (5% of 250) = 112 durability
  assert.equal(comboRes.result.durability, 112);
  assert.equal(comboRes.result.enchantments.length, 0);
  assert.ok(comboRes.xpDrop > 0);

  // 3. Single un-enchanted item is invalid
  const unenchanted = { id: 'iron_sword', durability: 100, maxDurability: 250, enchantments: [] };
  const invalidRes = calculateGrindstoneResult(unenchanted, null);
  assert.equal(invalidRes.valid, false);
});

test('Beacon & Conduit Mechanics: Pyramid validation, Sky visibility, Buffs, and Conduit Power', () => {
  const world = new World(101);
  world.reseed(101);

  // 1. Build a 3x3 Tier 1 Beacon Pyramid at (10, 20, 10)
  const bx = 10, by = 20, bz = 10;
  world.setVoxel(bx, by, bz, BLOCKS.BEACON);

  // Ensure clear sky above
  for (let y = by + 1; y < 64; y++) {
    world.setVoxel(bx, y, bz, BLOCKS.AIR);
  }

  // Underneath: 3x3 Iron Blocks
  for (let x = bx - 1; x <= bx + 1; x++) {
    for (let z = bz - 1; z <= bz + 1; z++) {
      world.setVoxel(x, by - 1, z, BLOCKS.IRON_BLOCK);
    }
  }

  const beaconCheck = calculateBeaconPyramid(world, bx, by, bz);
  assert.equal(beaconCheck.tier, 1, 'Detected Tier 1 pyramid');
  assert.equal(beaconCheck.active, true, 'Beacon is active');
  assert.equal(beaconCheck.range, 20, 'Tier 1 range is 20m');
  assert.ok(beaconCheck.availablePrimaries.includes('speed'));

  // Obstruct sky with bedrock -> beacon deactivates
  world.setVoxel(bx, by + 5, bz, BLOCKS.BEDROCK);
  const obstructedCheck = calculateBeaconPyramid(world, bx, by, bz);
  assert.equal(obstructedCheck.active, false, 'Beacon deactivates when sky view is obstructed');
  world.setVoxel(bx, by + 5, bz, BLOCKS.AIR); // restore sky

  // Apply Beacon Buffs to Player
  //
  // The mock used to be `{ statusEffects: {} }` and the assertion read `statusEffects.speed > 0`, which is
  // the shape the bug produced: a plain property on an object that no reader consults. A player's
  // `statusEffects` is a Map, and `applyStatusEffect` is how an effect gets into it, so the mock is that
  // shape now and the assertion reads the way the game reads.
  const mockPlayer = {
    position: new THREE.Vector3(bx + 5, by, bz + 5),
    statusEffects: new Map(),
    applyStatusEffect(name, duration, level = 1) { this.statusEffects.set(name, { duration, level }); },
    hasStatusEffect(name) { return this.statusEffects.has(name); },
  };
  applyBeaconBuffs({ active: true, range: 20, tier: 1, primary: 'speed' }, mockPlayer, new THREE.Vector3(bx, by, bz));
  assert.equal(mockPlayer.hasStatusEffect('speed'), true, 'Player received Speed buff from Beacon');
  assert.equal(mockPlayer.statusEffects.get('speed').level, 1, 'a tier 1 pyramid grants level I');
  assert.equal(mockPlayer.statusEffects.get('speed').duration, 16, 'with the 16 s buffer');

  // 2. Conduit Frame Check
  const cx = 30, cy = 15, cz = 30;
  world.setVoxel(cx, cy, cz, BLOCKS.CONDUIT);

  // Build a 16-block Prismarine ring frame around conduit (XY plane at z = cz)
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 2) {
        world.setVoxel(x, y, cz, BLOCKS.PRISMARINE);
      }
    }
  }

  const conduitCheck = calculateConduitFrame(world, cx, cy, cz);
  assert.equal(conduitCheck.active, true, 'Conduit activated with >= 16 frame blocks');
  assert.ok(conduitCheck.range >= 32);

  // Apply Conduit Power to underwater player
  const underwaterPlayer = {
    position: new THREE.Vector3(cx + 4, cy, cz + 4),
    inWater: true,
    statusEffects: new Map(),
    applyStatusEffect(name, duration, level = 1) { this.statusEffects.set(name, { duration, level }); },
    hasStatusEffect(name) { return this.statusEffects.has(name); },
  };
  applyConduitPower(conduitCheck, underwaterPlayer, new THREE.Vector3(cx, cy, cz));
  assert.equal(underwaterPlayer.hasStatusEffect('conduit_power'), true, 'Conduit Power is applied');
  assert.equal(underwaterPlayer.hasStatusEffect('water_breathing'), true, 'and the breathing it carries');
  assert.equal(underwaterPlayer.hasStatusEffect('haste'), true, 'and the haste, which now speeds mining');
});

test('Interactive Workstation UI Modals: Opening, Interacting, Slotted items, and Clean Close', () => {
  const world = new World(555);
  world.reseed(555);
  const inv = new Inventory();
  const player = new Player(world, inv, { x: 0, y: 10, z: 0 });
  player.gamemode = 'survival';
  player.level = 10;
  player.totalExp = 160;

  const mockEl = (id, tag = 'div') => {
    const classSet = new Set(['hidden']);
    const children = [];
    return {
      id,
      tagName: tag.toUpperCase(),
      classList: {
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        contains: (c) => classSet.has(c)
      },
      style: {},
      dataset: {},
      children,
      appendChild: (c) => { children.push(c); return c; },
      addEventListener: function(ev, fn) { this[`on${ev}`] = fn; },
      removeEventListener: () => {},
      removeAttribute: () => {},
      setAttribute: () => {},
      querySelector: (sel) => mockEl(`query-${sel}`),
      querySelectorAll: () => [],
      innerHTML: '',
      textContent: '',
      value: ''
    };
  };

  const elements = {
    'armor-bar': mockEl('armor-bar'),
    'health-bar': mockEl('health-bar'),
    'hunger-bar': mockEl('hunger-bar'),
    'offhand-hud-slot': mockEl('offhand-hud-slot'),
    'status-bars': mockEl('status-bars'),
    'exp-container': mockEl('exp-container'),
    'exp-bar': mockEl('exp-bar'),
    'exp-level': mockEl('exp-level'),
    'hotbar-wrapper': mockEl('hotbar-wrapper'),
    'inv-modal': mockEl('inv-modal'),
    'craft-modal': mockEl('craft-modal'),
    'furnace-modal': mockEl('furnace-modal'),
    'chest-modal': mockEl('chest-modal'),
    'villager-modal': mockEl('villager-modal'),
    'pause-menu': mockEl('pause-menu'),
    'start-overlay': mockEl('start-overlay'),
    'gemini-modal': mockEl('gemini-modal'),
    'designed-worlds-modal': mockEl('designed-worlds-modal'),
    'map-modal': mockEl('map-modal'),
    'world-biome-modal': mockEl('world-biome-modal'),
    'floating-cursor-item': mockEl('floating-cursor-item'),

    // Workstation Modals
    'brewing-modal': mockEl('brewing-modal'),
    'close-brewing': mockEl('close-brewing'),
    'brewing-fuel-slot': mockEl('brewing-fuel-slot'),
    'brewing-fuel-bar': mockEl('brewing-fuel-bar'),
    'brewing-ingredient-slot': mockEl('brewing-ingredient-slot'),
    'brewing-progress-bar': mockEl('brewing-progress-bar'),
    'brewing-status-text': mockEl('brewing-status-text'),
    'brewing-bottle-0': mockEl('brewing-bottle-0'),
    'brewing-bottle-1': mockEl('brewing-bottle-1'),
    'brewing-bottle-2': mockEl('brewing-bottle-2'),
    'brewing-storage-grid': mockEl('brewing-storage-grid'),
    'brewing-hotbar-grid': mockEl('brewing-hotbar-grid'),

    'anvil-modal': mockEl('anvil-modal'),
    'close-anvil': mockEl('close-anvil'),
    'anvil-name-input': mockEl('anvil-name-input', 'input'),
    'anvil-left-slot': mockEl('anvil-left-slot'),
    'anvil-right-slot': mockEl('anvil-right-slot'),
    'anvil-output-slot': mockEl('anvil-output-slot'),
    'anvil-cost-label': mockEl('anvil-cost-label'),
    'anvil-storage-grid': mockEl('anvil-storage-grid'),
    'anvil-hotbar-grid': mockEl('anvil-hotbar-grid'),

    'grindstone-modal': mockEl('grindstone-modal'),
    'close-grindstone': mockEl('close-grindstone'),
    'grindstone-top-slot': mockEl('grindstone-top-slot'),
    'grindstone-bottom-slot': mockEl('grindstone-bottom-slot'),
    'grindstone-output-slot': mockEl('grindstone-output-slot'),
    'grindstone-xp-label': mockEl('grindstone-xp-label'),
    'grindstone-storage-grid': mockEl('grindstone-storage-grid'),
    'grindstone-hotbar-grid': mockEl('grindstone-hotbar-grid'),

    'beacon-modal': mockEl('beacon-modal'),
    'close-beacon': mockEl('close-beacon'),
    'beacon-tier-label': mockEl('beacon-tier-label'),
    'beacon-range-label': mockEl('beacon-range-label'),
    'beacon-btn-speed': mockEl('beacon-btn-speed', 'button'),
    'beacon-btn-haste': mockEl('beacon-btn-haste', 'button'),
    'beacon-btn-resistance': mockEl('beacon-btn-resistance', 'button'),
    'beacon-btn-jump_boost': mockEl('beacon-btn-jump_boost', 'button'),
    'beacon-btn-strength': mockEl('beacon-btn-strength', 'button'),
    'beacon-btn-regeneration': mockEl('beacon-btn-regeneration', 'button'),
    'beacon-btn-level2': mockEl('beacon-btn-level2', 'button'),
    'beacon-payment-slot': mockEl('beacon-payment-slot'),
    'beacon-activate-btn': mockEl('beacon-activate-btn', 'button'),
    'beacon-storage-grid': mockEl('beacon-storage-grid'),
    'beacon-hotbar-grid': mockEl('beacon-hotbar-grid')
  };

  const origDoc = globalThis.document;
  const origWindow = globalThis.window;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080
  };
  globalThis.document = {
    getElementById: (id) => elements[id] || (elements[id] = mockEl(id)),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => mockEl(`gen-${tag}`, tag),
    exitPointerLock: () => {}
  };

  const sounds = { playClick: () => {}, playAnvil: () => {}, playLevelUp: () => {}, playHurt: () => {} };
  const ui = new UIManager(inv, player, world, { mobs: [] }, sounds, { world, sounds });

  // 1. Open Brewing Stand GUI
  ui.openBrewingStand(10, 10, 10);
  assert.equal(elements['brewing-modal'].classList.contains('hidden'), false);

  // Slotted item return on close
  ui.brewingStand.ingredient = { id: 'nether_wart', count: 5 };
  ui.closeBrewingModal();
  assert.equal(elements['brewing-modal'].classList.contains('hidden'), true);
  assert.equal(ui.brewingStand.ingredient, null);
  const hasNetherWart = inv.hotbar.concat(inv.storage).some(s => s && s.id === 'nether_wart' && s.count >= 5);
  assert.equal(hasNetherWart, true, 'Nether Wart was safely returned to inventory on modal close');

  // 2. Open Anvil GUI
  ui.openAnvil(15, 10, 15);
  assert.equal(elements['anvil-modal'].classList.contains('hidden'), false);

  ui.anvilLeftItem = { id: 'iron_sword', durability: 50, maxDurability: 250 };
  ui.anvilRightItem = { id: 'iron_ingot', count: 2 };
  ui.anvilCustomName = 'Blade of Glory';
  ui.renderAnvilGUI();

  // Take output
  const prevLevels = player.level;
  const calc = calculateAnvilResult(ui.anvilLeftItem, ui.anvilRightItem, ui.anvilCustomName, player.gamemode);
  ui.takeAnvilOutput(calc);
  assert.ok(player.level < prevLevels, 'Player levels were consumed for repair and renaming');
  assert.equal(inv.cursorItem.customName, 'Blade of Glory');
  ui.closeAnvilModal();

  // 3. Open Grindstone GUI
  ui.openGrindstone(20, 10, 20);
  assert.equal(elements['grindstone-modal'].classList.contains('hidden'), false);

  ui.grindstoneTopItem = {
    id: 'diamond_sword',
    enchantments: [{ id: 'sharpness', level: 3 }]
  };
  ui.renderGrindstoneGUI();
  const grindCalc = calculateGrindstoneResult(ui.grindstoneTopItem, null);
  const prevExp = player.exp || 0;
  const prevLvl = player.level;
  ui.takeGrindstoneOutput(grindCalc);
  assert.ok((player.exp > prevExp) || (player.level > prevLvl), 'Disenchanting refunded player experience points');
  assert.equal(inv.cursorItem.enchantments.length, 0, 'Enchantments were removed');
  ui.closeGrindstoneModal();

  // 4. Open Beacon GUI
  ui.openBeacon(25, 10, 25);
  assert.equal(elements['beacon-modal'].classList.contains('hidden'), false);
  ui.closeBeaconModal();

  // Restore mocks
  globalThis.document = origDoc;
  globalThis.window = origWindow;
});
