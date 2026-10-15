import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';
import { CAVE_KIND, CAVE_REGION_SIZE } from './worldgen/caveTerrain.js';

export const DEFAULT_CAVE_RADIUS = 256;
export const MAX_CAVE_RADIUS = 1024;

export function parseCaveRadius(args = []) {
  if (!args.length) return DEFAULT_CAVE_RADIUS;
  if (args.length !== 1 || !/^\d+$/.test(args[0])) throw new Error('Cave radius must be an integer from 16 to 1024 blocks.');
  const radius = Number(args[0]);
  if (radius < 16 || radius > MAX_CAVE_RADIUS) throw new Error('Cave radius must be an integer from 16 to 1024 blocks.');
  return radius;
}

const wet = id => id === B.WATER || id === B.LAVA;
const clear = id => id === B.AIR || (!wet(id) && ![B.FIRE, B.SOUL_FIRE, B.SWEET_BERRY_BUSH, B.POINTED_DRIPSTONE].includes(id)
  && Boolean(BLOCK_DEFS[id]?.plant || BLOCK_DEFS[id]?.solid === false));

function checkWorld(world) {
  if (!world.caves || world.isFlatWorld || world.generationMode === 'authored'
    || !['overworld', 'nether'].includes(world.dimension)) {
    throw new Error('This world has no generated cave entrances (Superflat, authored maps and the End are excluded).');
  }
}

// Reading a missing World chunk returns air. Use the same carving plan instead,
// without generating hundreds of chunks merely to print a coordinate list.
function sample(world, x, y, z, column) {
  if (world.getChunk(Math.floor(x / 16), Math.floor(z / 16))) return world.getVoxel(x, y, z);
  if (y > column.height) return B.AIR;
  const cell = world.caves.cellAt(x, y, z, column);
  if (world.dimension === 'nether' && cell !== null) return y < world.seaLevel ? B.LAVA : B.AIR;
  return cell ?? B.STONE;
}

function mouthOf(world, region) {
  const ex = Math.floor(region.entrance[0]), ez = Math.floor(region.entrance[2]);
  const candidates = [];
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const x = ex + dx, z = ez + dz, column = world.caves.column(x, z), y = column.height - 1;
    if (column.def.isVoid || y < 4 || y > 60) continue;
    if (!(world.caves.kindAt(x, y, z, column) & CAVE_KIND.ENTRANCE)) continue;
    const ids = [y, y + 1, y + 2].map(h => sample(world, x, h, z, column));
    if (!ids.every(id => clear(id) || id === B.WATER)) continue;
    candidates.push({ x, y, z, flooded: ids.includes(B.WATER), biome: column.biome,
      predicted: !world.getChunk(Math.floor(x / 16), Math.floor(z / 16)),
      offset: dx * dx + dz * dz });
  }
  candidates.sort((a, b) => a.offset - b.offset || a.x - b.x || a.z - b.z);
  return candidates[0] ?? null;
}

/** All mapped entrance mouths in a finite horizontal radius, nearest first.
 * Networks connect underground; an entrance is the useful coordinate to report.
 * Unexplored mouths are seed predictions; loaded chunks always take precedence.
 */
export function locateCaveEntrances(world, x, z, { radius = DEFAULT_CAVE_RADIUS } = {}) {
  checkWorld(world);
  parseCaveRadius([String(radius)]);
  if (![x, z].every(v => Number.isFinite(v) && Number.isSafeInteger(Math.floor(v)))) throw new Error('Invalid cave search origin.');
  const result = [], seen = new Set();
  // A region's mouth can extend beyond its edge. Include that margin before
  // filtering by the actual mouth's distance (also works at negative coordinates).
  const pad = CAVE_REGION_SIZE;
  for (let gx = Math.floor((x - radius - pad) / CAVE_REGION_SIZE); gx <= Math.floor((x + radius + pad) / CAVE_REGION_SIZE); gx++) {
    for (let gz = Math.floor((z - radius - pad) / CAVE_REGION_SIZE); gz <= Math.floor((z + radius + pad) / CAVE_REGION_SIZE); gz++) {
      const region = world.caves.region(gx, gz);
      if (Math.hypot(region.entrance[0] - x, region.entrance[2] - z) > radius + 8) continue;
      const mouth = mouthOf(world, region);
      if (!mouth) continue;
      const distance = Math.hypot(mouth.x + .5 - x, mouth.z + .5 - z), key = `${mouth.x},${mouth.y},${mouth.z}`;
      if (distance > radius || seen.has(key)) continue;
      seen.add(key);
      result.push({ ...mouth, distance, region: [gx, gz], hub: region.hub });
    }
  }
  return result.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
}

export function caveLocateLines(world, origin, args = []) {
  const radius = parseCaveRadius(args), caves = locateCaveEntrances(world, origin.x, origin.z, { radius });
  return [
    `${caves.length} cave entrance(s) within ${radius} blocks, nearest first. Use /locate cave [radius] (16–1024).`,
    ...caves.map(c => `Cave: x ${c.x}, y ${c.y}, z ${c.z} — ${Math.round(c.distance)} blocks, ${c.biome}${c.flooded ? ', flooded' : ''}${c.predicted ? ' (unexplored)' : ''}`),
    ...(caves.some(c => c.predicted) ? ['Unexplored entrances are predicted from the world seed; existing terrain is checked when teleporting.'] : []),
  ];
}

/** Generate only the arrival neighborhood, recheck the actual mouth, then find
 * dry ground beside it. No excavation, platforms, or unsafe fallback teleport.
 */
export function nearestCaveArrival(world, origin, { radius = DEFAULT_CAVE_RADIUS } = {}) {
  const entrances = locateCaveEntrances(world, origin.x, origin.z, { radius });
  for (const entrance of entrances) {
    if (entrance.flooded) continue;
    for (let cx = Math.floor((entrance.x - 12) / 16); cx <= Math.floor((entrance.x + 12) / 16); cx++) {
      for (let cz = Math.floor((entrance.z - 12) / 16); cz <= Math.floor((entrance.z + 12) / 16); cz++) world.getOrCreateChunk(cx, cz);
    }
    const mouth = mouthOf(world, world.caves.region(...entrance.region));
    if (!mouth || mouth.flooded) continue;
    const arrivals = [];
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      if (dx * dx + dz * dz > 64) continue;
      const x = mouth.x + dx, z = mouth.z + dz;
      const height = world.surfaceHeightAt(x, z);
      for (let y = Math.min(61, height + 2); y >= Math.max(2, height - 6); y--) {
        const support = world.getVoxel(x, y - 1, z), def = BLOCK_DEFS[support];
        if (!def || support === B.AIR || def.plant || def.solid === false || wet(support)
          || [B.MAGMA_BLOCK, B.CACTUS, B.POINTED_DRIPSTONE, B.POWDER_SNOW].includes(support)) continue;
        // Centered feet keep the player's 0.6-wide body within this column.
        if (!clear(world.getVoxel(x, y, z)) || !clear(world.getVoxel(x, y + 1, z))) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, az]) => [y - 1, y, y + 1].some(h =>
          [B.LAVA, B.FIRE, B.SOUL_FIRE, B.CACTUS].includes(world.getVoxel(x + ax, h, z + az))))) continue;
        arrivals.push({ x: x + .5, y, z: z + .5, score: dx * dx + dz * dz + (y - mouth.y) ** 2 });
        break;
      }
    }
    arrivals.sort((a, b) => a.score - b.score || a.x - b.x || a.z - b.z);
    if (!arrivals.length) continue;
    const arrival = arrivals[0];
    return { x: arrival.x, y: arrival.y, z: arrival.z,
      yaw: Math.atan2(-(entrance.hub[0] - arrival.x), -(entrance.hub[2] - arrival.z)), pitch: -.18,
      entrance: mouth,
      say: `Teleported beside the nearest safe cave entrance at x ${mouth.x}, y ${mouth.y}, z ${mouth.z} (${Math.round(Math.hypot(mouth.x + .5 - origin.x, mouth.z + .5 - origin.z))} blocks away).` };
  }
  throw new Error(`No safe, dry cave entrance found within ${radius} blocks. Try /locate cave 1024 or /teleport cave 1024.`);
}
