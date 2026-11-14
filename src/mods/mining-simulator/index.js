// Mining Simulator -- the mod entrypoint. The core never imports this; the loader calls `register`.
//
// Players start with a wooden pickaxe and a hut, dig ores out of the mine in the middle, sell them to the Trader for
// coins (not an item: the count shows on the inventory screen), and buy better pickaxes, bigger houses and the
// Superstick, the only thing that can hurt a player. The world is peaceful and nothing else does damage. Friends join
// with the room code; the host keeps everyone's coins and saves them (client.js).
import manifest from './manifest.js';
import { MiningSimManager } from './client.js';
import { SUPERSTICK_DAMAGE } from './economy.js';
import { MINE_ORE_BLOCKS } from './world.js';

export const MOD_ID = 'mining_simulator';
export const MECHANISM_ID = 'mining_simulator';
export const MAP_FILENAME = 'Mining_Simulator.json';

export function mechanismDefinition() {
  return {
    id: MECHANISM_ID,
    name: 'Mining Simulator',
    description: manifest.description,
    modId: MOD_ID,
    features: { allowCreativeFlight: false },
    activate: (game) => game.miningSim?.activate(),
    deactivate: (game) => game.miningSim?.deactivate(),
  };
}

/** The core's hooks for this world (main.js and player.js call game.modRuntime). */
export function createRuntime(game) {
  const ms = () => (game.miningSim?.active ? game.miningSim : null);
  return {
    isModalOpen: () => Boolean(ms()?.isModalOpen()),
    update: (dt) => game.miningSim?.update(dt),
    canChangeGameMode: () => {
      if (!ms()) return true;
      game.ui?.addChatMessage?.('Mining Simulator keeps everyone in Survival.', 'system');
      return false;
    },
    // Pickaxes, the Superstick and ores stay with the player through a death; only coins change hands.
    keepInventoryOnDeath: () => Boolean(ms()),
    onPlayerDeath: () => Boolean(ms()?.onLocalDeath()),
    interact: (target) => Boolean(ms()?.interact(target)),
    canBreakBlock: (x, y, z, id) => ms()?.canBreakBlock(x, y, z, id),
    onBlockBroken: (x, y, z, id) => ms()?.onBlockBroken(x, y, z, id),
    canPlaceBlock: (x, y, z, item) => ms()?.canPlaceBlock(x, y, z, item),
  };
}

export function register(api, { game = null } = {}) {
  api.registerMap(MAP_FILENAME, { filename: MAP_FILENAME, mechanism: MECHANISM_ID });
  api.registerMechanism(MECHANISM_ID, mechanismDefinition());
  if (!game) return api.registered;
  const manager = new MiningSimManager(game);
  api.attach('miningSim', manager);
  api.attach('modRuntime', createRuntime(game));
  // Nothing hurts a player but another player's Superstick: no falls, lava, fire, drowning, hunger or void.
  if (game.player) {
    const takeDamage = game.player.takeDamage.bind(game.player);
    api.extend(game.player, {
      takeDamage(amount, sourcePos, damageType, attacker, options, ...rest) {
        if (!manager.active) return takeDamage(amount, sourcePos, damageType, attacker, options, ...rest);
        const damage = manager.damageFor(amount, damageType, options ?? {});
        if (damage === null) return undefined;
        return takeDamage(damage, sourcePos, damageType, attacker, options, ...rest);
      },
    });
  }
  // A swing at another player lands only with the Superstick, for its fixed damage.
  const sync = game.worldSync;
  if (sync?.attackRemotePlayer) {
    const attackRemotePlayer = sync.attackRemotePlayer.bind(sync);
    api.extend(sync, {
      attackRemotePlayer(peerId, damage, options = {}) {
        if (!manager.active) return attackRemotePlayer(peerId, damage, options);
        if (options?.projectile || !manager.superstickHit()) return false;
        return attackRemotePlayer(peerId, SUPERSTICK_DAMAGE, { weapon: 'stick' });
      },
    });
  }
  // Only ores drop anything: mined stone and deepslate leave nothing behind (no cobblestone to build with).
  if (typeof game.spawnBlockDrops === 'function') {
    const spawnBlockDrops = game.spawnBlockDrops.bind(game);
    api.extend(game, {
      spawnBlockDrops(pos, blockId, ...rest) {
        if (manager.active && !MINE_ORE_BLOCKS.has(blockId)) return undefined;
        return spawnBlockDrops(pos, blockId, ...rest);
      },
    });
  }
  // Kit items stay with their owner.
  if (typeof game.dropHeldItem === 'function') {
    const dropHeldItem = game.dropHeldItem.bind(game);
    api.extend(game, {
      dropHeldItem(...args) {
        if (manager.active && game.inventory?.getActiveItem?.()?.miningSim) {
          game.ui?.addChatMessage?.('Your pickaxe and Superstick stay with you.', 'system');
          return 0;
        }
        return dropHeldItem(...args);
      },
    });
  }
  // The coin count on the inventory screen.
  if (game.ui?.toggleInventory) {
    const toggleInventory = game.ui.toggleInventory.bind(game.ui);
    api.extend(game.ui, {
      toggleInventory(...args) {
        const result = toggleInventory(...args);
        if (manager.active) manager.ui?.refreshCoins();
        return result;
      },
    });
  }
  api.onLeaveWorld(() => manager.deactivate());
  api.onDispose(() => manager.deactivate());
  return api.registered;
}
