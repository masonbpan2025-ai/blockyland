// /teleport (alias /tp): the parsing, and where to put the player when the destination is a structure.
//
// Kept out of `main.js` so both the game command and the Structure Inspector's walk-through can use it, and so a
// test can run it against a real `World`.
//
//   /teleport <x> <y> <z>        absolute or ~relative coordinates
//   /teleport <structure>        the nearest generated structure of that kind, e.g. /teleport swamp_hut
//   /teleport structure <id>     the same, spelled as /locate spells it
//   /teleport cave [radius]      the nearest safe cave entrance (default 256 blocks)
//
// A structure destination does not drop the player INTO the structure: the player lands on solid, dry ground a few
// blocks outside its bounding box, looking at its centre, so the first thing they see is the building and they can
// walk in through the door.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { parseCaveRadius } from './caveLocator.js';

export const TELEPORT_USAGE = '/teleport <x> <y> <z>  or  /teleport <structure>  or  /teleport cave [radius]';

/** "minecraft:Swamp Hut", "swamp-hut" and "swamp_hut" are all the same structure. */
export function normaliseStructureName(token) {
  return String(token ?? '').trim().toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_');
}

function coordinate(token, current) {
  if (token === '~') return current;
  if (token.startsWith('~')) {
    const offset = Number(token.slice(1));
    return Number.isFinite(offset) ? current + offset : NaN;
  }
  return Number(token);
}

/**
 * Parse the arguments after the command word.
 *
 * @param {string[]} args
 * @param {{x:number,y:number,z:number}} from where the player is now, for `~` coordinates
 * @returns {{ok:true,kind:'coords',x:number,y:number,z:number}|{ok:true,kind:'structure',id:string}|{ok:true,kind:'cave',radius:number}|{ok:false,reason:string}}
 */
export function parseTeleport(args, from = { x: 0, y: 0, z: 0 }) {
  if (!args.length) return { ok: false, reason: `Usage: ${TELEPORT_USAGE}` };
  if (args[0].toLowerCase() === 'cave') {
    try { return { ok: true, kind: 'cave', radius: parseCaveRadius(args.slice(1)) }; }
    catch (error) { return { ok: false, reason: error.message }; }
  }
  if (args.length >= 3 && args.slice(0, 3).every((a) => /^~?-?\d*\.?\d*$/.test(a) && a !== '')) {
    const x = coordinate(args[0], from.x);
    const y = coordinate(args[1], from.y);
    const z = coordinate(args[2], from.z);
    if (![x, y, z].every(Number.isFinite)) return { ok: false, reason: `Bad coordinates. Usage: ${TELEPORT_USAGE}` };
    return { ok: true, kind: 'coords', x, y, z };
  }
  const rest = args[0].toLowerCase() === 'structure' ? args.slice(1) : args;
  const id = normaliseStructureName(rest.join(' '));
  if (!id) return { ok: false, reason: `Usage: ${TELEPORT_USAGE}` };
  return { ok: true, kind: 'structure', id };
}

/** Yaw that makes the player's forward vector point along (dx, dz). The game's forward is (-sin yaw, -cos yaw). */
export function yawToward(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function isStandable(id) {
  if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
  return !isPassable(id);
}

/** Snow layers, grass, flowers and the like: the player walks through them. */
function isPassable(id) {
  if (id === BLOCKS.AIR) return true;
  const def = BLOCK_DEFS[id];
  return Boolean(def && (def.plant || def.solid === false));
}

/** The top solid, walkable block of a column, or -1 when there is none or it is not dry land. */
export function groundOf(world, x, z, maxY = 62) {
  for (let y = maxY; y >= 1; y--) {
    const id = world.getVoxel(x, y, z);
    if (id === BLOCKS.WATER || id === BLOCKS.LAVA) return -1;
    if (isStandable(id)) {
      // Two free blocks above, and nothing wet in them.
      for (const up of [1, 2]) {
        const above = world.getVoxel(x, y + up, z);
        if (above === BLOCKS.WATER || above === BLOCKS.LAVA) return -1;
        if (!isPassable(above)) return -1;
      }
      return y;
    }
  }
  return -1;
}

/** Make sure the chunks around a box exist, so the structure has been generated before anyone stands next to it. */
export function ensureBoxLoaded(world, box, margin = 1) {
  const [minX, , minZ, maxX, , maxZ] = box;
  for (let cx = Math.floor(minX / 16) - margin; cx <= Math.floor(maxX / 16) + margin; cx++) {
    for (let cz = Math.floor(minZ / 16) - margin; cz <= Math.floor(maxZ / 16) + margin; cz++) world.getOrCreateChunk(cx, cz);
  }
}

/**
 * Where to stand to look at a structure: dry, solid ground outside its box, as close as possible, facing the centre.
 *
 * @param {object} world a `World`
 * @param {{box:number[],centre:{x:number,y:number,z:number}}} found from `locateNearestStructure`
 * @returns {{x:number,y:number,z:number,yaw:number,pitch:number,note:string}}
 */
export function structureArrival(world, found, { gap = 4 } = {}) {
  const [minX, , minZ, maxX, , maxZ] = found.box;
  ensureBoxLoaded(world, found.box, 2);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const candidates = [];
  for (let ring = gap; ring <= gap + 12; ring += 2) {
    const west = minX - ring; const east = maxX + ring; const north = minZ - ring; const south = maxZ + ring;
    // South first (the game's default view faces +Z, so the building is in front), then the other sides.
    candidates.push([cx, south], [west, cz], [east, cz], [cx, north], [west, south], [east, south], [west, north], [east, north]);
  }
  for (const [px, pz] of candidates) {
    const x = Math.floor(px); const z = Math.floor(pz);
    const ground = groundOf(world, x, z);
    if (ground < 0) continue;
    return {
      x: x + 0.5, y: ground + 1, z: z + 0.5,
      yaw: yawToward(cx - (x + 0.5), cz - (z + 0.5)),
      pitch: -0.1,
      note: 'outside the structure'
    };
  }
  // Nothing dry within reach (an ocean monument, a village on a lake): stand on the highest block at the centre.
  const x = Math.floor(cx); const z = Math.floor(cz);
  let y = 62;
  while (y > 1 && !isStandable(world.getVoxel(x, y, z))) y--;
  return { x: x + 0.5, y: y + 1, z: z + 0.5, yaw: Math.PI, pitch: -0.1, note: 'no dry ground nearby, so on top of the centre' };
}
