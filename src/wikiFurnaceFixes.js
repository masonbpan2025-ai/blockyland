// Smelting recipes, smelting experience and fuel values the furnace was missing or had wrong, against the Minecraft
// Wiki -- found by the recipe parity audit (src/resourceRecipeAudit.js, S-SMELT and F-FUEL) and adopted from the
// wiki's own data (src/resourceWikiRecipes.js: the pages' {{Smelting}} templates and the Smelting page's fuel table).
//
// What was wrong before: no stripped log, wood or hyphae made charcoal; no deepslate ore smelted; bricks did not
// crack; terracotta did not glaze; chainmail did not recycle; gold gear gave 0.1 experience where the wiki gives
// 0.25, and clay 0.1 where it gives 0.35; and 236 fuels burned for nothing -- every boat but oak, every slab,
// button, door, sign, carpet, stripped log, the dried kelp block and the scaffolding. A bowl burned 10 s, not 5.
import { BLOCK_DEFS } from './blocks.js';
import { WIKI_SMELTING, WIKI_FUEL } from './resourceWikiRecipes.js';
import { cellForName } from './wikiNames.js';

/**
 * The key a furnace slot presents for a cell: a block (and a block item, which the inventory holds as its block)
 * by its numeric id, an item by its name -- the rule tests/smeltingVanilla.test.js holds every row to.
 */
function keysFor(cell) {
  return [cell.id];
}

/** The name the experience table keys an output by (as furnace.js's getSmeltingXp reads it). */
function xpKey(cell) {
  if (!cell.isBlock) return cell.id;
  return String(BLOCK_DEFS[cell.id]?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Apply the wiki's smelting, experience and fuel facts to the furnace's tables. Returns what changed. */
export function applyWikiFurnaceFixes(SMELTING_RECIPES, SMELTING_XP, FUEL_BURN_TIMES, XP_BY_INPUT = null) {
  const changed = { recipes: [], xp: [], fuel: [] };
  for (const row of WIKI_SMELTING) {
    const input = cellForName(row.input);
    const output = cellForName(row.output);
    if (!input || !output) continue;
    for (const key of keysFor(input)) {
      if (SMELTING_RECIPES[key]) continue;
      SMELTING_RECIPES[key] = { id: output.id, isBlock: output.isBlock, count: 1 };
      changed.recipes.push(`${row.input} -> ${row.output}`);
    }
    if (row.xp !== undefined) {
      // Each recipe's own value, by its input (two recipes can make one output for different experience).
      if (XP_BY_INPUT) XP_BY_INPUT[xpKey(input)] = row.xp;
      const key = xpKey(output);
      if (key && SMELTING_XP[key] !== row.xp) { SMELTING_XP[key] = row.xp; changed.xp.push(`${row.output} ${row.xp}`); }
    }
  }
  const seen = new Set();
  for (const row of WIKI_FUEL) {
    if (seen.has(row.name)) continue; // the table's first, most specific row for a name wins
    seen.add(row.name);
    const cell = cellForName(row.name);
    if (!cell) continue;
    for (const key of keysFor(cell)) {
      if (FUEL_BURN_TIMES[key] === row.seconds) continue;
      FUEL_BURN_TIMES[key] = row.seconds;
      changed.fuel.push(`${row.name} ${row.seconds}`);
    }
  }
  return changed;
}
