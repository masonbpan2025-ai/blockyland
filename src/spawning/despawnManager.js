// Natural despawning.
//
// Why this is mandatory for spawning, not optional polish.
//
// The mob caps are global. A mob left standing in a chunk the player walked away from still holds cap
// space, so without despawning the caps fill up behind the player and every newly loaded area stays
// empty -- which is precisely the reported symptom. Despawning is what frees capacity for the chunks
// the player is actually in, and it is the reason vanilla can keep a moving player supplied with mobs
// indefinitely.
//
// This implements `Mob.checkDespawn()` for Java Edition 1.21.4:
//
//   if difficulty == PEACEFUL && shouldDespawnInPeaceful(): discard(); return
//   if isPersistenceRequired() || requiresCustomPersistence(): return
//   nearest = nearest non-spectator player in the dimension
//   if nearest == null: return
//   d = nearest.distanceToSqr(this)                       // 3-D Euclidean, squared
//   if d > despawnDistance² && removeWhenFarAway(d): discard()
//   if noActionTime > 600 && random.nextInt(800) == 0 && d > 32² && removeWhenFarAway(d): discard()
//   else if d < 32²: noActionTime = 0
//
// Three details that a naive port gets wrong and that change observable behaviour:
//
//  1. The comparisons are STRICT `>`. A mob at exactly 128 blocks is not despawned; at exactly 32 it
//     is not "close".
//  2. `random.nextInt(800)` is only EVALUATED when `noActionTime > 600`, because Java's `&&`
//     short-circuits. A port that draws unconditionally consumes a different number of random values
//     per tick and diverges from the seed.
//  3. The `else if (d < softSq) noActionTime = 0` binds to the SECOND `if` only. A successful random
//     despawn does not fall through to the reset.
//
// Reference: docs/mob-spawning-spec-1.21.4.md section 10, built from Paper's 1.21.4 `Mob.java.patch`
// context and revision-pinned minecraft.wiki. Behaviour reimplemented; no Mojang source copied.

import {
  CATEGORY_INFO,
  MobCategory,
  categoryOf,
} from './mobCategories.js';
import { Difficulty, difficultyRank } from './spawnValidation.js';
import { isPiglinBrute } from '../piglinBruteBehavior.js';

/**
 * `MobCategory.getNoDespawnDistance()`: the radius inside which `noActionTime` resets.
 *
 * 32 blocks for every category in 1.21.4. This is the "soft" window, and it is why a mob that is
 * merely out of sight does not vanish but one left far behind does.
 */
export const NO_DESPAWN_DISTANCE = 32;

/**
 * How many ticks a mob must take no action before the random despawn roll is even considered.
 *
 * `noActionTime` increments by 1 per tick, so 600 ticks is the familiar "30 seconds". Mobs that are
 * brightly lit or are raiders increment faster (+2, or +3), which is why an illager vanishes after
 * about ten seconds rather than thirty.
 */
export const NO_ACTION_TIME_THRESHOLD = 600;

/** The denominator of the random despawn roll: one chance in 800 per tick once eligible. */
export const DESPAWN_ROLL_BOUND = 800;

/**
 * The internal light level above which a monster's `noActionTime` advances faster.
 *
 * `Monster.updateNoActionTime` adds an extra +2 when the mob's light level is over 12, so a brightly
 * lit monster gives up and despawns after roughly 200 ticks instead of 600.
 */
export const BRIGHT_LIGHT_NO_ACTION_BONUS = 12;

/**
 * Mob types that must never be removed for being far from a player.
 *
 * `Mob.removeWhenFarAway` returns true by default; these override it to false. The list is the one
 * the spec derives from the wiki plus the class-level `Animal` override, which is why every farm
 * animal is here: Java Edition animals do not despawn, and that is a deliberate difference from the
 * Bedrock list people often quote.
 */
export const NEVER_DESPAWN_FOR_DISTANCE = new Set([
  // Class-level Animal override: Java farm animals never despawn.
  'cow', 'mooshroom', 'pig', 'sheep', 'chicken', 'rabbit', 'fox', 'wolf', 'cat', 'ocelot',
  'horse', 'donkey', 'mule', 'llama', 'trader_llama', 'goat', 'panda', 'polar_bear', 'bee',
  'parrot', 'turtle', 'armadillo', 'camel', 'sniffer', 'frog', 'allay', 'happy_ghast',
  // Golems and villagers.
  'iron_golem', 'snow_golem', 'villager', 'wandering_trader', 'copper_golem',
  // Named exceptions from the spec.
  'shulker', 'wither', 'elder_guardian', 'ender_dragon',
]);

/**
 * Mob types that DO despawn even though their class would otherwise exempt them.
 *
 * The wiki: "Other mobs that are not monster, ambient, or aquatic that do despawn include stray cats,
 * untamed ocelots, wandering traders, and untamed trader llamas." A tamed cat is persistent through
 * taming, not through this list.
 */
export const ALWAYS_DESPAWN_FOR_DISTANCE = new Set([
  'cat', 'ocelot', 'wandering_trader', 'trader_llama',
]);

/**
 * Mob types that survive a switch to Peaceful.
 *
 * `Monster.shouldDespawnInPeaceful` is true by default; hoglins, piglins and shulkers override it.
 * Piglin brutes are on the Bedrock list only and are NOT exempt in Java.
 */
export const SURVIVES_PEACEFUL = new Set(['hoglin', 'zoglin', 'piglin', 'shulker']);

/**
 * Per-mob cluster caps: `Mob.getMaxSpawnClusterSize()`.
 *
 * This is what bounds a single pack. The wiki's list: 8 for wolves, cod and tropical fish; 6 for
 * horses and donkeys; 4 for everything else. The value is checked after each successful member
 * spawn, and it caps the whole `spawnCategoryForPosition` call rather than one group.
 */
export const SPAWN_CLUSTER_SIZE = Object.freeze({
  wolf: 8,
  cod: 8,
  tropical_fish: 8,
  horse: 6,
  donkey: 6,
  mule: 6,
  ghast: 1,
});
export const DEFAULT_SPAWN_CLUSTER_SIZE = 4;

/**
 * The natural despawn manager.
 *
 * Runs every tick. For each mob it decides one of: keep, discard, or nothing -- and it does so with
 * the same short-circuit order as vanilla so the random stream stays aligned.
 */
export class DespawnManager {
  /**
   * @param {object} options
   * @param {object} options.mobSpawnManager
   */
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.stats = {
      ticks: 0,
      checks: 0,
      peacefulRemovals: 0,
      hardRemovals: 0,
      randomRemovals: 0,
      lastMs: 0,
      maxMs: 0,
      byType: Object.create(null),
    };
    /**
     * Optional hook after a removal: `(mob, reason) => void`. Used by telemetry and by the travel
     * regression test, which needs to see removals rather than infer them.
     */
    this.onDespawn = null;
  }

  get world() {
    return this.manager?.world ?? null;
  }

  /**
   * Advance one tick.
   *
   * @param {Array<object>} players non-spectator players in the current dimension
   * @returns {{removed:number, reasons:object}}
   */
  tick(players) {
    this.stats.ticks++;
    if (!this.world || !this.manager?.mobs) return { removed: 0, reasons: {} };
    const started = now();
    // "if nearest == null: return" -- with no player in the dimension nothing despawns at all. This
    // is why a mob that is left behind when its owner logs out does not quietly disappear.
    if (!players || players.length === 0) {
      this.stats.lastMs = now() - started;
      return { removed: 0, reasons: {} };
    }

    const difficulty = this.manager.difficulty || Difficulty.NORMAL;
    const peaceful = difficultyRank(difficulty) === difficultyRank(Difficulty.PEACEFUL);
    const random = this.manager.random;
    const reasons = { peaceful: 0, hard: 0, random: 0 };
    let removed = 0;

    for (const mob of this.manager.mobs) {
      if (!mob || !mob.mesh || mob.health <= 0) continue;
      this.stats.checks++;
      const outcome = this.checkDespawn(mob, players, { peaceful, random });
      if (!outcome) continue;
      this.manager.removeMob(mob, outcome);
      removed++;
      if (outcome === 'peaceful') { reasons.peaceful++; this.stats.peacefulRemovals++; }
      else if (outcome === 'hard') { reasons.hard++; this.stats.hardRemovals++; }
      else { reasons.random++; this.stats.randomRemovals++; }
      this.stats.byType[mob.type] = (this.stats.byType[mob.type] || 0) + 1;
      if (this.onDespawn) {
        try { this.onDespawn(mob, outcome); } catch { /* a sink must not break despawning */ }
      }
    }

    const elapsed = now() - started;
    this.stats.lastMs = elapsed;
    if (elapsed > this.stats.maxMs) this.stats.maxMs = elapsed;
    return { removed, reasons };
  }

  /**
   * `Mob.checkDespawn()` for one mob. Returns the reason to remove, or null to keep.
   *
   * @returns {'peaceful'|'hard'|'random'|null}
   */
  checkDespawn(mob, players, { peaceful, random }) {
    // 1. Peaceful. This fires regardless of distance and regardless of persistence.
    // A piglin brute keeps `type: 'piglin'` but is not exempt: only the piglin itself survives Peaceful.
    if (peaceful && !(SURVIVES_PEACEFUL.has(mob.type) && !isPiglinBrute(mob)) && !this.manager.shouldSurvivePeaceful(mob)) {
      return 'peaceful';
    }

    // 2. Persistence. A named, tamed, leashed or equipment-holding mob is never removed by distance.
    if (this.isPersistent(mob)) return null;

    // 3. No non-spectator player: nothing to despawn relative to.
    const nearest = nearestPlayerSq(players, mob.mesh.position);
    if (nearest === null) return null;

    const category = categoryOf(mob.type);
    const info = CATEGORY_INFO[category];
    const hardDistance = this.manager.despawnDistanceFor(mob) ?? info?.despawnDistance ?? 128;
    const hardSq = hardDistance * hardDistance;
    const softSq = NO_DESPAWN_DISTANCE * NO_DESPAWN_DISTANCE;

    const removeWhenFarAway = this.removeWhenFarAway(mob);

    // 4. The hard sphere. Strict `>` both times.
    if (nearest > hardSq && removeWhenFarAway) return 'hard';

    // 5. The soft window. `noActionTime > 600` is tested BEFORE the random draw, because Java
    //    short-circuits: a port that always draws consumes a different number of randoms per tick.
    if (mob.noActionTime > NO_ACTION_TIME_THRESHOLD
      && random.nextInt(DESPAWN_ROLL_BOUND) === 0
      && nearest > softSq
      && removeWhenFarAway) {
      return 'random';
    }
    // The reset binds to the second `if` only.
    if (nearest < softSq) mob.noActionTime = 0;

    return null;
  }

  /**
   * Has this mob been marked as required to persist?
   *
   * The engine already carries `mob.persistent` for name tags, leads, taming and picked-up
   * equipment; this also accepts the flags a structure or a command may set.
   */
  isPersistent(mob) {
    if (mob.persistent) return true;
    if (mob.persistenceRequired) return true;
    // A passenger of another mob, a boat or a minecart is persistent in vanilla.
    if (mob.vehicle) return true;
    // An enderman holding a block is excluded from despawn while it carries it.
    if (mob.type === 'enderman' && mob.carriedBlock) return true;
    if (typeof this.manager.requiresCustomPersistence === 'function') {
      return !!this.manager.requiresCustomPersistence(mob);
    }
    return false;
  }

  /**
   * `Mob.removeWhenFarAway(distanceSquared)`.
   *
   * True by default. The per-class overrides are the interesting part, and the wiki's summary is the
   * guide: "All monster, ambient, and aquatic mobs excluding shulkers, withers, elder guardians, and
   * ender dragons despawn unless persistent", while "other mobs that are not monster, ambient, or
   * aquatic that do despawn include stray cats, untamed ocelots, wandering traders, and untamed
   * trader llamas".
   *
   * So the answer is driven by CATEGORY first -- monsters, ambient and the three aquatic categories
   * despawn -- and only then by the per-mob exception lists. Deriving it from `CATEGORY_INFO.isFriendly`
   * instead is wrong in a way that is invisible until you watch a squid: `isFriendly` is the
   * PER-PLAYER-CAP exemption (which the wiki's cap table gives as Monster/Creature/Ambient/Axolotls/
   * UWC/WC/WA/Misc -- a set that excludes the water categories from nothing), and using it here made
   * every squid and glow squid immortal.
   */
  removeWhenFarAway(mob) {
    // A tamed animal is persistent through taming, which `isPersistent` already handled.
    if (mob.isTamed) return false;
    // Explicit exceptions, both directions.
    if (ALWAYS_DESPAWN_FOR_DISTANCE.has(mob.type)) return true;
    if (NEVER_DESPAWN_FOR_DISTANCE.has(mob.type)) return false;
    const category = categoryOf(mob.type);
    // Monsters, ambient mobs and everything aquatic despawn by default.
    if (category === MobCategory.MONSTER || category === MobCategory.AMBIENT) return true;
    if (category === MobCategory.WATER_CREATURE
      || category === MobCategory.WATER_AMBIENT
      || category === MobCategory.UNDERGROUND_WATER_CREATURE
      || category === MobCategory.AXOLOTLS) return true;
    // Everything else (CREATURE land animals, MISC) does not.
    return false;
  }

  /**
   * Advance every mob's `noActionTime`.
   *
   * Called once per tick before the despawn pass. `Mob.serverAiStep` does the base +1; a brightly lit
   * monster gets +2 extra, and raiders get +2 extra (+5 total when also bright), which is why an
   * illager gives up after about ten seconds rather than thirty.
   */
  advanceNoActionTime() {
    const lightQuery = this.manager?.lightLevelAt
      ? (position) => this.manager.lightLevelAt(position)
      : null;
    for (const mob of this.manager.mobs) {
      if (!mob || !mob.mesh || mob.health <= 0) continue;
      let increment = 1;
      const bright = lightQuery ? lightQuery(mob.mesh.position) > BRIGHT_LIGHT_NO_ACTION_BONUS : false;
      if (bright) increment += 2;
      if (RAIDER_TYPES.has(mob.type)) increment += 2;
      mob.noActionTime = (mob.noActionTime || 0) + increment;
    }
  }

  /** A snapshot for the debug overlay. */
  telemetry() {
    return {
      ticks: this.stats.ticks,
      checks: this.stats.checks,
      peacefulRemovals: this.stats.peacefulRemovals,
      hardRemovals: this.stats.hardRemovals,
      randomRemovals: this.stats.randomRemovals,
      lastMs: +this.stats.lastMs.toFixed(3),
      maxMs: +this.stats.maxMs.toFixed(3),
      byType: { ...this.stats.byType },
    };
  }

  resetTelemetry() {
    this.stats.checks = 0;
    this.stats.peacefulRemovals = 0;
    this.stats.hardRemovals = 0;
    this.stats.randomRemovals = 0;
    this.stats.maxMs = 0;
    this.stats.byType = Object.create(null);
  }
}

/**
 * Illagers and their allies, which give up faster.
 *
 * `Monster.updateNoActionTime` adds an extra +2 for raiders, so a vindicator despawns after about
 * 200 ticks outside 32 blocks rather than 600.
 */
export const RAIDER_TYPES = new Set([
  'pillager', 'vindicator', 'evoker', 'illusioner', 'ravager', 'vex', 'witch',
]);

/**
 * Squared 3-D distance to the nearest player, or null when there is none.
 *
 * Vanilla uses `getNearestPlayer(this, -1.0)`, which excludes spectators and creative-mode players
 * in newer versions. Spectators are excluded here; creative players are not, because vanilla 1.21.4
 * still counts them for despawning.
 */
export function nearestPlayerSq(players, position) {
  let best = null;
  for (const player of players) {
    if (player.spectator) continue;
    const dx = player.x - position.x;
    const dy = (player.y ?? 0) - position.y;
    const dz = player.z - position.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (best === null || d < best) best = d;
  }
  return best;
}

/** The cluster cap for a mob type. */
export function maxSpawnClusterSizeFor(type) {
  return SPAWN_CLUSTER_SIZE[type] ?? DEFAULT_SPAWN_CLUSTER_SIZE;
}

export { MobCategory };

/** `performance.now()` where available, so this module works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
