// Generic spawn-position validation: everything that is true of every mob, and nothing else.
//
// Why this is separate from the mob predicates.
//
// A spawn attempt fails for exactly one reason, and the reason determines the fix. "There is a
// zombie-shaped hole in my cave spawning" resolves to `INVALID_LIGHT` (raise the light engine) or
// `COLLISION` (the box test is wrong) or `MOB_PREDICATE_FAILED` (the mob's own rules are wrong) --
// three unrelated bugs. This module answers only the generic half and reports a machine-readable
// code, so the debug overlay and the telemetry counters can say which half failed rather than
// "no spawn happened".
//
// Order matters. The checks run cheapest-and-most-fundamental first (world bounds, chunk loaded,
// player distance, cap) so the expensive ones (heightmap scan, light lookup, box fit) only run for
// candidates that could actually succeed. Vanilla's ordering is the same idea.
//
// Reference: Minecraft Wiki "Spawn"; PaperMC/Paper `NaturalSpawner.java`,
// `SpawnPlacements.java`, `Heightmap.java`. Behaviour reimplemented; no Mojang source copied.

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './lightEngine.js';
import {
  HeightmapType,
  SpawnPlacementType,
  blocksMotion,
  isLava,
  isWater,
} from './spawnPlacements.js';

/**
 * Every way a spawn attempt can be refused.
 *
 * Machine-readable on purpose: telemetry groups by these strings and the debug overlay prints them,
 * so a steady stream of one code is a diagnosable symptom rather than a mystery.
 */
export const SpawnRejection = Object.freeze({
  NO_WORLD: 'NO_WORLD',
  CHUNK_NOT_LOADED: 'CHUNK_NOT_LOADED',
  OUT_OF_WORLD_BOUNDS: 'OUT_OF_WORLD_BOUNDS',
  TOO_CLOSE_TO_PLAYER: 'TOO_CLOSE_TO_PLAYER',
  TOO_FAR_FROM_PLAYER: 'TOO_FAR_FROM_PLAYER',
  CAP_FULL: 'CAP_FULL',
  LOCAL_CAP_FULL: 'LOCAL_CAP_FULL',
  NO_SPAWN_ENTRIES: 'NO_SPAWN_ENTRIES',
  WRONG_BIOME: 'WRONG_BIOME',
  WRONG_DIMENSION: 'WRONG_DIMENSION',
  WRONG_FLUID: 'WRONG_FLUID',
  INVALID_FLOOR: 'INVALID_FLOOR',
  INVALID_LIGHT: 'INVALID_LIGHT',
  COLLISION: 'COLLISION',
  DIFFICULTY_BLOCKED: 'DIFFICULTY_BLOCKED',
  MOB_PREDICATE_FAILED: 'MOB_PREDICATE_FAILED',
  STRUCTURE_OVERRIDE: 'STRUCTURE_OVERRIDE',
  INVALID_BLOCK_BELOW: 'INVALID_BLOCK_BELOW',
  DISTANCE_RULE_DISABLED: 'DISTANCE_RULE_DISABLED',
});

/**
 * Player-distance rules.
 *
 * 24 blocks is vanilla's minimum for natural spawning -- the wiki: "There must be no players or the
 * world spawn point within a 24 block radius (spherical) of the spawning block."
 *
 * The maximum is per category: "For all mob types excluding passives and fish, spawns fail unless
 * within a 128 radius block sphere around the player. For fish, spawns fail unless within a 64 block
 * radius of the player." Both are RAW block distances, not squared.
 */
export const MIN_SPAWN_DISTANCE = 24;
export const MAX_SPAWN_DISTANCE = 128;
/** The tighter sphere water ambient mobs (fish) are held to. */
export const MAX_SPAWN_DISTANCE_FISH = 64;

/**
 * Difficulty names in the order the game uses them.
 *
 * PEACEFUL blocks all hostile natural spawning; the other three behave the same for spawning, and
 * differ only in combat rules. The ordering is here so a caller can compare ranks rather than
 * compare strings.
 */
export const Difficulty = Object.freeze({
  PEACEFUL: 'peaceful',
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
});

const DIFFICULTY_RANK = {
  [Difficulty.PEACEFUL]: 0,
  [Difficulty.EASY]: 1,
  [Difficulty.NORMAL]: 2,
  [Difficulty.HARD]: 3,
};

export function difficultyRank(difficulty) {
  return DIFFICULTY_RANK[String(difficulty || 'normal').toLowerCase()] ?? DIFFICULTY_RANK[Difficulty.NORMAL];
}

export function isPeaceful(difficulty) {
  return difficultyRank(difficulty) === DIFFICULTY_RANK[Difficulty.PEACEFUL];
}

/**
 * Distance from `(x, y, z)` to the nearest player, and which player it was.
 *
 * Scans the player list, which in this engine is one or two entries. Returns `Infinity` when there
 * are no players, which the caller reports as `TOO_FAR_FROM_PLAYER` rather than treating as "no
 * constraint".
 */
export function nearestPlayer(players, x, y, z) {
  let best = null;
  let bestSq = Infinity;
  let bestIndex = null;
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const dx = player.x - x;
    const dy = (player.y ?? 0) - y;
    const dz = player.z - z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq < bestSq) {
      bestSq = distanceSq;
      best = player;
      bestIndex = i;
    }
  }
  return { player: best, index: bestIndex, distance: Math.sqrt(bestSq), distanceSq: bestSq };
}

/**
 * The height of a column under one of vanilla's heightmaps.
 *
 * The three heightmaps answer genuinely different questions, and conflating them shifts the candidate
 * Y range for every spawn:
 *
 *  - `WORLD_SURFACE` is "the highest NON-AIR block". A flower, a torch or a rail counts. This is the
 *    heightmap `getRandomPosWithin` uses to bound the candidate Y, so a flower on a plain must raise
 *    that bound.
 *  - `MOTION_BLOCKING` / `MOTION_BLOCKING_NO_LEAVES` are the highest block that stops a walking mob.
 *    They skip plants (and, for the NO_LEAVES variant, leaves), which is what lets a mob spawn on the
 *    ground under a canopy.
 *  - `OCEAN_FLOOR` skips fluids, so an aquatic mob's floor is the sea bed rather than the surface.
 *
 * The previous version folded all of these into one scan: it skipped any non-fluid block for which
 * `blocksMotion` was false, so a flower was invisible to `WORLD_SURFACE` and the pack-centre Y bound
 * was one block too low on any column with vegetation.
 *
 * @returns {number} the Y of the highest block matching the map, or 0 for an empty column
 */
export function heightAt(world, wx, wz, heightmap) {
  const fluidCounts = heightmap === HeightmapType.WORLD_SURFACE
    || heightmap === HeightmapType.WORLD_SURFACE_WG;
  const fluidBlocks = heightmap === HeightmapType.MOTION_BLOCKING
    || heightmap === HeightmapType.MOTION_BLOCKING_NO_LEAVES;
  const skipLeaves = heightmap === HeightmapType.MOTION_BLOCKING_NO_LEAVES;

  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
    const id = world.getVoxel(wx, y, wz);
    if (id === BLOCKS.AIR) continue;

    const fluid = isWater(id) || isLava(id);
    if (fluid) {
      // Fluids count only for the surface maps, and only for the surface maps that include them.
      if (fluidCounts) return y;
      // MOTION_BLOCKING treats a fluid as motion-blocking; OCEAN_FLOOR skips it entirely.
      if (fluidBlocks) return y;
      continue;
    }

    // A non-air, non-fluid block.
    if (heightmap === HeightmapType.WORLD_SURFACE || heightmap === HeightmapType.WORLD_SURFACE_WG) {
      return y;
    }
    if (skipLeaves && isLeaves(id)) continue;
    if (blocksMotion(id)) return y;
    // OCEAN_FLOOR and MOTION_BLOCKING both skip a block that does not stop motion.
  }
  return 0;
}

/** Is this block a leaves variant, by registry name? Used by MOTION_BLOCKING_NO_LEAVES. */
function isLeaves(blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  const name = String(def.name || '').toLowerCase();
  return name.includes('leaves');
}

/**
 * Does the mob's box fit at this position without intersecting a solid block?
 *
 * The engine has no entity AABB-vs-voxel routine that is independent of a live mob, so this walks
 * the same cell range `MobManager.checkMobCollision` does. Keeping it here rather than reusing that
 * method means a spawn can be validated against a type that has not been constructed yet, and means
 * the rule is testable without a scene.
 */
export function boxFits(world, x, y, z, width, height, isSolidAt) {
  const half = Math.max(0.05, width / 2);
  const minX = Math.floor(x - half + 0.02);
  const maxX = Math.floor(x + half - 0.02);
  const minY = Math.floor(y + 0.02);
  const maxY = Math.floor(y + Math.max(0.1, height) - 0.02);
  const minZ = Math.floor(z - half + 0.02);
  const maxZ = Math.floor(z + half - 0.02);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (by < 0 || by >= CHUNK_HEIGHT) return false;
        if (isSolidAt(bx, by, bz)) return false;
      }
    }
  }
  return true;
}

/**
 * Validate a candidate position WITHOUT applying natural-spawn policy.
 *
 * This is the spatial half of `validateGenericSpawn`: world bounds, the chunk being loaded, the box
 * fitting, and (per placement family) the fluid and floor rules. It deliberately does NOT test player
 * distance, difficulty, or mob caps.
 *
 * Why the split exists: chunk-generation population places animals as terrain is made, before any
 * player is nearby and ignoring the caps, but it still must not put a cow inside a hillside. The
 * previous implementation ran only the species predicate there and treated a missing predicate as
 * success, so a generated animal could intersect solid blocks. Reusing one spatial validator for both
 * callers is what stops the two drifting apart.
 *
 * @returns {{ok: boolean, reason: string|null, detail: object}}
 */
export function validateSpawnSpace({
  world,
  x, y, z,
  placement = SpawnPlacementType.ON_GROUND,
  width = 0.6,
  height = 1.95,
  requireFloor = null,
  isSolidAt = null,
  mobType = null,
} = {}) {
  const detail = {};
  if (!world) return { ok: false, reason: SpawnRejection.NO_WORLD, detail };

  if (y < 0 || y >= CHUNK_HEIGHT) {
    return { ok: false, reason: SpawnRejection.OUT_OF_WORLD_BOUNDS, detail: { y, max: CHUNK_HEIGHT - 1 } };
  }

  const cx = Math.floor(x / CHUNK_SIZE_X);
  const cz = Math.floor(z / CHUNK_SIZE_Z);
  const chunk = typeof world.getChunk === 'function' ? world.getChunk(cx, cz) : null;
  if (!chunk) return { ok: false, reason: SpawnRejection.CHUNK_NOT_LOADED, detail: { cx, cz } };

  const solid = typeof isSolidAt === 'function'
    ? isSolidAt
    : (bx, by, bz) => {
      const id = world.getVoxel(bx, by, bz);
      if (id === BLOCKS.AIR) return false;
      return blocksMotion(id);
    };
  const solidForBox = (bx, by, bz) => {
    const id = world.getVoxel(bx, by, bz);
    if (isWater(id) || isLava(id)) return false;
    return solid(bx, by, bz);
  };

  const blockAt = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
  detail.blockAt = blockAt;
  detail.blockBelow = world.getVoxel(Math.floor(x), Math.floor(y) - 1, Math.floor(z));

  switch (placement) {
    case SpawnPlacementType.IN_WATER:
      if (!isWater(blockAt)) {
        return { ok: false, reason: SpawnRejection.WRONG_FLUID, detail: { ...detail, expected: 'water' } };
      }
      break;
    case SpawnPlacementType.IN_LAVA:
      if (!isLava(blockAt)) {
        return { ok: false, reason: SpawnRejection.WRONG_FLUID, detail: { ...detail, expected: 'lava' } };
      }
      break;
    case SpawnPlacementType.NO_RESTRICTIONS:
      break;
    case SpawnPlacementType.ON_GROUND:
    default:
      if (isWater(blockAt) || isLava(blockAt)) {
        return { ok: false, reason: SpawnRejection.WRONG_FLUID, detail: { ...detail, expected: 'air' } };
      }
      if (blocksMotion(blockAt)) {
        return { ok: false, reason: SpawnRejection.COLLISION, detail: { ...detail, blockedBy: blockAt } };
      }
      // A caller may opt out of the floor rule (the chunk-generation spawner snaps Y to the column
      // top and validates the box instead) or opt in explicitly.
      if (requireFloor !== false && !hasFloor(world, x, y, z, width, solid, mobType)) {
        return { ok: false, reason: SpawnRejection.INVALID_FLOOR, detail };
      }
      break;
  }

  // The box, for every placement family. See `validateGenericSpawn` for why this is not optional.
  if (!boxFits(world, x, y, z, width, height, solidForBox)) {
    return { ok: false, reason: SpawnRejection.COLLISION, detail };
  }

  return { ok: true, reason: null, detail };
}

const FLOOR_NAME = new Map(Object.entries(BLOCKS).map(([k, v]) => [v, k]));
// Blocks without a sturdy full top face, or that Java's `isValidSpawn` refuses outright.
const NOT_A_SPAWN_FLOOR = /(_CARPET|^CARPET|_FENCE|_FENCE_GATE|_WALL|_PANE|GLASS|IRON_BARS|CHAIN|_BED_|^BED|CHEST|_PRESSURE_PLATE|DIRT_PATH|FARMLAND|BARRIER|^SNOW$|_HEAD$|_SKULL$|LANTERN|CAMPFIRE|_CANDLE|^CANDLE|ENCHANTING_TABLE|DAYLIGHT_DETECTOR|STONECUTTER|LECTERN|BREWING_STAND|HOPPER|CAULDRON|ANVIL|_DOOR|SCAFFOLDING|LEAVES)/;

/**
 * Can a mob spawn standing on this block? Java's `isValidSpawn`: the top face must be sturdy and full and the block
 * must give off less than 14 light; leaves (bar ocelots and parrots), glass, barriers and the like are refused, ice
 * takes only polar bears, a magma block only fire-immune mobs. The rule here was "any solid block", so a floor of bottom
 * slabs, carpet, glass or dirt paths did nothing (Spawn-proofing play-test: "Areas covered in bottom slabs are unable
 * to spawn mobs ... dirt path and farmland ... glass ... leaves"). Top slabs, double slabs, soul sand and mud remain
 * valid.
 */
export function isValidSpawnFloor(world, x, y, z, id, mobType = null) {
  const name = FLOOR_NAME.get(id) ?? '';
  const def = BLOCK_DEFS[id];
  const orientation = world?.structureOrientations?.get?.(`${x},${y},${z}`);
  if (name.endsWith('_SLAB')) return orientation?.slabType === 'top' || orientation?.slabType === 'double';
  if (name.endsWith('_STAIRS')) return orientation?.half === 'top';
  if (name.endsWith('_TRAPDOOR')) return orientation?.half === 'top' && !orientation?.open;
  if (/LEAVES/.test(name)) return mobType === 'ocelot' || mobType === 'parrot';
  if (/^(ICE|PACKED_ICE|BLUE_ICE|FROSTED_ICE)$/.test(name)) return mobType === 'polar_bear';
  if (name === 'MAGMA_BLOCK') return ['strider', 'magma_cube', 'blaze', 'ghast', 'zombified_piglin', 'wither_skeleton'].includes(mobType); // fire-immune
  if ((def?.light ?? 0) >= 14) return false;
  return !NOT_A_SPAWN_FLOOR.test(name);
}

/**
 * Is there support under the box for a ground mob?
 *
 * At least one cell directly under the mob's footprint must be a solid, motion-blocking block.
 * Requiring only the CENTRE column would let a mob stand with two thirds of its feet over the void.
 */
export function hasFloor(world, x, y, z, width, isSolidAt, mobType = null) {
  const half = Math.max(0.05, width / 2);
  const minX = Math.floor(x - half + 0.02);
  const maxX = Math.floor(x + half - 0.02);
  const minZ = Math.floor(z - half + 0.02);
  const maxZ = Math.floor(z + half - 0.02);
  const below = Math.floor(y) - 1;
  if (below < 0) return false;
  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      const id = world.getVoxel(bx, below, bz);
      if (id !== BLOCKS.AIR && blocksMotion(id) && isSolidAt(bx, below, bz) && isValidSpawnFloor(world, bx, below, bz, id, mobType)) return true;
    }
  }
  return false;
}

/**
 * Validate a candidate position against the generic rules.
 *
 * @param {object} ctx
 * @param {object} ctx.world                       the World
 * @param {Array} ctx.players                      `[{x,y,z}]` in the same dimension
 * @param {string} ctx.difficulty                  'peaceful' | 'easy' | 'normal' | 'hard'
 * @param {string} ctx.dimension                   'overworld' | 'nether' | 'the_end'
 * @param {number} ctx.x
 * @param {number} ctx.y
 * @param {number} ctx.z
 * @param {string} ctx.placement                   one of SpawnPlacementType
 * @param {number} ctx.width                       mob bounding box width, blocks
 * @param {number} ctx.height                      mob bounding box height, blocks
 * @param {boolean} ctx.requiresHostileDifficulty  the mob's category is MONSTER
 * @param {boolean} ctx.mobCanSpawnInDimension     result of the mob's dimension rule
 * @param {boolean} [ctx.checkPlayerDistance]
 * @param {number} [ctx.minPlayerDistance]
 * @param {number} [ctx.maxPlayerDistance]
 * @param {(x:number,y:number,z:number)=>boolean} [ctx.isSolidAt]
 * @returns {{ok: boolean, reason: string|null, detail: object}}
 */
export function validateGenericSpawn(ctx) {
  const {
    world,
    players = [],
    difficulty = Difficulty.NORMAL,
    dimension = 'overworld',
    x, y, z,
    placement = SpawnPlacementType.ON_GROUND,
    width = 0.6,
    height = 1.95,
    requiresHostileDifficulty = false,
    mobCanSpawnInDimension = true,
    checkPlayerDistance = true,
    minPlayerDistance = MIN_SPAWN_DISTANCE,
    maxPlayerDistance = MAX_SPAWN_DISTANCE,
    isSolidAt = null,
  } = ctx;

  const detail = {};

  if (!world) return { ok: false, reason: SpawnRejection.NO_WORLD, detail };

  // 1. Difficulty. Cheapest possible refusal, and it is global: on PEACEFUL no hostile mob may be
  //    placed by natural spawning at all, however dark and open the position.
  if (requiresHostileDifficulty && isPeaceful(difficulty)) {
    return { ok: false, reason: SpawnRejection.DIFFICULTY_BLOCKED, detail: { difficulty } };
  }

  // 2. World bounds and dimension rule.
  if (y < 0 || y >= CHUNK_HEIGHT) {
    return { ok: false, reason: SpawnRejection.OUT_OF_WORLD_BOUNDS, detail: { y, max: CHUNK_HEIGHT - 1 } };
  }
  if (!mobCanSpawnInDimension) {
    return { ok: false, reason: SpawnRejection.WRONG_DIMENSION, detail: { dimension } };
  }

  // 3. The chunk must hold real terrain. `world.getVoxel` answers AIR for an unloaded chunk, which
  //    would otherwise make an unloaded column look like open sky.
  const cx = Math.floor(x / CHUNK_SIZE_X);
  const cz = Math.floor(z / CHUNK_SIZE_Z);
  const chunk = typeof world.getChunk === 'function' ? world.getChunk(cx, cz) : null;
  if (!chunk) {
    return { ok: false, reason: SpawnRejection.CHUNK_NOT_LOADED, detail: { cx, cz } };
  }

  // 4. Player distance. A position must be far enough that a mob does not appear in someone's face,
  //    and close enough that it will still be there when they arrive.
  const nearest = nearestPlayer(players, x, y, z);
  detail.nearestPlayerDistance = Number.isFinite(nearest.distance) ? nearest.distance : null;
  detail.nearestPlayerIndex = nearest.index;
  if (checkPlayerDistance) {
    if (!Number.isFinite(nearest.distance)) {
      // No players in the dimension: nothing to spawn for.
      return { ok: false, reason: SpawnRejection.TOO_FAR_FROM_PLAYER, detail };
    }
    if (nearest.distance < minPlayerDistance) {
      return { ok: false, reason: SpawnRejection.TOO_CLOSE_TO_PLAYER, detail };
    }
    if (nearest.distance > maxPlayerDistance) {
      return { ok: false, reason: SpawnRejection.TOO_FAR_FROM_PLAYER, detail };
    }
  }

  // 5. The spatial rules. Delegated to `validateSpawnSpace` so the chunk-generation spawner and the
  //    runtime cycle cannot drift apart on collision, fluid or floor handling -- they differ only in
  //    the policy wrapped around this call (distance, caps, difficulty), not in the spatial rules.
  const spatial = validateSpawnSpace({
    world, x, y, z, placement, width, height, isSolidAt, mobType: ctx.mobType ?? ctx.type ?? null,
  });
  Object.assign(detail, spatial.detail);
  if (!spatial.ok) return { ok: false, reason: spatial.reason, detail };

  return { ok: true, reason: null, detail };
}

/**
 * NaturalSpawner's position rule, expressed as a predicate the caller can apply to a column.
 *
 * Vanilla picks a random Y for most positions rather than the surface, which is what lets mobs
 * spawn in caves. The caller supplies the draw.
 *
 * @param {object} world
 * @param {(world: object, wx: number, wz: number, heightmap: string) => number} heightFn
 * @param {number} wx
 * @param {number} wz
 * @param {string} heightmap
 * @param {() => number} random01 a source of uniform [0,1)
 * @param {number} [surfaceBias] probability of taking the heightmap instead of a random Y
 */
export function pickCandidateY(world, heightFn, wx, wz, heightmap, random01, surfaceBias = 0.5) {
  const top = heightFn(world, wx, wz, heightmap);
  // Half the attempts take the surface, half take a uniformly random Y below it. A pure surface
  // choice would make cave spawning impossible; a pure random choice would make the surface rare.
  if (random01() < surfaceBias) return top + 1;
  return 1 + Math.floor(random01() * Math.max(1, top));
}

/** Squared distance helper, exported so callers do not open-code it and get the sqrt wrong. */
export function distanceSq(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
