// Golden-seed generation, shared by the updater script and the regression test.
//
// ONE definition, deliberately. If the updater and the test each built their own list of seeds the two would
// drift, and a golden file that no longer matches its own generator is worse than no golden file: it trains a
// reader to re-run the updater, which erases the signal the file exists to carry.
//
// What is recorded per structure:
//   * the seed and the chunk the structure is FIRST FOUND AT, which pins placement as well as layout;
//   * `planHash`, the engine's own hash of the plan;
//   * the piece count and the start box, which catch a structure silently losing or gaining pieces;
//   * `contentHash` over the REALIZED blocks, sorted, which catches a change in what is actually written --
//     including block states and loot tables, since both are folded into the string.
//
// The terrain is a flat surface at Y 70 because a golden must not depend on the world generator. That means
// these goldens pin THIS ENGINE's behaviour, not vanilla's: they are a regression net, and the parity matrix
// still records that nothing is `VERIFIED` without a differential test against vanilla.

import { createStructureEngine, generatorCoverage, getStructure } from '../src/worldgen/index.js';
import { contentHash } from '../src/worldgen/random.js';
import { BLOCKS } from '../src/blocks.js';

/** The search bound for locating each structure. Generous, because a sparse set must still be findable. */
export const LOCATE_CHUNK_LIMIT = 6000;

/**
 * How many chunkZ ROWS to scan. More than one, because a single row is a thin sample of a sparse set: the
 * ruined-portal jungle variant is reachable but does not appear on row 0 at the golden seed, which made an
 * earlier version of this harness report a reachable structure as unreachable.
 */
export const LOCATE_CHUNK_ROWS = 2;

/** Structures whose goldens are recorded, in a fixed order so the file's diff is readable. */
export function goldenStructureIds() {
  const { implemented } = generatorCoverage();
  const order = ['buried_treasure', 'igloo', 'nether_fossil', 'desert_pyramid', 'swamp_hut', 'pillager_outpost'];
  return [...order.filter((id) => implemented.includes(id)), ...implemented.filter((id) => !order.includes(id)).sort()];
}

function contextFor(engine, id) {
  const entry = getStructure(id);
  // The registry's first biome is deterministic, so the golden does not need a biome table of its own.
  const biome = entry?.biomes?.[0] ?? 'plains';
  return { biome, surfaceY: () => 70 };
}

function realizeInto(start, engine) {
  const blocks = [];
  engine.realize(start, (x, y, z, blockId, meta) => {
    blocks.push(`${x},${y},${z},${blockId},${meta?.state?.name ?? ''},${meta?.lootTable ?? ''}`);
    return true;
  }, { chunkX: start.chunkX, chunkZ: start.chunkZ, surfaceY: () => 70, foundationBlock: BLOCKS.STONE });
  blocks.sort();
  return blocks;
}

/** Generate one golden entry, or null when the structure cannot be found inside the search bound. */
export function goldenFor(id, seed) {
  const entry = getStructure(id);
  if (!entry) throw new Error(`unknown structure "${id}"`);
  const dimension = entry.dimension ?? 'overworld';
  const probe = createStructureEngine({ seed, dimension, blockIds: BLOCKS, biomeAt: () => 'plains', surfaceY: () => 70 });
  const { biome } = contextFor(probe, id);
  const engine = createStructureEngine({
    seed, dimension, blockIds: BLOCKS,
    biomeAt: () => biome,
    surfaceY: () => 70
  });

  let found = null;
  for (let chunkZ = 0; chunkZ <= LOCATE_CHUNK_ROWS && !found; chunkZ++) {
    for (let chunkX = 0; chunkX < LOCATE_CHUNK_LIMIT && !found; chunkX++) {
      const plan = engine.planChunk(chunkX, chunkZ);
      if (plan && plan.structureId === id) found = plan;
    }
  }
  if (!found) return null;

  const blocks = realizeInto(found.start, engine);
  return {
    id,
    seed,
    dimension,
    biome,
    chunkX: found.start.chunkX,
    chunkZ: found.start.chunkZ,
    planHash: engine.hashStart(found.start),
    pieces: found.start.pieces.length,
    box: found.start.box.toArray(),
    blockCount: blocks.length,
    contentHash: contentHash(blocks.join('\n'))
  };
}

/** Every golden entry. One fixed seed for all of them, so the file has a single seed to reason about. */
export function generateGoldens({ seed = 20250401 } = {}) {
  const entries = [];
  const unfound = [];
  for (const id of goldenStructureIds()) {
    const golden = goldenFor(id, seed);
    if (golden) entries.push(golden);
    else unfound.push(id);
  }
  return { seed, generatedFor: 'Minecraft Java Edition 1.21.4 (see docs/STRUCTURE_REFERENCES.md)', entries, unfound };
}
