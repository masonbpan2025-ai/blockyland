// Generated water settles before its chunk appears.
//
// The terrain generator leaves water that has somewhere to go: an ocean floor over a cave, a lake beside a ravine.
// The water simulation used to find all of it once the world started -- some 29,000 water changes in the first
// 25 seconds of a new world at render distance 8 -- and every change re-meshed a chunk and woke the sand and gravel
// above it. Thousands of blocks fell at once and broke into hundreds of items, and the first ten seconds of a world
// ran at two frames a second.
//
// Here the game's own water rules (WaterSimulation) run on the new chunk alone until nothing changes, so the chunk
// arrives with the water where the simulation would have put it. Nothing falls, nothing is dropped: generated terrain
// does not react to its own water, as in Java Edition. The chunk's edges are walls for now: water that flows out
// into a neighbour still does that at run time, once the neighbour is there (WaterSimulation.initChunk).
import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { WaterSimulation } from '../waterSimulation.js';

const SIZE = 16, HEIGHT = 64;
/** More ticks than a column of flowing water needs to come to rest; a safety stop, not a budget. */
const MAX_TICKS = 400;
/** The sides LavaSimulation.touchesWater looks at: water above lava does not touch it there. */
const LAVA_CONTACT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];

/** One chunk as a world for the water simulation: nothing outside it is loaded. */
class ChunkWorld {
  constructor(chunk, orientations) {
    this.chunk = chunk;
    this.orientations = orientations;
    this.bx = chunk.cx * SIZE;
    this.bz = chunk.cz * SIZE;
    // Water reaching lava turns it to obsidian or cobblestone in the water's own tick; this is what that tick asks.
    this.lava = { touchesWater: (x, y, z) => LAVA_CONTACT.some(([dx, dy, dz]) => this.getVoxel(x + dx, y + dy, z + dz) === BLOCKS.WATER) };
  }

  index(x, y, z) {
    const lx = x - this.bx, lz = z - this.bz;
    if (y < 0 || y >= HEIGHT || lx < 0 || lx >= SIZE || lz < 0 || lz >= SIZE) return -1;
    return (y * SIZE + lz) * SIZE + lx;
  }

  getChunk(cx, cz) { return cx === this.chunk.cx && cz === this.chunk.cz ? this.chunk : null; }

  getVoxel(x, y, z) {
    const i = this.index(x, y, z);
    return i < 0 ? BLOCKS.AIR : this.chunk.voxels[i];
  }

  // As World.getWaterLevel: a sea plant holds source water, anything else that is not water holds none.
  getWaterLevel(x, y, z) {
    const i = this.index(x, y, z);
    if (i < 0) return -1;
    const id = this.chunk.voxels[i];
    if (BLOCK_DEFS[id]?.waterPlant) return 0;
    return id === BLOCKS.WATER ? this.chunk.waterLevels[i] : -1;
  }

  // As World.getLavaLevel.
  getLavaLevel(x, y, z) {
    const i = this.index(x, y, z);
    return i >= 0 && this.chunk.voxels[i] === BLOCKS.LAVA ? this.chunk.waterLevels[i] : -1;
  }

  setVoxel(x, y, z, id, level = 0) {
    const i = this.index(x, y, z);
    if (i < 0) return;
    // A plant the water washes away takes its orientation entry with it, as World.setVoxel does.
    const key = `${x},${y},${z}`;
    if (this.chunk.voxels[i] !== id && this.orientations?.has?.(key)) this.orientations.delete(key);
    this.chunk.voxels[i] = id;
    this.chunk.waterLevels[i] = level;
  }
}

/**
 * Run the water rules on a freshly generated chunk until its water is at rest. Returns the number of cells changed.
 *
 * @param {import('../world.js').Chunk} chunk
 * @param {object} [options]
 * @param {Map} [options.orientations] the world's structure orientation map, kept in step with washed-away plants
 */
export function settleChunkWater(chunk, { orientations } = {}) {
  // Most chunks have no water with anywhere to go: skip them without building the simulation.
  chunk.waterAtRest = true;
  if (!chunk.voxels.includes(BLOCKS.WATER)) return 0;
  const world = new ChunkWorld(chunk, orientations);
  const water = new WaterSimulation(world, { queuesOwnChanges: true });
  water.wakeChunk(chunk);
  let changed = 0;
  for (let ticks = 0; water.pending.size && ticks < MAX_TICKS; ticks++) changed += water.tick(Infinity);
  // A cascade cut off at MAX_TICKS is still moving: World wakes the whole chunk for the game's water to finish it.
  chunk.waterAtRest = water.pending.size === 0;
  return changed;
}
