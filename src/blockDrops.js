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
import { FUTURE_BLOCK_DEFS } from './futureContent.js';
import { futureDropRules } from './futureContentWiki.js';

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
  // Poplar leaves (red, orange and yellow): "other Saplings" 5% -- a poplar sapling -- and sticks 2%.
  red_poplar_leaves: [['stick', 0.02], ['poplar_sapling', 0.05]],
  orange_poplar_leaves: [['stick', 0.02], ['poplar_sapling', 0.05]],
  yellow_poplar_leaves: [['stick', 0.02], ['poplar_sapling', 0.05]],

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

let blockIdsByName = null;
/** The block id a normalised block name belongs to (the lowest, for names several states share), or null. */
function blockIdByName(name) {
  if (!blockIdsByName) {
    blockIdsByName = new Map();
    for (const [id, def] of Object.entries(BLOCK_DEFS)) {
      const key = normalise(def?.name);
      if (key && !blockIdsByName.has(key)) blockIdsByName.set(key, Number(id));
    }
  }
  return blockIdsByName.get(name) ?? null;
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
  // Found by the wiki parity audit's B-SELF-DROP case (src/resourceWikiAudit.js); each one gave itself back.
  // Mushroom Block: "a 77.77% chance of dropping 0, an 11.11% chance of dropping 1, and an 11.11% chance of
  // dropping 2 mushrooms of the corresponding type" -- the stem drops nothing (NO_SELF_DROP below).
  red_mushroom_block: 'red_mushroom',
  brown_mushroom_block: 'brown_mushroom',
  // Chorus Plant: "Upon breaking, a chorus plant drops 0–1 chorus fruit."
  chorus_plant: 'chorus_fruit',
  // Soul Campfire: "A soul campfire drops soul soil" -- a block, which `baseBlockDrop` resolves by name.
  soul_campfire: 'soul_soil',
  // Sweet berry bush: this game models it as a single, mature block (farming.js), and a mature bush gives "2-3" sweet
  // berries when broken (wiki, Sweet Berry Bush) -- not itself, which no tool collects.
  sweet_berry_bush: 'sweet_berries',
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
  let item = override ?? def.dropItem ?? def.drop ?? id;
  const range = BASE_DROP_COUNTS[key];
  const count = range ? Math.max(0, range[0] + Math.floor(random() * (range[1] - range[0] + 1))) : 1;
  if (count === 0) return null;
  // An override naming a block (the soul campfire's soul soil) drops that block, not an item of the name.
  if (override !== undefined && isBlockName(override)) {
    item = blockIdByName(override);
    if (item !== null) return { id: item, isBlock: true, count };
    item = override;
  }
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
  // From the blocks' wiki pages (Breaking sections), found by the wiki parity audit. A negative minimum is a
  // vanilla "uniform -6..2, at least 0" roll: the mushroom blocks' 7-in-9 chance of nothing.
  red_mushroom_block: [-6, 2],
  brown_mushroom_block: [-6, 2],
  chorus_plant: [0, 1],
  creaking_heart: [1, 3], // "Otherwise, they drop 1–3 resin clumps" (its definition already drops the resin clump)
  soul_campfire: [1, 1],
  ender_chest: [8, 8], // "Ender chest drops 8 obsidian blocks when it's destroyed using a tool without Silk Touch."
  copper_ore: [2, 5], // "Breaking copper ore drops 2-5 raw copper"
  deepslate_copper_ore: [2, 5],
  lapis_lazuli_ore: [4, 9], // "the block drops 4–9 lapis lazuli"
  deepslate_lapis_lazuli_ore: [4, 9],
  nether_gold_ore: [2, 6], // "Nether gold ore drops 2-6 gold nuggets when mined with any pickaxe."
  glowstone: [2, 4], // "it drops 2–4 glowstone dust"
  amethyst_cluster: [4, 4], // "Breaking an amethyst cluster with a pickaxe drops 4 shards"
  sweet_berry_bush: [2, 3],
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

// --- the tool in hand: shears and Silk Touch ------------------------------------------------------------------
//
// `blockDrops` answers for a block broken with no special tool. Vanilla has two tools that change the answer,
// and this game had neither: every leaf, pane of glass, sculk block and vine gave itself back to a bare hand,
// and Silk Touch did nothing at all. Both found by the wiki parity audit's B-SELF-DROP case, which compares
// each block's {{breaking row}} ("drop=0": it does not give itself) with what this file drops.
//
// Every entry below is from the block's wiki page, Breaking section; the quotes are in the comments.

const LEAVES = ['oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves',
  'mangrove_leaves', 'cherry_leaves', 'pale_oak_leaves', 'azalea_leaves', 'flowering_azalea_leaves'];
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
  'purple', 'blue', 'brown', 'green', 'red', 'black'];
const CORALS = ['tube', 'brain', 'bubble', 'fire', 'horn'];

/**
 * Blocks that give themselves only to shears. "Leaves can be obtained only with shears or tools enchanted with
 * Silk Touch"; vines: "using shears is the only way to collect them"; dead bush: "When shears are used, a dead
 * bush drops itself"; small dripleaf: "can be obtained by mining it using shears"; hanging roots: "can only be
 * collected using shears"; pale hanging moss: "only when mined with shears or a tool enchanted with Silk Touch";
 * the grass plants, nether sprouts, seagrass and glow lichen likewise (their breaking rows: shears=1, drop=0);
 * cobweb: shears collect the web itself, a sword its string; twisting and weeping vines "always drop a single
 * twisting vine when broken with shears or with a tool enchanted with Silk Touch".
 */
export const SHEARS_COLLECT = new Set([
  ...LEAVES, 'vine', 'glow_lichen', 'nether_sprouts', 'seagrass', 'tall_seagrass', 'pale_hanging_moss', 'short_grass',
  'fern', 'tall_grass', 'large_fern', 'dead_bush', 'hanging_roots', 'small_dripleaf', 'cobweb',
  'twisting_vines', 'twisting_vines_plant', 'weeping_vines', 'weeping_vines_plant',
]);

/** What shears give where it is not the block itself: tall grass gives two short grass, a large fern two ferns. */
const SHEARS_GIVE = {
  tall_grass: ['short_grass', 2], large_fern: ['fern', 2], tall_seagrass: ['seagrass', 2],
  twisting_vines_plant: ['twisting_vines', 1], weeping_vines_plant: ['weeping_vines', 1],
};

/**
 * Blocks that give themselves to a Silk Touch tool, from each page's own sentence ("Glass drops itself only if it
 * is broken with a tool enchanted with Silk Touch", "If a stone is mined with a Silk Touch enchanted pickaxe, it
 * drops itself", "Ender chest drops itself when it's destroyed using a tool with Silk Touch", ...). Not here, on
 * the same pages' word: vines ("does not allow for collection, even with Silk Touch"), frosted ice ("Breaking it
 * with Silk Touch drops nothing"), dirt paths and farmland in Java ("always drop dirt"), cake ("cannot be
 * recollected even with the use of Silk Touch"), and the spawners, vaults, budding amethyst, frogspawn and powder
 * snow, which no tool collects.
 */
export const SILK_TOUCH_COLLECTS = new Set([
  ...LEAVES, 'glass', 'glass_pane', 'tinted_glass', ...COLOURS.flatMap((c) => [`${c}_stained_glass`, `${c}_stained_glass_pane`]),
  'ice', 'packed_ice', 'blue_ice', 'sculk', 'sculk_vein', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker',
  'sculk_catalyst', 'bee_nest', 'bookshelf', 'chiseled_bookshelf', 'red_mushroom_block', 'brown_mushroom_block',
  'mushroom_stem', 'campfire', 'soul_campfire', 'clay_block', 'glowstone', 'sea_lantern', 'melon', 'snow_block',
  'ender_chest', 'stone', 'deepslate', 'grass_block', 'mycelium', 'podzol', 'crimson_nylium', 'warped_nylium',
  'gilded_blackstone', 'amethyst_cluster', 'small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud',
  'creaking_heart', 'turtle_egg', 'pale_hanging_moss', 'decorated_pot',
  // Gravel: "Gravel drops itself when destroyed using a tool with Silk Touch." Snow: "If a shovel is enchanted with
  // Silk Touch, snow drops itself at one item per layer."
  'gravel', 'snow',
  'twisting_vines', 'twisting_vines_plant', 'weeping_vines', 'weeping_vines_plant', 'cobweb',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'redstone_ore', 'copper_ore', 'lapis_lazuli_ore',
  'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore', 'deepslate_diamond_ore', 'deepslate_emerald_ore',
  'deepslate_redstone_ore', 'deepslate_copper_ore', 'deepslate_lapis_lazuli_ore', 'nether_gold_ore', 'nether_quartz_ore',
  ...CORALS.flatMap((c) => [`${c}_coral`, `${c}_coral_block`, `${c}_coral_fan`, `${c}_coral_wall_fan`,
    `dead_${c}_coral`, `dead_${c}_coral_fan`, `dead_${c}_coral_wall_fan`]),
]);

/**
 * Blocks whose own block never drops without shears or Silk Touch: the base drop that `blockDrops` would give is
 * withheld (a leaf's bonus sapling, stick and apple still roll). The "drop=0" rows that had been giving
 * themselves back, plus frogspawn and powder snow (no tool collects them) and the trial spawner and vault.
 */
export const NO_SELF_DROP = new Set([
  ...LEAVES, 'glass', 'glass_pane', ...COLOURS.flatMap((c) => [`${c}_stained_glass`, `${c}_stained_glass_pane`]),
  'ice', 'packed_ice', 'blue_ice', 'sculk', 'sculk_vein', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker',
  'sculk_catalyst', 'bee_nest', 'chiseled_bookshelf', 'mushroom_stem', 'vine', 'glow_lichen', 'nether_sprouts',
  'seagrass', 'tall_seagrass', 'pale_hanging_moss', 'small_dripleaf', 'hanging_roots', 'frogspawn', 'powder_snow',
  'trial_spawner', 'vault', 'turtle_egg',
  'twisting_vines', 'twisting_vines_plant', 'weeping_vines', 'weeping_vines_plant',
  ...CORALS.flatMap((c) => [`${c}_coral`, `${c}_coral_fan`, `${c}_coral_wall_fan`, `dead_${c}_coral`, `dead_${c}_coral_fan`, `dead_${c}_coral_wall_fan`]),
]);

// The post-1.21.4 blocks' rules, from their wiki breaking rows (futureContentWiki.js).
{
  const future = futureDropRules(FUTURE_BLOCK_DEFS);
  for (const k of future.shears) SHEARS_COLLECT.add(k);
  for (const k of future.silk) SILK_TOUCH_COLLECTS.add(k);
  for (const k of future.noSelf) NO_SELF_DROP.add(k);
}

/** Twisting and weeping vines: "They have a 33% chance to drop a single twisting vine when broken." */
const CHANCE_SELF = { twisting_vines: 1 / 3, twisting_vines_plant: 1 / 3, weeping_vines: 1 / 3, weeping_vines_plant: 1 / 3 };
const CHANCE_SELF_ITEM = { twisting_vines_plant: 'twisting_vines', weeping_vines_plant: 'weeping_vines' };

/**
 * A block's own drop by name, as the block itself -- the way a block's base drop is spelled (glass drops block 11)
 * and the way the inventory holds a placeable block: the block that name belongs to (seagrass for tall seagrass),
 * else this block.
 */
function selfDrop(id, name, count = 1) {
  const named = blockIdByName(name);
  return { id: named ?? id, isBlock: true, count };
}

/**
 * What breaking this block with this tool yields: `blockDrops` with the shears and Silk Touch rules applied.
 *
 * @param {number} id
 * @param {{toolId?: string|null, silkTouch?: boolean}} tool the held item's id and whether it carries Silk Touch
 * @param {() => number} random
 * @returns {Array<{id: (string|number), isBlock: boolean, count: number}>}
 */
export function harvestDrops(id, { toolId = null, silkTouch = false, fortune = 0, age = null } = {}, random = Math.random) {
  const def = BLOCK_DEFS[id];
  if (!def || id === BLOCKS.AIR || def.liquid) return [];
  const key = bonusKeyFor(id);
  // Nether wart keeps its age in the world's block state (netherPlants.js): a mature one (age 3) gives 2-4 warts,
  // and Fortune raises the most by one per level; a young one gives one (wiki, Nether Wart; Fortune).
  if (key === 'nether_wart' && age !== null) {
    const count = age >= 3 ? 2 + Math.floor(random() * (3 + fortune)) : 1;
    return [{ id: 'nether_wart', isBlock: false, count }];
  }
  if (silkTouch) {
    if (SILK_TOUCH_COLLECTS.has(key)) return [selfDrop(id, CHANCE_SELF_ITEM[key] ?? key)];
    // Infested Block: "When mined with a tool enchanted with Silk Touch, the equivalent non-infested block is
    // dropped without spawning a silverfish."
    if (key.startsWith('infested_')) {
      const plain = blockIdByName(key.slice('infested_'.length));
      if (plain !== null) return [{ id: plain, isBlock: true, count: 1 }];
    }
  }
  if (toolId === 'shears' && SHEARS_COLLECT.has(key)) {
    const [give, count] = SHEARS_GIVE[key] ?? [key, 1];
    return [selfDrop(id, give, count)];
  }
  let drops = fortune > 0 ? blockDropsWithFortune(id, fortune, toolId, random) : blockDrops(id, random);
  if (NO_SELF_DROP.has(key)) {
    const self = new Set([id, blockIdByName(key), blockIdByName(CHANCE_SELF_ITEM[key] ?? key)]);
    const names = new Set([key, SHEARS_GIVE[key]?.[0]].filter(Boolean));
    drops = drops.filter((d) => !(d.isBlock ? self.has(d.id) : names.has(normalise(d.id))));
  }
  const selfChance = fortune > 0 && CHANCE_SELF[key] ? FORTUNE_VINES[Math.min(fortune, 3)] : CHANCE_SELF[key];
  if (selfChance && random() < selfChance) drops.push(selfDrop(id, CHANCE_SELF_ITEM[key] ?? key));
  return drops;
}

// --- Fortune ----------------------------------------------------------------------------------------------------
//
// Wiki, Fortune. Three rules, by block:
//   * Ores (and the amethyst cluster): "the chance for no bonus drops is 2/(level+2) and if a bonus is applied, there
//     is an equal chance for any number of drops between 2 and level+1" -- a multiplier on the drop. For ores "a
//     pickaxe with Fortune" is needed.
//   * Discrete random (creaking heart, glowstone, melon, redstone ore, sea lantern): "Fortune increases the maximum
//     number of drops by 1 per level", each amount equally likely, capped at glowstone 4, sea lantern 5, melon 9.
//   * Tabulated chances: flint from gravel (10%, 1/7, 1/4, 100%), saplings, sticks and apples from leaves, and twisting
//     and weeping vines (33%, 55%, 77%, 100%). Short grass and ferns: the seed's chance is fixed, but "Fortune
//     increases the maximum number of seeds that can be dropped by 2".
// Silk Touch takes precedence ("Silk Touch and Fortune are mutually exclusive"), which harvestDrops already does.
// Crops (wheat, carrots, potatoes, beetroot) drop through farming.js and are not covered here.

const FORTUNE_ORES = new Set(['coal_ore', 'diamond_ore', 'emerald_ore', 'lapis_lazuli_ore', 'iron_ore', 'copper_ore', 'gold_ore',
  'deepslate_coal_ore', 'deepslate_diamond_ore', 'deepslate_emerald_ore', 'deepslate_lapis_lazuli_ore', 'deepslate_iron_ore',
  'deepslate_copper_ore', 'deepslate_gold_ore', 'nether_gold_ore', 'nether_quartz_ore', 'amethyst_cluster']);
const FORTUNE_DISCRETE_CAP = { creaking_heart: Infinity, glowstone: 4, melon: 9, redstone_ore: Infinity, deepslate_redstone_ore: Infinity, sea_lantern: 5, sweet_berry_bush: Infinity };
const FORTUNE_FLINT = [0.1, 1 / 7, 0.25, 1];
const FORTUNE_SAPLING = [1 / 20, 1 / 16, 1 / 12, 1 / 10];
const FORTUNE_JUNGLE_SAPLING = [1 / 40, 1 / 36, 1 / 32, 1 / 24];
const FORTUNE_STICK = [1 / 50, 1 / 45, 1 / 40, 1 / 30];
const FORTUNE_APPLE = [1 / 200, 1 / 180, 1 / 160, 1 / 120];
const FORTUNE_VINES = [1 / 3, 0.55, 0.77, 1];

/** The ore multiplier for a Fortune level: 1 with chance 2/(L+2), else 2..L+1 equally. */
export function fortuneOreMultiplier(level, random = Math.random) {
  if (level <= 0 || random() < 2 / (level + 2)) return 1;
  return 2 + Math.floor(random() * level);
}

/** The bonus-drop chance a leaf, gravel or grass row has at this Fortune level. */
function fortuneChance(item, base, level) {
  const at = (table) => table[Math.min(level, 3)];
  if (item === 'flint') return at(FORTUNE_FLINT);
  if (item === 'apple') return at(FORTUNE_APPLE);
  if (item === 'stick' && base <= 0.02) return at(FORTUNE_STICK);
  if (/_sapling$|^mangrove_propagule$|^azalea$|^flowering_azalea$/.test(item)) return base < 0.05 ? at(FORTUNE_JUNGLE_SAPLING) : at(FORTUNE_SAPLING);
  return base;
}

/** `blockDrops` with a Fortune tool, by the three rules above. */
export function blockDropsWithFortune(id, level, toolId = null, random = Math.random) {
  const key = bonusKeyFor(id);
  const out = [];
  const rule = REPLACEMENT_DROPS[key];
  const replaced = rule && random() < fortuneChance(rule.id, rule.chance, level) ? { id: rule.id, isBlock: isBlockName(rule.id), count: 1 } : null;
  let base = replaced ? null : baseBlockDrop(id, random);
  if (base && FORTUNE_DISCRETE_CAP[key] !== undefined && BASE_DROP_COUNTS[key]) {
    const [min, max] = BASE_DROP_COUNTS[key];
    base = { ...base, count: Math.min(FORTUNE_DISCRETE_CAP[key], min + Math.floor(random() * (max + level - min + 1))) };
  }
  if (base && FORTUNE_ORES.has(key) && (toolId === null || /_pickaxe$/.test(toolId))) {
    base = { ...base, count: base.count * fortuneOreMultiplier(level, random) };
  }
  if (replaced) out.push(replaced); else if (base) out.push(base);
  for (const [item, chance] of BONUS_DROPS[key] ?? []) {
    if (!(random() < fortuneChance(item, chance, level))) continue;
    // Short grass and ferns: one seed, or up to 1 + 2 x level with Fortune, each amount equally likely.
    const count = item === 'wheat_seeds' ? 1 + Math.floor(random() * (1 + 2 * level)) : 1;
    out.push({ id: item, isBlock: isBlockName(item), count });
  }
  return out;
}
