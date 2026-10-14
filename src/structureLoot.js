// Structure chest loot, from the wiki's chest tables (src/structureLootData.js, generated from Module:LootChest).
//
// A chest is rolled the way the wiki's tables describe a loot table: each pool rolls between its `rolls` bounds; each
// roll picks one entry by weight and gives a stack between the entry's min and max ("empty" gives nothing). Stacks go
// into random free slots of the 27, as a chest's loot is scattered in vanilla.
//
// The wiki names items its own way (`level-enchanted-iron-leggings`, `enchanted-book-rnd`, `bottle-o'-enchanting`,
// `disc-cat`); `gameItemFor` turns those into this game's items. Enchanted entries get one enchantment the item can
// take (the game's `rollEnchantmentFor`); entries naming an enchantment (`enchanted-book-rnd-swift-sneak`) get that
// one. Entries this game has no item for are skipped and listed by `unresolvedLootItems()`.
//
// Not modelled: damaged tools' durability, explorer maps' targets (they are plain maps), the level costs behind
// "level-enchanted" items (one enchantment, like a random one), and suspicious stew's effect.

import { STRUCTURE_LOOT } from './structureLootData.js';
import { resolveItem } from './commands.js';
import { rollEnchantmentFor, enchantmentEntry, ENCHANTMENT_REGISTRY } from './enchanting.js';
import { rollVillageLoot } from './villageLoot.js';

/** Wiki names that are not just the game's name with dashes. */
const ALIASES = {
  "bottle-o'-enchanting": 'experience_bottle', 'leather-cap': 'leather_helmet', 'leather-tunic': 'leather_chestplate', 'leather-pants': 'leather_leggings',
  'raw-beef': 'beef', 'raw-cod': 'cod', 'raw-salmon': 'salmon', 'raw-mutton': 'mutton', 'raw-porkchop': 'porkchop', 'nether-quartz': 'quartz',
  'iron-chain': 'chain', 'empty-map': 'map', 'damaged-shield': 'shield', 'netherite-upgrade': 'netherite_upgrade_smithing_template',
  'glistering-melon-slice': 'glistering_melon_slice', 'block-of-diamond': 'diamond_block', 'block-of-emerald': 'emerald_block',
  'block-of-gold': 'gold_block', 'block-of-iron': 'iron_block', 'enchanted-fishing-rod': 'fishing_rod', 'random-effect-arrow': 'tipped_arrow',
  'random-effect-tipped-arrow': 'tipped_arrow', 'random-effect-potion': 'potion', 'random-effect-splash-potion': 'splash_potion',
  'random-effect-lingering-potion': 'lingering_potion', 'tipped-arrow-strong-slowness': 'tipped_arrow_of_slowness', 'ominous-bottle': 'ominous_bottle'
};
const ENCHANT_NAMES = { 'swift-sneak': 'swift_sneak', 'soul-speed': 'soul_speed', 'wind-burst': 'wind_burst', 'breach-density': ['breach', 'density'], 'mending-trident': ['mending'], 'trial-chambers': null, mending: 'mending', efficiency: 'efficiency', unbreaking: 'unbreaking', 'quick-charge': 'quick_charge' };

/**
 * A wiki loot entry name as this game's item: `{ item, enchant }`, `null` for "empty", or `undefined` when the game
 * has no such item. `enchant` is 'random', a list of enchantment ids, or null.
 */
export function gameItemFor(wikiName) {
  if (wikiName === 'empty') return null;
  let name = wikiName.replace(/-\d+(-\d+)?$/, (m) => (/^disc-fragment/.test(wikiName) ? m : ''));
  let enchant = null;
  if (/^enchanted-book/.test(name)) {
    const which = name.replace(/^enchanted-book(-rnd)?-?/, '');
    enchant = which && ENCHANT_NAMES[which] ? [].concat(ENCHANT_NAMES[which]) : 'random';
    name = 'enchanted-book';
  } else {
    const m = /^(damaged-)?(level-enchanted-|random-enchanted-|soul-speed-enchanted-)?(.+)$/.exec(name);
    if (m[2] === 'soul-speed-enchanted-') enchant = ['soul_speed'];
    else if (m[2]) enchant = 'random';
    name = m[3];
  }
  let id = ALIASES[wikiName] ?? ALIASES[name] ?? name.replace(/-/g, '_');
  if (/^disc_/.test(id)) id = id === 'disc_fragment_5' ? 'disc_fragment_5' : `music_disc_${id.slice(5)}`;
  if (/_armor_trim$/.test(id)) id = `${id}_smithing_template`;
  if (/_map$/.test(id) && id !== 'empty_map') id = 'map';
  const resolved = resolveItem(id);
  if (!resolved.ok) return undefined;
  return { item: { id: resolved.id, isBlock: resolved.isBlock }, key: resolved.key, enchant };
}

const unresolved = new Set();
/** Every wiki item name, across all tables, that this game has no item for. */
export function unresolvedLootItems() {
  for (const table of Object.values(STRUCTURE_LOOT)) for (const pool of table.pools) for (const [name] of pool.entries) if (gameItemFor(name) === undefined) unresolved.add(name);
  return [...unresolved].sort();
}

/** A small deterministic generator, so a chest's loot is a pure function of its seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hasStructureLoot = (table) => Boolean(STRUCTURE_LOOT[table]);

/**
 * Roll a chest.
 * @param {string} table  e.g. 'minecraft:chests/desert_pyramid'
 * @param {number} seed
 * @returns {Array<object|null>} 27 slots (null = empty), or the village roll for a table the wiki data lacks
 */
export function rollStructureLoot(table, seed, { slots = 27 } = {}) {
  const data = STRUCTURE_LOOT[table];
  if (!data) return rollVillageLoot(table, seed);
  const random = mulberry32(seed);
  const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const stacks = [];
  for (const pool of data.pools) {
    const total = pool.entries.reduce((sum, e) => sum + e[3], 0);
    const rolls = between(pool.rolls[0], pool.rolls[1]);
    for (let r = 0; r < rolls; r++) {
      let pick = random() * total;
      let entry = pool.entries[pool.entries.length - 1];
      for (const e of pool.entries) { pick -= e[3]; if (pick < 0) { entry = e; break; } }
      const [name, min, max] = entry;
      const count = between(min, max);
      const game = gameItemFor(name);
      if (!game || count <= 0) continue;
      const stack = { ...game.item, count };
      if (game.key === 'enchanted_book' && game.enchant === 'random') {
        // "All enchantments are equally probable, including treasure enchantments (except Soul Speed, Swift Sneak, and
        // Wind Burst), and any level of the enchantment is equally probable."
        const keys = Object.keys(ENCHANTMENT_REGISTRY).filter((k) => !['soul_speed', 'swift_sneak', 'wind_burst'].includes(k));
        const key = keys[Math.floor(random() * keys.length)];
        stack.enchantments = [enchantmentEntry(key, between(1, ENCHANTMENT_REGISTRY[key].maxLevel))];
      } else if (game.enchant === 'random') {
        const rolled = rollEnchantmentFor(game.key, { random, allowTreasure: game.key === 'enchanted_book' });
        if (rolled.length) stack.enchantments = rolled;
      } else if (Array.isArray(game.enchant)) {
        const key = game.enchant[Math.floor(random() * game.enchant.length)];
        const def = ENCHANTMENT_REGISTRY[key];
        if (def) stack.enchantments = [enchantmentEntry(key, between(1, def.maxLevel))];
      }
      stacks.push(stack);
    }
  }
  // Scatter the stacks over the chest's slots.
  const out = new Array(slots).fill(null);
  const free = [...Array(slots).keys()];
  for (const stack of stacks.slice(0, slots)) out[free.splice(Math.floor(random() * free.length), 1)[0]] = stack;
  return out;
}
