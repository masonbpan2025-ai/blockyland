// Structures must sit ON the ground and own their space: no village half-buried in a hillside or planned under a
// river, and no tree, leaves or flowers left standing inside a house.
//
// The regression this guards: a village was laid out at ONE height (the surface at its origin, ignoring water), so on
// hilly ground houses filled with dirt and stone and a village whose origin fell in a river was built under it; and
// trees were planted before structures were written, so canopies stood inside houses. The in-world test measures
// exactly what a player sees -- the foreign blocks inside each piece above its floor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { isVegetation } from '../src/worldStructures.js';
import { generateVillage } from '../src/worldgen/generators/village.js';

const nameOf = (id) => BLOCK_DEFS[id]?.name ?? String(id);
const TERRAIN = /^(Grass Block|Dirt|Stone|Sand|Snow Block|Gravel|Coarse Dirt|.* Ore)$/;

/** The piece's floor at a column: a street's own ground, a pyramid's ground floor, else the box bottom. */
function floorAt(piece, x, z) {
  const b = piece.box;
  if (piece.meta?.columnOffsets) return piece.meta.baseY + (piece.meta.columnOffsets[(z - b.minZ) * (b.maxX - b.minX + 1) + (x - b.minX)] ?? 0);
  return piece.meta?.groundY ?? b.minY;
}

function intrusions(world, start, pieces = start.pieces) {
  const box = start.box;
  for (let cx = Math.floor(box.minX / CHUNK_SIZE_X); cx <= Math.floor(box.maxX / CHUNK_SIZE_X); cx++) {
    for (let cz = Math.floor(box.minZ / CHUNK_SIZE_Z); cz <= Math.floor(box.maxZ / CHUNK_SIZE_Z); cz++) world.getOrCreateChunk(cx, cz);
  }
  const own = new Set();
  world.structures.engine.realizeWithReport(start, (x, y, z) => { own.add(`${x},${y},${z}`); return true; }, { adapt: false });
  const found = { vegetation: [], terrain: [] };
  for (const piece of pieces) {
    const b = piece.box;
    for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) {
      for (let y = floorAt(piece, x, z) + 1; y <= b.maxY; y++) {
        if (own.has(`${x},${y},${z}`)) continue;
        const id = world.getVoxel(x, y, z);
        if (id === BLOCKS.AIR || id === undefined) continue;
        if (isVegetation(id)) found.vegetation.push(`${nameOf(id)} at ${x},${y},${z}`);
        else if (TERRAIN.test(nameOf(id))) found.terrain.push(`${nameOf(id)} at ${x},${y},${z}`);
      }
    }
  }
  return found;
}

test('a generated village has no trees, flowers or terrain inside its pieces', () => {
  // Seed 12345's nearest plains village sits in wooded, hilly ground beside a river: before the fix it held 378 tree
  // blocks and over 3000 terrain blocks inside its pieces, and its origin was planned under the water.
  const world = new World(12345);
  const found = world.structures.engine.locate('village_plains', 0, 0, { maxRadiusChunks: 96 });
  assert.ok(found, 'the seed must have a village to test');
  const result = intrusions(world, found.start);
  assert.deepEqual(result.vegetation.slice(0, 5), [], `${result.vegetation.length} vegetation blocks inside the village`);
  assert.deepEqual(result.terrain.slice(0, 5), [], `${result.terrain.length} terrain blocks inside the village`);
  assert.ok(found.start.pieces.every((piece) => piece.box.minY >= world.seaLevel), 'no village piece may be planned under water');
});

test('an igloo on a slope is bedded in rather than half-buried', () => {
  const world = new World(12345);
  const found = world.structures.engine.locate('igloo', 0, 0, { maxRadiusChunks: 96 });
  assert.ok(found, 'the seed must have an igloo to test');
  // Only the dome: the basement is underground by design.
  const result = intrusions(world, found.start, found.start.pieces.slice(0, 1));
  assert.deepEqual(result.vegetation.slice(0, 5), []);
  assert.deepEqual(result.terrain.slice(0, 5), [], `${result.terrain.length} terrain blocks inside the igloo dome`);
});

test('village pieces take their height from the ground where they join, and streets follow it per column', () => {
  // A slope rising one block every four along x, with a sea at 20 that floods the low end.
  const surfaceY = (x) => 10 + Math.floor(x / 4);
  const start = generateVillage({
    seed: 7n, chunkX: 2, chunkZ: 0, structureId: 'village_plains',
    context: { surfaceY, seaLevel: 20, biomeAt: () => 'plains' }
  });
  const ground = (x) => Math.max(surfaceY(x), 20);
  assert.ok(start.pieces.length > 3, 'the village must grow past its meeting point');
  for (const piece of start.pieces) {
    if (piece.meta.columnOffsets) {
      // Every street column sits on its own ground.
      const b = piece.box;
      for (let x = b.minX; x <= b.maxX; x++) assert.equal(floorAt(piece, x, b.minZ), ground(x), `street column at x ${x}`);
    } else if (piece.meta.junction) {
      assert.equal(piece.box.minY, ground(piece.meta.junction.x), `${piece.meta.element} must sit on the ground at its junction`);
    }
  }
});
