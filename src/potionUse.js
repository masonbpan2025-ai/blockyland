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
import { effectsFor, instantAmount, INSTANT_EFFECT_IDS } from './statusEffects.js';

/**
 * Effects that resolve in one instant rather than over a duration.
 *
 * Re-exported from `statusEffects.js`, where the effects themselves live, so a caller that only wants to
 * know "is this one instant" has one place to ask. Healing and Harming are the only two.
 */
export const INSTANT_EFFECTS = INSTANT_EFFECT_IDS;

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

  // The two instant effects come from the effect table's own amounts, which double per level: Instant
  // Health restores 4 HP at level I, 8 at II and 16 at III, and Instant Damage deals 6, 12 and 24. The
  // table read a hard-coded 4 and 6 before, so a level III potion -- which a command or a data pack can
  // make, and which the table's own `level` field described -- healed a quarter of what it should.
  if (effect === 'instant_health') {
    const amount = instantAmount(effect, potion.level ?? 1);
    player.health = Math.min(player.maxHealth, player.health + amount);
    return { effect, instant: true, level: potion.level ?? 1, amount };
  }
  if (effect === 'instant_damage') {
    // Routed through takeDamage so the death path, exhaustion and difficulty handling stay in one
    // place. Magic is not shield-blockable in vanilla, and `takeDamage` already exempts the types it
    // cannot block from the shield check.
    const amount = instantAmount(effect, potion.level ?? 1);
    player.takeDamage?.(amount, null, 'magic');
    return { effect, instant: true, level: potion.level ?? 1, amount };
  }

  // One potion, two effects. Vanilla's Potion of the Turtle Master applies Slowness IV and Resistance III
  // together, and the potion carries a single level, so the pair comes from the effect table rather than
  // from the brew. Applied as two real effects instead of one `turtle_master` status, because that is what
  // vanilla shows the player -- there is no Turtle Master effect in the HUD. `effectsFor` carries the tier
  // through, so the enhanced brew gives Slowness VI and Resistance IV, which is what the wiki tabulates.
  const granted = effectsFor(effect, potion.level ?? 1);
  if (granted.length) {
    for (const [name, level] of granted) {
      player.applyStatusEffect?.(name, potion.duration ?? 30, level);
    }
  }
  const compound = granted.length > 1;
  return compound
    ? { effect, instant: false, level: potion.level ?? 1, applied: granted.map(([name]) => name) }
    : { effect, instant: false, level: potion.level ?? 1 };
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
