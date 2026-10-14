// Fast crafting diagnostic: the production recipe table and grid matcher.
//
// Model layer only. It does NOT drive the bot's `craft` action or the crafting table block --
// `e2e/craftCommand.pw.js` is the evidence for that route. Statuses are PASS / FAIL / GAP /
// SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Crafting
import { writeFile, mkdir } from 'node:fs/promises';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });

/**
 * One identity for an item, whether the table calls it a name or a block id.
 *
 * A recipe may name its result `'white_bed'` while another names the same item by its block id, and
 * `'white_bed'` is also a *block* key with a DIFFERENT number. Comparing raw values therefore reported the
 * two bed entries as a shadowing alias when they are the same item, which was this probe's own error rather
 * than the game's. The game's `sameItem` normalises the same way; this is the same idea for the probe.
 */
function identity(value) {
  if (typeof value === 'number') return String(value);
  const name = String(value);
  // An item name wins when the name is a registered item.
  if (ITEMS[name]) {
    const blockId = ITEMS[name].blockId;
    return typeof blockId === 'number' ? String(blockId) : name;
  }
  const blockId = BLOCKS[name.toUpperCase()];
  return typeof blockId === 'number' ? String(blockId) : name;
}
const sameId = (a, b) => identity(a) === identity(b);

/**
 * Is a recipe value held as a BLOCK?
 *
 * The recipes (`RECIPES_2X2` / `RECIPES_3X3`) write a block as its numeric constant and an item as a bare
 * name, so the value's own type is the answer. Getting this wrong is not cosmetic: a cell that says
 * `isBlock: false` about a block id is telling the matcher it holds an ITEM with that id, and if some item
 * happens to share the number the comparison silently succeeds against the wrong thing.
 */
const valueIsBlock = (v) => typeof v === 'number';

/** Build an inventory-shaped grid: { id, isBlock, count } per slot. */
function grid(size, placements) {
  const g = new Array(size * size).fill(null);
  for (const [r, c, id, isBlock = valueIsBlock(id), count = 1] of placements) g[r * size + c] = { id, isBlock, count };
  return g;
}
/** Lay a recipe pattern into a size x size grid at an offset. */
function fromPattern(pattern, size, { dRow = 0, dCol = 0, mirror = false } = {}) {
  const g = new Array(size * size).fill(null);
  for (let r = 0; r < pattern.length; r++) {
    for (let c = 0; c < pattern[r].length; c++) {
      const v = pattern[r][c];
      if (v == null) continue;
      const cc = (mirror ? pattern[r].length - 1 - c : c) + dCol;
      const rr = r + dRow;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) return null;
      g[rr * size + cc] = { id: v, isBlock: valueIsBlock(v), count: 1 };
    }
  }
  return g;
}
const same = (got, want) => Boolean(got) && sameId(got.id, want);

// --- C01: pattern position ---
// Wiki: shaped recipes "can be made using the top, middle, or bottom row". The matcher trims the grid's
// bounding box, so a recipe may sit anywhere as long as the shape is intact.
const shiftFails = [];
let shiftChecked = 0;
for (const r of RECIPES_3X3) {
  if (r.shapeless || !r.pattern) continue;
  const h = r.pattern.length;
  for (let dr = 0; dr <= 3 - h; dr++) {
    const g = fromPattern(r.pattern, 3, { dRow: dr });
    if (!g) continue;
    shiftChecked++;
    if (!same(findMatchingRecipe(g, 3, 3, RECIPES_3X3), r.result.id)) {
      shiftFails.push(`${JSON.stringify(r.result.id)} at dRow=${dr} -> ${JSON.stringify(findMatchingRecipe(g, 3, 3, RECIPES_3X3)?.id ?? null)}`);
    }
  }
}
row('C01', shiftFails.length ? 'FAIL' : 'PASS',
  'a shaped recipe matches at the top, middle or bottom row of the grid',
  shiftFails.length ? `${shiftFails.length} of ${shiftChecked} placements failed: ${shiftFails.slice(0, 4).join('; ')}` : `all ${shiftChecked} placements matched`);

// --- C02: horizontal mirroring ---
// Wiki: shaped recipes "can also be flipped horizontally, but not vertically."
const mirrorFails = [];
let mirrorChecked = 0;
for (const r of RECIPES_3X3) {
  if (r.shapeless || !r.pattern) continue;
  const w = r.pattern[0].length;
  if (w < 2) continue;
  // Skip patterns that are their own mirror: flipping them produces the same grid, so they prove nothing.
  const selfMirror = r.pattern.every((line) => JSON.stringify(line) === JSON.stringify([...line].reverse()));
  if (selfMirror) continue;
  const m = fromPattern(r.pattern, 3, { mirror: true });
  if (!m) continue;
  mirrorChecked++;
  if (!same(findMatchingRecipe(m, 3, 3, RECIPES_3X3), r.result.id)) {
    mirrorFails.push(`${JSON.stringify(r.result.id)} -> ${JSON.stringify(findMatchingRecipe(m, 3, 3, RECIPES_3X3)?.id ?? null)}`);
  }
}
row('C02', mirrorFails.length ? 'FAIL' : 'PASS',
  'every multi-column shaped recipe also matches flipped horizontally',
  mirrorFails.length ? `${mirrorFails.length} of ${mirrorChecked} mirrored placements failed: ${mirrorFails.slice(0, 4).join('; ')}` : `all ${mirrorChecked} mirrored placements matched`,
  'asymmetric patterns only; a self-mirroring pattern proves nothing');

// The bow is the wiki's own example of a recipe that only works one way round.
const bow = RECIPES_3X3.find((r) => String(r.result.id) === 'bow');
const bowMirror = bow ? findMatchingRecipe(fromPattern(bow.pattern, 3, { mirror: true }), 3, 3, RECIPES_3X3) : null;
const bowNormal = bow ? findMatchingRecipe(fromPattern(bow.pattern, 3, 3), 3, 3, RECIPES_3X3) : null;
row('C03', same(bowNormal, 'bow') && same(bowMirror, 'bow') ? 'PASS' : 'FAIL',
  'the bow matches both ways round, strings left or right',
  `normal -> ${JSON.stringify(bowNormal?.id ?? null)}, mirrored -> ${JSON.stringify(bowMirror?.id ?? null)}`,
  'pattern: [null,stick,string]/[stick,null,string]/[null,stick,string]');

// Vertical flipping must NOT match, because the wiki excludes it.
const pickaxe = RECIPES_3X3.find((r) => String(r.result.id) === 'wooden_pickaxe');
const vFlipped = pickaxe ? (() => {
  const p = pickaxe.pattern;
  const flipped = [...p].reverse();
  return findMatchingRecipe(fromPattern(flipped, 3), 3, 3, RECIPES_3X3);
})() : null;
row('C04', !same(vFlipped, 'wooden_pickaxe') ? 'PASS' : 'FAIL',
  'a vertically flipped pickaxe does not match the pickaxe recipe',
  `upside down -> ${JSON.stringify(vFlipped?.id ?? null)}`,
  'the wiki excludes vertical flipping');

// --- C05: the 2x2 grid is a subset of 3x3 ---
// Wiki: the inventory's 2x2 grid makes "small crafting recipes"; anything needing a table does not fit.
const bigInSmall = [];
const smallInBig = [];
let smallChecked = 0;
for (const r of RECIPES_2X2) {
  if (r.shapeless) {
    if (r.ingredients.length > 4) bigInSmall.push(`${JSON.stringify(r.result.id)} needs ${r.ingredients.length} ingredients`);
    continue;
  }
  if (!r.pattern) continue;
  const h = r.pattern.length, w = r.pattern[0].length;
  if (h > 2 || w > 2) { bigInSmall.push(`${JSON.stringify(r.result.id)} is ${h}x${w}`); continue; }
  smallChecked++;
  const g = fromPattern(r.pattern, 3);
  if (!g) continue;
  if (!same(findMatchingRecipe(g, 3, 3, RECIPES_3X3), r.result.id)) smallInBig.push(`${JSON.stringify(r.result.id)}`);
}
row('C05', bigInSmall.length || smallInBig.length ? 'FAIL' : 'PASS',
  'nothing in the 2x2 list needs more than a 2x2 grid, and every 2x2 recipe also works in the 3x3 grid',
  `oversized: ${bigInSmall.slice(0, 4).join('; ') || 'none'}; 3x3 mismatches: ${smallInBig.slice(0, 4).join('; ') || 'none'}`,
  `${smallChecked} shaped 2x2 recipes checked`);

// --- C06: no two recipes with the same input produce different items ---
// `findMatchingRecipe` returns the FIRST match, so an alias silently makes one of the two unreachable. Two
// real ones were found this way: a 4-planks->4-planks no-op that shadowed the stone pressure plate.
const byPattern = new Map();
const byIngredients = new Map();
const aliases = [];
for (const r of RECIPES_3X3) {
  if (r.shapeless) {
    const k = JSON.stringify([...r.ingredients].map(String).sort());
    const prior = byIngredients.get(k);
    if (prior && !sameId(prior.result.id, r.result.id)) aliases.push(`shapeless ${k}: ${JSON.stringify(prior.result.id)} shadows ${JSON.stringify(r.result.id)}`);
    else if (!prior) byIngredients.set(k, r);
    continue;
  }
  if (!r.pattern) continue;
  const k = JSON.stringify(r.pattern.map((line) => line.map((v) => (v == null ? null : String(v)))));
  const prior = byPattern.get(k);
  if (prior && !sameId(prior.result.id, r.result.id)) aliases.push(`shaped ${k}: ${JSON.stringify(prior.result.id)} shadows ${JSON.stringify(r.result.id)}`);
  else if (!prior) byPattern.set(k, r);
}
row('C06', aliases.length ? 'FAIL' : 'PASS',
  'no two recipes share an input pattern and produce different items',
  aliases.length ? aliases.slice(0, 5).join('; ') : `no aliases among ${byPattern.size} shaped and ${byIngredients.size} shapeless inputs`);

// --- C07: the two vanished recipes ---
// The stone pressure plate was unreachable: a hand-written [[STONE, STONE]] entry produced the unrelated
// `PRESSURE_PLATE` block and won the tie, because the 2x2 list is spread near the start of RECIPES_3X3.
const platePlate = findMatchingRecipe(grid(2, [[0, 0, BLOCKS.STONE, true], [0, 1, BLOCKS.STONE, true]]), 2, 2, RECIPES_2X2);
const plateIn3 = findMatchingRecipe(fromPattern([[BLOCKS.STONE, BLOCKS.STONE]], 3), 3, 3, RECIPES_3X3);
row('C07', same(platePlate, BLOCKS.STONE_PRESSURE_PLATE) && same(plateIn3, BLOCKS.STONE_PRESSURE_PLATE) ? 'PASS' : 'FAIL',
  'four stone in a 2x2, or two stone side by side, gives the STONE pressure plate',
  `2x2 -> ${JSON.stringify(platePlate?.id ?? null)}, 3x3 -> ${JSON.stringify(plateIn3?.id ?? null)}, wanted ${BLOCKS.STONE_PRESSURE_PLATE}`,
  `PRESSURE_PLATE is ${BLOCKS.PRESSURE_PLATE}, a different block from STONE_PRESSURE_PLATE ${BLOCKS.STONE_PRESSURE_PLATE}`);

// The oak trapdoor: 3x2 planks -> 2 trapdoors, which only one hand-written entry described and which was
// itself unreachable while a no-op six-planks recipe existed.
const trapdoor = RECIPES_3X3.find((r) => String(r.result.id) === String(BLOCKS.OAK_TRAPDOOR));
const trapdoorGrid = trapdoor ? fromPattern(trapdoor.pattern, 3) : null;
const trapdoorGot = trapdoorGrid ? findMatchingRecipe(trapdoorGrid, 3, 3, RECIPES_3X3) : null;
row('C08', trapdoor && same(trapdoorGot, BLOCKS.OAK_TRAPDOOR) && trapdoor.result.count === 2 ? 'PASS' : 'FAIL',
  'six oak planks in a 3x2 give 2 oak trapdoors',
  `${JSON.stringify(trapdoorGot?.id ?? null)} x${trapdoorGot?.count ?? 0} from ${JSON.stringify(trapdoor?.pattern ?? null)}`,
  'the vanilla recipe is 3x2 planks -> 2 trapdoors');

// --- C09: the canonical recipes the wiki prints ---
const named = [
  ['oak log -> 4 planks', [[0, 0, BLOCKS.OAK_LOG]], 2, { id: BLOCKS.OAK_PLANKS, count: 4 }],
  ['2 planks -> 4 sticks', [[0, 0, BLOCKS.OAK_PLANKS], [1, 0, BLOCKS.OAK_PLANKS]], 2, { id: 'stick', count: 4 }],
  ['4 planks -> crafting table', [[0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS], [1, 0, BLOCKS.OAK_PLANKS], [1, 1, BLOCKS.OAK_PLANKS]], 2, { id: BLOCKS.CRAFTING_TABLE, count: 1 }],
  ['8 cobblestone -> furnace', [[0, 0, BLOCKS.COBBLESTONE], [0, 1, BLOCKS.COBBLESTONE], [0, 2, BLOCKS.COBBLESTONE], [1, 0, BLOCKS.COBBLESTONE], [1, 2, BLOCKS.COBBLESTONE], [2, 0, BLOCKS.COBBLESTONE], [2, 1, BLOCKS.COBBLESTONE], [2, 2, BLOCKS.COBBLESTONE]], 3, { id: BLOCKS.FURNACE, count: 1 }],
  ['8 planks -> chest', [[0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS], [0, 2, BLOCKS.OAK_PLANKS], [1, 0, BLOCKS.OAK_PLANKS], [1, 2, BLOCKS.OAK_PLANKS], [2, 0, BLOCKS.OAK_PLANKS], [2, 1, BLOCKS.OAK_PLANKS], [2, 2, BLOCKS.OAK_PLANKS]], 3, { id: BLOCKS.CHEST, count: 1 }],
  ['9 iron nuggets -> iron ingot', Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3), i % 3, 'iron_nugget']), 3, { id: 'iron_ingot', count: 1 }],
  ['1 iron ingot -> 9 nuggets', [[0, 0, 'iron_ingot']], 2, { id: 'iron_nugget', count: 9 }],
  ['1 bone -> 3 bone meal', [[0, 0, 'bone']], 2, { id: 'bone_meal', count: 3 }],
];
const namedFails = [];
const listFor = (size) => (size === 2 ? RECIPES_2X2 : RECIPES_3X3);
for (const [label, placements, size, want] of named) {
  const got = findMatchingRecipe(grid(size, placements), size, size, listFor(size));
  if (!same(got, want.id) || got.count !== want.count) {
    namedFails.push(`${label}: got ${JSON.stringify(got ? `${got.id} x${got.count}` : null)}, wanted ${JSON.stringify(want.id)} x${want.count}`);
  }
}
row('C09', namedFails.length ? 'FAIL' : 'PASS',
  `the ${named.length} canonical wiki recipes each give the right item and count`,
  namedFails.length ? namedFails.join('; ') : 'all correct');

// --- C10: shapeless recipes ignore arrangement ---
// Wiki: three sugar in any arrangement make sugar cane; a shapeless recipe is the multiset that matters.
const shapelessRecipes = RECIPES_3X3.filter((r) => r.shapeless && r.ingredients.length === 2);
const shapelessFails = [];
let shapelessChecked = 0;
for (const r of shapelessRecipes.slice(0, 40)) {
  const [a, b] = r.ingredients;
  const orders = [
    [[0, 0, a], [0, 1, b]],
    [[0, 1, a], [0, 0, b]],
    [[0, 0, b], [1, 0, a]],
  ];
  for (const order of orders) {
    shapelessChecked++;
    const got = findMatchingRecipe(grid(3, order), 3, 3, RECIPES_3X3);
    if (!same(got, r.result.id)) shapelessFails.push(`${JSON.stringify(r.ingredients)} from ${JSON.stringify(order.map((o) => o[2]))} -> ${JSON.stringify(got?.id ?? null)}`);
  }
}
row('C10', shapelessFails.length ? 'FAIL' : 'PASS',
  'a shapeless recipe matches in any arrangement of the same items',
  shapelessFails.length ? `${shapelessFails.length} of ${shapelessChecked} arrangements failed: ${shapelessFails.slice(0, 4).join('; ')}` : `${shapelessChecked} arrangements over the first 40 two-ingredient shapeless recipes matched`,
  'the matcher compares multisets for these');

// --- C11: a full grid with a wrong ingredient does not match ---
const wrong = findMatchingRecipe(grid(3, [[0, 0, BLOCKS.OAK_PLANKS], [0, 1, BLOCKS.OAK_PLANKS], [1, 0, 'diamond']]), 3, 3, RECIPES_3X3);
row('C11', wrong === null ? 'PASS' : 'FAIL',
  'an incomplete or wrong arrangement matches nothing rather than the nearest recipe',
  JSON.stringify(wrong));

// --- C12: table integrity ---
const malformed = [];
for (const [name, list] of [['2x2', RECIPES_2X2], ['3x3', RECIPES_3X3]]) {
  for (const r of list) {
    if (!r.result || r.result.id === undefined || !(r.result.count >= 1)) malformed.push(`${name}: bad result ${JSON.stringify(r.result)}`);
    if (r.shapeless) {
      if (!Array.isArray(r.ingredients) || !r.ingredients.length) malformed.push(`${name}: shapeless with no ingredients`);
      if (r.pattern) malformed.push(`${name}: shapeless carrying a pattern`);
      if (r.ingredients.length > 9) malformed.push(`${name}: ${r.ingredients.length} ingredients`);
    } else {
      if (!Array.isArray(r.pattern) || !r.pattern.length) malformed.push(`${name}: shaped with no pattern`);
      else if (r.pattern.length > 3 || r.pattern[0].length > 3) malformed.push(`${name}: pattern ${r.pattern.length}x${r.pattern[0].length}`);
    }
  }
}
row('C12', malformed.length ? 'FAIL' : 'PASS',
  'every recipe has a usable result and a well-formed pattern or ingredient list',
  malformed.length ? malformed.slice(0, 4).join('; ') : `${RECIPES_2X2.length} 2x2 and ${RECIPES_3X3.length} 3x3 recipes well-formed`);

// --- C13: every recipe is reachable ---
// A recipe that can never match is a claim that the player can craft something they cannot. One dead entry
// was found this way -- a hand-written "minecart" with a `null` one cell out of place, so it keyed a shape
// no grid could form. C01 asks the same question exhaustively for the placements it tries; this is the
// cheap canonical form of it, over the WHOLE table.
const unreachable = [];
for (const [name, list, size] of [['2x2', RECIPES_2X2, 2], ['3x3', RECIPES_3X3, 3]]) {
  for (const r of list) {
    const got = r.shapeless
      ? findMatchingRecipe(grid(size, r.ingredients.map((v, i) => [Math.floor(i / size), i % size, v])), size, size, list)
      : findMatchingRecipe(fromPattern(r.pattern, size), size, size, list);
    if (!same(got, r.result.id)) {
      unreachable.push(`${name} ${JSON.stringify(r.result.id)}: ${r.shapeless ? JSON.stringify(r.ingredients) : JSON.stringify(r.pattern)} -> ${JSON.stringify(got?.id ?? null)}`);
    }
  }
}
row('C13', unreachable.length ? 'FAIL' : 'PASS',
  'every recipe in both tables matches its own canonical layout',
  unreachable.length ? `${unreachable.length} unreachable: ${unreachable.slice(0, 4).join('; ')}` : `all ${RECIPES_2X2.length + RECIPES_3X3.length} recipes reachable`,
  'a layout the matcher cannot produce makes the recipe dead');

const report = {
  referenceProfile: 'Java Edition 1.21.4 crafting; https://minecraft.wiki/w/Crafting',
  layer: 'production RECIPES_2X2 / RECIPES_3X3 and findMatchingRecipe only; the bot craft action and the crafting table block are tested in e2e/craftCommand.pw.js',
  summary: {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
    gap: rows.filter((r) => r.status === 'GAP').length,
    specUnverified: rows.filter((r) => r.status === 'SPEC_UNVERIFIED').length,
  },
  rows,
};

if (process.argv.includes('--write')) {
  await mkdir('docs/artifacts', { recursive: true });
  await writeFile('docs/artifacts/craft-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/craft-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));

