import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { baseBlockDrop } from './blockDrops.js';
import { addPlayerExperience } from './experience.js';
import { rollEnchantmentFor } from './enchanting.js';

/**
 * Villager trading, and the wandering trader's table, against https://minecraft.wiki/w/Trading.
 *
 * The article is the specification, and three things in it are easy to get subtly wrong:
 *
 *  1. **What a level offers.** In Java a level offers at most TWO of its pool, chosen uniformly at random
 *     ("If there are more than two possible trades, two are randomly selected"), and a villager never holds
 *     more than ten offers. The first version of this file pushed the whole level pool at every level-up,
 *     which made a novice farmer hold five offers and a master hold twenty.
 *  2. **What a price is.** The article's formula is
 *     `min(max(floor(p * (m * max(0,d) + 1)) - floor(m * r) - heroDiscount, 1), stackSize)`, with demand
 *     starting at `-2 * maxUses` and reputation coming from the gossip table. The first version used a flat
 *     "+1 per two purchases over two" markup and a flat 30% Hero discount.
 *  3. **Which items a trade's two sides actually are.** A block the player mines comes back as a *numeric*
 *     block id while a block that declares a `dropItem` comes back as an *item* name, so a cost written as
 *     `{id:'stone', isBlock:true}` could never match the stone the player was carrying. `tradeSide` resolves
 *     each wiki item name to the form this engine really holds it in, and `canonicalItemKey` compares the two
 *     forms as one key so a trade cannot fail on a representation difference.
 *
 * Reference: https://minecraft.wiki/w/Trading and https://minecraft.wiki/w/Villager#Gossiping
 */

/**
 * 13 Minecraft Professions and their corresponding Workstation Blocks
 */
export const PROFESSIONS = {
  armorer: { id: 'armorer', name: 'Armorer', workstation: BLOCKS.BLAST_FURNACE, workstationName: 'Blast Furnace', badgeColor: '#475569' },
  butcher: { id: 'butcher', name: 'Butcher', workstation: BLOCKS.SMOKER, workstationName: 'Smoker', badgeColor: '#991b1b' },
  cartographer: { id: 'cartographer', name: 'Cartographer', workstation: BLOCKS.CARTOGRAPHY_TABLE, workstationName: 'Cartography Table', badgeColor: '#ca8a04' },
  cleric: { id: 'cleric', name: 'Cleric', workstation: BLOCKS.BREWING_STAND, workstationName: 'Brewing Stand', badgeColor: '#9333ea' },
  farmer: { id: 'farmer', name: 'Farmer', workstation: BLOCKS.COMPOSTER, workstationName: 'Composter', badgeColor: '#65a30d' },
  fisherman: { id: 'fisherman', name: 'Fisherman', workstation: BLOCKS.BARREL, workstationName: 'Barrel', badgeColor: '#0284c7' },
  fletcher: { id: 'fletcher', name: 'Fletcher', workstation: BLOCKS.FLETCHING_TABLE, workstationName: 'Fletching Table', badgeColor: '#d97706' },
  leatherworker: { id: 'leatherworker', name: 'Leatherworker', workstation: BLOCKS.CAULDRON, workstationName: 'Cauldron', badgeColor: '#78350f' },
  librarian: { id: 'librarian', name: 'Librarian', workstation: BLOCKS.LECTERN, workstationName: 'Lectern', badgeColor: '#dc2626' },
  mason: { id: 'mason', name: 'Mason', workstation: BLOCKS.STONECUTTER, workstationName: 'Stonecutter', badgeColor: '#52525b' },
  shepherd: { id: 'shepherd', name: 'Shepherd', workstation: BLOCKS.LOOM, workstationName: 'Loom', badgeColor: '#16a34a' },
  toolsmith: { id: 'toolsmith', name: 'Toolsmith', workstation: BLOCKS.SMITHING_TABLE, workstationName: 'Smithing Table', badgeColor: '#4338ca' },
  weaponsmith: { id: 'weaponsmith', name: 'Weaponsmith', workstation: BLOCKS.GRINDSTONE, workstationName: 'Grindstone', badgeColor: '#b45309' }
};

export const WORKSTATION_TO_PROFESSION = {
  [BLOCKS.BLAST_FURNACE]: 'armorer',
  [BLOCKS.SMOKER]: 'butcher',
  [BLOCKS.CARTOGRAPHY_TABLE]: 'cartographer',
  [BLOCKS.BREWING_STAND]: 'cleric',
  [BLOCKS.COMPOSTER]: 'farmer',
  [BLOCKS.BARREL]: 'fisherman',
  [BLOCKS.FLETCHING_TABLE]: 'fletcher',
  [BLOCKS.CAULDRON]: 'leatherworker',
  [BLOCKS.LECTERN]: 'librarian',
  [BLOCKS.STONECUTTER]: 'mason',
  [BLOCKS.LOOM]: 'shepherd',
  [BLOCKS.SMITHING_TABLE]: 'toolsmith',
  [BLOCKS.GRINDSTONE]: 'weaponsmith'
};

/**
 * Wiki: the villagers that cannot trade at all.
 *
 * "Nitwits are green-coated villagers that cannot gain a profession", "Villagers without a job do not
 * trade", and "The appearance of baby villagers ... They can't get a job or trade." All three "grunt and
 * bob their head" when a player tries, which is Java's answer and therefore this game's.
 */
export const NON_TRADING_PROFESSIONS = ['unemployed', 'nitwit'];

/** Wiki: the five career levels and the total villager experience each one needs. */
export const VILLAGER_LEVELS = [
  { level: 1, title: 'Novice', xpRequired: 0, badge: 'Stone', badgeColor: '#78716c' },
  { level: 2, title: 'Apprentice', xpRequired: 10, badge: 'Iron', badgeColor: '#94a3b8' },
  { level: 3, title: 'Journeyman', xpRequired: 70, badge: 'Gold', badgeColor: '#eab308' },
  { level: 4, title: 'Expert', xpRequired: 150, badge: 'Emerald', badgeColor: '#10b981' },
  { level: 5, title: 'Master', xpRequired: 250, badge: 'Diamond', badgeColor: '#06b6d4' }
];

/** Wiki: "villagers have a maximum of 10 trades" and each level unlocks "up to two new trades". */
export const MAX_TRADES = 10;
export const MAX_NEW_TRADES_PER_LEVEL = 2;

/**
 * Wiki: "Master librarians are currently the only exception, as they pick 3 trades".
 *
 * The default master-librarian pool holds exactly two rows, so the exception changes nothing today; it is
 * recorded because it is the rule, and because a future pool that grows will need it.
 */
export const MASTER_LIBRARIAN_PICKS = 3;

/** Wiki: villagers "activate their offers again, up to twice per day". */
export const RESTOCKS_PER_DAY = 2;

/** Wiki: "All villager trades reward the player with 3-6 experience plus an additional 5 if the villager levels up". */
export const TRADE_XP = { playerMin: 3, playerMax: 6, levelUpBonus: 5 };

/**
 * Wiki: a villager that levels up "receives 10 seconds of Regeneration I (totaling to 4HP of restoration)".
 *
 * Regeneration I restores one hit point every 50 ticks, which is 2.5 seconds, so ten seconds is four points.
 */
export const LEVEL_UP_REGENERATION_SECONDS = 10;
export const REGENERATION_HEAL_INTERVAL_SECONDS = 2.5;

/**
 * The gossip table from https://minecraft.wiki/w/Villager#Gossiping.
 *
 * `gain` is what one event adds, `decay` is what twenty minutes takes away, `shareCost` is what gossiping
 * with another villager consumes, `max` clamps the stored value, and `multiplier` turns the stored value
 * into reputation. The sign lives in `multiplier`, exactly as the table shows it: attacking a villager
 * stores a *positive* 25 with a multiplier of -1.
 */
export const GOSSIP_TYPES = {
  trading: { gain: 4, decay: 2, shareCost: 20, max: 25, multiplier: 1 },
  major_positive: { gain: 20, decay: 0, shareCost: 100, max: 20, multiplier: 5 },
  minor_positive: { gain: 25, decay: 1, shareCost: 5, max: 25, multiplier: 1 },
  minor_negative: { gain: 25, decay: 20, shareCost: 20, max: 200, multiplier: -1 },
  major_negative: { gain: 25, decay: 10, shareCost: 10, max: 100, multiplier: -5 }
};

/** Wiki: "Every 20 minutes, all gossips of a villager decays by the amount in the 'Decay' column." */
export const GOSSIP_DECAY_SECONDS = 1200;

/** The player key used when a caller does not name one, so single-player still has per-player reputation. */
export const DEFAULT_PLAYER_KEY = 'player';

/**
 * Reputation a first cure is worth.
 *
 * Wiki: curing stores a `major_positive` of 20 (multiplier 5) and a `minor_positive` of 25 (multiplier 1),
 * so a first cure is 125. It cannot be shared, because its sharing cost exceeds its maximum.
 */
export const CURE_REPUTATION = GOSSIP_TYPES.major_positive.gain * GOSSIP_TYPES.major_positive.multiplier
  + GOSSIP_TYPES.minor_positive.gain * GOSSIP_TYPES.minor_positive.multiplier;

// ---------------------------------------------------------------------------------------------------
// Item sides
// ---------------------------------------------------------------------------------------------------

/**
 * Wiki item names this build registers under a different id, or under a colourless name.
 *
 * Two kinds live here. The first is a straight rename (`empty_map` is this build's `map`, a wiki "Book and
 * Quill" is `writable_book`, "Nether Quartz" is `quartz`). The second is a wiki row that reads "any colour":
 * every colour is its own offer in vanilla, so one representative is pinned here and the row keeps the
 * wiki's own note explaining what was collapsed. Explorer maps are all the single `filled_map` item, but
 * each keeps its own display name, which is how the trade window can still tell them apart.
 */
export const WIKI_ID_ALIASES = {
  empty_map: 'map',
  book_and_quill: 'writable_book',
  nether_quartz: 'quartz',
  potion_water: 'water_bottle',
  bucket_of_tropical_fish: 'tropical_fish_bucket',
  bucket_of_pufferfish: 'pufferfish_bucket',
  boat: 'oak_boat',
  wool: 'white_wool',
  carpet: 'white_carpet',
  bed: 'red_bed',
  banner: 'white_banner',
  glazed_terracotta: 'white_glazed_terracotta',
  village_map: { id: 'filled_map', name: 'Village Map' },
  ocean_monument_map: { id: 'filled_map', name: 'Ocean Monument Map' },
  woodland_mansion_map: { id: 'filled_map', name: 'Woodland Mansion Map' },
  buried_trial_chambers_map: { id: 'filled_map', name: 'Buried Trial Chambers Map' },
  swamp_hut_map: { id: 'filled_map', name: 'Swamp Explorer Map' },
  jungle_temple_map: { id: 'filled_map', name: 'Jungle Explorer Map' },
  desert_pyramid_map: { id: 'filled_map', name: 'Desert Explorer Map' },
  pillager_outpost_map: { id: 'filled_map', name: 'Pillager Outpost Map' }
};

/** Name to numeric id for every block constant, so a numeric id can be compared as a name. */
const BLOCK_NAME_BY_ID = (() => {
  const map = new Map();
  for (const [name, id] of Object.entries(BLOCKS)) {
    if (typeof id === 'number' && !map.has(id)) map.set(id, name.toLowerCase());
  }
  return map;
})();

/** The concrete id behind a wiki item name, after `WIKI_ID_ALIASES`. */
export function resolveWikiId(rawId) {
  const alias = WIKI_ID_ALIASES[rawId];
  return typeof alias === 'string' ? alias : (alias?.id ?? rawId);
}

/**
 * The numeric block id behind a wiki item name, or null when the name is an item.
 *
 * The registry's own `isBlock` flag decides, and that is the whole point: `wheat` has a same-named block
 * constant (the mature crop) but `ITEMS.wheat` is a plain material, and the player carries harvested wheat
 * as an item. Reading the constant instead of the flag turned every farmer's wheat price into "20 Wheat
 * Crops" and would have handed out a crop block as change.
 */
export function blockIdForTradeId(id) {
  const itemDef = ITEMS[id];
  if (itemDef) {
    if (itemDef.isBlock !== true) return null;
    if (typeof itemDef.blockId === 'number' && BLOCK_DEFS[itemDef.blockId]) return itemDef.blockId;
  }
  const constId = BLOCKS[String(id).toUpperCase()];
  if (typeof constId === 'number' && BLOCK_DEFS[constId]) return constId;
  return null;
}

/** The icon for a block that declares no icon of its own: its first declared texture. */
function blockTextureIcon(def) {
  const tex = def?.textures?.all ?? def?.textures?.side ?? def?.textures?.top ?? def?.textures?.front;
  return tex ? `/assets/blocks/${tex}` : null;
}

/**
 * Resolve one side of a trade to the `{id, isBlock, count, name, icon}` the game actually holds.
 *
 * A block whose own drop is a *named item* is held as that item -- harvested wheat, nether wart and sugar
 * cane are items here, not blocks -- so `baseBlockDrop` decides, because it is the same rule the mining and
 * crafting paths already use. Everything else that is a block is held by its numeric id.
 */
export function tradeSide(rawId, count = 1) {
  const alias = WIKI_ID_ALIASES[rawId];
  const id = resolveWikiId(rawId);
  const nameOverride = typeof alias === 'object' ? alias.name : null;
  const blockId = blockIdForTradeId(id);

  let resolvedId = id;
  let isBlock = false;
  if (blockId !== null) {
    const drop = baseBlockDrop(blockId);
    if (drop && drop.isBlock === false && drop.id === id) {
      resolvedId = id;
    } else {
      resolvedId = blockId;
      isBlock = true;
    }
  }

  const itemDef = ITEMS[id];
  const blockDef = typeof resolvedId === 'number' ? BLOCK_DEFS[resolvedId] : null;
  return {
    id: resolvedId,
    isBlock,
    count,
    // The name the wiki's table prints, kept so a reader (and the parity ledger) can diff a row against the
    // article without mentally undoing this build's aliases and block-id resolution.
    wikiId: rawId,
    name: nameOverride ?? itemDef?.name ?? blockDef?.name ?? id,
    icon: itemDef?.icon ?? blockDef?.icon ?? blockTextureIcon(blockDef) ?? `/assets/items/${id}.png`
  };
}

/**
 * One comparison key for "the same thing", across the two ways this engine stores a block.
 *
 * A mined block is `{id: 3, isBlock: true}` and a block that declares a `dropItem` is
 * `{id: 'wheat', isBlock: false}`, so comparing `(id, isBlock)` pairs literally -- which is what the trade
 * check used to do -- meant a mason could never buy the stone the player was carrying. Reducing both forms
 * to the block's own name fixes that in both directions, and vanilla's own rule ("villagers ignore
 * additional item data" when buying) is the reason a name-level comparison is the right one.
 */
export function canonicalItemKey(id, isBlock) {
  if (typeof id === 'number') return BLOCK_NAME_BY_ID.get(id) ?? `#${id}`;
  if (isBlock === true) {
    const blockId = BLOCKS[String(id).toUpperCase()];
    if (typeof blockId === 'number' && BLOCK_NAME_BY_ID.has(blockId)) return BLOCK_NAME_BY_ID.get(blockId);
  }
  return String(id);
}

// ---------------------------------------------------------------------------------------------------
// The trade tables
// ---------------------------------------------------------------------------------------------------

/**
 * Every profession's wiki trade pool, one row per line.
 *
 * `[level, want, give, extras]` where `want` is `[id, count]`, `[id, [min, max]]` for a price vanilla rolls
 * when the offer is created, or `[id, count, secondId, secondCount]` for the two-cost trades. `extras`
 * carries the three columns the wiki prints that change behaviour: `uses` ("Trades in stock"), `xp`
 * ("Villager experience") and `m` ("Price multiplier"). `enchanted` marks a row the wiki enchants, and
 * `enchantedBook` marks one whose price and enchantment are both rolled.
 *
 * Two deliberate reductions, both recorded in the row's own `note` because they are the sort of thing a
 * later reader would otherwise "fix" wrongly:
 *  - The rows the wiki prints with a slot-dependent probability range (cartographer maps and banners) are
 *    not biome-aware here; the pool is what the wiki lists and the selection is uniform.
 *  - A row the wiki prints as "any colour" pins one representative, since every colour is a separate offer
 *    in vanilla and one pool cannot hold sixteen without swamping the two-offer selection.
 */
const WIKI_TRADES = {
  armorer: [
    [1, ['coal', 15], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 5], ['iron_helmet', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 9], ['iron_chestplate', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 7], ['iron_leggings', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 4], ['iron_boots', 1], { uses: 12, xp: 1, m: 0.2 }],
    [2, ['iron_ingot', 4], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 36], ['bell', 1], { uses: 12, xp: 5, m: 0.2 }],
    [2, ['emerald', 3], ['chainmail_leggings', 1], { uses: 12, xp: 5, m: 0.2 }],
    [2, ['emerald', 1], ['chainmail_boots', 1], { uses: 12, xp: 5, m: 0.2 }],
    [3, ['lava_bucket', 1], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['diamond', 1], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', 1], ['chainmail_helmet', 1], { uses: 12, xp: 10, m: 0.2 }],
    [3, ['emerald', 4], ['chainmail_chestplate', 1], { uses: 12, xp: 10, m: 0.2 }],
    [3, ['emerald', 5], ['shield', 1], { uses: 12, xp: 10, m: 0.2 }],
    [4, ['emerald', [19, 33]], ['diamond_leggings', 1], { uses: 3, xp: 15, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 14 plus that cost.' }],
    [4, ['emerald', [13, 27]], ['diamond_boots', 1], { uses: 3, xp: 15, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 8 plus that cost.' }],
    [5, ['emerald', [13, 27]], ['diamond_helmet', 1], { uses: 3, xp: 30, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 8 plus that cost.' }],
    [5, ['emerald', [21, 35]], ['diamond_chestplate', 1], { uses: 3, xp: 30, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 16 plus that cost.' }]
  ],
  butcher: [
    [1, ['chicken', 14], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['rabbit', 4], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['porkchop', 7], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['rabbit_stew', 1], { uses: 12, xp: 1, m: 0.05 }],
    [2, ['coal', 15], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [2, ['emerald', 1], ['cooked_chicken', 8], { uses: 16, xp: 5, m: 0.05 }],
    [2, ['emerald', 1], ['cooked_porkchop', 5], { uses: 16, xp: 5, m: 0.05 }],
    [3, ['beef', 10], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['mutton', 7], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [4, ['dried_kelp_block', 10], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['sweet_berries', 10], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }]
  ],
  cartographer: [
    [1, ['paper', 24], ['emerald', 1], { uses: 12, xp: 2, m: 0.05 }],
    [1, ['emerald', 7], ['map', 1], { uses: 12, xp: 1, m: 0.05 }],
    [2, ['glass_pane', 11], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 8, 'compass', 1], ['village_map', 1], { uses: 12, xp: 5, m: 0.2, note: 'Vanilla offers several village maps whose targets and count vary by biome; one is pinned here.' }],
    [3, ['compass', 1], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [3, ['emerald', 13, 'compass', 1], ['ocean_monument_map', 1], { uses: 12, xp: 10, m: 0.2 }],
    [3, ['emerald', 12, 'compass', 1], ['buried_trial_chambers_map', 1], { uses: 12, xp: 10, m: 0.2 }],
    [4, ['emerald', 7], ['item_frame', 1], { uses: 12, xp: 15, m: 0.05 }],
    [4, ['emerald', 3], ['white_banner', 1], { uses: 12, xp: 15, m: 0.05, note: 'Vanilla offers a banner in the villager biome\u2019s colour; white is pinned here.' }],
    [5, ['emerald', 8], ['globe_banner_pattern', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', 14, 'compass', 1], ['woodland_mansion_map', 1], { uses: 12, xp: 30, m: 0.2 }]
  ],
  cleric: [
    [1, ['rotten_flesh', 32], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['redstone', 2], { uses: 12, xp: 1, m: 0.05 }],
    [2, ['gold_ingot', 3], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 1], ['lapis_lazuli', 1], { uses: 12, xp: 5, m: 0.05 }],
    [3, ['rabbit_foot', 2], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', 4], ['glowstone', 1], { uses: 12, xp: 10, m: 0.05 }],
    [4, ['turtle_scute', 4], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['glass_bottle', 9], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['emerald', 5], ['ender_pearl', 1], { uses: 12, xp: 15, m: 0.05 }],
    [5, ['nether_wart', 22], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', 3], ['experience_bottle', 1], { uses: 12, xp: 30, m: 0.05 }]
  ],
  farmer: [
    [1, ['wheat', 20], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['potato', 26], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['carrot', 22], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['beetroot', 15], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['bread', 6], { uses: 16, xp: 1, m: 0.05 }],
    [2, ['pumpkin', 6], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 1], ['pumpkin_pie', 4], { uses: 12, xp: 5, m: 0.05 }],
    [2, ['emerald', 1], ['apple', 4], { uses: 16, xp: 5, m: 0.05 }],
    [3, ['melon_slice', 4], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', 3], ['cookie', 18], { uses: 12, xp: 10, m: 0.05 }],
    [4, ['emerald', 1], ['suspicious_stew', 1], { uses: 12, xp: 15, m: 0.05, note: 'One of six effects is chosen when the trade is unlocked; this build gives the stew.' }],
    [4, ['emerald', 1], ['cake', 1], { uses: 12, xp: 15, m: 0.05 }],
    [5, ['emerald', 3], ['golden_carrot', 3], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', 4], ['glistering_melon_slice', 3], { uses: 12, xp: 30, m: 0.05 }]
  ],
  fisherman: [
    [1, ['string', 20], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['coal', 10], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 3], ['cod_bucket', 1], { uses: 16, xp: 1, m: 0.05 }],
    [1, ['cod', 6, 'emerald', 1], ['cooked_cod', 6], { uses: 16, xp: 1, m: 0.05 }],
    [2, ['cod', 15], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['emerald', 2], ['campfire', 1], { uses: 12, xp: 5, m: 0.05 }],
    [2, ['salmon', 6, 'emerald', 1], ['cooked_salmon', 6], { uses: 16, xp: 5, m: 0.05 }],
    [3, ['salmon', 13], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['emerald', [8, 22]], ['fishing_rod', 1], { uses: 3, xp: 10, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 3 plus that cost.' }],
    [4, ['tropical_fish', 6], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['pufferfish', 4], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['boat', 1], ['emerald', 1], { uses: 12, xp: 30, m: 0.05, note: 'The boat\u2019s wood follows the villager\u2019s biome; oak is pinned here.' }]
  ],
  fletcher: [
    [1, ['stick', 32], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['arrow', 16], { uses: 12, xp: 1, m: 0.05 }],
    [1, ['gravel', 10, 'emerald', 1], ['flint', 10], { uses: 12, xp: 1, m: 0.05 }],
    [2, ['flint', 26], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 2], ['bow', 1], { uses: 12, xp: 5, m: 0.05 }],
    [3, ['string', 14], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['emerald', 3], ['crossbow', 1], { uses: 12, xp: 10, m: 0.05 }],
    [4, ['feather', 24], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['emerald', [7, 21]], ['bow', 1], { uses: 3, xp: 15, m: 0.05, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 2 plus that cost.' }],
    [5, ['tripwire_hook', 8], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', [8, 22]], ['crossbow', 1], { uses: 3, xp: 15, m: 0.05, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 3 plus that cost.' }],
    [5, ['emerald', 2, 'arrow', 5], ['tipped_arrow', 5], { uses: 12, xp: 30, m: 0.05, note: 'The arrow\u2019s effect is chosen when the trade is unlocked.' }]
  ],
  leatherworker: [
    [1, ['leather', 6], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 3], ['leather_leggings', 1], { uses: 12, xp: 1, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [1, ['emerald', 7], ['leather_chestplate', 1], { uses: 12, xp: 1, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [2, ['flint', 26], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 5], ['leather_helmet', 1], { uses: 12, xp: 5, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [2, ['emerald', 4], ['leather_boots', 1], { uses: 12, xp: 5, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [3, ['rabbit_hide', 9], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', 7], ['leather_chestplate', 1], { uses: 12, xp: 10, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [4, ['turtle_scute', 4], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['emerald', 6], ['leather_horse_armor', 1], { uses: 12, xp: 15, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [5, ['emerald', 5], ['leather_helmet', 1], { uses: 12, xp: 30, m: 0.2, note: 'The armour is a random colour made from two dyes.' }],
    [5, ['emerald', 6], ['saddle', 1], { uses: 12, xp: 30, m: 0.2 }]
  ],
  librarian: [
    [1, ['paper', 24], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 9], ['bookshelf', 1], { uses: 12, xp: 1, m: 0.05 }],
    [1, ['emerald', [5, 64], 'book', 1], ['enchanted_book', 1], { uses: 12, xp: 1, m: 0.2, enchantedBook: true }],
    [2, ['book', 4], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 1], ['lantern', 1], { uses: 12, xp: 5, m: 0.05 }],
    [2, ['emerald', [5, 64], 'book', 1], ['enchanted_book', 1], { uses: 12, xp: 5, m: 0.2, enchantedBook: true }],
    [3, ['ink_sac', 5], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', 1], ['glass', 4], { uses: 12, xp: 10, m: 0.05 }],
    [3, ['emerald', [5, 64], 'book', 1], ['enchanted_book', 1], { uses: 12, xp: 10, m: 0.2, enchantedBook: true }],
    [4, ['writable_book', 1], ['emerald', 1], { uses: 12, xp: 30, m: 0.05, note: 'Java requests one book and quill because books are unstackable (MC-248042).' }],
    [4, ['emerald', 4], ['compass', 1], { uses: 12, xp: 15, m: 0.05 }],
    [4, ['emerald', 5], ['clock', 1], { uses: 12, xp: 15, m: 0.05 }],
    [4, ['emerald', [5, 64], 'book', 1], ['enchanted_book', 1], { uses: 12, xp: 15, m: 0.2, enchantedBook: true }],
    [5, ['emerald', 3], ['red_candle', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', 3], ['yellow_candle', 1], { uses: 12, xp: 30, m: 0.05 }]
  ],
  mason: [
    [1, ['clay_ball', 10], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['brick', 10], { uses: 16, xp: 1, m: 0.05 }],
    [2, ['stone', 20], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['emerald', 1], ['chiseled_stone_bricks', 4], { uses: 16, xp: 5, m: 0.05 }],
    [3, ['granite', 16], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['andesite', 16], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['diorite', 16], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['emerald', 1], ['dripstone_block', 4], { uses: 16, xp: 10, m: 0.05 }],
    [3, ['emerald', 1], ['polished_andesite', 4], { uses: 16, xp: 10, m: 0.05 }],
    [3, ['emerald', 1], ['polished_diorite', 4], { uses: 16, xp: 10, m: 0.05 }],
    [3, ['emerald', 1], ['polished_granite', 4], { uses: 16, xp: 10, m: 0.05 }],
    [4, ['quartz', 12], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['emerald', 1], ['terracotta', 1], { uses: 12, xp: 15, m: 0.05, note: 'Every colour is its own offer in vanilla; plain terracotta is pinned here.' }],
    [4, ['emerald', 1], ['white_glazed_terracotta', 1], { uses: 12, xp: 15, m: 0.05, note: 'Every colour is its own offer in vanilla; white is pinned here.' }],
    [5, ['emerald', 1], ['quartz_pillar', 1], { uses: 12, xp: 30, m: 0.05 }],
    [5, ['emerald', 1], ['quartz_block', 1], { uses: 12, xp: 30, m: 0.05 }]
  ],
  shepherd: [
    [1, ['white_wool', 18], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['brown_wool', 18], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['black_wool', 18], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['gray_wool', 18], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 2], ['shears', 1], { uses: 12, xp: 1, m: 0.05 }],
    [2, ['white_dye', 12], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['gray_dye', 12], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['black_dye', 12], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['light_blue_dye', 12], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['lime_dye', 12], ['emerald', 1], { uses: 16, xp: 10, m: 0.05 }],
    [2, ['emerald', 1], ['white_wool', 1], { uses: 16, xp: 5, m: 0.05, note: 'Every colour is its own offer in vanilla; white is pinned here.' }],
    [2, ['emerald', 1], ['white_carpet', 4], { uses: 16, xp: 5, m: 0.05, note: 'Every colour is its own offer in vanilla; white is pinned here.' }],
    [3, ['yellow_dye', 12], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['light_gray_dye', 12], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['orange_dye', 12], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['red_dye', 12], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['pink_dye', 12], ['emerald', 1], { uses: 16, xp: 20, m: 0.05 }],
    [3, ['emerald', 3], ['red_bed', 1], { uses: 12, xp: 10, m: 0.05, note: 'Every colour is its own offer in vanilla; red is pinned here.' }],
    [4, ['brown_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['purple_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['blue_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['green_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['magenta_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['cyan_dye', 12], ['emerald', 1], { uses: 16, xp: 30, m: 0.05 }],
    [4, ['emerald', 3], ['white_banner', 1], { uses: 12, xp: 15, m: 0.05, note: 'Every colour is its own offer in vanilla; white is pinned here.' }],
    [5, ['emerald', 2], ['painting', 3], { uses: 12, xp: 30, m: 0.05 }]
  ],
  toolsmith: [
    [1, ['coal', 15], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 1], ['stone_axe', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 1], ['stone_shovel', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 1], ['stone_pickaxe', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', 1], ['stone_hoe', 1], { uses: 12, xp: 1, m: 0.2 }],
    [2, ['iron_ingot', 4], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 36], ['bell', 1], { uses: 12, xp: 5, m: 0.2 }],
    [3, ['flint', 30], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [3, ['emerald', [6, 20]], ['iron_axe', 1], { uses: 3, xp: 10, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 1 plus that cost.' }],
    [3, ['emerald', [7, 21]], ['iron_shovel', 1], { uses: 3, xp: 10, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 2 plus that cost.' }],
    [3, ['emerald', [8, 22]], ['iron_pickaxe', 1], { uses: 3, xp: 10, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 3 plus that cost.' }],
    [3, ['emerald', 4], ['diamond_hoe', 1], { uses: 3, xp: 10, m: 0.2 }],
    [4, ['diamond', 1], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['emerald', [17, 31]], ['diamond_axe', 1], { uses: 3, xp: 15, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 12 plus that cost.' }],
    [4, ['emerald', [10, 24]], ['diamond_shovel', 1], { uses: 3, xp: 15, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 5 plus that cost.' }],
    [5, ['emerald', [18, 32]], ['diamond_pickaxe', 1], { uses: 3, xp: 30, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 13 plus that cost.' }]
  ],
  weaponsmith: [
    [1, ['coal', 15], ['emerald', 1], { uses: 16, xp: 2, m: 0.05 }],
    [1, ['emerald', 3], ['iron_axe', 1], { uses: 12, xp: 1, m: 0.2 }],
    [1, ['emerald', [7, 21]], ['iron_sword', 1], { uses: 3, xp: 1, m: 0.05, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 2 plus that cost.' }],
    [2, ['iron_ingot', 4], ['emerald', 1], { uses: 12, xp: 10, m: 0.05 }],
    [2, ['emerald', 36], ['bell', 1], { uses: 12, xp: 5, m: 0.2 }],
    [3, ['flint', 24], ['emerald', 1], { uses: 12, xp: 20, m: 0.05 }],
    [4, ['diamond', 1], ['emerald', 1], { uses: 12, xp: 30, m: 0.05 }],
    [4, ['emerald', [17, 31]], ['diamond_axe', 1], { uses: 3, xp: 15, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 12 plus that cost.' }],
    [5, ['emerald', [13, 27]], ['diamond_sword', 1], { uses: 3, xp: 30, m: 0.2, enchanted: true, note: 'Enchanted for a random cost of 5-19 levels; the price is 8 plus that cost.' }]
  ]
};

/** A count the wiki prints as a range; the offer rolls inside it when it is created. */
function countRange(count) {
  return Array.isArray(count) ? [count[0], count[1]] : [count, count];
}

/** Build one pool row: the wiki's four columns plus the two item sides resolved to real inventory forms. */
function buildRow(profession, index, level, want, give, extras = {}) {
  const [costMin, costMax] = countRange(want[1]);
  const cost = { ...tradeSide(want[0], costMin), countMin: costMin, countMax: costMax };
  let cost2 = null;
  if (want.length === 4) {
    const [secondMin, secondMax] = countRange(want[3]);
    cost2 = { ...tradeSide(want[2], secondMin), countMin: secondMin, countMax: secondMax };
  }
  const [rewardMin, rewardMax] = countRange(give[1]);
  const reward = { ...tradeSide(give[0], rewardMin), countMin: rewardMin, countMax: rewardMax };
  return {
    key: `${profession}:${level}:${index}`,
    profession,
    level,
    levelName: VILLAGER_LEVELS.find((l) => l.level === level)?.title ?? `Level ${level}`,
    cost,
    cost2,
    reward,
    maxUses: extras.uses ?? 12,
    xp: extras.xp ?? 2,
    priceMultiplier: extras.m ?? 0.05,
    enchanted: extras.enchanted === true,
    enchantedBook: extras.enchantedBook === true,
    note: extras.note ?? ''
  };
}

/**
 * The wiki trade pools, keyed by profession, each row already carrying its resolved item sides.
 *
 * Exported as data rather than as behaviour, so a reader can diff a row against the wiki's table and so the
 * tests can assert the tables themselves rather than only the code that walks them.
 */
export const PROFESSION_TRADES = Object.fromEntries(
  Object.entries(WIKI_TRADES).map(([profession, rows]) => [
    profession,
    rows.map(([level, want, give, extras], index) => buildRow(profession, index, level, want, give, extras))
  ])
);

/** The pool for one profession at one level. */
export function tradePoolFor(profession, level) {
  return (PROFESSION_TRADES[profession] ?? []).filter((row) => row.level === level);
}

/** How many offers a level hands out: at most two, and three for a master librarian. */
export function maxOffersFor(profession, level) {
  if (profession === 'librarian' && level === 5) return MASTER_LIBRARIAN_PICKS;
  return MAX_NEW_TRADES_PER_LEVEL;
}

/** Uniformly sample `count` distinct entries, with an injectable `random` so a test can pin the draw. */
export function pickRandom(items, count, random = Math.random) {
  const pool = [...items];
  const out = [];
  while (out.length < count && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/**
 * Turn a pool row into a live offer: its own copies of both sides, its rolled counts, its own use counter,
 * and its initial demand.
 *
 * Wiki: "Demand is tracked per item and is initially minus two times the number of times the villager has
 * the trade in stock."
 */
export function instantiateTrade(row, random = Math.random) {
  const roll = (side) => {
    if (!side) return null;
    const min = side.countMin ?? side.count;
    const max = side.countMax ?? side.count;
    const count = min >= max ? min : min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
    return { ...side, count };
  };
  return {
    key: row.key,
    level: row.level,
    levelName: row.levelName,
    profession: row.profession,
    cost: roll(row.cost),
    cost2: roll(row.cost2),
    reward: roll(row.reward),
    maxUses: row.maxUses,
    xp: row.xp,
    priceMultiplier: row.priceMultiplier,
    enchanted: row.enchanted,
    enchantedBook: row.enchantedBook,
    note: row.note,
    uses: 0,
    demand: -2 * row.maxUses,
    disabled: false
  };
}

/**
 * Initialize villager trades and economy properties.
 *
 * `options.random` threads a deterministic draw through the level-one offers, which is what a test needs to
 * assert on a specific trade.
 */
export function initVillagerEconomy(villager, professionId = 'unemployed', options = {}) {
  villager.profession = professionId;
  villager.level = 1;
  villager.xp = 0;
  villager.workstation = null;
  villager.cured = villager.cured === true;
  villager.restockCount = 0;
  villager.restocksToday = 0;
  villager.restockDay = 0;
  villager.gossip = villager.gossip ?? {};
  villager.trades = [];

  if (professionId && !NON_TRADING_PROFESSIONS.includes(professionId)) {
    unlockTradesForLevel(villager, 1, options.random);
  }
  return villager;
}

/**
 * Unlock the offers a level hands out, and return the rows that were added.
 *
 * Wiki: "Each level unlocks a maximum of two new trades. If a level has a pool of more than two trades, the
 * two offered trades are chosen randomly from the set." A level whose pool holds exactly one trade offers
 * that one. A villager never exceeds ten offers.
 */
export function unlockTradesForLevel(villager, targetLevel, random = Math.random) {
  const pool = tradePoolFor(villager.profession, targetLevel);
  if (!pool.length) return [];
  villager.trades = villager.trades || [];

  const held = new Set(villager.trades.map((trade) => trade.key));
  const candidates = pool.filter((row) => !held.has(row.key));
  const room = Math.max(0, MAX_TRADES - villager.trades.length);
  const wanted = Math.min(candidates.length, maxOffersFor(villager.profession, targetLevel), room);
  const chosen = pickRandom(candidates, wanted, random);
  for (const row of chosen) villager.trades.push(instantiateTrade(row, random));
  return chosen;
}

/** Clear and re-roll every offer, which is what a job-site block being replaced does to a novice. */
export function resetVillagerTrades(villager, random = Math.random) {
  villager.trades = [];
  villager.level = 1;
  unlockTradesForLevel(villager, 1, random);
}

// ---------------------------------------------------------------------------------------------------
// Gossip and reputation
// ---------------------------------------------------------------------------------------------------

/** Store one gossip for one player, clamped to that type's maximum. */
export function addGossip(villager, playerKey, type, amount) {
  const def = GOSSIP_TYPES[type];
  if (!villager || !def || !amount) return 0;
  villager.gossip = villager.gossip ?? {};
  const entry = villager.gossip[playerKey] ?? (villager.gossip[playerKey] = {});
  const current = entry[type] ?? 0;
  entry[type] = Math.max(-def.max, Math.min(def.max, current + amount));
  return entry[type];
}

/** Wiki: "Each trade" is a `trading` gossip worth 4. */
export function recordTrade(villager, playerKey = DEFAULT_PLAYER_KEY) {
  return addGossip(villager, playerKey, 'trading', GOSSIP_TYPES.trading.gain);
}

/**
 * Wiki: curing stores a `major_positive` of 20 and a `minor_positive` of 25.
 *
 * Vanilla 1.20.2 gave the big discount only the FIRST time a villager is cured, so a second cure adds
 * nothing.
 */
export function recordCure(villager, playerKey = DEFAULT_PLAYER_KEY) {
  if (!villager || villager.hasBeenCured) return 0;
  villager.hasBeenCured = true;
  addGossip(villager, playerKey, 'major_positive', GOSSIP_TYPES.major_positive.gain);
  return addGossip(villager, playerKey, 'minor_positive', GOSSIP_TYPES.minor_positive.gain);
}

/** Wiki: attacking stores a `minor_negative` of 25 (multiplier -1). */
export function recordAttack(villager, playerKey = DEFAULT_PLAYER_KEY) {
  return addGossip(villager, playerKey, 'minor_negative', GOSSIP_TYPES.minor_negative.gain);
}

/** Wiki: killing a nearby villager stores a `major_negative` of 25 (multiplier -5). */
export function recordKill(villager, playerKey = DEFAULT_PLAYER_KEY) {
  return addGossip(villager, playerKey, 'major_negative', GOSSIP_TYPES.major_negative.gain);
}

/**
 * A player's total reputation with one villager.
 *
 * Wiki: "A player's total reputation with a villager is determined by multiplying each gossip's value by its
 * respective multiplier and adding the results together."
 */
export function reputationOf(villager, playerKey = DEFAULT_PLAYER_KEY) {
  const entry = villager?.gossip?.[playerKey];
  if (!entry) return 0;
  let total = 0;
  for (const [type, value] of Object.entries(entry)) {
    const def = GOSSIP_TYPES[type];
    if (!def) continue;
    total += Math.max(-def.max, Math.min(def.max, value)) * def.multiplier;
  }
  return total;
}

/**
 * Decay every gossip on a twenty-minute clock.
 *
 * Wiki: "Every 20 minutes, all gossips of a villager decays by the amount in the 'Decay' column", and the
 * curing gossip's decay of 0 is what makes it permanent.
 */
export function decayGossip(villager, seconds) {
  if (!villager?.gossip || !(seconds > 0)) return false;
  villager.gossipClock = (villager.gossipClock ?? 0) + seconds;
  if (villager.gossipClock < GOSSIP_DECAY_SECONDS) return false;
  const steps = Math.floor(villager.gossipClock / GOSSIP_DECAY_SECONDS);
  villager.gossipClock -= steps * GOSSIP_DECAY_SECONDS;
  for (const entry of Object.values(villager.gossip)) {
    for (const [type, value] of Object.entries(entry)) {
      const decay = GOSSIP_TYPES[type]?.decay ?? 0;
      if (!decay) continue;
      const magnitude = Math.max(0, Math.abs(value) - decay * steps);
      entry[type] = value < 0 ? -magnitude : magnitude;
    }
  }
  return true;
}

/**
 * Share gossip with another villager, spending the sharing cost.
 *
 * Wiki: "the shared gossip's value will be decreased by the sharing cost", and the curing gossip "can never
 * be shared" because its cost exceeds its maximum -- which the `value <= shareCost` guard produces for free.
 */
export function shareGossip(from, to, playerKey = DEFAULT_PLAYER_KEY) {
  const entry = from?.gossip?.[playerKey];
  if (!entry || !to) return [];
  const shared = [];
  for (const [type, value] of Object.entries(entry)) {
    const def = GOSSIP_TYPES[type];
    if (!def || value <= def.shareCost) continue;
    const amount = value - def.shareCost;
    entry[type] = value - amount;
    addGossip(to, playerKey, type, amount);
    shared.push(type);
  }
  return shared;
}

// ---------------------------------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------------------------------

/**
 * The price of one trade for one player.
 *
 * The formula is the article's Java one:
 *
 *     min(max(floor(p * (m * max(0, d) + 1)) - floor(m * r) - sgn(h) * max(1, floor(p * (0.3 + 0.0625 * (h - 1)))), 1), stackSize)
 *
 * Only the first item of a trade moves: "All price fluctuations affect only the first item involved in
 * trade", so `cost2` is returned untouched and never scaled.
 *
 * @param {object} trade
 * @param {object} villager
 * @param {{ reputation?: number, playerKey?: string, heroOfTheVillageLevel?: number,
 *           heroOfTheVillage?: boolean }} [playerStatus]
 */
export function calculateTradeCost(trade, villager, playerStatus = {}) {
  const initial = trade?.cost?.count ?? 1;
  const multiplier = trade?.priceMultiplier ?? 0;
  const demand = trade?.demand ?? 0;
  const reputation = playerStatus.reputation !== undefined
    ? playerStatus.reputation
    : reputationOf(villager, playerStatus.playerKey ?? DEFAULT_PLAYER_KEY);
  const heroLevel = Math.max(0, Math.floor(
    playerStatus.heroOfTheVillageLevel ?? (playerStatus.heroOfTheVillage ? 1 : 0)
  ));

  const demandPrice = Math.floor(initial * (multiplier * Math.max(0, demand) + 1));
  // Java's form: a negative reputation RAISES the price, which is the one place the two editions differ.
  const reputationAdjustment = Math.floor(multiplier * reputation);
  const heroDiscount = heroLevel > 0
    ? Math.max(1, Math.floor(initial * (0.3 + 0.0625 * (heroLevel - 1))))
    : 0;

  const stackSize = stackLimitFor(trade?.cost?.id);
  const raw = demandPrice - reputationAdjustment - heroDiscount;
  const effectiveCount = Math.min(Math.max(raw, 1), stackSize);

  return {
    effectiveCount,
    originalCount: initial,
    discounted: effectiveCount < initial,
    markup: effectiveCount > initial,
    demandPrice,
    demandMarkup: demandPrice - initial,
    reputation,
    reputationAdjustment,
    heroLevel,
    heroDiscount,
    clampedToStack: raw > stackSize
  };
}

// ---------------------------------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------------------------------

/**
 * Whether this villager may trade at all.
 *
 * Wiki: nitwits, unemployed villagers and babies cannot trade; an employed villager with offers can.
 */
export function villagerCanTrade(villager) {
  if (!villager || !PROFESSIONS[villager.profession]) return false;
  if (villager.isBaby) return false;
  return Array.isArray(villager.trades) && villager.trades.length > 0;
}

/**
 * Why a villager refused, and what it did about it.
 *
 * Wiki: "If the player attempts to trade with a non-trading villager in Java Edition, it grunts and bobs
 * its head". Returns null when the villager can trade.
 */
export function tradeRefusal(villager) {
  if (villagerCanTrade(villager)) return null;
  if (!villager) return { reason: 'missing', response: null };
  if (villager.isBaby) return { reason: 'baby', response: 'grunts_and_bobs' };
  if (villager.profession === 'nitwit') return { reason: 'nitwit', response: 'grunts_and_bobs' };
  if (NON_TRADING_PROFESSIONS.includes(villager.profession)) {
    return { reason: 'unemployed', response: 'grunts_and_bobs' };
  }
  return { reason: 'no_offers', response: 'grunts_and_bobs' };
}

/** What a trade pays the player: "3-6 experience plus an additional 5 if the villager levels up". */
export function tradePlayerXp(random = Math.random, leveledUp = false) {
  const span = TRADE_XP.playerMax - TRADE_XP.playerMin + 1;
  const base = TRADE_XP.playerMin + Math.min(span - 1, Math.floor(random() * span));
  return base + (leveledUp ? TRADE_XP.levelUpBonus : 0);
}

/**
 * Every offer's cost is checked and consumed through the canonical key, so a cost written as a block name
 * matches the numeric block id the inventory is really carrying, and the other way round.
 */
function hasPlayerItem(inventory, side, count) {
  if (!inventory || !side) return false;
  const wanted = canonicalItemKey(side.id, side.isBlock);
  let available = 0;
  for (const slot of [...(inventory.hotbar || []), ...(inventory.storage || [])]) {
    if (!slot) continue;
    if (canonicalItemKey(slot.id, slot.isBlock) === wanted) available += slot.count;
  }
  return available >= count;
}

function consumePlayerItem(inventory, side, count) {
  if (!inventory || !side) return false;
  const wanted = canonicalItemKey(side.id, side.isBlock);
  let needed = count;
  for (const slot of [...(inventory.hotbar || []), ...(inventory.storage || [])]) {
    if (!slot) continue;
    if (canonicalItemKey(slot.id, slot.isBlock) !== wanted) continue;
    const take = Math.min(slot.count, needed);
    slot.count -= take;
    needed -= take;
    if (slot.count <= 0) {
      slot.id = null;
      slot.count = 0;
    }
    if (needed <= 0) break;
  }
  return needed <= 0;
}

/** Roll the enchantments an `enchanted` or `enchantedBook` offer hands over. */
function rollRewardEnchantments(trade, random) {
  if (trade?.enchantedBook) {
    // Wiki: the book is any enchantment but Soul Speed, Swift Sneak or Wind Burst, and treasure
    // enchantments -- Mending above all -- are the point of the trade.
    return rollEnchantmentFor('book', { random, allowTreasure: true, exclude: ['soul_speed', 'swift_sneak', 'wind_burst'] });
  }
  if (trade?.enchanted) {
    return rollEnchantmentFor(String(trade.reward.id), { random });
  }
  return null;
}

/**
 * Checks a trade against the player's inventory and performs it.
 *
 * The villager half of the wiki's rules is applied here: the offer's own XP, a level-up when the bar fills,
 * the ten-second Regeneration I a level-up grants, and the `trading` gossip that later discounts a price.
 * A wandering trader passes `kind: 'wandering_trader'`, because it "does not have experience levels to gain"
 * and its offers never unlock again.
 */
export function executeTrade(trade, villager, playerInventory, sounds = null, options = {}) {
  const random = options.random ?? Math.random;
  if (!trade) return { success: false, reason: 'no_trade' };
  if (!villager) return { success: false, reason: 'no_merchant' };

  if (trade.uses >= trade.maxUses || trade.disabled) {
    sounds?.playHurt?.();
    return { success: false, reason: 'out_of_stock' };
  }

  const playerStatus = options.playerStatus ?? {};
  const { effectiveCount } = calculateTradeCost(trade, villager, playerStatus);

  const isCreative = options.player?.gamemode === 'creative' || options.isCreative;

  if (!isCreative && !hasPlayerItem(playerInventory, trade.cost, effectiveCount)) {
    sounds?.playHurt?.();
    return { success: false, reason: 'insufficient_items' };
  }
  if (!isCreative && trade.cost2 && !hasPlayerItem(playerInventory, trade.cost2, trade.cost2.count)) {
    sounds?.playHurt?.();
    return { success: false, reason: 'insufficient_secondary_items' };
  }

  const enchantments = rollRewardEnchantments(trade, random);
  const rewardAdded = playerInventory?.addItem
    ? playerInventory.addItem(trade.reward.id, trade.reward.isBlock, trade.reward.count, enchantments)
    : false;

  if (!isCreative) {
    consumePlayerItem(playerInventory, trade.cost, effectiveCount);
    if (trade.cost2) consumePlayerItem(playerInventory, trade.cost2, trade.cost2.count);
  }

  trade.uses += 1;
  if (trade.uses >= trade.maxUses) trade.disabled = true;

  const kind = options.kind ?? 'villager';
  const playerKey = options.playerKey ?? playerStatus.playerKey ?? DEFAULT_PLAYER_KEY;

  if (kind === 'wandering_trader') {
    // Wiki: a wandering trader has no levels, so its offers carry no experience and no demand.
    const playerXpGained = tradePlayerXp(random, false);
    if (options.player) addPlayerExperience(options.player, playerXpGained, sounds, options.ui ?? null);
    sounds?.playVillager?.();
    return {
      success: true,
      leveledUp: false,
      newLevel: null,
      xpGained: 0,
      villagerXp: 0,
      playerXpGained,
      regenerationSeconds: 0,
      enchantments,
      rewardAdded
    };
  }

  const prevLevel = villager.level ?? 1;
  villager.xp = (villager.xp ?? 0) + (trade.xp ?? 2);

  let leveledUp = false;
  while ((villager.level ?? 1) < 5) {
    const next = VILLAGER_LEVELS.find((l) => l.level === (villager.level ?? 1) + 1);
    if (!next || villager.xp < next.xpRequired) break;
    villager.level = next.level;
    unlockTradesForLevel(villager, villager.level, random);
    leveledUp = true;
  }

  recordTrade(villager, playerKey);

  if (leveledUp) {
    // Wiki: a level-up "receives 10 seconds of Regeneration I", which is four hit points.
    villager.regenerationTimer = LEVEL_UP_REGENERATION_SECONDS;
    villager.regenerationTick = 0;
    villager.levelUpFlash = true;
    sounds?.playLevelUp?.();
  }
  sounds?.playVillager?.();

  const playerXpGained = tradePlayerXp(random, leveledUp);
  if (options.player) addPlayerExperience(options.player, playerXpGained, sounds, options.ui ?? null);

  return {
    success: true,
    leveledUp,
    newLevel: villager.level,
    xpGained: trade.xp ?? 2,
    villagerXp: villager.xp,
    playerXpGained,
    regenerationSeconds: leveledUp ? LEVEL_UP_REGENERATION_SECONDS : 0,
    enchantments,
    rewardAdded,
    previousLevel: prevLevel
  };
}

/**
 * Heal a villager through the Regeneration I a level-up granted.
 *
 * Regeneration I restores one hit point every 50 ticks (2.5 seconds), which is the four points the wiki
 * totals over the effect's ten seconds. Returns 'healed' on a tick that restored one, else null.
 */
export function updateVillagerRegeneration(villager, dt) {
  if (!villager || !(villager.regenerationTimer > 0)) return null;
  villager.regenerationTimer = Math.max(0, villager.regenerationTimer - dt);
  villager.regenerationTick = (villager.regenerationTick ?? 0) + dt;
  if (villager.regenerationTick < REGENERATION_HEAL_INTERVAL_SECONDS) return null;
  villager.regenerationTick -= REGENERATION_HEAL_INTERVAL_SECONDS;
  const max = villager.maxHealth ?? 20;
  if ((villager.health ?? 0) >= max) return null;
  villager.health = Math.min(max, (villager.health ?? 0) + 1);
  return 'healed';
}

// ---------------------------------------------------------------------------------------------------
// Restocking and job sites
// ---------------------------------------------------------------------------------------------------

/**
 * Restock every offer, and move each demand by the wiki's restock rule.
 *
 * Wiki: "Villagers restock twice per day, at which point they subtract the number of possible purchases
 * before running out of stock and add twice the number of actually made purchases." That is
 * `demand += uses - (maxUses - uses)` for each offer.
 *
 * `day` is the world's day counter; when it changes, the day's allowance resets. `force` bypasses the
 * twice-a-day cap for a caller that has its own reason to restock.
 */
export function restockVillager(villager, { day = null, force = false } = {}) {
  if (!villager?.trades) return false;
  if (!force) {
    if (day !== null && villager.restockDay !== day) {
      villager.restockDay = day;
      villager.restocksToday = 0;
    }
    if ((villager.restocksToday ?? 0) >= RESTOCKS_PER_DAY) return false;
  }
  for (const trade of villager.trades) {
    trade.demand = (trade.demand ?? 0) + trade.uses - (trade.maxUses - trade.uses);
    trade.uses = 0;
    trade.disabled = false;
  }
  villager.restockCount = (villager.restockCount ?? 0) + 1;
  villager.restocksToday = (villager.restocksToday ?? 0) + 1;
  return true;
}

/**
 * Check and update workstation claims for a villager.
 *
 * Wiki, in order: a novice that has not traded "can lose their profession and change back into unemployed
 * villagers if their claimed job site block is removed"; a villager that has traded "keeps its profession
 * forever"; and a villager with no experience that has its job site block replaced "resets its trades".
 */
export function updateVillagerWorkstation(villager, world, allVillagers = [], options = {}) {
  if (villager.profession === 'nitwit') return null;
  const random = options.random ?? Math.random;
  const day = options.day ?? null;
  let changed = null;

  // 1. If villager has a claimed workstation, verify it still exists in the world
  if (villager.workstation) {
    const ws = villager.workstation;
    const currentBlock = world.getVoxel(ws.x, ws.y, ws.z);
    if (currentBlock !== ws.blockId) {
      if (villager.xp > 0) {
        // Locked profession: keeps profession, just loses current workstation instance
        villager.workstation = null;
      } else {
        // Novice with 0 XP: loses profession completely and becomes unemployed!
        villager.workstation = null;
        villager.profession = 'unemployed';
        villager.trades = [];
        changed = 'lost_profession';
      }
    }
  }

  // 2. If unemployed (or locked profession missing workstation), look for an unclaimed matching workstation nearby
  if (!villager.workstation && villager.mesh?.position) {
    const vPos = villager.mesh.position;
    const vx = Math.floor(vPos.x);
    const vy = Math.floor(vPos.y);
    const vz = Math.floor(vPos.z);
    const radius = 16;

    const claimedCoords = new Set(
      allVillagers
        .filter((v) => v !== villager && v.workstation)
        .map((v) => `${v.workstation.x},${v.workstation.y},${v.workstation.z}`)
    );

    let bestDistSq = Infinity;
    let foundWorkstation = null;

    for (let x = vx - radius; x <= vx + radius; x++) {
      for (let y = Math.max(1, vy - 4); y <= Math.min(62, vy + 4); y++) {
        for (let z = vz - radius; z <= vz + radius; z++) {
          const coordKey = `${x},${y},${z}`;
          if (claimedCoords.has(coordKey)) continue;

          const block = world.getVoxel(x, y, z);
          const prof = WORKSTATION_TO_PROFESSION[block];
          if (!prof) continue;
          // If villager is locked into a profession, must match that profession
          if (villager.xp > 0 && villager.profession !== 'unemployed' && villager.profession !== prof) continue;

          const distSq = (x - vx) ** 2 + (y - vy) ** 2 + (z - vz) ** 2;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            foundWorkstation = { x, y, z, blockId: block, profession: prof };
          }
        }
      }
    }

    if (foundWorkstation) {
      villager.workstation = {
        x: foundWorkstation.x,
        y: foundWorkstation.y,
        z: foundWorkstation.z,
        blockId: foundWorkstation.blockId
      };
      if (villager.profession !== foundWorkstation.profession) {
        villager.profession = foundWorkstation.profession;
        // Wiki: "a villager with no experience resets its trades every so often", which is what replacing
        // and reclaiming a job site block does.
        if (villager.xp > 0) unlockTradesForLevel(villager, villager.level ?? 1, random);
        else resetVillagerTrades(villager, random);
        changed = 'claimed_profession';
      }
    }
  }

  // 3. Restock if close to claimed workstation, up to the wiki's twice a day
  if (villager.workstation && villager.mesh?.position) {
    const ws = villager.workstation;
    const distSq = (villager.mesh.position.x - ws.x) ** 2 +
                   (villager.mesh.position.y - ws.y) ** 2 +
                   (villager.mesh.position.z - ws.z) ** 2;
    if (distSq < 16) {
      const hasDepleted = villager.trades?.some((t) => t.uses >= t.maxUses);
      if (hasDepleted && restockVillager(villager, { day })) changed = changed ?? 'restocked';
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------------------------------
// Curing
// ---------------------------------------------------------------------------------------------------

/**
 * Zombie Villager Curing Ritual.
 *
 * Wiki: the zombie villager must be Weakness-affected, is fed a Golden Apple, trembles, and converts. The
 * cure is also the game's largest single reputation gain, which is what `recordCure` stores.
 */
export function startZombieVillagerCure(zombieVillager, playerItem, sounds = null) {
  if (zombieVillager.type !== 'zombie_villager') return false;
  if (zombieVillager.isCuring) return false;

  const hasWeakness = !!(
    zombieVillager.hasWeakness ||
    (zombieVillager.statusEffects && zombieVillager.statusEffects.weakness > 0)
  );
  if (!hasWeakness) return false;

  const isGoldenApple = playerItem && (playerItem.id === 'golden_apple' || playerItem.id === 'enchanted_golden_apple');
  if (!isGoldenApple) return false;

  zombieVillager.isCuring = true;
  zombieVillager.cureTimer = 20.0; // 20 seconds
  zombieVillager.shiverTimer = 0;
  sounds?.playSizzle?.();
  return true;
}

/**
 * Advance the curing ritual and, when it ends, swap the zombie for a cured villager.
 *
 * The new villager inherits the zombie's saved profession and carries the cure's reputation, so every later
 * price it quotes is already discounted.
 */
export function updateZombieVillagerCuring(zombieVillager, dt, mobManager, options = {}) {
  if (!zombieVillager.isCuring) return null;

  zombieVillager.cureTimer = (zombieVillager.cureTimer || 20.0) - dt;
  zombieVillager.shiverTimer = (zombieVillager.shiverTimer || 0) + dt * 40;

  if (zombieVillager.mesh) {
    zombieVillager.mesh.position.x += Math.sin(zombieVillager.shiverTimer) * 0.03;
  }

  if (zombieVillager.cureTimer <= 0 || options.instantCure) {
    zombieVillager.isCuring = false;
    const pos = zombieVillager.mesh ? zombieVillager.mesh.position.clone() : { x: 0, y: 0, z: 0 };
    const playerKey = options.playerKey ?? DEFAULT_PLAYER_KEY;

    if (mobManager) {
      mobManager.removeMob?.(zombieVillager);
      const newVillager = mobManager.spawnVillager(pos.x, pos.y, pos.z);
      if (newVillager) {
        newVillager.cured = true;
        newVillager.profession = zombieVillager.savedProfession || 'unemployed';
        newVillager.gossip = {};
        newVillager.hasBeenCured = zombieVillager.hasBeenCured === true;
        if (newVillager.profession !== 'unemployed' && newVillager.profession !== 'nitwit') {
          unlockTradesForLevel(newVillager, 1, options.random);
        }
        recordCure(newVillager, playerKey);
        // Wiki: curing also grants the player positive reputation for gossiping purposes, so keep the
        // zombie's flag so a second cure cannot stack a second discount.
        newVillager.hasBeenCured = true;
      }
      return newVillager;
    }
    return { cured: true, position: pos };
  }

  return null;
}
