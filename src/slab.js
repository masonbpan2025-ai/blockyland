// Partial-cube block geometry: slabs, panes, carpets.
//
// Why this is its own module. The mesher has a fast path for plain cubes -- static corner tables and a
// shared vertex writer -- and a slower path for blocks whose shape is not a cube. Slabs were the first
// partial cube added to that slower path; panes and carpets are more of the same, and three
// near-identical box builders would be three places to get the UV convention wrong.
//
// The mesh vocabulary the rest of the pipeline expects is `position`, `normal`, `uv`, `color`,
// `emission` and `flame`; door.js's `createBoxPart` establishes the UV convention, which is to remap a
// BoxGeometry's 0..1 per-face UVs into the target atlas tile. This follows it exactly so shaders and
// the light system need no changes for any shape here.
import * as THREE from 'three';

/** Which texture each box face should sample, defaulting to the block's `all` texture. */
function faceTexture(def, face) {
  const t = def?.textures || {};
  if (face === 'top' || face === 'bottom') return t[face] || t.all || t.side || t.top;
  return t.side || t.all || t[face] || t.top;
}

// BoxGeometry orders faces as +x, -x, +y, -y, +z, -z with four vertices each.
const FACE_ORDER = ['side', 'side', 'top', 'bottom', 'side', 'side'];

/**
 * Build a box and dress it for the mesher.
 *
 * @param {{x:number,y:number,z:number}} size  full extents in blocks
 * @param {{x:number,y:number,z:number}} min   the low corner, in 0..1 block coordinates
 * @param {object} def                         the block definition, for textures
 * @param {object} tm                          texture manager, for atlas UVs
 * @param {object} [opts]
 * @param {string}  [opts.topTexture]          override for the top face, which glass panes need
 * @param {boolean} [opts.insetUv]             inset UVs by a half pixel, so a transparent texture
 *                                             does not sample its atlas neighbours through its own
 *                                             transparent pixels
 */
function buildBox(size, min, def, tm, opts = {}) {
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  // BoxGeometry is centred on the origin, so shift it until `min` is the low corner.
  geo.translate(min.x + size.x / 2, min.y + size.y / 2, min.z + size.z / 2);

  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    const kind = FACE_ORDER[face];
    const name = (kind === 'top' && opts.topTexture) ? opts.topTexture : faceTexture(def, kind);
    const tile = (tm && name && tm.getFaceUVs)
      ? tm.getFaceUVs(name, 'all')
      : { u0: 0, v0: 0, u1: 1, v1: 1 };
    // The inset is applied only where asked for: on a solid block it would visibly crop the texture.
    const inset = opts.insetUv ? (tile.u1 - tile.u0) * (0.5 / 16) : 0;
    const u0 = tile.u0 + inset, u1 = tile.u1 - inset;
    const v0 = tile.v0 + inset, v1 = tile.v1 - inset;
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i,
        THREE.MathUtils.lerp(u0, u1, uv.getX(i)),
        THREE.MathUtils.lerp(v0, v1, uv.getY(i)));
    }
  }

  // The attributes the shared materials expect. None of these shapes is a light source and none has a
  // flame, but the shaders declare these attributes unconditionally, so they must be present.
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0), 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0), 1));
  return geo;
}

/**
 * A slab: half a block tall, full width and depth.
 *
 * A slab sits from y=0 up (bottom) or y=0.5 up (top). A double slab is a full cube and should be
 * represented as the full block it becomes, which is also how vanilla treats it for lighting and
 * collision, so it does not reach here.
 */
export function createSlabGeometry(def, tm, variant = 'bottom') {
  const isTop = variant === 'top';
  return buildBox({ x: 1, y: 0.5, z: 1 }, { x: 0, y: isTop ? 0.5 : 0, z: 0 }, def, tm);
}

/**
 * A glass pane: a thin sheet through the middle of the block, full height.
 *
 * Vanilla panes are 2 pixels thick (0.125) and centred on one axis. The UVs are inset because glass is
 * partly transparent and would otherwise sample the atlas tiles around it through its own transparent
 * pixels -- which shows up as a border of whatever happens to be adjacent in the atlas.
 */
export function createPaneGeometry(def, tm) {
  const thickness = 2 / 16;
  const min = (1 - thickness) / 2;
  return buildBox({ x: thickness, y: 1, z: 1 }, { x: min, y: 0, z: 0 }, def, tm, { insetUv: true });
}

/**
 * A carpet: one pixel tall, covering the whole block.
 *
 * Like a bottom slab but much thinner, which is why it is a box rather than a scaled cube: scaling
 * would stretch the texture across the thickness instead of showing a slice of it.
 */
export function createCarpetGeometry(def, tm) {
  return buildBox({ x: 1, y: 1 / 16, z: 1 }, { x: 0, y: 0, z: 0 }, def, tm);
}

