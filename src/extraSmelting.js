// GENERATED FILE - do not edit by hand.
//
// Smelting and fuel entries vanilla has that this game was missing, plus per-recipe smelting XP.
//
// Produced by scripts/generate-smelting.mjs from Mineclonia's own cooking and fuel declarations
// (https://codeberg.org/mineclonia/mineclonia), fetched by scripts/fetch-mineclonia-cooking.mjs.
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
  [B.RED_SANDSTONE]: { id: B.SMOOTH_RED_SANDSTONE, isBlock: true, count: 1, xp: 0.1 },
  [B.COAL_ORE]: { id: 'coal', isBlock: false, count: 1, xp: 0.1 },
  [B.DIAMOND_ORE]: { id: 'diamond', isBlock: false, count: 1, xp: 1 },
  [B.REDSTONE_ORE]: { id: 'redstone', isBlock: false, count: 1, xp: 0.7 },
  [B.EMERALD_ORE]: { id: 'emerald', isBlock: false, count: 1, xp: 1 },
  [B.SANDSTONE]: { id: B.SMOOTH_SANDSTONE, isBlock: true, count: 1, xp: 0.1 },
  [B.STONE_BRICKS]: { id: B.CRACKED_STONE_BRICKS, isBlock: true, count: 1, xp: 0.1 },
  'iron_horse_armor': { id: 'iron_nugget', isBlock: false, count: 1, xp: 0.1 },
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
  nether_brick: 0.1,
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
  "smeltingAdded": 8,
  "fuelAdded": 1,
  "alreadyCorrect": 13,
  "xpEntries": 27,
  "unresolvedNames": 11,
  "defaultedXp": 1
};
