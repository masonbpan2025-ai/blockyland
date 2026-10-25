// SkyWars -- the mod entrypoint. The core never imports this; the loader calls `register`.
//
// A designed world whose islands are built from a template (arena.js), whose match the host's browser runs
// (rules.js, client.js), and which friends join through the game's own world sharing with the 4-digit code.
import manifest from './manifest.js';
import { SkyWarsManager } from './client.js';

export const MOD_ID = 'skywars';
export const MECHANISM_ID = 'skywars';
export const MAP_FILENAME = 'SkyWars.json';

export function mechanismDefinition() {
  return {
    id: MECHANISM_ID,
    name: 'SkyWars',
    description: manifest.description,
    modId: MOD_ID,
    features: { hasSkyWarsLobby: true, allowCreativeFlight: false },
    activate: (game) => game.skywars?.activate(),
    deactivate: (game) => game.skywars?.deactivate(),
  };
}

/** The core's hooks for this world (main.js and player.js call game.modRuntime). */
export function createRuntime(game) {
  return {
    isModalOpen: () => Boolean(game.skywars?.isModalOpen()),
    update: (dt) => game.skywars?.update(dt),
    // The match decides the game mode: adventure in the cage, survival in play, spectator once out.
    canChangeGameMode: () => {
      if (!game.skywars?.active) return true;
      game.ui?.addChatMessage?.('SkyWars sets the game mode itself.', 'system');
      return false;
    },
    // The loot of a death is dropped by the match, so every player can see it and only one can take it.
    keepInventoryOnDeath: () => Boolean(game.skywars?.active),
    // Bridging as on Bedrock, where SkyWars is mostly played: facing the void, looking down ahead of the feet places
    // the next block (src/bedrockBridging.js), so no sneaking backwards to click the edge's side as in Java.
    bedrockBridging: () => Boolean(game.skywars?.active),
    onPlayerDeath: () => Boolean(game.skywars?.onLocalDeath()),
  };
}

export function register(api, { game = null } = {}) {
  api.registerMap(MAP_FILENAME, { filename: MAP_FILENAME, mechanism: MECHANISM_ID });
  api.registerMechanism(MECHANISM_ID, mechanismDefinition());
  if (game) {
    const manager = new SkyWarsManager(game);
    api.attach('skywars', manager);
    api.attach('modRuntime', createRuntime(game));
    // What killed this player last, for the death message: a player's hit, a fall, or something else.
    if (game.player) {
      const takeDamage = game.player.takeDamage.bind(game.player);
      api.extend(game.player, {
        takeDamage(amount, sourcePos, damageType, ...rest) {
          if (manager.active && amount > 0) manager.lastDamageType = damageType;
          return takeDamage(amount, sourcePos, damageType, ...rest);
        },
      });
    }
    api.onLeaveWorld(() => manager.deactivate());
    api.onDispose(() => manager.deactivate());
  }
  return api.registered;
}
