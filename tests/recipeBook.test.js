// The recipe book (src/recipeBook.js, src/recipeBookUi.js), as Bedrock and Education Edition have it in Survival
// (https://minecraft.wiki/w/Recipe_book): tabs, search, All / Craftable, click to fill the grid, shift for as many
// as possible, a ghost for a recipe that cannot be made, and recipes unlocked by getting an ingredient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';
import {
  RECIPE_BOOK_TABS, STARTING_RECIPES, bookEntries, recipeCells, tabFor, knownRecipes, learnFromInventory,
  visibleEntries, placeRecipe, availableCounts
} from '../src/recipeBook.js';
import { recipeIdOf } from '../src/advancedCommands.js';
import { capturePlayerState, applyPlayerState } from '../src/saveSchema.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const inventory = () => new Inventory({ playClick() {} });
const id = (name) => `minecraft:${name}`;

test('the tabs are Bedrock\'s: All (with search), Construction, Equipment, Items, Nature', () => {
  assert.deepEqual(RECIPE_BOOK_TABS.map((t) => t.id), ['all', 'construction', 'equipment', 'items', 'nature']);
  assert.equal(tabFor({ id: 'wooden_pickaxe' }), 'equipment');
  assert.equal(tabFor({ id: 'iron_chestplate' }), 'equipment');
  assert.equal(tabFor({ id: 'bread' }), 'nature');
  assert.equal(tabFor({ id: BLOCKS.STONE_BRICKS, isBlock: true }), 'construction');
  assert.equal(tabFor({ id: BLOCKS.CRAFTING_TABLE, isBlock: true }), 'items');
  for (const entry of bookEntries(3)) assert.ok(RECIPE_BOOK_TABS.some((t) => t.id === entry.tab), `${entry.id} has a tab`);
});

test('one entry per result, its alternative patterns together; the inventory\'s book has the 2x2 recipes', () => {
  const three = bookEntries(3), two = bookEntries(2);
  assert.ok(three.length > 900, `${three.length} recipes in the crafting table's book`);
  assert.equal(new Set(three.map((e) => e.id)).size, three.length);
  assert.ok(three.find((e) => e.id === id('oak_planks')).recipes.length >= 1);
  assert.ok(two.some((e) => e.id === id('oak_planks')) && !two.some((e) => e.id === id('wooden_pickaxe')), 'a pickaxe needs the table');
});

test('a new player knows only the crafting table; getting an ingredient unlocks what it goes into', () => {
  const player = {};
  assert.deepEqual([...knownRecipes(player)], STARTING_RECIPES);
  assert.equal(STARTING_RECIPES[0], id('crafting_table'));
  const inv = inventory();
  inv.addItem(BLOCKS.OAK_LOG, true, 1);
  const fresh = learnFromInventory(player, inv);
  assert.ok(fresh.includes(id('oak_planks')), 'logs unlock planks');
  assert.ok(!player.knownRecipes.has(id('wooden_pickaxe')), 'but not a pickaxe');
  assert.deepEqual(learnFromInventory(player, inv), [], 'the same stack unlocks nothing twice');
  inv.addItem('stick', false, 1);
  assert.ok(learnFromInventory(player, inv).includes(id('wooden_pickaxe')), 'a stick unlocks the wooden tools');
});

test('the book lists unlocked recipes, searched, by tab, craftable first; Craftable hides the rest', () => {
  const player = {}, inv = inventory();
  inv.addItem(BLOCKS.OAK_LOG, true, 3);
  learnFromInventory(player, inv);
  const all = visibleEntries({ player, inventory: inv, size: 2 });
  assert.deepEqual(all.map((e) => e.id).sort(), [...player.knownRecipes].filter((r) => bookEntries(2).some((e) => e.id === r)).sort());
  assert.equal(all[0].craftable, true, 'craftable first');
  const table = all.find((e) => e.id === id('crafting_table'));
  assert.equal(table.craftable, false, 'no planks yet');
  assert.ok(!visibleEntries({ player, inventory: inv, size: 2, craftableOnly: true }).some((e) => e.id === id('crafting_table')));
  assert.deepEqual(visibleEntries({ player, inventory: inv, size: 2, search: 'oak pl' }).map((e) => e.id), [id('oak_planks')]);
  assert.ok(visibleEntries({ player, inventory: inv, size: 2, tab: 'equipment' }).every((e) => e.tab === 'equipment'));
  assert.ok(visibleEntries({ player, inventory: inv, size: 3, showAll: true }).length > 900, 'showAll lists everything');
});

test('clicking a recipe fills the grid and the grid makes it; shift fills as many as the inventory allows', () => {
  const player = {}, inv = inventory();
  inv.addItem(BLOCKS.OAK_LOG, true, 5);
  learnFromInventory(player, inv);
  const planks = visibleEntries({ player, inventory: inv, size: 2 }).find((e) => e.id === id('oak_planks'));
  assert.deepEqual(placeRecipe(inv, planks, { size: 2 }), { placed: 1, ghost: false });
  assert.equal(inv.craft2x2.filter(Boolean)[0].count, 1);
  assert.equal(recipeIdOf(inv.craft2x2Result), id('oak_planks'));
  assert.equal(availableCounts(inv).get(availableCounts(inv).keys().next().value), 4, 'four logs left in the inventory');
  placeRecipe(inv, planks, { size: 2, all: true });
  assert.equal(inv.craft2x2.filter(Boolean)[0].count, 5, 'shift: the one in the grid came back, then all five went in');
  assert.ok(!inv.hotbar.some(Boolean) && !inv.storage.some(Boolean));
});

test('a recipe the inventory cannot make is laid out as a ghost, and nothing is taken', () => {
  const inv = inventory();
  inv.addItem('stick', false, 1);
  const pick = bookEntries(3).find((e) => e.id === id('wooden_pickaxe'));
  assert.deepEqual(placeRecipe(inv, pick, { size: 3 }), { placed: 0, ghost: true });
  assert.equal(inv.recipeGhost.gridName, 'craft3x3');
  assert.deepEqual(inv.recipeGhost.cells.map((c) => c.index), [0, 1, 2, 4, 7], 'three planks across the top, two sticks down the middle');
  assert.equal(inv.hotbar.filter(Boolean)[0].count, 1, 'the stick stays in the inventory');
  assert.ok(inv.craft3x3.every((c) => c === null));
});

test('every recipe in the book fills a grid that makes it', () => {
  const bad = [];
  for (const size of [2, 3]) for (const entry of bookEntries(size)) for (const recipe of entry.recipes) {
    const inv = inventory();
    for (const c of recipeCells(recipe, size)) inv.addItem(c.value, typeof c.value === 'number', 1);
    const r = placeRecipe(inv, { ...entry, recipes: [recipe] }, { size });
    const made = size === 2 ? inv.craft2x2Result : inv.craft3x3Result;
    if (r?.placed !== 1 || recipeIdOf(made ?? {}) !== entry.id) bad.push(`${size}x${size} ${entry.id}`);
  }
  assert.deepEqual(bad, []);
});

test('unlocked recipes are saved with the player, and a new world starts the book over', () => {
  const player = { knownRecipes: new Set([id('crafting_table'), id('oak_planks')]), statusEffects: new Map() };
  const saved = JSON.parse(JSON.stringify(capturePlayerState(player)));
  assert.deepEqual(saved.knownRecipes.sort(), [id('crafting_table'), id('oak_planks')]);
  const loaded = applyPlayerState({ statusEffects: new Map() }, saved);
  assert.ok(loaded.knownRecipes.has(id('oak_planks')));
  assert.match(read('src/worldTeardown.js'), /player\.knownRecipes = new Set\(\);/);
});

test('the book is drawn beside both crafting grids, and learns from every inventory change', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /this\.recipeBook = new RecipeBookPanel\(this\);/);
  assert.match(ui, /this\.recipeBook\?\.render\('inventory'\);/);
  assert.match(ui, /this\.recipeBook\?\.render\('crafting'\);/);
  assert.match(ui, /updateHotbar\(\) \{\s*\/\/[^\n]*\n\s*this\.recipeBook\?\.learn\(\);/);
  const panel = read('src/recipeBookUi.js');
  assert.match(panel, /mode !== 'creative' && mode !== 'spectator'/, 'Survival and Adventure only');
  assert.match(panel, /inventory: \{ modal: 'inventory-modal', gridName: 'craft2x2', size: 2/);
  assert.match(panel, /crafting: \{ modal: 'crafting-modal', gridName: 'craft3x3', size: 3/);
  assert.match(read('src/style.css'), /\.recipe-book\{/);
});
