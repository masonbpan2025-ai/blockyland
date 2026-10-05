/**
 * Salmon size rules.
 *
 * Reference: https://minecraft.wiki/w/Salmon
 *
 * Salmon spawn in three sizes with distinct hitboxes, and the Java drop table adds bone
 * meal at a flat 5%. The size table lives here so the model, the hitbox and the loot roll
 * read from one definition.
 */

/**
 * Per-size hitbox and model scale.
 *
 * The wiki gives hitboxes per size (Java Edition). The model is a single mesh, so the
 * scale is derived from the medium hitbox: medium is the reference size at scale 1.
 */
export const SALMON_SIZES = {
  small: { width: 0.35, height: 0.2, scale: 0.5, chance: 0.316 },
  medium: { width: 0.7, height: 0.4, scale: 1, chance: 0.526 },
  large: { width: 1.05, height: 0.6, scale: 1.5, chance: 0.158 }
};

/** Wiki: a 5% chance of bone meal when a salmon is killed (Java Edition). */
export const SALMON_BONE_MEAL_CHANCE = 0.05;

/** True when the mob is a salmon of the given size. */
export function isSalmonSize(mob, size) {
  return mob?.type === 'salmon' && mob.size === size;
}

/**
 * Roll a spawn size from the wiki's distribution.
 *
 * `random` is injectable so a test can pin the outcome instead of sampling it.
 */
export function rollSalmonSize(random = Math.random) {
  const r = random();
  if (r < SALMON_SIZES.small.chance) return 'small';
  if (r < SALMON_SIZES.small.chance + SALMON_SIZES.medium.chance) return 'medium';
  return 'large';
}

/**
 * One bonus death drop for a salmon, if any.
 *
 * Kept separate from the shared loot table because it is a flat independent chance rather
 * than a min/max count range, and returning a list keeps it composable with that table.
 */
export function salmonBonusDrops(mob, random = Math.random) {
  if (mob?.type !== 'salmon') return [];
  if (random() < SALMON_BONE_MEAL_CHANCE) return [['bone_meal', false, 1, 1]];
  return [];
}
