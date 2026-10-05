// The void.
//
// Falling out of the world was handled, but the damage was passed with no type at all:
//
//     if (this.position.y < -10) { this.takeDamage(10); ... }
//
// `takeDamage` already skips the armour formula for `'void'`, and already excludes it from shield blocking
// and from Thorns -- three rules written against a damage type nothing ever produced. So void damage was
// being reduced by armour, which vanilla explicitly does not do: the void is one of the few things nothing
// protects you from.
//
// The threshold and the amount are named here rather than left inline so they are testable and so the rule
// is visible.

/** Below this the player is considered out of the world. The world is 64 blocks tall from y=0. */
export const VOID_Y_THRESHOLD = -10;

/** Damage per application once out of the world. Applied with the `'void'` type, which bypasses armour. */
export const VOID_DAMAGE = 10;

/** True when a position is out of the world. */
export function isInVoid(position) {
  return !!position && Number.isFinite(position.y) && position.y < VOID_Y_THRESHOLD;
}
