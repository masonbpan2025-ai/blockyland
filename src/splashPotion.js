// Thrown splash potions.
//
// The throw in `main.js` was hard-coded to one item:
//
//     if (splashItem && (splashItem.id === 'splash_potion_of_weakness' || splashItem.id === 'potion_weakness'))
//
// `potion_weakness` is not an item that exists, and nothing else matched -- so **39 splash potion items did
// nothing at all** when used. They exist, they brew (gunpowder plus any potion), and they were inert.
//
// Three faults in that one line, all now fixed here:
//
//   1. Only Weakness was thrown. Anything else fell through to block placement.
//   2. The debuff was hard-coded to `weakness` for 60 seconds regardless of the potion.
//   3. Only MOBS were affected. Vanilla splashes the thrower too, which is how a self-splash of Fire
//      Resistance works and why standing in your own Harming potion hurts.
//
// The effect is read from `POTION_DATA` by stripping the `splash_` prefix, so a potion and its splash form
// cannot disagree and anything the brewing stand can produce is throwable by construction.
import { POTION_DATA, potionCoreFor } from './brewing.js';
import { effectsFor } from './statusEffects.js';

/** Vanilla applies a splash potion within four blocks of where it lands. */
export const SPLASH_RADIUS = 4.0;

/** True for an item id that is a splash form of a known potion. */
export function isSplashPotion(itemId) {
  if (typeof itemId !== 'string' || !itemId.startsWith('splash_')) return false;
  // `potionCoreFor` rather than stripping the prefix: vanilla's generic `splash_potion` is the water potion,
  // and its core is this game's `water_bottle`, so the prefix rule did not recognise the item at all -- a
  // thrown splash potion fell through to block placement.
  return Object.prototype.hasOwnProperty.call(POTION_DATA, potionCoreFor(itemId));
}

/**
 * The effect a splash potion applies, or null for one that grants nothing.
 *
 * A water bottle and the brewing intermediates are throwable in vanilla and do nothing, so null here is a
 * valid answer rather than an error -- the potion is still consumed.
 *
 * `id`, `seconds` and `level` describe the potion's own effect, which is enough for every potion whose
 * effect is one status. `effects` is what to actually apply, and differs from `id` for the one compound
 * potion: `turtle_master` is Slowness plus Resistance, so a thrown Turtle Master potion has to grant two
 * statuses rather than one status nothing reads.
 *
 * @param {string} itemId
 * @returns {{id:string, seconds:number, level:number, effects:Array<[string, number]>}|null}
 */
export function splashPotionEffect(itemId) {
  if (!isSplashPotion(itemId)) return null;
  const data = POTION_DATA[potionCoreFor(itemId)];
  if (!data?.effect) return null;
  const level = data.level ?? 1;
  return {
    id: data.effect,
    seconds: data.duration ?? 1,
    level,
    effects: effectsFor(data.effect, level),
  };
}

/**
 * Which of `entities` a splash at `center` reaches.
 *
 * Kept separate from the application so the selection can be tested without a game, and so a caller can see
 * exactly who was hit.
 *
 * @param {{x:number,y:number,z:number}} center
 * @param {Array<{position?:object, mesh?:{position?:object}, health?:number}>} entities
 * @param {number} [radius]
 * @returns {Array} the entities in range, in the order given
 */
export function splashTargets(center, entities, radius = SPLASH_RADIUS) {
  if (!center || !Array.isArray(entities)) return [];
  const rSq = radius * radius;
  const out = [];
  for (const e of entities) {
    if (!e) continue;
    // A dead mob is not affected; the player is always a candidate.
    if (typeof e.health === 'number' && e.health <= 0) continue;
    const pos = e.mesh?.position ?? e.position;
    if (!pos) continue;
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dz = pos.z - center.z;
    if (dx * dx + dy * dy + dz * dz <= rSq) out.push(e);
  }
  return out;
}

/**
 * Throw a splash potion, applying its effect to everything in range.
 *
 * Returns true when the item was a splash potion, so the caller stops looking for other uses, and false
 * otherwise. Consuming the item and the particle and sound effects stay with the caller, which owns the
 * inventory and the renderer.
 *
 * @param {object} game
 * @param {{x:number,y:number,z:number}} center where the potion lands
 * @param {string} itemId
 * @returns {boolean}
 */
export function throwSplashPotion(game, center, itemId) {
  if (!isSplashPotion(itemId)) return false;
  const effect = splashPotionEffect(itemId);
  if (!effect) return true; // thrown, consumed, and grants nothing -- vanilla's water bottle
  const candidates = [...(game?.mobs?.mobs ?? []), game?.player].filter(Boolean);
  for (const target of splashTargets(center, candidates)) {
    // Every status the potion stands for, so a splash of the Turtle Master lands its Slowness and its
    // Resistance rather than a single `turtle_master` status no rule in `statusEffects.js` reads.
    for (const [name, level] of effect.effects) {
      target.applyStatusEffect?.(name, effect.seconds, level);
    }
  }
  return true;
}
