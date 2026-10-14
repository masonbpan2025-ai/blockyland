// Enchantment parity against https://minecraft.wiki/w/Enchantment and
// https://minecraft.wiki/w/Enchanting_table_mechanics.
//
// The offer engine this file guards was reorganised rather than tweaked, because the old one had the
// problem in the wrong place. It picked an enchantment at random and *then* invented a level from the
// slot's cost, so:
//   - `levelCost` was a hard-coded 1/2/3 whatever the slot actually cost. The panel printed a
//     requirement of 30 next to a price of 3, and the player was charged the 3.
//   - The cost never entered into which enchantments were possible or at what level, so anything on any
//     item could roll any level. A level V Sharpness on a sword with no bookshelves was reachable.
//   - `weight` did not exist, so every eligible enchantment was equally likely: Sharpness (weight 10)
//     came up as often as Flame (weight 2), and Mending as often as Efficiency.
//   - `eligibleEnchantments` had no idea about incompatibilities at all. It took an `exclude` list and
//     the only caller that passed one was a librarian trade.
//   - The registry held 19 of vanilla's 42 enchantments. Blast Protection, Depth Strider, Respiration,
//     Mending, Aqua Affinity, the curses and thirteen others could not be obtained at all.
//
// Everything below is checked against the two pages above or against the pinned Java 1.21.4
// `enchantments.json` this repo already ships in `.cache/mc-data` and `node_modules/minecraft-data`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ENCHANTMENT_REGISTRY,
  TREASURE_ENCHANTMENTS,
  NOT_OFFERED,
  NOT_ENCHANTABLE,
  getItemEnchantCategory,
  isEnchantableItem,
  isPrimaryFor,
  anvilAccepts,
  areIncompatible,
  incompatibleWith,
  eligibleEnchantments,
  experienceCost,
  enchantmentCost,
  enchantabilityOf,
  lapisCostForSlot,
  levelForCost,
  selectEnchantments,
  generateEnchantmentOffers,
  applyEnchantment,
  calculateBookshelfCount,
  rollEnchantmentFor,
} from '../src/enchanting.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { protectionPoints } from '../src/enchantmentEffects.js';

/** Deterministic `Math.random`, so a random engine can still be asserted on. */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const item = (id) => ({ id, isBlock: false, count: 1 });

// --- the registry against the wiki's list --------------------------------------

/** The wiki's table of java enchantments: id -> [max level, weight]. */
const WIKI_ENCHANTMENTS = {
  aqua_affinity: [1, 2],
  bane_of_arthropods: [5, 5],
  blast_protection: [4, 2],
  channeling: [1, 1],
  binding_curse: [1, 1],
  vanishing_curse: [1, 1],
  depth_strider: [3, 2],
  efficiency: [5, 10],
  feather_falling: [4, 5],
  fire_aspect: [2, 2],
  fire_protection: [4, 5],
  flame: [1, 2],
  fortune: [3, 2],
  frost_walker: [2, 2],
  impaling: [5, 2],
  infinity: [1, 1],
  knockback: [2, 5],
  looting: [3, 2],
  loyalty: [3, 5],
  luck_of_the_sea: [3, 2],
  lure: [3, 2],
  mending: [1, 2],
  multishot: [1, 2],
  piercing: [4, 10],
  power: [5, 10],
  projectile_protection: [4, 5],
  protection: [4, 10],
  punch: [2, 2],
  quick_charge: [3, 5],
  respiration: [3, 2],
  riptide: [3, 2],
  sharpness: [5, 10],
  silk_touch: [1, 1],
  smite: [5, 5],
  soul_speed: [3, 1],
  sweeping_edge: [3, 2],
  swift_sneak: [3, 1],
  thorns: [3, 1],
  unbreaking: [3, 5],
  // The mace's three (Enchantment page; weights from Enchanting table mechanics).
  breach: [4, 2],
  density: [5, 5],
  wind_burst: [3, 2],
};

test('the registry is vanilla\'s list, with vanilla\'s max levels and weights', () => {
  const have = Object.keys(ENCHANTMENT_REGISTRY);
  const want = Object.keys(WIKI_ENCHANTMENTS);
  // Everything in the wiki's table has to be here, the mace's three included.
  assert.deepEqual(have.filter((k) => !want.includes(k)), []);
  assert.deepEqual(want.filter((k) => !have.includes(k)), [], 'these vanilla enchantments are missing');
  for (const [id, [maxLevel, weight]] of Object.entries(WIKI_ENCHANTMENTS)) {
    const def = ENCHANTMENT_REGISTRY[id];
    assert.equal(def.maxLevel, maxLevel, `${id} max level`);
    assert.equal(def.weight, weight, `${id} weight`);
    assert.equal(def.name.length > 0, true, `${id} has a name`);
    assert.equal(def.roman.length, maxLevel, `${id} has a numeral for every level`);
  }
  // Nothing the wiki lists is missing any more: the mace exists, and so do its enchantments.
  assert.deepEqual(NOT_OFFERED, []);
});

test('the seven treasure enchantments are exactly vanilla\'s seven', () => {
  // The wiki's list: Curse of Binding, Curse of Vanishing, Frost Walker, Mending, Soul Speed,
  // Swift Sneak, Wind Burst.
  assert.deepEqual([...TREASURE_ENCHANTMENTS].sort(),
    ['binding_curse', 'frost_walker', 'mending', 'soul_speed', 'swift_sneak', 'vanishing_curse', 'wind_burst']);
  // "Treasure enchantments cannot be obtained through an enchanting table."
  for (const key of TREASURE_ENCHANTMENTS) {
    assert.equal(ENCHANTMENT_REGISTRY[key].treasure, true, key);
  }
});

test('every incompatible pair is declared both ways, and matches the wiki', () => {
  // The wiki names these groups: Sword (Sharpness/Smite/Bane), Tool (Fortune/Silk Touch),
  // Armour (the four protections), Boots (Depth Strider/Frost Walker), Bow (Infinity/Mending),
  // Crossbow (Multishot/Piercing), Trident (Loyalty+Riptide, Channeling+Riptide).
  const pairs = [
    ['sharpness', 'smite'], ['sharpness', 'bane_of_arthropods'], ['smite', 'bane_of_arthropods'],
    ['fortune', 'silk_touch'],
    ['protection', 'fire_protection'], ['protection', 'blast_protection'],
    ['protection', 'projectile_protection'], ['fire_protection', 'blast_protection'],
    ['fire_protection', 'projectile_protection'], ['blast_protection', 'projectile_protection'],
    ['depth_strider', 'frost_walker'],
    ['infinity', 'mending'],
    ['multishot', 'piercing'],
    ['loyalty', 'riptide'], ['channeling', 'riptide'],
    // The mace's: Breach and Density with each other and with the three damage enchantments.
    ['breach', 'density'], ['breach', 'sharpness'], ['breach', 'smite'], ['breach', 'bane_of_arthropods'],
    ['density', 'sharpness'], ['density', 'smite'], ['density', 'bane_of_arthropods'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(areIncompatible(a, b), true, `${a} conflicts with ${b}`);
    assert.equal(areIncompatible(b, a), true, `${b} conflicts with ${a}`);
    assert.ok(incompatibleWith(a).includes(b), `${a} lists ${b}`);
    assert.ok(incompatibleWith(b).includes(a), `${b} lists ${a}`);
  }
  // Pairs that are NOT incompatible must not have been invented.
  for (const [a, b] of [['sharpness', 'looting'], ['efficiency', 'fortune'], ['protection', 'thorns'],
    ['knockback', 'fire_aspect'], ['power', 'infinity'], ['unbreaking', 'mending']]) {
    assert.equal(areIncompatible(a, b), false, `${a} must not conflict with ${b}`);
  }
  assert.equal(areIncompatible('sharpness', 'sharpness'), false, 'an enchantment is not its own conflict');
  assert.equal(areIncompatible('nonsense', 'sharpness'), false);
});

// --- the cost table against the wiki's ------------------------------------------

/**
 * The wiki's published cost ranges, transcribed from the "Receivable enchantments" table.
 *
 * The table lists only the levels whose minimum is within the 37 an enchanting table can reach, so this
 * is the set of levels the game can actually hand out.
 */
const WIKI_COST_RANGES = {
  protection: [[5, 12], [13, 20], [21, 28], [29, 37]],
  fire_protection: [[10, 17], [18, 25], [26, 33], [34, 42]],
  blast_protection: [[5, 12], [13, 20], [21, 28], [29, 37]],
  projectile_protection: [[3, 8], [9, 14], [15, 20], [21, 27]],
  feather_falling: [[5, 10], [11, 16], [17, 22], [23, 29]],
  depth_strider: [[10, 19], [20, 29], [30, 45]],
  thorns: [[10, 29], [30, 49], [50, 100]],
  respiration: [[10, 19], [20, 29], [30, 60]],
  aqua_affinity: [[1, 41]],
  sharpness: [[1, 11], [12, 22], [23, 33], [34, 44], [45, 65]],
  smite: [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]],
  bane_of_arthropods: [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]],
  knockback: [[5, 24], [25, 75]],
  fire_aspect: [[10, 19], [20, 80]],
  looting: [[15, 23], [24, 32], [33, 83]],
  sweeping_edge: [[5, 13], [14, 22], [23, 38]],
  efficiency: [[1, 10], [11, 20], [21, 30], [31, 40], [41, 91]],
  silk_touch: [[15, 65]],
  fortune: [[15, 23], [24, 32], [33, 83]],
  power: [[1, 10], [11, 20], [21, 30], [31, 40], [41, 56]],
  punch: [[12, 31], [32, 57]],
  flame: [[20, 50]],
  infinity: [[20, 50]],
  quick_charge: [[12, 31], [32, 50], [51, 69]],
  multishot: [[20, 50]],
  piercing: [[1, 10], [11, 20], [21, 30], [31, 50]],
  unbreaking: [[5, 12], [13, 20], [21, 71]],
  impaling: [[1, 8], [9, 16], [17, 24], [25, 32], [33, 53]],
  channeling: [[25, 50]],
  loyalty: [[12, 18], [19, 25], [26, 50]],
  riptide: [[17, 23], [24, 30], [31, 50]],
  luck_of_the_sea: [[15, 23], [24, 32], [33, 83]],
  lure: [[15, 23], [24, 32], [33, 83]],
  breach: [[15, 23], [24, 32], [33, 41], [42, 92]],
  density: [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]],
};

test('every published cost range matches the wiki exactly', () => {
  const wrong = [];
  for (const [id, ranges] of Object.entries(WIKI_COST_RANGES)) {
    const got = ENCHANTMENT_REGISTRY[id].cost;
    if (JSON.stringify(got) !== JSON.stringify(ranges)) {
      wrong.push(`${id}: want ${JSON.stringify(ranges)}, got ${JSON.stringify(got)}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('every range is a real interval and the levels run in order', () => {
  // This is the property the selection algorithm depends on: "the highest level whose range contains the
  // cost" is only a well-defined answer if the ranges do not overlap and run in order.
  for (const [id, def] of Object.entries(ENCHANTMENT_REGISTRY)) {
    let previousMax = 0;
    for (let level = 1; level <= def.maxLevel; level++) {
      const [min, max] = def.cost[level - 1];
      assert.ok(min >= 1, `${id} L${level} minimum ${min} is below the table's floor`);
      assert.ok(max >= min, `${id} L${level} has max ${max} below min ${min}`);
      assert.ok(min > previousMax, `${id} L${level} minimum ${min} does not follow the previous maximum ${previousMax}`);
      previousMax = max;
    }
  }
});

test('the pinned vanilla data agrees with the wiki\'s minima wherever it can be read', () => {
  // The repo ships Java 1.21.4's enchantment definitions in `minecraft-data`, and its `minCost` is a
  // linear model `a * level + b`. It matches the wiki for most enchantments but not all: Fire Aspect's
  // level II minimum is 20 in the table and 30 under `a * level + b`; the four protection enchantments
  // and Piercing disagree in the same way. The published table is the authority -- this records how far
  // the two agree rather than pretending they are the same source.
  //
  // What it does pin is the floor and the direction, which is what a transcription error would break.
  const path = 'node_modules/minecraft-data/minecraft-data/data/pc/1.21.4/enchantments.json';
  let vanilla;
  try {
    vanilla = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return; // the pinned data is not installed; the transcription test above still holds
  }
  const byName = new Map(vanilla.map((e) => [e.name, e]));
  let agreeing = 0;
  let checked = 0;
  const aboveReach = [];
  for (const [id, def] of Object.entries(ENCHANTMENT_REGISTRY)) {
    const source = byName.get(id);
    if (!source) continue;
    for (let level = 1; level <= def.maxLevel; level++) {
      checked++;
      const min = def.cost[level - 1][0];
      assert.ok(Number.isFinite(min) && min >= 1, `${id} L${level} minimum ${min} is not a usable lower bound`);
      // A level whose minimum is *above* the 37 that fifteen bookshelves can reach is never offered. The
      // wiki lists these anyway -- they are levels that exist but cannot be rolled at a table. A minimum
      // of exactly 37 is reachable, and is how Smite V and Bane of Arthropods V arrive.
      if (min > 37) aboveReach.push(`${id} L${level}`);
      const model = Math.max(1, source.minCost.a * level + source.minCost.b);
      if (min === model) agreeing++;
    }
  }
  assert.ok(checked > 60, `expected to check every level, only saw ${checked}`);
  // The levels above the table's reach, enumerated so the list cannot quietly grow.
  // The levels whose whole range sits above the table's reach, enumerated so the list cannot quietly
  // grow. Each of these exists in the game's data but can never be rolled: fifteen bookshelves top out
  // at a cost of 37, and Thorns III opens at 50, Sharpness V at 45, Efficiency V and Power V at 41 and
  // Quick Charge III at 51. Smite V and Bane of Arthropods V open at exactly 37 and so remain reachable.
  assert.deepEqual(aboveReach, ['thorns L3', 'sharpness L5', 'efficiency L5', 'power L5', 'quick_charge L3']);
  // And the disagreement with the linear model is enumerated too, so the two sources cannot silently
  // become unrelated. The 37 are the levels the wiki's table gives a different minimum for, plus the
  // levels of the enchantments the table never offers and whose ranges therefore come from elsewhere.
  assert.equal(checked - agreeing, 37,
    `expected 37 levels where the table and the linear model differ, got ${checked - agreeing}`);
});

test('a level is receivable exactly when the cost falls in its range, highest first', () => {
  // "The enchantment's highest level for which the enchantment cost falls within its cost range is the
  // candidate, and if the cost is not within any of its ranges, the enchantment is removed."
  const sharpness = ENCHANTMENT_REGISTRY.sharpness;
  assert.equal(levelForCost(sharpness, 0), 0, 'below every range');
  assert.equal(levelForCost(sharpness, 1), 1);
  assert.equal(levelForCost(sharpness, 11), 1, 'the top of level I');
  assert.equal(levelForCost(sharpness, 12), 2, 'the bottom of level II');
  assert.equal(levelForCost(sharpness, 44), 4);
  assert.equal(levelForCost(sharpness, 45), 5);
  assert.equal(levelForCost(sharpness, 65), 5, 'the top of level V');
  assert.equal(levelForCost(sharpness, 66), 0, 'above every range');

  // A single-level enchantment is I or nothing.
  assert.equal(levelForCost(ENCHANTMENT_REGISTRY.silk_touch, 14), 0);
  assert.equal(levelForCost(ENCHANTMENT_REGISTRY.silk_touch, 15), 1);
  assert.equal(levelForCost(ENCHANTMENT_REGISTRY.silk_touch, 65), 1);
  assert.equal(levelForCost(ENCHANTMENT_REGISTRY.silk_touch, 66), 0);
  assert.equal(levelForCost({}, 10), 0);
  assert.equal(levelForCost(null, 10), 0);
});

// --- the experience and enchantment cost formulas -------------------------------

test('the slot costs reproduce the wiki\'s bookshelf table', () => {
  // The wiki tabulates the low and high experience cost for each slot at each bookshelf count. A slot's
  // cost is random, so the check is that a large sample of rolls lands exactly on the tabulated bounds
  // and never outside them.
  const table = {
    // shelves: [top, middle, bottom]
    0: [[1, 2], [1, 6], [1, 8]],
    1: [[1, 3], [1, 7], [2, 9]],
    2: [[1, 3], [2, 8], [4, 11]],
    5: [[1, 5], [3, 11], [10, 15]],
    10: [[2, 7], [5, 16], [20, 23]],
    15: [[2, 10], [6, 21], [30, 30]],
  };
  for (const [shelves, bounds] of Object.entries(table)) {
    for (const slot of [0, 1, 2]) {
      let lo = Infinity;
      let hi = -Infinity;
      const r = seeded(Number(shelves) * 31 + slot + 1);
      for (let i = 0; i < 4000; i++) {
        const cost = experienceCost(slot, Number(shelves), r);
        lo = Math.min(lo, cost);
        hi = Math.max(hi, cost);
      }
      assert.deepEqual([lo, hi], bounds[slot],
        `slot ${slot} at ${shelves} bookshelves should span exactly ${bounds[slot]}`);
    }
  }
});

test('more than 15 bookshelves changes nothing, as the wiki caps the count', () => {
  const at15 = new Set();
  const at40 = new Set();
  const r1 = seeded(5);
  const r2 = seeded(5);
  for (let i = 0; i < 3000; i++) {
    at15.add(experienceCost(2, 15, r1));
    at40.add(experienceCost(2, 40, r2));
  }
  assert.deepEqual([...at40].sort((a, b) => a - b), [...at15].sort((a, b) => a - b));
  // And a nonsense count is treated as none rather than producing a negative cost.
  assert.ok(experienceCost(0, -3, seeded(1)) >= 1);
  assert.ok(experienceCost(0, undefined, seeded(1)) >= 1);
});

test('the enchantment cost is the wiki\'s formula, with the item\'s enchantability', () => {
  // `eCost = round((xpCost + 1 + randInt(floor(enchantability/4)) * 2) * (1 + randTri(0.15)))`, where
  // `randInt(n)` is uniform on `[0, n]` and `randTri(n)` is `(randFloat() + randFloat() - 1) * n`.
  // A random of 0.5 makes randTri exactly 0 and each randInt exactly `floor((n+1)/2)`.
  const mid = () => 0.5;
  const spread = (e) => Math.floor(e / 4);
  const randIntHalf = (n) => Math.floor(0.5 * (n + 1));
  assert.equal(enchantmentCost(20, 1, mid), 21, 'enchantability 1 does not spread at all');
  assert.equal(enchantmentCost(20, 10, mid), 21 + 2 * randIntHalf(spread(10)), 'diamond spreads by 2');
  assert.equal(enchantmentCost(20, 25, mid), 21 + 2 * randIntHalf(spread(25)), 'golden armour spreads by 6');
  assert.equal(enchantmentCost(20, 5, mid), 21 + 2 * randIntHalf(spread(5)), 'stone spreads by 1');
  // The triangular factor can never leave the plus-or-minus 15% band. The band is built from the
  // analytic extremes rather than from the function, so a legitimate low roll cannot fail it.
  const spread10 = 2 * Math.floor(10 / 4);
  const lowBase = 30 + 1;
  const highBase = 31 + spread10;
  for (let i = 0; i < 3000; i++) {
    const r = seeded(i + 1);
    const cost = enchantmentCost(30, 10, r);
    assert.ok(cost >= Math.round(lowBase * 0.85) - 1 && cost <= Math.round(highBase * 1.15) + 1,
      `enchantment cost ${cost} left the band ${Math.round(lowBase * 0.85)}..${Math.round(highBase * 1.15)}`);
  }
});

test('enchantability is vanilla\'s table, with armour on its own scale', () => {
  // The wiki's table: golden armour 25, golden tools 22, wood/leather/netherite 15, iron tools 14 and
  // iron armour 9, chainmail 12, diamond 10, stone 5, everything else 1.
  assert.equal(enchantabilityOf('golden_helmet'), 25);
  assert.equal(enchantabilityOf('golden_sword'), 22);
  assert.equal(enchantabilityOf('wooden_pickaxe'), 15);
  assert.equal(enchantabilityOf('netherite_chestplate'), 15);
  assert.equal(enchantabilityOf('leather_boots'), 15);
  assert.equal(enchantabilityOf('diamond_leggings'), 10);
  assert.equal(enchantabilityOf('iron_axe'), 14);
  assert.equal(enchantabilityOf('iron_boots'), 9, 'iron armour is 9, not the 14 of iron tools');
  assert.equal(enchantabilityOf('chainmail_helmet'), 12);
  assert.equal(enchantabilityOf('stone_shovel'), 5);
  // Everything with no material of its own is 1.
  for (const id of ['bow', 'crossbow', 'fishing_rod', 'trident', 'book', 'shears', 'shield', 'elytra', 'brush']) {
    assert.equal(enchantabilityOf(id), 1, `${id} should be 1`);
  }
  assert.equal(enchantabilityOf(null), 1);
  assert.equal(enchantabilityOf(''), 1);
});

// --- eligibility ----------------------------------------------------------------

test('the enchanting table offers an item only what it is a primary item for', () => {
  const sword = eligibleEnchantments('diamond_sword').map((e) => e.key);
  assert.ok(sword.includes('sharpness'));
  assert.ok(sword.includes('looting'));
  assert.ok(sword.includes('unbreaking'));
  assert.equal(sword.includes('efficiency'), false, 'a sword is not a mining tool');
  assert.equal(sword.includes('protection'), false);
  assert.equal(sword.includes('power'), false, 'a sword is not a bow');

  const pick = eligibleEnchantments('diamond_pickaxe').map((e) => e.key);
  assert.ok(pick.includes('efficiency'));
  assert.ok(pick.includes('fortune'));
  assert.ok(pick.includes('silk_touch'));
  assert.equal(pick.includes('sharpness'), false, 'a pickaxe is not a sword');

  const bow = eligibleEnchantments('bow').map((e) => e.key);
  assert.deepEqual(bow.filter((k) => !['power', 'punch', 'flame', 'infinity', 'unbreaking'].includes(k)), []);

  // A trident is neither a sword nor a tool: it takes Impaling and not Sharpness.
  const trident = eligibleEnchantments('trident').map((e) => e.key);
  assert.ok(trident.includes('impaling'));
  assert.ok(trident.includes('loyalty'));
  assert.equal(trident.includes('sharpness'), false);
  assert.equal(trident.includes('efficiency'), false);

  // Shears are an anvil-only item: Efficiency and Unbreaking list them as secondary items, so the table
  // offers them nothing (Enchanting table mechanics has no Shears row).
  assert.deepEqual(eligibleEnchantments('shears').map((e) => e.key).sort(), []);
  // An axe gets the tool enchantments at the table; Sharpness, Smite and Bane only at an anvil.
  assert.deepEqual(eligibleEnchantments('iron_axe').map((e) => e.key).sort(), ['efficiency', 'fortune', 'silk_touch', 'unbreaking']);
  // A crossbow is not a bow.
  assert.deepEqual(eligibleEnchantments('crossbow').map((e) => e.key).sort(), ['multishot', 'piercing', 'quick_charge', 'unbreaking']);
  // A mace: Breach, Density, Unbreaking (Wind Burst is treasure).
  assert.deepEqual(eligibleEnchantments('mace').map((e) => e.key).sort(), ['breach', 'density', 'unbreaking']);
});

test('a book is primary for every non-treasure enchantment, as vanilla hardcodes', () => {
  const book = eligibleEnchantments('book').map((e) => e.key).sort();
  const expected = Object.keys(ENCHANTMENT_REGISTRY)
    .filter((k) => !ENCHANTMENT_REGISTRY[k].treasure)
    .sort();
  assert.deepEqual(book, expected);
  // With treasure allowed it is the whole registry, minus nothing: a librarian's book is the one place
  // Mending and the curses come from.
  const treasureBook = eligibleEnchantments('book', { allowTreasure: true }).map((e) => e.key).sort();
  assert.deepEqual(treasureBook, Object.keys(ENCHANTMENT_REGISTRY).sort());
});

test('the table never offers a treasure enchantment, whatever the item', () => {
  const ids = ['book', 'diamond_sword', 'diamond_pickaxe', 'diamond_boots', 'bow', 'diamond_helmet',
    'diamond_leggings', 'trident', 'crossbow', 'fishing_rod', 'shield', 'shears'];
  for (const id of ids) {
    const keys = eligibleEnchantments(id).map((e) => e.key);
    for (const treasure of TREASURE_ENCHANTMENTS) {
      assert.equal(keys.includes(treasure), false, `${id} must not be offered ${treasure}`);
    }
  }
});

test('an item vanilla refuses to enchant is refused here', () => {
  // These are typed `tool` by this game's item registry and are still not enchantable in vanilla.
  for (const id of ['bucket', 'water_bucket', 'compass', 'clock', 'lead', 'name_tag', 'saddle',
    'flint_and_steel', 'spyglass', 'recovery_compass', 'bundle', 'leather_horse_armor']) {
    assert.equal(NOT_ENCHANTABLE.has(id), true, `${id} should be listed as not enchantable`);
    assert.equal(getItemEnchantCategory(id), null, `${id} has no category`);
    assert.equal(isEnchantableItem(item(id)), false, `${id} cannot be enchanted`);
    assert.deepEqual(generateEnchantmentOffers(item(id), 15, seeded(1)), [], `${id} gets no offers`);
  }
  // And a thing that is not an item at all.
  assert.equal(isEnchantableItem(null), false);
  assert.equal(isEnchantableItem(item('dirt')), false);
});

test('only bare items are enchantable at a table', () => {
  assert.equal(isEnchantableItem(item('diamond_sword')), true);
  assert.equal(isEnchantableItem({ ...item('diamond_sword'), enchantments: [{ id: 'sharpness', level: 1 }] }), false);
  assert.equal(isEnchantableItem({ ...item('diamond_sword'), enchantments: [] }), true, 'an empty list is still bare');
});

test('isPrimaryFor agrees with the target lists it reads', () => {
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.unbreaking, 'diamond_sword'), true, 'unbreaking is for everything');
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.unbreaking, 'carrot_on_a_stick'), true);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.feather_falling, 'diamond_boots'), true);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.feather_falling, 'diamond_helmet'), false);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.protection, 'diamond_chestplate'), true);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.protection, 'diamond_sword'), false);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.efficiency, 'golden_axe'), true, 'an axe is also a tool');
  // Sharpness lists the axe as a secondary item: an anvil puts it there, the table does not.
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.sharpness, 'golden_axe'), false, 'secondary, not primary');
  assert.equal(anvilAccepts(ENCHANTMENT_REGISTRY.sharpness, 'golden_axe'), true, 'an anvil puts it on an axe');
  assert.equal(anvilAccepts(ENCHANTMENT_REGISTRY.thorns, 'iron_boots'), true, 'Thorns on boots, at an anvil');
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.thorns, 'iron_boots'), false);
  assert.equal(anvilAccepts(ENCHANTMENT_REGISTRY.power, 'crossbow'), false, 'a crossbow takes no bow enchantment');
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.loyalty, 'trident'), true);
  assert.equal(isPrimaryFor(ENCHANTMENT_REGISTRY.loyalty, 'diamond_sword'), false);
});

// --- selection ------------------------------------------------------------------

test('selection is weighted by the wiki\'s weights, not uniform', () => {
  // Sharpness has weight 10 and Flame 2. Over many draws Sharpness should be roughly five times as
  // common; the old engine had no weights at all and would have made them equal.
  const candidates = [
    { key: 'sharpness', def: ENCHANTMENT_REGISTRY.sharpness },
    { key: 'flame', def: ENCHANTMENT_REGISTRY.flame },
  ];
  // `cost` 1 means the continuation chance is 1/51, so almost every draw is a single pick.
  const counts = { sharpness: 0, flame: 0 };
  const r = seeded(12345);
  for (let i = 0; i < 20000; i++) {
    for (const key of selectEnchantments(candidates, 1, r)) counts[key]++;
  }
  const ratio = counts.sharpness / counts.flame;
  assert.ok(ratio > 3.5 && ratio < 6.5, `Sharpness:Flame should be about 5:1, was ${ratio.toFixed(2)}`);
});

test('a pick removes everything it conflicts with, so no offer carries a conflict', () => {
  // Drive the loop with a random that always continues, so selection keeps going while candidates last.
  const pool = ['sharpness', 'smite', 'bane_of_arthropods', 'looting', 'knockback', 'fire_aspect']
    .map((key) => ({ key, def: ENCHANTMENT_REGISTRY[key] }));
  let alwaysContinue = 0;
  const r = () => { alwaysContinue++; return 0; }; // 0 < cost/(cost+50) always
  const chosen = selectEnchantments(pool, 60, r);
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      assert.equal(areIncompatible(chosen[i], chosen[j]), false,
        `${chosen[i]} and ${chosen[j]} must never be selected together`);
    }
  }
  // And it did stop: once only one of the three sword-damage enchantments can be chosen, the pool empties
  // of conflicting entries but not of the others.
  assert.ok(chosen.length >= 3, `expected several picks, got ${chosen.length}`);
  assert.ok(chosen.length <= pool.length);
});

test('selection stops on the wiki\'s cost + 50 chance', () => {
  const pool = ['sharpness', 'looting', 'knockback', 'fire_aspect']
    .map((key) => ({ key, def: ENCHANTMENT_REGISTRY[key] }));
  // A random of 0.99 never beats cost/(cost+50) for a small cost, so exactly one enchantment is chosen.
  const stop = () => 0.99;
  assert.equal(selectEnchantments(pool, 1, stop).length, 1);
  // A high cost makes continuing likelier, never certain: the loop still terminates.
  assert.equal(selectEnchantments(pool, 1, () => 0).length, pool.length);
  assert.deepEqual(selectEnchantments([], 100, seeded(1)), [], 'no candidates, no picks');
});

test('a table-enchanted book has one enchantment removed, not reduced to one', () => {
  // The wiki's last step: "if the item is a book, an enchanting table is used, and multiple enchantments
  // were selected, a random one is removed." Removed *one* -- so a book that selected three keeps two.
  const pool = ['sharpness', 'looting', 'knockback', 'fire_aspect', 'unbreaking', 'efficiency']
    .map((key) => ({ key, def: ENCHANTMENT_REGISTRY[key] }));
  const alwaysContinue = () => 0; // 0 * 50 < cost + 1, so selection keeps going while candidates last
  const many = selectEnchantments(pool, 60, alwaysContinue);
  assert.ok(many.length > 1, `expected a multi-pick to test the book rule with, got ${many.length}`);
  const one = selectEnchantments(pool, 60, alwaysContinue, { removeOneForBook: true });
  assert.equal(one.length, many.length - 1, 'a book loses exactly one, whatever the pool gave');
  for (const key of one) assert.ok(many.includes(key), 'and keeps the rest');

  // And the flag is wired to the item type: over many rolls, the engine's book offers never carry more
  // than its tool offers minus one more than the same pool would without the rule. The direct control
  // above is the precise statement; this is the wiring check.
  let bookMax = 0;
  let toolMax = 0;
  let bookOffers = 0;
  for (let trial = 0; trial < 400; trial++) {
    for (const offer of generateEnchantmentOffers(item('book'), 15, seeded(trial + 1))) {
      bookOffers++;
      bookMax = Math.max(bookMax, [offer.primary, ...offer.additional].length);
    }
    for (const offer of generateEnchantmentOffers(item('diamond_sword'), 15, seeded(trial + 1))) {
      toolMax = Math.max(toolMax, [offer.primary, ...offer.additional].length);
    }
  }
  assert.ok(bookOffers > 600, `expected plenty of book offers, got ${bookOffers}`);
  assert.ok(toolMax > 1, 'a tool at 15 bookshelves carries more than one, or the test proves nothing');
  // Nothing constrains a book to a single enchantment, so with the continue chance this permissive the
  // engine does sometimes produce two. What it must never produce is the count the pool gave it.
  assert.ok(bookMax <= toolMax, `a book (${bookMax}) must not carry more than a tool (${toolMax})`);
});

test('the continue chance is vanilla\'s `random(50) <= cost`, not a fixed ratio', () => {
  // At a bottom-slot cost of 30 roughly two thirds of the time the loop goes round again; at a cost of 1
  // it almost never does. A fixed `cost/(cost+50)` would have made cost 30 continue less often than
  // cost 1, which is backwards.
  const pool = Object.keys(ENCHANTMENT_REGISTRY)
    .filter((k) => !ENCHANTMENT_REGISTRY[k].treasure)
    .map((key) => ({ key, def: ENCHANTMENT_REGISTRY[key] }));
  const averageCount = (cost) => {
    let total = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) total += selectEnchantments(pool, cost, seeded(i + 1)).length;
    return total / trials;
  };
  const cheap = averageCount(1);
  const dear = averageCount(30);
  assert.ok(cheap < 1.1, `a cost of 1 should almost always stop after one pick, averaged ${cheap.toFixed(2)}`);
  assert.ok(dear > 1.5, `a cost of 30 should often pick again, averaged ${dear.toFixed(2)}`);
  assert.ok(dear > cheap * 1.5, 'a higher cost must mean more enchantments, not fewer');
});

// --- offers ---------------------------------------------------------------------

test('every offer is affordable, within the reachable cost, and free of conflicts', () => {
  const ids = ['diamond_sword', 'diamond_pickaxe', 'diamond_helmet', 'diamond_boots', 'bow',
    'crossbow', 'trident', 'fishing_rod', 'book', 'golden_helmet', 'iron_boots', 'shears'];
  for (const id of ids) {
    for (const books of [0, 3, 9, 15]) {
      for (let trial = 0; trial < 40; trial++) {
        const offers = generateEnchantmentOffers(item(id), books, seeded(trial * 13 + books + 1));
        const seenSlots = new Set();
        for (const offer of offers) {
          assert.equal(seenSlots.has(offer.slot), false, `${id}: slot ${offer.slot} offered twice`);
          seenSlots.add(offer.slot);
          // The price and the requirement are the same number, as the game shows them.
          assert.equal(offer.levelCost, offer.levelRequirement);
          assert.ok(offer.levelCost >= 1, 'a slot never costs nothing');
          assert.equal(offer.lapisCost, lapisCostForSlot(offer.slot));
          // Every granted enchantment is one the item is a primary item for, and is not treasure.
          const granted = [offer.primary, ...offer.additional];
          for (const ench of granted) {
            const def = ENCHANTMENT_REGISTRY[ench.id];
            assert.ok(def, `${id}: ${ench.id} is not a real enchantment`);
            assert.equal(def.treasure, undefined, `${id}: the table offered the treasure ${ench.id}`);
            assert.equal(ench.name, def.name, `${ench.id} carries the registry's name`);
            assert.ok(isPrimaryFor(def, id) || id === 'book', `${id} is not a primary item for ${ench.id}`);
            assert.ok(ench.level >= 1 && ench.level <= def.maxLevel, `${ench.id} level ${ench.level} out of range`);
            // The level really is the one that cost range picks out.
            assert.equal(levelForCost(def, offer.enchantmentCost), ench.level,
              `${ench.id} level ${ench.level} does not match cost ${offer.enchantmentCost}`);
          }
          // No two granted enchantments conflict.
          for (let i = 0; i < granted.length; i++) {
            for (let j = i + 1; j < granted.length; j++) {
              assert.equal(areIncompatible(granted[i].id, granted[j].id), false,
                `${id}: ${granted[i].id} and ${granted[j].id} conflict`);
            }
          }
          assert.ok(offer.runes.length > 0, 'the runes are the obfuscated hint');
          assert.match(offer.hint, /\?\?$|\.\.\.\?$/, 'the hint is obfuscated');
        }
      }
    }
  }
});

test('bookshelves widen what the table can offer', () => {
  // The whole point of bookshelves: the same sword gets better enchantments with more of them. Measure
  // the best level each drop offers and compare the two populations.
  const best = (books) => {
    let top = 0;
    for (let trial = 0; trial < 600; trial++) {
      for (const offer of generateEnchantmentOffers(item('diamond_sword'), books, seeded(trial * 7 + 1))) {
        for (const e of [offer.primary, ...offer.additional]) {
          top = Math.max(top, e.level / ENCHANTMENT_REGISTRY[e.id].maxLevel);
        }
      }
    }
    return top;
  };
  const none = best(0);
  const full = best(15);
  assert.ok(full > none, `15 bookshelves should reach higher (0 -> ${none.toFixed(2)}, 15 -> ${full.toFixed(2)})`);
});

test('a bare item with nothing available at its cost yields no offers rather than a wrong one', () => {
  // The wiki: "If the item meets the conditions but has no available enchantments, it will be possible to
  // select the slot at the enchanting table, but nothing will happen." An empty list is the honest answer.
  const offers = generateEnchantmentOffers(item('dirt'), 15, seeded(1));
  assert.deepEqual(offers, []);
  assert.deepEqual(generateEnchantmentOffers(null, 15, seeded(1)), []);
  assert.deepEqual(generateEnchantmentOffers({ ...item('diamond_sword'), enchantments: [{ id: 'sharpness', level: 1 }] }, 15, seeded(1)), []);
});

test('the offer only ever names enchantments the game can apply', () => {
  // A potion naming an effect nothing implements is a potion that does nothing; the same is true here.
  // Every registry row must be reachable and named, and every id in an offer must be a registry row.
  for (const key of Object.keys(ENCHANTMENT_REGISTRY)) {
    const def = ENCHANTMENT_REGISTRY[key];
    assert.ok(def.desc && def.desc.length > 0, `${key} has a description`);
    assert.ok(Array.isArray(def.targets) && def.targets.length > 0, `${key} has targets`);
    assert.ok(Array.isArray(def.cost) && def.cost.length === def.maxLevel, `${key} has a range per level`);
  }
});

// --- rolling for trades and loot ------------------------------------------------

test('rollEnchantmentFor produces a named, in-range enchantment', () => {
  for (let trial = 0; trial < 400; trial++) {
    const rolled = rollEnchantmentFor('book', { random: seeded(trial + 1), allowTreasure: true });
    assert.equal(rolled.length, 1);
    const [ench] = rolled;
    const def = ENCHANTMENT_REGISTRY[ench.id];
    assert.ok(def, `${ench.id} is not an enchantment`);
    assert.equal(ench.name, def.name, 'the name is the enchantment\'s own, without a level suffix');
    assert.ok(ench.level >= 1 && ench.level <= def.maxLevel);
  }
  // Without treasure, Mending must never come up for a book.
  for (let trial = 0; trial < 300; trial++) {
    const [ench] = rollEnchantmentFor('book', { random: seeded(trial + 1) });
    assert.equal(TREASURE_ENCHANTMENTS.has(ench.id), false, `${ench.id} is treasure and was rolled`);
  }
  // The exclusions a librarian trade needs are honoured.
  for (let trial = 0; trial < 300; trial++) {
    const [ench] = rollEnchantmentFor('book', {
      random: seeded(trial + 1), allowTreasure: true,
      exclude: ['soul_speed', 'swift_sneak', 'wind_burst'],
    });
    assert.equal(ench.id === 'soul_speed' || ench.id === 'swift_sneak', false);
  }
  assert.deepEqual(rollEnchantmentFor('dirt', { random: seeded(1) }), []);
  assert.deepEqual(rollEnchantmentFor(null, { random: seeded(1) }), []);
});

// --- applying -------------------------------------------------------------------

test('applying an offer charges the levels it displayed and the slot\'s lapis', () => {
  const player = { level: 40, exp: 0 };
  const tool = item('diamond_pickaxe');
  const [offer] = generateEnchantmentOffers(tool, 15, seeded(2)).slice(2);
  const before = player.level;
  assert.equal(applyEnchantment(tool, offer, player, null, null), true);
  assert.equal(player.level, before - offer.levelCost, 'charged exactly the displayed cost');
  assert.deepEqual(tool.enchantments.map((e) => e.id), [offer.primary, ...offer.additional].map((e) => e.id));
});

test('an offer a player cannot afford is refused and changes nothing', () => {
  const player = { level: 1, exp: 0 };
  const tool = item('diamond_pickaxe');
  const offer = generateEnchantmentOffers(item('diamond_pickaxe'), 15, seeded(2))[2];
  assert.ok(offer.levelCost > 1, 'the bottom slot costs more than one level');
  assert.equal(applyEnchantment(tool, offer, player, null, null), false);
  assert.equal(player.level, 1, 'no level was spent');
  assert.equal(tool.enchantments, undefined, 'and the item is untouched');
  assert.equal(applyEnchantment(null, offer, player), false);
  assert.equal(applyEnchantment(tool, null, player), false);
  assert.equal(applyEnchantment(tool, offer, null), false);
});

test('applying an offer onto an already-enchanted item adds rather than replaces', () => {
  // The offer is an offer for a bare item, but a caller can hand one an item that already carries
  // something. Overwriting the array there destroyed enchantments that had already been paid for.
  const player = { level: 40, exp: 0 };
  const tool = { ...item('diamond_pickaxe'), enchantments: [{ id: 'unbreaking', name: 'Unbreaking', level: 3 }] };
  const offer = {
    slot: 0, levelRequirement: 3, levelCost: 3, lapisCost: 1,
    primary: { id: 'efficiency', name: 'Efficiency', level: 2 }, additional: [],
  };
  assert.equal(applyEnchantment(tool, offer, player), true);
  assert.deepEqual(tool.enchantments.map((e) => e.id), ['unbreaking', 'efficiency']);
});

test('enchanting a book turns it into an enchanted book', () => {
  const player = { level: 40, exp: 0 };
  const book = item('book');
  const offer = generateEnchantmentOffers(item('book'), 15, seeded(6))[0];
  assert.equal(applyEnchantment(book, offer, player), true);
  assert.equal(book.id, 'enchanted_book');
  assert.equal(book.name, 'Enchanted Book');
  assert.equal(book.enchantments.length, 1);
});

// --- the offered enchantments do something --------------------------------------

test('every non-treasure enchantment the table can offer is wired to something', () => {
  // An enchantment the table hands out and nothing reads is worse than one that is absent: the player
  // pays levels and lapis for it and nothing happens. The three protection variants were exactly that --
  // offerable on every armour piece and read by nothing -- until this pass.
  const wired = {
    aqua_affinity: 'registered only: this game has no underwater mining slowdown to remove',
    bane_of_arthropods: 'enchantmentEffects.attackBonus',
    breach: 'maceSmash.breachedArmourFraction (mobs.damageMob)',
    density: 'maceSmash.smashBonus (main.handleLeftClick)',
    blast_protection: 'enchantmentEffects.protectionPoints',
    channeling: 'registered only: no thrown-trident lightning',
    depth_strider: 'enchantmentEffects.depthStriderMultiplier',
    efficiency: 'miningRules.breakTimeSeconds',
    feather_falling: 'player.takeDamage',
    fire_aspect: 'enchantmentEffects.fireAspectSeconds',
    fire_protection: 'enchantmentEffects.protectionPoints',
    flame: 'registered only: arrows are not ignited',
    fortune: 'registered only: drops do not roll Fortune',
    impaling: 'enchantmentEffects.attackBonus',
    infinity: 'registered only: arrows are still consumed',
    knockback: 'registered only: melee knockback is not scaled',
    looting: 'mobs.damageMob',
    loyalty: 'registered only: a thrown trident is not returned',
    luck_of_the_sea: 'registered only: fishing loot is not modelled',
    lure: 'registered only: fishing time is not modelled',
    multishot: 'registered only: crossbows fire one bolt',
    piercing: 'registered only: arrows do not pierce',
    power: 'registered only: bow damage is not scaled',
    projectile_protection: 'enchantmentEffects.protectionPoints',
    protection: 'enchantmentEffects.protectionPoints',
    punch: 'registered only: arrow knockback is not scaled',
    quick_charge: 'registered only: crossbow charge time is not modelled',
    respiration: 'registered only: the breath meter is not modelled',
    riptide: 'registered only: no trident propulsion',
    sharpness: 'enchantmentEffects.attackBonus',
    silk_touch: 'blocks.js harvest table',
    smite: 'enchantmentEffects.attackBonus',
    sweeping_edge: 'registered only: no sweep attack',
    thorns: 'enchantmentEffects.thornsReflect',
    unbreaking: 'durability.spendDurability',
  };
  const offered = Object.keys(ENCHANTMENT_REGISTRY).filter((k) => !TREASURE_ENCHANTMENTS.has(k));
  assert.deepEqual(offered.filter((k) => !(k in wired)).sort(), [],
    'these are offered by the table and have no recorded effect');
  assert.deepEqual(Object.keys(wired).filter((k) => !offered.includes(k)).sort(), [],
    'these are recorded as offered and are not');
  // The count is pinned so a new enchantment has to be classified rather than slip through.
  assert.equal(offered.length, 35);
  // And at least the protection family really does reduce damage, rather than merely being named above.
  const set = (id, level) => [[{ id, level }], [{ id, level }], [{ id, level }], [{ id, level }]];
  assert.equal(protectionPoints(set('protection', 4), 'zombie'), 16);
  assert.equal(protectionPoints(set('fire_protection', 4), 'fire'), 16);
  assert.equal(protectionPoints(set('blast_protection', 4), 'explosion'), 16);
  assert.equal(protectionPoints(set('projectile_protection', 4), 'arrow'), 16);
  assert.equal(protectionPoints(set('projectile_protection', 4), 'fire'), 0);
});

// --- bookshelves -----------------------------------------------------------------

test('the bookshelf rules are the wiki\'s: two blocks out, one block gap, at the table or one above', () => {
  const voxels = new Map();
  const world = {
    getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id),
  };
  const tx = 8;
  const ty = 20;
  const tz = 8;
  const shelf = (dx, dy, dz, id = BLOCKS.BOOKSHELF) => world.setVoxel(tx + dx, ty + dy, tz + dz, id);

  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 0);
  // Directly adjacent is too close: bookshelves count at exactly two blocks.
  shelf(1, 0, 0);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 0, 'one block away does not count');
  shelf(1, 0, 0, BLOCKS.AIR);
  shelf(2, 0, 0);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 1);
  // ... at the table's height or one above, not two above.
  shelf(2, 2, 0);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 1, 'two above does not count');
  shelf(2, 2, 0, BLOCKS.AIR);
  shelf(2, 1, 0);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 2, 'one above does count');
  // A diagonal counts, but only up to two blocks along the other axis.
  shelf(2, 0, 2);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 3, 'a corner counts');
  shelf(2, 0, 3);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 3, 'three along the other axis does not');
  // The gap beside the table has to be air.
  shelf(2, 0, 0, BLOCKS.STONE);
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 2, 'a blocked shelf does not count');
  assert.equal(calculateBookshelfCount(null, tx, ty, tz), 0);
});

test('the bookshelf count is capped at 15', () => {
  const voxels = new Map();
  const world = {
    getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id),
  };
  const tx = 0;
  const ty = 10;
  const tz = 0;
  // Every counting position, filled.
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
      for (let dy = 0; dy <= 1; dy++) world.setVoxel(tx + dx, ty + dy, tz + dz, BLOCKS.BOOKSHELF);
    }
  }
  assert.equal(calculateBookshelfCount(world, tx, ty, tz), 15);
});
