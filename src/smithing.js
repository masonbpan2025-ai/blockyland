// The smithing table, which had no behaviour at all.
//
// `smithing_table` has been a placeable block with a `workstation` field and nothing behind it: there was no
// interaction branch for it in `main.js`, no module, and no recipe. The consequence showed up in the
// Resource Inspector rather than by looking -- every piece of netherite gear read as "no crafting, smelting,
// brewing, mob-loot or block-drop source", because in vanilla that is exactly where all of it comes from.
//
// Vanilla's rule (1.20 onwards) is the netherite upgrade: a Netherite Upgrade Smithing Template, a diamond
// piece of gear, and a netherite ingot. The template is NOT consumed; the base and the ingot are. The result
// keeps the base's enchantments and its current durability, and gains netherite's own maximum.
//
// Armour trims are deliberately not applied. The templates and the trim materials exist, and a trim's only
// effect is a cosmetic one this game does not render, so returning a "trimmed" item would be claiming a
// behaviour nothing implements. `calculateSmithingResult` says so in as many words instead.
import { ITEMS } from './blocks.js';
import { maxDurabilityFor } from './durability.js';

export const NETHERITE_UPGRADE_TEMPLATE = 'netherite_upgrade_smithing_template';
export const NETHERITE_INGOT = 'netherite_ingot';

/**
 * The nine things a netherite upgrade template can be applied to.
 *
 * A named table rather than a name rewrite (`diamond_x` -> `netherite_x`): `golden_` and `netherite_` both
 * appear in this game's ids and a rewrite would happily "upgrade" something vanilla has no netherite form
 * of, inventing an item that does not exist.
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

/** Armour trim templates, which this game has as items but cannot apply. */
export const TRIM_TEMPLATES = [
  'bolt_armor_trim_smithing_template', 'coast_armor_trim_smithing_template',
  'dune_armor_trim_smithing_template', 'eye_armor_trim_smithing_template',
  'flow_armor_trim_smithing_template', 'host_armor_trim_smithing_template',
  'raiser_armor_trim_smithing_template', 'rib_armor_trim_smithing_template',
  'sentry_armor_trim_smithing_template', 'shaper_armor_trim_smithing_template',
  'silence_armor_trim_smithing_template', 'snout_armor_trim_smithing_template',
  'spire_armor_trim_smithing_template', 'tide_armor_trim_smithing_template',
  'vex_armor_trim_smithing_template', 'ward_armor_trim_smithing_template',
  'wayfinder_armor_trim_smithing_template', 'wild_armor_trim_smithing_template',
];

const idOf = (item) => (item && typeof item === 'object' ? item.id : item) ?? null;
const nameOf = (id) => ITEMS[id]?.name ?? id ?? 'nothing';

const invalid = (reason) => ({ valid: false, result: null, reason });

/**
 * What a smithing table produces from its three slots, and why not when it produces nothing.
 *
 * @param {object|null} template the smithing template slot
 * @param {object|null} base the gear slot
 * @param {object|null} addition the material slot
 * @returns {{valid: boolean, result: object|null, reason: string, templateSurvives?: boolean}}
 */
export function calculateSmithingResult(template, base, addition) {
  const templateId = idOf(template);
  const baseId = idOf(base);
  const additionId = idOf(addition);

  if (!templateId || !baseId || !additionId) {
    return invalid('Put a template, a piece of gear and a material in the three slots.');
  }

  if (templateId !== NETHERITE_UPGRADE_TEMPLATE) {
    // Named separately from "not a template" because the item is real, the recipe is real in vanilla, and
    // the reason it does nothing here is worth stating rather than lumping in.
    if (TRIM_TEMPLATES.includes(templateId)) {
      return invalid('Armour trims are cosmetic and are not applied yet.');
    }
    return invalid(`${nameOf(templateId)} is not a smithing template.`);
  }

  const upgraded = NETHERITE_UPGRADE[baseId];
  if (!upgraded) {
    return invalid(`A netherite upgrade template cannot be applied to ${nameOf(baseId).toLowerCase()}.`);
  }

  if (additionId !== NETHERITE_INGOT) {
    return invalid(`The netherite upgrade needs a netherite ingot, not ${nameOf(additionId).toLowerCase()}.`);
  }

  const result = {
    id: upgraded,
    isBlock: false,
    count: 1,
    // Vanilla keeps the enchantments and the remaining durability of the piece that was upgraded.
    enchantments: Array.isArray(base.enchantments) ? base.enchantments.map((e) => ({ ...e })) : [],
    maxDurability: maxDurabilityFor(upgraded),
  };
  if (typeof base.durability === 'number') result.durability = base.durability;

  return { valid: true, result, reason: '', templateSurvives: true };
}
