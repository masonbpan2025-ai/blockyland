// A mini-game's world as its host builds it, for a house bot: the arena's blocks from the map, by the game's own arena
// code (src/mods/<game>/arena.js buildArena, as SkyWarsManager and BedWarsManager build theirs). A bot given this
// (GuestPeerSession's `buildWorld`) needs no world from the host, so the host does not stop to serialise one when a bot
// joins. The last few arenas are kept: four bots of a team ask for the same map at once.
import { buildArena as buildSkyWars } from '../src/mods/skywars/arena.js';
import { buildArena as buildBedWars } from '../src/mods/bedwars/arena.js';

const cache = new Map();
const KEEP = 4;

/** The blocks of a game's arena on a map ("x,y,z" -> block id), or null for a game with no arena. */
export function arenaBlocks(game, map) {
  if (game !== 'skywars' && game !== 'bedwars') return null;
  const key = `${game}|${JSON.stringify(map ?? null)}`;
  if (!cache.has(key)) {
    cache.set(key, (game === 'bedwars' ? buildBedWars(map) : buildSkyWars(map)).blocks);
    while (cache.size > KEEP) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
