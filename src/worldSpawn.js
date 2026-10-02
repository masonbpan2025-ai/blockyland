// Choosing where the player stands when a new world starts.
//
// The player used to be spawned at a hardcoded height (y = 27) that happened to
// suit the built-in village but had no relationship to the terrain. On any seed
// whose surface sat above that value the player started buried inside rock, and
// near taller features (a cottage roof, a mountain slope) they could be trapped
// even on the default seed.
//
// The functions here derive the position from the generated terrain instead:
// probe the column, stand one block above the highest solid block, and refuse
// candidates that are flooded, blocked, or sitting on a tree.

import { BLOCKS } from './blocks.js';

/** Blocks that are fine to stand on top of. */
const NATURAL_GROUND = new Set([
  BLOCKS.GRASS, BLOCKS.MYCELIUM, BLOCKS.PODZOL, BLOCKS.MOSS_BLOCK, BLOCKS.MUD,
  BLOCKS.RED_SAND, BLOCKS.CRIMSON_NYLIUM, BLOCKS.WARPED_NYLIUM, BLOCKS.END_STONE,
  BLOCKS.PACKED_ICE, BLOCKS.BLUE_ICE, BLOCKS.SCULK,
  BLOCKS.NETHERRACK, BLOCKS.SOUL_SAND, BLOCKS.SOUL_SOIL, BLOCKS.BASALT, BLOCKS.BLACKSTONE
]);
/** Blocks that are walkable but a sign we may be on a structure or path. */
const BUILT_GROUND = new Set([
  BLOCKS.COBBLESTONE, BLOCKS.OAK_PLANKS, BLOCKS.GRAVEL, BLOCKS.SAND, BLOCKS.STONE,
  BLOCKS.DIRT, BLOCKS.SANDSTONE, BLOCKS.STONE_BRICKS, BLOCKS.SNOW, BLOCKS.CLAY,
  BLOCKS.TERRACOTTA, BLOCKS.RED_TERRACOTTA, BLOCKS.ORANGE_TERRACOTTA, BLOCKS.YELLOW_TERRACOTTA,
  BLOCKS.WHITE_TERRACOTTA, BLOCKS.BROWN_TERRACOTTA, BLOCKS.DEEPSLATE, BLOCKS.CALCITE,
  BLOCKS.TUFF, BLOCKS.PRISMARINE, BLOCKS.BEDROCK, BLOCKS.CHERRY_PLANKS, BLOCKS.BIRCH_PLANKS,
  BLOCKS.SPRUCE_PLANKS, BLOCKS.JUNGLE_PLANKS, BLOCKS.ACACIA_PLANKS, BLOCKS.DARK_OAK_PLANKS
]);
/** Wood is a tree: standing on it puts the player inside leaves or a trunk. */
const TREE_BLOCKS = new Set([
  BLOCKS.OAK_LOG, BLOCKS.OAK_LEAVES,
  BLOCKS.CHERRY_LOG, BLOCKS.CHERRY_LEAVES,
  BLOCKS.BIRCH_LOG, BLOCKS.BIRCH_LEAVES,
  BLOCKS.SPRUCE_LOG, BLOCKS.SPRUCE_LEAVES,
  BLOCKS.JUNGLE_LOG, BLOCKS.JUNGLE_LEAVES,
  BLOCKS.ACACIA_LOG, BLOCKS.ACACIA_LEAVES,
  BLOCKS.DARK_OAK_LOG, BLOCKS.DARK_OAK_LEAVES,
  BLOCKS.MANGROVE_LOG, BLOCKS.MANGROVE_LEAVES, BLOCKS.MANGROVE_ROOTS,
  BLOCKS.PALE_OAK_LOG, BLOCKS.PALE_OAK_LEAVES,
  BLOCKS.CRIMSON_STEM, BLOCKS.NETHER_WART_BLOCK,
  BLOCKS.WARPED_STEM, BLOCKS.WARPED_WART_BLOCK,
  BLOCKS.RED_MUSHROOM_BLOCK, BLOCKS.BROWN_MUSHROOM_BLOCK, BLOCKS.MUSHROOM_STEM,
  BLOCKS.CHORUS_PLANT, BLOCKS.CHORUS_FLOWER
]);
/** Head room required above the feet, in blocks. */
const HEAD_ROOM = 2;

function isAir(id) {
  return id === BLOCKS.AIR;
}

function isHazard(id) {
  return id === BLOCKS.WATER || id === BLOCKS.LAVA || id === BLOCKS.FIRE || id === BLOCKS.SOUL_FIRE;
}

/**
 * Score a candidate column. Higher is better; null means "not usable at all".
 *
 * @param {object} world  must expose getHighestSolidY / getVoxel
 * @param {number} wx
 * @param {number} wz
 * @param {{anchorX:number, anchorZ:number}} anchor
 * @param {{allowWater?:boolean}} [options]
 */
export function scoreSpawnColumn(world, wx, wz, anchor, options = {}) {
  const allowWater = !!options.allowWater;
  const groundY = world.getHighestSolidY(wx, wz);
  if (!groundY || groundY <= 0) return null;

  // Never spawn on top of bedrock roof ceiling in caverns / nether
  const maxHeight = (world.CHUNK_HEIGHT || 64) - 2;
  if (groundY >= maxHeight) return null;

  const ground = world.getVoxel(wx, groundY, wz);
  if (ground === BLOCKS.LAVA || ground === BLOCKS.FIRE || ground === BLOCKS.AIR) return null;
  if (!allowWater && ground === BLOCKS.WATER) return null;
  if (TREE_BLOCKS.has(ground)) return null;

  // Feet at groundY + 1; the two blocks above must be clear.
  for (let y = groundY + 1; y <= groundY + HEAD_ROOM; y++) {
    const id = world.getVoxel(wx, y, wz);
    if (!isAir(id)) return null;
  }

  let score = 1000;
  // Prefer to stay near the requested position.
  score -= Math.hypot(wx - anchor.anchorX, wz - anchor.anchorZ) * 10;
  // Prefer natural ground, then any walkable block, then water surface as ocean fallback.
  if (NATURAL_GROUND.has(ground)) score += 50;
  else if (BUILT_GROUND.has(ground)) {
    if (ground === BLOCKS.BEDROCK) score -= 300;
    else score += 10;
  }
  else if (ground === BLOCKS.WATER) score -= 200;

  return { wx, wz, groundY, standY: groundY + 1, ground, score };
}

/**
 * Find a safe standing position near `anchor`.
 *
 * Only inspects already-generated chunks (it never creates one), so callers must
 * generate terrain around the anchor first. placePlayerOnSurface() does that.
 *
 * @param {object} world
 * @param {{x:number, z:number, radius?:number}} anchor
 * @returns {{x:number, y:number, z:number, groundY:number, found:boolean, reason:string}|null}
 */
export function findSurfaceSpawn(world, anchor = {}) {
  if (!world || typeof world.getHighestSolidY !== 'function') return null;

  const anchorX = Math.round(Number.isFinite(anchor.x) ? anchor.x : 0);
  const anchorZ = Math.round(Number.isFinite(anchor.z) ? anchor.z : 0);
  const radius = Math.max(1, Math.min(24, Math.floor(anchor.radius) || 8));

  const candidates = [];
  // First pass: try to find dry land candidates
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const scored = scoreSpawnColumn(world, anchorX + dx, anchorZ + dz, { anchorX, anchorZ }, { allowWater: false });
      if (scored) candidates.push(scored);
    }
  }

  // Second pass: if no dry ground exists anywhere in the radius (e.g. ocean biome),
  // allow water surface candidates so the player spawns floating at sea level instead of y=0!
  if (candidates.length === 0) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const scored = scoreSpawnColumn(world, anchorX + dx, anchorZ + dz, { anchorX, anchorZ }, { allowWater: true });
        if (scored) candidates.push(scored);
      }
    }
  }

  if (candidates.length === 0) {
    const fallbackGroundY = (typeof world.getHighestSolidY === 'function' ? world.getHighestSolidY(anchorX, anchorZ) : 0) || world.seaLevel || 24;
    return {
      x: anchorX + 0.5,
      y: Math.max(1, fallbackGroundY + 1),
      z: anchorZ + 0.5,
      groundY: fallbackGroundY,
      found: false,
      reason: 'no usable column near the anchor'
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const moved = Math.hypot(best.wx - anchorX, best.wz - anchorZ);
  const isWater = best.ground === BLOCKS.WATER;
  return {
    x: best.wx + 0.5,
    y: best.standY,
    z: best.wz + 0.5,
    groundY: best.groundY,
    found: true,
    reason: isWater
      ? 'spawned floating at sea surface'
      : (moved === 0 ? 'anchor column is clear' : `moved ${moved.toFixed(1)} blocks from the anchor for clear ground`)
  };
}

/**
 * Make sure the chunks covering `anchor` plus `radius` exist before probing.
 *
 * getHighestSolidY deliberately never generates a chunk, so without this step a
 * probe of fresh terrain would report every column as empty.
 */
function ensureTerrainAround(world, anchorX, anchorZ, radius) {
  if (typeof world.getOrCreateChunk !== 'function') return;
  const margin = radius + 2;
  const minCx = Math.floor((anchorX - margin) / 16);
  const maxCx = Math.floor((anchorX + margin) / 16);
  const minCz = Math.floor((anchorZ - margin) / 16);
  const maxCz = Math.floor((anchorZ + margin) / 16);
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      try {
        world.getOrCreateChunk(cx, cz);
      } catch {
        // A chunk that cannot be generated just leaves its columns unusable.
      }
    }
  }
}

/**
 * Move the player onto the surface at their current X/Z (or at `anchor`).
 *
 * Generates the terrain around the target if necessary, then places the player
 * on it. Returns the placement so callers can log it.
 */
export function placePlayerOnSurface(game, anchor = {}) {
  const world = game?.world;
  const player = game?.player;
  if (!world || !player || !player.position) {
    return { found: false, reason: 'no world or player', x: 0, y: 0, z: 0, groundY: 0 };
  }

  const target = {
    x: Number.isFinite(anchor.x) ? anchor.x : player.position.x,
    z: Number.isFinite(anchor.z) ? anchor.z : player.position.z,
    radius: anchor.radius
  };

  const radius = Math.max(1, Math.min(24, Math.floor(target.radius) || 8));
  ensureTerrainAround(world, Math.round(target.x), Math.round(target.z), radius);

  const spawn = findSurfaceSpawn(world, { ...target, radius });
  if (!spawn || !spawn.found) {
    return spawn || { found: false, reason: 'no surface found', x: target.x, y: 0, z: target.z, groundY: 0 };
  }

  player.position.set(spawn.x, spawn.y, spawn.z);
  if (player.velocity && player.velocity.set) player.velocity.set(0, 0, 0);
  // onGround is a boolean on Player, so Number.isFinite() would always be false
  // here and the reset would silently never happen.
  if (typeof player.onGround === 'boolean' || Number.isFinite(player.onGround)) {
    player.onGround = false;
  }
  // Being teleported onto the surface is a landing, not a fall: clear any
  // accumulated downward velocity-driven state.
  if (Number.isFinite(player.fallDistance)) player.fallDistance = 0;
  if (player.spawnPosition && player.spawnPosition.set) {
    player.spawnPosition.set(spawn.x, spawn.y, spawn.z);
  }

  return spawn;
}
