import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { occludesWholeFace } from '../src/blockOcclusion.js';
import { ResourceInspectionWorld, INSPECTION_VIEWS } from '../src/resourceBehaviorShowcase.js';

// Count triangles on the actual target cell, rather than counting the carpet
// or a floor drawn behind it. Full neighbours should cull; thin ones must not.
function targetTriangles(session, direction) {
  const meshes = session.mesh();
  let count = 0;
  for (const key of ['opaqueGeo', 'lightGeo']) {
    const geo = meshes[key];
    if (!geo) continue;
    const p = geo.attributes.position, n = geo.attributes.normal, indices = geo.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      let target = true;
      for (let j = 0; j < 3; j++) {
        const v = indices[i + j];
        const xyz = [p.getX(v), p.getY(v), p.getZ(v)];
        if ([n.getX(v), n.getY(v), n.getZ(v)].some((value, a) => value !== direction[a])) target = false;
        if (xyz.some((value, a) => value < [8, 2, 8][a] || value > [9, 3, 9][a])) target = false;
        const axis = direction.findIndex(value => value !== 0);
        if (xyz[axis] !== [8.5, 2.5, 8.5][axis] + direction[axis] / 2) target = false;
      }
      if (target) count++;
    }
  }
  for (const key of ['opaqueGeo', 'lightGeo', 'transparentGeo', 'waterGeo']) meshes[key]?.dispose();
  return count;
}

test('all sixteen opaque-textured carpets leave all six furnace faces intact', () => {
  const carpets = Object.entries(BLOCK_DEFS).filter(([, def]) => def.carpet && !def.snowLayer);
  assert.ok(carpets.length >= 16);
  for (const [carpetId] of carpets) {
    const session = new ResourceInspectionWorld(BLOCKS.FURNACE);
    session.chunk.voxels.fill(0);
    session.world.setVoxel(8, 2, 8, BLOCKS.FURNACE);
    for (const { direction } of INSPECTION_VIEWS) session.world.setVoxel(8 + direction[0], 2 + direction[1], 8 + direction[2], Number(carpetId));
    for (const { id, direction } of INSPECTION_VIEWS) assert.equal(targetTriangles(session, direction), 2, `carpet ${carpetId}, ${id}`);
    session.dispose();
  }
});

test('partial models cannot hide an entire side, bottom, or water boundary', () => {
  const partial = Object.entries(BLOCK_DEFS).filter(([, def]) => def.slab || def.stair || def.chest || def.fence || def.door || def.carpet);
  for (const [id, def] of partial) assert.equal(occludesWholeFace(def), false, `${id}: ${def.name}`);
  for (const flag of ['pane', 'trapdoor', 'wall', 'bed', 'flowerPot', 'rail', 'pressurePlate']) assert.equal(occludesWholeFace({ [flag]: true }), false);
});

test('solid full cubes still cull the touching face', () => {
  for (const { id, direction } of INSPECTION_VIEWS) {
    const session = new ResourceInspectionWorld(BLOCKS.FURNACE);
    session.chunk.voxels.fill(0);
    session.world.setVoxel(8, 2, 8, BLOCKS.FURNACE);
    session.world.setVoxel(8 + direction[0], 2 + direction[1], 8 + direction[2], BLOCKS.STONE);
    assert.equal(targetTriangles(session, direction), 0, id);
    session.dispose();
  }
  assert.equal(occludesWholeFace(BLOCK_DEFS[BLOCKS.STONE]), true);
  assert.equal(occludesWholeFace(BLOCK_DEFS[BLOCKS.GLASS]), false);
});

test('unlit and lit furnace shells block sight of stones through every face', () => {
  for (const furnace of [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE]) {
    const session = new ResourceInspectionWorld(furnace);
    for (const { id, direction } of INSPECTION_VIEWS) assert.equal(session.inspectFace(direction), true, `${furnace} ${id}`);
    session.dispose();
  }
});

test('lit furnaces remain rendered when enclosed by thin opaque carpet', () => {
  const session = new ResourceInspectionWorld(BLOCKS.LIT_FURNACE);
  session.chunk.voxels.fill(0);
  session.world.setVoxel(8, 2, 8, BLOCKS.LIT_FURNACE);
  for (const { direction } of INSPECTION_VIEWS) session.world.setVoxel(8 + direction[0], 2 + direction[1], 8 + direction[2], BLOCKS.RED_CARPET);
  const mesh = session.mesh();
  assert.ok(mesh.lightGeo.userData.sources.some(light => light.level === 13));
  for (const key of ['opaqueGeo', 'lightGeo', 'transparentGeo', 'waterGeo']) mesh[key]?.dispose();
  session.dispose();
});
