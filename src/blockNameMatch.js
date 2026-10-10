// Comparing this game's block registry with a vanilla block list (the wiki's Block page, or the
// pinned minecraft-data cache) needs one name-matching vocabulary, because the two sides disagree
// about what a "block" is in three separate ways:
//
//   1. STATES. This game registers one id per state -- ACACIA_DOOR, ACACIA_DOOR_OPEN,
//      ACACIA_DOOR_TOP, ACACIA_DOOR_TOP_OPEN, ACACIA_DOOR_TOP_OPEN -- while the wiki has a single
//      "Acacia Door" page. 84 door ids collapse to 12 wiki pages.
//   2. SPELLING. The wiki writes "Block of Lapis Lazuli", "Block of Raw Copper", "Hay Bale" and
//      "Redstone Comparator"; this game writes LAPIS_BLOCK, RAW_COPPER_BLOCK, HAY_BLOCK and
//      COMPARATOR.
//   3. WORD ORDER AND PLURALS. "Vine"/"Vines", "Target"/"TARGET_BLOCK", "Moist Farmland"/
//      FARMLAND_MOIST.
//
// Matching on a lowercased name alone therefore reports hundreds of phantom gaps. Every caller used
// to carry its own regex list to compensate, and the lists disagreed -- which is exactly how a
// missing COBBLED_DEEPSLATE stayed hidden behind a `cobbled_deepslate -> cobblestone` alias. This
// module is the single vocabulary; scripts/parity-coverage.mjs and scripts/parity-audit/* use it.
//
// Nothing here is specific to the wiki: the input is any list of vanilla block names.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/**
 * Fold a block name to a comparison key: lowercase, letters and digits only.
 *
 * This is the level at which the two sides are COMPARABLE. It deliberately does not strip state
 * suffixes -- that is `candidateNames`' job, because whether a suffix is a state or part of a real
 * block name differs per suffix (`_wall_sign` is a block of its own in vanilla; `_open` is not).
 */
export function normaliseBlockName(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `OAK_PLANKS` -> `Oak Planks`, so a registry key can be compared as a display name. */
export function titleCaseKey(key) {
  return String(key)
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Block names vanilla spells differently from this game.
 *
 * Keyed by the FOLDED wiki/vanilla name, valued by the registry key to accept as a match. Every entry
 * here is a spelling difference, never a behaviour claim: an alias says "these two names mean the same
 * block", not "this block is implemented". Adding one is how a real spelling divergence is recorded;
 * none of them should be used to paper over a block that does not exist.
 */
export const NAME_ALIASES = {
  // "Block of X" vs this game's "X Block" / "X".
  blockofamethyst: 'AMETHYST_BLOCK',
  blockofbamboo: 'BAMBOO_BLOCK',
  blockofcopper: 'COPPER_BLOCK',
  blockofstrippedbamboo: 'STRIPPED_BAMBOO_BLOCK',
  blockoflapislazuli: 'LAPIS_BLOCK',
  blockofrawcopper: 'RAW_COPPER_BLOCK',
  blockofrawiron: 'RAW_IRON_BLOCK',
  blockofrawgold: 'RAW_GOLD_BLOCK',
  blockofredstone: 'REDSTONE_BLOCK',
  blockofcoal: 'COAL_BLOCK',
  blockofquartz: 'QUARTZ_BLOCK',
  // Trailing nouns the wiki has and this game omits.
  target: 'TARGET_BLOCK',
  haybale: 'HAY_BLOCK',
  chain: 'CHAIN',
  ironchain: 'CHAIN',
  comparator: 'COMPARATOR',
  redstonecomparator: 'COMPARATOR',
  repeater: 'REPEATER',
  redstonerepeater: 'REPEATER',
  vine: 'VINE',
  waters: 'WATER',
  // "Waxed Block of Copper" is the wiki's page for the waxed copper block; this game names that key
  // WAXED_COPPER_BLOCK and additionally has a distinct COPPER_BLOCK, so folding "Waxed Copper Block"
  // onto COPPER_BLOCK would report the unwaxed block twice.
  waxedblockofcopper: 'WAXED_COPPER_BLOCK',
  waxedcopperblock: 'WAXED_COPPER_BLOCK',
  // Words the wiki uses that this game spells as one token or differently.
  grassblock: 'GRASS',
  grass: 'GRASS',
  // The wiki's "Dirt Path" (formerly "Grass Path") has no registry entry here; the closest block the
  // game has is dirt, so that is what it folds onto. This is a deliberate approximation and is the only
  // alias in this table that is one.
  dirtpath: 'DIRT',
  farmland: 'FARMLAND',
  moistfarmland: 'FARMLAND_MOIST',
  litfurnace: 'LIT_FURNACE',
  // The wiki names the generic pressure plate and the target block without this game's `_BLOCK`
  // suffix, and the plain (non-wood) pressure plate in vanilla is the stone one. These are aliases
  // because the registry key exists under the other spelling, not because the block is approximated.
  pressureplate: 'PRESSURE_PLATE',
  targetblock: 'TARGET_BLOCK',
  vines: 'VINE',
  wetsponge: 'WET_SPONGE',
  jackolantern: 'JACK_O_LANTERN',
  carvedpumpkin: 'CARVED_PUMPKIN',
  smoothquartzblock: 'SMOOTH_QUARTZ',
  soullantern: 'SOUL_LANTERN',
  redstonelamp: 'REDSTONE_LAMP',
  redstonewire: 'REDSTONE_WIRE',
  redstoneore: 'REDSTONE_ORE',
  cakewithcandle: 'CANDLE_CAKE',
  cakewithblackcandle: 'BLACK_CANDLE_CAKE',
  cakewithbluecandle: 'BLUE_CANDLE_CAKE',
  cakewithbrowncandle: 'BROWN_CANDLE_CAKE',
  cakewithcyancandle: 'CYAN_CANDLE_CAKE',
  cakewithgraycandle: 'GRAY_CANDLE_CAKE',
  cakewithgreencandle: 'GREEN_CANDLE_CAKE',
  cakewithlightbluecandle: 'LIGHT_BLUE_CANDLE_CAKE',
  cakewithlightgraycandle: 'LIGHT_GRAY_CANDLE_CAKE',
  cakewithlimecandle: 'LIME_CANDLE_CAKE',
  cakewithmagentacandle: 'MAGENTA_CANDLE_CAKE',
  cakewithorangecandle: 'ORANGE_CANDLE_CAKE',
  cakewithpinkcandle: 'PINK_CANDLE_CAKE',
  cakewithpurplecandle: 'PURPLE_CANDLE_CAKE',
  cakewithredcandle: 'RED_CANDLE_CAKE',
  cakewithwhitecandle: 'WHITE_CANDLE_CAKE',
  cakewithyellowcandle: 'YELLOW_CANDLE_CAKE',
  bambooshoot: 'BAMBOO_SAPLING',
  blockofresin: 'RESIN_BLOCK',
  pottedazalea: 'POTTED_AZALEA_BUSH',
  pottedfloweringazalea: 'POTTED_FLOWERING_AZALEA_BUSH',
};

/**
 * State suffixes this game appends to a block id, stripped to reach the wiki's page name.
 *
 * Only suffixes that are genuinely STATES in vanilla belong here. `_wall_sign`, `_wall_torch` and
 * `_wall_banner` look like states but are separate vanilla block ids with their own wiki pages, so
 * they are deliberately absent -- stripping them would make a technical block look covered by its
 * floor-standing sibling. This game does not implement those wall variants at all, and the matcher
 * must keep reporting them as missing rather than folding them onto the floor-standing block.
 */
const STATE_SUFFIXES = ['_top_open', '_top', '_open', '_moist'];

/**
 * Suffixes that mark a second block id this game splits out of a single vanilla block.
 *
 * Beds are one vanilla block per colour that this game stores as a foot and a head, so a head id has
 * to fold back onto the single wiki page. `SKELETON_SKULL_BLOCK` carries a trailing `_block` for the
 * same reason.
 */
const SPLIT_SUFFIXES = ['_head', '_foot', '_block'];

/**
 * Every name a game block id could reasonably be listed under.
 *
 * Returns candidates most-specific first, so a caller that stops at the first hit gets the closest
 * match. Two kinds are produced:
 *
 *   - the id's own name and title case (`IRON_DOOR_OPEN` -> "Iron Door Open", "Iron Door")
 *   - the state-collapsed name (`ACACIA_DOOR_TOP_OPEN` -> "Acacia Door", the wiki's page title)
 *
 * The definition's `name` is included when it differs from the key, because generators store the
 * vanilla spelling there (`LAPIS_BLOCK` has name "Lapis Block").
 */
export function candidateNames(key) {
  const out = [];
  const add = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };

  const def = BLOCK_DEFS[BLOCKS[key]];
  add(def?.name);
  add(titleCaseKey(key));

  // State-collapsed forms, longest suffix first so `_top_open` is removed before `_open` can match
  // the tail of it.
  let base = String(key).toLowerCase();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of STATE_SUFFIXES) {
      if (base.endsWith(suffix)) {
        base = base.slice(0, -suffix.length);
        add(titleCaseKey(base));
        stripped = true;
        break;
      }
    }
  }

  // A block this game splits in two (a bed foot/head, a skull's `_block`) folds onto the one vanilla
  // name. The bare prefix is added from the collapsed `base`, not the original key, so
  // BAMBOO_DOOR_TOP_OPEN -> "Bamboo Door" rather than "Bamboo Door Top".
  for (const suffix of SPLIT_SUFFIXES) {
    if (base.endsWith(suffix)) add(titleCaseKey(base.slice(0, -suffix.length)));
  }

  return out;
}

/**
 * Index a game registry by folded name, so a vanilla name can be looked up.
 *
 * Both the registry's own names and every NAME_ALIASES entry are indexed. The aliases have to be here
 * as well as in `resolveVanillaBlock`, or a lookup that goes through the index (which is what a caller
 * iterating a block list does) would miss them: `TARGET` is only reachable as "Target" via its alias,
 * since `Target Block` is what its own name folds to.
 *
 * An alias whose folded name is already claimed by a DIFFERENT block's own candidate name is skipped.
 * This is what keeps the two directions consistent: `target` is claimed by TARGET_BLOCK's own `Target`
 * candidate, so the `target -> TARGET_BLOCK` alias must not also index it, or an iteration over the
 * block list would attribute "Target" to TARGET and leave TARGET_BLOCK looking unnamed.
 *
 * @param {Record<string, number>} [blocks] registry to index; defaults to this game's.
 * @returns {Map<string, Set<string>>} folded name -> set of registry keys claiming it
 */
export function buildGameBlockIndex(blocks = BLOCKS) {
  const index = new Map();
  const claim = (folded, key) => {
    if (!folded) return;
    if (!index.has(folded)) index.set(folded, new Set());
    index.get(folded).add(key);
  };

  for (const [key, value] of Object.entries(blocks)) {
    // GRASS_BLOCK is an alias for GRASS: same id, and indexing both would make one wiki page appear
    // to cover two blocks.
    if (key === 'GRASS_BLOCK') continue;
    if (typeof value !== 'number') continue;
    for (const name of candidateNames(key)) claim(normaliseBlockName(name), key);
  }

  for (const [folded, key] of Object.entries(NAME_ALIASES)) {
    // Only index an alias whose target actually exists. A stale alias pointing at a removed block must
    // stay invisible rather than report the block as present.
    if (!Object.prototype.hasOwnProperty.call(blocks, key)) continue;
    const owners = index.get(folded);
    if (owners && [...owners].some((owner) => owner !== key)) continue;
    claim(folded, key);
  }

  return index;
}

/**
 * Resolve a vanilla/wiki block name to the registry key(s) that implement it.
 *
 * @param {string} vanillaName a name from the wiki list or minecraft-data
 * @param {Map<string, Set<string>>} [index] from buildGameBlockIndex; built on demand
 * @returns {string[]} registry keys, empty when the game has no such block
 */
export function resolveVanillaBlock(vanillaName, index = buildGameBlockIndex()) {
  const folded = normaliseBlockName(vanillaName);
  if (!folded) return [];

  // An explicit alias wins, but only when the block it names actually exists -- a stale alias must
  // never report a missing block as present, which is the bug this module replaces.
  const aliased = NAME_ALIASES[folded];
  if (aliased) {
    if (Object.prototype.hasOwnProperty.call(BLOCKS, aliased)) return [aliased];
    return [];
  }

  const direct = index.get(folded);
  if (direct) return [...direct];
  return [];
}

/**
 * Split a vanilla block list into the names the game covers and the names it does not.
 *
 * @param {string[]} vanillaNames
 * @returns {{covered: string[], missing: string[], byVanillaName: Map<string, string[]>}}
 */
export function compareBlockLists(vanillaNames) {
  const index = buildGameBlockIndex();
  const covered = [];
  const missing = [];
  const byVanillaName = new Map();
  for (const name of vanillaNames) {
    const keys = resolveVanillaBlock(name, index);
    byVanillaName.set(name, keys);
    if (keys.length) covered.push(name);
    else missing.push(name);
  }
  return { covered, missing, byVanillaName };
}

/**
 * The reciprocal direction: which registry keys does this vanilla list name?
 *
 * This is deliberately not `byVanillaName` inverted. That map answers "what does this wiki page
 * resolve to", which is not the same question, because an alias can sit on a folded name a registry key
 * already occupies. `TARGET` folds to "target", which is exactly the name `TARGET_BLOCK` advertises as
 * its own `Target Block`/`Target` candidate -- so inverting the forward map marks TARGET as named and
 * TARGET_BLOCK as unnamed, which is backwards. Asking each key about its own names cannot do that.
 *
 * @param {string[]} vanillaNames
 * @param {Record<string, number>} [blocks]
 * @returns {{named: Set<string>, unnamed: string[]}}
 */
export function gameKeysNamedByVanilla(vanillaNames, blocks = BLOCKS) {
  const wanted = new Set(vanillaNames.map(normaliseBlockName).filter(Boolean));

  // Folding every alias once, keyed by its target, avoids re-scanning the alias table per block.
  const aliasNamesByKey = new Map();
  for (const [folded, key] of Object.entries(NAME_ALIASES)) {
    if (!aliasNamesByKey.has(key)) aliasNamesByKey.set(key, []);
    aliasNamesByKey.get(key).push(folded);
  }

  const named = new Set();
  const unnamed = [];
  for (const [key, value] of Object.entries(blocks)) {
    if (key === 'GRASS_BLOCK' || typeof value !== 'number') continue;
    const own = candidateNames(key).map(normaliseBlockName);
    const aliases = aliasNamesByKey.get(key) ?? [];
    if ([...own, ...aliases].some((n) => wanted.has(n))) named.add(key);
    else unnamed.push(key);
  }
  return { named, unnamed };
}
