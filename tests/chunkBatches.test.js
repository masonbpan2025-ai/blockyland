// Chunk meshes drawn a region at a time (chunkBatches.js). About 600 separate chunk draws were the largest CPU cost
// of a frame; one BatchedMesh per region and material draws the same faces, still culled chunk by chunk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ChunkBatches, REGION } from '../src/chunkBatches.js';

/** A chunk mesh as the mesher builds one: world-space quads with the game's attributes, indexed. */
function chunkMesh(cx, cz, quads = 4, material = new THREE.MeshLambertMaterial(), { y = 0, groups = null } = {}) {
  const pos = [], nrm = [], col = [], idx = [];
  for (let q = 0; q < quads; q++) {
    const x = cx * 16 + (q % 16), z = cz * 16 + Math.floor(q / 16), v = pos.length / 3;
    pos.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1);
    for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(q / quads, 0.5, 1); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  for (const [start, count, materialIndex] of groups ?? []) geometry.addGroup(start, count, materialIndex);
  return new THREE.Mesh(geometry, material);
}

const batchesIn = (scene) => scene.children.filter((o) => o.isBatchedMesh);

/** The faces a batch draws for one of its geometries, as world-space triangles. */
function trianglesAt(batch, geometryId) {
  const range = batch.getGeometryRangeAt(geometryId), index = batch.geometry.index, position = batch.geometry.attributes.position;
  const out = [];
  for (let i = range.start; i < range.start + range.count; i++) {
    const v = index.getX(i);
    out.push([position.getX(v), position.getY(v), position.getZ(v)].join(','));
  }
  return out;
}

function triangles(geometry, start = 0, count = geometry.index.count) {
  const out = [], position = geometry.attributes.position;
  for (let i = start; i < start + count; i++) {
    const v = geometry.index.getX(i);
    out.push([position.getX(v), position.getY(v), position.getZ(v)].join(','));
  }
  return out;
}

test('the chunks of a region share one batch, which draws exactly their faces', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene), material = new THREE.MeshLambertMaterial();
  const meshes = [[0, 0], [1, 0], [REGION - 1, REGION - 1]].map(([cx, cz]) => chunkMesh(cx, cz, 5 + cx, material));
  const expected = meshes.map((m) => triangles(m.geometry));
  meshes.forEach((m, i) => assert.equal(batches.add([0, 1, REGION - 1][i], [0, 0, REGION - 1][i], m), true));
  const [batch] = batchesIn(scene);
  assert.equal(batchesIn(scene).length, 1);
  assert.equal(batch.instanceCount, 3);
  assert.equal(batch.material, material);
  expected.forEach((faces, id) => assert.deepEqual(trianglesAt(batch, id), faces, `chunk ${id}`));
  // The chunk's own mesh is a handle now: no vertices, the bounds kept, never in the scene.
  for (const m of meshes) {
    assert.equal(m.geometry.attributes.position, undefined);
    assert.ok(m.geometry.boundingSphere.radius > 0);
    assert.equal(m.parent, null);
  }
});

test('disposing a chunk mesh, as every path that drops one does, takes the chunk out; an empty batch leaves the scene', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene), material = new THREE.MeshLambertMaterial();
  const a = chunkMesh(0, 0, 4, material), b = chunkMesh(1, 0, 4, material);
  batches.add(0, 0, a); batches.add(1, 0, b);
  const [batch] = batchesIn(scene);
  a.geometry.dispose();
  assert.equal(batch.instanceCount, 1);
  b.geometry.dispose();
  assert.equal(batchesIn(scene).length, 0);
  assert.equal(batches.regions.size, 0);
  // Clearing first (world teardown) and disposing the handles after is safe too.
  const c = chunkMesh(0, 0, 4, material);
  batches.add(0, 0, c);
  batches.clear();
  assert.doesNotThrow(() => c.geometry.dispose());
});

test('regions, materials and vertex layouts each get their own batch', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene), stone = new THREE.MeshLambertMaterial(), glow = new THREE.MeshLambertMaterial();
  batches.add(0, 0, chunkMesh(0, 0, 4, stone));
  batches.add(REGION, 0, chunkMesh(REGION, 0, 4, stone));
  batches.add(-1, 0, chunkMesh(-1, 0, 4, stone));
  batches.add(0, 0, chunkMesh(0, 0, 4, glow));
  const odd = chunkMesh(1, 1, 4, stone);
  odd.geometry.setAttribute('wind', new THREE.Float32BufferAttribute(new Float32Array(odd.geometry.attributes.position.count), 1));
  batches.add(1, 1, odd);
  assert.equal(batchesIn(scene).length, 5);
});

test('a see-through chunk mesh splits into its blended and its cutout faces, each with its own material', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene);
  const blended = new THREE.MeshLambertMaterial({ transparent: true }), cutout = new THREE.MeshLambertMaterial({ alphaTest: 0.5 });
  const mesh = chunkMesh(0, 0, 6, [blended, cutout], { groups: [[0, 12, 0], [12, 24, 1]] });
  const glass = triangles(mesh.geometry, 0, 12), leaves = triangles(mesh.geometry, 12, 24);
  batches.add(0, 0, mesh);
  const byMaterial = new Map(batchesIn(scene).map((b) => [b.material, b]));
  assert.equal(byMaterial.size, 2);
  assert.deepEqual(trianglesAt(byMaterial.get(blended), 0), glass);
  assert.deepEqual(trianglesAt(byMaterial.get(cutout), 0), leaves);
  assert.equal(byMaterial.get(cutout).geometry.attributes.position.count >= 16, true);
});

test('what the separate mesh carried for drawing is carried by its batch', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene);
  const mesh = chunkMesh(0, 0, 4);
  mesh.layers.enable(1); mesh.renderOrder = 1; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial();
  batches.add(0, 0, mesh);
  const [batch] = batchesIn(scene);
  assert.equal(batch.layers.mask, mesh.layers.mask);
  assert.equal(batch.renderOrder, 1);
  assert.equal(batch.castShadow, true);
  assert.equal(batch.receiveShadow, true);
  assert.equal(batch.customDistanceMaterial, mesh.customDistanceMaterial);
  assert.equal(batch.perObjectFrustumCulled, true, 'still culled chunk by chunk');
});

test('a chunk meshed again reuses its place, and the buffers grow only when the region outgrows them', () => {
  const scene = new THREE.Scene(), batches = new ChunkBatches(scene), material = new THREE.MeshLambertMaterial();
  // A neighbour keeps the region's batch while the chunk is between meshes (an empty batch is dropped).
  batches.add(1, 1, chunkMesh(1, 1, 4, material));
  let mesh = chunkMesh(0, 0, 40, material);
  batches.add(0, 0, mesh);
  const [batch] = batchesIn(scene);
  for (let i = 0; i < 20; i++) {
    mesh.geometry.dispose();
    mesh = chunkMesh(0, 0, 38 + (i % 3), material);
    batches.add(0, 0, mesh);
  }
  assert.equal(batchesIn(scene)[0], batch, 'the same batch');
  assert.equal(batches.stats.grown, 0);
  // Much bigger chunks: the region's buffers grow, and every chunk is still drawn intact.
  const big = [];
  for (let cx = 1; cx < REGION; cx++) { const m = chunkMesh(cx, 0, 1024, material); big.push([triangles(m.geometry), batches.add(cx, 0, m)]); }
  assert.ok(batches.stats.grown > 0);
  const now = batchesIn(scene)[0];
  const ids = [...Array(now._geometryInfo.length).keys()].filter((id) => now._geometryInfo[id].active);
  for (const [faces] of big) assert.ok(ids.some((id) => trianglesAt(now, id).join() === faces.join()), 'a big chunk is drawn intact');
});

test('the game draws its chunk meshes through the batches, except in an authored campaign', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const apply = main.slice(main.indexOf('  applyChunkGeometry(chunk, geometry) {'), main.indexOf('  applyWorldSettings('));
  for (const kind of ['lightMesh', 'opaqueMesh', 'waterMesh', 'transparentMesh']) assert.match(apply, new RegExp(`this\\.drawChunkMesh\\(chunk, chunk\\.${kind}\\)`));
  assert.doesNotMatch(apply, /this\.scene\.add\(chunk\./);
  // The campaign presentation recolours the chunk meshes' own geometry, so those are drawn on their own.
  assert.match(apply, /drawChunkMesh\(chunk, mesh\) \{\n    if \(this\.world\.generationMode === 'authored' \|\| !this\.chunkBatches\?\.add\(chunk\.cx, chunk\.cz, mesh\)\) this\.scene\.add\(mesh\);/);
});
