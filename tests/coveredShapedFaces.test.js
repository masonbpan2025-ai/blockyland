// Shaped blocks (lava, snow layers, carpets, stairs...) drop the faces their neighbours cover completely (mesher.js,
// `dropCoveredFaces`). Lava lakes drew every face of every block -- 400,000 hidden triangles at render distance 8 --
// and snow layers drew their sides into each other and their bottoms into the ground. Nothing that can be seen may go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { ChunkMesher } from '../src/mesher.js';

const tm = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

/** Nine chunks with a stone floor at y=0, and `fill` placing blocks (world coordinates). */
function meshed(fill) {
  const w = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
    const c = new Chunk(cx, cz);
    w.chunks.set(cx + ',' + cz, c);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setVoxel(x, 0, z, BLOCKS.STONE);
  }
  w.invalidateChunkCache?.();
  fill(w);
  return new ChunkMesher(tm).meshChunk(w.getChunk(0, 0), w).lightGeo;
}
const triangles = (geo) => (geo ? geo.index.count / 3 : 0);
/** Triangles whose three corners are all at height y and face up or down. */
const flatAt = (geo, y) => {
  let n = 0;
  const p = geo.attributes.position;
  for (let t = 0; t < geo.index.count; t += 3) {
    if ([0, 1, 2].every((k) => Math.abs(p.getY(geo.index.getX(t + k)) - y) < 1e-4)) n++;
  }
  return n;
};

test('a lava block on its own keeps the faces that show; its bottom on stone goes', () => {
  const geo = meshed((w) => w.setVoxel(5, 1, 5, BLOCKS.LAVA));
  // Six faces, two triangles each, less the bottom pressed against the stone floor.
  assert.equal(triangles(geo), 10);
  assert.equal(flatAt(geo, 1), 0, 'no bottom face left at the floor');
});

test('a lava lake draws its outer surface only, not the faces between its blocks', () => {
  const lake = (w) => { for (let x = 3; x <= 7; x++) for (let z = 3; z <= 7; z++) for (let y = 1; y <= 2; y++) w.setVoxel(x, y, z, BLOCKS.LAVA); };
  const geo = meshed(lake);
  // A 5x5x2 lake in open air: the top is 25 faces; the sides are 4 x 5 x 2 = 40; the bottom is on stone.
  assert.equal(triangles(geo), (25 + 40) * 2, `${triangles(geo)} triangles`);
  // Before, every exposed block drew all six faces: 50 blocks x 12.
  assert.ok(triangles(geo) < 50 * 12 / 4);
});

test('lava under lava keeps no top face; lava under air keeps its lowered surface', () => {
  const geo = meshed((w) => { w.setVoxel(5, 1, 5, BLOCKS.LAVA); w.setVoxel(5, 2, 5, BLOCKS.LAVA); });
  // Lower block: four sides. Upper block: four sides and its top.
  assert.equal(triangles(geo), (4 + 5) * 2);
  assert.equal(flatAt(geo, 2), 0, 'the faces between the two are gone');
});

test('a field of snow layers draws its tops and outer edges, not the sides between layers', () => {
  const geo = meshed((w) => { for (let x = 2; x <= 5; x++) for (let z = 2; z <= 5; z++) w.setVoxel(x, 1, z, BLOCKS.SNOW_LAYER); });
  // 16 tops, 4 x 4 outer sides, no bottoms on the stone.
  assert.equal(triangles(geo), (16 + 16) * 2);
});

test('a block over open air keeps its bottom, and a stair on stone loses only its bottom', () => {
  const hanging = meshed((w) => w.setVoxel(5, 5, 5, BLOCKS.SNOW_LAYER));
  assert.equal(triangles(hanging), 12, 'nothing covers a snow layer floating in the air');
  const free = meshed((w) => w.setVoxel(5, 5, 5, BLOCKS.OAK_STAIRS));
  const grounded = meshed((w) => w.setVoxel(5, 1, 5, BLOCKS.OAK_STAIRS));
  assert.ok(triangles(free) > 0);
  assert.equal(triangles(free) - triangles(grounded), flatAt(free, 5), 'exactly the faces flat on the stone are dropped');
});

test('a partial neighbour hides nothing: a snow layer against a stair keeps its side', () => {
  const alone = meshed((w) => w.setVoxel(5, 1, 5, BLOCKS.SNOW_LAYER));
  const besideStair = meshed((w) => { w.setVoxel(5, 1, 5, BLOCKS.SNOW_LAYER); w.setVoxel(6, 1, 5, BLOCKS.OAK_STAIRS); });
  const stairOnly = meshed((w) => w.setVoxel(6, 1, 5, BLOCKS.OAK_STAIRS));
  assert.equal(triangles(besideStair), triangles(alone) + triangles(stairOnly));
});
