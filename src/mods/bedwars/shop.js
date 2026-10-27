// The Bed Wars shops, as the Hypixel wiki lists them: the Item Shop (blocks, weapons, armour, tools, bows, potions and
// utility, paid in iron, gold and emeralds) and the Team Upgrades (paid in diamonds, for the whole team). Prices differ
// between the eight-team modes (Solo, Doubles: "cheaper") and the four- and two-team ones (3v3v3v3, 4v4v4v4, 4v4).
//
// Armour, shears and tools are permanent: kept through death, tools one tier lower (Hypixel). Swords are not: a player
// respawns with a wooden sword. Pure: the purchase works on any inventory with hotbar, storage and addItem, so tests can
// shop without a game.
import { BLOCKS } from '../../blocks.js';

export const RESOURCE_ITEMS = Object.freeze({ iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', emerald: 'emerald' });
export const RESOURCE_NAMES = Object.freeze({ iron: 'Iron', gold: 'Gold', diamond: 'Diamonds', emerald: 'Emeralds' });

const ench = (id, level) => ({ id, level });

/** Permanent tiers, as the shop sells them and death leaves them. Index 0 is none (armour: leather). */
export const PICKAXES = Object.freeze([null,
  { id: 'wooden_pickaxe', enchantments: [ench('efficiency', 1)] },
  { id: 'iron_pickaxe', enchantments: [ench('efficiency', 2)] },
  { id: 'golden_pickaxe', enchantments: [ench('efficiency', 3), ench('sharpness', 2)] },
  { id: 'diamond_pickaxe', enchantments: [ench('efficiency', 3)] },
]);
export const AXES = Object.freeze([null,
  { id: 'wooden_axe', enchantments: [ench('efficiency', 1)] },
  { id: 'stone_axe', enchantments: [ench('efficiency', 1)] },
  { id: 'iron_axe', enchantments: [ench('efficiency', 2)] },
  { id: 'diamond_axe', enchantments: [ench('efficiency', 3)] },
]);
/** Leggings and boots by armour tier; the helmet and chestplate are always leather (Hypixel). */
export const ARMOR_TIERS = Object.freeze(['leather', 'chainmail', 'iron', 'diamond']);
export const SWORDS = Object.freeze(['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword']);

const cost = (small, large = small) => ({ small, large });

/**
 * The Item Shop. `give` is what the purchase hands over; `kind` says how it is bought: an ordinary item, a sword (it
 * replaces the wooden one), armour, a tier of tool, shears, or a team-coloured block (`teamBlock`).
 */
export const ITEM_SHOP = Object.freeze([
  // Blocks
  { key: 'wool', category: 'blocks', name: 'Wool', count: 16, price: cost({ iron: 4 }), kind: 'teamBlock', block: 'wool' },
  { key: 'clay', category: 'blocks', name: 'Hardened Clay', count: 16, price: cost({ iron: 12 }), kind: 'teamBlock', block: 'clay' },
  { key: 'glass', category: 'blocks', name: 'Blast-Proof Glass', count: 4, price: cost({ iron: 12 }), kind: 'teamBlock', block: 'glass' },
  { key: 'end_stone', category: 'blocks', name: 'End Stone', count: 12, price: cost({ iron: 24 }), kind: 'item', give: { id: BLOCKS.END_STONE, isBlock: true } },
  { key: 'ladder', category: 'blocks', name: 'Ladder', count: 8, price: cost({ iron: 4 }), kind: 'item', give: { id: BLOCKS.LADDER, isBlock: true } },
  { key: 'wood', category: 'blocks', name: 'Oak Planks', count: 16, price: cost({ gold: 4 }), kind: 'item', give: { id: BLOCKS.OAK_PLANKS, isBlock: true } },
  { key: 'obsidian', category: 'blocks', name: 'Obsidian', count: 4, price: cost({ emerald: 4 }), kind: 'item', give: { id: BLOCKS.OBSIDIAN, isBlock: true }, notIn: ['duel'] },
  // Melee
  { key: 'stone_sword', category: 'melee', name: 'Stone Sword', price: cost({ iron: 10 }), kind: 'sword', tier: 1 },
  { key: 'iron_sword', category: 'melee', name: 'Iron Sword', price: cost({ gold: 7 }), kind: 'sword', tier: 2 },
  { key: 'diamond_sword', category: 'melee', name: 'Diamond Sword', price: cost({ emerald: 4 }, { emerald: 3 }), kind: 'sword', tier: 3 },
  { key: 'kb_stick', category: 'melee', name: 'Knockback Stick', price: cost({ gold: 5 }), kind: 'item', give: { id: 'stick', isBlock: false, enchantments: [ench('knockback', 1)] } },
  // Armour
  { key: 'chain_armor', category: 'armor', name: 'Permanent Chainmail Armor', price: cost({ iron: 24 }), kind: 'armor', tier: 1 },
  { key: 'iron_armor', category: 'armor', name: 'Permanent Iron Armor', price: cost({ gold: 12 }), kind: 'armor', tier: 2 },
  { key: 'diamond_armor', category: 'armor', name: 'Permanent Diamond Armor', price: cost({ emerald: 6 }), kind: 'armor', tier: 3 },
  // Tools: each buy is the next tier.
  { key: 'shears', category: 'tools', name: 'Permanent Shears', price: cost({ iron: 20 }), kind: 'shears' },
  { key: 'pickaxe', category: 'tools', name: 'Pickaxe', kind: 'tool', tool: 'pickaxe',
    tiers: [cost({ iron: 10 }), cost({ iron: 10 }), cost({ gold: 3 }), cost({ gold: 6 })] },
  { key: 'axe', category: 'tools', name: 'Axe', kind: 'tool', tool: 'axe',
    tiers: [cost({ iron: 10 }), cost({ iron: 10 }), cost({ gold: 3 }), cost({ gold: 6 })] },
  // Ranged
  { key: 'arrows', category: 'ranged', name: 'Arrow', count: 6, price: cost({ gold: 2 }), kind: 'item', give: { id: 'arrow', isBlock: false } },
  { key: 'bow', category: 'ranged', name: 'Bow', price: cost({ gold: 12 }), kind: 'item', give: { id: 'bow', isBlock: false } },
  { key: 'bow_power', category: 'ranged', name: 'Bow (Power I)', price: cost({ gold: 20 }), kind: 'item', give: { id: 'bow', isBlock: false, enchantments: [ench('power', 1)] } },
  { key: 'bow_punch', category: 'ranged', name: 'Bow (Power I, Punch I)', price: cost({ emerald: 6 }), kind: 'item', give: { id: 'bow', isBlock: false, enchantments: [ench('power', 1), ench('punch', 1)] } },
  // Potions: Hypixel's own strengths and lengths, set when drunk (client.js onDrink).
  { key: 'speed', category: 'potions', name: 'Speed II Potion (45 s)', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'potion_of_swiftness_2', isBlock: false, bedwars: 'speed' } },
  { key: 'jump', category: 'potions', name: 'Jump V Potion (45 s)', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'potion_of_leaping_2', isBlock: false, bedwars: 'jump' } },
  { key: 'invis', category: 'potions', name: 'Invisibility Potion (30 s)', price: cost({ emerald: 2 }), kind: 'item', give: { id: 'potion_of_invisibility', isBlock: false, bedwars: 'invis' } },
  // Utility
  { key: 'gapple', category: 'utility', name: 'Golden Apple', price: cost({ gold: 3 }), kind: 'item', give: { id: 'golden_apple', isBlock: false } },
  { key: 'fireball', category: 'utility', name: 'Fireball', price: cost({ iron: 40 }), kind: 'item', give: { id: 'fire_charge', isBlock: false, bedwars: 'fireball' } },
  { key: 'tnt', category: 'utility', name: 'TNT', price: cost({ gold: 4 }, { gold: 8 }), kind: 'item', give: { id: BLOCKS.TNT, isBlock: true } },
  { key: 'pearl', category: 'utility', name: 'Ender Pearl', price: cost({ emerald: 4 }), kind: 'item', give: { id: 'ender_pearl', isBlock: false } },
  { key: 'water', category: 'utility', name: 'Water Bucket', price: cost({ gold: 2 }, { gold: 3 }), kind: 'item', give: { id: 'water_bucket', isBlock: false } },
  { key: 'bridge_egg', category: 'utility', name: 'Bridge Egg', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'egg', isBlock: false, bedwars: 'bridge_egg' } },
  { key: 'milk', category: 'utility', name: 'Magic Milk', price: cost({ gold: 4 }), kind: 'item', give: { id: 'milk_bucket', isBlock: false, bedwars: 'magic_milk' } },
  { key: 'sponge', category: 'utility', name: 'Sponge', count: 4, price: cost({ gold: 2 }, { gold: 3 }), kind: 'item', give: { id: BLOCKS.SPONGE, isBlock: true } },
  { key: 'tower', category: 'utility', name: 'Compact Pop-up Tower', price: cost({ iron: 24 }), kind: 'item', give: { id: 'chest', isBlock: false, bedwars: 'popup_tower' } },
]);
export const CATEGORIES = Object.freeze([
  ['blocks', 'Blocks'], ['melee', 'Melee'], ['armor', 'Armor'], ['tools', 'Tools'], ['ranged', 'Ranged'], ['potions', 'Potions'], ['utility', 'Utility'],
]);

/** The Team Upgrades, by level: Solo/Doubles prices, then 3v3v3v3/4v4v4v4 (Hypixel wiki). */
export const UPGRADES = Object.freeze({
  sharpness: { name: 'Sharpened Swords', desc: 'Your team permanently gains Sharpness I on all swords and axes.', max: 1, small: [4], large: [8] },
  protection: { name: 'Reinforced Armor', desc: 'Your team permanently gains Protection on all armor pieces.', max: 4, small: [2, 4, 8, 16], large: [5, 10, 20, 30] },
  haste: { name: 'Maniac Miner', desc: 'All players on your team permanently gain Haste.', max: 2, small: [2, 4], large: [4, 6] },
  forge: { name: 'Forge', desc: 'Iron Forge +50% resources, Golden Forge +100%, Emerald Forge spawns emeralds, Molten Forge +200%.', max: 4, small: [2, 4, 6, 8], large: [4, 8, 12, 16],
    levels: ['Iron Forge', 'Golden Forge', 'Emerald Forge', 'Molten Forge'] },
  healPool: { name: 'Heal Pool', desc: 'Creates a Regeneration field around your base.', max: 1, small: [1], large: [3] },
  cushioned: { name: 'Cushioned Boots', desc: 'Your team permanently gains Feather Falling on boots.', max: 2, small: [1, 2], large: [2, 4] },
});

/** The traps, which fire in order on the first enemy into the base (wiki and the shop's own descriptions). */
export const TRAPS = Object.freeze({
  its_a_trap: { name: "It's a Trap!", desc: 'Inflicts Blindness and Slowness on the enemy for 8 seconds.' },
  counter: { name: 'Counter-Offensive Trap', desc: 'Grants Speed II and Jump Boost II for 15 seconds to allies near the base.' },
  alarm: { name: 'Alarm Trap', desc: 'Reveals invisible enemies, and tells your team who it was.' },
  miner: { name: 'Miner Fatigue Trap', desc: 'Inflicts Mining Fatigue on the enemy for 10 seconds.' },
});

export const priceGroup = (mode) => (mode === 'solo' || mode === 'doubles' ? 'small' : 'large');
export const upgradeCost = (key, level, prices = 'small') => UPGRADES[key]?.[prices]?.[level - 1] ?? null;
/** The first trap costs one diamond, the second two, the third four. */
export const trapCost = (queued) => [1, 2, 4][queued] ?? null;

// --- inventories ---------------------------------------------------------------------------------------------------

const slots = (inv) => [...(inv.hotbar ?? []), ...(inv.storage ?? [])];

/** How many of an item the player carries. */
export function countItem(inv, id) {
  return slots(inv).reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
}

/** Take `n` of an item, from wherever it is. @returns whether there were that many */
export function takeItem(inv, id, n) {
  if (countItem(inv, id) < n) return false;
  for (const list of [inv.hotbar, inv.storage]) {
    for (let i = 0; i < (list?.length ?? 0) && n > 0; i++) {
      const s = list[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(n, s.count);
      s.count -= take;
      n -= take;
      if (s.count <= 0) list[i] = null;
    }
  }
  return true;
}

/** Remove every stack the test picks. */
export function removeWhere(inv, test) {
  for (const list of [inv.hotbar, inv.storage]) for (let i = 0; i < (list?.length ?? 0); i++) if (list[i] && test(list[i])) list[i] = null;
}

export const resourcesOf = (inv) => Object.fromEntries(Object.entries(RESOURCE_ITEMS).map(([r, id]) => [r, countItem(inv, id)]));
export const canAfford = (inv, price) => Object.entries(price ?? {}).every(([r, n]) => countItem(inv, RESOURCE_ITEMS[r]) >= n);
export function pay(inv, price) {
  if (!canAfford(inv, price)) return false;
  for (const [r, n] of Object.entries(price)) takeItem(inv, RESOURCE_ITEMS[r], n);
  return true;
}

/** What a shop entry costs now: a tool's next tier, or its price in this mode's group. */
export function priceOf(entry, kit, group) {
  if (entry.kind === 'tool') {
    const tier = kit[entry.tool] ?? 0;
    return entry.tiers[tier]?.[group] ?? null;
  }
  return entry.price?.[group] ?? null;
}

/** Why an entry cannot be bought, or null: already owned, not in this mode, or too dear. */
export function whyNot(entry, { inv, kit, group, mode }) {
  if (entry.notIn?.includes(mode)) return 'Not sold in this mode';
  if (entry.kind === 'armor' && kit.armor >= entry.tier) return 'Already owned';
  if (entry.kind === 'shears' && kit.shears) return 'Already owned';
  if (entry.kind === 'tool' && (kit[entry.tool] ?? 0) >= 4) return 'Maxed';
  const price = priceOf(entry, kit, group);
  if (!price) return 'Not available';
  if (!canAfford(inv, price)) return 'Not enough resources';
  return null;
}

/**
 * Buy one entry: pay, then hand it over -- an item, a team block, a sword in place of the wooden one, or a permanent
 * tier recorded in `kit` (the loadout gives it out, now and at every respawn).
 * @returns {{ok:boolean, reason?:string, kitChanged?:boolean}}
 */
export function buy(entry, { inv, kit, team, group, mode, enchantSword = [] }) {
  const reason = whyNot(entry, { inv, kit, group, mode });
  if (reason) return { ok: false, reason };
  pay(inv, priceOf(entry, kit, group));
  switch (entry.kind) {
    case 'teamBlock': inv.addItem({ id: team[entry.block], isBlock: true, count: entry.count }); return { ok: true };
    // A Bed Wars item that is another item underneath (a Bridge Egg is an egg) carries its own name.
    case 'item': inv.addItem({ ...entry.give, count: entry.count ?? 1, ...(entry.give.bedwars ? { customName: entry.name } : {}), ...(entry.give.enchantments ? { enchantments: entry.give.enchantments.map((e) => ({ ...e })) } : {}) }); return { ok: true };
    case 'sword':
      // A better sword replaces the wooden one (Hypixel).
      removeWhere(inv, (s) => s.id === 'wooden_sword');
      inv.addItem({ id: SWORDS[entry.tier], isBlock: false, count: 1, ...(enchantSword.length ? { enchantments: enchantSword.map((e) => ({ ...e })) } : {}) });
      return { ok: true };
    case 'armor': kit.armor = entry.tier; return { ok: true, kitChanged: true };
    case 'shears': kit.shears = true; return { ok: true, kitChanged: true };
    case 'tool': kit[entry.tool] = (kit[entry.tool] ?? 0) + 1; return { ok: true, kitChanged: true };
    default: return { ok: false, reason: 'Unknown item' };
  }
}

/** A new player's permanent things: leather armour, no tools. */
export const newKit = () => ({ armor: 0, pickaxe: 0, axe: 0, shears: false });

/** Death: tools one tier lower, but never below wood; armour and shears kept (Hypixel). */
export function afterDeath(kit) {
  return { ...kit, pickaxe: kit.pickaxe > 1 ? kit.pickaxe - 1 : kit.pickaxe, axe: kit.axe > 1 ? kit.axe - 1 : kit.axe };
}

/**
 * The team upgrades' enchantments on a player's things: Sharpness on swords and axes, Protection on armour, Feather
 * Falling on boots. Applied to whatever the player holds, so a sword bought later is sharpened too.
 */
export function enchantsFor(stackId, upgrades = {}) {
  const out = [];
  const id = String(stackId);
  if (upgrades.sharpness && (/_sword$/.test(id) || /_axe$/.test(id))) out.push(ench('sharpness', 1));
  return out;
}

/** The armour a player wears for a kit and team upgrades: leather helmet and chestplate, the kit's legs and boots. */
export function armorFor(kit, upgrades = {}) {
  const tier = ARMOR_TIERS[kit.armor] ?? 'leather';
  const prot = upgrades.protection ? [ench('protection', upgrades.protection)] : [];
  const piece = (id, extra = []) => ({ id, count: 1, isBlock: false, ...(prot.length || extra.length ? { enchantments: [...prot, ...extra].map((e) => ({ ...e })) } : {}) });
  return {
    head: piece('leather_helmet'),
    chest: piece('leather_chestplate'),
    legs: piece(`${tier}_leggings`),
    feet: piece(`${tier}_boots`, upgrades.cushioned ? [ench('feather_falling', upgrades.cushioned)] : []),
  };
}

/** What a player is given on spawning: a wooden sword, their tools and shears (the armour is worn, armorFor). */
export function loadoutFor(kit, upgrades = {}) {
  const items = [{ id: 'wooden_sword', isBlock: false, count: 1 }];
  const tool = (def) => def && { id: def.id, isBlock: false, count: 1, enchantments: def.enchantments.map((e) => ({ ...e })) };
  if (kit.pickaxe) items.push(tool(PICKAXES[kit.pickaxe]));
  if (kit.axe) items.push(tool(AXES[kit.axe]));
  if (kit.shears) items.push({ id: 'shears', isBlock: false, count: 1 });
  for (const item of items) {
    const extra = enchantsFor(item.id, upgrades);
    if (extra.length) item.enchantments = [...(item.enchantments ?? []), ...extra];
  }
  return items;
}
