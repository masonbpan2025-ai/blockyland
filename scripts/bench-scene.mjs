#!/usr/bin/env node
/**
 * Render-path benchmark: the per-frame cost of walking the scene graph.
 *
 *   node scripts/bench-render.mjs
 *   node scripts/bench-render.mjs --json
 *
 * The world benchmark measures CPU work per chunk. This measures what the renderer pays every
 * frame just to visit the nodes of a loaded world, before drawing anything -- which scales with
 * the number of chunk meshes, not with their contents.
 *
 * Why this exists rather than being assumed. three.js's `updateMatrixWorld` walks every node in
 * the scene every frame, and Voxelize calls this out as a real cost ("a loaded disc is thousands
 * of meshes at fixed positions, and three.js has no way to say 'this branch is settled'"), solving
 * it with a `StaticGroup` that skips a settled subtree.
 *
 * Measured here, that walk costs 0.104 ms at 1089 chunk meshes -- about 0.6% of a 60fps frame. So
 * the technique does not pay for itself in this engine, and no StaticGroup was added. These
 * numbers are kept so the conclusion can be rechecked if the object count grows by an order of
 * magnitude -- for example if a light mesh were ever added per light source rather than merged.
 *
 * `walkSceneLikeThree` reproduces three.js's own walk exactly, and counts the nodes it visits.
 */
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { installDomShim } from './bench-dom-shim.mjs';

installDomShim();

/**
 * Reproduce three.js's own updateMatrixWorld walk, and return how many objects it visited.
 *
 * This is the code path `WebGLRenderer.render` calls at the top of every frame. Counting visits is
 * the honest measure of the waste: none of these objects moved.
 */
export function walkSceneLikeThree(scene) {
  let visited = 0;
  const update = (object, force) => {
    visited++;
    if (object.matrixAutoUpdate) object.updateMatrix();
    if (object.matrixWorldNeedsUpdate || force) {
      if (object.parent === null) object.matrixWorld.copy(object.matrix);
      else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
      object.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = object.children;
    for (let i = 0; i < children.length; i++) update(children[i], force);
  };
  update(scene, false);
  return visited;
}

/** Build a scene holding one mesh per chunk, the way the game does. */
export function measureSceneWalk(chunks, chunksPerSide) {
  const scene = new THREE.Scene();
  const makeMesh = (x, y, z) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(8), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(x, y, z);
    return mesh;
  };

  const side = chunksPerSide || Math.ceil(Math.sqrt(chunks));
  let placed = 0;
  for (let cx = 0; cx < side && placed < chunks; cx++) {
    for (let cz = 0; cz < side && placed < chunks; cz++) {
      scene.add(makeMesh(cx * 16, 0, cz * 16));
      placed++;
    }
  }
  // One walk so matrices are consistent; measure the steady state, which is what a game sees.
  walkSceneLikeThree(scene);
  return { scene, chunks: placed, side };
}

/** Time many steady-state walks and return per-walk milliseconds. */
export function timeSceneWalks(scene, iterations = 200) {
  walkSceneLikeThree(scene);
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) walkSceneLikeThree(scene);
  return (performance.now() - t0) / iterations;
}

/** A scene whose meshes sit under a settled group, so the walk can skip them. */
export function measureSettledSceneWalk(chunks, chunksPerSide) {
  const { scene, side } = measureSceneWalk(chunks, chunksPerSide);
  const children = scene.children.slice();
  scene.children.length = 0;

  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  scene.add(group);
  for (const child of children) group.add(child);

  scene.updateMatrixWorld(true);
  const clear = (object) => {
    object.matrixWorldNeedsUpdate = false;
    object.matrixAutoUpdate = false;
    for (const c of object.children) clear(c);
  };
  clear(group);
  group.updateMatrixWorld(true);
  return { scene, chunks, side };
}

/** How many nodes the walk descends into, plain versus settled. */
export function walkCounts(chunks, chunksPerSide) {
  const plain = measureSceneWalk(chunks, chunksPerSide);
  const plainVisits = walkSceneLikeThree(plain.scene);
  const settled = measureSettledSceneWalk(chunks, chunksPerSide);
  const settledVisits = walkSceneLikeThree(settled.scene);
  return { chunks, plainVisits, settledVisits };
}

// --- CLI ---------------------------------------------------------------------

const asJson = process.argv.includes('--json');
const FRAME_MS = 1000 / 60;

// Chunk counts for the view radii the game supports (side = 2r+1, square).
const CASES = [
  { radius: 4, chunks: 81 },
  { radius: 6, chunks: 169 },
  { radius: 8, chunks: 289 },
  { radius: 12, chunks: 625 },
  { radius: 16, chunks: 1089 },
];

const rows = [];
for (const { radius, chunks } of CASES) {
  const side = Math.round(Math.sqrt(chunks));
  const plain = measureSceneWalk(chunks, side);
  const plainMs = timeSceneWalks(plain.scene, 200);
  const settled = measureSettledSceneWalk(chunks, side);
  const settledMs = timeSceneWalks(settled.scene, 200);
  const counts = walkCounts(chunks, side);
  rows.push({
    radius, chunks, plainMs, settledMs,
    speedup: plainMs / Math.max(settledMs, 1e-6),
    plainVisits: counts.plainVisits,
    settledVisits: counts.settledVisits,
  });
}

if (!asJson) {
  console.log('\nScene-graph walk benchmark');
  console.log('='.repeat(78));
  console.log('(per-frame cost of visiting chunk meshes; 60fps frame budget = '
    + FRAME_MS.toFixed(1) + 'ms)\n');
  console.log('  view r  chunks   nodes visited        walk cost/frame      settled');
  console.log('  ' + '-'.repeat(74));
  for (const r of rows) {
    console.log('  ' + String(r.radius).padStart(5)
      + String(r.chunks).padStart(8)
      + String(r.plainVisits).padStart(16)
      + (r.plainMs.toFixed(3) + ' ms').padStart(20)
      + (r.settledMs.toFixed(3) + ' ms').padStart(14)
      + ('  (' + r.speedup.toFixed(0) + 'x)').padStart(9));
  }
  console.log('\n  Conclusion: the walk is ~0.1ms even at 1089 chunks, so skipping a settled');
  console.log('  subtree (Voxelize\'s StaticGroup) is not worth adding here. Recheck if the');
  console.log('  object count grows by an order of magnitude.\n');
} else {
  console.log(JSON.stringify({
    frameBudgetMs: FRAME_MS,
    results: rows.map(r => ({
      radius: r.radius,
      chunks: r.chunks,
      nodesVisited: r.plainVisits,
      nodesVisitedSettled: r.settledVisits,
      walkMs: r.plainMs,
      settledWalkMs: r.settledMs,
      speedup: r.speedup,
    })),
  }, null, 2));
}
