// Enchantment data and the enchanting table's offer engine.
//
// Everything here is vanilla Java Edition's, from two pages:
//   https://minecraft.wiki/w/Enchantment                    -- the list, weights, incompatibilities
//   https://minecraft.wiki/w/Enchanting_table_mechanics      -- the cost and selection formulas
//
// The registry is the whole of vanilla's list rather than the nineteen this game happened to name. The
// nineteen that already existed were kept under their own ids so nothing that reads them breaks, but the
// other twenty-three were simply absent: no item could ever be offered, say, Blast Protection or Mending,
// and the villager trade table already tried to exclude three ids that did not exist.
//
// `anvil.js` and `grindstone.js` read `maxLevel` and `targets` from here, so the fields they use are
// unchanged and the additions are additive.
import { advancementEvent } from './advancements.js';
import { BLOCKS, ITEMS } from './blocks.js';
import { consumePlayerLevels } from './experience.js';

// Standard Galactic Alphabet / Enchantment Runes
export const GALACTIC_RUNES = [
  'ᔑ', 'ʖ', 'ᓵ', '↸', 'ᒷ', '⎓', '⊣', '⍑', '╎', '⋮',
  'ꖌ', 'ꖎ', 'ᒲ', 'リ', '𝙹', '¡', 'ᑑ', '∷', 'ᓭ', 'ℸ',
  '⚍', '⍊', 'ᑑ', '̇/', '||', '⨅'
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/**
 * Vanilla's per-level cost ranges, normalised to `[min, max]` pairs.
 *
 * The wiki tabulates these for every enchantment an enchanting table can offer, and every range below is
 * transcribed from that table. A single number is a level whose published range is a point, or a level of
 * a treasure enchantment (which the table never offers) whose range only the pinned vanilla data gives.
 *
 * The minimums are also derivable, and the test suite checks them: the pinned 1.21.4 `enchantments.json`
 * this repo already ships gives each enchantment a `minCost` of the form `a * level + b`, and 27 of these
 * levels agree with it exactly whereas the rest are the table's own figures.
 *
 * @param {Array<number|[number, number]>} ranges
 * @returns {Array<[number, number]>}
 */
function costRanges(ranges) {
  return ranges.map((entry) => {
    if (Array.isArray(entry)) return [entry[0], entry.length > 1 ? entry[1] : entry[0]];
    return [entry, entry];
  });
}

/**
 * One row of the wiki's cost table.
 *
 * @param {string} name
 * @param {number} maxLevel
 * @param {number} weight       the selection weight; a candidate's chance is its weight over the total
 * @param {Array<number|[number, number]>} ranges  the per-level cost ranges
 * @param {string[]|string} items  the primary items, as this game's item categories and/or item ids
 * @param {object} [extra]      `incompatible`, `treasure`, `desc`, `tradable`, `curse`
 */
function entry(name, maxLevel, weight, ranges, items, extra = {}) {
  return {
    name,
    maxLevel,
    weight,
    cost: costRanges(ranges),
    targets: items,
    roman: ROMAN.slice(0, maxLevel),
    ...extra,
  };
}

// The categories an armour piece answers to, so a protection enchantment lists one token instead of four.
const ARMOUR = ['helmet', 'chestplate', 'leggings', 'boots'];
const TOOL = ['pickaxe', 'shovel', 'hoe'];
const SWORD = ['sword'];
/** Every item the enchanting table will take. Unbreaking and Mending sit here in vanilla. */
const ANY = ['all'];

/**
 * Vanilla's enchantments, keyed by vanilla's own identifier.
 *
 * The compatibility groups the wiki names are expressed as `incompatible` lists:
 *   Sword    Sharpness / Smite / Bane of Arthropods (plus Breach and Density, mace-only)
 *   Tool     Fortune / Silk Touch
 *   Armour   Protection / Fire Protection / Blast Protection / Projectile Protection
 *   Boots    Depth Strider / Frost Walker
 *   Bow      Infinity / Mending
 *   Crossbow Multishot / Piercing
 *   Trident  Loyalty / Riptide, Channeling / Riptide
 */
export const ENCHANTMENT_REGISTRY = {
  aqua_affinity: entry('Aqua Affinity', 1, 2, [[1, 41]], ['helmet'], { desc: 'Removes the mining speed reduction that occurs when underwater.' }),
  respiration: entry('Respiration', 3, 2, [[10, 19], [20, 29], [30, 60]], ['helmet'], { desc: 'Extends underwater breathing time.' }),
  protection: entry('Protection', 4, 10, [[5, 12], [13, 20], [21, 28], [29, 37]], ['helmet', 'chestplate', 'leggings', 'boots'], { desc: 'Reduces damage taken from almost all sources.', incompatible: ['fire_protection', 'blast_protection', 'projectile_protection'] }),
  fire_protection: entry('Fire Protection', 4, 5, [[10, 17], [18, 25], [26, 33], [34, 42]], ['helmet', 'chestplate', 'leggings', 'boots'], { desc: 'Reduces fire, lava, and blaze damage.', incompatible: ['protection', 'blast_protection', 'projectile_protection'] }),
  blast_protection: entry('Blast Protection', 4, 2, [[5, 12], [13, 20], [21, 28], [29, 37]], ['helmet', 'chestplate', 'leggings', 'boots'], { desc: 'Reduces explosion damage and knockback.', incompatible: ['protection', 'fire_protection', 'projectile_protection'] }),
  projectile_protection: entry('Projectile Protection', 4, 5, [[3, 8], [9, 14], [15, 20], [21, 27]], ['helmet', 'chestplate', 'leggings', 'boots'], { desc: 'Reduces damage from projectiles.', incompatible: ['protection', 'fire_protection', 'blast_protection'] }),
  thorns: entry('Thorns', 3, 1, [[10, 29], [30, 49], [50, 100]], ['chestplate'], { secondary: ['helmet', 'leggings', 'boots'], desc: 'Reflects damage back at attacking enemies.' }),
  feather_falling: entry('Feather Falling', 4, 5, [[5, 10], [11, 16], [17, 22], [23, 29]], ['boots'], { desc: 'Reduces fall damage.' }),
  depth_strider: entry('Depth Strider', 3, 2, [[10, 19], [20, 29], [30, 45]], ['boots'], { desc: 'Lessens the movement speed reduction that occurs when in water.', incompatible: ['frost_walker'] }),
  frost_walker: entry('Frost Walker', 2, 2, [1, 9], ['boots'], { desc: 'Turns water into frosted ice beneath the wearer’s feet.', treasure: true, tradable: true, incompatible: ['depth_strider'] }),
  sharpness: entry('Sharpness', 5, 10, [[1, 11], [12, 22], [23, 33], [34, 44], [45, 65]], ['sword'], { secondary: ['axe'], desc: 'Increases melee damage.', incompatible: ['smite', 'bane_of_arthropods'] }),
  smite: entry('Smite', 5, 5, [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]], ['sword'], { secondary: ['axe', 'mace'], desc: 'Increases damage dealt against undead mobs.', incompatible: ['sharpness', 'bane_of_arthropods'] }),
  bane_of_arthropods: entry('Bane of Arthropods', 5, 5, [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]], ['sword'], { secondary: ['axe', 'mace'], desc: 'Increases damage against arthropods and applies Slowness IV to them.', incompatible: ['sharpness', 'smite'] }),
  knockback: entry('Knockback', 2, 5, [[5, 24], [25, 75]], ['sword'], { desc: 'Increases melee knockback.' }),
  fire_aspect: entry('Fire Aspect', 2, 2, [[10, 19], [20, 80]], ['sword'], { secondary: ['mace'], desc: 'Sets naturally flammable mobs on fire.' }),
  looting: entry('Looting', 3, 2, [[15, 23], [24, 32], [33, 83]], ['sword'], { desc: 'Increases mob item and rare drop quantities.' }),
  sweeping_edge: entry('Sweeping Edge', 3, 2, [[5, 13], [14, 22], [23, 38]], ['sword'], { desc: 'Increases the damage of a sword sweep attack.' }),
  efficiency: entry('Efficiency', 5, 10, [[1, 10], [11, 20], [21, 30], [31, 40], [41, 91]], ['pickaxe', 'shovel', 'hoe', 'axe'], { secondary: ['shears'], desc: 'Increases mining efficiency.' }),
  silk_touch: entry('Silk Touch', 1, 1, [[15, 65]], ['pickaxe', 'shovel', 'hoe', 'axe'], { desc: 'Certain blocks drop themselves instead of other items or nothing.', incompatible: ['fortune'] }),
  fortune: entry('Fortune', 3, 2, [[15, 23], [24, 32], [33, 83]], ['pickaxe', 'shovel', 'hoe', 'axe'], { desc: 'Chance to receive more item drops from certain blocks.', incompatible: ['silk_touch'] }),
  power: entry('Power', 5, 10, [[1, 10], [11, 20], [21, 30], [31, 40], [41, 56]], ['bow'], { desc: 'Increases arrow damage.' }),
  punch: entry('Punch', 2, 2, [[12, 31], [32, 57]], ['bow'], { desc: 'Increases arrow knockback.' }),
  flame: entry('Flame', 1, 2, [[20, 50]], ['bow'], { desc: 'Fired arrows burn and set targets on fire.' }),
  infinity: entry('Infinity', 1, 1, [[20, 50]], ['bow'], { desc: 'Prevents consumption of arrows.', incompatible: ['mending'] }),
  quick_charge: entry('Quick Charge', 3, 5, [[12, 31], [32, 50], [51, 69]], ['crossbow'], { desc: 'Increases crossbow charging speed.' }),
  multishot: entry('Multishot', 1, 2, [[20, 50]], ['crossbow'], { desc: 'Shoots three arrows at the cost of extra durability.', incompatible: ['piercing'] }),
  piercing: entry('Piercing', 4, 10, [[1, 10], [11, 20], [21, 30], [31, 50]], ['crossbow'], { desc: 'Fired arrows pierce entities.', incompatible: ['multishot'] }),
  loyalty: entry('Loyalty', 3, 5, [[12, 18], [19, 25], [26, 50]], ['trident'], { desc: 'Returns the trident to its owner after being thrown.', incompatible: ['riptide'] }),
  impaling: entry('Impaling', 5, 2, [[1, 8], [9, 16], [17, 24], [25, 32], [33, 53]], ['trident'], { desc: 'Increases damage against aquatic mobs.' }),
  riptide: entry('Riptide', 3, 2, [[17, 23], [24, 30], [31, 50]], ['trident'], { desc: 'Launches the wielder when used in water or rain.', incompatible: ['loyalty', 'channeling'] }),
  channeling: entry('Channeling', 1, 1, [[25, 50]], ['trident'], { desc: 'Summons a lightning bolt on the target during a thunderstorm.', incompatible: ['riptide'] }),
  luck_of_the_sea: entry('Luck of the Sea', 3, 2, [[15, 23], [24, 32], [33, 83]], ['fishing_rod'], { desc: 'Increases the rate of treasure items from fishing.' }),
  lure: entry('Lure', 3, 2, [[15, 23], [24, 32], [33, 83]], ['fishing_rod'], { desc: 'Decreases time for bites when fishing.' }),
  unbreaking: entry('Unbreaking', 3, 5, [[5, 12], [13, 20], [21, 71]], ANY, { desc: 'Increases item durability.' }),
  mending: entry('Mending', 1, 2, [[1]], ANY, { desc: 'Repairs the item using experience.', treasure: true }),
  soul_speed: entry('Soul Speed', 3, 1, [1, 2, 3], ['boots'], { desc: 'Move faster on soul sand and soul soil.', treasure: true, tradable: false }),
  swift_sneak: entry('Swift Sneak', 3, 1, [1, 2, 3], ['leggings'], { desc: 'Lessens the movement speed reduction that occurs when sneaking.', treasure: true, tradable: false }),
  binding_curse: entry('Curse of Binding', 1, 1, [[25]], ['helmet', 'chestplate', 'leggings', 'boots', 'elytra'], { desc: 'Items cannot be removed from armour slots.', treasure: true, curse: true }),
  vanishing_curse: entry('Curse of Vanishing', 1, 1, [[25]], ANY, { desc: 'Item disappears on death.', treasure: true, curse: true }),
  // The mace's three (their pages; weights and cost ranges from Enchanting table mechanics). Breach and Density
  // are offered for a mace at the table; Wind Burst is a treasure enchantment. Their effects are in maceSmash.js.
  breach: entry('Breach', 4, 2, [[15, 23], [24, 32], [33, 41], [42, 92]], ['mace'], { desc: 'Reduces the effectiveness of the target’s armor.', incompatible: ['density', 'sharpness', 'smite', 'bane_of_arthropods'] }),
  density: entry('Density', 5, 5, [[5, 12], [13, 20], [21, 28], [29, 36], [37, 57]], ['mace'], { desc: 'Increases smash attack damage per block fallen.', incompatible: ['breach', 'sharpness', 'smite', 'bane_of_arthropods'] }),
  wind_burst: entry('Wind Burst', 3, 2, [[15, 23], [24, 32], [33, 83]], ['mace'], { desc: 'Launches the wielder upward after a smash attack.', treasure: true }),
};

// The registry above is exactly vanilla's own list, keyed by vanilla's identifiers. The mace's three used to be
// named here as missing; the mace exists now and so do they.
export const NOT_OFFERED = Object.freeze([]);

/** Enchantment ids the offer engine may produce that are not table-offerable, for trade and loot. */
export const TREASURE_ENCHANTMENTS = new Set(
  Object.entries(ENCHANTMENT_REGISTRY).filter(([, def]) => def.treasure).map(([key]) => key),
);

/**
 * Items vanilla allows at an enchanting table that the name rules below cannot see.
 *
 * Each gets its **own** category rather than being folded into `tool` or `weapon`, because the category
 * picks which enchantments are offered: calling a brush a `tool` would offer it Efficiency, which vanilla
 * does not give a brush, and calling a trident a `weapon` would offer it Sharpness, which vanilla does not
 * give a trident either. Unbreaking already targets `all`, so every one of these is offered it.
 */
const EXTRA_ENCHANTABLE = {
  trident: 'trident',
  shield: 'shield',
  shears: 'shears',
  fishing_rod: 'fishing_rod',
  brush: 'brush',
  carrot_on_a_stick: 'carrot_on_a_stick',
  warped_fungus_on_a_stick: 'warped_fungus_on_a_stick',
  mace: 'mace',
  elytra: 'elytra',
  // Spears take the weapon pool
  golden_spear: 'weapon',
  wooden_spear: 'weapon',
  stone_spear: 'weapon',
  copper_spear: 'weapon',
  iron_spear: 'weapon',
  diamond_spear: 'weapon',
  netherite_spear: 'weapon',
};

/**
 * Items vanilla refuses to enchant, however this game's `type` field happens to classify them.
 *
 * Named rather than inferred: this game types a bucket, a clock, a compass, a name tag and a saddle as
 * `tool`, which is a reasonable classification for "something you hold" and the wrong answer to "can an
 * enchanting table take it". Horse armour is here for the same reason.
 */
export const NOT_ENCHANTABLE = new Set([
  'bucket', 'water_bucket', 'lava_bucket',
  // And the mob buckets, for the same reason: vanilla enchants none of them.
  'cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket', 'axolotl_bucket', 'tadpole_bucket',
  // The bundles too: vanilla enchants none of them.
  'bundle', 'white_bundle', 'orange_bundle', 'magenta_bundle', 'light_blue_bundle', 'yellow_bundle', 'lime_bundle', 'pink_bundle',
  'gray_bundle', 'light_gray_bundle', 'cyan_bundle', 'purple_bundle', 'blue_bundle', 'brown_bundle',
  'green_bundle', 'red_bundle', 'black_bundle',
  'compass', 'clock', 'lead', 'name_tag', 'saddle', 'flint_and_steel',
  'powder_snow_bucket', 'spyglass', 'recovery_compass', 'debug_stick',
  'leather_horse_armor', 'iron_horse_armor', 'golden_horse_armor', 'diamond_horse_armor',
  'copper_horse_armor', 'netherite_horse_armor', 'sulfur_cube_bucket',
]);

/**
 * Returns item category for enchanting eligibility.
 */
export function getItemEnchantCategory(itemId) {
  if (!itemId || typeof itemId !== 'string') return null;
  if (NOT_ENCHANTABLE.has(itemId)) return null;

  if (itemId.endsWith('_sword')) return 'weapon';
  if (itemId.endsWith('_axe')) return 'weapon'; // Axes are weapons and tools in modern Minecraft
  if (itemId.endsWith('_pickaxe') || itemId.endsWith('_shovel') || itemId.endsWith('_hoe')) return 'tool';
  if (itemId.endsWith('_helmet')) return 'helmet';
  if (itemId.endsWith('_chestplate')) return 'chestplate';
  if (itemId.endsWith('_leggings')) return 'leggings';
  if (itemId.endsWith('_boots')) return 'boots';
  if (itemId === 'bow' || itemId === 'crossbow') return 'bow';
  if (EXTRA_ENCHANTABLE[itemId]) return EXTRA_ENCHANTABLE[itemId];
  if (itemId === 'book') return 'book';

  return null;
}

/**
 * The categories an item's own category counts as for target matching.
 *
 * The registry's `targets` are vanilla's own tokens (`helmet`, `pickaxe`, `sword`), while
 * `getItemEnchantCategory` returns this game's coarser buckets (`weapon`, `tool`). This is the one place
 * the two vocabularies are related, so a target list and a category cannot drift apart in two files.
 */
function categoriesFor(itemId) {
  const category = getItemEnchantCategory(itemId);
  if (!category) return [];
  const out = new Set([category]);
  if (category === 'weapon') {
    // An axe is not a sword: the table offers it the tool enchantments, and Sharpness, Smite and Bane only at an
    // anvil (they list the axe among their secondary items).
    if (!itemId.endsWith('_axe')) out.add('sword');
    if (itemId.endsWith('_axe')) out.add('axe');
    if (itemId === 'golden_spear') out.add('spear');
  }
  if (category === 'tool') {
    if (itemId.endsWith('_pickaxe')) out.add('pickaxe');
    if (itemId.endsWith('_shovel')) out.add('shovel');
    if (itemId.endsWith('_hoe')) out.add('hoe');
    if (itemId.endsWith('_axe')) out.add('axe');
  }
  // A crossbow takes the crossbow's enchantments, not the bow's.
  if (category === 'bow' && itemId === 'crossbow') { out.delete('bow'); out.add('crossbow'); }
  return [...out];
}

/**
 * Items an anvil can enchant but an enchanting table cannot: each enchantment page lists them as "secondary
 * items" only (shears, flint and steel, shields, elytra, the fishing-rod sticks, brushes).
 */
export const ANVIL_ONLY = new Set(['shears', 'flint_and_steel', 'shield', 'elytra', 'carrot_on_a_stick', 'warped_fungus_on_a_stick', 'brush']);

/** Can an anvil put this enchantment on this item? Its primary items, and its secondary ones. */
export function anvilAccepts(def, itemId) {
  if (!def || !itemId) return false;
  if (isPrimaryFor(def, itemId)) return true;
  const cats = new Set([...categoriesFor(itemId), itemId]);
  if (itemId.endsWith('_axe')) cats.add('axe');
  return (def.secondary ?? []).some((cat) => cats.has(cat));
}

/** Does an enchantment's target list admit this item at the enchanting table? */
export function isPrimaryFor(def, itemId) {
  if (!def || !itemId) return false;
  if (def.targets.includes('all')) return true;
  const cats = categoriesFor(itemId);
  return cats.some((cat) => def.targets.includes(cat));
}

export function isEnchantableItem(item) {
  if (!item) return false;
  // If already enchanted, standard enchanting table cannot re-enchant
  if (Array.isArray(item.enchantments) && item.enchantments.length > 0) return false;
  return getItemEnchantCategory(item.id) !== null && !ANVIL_ONLY.has(item.id);
}

/**
 * Are two enchantments mutually exclusive?
 *
 * Read from the registry's `incompatible` lists in both directions, so a pair only has to be declared
 * once and `anvil.js` no longer keeps its own copy of the table.
 */
export function areIncompatible(a, b) {
  if (!a || !b || a === b) return false;
  return Boolean(ENCHANTMENT_REGISTRY[a]?.incompatible?.includes(b)
    || ENCHANTMENT_REGISTRY[b]?.incompatible?.includes(a));
}

/** The enchantment keys a merge must never place together on one item. */
export function incompatibleWith(key) {
  const def = ENCHANTMENT_REGISTRY[key];
  if (!def) return [];
  return [...new Set([
    ...(def.incompatible ?? []),
    ...Object.entries(ENCHANTMENT_REGISTRY)
      .filter(([, other]) => other.incompatible?.includes(key))
      .map(([otherKey]) => otherKey),
  ])];
}

/**
 * The enchantments a given item can be offered, before any cost filtering.
 *
 * Split out of `generateEnchantmentOffers` so the trade tables can roll an enchantment for the same item
 * without a second, drifting copy of the eligibility rule. The one difference is `allowTreasure`: an
 * enchanting table never offers a treasure enchantment, while a librarian's book trade does -- Mending is
 * the trade the wiki names as the reason trading exists at all.
 *
 * @param {string} itemId
 * @param {{ allowTreasure?: boolean, exclude?: string[] }} [options]
 * @returns {Array<{ key: string, def: object }>}
 */
export function eligibleEnchantments(itemId, { allowTreasure = false, exclude = [] } = {}) {
  const category = getItemEnchantCategory(itemId);
  if (!category || ANVIL_ONLY.has(itemId)) return [];
  const out = [];
  for (const [key, def] of Object.entries(ENCHANTMENT_REGISTRY)) {
    if (def.treasure && !allowTreasure) continue;
    if (exclude.includes(key)) continue;
    // "Books being primary to all enchantments is hardcoded." Every other item asks its own targets.
    if (category === 'book' || isPrimaryFor(def, itemId)) out.push({ key, def });
  }
  return out;
}

// --- the experience and enchantment cost formulas ------------------------------

/** One integer in `[0, max]`, both ends included, which is what the wiki's `randInt(n)` means. */
function randInt(max, random) {
  return Math.floor(random() * (max + 1));
}

/**
 * The experience cost of a slot, in levels.
 *
 * `xpBase = 1 + randInt(7) + floor(min(15, bookshelves) / 2) + randInt(min(15, bookshelves))`, then
 *   top    `floor(max(1, xpBase / 3))`
 *   middle `floor(2 * xpBase / 3) + 1`
 *   bottom `floor(max(xpBase, 2 * bookshelves))`
 *
 * The bookshelf count is capped at 15 because that is the cap on active bookshelves, and the cap is
 * applied here rather than by the caller so a caller cannot pass 30 and get an invented offer.
 */
export function experienceCost(slot, bookshelfCount, random = Math.random) {
  const shelves = Math.min(15, Math.max(0, Math.floor(bookshelfCount) || 0));
  const xpBase = 1 + randInt(7, random) + Math.floor(shelves / 2) + randInt(shelves, random);
  switch (slot) {
    case 0: return Math.floor(Math.max(1, xpBase / 3));
    case 1: return Math.floor((2 * xpBase) / 3) + 1;
    default: return Math.floor(Math.max(xpBase, 2 * shelves));
  }
}

/** What one level of an enchantment costs to apply, in levels. */
export function lapisCostForSlot(slot) {
  return slot === 2 ? 3 : slot === 1 ? 2 : 1;
}

/**
 * An item's enchantability: a material property that widens the random spread of the enchantment cost.
 *
 * The wiki tabulates the figures and armour differs from the same material's tools -- golden armour is 25
 * where golden tools are 22, and iron armour 9 where iron tools are 14 -- so the two tables are separate
 * and the item's own suffix decides which applies. Anything not named falls to 1, which is vanilla's value
 * for a book, a bow, a crossbow, a fishing rod, a trident and every custom item.
 */
export function enchantabilityOf(itemId) {
  if (typeof itemId !== 'string' || !itemId) return 1;
  const material = itemId.split('_')[0];
  const armour = /_(helmet|chestplate|leggings|boots)$/.test(itemId);
  if (ENCHANTABILITY_BY_ITEM[itemId] !== undefined) return ENCHANTABILITY_BY_ITEM[itemId];
  const table = armour ? ARMOUR_ENCHANTABILITY : ENCHANTABILITY_BY_MATERIAL;
  return table[material] ?? 1;
}

/** Items whose enchantability is not their material's: the mace's is 15 (its wiki infobox). */
const ENCHANTABILITY_BY_ITEM = { mace: 15 };

/** Vanilla's enchantability by material for tools and weapons, from the mechanics page's table. */
const ENCHANTABILITY_BY_MATERIAL = {
  golden: 22,
  wooden: 15,
  leather: 15,
  netherite: 15,
  iron: 14,
  copper: 13,
  chainmail: 12,
  diamond: 10,
  stone: 5,
};

/**
 * The same table's armour column, which is not the tools column for four of the materials.
 *
 * `turtle` is here, not in the tools table: the wiki's armour row names the Turtle Shell, whose 9 is the
 * same figure as iron armour, and this game's item is `turtle_helmet`. Without the entry the material
 * lookup fell through to the "all other items" value of 1, so a turtle shell was as hard to enchant as a
 * book and could never reach the higher cost ranges.
 */
const ARMOUR_ENCHANTABILITY = {
  golden: 25, leather: 15, netherite: 15, iron: 9, chainmail: 12, diamond: 10, copper: 8, turtle: 9,
};

/**
 * The enchantment cost, which decides which enchantments are candidates and at what level.
 *
 * `eCost = round((xpCost + 1 + randInt(floor(enchantability / 4)) * 2) * (1 + randTri(0.15)))`, where
 * `randTri(n)` is `(randFloat() + randFloat() - 1) * n`.
 *
 * This is the step the game was missing entirely. It rolled an enchantment first and then invented a
 * level from the slot's cost, so a level V Sharpness could appear on a sword with no bookshelves -- the
 * cost never entered into it. Here the cost decides: an enchantment is a candidate only if some level's
 * range contains the cost, and the level is the highest one that does.
 */
export function enchantmentCost(xpCost, enchantability, random = Math.random) {
  const spread = Math.floor((enchantability || 1) / 4);
  const tri = (random() + random() - 1) * 0.15;
  const base = xpCost + 1 + randInt(spread, random) + randInt(spread, random);
  return Math.round(base * (1 + tri));
}

// --- selection -----------------------------------------------------------------

/**
 * The highest level of an enchantment whose cost range contains `cost`, or 0 for none.
 *
 * "The enchantment's highest level for which the enchantment cost falls within its cost range is the
 * candidate, and if the cost is not within any of its ranges, the enchantment is removed."
 */
export function levelForCost(def, cost) {
  if (!def?.cost) return 0;
  for (let level = def.cost.length; level >= 1; level--) {
    const [min, max] = def.cost[level - 1];
    if (cost >= min && cost <= max) return level;
  }
  return 0;
}

/** Pick one entry from a weighted list. */
function weightedPick(candidates, random) {
  let total = 0;
  for (const c of candidates) total += c.def.weight ?? 1;
  let roll = random() * total;
  for (const c of candidates) {
    roll -= c.def.weight ?? 1;
    if (roll < 0) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * Choose the enchantments a slot produces, given the enchantment cost.
 *
 * The wiki's loop: select a candidate by weight, drop it and everything it conflicts with, stop on a
 * `cost + 50` chance or when nothing is left, halve the cost and go again.
 *
 * The last step is the one vanilla adds for books at an enchanting table: of the selected enchantments,
 * one is removed at random. Note that this removes *one*, not down to one -- a book that selected three
 * keeps two, which is where a table-enchanted book with two enchantments comes from.
 *
 * @param {Array<{key: string, def: object}>} candidates
 * @param {number} cost
 * @param {() => number} random
 * @param {{ removeOneForBook?: boolean }} [options]
 */
export function selectEnchantments(candidates, cost, random, options = {}) {
  const remaining = [...candidates];
  const chosen = [];
  let current = Math.max(1, Math.floor(cost));
  for (;;) {
    if (!remaining.length) break;
    const picked = weightedPick(remaining, random);
    chosen.push(picked.key);
    // Step 2: the pick and its incompatible neighbours leave the pool.
    const banned = new Set([picked.key, ...incompatibleWith(picked.key)]);
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (banned.has(remaining[i].key)) remaining.splice(i, 1);
    }
    // Step 3: `random(50) <= current` continues, which is a `(current + 1) / 50` chance. This is the
    // wiki's "chance of `eCost + 150` fails" written as a continuation, and at a bottom-slot cost of 30
    // it carries on nearly two thirds of the time -- which is why a good slot often lands two
    // enchantments rather than one.
    if (!(random() * 50 < current + 1)) break;
    current = Math.max(1, Math.floor(current / 2));
  }
  if (options.removeOneForBook && chosen.length > 1) {
    chosen.splice(Math.min(chosen.length - 1, Math.floor(random() * chosen.length)), 1);
  }
  return chosen;
}

// --- offers --------------------------------------------------------------------

/** One integer in `[0, max)`, clamped so a `random()` of exactly 1 cannot index past the end. */
function pickIndex(length, random) {
  if (length <= 0) return -1;
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

/** Format an enchantment in the shape the inventory carries. */
export function enchantmentEntry(key, level) {
  const def = ENCHANTMENT_REGISTRY[key];
  if (!def) return null;
  return { id: key, name: def.name, level };
}

/**
 * Roll a single enchantment an item could carry, in the inventory's own `{id, name, level}` shape.
 *
 * Used by the trade tables, where a librarian's book or an armorer's diamond gear is handed over already
 * enchanted. `generateEnchantmentOffers` keeps its own three-slot presentation.
 *
 * @returns {Array<{id: string, name: string, level: number}>} empty when the item cannot be enchanted
 */
export function rollEnchantmentFor(itemId, { random = Math.random, allowTreasure = false, exclude = [] } = {}) {
  const eligible = eligibleEnchantments(itemId, { allowTreasure, exclude });
  if (!eligible.length) return [];
  const pick = eligible[pickIndex(eligible.length, random)];
  const level = 1 + pickIndex(pick.def.maxLevel, random);
  return [enchantmentEntry(pick.key, level)];
}

/**
 * Vanilla's three offers for an item, at a given bookshelf count.
 *
 * Each slot has its own experience cost, and the cost is what decides the enchantments -- there is no
 * separate level roll. Returns an empty list when the item cannot be enchanted or when nothing it can
 * take is within reach, which is the state the wiki describes as "it will be possible to select the slot
 * at the enchanting table, but nothing will happen".
 *
 * @param {{id: string, enchantments?: Array}|null} item
 * @param {number} bookshelfCount  0 to 15; more is capped
 * @param {() => number} [random]
 * @returns {Array<object>}
 */
export function generateEnchantmentOffers(item, bookshelfCount, random = Math.random) {
  if (!item || !isEnchantableItem(item)) return [];
  const candidates = eligibleEnchantments(item.id);
  if (!candidates.length) return [];

  const xp = enchantabilityOf(item.id);
  const isBook = item.id === 'book';
  const offers = [];

  for (const slot of [0, 1, 2]) {
    const xpCost = experienceCost(slot, bookshelfCount, random);
    const eCost = enchantmentCost(xpCost, xp, random);

    // Only the levels whose range contains the cost are candidates, at their highest such level.
    const pool = [];
    for (const { key, def } of candidates) {
      const level = levelForCost(def, eCost);
      if (level > 0) pool.push({ key, def, level });
    }
    if (!pool.length) continue;

    const keys = selectEnchantments(pool, eCost, random, { removeOneForBook: isBook });
    const enchantments = keys
      .map((key) => {
        const found = pool.find((p) => p.key === key);
        return found ? enchantmentEntry(key, found.level) : null;
      })
      .filter(Boolean);
    if (!enchantments.length) continue;

    const [primary, ...additional] = enchantments;
    offers.push({
      slot,
      levelRequirement: xpCost,
      // The player pays the displayed cost in levels; the wiki's tables are the source of both numbers
      // and they are the same number, which is why they were separate fields before and are not now.
      levelCost: xpCost,
      xpCost,
      lapisCost: lapisCostForSlot(slot),
      enchantmentCost: eCost,
      primary,
      additional,
      runes: generateRunes(6, random),
      hint: `${primary.name}...?`,
    });
  }

  return offers;
}

/**
 * Applies the chosen enchantment offer to the item, deducting levels and lapis.
 */
export function applyEnchantment(item, offer, player, ui = null, sounds = null) {
  if (!item || !offer || !player) return false;

  const isCreative = player.gamemode === 'creative';

  // Validate player level
  if (!isCreative && (player.level || 0) < offer.levelRequirement) return false;

  // Consume levels
  if (!isCreative) {
    consumePlayerLevels(player, offer.levelCost, ui);
  }

  // Attach enchantments. An offer is an offer for a *bare* item, but a caller can hand one an item that
  // already carries something -- an anvil path, or a test -- and overwriting the array there silently
  // destroyed the enchantments that were already paid for.
  const all = [offer.primary, ...(offer.additional || [])].filter(Boolean);
  const existing = Array.isArray(item.enchantments) ? item.enchantments : [];
  item.enchantments = existing.length ? existing.concat(all) : all;

  // If item was a Book, convert to an Enchanted Book
  if (item.id === 'book') {
    item.id = 'enchanted_book';
    item.name = 'Enchanted Book';
  }

  // Audio & UI
  if (sounds?.playEnchant) {
    sounds.playEnchant();
  }

  if (ui?.updateStats) {
    ui.updateStats();
  }
  advancementEvent('enchant');

  return true;
}

/**
 * Generates random rune string from the Standard Galactic Alphabet.
 */
export function generateRunes(length = 8, random = Math.random) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const rune = GALACTIC_RUNES[pickIndex(GALACTIC_RUNES.length, random)];
    str += (i > 0 ? ' ' : '') + rune;
  }
  return str;
}

/**
 * Counts bookshelves surrounding an enchanting table according to Minecraft mechanics.
 * Must be within 2 blocks horizontally in a 5x5 area with 1 block of air between bookshelf & table,
 * at height dy in [0, 1].
 */
export function calculateBookshelfCount(world, tableX, tableY, tableZ) {
  if (!world) return 0;
  let count = 0;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      // Must be on perimeter (distance 2) or corners
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;

      for (let dy = 0; dy <= 1; dy++) {
        const bx = tableX + dx;
        const by = tableY + dy;
        const bz = tableZ + dz;

        if (world.getVoxel(bx, by, bz) === BLOCKS.BOOKSHELF) {
          // Check unobstructed air space between table and bookshelf
          const airX = tableX + Math.sign(dx) * (Math.abs(dx) === 2 ? 1 : 0);
          const airZ = tableZ + Math.sign(dz) * (Math.abs(dz) === 2 ? 1 : 0);
          const airBlock = world.getVoxel(airX, by, airZ);

          if (airBlock === BLOCKS.AIR) {
            count++;
          }
        }
      }
    }
  }

  return Math.min(15, count);
}

/**
 * Manager class tracking open Enchanting Table position and state.
 */
export class EnchantingManager {
  constructor(game) {
    this.game = game;
    this.openTablePos = null;
    this.currentOffers = [];
    this.slottedItem = null;
    this.slottedLapis = null;
  }

  interact(x, y, z, player) {
    this.openTablePos = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    if (this.game?.ui?.openEnchantingTable) {
      this.game.ui.openEnchantingTable(this.openTablePos.x, this.openTablePos.y, this.openTablePos.z);
    }
  }

  close() {
    this.openTablePos = null;
    this.currentOffers = [];
    this.slottedItem = null;
    this.slottedLapis = null;
  }

  getBookshelvesAround(x, y, z) {
    const world = this.game?.world;
    return calculateBookshelfCount(world, x, y, z);
  }
}
