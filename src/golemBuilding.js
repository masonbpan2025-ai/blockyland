// Building golems from blocks (Java Edition).
//
// Wiki (Iron Golem): "Iron golems can be created by placing four blocks of iron in a T-shape, and placing a carved
// pumpkin or jack o'lantern on top of the middle block"; "the bottom corners must be air" -- replaceable blocks such as
// snow layers or grass also do. Wiki (Snow Golem): "two snow blocks stacked on top of each other, with a carved pumpkin or
// jack o'lantern placed on top". The head goes on last (placing it is what checks the shape), the blocks are removed and
// the golem appears where the shape stood; a built iron golem is player-created, so it never attacks the player.
// Found by the wiki-tutorial play-test (Advancement guide, "Hired Help"; iron farms): there was no way to build either.
import { BLOCKS } from './blocks.js';

const HEADS = new Set([BLOCKS.CARVED_PUMPKIN, BLOCKS.JACK_O_LANTERN].filter((v) => v !== undefined));
const OPEN = new Set([BLOCKS.AIR, BLOCKS.CAVE_AIR, BLOCKS.SNOW_LAYER, BLOCKS.SHORT_GRASS, BLOCKS.TALL_GRASS, BLOCKS.FERN].filter((v) => v !== undefined));

/** The head just placed at x, y, z: build an iron or snow golem if the shape below is complete. Returns the mob or null. */
export function tryBuildGolem(game, x, y, z) {
  const world = game?.world;
  if (!world || !HEADS.has(world.getVoxel(x, y, z))) return null;
  const at = (dx, dy, dz) => world.getVoxel(x + dx, y + dy, z + dz);
  // Snow golem: two snow blocks under the head.
  if (at(0, -1, 0) === BLOCKS.SNOW && at(0, -2, 0) === BLOCKS.SNOW) {
    for (const dy of [0, -1, -2]) world.setVoxel(x, y + dy, z, BLOCKS.AIR);
    return spawn(game, 'snow_golem', x, y - 2, z);
  }
  // Iron golem: the stem and arms, in either direction across.
  if (at(0, -1, 0) !== BLOCKS.IRON_BLOCK || at(0, -2, 0) !== BLOCKS.IRON_BLOCK) return null;
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    if (at(ax, -1, az) !== BLOCKS.IRON_BLOCK || at(-ax, -1, -az) !== BLOCKS.IRON_BLOCK) continue;
    if (!OPEN.has(at(ax, -2, az)) || !OPEN.has(at(-ax, -2, -az))) continue;
    for (const [dx, dy, dz] of [[0, 0, 0], [0, -1, 0], [0, -2, 0], [ax, -1, az], [-ax, -1, -az]]) world.setVoxel(x + dx, y + dy, z + dz, BLOCKS.AIR);
    const golem = spawn(game, 'iron_golem', x, y - 2, z);
    if (golem) { golem.playerCreated = true; golem.isPlayerBuilt = true; }
    return golem;
  }
  return null;
}

function spawn(game, type, x, y, z) {
  const mob = game.mobs?.spawnMob?.(type, x + 0.5, y, z + 0.5);
  for (const [cx, cz] of [[Math.floor(x / 16), Math.floor(z / 16)]]) { const c = game.world.getChunk?.(cx, cz); if (c) game.rebuildChunkMesh?.(c); }
  game.sounds?.playPlace?.('stone');
  return mob ?? null;
}
