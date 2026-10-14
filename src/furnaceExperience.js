// Smelting experience, as the Smelting page describes it. The furnace never awarded any: the experience table
// existed and only the parity audit read it. Found by the round-4 audit of the S-SMELT case.
//
// "The furnace, blast furnace and smoker keep track of experience for each item as smelting is completed for
// them, accumulating it in a hidden counter. The counter remembers the total earned experience even if a hopper
// is used to remove the items from the output slot. Experience is awarded to the player who uses the interface to
// remove items manually ... If the player takes some of the output but leaves some in the slot, the experience
// corresponding to items left in the furnace is retained ... For fractional experience values, first multiply
// this value by the number of smelted items removed from the furnace, then award the player the integer part, and
// if there is a fractional part remaining, this represents the chance of an additional experience point."
// Breaking the furnace drops "any accumulated experience".

/** A smelt finished: `count` items, each worth `xpEach`. */
export function recordSmelt(furnace, xpEach, count = 1) {
  furnace.xpQueue ??= [];
  const last = furnace.xpQueue[furnace.xpQueue.length - 1];
  if (last && last.xp === xpEach) last.items += count;
  else furnace.xpQueue.push({ items: count, xp: xpEach });
}

/** The experience banked for the items still in the output slot and those a hopper took. */
export function storedExperience(furnace) {
  return (furnace.xpQueue ?? []).reduce((sum, e) => sum + e.items * e.xp, 0);
}

/** Whole points from a fractional total: the integer part, and the fraction as the chance of one more. */
export function roundExperience(total, random = Math.random) {
  const whole = Math.floor(total);
  return whole + (random() < total - whole ? 1 : 0);
}

/** The player took `n` items out by hand: the points their smelting earned, the oldest first. */
export function takeExperience(furnace, n, random = Math.random) {
  let total = 0; let left = n;
  const queue = furnace.xpQueue ?? [];
  while (left > 0 && queue.length) {
    const head = queue[0];
    const used = Math.min(left, head.items);
    total += used * head.xp; head.items -= used; left -= used;
    if (head.items <= 0) queue.shift();
  }
  return roundExperience(total, random);
}

/**
 * The player opened the furnace and took items: everything a hopper removed earlier is awarded with them
 * ("awarded to the next player who ... manually removes an item"). `inSlot` is how many are still in the slot
 * before taking, so the items a hopper removed are those banked beyond it.
 */
export function takeExperienceWithHopperBacklog(furnace, taken, inSlot, random = Math.random) {
  const banked = (furnace.xpQueue ?? []).reduce((n, e) => n + e.items, 0);
  const removedByHopper = Math.max(0, banked - inSlot);
  return takeExperience(furnace, removedByHopper + taken, random);
}

/** The furnace was broken: all of it. */
export function dropAllExperience(furnace, random = Math.random) {
  const total = storedExperience(furnace);
  furnace.xpQueue = [];
  return roundExperience(total, random);
}
