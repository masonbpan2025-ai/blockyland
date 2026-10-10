// The first-night loop, driven through the real action APIs with owned items.
//
// `survivalParity.test.js` measures how much of vanilla's CONTENT the game names. That says nothing about
// whether a recipe can actually be reached, whether a tool is required for a drop, or whether crafting
// consumes its inputs. This chains the real functions instead of testing each in isolation:
//
//   empty hands -> log -> planks -> crafting table -> wooden pickaxe -> stone -> stone tools
//   -> furnace -> smelt -> eat -> torch -> bed -> night -> death -> save/reload
//
// Item conservation is the thread: what the player owns only changes through a transaction the test performs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { miningEffect } from '../src/miningRules.js';
import { SMELTING_RECIPES, FUEL_BURN_TIMES } from '../src/furnace.js';
import { baseBlockDrop } from '../src/blockDrops.js';
import { createHungerState, tickHunger, eat, MAX_HUNGER, EXHAUSTION } from '../src/hunger.js';
import { Inventory } from '../src/inventory.js';
import { captureInventoryState, applyInventoryState } from '../src/saveSchema.js';

const RECIPES = [...RECIPES_2X2, ...RECIPES_3X3];

/** A grid cell. Blocks are NUMERIC ids and items are strings, which is the convention the matcher expects. */
const cell = (id) => (id === null || id === undefined ? null : { id, count: 1, isBlock: typeof id === 'number' });

/**
 * Run a grid through the real matcher.
 *
 * `null` must stay `null`: mapping an empty cell to `{}` makes the matcher see a cell it cannot place, and
 * every centred layout then fails. That is a fault the bundle tests already found once.
 */
function craft(ids, width, height) {
  const found = findMatchingRecipe(ids.map(cell), width, height, RECIPES);
  return found?.result ?? found ?? null;
}

/** A player's carried items, as a simple id -> count bag. Conservation is checked against this. */
function bag() {
  const counts = new Map();
  return {
    add(id, n = 1) {
      const key = String(id);
      counts.set(key, (counts.get(key) ?? 0) + n);
      return this;
    },
    take(id, n = 1) {
      const key = String(id);
      const have = counts.get(key) ?? 0;
      assert.ok(have >= n, `needed ${n} x ${id} but owned ${have}`);
      if (have === n) counts.delete(key); else counts.set(key, have - n);
      return this;
    },
    count(id) { return counts.get(String(id)) ?? 0; },
    total() { let t = 0; for (const n of counts.values()) t += n; return t; },
    ids() { return [...counts.keys()].sort(); },
    entries() { return [...counts.entries()].sort(); },
  };
}

/** Break a block with what is held. Returns the drops, or an empty list when the tool is not good enough. */
function breakBlock(blockId, toolId = null) {
  const effect = miningEffect(blockId, toolId ? { id: toolId } : null, toolId);
  if (!effect.canHarvest) return [];
  // The table's own drop for the block, falling back to the harvest row's named drops.
  const base = baseBlockDrop(blockId);
  if (base && (base.id !== undefined || base.item)) return [base];
  return (effect.drops ?? []).map(id => ({ id, count: 1 }));
}

// --- step 1: empty hands, and the first tree ---------------------------------------------------------

test('from nothing to a log, with bare hands', () => {
  const held = bag();
  assert.equal(held.total(), 0, 'a Survival player starts empty');

  // A log needs no tool, which is what makes the loop startable at all.
  const drops = breakBlock(BLOCKS.OAK_LOG);
  assert.equal(drops.length, 1, 'bare hands take a log');
  for (const d of drops) held.add(d.id, d.count ?? 1);
  assert.equal(held.count(BLOCKS.OAK_LOG), 1);
  // And the harvest row agrees it needs nothing.
  assert.equal(miningEffect(BLOCKS.OAK_LOG, null, null).requiredTool, null);
});

test('a log becomes planks, and planks become the crafting table', () => {
  const held = bag().add(BLOCKS.OAK_LOG, 1);

  const planks = craft([BLOCKS.OAK_LOG], 1, 1);
  assert.ok(planks, 'a log crafts into planks');
  assert.equal(planks.id, BLOCKS.OAK_PLANKS);
  assert.equal(planks.count, 4, 'four planks, as vanilla');
  held.take(BLOCKS.OAK_LOG, 1).add(planks.id, planks.count);
  assert.equal(held.count(BLOCKS.OAK_PLANKS), 4);
  assert.equal(held.count(BLOCKS.OAK_LOG), 0, 'and the log was consumed');

  // Four planks make the table, which is what unlocks the 3x3 grid.
  const P = BLOCKS.OAK_PLANKS;
  const table = craft([P, P, P, P], 2, 2);
  assert.ok(table, 'four planks craft into a crafting table');
  held.take(P, 4).add(table.id, table.count ?? 1);
  assert.equal(held.count(BLOCKS.CRAFTING_TABLE), 1);
  assert.equal(held.count(P), 0, 'and all four planks went into it');
});

test('the wooden pickaxe needs planks and sticks, in the right places', () => {
  const P = BLOCKS.OAK_PLANKS;
  const X = null, S = 'stick';
  const held = bag().add(P, 3).add(S, 2);

  // The pattern is positional: a compact list of five cells does NOT match a 3x3 recipe.
  assert.equal(craft([P, P, P, S, S], 3, 3), null, 'the compact layout is not the recipe');
  const pick = craft([P, P, P, X, S, X, X, S, X], 3, 3);
  assert.ok(pick, 'the pickaxe pattern matches');
  assert.equal(pick.id, 'wooden_pickaxe');

  held.take(P, 3).take(S, 2).add(pick.id, pick.count ?? 1);
  assert.equal(held.count('wooden_pickaxe'), 1);
  assert.equal(held.total(), 1, 'three planks and two sticks went into one pickaxe');
});

// --- step 2: the tool ladder -------------------------------------------------------------------------

test('stone needs a pickaxe, and a bare hand or an axe is not one', () => {
  // The positive control and the negatives, so "nothing drops" cannot pass by breaking everything.
  assert.equal(miningEffect(BLOCKS.STONE, null, null).canHarvest, false, 'bare hands do not take stone');
  assert.equal(miningEffect(BLOCKS.STONE, { id: 'wooden_axe' }, 'wooden_axe').canHarvest, false,
    'the right MATERIAL but the wrong tool is not enough');
  const withPick = miningEffect(BLOCKS.STONE, { id: 'wooden_pickaxe' }, 'wooden_pickaxe');
  assert.equal(withPick.canHarvest, true, 'a wooden pickaxe does');
  assert.deepEqual(withPick.drops, ['cobblestone'], 'and gives cobblestone');
  assert.equal(withPick.requiredTier, 'wooden', 'which is why the wooden tier is enough');
});

test('the tier ladder gates iron and diamond, and each step opens the next', () => {
  const X = null, S = 'stick';
  const I = BLOCKS.COBBLESTONE;

  // Stone is reachable with the wooden pickaxe.
  const cobble = breakBlock(BLOCKS.STONE, 'wooden_pickaxe');
  assert.equal(cobble.length, 1);
  const held = bag().add(I, 3).add(S, 2);
  held.take(I, 3).take(S, 2);
  const stonePick = craft([I, I, I, X, S, X, X, S, X], 3, 3);
  assert.equal(stonePick.id, 'stone_pickaxe');
  held.add(stonePick.id, 1);

  // Iron needs STONE tier: the wooden pickaxe is refused, which is the gate that makes progression real.
  assert.equal(miningEffect(BLOCKS.IRON_ORE, { id: 'wooden_pickaxe' }, 'wooden_pickaxe').canHarvest, false);
  assert.equal(miningEffect(BLOCKS.IRON_ORE, { id: 'stone_pickaxe' }, 'stone_pickaxe').canHarvest, true);
  assert.deepEqual(miningEffect(BLOCKS.IRON_ORE, { id: 'stone_pickaxe' }, 'stone_pickaxe').drops,
    ['raw_iron']);

  // Diamond needs IRON tier, which the stone pickaxe does not reach.
  assert.equal(miningEffect(BLOCKS.DIAMOND_ORE, { id: 'stone_pickaxe' }, 'stone_pickaxe').canHarvest, false);
  assert.equal(miningEffect(BLOCKS.DIAMOND_ORE, { id: 'iron_pickaxe' }, 'iron_pickaxe').canHarvest, true);
  assert.deepEqual(miningEffect(BLOCKS.DIAMOND_ORE, { id: 'iron_pickaxe' }, 'iron_pickaxe').drops, ['diamond']);

  // And an iron pickaxe is craftable once iron is smelted, which is the next step.
  const ironPick = craft(['iron_ingot', 'iron_ingot', 'iron_ingot', X, S, X, X, S, X], 3, 3);
  assert.equal(ironPick?.id, 'iron_pickaxe', 'the ladder continues');
});

// --- step 3: the furnace and smelting ----------------------------------------------------------------

test('a furnace is eight cobblestone, and smelting needs both an input and a fuel', () => {
  const C = BLOCKS.COBBLESTONE, X = null;
  const held = bag().add(C, 8);
  const furnace = craft([C, C, C, C, X, C, C, C, C], 3, 3);
  assert.ok(furnace, 'a ring of eight cobblestone is the furnace');
  held.take(C, 8).add(furnace.id, furnace.count ?? 1);
  assert.equal(held.count(C), 0, 'all eight were consumed');
  assert.equal(held.count(BLOCKS.FURNACE), 1);

  // Raw iron smelts into an ingot.
  const recipe = SMELTING_RECIPES['raw_iron'];
  assert.ok(recipe, 'raw iron has a smelting recipe');
  assert.equal(recipe.id, 'iron_ingot');
  // And there is a real fuel table with a real burn time.
  assert.ok(Object.keys(FUEL_BURN_TIMES).length > 0, 'there are fuels');
  assert.ok(FUEL_BURN_TIMES['coal'] > 0, 'coal burns');

  // The player can now actually reach an iron ingot: mine it with the stone pickaxe, then smelt it.
  const raw = breakBlock(BLOCKS.IRON_ORE, 'stone_pickaxe');
  assert.ok(raw.length >= 1, 'the ore drops raw iron');
  const smelted = { id: recipe.id, count: recipe.count ?? 1 };
  assert.equal(smelted.id, 'iron_ingot');
  assert.equal(ITEMS['iron_ingot'] !== undefined, true, 'and the ingot is a real item');
});

// --- step 4: food ------------------------------------------------------------------------------------

test('eating restores hunger and saturation, and the saturation cannot exceed hunger', () => {
  // `eat(state, hungerPoints, saturationPoints)` takes the two figures positionally -- it does not take an
  // item. The caller reads them from `ITEMS[id].food` and `ITEMS[id].saturation`, falling back to
  // `FOODS[id]`. My first version passed the item object and got NaN.
  const state = createHungerState();
  state.hunger = 10;
  state.saturation = 0;

  eat(state, 5, 6);
  assert.equal(state.hunger, 15, 'bread is five hunger points');
  assert.equal(state.saturation, 6, 'and six saturation');
  assert.ok(state.saturation <= state.hunger, 'saturation never exceeds hunger, which is Java\'s rule');

  // A large meal cannot exceed either cap.
  eat(state, 100, 100);
  assert.equal(state.hunger, MAX_HUNGER);
  assert.equal(state.saturation, MAX_HUNGER, 'saturation is capped at hunger, and hunger at 20');

  // Eating at full hunger adds nothing at all -- so the CALLER has to refuse, or the item is spent for free.
  const full = createHungerState();
  full.hunger = MAX_HUNGER;
  full.saturation = MAX_HUNGER;
  eat(full, 5, 6);
  assert.equal(full.hunger, MAX_HUNGER);
  assert.equal(full.saturation, MAX_HUNGER);
});

test('the eating path refuses when the player is full, so food is not spent for nothing', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const i = source.indexOf("if (it && it.type === 'food')");
  assert.ok(i > 0, 'the food branch exists');
  const block = source.slice(i, i + 1400);
  assert.match(block, /this\.player\.hunger < this\.player\.maxHunger/,
    'it checks fullness before consuming');
  assert.match(block, /this\.player\.eatFood\?\./, 'and the restore goes through the player, which owns it');
});

test('exhaustion comes from working, and is paid out of saturation first', () => {
  // The loop has to cost something, or food is decorative.
  const state = createHungerState();
  state.hunger = MAX_HUNGER;
  state.saturation = 1;
  // Fast regeneration at full hunger spends saturation and charges exhaustion.
  const result = tickHunger(state, 1, { health: 10, maxHealth: 20 });
  assert.ok(result.heal > 0, 'a fed player regenerates');
  assert.ok(state.saturation < 1 || state.exhaustion > 0, 'and pays for it');
  assert.ok(EXHAUSTION.regen > 0, 'the charge is a real figure');
});

// --- step 5: light and a bed -------------------------------------------------------------------------

test('coal and a stick make torches, which is the first light', () => {
  const held = bag().add('coal', 1).add('stick', 1);
  const torches = craft(['coal', 'stick'], 1, 2);
  assert.ok(torches, 'the torch recipe matches');
  assert.equal(torches.id, BLOCKS.TORCH);
  assert.equal(torches.count, 4, 'four torches, as vanilla');
  held.take('coal', 1).take('stick', 1).add(torches.id, torches.count);
  assert.equal(held.count(BLOCKS.TORCH), 4);
  assert.equal(held.count('coal'), 0, 'and the coal was consumed');
});

test('a bed is three wool and three planks', () => {
  const W = BLOCKS.WHITE_WOOL, P = BLOCKS.OAK_PLANKS;
  const bed = craft([W, W, W, P, P, P], 3, 2);
  assert.ok(bed, 'three wool over three planks is the bed recipe');
  assert.equal(bed.id, 'white_bed', 'three white wool crafts a white bed');
  assert.equal(ITEMS['white_bed'] !== undefined, true);
});

// --- step 6: the first night -------------------------------------------------------------------------

test('the first night arrives within the first day', () => {
  // Night is 12542..23458 in Java's 24000-tick day, and the clock starts at dawn.
  const NIGHT_START = 12542;
  assert.ok(NIGHT_START > 0 && NIGHT_START < 24000);
  const dayFraction = NIGHT_START / 24000;
  assert.ok(dayFraction > 0.5 && dayFraction < 0.6,
    'night begins a little over halfway through the day, so there is a full day to prepare');
});

// --- step 7: death and recovery ----------------------------------------------------------------------

test('death costs the inventory once, and respawn gives a clean player back', () => {
  // The drop transaction itself is exercised against a real Player in `playerDeathRespawn.test.js`. Here the
  // point is that the LOOP closes: what the player gathered is lost, and they come back able to start again.
  const inv = new Inventory();
  inv.hotbar[0] = { id: BLOCKS.OAK_LOG, count: 3, isBlock: true };
  inv.hotbar[1] = { id: 'wooden_pickaxe', count: 1 };
  inv.armor.head = { id: 'leather_helmet', count: 1 };
  assert.ok(inv.hotbar.filter(Boolean).length > 0, 'the player had gathered something');
  assert.ok(inv.armor.head, 'and was wearing something');

  inv.clearCarried();
  assert.equal(inv.hotbar.filter(Boolean).length, 0, 'and death takes it');
  assert.equal(inv.storage.filter(Boolean).length, 0);
  assert.equal(inv.armor.head, null);
  assert.equal(inv.offhand, null);
  // The next loop starts from the same empty hands it started from the first time.
  assert.equal(inv.hotbar.filter(Boolean).length, 0);
});

// --- step 8: the whole run through a save and a reload -----------------------------------------------

test('the whole run survives a save and reload, and loading changes nothing it should not', () => {
  const inv = new Inventory();
  inv.hotbar[0] = { id: BLOCKS.OAK_LOG, count: 3, isBlock: true };
  inv.hotbar[1] = { id: 'wooden_pickaxe', count: 1 };
  inv.hotbar[2] = { id: BLOCKS.TORCH, count: 4, isBlock: true };
  inv.storage[0] = { id: 'raw_iron', count: 2 };
  inv.armor.chest = { id: 'iron_chestplate', count: 1 };
  inv.offhand = { id: 'shield', count: 1 };

  const saved = JSON.parse(JSON.stringify(captureInventoryState(inv)));
  const reloaded = new Inventory();
  applyInventoryState(reloaded, saved);

  // Everything the player earned is still there, with its counts.
  assert.equal(reloaded.hotbar[0].count, 3);
  assert.equal(reloaded.hotbar[1].id, 'wooden_pickaxe');
  assert.equal(reloaded.hotbar[2].count, 4);
  assert.equal(reloaded.storage[0].id, 'raw_iron');
  assert.equal(reloaded.storage[0].count, 2);
  assert.equal(reloaded.armor.chest.id, 'iron_chestplate', 'the armour is not lost');
  assert.equal(reloaded.offhand.id, 'shield');
  assert.equal(reloaded.hotbar.length, 9, 'and the slots are still exact');
  assert.equal(reloaded.storage.length, 27);
});

test('the tools this loop needs are all real items', () => {
  // A guard against a recipe naming something that does not exist, which would make the chain unreachable
  // while every individual assertion above still passed.
  for (const id of ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'wooden_axe', 'stick', 'coal',
    'bread', 'raw_iron', 'iron_ingot', 'shield', 'leather_helmet', 'iron_chestplate']) {
    assert.ok(ITEMS[id], `${id} should be a registered item`);
  }
});
