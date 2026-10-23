// The caches that keep per-frame and per-chunk work down must give exactly the answers the uncached code gave.
//
// Each one replaced a walk that ran far more often than its inputs changed: the spawner lists (every oriented block,
// 20 times a second), `structureIdAt` (289 chunks of plans, every spawn attempt), the mesher's shaped blocks (a new
// BoxGeometry per stair) and the double-sided mob skins (two program lookups per draw). A cache that misses a change
// is worse than no cache, so these tests change the inputs and check the answers follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, OrientationMap } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { BLOCKS } from '../src/blocks.js';
import { isSinglePassSafe, singlePassCutouts } from '../src/singlePassMaterials.js';

test('the spawner lists follow every change to the orientation map', () => {
  const world = new World(5, 'plains');
  assert.ok(world.structureOrientations instanceof OrientationMap, 'a new world counts its orientation changes');
  world.structureOrientations.clear();
  assert.deepEqual(world.spawners(), []);
  world.structureOrientations.set('1,2,3', { x: 1, y: 2, z: 3, id: BLOCKS.SPAWNER, spawner: 'zombie' });
  assert.deepEqual(world.spawners(), [{ x: 1, y: 2, z: 3, mob: 'zombie' }]);
  // Replacing an entry keeps the size the same; the list must still change.
  world.structureOrientations.set('1,2,3', { x: 1, y: 2, z: 3, id: BLOCKS.SPAWNER, spawner: 'skeleton' });
  assert.deepEqual(world.spawners(), [{ x: 1, y: 2, z: 3, mob: 'skeleton' }]);
  world.structureOrientations.set('4,5,6', { x: 4, y: 5, z: 6, id: BLOCKS.TRIAL_SPAWNER, trialSpawner: { mob: 'breeze' } });
  assert.deepEqual(world.trialSpawners(), [{ x: 4, y: 5, z: 6, mob: 'breeze', kind: 'normal' }]);
  world.structureOrientations.delete('1,2,3');
  assert.deepEqual(world.spawners(), []);
  // A caller that empties the list it was given must not empty the world's.
  world.trialSpawners().length = 0;
  assert.equal(world.trialSpawners().length, 1);
});

test('the spawner lists follow a dimension change, and a plain Map is still read', () => {
  const world = new World(5, 'plains');
  world.structureOrientations.set('0,9,0', { x: 0, y: 9, z: 0, id: BLOCKS.SPAWNER, spawner: 'spider' });
  assert.equal(world.spawners().length, 1);
  world.switchDimension('nether');
  assert.deepEqual(world.spawners(), [], 'the nether has its own orientations');
  world.switchDimension('overworld');
  assert.equal(world.spawners().length, 1);
  world.structureOrientations = new Map([['2,9,2', { x: 2, y: 9, z: 2, spawner: 'zombie' }]]);
  assert.deepEqual(world.spawners(), [{ x: 2, y: 9, z: 2, mob: 'zombie' }]);
});

test('structureIdAt answers as the full walk over the plans did', () => {
  const world = new World(2024, 'all');
  const { structures } = world;
  const sizes = 16;
  const radius = 8;
  // The uncached walk, exactly as structureIdAt used to do it.
  const walk = (x, y, z) => {
    const cx = Math.floor(x / sizes), cz = Math.floor(z / sizes);
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      for (const start of structures.plansAt(cx + dx, cz + dz)) for (const piece of start.pieces) {
        if (piece.box.contains(x, y, z)) return start.structureId;
      }
    }
    return null;
  };
  let found = 0;
  // Sample the boxes of real plans (so the test hits structures), plus points around them.
  const points = [];
  for (let cx = -20; cx <= 20; cx += 2) for (let cz = -20; cz <= 20; cz += 2) {
    for (const start of structures.plansAt(cx, cz)) for (const piece of start.pieces.slice(0, 3)) {
      const b = piece.box;
      points.push([b.minX, b.minY, b.minZ], [b.maxX, b.maxY, b.maxZ], [b.maxX + 1, b.minY, b.minZ], [(b.minX + b.maxX) >> 1, b.minY + 1, (b.minZ + b.maxZ) >> 1]);
    }
  }
  for (let i = 0; i < 400; i++) points.push([((i * 7919) % 640) - 320, 5 + (i % 50), ((i * 104729) % 640) - 320]);
  assert.ok(points.length > 400, 'the seed has structures to test against');
  for (const [x, y, z] of points) {
    const expected = walk(x, y, z);
    if (expected) found++;
    assert.equal(structures.structureIdAt(x, y, z), expected, `at ${x},${y},${z}`);
  }
  assert.ok(found > 0, 'some sampled points lie inside structures');
});

test('a shaped block built from the cache is the shape built directly, and an atlas change rebuilds it', () => {
  const tiles = { u0: 0, v0: 0, u1: 0.5, v1: 0.5 };
  const tm = { atlasVersion: 1, getFaceUVs: () => tiles };
  const mesher = new ChunkMesher(tm);
  mesher.checkShapeCache({ size: 1 });
  const state = { dir: 2, isTop: true, x: 10, y: 20, z: 30 };
  const first = mesher.shapedGeometry(BLOCKS.OAK_STAIRS, state);
  const second = mesher.shapedGeometry(BLOCKS.OAK_STAIRS, { ...state, x: -4 });
  assert.notEqual(first, second, 'each block gets its own copy to translate');
  assert.deepEqual([...first.attributes.position.array], [...second.attributes.position.array], 'position is not part of a shape');
  first.translate(5, 0, 0);
  const third = mesher.shapedGeometry(BLOCKS.OAK_STAIRS, state);
  assert.deepEqual([...third.attributes.position.array], [...second.attributes.position.array], 'translating a copy leaves the cached shape alone');
  const flipped = mesher.shapedGeometry(BLOCKS.OAK_STAIRS, { ...state, dir: 0 });
  assert.notDeepEqual([...flipped.attributes.position.array], [...second.attributes.position.array], 'a different facing is a different shape');

  // A resource pack moves the tile: the next mesh must pick up the new UVs, not the cached ones.
  const before = [...third.attributes.uv.array];
  tiles.u0 = 0.25; tiles.u1 = 0.75; tm.atlasVersion++;
  mesher.checkShapeCache({ size: 1 });
  const after = [...mesher.shapedGeometry(BLOCKS.OAK_STAIRS, state).attributes.uv.array];
  assert.notDeepEqual(after, before);
});

test('only alpha-tested, fully opaque double-sided materials are drawn in one pass', () => {
  const cutout = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const glassy = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const fading = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5, opacity: 0.5, side: THREE.DoubleSide });
  const front = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5 });
  assert.equal(isSinglePassSafe(cutout), true);
  assert.equal(isSinglePassSafe(glassy), false, 'translucent: the back-then-front order matters');
  assert.equal(isSinglePassSafe(fading), false, 'a fading mob blends');
  assert.equal(isSinglePassSafe(front), false, 'single-sided is already one pass');
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  for (const material of [cutout, glassy, fading, front]) group.add(new THREE.Mesh(geometry, material));
  group.add(new THREE.Mesh(geometry, [cutout, glassy]));
  assert.equal(singlePassCutouts(group), 1);
  assert.equal(cutout.forceSinglePass, true);
  assert.equal(glassy.forceSinglePass, false);
  assert.equal(fading.forceSinglePass, false);
});
