// Emit real vanilla crafting recipes from minecraft-data into a generated module.
//
// Why this exists. The game has ~53 hand-written recipes; vanilla 1.21.4 has 1,557. The existing
// recipe system (src/crafting.js) already knows how to match a shaped pattern against a grid, so the
// missing piece is not engine work, it is data: nobody has ever transcribed vanilla's recipe set.
//
// The emitter resolves every ingredient through the same name vocabulary scripts/parity-coverage.mjs
// uses, so a recipe is emitted only when its result AND every ingredient resolve to real content.
// Anything that cannot be expressed is counted and reported rather than skipped silently -- otherwise
// the output would look complete while quietly dropping the parts the game cannot support.
//
// Output: src/extraRecipes.js, merged into RECIPES_3X3 by src/crafting.js. Generated recipes are
// appended AFTER the hand-written ones so that hand-tuned recipes still win ties.
//
// Run: node scripts/generate-recipes.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';

const CACHE = '.cache/mc-data';
if (!existsSync(`${CACHE}/recipes.json`)) {
  console.error('vanilla cache missing; run scripts/generate-mc-data.mjs first');
  process.exit(1);
}

const recipes = JSON.parse(readFileSync(`${CACHE}/recipes.json`, 'utf8'));
const items = JSON.parse(readFileSync(`${CACHE}/items.json`, 'utf8'));
const byId = new Map(items.map(i => [i.id, i.name]));

// --- name resolution, shared in spirit with scripts/parity-coverage.mjs -------
//
// The game keys blocks by numeric id (BLOCKS.OAK_PLANKS = 85) and items by lower-case name
// ('iron_ingot'). Vanilla names everything. This maps one vocabulary onto the other.
const nameToBlock = new Map();
for (const [key, value] of Object.entries(BLOCKS)) {
  if (typeof value !== 'number') continue;
  nameToBlock.set(key.toLowerCase(), value);
}
// BLOCK_DEFS names are display names ("Oak Planks"), so normalise them too. Only used when the
// constant name is absent, and never allowed to override it.
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name) continue;
  const norm = String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!nameToBlock.has(norm)) nameToBlock.set(norm, Number(id));
}

const itemNames = new Set(Object.keys(ITEMS));
// Spelling differences between vanilla and this game, each verified against a real recipe.
const ALIASES = {
  cobbled_deepslate: 'cobblestone',
  charcoal: 'coal',
  planks: 'oak_planks',
  wooden_slab: 'oak_slab',
  wooden_stairs: 'oak_stairs',
  wooden_door: 'oak_door',
  wooden_fence: 'oak_fence',
  wooden_button: 'oak_button',
  wooden_pressure_plate: 'oak_pressure_plate',
  wooden_trapdoor: 'oak_trapdoor',
  wood: 'oak_log',
  stripped_wood: 'stripped_oak_log',
  nether_bricks: 'nether_brick',
};

/**
 * Resolve a vanilla name to the value a craft-grid slot holds: a numeric block id, or an item string.
 * Returns null when the game has no such content.
 */
function resolve(name) {
  if (!name) return null;
  if (nameToBlock.has(name)) return nameToBlock.get(name);
  if (itemNames.has(name)) return name;
  const alias = ALIASES[name];
  if (alias) {
    if (nameToBlock.has(alias)) return nameToBlock.get(alias);
    if (itemNames.has(alias)) return alias;
  }
  return null;
}

// A recipe whose ingredients are all the SAME item is useful even when that item is absent upstream,
// because vanilla writes e.g. `#planks` as one specific plank; nothing extra to do here.

// --- convert ----------------------------------------------------------------
const emitted = [];
const stats = {
  total: 0, shaped: 0, shapeless: 0,
  skippedResult: 0, skippedIngredient: 0, shapelessUnsupported: 0,
  rejectedRagged: 0, rejectedTooLarge: 0, rejectedEmpty: 0, unreachable: 0,
  duplicatesCollapsed: 0, emittedBeforeDedupe: 0,
  skippedNotACraftableResult: 0, skippedCountTooLarge: 0,
};
const skippedNames = new Map();

for (const key of Object.keys(recipes)) {
  for (const rec of recipes[key]) {
    stats.total++;
    const resultName = byId.get(rec.result?.id ?? Number(key));
    const resultResolved = resolve(resultName);
    if (resultResolved === null) {
      stats.skippedResult++;
      if (resultName) skippedNames.set(resultName, (skippedNames.get(resultName) || 0) + 1);
      continue;
    }
    const count = rec.result?.count ?? 1;
    const isBlock = typeof resultResolved === 'number';

    // A result of air, or a count below 1, is not a craftable outcome. Vanilla really does contain
    // such a recipe -- the cartography table's "clear map" action is stored as result air count 0 --
    // and emitting it would put a recipe in the list whose only effect is to consume ingredients.
    if ((isBlock && resultResolved === BLOCKS.AIR) || !(count >= 1)) {
      stats.skippedNotACraftableResult++;
      if (resultName) skippedNames.set(resultName, (skippedNames.get(resultName) || 0) + 1);
      continue;
    }
    if (count > 64) {
      stats.skippedCountTooLarge++;
      continue;
    }
    const result = { id: resultResolved, isBlock, count };

    if (rec.inShape && rec.inShape.length) {
      // Shape rows may contain nulls for gaps, and vanilla omits empty leading/trailing rows.
      const pattern = [];
      let ok = true;
      for (const row of rec.inShape) {
        const outRow = [];
        for (const cell of row) {
          if (cell === null || cell === undefined) { outRow.push(null); continue; }
          const name = byId.get(Array.isArray(cell) ? cell[0] : cell);
          const v = resolve(name);
          if (v === null) {
            ok = false;
            if (name) skippedNames.set(name, (skippedNames.get(name) || 0) + 1);
            break;
          }
          outRow.push(v);
        }
        if (!ok) break;
        pattern.push(outRow);
      }
      if (!ok) { stats.skippedIngredient++; continue; }
      // The grid matcher compares the pattern's bounding box against the grid's, so rows and columns
      // must be full width and no shorter than 1. Guard rather than emit a malformed pattern.
      const w = pattern[0]?.length ?? 0;
      if (w === 0 || pattern.some(r => r.length !== w)) { stats.rejectedRagged++; continue; }
      if (pattern.length > 3 || w > 3) { stats.rejectedTooLarge++; continue; }
      // A pattern that is entirely empty would match nothing; skip defensively.
      if (!pattern.some(r => r.some(v => v !== null))) { stats.rejectedEmpty++; continue; }
      emitted.push({ pattern, result });
      stats.shaped++;
      continue;
    }

    if (rec.ingredients && rec.ingredients.length) {
      const names = rec.ingredients.map(i => byId.get(Array.isArray(i) ? i[0] : i));
      const values = names.map(resolve);
      if (values.some(v => v === null)) {
        stats.skippedIngredient++;
        for (const n of names) if (n && resolve(n) === null) skippedNames.set(n, (skippedNames.get(n) || 0) + 1);
        continue;
      }
      // Emitted as a real shapeless recipe. The matcher compares the grid as a multiset, so the
      // arrangement the player uses does not matter and no approximation is needed.
      //
      // Duplicates are preserved deliberately: a shapeless recipe may require the same item more than
      // once, and collapsing them would let a grid with one of that item match.
      emitted.push({ shapeless: true, ingredients: values, result });
      stats.shapeless++;
      continue;
    }

    stats.unreachable++;
  }
}

// --- de-duplicate -----------------------------------------------------------
//
// Vanilla has many recipes that differ only in which wood or colour they use, so the same output can
// appear several times with different ingredients. All of them are kept: that is exactly the parity
// the game was missing. Only literally identical entries are collapsed.
const emittedBeforeDedupe = emitted.length;
stats.emittedBeforeDedupe = emittedBeforeDedupe;
const seen = new Set();
const unique = [];
for (const e of emitted) {
  const key = JSON.stringify(e);
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(e);
}

// Recorded here rather than in the reporting block below, so the emitted module carries the real
// figures instead of the zeroes they still held when the module was written.
stats.emittedBeforeDedupe = emittedBeforeDedupe;
stats.duplicatesCollapsed = emittedBeforeDedupe - unique.length;

// --- emit -------------------------------------------------------------------
const serializeValue = (v) => (typeof v === 'number' ? `B.${constNameOfBlock(v)}` : `'${v}'`);
const blockConstByValue = new Map();
for (const [k, v] of Object.entries(BLOCKS)) {
  if (typeof v !== 'number') continue;
  // Prefer the shortest constant name for a given id, which is the canonical one
  // (GRASS_BLOCK vs GRASS share an id; either is correct but shorter is tidier).
  if (!blockConstByValue.has(v) || k.length < blockConstByValue.get(v).length) blockConstByValue.set(v, k);
}
function constNameOfBlock(v) {
  const name = blockConstByValue.get(v);
  if (!name) throw new Error(`no BLOCKS constant for id ${v}`);
  return name;
}

const lines = [];
lines.push('// GENERATED FILE - do not edit by hand.');
lines.push('//');
lines.push('// Vanilla crafting recipes, transcribed from PrismarineJS/minecraft-data.');
lines.push('//');
lines.push('// Produced by scripts/generate-recipes.mjs. Regenerate with:');
lines.push('//   node scripts/generate-recipes.mjs');
lines.push('//');
lines.push('// Ingredients are emitted the way the existing recipe system stores them: numeric ids for');
lines.push('// blocks, quoted names for items. Only recipes whose result AND every ingredient exist in this');
lines.push('// game are listed; the generator reports what it had to skip.');
lines.push('//');
lines.push(`// ${unique.length} recipes.`);
lines.push('');
lines.push("import { BLOCKS } from './blocks.js';");
lines.push('');
lines.push('const B = BLOCKS;');
lines.push('');
lines.push('/** Vanilla shaped and square shapeless recipes, in the format craft.js matches against. */');
lines.push('export const EXTRA_RECIPES = [');

for (const e of unique) {
  const r = `{id:${serializeValue(e.result.id)},isBlock:${e.result.isBlock},count:${e.result.count}}`;
  if (e.shapeless) {
    const ings = e.ingredients.map(serializeValue).join(',');
    lines.push(`  {shapeless:true,ingredients:[${ings}],result:${r}},`);
  } else {
    const pat = e.pattern.map(row => '[' + row.map(v => (v === null ? 'null' : serializeValue(v))).join(',') + ']').join(',');
    lines.push(`  {pattern:[${pat}],result:${r}},`);
  }
}
lines.push('];');
lines.push('');
lines.push('/** How many recipes this module provides, and what the generator could not express. */');
lines.push(`export const EXTRA_RECIPE_COUNT = ${unique.length};`);
lines.push('');
lines.push('export const EXTRA_RECIPE_STATS = ' + JSON.stringify({
  vanillaTotal: stats.total,
  emitted: unique.length,
  shaped: stats.shaped,
  shapeless: stats.shapeless,
  skippedMissingResult: stats.skippedResult,
  skippedMissingIngredient: stats.skippedIngredient,
  shapelessWithoutFaithfulPattern: stats.shapelessUnsupported,
  rejectedRaggedPattern: stats.rejectedRagged,
  rejectedLargerThan3x3: stats.rejectedTooLarge,
  rejectedEmptyPattern: stats.rejectedEmpty,
  unclassified: stats.unreachable,
  emittedBeforeDedupe: stats.emittedBeforeDedupe,
  duplicatesCollapsed: stats.duplicatesCollapsed,
  skippedNotACraftableResult: stats.skippedNotACraftableResult,
  skippedCountTooLarge: stats.skippedCountTooLarge,
}, null, 2).replace(/\n/g, '\n') + ';');
lines.push('');

writeFileSync('src/extraRecipes.js', lines.join('\n'), 'utf8');

console.log('wrote src/extraRecipes.js');
console.log('  vanilla recipes seen        : ' + stats.total);
console.log('  emitted                     : ' + unique.length);
console.log('    shaped                    : ' + stats.shaped);
console.log('    shapeless                 : ' + stats.shapeless);
console.log('  skipped, result missing     : ' + stats.skippedResult);
console.log('  skipped, ingredient missing : ' + stats.skippedIngredient);
console.log('  shapeless with no faithful  : ' + stats.shapelessUnsupported);
console.log('    representation in a grid');
console.log('  rejected, ragged pattern    : ' + stats.rejectedRagged);
console.log('  rejected, larger than 3x3   : ' + stats.rejectedTooLarge);
console.log('  rejected, empty pattern     : ' + stats.rejectedEmpty);
const accounted = emittedBeforeDedupe + stats.skippedResult + stats.skippedIngredient + stats.shapelessUnsupported
  + stats.rejectedRagged + stats.rejectedTooLarge + stats.rejectedEmpty + stats.unreachable
  + stats.skippedNotACraftableResult + stats.skippedCountTooLarge;
console.log('  duplicates collapsed        : ' + stats.duplicatesCollapsed);
console.log('  skipped, not a craftable    : ' + stats.skippedNotACraftableResult);
console.log('  skipped, count over 64      : ' + stats.skippedCountTooLarge);
console.log('  accounted vs seen           : ' + accounted + ' / ' + stats.total
  + (accounted === stats.total ? '  OK' : '  MISMATCH'));
if (accounted !== stats.total) {
  throw new Error('recipe accounting does not balance: ' + accounted + ' of ' + stats.total);
}
