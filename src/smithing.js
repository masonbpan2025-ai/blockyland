// Smithing: the netherite upgrade and armour trimming.
//
// `smithing_table` was a placeable block with nothing behind it -- no interaction branch, no module, no
// recipe -- so every piece of netherite gear read as having no source at all, and the 18 trim templates
// this game already ships were items nothing could use.
//
// Vanilla's two recipes (1.20 onwards), from https://minecraft.wiki/w/Smithing:
//
//   Upgrade   Netherite Upgrade + diamond gear + netherite ingot -> the netherite piece
//             "the newly crafted netherite gear retains the enchantments, trims, name, prior work
//              penalty, and number of durability points lost (instead of the remaining durability)"
//             The TEMPLATE SURVIVES: "the template is not consumed" for an upgrade.
//
//   Trim      any Armor Trim + any armour piece + an ingot/crystal -> the trimmed piece
//             "The template is consumed in the process."
//             "All trims are purely decorative, and don't impact gameplay in any way" -- with one
//              exception this file also models: gold trim and piglins, in `piglin.js`.
//             "Armor with a trim can be trimmed again by applying another template to it; the old trim
//              pattern is overwritten." So one piece carries at most one trim.
import { BLOCK_DEFS, ITEMS } from './blocks.js';
import { maxDurabilityFor } from './durability.js';

export const NETHERITE_UPGRADE_TEMPLATE = 'netherite_upgrade_smithing_template';
export const NETHERITE_INGOT = 'netherite_ingot';

/**
 * The nine things a netherite upgrade template can be applied to.
 *
 * A named table rather than a name rewrite (`diamond_x` -> `netherite_x`): `golden_` and `netherite_` both
 * appear in this game's ids and a rewrite would happily "upgrade" something vanilla has no netherite form
 * of, inventing an item that does not exist.
 *
 * The wiki's table also lists Netherite Horse Armour, Nautilus Armour and a Spear. None of those diamond
 * pieces exist in this game (the gold/iron/diamond horse armours are registered but there is no netherite
 * one), so they are absent here rather than mapped onto something close.
 */
export const NETHERITE_UPGRADE = {
  diamond_sword: 'netherite_sword',
  diamond_pickaxe: 'netherite_pickaxe',
  diamond_axe: 'netherite_axe',
  diamond_shovel: 'netherite_shovel',
  diamond_hoe: 'netherite_hoe',
  diamond_helmet: 'netherite_helmet',
  diamond_chestplate: 'netherite_chestplate',
  diamond_leggings: 'netherite_leggings',
  diamond_boots: 'netherite_boots',
};

/**
 * The 18 armour trim patterns, keyed by their template.
 *
 * The template's item id already carries the pattern (`bolt_armor_trim_smithing_template`), so the value
 * is the bare pattern name the trim is recorded under on the item and shown to the player.
 */
export const TRIM_PATTERNS = {
  bolt_armor_trim_smithing_template: 'bolt',
  coast_armor_trim_smithing_template: 'coast',
  dune_armor_trim_smithing_template: 'dune',
  eye_armor_trim_smithing_template: 'eye',
  flow_armor_trim_smithing_template: 'flow',
  host_armor_trim_smithing_template: 'host',
  raiser_armor_trim_smithing_template: 'raiser',
  rib_armor_trim_smithing_template: 'rib',
  sentry_armor_trim_smithing_template: 'sentry',
  shaper_armor_trim_smithing_template: 'shaper',
  silence_armor_trim_smithing_template: 'silence',
  snout_armor_trim_smithing_template: 'snout',
  spire_armor_trim_smithing_template: 'spire',
  tide_armor_trim_smithing_template: 'tide',
  vex_armor_trim_smithing_template: 'vex',
  ward_armor_trim_smithing_template: 'ward',
  wayfinder_armor_trim_smithing_template: 'wayfinder',
  wild_armor_trim_smithing_template: 'wild',
};

/** The 18 trim templates, as a list. Kept for callers that only need "is this a trim template". */
export const TRIM_TEMPLATES = Object.keys(TRIM_PATTERNS);

/**
 * The 11 trim materials, with the colour the trim takes.
 *
 * These are the wiki's "List of tooltip text colors for all materials", which is the palette the game
 * itself uses: amethyst `#9A5CC6`, copper `#B4684D`, diamond `#6EECD2`, emerald `#11A036`, gold
 * `#DEB12D`, iron `#ECECEC`, lapis `#416E97`, quartz `#E3D4C4`, netherite `#625859`, redstone `#971607`,
 * resin `#FC7812`.
 *
 * The material is not always named the same as its item: the wiki says "Nether Quartz" and "Redstone
 * Dust" where this game's ids are `quartz` and `redstone`.
 */
export const TRIM_MATERIALS = {
  amethyst_shard: { name: 'Amethyst', color: '#9A5CC6' },
  copper_ingot: { name: 'Copper', color: '#B4684D' },
  diamond: { name: 'Diamond', color: '#6EECD2' },
  emerald: { name: 'Emerald', color: '#11A036' },
  gold_ingot: { name: 'Gold', color: '#DEB12D' },
  iron_ingot: { name: 'Iron', color: '#ECECEC' },
  lapis_lazuli: { name: 'Lapis', color: '#416E97' },
  quartz: { name: 'Nether Quartz', color: '#E3D4C4' },
  netherite_ingot: { name: 'Netherite', color: '#625859' },
  redstone: { name: 'Redstone', color: '#971607' },
  resin_brick: { name: 'Resin', color: '#FC7812' },
};

/**
 * The armour pieces a trim can be applied to.
 *
 * The wiki's recipe is "Any Armor Trim + Any Armor Piece + Any Ingot/Crystal", and its example strip shows
 * netherite, iron, golden, diamond, chainmail and leather armour plus the Turtle Shell. Every armour item
 * this game registers is derivable from its `armorSlot`, so this is a rule rather than a list -- which is
 * what makes the turtle shell work without being named, and would make a copper set work if one existed.
 *
 * A trim on a non-armour trimmable (an elytra or a shield) is vanilla's own extension of the recipe and is
 * deliberately NOT modelled: this game's elytra has no armour slot to carry a trim, and applying one would
 * be recording a decoration on an item whose renderer ignores it.
 */
export function isTrimmableArmour(itemId) {
  return Boolean(ITEMS[itemId]?.armorSlot);
}

const idOf = (item) => (item && typeof item === 'object' ? item.id : item) ?? null;
const nameOf = (id) => ITEMS[id]?.name ?? id ?? 'nothing';

const invalid = (reason) => ({ valid: false, result: null, reason });

/**
 * What a smithing table produces from its three slots, and why not when it produces nothing.
 *
 * @param {object|null} template the smithing template slot
 * @param {object|null} base the gear slot
 * @param {object|null} addition the material slot
 * @returns {{valid: boolean, result: object|null, reason: string,
 *            templateSurvives?: boolean, operation?: 'upgrade'|'trim'}}
 */
export function calculateSmithingResult(template, base, addition) {
  const templateId = idOf(template);
  const baseId = idOf(base);
  const additionId = idOf(addition);

  if (!templateId || !baseId || !additionId) {
    return invalid('Put a template, a piece of gear and a material in the three slots.');
  }

  if (templateId === NETHERITE_UPGRADE_TEMPLATE) {
    return netheriteUpgrade(base, baseId, additionId);
  }
  if (TRIM_PATTERNS[templateId]) {
    return applyTrim(base, baseId, templateId, additionId);
  }
  return invalid(`${nameOf(templateId)} is not a smithing template.`);
}

/**
 * The netherite upgrade: the template survives, the gear and the ingot do not.
 */
function netheriteUpgrade(base, baseId, additionId) {
  const upgraded = NETHERITE_UPGRADE[baseId];
  if (!upgraded) {
    return invalid(`A netherite upgrade template cannot be applied to ${nameOf(baseId).toLowerCase()}.`);
  }
  if (additionId !== NETHERITE_INGOT) {
    return invalid(`The netherite upgrade needs a netherite ingot, not ${nameOf(additionId).toLowerCase()}.`);
  }

  const newMax = maxDurabilityFor(upgraded);
  const result = {
    id: upgraded,
    isBlock: false,
    count: 1,
    // Vanilla keeps the enchantments and the trims of the piece that was upgraded. The trim is carried
    // through here as well as the enchantments because the wiki names it in the same sentence, and an
    // upgrade that dropped a trim would be a silent loss of a template the player spent.
    enchantments: copyList(base.enchantments),
    maxDurability: newMax,
  };
  if (base.trim) result.trim = { ...base.trim };

  // "the number of durability points lost (instead of the remaining durability)". The new piece has its
  // own maximum, and the same number of points are missing from it. Keeping the remaining figure instead
  // would have GIVEN the player durability when the new maximum is higher (a pickaxe at 120 of 1561
  // became 120 of 2031, a gift of 1440) and TAKEN it away for the two pieces whose netherite maximum is
  // lower than diamond's.
  if (typeof base.durability === 'number' && typeof base.maxDurability === 'number' && base.maxDurability > 0) {
    const lost = Math.max(0, base.maxDurability - base.durability);
    result.durability = Math.max(0, newMax - lost);
  } else if (typeof base.durability === 'number') {
    // No recorded maximum to measure the loss against, so the remaining figure carries over unchanged
    // rather than being guessed at.
    result.durability = base.durability;
  }

  // "retains the enchantments, trims, name, prior work penalty, and number of durability points lost".
  // The name and the penalty were both being dropped.
  if (base.customName) result.customName = base.customName;
  if (typeof base.repairCost === 'number') result.repairCost = base.repairCost;

  return { valid: true, result, reason: '', templateSurvives: true, operation: 'upgrade' };
}

/**
 * An armour trim: the template is consumed, the armour and the material are not replaced.
 *
 * The result is the same armour item carrying a `trim`, because "all trims are purely decorative" -- there
 * is no separate trimmed item in vanilla, only the one item with a trim recorded on it.
 */
function applyTrim(base, baseId, templateId, additionId) {
  const material = TRIM_MATERIALS[additionId];
  if (!material) {
    return invalid(`${nameOf(additionId)} is not a trim material. An armour trim takes an ingot or a crystal.`);
  }
  if (!isTrimmableArmour(baseId)) {
    return invalid(`${nameOf(baseId)} is not a piece of armour, so it cannot take a trim.`);
  }

  const pattern = TRIM_PATTERNS[templateId];
  const newMax = maxDurabilityFor(baseId);
  const result = {
    ...base,
    id: baseId,
    isBlock: false,
    count: 1,
    // "the old trim pattern is overwritten in the process" -- one trim per piece, never two.
    trim: { pattern, material: additionId, color: material.color, name: material.name },
    enchantments: copyList(base.enchantments),
  };
  // A trim changes nothing but the appearance, so whatever the piece had carries over untouched. The
  // explicit fields are re-stated so the result is a plain object a caller can serialise, not a reference
  // into the inventory slot that was consumed.
  if (newMax !== null && newMax !== undefined) result.maxDurability = base.maxDurability ?? newMax;
  if (typeof base.durability === 'number') result.durability = base.durability;
  if (base.customName) result.customName = base.customName;
  if (typeof base.repairCost === 'number') result.repairCost = base.repairCost;

  return { valid: true, result, reason: '', templateSurvives: false, operation: 'trim' };
}

/**
 * A copy of an enchantment list, so the result never aliases the slot that was consumed.
 *
 * A non-array (including `undefined`) becomes an empty array, which is what the inventory expects.
 */
function copyList(list) {
  return Array.isArray(list) ? list.map((e) => ({ ...e })) : [];
}

/**
 * The trim recorded on an item, or null.
 *
 * The one place a caller should ask, so a future change to where the trim is stored cannot leave a reader
 * looking at the old shape.
 */
export function trimOf(item) {
  if (!item || typeof item !== 'object') return null;
  const trim = item.trim;
  if (!trim || typeof trim !== 'object') return null;
  return trim.pattern && trim.material ? trim : null;
}

/**
 * The template id a player's short name means, or null when it names none.
 *
 * `netherite_upgrade` and `sentry_armor_trim` are how a player says it; the item ids are the full
 * `..._smithing_template` names. Only the exact names of the 19 templates resolve, so a typo does not
 * quietly become a different template.
 */
export function resolveSmithingTemplate(name) {
  const clean = String(name ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  for (const candidate of [clean, `${clean}_smithing_template`, `${clean}_armor_trim_smithing_template`]) {
    if (candidate === NETHERITE_UPGRADE_TEMPLATE || TRIM_PATTERNS[candidate]) return candidate;
  }
  return null;
}

/**
 * The two blocks that survive fire and lava as dropped items: ancient debris and the block of netherite (their
 * damage_resistant component on the wiki, Module:Default data component/items). A block drops as its numeric id,
 * which the id-prefix rule below never saw, so both burned; found by the wiki parity audit's I-FIREPROOF case.
 */
const FIREPROOF_BLOCKS = new Set(['Ancient Debris', 'Block of Netherite']);

/**
 * True when a dropped item survives lava and fire.
 *
 * The wiki lists "fire and lava resistance when dropped" among what a netherite upgrade gives. Every netherite
 * item carries it -- the ingot, the gear -- and the id prefix is the rule, except the upgrade template, which is a
 * template and burns like one. A trim does not change it: a
 * non-netherite armour piece trimmed with netherite still burns, which is why this reads the id and not the trim.
 */
export function isFireproof(itemId) {
  if (typeof itemId === 'number') return FIREPROOF_BLOCKS.has(BLOCK_DEFS[itemId]?.name);
  return typeof itemId === 'string' && itemId.startsWith('netherite_') && !itemId.endsWith('_smithing_template');
}

/**
 * True when an item is trimmed with gold, which is the one trim with a gameplay effect.
 *
 * The wiki: "Piglins do not pick up any gold-trimmed armor pieces and remain hostile toward players
 * wearing gold-trimmed armor, unless the base armor is also golden." The "unless" is the caller's, because
 * it is a rule about the piglin, not about the trim.
 */
export function hasGoldTrim(item) {
  return trimOf(item)?.material === 'gold_ingot';
}
