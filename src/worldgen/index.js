// The structure engine: placement, generation and realization behind one world-free API.
//
// Design contract (mission §19, §20):
//
//   * PLANNING is a pure function of (seed, chunk, registry). `planChunk` needs no loaded world, so a
//     structure that spans four chunks is planned identically no matter which chunk the player reaches
//     first. That property is what makes chunk-streaming worldgen deterministic, and it is why the
//     terrain queries arrive as callbacks instead of through a World object.
//   * REALIZATION is separate and per-chunk: only the blocks that fall inside a given chunk are written,
//     so planning a structure never forces its chunks to load.
//   * Nothing here calls Math.random. Every draw comes from `src/worldgen/random.js`.
//
// The engine is the piece the Structure Inspector drives: it can plan a single structure at a chosen
// seed and origin, show its pieces and bounding boxes, and realize it into a preview grid without
// generating a world.

import { StructurePlacementEngine, RandomSpreadStructurePlacement, ConcentricRingsStructurePlacement, FrequencyReducer, SpreadType } from './placement.js';
import { BlockBox } from './geometry.js';
import { contentHash } from './random.js';
import {
  STRUCTURES, STRUCTURE_SETS, STRUCTURE_TAGS, GENERATION_STEPS, GeneratorFamily,
  createSets, getStructure, getSetForStructure, structuresForDimension, validateRegistry
} from './registry.js';
import { generateBuriedTreasure, realizeBuriedTreasure } from './generators/buriedTreasure.js';
import { generateIgloo, realizeIgloo } from './generators/igloo.js';
import { generateRuinedPortal, realizeRuinedPortal } from './generators/ruinedPortal.js';
import { generateNetherFossil, realizeNetherFossil } from './generators/netherFossil.js';
import { generateShipwreck, realizeShipwreck } from './generators/shipwreck.js';
import { generateOceanRuin, realizeOceanRuin } from './generators/oceanRuin.js';
import { generateDesertPyramid, realizeDesertPyramid } from './generators/desertPyramid.js';
import { generateSwampHut, realizeSwampHut } from './generators/swampHut.js';
import { StructureStart, StructurePiece, TerrainAdaptation, Projection, JointType, TERRAIN_ADJUSTMENT_INFLATE } from './start.js';

/** Generators by registry `implementation` key. A structure with no entry cannot be planned yet. */
export const GENERATORS = {
  buriedTreasure: { generate: generateBuriedTreasure, realize: realizeBuriedTreasure },
  igloo: { generate: generateIgloo, realize: realizeIgloo },
  ruinedPortal: { generate: generateRuinedPortal, realize: realizeRuinedPortal },
  netherFossil: { generate: generateNetherFossil, realize: realizeNetherFossil },
  shipwreck: { generate: generateShipwreck, realize: realizeShipwreck },
  oceanRuin: { generate: generateOceanRuin, realize: realizeOceanRuin },
  desertPyramid: { generate: generateDesertPyramid, realize: realizeDesertPyramid },
  swampHut: { generate: generateSwampHut, realize: realizeSwampHut }
};

/** Structures that have a generator, and those that do not (the Inspector shows both). */
export function generatorCoverage() {
  const implemented = [];
  const missing = [];
  for (const [id, entry] of Object.entries(STRUCTURES)) {
    if (!entry) continue;
    (entry.implementation && GENERATORS[entry.implementation] ? implemented : missing).push(id);
  }
  return { implemented, missing };
}

/**
 * Build an engine for one dimension.
 *
 * @param {object} options
 * @param {number|bigint} options.seed
 * @param {string} [options.dimension]
 * @param {(x: number, z: number) => string|null} [options.biomeAt]
 * @param {(x: number, z: number, heightmap: string) => number} [options.surfaceY]
 * @param {object} [options.blockIds] block id table used by realization
 */
export function createStructureEngine({ seed, dimension = 'overworld', biomeAt = null, surfaceY = null, blockIds = null }) {
  const sets = createSets({ dimension });
  const registry = Object.fromEntries(
    Object.entries(STRUCTURES)
      .filter(([, entry]) => entry && entry.dimension === dimension)
      .map(([id, entry]) => [id, entry])
  );

  const engine = new StructurePlacementEngine({
    seed,
    sets,
    structureInfo: (id) => registry[id] || null,
    biomeAt,
    /**
     * The generator callback: this is vanilla's `Structure.findGenerationPoint`.
     *
     * Returning null means "this structure refuses this position", which is what drives the placement
     * engine's weighted without-replacement retry. A biome mismatch is the common reason, and it is
     * checked here rather than in the placement engine because vanilla checks the biome at the
     * structure's own start position, not at the candidate chunk's corner.
     */
    generate: (worldSeed, structureId, chunkX, chunkZ, context) => {
      const info = registry[structureId];
      if (!info) return null;
      const implementation = info.implementation && GENERATORS[info.implementation];
      if (!implementation) return null; // not implemented yet: documented in generatorCoverage()

      const startX = chunkX * 16 + 9;
      const startZ = chunkZ * 16 + 9;
      const biome = biomeAt ? biomeAt(startX, startZ) : null;
      if (info.biomes && info.biomes.length > 0) {
        if (!biome || !info.biomes.includes(biome)) return null;
      }
      if (info.biomeTagExcludes && biome && info.biomeTagExcludes.includes(biome)) return null;

      const start = implementation.generate({
        seed: worldSeed,
        chunkX,
        chunkZ,
        structureId,
        context: { biomeAt, surfaceY, info, set: context.set }
      });
      if (!start) return null;
      start.set = context.set;
      start.terrainAdaptation = info.terrainAdaptation || TerrainAdaptation.NONE;
      start.generationStep = info.step || 'surface_structures';
      return start;
    }
  });

  return {
    seed,
    dimension,
    sets,
    registry,
    placement: engine,

    /** Plan the structure whose start lives in this chunk, or null. */
    planChunk(chunkX, chunkZ) {
      return engine.planChunk(chunkX, chunkZ);
    },

    /** Plan every start whose origin falls in the given chunk rectangle, in vanilla's scan order. */
    planArea(minChunkX, minChunkZ, maxChunkX, maxChunkZ) {
      const starts = [];
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
        for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
          const plan = engine.planChunk(chunkX, chunkZ);
          if (plan) starts.push(plan);
        }
      }
      return starts;
    },

    /** `/locate structure`. */
    locate(structureId, blockX, blockZ, options) {
      return engine.findNearest(structureId, blockX, blockZ, options);
    },

    /**
     * Vanilla's `structure_references` step: which chunks must realise this start's blocks.
     *
     * Returned directly rather than discovered by a radius-8 scan, which is equivalent for realization
     * and avoids walking 289 chunks per start. The scan order matters only for iteration order, which
     * this engine does not yet depend on.
     */
    chunksForStart(start) {
      return start.affectedChunks();
    },

    /** Which structures could place in this chunk, before generation checks. */
    candidatesForChunk(chunkX, chunkZ) {
      return engine.setsForChunk(chunkX, chunkZ).map(([name]) => name);
    },

    /**
     * Realise one start into a caller-supplied block writer, clipped to a chunk when asked.
     *
     * The generator is called ONCE per start, not once per piece: a generator owns its pieces (an igloo's
     * dome and its basement are one plan), and calling it per piece would write every piece N times for an
     * N-piece structure. Generators may return a count or a report; both are accepted so a one-block
     * generator stays simple.
     */
    realize(start, setBlock, { chunkX = null, chunkZ = null, spawnMob = null } = {}) {
      const clip = chunkX === null ? null : BlockBox.columnOfChunk(chunkX, chunkZ, -64, 320);
      const implementation = registry[start.structureId]?.implementation;
      const generator = implementation && GENERATORS[implementation];
      if (!generator || !generator.realize) return 0;
      const result = generator.realize(start, (x, y, z, id, meta) => {
        if (clip && !clip.contains(x, y, z)) return false;
        return setBlock(x, y, z, id, meta);
      }, blockIds, { spawnMob, clip });
      if (typeof result === 'number') return result;
      return result?.written ?? 0;
    },

    /** A stable hash of a start's plan, so "same seed, same structure" is provable. */
    hashStart(start) {
      const values = [start.structureId, start.chunkX, start.chunkZ, start.pieces.length];
      for (const piece of start.pieces) {
        values.push(piece.box.minX, piece.box.minY, piece.box.minZ, piece.box.maxX, piece.box.maxY, piece.box.maxZ);
        values.push(piece.rotation, piece.depth, piece.projection === Projection.TERRAIN_MATCHING ? 1 : 0);
        for (const char of (piece.pool || piece.template || piece.id || '')) values.push(char.charCodeAt(0));
      }
      return contentHash(values);
    },

    /** Everything the Inspector needs about one plan, with the pieces unrolled for a table. */
    describe(start) {
      return {
        ...start.toJSON(),
        hash: this.hashStart(start),
        chunkCount: start.affectedChunks().length,
        pieceCount: start.pieces.length
      };
    }
  };
}

export {
  STRUCTURES, STRUCTURE_SETS, STRUCTURE_TAGS, GENERATION_STEPS, GeneratorFamily,
  createSets, getStructure, getSetForStructure, structuresForDimension, validateRegistry,
  StructureStart, StructurePiece, TerrainAdaptation, Projection, JointType, TERRAIN_ADJUSTMENT_INFLATE,
  BlockBox, contentHash,
  StructurePlacementEngine, RandomSpreadStructurePlacement, ConcentricRingsStructurePlacement,
  FrequencyReducer, SpreadType
};

// The template subsystem, re-exported here so a consumer needs one import for "structures".
// `template.js` is the loader for vanilla-shaped templates (JSON or `.nbt`), `blockState.js` owns the
// rotation of block STATES -- which is not coordinate rotation and is implemented nowhere else in the
// JavaScript ecosystem -- and `nbt.js` is a dependency-free big-endian reader.
export { StructureTemplate, StructureTemplateManager } from './template.js';
export { parseBlockState, formatBlockState, rotateBlockState, rotateStateString, bareName } from './blockState.js';
export { readNbt, readNbtAuto, writeNbt, gunzip, isGzipped, TagType } from './nbt.js';
export {
  createProcessor, createProcessorList, ProcessorList, PROCESSOR_TYPES, PROCESSOR_REQUIREMENTS
} from './processors.js';
export { placeTemplate, describePlacement, TERRAIN_MATCHING_GRAVITY_OFFSET } from './templatePlacement.js';
