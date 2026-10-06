// GENERATED FILE - do not edit by hand.
//
// Canonical food values: hunger restored and saturation.
//
// Produced by scripts/generate-mc-data.mjs from PrismarineJS/minecraft-data
// (https://github.com/PrismarineJS/minecraft-data). Regenerate with:
//   node scripts/generate-mc-data.mjs
//
// Saturation is the number of saturation points restored, which is what minecraft-data and the wiki
// // both report: cooked porkchop 12.8, golden carrot 14.4, cooked mutton 9.6. `hunger.js` spends 1.5 of
// // them per health point healed, which is also the wiki's figure.

export const FOODS = {
  apple: {hunger:4,saturation:2.4},
  baked_potato: {hunger:5,saturation:6},
  beef: {hunger:3,saturation:1.8},
  beetroot: {hunger:1,saturation:1.2},
  beetroot_soup: {hunger:6,saturation:7.2},
  bread: {hunger:5,saturation:6},
  carrot: {hunger:3,saturation:3.6},
  chicken: {hunger:2,saturation:1.2},
  chorus_fruit: {hunger:4,saturation:2.4},
  cod: {hunger:2,saturation:0.4},
  cooked_beef: {hunger:8,saturation:12.8},
  cooked_chicken: {hunger:6,saturation:7.2},
  cooked_cod: {hunger:5,saturation:6},
  cooked_mutton: {hunger:6,saturation:9.6},
  cooked_porkchop: {hunger:8,saturation:12.8},
  cooked_rabbit: {hunger:5,saturation:6},
  cooked_salmon: {hunger:6,saturation:9.6},
  cookie: {hunger:2,saturation:0.4},
  dried_kelp: {hunger:1,saturation:0.6},
  enchanted_golden_apple: {hunger:4,saturation:9.6},
  glow_berries: {hunger:2,saturation:0.4},
  golden_apple: {hunger:4,saturation:9.6},
  golden_carrot: {hunger:6,saturation:14.4},
  honey_bottle: {hunger:6,saturation:1.2},
  melon_slice: {hunger:2,saturation:1.2},
  mushroom_stew: {hunger:6,saturation:7.2},
  mutton: {hunger:2,saturation:1.2},
  ominous_bottle: {hunger:1,saturation:0.2},
  poisonous_potato: {hunger:2,saturation:1.2},
  porkchop: {hunger:3,saturation:1.8},
  potato: {hunger:1,saturation:0.6},
  pufferfish: {hunger:1,saturation:0.2},
  pumpkin_pie: {hunger:8,saturation:4.8},
  rabbit: {hunger:3,saturation:1.8},
  rabbit_stew: {hunger:10,saturation:12},
  rotten_flesh: {hunger:4,saturation:0.8},
  salmon: {hunger:2,saturation:0.4},
  spider_eye: {hunger:2,saturation:3.2},
  suspicious_stew: {hunger:6,saturation:7.2},
  sweet_berries: {hunger:2,saturation:0.4},
  tropical_fish: {hunger:1,saturation:0.2},
};

/** Food values for an item name, or null when the item is not edible. */
export function foodFor(itemName) {
  return FOODS[itemName] || null;
}
