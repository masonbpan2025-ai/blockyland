// Structure placement: which chunks are candidates, and which structure a candidate produces.
//
// This is mission §7 ("Structure placement must operate efficiently without generating the entire
// world") and it is deliberately world-free: everything here is a pure function of
// (world seed, chunk coordinates, structure-set data) plus two injected queries -- `biomeAt` and a
// generator callback. Nothing reads a chunk, a mesh or a scene, which is the design lesson taken from
// SteelMC's `StructureGenerationContext` (docs/STRUCTURE_REFERENCES.md).
//
// The formulas below are vanilla's, cross-checked against two independent implementations:
//
//   - deepslate `src/worldgen/structure/StructurePlacement.ts` (MIT) for the random-spread region math,
//     all four frequency reducers, exclusion zones and the concentric-rings sequence;
//   - SteelMC `steel-worldgen/src/structure/placement.rs` (AGPL) read as a behavioural oracle only.
//
// Two details are easy to get wrong and are called out where they occur:
//   1. placement mixes the REGION coordinates (floor(chunk / spacing)), while the frequency check mixes
//      the CANDIDATE CHUNK coordinates. Using one for the other changes every structure position.
//   2. the default `frequency_reduction_method` is `default`, not `legacy_type_1`.

import { LegacyRandom, floorDiv, legacyFromLargeFeatureSeed, legacyFromLargeFeatureWithSalt } from './random.js';
import { StructureStart, TerrainAdaptation } from './start.js';

// Re-exported so a caller that already imports this module for placement keeps working.
export { legacyFromLargeFeatureSeed, legacyFromLargeFeatureWithSalt };

/** Vanilla `SpreadType`. */
export const SpreadType = {
  LINEAR: 'linear',
  TRIANGULAR: 'triangular',

  /**
   * Vanilla evaluates the spread on an exclusive bound of `spacing - separation`.
   *
   * TRIANGULAR draws twice and averages with Java's integer division, so the distribution is a
   * triangle peaking in the middle of the region instead of a flat line. `Math.floor` on a value that
   * is already a non-negative integer is Java's truncating division, which is what vanilla's
   * `SpreaderType.TRIANGULAR` does.
   */
  evaluate(type, random, bound) {
    if (bound <= 0) return 0;
    if (type === SpreadType.TRIANGULAR) {
      return Math.floor((random.nextIntBound(bound) + random.nextIntBound(bound)) / 2);
    }
    return random.nextIntBound(bound);
  },

  isKnown(value) {
    return value === SpreadType.LINEAR || value === SpreadType.TRIANGULAR;
  }
};



/**
 * Vanilla `StructurePlacement.FrequencyReducer`.
 *
 * Only the four documented types exist; `default` is what an absent `frequency_reduction_method`
 * means, so a set without the field takes the `nextFloat() < frequency` path.
 */
export const FrequencyReducer = {
  DEFAULT: 'default',
  LEGACY_TYPE_1: 'legacy_type_1',
  LEGACY_TYPE_2: 'legacy_type_2',
  LEGACY_TYPE_3: 'legacy_type_3',

  /** @returns {(seed: bigint|number, salt: number, chunkX: number, chunkZ: number, frequency: number) => boolean} */
  fromType(type) {
    switch (type) {
      // The pillager-outpost legacy roll: a single bounded draw against floor(1 / frequency), where the
      // first draw is discarded. Note the coordinate shift by 4 -- it mixes REGION-ish coordinates
      // (chunk >> 4), unlike every other reducer, which is why it is its own type.
      case FrequencyReducer.LEGACY_TYPE_1:
        return (seed, _salt, chunkX, chunkZ, frequency) => {
          const a = chunkX >> 4;
          const b = chunkZ >> 4;
          const random = new LegacyRandom(BigInt(a ^ (b << 4)) ^ toLong(seed));
          random.nextInt();
          const bound = Math.floor(1 / frequency);
          if (bound <= 0) return true;
          return random.nextIntBound(bound) === 0;
        };
      // The arbitrary-salt variant, with vanilla's hard-coded 10387320 salt.
      case FrequencyReducer.LEGACY_TYPE_2:
        return (seed, _salt, chunkX, chunkZ, frequency) =>
          legacyFromLargeFeatureWithSalt(seed, chunkX, chunkZ, 10387320).nextFloat() < frequency;
      // Same as `default` but consuming a double instead of a float, which changes both the draw count
      // and the comparison.
      case FrequencyReducer.LEGACY_TYPE_3:
        return (seed, _salt, chunkX, chunkZ, frequency) =>
          legacyFromLargeFeatureSeed(seed, chunkX, chunkZ).nextDouble() < frequency;
      case FrequencyReducer.DEFAULT:
      default:
        return (seed, salt, chunkX, chunkZ, frequency) =>
          legacyFromLargeFeatureWithSalt(seed, chunkX, chunkZ, salt).nextFloat() < frequency;
    }
  },

  isKnown(value) {
    return Object.values(FrequencyReducer).includes(value);
  }
};

function toLong(value) {
  return BigInt.asIntN(64, typeof value === 'bigint' ? value : BigInt(Math.trunc(value)));
}

/**
 * Vanilla `StructurePlacement.ExclusionZone`: a set refuses to place near a *different* set.
 *
 * The recursion is the interesting part -- villages exclude pillager outposts and outposts exclude
 * villages, so a naive check loops forever. `visited` carries the chain and reports it, so a cycle
 * fails with a named chain rather than a stack overflow.
 */
export class ExclusionZone {
  constructor({ otherSet, chunkCount = 1 }) {
    this.otherSet = otherSet;
    this.chunkCount = chunkCount;
  }

  /**
   * @param {object} context provides `placementForSet(setName)` and the seed
   * @param {Set<string>} visited cycle guard, keyed by set name
   */
  isPlacementForbidden(context, setName, chunkX, chunkZ, visited = new Set()) {
    if (!this.otherSet) return false;
    if (visited.has(setName)) {
      throw new Error(`structure set exclusion cycle: ${[...visited, setName].join(' -> ')}`);
    }
    visited.add(setName);
    const placement = context.placementForSet(this.otherSet);
    if (!placement) return false;
    const n = this.chunkCount;
    const candidates = placement.getPotentialStructureChunks(
      context.seed, chunkX - n, chunkZ - n, chunkX + n, chunkZ + n
    );
    return candidates.some((chunk) =>
      Math.abs(chunk[0] - chunkX) <= n
      && Math.abs(chunk[1] - chunkZ) <= n
      && placement.isStructureChunk(context, chunk[0], chunk[1], this.otherSet, visited));
  }
}

/** Shared behaviour for the two placement types, mirroring vanilla's abstract `StructurePlacement`. */
class StructurePlacement {
  constructor({
    type,
    locateOffset = { x: 0, y: 0, z: 0 },
    frequencyReductionMethod = FrequencyReducer.DEFAULT,
    frequency = 1,
    salt = 0,
    exclusionZone = null
  }) {
    this.type = type;
    this.locateOffset = locateOffset;
    this.frequencyReductionMethod = frequencyReductionMethod;
    this.frequency = frequency;
    this.salt = salt;
    this.exclusionZone = exclusionZone;
  }

  /** Vanilla `isStructureChunk`: placement first, then frequency, then the exclusion zone. */
  isStructureChunk(context, chunkX, chunkZ, setName = null, visited = new Set()) {
    if (!this.isPlacementChunk(context.seed, chunkX, chunkZ)) return false;
    if (this.frequency < 1.0) {
      const reducer = FrequencyReducer.fromType(this.frequencyReductionMethod);
      if (!reducer(context.seed, this.salt, chunkX, chunkZ, this.frequency)) return false;
    }
    if (this.exclusionZone && setName) {
      if (this.exclusionZone.isPlacementForbidden(context, setName, chunkX, chunkZ, visited)) return false;
    }
    return true;
  }

  describe() {
    return { type: this.type, salt: this.salt, frequency: this.frequency, frequencyReductionMethod: this.frequencyReductionMethod };
  }
}

/**
 * Vanilla `RandomSpreadStructurePlacement`: the workhorse, used by every structure set except
 * strongholds.
 *
 * One candidate chunk per `spacing x spacing` region, chosen by a salt-mixed draw bounded by
 * `spacing - separation`.
 */
export class RandomSpreadStructurePlacement extends StructurePlacement {
  constructor(options) {
    super({ ...options, type: 'random_spread' });
    this.spacing = Math.max(1, options.spacing | 0);
    this.separation = Math.max(0, options.separation | 0);
    this.spreadType = SpreadType.isKnown(options.spreadType) ? options.spreadType : SpreadType.LINEAR;
    if (this.separation >= this.spacing) {
      // Vanilla clamps the exclusive bound to 0 rather than failing; doing the same keeps a
      // mis-specified set from throwing during world generation.
      this.separation = this.spacing;
    }
  }

  /** The single chunk this region would place into. */
  getPotentialStructureChunk(seed, chunkX, chunkZ) {
    const regionX = floorDiv(chunkX, this.spacing);
    const regionZ = floorDiv(chunkZ, this.spacing);
    const random = legacyFromLargeFeatureWithSalt(seed, regionX, regionZ, this.salt);
    const bound = this.spacing - this.separation;
    const offsetX = SpreadType.evaluate(this.spreadType, random, bound);
    const offsetZ = SpreadType.evaluate(this.spreadType, random, bound);
    return [regionX * this.spacing + offsetX, regionZ * this.spacing + offsetZ];
  }

  isPlacementChunk(seed, chunkX, chunkZ) {
    const [placementX, placementZ] = this.getPotentialStructureChunk(seed, chunkX, chunkZ);
    return placementX === chunkX && placementZ === chunkZ;
  }

  /**
   * Every candidate chunk of every region overlapping the requested chunk rectangle.
   *
   * Vanilla iterates the *region grid* rather than the chunk rectangle (one candidate per region), so
   * this is O(area / spacing²) instead of O(area) -- which is what makes `/locate` and structure
   * references cheap. The enumeration ORDER is vanilla's (x outer, z inner) and matters, because
   * `/locate` returns the first matching candidate.
   */
  getPotentialStructureChunks(seed, minChunkX, minChunkZ, maxChunkX, maxChunkZ) {
    const positions = [];
    for (let chunkX = floorDiv(minChunkX, this.spacing) * this.spacing; chunkX <= maxChunkX; chunkX += this.spacing) {
      for (let chunkZ = floorDiv(minChunkZ, this.spacing) * this.spacing; chunkZ <= maxChunkZ; chunkZ += this.spacing) {
        positions.push(this.getPotentialStructureChunk(seed, chunkX, chunkZ));
      }
    }
    return positions;
  }
}

/** Vanilla's biome search radius for snapping a stronghold ring position to its preferred biome. */
export const RING_BIOME_SEARCH_RANGE = 112;

/**
 * Vanilla `ConcentricRingsStructurePlacement`, used only by strongholds.
 *
 * PARTIAL: the ring sequence is exact (radius, angular step, the ring-advance growth rule and the
 * extra angle jitter), but biome snapping -- walking up to 112 blocks horizontally to find a preferred
 * biome, using a forked random -- needs a biome source with `findBiomeHorizontal`. Without it the
 * unsnapped ring centre is used, which is recorded as a deviation in docs/STRUCTURE_PARITY.md rather
 * than hidden.
 */
export class ConcentricRingsStructurePlacement extends StructurePlacement {
  constructor(options) {
    super({ ...options, type: 'concentric_rings' });
    this.distance = Math.max(1, options.distance | 0);
    this.spread = Math.max(1, options.spread | 0);
    this.count = Math.max(0, options.count | 0);
    this.preferredBiomes = options.preferredBiomes || [];
    this.positions = null;
  }

  /**
   * Vanilla `prepare`: compute the ring positions once per (seed, biome source).
   *
   * `biomeSnap` is an injected `(searchX, searchZ, range, random) => {x, z} | null`; when absent (or
   * when it returns null, which is vanilla's "no preferred biome found" branch) the ring centre is
   * kept.
   */
  prepare(seed, biomeSnap = null) {
    if (this.positions) return this.positions;
    this.positions = [];
    if (this.count === 0) return this.positions;

    const random = new LegacyRandom(seed);
    let angle = random.nextDouble() * Math.PI * 2;
    let currentSpread = this.spread;
    let ringIndex = 0;
    let positionInRing = 0;

    for (let i = 0; i < this.count; i++) {
      // distance * (4 + 6 * ring) with a ±1.25 * distance jitter, which is what produces the wide,
      // irregular rings strongholds actually have.
      const currentDistance = 4 * this.distance + this.distance * ringIndex * 6
        + (random.nextDouble() - 0.5) * this.distance * 2.5;
      const chunkX = Math.round(Math.cos(angle) * currentDistance);
      const chunkZ = Math.round(Math.sin(angle) * currentDistance);

      // The snap search gets its own forked source, so the ring sequence itself is unaffected by how
      // many draws the search consumes. This is why the fork exists in vanilla.
      const forked = new LegacyRandom(random.nextLong());
      let real = [chunkX, chunkZ];
      if (biomeSnap) {
        const snapped = biomeSnap((chunkX << 4) + 8, (chunkZ << 4) + 8, RING_BIOME_SEARCH_RANGE, forked, this.preferredBiomes);
        if (snapped) real = [snapped.x >> 4, snapped.z >> 4];
      }
      this.positions.push({ centre: [chunkX, chunkZ], real });

      angle += (Math.PI * 2) / currentSpread;
      positionInRing++;
      if (positionInRing === currentSpread) {
        ringIndex++;
        positionInRing = 0;
        currentSpread += (2 * currentSpread) / (ringIndex + 1);
        currentSpread = Math.min(currentSpread, this.count - i);
        angle += random.nextDouble() * Math.PI * 2;
      }
    }
    return this.positions;
  }

  isPlacementChunk(seed, chunkX, chunkZ) {
    if (!this.positions) this.prepare(seed);
    return this.positions.some((position) => position.real[0] === chunkX && position.real[1] === chunkZ);
  }

  getPotentialStructureChunks(seed, minChunkX, minChunkZ, maxChunkX, maxChunkZ) {
    if (!this.positions) this.prepare(seed);
    const margin = RING_BIOME_SEARCH_RANGE >> 4;
    const results = [];
    for (const position of this.positions) {
      if (position.centre[0] < minChunkX - margin || position.centre[0] > maxChunkX + margin) continue;
      if (position.centre[1] < minChunkZ - margin || position.centre[1] > maxChunkZ + margin) continue;
      results.push(position.real);
    }
    return results;
  }
}

/**
 * Vanilla `StructureSet`: a weighted list of structures plus one placement.
 *
 * The weights are what makes a village set able to produce five biome variants from one placement.
 */
export class StructureSet {
  constructor({ name, structures, placement, exclusionZone = null }) {
    if (!Array.isArray(structures) || structures.length === 0) {
      throw new Error(`structure set ${name} needs at least one structure`);
    }
    for (const entry of structures) {
      if (!(entry.weight > 0)) throw new Error(`structure set ${name}: weight must be positive`);
    }
    this.name = name;
    this.structures = structures;
    this.placement = placement;
    if (exclusionZone && !placement.exclusionZone) placement.exclusionZone = exclusionZone;
    else if (exclusionZone) placement.exclusionZone = exclusionZone;
  }

  get totalWeight() {
    return this.structures.reduce((sum, entry) => sum + entry.weight, 0);
  }
}

/**
 * The placement engine: vanilla's `ChunkGeneratorStructureState`.
 *
 * It answers three questions, none of which needs a loaded chunk:
 *   - which structure sets can place in this chunk,
 *   - which structure from that set wins the weighted draw (and then passes its biome/generation check),
 *   - where is the nearest instance of a structure (the `/locate structure` behaviour).
 */
export class StructurePlacementEngine {
  /**
   * @param {object} options
   * @param {number|bigint} options.seed            the world seed
   * @param {Map<string, StructureSet>} options.sets          set name -> set
   * @param {(seed, structureId, chunkX, chunkZ, context) => StructureStart|null} options.generate
   *        the per-structure "find generation point" callback; returns null when the structure refuses
   *        this position (wrong biome, no room, ...), which is what drives the weighted retry loop
   * @param {(blockX, blockZ) => string|null} [options.biomeAt]
   * @param {(structureId: string) => object|null} [options.structureInfo]
   */
  constructor({ seed, sets, generate, biomeAt = null, structureInfo = null }) {
    this.seed = seed;
    this.sets = sets;
    this.generate = generate;
    this.biomeAt = biomeAt;
    this.structureInfo = structureInfo;
    this.context = { seed, placementForSet: (name) => this.sets.get(name)?.placement || null };
    this.stats = { candidates: 0, generated: 0, rejected: 0, chunksAsked: 0 };
  }

  /** Every set with a structure that could place in this chunk, before the weighted draw. */
  setsForChunk(chunkX, chunkZ) {
    const out = [];
    for (const [name, set] of this.sets) {
      if (!set.placement.isStructureChunk(this.context, chunkX, chunkZ, name)) continue;
      out.push([name, set]);
    }
    return out;
  }

  /**
   * Vanilla's weighted selection with WITHOUT-REPLACEMENT retry.
   *
   * A candidate whose generator refuses (usually a biome mismatch) is removed from the pool and its
   * weight subtracted, then another draw is taken -- so a set whose only viable member is a rare
   * variant still places *something* rather than nothing. A single-entry set skips the RNG entirely,
   * which is a real vanilla shortcut and not an optimisation to skip: drawing anyway would consume
   * random numbers and shift every later structure in the chunk.
   */
  selectStructureForChunk(chunkX, chunkZ, setName, set) {
    const pool = set.structures.slice();
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    return {
      setName,
      set,
      pool,
      total,
      random: pool.length === 1 ? null : legacyFromLargeFeatureSeed(this.seed, chunkX, chunkZ)
    };
  }

  /**
   * Plan the structure for one chunk, or null.
   *
   * This is the "structure_starts" step: a start is produced here and realised later, so the caller can
   * plan without loading anything.
   */
  planChunk(chunkX, chunkZ) {
    this.stats.chunksAsked++;
    for (const [setName, set] of this.orderedSets(chunkX, chunkZ)) {
      const plan = this.planSet(chunkX, chunkZ, setName, set);
      if (plan) return plan;
    }
    return null;
  }

  /**
   * Every set's plan for one chunk. Vanilla places each structure set on its own, so a mineshaft and a shipwreck can
   * both start in the same chunk; `planChunk` (the first only) is kept for callers that want one answer.
   */
  planChunkAll(chunkX, chunkZ) {
    this.stats.chunksAsked++;
    const out = [];
    for (const [setName, set] of this.orderedSets(chunkX, chunkZ)) {
      const plan = this.planSet(chunkX, chunkZ, setName, set);
      if (plan) out.push(plan);
    }
    return out;
  }

  /** The chunk's candidate sets, structures before features (a feature is placed by a later step in vanilla). */
  orderedSets(chunkX, chunkZ) {
    const isFeature = (set) => set.structures.every((entry) => this.structureInfo?.(entry.structureId)?.family === 'feature');
    return [...this.setsForChunk(chunkX, chunkZ)].sort((a, b) => Number(isFeature(a[1])) - Number(isFeature(b[1])));
  }

  /** One set's plan for a chunk: its weighted pick, retrying the others when one refuses. */
  planSet(chunkX, chunkZ, setName, set) {
    const selection = this.selectStructureForChunk(chunkX, chunkZ, setName, set);
    let pool = selection.pool;
    let total = selection.total;
    while (pool.length > 0 && total > 0) {
      let chosen = null;
      if (!selection.random) {
        chosen = pool[0];
      } else {
        const roll = selection.random.nextIntBound(total);
        let cursor = 0;
        for (const entry of pool) {
          cursor += entry.weight;
          if (roll < cursor) { chosen = entry; break; }
        }
      }
      if (!chosen) break;

      this.stats.candidates++;
      const start = this.generate(this.seed, chosen.structureId, chunkX, chunkZ, {
        set: setName,
        placement: set.placement,
        biomeAt: this.biomeAt,
        structureInfo: this.structureInfo
      });
      if (start) {
        this.stats.generated++;
        return { set: setName, structureId: chosen.structureId, start };
      }
      this.stats.rejected++;
      pool = pool.filter((entry) => entry !== chosen);
      total -= chosen.weight;
    }
    return null;
  }

  /**
   * `/locate structure`: the nearest candidate chunk to a block position, found by expanding square
   * shells of `spacing` chunks.
   *
   * Vanilla steps by the placement's spacing and only looks at the shell of each square, so the search
   * cost grows linearly in the distance rather than quadratically. `maxRadiusChunks` bounds the search
   * for a browser frame; vanilla's default is effectively unbounded.
   */
  findNearest(structureId, blockX, blockZ, { maxRadiusChunks = 512 } = {}) {
    const centreChunkX = Math.floor(blockX / 16);
    const centreChunkZ = Math.floor(blockZ / 16);
    const targets = [];
    for (const [setName, set] of this.sets) {
      if (set.structures.some((entry) => entry.structureId === structureId)) targets.push([setName, set]);
    }
    if (targets.length === 0) return null;

    const step = Math.max(1, Math.min(...targets.map(([, set]) => set.placement.spacing || 1)));
    let best = null;
    for (let radius = 0; radius <= maxRadiusChunks; radius += step) {
      for (const [setName, set] of targets) {
        const placement = set.placement;
        const candidates = placement.getPotentialStructureChunks(
          this.seed, centreChunkX - radius, centreChunkZ - radius, centreChunkX + radius, centreChunkZ + radius
        );
        for (const [chunkX, chunkZ] of candidates) {
          // Shell only: interior cells were examined at a smaller radius.
          // (Either coordinate on the shell: requiring both kept only the shell's corners, so a structure due north
          // of the search centre was never found.)
          const onShell = Math.abs(chunkX - centreChunkX) >= radius - step
            || Math.abs(chunkZ - centreChunkZ) >= radius - step;
          if (radius > 0 && !onShell) continue;
          if (!placement.isStructureChunk(this.context, chunkX, chunkZ, setName)) continue;
          const plan = this.planSet(chunkX, chunkZ, setName, set);
          if (!plan || plan.structureId !== structureId) continue;
          const reference = plan.start.placementReference();
          const offset = placement.locateOffset || { x: 0, y: 0, z: 0 };
          const point = {
            x: reference.x + offset.x,
            y: reference.y + offset.y,
            z: reference.z + offset.z
          };
          const distanceSq = (point.x - blockX) ** 2 + (point.z - blockZ) ** 2;
          if (!best || distanceSq < best.distanceSq) {
            best = { structureId, set: setName, chunk: [chunkX, chunkZ], point, distanceSq, start: plan.start };
          }
        }
      }
      if (best) return { ...best, distance: Math.sqrt(best.distanceSq) };
    }
    return null;
  }
}

/** Build a placement object from registry data. */
export function placementFromData(data) {
  const exclusionZone = data.exclusionZone
    ? new ExclusionZone({ otherSet: data.exclusionZone.otherSet, chunkCount: data.exclusionZone.chunkCount })
    : null;
  if (data.type === 'concentric_rings') {
    return new ConcentricRingsStructurePlacement({ ...data, exclusionZone });
  }
  return new RandomSpreadStructurePlacement({ ...data, exclusionZone });
}
