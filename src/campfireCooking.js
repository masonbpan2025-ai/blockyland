// Campfire cooking. Wiki, Campfire: "A campfire is a block that can be used to cook food"; "Unlike other blocks
// that can cook food, campfires do not require any kind of fuel"; "Food items take 30 seconds (600 ticks) to cook";
// it holds four at once ("Assuming that one uses all four slots to cook at once"). The finished food drops out.
// What it cooks is what a smoker cooks: the furnace's food recipes. A soul campfire cooks the same way.
// Missing until the recipe parity audit (the Campfire page's cooking) found it; free of Three.js so it is testable.
import { BLOCKS } from './blocks.js';
import { getKindSmeltingRecipe } from './furnace.js';

export const CAMPFIRE_COOK_SECONDS = 30;
export const CAMPFIRE_SLOTS = 4;

export const isCampfire = (blockId) => blockId === BLOCKS.CAMPFIRE || blockId === BLOCKS.SOUL_CAMPFIRE;

/** The cooked result of a raw food on a campfire, or null when it cannot be cooked there. */
export function campfireRecipe(item) {
  return getKindSmeltingRecipe('smoker', item);
}

export class CampfireCooking {
  /**
   * `drop(x, y, z, id, isBlock, count)` spawns an item in the world; `changed(x, y, z, slots)` is told whenever what
   * lies on a fire changes, so the game can draw it there.
   */
  constructor({ drop = () => {}, changed = () => {} } = {}) {
    this.drop = drop;
    this.changed = changed;
    this.fires = new Map();
  }

  key(x, y, z) { return `${x},${y},${z}`; }
  slotsAt(x, y, z) { return this.fires.get(this.key(x, y, z)) ?? []; }

  /** Put one of the held food on the campfire. True when it was taken (a free slot, a cookable food). */
  add(x, y, z, item) {
    if (!item || !campfireRecipe(item.id)) return false;
    const slots = this.fires.get(this.key(x, y, z)) ?? [];
    if (slots.length >= CAMPFIRE_SLOTS) return false;
    slots.push({ id: item.id, isBlock: Boolean(item.isBlock), time: 0 });
    this.fires.set(this.key(x, y, z), slots);
    this.changed(x, y, z, slots);
    return true;
  }

  /** Advance every campfire; finished food drops above it. */
  update(dt) {
    for (const [key, slots] of this.fires) {
      const [x, y, z] = key.split(',').map(Number);
      let done = false;
      for (let i = slots.length - 1; i >= 0; i--) {
        slots[i].time += dt;
        if (slots[i].time < CAMPFIRE_COOK_SECONDS) continue;
        const cooked = campfireRecipe(slots[i].id);
        slots.splice(i, 1);
        done = true;
        if (cooked) this.drop(x, y, z, cooked.id, cooked.isBlock, cooked.count ?? 1);
      }
      if (!slots.length) this.fires.delete(key);
      if (done) this.changed(x, y, z, slots);
    }
  }

  /** A broken (or extinguished-and-broken) campfire gives back what was on it, uncooked. */
  onBlockBroken(x, y, z) {
    for (const slot of this.slotsAt(x, y, z)) this.drop(x, y, z, slot.id, slot.isBlock, 1);
    this.fires.delete(this.key(x, y, z));
    this.changed(x, y, z, []);
  }
}

/**
 * Where each of the four slots' food lies on the fire: flat on the logs, one by each side, turned a quarter each, as
 * the wiki's renders show it. Offsets from the block's corner, in blocks, and a turn about the vertical axis.
 */
export const CAMPFIRE_SLOT_POSES = [
  { x: 0.3, z: 0.3, turn: 0 }, { x: 0.7, z: 0.3, turn: 1 }, { x: 0.7, z: 0.7, turn: 2 }, { x: 0.3, z: 0.7, turn: 3 },
];
export const CAMPFIRE_FOOD_HEIGHT = 0.47;
