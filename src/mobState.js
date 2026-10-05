/**
 * Per-mob state persistence.
 *
 * A saved map previously recorded only a mob's type, position, yaw and health, plus a handful
 * of mob-specific blobs. Everything else was lost on reload: a baby animal came back an adult,
 * a tamed wolf came back wild, a sheared sheep came back woolly, and every mob added during this
 * parity pass lost its variant and timers.
 *
 * Reference for the individual fields: the per-mob wiki pages, recorded in the parity docs.
 */

/**
 * Scalar or plain-array mob fields worth persisting, shared by every mob that happens to have
 * them. Listing them centrally means a new mob's state is persisted by adding to this list
 * rather than by editing the save format in three places.
 */
export const PERSISTED_MOB_FIELDS = [
  // Age and growth.
  'isBaby', 'babyGrowthTimer', 'ageLocked', 'ageLockCooldown',
  // Identity a player can see.
  'name', 'persistent',
  // Sheep.
  'isSheared', 'woolColor',
  // Mooshroom.
  'variant', 'mushroomType', 'stewEffect',
  // Salmon.
  'size',
  // Rabbit and wolf.
  'coat', 'rabbitType', 'wolfArmor', 'collarColor',
  // The killer bunny's 8 armour points and any other size- or variant-scaled armour.
  'armor',
  // Wolf, cat, horse.
  'isTamed', 'isSaddled', 'hasSaddle', 'isSitting',
  // Timers that would otherwise reset.
  'angerTimer', 'lifetime', 'moistness', 'breedingCooldown', 'inLove', 'retreatTimer',
  // Enderman and dolphin extras.
  'carriedBlock', 'gotFish',
  // Roles.
  'isLeader', 'isRaidCaptain', 'canPickUpLoot', 'lootingLevel', 'slimeSize'
];

/**
 * Fields that hold a reference to another object rather than a plain value.
 *
 * These are stored as a marker and resolved on load, because a live object cannot be
 * serialised. `owner` is the player for a tamed mob; anything else is recorded as null rather
 * than silently written as `[object Object]`.
 */
export const PERSISTED_REFERENCES = ['owner'];

/** The marker used for the player, who is the only reference target mobs hold. */
export const PLAYER_REFERENCE = 'player';

/**
 * Capture a mob's persistable state.
 *
 * Only own properties are read, and `undefined` values are omitted so a save does not grow a
 * key for every mob times every field.
 */
export function serializeMobState(mob, game = null) {
  if (!mob || typeof mob !== 'object') return null;
  const state = {};
  const player = game?.player ?? null;

  for (const field of PERSISTED_MOB_FIELDS) {
    const value = mob[field];
    if (value === undefined) continue;
    // Scalars and plain arrays only. An object here would serialise to something useless and
    // is almost certainly a reference that belongs in PERSISTED_REFERENCES instead.
    if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      state[field] = value;
    } else if (Array.isArray(value)) {
      const plain = value.every(v => v === null || ['number', 'string', 'boolean'].includes(typeof v));
      if (plain) state[field] = [...value];
    }
  }

  for (const field of PERSISTED_REFERENCES) {
    const value = mob[field];
    if (!value) continue;
    // The player is the only reference we can meaningfully restore. Anything else is recorded
    // as null rather than written out as an unreadable object.
    state[field] = (player && value === player) ? PLAYER_REFERENCE : null;
  }

  return Object.keys(state).length ? state : null;
}

/**
 * Apply a saved state to a freshly spawned mob.
 *
 * Two things are deliberately handled beyond a plain copy:
 *
 *  - `health` is clamped to the restored maximum, because taming a wolf raises its maximum and
 *    a saved wolf must not end up above its own cap.
 *  - the mob's appearance is re-applied for the variants that derive meshes from state, so a
 *    restored sheep or rabbit looks like what was saved rather than the default spawn.
 *
 * `applyAppearance` is injectable so this module does not have to import every model module and
 * create a cycle.
 */
export function restoreMobState(mob, state, { player = null, applyAppearance = null } = {}) {
  if (!mob || !state || typeof state !== 'object') return mob;

  for (const field of PERSISTED_MOB_FIELDS) {
    if (state[field] === undefined) continue;
    mob[field] = Array.isArray(state[field]) ? [...state[field]] : state[field];
  }

  for (const field of PERSISTED_REFERENCES) {
    if (state[field] === undefined) continue;
    if (state[field] === PLAYER_REFERENCE) mob[field] = player ?? null;
    else mob[field] = null;
  }

  // A tamed mob's maximum health depends on taming, so re-derive it before clamping.
  if (mob.type === 'wolf') {
    mob.maxHealth = mob.isTamed ? 40 : 8;
  }
  if (typeof mob.health === 'number' && typeof mob.maxHealth === 'number') {
    mob.health = Math.min(mob.health, mob.maxHealth);
  }

  if (applyAppearance) applyAppearance(mob);
  return mob;
}

/**
 * Re-apply the appearance that a restored state implies.
 *
 * Kept as a lookup of small callbacks rather than a switch inside `restoreMobState`, so the
 * persistence module stays independent of the model modules.
 */
export function mobAppearanceRestorers({ sheepApplyWool, applyMooshroomVariant, applyRabbitCoat, applyRabbitName } = {}) {
  return (mob) => {
    if (!mob) return;
    try {
      switch (mob.type) {
        case 'sheep':
          sheepApplyWool?.(mob);
          break;
        case 'mooshroom':
          applyMooshroomVariant?.(mob);
          break;
        case 'rabbit':
          // A saved rabbit may have been named Toast, which changes only its appearance.
          applyRabbitName?.(mob);
          applyRabbitCoat?.(mob);
          break;
        default:
          break;
      }
    } catch {
      // A missing restorer must not break loading a whole map.
    }
  };
}
