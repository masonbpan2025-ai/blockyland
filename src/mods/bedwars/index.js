// Bed Wars -- the mod entrypoint. The core never imports this; the loader calls `register`.
//
// A designed world whose islands are built from { teams, theme, seed } (arena.js), whose match the host's browser runs
// (rules.js, client.js), and which friends join through the game's own world sharing with the 4-digit code -- as
// SkyWars does (../skywars/index.js), whose shape this follows.
import manifest from './manifest.js';
import { BedWarsManager } from './client.js';

export const MOD_ID = 'bedwars';
export const MECHANISM_ID = 'bedwars';
export const MAP_FILENAME = 'BedWars.json';

export function mechanismDefinition() {
  return {
    id: MECHANISM_ID,
    name: 'Bed Wars',
    description: manifest.description,
    modId: MOD_ID,
    features: { hasBedWarsLobby: true, allowCreativeFlight: false },
    activate: (game) => game.bedwars?.activate(),
    deactivate: (game) => game.bedwars?.deactivate(),
  };
}

/** The core's hooks for this world (main.js and player.js call game.modRuntime). */
export function createRuntime(game) {
  const bw = () => (game.bedwars?.active ? game.bedwars : null);
  return {
    isModalOpen: () => Boolean(bw()?.isModalOpen()),
    update: (dt) => game.bedwars?.update(dt),
    // The match decides the game mode: adventure in the waiting room, survival in play, spectator while dead or out.
    canChangeGameMode: () => {
      if (!bw()) return true;
      game.ui?.addChatMessage?.('Bed Wars sets the game mode itself.', 'system');
      return false;
    },
    // Nothing drops on death: the resources go to the killer, and the rest is the kit's (client.js onLocalDeath).
    keepInventoryOnDeath: () => Boolean(bw()),
    // Bridging as on Bedrock, as SkyWars has it: looking down past the edge places the next block (bedrockBridging.js).
    bedrockBridging: () => Boolean(bw()),
    onPlayerDeath: () => Boolean(bw()?.onLocalDeath()),
    interact: (target) => Boolean(bw()?.interact(target)),
    canBreakBlock: (x, y, z, id) => bw()?.canBreakBlock(x, y, z, id),
    onBlockBroken: (x, y, z, id) => bw()?.onBlockBroken(x, y, z, id),
    canPlaceBlock: (x, y, z, item) => bw()?.canPlaceBlock(x, y, z, item),
    onDrink: (item) => bw()?.onDrink(item),
  };
}

export function register(api, { game = null } = {}) {
  api.registerMap(MAP_FILENAME, { filename: MAP_FILENAME, mechanism: MECHANISM_ID });
  api.registerMechanism(MECHANISM_ID, mechanismDefinition());
  if (game) {
    const manager = new BedWarsManager(game);
    api.attach('bedwars', manager);
    api.attach('modRuntime', createRuntime(game));
    // What hurt this player last, for the death message and the kill: a player's hit, an arrow, a fall, an explosion.
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
