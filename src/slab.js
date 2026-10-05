// Slab geometry: a half-height box.
//
// Why this is its own module. The mesher has a fast path for plain cubes -- static corner tables and a
// shared vertex writer -- and a slower path for blocks whose shape is not a cube. Slabs are the first
// shape added to that slower path that is a *partial cube*, so they need a real box at half height
// rather than a scaled cube (scaling would squash the texture instead of cropping it).
//
// The mesh vocabulary the rest of the pipeline expects is `position`, `uv`, `color`, `emission` and
// `flame`; door.js's `createBoxPart` establishes the UV convention, which is to remap a BoxGeometry's
// 0..1 per-face UVs into the target atlas tile. This follows it exactly so shaders and the light
// system need no changes.
import * as THREE from 'three';

/** Which texture each slab face should sample, defaulting to the block's `all` texture. */
function faceTexture(def, face) {
  const t = def?.textures || {};
  if (face === 'top' || face === 'bottom') return t[face] || t.all || t.side || t.top;
  return t.side || t.all || t[face] || t.top;
}

/**
 * Build a slab.
 *
 * @param {object} def      the block definition, for textures
 * @param {object} tm       the texture manager, used to resolve atlas UVs
 * @param {string} variant  'bottom' (default) or 'top'; 'double' is a full cube and should not reach here
 */
export function createSlabGeometry(def, tm, variant = 'bottom') {
  // A slab occupies half a block. `bottom` sits from y=0 up, `top` from y=0.5 up. A BoxGeometry is
  // centred, so the translation is half the height for a bottom slab and three quarters for a top one.
  const height = 0.5;
  const isTop = variant === 'top';
  const centreY = isTop ? 0.75 : 0.25;

  const geo = new THREE.BoxGeometry(1, height, 1);
  geo.translate(0.5, centreY, 0.5);

  // Remap each face's 0..1 UVs into its atlas tile. BoxGeometry orders faces as
  // +x, -x, +y, -y, +z, -z with four vertices each, so the tile can be chosen per face.
  const uv = geo.attributes.uv;
  const order = ['side', 'side', 'top', 'bottom', 'side', 'side'];
  for (let face = 0; face < 6; face++) {
    const name = faceTexture(def, order[face]);
    const tile = (tm && name && tm.getFaceUVs) ? tm.getFaceUVs(name, 'all') : { u0: 0, v0: 0, u1: 1, v1: 1 };
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i,
        THREE.MathUtils.lerp(tile.u0, tile.u1, uv.getX(i)),
        THREE.MathUtils.lerp(tile.v0, tile.v1, uv.getY(i)));
    }
  }

  // The attributes the shared materials expect. A slab is not a light source and has no flame, but the
  // shaders declare these attributes unconditionally, so they must be present.
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0), 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0), 1));
  return geo;
}
