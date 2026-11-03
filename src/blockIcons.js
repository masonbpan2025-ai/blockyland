// Blocks drawn as little 3D cubes in every slot -- the hotbar, the inventory, the creative tabs, the cursor -- the way
// Minecraft shows a block item: seen from above and to one side, its top face lit, its left face a little darker and
// its right face darker still. A slab is drawn as the bottom half of that cube.
//
// Drawn once per block on a small canvas from the block's own face textures (or a resource pack's), and kept as an
// image URL. Only cube-shaped blocks are drawn so: plants, torches, doors, beds and the like keep their flat icon, as
// does any block whose definition names its own icon.
import { BLOCK_DEFS, ITEMS } from './blocks.js';
import { occludesWholeFace } from './blockOcclusion.js';
import { vegetationTint } from './vegetationRendering.js';
import { resourcePackManager } from './resourcePackManager.js';

/** The icon's size in pixels: drawn at this, shown at the slot's size. */
export const ICON_SIZE = 64;
/** How much the two side faces are darkened: the left (front) face by a little, the right by more. */
export const SIDE_SHADE = { left: 0.2, right: 0.4 };
/** Grass is grey in its texture and coloured by the biome; in a slot it takes the plains colour. */
const GRASS_TOP_TINT = '#91bd59';

/**
 * How a block is drawn as a cube in a slot, or null when it keeps a flat icon: its top, left and right face textures,
 * how tall it is (1, or 0.5 for a slab), the tint for its top and its sides, and the boxes it is drawn as -- one for a
 * cube or a slab; for a model that asks for it (`cubeIcon`, the beacon) each of its boxes, the inner ones first.
 */
export function blockIconFaces(id) {
  const def = BLOCK_DEFS[id];
  if (!def || def.icon || def.liquid || def.plant || def.noItem) return null;
  const t = def.textures ?? {};
  const top = t.top ?? t.all ?? t.side, side = t.side ?? t.all ?? t.top, front = t.front ?? side;
  if (!top || !side) return null;
  if (def.model) {
    if (!def.model.cubeIcon) return null;
    // Smallest first, so a shell (the beacon's glass) is drawn over what it holds.
    const boxes = [...def.model.boxes.map((b) => ({ bounds: b.slice(0, 6), texture: b[6] ?? null })),
      ...(def.model.content ? [{ bounds: def.model.content, texture: t.inner ?? top }] : [])]
      .map(({ bounds, texture }) => ({ bounds: bounds.map((v) => v / 16), top: texture ?? top, left: texture ?? front, right: texture ?? side }))
      .sort((a, b) => volume(a.bounds) - volume(b.bounds));
    return { top, left: front, right: side, height: 1, topTint: null, sideTint: null, boxes };
  }
  // A full cube, opaque (stone) or see-through (glass, leaves, ice); or a slab.
  const cube = occludesWholeFace(def) || (def.transparent && !def.shape && !partial(def));
  if (!cube && !def.slab) return null;
  const leaf = vegetationTint(def);
  const leafTint = leaf ? `rgb(${leaf.map((c) => Math.round(c * 255)).join(',')})` : null;
  const height = def.slab ? 0.5 : 1;
  const faces = {
    top, left: front, right: side, height,
    topTint: def.tintTop ? GRASS_TOP_TINT : (def.tint ? leafTint : null),
    sideTint: def.tint ? leafTint : null,
  };
  return { ...faces, boxes: [{ bounds: [0, 0, 0, 1, height, 1], ...faces }] };
}
const volume = ([x0, y0, z0, x1, y1, z1]) => (x1 - x0) * (y1 - y0) * (z1 - z0);

/** Any of the partial shapes a see-through block may have (a pane, a door, a carpet...), which are not cubes. */
function partial(def) {
  return ['slab', 'pane', 'carpet', 'stair', 'fence', 'wall', 'door', 'trapdoor', 'bed', 'chest', 'button', 'sign', 'rail', 'head', 'banner', 'candle', 'chain', 'rod', 'flowerPot', 'redstone', 'pressurePlate', 'fenceGate', 'hangingSign', 'wallSign', 'wallFan', 'wallHead', 'snowLayer'].some((k) => def[k]);
}

/** The block a slot's item places, or null: a block id, or an item id whose item places a block. */
export function blockIdOf(item) {
  if (!item) return null;
  if (typeof item.blockId === 'number') return item.blockId;
  if (item.isBlock && typeof item.id === 'number') return item.id;
  const it = typeof item.id === 'string' ? ITEMS[item.id] : null;
  return item.isBlock && typeof it?.blockId === 'number' ? it.blockId : null;
}

/**
 * Where a box's three faces go on the icon, as canvas transforms from a face's texture (1 x 1) to the icon. The block
 * is seen from above its front-left corner: its top is a diamond half as tall as it is wide; its left face runs from
 * the left corner to the front, its right face from the front to the right. `bounds` is [x0, y0, z0, x1, y1, z1] in
 * blocks; z runs towards the left face's front, x towards the right.
 */
export function boxFaceTransforms(size = ICON_SIZE, bounds = [0, 0, 0, 1, 1, 1]) {
  const s = size / 64, [x0, y0, z0, x1, y1, z1] = bounds;
  const A = [28 * s, 14 * s], X = [28 * s, -14 * s], UP = 32 * s;             // along z, along x, and up a block
  const at = (x, y, z) => [4 * s + z * A[0] + x * X[0], 48 * s + z * A[1] + x * X[1] - y * UP];
  const dz = z1 - z0, dx = x1 - x0, dy = y1 - y0;
  const corner = at(x0, y1, z0);
  return {
    top: [X[0] * dx, X[1] * dx, A[0] * dz, A[1] * dz, ...corner],              // across to the back, and to the front
    left: [A[0] * dz, A[1] * dz, 0, UP * dy, ...at(x0, y1, z0)],               // along the front, then down
    right: [X[0] * dx, X[1] * dx, 0, UP * dy, ...at(x0, y1, z1)],              // from the front corner to the right, then down
  };
}

/** The faces of a whole block `height` tall (1, or 0.5 for a slab). */
export function faceTransforms(size = ICON_SIZE, height = 1) {
  return boxFaceTransforms(size, [0, 0, 0, 1, height, 1]);
}

const images = new Map();
function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise((resolve) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src;
  }));
  return images.get(src);
}
const textureUrl = (name) => resourcePackManager.resolveBlockTexture?.(name) || `/assets/blocks/${name}`;

/**
 * The part of a face's texture a box shows (as a block model samples it: a slab's side is the lower half of the side
 * texture), from its first frame (an animated texture is a strip), tinted and shaded, on its own canvas.
 */
function paintFace(image, [u0, v0, u1, v1], { tint = null, shade = 0 } = {}) {
  const n = image.naturalWidth, sx = Math.round(u0 * n), sy = Math.round(v0 * n);
  const w = Math.max(1, Math.round(u1 * n) - sx), h = Math.max(1, Math.round(v1 * n) - sy);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  // Tint and shade only what is there: a leaf's gaps stay gaps.
  if (tint) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h); }
  ctx.globalCompositeOperation = 'source-atop';
  if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, w, h); }
  return canvas;
}

/** Draw a block's icon: a promise of a PNG data URL, or null when it keeps its flat icon or a texture is missing. */
export async function drawBlockIcon(id, size = ICON_SIZE) {
  const faces = blockIconFaces(id);
  if (!faces || typeof document === 'undefined') return null;
  const names = [...new Set(faces.boxes.flatMap((b) => [b.top, b.left, b.right]))];
  const loaded = new Map(await Promise.all(names.map(async (name) => [name, await loadImage(textureUrl(name))])));
  if ([...loaded.values()].some((image) => !image)) return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const draw = (face, t) => {
    ctx.setTransform(t[0] / face.width, t[1] / face.width, t[2] / face.height, t[3] / face.height, t[4], t[5]);
    // A hair larger than the face, so the three meet without a seam between them.
    ctx.drawImage(face, 0, 0, face.width + 0.15, face.height + 0.15);
  };
  for (const box of faces.boxes) {
    const [x0, y0, z0, x1, y1, z1] = box.bounds, place = boxFaceTransforms(size, box.bounds);
    const sides = { tint: box.sideTint ?? faces.sideTint };
    draw(paintFace(loaded.get(box.left), [z0, 1 - y1, z1, 1 - y0], { ...sides, shade: SIDE_SHADE.left }), place.left);
    draw(paintFace(loaded.get(box.right), [x0, 1 - y1, x1, 1 - y0], { ...sides, shade: SIDE_SHADE.right }), place.right);
    draw(paintFace(loaded.get(box.top), [x0, z0, x1, z1], { tint: box.topTint ?? faces.topTint }), place.top);
  }
  return canvas.toDataURL('image/png');
}

const icons = new Map();
let packVersion = 0;
resourcePackManager.onChange?.(() => { icons.clear(); images.clear(); packVersion++; });

/** A block's 3D icon: the URL at once if it has been drawn, else a promise of it (null for a flat-icon block). */
export function blockIcon(id) {
  if (!icons.has(id)) icons.set(id, drawBlockIcon(id).then((url) => { icons.set(id, url); return url; }));
  return icons.get(id);
}

/**
 * Show a slot's item as a 3D block where it is one: `img` keeps the flat icon it was given until the cube is drawn,
 * then shows the cube -- unless the slot has moved on to another item meanwhile.
 */
export function applyBlockIcon(img, item) {
  if (!img || typeof document === 'undefined') return;
  const id = blockIdOf(item);
  delete img.dataset.blockIcon;
  if (id === null || !blockIconFaces(id)) return;
  const key = `${packVersion}:${id}`;
  img.dataset.blockIcon = key;
  const icon = blockIcon(id);
  if (typeof icon === 'string') { img.src = icon; return; }
  icon?.then?.((url) => { if (url && img.dataset.blockIcon === key) img.src = url; });
}
