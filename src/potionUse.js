// Drinking a potion.
//
// Kept out of `main.js`'s use-item path so it can be driven directly by a test: the effect a potion
// applies is the whole feature, and the alternative is asserting on the shape of a 2,600-line file.
// `main.js` decides *when* the player drinks; this decides what happens.
//
// Vanilla drinks the potion, applies its effect and hands back the empty bottle. Three of POTION_DATA's
// 36 potions are base potions with no effect at all -- water, awkward, thick, mundane -- and they are
// still consumed, because that is what vanilla does and it is how a player discards one.
import { potionDataFor } from './brewing.js';

/**
 * Effects that resolve in one instant rather than over a duration.
 *
 * POTION_DATA gives these an `amount` instead of a `duration`. Healing and Harming are the only two,
 * and neither can go through `applyStatusEffect`, which stores a timer.
 */
export const INSTANT_EFFECTS = new Set(['instant_health', 'instant_damage']);

/** Is this item something the player can drink, as opposed to throw? */
export function isDrinkablePotion(itemId) {
  const data = potionDataFor(itemId);
  return Boolean(data) && !data.splash && !data.lingering;
}

/**
 * Apply a potion's effect to the player.
 *
 * Split out so the instant/duration branch is testable on its own, and so `drinkPotion` reads as the
 * three things vanilla does rather than as a nest of conditions.
 *
 * @returns {{effect: string|null, instant: boolean, level: number}}
 */
export function applyPotionEffect(potion, player) {
  const effect = potion.effect ?? null;
  if (!effect) return { effect: null, instant: false, level: 1 };

  if (effect === 'instant_health') {
    const amount = potion.amount ?? 4;
    player.health = Math.min(player.maxHealth, player.health + amount);
    return { effect, instant: true, level: potion.level ?? 1 };
  }
  if (effect === 'instant_damage') {
    // Routed through takeDamage so the death path, exhaustion and difficulty handling stay in one
    // place. Magic is not shield-blockable in vanilla, and `takeDamage` already exempts the types it
    // cannot block from the shield check.
    const amount = potion.amount ?? 6;
    player.takeDamage?.(amount, null, 'magic');
    return { effect, instant: true, level: potion.level ?? 1 };
  }

  player.applyStatusEffect?.(effect, potion.duration ?? 30, potion.level ?? 1);
  return { effect, instant: false, level: potion.level ?? 1 };
}

/**
 * Drink the potion in hand.
 *
 * @param {string} itemId              the held item
 * @param {object} player              needs `health`, `maxHealth`, `applyStatusEffect`, `takeDamage`
 * @param {object} inventory           needs `consumeActiveItem` and `addItem`
 * @param {{gamemode?: string}} [options] creative does not consume the potion, as elsewhere
 * @returns {{drunk: boolean, reason?: string, effect?: string|null, instant?: boolean}}
 */
export function drinkPotion(itemId, player, inventory, { gamemode = 'survival' } = {}) {
  const potion = potionDataFor(itemId);
  // A splash or lingering potion is thrown, not drunk. Silently swallowing one would consume the item
  // and skip the behaviour it exists for, so this refuses rather than pretending.
  if (!potion) return { drunk: false, reason: 'not-a-potion' };
  if (potion.splash) return { drunk: false, reason: 'splash-is-thrown' };
  if (potion.lingering) return { drunk: false, reason: 'lingering-is-thrown' };

  if (gamemode !== 'creative') {
    inventory.consumeActiveItem?.(1);
    // The empty bottle comes back, so a potion is a bottle plus an ingredient rather than a loss.
    inventory.addItem?.('glass_bottle', 1, false);
  }
  const applied = applyPotionEffect(potion, player);
  return { drunk: true, effect: applied.effect, instant: applied.instant };
}
