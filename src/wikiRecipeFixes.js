// Crafting recipes this game was missing or had wrong, against the Minecraft Wiki -- found by the recipe parity
// audit (src/resourceRecipeAudit.js, C-CRAFT) and fixed here so crafting.js stays the one place grids are matched.
//
// Three kinds of fix:
//   * ADOPTED: recipes taken as the wiki writes them, from src/resourceWikiRecipes.js (generated from each page's
//     {{Crafting}} template), for the outputs listed below. Taken from the data rather than retyped, so the grid
//     is the wiki's own.
//   * REMOVED: recipes the game had that the wiki does not (TNT from coal) or that the wiki has since replaced (the
//     lead's slimeball, the lodestone's netherite ingot, the six-ingot copper trapdoor, three snow blocks giving
//     six snow *blocks* rather than six snow layers).
//   * RE-DYEING: "Any Wool + Matching Dye -> Matching Wool", and the same for carpets and beds -- one dyed item and
//     one dye, any colour to any colour, which a fixed list of recipes cannot say.
import { BLOCK_DEFS, ITEMS } from './blocks.js';
import { WIKI_CRAFTING } from './resourceWikiRecipes.js';
import { cellForName, cellLabel } from './wikiNames.js';
import { FUTURE_ITEMS } from './futureContent.js';

// The names of the post-1.21.4 content src/futureContent.js registers. Every wiki {{Crafting}} frame that makes or
// uses one is adopted as written -- Poplar Planks in a chest, a blue egg in a cake, a harness -- since none of
// them had a recipe of its own.
const FUTURE_NAMES = new Set(Object.values(FUTURE_ITEMS).map((it) => it.name));

/** Outputs whose wiki recipes the game adopts, each for the reason given. */
export const ADOPTED_OUTPUTS = new Set([
  // "Planks: Matching Log; Matching Stem; Matching Stripped Log; ... Matching Wood; Matching Hyphae ..." -- the game
  // made planks from logs only. Selected by ingredient below, not by output.
  // 8 arrows around a lingering potion, for every effect the game has (tippedArrowItems.js).
  'Arrow of Poison', 'Arrow of Weakness', 'Arrow of Slowness', 'Arrow of Healing', 'Arrow of Harming', 'Arrow of Regeneration',
  'Arrow of Swiftness', 'Arrow of Fire Resistance', 'Arrow of Leaping', 'Arrow of Strength', 'Arrow of Night Vision',
  'Arrow of Invisibility', 'Arrow of Water Breathing', 'Arrow of Slow Falling', 'Arrow of the Turtle Master',
  'Arrow of Oozing', 'Arrow of Weaving', 'Arrow of Wind Charging', 'Arrow of Infestation',
  // Java: a lingering water bottle makes arrows of Splashing; an awkward, thick or mundane one a plain "Tipped Arrow".
  'Arrow of Splashing', 'Tipped Arrow',
  'Resin Bricks', 'Resin Brick Slab', 'Resin Brick Stairs', 'Resin Brick Wall', 'Chiseled Resin Bricks',
  'Copper Trapdoor', 'Fire Charge', 'Firework Rocket', 'Golden Dandelion', 'Golden Spear', 'Lead', 'Lodestone',
  'Mushroom Stew', 'Suspicious Stew', 'Name Tag', 'Saddle', 'Soul Torch', 'TNT', 'Snow',
  'Campfire', 'Soul Campfire', 'Block of Resin', 'Resin Clump', 'Creaking Heart',
  'Gray Dye', 'Orange Dye', 'Yellow Dye', // from the eyeblossoms and the golden dandelion
]);

/** Is this wiki recipe one the game adopts? */
function adopts(recipe) {
  if (FUTURE_NAMES.has(recipe.output) || recipe.grid.some((n) => n && FUTURE_NAMES.has(n))) return true;
  if (ADOPTED_OUTPUTS.has(recipe.output)) {
    // The dyes: only the flower recipes the game lacked, not its existing mixes.
    if (/ Dye$/.test(recipe.output)) return recipe.grid.some((n) => /Eyeblossom|Golden Dandelion/.test(n ?? ''));
    return true;
  }
  return / Planks$/.test(recipe.output) && recipe.grid.some((n) => /Stripped|Wood$|Hyphae$|Block of Stripped Bamboo/.test(n ?? ''));
}

/** Recipes the wiki does not have, by their result and a test on their ingredients. */
const REMOVED = [
  { result: 'TNT', has: 'coal', why: 'TNT is gunpowder and sand; coal was a typo for gunpowder' },
  { result: 'Lead', has: 'slime_ball', why: 'the wiki\'s lead is five string ("String x5 -> Lead, 2")' },
  { result: 'Lodestone', has: 'netherite_ingot', why: 'the wiki\'s lodestone takes an iron ingot' },
  { result: 'Copper Trapdoor', count: 2, why: 'the wiki\'s copper trapdoor is four ingots in a square, giving one' },
  { result: 'Snow Block', count: 6, why: 'three snow blocks make six snow *layers*; the result was the block' },
];

const valueOf = (cell) => (cell.isBlock ? cell.id : cell.id);

/** A wiki recipe as this game writes one: a trimmed shaped pattern, or a shapeless ingredient list. */
export function gameRecipeFor(recipe) {
  const cells = recipe.grid.map((n) => (n ? cellForName(n) : null));
  const result = cellForName(recipe.output);
  if (!result || recipe.grid.some((n, i) => n && !cells[i])) return null;
  const out = { id: result.id, isBlock: result.isBlock, count: recipe.count };
  if (recipe.shapeless) return { shapeless: true, ingredients: cells.filter(Boolean).map(valueOf), result: out };
  const used = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const rows = used.map((i) => Math.floor(i / 3)); const cols = used.map((i) => i % 3);
  const [r0, r1, c0, c1] = [Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols)];
  const pattern = [];
  for (let r = r0; r <= r1; r++) {
    const row = [];
    for (let c = c0; c <= c1; c++) row.push(cells[r * 3 + c] ? valueOf(cells[r * 3 + c]) : null);
    pattern.push(row);
  }
  return { pattern, result: out };
}

const resultName = (r) => cellLabel({ id: r.result?.id, isBlock: typeof r.result?.id === 'number' || r.result?.isBlock });
const ingredientsOf = (r) => (r.pattern ? r.pattern.flat() : r.ingredients ?? []);

/** Apply the removals and adoptions to the two recipe lists. `match` is crafting.js's own matcher. */
export function applyWikiRecipeFixes(R2, R3, match) {
  for (const list of [R2, R3]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      const name = resultName(r);
      if (REMOVED.some((x) => x.result === name && (x.has === undefined || ingredientsOf(r).includes(x.has)) && (x.count === undefined || r.result?.count === x.count))) list.splice(i, 1);
    }
  }
  const adopted = [];
  for (const recipe of WIKI_CRAFTING) {
    if (!adopts(recipe)) continue;
    const game = gameRecipeFor(recipe);
    if (!game) continue;
    // Already craftable as the wiki says: nothing to add.
    const grid = Array(9).fill(null);
    if (game.shapeless) game.ingredients.forEach((v, k) => { grid[k] = { id: v, isBlock: typeof v === 'number', count: 1 }; });
    else game.pattern.forEach((row, r) => row.forEach((v, c) => { if (v !== null) grid[r * 3 + c] = { id: v, isBlock: typeof v === 'number', count: 1 }; }));
    const now = match(grid, 3, 3, R3);
    if (now && now.id === game.result.id && (now.count ?? 1) === game.result.count) continue;
    R3.unshift(game);
    const small = game.shapeless ? game.ingredients.length <= 4 : game.pattern.length <= 2 && game.pattern[0].length <= 2;
    if (small) R2.unshift(game);
    adopted.push(game);
  }
  // TNT: "It is possible to use any combination of sand and red sand" (its {{Crafting}} description) -- the
  // template animates three of the sixteen; all sixteen craft.
  const sand = cellForName('Sand'); const red = cellForName('Red Sand'); const tnt = cellForName('TNT');
  if (sand && red && tnt) {
    for (let mask = 0; mask < 16; mask++) {
      const pick = (bit) => ((mask >> bit) & 1 ? red.id : sand.id);
      const pattern = [['gunpowder', pick(0), 'gunpowder'], [pick(1), 'gunpowder', pick(2)], ['gunpowder', pick(3), 'gunpowder']];
      const cells = pattern.flat().map((v) => ({ id: v, isBlock: typeof v === 'number', count: 1 }));
      if (match(cells, 3, 3, R3)?.id === tnt.id) continue;
      const recipe = { pattern, result: { id: tnt.id, isBlock: true, count: 1 } };
      R3.unshift(recipe);
      adopted.push(recipe);
    }
  }
  return adopted;
}

// --- re-dyeing ------------------------------------------------------------------------------------------------

const COLOURS = ['White', 'Light Gray', 'Gray', 'Black', 'Brown', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Cyan',
  'Light Blue', 'Blue', 'Purple', 'Magenta', 'Pink'];
const DYEABLE = ['Wool', 'Carpet', 'Bed'];

let dyeing = null;
function dyeingTables() {
  if (dyeing) return dyeing;
  dyeing = { member: new Map(), dye: new Map(), result: new Map() };
  for (const family of DYEABLE) {
    for (const colour of COLOURS) {
      const cell = cellForName(`${colour} ${family}`);
      if (!cell) continue;
      dyeing.member.set(`${cell.isBlock ? 'b' : 'i'}:${cell.id}`, family);
      dyeing.result.set(`${family}:${colour}`, cell);
    }
  }
  for (const colour of COLOURS) {
    const dye = cellForName(`${colour} Dye`);
    if (dye) dyeing.dye.set(`${dye.isBlock ? 'b' : 'i'}:${dye.id}`, colour);
  }
  return dyeing;
}

/** A grid cell's key in the dyeing tables, a block item held by name counting as its block. */
function keyOf(cell) {
  const def = typeof cell.id === 'string' ? ITEMS[cell.id] : null;
  if (def && typeof def.blockId === 'number' && def.isBlock) return `b:${def.blockId}`;
  const isBlock = cell.isBlock !== undefined ? cell.isBlock : typeof cell.id === 'number' && Boolean(BLOCK_DEFS[cell.id]);
  return `${isBlock ? 'b' : 'i'}:${cell.id}`;
}

/** "Any Wool + Matching Dye -> Matching Wool" (and carpet, bed): exactly one dyeable item and one dye. */
export function redyeResult(grid) {
  const filled = grid.filter((c) => c && c.count > 0);
  if (filled.length !== 2) return null;
  const t = dyeingTables();
  const family = filled.map((c) => t.member.get(keyOf(c))).find(Boolean);
  const colour = filled.map((c) => t.dye.get(keyOf(c))).find(Boolean);
  if (!family || !colour) return null;
  const cell = t.result.get(`${family}:${colour}`);
  return cell ? { id: cell.id, isBlock: cell.isBlock, count: 1 } : null;
}
