// Recipe parity: every crafting, smelting and fuel fact the Minecraft Wiki gives, asked of the game's own code.
//
// The wiki's recipes are in src/resourceWikiRecipes.js (generated from the pages' {{Crafting}} / {{Smelting}}
// templates and the Smelting page's fuel table). Each crafting recipe is laid into a crafting grid and handed to
// `findMatchingRecipe` -- the function the inventory's crafting grids call -- and the answer compared with the
// wiki's output and count. Smelting asks `getSmeltingRecipe` and `getSmeltingXp`, as the furnace does; fuel asks
// `getFuelBurnTime`. No DOM, no Three.js, so the tests and the Resource Inspector share it.
//
// Verdicts as in resourceWikiAudit.js: PASS, FAIL, NA (the recipe names something this game does not have -- a
// post-1.21.4 block or item, listed in docs/missing-content.md).
import { BLOCK_DEFS, ITEMS } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from './crafting.js';
import { getSmeltingRecipe, getSmeltingXp, getFuelBurnTime } from './furnace.js';
import { WIKI_CRAFTING, WIKI_SMELTING, WIKI_FUEL, WIKI_FORTUNE_AVERAGES } from './resourceWikiRecipes.js';
import { harvestDrops } from './blockDrops.js';
import { harvestDataFor } from './blockHarvestData.js';
import { cellForName, cellLabel, normName as norm } from './wikiNames.js';

const WIKI = 'https://minecraft.wiki/w/';
const pageUrl = (title) => WIKI + encodeURIComponent(String(title).replace(/ /g, '_'));

export { cellForName, cellLabel };

/** Do a result and an expected cell name the same thing? By id, else by the display name both carry. */
function sameThing(result, expected) {
  if (!result || !expected) return false;
  if (Boolean(result.isBlock) === Boolean(expected.isBlock) && result.id === expected.id) return true;
  return norm(cellLabel(result)) === norm(cellLabel(expected));
}

function verdict(id, label, expected, actual, ok, { source = null, note = null, subject } = {}) {
  const status = ok === null ? 'NA' : ok ? 'PASS' : 'FAIL';
  return { id, label, status, expected: String(expected), actual: String(actual), source, note, subject };
}

// --- crafting -----------------------------------------------------------------------------------------------

/** The grid a wiki recipe puts in a crafting table: 3x3, shaped as written, a shapeless one filled in order. */
function gridFor(recipe, cells) {
  if (!recipe.shapeless) return cells.map((c) => (c ? { ...c, count: 1 } : null));
  const grid = Array(9).fill(null);
  cells.filter(Boolean).forEach((c, i) => { grid[i] = { ...c, count: 1 }; });
  return grid;
}

/** The same recipe in the 2x2 inventory grid, when it fits there (shapeless of four or fewer, or a 2x2 shape). */
function smallGridFor(recipe, cells) {
  const used = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  if (recipe.shapeless) {
    if (used.length > 4) return null;
    const grid = Array(4).fill(null);
    used.forEach((i, k) => { grid[k] = { ...cells[i], count: 1 }; });
    return grid;
  }
  const rows = used.map((i) => Math.floor(i / 3)); const cols = used.map((i) => i % 3);
  const r0 = Math.min(...rows); const c0 = Math.min(...cols);
  if (Math.max(...rows) - r0 > 1 || Math.max(...cols) - c0 > 1) return null;
  const grid = Array(4).fill(null);
  for (const i of used) grid[(Math.floor(i / 3) - r0) * 2 + (i % 3 - c0)] = { ...cells[i], count: 1 };
  return grid;
}

/** One wiki crafting recipe asked of the game. */
export function craftingCase(recipe) {
  const label = `${recipe.shapeless ? 'Shapeless' : 'Shaped'}: ${recipe.grid.filter(Boolean).join(' + ')} -> ${recipe.count} × ${recipe.output}`;
  const source = pageUrl(recipe.page);
  const expected = cellForName(recipe.output);
  const cells = recipe.grid.map((n) => (n ? cellForName(n) : null));
  const unknown = [recipe.output, ...recipe.grid.filter((n, i) => n && !cells[i])].filter((n) => !cellForName(n));
  if (unknown.length) {
    return verdict('C-CRAFT', label, `${recipe.count} × ${recipe.output}`, '—', null,
      { source, subject: recipe.output, note: `not in this game: ${[...new Set(unknown)].join(', ')}` });
  }
  const big = findMatchingRecipe(gridFor(recipe, cells), 3, 3, RECIPES_3X3);
  const small = smallGridFor(recipe, cells);
  const inInventory = small ? findMatchingRecipe(small, 2, 2, RECIPES_2X2) : null;
  const result = big ?? inInventory;
  const actual = result ? `${result.count ?? 1} × ${cellLabel(result)}` : 'no recipe matches';
  const ok = Boolean(result) && sameThing(result, expected) && (result.count ?? 1) === recipe.count;
  const note = small && result && !inInventory ? 'crafts in the table, but not in the 2x2 inventory grid' : null;
  return verdict('C-CRAFT', label, `${recipe.count} × ${cellLabel(expected)}`, actual, ok, { source, subject: recipe.output, note });
}

// --- smelting and fuel ----------------------------------------------------------------------------------------

/** One wiki smelting recipe asked of the furnace: what it gives, and the experience. */
export function smeltingCase(recipe) {
  const input = cellForName(recipe.input);
  const expected = cellForName(recipe.output);
  const label = `Smelt ${recipe.input} -> ${recipe.output}${recipe.xp !== undefined ? ` (${recipe.xp} XP)` : ''}`;
  const source = pageUrl(recipe.page);
  if (!input || !expected) {
    return verdict('S-SMELT', label, recipe.output, '—', null, { source, subject: recipe.input, note: `not in this game: ${[!input && recipe.input, !expected && recipe.output].filter(Boolean).join(', ')}` });
  }
  // The furnace keys its table by the id the slot holds: a block by number, an item by name.
  const result = getSmeltingRecipe(input.id) ?? getSmeltingRecipe(input.isBlock ? cellLabel(input).toLowerCase().replace(/[^a-z0-9]+/g, '_') : input.id);
  const xp = result ? getSmeltingXp(result, input.id) : null;
  const okOutput = Boolean(result) && sameThing(result, expected);
  const okXp = recipe.xp === undefined || (xp !== null && Math.abs(xp - recipe.xp) < 1e-6);
  return verdict('S-SMELT', label, `${cellLabel(expected)}${recipe.xp !== undefined ? `, ${recipe.xp} XP` : ''}`,
    result ? `${cellLabel(result)}, ${xp} XP` : 'not smeltable', okOutput && okXp, { source, subject: recipe.input });
}

/** One wiki fuel row asked of the furnace: how many seconds it burns. */
export function fuelCase(row) {
  const cell = cellForName(row.name);
  const source = `${WIKI}Smelting#Fuel`;
  if (!cell) return verdict('F-FUEL', `${row.name} burns ${row.seconds} s`, row.seconds, '—', null, { source, subject: row.name, note: 'not in this game' });
  const seconds = getFuelBurnTime(cell.id);
  return verdict('F-FUEL', `${row.name} burns ${row.seconds} s`, `${row.seconds} s`, `${seconds} s`, Math.abs(seconds - row.seconds) < 1e-6, { source, subject: row.name });
}

// --- Fortune ---------------------------------------------------------------------------------------------------

/** A small seeded generator, so the Fortune averages are the same on every run. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * One block's average drops at Fortune 0-III, sampled through `harvestDrops` (what the break path spawns) with its
 * proper tool, against the Fortune page's table. Sampled, so it allows 4% (or 0.05 of an item) either way.
 */
export function fortuneCase(name, averages, samples = 6000) {
  const cell = cellForName(name);
  const source = `${WIKI}Fortune`;
  const label = `Fortune 0/I/II/III average drops of ${name}`;
  if (!cell?.isBlock) return verdict('F-FORTUNE', label, averages.join(' / '), '—', null, { source, subject: name, note: 'not a block of this game' });
  const row = harvestDataFor(cell.id);
  const toolId = row?.tool && row.tool !== 'shears' ? `${row.tier ?? 'iron'}_${row.tool}` : null;
  const random = seeded(cell.id * 7919);
  const actual = [0, 1, 2, 3].map((fortune) => {
    let total = 0;
    // The tables are for a grown plant: nether wart at its last age.
    const age = /nether wart/i.test(name) ? 3 : null;
    for (let i = 0; i < samples; i++) total += harvestDrops(cell.id, { toolId, fortune, age }, random).filter((d) => !(d.isBlock && d.id === cell.id)).reduce((n, d) => n + d.count, 0);
    return Math.round((total / samples) * 100) / 100;
  });
  const ok = actual.every((a, i) => Math.abs(a - averages[i]) <= Math.max(0.05, averages[i] * 0.04));
  return verdict('F-FORTUNE', label, averages.join(' / '), actual.join(' / '), ok, { source, subject: name });
}

// --- everything, and per resource -----------------------------------------------------------------------------

export function recipeAudit() {
  const rows = [...WIKI_CRAFTING.map(craftingCase), ...WIKI_SMELTING.map(smeltingCase), ...dedupeFuel(WIKI_FUEL).map(fuelCase),
    ...Object.entries(WIKI_FORTUNE_AVERAGES).map(([name, avg]) => fortuneCase(name, avg))];
  const tally = (list) => list.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] ?? 0) + 1 }), { PASS: 0, FAIL: 0, NA: 0 });
  const byCase = {};
  for (const r of rows) (byCase[r.id] ??= []).push(r);
  return { rows, totals: tally(rows), byCase: Object.fromEntries(Object.entries(byCase).map(([k, v]) => [k, tally(v)])), failures: rows.filter((r) => r.status === 'FAIL') };
}

/** A fuel the table names twice (an "Any" group overlapping a row of its own) keeps its first, specific row. */
function dedupeFuel(rows) {
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.name) ? false : seen.add(r.name)));
}

/** The recipe cases that make, smelt or burn this resource, for the Inspector. */
export function recipeCasesForEntry(entry) {
  if (!entry) return [];
  const names = new Set([entry.name, entry.blockDef?.name, ITEMS[entry.id]?.name].filter(Boolean).map(norm));
  const mine = (n) => names.has(norm(n));
  return [
    ...WIKI_CRAFTING.filter((r) => mine(r.output)).map(craftingCase),
    ...WIKI_SMELTING.filter((r) => mine(r.input) || mine(r.output)).map(smeltingCase),
    ...dedupeFuel(WIKI_FUEL).filter((r) => mine(r.name)).map(fuelCase),
    ...Object.entries(WIKI_FORTUNE_AVERAGES).filter(([n]) => mine(n)).map(([n, avg]) => fortuneCase(n, avg)),
  ];
}
