// Where a Nether or End world starts, and the small portals that lead out of it.
//
// A world made from a Nether or End biome began the player in that dimension with no way home but building and lighting
// a portal (the Nether) or finding a stronghold in an Overworld it could not reach (the End). And every End choice --
// Small End Islands, End Highlands and the rest -- started on the main island's obsidian platform, the same place.
//
//   * A Nether world's spawn has a lit Nether portal beside it. It leads to a random Overworld biome: one picked from the
//     world's seed, found in the mixed Overworld (World.mixedOverworldBiome), with a portal back to the spawn.
//   * An End world's spawn has a small End portal beside it, three blocks of bedrock round one portal block, which
//     leads back to the Overworld as the exit portal does.
//   * Only "The End" starts on the main island. Small End Islands starts on a small island, Big End Islands and the
//     three outer biomes on a big one, Chorus Fruit Forest among chorus plants, End City beside an End city.
//   * Killing the dragon also opens two small gateways: one on the main island to the nearest End city, and one there
//     back to the main island (https://minecraft.wiki/w/The_End gives the dragon's own gateway; these two are this
//     game's, asked for so the cities can be reached without ender pearls).
import { BLOCKS as B } from './blocks.js';
import { endColumn, END_OUTER_RADIUS } from './endTerrain.js';
import { getBiomeDef } from './biomes.js';
import { findSurfaceSpawn } from './worldSpawn.js';
import { generateDestinationPortal } from './netherPortal.js';
import { locateNearestStructure } from './worldStructures.js';
import { netherRandom as coordinateRandom } from './netherTerrain.js';
import { endStateFor, smallPortalCells } from './endProgression.js';

/** How each End choice in the biome list starts the player. */
export const END_SPAWNS = {
  the_end: 'main',
  small_end_islands: 'small',
  big_end_islands: 'big',
  end_midlands: 'big',
  end_highlands: 'big',
  end_barrens: 'big',
  chorus_forest: 'chorus',
  end_city: 'city'
};

/** The land biomes the mixed Overworld makes; a Nether world's portal leads to one of them. Oceans are left out. */
export const OVERWORLD_PORTAL_BIOMES = [
  'plains', 'forest', 'flower_forest', 'dark_forest', 'swamp', 'jungle', 'savanna', 'desert', 'badlands', 'taiga',
  'snowy_plains', 'meadow', 'cherry_grove', 'grove', 'snowy_slopes', 'stony_peaks', 'mushroom_fields'
];

const chunkOf = (v) => Math.floor(v / 16);
function generateAround(world, x, z, radius = 8) {
  for (let cx = chunkOf(x - radius); cx <= chunkOf(x + radius); cx++) for (let cz = chunkOf(z - radius); cz <= chunkOf(z + radius); cz++) world.getOrCreateChunk?.(cx, cz);
}

/**
 * The Overworld biome a Nether world's spawn portal leads to, and a column of it: picked from the seed, then found by
 * walking out in rings through the mixed Overworld's biome map (pure noise, nothing generated). Another biome is tried
 * when one is not found within `maxRadius`.
 * @returns {{biome:string, x:number, z:number}|null}
 */
export function overworldPortalTarget(world, { maxRadius = 6000, step = 48 } = {}) {
  if (typeof world?.mixedOverworldBiome !== 'function') return null;
  const first = Math.floor(coordinateRandom(world.seed ?? 0, 7, 0, 11, 401) * OVERWORLD_PORTAL_BIOMES.length);
  for (let i = 0; i < OVERWORLD_PORTAL_BIOMES.length; i++) {
    const biome = OVERWORLD_PORTAL_BIOMES[(first + i) % OVERWORLD_PORTAL_BIOMES.length];
    for (let r = 0; r <= maxRadius; r += step) {
      const points = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / step);
      for (let p = 0; p < points; p++) {
        const a = (p / points) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        // The middle of a patch of it, not its edge: the four columns 16 blocks out are the same biome.
        if (world.mixedOverworldBiome(x, z) !== biome) continue;
        if ([[16, 0], [-16, 0], [0, 16], [0, -16]].every(([dx, dz]) => world.mixedOverworldBiome(x + dx, z + dz) === biome)) return { biome, x, z };
      }
    }
  }
  return null;
}

/**
 * A Nether world's spawn portal: a lit 4x5 frame beside the spawn, linked to `overworldPortalTarget`. Recorded on the
 * world (`spawnPortals`, saved with the session) so the Nether portal's travel can follow the link both ways.
 */
export function placeNetherSpawnPortal(game, spawn) {
  const world = game?.world;
  if (!world || world.dimension !== 'nether' || !spawn) return null;
  const target = overworldPortalTarget(world);
  if (!target) return null;
  // Beside the spawn, on its level: the frame two blocks east of the player, standing on the forced 2x3 obsidian
  // platform a Nether portal makes when it finds no site (Nether portal). A searched-for site could be a ledge 12
  // blocks off and 9 up in the Nether's rough ground, which is not beside anything.
  const built = generateDestinationPortal(world, Math.floor(spawn.x) + 3, Math.floor(spawn.y) - 1, Math.floor(spawn.z), 'x', { platform: true });
  for (const { cx, cz } of built.affectedChunks ?? []) { const chunk = world.getChunk?.(cx, cz); if (chunk) chunk.dirty = true; }
  world.spawnPortals = {
    nether: { x: built.spawnX, y: built.spawnY, z: built.spawnZ },
    overworld: { x: target.x + 0.5, y: null, z: target.z + 0.5, biome: target.biome }
  };
  // The portal may have been built where the player stood: move them to clear ground beside it.
  const p = game.player?.position;
  if (p && isPortalOrFrame(world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) {
    const moved = findSurfaceSpawn(world, { x: built.spawnX + 3, z: built.spawnZ + 3, radius: 6 });
    if (moved?.found) { p.set(moved.x, moved.y, moved.z); game.player.spawnPosition?.set?.(moved.x, moved.y, moved.z); }
  }
  return world.spawnPortals;
}
const isPortalOrFrame = (id) => id === B.NETHER_PORTAL || id === B.OBSIDIAN;

/**
 * Where a Nether portal at `from` leads when it is one end of the spawn link, or null for any other portal (which keeps
 * the 8:1 rule). From the Nether spawn portal: the chosen biome's column, at its surface. From within 24 blocks of that
 * column in the Overworld: the Nether spawn portal.
 */
export function spawnPortalLink(world, fromDimension, from) {
  const link = world?.spawnPortals;
  if (!link?.nether || !link.overworld || !from) return null;
  const near = (a, r) => Math.hypot(from.x - a.x, from.z - a.z) <= r;
  if (fromDimension === 'nether' && near(link.nether, 4)) {
    const x = Math.floor(link.overworld.x), z = Math.floor(link.overworld.z);
    const y = (world.surfaceHeightAt?.(x, z, link.overworld.biome) ?? 30) + 1;
    return { x, y, z, biome: link.overworld.biome };
  }
  if (fromDimension === 'overworld' && near(link.overworld, 24)) {
    return { x: Math.floor(link.nether.x), y: Math.floor(link.nether.y), z: Math.floor(link.nether.z) };
  }
  return null;
}

/** The saved form of the spawn link, and back. */
export function captureSpawnPortals(world) {
  return world?.spawnPortals ? JSON.parse(JSON.stringify(world.spawnPortals)) : null;
}
export function restoreSpawnPortals(world, saved) {
  if (!world) return null;
  const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
  world.spawnPortals = saved && ok(saved.nether) && ok(saved.overworld)
    ? { nether: { ...saved.nether }, overworld: { ...saved.overworld, biome: String(saved.overworld.biome ?? '') } }
    : null;
  return world.spawnPortals;
}

// --- The End ---------------------------------------------------------------------------------------------------------

/**
 * A column on the outer islands for one kind of start: 'small' (a small island), 'big' or 'chorus' (a big island, away
 * from its rim). Searched from the seed's own bearing 1100 blocks out, in rings, from the terrain's pure columns
 * (endColumn) so nothing is generated while looking.
 */
export function findOuterIsland(world, kind = 'big', { maxRadius = 1600, step = 8 } = {}) {
  const angle = coordinateRandom(world.seed ?? 0, 3, 0, 5, 409) * Math.PI * 2;
  const cx = Math.round(Math.cos(angle) * (END_OUTER_RADIUS + 90)), cz = Math.round(Math.sin(angle) * (END_OUTER_RADIUS + 90));
  const wanted = kind === 'small' ? 'small' : 'big';
  const minStrength = kind === 'small' ? 0.35 : 0.5;
  const solid = (x, z) => endColumn(world, x, z).top > 0;
  for (let r = 0; r <= maxRadius; r += step) {
    const points = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / step);
    for (let p = 0; p < points; p++) {
      const a = (p / points) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      if (Math.hypot(x, z) < END_OUTER_RADIUS + 16) continue;
      const c = endColumn(world, x, z);
      if (!c.top || c.island !== wanted || !(c.strength >= minStrength)) continue;
      if (![[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3]].every(([dx, dz]) => solid(x + dx, z + dz))) continue;
      return { x, y: c.top + 1, z, island: c.island, biome: c.biome };
    }
  }
  return null;
}

/** A column on the island next to an End city's box, outside it, facing it. */
export function besideEndCity(world, box) {
  const [minX, , minZ, maxX, , maxZ] = box;
  const midX = Math.round((minX + maxX) / 2), midZ = Math.round((minZ + maxZ) / 2);
  for (let gap = 3; gap <= 24; gap += 1) {
    for (const [x, z] of [[minX - gap, midZ], [maxX + gap, midZ], [midX, minZ - gap], [midX, maxZ + gap]]) {
      const c = endColumn(world, x, z);
      if (c.top > 0 && [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => endColumn(world, x + dx, z + dz).top > 0)) {
        return { x, y: c.top + 1, z, yaw: Math.atan2(-(midX - x), -(midZ - z)) };
      }
    }
  }
  return null;
}

/** The nearest End city to a point, or null when this world has none near enough (or no structures). */
export function nearestEndCity(world, x = 0, z = 0) {
  try { return locateNearestStructure(world, 'end_city', x, z, { maxRadiusChunks: 256 }); } catch { return null; }
}

/**
 * A small portal on a 3x3 bedrock floor (endProgression.js smallPortalCells): END_PORTAL, set into the floor's middle
 * and stepped onto, leads to the Overworld as the exit portal does; END_GATEWAY stands two high and is walked into
 * (its destination is recorded by `openEndCityLinks`). `groundY` is the top block of the ground.
 * @returns {Array<[number,number,number]>} the portal cells
 */
export function buildSmallPortal(world, x, groundY, z, block = B.END_PORTAL) {
  const cells = smallPortalCells(x, groundY, z, block);
  for (const [cx, cy, cz, id] of cells) world.setVoxel(cx, cy, cz, id);
  return cells.filter(([, , , id]) => id === block).map(([cx, cy, cz]) => [cx, cy, cz]);
}

/** Where a small portal can stand beside (x, z): three blocks out, on ground no lower than two below the feet. */
function portalSpotNear(world, x, z, feetY) {
  for (const [dx, dz] of [[3, 0], [0, 3], [-3, 0], [0, -3], [4, 1], [1, 4]]) {
    const px = Math.floor(x) + dx, pz = Math.floor(z) + dz;
    const ground = world.getHighestSolidY?.(px, pz) ?? 0;
    if (ground > 0 && Math.abs(ground + 1 - feetY) <= 2) return { x: px, groundY: ground, z: pz };
  }
  return { x: Math.floor(x) + 3, groundY: Math.floor(feetY) - 1, z: Math.floor(z) };
}

/**
 * Start an End world: the player is placed for the selected choice (END_SPAWNS) and a small End portal to the Overworld
 * is built beside them. "The End" keeps the main island's obsidian platform, and the portal stands just off its edge.
 * Generates the chunks it needs.
 * @param {{x:number,y:number,z:number,yaw?:number}} platform the obsidian arrival, for "The End"
 * @returns {{x:number,y:number,z:number,yaw:number,found:boolean,reason:string,kind:string,portal:Array}}
 */
export function placeEndWorldSpawn(game, platform) {
  const world = game.world;
  const kind = END_SPAWNS[world.selectedBiome] ?? 'main';
  let at = null, reason = '';
  if (kind === 'city') {
    const city = nearestEndCity(world, END_OUTER_RADIUS + 200, 0);
    if (city) { at = besideEndCity(world, city.box); reason = `beside the End city at ${city.centre.x}, ${city.centre.z}`; }
    if (!at) { at = findOuterIsland(world, 'big'); reason = 'no End city found near; on a big island'; }
  } else if (kind !== 'main') {
    at = findOuterIsland(world, kind);
    reason = { small: 'on a small End island', big: 'on a big End island', chorus: 'in a chorus forest' }[kind];
  }
  if (!at) {
    // The main island, or an outer search that found nothing: the obsidian platform.
    at = { ...platform }; reason = kind === 'main' ? 'End obsidian arrival platform' : `${reason || kind}: none found, so the platform`;
    const portal = buildSmallPortal(world, Math.floor(platform.x) + 5, Math.floor(platform.y) - 1, Math.floor(platform.z), B.END_PORTAL);
    // The platform floats: an obsidian step joins it to the portal's floor.
    world.setVoxel(Math.floor(platform.x) + 3, Math.floor(platform.y) - 1, Math.floor(platform.z), B.OBSIDIAN);
    return { ...at, yaw: platform.yaw ?? 0, found: true, reason, kind, portal };
  }
  generateAround(world, at.x, at.z, 12);
  const ground = findSurfaceSpawn(world, { x: at.x, z: at.z, radius: 6 });
  const spot = ground?.found ? ground : { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
  const p = game.player;
  p.position.set(spot.x, spot.y, spot.z);
  if (Number.isFinite(at.yaw)) p.yaw = at.yaw;
  p.velocity?.set?.(0, 0, 0);
  p.spawnPosition = p.position.clone();
  const site = portalSpotNear(world, spot.x, spot.z, spot.y);
  const portal = buildSmallPortal(world, site.x, site.groundY, site.z, B.END_PORTAL);
  return { x: spot.x, y: spot.y, z: spot.z, yaw: p.yaw ?? 0, found: true, reason, kind, portal };
}

/** Is this column part of an outer island (not the main island, not the void between)? */
export function onOuterIsland(world, x, z) {
  return Math.hypot(x, z) >= END_OUTER_RADIUS && endColumn(world, x, z).top > 0;
}

/** Whether the selected biome starts the world in the End (any of the End choices). */
export function isEndWorld(selectedBiome) { return !!getBiomeDef(selectedBiome)?.isEnd; }

/** Where the main island's small gateway to the End city stands: north of the podium, inside the ring of pillars. */
export const MAIN_ISLAND_LINK = { x: 0, z: -26 };

/**
 * After the dragon dies: a small gateway on the main island to the nearest End city, and one beside that city back.
 * Recorded in the End's state with their destinations (so they are saved and rebuilt like the dragon's gateways), and
 * opened once: a dragon killed again leaves them as they are.
 * @returns {{main:{x,y,z}, city:{x,y,z}, cityCentre:{x,z}}|null} null when there is no End city to lead to
 */
export function openEndCityLinks(world) {
  if (!world || world.dimension !== 'the_end') return null;
  const state = endStateFor(world);
  if (state.gateways.some((g) => g.link)) return null;
  const city = nearestEndCity(world, 0, 0);
  if (!city) return null;
  const there = besideEndCity(world, city.box);
  if (!there) return null;
  const home = MAIN_ISLAND_LINK, homeGround = endColumn(world, home.x, home.z).top;
  if (!homeGround) return null;
  generateAround(world, home.x, home.z, 3);
  generateAround(world, there.x, there.z, 3);
  const cityGround = there.y - 1;
  // Each arrives beside the other's portal, on the ground two blocks east of it, clear of the bedrock floor.
  const toCity = { x: there.x + 2.5, y: cityGround + 1, z: there.z + 0.5 };
  const toMain = { x: home.x + 2.5, y: homeGround + 1, z: home.z + 0.5 };
  const record = (x, groundY, z, destination, link) => {
    for (const [cx, cy, cz, id] of smallPortalCells(x, groundY, z, B.END_GATEWAY)) world.setVoxel(cx, cy, cz, id);
    for (const dy of [1, 2]) state.gateways.push({ x, y: groundY + dy, z, destination, link, small: { x, groundY, z } });
  };
  record(home.x, homeGround, home.z, toCity, 'end_city');
  record(there.x, cityGround, there.z, toMain, 'main_island');
  return { main: { x: home.x, y: homeGround + 1, z: home.z }, city: { x: there.x, y: there.y, z: there.z }, cityCentre: { x: city.centre.x, z: city.centre.z } };
}
