import { DYE_COLOURS as BANNER_TINTS } from './colourPalette.js';
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
  // The tint is applied to the `color` attribute, which the shaders multiply into the texture. It is
  // resolved through THREE.Color so a hex in the palette becomes the same linear value bed.js uses --
  // comparing a raw sRGB fraction against stored linear data can never match.
  const tint = opts.tint !== undefined && opts.tint !== null ? new THREE.Color(opts.tint) : null;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint ? tint.r : 1;
    colors[i * 3 + 1] = tint ? tint.g : 1;
    colors[i * 3 + 2] = tint ? tint.b : 1;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
 * Merge boxes into a single geometry, keeping exactly the attributes this pipeline uses.
 *
 * three.js's `mergeGeometries` handles position/normal/uv, but it requires every input to carry an
 * identical attribute set and knows nothing about `emission` and `flame`. Merging by hand means a
 * multi-box shape cannot silently lose an attribute and render as an invisible block.
 */
function mergeBoxes(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const color = new Float32Array(total * 3);
  const emission = new Float32Array(total);
  const flame = new Float32Array(total);
  const index = [];
  let v = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    const c = g.attributes.color, e = g.attributes.emission, f = g.attributes.flame;
    for (let i = 0; i < p.count; i++) {
      position[(v + i) * 3] = p.getX(i);
      position[(v + i) * 3 + 1] = p.getY(i);
      position[(v + i) * 3 + 2] = p.getZ(i);
      normal[(v + i) * 3] = n.getX(i);
      normal[(v + i) * 3 + 1] = n.getY(i);
      normal[(v + i) * 3 + 2] = n.getZ(i);
      uv[(v + i) * 2] = t.getX(i);
      uv[(v + i) * 2 + 1] = t.getY(i);
      color[(v + i) * 3] = c.getX(i);
      color[(v + i) * 3 + 1] = c.getY(i);
      color[(v + i) * 3 + 2] = c.getZ(i);
      emission[v + i] = e ? e.getX(i) : 0;
      flame[v + i] = f ? f.getX(i) : 0;
    }
    const gi = g.index;
    if (gi) for (let i = 0; i < gi.count; i++) index.push(gi.getX(i) + v);
    v += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('emission', new THREE.BufferAttribute(emission, 1));
  out.setAttribute('flame', new THREE.BufferAttribute(flame, 1));
  out.setIndex(index);
  return out;
}

// Horizontal rotations around the block centre, matching bed.js's convention.
// 0: East (+X), 1: West (-X), 2: South (+Z), 3: North (-Z)
export const STAIR_ROTATIONS = [
  Math.PI / 2,   // 0: East
  -Math.PI / 2,  // 1: West
  Math.PI,       // 2: South
  0,             // 3: North
];

/**
 * A staircase: a bottom slab plus a half-height box on the back half.
 *
 * Vanilla stairs are the largest shape family this project was missing -- about 68 recipes. The step
 * occupies z 0..0.5, so the front half of the upper level is open, and the whole shape is rotated
 * around the block centre for the other three facings, the way bed.js and door.js do it.
 *
 * @param {number} dir    facing, 0 east, 1 west, 2 south, 3 north
 * @param {boolean} isTop upside-down stairs, which occupy the upper half of the block
 */
export function createStairGeometry(def, tm, dir = 3, isTop = false) {
  // The two orientations swap which half each box occupies.
  //
  //   normal    base y 0..0.5 (the slab)      step y 0.5..1 (on the back half)
  //   inverted  base y 0.5..1 (the top slab)  step y 0..0.5 (hanging below it on the back half)
  //
  // The first version of this shifted BOTH boxes by the same amount when inverted, so the two shifts
  // cancelled and the geometry was byte-identical in both orientations -- a parameter that silently did
  // nothing. The test that caught it compared the y histograms, which is why they are compared directly
  // rather than inferred from a bounding box.
  const baseMinY = isTop ? 0.5 : 0;
  const stepMinY = isTop ? 0 : 0.5;
  const parts = [
    buildBox({ x: 1, y: 0.5, z: 1 }, { x: 0, y: baseMinY, z: 0 }, def, tm),
    buildBox({ x: 1, y: 0.5, z: 0.5 }, { x: 0, y: stepMinY, z: 0 }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();

  const rotAngle = STAIR_ROTATIONS[dir] || 0;
  if (rotAngle !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rotAngle);
    merged.translate(0.5, 0, 0.5);
  }
  return merged;
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

/**
 * A fence: a centre post with two rails crossing it.
 *
 * Vanilla's fence is 4/16 square for the post at full height, with two rails at roughly y 6/16..9/16
 * running the full width on each horizontal axis.
 *
 * The rails are always drawn on both axes rather than following the neighbours. Vanilla connects a
 * fence only toward other fences and solid blocks, and doing that properly needs neighbour state the
 * mesher does not pass for this shape. A cross-shaped fence is the honest approximation: it is never
 * WRONG about being a fence, only occasionally over-connected, whereas emitting it as a cube would be
 * wrong everywhere.
 */
export function createFenceGeometry(def, tm) {
  const post = 4 / 16;
  const railH = 3 / 16;
  const railY = 6 / 16;
  const railThickness = 3 / 16;
  const postMin = (1 - post) / 2;
  const railMin = (1 - railThickness) / 2;
  const parts = [
    // The post, full height.
    buildBox({ x: post, y: 1, z: post }, { x: postMin, y: 0, z: postMin }, def, tm),
    // Rail along X.
    buildBox({ x: 1, y: railH, z: railThickness }, { x: 0, y: railY, z: railMin }, def, tm),
    // Rail along Z.
    buildBox({ x: railThickness, y: railH, z: 1 }, { x: railMin, y: railY, z: 0 }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A wall: a chunky post with full-height rails crossing it.
 *
 * Vanilla walls are an 8/16 square post at full height with 8/16-thick side pieces, so a straight run
 * reads as a thin full-height barrier rather than a fence's low rails. One shape unblocks 25 recipes,
 * which makes it the best remaining payoff.
 *
 * Like fences, the rails are always drawn on both axes rather than following neighbours. The same
 * reasoning applies and the same caveat is recorded: a cross-shaped wall is never wrong about being a
 * wall, only occasionally over-connected, where a cube would be wrong everywhere.
 */
export function createWallGeometry(def, tm) {
  const thickness = 8 / 16;
  const railMin = (1 - thickness) / 2;
  const parts = [
    // The post: full block height, centred.
    buildBox({ x: thickness, y: 1, z: thickness }, { x: railMin, y: 0, z: railMin }, def, tm),
    // Rail along X, full height.
    buildBox({ x: 1, y: 1, z: thickness }, { x: 0, y: 0, z: railMin }, def, tm),
    // Rail along Z, full height.
    buildBox({ x: thickness, y: 1, z: 1 }, { x: railMin, y: 0, z: 0 }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A candle: a narrow column standing on the floor.
 *
 * Vanilla candles are 2 pixels across and 6 tall. One builder serves all sixteen colours, since the
 * only difference between them is the texture named on the definition.
 */
export function createCandleGeometry(def, tm) {
  const w = 2 / 16;
  const h = 6 / 16;
  const min = (1 - w) / 2;
  return buildBox({ x: w, y: h, z: w }, { x: min, y: 0, z: min }, def, tm);
}

/**
 * A chain: a thin post with the links suggested by two offset segments.
 *
 * A chain is 6/16 across. A single plain box would read as a grey post rather than a chain, so the
 * shape is two stacked segments whose alternation suggests links. Deliberately not more elaborate than
 * that: this project has no chain-linking rules, and the point is that the block is not a cube.
 */
export function createChainGeometry(def, tm) {
  const w = 6 / 16;
  const min = (1 - w) / 2;
  const parts = [
    buildBox({ x: w, y: 3 / 8, z: w * 0.6 }, { x: min, y: 0, z: min + w * 0.2 }, def, tm),
    buildBox({ x: w * 0.6, y: 3 / 8, z: w }, { x: min + w * 0.2, y: 3 / 8, z: min }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A pressure plate: a thin plate lying on the floor.
 *
 * Vanilla plates are 1/16 tall and slightly inset. This is the same construction as a carpet with a
 * different footprint, which is why it is a box rather than anything new.
 *
 * The plate is not animated when stepped on. That is a redstone behaviour rather than geometry, and
 * this project's `redstone` flag already drives the block's own state; the shape here is what makes it
 * a plate rather than a cube.
 */
export function createPressurePlateGeometry(def, tm) {
  const inset = 1 / 16;
  const size = 1 - inset * 2;
  return buildBox({ x: size, y: 1 / 16, z: size }, { x: inset, y: 0, z: inset }, def, tm);
}

/**
 * A button: a small box on the floor.
 *
 * Vanilla buttons are 6/16 across and 4/16 tall when floor-mounted. Wall-mounted buttons are modelled
 * the same way here rather than by facing, because this project has no per-face placement state for
 * them yet -- and a floor-mounted button is never wrong about being a button.
 */
export function createButtonGeometry(def, tm) {
  const w = 6 / 16;
  const h = 4 / 16;
  const min = (1 - w) / 2;
  return buildBox({ x: w, y: h, z: w }, { x: min, y: 0, z: min }, def, tm);
}

/**
 * A fence gate: a post at each side with a slatted panel between them.
 *
 * Modelled closed. An open gate would be a different geometry, and this project's doors already show
 * that an open state is a separate block id, so a gate could follow the same pattern later.
 */
/**
 * A standing banner: a pole with a cloth panel hanging from it.
 *
 * Sixteen colours share this one shape. The pole is wood-coloured and untinted; only the cloth takes
 * the dye colour, which is why buildBox needed a tint -- a single tint for the whole banner would
 * colour the pole too.
 */
export function createBannerGeometry(def, tm, colour = null) {
  const poleW = 2 / 16;
  const poleMin = (1 - poleW) / 2;
  const tint = colour ? BANNER_TINTS[colour] : undefined;
  const clothW = 14 / 16;
  const clothH = 12 / 16;
  const parts = [
    // The pole: full height, wood-coloured, so no tint.
    buildBox({ x: poleW, y: 1, z: poleW }, { x: poleMin, y: 0, z: poleMin }, def, tm, { tint: 0x8b653e }),
    // The cloth: nearly full width, hanging from the top, one pixel thick.
    buildBox({ x: clothW, y: clothH, z: 1 / 16 },
      { x: (1 - clothW) / 2, y: 1 - clothH - 1 / 16, z: poleMin - 1 / 32 },
      def, tm, tint === undefined ? {} : { tint }),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  return merged;
}

export function createFenceGateGeometry(def, tm) {
  const post = 2 / 16;
  const railY = [5 / 16, 9 / 16];
  const railH = 2 / 16;
  const parts = [
    buildBox({ x: post, y: 1, z: post }, { x: 0, y: 0, z: 0 }, def, tm),
    buildBox({ x: post, y: 1, z: post }, { x: 1 - post, y: 0, z: 0 }, def, tm),
    buildBox({ x: post, y: 1, z: post }, { x: 0, y: 0, z: 1 - post }, def, tm),
    buildBox({ x: post, y: 1, z: post }, { x: 1 - post, y: 0, z: 1 - post }, def, tm),
  ];
  for (const y of railY) {
    parts.push(buildBox({ x: 1, y: railH, z: 1 / 16 }, { x: 0, y, z: (1 - 1 / 16) / 2 }, def, tm));
  }
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A standing sign: a post with a board near the top.
 *
 * Vanilla signs are block entities holding text, and this project has no sign-editing UI. The block is
 * modelled so the RECIPE has a destination and the block reads as a sign in the world; the text layer is
 * deliberately absent rather than half-built.
 */
export function createSignGeometry(def, tm, dir = 3) {
  const post = 2 / 16;
  const postMin = (1 - post) / 2;
  const boardW = 12 / 16;
  const boardH = 6 / 16;
  const boardT = 1 / 16;
  const parts = [
    // The post, from the floor to just under the board.
    buildBox({ x: post, y: 10 / 16, z: post }, { x: postMin, y: 0, z: postMin }, def, tm),
    // The board, mounted on the post and slightly in front of its centre.
    buildBox({ x: boardW, y: boardH, z: boardT },
      { x: (1 - boardW) / 2, y: 8 / 16, z: postMin - boardT / 2 }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  const rot = STAIR_ROTATIONS[dir] || 0;
  if (rot !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rot);
    merged.translate(0.5, 0, 0.5);
  }
  return merged;
}

/**
 * A hanging sign: a top bar with a board suspended below it.
 *
 * Two thin links stand in for the chains, so the block reads as hanging rather than as a sign floating
 * in mid-air.
 */
export function createHangingSignGeometry(def, tm, dir = 3) {
  const boardW = 10 / 16;
  const boardH = 10 / 16;
  const boardT = 1 / 16;
  const barT = 1 / 16;
  const link = 1.5 / 16;
  const parts = [
    // The bar it hangs from, at the top of the block.
    buildBox({ x: 14 / 16, y: barT, z: 2 / 16 }, { x: 1 / 16, y: 1 - barT, z: 7 / 16 }, def, tm),
    // The board, suspended below the bar.
    buildBox({ x: boardW, y: boardH, z: boardT },
      { x: (1 - boardW) / 2, y: 2 / 16, z: 7.5 / 16 }, def, tm),
    // Two links standing in for the chains.
    buildBox({ x: link, y: 2 / 16, z: link }, { x: 3 / 16, y: 14 / 16, z: 7.25 / 16 }, def, tm),
    buildBox({ x: link, y: 2 / 16, z: link }, { x: 12 / 16 - link, y: 14 / 16, z: 7.25 / 16 }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  const rot = STAIR_ROTATIONS[dir] || 0;
  if (rot !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rot);
    merged.translate(0.5, 0, 0.5);
  }
  return merged;
}

/**
 * A rod: a thin full-height post, for end rods and lightning rods.
 *
 * Separate from `chain`, which is deliberately segmented to suggest links. A rod is smooth.
 */
export function createRodGeometry(def, tm) {
  const w = 3 / 16;
  const min = (1 - w) / 2;
  return buildBox({ x: w, y: 1, z: w }, { x: min, y: 0, z: min }, def, tm);
}

/**
 * A rail: a one-pixel plate covering the block, for detector and activator rails.
 *
 * Vanilla rails are 1/16 tall and span the full block footprint, unlike a pressure plate which is
 * inset. The raised profile of a powered rail is not modelled; the block is the plate.
 */
export function createRailGeometry(def, tm) {
  return buildBox({ x: 1, y: 1 / 16, z: 1 }, { x: 0, y: 0, z: 0 }, def, tm);
}

/**
 * A flower pot: a small box.
 *
 * Vanilla pots have a lip and an inner cavity modelled from five boxes. One box is the honest
 * approximation for a decorative block whose only behaviour is holding a plant, which this project does
 * not model.
 */
export function createFlowerPotGeometry(def, tm) {
  const w = 6 / 16;
  const h = 6 / 16;
  const min = (1 - w) / 2;
  return buildBox({ x: w, y: h, z: w }, { x: min, y: 0, z: min }, def, tm);
}

/**
 * A wall sign: the same board as a standing sign, mounted flat against a wall with no post.
 *
 * A standing sign is a post plus a board; a wall sign is just the board, held off the wall by two short
 * pegs. It is a separate function rather than a flag on `createSignGeometry` because the two share only
 * the board dimensions and differ in every position, and mixing them would make the post conditional.
 *
 * `dir` is the direction the sign faces, using the same rotation table the other sign shapes use. As with
 * the hanging signs, nothing in this engine drives that from placement: no block-state layer owns signs,
 * so a wall sign is drawn facing north until one does.
 */
export function createWallSignGeometry(def, tm, dir = 3) {
  const boardW = 12 / 16;
  const boardH = 6 / 16;
  const boardT = 1 / 16;
  // The board sits at the back of the cell so the pegs reach the wall behind it.
  const boardZ = 15 / 16 - boardT;
  const peg = 1 / 16;
  const parts = [
    buildBox({ x: boardW, y: boardH, z: boardT },
      { x: (1 - boardW) / 2, y: 8 / 16, z: boardZ }, def, tm),
    // Two pegs, one near each end of the board, running back to the wall.
    buildBox({ x: peg, y: peg, z: 1 / 16 }, { x: 2.5 / 16, y: 11 / 16, z: boardZ + boardT }, def, tm),
    buildBox({ x: peg, y: peg, z: 1 / 16 }, { x: 12.5 / 16, y: 11 / 16, z: boardZ + boardT }, def, tm),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  const rot = STAIR_ROTATIONS[dir] || 0;
  if (rot !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rot);
    merged.translate(0.5, 0, 0.5);
  }
  return merged;
}

/**
 * A wall-mounted coral fan: the fan sprite on a thin plate fixed against a wall face.
 *
 * The upright coral fans are drawn as cross-quads, which is right for a fan growing up out of the floor
 * and wrong for one attached to a wall -- a cross reads as a plant, while a wall fan is a flat growth. So
 * this draws the sprite on a thin vertical plate instead, which is the shape the vanilla model has.
 *
 * The sprite's artwork sits in the TOP HALF of its 16x16 tile (measured: opaque pixels span y=7..15), so
 * the plate covers that half and the fan's narrow base ends up at the bottom, flaring upward exactly as
 * the texture does. `insetUv` keeps the transparent surround from sampling atlas neighbours through it.
 *
 * The default direction is north, matching the other wall-mounted shapes. As with the wall signs, nothing
 * in this engine drives that from placement.
 */
export function createWallFanGeometry(def, tm, dir = 3) {
  const plateW = 15 / 16;
  const plateT = 1 / 16;
  // The sprite's opaque band, so the plate matches the artwork rather than the whole tile.
  const artBottom = 7 / 16;
  const plateH = 1 - artBottom;
  const plateZ = 15 / 16 - plateT;
  const parts = [
    buildBox({ x: plateW, y: plateH, z: plateT },
      { x: (1 - plateW) / 2, y: artBottom, z: plateZ }, def, tm, { insetUv: true }),
  ];
  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  const rot = STAIR_ROTATIONS[dir] || 0;
  if (rot !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rot);
    merged.translate(0.5, 0, 0.5);
  }
  return merged;
}

/**
 * A mob head: an 8/16 cube, either sitting on the floor or fixed to a wall.
 *
 * Vanilla draws a head as an 8x8x8 box, which is why a head reads as a cube sitting on top of a
 * full-size block rather than as a block itself. The same box is reused for the wall form, translated
 * higher and back against the wall face, exactly as the wall sign and wall fan do.
 *
 * NOT MODELLED: a placed head can be rotated to face any direction, and nothing in this engine drives
 * that, so a head faces north. The wall forms share that limitation with the other wall-mounted shapes.
 */
export function createHeadGeometry(def, tm, wall = false, dir = 3) {
  const size = 8 / 16;
  // A standing head sits on the floor of its cell; a wall head is centred higher, against the wall.
  const min = wall
    ? { x: (1 - size) / 2, y: 6 / 16, z: 1 - size }
    : { x: (1 - size) / 2, y: 0, z: (1 - size) / 2 };
  const parts = [buildBox({ x: size, y: size, z: size }, min, def, tm, { insetUv: true })];

  const merged = mergeBoxes(parts);
  for (const p of parts) p.dispose();
  if (wall) {
    const rot = STAIR_ROTATIONS[dir] || 0;
    if (rot !== 0) {
      merged.translate(-0.5, 0, -0.5);
      merged.rotateY(rot);
      merged.translate(0.5, 0, 0.5);
    }
  }
  return merged;
}

