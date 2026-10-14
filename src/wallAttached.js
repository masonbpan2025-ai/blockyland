// Blocks that hang on a wall: the ladder and the vine. Which wall is block state the voxel grid cannot hold, so it is
// kept in `world.structureOrientations` (saved and loaded with the world), as stairs' facing is; blockModels.js
// turns the model to it.
//
// Wiki, Ladder: placed on the side of a block, it "requires a solid block behind it", and "is removed and drops
// itself as an item if: its attachment block is moved, removed, or destroyed". Vines: "can be placed on the sides of
// most solid blocks", "the underside of blocks", and one block of vines can cover several faces; a vine face whose
// block is removed goes, and a vine with no face left breaks (without dropping: vines are collected with shears).
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { occludesWholeFace } from './blockOcclusion.js';

const OFFSET = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0] };
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** Is this block one that hangs on a wall? */
export const isWallAttached = (blockId) => Boolean(BLOCK_DEFS[blockId]?.model?.wallAttached);
const isMultiWall = (blockId) => Boolean(BLOCK_DEFS[blockId]?.model?.multiWall);

/**
 * Can this block hold a ladder or a vine on its face? Any full block -- glass and leaves too, which only look
 * see-through -- but not a partial shape, a plant or a liquid.
 */
export const canHold = (blockId) => {
  const def = BLOCK_DEFS[blockId];
  return blockId !== BLOCKS.AIR && Boolean(def) && !def.liquid && occludesWholeFace({ ...def, transparent: false });
};

/**
 * The state a ladder or vine takes when the player clicks a block's face to place it, or null when it cannot go
 * there. `normal` is the clicked face's outward normal: the wall is the clicked block, behind the new one.
 */
export function attachStateForClick(blockId, normal, clickedBlockId) {
  if (!isWallAttached(blockId) || !normal || !canHold(clickedBlockId)) return null;
  let wall = null;
  if (normal.x === 1) wall = 'west'; else if (normal.x === -1) wall = 'east';
  else if (normal.z === 1) wall = 'north'; else if (normal.z === -1) wall = 'south';
  else if (normal.y === -1 && isMultiWall(blockId)) wall = 'up'; // a vine under a block
  if (!wall) return null; // a ladder on a floor or ceiling, a vine on top of a block
  return isMultiWall(blockId) ? { walls: [wall] } : { wall };
}

/** The state a structure's ladder or vine gets from its block properties: a ladder's `facing` faces away from its wall. */
export function attachStateForStructure(blockId, request) {
  if (!isWallAttached(blockId)) return null;
  if (isMultiWall(blockId)) {
    const walls = ['north', 'south', 'east', 'west', 'up'].filter((w) => request.vineFaces?.[w]);
    return walls.length ? { walls } : null;
  }
  return OPPOSITE[request.facing] ? { wall: OPPOSITE[request.facing] } : null;
}

/** Remember a placed ladder's or vine's wall(s). */
export function rememberAttachment(world, x, y, z, blockId, state) {
  if (!state) return;
  world.structureOrientations ??= new Map();
  world.structureOrientations.set(`${x},${y},${z}`, { x, y, z, id: blockId, ...state });
}

/**
 * After the block at (x, y, z) is removed: the ladders and vines that hung on it. A ladder breaks and drops itself;
 * a vine loses that face and, with none left, breaks without a drop. `breakBlock(x, y, z, dropItself)` does the
 * breaking. Returns how many were affected.
 */
export function onSupportRemoved(world, x, y, z, breakBlock) {
  let changed = 0;
  for (const [wall, [dx, dy, dz]] of Object.entries(OFFSET)) {
    // The neighbour that would hang on this block has it on its `wall` side, so it sits the other way.
    const nx = x - dx; const ny = y - dy; const nz = z - dz;
    const id = world.getVoxel(nx, ny, nz);
    if (!isWallAttached(id)) continue;
    const key = `${nx},${ny},${nz}`;
    const state = world.structureOrientations?.get(key) ?? (isMultiWall(id) ? { walls: ['south'] } : { wall: 'south' });
    if (isMultiWall(id)) {
      const walls = (state.walls ?? []).filter((w) => w !== wall);
      if (walls.length === (state.walls ?? []).length) continue;
      if (walls.length) { world.structureOrientations.set(key, { ...state, walls }); changed++; continue; }
      breakBlock(nx, ny, nz, false);
      changed++;
    } else if (state.wall === wall) {
      breakBlock(nx, ny, nz, true);
      changed++;
    }
  }
  return changed;
}
