// Golden apples.
//
// Eating one gave nothing but food. Vanilla's golden apple is the classic emergency item -- the reason you
// carry one into a fight -- and both of its effects were missing: Absorption was defined in
// `statusEffects.js` and implemented nowhere, and the apple was only ever referenced for zombie-villager
// curing.
//
// Vanilla (wiki, Golden Apple and Enchanted Golden Apple, Java Edition):
//   Golden Apple            Absorption I 2:00, Regeneration II 0:05, 4 hunger, 9.6 saturation
//   Enchanted Golden Apple  Absorption IV 2:00, Regeneration II 0:20, Fire Resistance 5:00, Resistance 5:00
// This table had Absorption II (8 extra health, not 4) and the enchanted apple's pre-1.9 Regeneration V for 30 s,
// disagreeing with the items' own effects (blocks.js, extraItems.js); eating applies both, so the larger won.
//
// The effects are listed here rather than inline at the eating site so the two apples can be tested against
// each other, and so `resistance` -- the fifth effect that nothing applied -- has a user.
import { POTION_DATA } from './brewing.js';

/** Seconds and level for each effect, by item id. */
export const GOLDEN_APPLE_EFFECTS = {
  golden_apple: [
    { id: 'absorption', seconds: 120, level: 1 },
    { id: 'regeneration', seconds: 5, level: 2 },
  ],
  enchanted_golden_apple: [
    { id: 'absorption', seconds: 120, level: 4 },
    { id: 'regeneration', seconds: 20, level: 2 },
    { id: 'fire_resistance', seconds: 300, level: 1 },
    { id: 'resistance', seconds: 300, level: 1 },
  ],
};

/** True when an item is one of the two golden apples. */
export function isGoldenApple(itemId) {
  return Object.prototype.hasOwnProperty.call(GOLDEN_APPLE_EFFECTS, itemId);
}

/** The effects an item grants, or an empty array. */
export function goldenAppleEffects(itemId) {
  return GOLDEN_APPLE_EFFECTS[itemId] ?? [];
}

/**
 * Apply a golden apple's effects to a player.
 *
 * Returns true when the item was a golden apple, so the caller can stop; false otherwise. Consuming the item
 * and the hunger restore belong to the eating path, not here.
 *
 * @param {object} player
 * @param {string} itemId
 * @returns {boolean}
 */
export function applyGoldenApple(player, itemId) {
  if (!isGoldenApple(itemId)) return false;
  for (const effect of goldenAppleEffects(itemId)) {
    player?.applyStatusEffect?.(effect.id, effect.seconds, effect.level);
  }
  return true;
}

// Referenced so the potion table stays the single source for what an effect id means; if a potion ever
// grants resistance this file and `brewing.js` will have to agree about it.
void POTION_DATA;
