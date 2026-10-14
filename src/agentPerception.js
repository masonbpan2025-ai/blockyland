// What the Agent Terminal knows about the world around the player, gathered fresh for every prompt.
//
// The agent used to see the player's coordinates, a 33x33 map of surface glyphs, one ray straight ahead and the
// buildings it had built itself. That is not enough to act on what a player actually says. "Decorate the house
// with some paintings", said while standing in a village house, needs the agent to know that the player is
// indoors, which walls belong to that room, where the windows and the door are and how much wall is free.
// Nothing said that.
//
// This module answers those questions from the voxels, with no renderer involved:
//
//   * enclosure  - the room the player is standing in: a flood fill of the roofed air around them, with its
//                  walls, floor, ceiling, doors, windows, furniture and the wall space free for decoration;
//   * structures - clusters of player-made blocks nearby (houses, walls, farms), linked to the agent's own builds
//                  and to generated structures such as villages, each with an id a plan can target;
//   * view       - a sweep of rays across the player's field of view: what fills the left, centre and right of
//                  the screen, how far away it is, and which creatures are in sight;
//   * entities   - the creatures around the player, grouped by type with distance and direction;
//   * world      - biome, biomes and terrain further out, time of day, weather, dimension;
//   * player     - health, food, mode, what they hold and what they are standing on.
//
// `formatPerception` turns the snapshot into the prompt section, and lists the reference ids ("current_room",
// "looking_at", "nearby_1", ...) that the agent's plans may name as a target.
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { getBiomeDef } from './biomes.js';
import { CHUNK_HEIGHT } from './world.js';
import { FACINGS, canSupportPainting } from './paintings.js';

const MAX_ROOF_SCAN = 24;
const MAX_ROOM_CELLS = 4000;
const ROOM_RADIUS = 24;
const ROOM_VERTICAL = 12;
const STRUCTURE_RADIUS = 24;
const ENTITY_RADIUS = 32;
const VIEW_DISTANCE = 64;

// --- Block vocabulary ---------------------------------------------------------------------------------------

const NAME_BY_ID = new Map(Object.entries(BLOCKS).map(([name, id]) => [id, name]));

/** The BLOCKS key for an id (OAK_PLANKS), which is also the name plans use. */
export function blockKey(id) {
  return NAME_BY_ID.get(id) || `BLOCK_${id}`;
}

function def(id) {
  return BLOCK_DEFS?.[id];
}

const MANMADE_PATTERN = /PLANKS|BRICK|COBBLESTONE|GLASS|WOOL|CONCRETE|GLAZED|DOOR|_BED|^BED|CHEST|BARREL|CRAFTING|FURNACE|SMOKER|TORCH|LANTERN|_LAMP|FENCE|STAIRS|SLAB|BOOKSHELF|CARPET|POLISHED|SMOOTH|^CUT_|CHISELED|LADDER|_WALL$|PANE|QUARTZ|HAY_BLOCK|STRIPPED|BANNER|SIGN|ANVIL|ENCHANTING|BREWING|CAULDRON|LECTERN|LOOM|STONECUTTER|GRINDSTONE|COMPOSTER|BELL|BEACON|JUKEBOX|NOTE_BLOCK|HOPPER|DISPENSER|DROPPER|PISTON|OBSERVER|REDSTONE_WIRE|REPEATER|COMPARATOR|LEVER|BUTTON|PRESSURE_PLATE|^TNT$|FLOWER_POT|POTTED|CANDLE|CAMPFIRE|SCAFFOLDING|PRISMARINE|PURPUR|TILES|^(IRON|GOLD|DIAMOND|EMERALD|LAPIS|REDSTONE|COAL|NETHERITE|COPPER|RAW_IRON|RAW_GOLD|RAW_COPPER)_BLOCK$|CARTOGRAPHY|FLETCHING|SMITHING|BLAST_FURNACE|SEA_LANTERN|TARGET/;
// Paths, farmland and rails are made by players too, but they run along the ground between buildings: counting
// them would merge a whole village into one structure.
const FURNITURE_PATTERN = /_BED|^BED|CHEST|BARREL|CRAFTING|FURNACE|SMOKER|BOOKSHELF|CARPET|LANTERN|TORCH|_LAMP|FLOWER_POT|POTTED|CANDLE|CAMPFIRE|ANVIL|ENCHANTING|BREWING|CAULDRON|LECTERN|LOOM|STONECUTTER|GRINDSTONE|COMPOSTER|BELL|JUKEBOX|NOTE_BLOCK|CARTOGRAPHY|FLETCHING|SMITHING|BLAST_FURNACE|BANNER|SIGN|ARMOR_STAND|SEA_LANTERN|CHAIN$/;
const DOOR_PATTERN = /DOOR(?!.*TRAP)|FENCE_GATE/;
const WINDOW_PATTERN = /GLASS|PANE/;
const LEAF_PATTERN = /LEAVES|VINE|HANGING_MOSS|COBWEB/;

const flags = new Map();
function classify(id) {
  if (flags.has(id)) return flags.get(id);
  const key = blockKey(id);
  const d = def(id);
  const passable = id === BLOCKS.AIR || !d || d.solid === false || !!d.plant || !!d.liquid;
  const out = {
    key,
    passable: passable && !DOOR_PATTERN.test(key),
    manmade: MANMADE_PATTERN.test(key) && !/_ORE$/.test(key),
    furniture: FURNITURE_PATTERN.test(key),
    door: DOOR_PATTERN.test(key),
    window: WINDOW_PATTERN.test(key),
    leaf: LEAF_PATTERN.test(key),
    liquid: !!d?.liquid,
    // Light-emitting decoration, so "light up the room" can see what is already there.
    light: /TORCH|LANTERN|_LAMP|GLOWSTONE|CAMPFIRE|CANDLE|SHROOMLIGHT|SEA_LANTERN|FROGLIGHT/.test(key)
  };
  flags.set(id, out);
  return out;
}

export const isPassable = id => classify(id).passable;
export const isManMade = id => id !== BLOCKS.AIR && classify(id).manmade;

/** A block a decoration may hang on: a support for paintings that is not a window or a door. */
export function isDecoratableWall(id) {
  const c = classify(id);
  return canSupportPainting(id) && !c.window && !c.door && !c.furniture;
}

// --- Directions -----------------------------------------------------------------------------------------------

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Eight-way compass direction from one point to another (north is -Z, east is +X). */
export function compassDirection(dx, dz) {
  if (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5) return 'here';
  const angle = Math.atan2(dx, -dz); // 0 = north, clockwise
  const index = Math.round(((angle * 180 / Math.PI + 360) % 360) / 45) % 8;
  return COMPASS[index];
}

/** The four-way facing of a yaw, matching the agent's existing wording. */
export function facingName(yaw) {
  const degrees = (((yaw * 180) / Math.PI) % 360 + 360) % 360;
  if (degrees < 45 || degrees >= 315) return 'north';
  if (degrees < 135) return 'west';
  if (degrees < 225) return 'south';
  return 'east';
}

/** Look direction for the game's camera convention: yaw 0 looks toward -Z, positive pitch looks up. */
export function lookVector(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: -Math.cos(yaw) * cosPitch };
}

/** Where a point lies relative to where the player is looking: ahead, behind, to the left or right. */
export function relativeBearing(yaw, dx, dz) {
  const look = lookVector(yaw, 0);
  const forward = look.x * dx + look.z * dz;
  const right = -look.z * dx + look.x * dz;
  const angle = Math.atan2(right, forward) * 180 / Math.PI;
  if (Math.abs(angle) <= 30) return 'ahead';
  if (Math.abs(angle) >= 150) return 'behind';
  if (angle > 0) return angle < 75 ? 'ahead-right' : angle > 105 ? 'behind-right' : 'right';
  return angle > -75 ? 'ahead-left' : angle < -105 ? 'behind-left' : 'left';
}

// --- Rooms ----------------------------------------------------------------------------------------------------

const cellKey = (x, y, z) => `${x},${y},${z}`;

function makeRoofTest(world, maxY) {
  const cache = new Map();
  return (x, y, z) => {
    const key = cellKey(x, y, z);
    if (cache.has(key)) return cache.get(key);
    let roofed = false;
    for (let yy = y + 1; yy <= Math.min(maxY, y + MAX_ROOF_SCAN); yy++) {
      const id = world.getVoxel(x, yy, z);
      if (id === undefined || id === null || id === BLOCKS.AIR) continue;
      const c = classify(id);
      if (c.passable || c.leaf) continue;
      roofed = true;
      break;
    }
    cache.set(key, roofed);
    return roofed;
  };
}

/**
 * The room containing `start`: every roofed, walkable air cell reachable from it without passing a door or a
 * solid block. Air open to the sky is where the room ends, which is what makes a doorway or a broken wall an
 * exit rather than a leak into the whole world.
 *
 * @returns {object|null} null when `start` is under open sky
 */
export function analyzeEnclosure(world, start, { maxY = 255, maxCells = MAX_ROOM_CELLS } = {}) {
  if (!world?.getVoxel || !start) return null;
  let origin = { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) };
  if (!isPassable(world.getVoxel(origin.x, origin.y, origin.z))) origin = { ...origin, y: origin.y + 1 };
  if (!isPassable(world.getVoxel(origin.x, origin.y, origin.z))) return null;
  const roofed = makeRoofTest(world, maxY);
  if (!roofed(origin.x, origin.y, origin.z)) return null;

  const interior = new Map();
  const queue = [origin];
  interior.set(cellKey(origin.x, origin.y, origin.z), origin);
  const openings = new Map();
  const doors = new Map();
  let truncated = false;
  const steps = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy, dz] of steps) {
      const x = c.x + dx, y = c.y + dy, z = c.z + dz;
      const key = cellKey(x, y, z);
      if (interior.has(key)) continue;
      if (Math.abs(x - origin.x) > ROOM_RADIUS || Math.abs(z - origin.z) > ROOM_RADIUS || Math.abs(y - origin.y) > ROOM_VERTICAL) { truncated = true; continue; }
      const id = world.getVoxel(x, y, z);
      const info = classify(id);
      if (info.door) {
        if (!doors.has(key)) doors.set(key, { x, y, z, block: info.key, open: def(id)?.solid === false });
        continue;
      }
      if (!info.passable) continue;
      if (dy === 0 && !roofed(x, y, z)) {
        if (!openings.has(key)) openings.set(key, { x, y, z });
        continue;
      }
      if (dy !== 0 && !roofed(x, y, z)) continue;
      if (interior.size >= maxCells) { truncated = true; continue; }
      const cell = { x, y, z };
      interior.set(key, cell);
      queue.push(cell);
    }
  }

  const cells = [...interior.values()];
  const bounds = cells.reduce((b, c) => ({
    minX: Math.min(b.minX, c.x), maxX: Math.max(b.maxX, c.x),
    minY: Math.min(b.minY, c.y), maxY: Math.max(b.maxY, c.y),
    minZ: Math.min(b.minZ, c.z), maxZ: Math.max(b.maxZ, c.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });

  // The lowest air cell of each column is standing height; the one above it is eye height.
  const columnFloor = new Map();
  for (const c of cells) {
    const key = `${c.x},${c.z}`;
    if (!columnFloor.has(key) || c.y < columnFloor.get(key)) columnFloor.set(key, c.y);
  }
  // Furniture stands on the floor rather than being it: above a bed the eye-level row is still the second block
  // up from the real floor, which is where a painting over a bed goes.
  for (const [key, y] of columnFloor) {
    const [x, z] = key.split(',').map(Number);
    let floor = y;
    while (floor > y - 2 && classify(world.getVoxel(x, floor - 1, z) ?? BLOCKS.AIR).furniture) floor--;
    columnFloor.set(key, floor);
  }

  const wallMaterials = new Map();
  const floorMaterials = new Map();
  const ceilingMaterials = new Map();
  const furniture = new Map();
  const windows = new Map();
  const lights = [];
  let manmade = 0, structural = 0;
  // One entry per interior cell and wall side: the faces a decoration can hang on.
  const faces = [];

  const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  for (const c of cells) {
    const here = world.getVoxel(c.x, c.y, c.z);
    if (here !== BLOCKS.AIR && here !== undefined && here !== null) {
      const info = classify(here);
      if (info.furniture) furniture.set(cellKey(c.x, c.y, c.z), { x: c.x, y: c.y, z: c.z, block: info.key });
      if (info.light) lights.push({ x: c.x, y: c.y, z: c.z, block: info.key });
    }
    const below = world.getVoxel(c.x, c.y - 1, c.z);
    // A chest or a bed under an air cell is furniture, not floor (and the same for anything hanging above).
    if (!interior.has(cellKey(c.x, c.y - 1, c.z)) && !isPassable(below) && !classify(below).furniture) count(floorMaterials, blockKey(below));
    const above = world.getVoxel(c.x, c.y + 1, c.z);
    if (!interior.has(cellKey(c.x, c.y + 1, c.z)) && !isPassable(above) && !classify(above).furniture) count(ceilingMaterials, blockKey(above));

    for (const [side, n] of Object.entries(FACINGS)) {
      const wx = c.x + n.x, wz = c.z + n.z;
      const wallKey = cellKey(wx, c.y, wz);
      if (interior.has(wallKey) || doors.has(wallKey)) continue;
      const id = world.getVoxel(wx, c.y, wz);
      if (id === undefined || id === null || isPassable(id)) continue;
      const info = classify(id);
      if (info.furniture) { furniture.set(wallKey, { x: wx, y: c.y, z: wz, block: info.key }); continue; }
      if (info.light) lights.push({ x: wx, y: c.y, z: wz, block: info.key });
      if (info.window) windows.set(wallKey, { x: wx, y: c.y, z: wz, block: info.key, side });
      count(wallMaterials, info.key);
      structural++;
      if (info.manmade) manmade++;
      // `side` names the wall (the north wall is the one to the north of the room); a painting on it faces back
      // into the room, the opposite way.
      const height = c.y - (columnFloor.get(`${c.x},${c.z}`) ?? c.y);
      faces.push({ side, x: c.x, y: c.y, z: c.z, wall: { x: wx, y: c.y, z: wz }, height, decoratable: isDecoratableWall(id) && here === BLOCKS.AIR });
    }
  }
  const share = structural ? manmade / structural : 0;
  const kind = share >= 0.5 ? 'building' : share >= 0.15 ? 'shelter' : 'cave';
  const top = (map, n = 4) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([block, amount]) => ({ block, count: amount }));

  // Per wall side: its extent and the free, eye-level wall space a painting could use.
  const walls = {};
  for (const side of Object.keys(FACINGS)) {
    const onSide = faces.filter(f => f.side === side);
    if (!onSide.length) continue;
    const eye = onSide.filter(f => f.height === 1);
    const along = side === 'north' || side === 'south' ? 'x' : 'z';
    const values = onSide.map(f => f[along]);
    walls[side] = {
      side,
      faces: onSide.length,
      from: Math.min(...values),
      to: Math.max(...values),
      along,
      plane: side === 'north' ? Math.min(...onSide.map(f => f.wall.z)) : side === 'south' ? Math.max(...onSide.map(f => f.wall.z))
        : side === 'west' ? Math.min(...onSide.map(f => f.wall.x)) : Math.max(...onSide.map(f => f.wall.x)),
      freeEyeLevel: eye.filter(f => f.decoratable).length,
      windows: [...windows.values()].filter(w => w.side === side).length,
      doors: [...doors.values()].filter(d => !/_TOP/.test(d.block) && ((side === 'north' && d.z < bounds.minZ) || (side === 'south' && d.z > bounds.maxZ)
        || (side === 'west' && d.x < bounds.minX) || (side === 'east' && d.x > bounds.maxX))).length
    };
  }

  const floorY = Math.min(...columnFloor.values());
  const area = columnFloor.size;
  return {
    origin,
    kind,
    manmadeShare: Number(share.toFixed(2)),
    truncated,
    cells: interior,
    interior: bounds,
    // The room with its shell: one block of wall, floor and ceiling around the air.
    bounds: { minX: bounds.minX - 1, maxX: bounds.maxX + 1, minY: bounds.minY - 1, maxY: bounds.maxY + 1, minZ: bounds.minZ - 1, maxZ: bounds.maxZ + 1 },
    floorY,
    ceilingHeight: bounds.maxY - floorY + 1,
    floorArea: area,
    volume: interior.size,
    walls,
    faces,
    wallMaterials: top(wallMaterials),
    floorMaterials: top(floorMaterials, 2),
    ceilingMaterials: top(ceilingMaterials, 2),
    doors: [...doors.values()].filter(d => !/_TOP/.test(d.block)),
    openings: [...openings.values()],
    windows: [...windows.values()],
    furniture: [...furniture.values()],
    lights
  };
}

// --- Structures nearby ------------------------------------------------------------------------------------------

/**
 * Clusters of player-made blocks around a point: anything from a house to a fence line. Natural terrain, trees and
 * ore are left out, so what remains is what somebody built.
 */
export function findStructures(world, center, { radius = STRUCTURE_RADIUS, below = 8, above = 16, minBlocks = 10, maxY = 255 } = {}) {
  if (!world?.getVoxel) return [];
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  const found = new Map();
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      for (let y = Math.max(1, cy - below); y <= Math.min(maxY, cy + above); y++) {
        const id = world.getVoxel(x, y, z);
        if (id && id !== BLOCKS.AIR && isManMade(id)) found.set(cellKey(x, y, z), { x, y, z, id });
      }
    }
  }

  const seen = new Set();
  const clusters = [];
  for (const [key, cell] of found) {
    if (seen.has(key)) continue;
    const members = [];
    const queue = [cell];
    seen.add(key);
    while (queue.length) {
      const c = queue.pop();
      members.push(c);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = cellKey(c.x + dx, c.y + dy, c.z + dz);
        if (!seen.has(k) && found.has(k)) { seen.add(k); queue.push(found.get(k)); }
      }
    }
    if (members.length < minBlocks) continue;
    const box = members.reduce((b, c) => ({
      minX: Math.min(b.minX, c.x), maxX: Math.max(b.maxX, c.x), minY: Math.min(b.minY, c.y), maxY: Math.max(b.maxY, c.y),
      minZ: Math.min(b.minZ, c.z), maxZ: Math.max(b.maxZ, c.z)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const materials = new Map();
    const features = { doors: 0, windows: 0, beds: 0, chests: 0, lights: 0, workstations: 0 };
    for (const m of members) {
      const info = classify(m.id);
      materials.set(info.key, (materials.get(info.key) || 0) + 1);
      if (info.door && !/_TOP/.test(info.key)) features.doors++;
      if (info.window) features.windows++;
      if (/_BED_FOOT|_BED$|^BED/.test(info.key)) features.beds++;
      if (/CHEST|BARREL/.test(info.key)) features.chests++;
      if (info.light) features.lights++;
      if (/CRAFTING|FURNACE|SMOKER|LECTERN|LOOM|STONECUTTER|GRINDSTONE|COMPOSTER|CARTOGRAPHY|FLETCHING|SMITHING|BREWING|CAULDRON|BARREL/.test(info.key)) features.workstations++;
    }
    const size = { width: box.maxX - box.minX + 1, height: box.maxY - box.minY + 1, depth: box.maxZ - box.minZ + 1 };
    const centre = { x: (box.minX + box.maxX + 1) / 2, y: box.minY, z: (box.minZ + box.maxZ + 1) / 2 };
    const inside = center.x >= box.minX && center.x <= box.maxX + 1 && center.z >= box.minZ && center.z <= box.maxZ + 1 && center.y >= box.minY - 1 && center.y <= box.maxY + 1;
    const kind = features.doors && size.height >= 3 ? 'building'
      : size.height <= 2 && (size.width >= 6 || size.depth >= 6) ? 'path, floor or fence'
        : size.height >= 6 && size.width <= 5 && size.depth <= 5 ? 'tower or pillar' : 'structure';
    clusters.push({
      box, size, centre, inside, kind, blocks: members.length, features,
      materials: [...materials.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([block, amount]) => ({ block, count: amount })),
      distance: Math.hypot(centre.x - center.x, centre.z - center.z),
      direction: compassDirection(centre.x - center.x, centre.z - center.z)
    });
  }
  return clusters.sort((a, b) => (b.inside - a.inside) || a.distance - b.distance);
}

const planCache = new WeakMap();

/** Generated structures (villages, temples, ...) whose bounds come near the player. */
export function generatedStructuresNear(world, center, chunkRadius = 4) {
  const engine = world?.structures;
  if (!engine || typeof engine.planChunk !== 'function') return [];
  let cache = planCache.get(engine);
  if (!cache) planCache.set(engine, cache = new Map());
  const pcx = Math.floor(center.x / 16), pcz = Math.floor(center.z / 16);
  const out = [];
  for (let x = pcx - chunkRadius; x <= pcx + chunkRadius; x++) {
    for (let z = pcz - chunkRadius; z <= pcz + chunkRadius; z++) {
      const key = `${x},${z}`;
      if (!cache.has(key)) {
        let plan = null;
        try { plan = engine.planChunk(x, z); } catch { plan = null; }
        cache.set(key, plan);
      }
      const start = cache.get(key);
      const box = start?.tightBox || start?.box;
      if (!box) continue;
      const pieces = (start.pieces || []).filter(p => p.box && center.x >= p.box.minX && center.x <= p.box.maxX + 1
        && center.z >= p.box.minZ && center.z <= p.box.maxZ + 1 && center.y >= p.box.minY - 1 && center.y <= p.box.maxY + 2);
      const centre = { x: (box.minX + box.maxX + 1) / 2, z: (box.minZ + box.maxZ + 1) / 2 };
      out.push({
        structureId: String(start.structureId || 'structure').replace(/^minecraft:/, ''),
        box: { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY, minZ: box.minZ, maxZ: box.maxZ },
        inside: center.x >= box.minX && center.x <= box.maxX + 1 && center.z >= box.minZ && center.z <= box.maxZ + 1,
        pieceHere: pieces[0]?.id ? String(pieces[0].id).replace(/^minecraft:/, '') : (pieces.length ? 'a piece of it' : null),
        distance: Math.hypot(centre.x - center.x, centre.z - center.z),
        direction: compassDirection(centre.x - center.x, centre.z - center.z)
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, 6);
}

// --- The player's view -----------------------------------------------------------------------------------------

/** First non-passable block along a ray, by stepping (the precision a summary needs, no more). */
export function castRay(world, origin, dir, maxDistance = VIEW_DISTANCE, step = 0.2) {
  let water = false;
  let previous = null;
  for (let t = 0.3; t <= maxDistance; t += step) {
    const x = Math.floor(origin.x + dir.x * t), y = Math.floor(origin.y + dir.y * t), z = Math.floor(origin.z + dir.z * t);
    const id = world.getVoxel(x, y, z);
    const info = classify(id ?? BLOCKS.AIR);
    if (id === undefined || id === null || id === BLOCKS.AIR || info.liquid || (info.passable && !info.furniture)) {
      if (info.liquid) water = true;
      if (!previous || previous.x !== x || previous.y !== y || previous.z !== z) previous = { x, y, z };
      continue;
    }
    // `previous` is the open cell the ray left, i.e. the side of the block being looked at.
    return { x, y, z, id, block: info.key, distance: t, throughWater: water, front: previous };
  }
  return null;
}

/**
 * What fills the screen: a 7x5 grid of rays across the camera's field of view, summarised as nine regions.
 * The screenshot shows the same thing, but this is exact where the picture is ambiguous or not attached.
 */
export function sampleView(game, { cols = 7, rows = 5 } = {}) {
  const world = game?.world, player = game?.player;
  if (!world?.getVoxel || !player?.position) return null;
  const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
  const pitch = Number.isFinite(player.pitch) ? player.pitch : 0;
  const vfov = (game.camera?.fov || 70) * Math.PI / 180;
  const aspect = game.camera?.aspect || 16 / 9;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const eye = { x: player.position.x, y: player.position.y + 1.62, z: player.position.z };
  const regions = new Map();
  let sky = 0, total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = cols === 1 ? 0 : c / (cols - 1) - 0.5, v = rows === 1 ? 0 : 0.5 - r / (rows - 1);
      const dir = lookVector(yaw - u * hfov * 0.9, pitch + v * vfov * 0.9);
      const hit = castRay(world, eye, dir);
      total++;
      const region = `${v > 0.15 ? 'upper' : v < -0.15 ? 'lower' : 'middle'} ${u < -0.15 ? 'left' : u > 0.15 ? 'right' : 'centre'}`;
      if (!regions.has(region)) regions.set(region, []);
      if (!hit) { sky++; regions.get(region).push(null); continue; }
      regions.get(region).push(hit);
    }
  }
  const summary = [];
  for (const [region, hits] of regions) {
    const solid = hits.filter(Boolean);
    if (!solid.length) { summary.push({ region, text: 'open sky / nothing within 64 blocks' }); continue; }
    const byBlock = new Map();
    for (const h of solid) byBlock.set(h.block, (byBlock.get(h.block) || 0) + 1);
    const main = [...byBlock.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const near = Math.min(...solid.map(h => h.distance));
    summary.push({ region, text: `${main} (${near.toFixed(0)}m)${byBlock.size > 1 ? ` and ${[...byBlock.keys()].filter(k => k !== main).slice(0, 2).join(', ')}` : ''}${solid.length < hits.length ? ', some sky' : ''}` });
  }
  const crosshair = castRay(world, eye, lookVector(yaw, pitch));
  return { facing: facingName(yaw), pitchDegrees: Math.round(pitch * 180 / Math.PI), skyShare: total ? sky / total : 0, regions: summary, crosshair, hfov, vfov };
}

// --- Creatures --------------------------------------------------------------------------------------------------

const HOSTILE = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'bogged', 'creeper', 'spider', 'cave_spider', 'enderman', 'witch', 'slime', 'magma_cube', 'phantom', 'pillager', 'vindicator', 'evoker', 'ravager', 'vex', 'blaze', 'ghast', 'wither_skeleton', 'piglin_brute', 'hoglin', 'zoglin', 'guardian', 'elder_guardian', 'shulker', 'silverfish', 'endermite', 'warden', 'breeze', 'creaking', 'zombie_villager', 'wither', 'ender_dragon', 'giant']);

export function describeEntities(game, view, radius = ENTITY_RADIUS) {
  const mobs = game?.mobs?.mobs;
  const player = game?.player;
  if (!Array.isArray(mobs) || !player?.position) return [];
  const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
  const groups = new Map();
  for (const m of mobs) {
    const p = m?.mesh?.position || m?.position;
    if (!p || m.health <= 0 || m.dying) continue;
    const dx = p.x - player.position.x, dz = p.z - player.position.z, dy = p.y - player.position.y;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > radius) continue;
    const bearing = relativeBearing(yaw, dx, dz);
    const inView = view ? Math.abs(Math.atan2(-lookVector(yaw, 0).z * dx + lookVector(yaw, 0).x * dz, lookVector(yaw, 0).x * dx + lookVector(yaw, 0).z * dz)) <= view.hfov / 2 : bearing === 'ahead';
    const key = `${m.type}${m.isBaby ? ' (baby)' : ''}${m.isTamed || m.tamed || m.owner ? ' (tamed)' : ''}`;
    const g = groups.get(key) || { type: m.type, label: key, count: 0, nearest: Infinity, direction: '', bearing: '', inView: 0, hostile: HOSTILE.has(m.type) };
    g.count++;
    if (inView) g.inView++;
    if (distance < g.nearest) {
      g.nearest = distance;
      g.direction = compassDirection(dx, dz);
      g.bearing = bearing;
      g.at = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
    }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.nearest - b.nearest).slice(0, 14);
}

// --- World and player -------------------------------------------------------------------------------------------

function timeOfDay(worldTime) {
  const t = ((Number(worldTime) || 0) % 24000 + 24000) % 24000;
  if (t < 1000) return 'sunrise';
  if (t < 6000) return 'morning';
  if (t < 9000) return 'midday';
  if (t < 12000) return 'afternoon';
  if (t < 13800) return 'sunset';
  if (t < 22300) return 'night';
  return 'dawn';
}

function biomeName(world, x, z) {
  try {
    const id = world.getBiome?.(Math.floor(x), Math.floor(z));
    if (!id) return null;
    return getBiomeDef(id)?.name || String(id);
  } catch {
    return null;
  }
}

function surfaceY(world, x, z, fromY) {
  if (typeof world.surfaceHeightAt === 'function' && !world.isNether && world.generationMode !== 'authored') {
    try { return Math.round(world.surfaceHeightAt(Math.floor(x), Math.floor(z))); } catch { /* fall through */ }
  }
  for (let y = Math.min(250, fromY + 40); y > 0; y--) {
    const id = world.getVoxel(Math.floor(x), y, Math.floor(z));
    if (id && id !== BLOCKS.AIR && !isPassable(id)) return y;
  }
  return null;
}

export function describeWorld(game) {
  const world = game?.world, player = game?.player;
  if (!world || !player?.position) return null;
  const p = player.position;
  const ring = [];
  for (const distance of [48, 128]) {
    for (const [i, name] of COMPASS.entries()) {
      const angle = i * Math.PI / 4;
      const x = p.x + Math.sin(angle) * distance, z = p.z - Math.cos(angle) * distance;
      ring.push({ distance, direction: name, biome: biomeName(world, x, z), ground: surfaceY(world, x, z, p.y) });
    }
  }
  const here = biomeName(world, p.x, p.z);
  const elsewhere = new Map();
  for (const r of ring) if (r.biome && r.biome !== here && !elsewhere.has(r.biome)) elsewhere.set(r.biome, `${r.direction} ~${r.distance}m`);
  const near = ring.filter(r => r.distance === 48 && r.ground !== null);
  const highest = near.reduce((a, b) => (b.ground > (a?.ground ?? -Infinity) ? b : a), null);
  const lowest = near.reduce((a, b) => (b.ground < (a?.ground ?? Infinity) ? b : a), null);
  return {
    dimension: game.currentDimension || (world.isNether ? 'nether' : 'overworld'),
    biome: here,
    otherBiomes: [...elsewhere.entries()].map(([biome, where]) => `${biome} (${where})`),
    terrain: !highest || !lowest ? null
      : highest.ground - lowest.ground <= 2 ? { flat: true, text: `roughly flat all round (y=${lowest.ground}-${highest.ground})` }
        : { text: `highest to the ${highest.direction} (y=${highest.ground}), lowest to the ${lowest.direction} (y=${lowest.ground})` },
    timeOfDay: timeOfDay(game.worldTime),
    worldTime: Math.round(Number(game.worldTime) || 0),
    weather: game.weather?.weatherType || (game.weather?.isRaining ? 'rain' : 'clear'),
    seed: world.seed,
    worldType: game.worldType || null
  };
}

function itemName(item) {
  if (!item) return 'nothing';
  if (item.isBlock) return blockKey(typeof item.id === 'number' ? item.id : BLOCKS[String(item.id).toUpperCase()]) + (item.count > 1 ? ` x${item.count}` : '');
  return (ITEMS?.[item.id]?.name || String(item.id)) + (item.count > 1 ? ` x${item.count}` : '');
}

export function describePlayer(game) {
  const player = game?.player, world = game?.world;
  if (!player?.position) return null;
  const p = player.position;
  const feet = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  const standingOn = world?.getVoxel ? blockKey(world.getVoxel(feet.x, Math.floor(p.y - 0.05), feet.z)) : null;
  const headIn = world?.getVoxel ? world.getVoxel(feet.x, Math.floor(p.y + 1.62), feet.z) : null;
  let light = null;
  try { light = world?.getLightLevel?.(feet.x, feet.y, feet.z); } catch { light = null; }
  const inventory = game.inventory;
  const hotbar = Array.isArray(inventory?.hotbar) ? inventory.hotbar.filter(Boolean).map(itemName) : [];
  return {
    position: { x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)), z: Number(p.z.toFixed(1)) },
    block: feet,
    facing: facingName(Number(player.yaw) || 0),
    gamemode: player.gamemode || 'creative',
    health: player.health, maxHealth: player.maxHealth, hunger: player.hunger,
    standingOn,
    underwater: headIn === BLOCKS.WATER,
    light: Number.isFinite(light) ? light : null,
    holding: itemName(inventory?.getActiveItem?.()),
    hotbar: hotbar.slice(0, 9)
  };
}

// --- The snapshot -----------------------------------------------------------------------------------------------

function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function builtBox(s) {
  return { minX: s.startX, maxX: s.endX ?? s.startX + s.width - 1, minY: s.baseY, maxY: s.endY ?? s.baseY + s.height - 1, minZ: s.startZ, maxZ: s.endZ ?? s.startZ + s.depth - 1 };
}

/**
 * Everything the agent should know before reading the player's words.
 * @param {object} game
 * @param {{builtBuildings?: object[], structureScan?: boolean}} [options]
 */
export function perceiveSurroundings(game, { builtBuildings = [], structureScan = true } = {}) {
  const world = game?.world, player = game?.player;
  if (!world?.getVoxel || !player?.position) return null;
  const p = player.position;
  const maxY = CHUNK_HEIGHT - 1;
  const snapshot = { player: describePlayer(game), world: describeWorld(game) };

  snapshot.view = sampleView(game);
  snapshot.enclosure = analyzeEnclosure(world, { x: p.x, y: p.y + 0.1, z: p.z }, { maxY });
  snapshot.structures = structureScan ? findStructures(world, p, { maxY }) : [];
  snapshot.generated = structureScan ? generatedStructuresNear(world, p) : [];
  snapshot.entities = describeEntities(game, snapshot.view);

  // Name every nearby structure, and connect it to what the agent built and to generated structures.
  snapshot.structures.forEach((s, i) => {
    s.id = `nearby_${i + 1}`;
    const built = builtBuildings.find(b => overlaps(builtBox(b), s.box));
    if (built) s.builtId = built.id, s.builtName = built.name;
    const generated = snapshot.generated.find(g => overlaps(g.box, s.box));
    if (generated) s.generatedBy = generated.structureId;
  });

  const room = snapshot.enclosure;
  if (room) {
    room.id = 'current_room';
    const host = snapshot.structures.find(s => overlaps(s.box, room.bounds));
    if (host) room.partOf = host.id;
    const built = builtBuildings.find(b => overlaps(builtBox(b), room.interior));
    if (built) room.builtId = built.id, room.builtName = built.name;
    const generated = snapshot.generated.find(g => g.inside);
    if (generated) room.generatedBy = generated.structureId + (generated.pieceHere ? ` (${generated.pieceHere})` : '');
    const paintings = game.paintings?.paintingsIn?.(room.bounds) || [];
    room.paintings = paintings.map(pt => ({ variant: pt.variantId, side: opposite(pt.facing), size: `${pt.width}x${pt.height}` }));
  }

  // What the crosshair is on, as a target: the room it belongs to, or the structure, or just the block.
  const hit = snapshot.view?.crosshair;
  if (hit) {
    const inRoom = room && hit.x >= room.bounds.minX && hit.x <= room.bounds.maxX && hit.y >= room.bounds.minY && hit.y <= room.bounds.maxY && hit.z >= room.bounds.minZ && hit.z <= room.bounds.maxZ;
    const structure = snapshot.structures.find(s => hit.x >= s.box.minX - 1 && hit.x <= s.box.maxX + 1 && hit.y >= s.box.minY - 1 && hit.y <= s.box.maxY + 1 && hit.z >= s.box.minZ - 1 && hit.z <= s.box.maxZ + 1);
    snapshot.lookingAt = { ...hit, target: inRoom ? 'current_room' : structure ? structure.id : null };
  } else {
    snapshot.lookingAt = null;
  }
  return snapshot;
}

function opposite(facing) {
  return { north: 'south', south: 'north', east: 'west', west: 'east' }[facing] || facing;
}

const fmtBox = b => `x ${b.minX}..${b.maxX}, y ${b.minY}..${b.maxY}, z ${b.minZ}..${b.maxZ}`;
const fmtMaterials = list => list.map(m => m.block).join(', ') || 'unknown';

/** The prompt section for one snapshot. */
export function formatPerception(snapshot) {
  if (!snapshot) return 'ENVIRONMENT: unavailable.';
  const lines = ['ENVIRONMENT (measured from the world this turn; this is what the player means by "here", "this", "the house", "that"):'];
  const { player: pl, world: w, view, enclosure: room, structures, generated, entities, lookingAt } = snapshot;

  if (pl) {
    lines.push(`PLAYER: at (${pl.position.x}, ${pl.position.y}, ${pl.position.z}) block (${pl.block.x}, ${pl.block.y}, ${pl.block.z}), facing ${pl.facing}, ${pl.gamemode} mode, health ${pl.health ?? '?'}/${pl.maxHealth ?? 20}, food ${pl.hunger ?? '?'}/20. Standing on ${pl.standingOn}${pl.underwater ? ', head underwater' : ''}${pl.light !== null ? `, light level ${pl.light}` : ''}. Holding ${pl.holding}.${pl.hotbar.length ? ` Hotbar: ${pl.hotbar.join(', ')}.` : ''}`);
  }
  if (w) {
    lines.push(`WORLD: ${w.dimension}, biome ${w.biome || 'unknown'}, ${w.timeOfDay} (time ${w.worldTime}), weather ${w.weather}.${w.otherBiomes.length ? ` Further out: ${w.otherBiomes.slice(0, 6).join('; ')}.` : ''}${w.terrain ? ` Ground 48 blocks out: ${w.terrain.text}.` : ''}`);
  }

  if (room) {
    const where = room.builtName ? ` (your earlier build "${room.builtName}", id ${room.builtId})` : room.generatedBy ? ` (part of a generated ${room.generatedBy})` : room.partOf ? ` (part of ${room.partOf})` : '';
    lines.push(`INDOORS: the player is inside a ${room.kind === 'building' ? 'building' : room.kind === 'shelter' ? 'partly built shelter' : 'cave or natural hollow'}${where}. Reference id "current_room".${room.truncated ? ' It is larger than the scan, so the bounds below are partial.' : ''}`);
    lines.push(`  Interior air: ${fmtBox(room.interior)}; floor at y=${room.floorY} (standing level), ceiling height ${room.ceilingHeight}, floor area ${room.floorArea} blocks. With walls: ${fmtBox(room.bounds)} (origin [${room.bounds.minX}, ${room.bounds.minY}, ${room.bounds.minZ}], size ${room.bounds.maxX - room.bounds.minX + 1}x${room.bounds.maxY - room.bounds.minY + 1}x${room.bounds.maxZ - room.bounds.minZ + 1}).`);
    lines.push(`  Walls: ${fmtMaterials(room.wallMaterials)}. Floor: ${fmtMaterials(room.floorMaterials)}. Ceiling: ${fmtMaterials(room.ceilingMaterials)}.`);
    const walls = Object.values(room.walls).map(wall => `${wall.side} wall (${wall.along} ${wall.from}..${wall.to}, plane ${wall.along === 'x' ? 'z' : 'x'}=${wall.plane}): ${wall.freeEyeLevel} free eye-level blocks${wall.windows ? `, ${wall.windows} window blocks` : ''}${wall.doors ? `, ${wall.doors} door` : ''}`);
    if (walls.length) lines.push(`  ${walls.join('; ')}.`);
    if (room.doors.length) lines.push(`  Doors: ${room.doors.slice(0, 4).map(d => `${d.block} at (${d.x}, ${d.y}, ${d.z})${d.open ? ' open' : ''}`).join('; ')}.`);
    if (room.openings.length) lines.push(`  Open to the sky through ${room.openings.length} gap(s), e.g. (${room.openings[0].x}, ${room.openings[0].y}, ${room.openings[0].z}).`);
    if (room.furniture.length) lines.push(`  Furniture: ${room.furniture.slice(0, 14).map(f => `${f.block} (${f.x}, ${f.y}, ${f.z})`).join('; ')}.`);
    lines.push(`  Lights: ${room.lights.length ? room.lights.slice(0, 6).map(l => l.block).join(', ') : 'none'}. Paintings: ${room.paintings?.length ? room.paintings.map(pt => `${pt.variant} ${pt.size} on the ${pt.side} wall`).join('; ') : 'none'}.`);
  } else {
    lines.push('OUTDOORS: the player is under open sky (not inside a room).');
  }

  if (view) {
    lines.push(`VIEW (what fills the screen, facing ${view.facing}, looking ${view.pitchDegrees > 10 ? 'up' : view.pitchDegrees < -10 ? 'down' : 'level'}): ${view.regions.map(r => `${r.region}: ${r.text}`).join('; ')}.`);
  }
  if (lookingAt) {
    lines.push(`CROSSHAIR: ${lookingAt.block} at (${lookingAt.x}, ${lookingAt.y}, ${lookingAt.z}), ${lookingAt.distance.toFixed(1)} blocks away${lookingAt.target ? `, part of "${lookingAt.target}"` : ''}. Reference id "looking_at".`);
  }

  if (structures?.length) {
    lines.push('STRUCTURES NEARBY (player-made blocks, by distance):');
    for (const s of structures.slice(0, 8)) {
      const f = s.features;
      const extras = [f.doors && `${f.doors} door`, f.windows && `${f.windows} glass`, f.beds && `${f.beds} bed`, f.chests && `${f.chests} chest`, f.workstations && `${f.workstations} workstation`, f.lights && `${f.lights} light`].filter(Boolean).join(', ');
      lines.push(`  "${s.id}": ${s.kind}, ${s.size.width}x${s.size.height}x${s.size.depth} at ${fmtBox(s.box)}, ${s.inside ? 'the player is inside it' : `${s.distance.toFixed(0)}m ${s.direction}`}; ${fmtMaterials(s.materials)}${extras ? `; ${extras}` : ''}${s.builtId ? `; your build "${s.builtName}" (${s.builtId})` : ''}${s.generatedBy ? `; generated ${s.generatedBy}` : ''}.`);
    }
  } else {
    lines.push('STRUCTURES NEARBY: none within 24 blocks.');
  }
  if (generated?.length) {
    lines.push(`GENERATED STRUCTURES: ${generated.map(g => `${g.structureId} ${g.inside ? '(the player is inside its bounds)' : `${g.distance.toFixed(0)}m ${g.direction}`}`).join('; ')}.`);
  }
  if (entities?.length) {
    lines.push(`CREATURES WITHIN 32 BLOCKS: ${entities.map(e => `${e.count} ${e.label}${e.hostile ? ' [hostile]' : ''} nearest ${e.nearest.toFixed(0)}m ${e.bearing} (${e.direction})${e.inView ? ', in view' : ''}`).join('; ')}.`);
  } else {
    lines.push('CREATURES WITHIN 32 BLOCKS: none.');
  }

  const refs = [];
  if (room) refs.push('"current_room" = the room the player is in');
  if (lookingAt?.target) refs.push(`"looking_at" = ${lookingAt.target === 'current_room' ? 'that same room' : lookingAt.target}`);
  else if (lookingAt) refs.push('"looking_at" = the block under the crosshair');
  for (const s of (structures || []).slice(0, 8)) refs.push(`"${s.id}"`);
  lines.push(`TARGET IDS you may use as targetBuilding (besides your own build ids): ${refs.join(', ') || 'none'}.`);
  return lines.join('\n');
}
