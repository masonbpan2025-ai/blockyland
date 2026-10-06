// Emit the smelting and fuel entries Mineclonia declares that this game is missing, plus per-recipe
// smelting XP.
//
// Two problems this addresses.
//
// 1. Missing entries. Comparing the game's tables against Mineclonia's `_mcl_cooking_output` and
//    `_mcl_burntime` declarations (fetched by scripts/fetch-mineclonia-cooking.mjs) found seven ores
//    and blocks that are smeltable in vanilla but not here, and one missing fuel.
//
// 2. Per-recipe XP. Vanilla gives a different amount of experience for each smelted item -- 0.1 for
//    food, 0.7 for iron, 1.0 for gold and diamond. Mineclonia gives exactly 1 for everything and says
//    so in a source comment: `-- ToDo give each recipe an idividial XP count`. Copying that would move
//    AWAY from parity, so this emits the vanilla values instead, taken from the research report's
//    verified table rather than invented.
//
// Run: node scripts/fetch-mineclonia-cooking.mjs && node scripts/generate-smelting.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
// NOT imported from furnace.js: that module merges these very entries, so comparing against it made
// the generator non-reproducible. The hand-written tables are parsed out of the source instead.
const FURNACE_SOURCE = readFileSync('src/furnace.js', 'utf8');

/** Extract the hand-written part of a table literal, up to the merge loop that follows it. */
function handWrittenTable(name) {
  const start = FURNACE_SOURCE.indexOf('export const ' + name + ' = {');
  if (start < 0) throw new Error('table not found: ' + name);
  const open = FURNACE_SOURCE.indexOf('{', start);
  // Walk to the matching close brace, so nothing after the table is included.
  let depth = 0;
  let end = open;
  for (let i = open; i < FURNACE_SOURCE.length; i++) {
    if (FURNACE_SOURCE[i] === '{') depth++;
    else if (FURNACE_SOURCE[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = FURNACE_SOURCE.slice(open + 1, end);
  const keys = new Set();
  // Keys appear either as a bare identifier, a quoted string, or a computed [BLOCKS.X] reference.
  for (const m of body.matchAll(/^\s*(?:\[(?:BLOCKS\.)?([A-Z0-9_]+)\]|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:/gm)) {
    if (m[1]) {
      // A BLOCKS constant: resolve it to the id the game will use.
      const cnt = BLOCKS[m[1]];
      if (typeof cnt === 'number') keys.add(String(cnt));
    } else {
      keys.add(m[2] ?? m[3]);
    }
  }
  return keys;
}

const HAND_SMELTING = handWrittenTable('SMELTING_RECIPES');
const HAND_FUEL = handWrittenTable('FUEL_BURN_TIMES');
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';

const CACHE = '.cache/mineclonia/declarations.json';
if (!existsSync(CACHE)) {
  console.error('run scripts/fetch-mineclonia-cooking.mjs first');
  process.exit(1);
}

/**
 * Vanilla smelting experience per output item.
 *
 * Source: the research report's table, read from Mineclonia's own data and cross-checked against
 * vanilla. Only entries the report actually gives are listed; anything absent gets 0.1, which is the
 * food default and the conservative choice, and the module records which entries were defaulted so the
 * uncertainty is visible rather than hidden.
 */
const SMELTING_XP = {
  // Ores and metals.
  iron_ingot: 0.7, gold_ingot: 1.0, copper_ingot: 0.7,
  coal: 0.1, diamond: 1.0, emerald: 1.0, lapis_lazuli: 0.2, redstone: 0.7,
  netherite_scrap: 2.0, quartz: 0.2,
  // Blocks and materials.
  glass: 0.1, brick: 0.3, nether_brick: 0.1, terracotta: 0.1, cracked_stone_bricks: 0.1,
  smooth_stone: 0.1, smooth_sandstone: 0.1, smooth_red_sandstone: 0.1, charcoal: 0.15,
  sponge: 0.15, green_dye: 1.0, cactus_green: 1.0,
  // Foods, all 0.1 or 0.35.
  cooked_beef: 0.35, cooked_porkchop: 0.35, cooked_chicken: 0.35, cooked_mutton: 0.35,
  cooked_rabbit: 0.35, cooked_cod: 0.35, cooked_salmon: 0.35, cooked_kelp: 0.1,
  baked_potato: 0.35, dried_kelp: 0.1,
};
const DEFAULT_XP = 0.1;

// --- 1. resolve Mineclonia names to this game's identifiers -----------------
const RENAME = {
  'mcl_core:clay_lump': 'clay_ball', 'mcl_core:brick': 'brick',
  'mcl_core:stone': 'stone', 'mcl_core:stone_smooth': 'smooth_stone',
  'mcl_core:stone_with_coal': 'coal_ore', 'mcl_core:coal_lump': 'coal',
  'mcl_core:charcoal_lump': 'charcoal', 'mcl_core:stone_with_iron': 'iron_ore',
  'mcl_core:iron_ingot': 'iron_ingot', 'mcl_core:stone_with_gold': 'gold_ore',
  'mcl_core:gold_ingot': 'gold_ingot', 'mcl_core:stone_with_redstone': 'redstone_ore',
  'mcl_redstone:redstone': 'redstone', 'mcl_core:stone_with_lapis': 'lapis_ore',
  'mcl_core:lapis': 'lapis_lazuli', 'mcl_core:stone_with_emerald': 'emerald_ore',
  'mcl_core:emerald': 'emerald', 'mcl_core:stone_with_diamond': 'diamond_ore',
  'mcl_core:diamond': 'diamond', 'mcl_core:stonebrick': 'stone_bricks',
  'mcl_core:stonebrickcracked': 'cracked_stone_bricks', 'mcl_core:sand': 'sand',
  'mcl_core:glass': 'glass', 'mcl_core:sandstone': 'sandstone',
  'mcl_core:sandstonesmooth2': 'smooth_sandstone', 'mcl_core:cobble': 'cobblestone',
  'mcl_core:stick': 'stick', 'mcl_core:bowl': 'bowl', 'mcl_core:coalblock': 'coal_block',
  'mcl_mobitems:blaze_rod': 'blaze_rod',
  // Second batch: the names that were unresolved. Each is an explicit pairing rather than a guess.
  'mcl_nether:netherrack': 'netherrack',
  'mcl_nether:quartz_ore': 'nether_quartz_ore',
  'mcl_nether:quartz': 'quartz',
  'mcl_nether:ancient_debris': 'ancient_debris',
  'mcl_nether:netherite_scrap': 'netherite_scrap',
  'mcl_nether:nether_brick': 'nether_brick',
  'mcl_core:redsand': 'red_sand',
  'mcl_core:redsandstone': 'red_sandstone',
  'mcl_core:redsandstonesmooth2': 'smooth_red_sandstone',
  'mcl_core:clay': 'clay',
  'mcl_colorblocks:hardened_clay': 'terracotta',
  'mcl_core:cactus': 'cactus',
  'mcl_dyes:green': 'green_dye',
  'mcl_core:sea_lantern': 'sea_lantern',
  'mcl_ocean:sponge': 'sponge',
  'mcl_ocean:wet_sponge': 'wet_sponge',
  'mcl_farming:potato': 'potato',
  'mcl_farming:baked_potato': 'baked_potato',
  'mcl_farming:beetroot': 'beetroot',
  'mcl_mobitems:cooked_beef': 'cooked_beef',
  'mcl_mobitems:cooked_porkchop': 'cooked_porkchop',
  'mcl_mobitems:cooked_chicken': 'cooked_chicken',
  'mcl_mobitems:cooked_mutton': 'cooked_mutton',
  'mcl_mobitems:cooked_rabbit': 'cooked_rabbit',
  'mcl_fishing:fish_cooked': 'cooked_cod',
  'mcl_fishing:salmon_cooked': 'cooked_salmon',
  'mcl_ocean:kelp': 'kelp',
  'mcl_ocean:dried_kelp': 'dried_kelp',
};
const strip = (n) => RENAME[n] ?? String(n).split(':').pop();

/** The snake_case name of a block id, matching how names are keyed everywhere else. */
function blockName(id) {
  const def = BLOCK_DEFS[id];
  if (!def?.name) return undefined;
  return String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function resolve(name) {
  const upper = String(name).toUpperCase();
  if (typeof BLOCKS[upper] === 'number') return { id: BLOCKS[upper], isBlock: true, key: String(BLOCKS[upper]) };
  if (ITEMS[name] !== undefined) return { id: name, isBlock: false, key: name };
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    const norm = String(def?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (norm === name) return { id: Number(id), isBlock: true, key: String(id) };
  }
  return null;
}

// --- 2. work out what to add ------------------------------------------------
const declarations = JSON.parse(readFileSync(CACHE, 'utf8'));
const smelting = [];
const fuel = [];
let alreadyCorrect = 0;
const unresolved = [];

for (const d of declarations) {
  if (d.cookingOutput) {
    const from = resolve(strip(d.name));
    const to = resolve(strip(d.cookingOutput));
    if (!from || !to) { unresolved.push(d.name + ' -> ' + d.cookingOutput); continue; }
    const existing = HAND_SMELTING.has(from.key);
    if (existing) { alreadyCorrect++; continue; }
    smelting.push({
      inputKey: from.key,
      inputId: from.id,
      inputIsBlock: from.isBlock,
      output: { id: to.id, isBlock: to.isBlock, count: 1 },
      xp: SMELTING_XP[strip(d.cookingOutput)] ?? DEFAULT_XP,
      xpIsDefault: SMELTING_XP[strip(d.cookingOutput)] === undefined,
      source: d.name,
    });
  }
  if (d.burntime > 0) {
    const r = resolve(strip(d.name));
    if (!r) { unresolved.push(d.name); continue; }
    if (HAND_FUEL.has(r.key)) continue;
    fuel.push({ key: r.key, burnSeconds: d.burntime, source: d.name });
  }
}

/**
 * Vanilla furnace recipes Mineclonia's item set does not cover.
 *
 * Mineclonia is the smelting reference because minecraft-data publishes none, and it is a good one for the
 * blocks and metals it shares. It has no chorus fruit, no netherite, no horse armour and no opinion about
 * recycling gear, so those rows were simply absent -- 23 recipes whose input and output this game both has.
 * `chorus_fruit -> popped_chorus_fruit` was the visible one: fifteen crafting recipes need popped chorus
 * fruit and nothing produced it.
 *
 * Every row here is vanilla's, stated as `input -> output` in this game's own names and resolved through the
 * same `resolve` the Mineclonia names go through, so a block input is keyed by its block id. Amounts are one
 * except where noted; vanilla gives exactly one nugget for a piece of iron or golden gear, which is why
 * recycling is worth doing but is not a duplication trick.
 */
const VANILLA_SMELTING = [
  ['chorus_fruit', 'popped_chorus_fruit'],
  ['basalt', 'smooth_basalt'],
  ['quartz_block', 'smooth_quartz'],
  ['raw_iron_block', 'iron_block'],
  ['raw_copper_block', 'copper_block'],
  ['raw_gold_block', 'gold_block'],
  ['sea_pickle', 'lime_dye'],
  // Iron and chainmail gear smelts to one iron nugget.
  ['iron_helmet', 'iron_nugget'], ['iron_chestplate', 'iron_nugget'],
  ['iron_leggings', 'iron_nugget'], ['iron_boots', 'iron_nugget'],
  ['iron_sword', 'iron_nugget'], ['iron_pickaxe', 'iron_nugget'], ['iron_axe', 'iron_nugget'],
  ['iron_shovel', 'iron_nugget'], ['iron_hoe', 'iron_nugget'],
  ['chainmail_helmet', 'iron_nugget'], ['chainmail_chestplate', 'iron_nugget'],
  ['shears', 'iron_nugget'], ['bucket', 'iron_nugget'], ['cauldron', 'iron_nugget'],
  // Golden gear, golden carrots and golden horse armour to one gold nugget.
  ['golden_helmet', 'gold_nugget'], ['golden_chestplate', 'gold_nugget'],
  ['golden_leggings', 'gold_nugget'], ['golden_boots', 'gold_nugget'],
  ['golden_sword', 'gold_nugget'], ['golden_pickaxe', 'gold_nugget'], ['golden_axe', 'gold_nugget'],
  ['golden_shovel', 'gold_nugget'], ['golden_hoe', 'gold_nugget'],
  ['golden_carrot', 'gold_nugget'], ['golden_horse_armor', 'gold_nugget'],
  // Diamond and netherite gear. Vanilla gives a diamond back for diamond horse armour and one netherite
  // scrap for anything netherite; diamond tools and armour smelt to nothing at all, so they are not here.
  ['diamond_horse_armor', 'diamond'],
  ['netherite_helmet', 'netherite_scrap'], ['netherite_chestplate', 'netherite_scrap'],
  ['netherite_leggings', 'netherite_scrap'], ['netherite_boots', 'netherite_scrap'],
  ['netherite_sword', 'netherite_scrap'], ['netherite_pickaxe', 'netherite_scrap'],
  ['netherite_axe', 'netherite_scrap'], ['netherite_shovel', 'netherite_scrap'],
  ['netherite_hoe', 'netherite_scrap'],
];

const minecloniaSmeltingAdded = smelting.length;
const vanillaAbsent = [];
for (const [inputName, outputName] of VANILLA_SMELTING) {
  const from = resolve(inputName);
  const to = resolve(outputName);
  // Loud rather than silent: a row whose items do not exist here would be dropped without a trace, and the
  // table would look complete while missing the recipe.
  if (!from || !to) { vanillaAbsent.push(`${inputName} -> ${outputName}`); continue; }
  if (HAND_SMELTING.has(from.key)) continue;
  if (smelting.some(s => s.inputKey === from.key)) continue;
  const xp = SMELTING_XP[outputName];
  smelting.push({
    inputKey: from.key,
    inputId: from.id,
    inputIsBlock: from.isBlock,
    output: { id: to.id, isBlock: to.isBlock, count: 1 },
    xp: xp ?? DEFAULT_XP,
    xpIsDefault: xp === undefined,
    source: 'vanilla: ' + inputName,
  });
}
const vanillaAdded = smelting.length - minecloniaSmeltingAdded;
if (vanillaAbsent.length) {
  throw new Error('vanilla smelting rows whose items are missing from this game: ' + vanillaAbsent.join(', '));
}

// The XP table covers every output the game can already smelt, not only the new entries, so existing
// recipes gain their correct experience too.
const xpForExisting = [];
const seenOutputs = new Set();
// Every output this game can smelt: the newly-determined ones plus the hand-written outputs, whose
// names are read from the source so an XP entry exists for them too.
const allOutputs = smelting.map(s => s.output);
for (const m of FURNACE_SOURCE.matchAll(/\{\s*id:\s*('([^']+)'|BLOCKS\.([A-Z0-9_]+))\s*,\s*isBlock:\s*(true|false)/g)) {
  if (m[2]) allOutputs.push({ id: m[2], isBlock: m[4] === 'true' });
  else if (m[3] !== undefined && typeof BLOCKS[m[3]] === 'number') allOutputs.push({ id: BLOCKS[m[3]], isBlock: m[4] === 'true' });
}
for (const out of allOutputs) {
  // Normalise to a name whatever the output kind is, then key by that name so one entry covers every
  // input that produces it.
  const outName = out.isBlock ? blockName(out.id) : out.id;
  if (!outName || seenOutputs.has(outName)) continue;
  if (SMELTING_XP[outName] === undefined) continue;
  seenOutputs.add(outName);
  xpForExisting.push({ key: outName, xp: SMELTING_XP[outName] });
}

// Sort so regeneration is byte-identical regardless of the order outputs were discovered in.
smelting.sort((a, b) => String(a.inputKey).localeCompare(String(b.inputKey)));
fuel.sort((a, b) => String(a.key).localeCompare(String(b.key)));
xpForExisting.sort((a, b) => String(a.key).localeCompare(String(b.key)));

// --- 3. emit ----------------------------------------------------------------
const ser = (v) => (typeof v === 'number' ? `B.${constOf(v)}` : `'${v}'`);
const constByValue = new Map();
for (const [k, v] of Object.entries(BLOCKS)) {
  if (typeof v !== 'number') continue;
  if (!constByValue.has(v) || k.length < constByValue.get(v).length) constByValue.set(v, k);
}
function constOf(v) {
  const n = constByValue.get(v);
  if (!n) throw new Error('no BLOCKS constant for id ' + v);
  return n;
}

const lines = [];
lines.push('// GENERATED FILE - do not edit by hand.');
lines.push('//');
lines.push('// Smelting and fuel entries vanilla has that this game was missing, plus per-recipe smelting XP.');
lines.push('//');
lines.push('// Produced by scripts/generate-smelting.mjs from Mineclonia\'s own cooking and fuel declarations');
lines.push('// (https://codeberg.org/mineclonia/mineclonia), fetched by scripts/fetch-mineclonia-cooking.mjs,');
lines.push('// plus a hand-verified table of vanilla furnace recipes Mineclonia\'s item set does not cover: chorus');
lines.push('// fruit, smooth basalt and quartz, the raw metal blocks, the horse armours, and recycling iron,');
lines.push('// golden, chainmail and netherite gear into nuggets or scrap.');
lines.push('// minecraft-data publishes no smelting data, so Mineclonia is the reference for it; its fields are');
lines.push('// declared vanilla-identical and the sampled values match.');
lines.push('//');
lines.push('// The XP table is NOT from Mineclonia: it gives exactly 1 experience for every smelted item, and');
lines.push('// says so in a source comment ("ToDo give each recipe an idividial XP count"). Vanilla varies per');
lines.push('// recipe, so the vanilla values are used instead, from the verified research table.');
lines.push('');
lines.push("import { BLOCKS } from './blocks.js';");
lines.push('');
lines.push('const B = BLOCKS;');
lines.push('');
lines.push('/** Smelting recipes to add, keyed the way furnace.js keys its table. */');
lines.push('export const EXTRA_SMELTING = {');
for (const s of smelting) {
  lines.push(`  ${/^[0-9]+$/.test(s.inputKey) ? `[${ser(s.inputId)}]` : `'${s.inputKey}'`}: `
    + `{ id: ${ser(s.output.id)}, isBlock: ${s.output.isBlock}, count: ${s.output.count}, xp: ${s.xp} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Experience to add to recipes the game already has, keyed the same way. */');
lines.push('export const SMELTING_XP = {');
for (const e of xpForExisting) {
  lines.push(`  ${e.key}: ${e.xp},`);
}
lines.push('};');
lines.push('');
lines.push('/** Fuel values to add or correct, in seconds. */');
lines.push('export const EXTRA_FUEL = {');
for (const f of fuel) {
  lines.push(`  ${/^[0-9]+$/.test(f.key) ? `[${f.key}]` : `'${f.key}'`}: ${f.burnSeconds},`);
}
lines.push('};');
lines.push('');
lines.push('/** Default experience for a smelted item with no specific value. Vanilla uses 0.1 for food. */');
lines.push(`export const DEFAULT_SMELTING_XP = ${DEFAULT_XP};`);
lines.push('');
lines.push('export const SMELTING_STATS = ' + JSON.stringify({
  smeltingAdded: minecloniaSmeltingAdded,
  vanillaAdded,
  fuelAdded: fuel.length,
  alreadyCorrect,
  xpEntries: xpForExisting.length,
  unresolvedNames: unresolved.length,
  defaultedXp: smelting.filter(s => s.xpIsDefault).length,
}, null, 2) + ';');
lines.push('');

writeFileSync('src/extraSmelting.js', lines.join('\n'), 'utf8');

console.log('wrote src/extraSmelting.js');
console.log('  smelting entries to add  : ' + smelting.length
  + ' (' + minecloniaSmeltingAdded + ' from Mineclonia, ' + vanillaAdded + ' vanilla)');
console.log('  fuel entries to add/fix  : ' + fuel.length);
console.log('  already correct          : ' + alreadyCorrect);
console.log('  XP values for existing   : ' + xpForExisting.length);
console.log('  entries using default XP : ' + smelting.filter(s => s.xpIsDefault).length);
console.log('  unresolved names         : ' + unresolved.length
  + (unresolved.length ? ' (' + unresolved.slice(0, 6).join(', ') + ')' : ''));
console.log('\nnew smelting:');
for (const s of smelting) console.log('  ' + s.source.padEnd(34) + ' -> ' + String(s.output.id).padEnd(6) + ' xp ' + s.xp);
console.log('\nnew fuel:');
for (const f of fuel) console.log('  ' + f.source.padEnd(34) + ' = ' + f.burnSeconds + 's');
