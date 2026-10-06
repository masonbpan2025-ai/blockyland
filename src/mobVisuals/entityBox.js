/**
 * Generic Minecraft entity model helpers.
 *
 * Every vanilla land mob is built from axis-aligned boxes whose faces are painted on one shared texture atlas,
 * positioned by the texture rectangle that face occupies. The existing mob spawners instead build plain boxes and
 * paint them a flat colour, which is why so many mobs are "a blob with no face": a colour cannot carry an eye, a
 * snout or a mushroom.
 *
 * The conventions encoded here are vanilla's, and they are the reason a naive `BoxGeometry` does not work:
 *
 *   * A box of texture size (w, h, d) laid out at atlas origin (u, v) occupies a 2*(w+d) wide, (d+h) tall region.
 *     The top row holds the top and bottom faces; the second row holds right, front, left and back, in that order.
 *   * Face rectangles are given in ATLAS PIXELS with the origin at the TOP-LEFT, because that is how the art and
 *     every reference describes them. Converting to three.js UVs means flipping V.
 *
 * `createEntityBox` takes those rectangles and produces a geometry whose six faces each sample their own patch,
 * in three.js's face order (+X, -X, +Y, -Y, +Z, -Z).
 */
import * as THREE from 'three';

const FACE = { RIGHT: 0, LEFT: 1, TOP: 2, BOTTOM: 3, FRONT: 4, BACK: 5 };

/**
 * A box using vanilla's automatic layout: one (u, v) and the box's texture dimensions are enough.
 *
 * `w`, `h`, `d` are the box's size in WORLD units; `tw`, `th`, `td` are its size in TEXTURE pixels, which is what
 * decides the rectangle. Pass `mirror` to flip the rectangles horizontally, which vanilla uses for one side of a
 * symmetric pair such as a pair of legs.
 */
export function createEntityBox(w, h, d, u, v, tw, th, td, { texW = 64, texH = 64, mirror = false, size = 1 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;

  // Vanilla's layout, in atlas pixels with a top-left origin. The order is the order the faces appear along the
  // second row of the block, which is right, front, left, back -- NOT right, left, front, back. Getting that wrong
  // silently shifts every face one slot, which puts a blank patch where the face should be.
  const rects = [
    { x: u + td, y: v + td, w: td, h: th },               // +X right
    { x: u + td + tw + td, y: v + td, w: td, h: th },      // -X left
    { x: u + td, y: v, w: tw, h: td },                     // +Y top
    { x: u + td + tw, y: v, w: tw, h: td },                // -Y bottom
    { x: u + td, y: v + td, w: tw, h: th },                // +Z front
    { x: u + td + tw, y: v + td, w: tw, h: th }            // -Z back
  ];

  // A block whose depth is more than half its width leaves no room for the side faces in this layout, and the left
  // face runs past the end of the block into whatever art happens to sit there. That is a real authoring error,
  // not something to paper over: the side would silently sample the wrong patch. The block's own width is
  // `tw + 2*td`, so a conforming box needs `tw >= td`.
  if (td > tw) {
    throw new Error(`createEntityBox: box ${tw}x${th}x${td} at (${u},${v}) has no room for its side faces `
      + `(depth ${td} exceeds half-width); use createBoxFromFaces with explicit rectangles`);
  }

  setFaceUvs(geo, uv, rects, texW, texH, mirror);
  geo.userData.uvRects = rects;
  geo.userData.textureSize = { texW, texH };
  void size;
  return geo;
}

/**
 * A box from explicit per-face rectangles, for the parts vanilla does not lay out in the standard grid (heads that
 * share an atlas with their body, or a single face that needs a particular patch).
 *
 * `faces` is three.js's order: [+X, -X, +Y, -Y, +Z, -Z]. Each entry is `null` (leave the face's default UVs) or
 * `{ x, y, w, h }` in atlas pixels.
 */
export function createBoxFromFaces(w, h, d, faces, { texW = 64, texH = 64, mirror = false } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  setFaceUvs(geo, geo.attributes.uv, faces, texW, texH, mirror);
  geo.userData.uvRects = faces;
  geo.userData.textureSize = { texW, texH };
  return geo;
}

/**
 * Write one rectangle per face into a BoxGeometry's UV attribute.
 *
 * Three.js emits each face as four vertices ordered (0,1)-(1,1)-(0,0)-(1,0) after its own mapping, i.e. top-left,
 * top-right, bottom-left, bottom-right. That ordering is preserved here so the texture lands the right way up on
 * every side.
 */
function setFaceUvs(geo, uv, rects, texW, texH, mirror) {
  for (let face = 0; face < 6; face++) {
    const r = rects[face];
    if (!r) continue;
    // A face may be given as a material-rect pair by callers that only need the rectangle.
    const rect = Array.isArray(r) ? r[1] : r;
    if (!rect) continue;
    let u0 = rect.x / texW;
    let u1 = (rect.x + rect.w) / texW;
    if (mirror) { const t = u0; u0 = u1; u1 = t; }
    const vTop = 1 - rect.y / texH;
    const vBottom = 1 - (rect.y + rect.h) / texH;
    const base = face * 4;
    uv.setXY(base + 0, u0, vTop);
    uv.setXY(base + 1, u1, vTop);
    uv.setXY(base + 2, u0, vBottom);
    uv.setXY(base + 3, u1, vBottom);
  }
  uv.needsUpdate = true;
  void geo;
}

/**
 * The standard rectangles for a vanilla quad model part, for callers that need to read them rather than build.
 * Exposed so a test can assert the layout without duplicating the arithmetic.
 */
export function quadRects(u, v, tw, th, td) {
  // Same order as the layout above: right, left, top, bottom, front, back. Duplicated deliberately rather than
  // shared with `createEntityBox` so a test can compare the two and catch them drifting apart.
  return [
    { x: u + td, y: v + td, w: td, h: th },
    { x: u + td + tw + td, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw, y: v + td, w: tw, h: th }
  ];
}

export { FACE };
