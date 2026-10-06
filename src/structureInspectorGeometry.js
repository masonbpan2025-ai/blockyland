// Geometry and material for the Inspector's voxel preview.
//
// WHY THIS IS ITS OWN MODULE: per-instance colour in an `InstancedMesh` has a trap that a WebGL context is
// needed to see, and this environment has no headless browser. The trap is entirely in three's shader chunks,
// which ARE readable here, so the setup is kept in one DOM-free function that a Node test can build and check.
//
// THE TRAP, read out of this build's shader chunks:
//
//   vertex stage:
//     #if defined( USE_COLOR ) || ... || defined( USE_INSTANCING_COLOR ) || ...
//       vColor = vec4( 1.0 );
//     #endif
//     #elif defined( USE_COLOR )
//       vColor.rgb *= color;              // the GEOMETRY's `color` attribute
//     #endif
//     #ifdef USE_INSTANCING_COLOR
//       vColor.rgb *= instanceColor.rgb;
//     #endif
//
//   fragment stage:
//     #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
//       diffuseColor *= vColor;           // applied ONLY under USE_COLOR
//     #endif
//
// `USE_COLOR` is defined by `material.vertexColors`; `USE_INSTANCING_COLOR` is defined by the mere presence of
// `instanceColor` (three: `instancingColor: IS_INSTANCEDMESH && object.instanceColor !== null`). So there are
// exactly two wrong ways to set this up, and the preview hit the first:
//
//   * `vertexColors: true` with a geometry that has no `color` attribute -- what a BoxGeometry is. The shader
//     reads a DISABLED attribute, whose default is (0,0,0), so `vColor` becomes black and the fragment
//     multiplies every block to black. This is what made a village draw as a black blob.
//   * `vertexColors: false` with instance colours -- correct-looking, but the fragment then IGNORES `vColor`,
//     so every block would render in the material's base colour and the palette would do nothing at all.
//
// The setup that works needs BOTH: white vertex colours on the geometry and per-instance colours. Then
// `vColor = white * instanceColor`, and the fragment applies it.

export const VOXEL_COLOUR_ATTRIBUTE = 'color';

/**
 * A unit cube carrying WHITE vertex colours, so the fragment stage will apply `vColor`.
 *
 * @param {object} THREE the three namespace, injected so this module stays free of a loader dependency
 */
export function createVoxelGeometry(THREE) {
  if (!THREE || !THREE.BoxGeometry) throw new Error('createVoxelGeometry needs the three namespace');
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  const white = new Float32Array(count * 3).fill(1);
  geometry.setAttribute(VOXEL_COLOUR_ATTRIBUTE, new THREE.BufferAttribute(white, 3));
  return geometry;
}

/**
 * The block material. `vertexColors` MUST be true, and the geometry must carry the colour attribute, or the
 * fragment stage ignores the per-instance colours entirely.
 */
export function createVoxelMaterial(THREE) {
  if (!THREE || !THREE.MeshLambertMaterial) throw new Error('createVoxelMaterial needs the three namespace');
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * Fill an instanced mesh's colours and upload them.
 *
 * The upload matters as much as the values: `setColorAt` writes `instanceColor`, and a buffer that is never
 * marked dirty is never sent to the GPU, so the mesh would draw with its initial zeros.
 *
 * @param {object} mesh   an InstancedMesh
 * @param {Array}  entries `[key, blockId]` pairs in instance order
 * @param {Function} colourFor a block id to a THREE.Color
 */
export function applyInstanceColours(mesh, entries, colourFor) {
  entries.forEach(([, id], index) => mesh.setColorAt(index, colourFor(id)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
