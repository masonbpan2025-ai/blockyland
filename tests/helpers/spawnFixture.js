// A tiny hand-authored voxel world for spawn tests.
//
// Why not use a generated `World`: a test that has to FIND suitable water in random terrain can
// silently pass by never finding any. The existing water test does exactly that -- it returns early
// when the generated world has no sea, so it asserts nothing on some seeds. This fixture makes every
// block, light level, biome and loaded chunk explicit, so a test either exercises the rule or fails.
//
// It implements only the surface `spawnValidation`, `spawnState`, `mobSpawnPredicates` and
// `naturalSpawner` actually call. Where a real World would compute something (light propagation,
// heightmaps), the fixture takes the value as explicit input, which is the point: the rule is then
// being tested rather than a whole subsystem at once.
import { BLOCKS, BLOCK_DEFS } from '../../src/blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../src/spawning/lightEngine.js';

/** A block id that is solid for a mob's bounding box, matching MobManager's own rule. */
export function isSolidBlockId(id) {
  if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
  const def = BLOCK_DEFS[id];
  if (!def) return false;
  if (def.plant) return false;
  return def.solid !== false;
}

export class FixtureWorld {
  /**
   * @param {object} [options]
   * @param {string} [options.biome]
   * @param {number} [options.seaLevel]
   * @param {string} [options.dimension]
   * @param {number} [options.skyLight] uniform sky light inside loaded chunks
   */
  constructor({ biome = 'plains', seaLevel = 22, dimension = 'overworld', skyLight = 15 } = {}) {
    this.biome = biome;
    this.seaLevel = seaLevel;
    this.dimension = dimension;
    /** Global block overrides keyed `x,y,z`. */
    this.blocks = new Map();
    /** Per-position sky light overrides keyed `x,y,z`. */
    this.sky = new Map();
    /** Per-position block light overrides keyed `x,y,z`. */
    this.blockLightMap = new Map();
    /**
     * Loaded chunks as `cx,cz`. A position in an unloaded chunk answers AIR from `getVoxel` but must
     * be REJECTED by the validator -- that distinction is one of the things under test, so the
     * fixture keeps the two facts separate.
     */
    this.loaded = new Set();
    this.uniformSkyLight = skyLight;
    this.defaultBlock = BLOCKS.AIR;
    /** Per-column biome overrides keyed `x,z`, for biome-boundary tests. */
    this.biomeAtColumn = new Map();
    this.getVoxelCalls = 0;
  }

  key(x, y, z) { return `${x},${y},${z}`; }

  /** Mark a chunk loaded. */
  loadChunk(cx, cz) { this.loaded.add(`${cx},${cz}`); return this; }

  /** Load every chunk covering a block-coordinate box, inclusive. */
  loadRegion(x0, z0, x1, z1) {
    for (let cx = Math.floor(Math.min(x0, x1) / CHUNK_SIZE_X); cx <= Math.floor(Math.max(x0, x1) / CHUNK_SIZE_X); cx++) {
      for (let cz = Math.floor(Math.min(z0, z1) / CHUNK_SIZE_Z); cz <= Math.floor(Math.max(z0, z1) / CHUNK_SIZE_Z); cz++) {
        this.loadChunk(cx, cz);
      }
    }
    return this;
  }

  /** Set one block. */
  set(x, y, z, id) { this.blocks.set(this.key(x, y, z), id); return this; }

  /** Fill a box of blocks, inclusive on every axis. */
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, id);
      }
    }
    return this;
  }

  /** Set the sky light at one position. */
  setSkyLight(x, y, z, level) { this.sky.set(this.key(x, y, z), level); return this; }

  /** Set the block light at one position. */
  setBlockLight(x, y, z, level) { this.blockLightMap.set(this.key(x, y, z), level); return this; }

  /** Override the biome for a column. */
  setBiome(x, z, id) { this.biomeAtColumn.set(`${x},${z}`, id); return this; }

  getChunk(cx, cz) { return this.loaded.has(`${cx},${cz}`) ? { cx, cz } : undefined; }

  getVoxel(x, y, z) {
    this.getVoxelCalls++;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < 0 || by >= CHUNK_HEIGHT) return BLOCKS.AIR;
    const override = this.blocks.get(this.key(bx, by, bz));
    if (override !== undefined) return override;
    return this.defaultBlock;
  }

  getSkyLight(x, y, z) {
    const v = this.sky.get(this.key(Math.floor(x), Math.floor(y), Math.floor(z)));
    return v === undefined ? this.uniformSkyLight : v;
  }

  getBlockLight(x, y, z) {
    const v = this.blockLightMap.get(this.key(Math.floor(x), Math.floor(y), Math.floor(z)));
    return v === undefined ? 0 : v;
  }

  /** Internal light, as the predicates read it. */
  getLightLevel(x, y, z, skyDarken = 0) {
    return Math.max(this.getBlockLight(x, y, z), Math.max(0, this.getSkyLight(x, y, z) - skyDarken));
  }

  getBiome(x, z) {
    return this.biomeAtColumn.get(`${Math.floor(x)},${Math.floor(z)}`) ?? this.biome;
  }

  getHighestSolidY(x, z) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = this.getVoxel(Math.floor(x), y, Math.floor(z));
      if (id !== BLOCKS.AIR) return y;
    }
    return 0;
  }

  isBlockSolid(x, y, z) { return isSolidBlockId(this.getVoxel(x, y, z)); }
}

/**
 * A minimal MobManager-shaped recorder.
 *
 * It records every construction attempt WITH the position and options, so a test can assert
 * "no constructor call happened" rather than only "the validator said no". That distinction matters:
 * validating correctly and then constructing anyway is a real failure mode.
 */
export class RecordingMobManager {
  constructor({ dimensions = {}, world = null } = {}) {
    this.mobs = [];
    this.calls = [];
    this.dimensions = dimensions;
    this.world = world;
    this.failTypes = new Set();
  }

  getMobDimensions(type) {
    return this.dimensions[type] || { width: 0.6, height: 1.95 };
  }

  isBlockSolid(x, y, z) {
    return this.world ? this.world.isBlockSolid(x, y, z) : false;
  }

  spawnMob(type, x, y, z, options = {}) {
    this.calls.push({ type, x, y, z, options: { ...options } });
    if (this.failTypes.has(type)) return null;
    const mob = {
      type, health: 20, maxHealth: 20,
      mesh: { position: { x, y, z } },
      persistent: false, noActionTime: 0,
      naturalSpawn: options.natural === true,
      spawnSize: options.size,
    };
    this.mobs.push(mob);
    return mob;
  }

  removeMob(mob) {
    const i = this.mobs.indexOf(mob);
    if (i === -1) return false;
    this.mobs.splice(i, 1);
    return true;
  }
}

/**
 * Frozen ocean: a water column with an ice SHEET on the surface.
 *
 * Note the sheet is at `seaLevel + 1`, i.e. directly ABOVE the top water block, so a mob standing in
 * the top water block does not intersect it. A test that wants to prove penetration needs an ice WALL
 * (see `frozenWaterWallFixture`), not this.
 */
export function frozenWaterFixture({ seaLevel = 22 } = {}) {
  const world = new FixtureWorld({ biome: 'frozen_ocean', seaLevel, dimension: 'overworld' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, seaLevel - 6, 31, BLOCKS.STONE);
  world.fill(-16, seaLevel - 5, -16, 31, seaLevel, 31, BLOCKS.WATER);
  world.fill(-16, seaLevel + 1, -16, 31, seaLevel + 1, 31, BLOCKS.ICE);
  return world;
}

/**
 * Frozen ocean with a vertical ICE WALL running along the z axis from x = 1 upward through the water
 * column, plus the surface sheet.
 *
 * This is the geometry the "fish on the ice" report needs: a mob standing in the water at x = 0 can
 * have a bounding box that reaches into the ice at x = 1. Water everywhere else, so a candidate well
 * away from the wall is still legal and serves as the positive control.
 */
export function frozenWaterWallFixture({ seaLevel = 22, wallX = 1, halfSpan = 80 } = {}) {
  const world = new FixtureWorld({ biome: 'frozen_ocean', seaLevel, dimension: 'overworld' });
  world.loadRegion(-halfSpan, -16, halfSpan, 31);
  const floorY = seaLevel - 5;
  world.fill(-halfSpan, 0, -16, halfSpan, floorY - 1, 31, BLOCKS.STONE);
  world.fill(-halfSpan, floorY, -16, halfSpan, seaLevel, 31, BLOCKS.WATER);
  world.fill(-halfSpan, seaLevel + 1, -16, halfSpan, seaLevel + 1, 31, BLOCKS.ICE);
  // The wall occupies the whole water column at wallX, leaving x < wallX as open water.
  world.fill(wallX, floorY, -16, wallX, seaLevel, 31, BLOCKS.ICE);
  return world;
}

/** Build a plain grass field at a known height. */
export function grassFieldFixture({ groundY = 30, biome = 'plains' } = {}) {
  const world = new FixtureWorld({ biome, seaLevel: 22, dimension: 'overworld' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, groundY, 31, BLOCKS.DIRT);
  world.fill(-16, groundY, -16, 31, groundY, 31, BLOCKS.GRASS);
  return world;
}

/**
 * A grass field wide enough for natural-spawn distance rules.
 *
 * `grassFieldFixture` covers x = -16..31, which is only 31 blocks wide. A candidate at x = 8.5 with
 * the player 40 blocks east at x = 48.5 sits in an UNLOADED chunk, so every distance-rule test written
 * against the small fixture is silently refused for the wrong reason. This variant loads a wide band
 * so a player can be placed at a legal distance inside real terrain.
 */
export function wideGrassFieldFixture({ groundY = 30, biome = 'plains', radius = 6 } = {}) {
  const world = new FixtureWorld({ biome, seaLevel: 22, dimension: 'overworld' });
  const span = radius * 16;
  world.loadRegion(-span, -span, span, span);
  world.fill(-span, 0, -span, span, groundY, span, BLOCKS.DIRT);
  world.fill(-span, groundY, -span, span, groundY, span, BLOCKS.GRASS);
  return world;
}

export { BLOCKS, CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z };
