// Tipped arrows: which potion an arrow carries, and for how long.
//
// The effect plumbing already existed before this file: `spawnArrow` stores `options.effect` on the arrow
// and `updateArrows` applies it to whatever it hits. What was missing is that `bow.js` never passed one and
// did not accept a tipped arrow as ammo at all, so the three tipped-arrow items in the game could not be
// fired -- they were droppable loot with no use.
//
// The durations are DERIVED from the potion table rather than typed in, so an arrow cannot drift away from
// the potion it is made from.
import { POTION_DATA } from './brewing.js';
import { TIPPED_ARROWS } from './tippedArrowItems.js';

/**
 * Vanilla: a tipped arrow carries its potion's effect for one eighth of the potion's duration.
 *
 * The same rule is what makes a lingering potion one quarter; that one is not implemented because the game
 * has no lingering potions at all, so there is nothing to apply it to.
 */
export const TIPPED_ARROW_DURATION_FACTOR = 1 / 8;

/** Which potion each tipped arrow is brewed from. */
export const TIPPED_ARROW_SOURCE = Object.fromEntries(TIPPED_ARROWS.map((a) => [a.id, a.potion]));

/** True for any item id that names a tipped arrow. */
export function isTippedArrow(itemId) {
  // The plain `tipped_arrow` too: an awkward, thick or mundane potion makes one (Java), and it flies like an arrow.
  return itemId === 'tipped_arrow' || (typeof itemId === 'string' && itemId.startsWith('tipped_arrow_'));
}

/**
 * The effect a tipped arrow applies, or null for anything else.
 *
 * Floors rather than rounds: vanilla's Arrow of Poison is five seconds and its Arrow of Weakness eleven,
 * and the potions they come from are 45s and 90s. Rounding gives six for the poison arrow, flooring gives
 * five. Both figures are the ones this data can actually justify.
 *
 * @param {string} itemId
 * @returns {{id:string, duration:number, level:number}|null}
 */
export function tippedArrowEffect(itemId) {
  if (!isTippedArrow(itemId)) return null;
  const potionKey = TIPPED_ARROW_SOURCE[itemId];
  // An arrow with no known potion is not guessed at. A wrong duration is worse than none, and the three
  // named above are the ones the game actually has items for.
  if (!potionKey) return null;
  const potion = POTION_DATA[potionKey];
  if (!potion?.effect) return null;
  // An instant effect (healing, harming) has no duration to divide: it is applied once.
  const duration = potion.duration ? Math.max(1, Math.floor(potion.duration * TIPPED_ARROW_DURATION_FACTOR)) : 1;
  return { id: potion.effect, duration, level: potion.level ?? 1 };
}
