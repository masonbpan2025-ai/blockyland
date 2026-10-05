// Filling a glass bottle with water, which is the root of the entire potion chain.
//
// `brewing.js` declares every recipe against a `water_bottle`: nether wart makes an awkward potion, glowstone
// dust a thick one, redstone a mundane one, and everything else descends from those. Nothing in this game
// could produce a water bottle -- a search for one finds only consumers -- so the brewing stand was
// furniture. All thirty-nine potions, splash and lingering alike, were unreachable in survival, and the
// Resource Inspector showed it as a single line: `water_bottle` with no source.
//
// Vanilla fills a bottle from a water source block or from a water cauldron. Only the first is implemented
// here: this game has a cauldron *block* but no water-cauldron state to fill from, so a cauldron is refused
// with that reason rather than silently doing nothing. Unlike a bucket, a bottle does not take the source
// with it -- a bottle of water from an ocean does not drain the ocean -- which is the one place this differs
// from `buckets.js` and the reason it is not simply reused.
import { BLOCKS } from './blocks.js';

/** The item that can be filled. A bottle already holding something is not one of these. */
export const isGlassBottle = (item) => Boolean(item) && !item.isBlock && item.id === 'glass_bottle';

/** What a filled bottle becomes. */
export const FILLED_BOTTLE = 'water_bottle';

/**
 * Fill a glass bottle from whatever the trace found.
 *
 * @param {object} world
 * @param {object} inventory
 * @param {string} mode the player's gamemode; anything but `creative` consumes the empty bottle
 * @param {{x:number,y:number,z:number,blockId?:number}|null} hit from `traceBucket(..., true)`
 * @param {(id: string) => void} [overflow] called when the inventory has no room for the result
 * @returns {{x:number,y:number,z:number}|false} the cell filled from, or false
 */
export function useGlassBottle(world, inventory, mode, hit, overflow = () => {}) {
  const active = inventory?.getActiveItem?.();
  if (!isGlassBottle(active) || !hit) return false;

  const { x, y, z } = hit;
  const id = hit.blockId ?? world.getVoxel(x, y, z);
  if (id !== BLOCKS.WATER) return false;
  // Only a source block: dipping a bottle into flowing water gives nothing in vanilla.
  if (typeof world.getWaterLevel === 'function' && world.getWaterLevel(x, y, z) !== 0) return false;
  // A cauldron is deliberately not supported yet, and is named so the refusal is not a mystery.
  if (id === BLOCKS.CAULDRON) return false;

  // The water stays where it is. This is the difference from a bucket, and it is what makes a bottle
  // renewable rather than a way to drain a lake one block at a time.
  if (mode !== 'creative') {
    if (active.count === 1) {
      inventory.hotbar[inventory.activeSlot] = { id: FILLED_BOTTLE, isBlock: false, count: 1 };
    } else {
      inventory.consumeActiveItem();
      if (!inventory.addItem(FILLED_BOTTLE, false, 1)) overflow(FILLED_BOTTLE);
    }
  } else if (![...(inventory.hotbar ?? []), ...(inventory.storage ?? [])].some((item) => item?.id === FILLED_BOTTLE)) {
    // Creative keeps the empty bottle and adds the filled one once, exactly as the bucket does.
    if (!inventory.addItem(FILLED_BOTTLE, false, 1)) overflow(FILLED_BOTTLE);
  }

  return { x, y, z };
}
