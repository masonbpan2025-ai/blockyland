// StructureStart and StructurePiece: the plan that placement produces and realization consumes.
//
// The split matters and is deliberate (mission §19, §20): a structure is PLANNED as data -- chunk
// position, bounding box, pieces with rotations and pool names -- and only later REALIZED into blocks
// for whichever chunks are actually loaded. That is what makes a structure that spans chunks A/B/C/D
// deterministic no matter which chunk the player walks into first, and it is why nothing in this file
// touches a world.
//
// Vanilla equivalents: `StructureStart`, `StructurePiece`, `BoundingBox`, `StructureStart.placeInChunk`.
// Field names follow vanilla where a name exists, so the parity matrix can be read against the wiki.

import { BlockBox } from './geometry.js';

/**
 * Vanilla `Structure.adjustBoundingBox`: a start's bounding box grows by 12 blocks on every axis
 * unless its terrain adaptation is `none`.
 *
 * This is not cosmetic. The inflated box is what structure references are matched against, so getting
 * it wrong changes which chunks believe they contain a piece -- and therefore which chunks realise
 * blocks, and in what order.
 */
export const TERRAIN_ADJUSTMENT_INFLATE = 12;

/** Vanilla `TerrainAdjustment` values. */
export const TerrainAdaptation = {
  NONE: 'none',
  BURY: 'bury',
  BEARD_THIN: 'beard_thin',
  BEARD_BOX: 'beard_box',
  ENCAPSULATE: 'encapsulate',

  /** How much this adaptation inflates a start's bounding box. */
  inflate(adaptation) {
    return adaptation && adaptation !== TerrainAdaptation.NONE ? TERRAIN_ADJUSTMENT_INFLATE : 0;
  },

  isKnown(value) {
    return Object.values(TerrainAdaptation).includes(value);
  }
};

/** Vanilla `StructurePiece` projection types, used by the jigsaw engine's terrain matching. */
export const Projection = { RIGID: 'rigid', TERRAIN_MATCHING: 'terrain_matching' };

/** Vanilla `JointType`, which decides whether a child piece may be rotated about the connector axis. */
export const JointType = { ROLLABLE: 'rollable', ALIGNED: 'aligned' };

let pieceCounter = 0;

/**
 * One planned piece of a structure.
 *
 * `type` mirrors SteelMC's three-way split, which is a good boundary because it keeps the *family*
 * visible in telemetry (the Structure Inspector shows it): `template` (one NBT/JSON template placed
 * with rotation), `jigsaw` (a pool element placed by the jigsaw engine), `procedural` (a piece built
 * by a specialised algorithm such as a mineshaft corridor), `feature` (an ore-style feature placed as
 * a piece), `hardcoded` (blocks written directly by code, e.g. buried treasure's single chest).
 */
export class StructurePiece {
  constructor({
    id = null,

    index = null,
    type = 'procedural',
    family = null,
    box,
    rotation = 0,
    mirror = 'none',
    depth = 0,
    parent = null,
    pool = null,
    template = null,
    projection = Projection.RIGID,
    jointType = JointType.ROLLABLE,
    groundLevelDelta = 0,
    placementPriority = 0,
    selectionPriority = 0,
    jigsaw = null,
    meta = null
  }) {
    // A PLAN-LOCAL index must be supplied by anything that derives randomness or identity from it. The
    // module-level counter is not 0-based and not stable across a process, so a piece numbering that
    // depends on how many pieces were created earlier made plans irreproducible between runs -- which
    // blocks golden-seed testing. Recorded as deviation 0b in docs/STRUCTURE_PARITY.md.
    this.index = index === null ? pieceCounter++ : index;
    this.id = id;
    this.type = type;
    this.family = family;
    this.box = box instanceof BlockBox ? box : BlockBox.fromArray(box);
    this.rotation = rotation;
    this.mirror = mirror;
    this.depth = depth;
    this.parentIndex = parent ? parent.index : null;
    this.pool = pool;
    this.template = template;
    this.projection = projection;
    this.jointType = jointType;
    this.groundLevelDelta = groundLevelDelta;
    this.placementPriority = placementPriority;
    this.selectionPriority = selectionPriority;
    this.jigsaw = jigsaw;
    this.meta = meta;
  }

  get isTerrainMatching() {
    return this.projection === Projection.TERRAIN_MATCHING;
  }

  /** Vanilla's jigsaw discriminator: only `PoolElementStructurePiece` counts for beardifier junctions. */
  get isJigsaw() {
    return this.type === 'jigsaw';
  }

  centre() {
    return this.box.centre();
  }

  toString() {
    return `${this.id || this.type} ${this.box} rot=${this.rotation}`;
  }
}

/**
 * A complete plan for one generated structure.
 *
 * `references` is a set of chunk keys containing pieces of this start, which is vanilla's
 * `structure_references` stage: a chunk only realises structure blocks if some start's *inflated*
 * box intersects it, and it finds those starts through references rather than by scanning the world.
 */
export class StructureStart {
  constructor({
    structureId,
    chunkX,
    chunkZ,
    pieces = [],
    terrainAdaptation = TerrainAdaptation.NONE,
    biome = null,
    seed = null,
    salt = null,
    set = null,
    generationStep = 'surface_structures'
  }) {
    this.structureId = structureId;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.pieces = pieces;
    this.terrainAdaptation = terrainAdaptation;
    this.biome = biome;
    this.seed = seed;
    this.salt = salt;
    this.set = set;
    this.generationStep = generationStep;
    this.references = new Set();
    for (const piece of pieces) {
      for (const chunk of piece.box.chunksCovered()) this.references.add(`${chunk.x},${chunk.z}`);
    }
  }

  isEmpty() {
    return this.pieces.length === 0;
  }

  /**
   * Vanilla `StructureStart.getBoundingBox()`: the union of the piece boxes, inflated according to
   * the structure's terrain adaptation. Empty starts have no box.
   */
  get box() {
    if (this.pieces.length === 0) return null;
    let union = this.pieces[0].box;
    for (const piece of this.pieces.slice(1)) union = union.union(piece.box);
    return union.inflate(TerrainAdaptation.inflate(this.terrainAdaptation));
  }

  /** The uninflated union, used by the Inspector to draw "pieces" separately from "influence". */
  get tightBox() {
    if (this.pieces.length === 0) return null;
    let union = this.pieces[0].box;
    for (const piece of this.pieces.slice(1)) union = union.union(piece.box);
    return union;
  }

  /**
   * Vanilla `StructureStart.placeInChunk` reference position: the first piece's centre in X/Z and the
   * first piece's minimum Y. The Inspector and `/locate` both report this point.
   */
  placementReference() {
    if (this.pieces.length === 0) return null;
    const first = this.pieces[0];
    const centre = first.box.centre();
    return { x: centre.x, y: first.box.minY, z: centre.z };
  }

  /** How many chunks this start can write into, including the inflation. */
  affectedChunks() {
    const box = this.box;
    return box ? box.chunksCovered() : [];
  }

  toJSON() {
    return {
      structureId: this.structureId,
      chunk: { x: this.chunkX, z: this.chunkZ },
      biome: this.biome,
      set: this.set,
      terrainAdaptation: this.terrainAdaptation,
      generationStep: this.generationStep,
      box: this.box ? this.box.toArray() : null,
      tightBox: this.tightBox ? this.tightBox.toArray() : null,
      placementReference: this.placementReference(),
      pieces: this.pieces.map(piece => ({
        id: piece.id,
        type: piece.type,
        family: piece.family,
        box: piece.box.toArray(),
        rotation: piece.rotation,
        mirror: piece.mirror,
        depth: piece.depth,
        pool: piece.pool,
        template: piece.template,
        projection: piece.projection,
        jointType: piece.jointType,
        parentIndex: piece.parentIndex
      }))
    };
  }
}

/**
 * Which chunks need to realise this start's blocks.
 *
 * Vanilla scans a radius-8 block of chunks around each chunk and stores a reference when a start's
 * inflated box intersects that chunk's 16x16 column. Returning the covered chunks directly is
 * equivalent for realisation, and cheaper; it is also what the Inspector uses to draw the influence
 * footprint. The radius-8 *scan* is implemented in the placement engine, because reference ordering
 * is part of placement determinism rather than of the start itself.
 */
export function chunksAffectedBy(start) {
  return start.affectedChunks();
}
