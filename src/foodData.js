// GENERATED FILE - do not edit by hand.
//
// Canonical food values: hunger restored and saturation.
//
// Produced by scripts/generate-mc-data.mjs from PrismarineJS/minecraft-data
// (https://github.com/PrismarineJS/minecraft-data). Regenerate with:
//   node scripts/generate-mc-data.mjs
//
// minecraft-data reports saturation in the doubled internal units the client uses; the values
// // here are halved back to the saturation points players see.

export const FOODS = {
  apple: {hunger:4,saturation:1.2},
  baked_potato: {hunger:5,saturation:3},
  beef: {hunger:3,saturation:0.9},
  beetroot: {hunger:1,saturation:0.6},
  beetroot_soup: {hunger:6,saturation:3.6},
  bread: {hunger:5,saturation:3},
  carrot: {hunger:3,saturation:1.8},
  chicken: {hunger:2,saturation:0.6},
  chorus_fruit: {hunger:4,saturation:1.2},
  cod: {hunger:2,saturation:0.2},
  cooked_beef: {hunger:8,saturation:6.4},
  cooked_chicken: {hunger:6,saturation:3.6},
  cooked_cod: {hunger:5,saturation:3},
  cooked_mutton: {hunger:6,saturation:4.8},
  cooked_porkchop: {hunger:8,saturation:6.4},
  cooked_rabbit: {hunger:5,saturation:3},
  cooked_salmon: {hunger:6,saturation:4.8},
  cookie: {hunger:2,saturation:0.2},
  dried_kelp: {hunger:1,saturation:0.3},
  enchanted_golden_apple: {hunger:4,saturation:4.8},
  glow_berries: {hunger:2,saturation:0.2},
  golden_apple: {hunger:4,saturation:4.8},
  golden_carrot: {hunger:6,saturation:7.2},
  honey_bottle: {hunger:6,saturation:0.6},
  melon_slice: {hunger:2,saturation:0.6},
  mushroom_stew: {hunger:6,saturation:3.6},
  mutton: {hunger:2,saturation:0.6},
  ominous_bottle: {hunger:1,saturation:0.1},
  poisonous_potato: {hunger:2,saturation:0.6},
  porkchop: {hunger:3,saturation:0.9},
  potato: {hunger:1,saturation:0.3},
  pufferfish: {hunger:1,saturation:0.1},
  pumpkin_pie: {hunger:8,saturation:2.4},
  rabbit: {hunger:3,saturation:0.9},
  rabbit_stew: {hunger:10,saturation:6},
  rotten_flesh: {hunger:4,saturation:0.4},
  salmon: {hunger:2,saturation:0.2},
  spider_eye: {hunger:2,saturation:1.6},
  suspicious_stew: {hunger:6,saturation:3.6},
  sweet_berries: {hunger:2,saturation:0.2},
  tropical_fish: {hunger:1,saturation:0.1},
};

/** Food values for an item name, or null when the item is not edible. */
export function foodFor(itemName) {
  return FOODS[itemName] || null;
}
