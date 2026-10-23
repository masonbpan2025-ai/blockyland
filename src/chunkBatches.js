import * as THREE from 'three';

// Chunk meshes drawn in batches: one draw for many chunks.
//
// Every chunk had up to five meshes of its own (opaque, light-emitting, see-through, cutout and water), so a render
// distance of 8 put about 600 chunk draws in each frame, and the CPU cost of a draw in three.js -- walking the object,
// testing it against the view, binding its program and buffers -- was the largest single cost of the frame on a
// laptop. Here the chunks of a region (REGION x REGION chunks) that share a material and a vertex layout are one
// THREE.BatchedMesh: still culled chunk by chunk and sorted by distance, but drawn with one multi-draw call.
//
// The game keeps its chunk meshes (chunk.opaqueMesh and the rest) as handles: their geometry is copied into the batch
// and replaced by an empty one that keeps the bounds, and disposing that geometry -- which is what every path that
// drops a chunk mesh already does -- takes the chunk out of its batch. So the streamer, teardown and dimension
// switches need no change.

/** Chunks along a region's side. A region is the unit whose buffers are re-sent to the GPU when they must grow. */
export const REGION = 8;

/** Room left behind a chunk's geometry, so that a re-mesh that grows a little fits in the same place. */
const SLACK = 1.25;
const SLACK_MIN = 256;

/** One region's chunks for one material and vertex layout. */
class RegionBatch {
  constructor(owner, key, template) {
    this.owner = owner;
    this.key = key;
    this.template = template;
    this.mesh = null;
    /** Slots holding no chunk, kept for the next chunk that fits: geometryId -> {vertices, indices}. */
    this.free = new Map();
    this.live = 0;
  }

  /** Copy a part's geometry in and draw it. Returns {geometryId, instanceId}. */
  place(geometry) {
    const vertices = geometry.attributes.position.count, indices = geometry.index.count;
    if (!this.mesh) this.create(vertices, indices);
    const mesh = this.mesh;
    let geometryId = -1;
    // The smallest free slot it fits in: a chunk meshed again usually comes back about the same size.
    let best = null;
    for (const [id, slot] of this.free) {
      if (slot.vertices >= vertices && slot.indices >= indices && (!best || slot.vertices < best[1].vertices)) best = [id, slot];
    }
    if (best) {
      geometryId = best[0];
      this.free.delete(geometryId);
      mesh.setGeometryAt(geometryId, geometry);
    } else {
      const reserveV = Math.ceil(vertices * SLACK) + SLACK_MIN, reserveI = Math.ceil(indices * SLACK) + SLACK_MIN * 2;
      this.makeRoom(reserveV, reserveI);
      geometryId = this.mesh.addGeometry(geometry, reserveV, reserveI);
    }
    if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
    const instanceId = this.mesh.addInstance(geometryId);
    this.live++;
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
    return { geometryId, instanceId };
  }

  /** Stop drawing a part; its space waits for the next one. */
  release({ geometryId, instanceId }) {
    const mesh = this.mesh;
    if (!mesh) return; // the batches were cleared first (world teardown)
    mesh.deleteInstance(instanceId);
    const range = mesh.getGeometryRangeAt(geometryId);
    this.free.set(geometryId, { vertices: range.reservedVertexCount, indices: range.reservedIndexCount });
    this.live--;
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
    if (this.live === 0) this.dispose();
  }

  create(vertices, indices) {
    const t = this.template;
    // Room for half a region of chunks this size to begin with: growing re-sends the whole region to the GPU.
    const chunks = this.owner.regionSize ** 2 / 2;
    const maxV = Math.max(16384, Math.ceil(vertices * SLACK + SLACK_MIN) * chunks);
    const maxI = Math.max(32768, Math.ceil(indices * SLACK + SLACK_MIN * 2) * chunks);
    const mesh = new THREE.BatchedMesh(this.owner.regionSize ** 2, maxV, maxI, t.material);
    mesh.name = 'chunk batch';
    mesh.layers.mask = t.layers;
    mesh.renderOrder = t.renderOrder;
    mesh.castShadow = t.castShadow;
    mesh.receiveShadow = t.receiveShadow;
    if (t.customDistanceMaterial) mesh.customDistanceMaterial = t.customDistanceMaterial;
    if (t.customDepthMaterial) mesh.customDepthMaterial = t.customDepthMaterial;
    // Nearest first for solid blocks (fewer hidden pixels shaded), farthest first for blended ones, as BatchedMesh
    // sorts by its material's `transparent`.
    mesh.sortObjects = true;
    mesh.perObjectFrustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.userData.chunkBatch = this.key;
    this.mesh = mesh;
    this.owner.scene.add(mesh);
  }

  /** Make room at the end of the buffers: drop the free slots and pack, then grow if that is not enough. */
  makeRoom(vertices, indices) {
    const mesh = this.mesh;
    if (mesh.unusedVertexCount >= vertices && mesh.unusedIndexCount >= indices) return;
    if (this.free.size) {
      for (const id of this.free.keys()) mesh.deleteGeometry(id);
      this.free.clear();
      mesh.optimize();
      if (mesh.unusedVertexCount >= vertices && mesh.unusedIndexCount >= indices) return;
    }
    // BatchedMesh keeps its buffer sizes private; growing needs them.
    const maxV = mesh._maxVertexCount, maxI = mesh._maxIndexCount;
    const usedV = maxV - mesh.unusedVertexCount, usedI = maxI - mesh.unusedIndexCount;
    mesh.setGeometrySize(Math.max(maxV * 2, usedV + vertices * 2), Math.max(maxI * 2, usedI + indices * 2));
    this.owner.stats.grown++;
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh = null;
    this.free.clear();
    this.owner.regions.delete(this.key);
  }
}

export class ChunkBatches {
  constructor(scene, { regionSize = REGION } = {}) {
    this.scene = scene;
    this.regionSize = regionSize;
    /** Region batches by region, material and vertex layout. */
    this.regions = new Map();
    this.stats = { grown: 0 };
  }

  /**
   * Draw a chunk mesh through its region's batches instead of on its own. The mesh must not be in the scene. Returns
   * false (and changes nothing) for a mesh a batch cannot hold; the caller adds that one to the scene as before.
   */
  add(cx, cz, mesh) {
    const geometry = mesh.geometry;
    if (!geometry?.index || !geometry.attributes.position) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : null;
    // A see-through chunk mesh carries its blended and its cutout faces as two groups with a material each: two parts.
    const ranges = materials
      ? geometry.groups.map((g) => ({ start: g.start, count: Math.min(g.count, geometry.index.count - g.start), material: materials[g.materialIndex] }))
      : [{ start: 0, count: geometry.index.count, material: mesh.material }];
    const rx = Math.floor(cx / this.regionSize), rz = Math.floor(cz / this.regionSize);
    const layout = Object.keys(geometry.attributes).sort().map((k) => `${k}${geometry.attributes[k].itemSize}`).join(',');
    const placed = [];
    const bounds = new THREE.Sphere();
    let first = true;
    for (const range of ranges) {
      if (!range.material || range.count <= 0) continue;
      const part = partGeometry(geometry, range.start, range.count);
      part.computeBoundingSphere();
      if (first) bounds.copy(part.boundingSphere); else bounds.union(part.boundingSphere);
      first = false;
      const key = `${rx},${rz}|${range.material.uuid}|${mesh.layers.mask}|${mesh.renderOrder}|${+mesh.castShadow}${+mesh.receiveShadow}|${mesh.customDistanceMaterial?.uuid ?? ''}|${layout}`;
      let region = this.regions.get(key);
      if (!region) {
        region = new RegionBatch(this, key, {
          material: range.material, layers: mesh.layers.mask, renderOrder: mesh.renderOrder, castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow, customDistanceMaterial: mesh.customDistanceMaterial, customDepthMaterial: mesh.customDepthMaterial,
        });
        this.regions.set(key, region);
      }
      placed.push([region, region.place(part)]);
    }
    // The handle keeps the bounds (the water pass asks whether any water is in view), the user data, and a dispose
    // that takes the chunk out of its batches. The copied-from arrays are let go.
    const handle = new THREE.BufferGeometry();
    handle.boundingSphere = first ? new THREE.Sphere() : bounds;
    handle.userData = geometry.userData;
    handle.userData.batched = true;
    handle.addEventListener('dispose', () => { for (const [region, slot] of placed) region.release(slot); placed.length = 0; });
    geometry.dispose();
    mesh.geometry = handle;
    return true;
  }

  /** Draw calls the batches can make in one render, at most: what the separate meshes were. */
  get batchCount() { return this.regions.size; }

  /** Drop every batch (the world is going away; the handles' dispose finds nothing left to release). */
  clear() {
    for (const region of [...this.regions.values()]) region.dispose();
    this.regions.clear();
  }
}

/**
 * The faces of [start, start+count) of an indexed geometry as their own geometry, holding only the vertices those
 * faces use (the mesher writes each group's vertices together, so this is a slice, not a copy of them all).
 */
function partGeometry(geometry, start, count) {
  const index = geometry.index.array;
  let lo = Infinity, hi = -1;
  for (let i = start; i < start + count; i++) { const v = index[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const part = new THREE.BufferGeometry();
  if (lo === 0 && hi === geometry.attributes.position.count - 1 && start === 0 && count === geometry.index.count) {
    for (const name in geometry.attributes) part.setAttribute(name, geometry.attributes[name]);
    part.setIndex(geometry.index);
    return part;
  }
  for (const name in geometry.attributes) {
    const a = geometry.attributes[name];
    part.setAttribute(name, new THREE.BufferAttribute(a.array.subarray(lo * a.itemSize, (hi + 1) * a.itemSize), a.itemSize, a.normalized));
  }
  const local = new Uint32Array(count);
  for (let i = 0; i < count; i++) local[i] = index[start + i] - lo;
  part.setIndex(new THREE.BufferAttribute(local, 1));
  return part;
}
