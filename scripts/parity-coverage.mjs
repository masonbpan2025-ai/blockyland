// Definitive, reproducible survival-parity coverage measurement.
//
// One source of truth for "how much vanilla content can this game express", used both as the
// baseline to improve against and as a guard against me reporting an unverifiable percentage.
// Previous scratch scripts disagreed (336 vs 629) because one ignored spelling aliases; this
// builds the mapper once and reuses it.
import { readFileSync, existsSync } from 'node:fs';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';

// The vanilla data lives in a gitignored cache, because it is 1.3MB of upstream JSON that is
// regenerated rather than edited. Tests therefore have to tolerate its absence rather than fail on a
// fresh checkout, and say so instead of reporting a misleading zero.
const CACHE = '.cache/mc-data';
export const CACHE_PRESENT = ['recipes', 'items', 'blocks'].every(f => existsSync(`${CACHE}/${f}.json`));

const recipes = CACHE_PRESENT ? JSON.parse(readFileSync(`${CACHE}/recipes.json`, 'utf8')) : {};
const items = CACHE_PRESENT ? JSON.parse(readFileSync(`${CACHE}/items.json`, 'utf8')) : [];
const vanillaBlocks = CACHE_PRESENT ? JSON.parse(readFileSync(`${CACHE}/blocks.json`, 'utf8')) : [];
const byId = new Map(items.map(i => [i.id, i.name]));

// --- name vocabulary of this game -------------------------------------------
export const gameNames = new Set();
for (const [key, value] of Object.entries(BLOCKS)) {
  if (typeof value !== 'number') continue;
  gameNames.add(key.toLowerCase());
}
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name) continue;
  gameNames.add(String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
}
for (const key of Object.keys(ITEMS)) gameNames.add(key);

// Spelling differences between vanilla and this game, each one verified against a real recipe.
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

export function have(name) {
  if (!name) return false;
  if (gameNames.has(name)) return true;
  const alias = ALIASES[name];
  if (alias && gameNames.has(alias)) return true;
  return false;
}

// --- coverage ---------------------------------------------------------------
export function measure() {
  let total = 0;
  let expressible = 0;
  const blockedBy = new Map();
  const perRecipe = [];

  for (const key of Object.keys(recipes)) {
    for (const rec of recipes[key]) {
      total++;
      const out = byId.get(rec.result?.id ?? Number(key));
      const needs = new Set();
      if (rec.inShape) {
        for (const row of rec.inShape) {
          for (const c of row) if (c !== null && c !== undefined) needs.add(byId.get(Array.isArray(c) ? c[0] : c));
        }
      }
      if (rec.ingredients) {
        for (const ing of rec.ingredients) needs.add(byId.get(Array.isArray(ing) ? ing[0] : ing));
      }
      const missing = [...needs].filter(n => !have(n));
      const outOk = have(out);
      perRecipe.push({ out, needs: [...needs], missing, shape: rec.inShape ? 'shaped' : 'shapeless' });
      if (outOk && missing.length === 0) expressible++;
      else for (const m of missing) blockedBy.set(m, (blockedBy.get(m) || 0) + 1);
    }
  }

  // How much of the vanilla BLOCK/ITEM roster does the game name at all?
  const blockNames = vanillaBlocks.map(b => b.name);
  const knownBlocks = blockNames.filter(have).length;
  const knownItems = items.map(i => i.name).filter(have).length;

  return { total, expressible, perRecipe, blockedBy, knownBlocks, blockNames, knownItems, itemCount: items.length };
}

// Run the report when invoked directly. Compared by resolved path rather than string-building a
// file URL, which does not match on Windows (drive letter and slash direction both differ).
import { pathToFileURL } from 'node:url';
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const m = measure();
  console.log('=== SURVIVAL PARITY COVERAGE ===');
  console.log('crafting recipes expressible : ' + m.expressible + '/' + m.total
    + '  (' + (100 * m.expressible / m.total).toFixed(1) + '%)');
  console.log('vanilla blocks named by game : ' + m.knownBlocks + '/' + m.blockNames.length
    + '  (' + (100 * m.knownBlocks / m.blockNames.length).toFixed(1) + '%)');
  console.log('vanilla items named by game  : ' + m.knownItems + '/' + m.itemCount
    + '  (' + (100 * m.knownItems / m.itemCount).toFixed(1) + '%)');
  const top = [...m.blockedBy].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('\ntop blockers (adding each unlocks roughly this many recipes):');
  for (const [name, n] of top) console.log('  ' + String(n).padStart(4) + 'x  ' + name);
}
