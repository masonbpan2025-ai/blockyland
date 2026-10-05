// GENERATED FILE - do not edit by hand.
//
// Smelting and fuel entries vanilla has that this game was missing, plus per-recipe smelting XP.
//
// Produced by scripts/generate-smelting.mjs from Mineclonia's own cooking and fuel declarations
// (https://codeberg.org/mineclonia/mineclonia), fetched by scripts/fetch-mineclonia-cooking.mjs,
// plus a hand-verified table of vanilla furnace recipes Mineclonia's item set does not cover: chorus
// fruit, smooth basalt and quartz, the raw metal blocks, the horse armours, and recycling iron,
// golden, chainmail and netherite gear into nuggets or scrap.
// minecraft-data publishes no smelting data, so Mineclonia is the reference for it; its fields are
// declared vanilla-identical and the sampled values match.
//
// The XP table is NOT from Mineclonia: it gives exactly 1 experience for every smelted item, and
// says so in a source comment ("ToDo give each recipe an idividial XP count"). Vanilla varies per
// recipe, so the vanilla values are used instead, from the verified research table.

import { BLOCKS } from './blocks.js';

const B = BLOCKS;

/** Smelting recipes to add, keyed the way furnace.js keys its table. */
export const EXTRA_SMELTING = {
  [B.SEA_PICKLE]: { id: 'lime_dye', isBlock: false, count: 1, xp: 0.1 },
  [B.RED_SANDSTONE]: { id: B.SMOOTH_RED_SANDSTONE, isBlock: true, count: 1, xp: 0.1 },
  [B.BASALT]: { id: B.SMOOTH_BASALT, isBlock: true, count: 1, xp: 0.1 },
  [B.COAL_ORE]: { id: 'coal', isBlock: false, count: 1, xp: 0.1 },
  [B.DIAMOND_ORE]: { id: 'diamond', isBlock: false, count: 1, xp: 1 },
  [B.REDSTONE_ORE]: { id: 'redstone', isBlock: false, count: 1, xp: 0.7 },
  [B.EMERALD_ORE]: { id: 'emerald', isBlock: false, count: 1, xp: 1 },
  [B.CAULDRON]: { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  [B.SANDSTONE]: { id: B.SMOOTH_SANDSTONE, isBlock: true, count: 1, xp: 0.1 },
  [B.STONE_BRICKS]: { id: B.CRACKED_STONE_BRICKS, isBlock: true, count: 1, xp: 0.1 },
  [B.QUARTZ_BLOCK]: { id: B.SMOOTH_QUARTZ, isBlock: true, count: 1, xp: 0.1 },
  [B.RAW_COPPER_BLOCK]: { id: B.COPPER_BLOCK, isBlock: true, count: 1, xp: 0.1 },
  [B.RAW_GOLD_BLOCK]: { id: B.GOLD_BLOCK, isBlock: true, count: 1, xp: 0.1 },
  [B.RAW_IRON_BLOCK]: { id: B.IRON_BLOCK, isBlock: true, count: 1, xp: 0.1 },
  [B.LAPIS_ORE]: { id: 'lapis_lazuli', isBlock: false, count: 1, xp: 0.2 },
  [B.NETHER_QUARTZ_ORE]: { id: 'quartz', isBlock: false, count: 1, xp: 0.2 },
  [B.ANCIENT_DEBRIS]: { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'bucket': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'chainmail_chestplate': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'chainmail_helmet': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'chorus_fruit': { id: 'popped_chorus_fruit', isBlock: false, count: 1, xp: 0.1 },
  'diamond_horse_armor': { id: 'diamond', isBlock: false, count: 1, xp: 1 },
  'golden_axe': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_boots': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_carrot': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_chestplate': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_helmet': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_hoe': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_horse_armor': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_leggings': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_pickaxe': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_shovel': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'golden_sword': { id: 'gold_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_axe': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_boots': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_chestplate': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_helmet': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_hoe': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_horse_armor': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_leggings': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_pickaxe': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_shovel': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'iron_sword': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
  'netherite_axe': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_boots': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_chestplate': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_helmet': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_hoe': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_leggings': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_pickaxe': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_shovel': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'netherite_sword': { id: 'netherite_scrap', isBlock: false, count: 1, xp: 2 },
  'shears': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
};

/** Experience to add to recipes the game already has, keyed the same way. */
export const SMELTING_XP = {
  baked_potato: 0.35,
  brick: 0.3,
  charcoal: 0.15,
  coal: 0.1,
  cooked_beef: 0.35,
  cooked_chicken: 0.35,
  cooked_cod: 0.35,
  cooked_mutton: 0.35,
  cooked_porkchop: 0.35,
  cooked_rabbit: 0.35,
  cooked_salmon: 0.35,
  copper_ingot: 0.7,
  cracked_stone_bricks: 0.1,
  diamond: 1,
  dried_kelp: 0.1,
  emerald: 1,
  glass: 0.1,
  gold_ingot: 1,
  green_dye: 1,
  iron_ingot: 0.7,
  lapis_lazuli: 0.2,
  nether_brick: 0.1,
  netherite_scrap: 2,
  quartz: 0.2,
  redstone: 0.7,
  smooth_red_sandstone: 0.1,
  smooth_sandstone: 0.1,
  smooth_stone: 0.1,
  sponge: 0.15,
  terracotta: 0.1,
};

/** Fuel values to add or correct, in seconds. */
export const EXTRA_FUEL = {
  'bowl': 10,
};

/** Default experience for a smelted item with no specific value. Vanilla uses 0.1 for food. */
export const DEFAULT_SMELTING_XP = 0.1;

export const SMELTING_STATS = {
  "smeltingAdded": 11,
  "vanillaAdded": 42,
  "fuelAdded": 1,
  "alreadyCorrect": 13,
  "xpEntries": 30,
  "unresolvedNames": 8,
  "defaultedXp": 33
};
