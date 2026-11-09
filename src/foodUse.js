import { ITEMS } from './blocks.js';
import { canEat } from './hunger.js';
import { modeRules } from './gameModeRules.js';
import { FOODS } from './foodData.js';
import { applyFoodEffects, chorusTeleport } from './foodEffects.js';
import { returnFoodContainer } from './foodContainers.js';
import { advancementEvent } from './advancements.js';

/** The same eligibility rules apply when the bite starts and when it finishes. */
export function foodForUse(player, item) {
  if (!player || player.isDead || !modeRules(player.gamemode).interact || item?.isBlock || !(item?.count > 0)) return null;
  const food = ITEMS[item.id];
  return food?.type === 'food' && canEat(item.id, player.hunger, {
    creative: player.gamemode === 'creative', maxHunger: player.maxHunger,
  }) ? food : null;
}

/** Apply the food's effects once, and consume one item unless the player is in Creative. */
export function finishFoodUse(game, item) {
  const { player, inventory } = game;
  const food = foodForUse(player, item);
  if (!food || inventory.getActiveItem() !== item) return false;
  player.eatFood?.(food.food ?? 4, food.saturation ?? FOODS[item.id]?.saturation ?? 0);
  if (Array.isArray(food.effects)) {
    for (const [effect, duration, level] of food.effects) player.applyStatusEffect?.(effect, duration, level ?? 1);
  }
  applyFoodEffects(player, item.id);
  advancementEvent('eat', { item: item.id });
  if (item.id === 'chorus_fruit') {
    const to = chorusTeleport(game.world, player.position);
    if (to) {
      player.position.set(to.x, to.y, to.z);
      player.velocity?.set?.(0, 0, 0);
      player.fallDistance = 0;
      game.sounds?.playEndermanTeleport?.();
    }
  }
  if (player.gamemode !== 'creative') {
    inventory.consumeActiveItem();
    returnFoodContainer(game, item.id);
    game.ui?.updateHotbar?.();
  }
  game.sounds?.playEat?.();
  game.ui?.updateStats?.();
  return true;
}
