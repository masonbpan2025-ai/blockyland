// Using the blocks whose state is their own block id (blockStateVariants.js): opening and closing a fence gate,
// lighting and putting out a candle. One place for the rule, used by the player's hand (main.js), a wind charge's
// burst (windCharge.js) and the tests.
//
// Fence Gate page: "A fence gate can be opened or closed by using it", and by "wind charges shot by the player, a
// dispenser or a breeze. When hit, it opens if closed and vice versa." Candle page: lit "using flint and steel, fire
// charge, or any flaming projectile"; "Lit candles can be extinguished using water ..., wind charges, or by the player
// interacting with the candle" (Java: with an empty hand).
import { BLOCK_DEFS } from './blocks.js';

export const isFenceGate = (id) => Boolean(BLOCK_DEFS[id]?.fenceGate);
export const isOpenFenceGate = (id) => Boolean(BLOCK_DEFS[id]?.fenceGate && BLOCK_DEFS[id]?.open);
/** A candle or a candle cake. */
export const isCandle = (id) => Boolean(BLOCK_DEFS[id]?.candle);
export const isLitCandle = (id) => Boolean(BLOCK_DEFS[id]?.candle && BLOCK_DEFS[id]?.lit);

/** The other state of a fence gate's block: its open id when closed, its closed id when open; null for anything else. */
export function toggledFenceGate(id) {
  const def = BLOCK_DEFS[id];
  if (!def?.fenceGate) return null;
  return (def.open ? def.closedId : def.openId) ?? null;
}

/**
 * Open a closed gate, or close an open one, at x, y, z. `sounds` (optional) plays the creak. Returns the gate's new
 * state, { open }, or null when there is no gate there.
 */
export function toggleFenceGate(world, x, y, z, { sounds = null } = {}) {
  const next = toggledFenceGate(world?.getVoxel?.(x, y, z));
  if (next == null) return null;
  world.setVoxel(x, y, z, next);
  const open = isOpenFenceGate(next);
  sounds?.playFenceGate?.(open);
  return { open };
}

/** Light an unlit candle or candle cake at x, y, z. True when it was lit. (The game has no waterlogged candles.) */
export function lightCandle(world, x, y, z, { sounds = null } = {}) {
  const id = world?.getVoxel?.(x, y, z), def = BLOCK_DEFS[id];
  if (!def?.candle || def.lit || def.litId == null) return false;
  world.setVoxel(x, y, z, def.litId);
  sounds?.playCandleLight?.();
  return true;
}

/** Put out a lit candle or candle cake at x, y, z. True when it was lit. */
export function extinguishCandle(world, x, y, z, { sounds = null } = {}) {
  const id = world?.getVoxel?.(x, y, z), def = BLOCK_DEFS[id];
  if (!def?.candle || !def.lit || def.unlitId == null) return false;
  world.setVoxel(x, y, z, def.unlitId);
  sounds?.playCandleExtinguish?.();
  return true;
}

/** The items that light a candle by using them on it (Candle: flint and steel, a fire charge). */
export const CANDLE_LIGHTERS = Object.freeze(['flint_and_steel', 'fire_charge']);
