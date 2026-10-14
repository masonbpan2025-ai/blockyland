import { ModApi } from '../../src/mods/loader.js';
import { ContentRegistry } from '../../src/mods/registry.js';
import { registerMobs } from '../../src/mods/dragonball-tournament/mobs.js';
import { createRuntime } from '../../src/mods/dragonball-tournament/runtime.js';

export function installTournamentProviders(game) {
  const api = new ModApi({registry: new ContentRegistry(), loader: {}, modId: 'dragonball_tournament', game});
  registerMobs(api, game);
  game.modRuntime = createRuntime(game);
  game.mobs.game = game;
  if (game.player) game.player.game = game;
  return api;
}
