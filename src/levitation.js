// Levitation.
//
// `statusEffects.js` defines it and nothing consumes it: it is absent from `speedMultiplier` and from
// `damageTakenMultiplier`, and `player.js` never reads it. So applying it did nothing at all -- the same
// shape as Absorption before the last round.
//
// Vanilla: the entity rises at `0.05 * level` blocks per TICK, which is one block per second per level since
// there are twenty ticks in a second. Gravity is overridden rather than reduced, so the rise is a constant
// climb and the entity cannot sink while the effect lasts. When it wears off the entity falls from whatever
// height it reached, which is what makes the effect dangerous rather than helpful.
//
// No source yet, and that is recorded rather than implied: in vanilla the only sources are a shulker bullet
// and the `/effect` command. Shulkers exist here -- they spawn, they carry `damage: 4` and `range: 16` in
// `ambientLocomotion.js` -- but they have `attackReach: 0` and no bullet code, so a shulker is a stationary
// turret that never fires. See section 4.2.6 of the rules document.

/** Vanilla's 0.05 blocks per tick, expressed per second. */
export const LEVITATION_BLOCKS_PER_SECOND_PER_LEVEL = 1.0;

/**
 * The climb rate for a levitation level, in blocks per second. Always positive, so the effect can only lift.
 *
 * @param {number} level
 * @returns {number}
 */
export function levitationRise(level) {
  const safe = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  return LEVITATION_BLOCKS_PER_SECOND_PER_LEVEL * safe;
}
