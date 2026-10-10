import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  getXpToNextLevel,
  getTotalXpForLevel,
  getLevelFromTotalXp,
  addPlayerExperience,
  consumePlayerLevels,
  getExpProgress
} from '../src/experience.js';
import {
  ENCHANTMENT_REGISTRY,
  TREASURE_ENCHANTMENTS,
  getItemEnchantCategory,
  isEnchantableItem,
  areIncompatible,
  incompatibleWith,
  eligibleEnchantments,
  experienceCost,
  enchantmentCost,
  enchantabilityOf,
  lapisCostForSlot,
  levelForCost,
  selectEnchantments,
  calculateBookshelfCount,
  generateRunes,
  generateEnchantmentOffers,
  applyEnchantment,
  EnchantingManager
} from '../src/enchanting.js';
import { EntityManager } from '../src/entities.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';

/**
 * A deterministic `Math.random` stand-in.
 *
 * The offer engine is genuinely random in vanilla -- the whole point of the slot costs is that the same
 * item can roll differently -- so the tests drive it with a seeded stream instead of asserting on one
 * lucky roll. Mulberry32, because it is four lines and its stream is stable.
 */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const item = (id) => ({ id, isBlock: false, count: 1 });

test('Minecraft Wiki Experience & Leveling Formulas', () => {
  // Level 0 -> 1: 2(0) + 7 = 7 XP
  assert.equal(getXpToNextLevel(0), 7);
  // Level 10 -> 11: 2(10) + 7 = 27 XP
  assert.equal(getXpToNextLevel(10), 27);
  // Level 15 -> 16: 2(15) + 7 = 37 XP
  assert.equal(getXpToNextLevel(15), 37);

  // Level 16 -> 17: 5(16) - 38 = 42 XP
  assert.equal(getXpToNextLevel(16), 42);
  // Level 29 -> 30: 5(29) - 38 = 107 XP
  assert.equal(getXpToNextLevel(29), 107);

  // Level 30 -> 31: 9(30) - 158 = 112 XP
  assert.equal(getXpToNextLevel(30), 112);
  // Level 50 -> 51: 9(50) - 158 = 292 XP
  assert.equal(getXpToNextLevel(50), 292);

  // Cumulative XP check: Level 7 should be 7^2 + 6(7) = 49 + 42 = 91 XP
  assert.equal(getTotalXpForLevel(7), 91);
  // Level 16: 16^2 + 6(16) = 256 + 96 = 352 XP
  assert.equal(getTotalXpForLevel(16), 352);
  // Level 30: 1395 XP (canonical Minecraft level 30 milestone)
  assert.equal(getTotalXpForLevel(30), 1395);

  // Total XP to Level conversion
  assert.equal(getLevelFromTotalXp(0), 0);
  assert.equal(getLevelFromTotalXp(91), 7);
  assert.equal(getLevelFromTotalXp(352), 16);
  assert.equal(getLevelFromTotalXp(1395), 30);
});

test('Player Experience Accumulation, Level Up & Level Consumption', () => {
  let playedLevelUp = false;
  let statsUpdated = false;
  const mockSounds = { playLevelUp: () => { playedLevelUp = true; } };
  const mockUi = { updateStats: () => { statsUpdated = true; } };

  const player = { exp: 0, level: 0 };

  // Add 5 XP (insufficient for level 1: requires 7 XP)
  const res1 = addPlayerExperience(player, 5, mockSounds, mockUi);
  assert.equal(res1.level, 0);
  assert.equal(res1.exp, 5);
  assert.equal(res1.leveledUp, false);
  assert.equal(getExpProgress(player), 5 / 7);

  // Add 10 XP: reaches 15 XP -> advances to level 1 (cost 7 XP, 8 left), level 1 requires 9 XP
  const res2 = addPlayerExperience(player, 10, mockSounds, mockUi);
  assert.equal(res2.level, 1);
  assert.equal(res2.exp, 8);
  assert.equal(res2.leveledUp, true);
  assert.equal(playedLevelUp, true);
  assert.equal(statsUpdated, true);
  assert.equal(getExpProgress(player), 8 / 9);

  // Large XP injection (e.g. 1500 XP directly leaps to level 30+)
  addPlayerExperience(player, 1500, mockSounds, mockUi);
  assert.ok(player.level >= 30, `Player level should be >= 30, got ${player.level}`);

  // Level consumption for enchanting (e.g. deducting 3 levels)
  const currentLevel = player.level;
  const consumed = consumePlayerLevels(player, 3, mockUi);
  assert.equal(consumed, true);
  assert.equal(player.level, currentLevel - 3);

  // Cannot consume more levels than current
  player.level = 2;
  const failedConsume = consumePlayerLevels(player, 5, mockUi);
  assert.equal(failedConsume, false);
  assert.equal(player.level, 2);
});

test('Bookshelf Power Level Detection Around Enchanting Table', () => {
  // Mock voxel world
  const voxels = new Map();
  const world = {
    getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) || BLOCKS.AIR,
    setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id)
  };

  const tableX = 10, tableY = 20, tableZ = 10;
  world.setVoxel(tableX, tableY, tableZ, BLOCKS.ENCHANTING_TABLE);

  // 0 bookshelves
  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 0);

  // Place 1 bookshelf at distance 2 (dx = 2, dz = 0, dy = 0) with air at (dx = 1)
  world.setVoxel(tableX + 2, tableY, tableZ, BLOCKS.BOOKSHELF);
  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 1);

  // Obstruct air gap between table and bookshelf with a solid block
  world.setVoxel(tableX + 1, tableY, tableZ, BLOCKS.STONE);
  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 0, 'Obstructed bookshelf must not be counted');

  // Clear obstruction
  world.setVoxel(tableX + 1, tableY, tableZ, BLOCKS.AIR);
  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 1);

  // Build full 15-bookshelf authentic library configuration around table
  let placed = 0;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
      if (placed < 15) {
        world.setVoxel(tableX + dx, tableY, tableZ + dz, BLOCKS.BOOKSHELF);
        placed++;
      }
    }
  }

  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 15);

  // Extra bookshelves beyond 15 are capped at 15
  world.setVoxel(tableX + 2, tableY + 1, tableZ, BLOCKS.BOOKSHELF);
  world.setVoxel(tableX - 2, tableY + 1, tableZ, BLOCKS.BOOKSHELF);
  assert.equal(calculateBookshelfCount(world, tableX, tableY, tableZ), 15, 'Bookshelf count is capped at 15');
});

test('Enchantment Eligibility and Offer Generation', () => {
  // Category checks
  assert.equal(getItemEnchantCategory('diamond_sword'), 'weapon');
  assert.equal(getItemEnchantCategory('iron_axe'), 'weapon');
  assert.equal(getItemEnchantCategory('diamond_pickaxe'), 'tool');
  assert.equal(getItemEnchantCategory('netherite_chestplate'), 'chestplate');
  assert.equal(getItemEnchantCategory('bow'), 'bow');
  assert.equal(getItemEnchantCategory('book'), 'book');
  assert.equal(getItemEnchantCategory('dirt'), null);
  assert.equal(getItemEnchantCategory('stick'), null);

  // isEnchantableItem
  assert.equal(isEnchantableItem(item('diamond_sword')), true);
  assert.equal(isEnchantableItem({ id: 'stick', isBlock: false, count: 64 }), false);
  assert.equal(isEnchantableItem({ ...item('diamond_sword'), enchantments: [{ id: 'sharpness', level: 1 }] }), false,
    'Already enchanted item cannot be re-enchanted at table');

  // The slot costs are vanilla's, not the old flat 1/2/3.
  //
  // The wiki's own table is the check: with 0 bookshelves the three slots cost 1-2, 1-6 and 1-8 levels;
  // with 15 they cost 2-10, 6-21 and exactly 30. Every roll of the engine has to land inside those.
  for (const [books, bounds] of [[0, [[1, 2], [1, 6], [1, 8]]], [15, [[2, 10], [6, 21], [30, 30]]]]) {
    for (let trial = 0; trial < 300; trial++) {
      const r = seeded(trial * 7 + books + 1);
      for (const slot of [0, 1, 2]) {
        const cost = experienceCost(slot, books, r);
        const [lo, hi] = bounds[slot];
        assert.ok(cost >= lo && cost <= hi, `slot ${slot} @${books} books cost ${cost}, expected ${lo}-${hi}`);
      }
    }
  }
  // The lapis is the slot's own number, which is the one thing that was already right.
  assert.deepEqual([0, 1, 2].map(lapisCostForSlot), [1, 2, 3]);

  // Offer generation with 0 bookshelves: three slots, each affordable, each inside the reachable range.
  const offers0 = generateEnchantmentOffers(item('diamond_sword'), 0, seeded(11));
  assert.equal(offers0.length, 3);
  for (const offer of offers0) {
    assert.ok(offer.levelRequirement >= 1 && offer.levelRequirement <= 8, 'a 0-bookshelf slot is cheap');
    assert.equal(offer.levelCost, offer.levelRequirement, 'the cost is the requirement, as in vanilla');
    assert.ok(offer.lapisCost >= 1 && offer.lapisCost <= 3);
    assert.ok(offer.primary.name.length > 0);
    assert.ok(offer.runes.length > 0);
  }

  // With 15 bookshelves the bottom slot costs exactly 30, which is the figure the game is famous for.
  const offers15 = generateEnchantmentOffers(item('diamond_sword'), 15, seeded(3));
  assert.equal(offers15.length, 3);
  assert.equal(offers15[2].slot, 2);
  assert.equal(offers15[2].levelRequirement, 30, 'With 15 bookshelves, slot 3 costs Level 30');
  assert.ok(offers15[2].lapisCost === 3);
});

test('Applying Enchantments, Level Deduction, and Book Transformation', () => {
  let playedEnchant = false;
  let statsUpdated = false;
  const mockSounds = { playEnchant: () => { playedEnchant = true; } };
  const mockUi = { updateStats: () => { statsUpdated = true; } };

  const player = { level: 30, exp: 0 };
  const tool = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  const offer = {
    slot: 2,
    levelRequirement: 30,
    levelCost: 3,
    lapisCost: 3,
    primary: { id: 'efficiency', name: 'Efficiency IV', level: 4 },
    additional: [{ id: 'unbreaking', name: 'Unbreaking III', level: 3 }]
  };

  // Player with insufficient level cannot enchant
  player.level = 25;
  const failApply = applyEnchantment(tool, offer, player, mockUi, mockSounds);
  assert.equal(failApply, false);

  // Player with level 30 enchants tool
  player.level = 30;
  const successApply = applyEnchantment(tool, offer, player, mockUi, mockSounds);
  assert.equal(successApply, true);
  assert.equal(player.level, 27, 'Enchanting costs 3 levels from 30 -> 27');
  assert.equal(tool.enchantments.length, 2);
  assert.equal(tool.enchantments[0].id, 'efficiency');
  assert.equal(tool.enchantments[1].id, 'unbreaking');
  assert.equal(playedEnchant, true);
  assert.equal(statsUpdated, true);

  // Enchanting a plain book converts it into an Enchanted Book
  const book = { id: 'book', isBlock: false, count: 1 };
  const bookOffer = {
    slot: 0,
    levelRequirement: 5,
    levelCost: 1,
    lapisCost: 1,
    primary: { id: 'sharpness', name: 'Sharpness I', level: 1 }
  };
  player.level = 10;
  applyEnchantment(book, bookOffer, player, mockUi, mockSounds);
  assert.equal(book.id, 'enchanted_book', 'Book must convert to enchanted_book');
  assert.equal(book.name, 'Enchanted Book');
  assert.equal(player.level, 9);
});

test('XP Orbs Entity Magnetism, Physics, and Collection', () => {
  const scene = new THREE.Scene();
  const voxels = new Map();
  const world = {
    getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) || BLOCKS.AIR
  };
  let playedPickup = false;
  const sounds = {
    playXpPickup: () => { playedPickup = true; }
  };

  const entities = new EntityManager(scene, world, sounds);
  assert.ok(Array.isArray(entities.xpOrbs));

  // Spawn single XP orb
  const orb = entities.spawnXpOrb(new THREE.Vector3(0, 5, 0), 5);
  assert.equal(orb.value, 5);
  assert.equal(entities.xpOrbs.length, 1);

  // Spawn multi XP orbs
  entities.spawnXpOrbs(new THREE.Vector3(2, 5, 2), 7);
  assert.ok(entities.xpOrbs.length > 1);

  // Test player magnetic attraction & collection
  const player = {
    position: new THREE.Vector3(0, 0, 0),
    level: 0,
    exp: 0,
    isDead: false
  };

  // Place orb within attraction radius (3 blocks away)
  const testOrb = entities.spawnXpOrb(new THREE.Vector3(0, 2, 0), 10);
  testOrb.age = 1.0; // past pickup delay

  // Move orb right next to player to trigger collection
  testOrb.mesh.position.set(0, 0.5, 0);

  entities.update(0.05, player, null);
  assert.equal(playedPickup, true);
  assert.ok(player.exp > 0 || player.level > 0, 'Player collected XP from orb');
});

test('Enchanting Table GUI Integration - Open, Slot, Select Offer & Enchant', async () => {
  const { UIManager } = await import('../src/ui.js');
  const voxels = new Map();
  const world = {
    getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) || BLOCKS.AIR,
    setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id),
    getBiome: () => 'plains',
    chunks: new Map()
  };

  let playedClick = false;
  let playedEnchant = false;
  const sounds = {
    playClick: () => { playedClick = true; },
    playEnchant: () => { playedEnchant = true; },
    playLevelUp: () => {}
  };

  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const player = {
    position: new THREE.Vector3(0, 0, 0),
    level: 20,
    exp: 0,
    gamemode: 'survival',
    inventory: null
  };

  const inv = new Inventory(sounds);
  player.inventory = inv;

  function mockEl(id, tag = 'div') {
    const children = [];
    const classSet = new Set(['hidden']);
    return {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      children,
      get innerHTML() { return ''; },
      set innerHTML(val) { if (!val) children.length = 0; },
      classList: {
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        contains: (c) => classSet.has(c)
      },
      appendChild: (c) => children.push(c),
      // `UIManager.setupUI` rebuilds the world-generation pack dropdown with `replaceChildren`, which this
      // stub was missing, so constructing a UIManager threw before the table could be opened.
      replaceChildren: () => { children.length = 0; },
      addEventListener: () => {},
      removeAttribute: () => {},
      setAttribute: () => {},
      querySelector: (sel) => mockEl(`query-${sel}`),
      querySelectorAll: (sel) => []
    };
  }

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
    'inventory-modal': mockEl('inventory-modal'),
    'crafting-modal': mockEl('crafting-modal'),
    'furnace-modal': mockEl('furnace-modal'),
    'chest-modal': mockEl('chest-modal'),
    'villager-modal': mockEl('villager-modal'),
    'pause-menu': mockEl('pause-menu'),
    'start-overlay': mockEl('start-overlay'),
    'gemini-modal': mockEl('gemini-modal'),
    'creative-modal': mockEl('creative-modal'),
    'mc-tooltip': mockEl('mc-tooltip'),
    'mc-tooltip-title': mockEl('mc-tooltip-title'),
    'mc-tooltip-sub': mockEl('mc-tooltip-sub'),
    'chat-container': mockEl('chat-container'),
    'chat-messages': mockEl('chat-messages'),
    'chat-input-wrapper': mockEl('chat-input-wrapper'),
    'chat-input': mockEl('chat-input'),
    'designed-worlds-modal': mockEl('designed-worlds-modal'),
    'map-modal': mockEl('map-modal'),
    'world-biome-modal': mockEl('world-biome-modal'),
    'floating-cursor-item': mockEl('floating-cursor-item'),

    // Enchanting Elements
    'enchanting-modal': mockEl('enchanting-modal'),
    'close-enchanting': mockEl('close-enchanting'),
    'enchant-item-slot': mockEl('enchant-item-slot'),
    'enchant-lapis-slot': mockEl('enchant-lapis-slot'),
    'enchant-bookshelves-num': mockEl('enchant-bookshelves-num'),
    'enchant-offer-0': mockEl('enchant-offer-0'),
    'enchant-offer-1': mockEl('enchant-offer-1'),
    'enchant-offer-2': mockEl('enchant-offer-2'),
    'enchant-runes-0': mockEl('enchant-runes-0'),
    'enchant-runes-1': mockEl('enchant-runes-1'),
    'enchant-runes-2': mockEl('enchant-runes-2'),
    'enchant-hint-0': mockEl('enchant-hint-0'),
    'enchant-hint-1': mockEl('enchant-hint-1'),
    'enchant-hint-2': mockEl('enchant-hint-2'),
    'enchant-req-0': mockEl('enchant-req-0'),
    'enchant-req-1': mockEl('enchant-req-1'),
    'enchant-req-2': mockEl('enchant-req-2'),
    'enchant-storage-grid': mockEl('enchant-storage-grid'),
    'enchant-hotbar-grid': mockEl('enchant-hotbar-grid')
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

  const mobs = { mobs: [], arrows: [] };
  const mockGame = { world, sounds };
  const enchantingManager = new EnchantingManager(mockGame);
  mockGame.enchantingManager = enchantingManager;

  const ui = new UIManager(inv, player, world, mobs, sounds, mockGame);

  // 1. Open Enchanting Table
  ui.openEnchantingTable(5, 10, 5);
  assert.equal(elements['enchanting-modal'].classList.contains('hidden'), false, 'Modal should be visible');

  // 2. Put a diamond sword into the enchanting slot
  ui.enchantSlottedItem = { id: 'diamond_sword', isBlock: false, count: 1 };
  ui.enchantSlottedLapis = { id: 'lapis_lazuli', isBlock: false, count: 5 };
  ui.currentOffers = generateEnchantmentOffers(ui.enchantSlottedItem, 5, seeded(9));
  ui.renderEnchantingGUI();

  assert.equal(ui.currentOffers.length, 3);
  assert.ok(elements['enchant-offer-0'].onclick !== null, 'Offer 0 should be interactive');
  // The panel reports the slot's cost, and that cost is the level the player must have -- one number, as
  // the game shows it, not the old "Req: 5 Lvl, Cost: 1 Lvl" pair.
  const offer = ui.currentOffers[0];
  assert.match(elements['enchant-req-0'].textContent, new RegExp(`Cost: ${offer.levelCost} Lvl \\+ ${offer.lapisCost} Lapis`));

  // 3. Select Offer 0, which costs its own rolled number of levels and 1 lapis
  const prevLvl = player.level;
  const prevLapis = ui.enchantSlottedLapis.count;
  ui.selectEnchantOffer(0);

  assert.equal(player.level, prevLvl - offer.levelCost, `Player level should drop by the slot cost (${offer.levelCost})`);
  assert.equal(ui.enchantSlottedLapis.count, prevLapis - offer.lapisCost, 'Lapis count should decrease by the slot cost');
  assert.ok(Array.isArray(ui.enchantSlottedItem.enchantments), 'Item must have enchantments array');
  assert.ok(ui.enchantSlottedItem.enchantments.length >= 1, 'Item has at least 1 enchantment');
  assert.equal(playedEnchant, true, 'playEnchant was triggered');

  // The enchantment is one of the two the slot named, and nothing else.
  const granted = ui.enchantSlottedItem.enchantments.map((e) => e.id);
  assert.deepEqual(granted, [offer.primary, ...offer.additional].map((e) => e.id));

  // A player who cannot afford the slot cannot buy it, and is not charged for trying.
  ui.enchantSlottedItem = { id: 'diamond_sword', isBlock: false, count: 1 };
  ui.enchantSlottedLapis = { id: 'lapis_lazuli', isBlock: false, count: 5 };
  ui.currentOffers = generateEnchantmentOffers(ui.enchantSlottedItem, 15, seeded(4));
  ui.renderEnchantingGUI();
  const dear = ui.currentOffers[2];
  player.level = dear.levelCost - 1;
  const poorLevel = player.level;
  const poorLapis = ui.enchantSlottedLapis.count;
  ui.selectEnchantOffer(2);
  assert.equal(player.level, poorLevel, 'not enough levels: nothing was spent');
  assert.equal(ui.enchantSlottedLapis.count, poorLapis, 'and no lapis either');
  assert.equal(ui.enchantSlottedItem.enchantments, undefined, 'and the item is untouched');

  // 4. Close modal and check return of items
  ui.closeEnchantingModal();
  assert.equal(elements['enchanting-modal'].classList.contains('hidden'), true);
  assert.equal(ui.enchantSlottedItem, null);
  assert.equal(ui.enchantSlottedLapis, null);

  // Restore global mocks
  globalThis.document = origDoc;
  globalThis.window = origWindow;
});

