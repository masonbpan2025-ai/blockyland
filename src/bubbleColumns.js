// Bubble columns (Java Edition).
//
// Wiki (Bubble Column): a column of water above soul sand pushes entities up; above a magma block it drags them down.
// An entity in an upward column gains 0.06 blocks/tick of upward speed each tick up to 0.7 blocks/tick (1.8 at the
// surface); in a downward one it loses 0.03 a tick down to -0.3 blocks/tick. Tutorial:Elevators builds lifts from
// them. The game had the bubble column block but nothing formed one and nothing pushed: soul sand under water did
// nothing. Columns here are worked out from the water above the soul sand or magma block, so the water itself is not
// replaced.
import { BLOCKS } from './blocks.js';

const isColumnWater = (id) => id === BLOCKS.WATER || id === BLOCKS.BUBBLE_COLUMN;

/** 'up', 'down' or null for the block space x, y, z. */
export function bubbleColumnAt(world, x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  let by = Math.floor(y);
  if (!isColumnWater(world.getVoxel(bx, by, bz))) return null;
  for (let n = 0; n < 64 && by > 0; n++) {
    by--;
    const id = world.getVoxel(bx, by, bz);
    if (isColumnWater(id)) continue;
    if (id === BLOCKS.SOUL_SAND) return 'up';
    if (id === BLOCKS.MAGMA_BLOCK) return 'down';
    return null;
  }
  return null;
}

/** Apply a column's push to a vertical speed (blocks/second) over dt seconds. */
export function bubblePush(direction, vy, dt, atSurface = false) {
  const ticks = dt * 20;
  if (direction === 'up') return Math.min((atSurface ? 1.8 : 0.7) * 20, vy + 0.06 * 20 * ticks);
  if (direction === 'down') return Math.max(-0.3 * 20, vy - 0.03 * 20 * ticks);
  return vy;
}

/** One frame for the player, the mobs and dropped items. */
export function updateBubbleColumns(game, dt) {
  const world = game.world; if (!world) return;
  const push = (pos, vel, feetOffset = 0.1) => {
    if (!pos || !vel) return false;
    const dir = bubbleColumnAt(world, pos.x, pos.y + feetOffset, pos.z);
    if (!dir) return false;
    const atSurface = dir === 'up' && !isColumnWater(world.getVoxel(Math.floor(pos.x), Math.floor(pos.y + 1.2), Math.floor(pos.z)));
    vel.y = bubblePush(dir, vel.y, dt, atSurface);
    return dir;
  };
  const p = game.player;
  if (p && !p.isFlying && p.gamemode !== 'spectator') p.inBubbleColumn = push(p.position, p.velocity);
  for (const m of game.mobs?.mobs ?? []) if (m.health > 0 && m.mesh) push(m.mesh.position, m.velocity);
  for (const d of game.entities?.droppedItems ?? []) if (push(d.group.position, d.velocity, 0)) d.grounded = false;
}
