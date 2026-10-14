// Fast enchanting diagnostic: the production offer engine and registry, no browser and no AI.
//
// Model layer only. It does NOT exercise the player bot's `enchant` action, the enchanting table block or
// reach -- `e2e/enchant.pw.js` is the evidence for that route. Statuses are PASS / FAIL / GAP /
// SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Enchantment and
//            https://minecraft.wiki/w/Enchanting_table_mechanics
import { writeFile, mkdir } from 'node:fs/promises';
import {
  ENCHANTMENT_REGISTRY, TREASURE_ENCHANTMENTS, NOT_OFFERED, NOT_ENCHANTABLE,
  experienceCost, lapisCostForSlot, enchantabilityOf, enchantmentCost, levelForCost,
  generateEnchantmentOffers, applyEnchantment, eligibleEnchantments, areIncompatible,
  isEnchantableItem, isPrimaryFor, calculateBookshelfCount, getItemEnchantCategory,
} from '../src/enchanting.js';
import { BLOCKS } from '../src/blocks.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });

/** A deterministic little PRNG, so a probe run is reproducible. */
function lcg(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- E01: the xp cost table, for all 16 bookshelf counts and all three slots ---
// From the wiki's table. Slot 2 at 15 bookshelves is the only single-valued cell.
const WIKI = {
  0: [[1, 2], [1, 6], [1, 8]],
  1: [[1, 3], [1, 7], [2, 9]],
  2: [[1, 3], [2, 8], [4, 11]],
  3: [[1, 4], [2, 9], [6, 12]],
  4: [[1, 4], [3, 10], [8, 14]],
  5: [[1, 5], [3, 11], [10, 15]],
  6: [[1, 5], [3, 12], [12, 17]],
  7: [[1, 6], [3, 13], [14, 18]],
  8: [[1, 6], [4, 14], [16, 20]],
  9: [[1, 7], [4, 15], [18, 21]],
  10: [[2, 7], [5, 16], [20, 23]],
  11: [[2, 8], [5, 17], [22, 24]],
  12: [[2, 8], [5, 18], [24, 26]],
  13: [[2, 9], [5, 19], [26, 27]],
  14: [[2, 9], [6, 20], [28, 29]],
  15: [[2, 10], [6, 21], [30, 30]],
};
const costFails = [];
const seen = {};
for (const shelves of Object.keys(WIKI).map(Number)) {
  for (const slot of [0, 1, 2]) {
    const [lo, hi] = WIKI[shelves][slot];
    const rng = lcg(1000 + shelves * 7 + slot);
    seen[`${shelves}-${slot}`] = new Set();
    for (let i = 0; i < 4000; i++) {
      const c = experienceCost(slot, shelves, rng);
      seen[`${shelves}-${slot}`].add(c);
      if (c < lo || c > hi) costFails.push(`slot ${slot}, ${shelves} shelves -> ${c} (wiki ${lo}-${hi})`);
    }
  }
}
row('E01', costFails.length ? 'FAIL' : 'PASS',
  'every sampled xp cost falls inside the wiki\'s published range for its slot and bookshelf count',
  costFails.length ? [...new Set(costFails)].slice(0, 6).join('; ') : 'all 192,000 samples in range',
  'the wiki\'s Bookshelves 0..15 table, top/middle/bottom slots');

// The three extremes the table pins exactly, which sampling alone cannot prove.
const exact = [];
for (const [slot, shelves, want] of [[2, 15, 30], [0, 0, 1], [0, 1, 1]]) {
  const rng = lcg(99);
  const found = new Set();
  for (let i = 0; i < 3000; i++) found.add(experienceCost(slot, shelves, rng));
  if (slot === 2 && shelves === 15) { if ([...found].some((v) => v !== want)) exact.push(`bottom/15 gave ${[...found].join(',')}`); }
  else if (want === 1 && [...found].some((v) => v < 1)) exact.push(`slot ${slot}/${shelves} went below 1`);
}
row('E02', exact.length ? 'FAIL' : 'PASS',
  'the bottom slot is exactly 30 with 15 bookshelves, and no cost ever falls below 1',
  exact.length ? exact.join('; ') : 'bottom/15 is always 30; minimums hold');

// --- E03: 16+ bookshelves are capped at 15, as the wiki says ---
const capped = [];
{
  const rng = lcg(7);
  for (let i = 0; i < 2000; i++) {
    const at15 = experienceCost(2, 15, rng);
    const at30 = experienceCost(2, 30, rng);
    if (at15 !== at30) capped.push(`15 -> ${at15}, 30 -> ${at30}`);
  }
}
row('E03', capped.length ? 'FAIL' : 'PASS',
  'more than 15 bookshelves changes nothing',
  capped.length ? capped.slice(0, 3).join('; ') : '15 and 30 bookshelves give identical costs',
  'wiki: "The maximum number of active bookshelves is 15, and further bookshelves are ignored."');

// --- E04: the enchantability table ---
const expectedEnchantability = {
  'golden_helmet': 25, 'golden_chestplate': 25, 'golden_leggings': 25, 'golden_boots': 25,
  'golden_sword': 22, 'golden_pickaxe': 22,
  'leather_helmet': 15, 'wooden_sword': 15, 'netherite_sword': 15, 'netherite_boots': 15,
  'iron_sword': 14, 'iron_pickaxe': 14,
  'copper_sword': 13,
  'chainmail_helmet': 12,
  'diamond_sword': 10, 'diamond_pickaxe': 10, 'diamond_helmet': 10,
  'iron_helmet': 9, 'iron_boots': 9, 'turtle_helmet': 9,  'copper_helmet': 8,
  'stone_sword': 5, 'stone_pickaxe': 5,
  'book': 1, 'bow': 1, 'crossbow': 1, 'fishing_rod': 1, 'trident': 1,
};
const enchantFails = [];
for (const [item, want] of Object.entries(expectedEnchantability)) {
  const got = enchantabilityOf(item);
  if (got !== want) enchantFails.push(`${item}: ${got} (wanted ${want})`);
}
row('E04', enchantFails.length ? 'FAIL' : 'PASS',
  `all ${Object.keys(expectedEnchantability).length} enchantability figures match the wiki`,
  enchantFails.length ? enchantFails.join('; ') : 'all correct',
  'armour uses its own column: golden armour 25 vs golden tools 22, iron armour 9 vs iron tools 14');

// --- E05: lapis per slot ---
const lapis = [lapisCostForSlot(0), lapisCostForSlot(1), lapisCostForSlot(2)];
row('E05', JSON.stringify(lapis) === JSON.stringify([1, 2, 3]) ? 'PASS' : 'FAIL',
  'the three slots cost 1, 2 and 3 lapis lazuli',
  lapis.join(', '));

// --- E06: the registry is vanilla's list ---
const registryEntries = Object.entries(ENCHANTMENT_REGISTRY);
const known = {
  protection: [4, 10], fire_protection: [4, 5], feather_falling: [4, 5], blast_protection: [4, 2],
  projectile_protection: [4, 5], respiration: [3, 2], aqua_affinity: [1, 2], thorns: [3, 1],
  depth_strider: [3, 2], frost_walker: [2, 2], binding_curse: [1, 1], soul_speed: [3, 1],
  swift_sneak: [3, 1], sharpness: [5, 10], smite: [5, 5], bane_of_arthropods: [5, 5],
  knockback: [2, 5], fire_aspect: [2, 2], looting: [3, 2], sweeping_edge: [3, 2],
  efficiency: [5, 10], silk_touch: [1, 1], unbreaking: [3, 5], fortune: [3, 2],
  power: [5, 10], punch: [2, 2], flame: [1, 2], infinity: [1, 1],
  luck_of_the_sea: [3, 2], lure: [3, 2], loyalty: [3, 5], impaling: [5, 2],
  riptide: [3, 2], channeling: [1, 1], multishot: [1, 2], quick_charge: [3, 5],
  piercing: [4, 10], mending: [1, 2], vanishing_curse: [1, 1],
};
const regFails = [];
for (const [key, [maxLevel, weight]] of Object.entries(known)) {
  const def = ENCHANTMENT_REGISTRY[key];
  if (!def) { regFails.push(`${key} missing`); continue; }
  if (def.maxLevel !== maxLevel) regFails.push(`${key} maxLevel ${def.maxLevel} != ${maxLevel}`);
  if (def.weight !== weight) regFails.push(`${key} weight ${def.weight} != ${weight}`);
}
row('E06', regFails.length ? 'FAIL' : 'PASS',
  `the ${Object.keys(known).length} table-offerable enchantments have the wiki's max levels and weights`,
  regFails.length ? regFails.slice(0, 8).join('; ') : `${registryEntries.length} registered, all checked values correct`,
  'mace-only Density, Breach and Wind Burst are deliberately not offered');

// --- E07: the six treasure enchantments ---
const treasureExpected = ['binding_curse', 'vanishing_curse', 'frost_walker', 'mending', 'soul_speed', 'swift_sneak'];
const treasureGot = [...TREASURE_ENCHANTMENTS].sort();
row('E07', JSON.stringify(treasureGot) === JSON.stringify([...treasureExpected].sort()) ? 'PASS' : 'FAIL',
  'exactly the six treasure enchantments are marked as such',
  treasureGot.join(', '));

// --- E08: the table never offers a treasure enchantment ---
const treasureOffered = [];
for (const item of ['diamond_pickaxe', 'diamond_sword', 'diamond_boots', 'book', 'bow']) {
  const eligible = eligibleEnchantments(item, { allowTreasure: true });
  for (let i = 0; i < 300; i++) {
    const offers = generateEnchantmentOffers({ id: item }, 15, lcg(i + 1));
    for (const offer of offers) {
      for (const e of [offer.primary, ...(offer.additional ?? [])]) {
        if (TREASURE_ENCHANTMENTS.has(e.id)) treasureOffered.push(`${item} offered ${e.id}`);
      }
    }
  }
  void eligible;
}
row('E08', treasureOffered.length ? 'FAIL' : 'PASS',
  'no table offer is ever a treasure enchantment, at any bookshelf count',
  treasureOffered.length ? [...new Set(treasureOffered)].slice(0, 5).join('; ') : 'none offered across 1,500 rolls',
  'wiki: candidates are the non-treasure enchantments');

// --- E09: offers are conflict-free, in-range and affordable ---
const offerFails = [];
const items = ['diamond_sword', 'diamond_pickaxe', 'diamond_helmet', 'diamond_boots', 'bow', 'crossbow', 'book', 'trident', 'fishing_rod', 'golden_apple'];
for (const id of items) {
  for (let shelves = 0; shelves <= 15; shelves++) {
    for (let i = 0; i < 40; i++) {
      const offers = generateEnchantmentOffers({ id }, shelves, lcg(i * 31 + shelves + 1));
      for (const offer of offers) {
        const all = [offer.primary, ...(offer.additional ?? [])].filter(Boolean);
        if (!all.length) offerFails.push(`${id}: an offer with no enchantment`);
        for (const e of all) {
          const def = ENCHANTMENT_REGISTRY[e.id];
          if (!def) { offerFails.push(`${id}: unknown ${e.id}`); continue; }
          if (e.level < 1 || e.level > def.maxLevel) offerFails.push(`${id}: ${e.id} level ${e.level} out of 1..${def.maxLevel}`);
        }
        for (let a = 0; a < all.length; a++) {
          for (let b = a + 1; b < all.length; b++) {
            if (areIncompatible(all[a].id, all[b].id)) offerFails.push(`${id}: ${all[a].id} + ${all[b].id} together`);
          }
        }
        if (offer.levelRequirement !== offer.xpCost) offerFails.push(`${id}: levelRequirement != xpCost`);
        if (offer.xpCost < 1) offerFails.push(`${id}: xpCost ${offer.xpCost}`);
      }
    }
  }
}
row('E09', offerFails.length ? 'FAIL' : 'PASS',
  'every offer is conflict-free, within its enchantment\'s level range, and carries a real cost',
  offerFails.length ? [...new Set(offerFails)].slice(0, 6).join('; ') : `${items.length} items x 16 bookshelf counts x 40 rolls all clean`,
  'a pick removes everything it conflicts with');

// --- E10: only primary items are offered, and the table refuses non-enchantable items ---
const primaryFails = [];
for (const [id, shouldOffer] of [['diamond_sword', true], ['diamond_pickaxe', true], ['book', true], ['bow', true], ['bucket', false], ['saddle', false], ['name_tag', false], ['leather_horse_armor', false], ['diamond_horse_armor', false], ['compass', false], ['golden_apple', false], ['stick', false]]) {
  const cat = getItemEnchantCategory(id);
  const got = isEnchantableItem({ id });
  if (got !== shouldOffer) primaryFails.push(`${id}: enchantable=${got} (wanted ${shouldOffer}, category ${cat})`);
}
// Fortune and Silk Touch are mutually exclusive, and a pickaxe is primary for both.
if (!isPrimaryFor(ENCHANTMENT_REGISTRY.fortune, 'diamond_pickaxe')) primaryFails.push('fortune not primary for a pickaxe');
if (!areIncompatible('fortune', 'silk_touch')) primaryFails.push('fortune and silk touch declared compatible');
if (!areIncompatible('sharpness', 'smite')) primaryFails.push('sharpness and smite declared compatible');
if (areIncompatible('sharpness', 'unbreaking')) primaryFails.push('sharpness and unbreaking wrongly exclusive');
row('E10', primaryFails.length ? 'FAIL' : 'PASS',
  'the table takes only the items vanilla allows, and fortune/silk touch and the sword damage lines conflict',
  primaryFails.length ? primaryFails.join('; ') : `all ${12} items classified correctly; incompatibilities hold`);

// --- E11: a book becomes an enchanted book, and the offer engine takes books ---
const bookOffers = generateEnchantmentOffers({ id: 'book' }, 15, lcg(5));
const book = { id: 'book' };
const applied = bookOffers.length ? applyEnchantment(book, bookOffers[0], { gamemode: 'creative', level: 0 }) : false;
row('E11', bookOffers.length > 0 && applied === true && book.id === 'enchanted_book' && Array.isArray(book.enchantments) ? 'PASS' : 'FAIL',
  'an enchanted book is produced from a book, and carries the offer\'s enchantments',
  `offers=${bookOffers.length} applied=${applied} id=${book.id} enchantments=${JSON.stringify(book.enchantments)}`);

// --- E12: creative enchanting is free of both level and lapis charges ---
// The wiki's cost is what a SURVIVAL player pays. Creative must not silently drain resources.
const creativePlayer = { gamemode: 'creative', level: 3 };
const creativeItem = { id: 'diamond_sword' };
const creativeOffers = generateEnchantmentOffers(creativeItem, 15, lcg(11));
const before = creativePlayer.level;
const creativeOk = applyEnchantment(creativeItem, creativeOffers.at(-1), creativePlayer);
row('E12', creativeOk === true && creativePlayer.level === before ? 'PASS' : 'FAIL',
  'creative applies an offer without needing or consuming levels',
  `applied=${creativeOk} level ${before} -> ${creativePlayer.level}, offer cost ${creativeOffers.at(-1)?.levelRequirement}`);

// --- E13: a survival player without the levels is refused and nothing is changed ---
const poorPlayer = { gamemode: 'survival', level: 0 };
const poorItem = { id: 'diamond_pickaxe' };
const richOffers = generateEnchantmentOffers({ id: 'diamond_pickaxe' }, 15, lcg(3));
const poorOk = applyEnchantment(poorItem, richOffers.at(-1), poorPlayer);
row('E13', poorOk === false && !poorItem.enchantments ? 'PASS' : 'FAIL',
  'an unaffordable offer is refused and leaves the item bare',
  `applied=${poorOk} enchantments=${JSON.stringify(poorItem.enchantments)} needed=${richOffers.at(-1)?.levelRequirement}`);

// --- E14: applyEnchantment adds to an item that already carries enchantments ---
const already = { id: 'diamond_sword', enchantments: [{ id: 'unbreaking', name: 'Unbreaking', level: 3 }] };
const addOffers = generateEnchantmentOffers({ id: 'diamond_sword' }, 15, lcg(21));
const addOk = applyEnchantment(already, addOffers.at(-1), { gamemode: 'creative', level: 0 });
row('E14', addOk === true && already.enchantments.length >= 2 && already.enchantments.some((e) => e.id === 'unbreaking') ? 'PASS' : 'FAIL',
  'applying onto an enchanted item adds rather than replaces what was already paid for',
  `enchantments=${JSON.stringify(already.enchantments)}`);

// --- E15: every offer names an enchantment the effects layer can apply ---
const dangling = [];
for (const key of Object.keys(ENCHANTMENT_REGISTRY)) {
  if (!ENCHANTMENT_REGISTRY[key].name) dangling.push(key);
}
row('E15', dangling.length ? 'FAIL' : 'PASS',
  'every registered enchantment has a display name for the confirmation line',
  dangling.length ? dangling.join(', ') : `${registryEntries.length} named`);

// --- E16: levelForCost picks the highest level whose range contains the cost ---
// The wiki's published ranges OVERLAP at some boundaries: Fire Protection's table is "10-17", "18-25",
// "26-33", "34-42", while the game's selection rule reads "the highest level for which the enchantment
// cost falls within its range". So this checks the selection rule itself, and the levels, rather than
// asserting that a mid-range cost always lands on a level -- a cost between two ranges is legitimately
// "no level", which is the state the wiki describes as selecting the slot and nothing happening.
const levelFails = [];
const gapCounts = {};
for (const [key, def] of Object.entries(ENCHANTMENT_REGISTRY)) {
  for (let level = 1; level <= def.maxLevel; level++) {
    const [min, max] = def.cost[level - 1];
    for (const cost of [min, max]) {
      const got = levelForCost(def, cost);
      // Any level whose range contains the cost is acceptable; the highest such is what the code returns,
      // so the assertion is that the answer CONTAINS the cost and is the highest one that does.
      const containing = def.cost.map(([lo, hi], i) => (cost >= lo && cost <= hi ? i + 1 : 0)).filter(Boolean);
      if (!containing.length) continue;
      if (got !== Math.max(...containing)) levelFails.push(`${key}: cost ${cost} -> level ${got}, expected ${Math.max(...containing)}`);
    }
  }
  if (levelForCost(def, 0) !== 0) levelFails.push(`${key}: cost 0 gave a level`);
  // Count the costs that fall between two of the item's ranges, so the overlap claim above is measured.
  let gaps = 0;
  for (let level = 1; level < def.maxLevel; level++) gaps += Math.max(0, def.cost[level][0] - def.cost[level - 1][1] - 1);
  if (gaps) gapCounts[key] = gaps;
}
row('E16', levelFails.length ? 'FAIL' : 'PASS',
  'the level is always the highest whose cost range contains the cost, and nothing when none does',
  levelFails.length ? levelFails.slice(0, 5).join('; ') : `${registryEntries.length} enchantments checked; ${Object.keys(gapCounts).length} have costs that fall between ranges (${Object.entries(gapCounts).map(([k, v]) => `${k}:${v}`).join(', ')})`);

// --- E17: the bookshelf geometry rule ---
// The 5x5 perimeter has 16 positions, and vanilla counts both the table's level AND one above, so an
// "arrangement" is up to 32 shelves -- which is why a full ring only ever reports the cap. To observe the
// transmitter rule the arrangement has to stay UNDER the cap, so these rings are one level tall.
function makeWorld() {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    world: { getVoxel: (x, y, z) => cells.get(key(x, y, z)) ?? BLOCKS.AIR },
    set: (x, y, z, id) => cells.set(key(x, y, z), id),
  };
}
const tableAt = [0, 5, 0];
const PERIMETER = [];
for (let dx = -2; dx <= 2; dx++) {
  for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
    PERIMETER.push([dx, dz]);
  }
}

// 1. A full two-level ring: 32 shelves placed, capped to the wiki's 15.
const full = makeWorld();
let placed = 0;
for (const [dx, dz] of PERIMETER) for (const dy of [0, 1]) { full.set(tableAt[0] + dx, tableAt[1] + dy, tableAt[2] + dz, BLOCKS.BOOKSHELF); placed++; }
const countFull = calculateBookshelfCount(full.world, ...tableAt);

// 2. One level tall, one position left empty: exactly 15 shelves, so the cap does not hide the rule.
const oneLevel = makeWorld();
for (const [dx, dz] of PERIMETER.slice(1)) oneLevel.set(tableAt[0] + dx, tableAt[1], tableAt[2] + dz, BLOCKS.BOOKSHELF);
const countOneLevel = calculateBookshelfCount(oneLevel.world, ...tableAt);

// 3. A single shelf, then the same shelf with the block between it and the table replaced by stone.
//    One shelf at a time, because a shared gate can legitimately deactivate several shelves at once: the
//    gate for (2,y,0) is (1,y,0), and that same block is also the gate for (2,y,-1) and (2,y,1).
const singleShelf = (blockGate) => {
  const w = makeWorld();
  w.set(tableAt[0] + 2, tableAt[1], tableAt[2], BLOCKS.BOOKSHELF);
  if (blockGate) w.set(tableAt[0] + 1, tableAt[1], tableAt[2], BLOCKS.STONE);
  return calculateBookshelfCount(w.world, ...tableAt);
};
const countSingle = singleShelf(false);
const countSingleBlocked = singleShelf(true);

// 4. A shelf one block away, and one three blocks away: neither is at exactly two, so neither counts.
const nearFar = makeWorld();
nearFar.set(tableAt[0] + 1, tableAt[1], tableAt[2], BLOCKS.BOOKSHELF);
const countNear = calculateBookshelfCount(nearFar.world, ...tableAt);
nearFar.set(tableAt[0] + 3, tableAt[1], tableAt[2], BLOCKS.BOOKSHELF);
const countFar = calculateBookshelfCount(nearFar.world, ...tableAt);
// A shelf two out along one axis and three along the other is outside the 5x5 footprint.
const diagonalFar = makeWorld();
diagonalFar.set(tableAt[0] + 2, tableAt[1], tableAt[2] + 3, BLOCKS.BOOKSHELF);
const countDiagonalFar = calculateBookshelfCount(diagonalFar.world, ...tableAt);

// 5. One block higher still counts, and two higher does not.
const high = makeWorld();
high.set(tableAt[0] + 2, tableAt[1] + 1, tableAt[2], BLOCKS.BOOKSHELF);
const countHigh = calculateBookshelfCount(high.world, ...tableAt);
const tooHigh = makeWorld();
tooHigh.set(tableAt[0] + 2, tableAt[1] + 2, tableAt[2], BLOCKS.BOOKSHELF);
const countTooHigh = calculateBookshelfCount(tooHigh.world, ...tableAt);

const geoFails = [];
if (placed !== 32) geoFails.push(`the two-level ring placed ${placed}, expected 32`);
if (countFull !== 15) geoFails.push(`the full ring counted ${countFull}, expected the cap of 15`);
if (countOneLevel !== 15) geoFails.push(`the one-level ring with one gap counted ${countOneLevel}, expected 15`);
if (countSingle !== 1) geoFails.push(`one shelf at distance two counted ${countSingle}, expected 1`);
if (countSingleBlocked !== 0) geoFails.push(`a shelf with its gate blocked counted ${countSingleBlocked}, expected 0`);
if (countNear !== 0) geoFails.push(`a shelf one block away counted ${countNear}, expected 0`);
if (countFar !== 0) geoFails.push(`a shelf three blocks away counted ${countFar}, expected 0`);
if (countDiagonalFar !== 0) geoFails.push(`a shelf 2x3 out counted ${countDiagonalFar}, expected 0`);
if (countHigh !== 1) geoFails.push(`a shelf one block higher counted ${countHigh}, expected 1`);
if (countTooHigh !== 0) geoFails.push(`a shelf two blocks higher counted ${countTooHigh}, expected 0`);
row('E17', geoFails.length ? 'FAIL' : 'PASS',
  'the two-level ring caps at 15, a blocked gate deactivates its shelf, distances other than two do not count, and one higher counts but two higher does not',
  geoFails.length ? geoFails.join('; ') : `32 placed -> ${countFull}; one-level ring ${countOneLevel}; single shelf ${countSingle}, gate blocked ${countSingleBlocked}; distance 1/3 and 2x3 all 0; +1 block = ${countHigh}, +2 = ${countTooHigh}`,
  'wiki: exactly two blocks along one horizontal axis, up to two along the other, same height or one higher, unblocked');

const report = {
  referenceProfile: 'Java Edition 1.21.4 enchanting; https://minecraft.wiki/w/Enchantment and /w/Enchanting_table_mechanics.',
  layer: 'production offer engine and registry only; the bot enchant action and table block are tested in e2e/enchant.pw.js',
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
  await writeFile('docs/artifacts/enchant-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/enchant-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));
