// Structures in the live world: the bridge between `src/worldgen/` and chunk generation.
//
// WHY THIS MODULE EXISTS, and why it is the most important file in this subsystem. The structure engine is
// complete and tested -- 30 structures, placement sets, jigsaw, terrain adaptation, loot -- and until this file
// it was called by NOTHING except the Structure Inspector page. A generated world therefore contained exactly
// one structure, a hand-written starting village in the spawn chunk, and none of the engine's structures ever
// appeared in game. Every test passed and the feature was still absent from the game, because nothing tested
// the path from "a chunk is generated" to "a structure is in it".
//
// THE DESIGN IS PER-CHUNK CLIPPED REALIZATION, which is what makes this safe in a lazily generated world:
//
//   * For the chunk being generated, find every enabled start whose box OVERLAPS it, and realize each one
//     CLIPPED to that chunk. The engine already supports the clip (`realize(..., { chunkX, chunkZ })`).
//   * Each chunk therefore writes only its own voxels. There are no cross-chunk writes, so generating a chunk
//     can never force a neighbour to generate, and a structure is complete regardless of the ORDER chunks
//     arrive in -- which was one of the engine's stated requirements.
//   * Planning is a pure function of (seed, chunk, registry, biome, surface), and both world queries here are
//     noise-based, so planning never needs a generated chunk either. That is why this cannot recurse.
//
// WHAT IS DELIBERATELY NOT SUPPORTED YET, recorded rather than quietly ignored:
//
//   * The world is 64 blocks tall (`CHUNK_HEIGHT`), while the engine targets a 384-block world. Structures
//     whose Y band falls outside 0..63 are trimmed by the writer and COUNTED in `stats.outOfWorld`, so
//     enabling `ancient_city` (Y -63..-31) or `trial_chambers` would write nothing and say so. Those need
//     either a taller world or a world-specific Y remap, and neither is guessed at here.
//   * Chest loot has nowhere to go: this world has no block-entity container store, so loot tables are
//     collected in `loot` for a caller (or a test) to use and are NOT yet attached to the placed chests.

import { createStructureEngine, getSetForStructure, generatorCoverage } from './worldgen/index.js';
import { BLOCKS } from './blocks.js';
import { PACK_STRUCTURES } from './dataPackRuntime.js';

/**
 * The structures enabled in generated worlds.
 *
 * Three surface structures on purpose, as the first end-to-end landing: each is small, sits at or near the
 * surface, is gated to a common biome (plains, snowy, desert), and fits inside the world's 64-block height.
 * The rest of the registry is one list entry away, but a structure that lands outside this world's Y range
 * would write nothing while looking enabled, so the list is grown deliberately rather than all at once.
 */
export const WORLD_STRUCTURE_IDS = ['village_plains', 'igloo', 'desert_pyramid'];

/**
 * Every structure id the engine can actually generate.
 *
 * `generatorCoverage` splits the registry into the structures with a generator and the four without one
 * (mineshaft, mineshaft_mesa, stronghold, fortress). A pack that names a structure this engine cannot build
 * must not enable it: it would plan nothing while the world reported it as on.
 */
export function generatableStructureIds() {
  return generatorCoverage().implemented;
}

/**
 * The structure ids a generated world should place.
 *
 * A DATA PACK WINS. When a pack carries `worldgen/structure/*.json` files, the set of structures a world
 * places is exactly the pack's structures that this engine can generate -- intersected, because the engine
 * cannot build a structure it has no generator for, and a name that plans nothing while looking enabled is
 * worse than not accepting it at all.
 *
 * With no pack structures, the baked `WORLD_STRUCTURE_IDS` applies, so a world with no packs generates
 * exactly what it did before this existed.
 *
 * The Y-range caveat in `WORLD_STRUCTURE_IDS` still stands and is NOT solved here: this world is 64 blocks
 * tall while the engine targets 384, so a structure the pack enables may land outside the world and write
 * nothing. That is a pre-existing limit of the engine, and enabling a taller structure is the pack author's
 * choice rather than something this function can decide for them.
 *
 * @param {Iterable<string>} [packIds] defaults to the structures the applied packs carry
 * @returns {string[]}
 */
export function enabledStructureIds(packIds = packStructureIds()) {
  const generatable = new Set(generatableStructureIds());
  const fromPack = [];
  for (const id of packIds ?? []) {
    const clean = String(id).includes(':') ? String(id).slice(String(id).indexOf(':') + 1) : String(id);
    // Deduplicated and order-stable: two packs naming the same structure enable it once.
    if (generatable.has(clean) && !fromPack.includes(clean)) fromPack.push(clean);
  }
  return fromPack.length ? fromPack : [...WORLD_STRUCTURE_IDS];
}

/** The structure ids the currently applied packs carry, namespaced ids stripped. */
export function packStructureIds(registry = PACK_STRUCTURES) {
  if (!registry || typeof registry.keys !== 'function') return [];
  const out = [];
  for (const id of registry.keys()) {
    const clean = String(id).includes(':') ? String(id).slice(String(id).indexOf(':') + 1) : String(id);
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * How far away a structure's START may be and still overlap this chunk.
 *
 * Four chunks is 64 blocks, comfortably more than the horizontal extent of every structure enabled above (the
 * largest, a plains village, spans about 50). It is also the only thing that costs work per chunk, so it is a
 * constant rather than a scan of the world.
 */
export const STRUCTURE_SEARCH_RADIUS_CHUNKS = 4;

/** A stable identity for one start, used to write it into a chunk at most once. */
function startKey(start) {
  const box = start.box;
  return `${start.structureId}@${box.minX},${box.minY},${box.minZ}`;
}

/**
 * @param {object} options
 * @param {number} options.seed      the world seed; the same seed must give the same structures
 * @param {object} options.world     the world, for `getBiome` and `surfaceHeightAt`
 * @param {object} options.sizes     `{ x, height, z }` chunk dimensions, INJECTED because importing them from
 *                                   `world.js` would make the two modules circular
 */
export function createWorldStructures({
  seed,
  world,
  sizes,
  enabledIds = WORLD_STRUCTURE_IDS,
  blockIds = BLOCKS,
  radiusChunks = STRUCTURE_SEARCH_RADIUS_CHUNKS,
  foundationBlock = BLOCKS.DIRT,
  adapt = true
} = {}) {
  if (!world || typeof world.getBiome !== 'function' || typeof world.surfaceHeightAt !== 'function') {
    throw new Error('createWorldStructures needs a world exposing getBiome and surfaceHeightAt');
  }
  if (!sizes || !sizes.x || !sizes.height || !sizes.z) {
    throw new Error('createWorldStructures needs the chunk sizes');
  }

  const enabled = new Set(enabledIds);
  // Which SETS matter, so a chunk with no relevant set is skipped without planning anything.
  //
  // `getSetForStructure` returns the set OBJECT while `candidatesForChunk` returns set NAMES, so the name has
  // to be taken from the object: comparing the object against a name never matches, and the whole integration
  // then plans nothing at all while looking correctly wired.
  const enabledSets = new Set();
  for (const id of enabled) {
    const set = getSetForStructure(id);
    if (set && set.name) enabledSets.add(set.name);
  }

  const engine = createStructureEngine({
    seed,
    blockIds,
    biomeAt: (x, z) => world.getBiome(x, z),
    surfaceY: (x, z) => world.surfaceHeightAt(x, z)
  });

  // One entry per chunk ever considered: a start, or null for "nothing here". Memoised because the scan
  // reaches the same neighbour chunk from many directions and planning is the expensive half.
  const plans = new Map();
  // Which start has already been realized into which chunk. A chunk can be asked to generate more than once
  // (the world registers a chunk before generating it, and callers re-enter), so this keeps writes idempotent.
  const applied = new Set();
  const loot = [];
  const stats = { chunks: 0, planned: 0, structures: 0, blocks: 0, outOfWorld: 0 };

  /** The start whose origin is this chunk, if it is one this world places. */
  function planAt(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (plans.has(key)) return plans.get(key);
    let start = null;
    const candidates = engine.candidatesForChunk(chunkX, chunkZ);
    if (candidates.some((set) => enabledSets.has(set))) {
      const plan = engine.planChunk(chunkX, chunkZ);
      // The engine chooses which structure applies to a chunk; this world only places the enabled ones, so a
      // disabled pick is dropped rather than written.
      if (plan && plan.start && enabled.has(plan.structureId)) {
        start = plan.start;
        stats.planned++;
      }
    }
    plans.set(key, start);
    return start;
  }

  /**
   * Write every structure that overlaps this chunk, clipped to it.
   *
   * @returns {object} the running stats, for tests and for a caller that wants to report them
   */
  function applyToChunk(chunk) {
    if (!chunk) return stats;
    stats.chunks++;
    const baseX = chunk.cx * sizes.x;
    const baseZ = chunk.cz * sizes.z;
    const maxX = baseX + sizes.x - 1;
    const maxZ = baseZ + sizes.z - 1;

    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        const start = planAt(chunk.cx + dx, chunk.cz + dz);
        if (!start) continue;
        const box = start.box;
        // Overlap in the horizontal plane only: a structure's Y band can lie entirely outside this world's
        // height, and that is a separate case reported through `outOfWorld` rather than by skipping it here.
        if (box.maxX < baseX || box.minX > maxX || box.maxZ < baseZ || box.minZ > maxZ) continue;

        const key = `${chunk.cx},${chunk.cz}|${startKey(start)}`;
        if (applied.has(key)) continue;
        applied.add(key);

        const written = engine.realize(start, (x, y, z, id, meta) => {
          const lx = x - baseX;
          const lz = z - baseZ;
          // The engine clips to the chunk column; this re-checks the WORLD's own height, because the engine's
          // target world is 384 tall and this one is 64. A block above the ceiling is dropped and counted,
          // which is what turns a silently empty structure into a reported one.
          if (lx < 0 || lx >= sizes.x || lz < 0 || lz >= sizes.z || y < 0 || y >= sizes.height) {
            stats.outOfWorld++;
            return false;
          }
          chunk.setVoxel(lx, y, lz, id);
          if (meta && meta.lootTable) loot.push({ x, y, z, lootTable: meta.lootTable });
          return true;
        }, {
          chunkX: chunk.cx,
          chunkZ: chunk.cz,
          surfaceY: (x, z) => world.surfaceHeightAt(x, z),
          foundationBlock,
          adapt
        });

        stats.structures++;
        stats.blocks += typeof written === 'number' ? written : 0;
      }
    }
    return stats;
  }

  return {
    applyToChunk,
    planAt,
    stats,
    loot,
    engine,
    enabledIds: [...enabled],
    enabledSets: [...enabledSets]
  };
}

/**
 * `/locate structure <id>`: the nearest instance of a structure this world generates.
 *
 * WHY THIS EXISTS: the structures were being generated and still looked absent, because the placement sets use
 * vanilla spacing (16 to 34 chunks), so the nearest one to spawn in the default world is roughly 340 blocks
 * away and NOTHING lies within 128 blocks of spawn. A player who generates a world and looks around sees none
 * of them -- which is what vanilla is like, and why vanilla has this command. Without it there is no way to
 * tell "the structures are far away" from "the structures are broken".
 *
 * Kept here rather than in the command handler so it can be tested without a browser.
 *
 * @returns {object} `{ structureId, chunk, centre, box, distance, biome }`
 * @throws when the world generates no structures, the id is not enabled, or nothing is within the radius
 */
export function locateNearestStructure(world, structureId, blockX, blockZ, { maxRadiusChunks = 4096 } = {}) {
  const integration = world && world.structures;
  if (!integration) throw new Error('this world does not generate structures');
  const id = String(structureId || integration.enabledIds[0] || '').toLowerCase();
  if (!id) throw new Error('no structures are enabled in this world');
  if (!integration.enabledIds.includes(id)) {
    // Naming what IS enabled turns a dead end into a usable answer.
    throw new Error(`${id} is not generated in this world; try: ${integration.enabledIds.join(', ')}`);
  }
  const found = integration.engine.locate(id, Math.floor(blockX), Math.floor(blockZ), { maxRadiusChunks });
  if (!found) throw new Error(`no ${id} within ${maxRadiusChunks} chunks`);
  const box = found.start.box;
  const centre = {
    x: Math.round((box.minX + box.maxX) / 2),
    y: Math.round((box.minY + box.maxY) / 2),
    z: Math.round((box.minZ + box.maxZ) / 2)
  };
  return {
    structureId: id,
    chunk: found.chunk,
    // The player has to WALK here, so the centre is more useful than the corner: a village spans 50 blocks.
    centre,
    box: [box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ],
    distance: Math.round(found.distance),
    biome: typeof world.getBiome === 'function' ? world.getBiome(centre.x, centre.z) : null
  };
}
