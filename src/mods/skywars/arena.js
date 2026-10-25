// The SkyWars arena: floating islands in the void, laid out by a map template (templates.js) in the materials and
// decorations of a data pack (packs.js), from a seed. Pure and deterministic, so the host and every guest build or
// restore exactly the same arena from { template, pack, seed }, and tests can check it without a browser.
//
// minecraft.wiki Tutorial:SkyWars: "each player starts off on a separate island that is floating in the void";
// "Often there is a central, larger island that has better loot, an enchanting table, and sometimes several anvils."
import { BLOCKS } from '../../blocks.js';
import { ARENA, seededRandom, cellKey } from './generator.js';
import { TEMPLATES, DEFAULT_TEMPLATE, generateArena } from './templates.js';
import { PACKS, defaultPackFor } from './packs.js';

export { ARENA, seededRandom, cellKey };

/** The map a lobby starts on. */
export const DEFAULT_MAP = Object.freeze({ template: DEFAULT_TEMPLATE, pack: defaultPackFor(DEFAULT_TEMPLATE), seed: 2015 });

/** The same map, as one string: two arenas with the same key are the same arena. */
export const mapKey = (map) => `${map?.template}/${map?.pack}/${map?.seed >>> 0}`;

/** A map that names a template and a pack this build has; anything else falls back to the default's. */
export function normalizeMap(map = {}) {
  const template = TEMPLATES[map.template] ? map.template : DEFAULT_MAP.template;
  const pack = PACKS.get(map.pack)?.templates.includes(template) ? map.pack : defaultPackFor(template);
  const seed = Number.isFinite(map.seed) ? map.seed >>> 0 : DEFAULT_MAP.seed;
  return { template, pack, seed };
}

/**
 * The whole arena: every non-air cell, the chests (with their kind -- island, mid or center -- and the island they belong
 * to), each slot's spawn and cage, the spectators' spot, and the box that holds it all; outside the box is the void.
 * @param {{template?:string, pack?:string, seed?:number}|number} map a number is a seed for the default map
 */
export function buildArena(map = DEFAULT_MAP) {
  const { template, pack, seed } = normalizeMap(typeof map === 'number' ? { ...DEFAULT_MAP, seed: map } : map);
  const resolved = PACKS.get(pack);
  const arena = generateArena({ template, pack, generation: resolved.generation, seed });
  arena.name = `${TEMPLATES[template].name}: ${resolved.name}`;
  return arena;
}

/** Every cage cell of every slot. */
export const allCageCells = (arena) => arena.cages.flat();

/**
 * The cells that differ from the arena -- a bridge someone built, a block someone broke, an opened cage, or the whole
 * of another map -- as `[x, y, z, wanted]`. Restoring a round writes exactly these. `getVoxel` reads the world;
 * `also` is another box to clear, the previous map's when the map changes.
 */
export function arenaDifferences(arena, getVoxel, also = null) {
  const out = [];
  const box = also ? {
    minX: Math.min(arena.bounds.minX, also.minX), maxX: Math.max(arena.bounds.maxX, also.maxX),
    minZ: Math.min(arena.bounds.minZ, also.minZ), maxZ: Math.max(arena.bounds.maxZ, also.maxZ),
    minY: Math.min(arena.bounds.minY, also.minY), maxY: Math.max(arena.bounds.maxY, also.maxY),
  } : arena.bounds;
  for (let x = box.minX; x <= box.maxX; x++) for (let z = box.minZ; z <= box.maxZ; z++) for (let y = box.minY; y <= box.maxY; y++) {
    const wanted = arena.blocks.get(cellKey(x, y, z)) ?? BLOCKS.AIR;
    if (getVoxel(x, y, z) !== wanted) out.push([x, y, z, wanted]);
  }
  return out;
}
