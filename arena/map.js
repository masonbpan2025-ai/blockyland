// The arena's map, made the same way every time from the world's seed: the arena (arena/sim.js) plays on it and the
// film (src/cinema/arenaFilm.js) rebuilds it, so neither has to record these edits block by block.
//
//   - Caves under the playing area are filled with stone. Bots mine what they can see, and an ore open to a flooded
//     cave 15 blocks down drew players into tunnels they never left (one drowned there in the first test game).
//   - Each team gets a level clearing for its camp and, 14 blocks north, a stepped quarry with stone, coal, iron,
//     gravel and cobwebs. A richer quarry, with diamonds, sits in the middle between them.
//   - The ground around each dug-out area slopes down to its rim, so it can be walked out of from any side.
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

export const ARENA_HALF = { x: 112, z: 112 };

function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

/** Feet height of the first solid, non-tree block from the top. */
export function surfaceY(world, x, z) {
  for (let y = 62; y > 1; y--) {
    const v = world.getVoxel(Math.floor(x), y - 1, Math.floor(z));
    const def = BLOCK_DEFS[v];
    if (v !== BLOCKS.AIR && v !== BLOCKS.WATER && def?.solid !== false && !/leaves|log/i.test(def?.name || '')) return y;
  }
  return 30;
}

/** Cut the ground around a dug-out area down into a slope, a block per ring, everything above it cleared. */
function slopeAround(world, cx, cz, inner, top, width = 6) {
  for (let x = cx - inner - width; x <= cx + inner + width; x++) for (let z = cz - inner - width; z <= cz + inner + width; z++) {
    const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    if (ring <= inner || ring > inner + width) continue;
    const allowed = top + (ring - inner);
    for (let y = allowed; y < 63; y++) if (world.getVoxel(x, y, z) !== BLOCKS.AIR) world.setVoxel(x, y, z, BLOCKS.AIR);
    const below = world.getVoxel(x, allowed - 1, z);
    if (below !== BLOCKS.AIR && /dirt|stone/i.test(BLOCK_DEFS[below]?.name || '')) world.setVoxel(x, allowed - 1, z, BLOCKS.GRASS);
  }
}

/** A level grass clearing of radius r at its centre's surface height, trees cleared. Returns that height. */
function clearing(world, cx, cz, r) {
  const y0 = surfaceY(world, cx, cz);
  slopeAround(world, cx, cz, r, y0);
  for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
    if (Math.hypot(x - cx, z - cz) > r + .5) continue;
    for (let y = y0 - 4; y < y0 - 1; y++) if (world.getVoxel(x, y, z) === BLOCKS.AIR || world.getVoxel(x, y, z) === BLOCKS.WATER) world.setVoxel(x, y, z, BLOCKS.DIRT);
    world.setVoxel(x, y0 - 1, z, BLOCKS.GRASS);
    for (let y = y0; y < 63; y++) if (world.getVoxel(x, y, z) !== BLOCKS.AIR) world.setVoxel(x, y, z, BLOCKS.AIR);
  }
  return y0;
}

/** A stepped quarry: rings one block deeper toward the middle, its stone open to the sky, with ores set into it. */
function quarry(world, cx, cz, r, ores, rnd) {
  const top = surfaceY(world, cx, cz), exposed = [];
  slopeAround(world, cx, cz, r + 1, top);
  for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let z = cz - r - 1; z <= cz + r + 1; z++) {
    const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    if (ring > r + 1) continue;
    const floor = ring > r ? top - 1 : top - 1 - Math.min(5, r + 1 - ring);
    for (let y = floor + 1; y < 63; y++) if (world.getVoxel(x, y, z) !== BLOCKS.AIR) world.setVoxel(x, y, z, BLOCKS.AIR);
    for (let y = floor - 2; y <= floor; y++) world.setVoxel(x, y, z, BLOCKS.STONE);
    if (ring <= r) exposed.push([x, floor, z]);
  }
  for (const [ore, count] of Object.entries(ores)) {
    const id = BLOCKS[`${ore.toUpperCase()}_ORE`] ?? BLOCKS[ore.toUpperCase()];
    for (let i = 0; i < count && exposed.length; i++) {
      const [x, y, z] = exposed[Math.floor(rnd() * exposed.length)];
      if (ore === 'cobweb') { if (world.getVoxel(x, y + 1, z) === BLOCKS.AIR) world.setVoxel(x, y + 1, z, id); }
      else world.setVoxel(x, y, z, id);
    }
  }
  return top;
}

/** Fill every cave under the playing area: below six blocks under the surface, air, water and lava become stone. */
function sealCaves(world) {
  const fill = new Set([BLOCKS.AIR, BLOCKS.WATER, BLOCKS.LAVA, BLOCKS.CAVE_AIR].filter(v => v !== undefined));
  for (let x = -ARENA_HALF.x; x < ARENA_HALF.x; x++) for (let z = -ARENA_HALF.z; z < ARENA_HALF.z; z++) {
    const top = surfaceY(world, x, z);
    for (let y = 1; y < top - 6; y++) if (fill.has(world.getVoxel(x, y, z))) world.setVoxel(x, y, z, BLOCKS.STONE);
  }
}

/**
 * Build the arena on a fresh world. Returns where things are: each team's camp (x, y, z) and quarry, and the centre.
 * @param {object} world a World made from the game's seed
 * @param {{seed:number, spread?:number}} options
 */
export function buildArenaMap(world, { seed, spread = 48 }) {
  const rnd = seeded(seed ^ 0x5eed);
  for (let cx = Math.floor(-ARENA_HALF.x / 16); cx < Math.ceil(ARENA_HALF.x / 16); cx++)
    for (let cz = Math.floor(-ARENA_HALF.z / 16); cz < Math.ceil(ARENA_HALF.z / 16); cz++) world.getOrCreateChunk(cx, cz);
  sealCaves(world);
  const camps = [-spread, spread].map((x) => ({ x, z: 0, y: clearing(world, x, 0, 7), quarry: { x, z: -14 } }));
  for (const camp of camps) quarry(world, camp.quarry.x, camp.quarry.z, 6, { coal: 10, iron: 6, gravel: 6, cobweb: 4 }, rnd);
  quarry(world, 0, 0, 7, { coal: 6, iron: 14, diamond: 3, gravel: 4, cobweb: 6 }, rnd);
  return { camps, centre: { x: 0, z: 0 } };
}
