// Archaeology: brushing a suspicious block for a pottery sherd.
//
// This game has had the two halves of it for a while: `SUSPICIOUS_SAND` and `SUSPICIOUS_GRAVEL` are registered
// blocks that drop nothing (correct -- vanilla's are emptied by brushing, not by mining), and the brush exists
// with the durability it uses. What was missing was the twenty-three pottery sherds, so brushing a suspicious
// block had nothing to give.
//
// Vanilla picks the sherd from a per-structure pool: trail ruins, desert pyramids, ocean ruins and cold ruins
// each have their own weighted list, and which one you get depends on where you are digging. This game has no
// structures, so there is one pool of all twenty-three and the roll is uniform. That is a simplification and
// it is stated rather than hidden: every sherd is obtainable, and the distribution is not vanilla's.

/** Every pottery sherd, which is vanilla's full set. */
export const SHERD_POOL = [
  'angler_pottery_sherd', 'archer_pottery_sherd', 'arms_up_pottery_sherd', 'blade_pottery_sherd',
  'brewer_pottery_sherd', 'burn_pottery_sherd', 'danger_pottery_sherd', 'explorer_pottery_sherd',
  'flow_pottery_sherd', 'friend_pottery_sherd', 'guster_pottery_sherd', 'heart_pottery_sherd',
  'heartbreak_pottery_sherd', 'howl_pottery_sherd', 'miner_pottery_sherd', 'mourner_pottery_sherd',
  'plenty_pottery_sherd', 'prize_pottery_sherd', 'scrape_pottery_sherd', 'sheaf_pottery_sherd',
  'shelter_pottery_sherd', 'skull_pottery_sherd', 'snort_pottery_sherd',
];

/** Durability a brush spends on one suspicious block. Vanilla's is one sixteenth of the brush's 64. */
export const BRUSH_DURABILITY_PER_USE = 16;

/** How many brushes a player gets out of one brush. Named because the item declares 64 durability. */
export const BRUSH_USES = 4;

/** The blocks a brush can empty. */
export const SUSPICIOUS_BLOCKS = ['suspicious_sand', 'suspicious_gravel'];

/** Is this a block a brush can empty? */
export function isSuspiciousBlock(blockName) {
  return SUSPICIOUS_BLOCKS.includes(String(blockName));
}

/**
 * The sherd a brush turns up, from the pool.
 *
 * The roll is the caller's, so a test can pin it and the Inspector can ask for a deterministic answer.
 *
 * @param {() => number} random in [0, 1)
 * @returns {string} a sherd item id
 */
export function sherdDrop(random = Math.random) {
  const roll = Math.min(0.999999, Math.max(0, random()));
  return SHERD_POOL[Math.floor(roll * SHERD_POOL.length)];
}

/**
 * Brushing a suspicious block: what comes out, or null when the brush is not for this block.
 *
 * The block is emptied by the brush rather than mined, so the caller turns it into whatever vanilla turns it
 * into (plain sand or gravel) -- that is a world decision and this only says what the brush finds.
 *
 * @param {{id: string}|null} item the active item
 * @param {string} blockName the block's name, as `BLOCK_DEFS[id].name` normalises
 * @param {() => number} random
 * @returns {{sherd: string, durabilityUsed: number}|null}
 */
export function brushSuspiciousBlock(item, blockName, random = Math.random) {
  if (!item || item.isBlock || item.id !== 'brush') return null;
  if (!isSuspiciousBlock(blockName)) return null;
  return { sherd: sherdDrop(random), durabilityUsed: BRUSH_DURABILITY_PER_USE };
}

/** Every item this module can produce, for the Inspector's source tables. */
export function sherdPool() {
  return [...SHERD_POOL];
}
