// Drinking a potion.
//
// There was none. `POTION_DATA` in `src/brewing.js` defines 39 potions with an effect, a duration and a
// level, the brewing stand produces them, and `main.js` handles `type === 'food'` for eating -- but nothing
// consumed a `type: 'potion'` item at all, so a brewed potion could not be drunk. Alchemy was a chain with
// no end to it.
//
// The effect is read from `POTION_DATA` rather than restated here, so a potion and its effect cannot drift
// apart, and anything the brewing table can produce is drinkable by construction.
import { POTION_DATA } from './brewing.js';

/** The effect a potion grants when drunk, or null for one that grants nothing. */
export function potionEffect(itemId) {
  const data = POTION_DATA[itemId];
  if (!data?.effect) return null;
  return { id: data.effect, duration: data.duration ?? 1, level: data.level ?? 1 };
}

/**
 * True when an item is a potion that can be drunk.
 *
 * Splash and lingering potions are thrown rather than drunk, so they are excluded; a water bottle, an
 * awkward potion, and the other brewing intermediates are drinkable but grant nothing, which is vanilla's
 * behaviour and is why this does not require an effect.
 */
export function isDrinkablePotion(itemId) {
  if (typeof itemId !== 'string') return false;
  if (itemId.startsWith('splash_') || itemId.startsWith('lingering_')) return false;
  return Object.prototype.hasOwnProperty.call(POTION_DATA, itemId);
}

/**
 * Drink the active potion, if it is one.
 *
 * Returns true when the potion was consumed, so the caller can stop looking for other uses of the item, and
 * false when it was not a potion at all so the caller falls through. A potion that grants no effect is still
 * consumed and still leaves a bottle, which is what happens in vanilla when a water bottle is drunk.
 *
 * @param {object} game
 * @param {string} itemId
 * @returns {boolean}
 */
export function drinkPotion(game, itemId) {
  if (!isDrinkablePotion(itemId)) return false;
  const aura = potionEffect(itemId);
  if (aura && game.player?.applyStatusEffect) {
    game.player.applyStatusEffect(aura.id, aura.duration, aura.level);
  }
  game.sounds?.playDrink?.() ?? game.sounds?.playEat?.();
  if (game.player?.gamemode !== 'creative') {
    game.inventory.consumeActiveItem?.(1);
    // A drunk potion leaves the glass bottle behind, as it does in vanilla.
    game.inventory.addItem?.('glass_bottle', 1, false);
    game.ui?.updateHotbar?.();
  }
  return true;
}
