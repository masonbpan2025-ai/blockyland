// The recipe book: the crafting screens' catalogue of recipes the player has unlocked, as Bedrock and Education
// Edition show it in Survival (https://minecraft.wiki/w/Recipe_book):
//
//   * It opens beside the inventory's 2x2 grid and the crafting table's 3x3 grid, open by default.
//   * Tabs: Construction (building materials), Equipment (tools, weapons, armor), Items (ores and everything else),
//     Nature (nature materials and food), and All, which has the search box.
//   * "All" / "Craftable": the toggle shows every unlocked recipe, or only those the inventory can make now. A recipe
//     the inventory cannot make is shown red.
//   * Clicking a recipe puts its materials into the grid; shift puts in as many as the inventory allows. A recipe that
//     cannot be made is laid out as a ghost, to show where its items go.
//   * Unlocking: "for most recipes, one must hold a specific item" -- here, getting any of a recipe's ingredients
//     unlocks it, and the crafting table is known from the start. Unlocked recipes are the same set `/recipe` gives
//     and `doLimitedCrafting` checks (player.knownRecipes).
//
// Pure: no DOM. recipeBookUi.js draws it.
import { BLOCK_DEFS, BLOCKS, ITEMS, stackLimitFor } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3, recipeIngredientKey, stackKey } from './crafting.js';
import { recipeIdOf } from './advancedCommands.js';
import { foodFor } from './foodData.js';

export const RECIPE_BOOK_TABS = [
  { id: 'all', label: 'All', icon: '🔍' },
  { id: 'construction', label: 'Construction', icon: '🧱' },
  { id: 'equipment', label: 'Equipment', icon: '⚔️' },
  { id: 'items', label: 'Items', icon: '💎' },
  { id: 'nature', label: 'Nature', icon: '🌿' }
];

/** Recipes the player knows from the start (wiki: the crafting table, "Start a new world"). */
export const STARTING_RECIPES = [recipeIdOf({ id: BLOCKS.CRAFTING_TABLE })];

const EQUIPMENT = /(sword|pickaxe|_axe$|^axe$|shovel|_hoe$|helmet|chestplate|leggings|boots|^bow$|crossbow|shield|trident|mace|fishing_rod|shears|flint_and_steel|brush|spyglass|compass|clock|^lead$|carrot_on_a_stick|warped_fungus_on_a_stick|arrow|firework_rocket|horse_armor|wolf_armor|elytra|turtle_helmet|map$)/;
const NATURE_BLOCK = /(log|wood|leaves|sapling|flower|tulip|orchid|allium|bluet|daisy|poppy|dandelion|cornflower|lily|rose|peony|lilac|sunflower|fern|grass|vine|moss|mushroom|wool|carpet|hay|melon|pumpkin|cactus|bamboo|kelp|coral|dirt|mud|clay|honey|bee|slime|sponge|snow|ice)/;
const NATURE_ITEM = /(dye|seeds|bone_meal|sugar|wheat|egg|leather|string|feather|paper|book$|slime_ball|honey|bowl|stew|soup|bread|cake|cookie|pie|apple|carrot|potato|beetroot|melon|pumpkin|kelp|berries|bottle)/;

/** A result's display name and plain id string, for searching and tabs. */
export function resultName(result) {
  if (typeof result?.id === 'number') return BLOCK_DEFS[result.id]?.name ?? String(result.id);
  return ITEMS[result?.id]?.name ?? String(result?.id ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const plainId = (result) => (typeof result?.id === 'number' ? String(BLOCK_DEFS[result.id]?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_') : String(result?.id ?? ''));

/** The Bedrock tab a result belongs in. */
export function tabFor(result) {
  const id = plainId(result);
  const isBlock = typeof result?.id === 'number' || result?.isBlock;
  if (!isBlock && EQUIPMENT.test(id)) return 'equipment';
  if (!isBlock && (foodFor(id) || NATURE_ITEM.test(id))) return 'nature';
  if (isBlock) {
    const def = typeof result.id === 'number' ? BLOCK_DEFS[result.id] : null;
    if (def?.plant || NATURE_BLOCK.test(id)) return 'nature';
    if (def?.redstone || /(table|furnace|smoker|chest|barrel|anvil|stand|loom|stonecutter|grindstone|lectern|cauldron|composter|hopper|dispenser|dropper|piston|observer|lamp|rail|lantern|torch|campfire|bell|beacon|bed$|door|trapdoor|button|lever|pressure_plate)/.test(id)) return 'items';
    return 'construction';
  }
  return 'items';
}

const ENTRIES = new Map();
/**
 * Every recipe the grid can make, one entry per result (its alternative patterns together, as the book shows them).
 * @param {2|3} size the grid's width
 * @returns {Array<{id:string, result:object, recipes:object[], tab:string, name:string}>}
 */
export function bookEntries(size = 3) {
  if (ENTRIES.has(size)) return ENTRIES.get(size);
  const byId = new Map();
  for (const recipe of size === 2 ? RECIPES_2X2 : RECIPES_3X3) {
    if (!recipe?.result || (!recipe.pattern && !recipe.ingredients)) continue;
    const id = recipeIdOf(recipe.result);
    let entry = byId.get(id);
    if (!entry) byId.set(id, entry = { id, result: recipe.result, recipes: [], tab: tabFor(recipe.result), name: resultName(recipe.result) });
    entry.recipes.push(recipe);
  }
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  ENTRIES.set(size, list);
  return list;
}

/** A recipe's ingredients as grid cells: `{ row, col, key, value }`, shaped by its pattern, shapeless in a row. */
export function recipeCells(recipe, width = 3) {
  const cells = [];
  if (recipe.shapeless) {
    recipe.ingredients.forEach((value, i) => cells.push({ row: Math.floor(i / width), col: i % width, key: recipeIngredientKey(value), value }));
    return cells;
  }
  recipe.pattern.forEach((row, r) => row.forEach((value, c) => {
    if (value !== null && value !== undefined) cells.push({ row: r, col: c, key: recipeIngredientKey(value), value });
  }));
  return cells;
}

/** How many of each ingredient key one craft needs. */
export function recipeNeeds(recipe, width = 3) {
  const needs = new Map();
  for (const cell of recipeCells(recipe, width)) needs.set(cell.key, (needs.get(cell.key) ?? 0) + 1);
  return needs;
}

/** What the player has, by crafting key: the hotbar, storage, and what is in the grid (it goes back first). */
export function availableCounts(inventory, gridName = null) {
  const counts = new Map();
  const add = (s) => { if (!s || !(s.count > 0) || s.enchantments?.length) return; const k = stackKey(s); counts.set(k, (counts.get(k) ?? 0) + s.count); };
  for (const s of inventory.hotbar ?? []) add(s);
  for (const s of inventory.storage ?? []) add(s);
  if (gridName) for (const s of inventory[gridName] ?? []) add(s);
  return counts;
}

/** How many times the counts can make this recipe (0 when they cannot). */
export function timesCraftable(recipe, counts, width = 3) {
  let times = Infinity;
  for (const [key, need] of recipeNeeds(recipe, width)) times = Math.min(times, Math.floor((counts.get(key) ?? 0) / need));
  return Number.isFinite(times) ? times : 0;
}

/** The first of an entry's patterns the counts can make, or null. */
export function craftableRecipe(entry, counts, width = 3) {
  return entry.recipes.find((r) => timesCraftable(r, counts, width) > 0) ?? null;
}

// Every recipe id that uses an ingredient, by the ingredient's key: obtaining the ingredient unlocks them.
let BY_INGREDIENT = null;
function recipesByIngredient() {
  if (BY_INGREDIENT) return BY_INGREDIENT;
  BY_INGREDIENT = new Map();
  for (const entry of bookEntries(3)) for (const recipe of entry.recipes) for (const cell of recipeCells(recipe)) {
    let ids = BY_INGREDIENT.get(cell.key);
    if (!ids) BY_INGREDIENT.set(cell.key, ids = new Set());
    ids.add(entry.id);
  }
  return BY_INGREDIENT;
}

/** The player's unlocked recipe ids, with the starting ones in. */
export function knownRecipes(player) {
  const known = player.knownRecipes ??= new Set();
  for (const id of STARTING_RECIPES) known.add(id);
  return known;
}

/**
 * Unlock the recipes that use anything the inventory holds. Remembers which stacks it has already looked at, so it
 * is cheap to call on every inventory change.
 * @returns {string[]} the recipe ids newly unlocked
 */
export function learnFromInventory(player, inventory) {
  if (!player || !inventory) return [];
  const known = knownRecipes(player);
  const seen = player.recipeBookSeen ??= new Set();
  const fresh = [];
  const index = recipesByIngredient();
  for (const s of [...(inventory.hotbar ?? []), ...(inventory.storage ?? []), inventory.offhand, ...Object.values(inventory.armor ?? {})]) {
    if (!s || !(s.count > 0)) continue;
    const key = stackKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const id of index.get(key) ?? []) if (!known.has(id)) { known.add(id); fresh.push(id); }
  }
  return fresh;
}

/**
 * The entries the book shows: unlocked ones (all of them in Creative), in a tab, matching a search, and only the ones
 * the inventory can make when `craftableOnly`.
 */
export function visibleEntries({ player, inventory, size = 3, tab = 'all', search = '', craftableOnly = false, gridName = null, showAll = false }) {
  const known = showAll ? null : knownRecipes(player);
  const counts = availableCounts(inventory, gridName);
  const query = String(search || '').trim().toLowerCase();
  const out = [];
  for (const entry of bookEntries(size)) {
    if (known && !known.has(entry.id)) continue;
    if (tab !== 'all' && entry.tab !== tab) continue;
    if (query && !entry.name.toLowerCase().includes(query) && !entry.id.includes(query.replace(/\s+/g, '_'))) continue;
    const craftable = !!craftableRecipe(entry, counts, size);
    if (craftableOnly && !craftable) continue;
    out.push({ ...entry, craftable });
  }
  // Craftable first, as the book lists them.
  return out.sort((a, b) => Number(b.craftable) - Number(a.craftable));
}

/** Put a grid's contents back in the inventory. False (and nothing moved) when they do not all fit. */
function returnGrid(inventory, gridName) {
  const grid = inventory[gridName];
  const items = grid.filter(Boolean);
  if (!items.length) return true;
  const room = items.every((s) => (inventory.countRoomFor?.(s.id, s.isBlock, s.count, s.enchantments ?? null) ?? s.count) >= s.count);
  if (!room) return false;
  for (let i = 0; i < grid.length; i++) if (grid[i]) { inventory.addItem({ ...grid[i] }); grid[i] = null; }
  return true;
}

/** Take `count` of a crafting key out of the hotbar and storage; returns a stack of what was taken (its first slot's). */
function takeByKey(inventory, key, count) {
  let taken = null;
  for (const list of [inventory.storage, inventory.hotbar]) for (let i = 0; i < list.length && count > 0; i++) {
    const s = list[i];
    if (!s || !(s.count > 0) || s.enchantments?.length || stackKey(s) !== key) continue;
    const n = Math.min(count, s.count);
    taken ??= { ...s, count: 0 };
    taken.count += n;
    s.count -= n;
    count -= n;
    if (s.count <= 0) list[i] = null;
  }
  return taken;
}

/**
 * Click a recipe: put its materials into the grid (`all`: as many crafts as the inventory and a stack allow). A recipe
 * the inventory cannot make is left as a ghost on `inventory.recipeGhost` instead, showing where its items go.
 * @returns {{placed:number, ghost:boolean}|null} null when the grid could not be emptied first
 */
export function placeRecipe(inventory, entry, { size = 3, all = false } = {}) {
  const gridName = size === 2 ? 'craft2x2' : 'craft3x3';
  if (!returnGrid(inventory, gridName)) return null;
  inventory.recipeGhost = null;
  const counts = availableCounts(inventory);
  const recipe = craftableRecipe(entry, counts, size);
  if (!recipe) {
    const first = entry.recipes[0];
    inventory.recipeGhost = { gridName, cells: recipeCells(first, size).map((c) => ({ index: c.row * size + c.col, value: c.value })), result: entry.result };
    inventory.checkCrafting?.();
    return { placed: 0, ghost: true };
  }
  let times = all ? timesCraftable(recipe, counts, size) : 1;
  const cells = recipeCells(recipe, size);
  for (const cell of cells) times = Math.min(times, stackLimitFor(cell.value) || 64);
  const grid = inventory[gridName];
  for (const cell of cells) grid[cell.row * size + cell.col] = takeByKey(inventory, cell.key, times);
  inventory.checkCrafting?.();
  return { placed: times, ghost: false };
}
