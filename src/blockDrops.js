// What a block gives up when it is broken.
//
// There are two kinds of drop and the game only ever had one of them.
//
// The **base drop** is a property of the block: `BLOCK_DEFS[id].drop` (a block id) or `.dropItem` (an item
// name), and a block that declares neither gives itself. `getBlockDrop` has always resolved that, and its
// contract is pinned by tests, so it still does -- it now lives here so the rule can be reached without
// Three.js.
//
// The **bonus drops** are the probabilistic extras vanilla has: an apple from an oak leaf, seeds from a
// handful of grass. `BLOCK_HARVEST` cannot carry them -- it is generated from minecraft-data, which has no
// probability data -- so they are hand-written below. Before this, `short_grass` and its three relatives
// declared `drop: null`, which is why wheat seeds could not be obtained at all, and no leaf ever gave an
// apple.
//
// `blockDrops` is the whole answer for one block: the base drop plus whatever the rolls produced.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/**
 * Probabilistic drops, keyed by the block's name.
 *
 * Java Edition 1.21, broken by a player without Silk Touch. Leaves give their sapling at 5% (jungle at
 * 2.5%) and a stick at 2%; oak and dark oak also give an apple at 0.5%. The four grass plants give a
 * wheat seed at 12.5%, which is their only drop -- they declare none outright.
 *
 * Keyed by name rather than by block id so it keeps working for a block the game registers through either
 * route, and `tests/blockDrops.test.js` asserts that every key here is a registered block, so a typo fails
 * rather than quietly doing nothing.
 */
export const BONUS_DROPS = {
  // --- leaves ------------------------------------------------------------------
  oak_leaves: [['apple', 0.005], ['stick', 0.02], ['oak_sapling', 0.05]],
  dark_oak_leaves: [['apple', 0.005], ['stick', 0.02], ['dark_oak_sapling', 0.05]],
  jungle_leaves: [['stick', 0.02], ['jungle_sapling', 0.025]],
  spruce_leaves: [['stick', 0.02], ['spruce_sapling', 0.05]],
  birch_leaves: [['stick', 0.02], ['birch_sapling', 0.05]],
  acacia_leaves: [['stick', 0.02], ['acacia_sapling', 0.05]],
  cherry_leaves: [['stick', 0.02], ['cherry_sapling', 0.05]],
  pale_oak_leaves: [['stick', 0.02], ['pale_oak_sapling', 0.05]],
  mangrove_leaves: [['stick', 0.02], ['mangrove_propagule', 0.05]],
  azalea_leaves: [['stick', 0.02], ['azalea', 0.05]],
  flowering_azalea_leaves: [['stick', 0.02], ['flowering_azalea', 0.05]],

  // --- the grass plants, whose only drop is the seed ---------------------------
  short_grass: [['wheat_seeds', 0.125]],
  fern: [['wheat_seeds', 0.125]],
  tall_grass: [['wheat_seeds', 0.125]],
  large_fern: [['wheat_seeds', 0.125]],

  // --- miscellaneous ----------------------------------------------------------
  // Vanilla gives nought to two sticks; modelled as the average one, because the roll table here is a
  // chance per item rather than a distribution and a second shape would be more mechanism than the one
  // block needs.
  dead_bush: [['stick', 0.5]],
};

/**
 * Drops that REPLACE a block's base drop rather than adding to it.
 *
 * Gravel is the one this game needs. Vanilla gives flint 10% of the time *instead of* the gravel, and a
 * bonus table cannot express that -- a bonus would hand over both. `flint` had no source anywhere, and it is
 * an ingredient in fifty-three of this game's recipes, including `arrow` (flint and stick and feather) and
 * `flint_and_steel`, so neither arrows nor a firestarter could be crafted and nothing said why.
 *
 * Keyed by name for the same reason `BONUS_DROPS` is, and pinned by the same test that every key is a
 * registered block.
 */
export const REPLACEMENT_DROPS = {
  gravel: { id: 'flint', chance: 0.1 },
};

const normalise = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

/**
 * Block names, normalised, so a named drop can be told apart from an item.
 *
 * `ITEMS` does not hold a block's item form -- `oak_sapling` and `oak_log` are blocks, and the registry
 * joins them to their item form separately -- so `ITEMS[name]` cannot answer this. Looking the name up in
 * the block definitions can: a sapling dropped from a leaf is a block and an apple is not, and getting
 * that wrong puts a block in the inventory claiming to be an item.
 */
let blockNames = null;
function isBlockName(name) {
  if (!blockNames) {
    blockNames = new Set();
    for (const def of Object.values(BLOCK_DEFS)) {
      const key = normalise(def?.name);
      if (key) blockNames.add(key);
    }
  }
  return blockNames.has(name);
}

/**
 * Blocks whose drop is a different item from the one their definition names.
 *
 * Keyed by vanilla name like the other tables here, and consulted *before* the definition's `dropItem`,
 * because several of these blocks are defined in the generated content file, where a hand edit would be lost
 * on the next regeneration -- `melon` and `campfire` among them. This file is the one place a drop rule lives.
 *
 * Found by `block-drop-parity`, which compares the game's base drop against the drop vanilla's harvest row
 * names. Nine blocks disagreed, and eight of them had the wrong *item*, not just the wrong count:
 *
 *   melon         itself, where vanilla gives three to seven slices
 *   campfire      itself, where vanilla gives two charcoal
 *   iron ore      an iron ingot, where vanilla gives raw iron -- skipping the smelting step entirely
 *   gold ore      a gold ingot, for the same reason
 *   redstone ore  the ore block back, which is a duplication trick, where vanilla gives four or five dust
 *   bookshelf     itself, where vanilla gives three books
 *   snow block    itself, where vanilla gives four snowballs
 *   sea lantern   itself, where vanilla gives two or three prismarine crystals
 *   clay block    itself, where vanilla gives four clay balls
 *
 * A tenth block disagrees and is not here: vanilla's soul campfire gives two soul soil, and this game has no
 * soul soil item to give.
 */
export const DROP_ITEM_OVERRIDES = {
  melon: 'melon_slice',
  campfire: 'charcoal',
  iron_ore: 'raw_iron',
  gold_ore: 'raw_gold',
  redstone_ore: 'redstone',
  bookshelf: 'book',
  snow_block: 'snowball',
  sea_lantern: 'prismarine_crystals',
  // Keyed by the block's own name as this game spells it -- 'Clay Block' -- not vanilla's clay.
  clay_block: 'clay_ball',
};

/** The base drop for a block: the one thing it always gives up, or null when it gives nothing. */
export function baseBlockDrop(id, random = Math.random) {
  const def = BLOCK_DEFS[id];
  if (id === BLOCKS.AIR || !def || def.liquid) return null;
  const key = bonusKeyFor(id);
  const override = DROP_ITEM_OVERRIDES[key];
  // `drop: null` means the block deliberately gives nothing -- but only where no override names what it gives
  // instead, which is how a block that used to drop itself comes to drop an item.
  if (!override && def.drop === null) return null;
  const item = override ?? def.dropItem ?? def.drop ?? id;
  const range = BASE_DROP_COUNTS[key];
  const count = range ? range[0] + Math.floor(random() * (range[1] - range[0] + 1)) : 1;
  // `isBlock` says which *kind* of id the drop is, and it is not inferable from the name: a candle is both a
  // block and an item, and the door blocks name their item in `drop`, so deriving this from `isBlockName`
  // turned every door's drop into a block id. A drop that came from `dropItem` -- or from an override, which
  // is always an item -- is an item; anything else is the block's own id.
  const namedAnItem = override !== undefined || def.dropItem !== undefined;
  return { id: item, isBlock: !namedAnItem, count };
}

/** The name `BONUS_DROPS` keys a block by, matching how the block is registered rather than how it is named. */
export function bonusKeyFor(id) {
  return normalise(BLOCK_DEFS[id]?.name);
}

/**
 * The bonus drops this block's rolls produced.
 *
 * @param {number} id
 * @param {() => number} random injected so a test can ask for "always" or "never"
 * @returns {Array<{id: string, isBlock: boolean, count: number}>}
 */
export function bonusDropsFor(id, random = Math.random) {
  const table = BONUS_DROPS[bonusKeyFor(id)];
  if (!table) return [];
  const out = [];
  for (const [item, chance] of table) {
    if (!(random() < chance)) continue;
    out.push({ id: item, isBlock: isBlockName(item), count: 1 });
  }
  return out;
}

/**
 * The drop that replaces the base one, when the block has such a rule and the roll succeeds.
 *
 * @returns {{id: string, isBlock: boolean, count: number}|null}
 */
export function replacementDropFor(id, random = Math.random) {
  const rule = REPLACEMENT_DROPS[bonusKeyFor(id)];
  if (!rule) return null;
  if (!(random() < rule.chance)) return null;
  return { id: rule.id, isBlock: isBlockName(rule.id), count: 1 };
}

/**
 * How many of its item a block gives up, where vanilla's number is not one.
 *
 * Keyed by vanilla name like the other two tables, and `[min, max]` because vanilla's numbers are ranges: a
 * redstone ore gives four or five, a melon three to seven. The roll is the caller's, so an Inspector check can
 * pin it. Everything not named here gives exactly one.
 *
 * Found by `block-drop-parity`, which compares the game's base drop with the drop vanilla's harvest row
 * names. Ten blocks disagreed, and nine of them disagreed about the *item* as well: a bookshelf gave itself
 * instead of three books, a clay block gave itself instead of four clay balls, a redstone ore gave the ore
 * block back -- which is a duplication trick, not a drop.
 */
export const BASE_DROP_COUNTS = {
  bookshelf: [3, 3],
  // Keyed the way this game spells the block -- 'Clay Block' -- like the overrides above, because that is what
  // `bonusKeyFor` produces. Keyed `clay`, the count silently did not apply and the block gave one ball.
  clay_block: [4, 4],
  snow_block: [4, 4],
  sea_lantern: [2, 3],
  redstone_ore: [4, 5],
  melon: [3, 7],
  campfire: [2, 2],
  // A soul campfire is deliberately *not* here. Vanilla gives two soul soil and this game has no soul soil
  // item, so a count would only make it drop two of itself instead of one -- further from vanilla, not closer.
};

/**
 * Everything breaking this block yields: the base drop or the drop that replaces it, then any bonus drops.
 *
 * @returns {Array<{id: (string|number), isBlock: boolean, count: number}>} empty when the block yields nothing
 */
export function blockDrops(id, random = Math.random) {
  const replacement = replacementDropFor(id, random);
  const base = baseBlockDrop(id, random);
  const out = [];
  // A replacement takes the base's place: gravel gives flint or gravel, never both.
  if (replacement) out.push(replacement);
  else if (base) out.push(base);
  out.push(...bonusDropsFor(id, random));
  return out;
}
