// Paintings: decorative entities that hang on walls, from https://minecraft.wiki/w/Painting (Java Edition).
//
// The game had a painting item (craftable, sold by the shepherd) that did nothing when used. This module is the
// entity behind it. The rules it follows, all from the wiki page:
//
//   * A painting hangs on the side of a solid block. It never goes on a floor or a ceiling.
//   * It needs a solid block behind every cell it covers and free space in front of every cell, so it cannot
//     cover a gap in the wall or overlap another painting.
//   * When placed, it measures the space around the clicked point and picks a random canvas of the largest
//     size that fits. Arranging blocks on the wall is how a player gets the size they want.
//   * Even sizes grow toward the painting's counter-clockwise side and upward (vanilla's
//     `offsetForPaintingSize`), so a 2x2 covers the clicked cell, the one beside it and the two above.
//   * Removing a supporting block breaks the painting after 20 game ticks (1 s) unless the block comes back.
//   * A broken painting drops as an item, except when a creative-mode player breaks it.
//
// Placement and the bookkeeping are plain data, so the Node tests and the agent can use them without a renderer.
// The mesh is only built when the game has a scene and a document to draw the canvas on.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/**
 * Every canvas, with its in-game name and size in blocks (width x height). Generated from the wiki's
 * "Canvases" table. `placeable: false` marks the four elemental paintings, which survival placement never picks
 * (the wiki lists them under "Unused paintings"); they can still be hung by naming them.
 */
export const PAINTING_VARIANTS = Object.freeze([
  { id: 'kebab', name: 'Kebab med tre pepperoni', width: 1, height: 1, subject: 'A kebab with three green chili peppers' },
  { id: 'aztec', name: 'de_aztec', width: 1, height: 1, subject: 'A free-look view of the map Aztec' },
  { id: 'alban', name: 'Albanian', width: 1, height: 1, subject: 'A man in a fez beside a house and a bush' },
  { id: 'aztec2', name: 'de_aztec', width: 1, height: 1, subject: 'Another view of the map Aztec' },
  { id: 'bomb', name: 'Target Successfully Bombed', width: 1, height: 1, subject: 'The map Dust II' },
  { id: 'plant', name: 'Paradisträd', width: 1, height: 1, subject: 'Two potted plants' },
  { id: 'wasteland', name: 'Wasteland', width: 1, height: 1, subject: 'A wasteland, with a rabbit on the windowsill' },
  { id: 'meditative', name: 'Meditative', width: 1, height: 1, subject: 'A rose, after Dali' },
  { id: 'wanderer', name: 'Wanderer', width: 1, height: 2, subject: 'A wanderer above a sea of fog' },
  { id: 'graham', name: 'Graham', width: 1, height: 2, subject: 'King Graham from King\'s Quest' },
  { id: 'prairie_ride', name: 'Prairie Ride', width: 1, height: 2, subject: 'A rider on a horse' },
  { id: 'pool', name: 'The Pool', width: 2, height: 1, subject: 'Bathers in a pool' },
  { id: 'courbet', name: 'Bonjour Monsieur Courbet', width: 2, height: 1, subject: 'Two hikers greeting each other' },
  { id: 'sunset', name: 'sunset_dense', width: 2, height: 1, subject: 'Mountains at sunset' },
  { id: 'sea', name: 'Seaside', width: 2, height: 1, subject: 'Mountains and a lake' },
  { id: 'creebet', name: 'Creebet', width: 2, height: 1, subject: 'Seaside, with a creeper head on the ledge' },
  { id: 'match', name: 'Match', width: 2, height: 2, subject: 'A hand lighting a match' },
  { id: 'bust', name: 'Bust', width: 2, height: 2, subject: 'A bust surrounded by fire' },
  { id: 'stage', name: 'The Stage Is Set', width: 2, height: 2, subject: 'A scene from Space Quest' },
  { id: 'void', name: 'The Void', width: 2, height: 2, subject: 'An angel praying into a void' },
  { id: 'skull_and_roses', name: 'Skull and Roses', width: 2, height: 2, subject: 'A skeleton at night with red flowers' },
  { id: 'wither', name: 'Wither', width: 2, height: 2, subject: 'The creation of the wither' },
  { id: 'baroque', name: 'Baroque', width: 2, height: 2, subject: 'A pot, a cake and a sunflower' },
  { id: 'humble', name: 'Humble', width: 2, height: 2, subject: 'Two villagers in front of a house' },
  { id: 'bouquet', name: 'Bouquet', width: 3, height: 3, subject: 'A bouquet of flowers by a stairway' },
  { id: 'cavebird', name: 'Cavebird', width: 3, height: 3, subject: 'A cave in a cliff with a bird overhead' },
  { id: 'cotan', name: 'Cotán', width: 3, height: 3, subject: 'A golden apple and a glistering melon' },
  { id: 'endboss', name: 'Endboss', width: 3, height: 3, subject: 'A skeleton in a brick archway' },
  { id: 'fern', name: 'Fern', width: 3, height: 3, subject: 'A potted fern on a desk' },
  { id: 'owlemons', name: 'Owlemons', width: 3, height: 3, subject: 'An owl in a box next to lemons' },
  { id: 'sunflowers', name: 'Sunflowers', width: 3, height: 3, subject: 'Potted plants and a sunflower' },
  { id: 'tides', name: 'Tides', width: 3, height: 3, subject: 'A person sitting by the shore' },
  { id: 'dennis', name: 'Dennis', width: 3, height: 3, subject: 'A pale wolf' },
  { id: 'backyard', name: 'Backyard', width: 3, height: 4, subject: 'Two women in a yard by a brick arch' },
  { id: 'pond', name: 'Pond', width: 3, height: 4, subject: 'A maiden in a pond' },
  { id: 'fighters', name: 'Fighters', width: 4, height: 2, subject: 'Two men poised to fight' },
  { id: 'changing', name: 'Changing', width: 4, height: 2, subject: 'A person changing clothes before a set' },
  { id: 'finding', name: 'Finding', width: 4, height: 2, subject: 'A person looking into a dug hole' },
  { id: 'lowmist', name: 'Lowmist', width: 4, height: 2, subject: 'A misty mountain landscape' },
  { id: 'passage', name: 'Passage', width: 4, height: 2, subject: 'A hallway opening onto a beach' },
  { id: 'skeleton', name: 'Mortal Coil', width: 4, height: 3, subject: 'Bruno Martinez from Grim Fandango' },
  { id: 'donkey_kong', name: 'Kong', width: 4, height: 3, subject: 'The 100m level of Donkey Kong' },
  { id: 'pointer', name: 'Pointer', width: 4, height: 4, subject: 'A fighter touching a large hand' },
  { id: 'pigscene', name: 'Pigscene', width: 4, height: 4, subject: 'A girl pointing at a pig on a canvas' },
  { id: 'burning_skull', name: 'Skull On Fire', width: 4, height: 4, subject: 'A burning skull under a moon' },
  { id: 'orb', name: 'Orb', width: 4, height: 4, subject: 'An orb of light over a landscape at night' },
  { id: 'unpacked', name: 'Unpacked', width: 4, height: 4, subject: 'Unpacked belongings' },
  { id: 'earth', name: 'Earth', width: 2, height: 2, subject: 'The element earth', placeable: false },
  { id: 'wind', name: 'Wind', width: 2, height: 2, subject: 'The element wind', placeable: false },
  { id: 'fire', name: 'Fire', width: 2, height: 2, subject: 'The element fire', placeable: false },
  { id: 'water', name: 'Water', width: 2, height: 2, subject: 'The element water', placeable: false }
].map(v => Object.freeze({ placeable: true, ...v })));

export const PAINTING_BY_ID = Object.freeze(Object.fromEntries(PAINTING_VARIANTS.map(v => [v.id, v])));

/** Ticks a painting survives without support (the wiki: 20 game ticks). */
export const PAINTING_BREAK_DELAY_SECONDS = 1;

/** The direction a painting faces, i.e. the outward normal of the wall face it hangs on. */
export const FACINGS = Object.freeze({
  north: Object.freeze({ x: 0, z: -1 }),
  south: Object.freeze({ x: 0, z: 1 }),
  east: Object.freeze({ x: 1, z: 0 }),
  west: Object.freeze({ x: -1, z: 0 })
});

// Vanilla `Direction.getCounterClockWise`, seen from above.
const COUNTER_CLOCKWISE = { north: 'west', west: 'south', south: 'east', east: 'north' };

/** The facing named by a normal vector, or null for a floor, ceiling or diagonal. */
export function facingFromNormal(normal) {
  if (!normal) return null;
  const x = Math.round(normal.x || 0), y = Math.round(normal.y || 0), z = Math.round(normal.z || 0);
  if (y !== 0) return null;
  for (const [name, v] of Object.entries(FACINGS)) if (v.x === x && v.z === z) return name;
  return null;
}

/**
 * The air cells a painting of this size covers when hung from `anchor` (the cell in front of the clicked face).
 * Even sizes extend toward the counter-clockwise side and upward, as vanilla's painting offset does.
 */
export function paintingCells(anchor, facing, width, height) {
  const side = FACINGS[COUNTER_CLOCKWISE[facing]];
  if (!side) return [];
  const cells = [];
  for (let j = -Math.floor((height - 1) / 2); j <= Math.floor(height / 2); j++) {
    for (let i = -Math.floor((width - 1) / 2); i <= Math.floor(width / 2); i++) {
      cells.push({ x: anchor.x + side.x * i, y: anchor.y + j, z: anchor.z + side.z * i });
    }
  }
  return cells;
}

const cellKey = (c, facing) => `${c.x},${c.y},${c.z}|${facing}`;

function blockDef(id) {
  return BLOCK_DEFS?.[id];
}

/** A block a painting can hang on: anything with collision that is not a plant or a fluid. */
export function canSupportPainting(id) {
  if (id === undefined || id === null || id === BLOCKS.AIR) return false;
  const def = blockDef(id);
  if (!def) return true;
  // Tutorial:Secret door: blocks "that can hold a painting but can also be walked through ... signs, fence gates, doors,
  // and trapdoors" -- the painting door. Only solid blocks held one before.
  if (def.door || def.fenceGate || def.trapdoor || /Sign$/.test(def.name ?? '')) return true;
  return def.solid !== false && !def.plant && !def.liquid;
}

/** Space a painting can occupy: no collision there. Water is fine, as in vanilla. */
export function isFreeForPainting(id) {
  if (id === undefined || id === null || id === BLOCKS.AIR) return true;
  const def = blockDef(id);
  if (!def) return false;
  return def.solid === false || !!def.plant || !!def.liquid;
}

/**
 * Whether a painting of this size can hang here.
 * @param {(key:string)=>boolean} [occupied] true for a cell|facing already covered by another painting
 */
export function fitsAt(world, anchor, facing, width, height, occupied = () => false) {
  const normal = FACINGS[facing];
  if (!normal || !world?.getVoxel) return false;
  for (const c of paintingCells(anchor, facing, width, height)) {
    if (occupied(cellKey(c, facing))) return false;
    if (!isFreeForPainting(world.getVoxel(c.x, c.y, c.z))) return false;
    if (!canSupportPainting(world.getVoxel(c.x - normal.x, c.y, c.z - normal.z))) return false;
  }
  return true;
}

/**
 * Choose a canvas for this spot the way vanilla does: of every canvas that fits, keep those with the largest
 * area and pick one at random.
 *
 * Options narrow the choice without changing that rule: `variant` hangs exactly that canvas (or nothing),
 * `maxWidth` / `maxHeight` cap the size, and `avoid` (ids already on the wall) is skipped when any other canvas
 * of the same area fits, so a decorated room is not five copies of one picture.
 */
export function chooseVariant(world, anchor, facing, { random = Math.random, variant = null, maxWidth = 4, maxHeight = 4, avoid = null, occupied } = {}) {
  if (variant) {
    const fixed = PAINTING_BY_ID[variant];
    return fixed && fitsAt(world, anchor, facing, fixed.width, fixed.height, occupied) ? fixed : null;
  }
  const fitting = PAINTING_VARIANTS.filter(v => v.placeable && v.width <= maxWidth && v.height <= maxHeight
    && fitsAt(world, anchor, facing, v.width, v.height, occupied));
  if (!fitting.length) return null;
  const area = Math.max(...fitting.map(v => v.width * v.height));
  let pool = fitting.filter(v => v.width * v.height === area);
  if (avoid?.size) {
    const fresh = pool.filter(v => !avoid.has(v.id));
    if (fresh.length) pool = fresh;
  }
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

// --- Canvas art -------------------------------------------------------------------------------------------
//
// The game ships no painting textures, so each canvas is painted procedurally at 16 pixels per block. Every
// variant has its own palette and a composition that follows its subject (a landscape, a still life, a dark
// scene, a game screen), seeded by the id so the same painting always looks the same.

const PALETTES = {
  kebab: ['#c9a66b', '#7a4a21', '#3f8f2f', '#e9d8a6'], aztec: ['#c2a26b', '#8a6a3a', '#5a7fa8', '#e2d1a0'],
  alban: ['#6fa6d6', '#5f8f3a', '#c94f3d', '#e8e1c8'], aztec2: ['#d1b47d', '#7f5f33', '#4f6f93', '#efe0b5'],
  bomb: ['#8fb8d8', '#c8a26a', '#6a5232', '#d9d0b0'], plant: ['#e7dcc2', '#3f7f3a', '#9b5a33', '#c9b98f'],
  wasteland: ['#a7c4d9', '#9d8a63', '#5b4f3a', '#d6c9a6'], meditative: ['#2f3a4d', '#c43b3b', '#3f7f3a', '#e9d8c4'],
  wanderer: ['#b9c7d6', '#e8edf2', '#2e2a28', '#6f7f8f'], graham: ['#7fb3d9', '#c0392b', '#4b7f3a', '#f0d9a8'],
  prairie_ride: ['#e3b778', '#8a5a2b', '#5a3a1f', '#f2e3c2'], pool: ['#5aa9d6', '#e7c3a0', '#3f6f8f', '#cfe7f2'],
  courbet: ['#9fc7e3', '#6f8f3a', '#4a3a2a', '#e8d9b8'], sunset: ['#f0a04b', '#c24f3d', '#3a2a3f', '#ffd08a'],
  sea: ['#7fb8e0', '#3f6f9f', '#5f7f4a', '#e8e1c8'], creebet: ['#7fb8e0', '#3f6f9f', '#4fa83a', '#e8e1c8'],
  match: ['#2a2a2a', '#f0a030', '#e8e8e8', '#c84b2b'], bust: ['#3a1f1a', '#f06a2a', '#c8c0b0', '#ffb347'],
  stage: ['#1f2a4a', '#8a6abf', '#e0c070', '#4f8f6f'], void: ['#120f1f', '#e8e0d0', '#f05a2a', '#4a3a6a'],
  skull_and_roses: ['#141a2e', '#e8e4dc', '#c42a2a', '#2f5f3a'], wither: ['#2a2a2a', '#c8c8c8', '#5f5f8f', '#e0d070'],
  baroque: ['#1a1410', '#c9a24a', '#e8d0a0', '#f0c030'], humble: ['#8fb3d0', '#7a5a3a', '#4f8f3a', '#e0c8a0'],
  bouquet: ['#d8c8a8', '#c84a6a', '#4f8f3a', '#f0e0a0'], cavebird: ['#8fb8d8', '#7f6f5a', '#3a3028', '#e8e0d0'],
  cotan: ['#d8c8b0', '#f0c030', '#c83a4a', '#5a7f4a'], endboss: ['#3a2a28', '#a85a3a', '#e8e0d0', '#5a4a48'],
  fern: ['#c8b898', '#3f7f3a', '#f08a30', '#7a5a3a'], owlemons: ['#d0c0a0', '#f0d030', '#7a5a3a', '#3a3a3a'],
  sunflowers: ['#d8d0b8', '#f0c020', '#3f7f3a', '#8a5a3a'], tides: ['#8fc0e0', '#e0c8a0', '#3f6f9f', '#f0f0e8'],
  dennis: ['#3a4a5a', '#e8e8f0', '#8fa0b0', '#1a2028'], backyard: ['#9fc8e8', '#a85a3a', '#4f8f3a', '#e8d8c0'],
  pond: ['#3f6f5f', '#8fc0b0', '#e8d0b8', '#e8e8e0'], fighters: ['#e0a85a', '#8a4a2a', '#3a6f3a', '#f0e0c0'],
  changing: ['#6f7f9f', '#e8c070', '#3a3a4a', '#a8c8e8'], finding: ['#c8b888', '#7a5a3a', '#e8e0d0', '#5a8fbf'],
  lowmist: ['#a8b8c8', '#5a6f7f', '#e8eef2', '#3a4a5a'], passage: ['#4a3a2a', '#e8d8a8', '#5ab0e0', '#e8e8e0'],
  skeleton: ['#3a2a4a', '#e8e0d0', '#f0a030', '#8a3a3a'], donkey_kong: ['#0a0a14', '#d83a3a', '#3a8ad8', '#f0d030'],
  pointer: ['#3a5a3a', '#e8c8a0', '#8a4a2a', '#c8e0a0'], pigscene: ['#a8c8e0', '#f0a0b0', '#7a5a3a', '#3a8a3a'],
  burning_skull: ['#0a1030', '#e8e4dc', '#f06020', '#f0e0a0'], orb: ['#101a3a', '#f0f0c0', '#3a5a3a', '#7f8fbf'],
  unpacked: ['#c8b090', '#8a6a4a', '#3a6fa8', '#e8e0d0'], earth: ['#5a4a2a', '#8a7a4a', '#3f6f2f', '#c8b080'],
  wind: ['#c8d8e8', '#e8f0f8', '#8fa8c0', '#5a7090'], fire: ['#3a0a0a', '#f05a1a', '#f0c030', '#a01a0a'],
  water: ['#0a2a5a', '#3a7fc0', '#8fc8f0', '#e0f0f8']
};

const STYLE = {
  landscape: ['alban', 'wasteland', 'wanderer', 'prairie_ride', 'courbet', 'sunset', 'sea', 'creebet', 'cavebird', 'tides', 'backyard', 'pond', 'lowmist', 'passage', 'orb', 'humble', 'fighters', 'finding', 'changing', 'bomb', 'aztec', 'aztec2', 'pool', 'wind', 'water', 'earth'],
  dark: ['match', 'bust', 'void', 'skull_and_roses', 'wither', 'burning_skull', 'skeleton', 'endboss', 'dennis', 'stage', 'fire'],
  still: ['kebab', 'plant', 'meditative', 'baroque', 'bouquet', 'cotan', 'fern', 'owlemons', 'sunflowers', 'unpacked'],
  screen: ['donkey_kong', 'graham', 'pointer', 'pigscene']
};
const styleOf = id => Object.keys(STYLE).find(k => STYLE[k].includes(id)) || 'landscape';

function seeded(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Paint one canvas into a 2D context sized width*16 by height*16. */
export function paintCanvas(ctx, variant) {
  const W = variant.width * 16, H = variant.height * 16;
  const [a, b, c, d] = PALETTES[variant.id] || ['#8a6a4a', '#5a4a3a', '#c8a878', '#e8d8b8'];
  const rand = seeded(variant.id);
  const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h)); };
  const style = styleOf(variant.id);

  if (style === 'landscape') {
    const horizon = H * (0.45 + rand() * 0.2);
    for (let y = 0; y < horizon; y++) px(0, y, W, 1, y < horizon * 0.5 ? a : d);
    // A ridge line of hills or mountains.
    let ridge = horizon - 2 - rand() * 4;
    for (let x = 0; x < W; x++) {
      ridge = Math.max(H * 0.2, Math.min(horizon, ridge + (rand() - 0.5) * 3));
      px(x, ridge, 1, horizon - ridge + 1, b);
    }
    px(0, horizon, W, H - horizon, c);
    for (let i = 0; i < W * H / 40; i++) px(rand() * W, horizon + rand() * (H - horizon), 1, 1, b);
    // A sun or moon, and one small figure.
    px(W * (0.15 + rand() * 0.6), H * 0.08, 3, 3, d);
    px(W * (0.3 + rand() * 0.4), horizon - 4, 2, 4, '#2a2420');
  } else if (style === 'dark') {
    px(0, 0, W, H, a);
    for (let i = 0; i < W * H / 6; i++) px(rand() * W, H * 0.6 + rand() * H * 0.4, 1, 1, rand() < 0.5 ? c : d);
    const cx = W / 2, cy = H * 0.42, r = Math.min(W, H) * 0.22;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, 1, 1, b);
    px(cx - r * 0.5, cy - r * 0.15, Math.max(1, r * 0.35), Math.max(1, r * 0.35), a);
    px(cx + r * 0.15, cy - r * 0.15, Math.max(1, r * 0.35), Math.max(1, r * 0.35), a);
    px(cx - r * 0.3, cy + r * 0.45, r * 0.6, 1, a);
  } else if (style === 'still') {
    px(0, 0, W, H, a);
    px(0, H * 0.7, W, H * 0.3, d);
    const items = Math.max(1, variant.width);
    for (let i = 0; i < items; i++) {
      const x = (i + 0.5) * W / items;
      px(x - 3, H * 0.55, 6, H * 0.18, c);
      for (let k = 0; k < 14; k++) px(x - 5 + rand() * 10, H * (0.15 + rand() * 0.4), 2, 2, b);
    }
  } else {
    px(0, 0, W, H, a);
    for (let row = 1; row < 5; row++) {
      const y = row * H / 5;
      for (let x = 0; x < W; x += 2) px(x, y + ((x / 2 + row) % 2), 2, 1, b);
    }
    for (let i = 0; i < 4 * variant.width; i++) px(rand() * (W - 3), rand() * (H - 4), 3, 4, rand() < 0.5 ? c : d);
  }
  // A one-pixel edge so the canvas reads against any wall.
  ctx.strokeStyle = 'rgba(40, 28, 18, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

const textureCache = new Map();

function canvasTexture(variant) {
  if (textureCache.has(variant.id)) return textureCache.get(variant.id);
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = variant.width * 16;
  canvas.height = variant.height * 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintCanvas(ctx, variant);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(variant.id, texture);
  return texture;
}

const THICKNESS = 1 / 16;
const YAW = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

function buildMesh(painting) {
  const texture = canvasTexture(painting.variant);
  if (!texture) return null;
  const back = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const front = new THREE.MeshLambertMaterial({ map: texture });
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z; local +z is turned to face out of the wall.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(painting.width, painting.height, THICKNESS), [back, back, back, back, front, back]);
  const centre = paintingCentre(painting);
  mesh.position.set(centre.x, centre.y, centre.z);
  mesh.rotation.y = YAW[painting.facing];
  mesh.userData.painting = painting;
  return mesh;
}

/** World-space centre of a painting's box. */
export function paintingCentre(painting) {
  const cells = painting.cells;
  const sum = cells.reduce((s, c) => ({ x: s.x + c.x, y: s.y + c.y, z: s.z + c.z }), { x: 0, y: 0, z: 0 });
  const n = FACINGS[painting.facing];
  const inset = 0.5 - THICKNESS / 2;
  return {
    x: sum.x / cells.length + 0.5 - n.x * inset,
    y: sum.y / cells.length + 0.5,
    z: sum.z / cells.length + 0.5 - n.z * inset
  };
}

let nextPaintingId = 1;

export class PaintingManager {
  constructor(game, { random = Math.random } = {}) {
    this.game = game;
    this.random = random;
    this.paintings = [];
    this.occupancy = new Map();
    this.checkTimer = 0;
  }

  get world() {
    return this.game?.world;
  }

  /** Paintings belong to the dimension they were hung in; only that dimension's are live. */
  get dimension() {
    return this.game?.currentDimension || 'overworld';
  }

  /** The paintings of the current dimension. */
  active() {
    const dimension = this.dimension;
    return this.paintings.filter(p => p.dimension === dimension);
  }

  isOccupied(key) {
    return this.occupancy.has(`${this.dimension}|${key}`);
  }

  /**
   * Hang a painting with its anchor at the air cell in front of a wall face.
   * @param {{x:number,y:number,z:number}} anchor
   * @param {'north'|'south'|'east'|'west'} facing
   * @param {{variant?:string, maxWidth?:number, maxHeight?:number, avoid?:Set<string>, silent?:boolean}} [options]
   * @returns {object|null} the painting, or null when nothing fits there
   */
  place(anchor, facing, options = {}) {
    if (!FACINGS[facing]) return null;
    const at = { x: Math.floor(anchor.x), y: Math.floor(anchor.y), z: Math.floor(anchor.z) };
    const variant = chooseVariant(this.world, at, facing, { random: this.random, occupied: k => this.isOccupied(k), ...options });
    if (!variant) return null;
    const painting = {
      id: options.id || `painting_${nextPaintingId++}`,
      variant,
      variantId: variant.id,
      facing,
      width: variant.width,
      height: variant.height,
      anchor: at,
      cells: paintingCells(at, facing, variant.width, variant.height),
      dimension: this.dimension,
      unsupportedFor: 0,
      mesh: null
    };
    this.paintings.push(painting);
    for (const c of painting.cells) this.occupancy.set(`${painting.dimension}|${cellKey(c, facing)}`, painting);
    if (this.game?.scene) {
      painting.mesh = buildMesh(painting);
      if (painting.mesh) this.game.scene.add(painting.mesh);
    }
    if (!options.silent) this.game?.sounds?.playPlace?.();
    return painting;
  }

  /** Take a painting down, dropping it as an item unless `drop` is false. */
  remove(painting, { drop = true } = {}) {
    const index = this.paintings.indexOf(painting);
    if (index < 0) return false;
    this.paintings.splice(index, 1);
    for (const c of painting.cells) this.occupancy.delete(`${painting.dimension}|${cellKey(c, painting.facing)}`);
    if (painting.mesh) {
      this.game?.scene?.remove(painting.mesh);
      painting.mesh.geometry?.dispose?.();
      painting.mesh = null;
    }
    if (drop) {
      const centre = paintingCentre(painting);
      const at = typeof THREE.Vector3 === 'function' ? new THREE.Vector3(centre.x, centre.y, centre.z) : centre;
      this.game?.entities?.spawnDroppedItem?.(at, 'painting', false, 1);
    }
    this.game?.sounds?.playBreak?.();
    return true;
  }

  /** A player hit the painting: it breaks, and drops unless that player is in creative. */
  breakByPlayer(painting, player = this.game?.player) {
    return this.remove(painting, { drop: player?.gamemode !== 'creative' });
  }

  /** Whether a hung painting still has its wall behind it and free space in front. */
  isSupported(painting) {
    const world = this.world;
    const n = FACINGS[painting.facing];
    return painting.cells.every(c => isFreeForPainting(world.getVoxel(c.x, c.y, c.z))
      && canSupportPainting(world.getVoxel(c.x - n.x, c.y, c.z - n.z)));
  }

  /** Break paintings whose support has been gone for a second. Checked four times a second. */
  update(dt) {
    if (!this.paintings.length || !this.world?.getVoxel) return;
    this.checkTimer += dt;
    if (this.checkTimer < 0.25) return;
    const elapsed = this.checkTimer;
    this.checkTimer = 0;
    const dimension = this.dimension;
    for (const painting of this.paintings) if (painting.mesh) painting.mesh.visible = painting.dimension === dimension;
    for (const painting of this.active()) {
      if (this.isSupported(painting)) { painting.unsupportedFor = 0; continue; }
      painting.unsupportedFor += elapsed;
      if (painting.unsupportedFor >= PAINTING_BREAK_DELAY_SECONDS) this.remove(painting, { drop: true });
    }
  }

  /**
   * The nearest painting a ray hits within `maxDistance`, with the distance.
   * @returns {{painting:object, distance:number}|null}
   */
  raycast(origin, direction, maxDistance = 5) {
    let best = null;
    for (const painting of this.active()) {
      const n = FACINGS[painting.facing];
      const axis = n.x !== 0 ? 'x' : 'z';
      const sign = n.x !== 0 ? n.x : n.z;
      const face = painting.anchor[axis] + 0.5 - sign * 0.5 + sign * THICKNESS;
      const d = direction[axis];
      if (Math.abs(d) < 1e-9 || Math.sign(d) === Math.sign(sign)) continue; // parallel, or looking at its back
      const t = (face - origin[axis]) / d;
      if (t < 0 || t > maxDistance || (best && t >= best.distance)) continue;
      const hit = { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
      const other = axis === 'x' ? 'z' : 'x';
      const xs = painting.cells.map(c => c[other]), ys = painting.cells.map(c => c.y);
      if (hit[other] < Math.min(...xs) || hit[other] > Math.max(...xs) + 1) continue;
      if (hit.y < Math.min(...ys) || hit.y > Math.max(...ys) + 1) continue;
      best = { painting, distance: t };
    }
    return best;
  }

  /** Paintings whose cells fall inside a box (inclusive block coordinates). */
  paintingsIn(box) {
    return this.active().filter(p => p.cells.some(c => c.x >= box.minX && c.x <= box.maxX
      && c.y >= box.minY && c.y <= box.maxY && c.z >= box.minZ && c.z <= box.maxZ));
  }

  clear() {
    for (const painting of [...this.paintings]) this.remove(painting, { drop: false });
  }

  /** The current dimension's paintings, which is what a save holds (it stores that dimension's chunks). */
  serialize() {
    return this.active().map(p => ({ variant: p.variantId, facing: p.facing, x: p.anchor.x, y: p.anchor.y, z: p.anchor.z }));
  }

  /** Re-hang saved paintings. A saved painting keeps its canvas; one that no longer fits is skipped. */
  restore(list) {
    this.clear();
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry || !PAINTING_BY_ID[entry.variant]) continue;
      this.place({ x: entry.x, y: entry.y, z: entry.z }, entry.facing, { variant: entry.variant, silent: true });
    }
  }
}
