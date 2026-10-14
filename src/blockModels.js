// Builds a block's box model (src/blockModelShapes.js) into one geometry for the mesher, the hand and the dropped
// item. Each face samples only the part of its texture the box covers -- a 14-pixel cactus side shows 14 pixels of
// the cactus texture, not all 16 squeezed -- which is how a block model maps its faces.
import * as THREE from 'three';

/** The texture a face of the block uses, from its definition: top, bottom or side (with `all` as the fallback). */
function faceTexture(def, kind) {
  const t = def?.textures || {};
  if (kind === 'top') return t.top || t.all || t.side;
  if (kind === 'bottom') return t.bottom || t.all || t.side || t.top;
  return t.side || t.all || t.front || t.top;
}

// BoxGeometry's face order: +x, -x, +y, -y, +z, -z, four vertices each.
const FACE_KIND = ['side', 'side', 'top', 'bottom', 'side', 'side'];

/** One box, pixel bounds [x0,y0,z0,x1,y1,z1], with each face's UVs cropped to the area it covers. */
function box(bounds, def, tm, textureOverride = null) {
  const [x0, y0, z0, x1, y1, z1] = bounds.map((v) => v / 16);
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    const name = textureOverride ?? faceTexture(def, FACE_KIND[face]);
    const tile = tm?.getFaceUVs && name ? tm.getFaceUVs(name, 'all') : { u0: 0, v0: 0, u1: 1, v1: 1 };
    // The face's extent in the texture: x or z across, y (or z on top and bottom) up.
    const [ua, ub, va, vb] = face < 2 ? [z0, z1, y0, y1] : face < 4 ? [x0, x1, z0, z1] : [x0, x1, y0, y1];
    for (let i = face * 4; i < face * 4 + 4; i++) {
      const u = THREE.MathUtils.lerp(ua, ub, uv.getX(i));
      const v = THREE.MathUtils.lerp(va, vb, uv.getY(i));
      uv.setXY(i, THREE.MathUtils.lerp(tile.u0, tile.u1, u), THREE.MathUtils.lerp(tile.v0, tile.v1, v));
    }
  }
  return geo.toNonIndexed();
}

/**
 * A wall-attached model (a ladder, a vine) is written hanging on the SOUTH wall (z = 15..16); `state.wall` names the
 * wall it hangs on in the world, and its boxes turn about the block's vertical axis to it.
 */
const WALL_TURNS = { south: 0, west: 1, north: 2, east: 3 };
function turn(bounds, quarterTurns) {
  let [x0, y0, z0, x1, y1, z1] = bounds;
  for (let i = 0; i < quarterTurns; i++) [x0, z0, x1, z1] = [16 - z1, x0, 16 - z0, x1]; // (x, z) -> (16 - z, x)
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}

/** Chorus plant arms, by the neighbour they reach for (a chorus plant's `state.connect`). */
const CHORUS_ARMS = {
  north: [4, 4, 0, 12, 12, 4], south: [4, 4, 12, 12, 12, 16], west: [0, 4, 4, 4, 12, 12],
  east: [12, 4, 4, 16, 12, 12], up: [4, 12, 4, 12, 16, 12], down: [4, 0, 4, 12, 4, 12],
};

/** The boxes a model draws in this state: turned to its wall, or grown arms towards its connections. */
export function modelBoxes(shape, state = {}) {
  let boxes = shape.boxes;
  if (shape.wallAttached) {
    // A vine can cover several walls and the underside of the block above ('up'); a ladder has one wall.
    const walls = shape.multiWall && Array.isArray(state.walls) && state.walls.length ? state.walls : [state.wall ?? 'south'];
    boxes = walls.flatMap((wall) => (wall === 'up' ? [[0, 15, 0, 16, 16, 16]] : shape.boxes.map((b) => turn(b, WALL_TURNS[wall] ?? 0))));
  }
  if (shape.connections && state.connect) boxes = [...boxes, ...Object.keys(CHORUS_ARMS).filter((d) => state.connect[d]).map((d) => CHORUS_ARMS[d])];
  return boxes;
}

/** The block's model as one geometry with the attributes the block materials read (color, emission, flame). */
export function createModelGeometry(def, tm, state = {}) {
  const shape = def.model;
  const parts = modelBoxes(shape, state).map((b) => box(b, def, tm));
  if (shape.content) parts.push(box(shape.content, def, tm, def.textures?.inner ?? def.textures?.top ?? null));
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const position = new Float32Array(count * 3); const normal = new Float32Array(count * 3); const uvs = new Float32Array(count * 2);
  let at = 0;
  for (const g of parts) {
    position.set(g.attributes.position.array, at * 3);
    normal.set(g.attributes.normal.array, at * 3);
    uvs.set(g.attributes.uv.array, at * 2);
    at += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(count).fill(def.light ? 1 : 0), 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  // Indexed like every other block geometry, so the mesher's merge (which needs all-or-none indexed) accepts it.
  geo.setIndex([...Array(count).keys()]);
  return geo;
}
