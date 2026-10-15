// Probe: how much foreign terrain and vegetation ends up INSIDE generated surface structures.
//
// For each located structure it generates the chunks it covers, re-realizes the plan into a recorder to learn
// which voxels the structure itself owns, then walks every piece box and classifies whatever else is there:
// tree blocks (logs, leaves, plants) and terrain left standing above a piece's floor.
//
//   node scripts/probe-structure-intrusions.mjs [seed ...]
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!seeds.length) seeds.push(12345, 777, 20250401, 4242);
const ids = ['village_plains', 'igloo', 'desert_pyramid'];

const nameOf = (id) => BLOCK_DEFS[id]?.name ?? String(id);
const isTree = (id) => /log|leaves|wood|sapling|mushroom_block|vine|bamboo/i.test(nameOf(id));
const isPlant = (id) => /flower|poppy|dandelion|grass$|short_grass|tall_grass|fern|bush|sunflower|petals|lily|cactus|snow_layer|^snow$/i.test(nameOf(id));
const isTerrain = (id) => /^(grass_block|grass|dirt|coarse_dirt|stone|sand|sandstone|snow_block|gravel|podzol|clay|.*_ore|deepslate|andesite|diorite|granite|terracotta|.*_terracotta|mud)$/i
  .test(nameOf(id).toLowerCase().replace(/ /g, '_'));

let grand = { tree: 0, plant: 0, terrain: 0, structures: 0 };
for (const seed of seeds) {
  const world = new World(seed);
  const s = world.structures;
  for (const id of ids) {
    if (!s.enabledIds.includes(id)) continue;
    let found;
    try { found = s.engine.locate(id, 0, 0, { maxRadiusChunks: 96 }); } catch { found = null; }
    if (!found) continue;
    const start = found.start;
    const box = start.box;
    for (let cx = Math.floor(box.minX / CHUNK_SIZE_X); cx <= Math.floor(box.maxX / CHUNK_SIZE_X); cx++)
      for (let cz = Math.floor(box.minZ / CHUNK_SIZE_Z); cz <= Math.floor(box.maxZ / CHUNK_SIZE_Z); cz++) world.getOrCreateChunk(cx, cz);
    const own = new Set();
    s.engine.realizeWithReport(start, (x, y, z) => { own.add(`${x},${y},${z}`); return true; }, { adapt: false });
    const counts = { tree: 0, plant: 0, terrain: 0 };
    const examples = new Map();
    const seen = new Set();
    for (const piece of start.pieces) {
      const b = piece.box;
      const width = b.maxX - b.minX + 1;
      // The piece's real floor: a street's own column ground, a pyramid's ground floor, else the box bottom.
      const floorAt = (x, z) => piece.meta?.columnOffsets
        ? piece.meta.baseY + (piece.meta.columnOffsets[(z - b.minZ) * width + (x - b.minX)] ?? 0)
        : (piece.meta?.groundY ?? b.minY);
      for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) for (let y = floorAt(x, z) + 1; y <= b.maxY; y++) {
        const k = `${x},${y},${z}`;
        if (own.has(k) || seen.has(k)) continue;
        seen.add(k);
        const v = world.getVoxel(x, y, z);
        if (v === BLOCKS.AIR || v === undefined) continue;
        const kind = isTree(v) ? 'tree' : isPlant(v) ? 'plant' : isTerrain(v) ? 'terrain' : null;
        if (!kind) continue;
        counts[kind]++;
        examples.set(nameOf(v), (examples.get(nameOf(v)) || 0) + 1);
      }
    }
    grand.structures++;
    for (const k of Object.keys(counts)) grand[k] += counts[k];
    console.log(`seed ${seed} ${start.structureId} @${box.minX},${box.minY},${box.minZ} pieces=${start.pieces.length}`,
      counts, [...examples].slice(0, 6).map(([n, c]) => `${n}x${c}`).join(' '));
  }
}
console.log('TOTAL', grand);
