// Using a tool on a block: a shovel makes a dirt path, an axe strips a log.
//
// Wiki (Dirt Path): "Dirt paths can be created by using any type of shovel on the side or top of dirt, grass block,
// coarse dirt, mycelium, podzol, or rooted dirt that has air above it. The shovel uses one durability." Wiki (Log,
// Stripped Log): using an axe on a log, wood, stem, hyphae or block of bamboo strips it, keeping its orientation, for one
// durability. Found by the wiki-tutorial play-test (Navigation: "Dirt paths: An ideal navigation block for marking a
// trail when exploring, requiring only a shovel"): neither existed.
import { BLOCKS } from './blocks.js';

const named = (...names) => names.map((n) => BLOCKS[n]).filter((id) => id !== undefined);
export const PATHABLE = new Set(named('GRASS', 'GRASS_BLOCK', 'DIRT', 'COARSE_DIRT', 'MYCELIUM', 'PODZOL', 'ROOTED_DIRT'));

/** log id -> stripped id, for every log, wood, stem and hyphae with a stripped form, and the block of bamboo. */
export const STRIPPED = new Map();
for (const [name, id] of Object.entries(BLOCKS)) {
  if (name.startsWith('STRIPPED_')) continue;
  if (!/(_LOG|_WOOD|_STEM|_HYPHAE)$/.test(name) && name !== 'BAMBOO_BLOCK') continue;
  const stripped = BLOCKS[`STRIPPED_${name}`];
  if (stripped !== undefined) STRIPPED.set(id, stripped);
}

const isShovel = (id) => /_shovel$/.test(String(id ?? ''));
const isAxe = (id) => /_axe$/.test(String(id ?? ''));

/**
 * What using `itemId` on the block at x,y,z does, if anything: { block, sound } to place, or null.
 * The caller spends the durability and swaps the block.
 */
export function toolUseOn(world, itemId, x, y, z) {
  const id = world.getVoxel(x, y, z);
  if (isShovel(itemId) && PATHABLE.has(id) && world.getVoxel(x, y + 1, z) === BLOCKS.AIR) return { block: BLOCKS.DIRT_PATH, sound: 'grass' };
  if (isAxe(itemId) && STRIPPED.has(id)) return { block: STRIPPED.get(id), sound: 'wood' };
  return null;
}

/** Apply a tool use: swap the block, keeping a log's axis (setVoxel clears the orientation record). */
export function applyToolUse(world, x, y, z, result) {
  const key = `${x},${y},${z}`;
  const orientation = world.structureOrientations?.get?.(key);
  world.setVoxel(x, y, z, result.block);
  if (orientation && result.block !== BLOCKS.DIRT_PATH) world.structureOrientations.set(key, orientation);
}
