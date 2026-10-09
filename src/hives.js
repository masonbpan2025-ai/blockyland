// Bee nests and beehives: the only source of honeycomb, and therefore of every waxed copper block.
//
// `honeycomb` is an ingredient in seventy-seven waxing recipes in `extraRecipes.js`, and this game already
// implements waxing as an interaction -- `copperGolemBehavior` refuses to oxidise a block that has been
// waxed. Nothing implemented the other end: a bee nest or beehive could be placed and never harvested, so no
// honeycomb existed, no copper could be waxed, and the Resource Inspector listed `honeycomb` with no source
// and `used as ingredient 195`.
//
// Vanilla's rule, which this follows:
//
//   * a hive holds a honey level from 0 to 5, and only fills while bees are working it;
//   * at level 5, shears give **three** honeycomb and a glass bottle gives one honey bottle;
//   * either harvest resets the level to 0;
//   * harvesting below level 5 does nothing but say so.
//
// A bee's home is already modelled -- `mob.hive`, which it refuses to stray more than twenty-two blocks from
// -- so "bees are working it" is a real check rather than a stand-in. The one simplification is the rate: a
// bee raises the level by one per trip in vanilla and trips are irregular, so this advances a level every
// `HONEY_LEVEL_SECONDS` while at least one bee is homed to the hive and nearby. That is stated here rather
// than hidden.
import { BLOCKS, ITEMS } from './blocks.js';
import { hasCampfireBelow, rollBeeAngerSeconds } from './beeBehavior.js';

/** Levels a hive fills through. Vanilla calls this `honey_level`. */
export const HONEY_LEVEL_MAX = 5;

/** Vanilla gives three honeycomb per shearing. */
export const HONEYCOMB_PER_HARVEST = 3;

/** Seconds of work by at least one bee to raise the level by one. See the note above. */
export const HONEY_LEVEL_SECONDS = 60;

/** How far a bee may be from its hive and still count as working it. Vanilla's own leash. */
export const HIVE_LEASH = 22;

/** A bee must be at least this close for the hive to fill, rather than merely homed to it. */
export const HIVE_WORK_RANGE = 6;

export const isHive = (blockId) => blockId === BLOCKS.BEE_NEST || blockId === BLOCKS.BEEHIVE;

/**
 * What harvesting a full hive with this item yields, or null when the item cannot harvest one.
 *
 * @param {{id?: string}|null} item
 * @returns {{id: string, isBlock: boolean, count: number, tool: 'shears'|'bottle'}|null}
 */
export function hiveHarvestFor(item) {
  const id = item && typeof item === 'object' ? item.id : item;
  if (id === 'shears') return { id: 'honeycomb', isBlock: false, count: HONEYCOMB_PER_HARVEST, tool: 'shears' };
  if (id === 'glass_bottle') return { id: 'honey_bottle', isBlock: false, count: 1, tool: 'bottle' };
  return null;
}

/** Every item a hive can be harvested for, so the Inspector's table and a test can both ask. */
export const HIVE_PRODUCTS = [...new Set(['shears', 'glass_bottle'].map((tool) => hiveHarvestFor(tool).id))];

export class HiveManager {
  constructor(game) {
    this.game = game;
    /** @type {Map<string, {x:number,y:number,z:number,level:number,timer:number}>} */
    this.hives = new Map();
  }

  static key(x, y, z) {
    return `${x},${y},${z}`;
  }

  /**
   * Register a hive the player has just placed. A crafted beehive starts empty, as in vanilla -- the
   * honeycomb it was made from does not count as honey.
   */
  onBlockPlaced(x, y, z, blockId) {
    if (!isHive(blockId)) return false;
    this.hives.set(HiveManager.key(x, y, z), { x, y, z, level: 0, timer: 0 });
    return true;
  }

  /** A hive found in the world, which may already be part-full. Level 0 unless told otherwise. */
  ensure(x, y, z, level = 0) {
    const key = HiveManager.key(x, y, z);
    if (!this.hives.has(key)) {
      this.hives.set(key, { x, y, z, level: Math.max(0, Math.min(HONEY_LEVEL_MAX, level)), timer: 0 });
    }
    return this.hives.get(key);
  }

  onBlockBroken(x, y, z) {
    return this.hives.delete(HiveManager.key(x, y, z));
  }

  levelAt(x, y, z) {
    return this.hives.get(HiveManager.key(x, y, z))?.level ?? null;
  }

  /** How many bees are homed to this hive and actually at it, which is what makes the level rise. */
  beesWorking(x, y, z) {
    const bees = this.game?.mobs?.mobs ?? [];
    let count = 0;
    for (const mob of bees) {
      if (!mob?.hive || mob.health <= 0) continue;
      const hive = mob.hive;
      if (Math.round(hive.x) !== x || Math.round(hive.y) !== y || Math.round(hive.z) !== z) continue;
      const position = mob.mesh?.position;
      if (!position) continue;
      const dx = position.x - (x + 0.5);
      const dy = position.y - (y + 0.5);
      const dz = position.z - (z + 0.5);
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= HIVE_WORK_RANGE) count += 1;
    }
    return count;
  }

  /** Advance every hive that has a bee working it. Called from the game loop. */
  update(dt) {
    for (const hive of this.hives.values()) {
      if (hive.level >= HONEY_LEVEL_MAX) continue;
      if (!this.beesWorking(hive.x, hive.y, hive.z)) {
        // No bees, no honey. The partial progress toward the next level is kept, as it is in the block's
        // own state, rather than thrown away every time the bees wander off.
        continue;
      }
      hive.timer += dt;
      while (hive.timer >= HONEY_LEVEL_SECONDS && hive.level < HONEY_LEVEL_MAX) {
        hive.timer -= HONEY_LEVEL_SECONDS;
        hive.level += 1;
      }
    }
  }

  /**
   * Harvest a hive with whatever the player is holding.
   *
   * @returns {{ok: boolean, reason?: string, product?: object, level?: number}} what happened, and why not
   */
  harvest(x, y, z, player = this.game?.player) {
    const blockId = this.game?.world?.getVoxel?.(x, y, z);
    if (!isHive(blockId)) return { ok: false, reason: 'That is not a bee nest or a beehive.' };

    const hive = this.ensure(x, y, z);
    const item = player?.inventory?.getActiveItem?.() ?? player?.getActiveItem?.() ?? null;
    const product = hiveHarvestFor(item);
    if (!product) return { ok: false, reason: 'A hive is harvested with shears or an empty bottle.' };
    if (hive.level < HONEY_LEVEL_MAX) {
      return { ok: false, reason: `The hive is not full yet (${hive.level}/${HONEY_LEVEL_MAX}).` };
    }

    const inventory = player.inventory;
    if (player.gamemode !== 'creative') {
      // One bottle or one snip out of the stack, and the product goes wherever it fits. A honey bottle
      // stacks to sixteen, so a full stack of bottles is fine to harvest with -- unlike a potion, which is
      // why this does not need the "hold a single one" rule that brewing does.
      if (product.tool === 'shears') {
        // Shears wear out on a hive exactly as they do on a sheep.
        if (typeof item.durability === 'number') {
          item.durability = Math.max(0, item.durability - 1);
          if (item.durability === 0) inventory.consumeActiveItem?.(1);
        }
      } else {
        inventory.consumeActiveItem?.(1);
      }
      if (!inventory.addItem?.(product.id, product.isBlock, product.count)) {
        return { ok: false, reason: 'There is no room for that.' };
      }
    } else {
      // Creative keeps what it is holding, as it does for a bucket or a bottle.
      inventory.addItem?.(product.id, product.isBlock, product.count);
    }

    hive.level = 0;
    hive.timer = 0;

    // Wiki: harvesting without a campfire below (within 5 blocks) angers all nearby bees within 24 blocks
    const pacified = hasCampfireBelow(this.game?.world, x, y, z);
    if (!pacified) {
      const bees = this.game?.mobs?.mobs ?? [];
      for (const mob of bees) {
        if (mob?.type === 'bee' && mob.health > 0) {
          const pos = mob.mesh?.position;
          if (!pos) continue;
          const dx = pos.x - (x + 0.5);
          const dy = pos.y - (y + 0.5);
          const dz = pos.z - (z + 0.5);
          if (Math.hypot(dx, dy, dz) <= 24) {
            mob.angerTimer = Math.max(mob.angerTimer || 0, rollBeeAngerSeconds());
            mob.angryAt = player;
          }
        }
      }
    }

    return { ok: true, product, level: 0 };
  }
}
