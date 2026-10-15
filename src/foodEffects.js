// What some foods do besides feed. Wiki (Food, "Food effects"), Java Edition.
//
// Found by the wiki-tutorial play-test (Things not to do: "avoid eating pufferfish, spider eyes, and poisonous potatoes
// because they cause the poison effect"; Your first 10 minutes: rotten flesh "can inflict you with Hunger"): none of
// these had any effect, so a pufferfish was just a small meal.
//
// Each row: [effect, seconds, level, chance].
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const FOOD_EFFECTS = {
  pufferfish: [['hunger', 15, 3, 1], ['nausea', 15, 1, 1], ['poison', 60, 2, 1]],
  spider_eye: [['poison', 5, 1, 1]],
  poisonous_potato: [['poison', 5, 1, 0.6]],
  rotten_flesh: [['hunger', 30, 1, 0.8]],
  chicken: [['hunger', 30, 1, 0.3]],
};

/** Foods that clear an effect: a honey bottle "Clears Poison". (Milk, which clears all, is a bucket, not food.) */
export const FOOD_CLEARS = { honey_bottle: ['poison'] };

/**
 * Apply `itemId`'s side effects to the player after it is eaten. Returns what happened, for tests and the HUD.
 * The chorus fruit's teleport is `chorusTeleport`, applied by the caller with the world at hand.
 */
export function applyFoodEffects(player, itemId, random = Math.random) {
  const applied = [], cleared = [];
  for (const [effect, seconds, level, chance] of FOOD_EFFECTS[itemId] ?? []) {
    if (chance < 1 && random() >= chance) continue;
    player.applyStatusEffect?.(effect, seconds, level);
    applied.push(effect);
  }
  for (const effect of FOOD_CLEARS[itemId] ?? []) {
    if (player.statusEffects?.has?.(effect)) { player.clearStatusEffect?.(effect) ?? player.statusEffects.delete(effect); cleared.push(effect); }
  }
  return { applied, cleared };
}

/**
 * Chorus fruit: "Teleports the user randomly" -- Java tries up to 16 random spots within 8 blocks on each axis (16
 * high), taking the first where the player can stand on solid ground; if none is found the player stays put.
 */
export function chorusTeleport(world, position, random = Math.random) {
  const solid = (id) => !!BLOCK_DEFS[id] && id !== BLOCKS.AIR && BLOCK_DEFS[id].solid !== false && !BLOCK_DEFS[id].liquid;
  const clear = (id) => id === BLOCKS.AIR || (!!BLOCK_DEFS[id] && BLOCK_DEFS[id].solid === false && !BLOCK_DEFS[id].liquid);
  for (let attempt = 0; attempt < 16; attempt++) {
    const x = Math.floor(position.x + (random() - 0.5) * 16);
    const z = Math.floor(position.z + (random() - 0.5) * 16);
    let y = Math.floor(position.y + Math.floor(random() * 16) - 8);
    // Drop to the ground below the chosen spot, as Java's randomTeleport does.
    while (y > 0 && !solid(world.getVoxel(x, y - 1, z))) y--;
    if (y <= 0) continue;
    const feet = world.getVoxel(x, y, z), head = world.getVoxel(x, y + 1, z);
    if (clear(feet) && clear(head)) return { x: x + 0.5, y, z: z + 0.5 };
  }
  return null;
}
