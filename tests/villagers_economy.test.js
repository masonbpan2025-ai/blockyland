import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { MobManager } from '../src/mobs.js';
import {
  PROFESSIONS,
  WORKSTATION_TO_PROFESSION,
  VILLAGER_LEVELS,
  PROFESSION_TRADES,
  initVillagerEconomy,
  unlockTradesForLevel,
  calculateTradeCost,
  executeTrade,
  restockVillager,
  updateVillagerWorkstation,
  startZombieVillagerCure,
  updateZombieVillagerCuring
} from '../src/villagerEconomy.js';

test('Workstation Assignment: All 13 professions and workstation blocks mapped accurately', () => {
  const expectedMappings = {
    armorer: BLOCKS.BLAST_FURNACE,
    butcher: BLOCKS.SMOKER,
    cartographer: BLOCKS.CARTOGRAPHY_TABLE,
    cleric: BLOCKS.BREWING_STAND,
    farmer: BLOCKS.COMPOSTER,
    fisherman: BLOCKS.BARREL,
    fletcher: BLOCKS.FLETCHING_TABLE,
    leatherworker: BLOCKS.CAULDRON,
    librarian: BLOCKS.LECTERN,
    mason: BLOCKS.STONECUTTER,
    shepherd: BLOCKS.LOOM,
    toolsmith: BLOCKS.SMITHING_TABLE,
    weaponsmith: BLOCKS.GRINDSTONE
  };

  assert.equal(Object.keys(expectedMappings).length, 13, 'There are exactly 13 standard professions');

  for (const [profId, blockId] of Object.entries(expectedMappings)) {
    assert.ok(PROFESSIONS[profId], `PROFESSIONS contains ${profId}`);
    assert.equal(PROFESSIONS[profId].workstation, blockId, `${profId} workstation is block ${blockId}`);
    assert.equal(WORKSTATION_TO_PROFESSION[blockId], profId, `Block ${blockId} links to ${profId}`);
  }
});

test('Workstation Claiming & Profession Locking: Unemployed claims nearby workstation, loses job if unbroken & 0 XP, locks permanently if traded', () => {
  const world = new World(123);
  world.reseed(123);
  const scene = new THREE.Scene();
  const mobs = new MobManager(scene, world, null, null);

  // 1. Spawn an unemployed villager at (0, 10, 0)
  const villager = mobs.spawnVillager(0, 10, 0, 'unemployed');
  assert.equal(villager.profession, 'unemployed');
  assert.equal(villager.workstation, null);
  assert.equal(villager.trades.length, 0);

  // 2. Place a Lectern at (3, 10, 3) -> Librarian workstation
  world.setVoxel(3, 10, 3, BLOCKS.LECTERN);

  // Check workstation assignment
  updateVillagerWorkstation(villager, world, mobs.mobs);
  assert.equal(villager.profession, 'librarian', 'Villager adopted Librarian profession');
  assert.ok(villager.workstation, 'Villager has workstation claimed');
  assert.equal(villager.workstation.blockId, BLOCKS.LECTERN);
  assert.ok(villager.trades.length > 0, 'Villager unlocked Novice Librarian trades');

  // 3. Workstation is broken while XP is still 0
  assert.equal(villager.xp, 0);
  world.setVoxel(3, 10, 3, BLOCKS.AIR);
  updateVillagerWorkstation(villager, world, mobs.mobs);
  assert.equal(villager.profession, 'unemployed', 'Villager lost job because 0 trades were performed');
  assert.equal(villager.workstation, null);
  assert.equal(villager.trades.length, 0);

  // 4. Place a Composter (Farmer) -> Villager becomes Farmer
  world.setVoxel(2, 10, 2, BLOCKS.COMPOSTER);
  updateVillagerWorkstation(villager, world, mobs.mobs);
  assert.equal(villager.profession, 'farmer');
  assert.ok(villager.trades.length > 0);

  // 5. Villager trades once: profession locks permanently!
  villager.xp = 4; // simulated trade XP
  world.setVoxel(2, 10, 2, BLOCKS.AIR); // Composter broken
  updateVillagerWorkstation(villager, world, mobs.mobs);
  assert.equal(villager.profession, 'farmer', 'Profession remains locked as Farmer after XP > 0');
  assert.equal(villager.workstation, null, 'Workstation pointer is cleared until a new composter is found');

  // 6. Nitwit cannot claim any workstation
  const nitwit = mobs.spawnVillager(5, 10, 5, 'nitwit');
  world.setVoxel(6, 10, 5, BLOCKS.BLAST_FURNACE);
  updateVillagerWorkstation(nitwit, world, mobs.mobs);
  assert.equal(nitwit.profession, 'nitwit', 'Nitwit never takes a workstation');
  assert.equal(nitwit.workstation, null);
});

test('Trading Economy: Leveling progression (Novice to Master) with XP thresholds and tier unlocking', () => {
  const villager = {
    type: 'villager',
    cured: false
  };
  // The draw is pinned, because a level now offers two of its pool at random rather than the whole pool.
  initVillagerEconomy(villager, 'weaponsmith', { random: () => 0 });

  assert.equal(villager.level, 1, 'Starts at Level 1 (Novice)');
  assert.equal(villager.xp, 0);
  assert.ok(villager.trades.length > 0, 'Has initial novice trades');
  assert.equal(villager.trades.length, 2, 'a level offers two of its pool, as the wiki says');

  // Mock player inventory with coal
  const inventory = {
    hotbar: [{ id: 'coal', count: 200, isBlock: false }],
    storage: [],
    addItem: (id, isBlock, count) => {
      inventory.hotbar.push({ id, count, isBlock });
    }
  };

  const trade = villager.trades.find(t => t.cost.id === 'coal');
  assert.ok(trade, 'Found coal trade');

  // Trade multiple times to gain XP and level up
  for (let i = 0; i < 5; i++) {
    trade.uses = 0; // keep restocked for XP test
    executeTrade(trade, villager, inventory);
  }

  assert.ok(villager.xp >= 10, `Villager gained XP (${villager.xp})`);
  assert.ok(villager.level >= 2, `Villager leveled up to Apprentice or higher (level: ${villager.level})`);
  assert.ok(villager.trades.some(t => t.level === 2), 'Apprentice tier trades unlocked');

  // Force level 5 (Master tier)
  villager.xp = 250;
  for (let lvl = 2; lvl <= 5; lvl++) {
    unlockTradesForLevel(villager, lvl, () => 0);
  }
  villager.level = 5;
  assert.ok(villager.trades.some(t => t.level === 5), 'Master tier trades unlocked');
  const diamondTrade = villager.trades.find(t => t.level === 5 && t.reward.id === 'diamond_sword');
  assert.ok(diamondTrade, 'Master Weaponsmith offers Diamond Sword');
  // Wiki: "villagers have a maximum of 10 trades".
  assert.ok(villager.trades.length <= 10, `a villager holds at most ten offers, got ${villager.trades.length}`);
});

test('Trading Mechanics: Supply & demand price surge, restocking, and out-of-stock locking', () => {
  const villager = {};
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const trade = villager.trades.find(t => t.cost.id === 'wheat'); // 20 wheat -> 1 emerald
  assert.ok(trade, 'the pinned draw includes the wheat offer');

  const inventory = {
    hotbar: [{ id: 'wheat', count: 200, isBlock: false }],
    storage: [],
    addItem: (id, isBlock, count) => {
      inventory.hotbar.push({ id, count, isBlock });
    }
  };

  // 1. Initial cost
  const initialCost = calculateTradeCost(trade, villager);
  assert.equal(initialCost.effectiveCount, 20);

  // 2. High demand increases price, by the article's formula: floor(20 * (0.05 * 6 + 1)) = 26
  trade.demand = 6;
  const demandCost = calculateTradeCost(trade, villager);
  assert.equal(demandCost.effectiveCount, 26, 'the markup is p * (m * demand + 1)');
  assert.ok(demandCost.effectiveCount > 20, 'Price marked up due to high demand');
  assert.equal(demandCost.markup, true);

  // 3. Exhaust all uses -> trade locks out of stock
  trade.uses = trade.maxUses;
  trade.disabled = true;
  const failResult = executeTrade(trade, villager, inventory);
  assert.equal(failResult.success, false);
  assert.equal(failResult.reason, 'out_of_stock');

  // 4. Restock restores uses, disables nothing and moves demand by the wiki's restock rule:
  //    demand += uses - (maxUses - uses). A fully sold-out offer therefore pushes demand UP, which is what
  //    makes an over-used trade dearer rather than cheaper.
  restockVillager(villager);
  assert.equal(trade.uses, 0);
  assert.equal(trade.disabled, false);
  assert.equal(trade.demand, 6 + 16, 'a sold-out offer adds its whole stock back to demand');

  const postRestockResult = executeTrade(trade, villager, inventory);
  assert.equal(postRestockResult.success, true, 'Trade successful after restock');
});

test('Zombie Villager Curing: Weakness splash potion + Golden apple ritual, transformation, and massive cured discounts', () => {
  const scene = new THREE.Scene();
  const world = new World(999);
  world.reseed(999);
  const mobs = new MobManager(scene, world, null, null);

  // 1. Spawn Zombie Villager
  const zv = mobs.spawnZombieVillager(10, 20, 10);
  assert.ok(zv, 'Zombie villager spawned');
  assert.equal(zv.type, 'zombie_villager');
  assert.equal(zv.health, 20);
  assert.equal(zv.hasWeakness, false);
  assert.equal(zv.isCuring, false);

  // Dimensions
  const dims = mobs.getMobDimensions('zombie_villager');
  assert.equal(dims.width, 0.6);
  assert.equal(dims.height, 1.95);

  // 2. Curing fails without weakness
  const goldenApple = { id: 'golden_apple', count: 1 };
  let started = startZombieVillagerCure(zv, goldenApple);
  assert.equal(started, false, 'Cure cannot start without weakness effect');

  // 3. Apply Weakness
  zv.hasWeakness = true;
  started = startZombieVillagerCure(zv, goldenApple);
  assert.equal(started, true, 'Cure successfully initiated with Weakness + Golden Apple');
  assert.equal(zv.isCuring, true);
  assert.ok(zv.cureTimer > 0, 'Cure timer running');

  // 4. Update curing progression & transformation
  zv.savedProfession = 'armorer';
  const curedVillager = updateZombieVillagerCuring(zv, 0.1, mobs, { instantCure: true, random: () => 0 });
  assert.ok(curedVillager, 'Transformation completed');
  assert.equal(curedVillager.type, 'villager');
  assert.equal(curedVillager.cured, true, 'Villager has cured flag');
  assert.equal(curedVillager.profession, 'armorer', 'Cured villager kept saved profession');

  // 5. Cured Discount: the cure is the game's largest reputation gain, and it reaches the price. The armorer
  // novice pool holds five rows and a level offers two, so the draw is pinned to the iron helmet -- a
  // five-emerald trade, which the cure's reputation of 125 with a multiplier of 0.2 drives to the floor.
  const highTierTrade = curedVillager.trades.find(t => t.cost.id === 'emerald' && t.cost.count > 1);
  assert.ok(highTierTrade, 'Found an emerald-cost trade on the cured Armorer');

  const regularVillager = { profession: 'armorer', cured: false };
  const regCost = calculateTradeCost(highTierTrade, regularVillager);
  const curedCost = calculateTradeCost(highTierTrade, curedVillager);

  assert.equal(curedCost.reputation, 125, 'a first cure is worth a major and a minor positive gossip');
  assert.ok(curedCost.effectiveCount < regCost.effectiveCount, 'Cured villager offers significant discount');
  assert.equal(curedCost.discounted, true);
  assert.ok(curedCost.effectiveCount >= 1, 'Cost never drops below 1 (price floor)');
});
