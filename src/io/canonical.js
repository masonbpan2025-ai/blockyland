// The canonical model: one internal representation that every external format converts to and from.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: no Anvil header, no LevelDB key, no Sponge field name and no Bedrock
// manifest ever appears outside `src/io/`. An importer turns a file into the types below, the engine consumes
// those types, and an exporter turns them back into whatever target the user asked for. Without that boundary
// each new format multiplies the number of pairwise conversions, and every bug is a format bug.
//
// The architecture is Amulet's, which is the reference for this problem: an EXTERNAL format is read into an
// internal UNIVERSAL representation, and the universal representation is written out to a target. Amulet's
// lesson, applied here, is that the universal layer must be able to REPRESENT what the source had before it can
// promise to write it back; anything the canonical model cannot hold is a warning at import time rather than a
// silent loss at export time.
//
// Blocks are SEMANTIC, never numeric: `minecraft:oak_stairs` with `{ facing: 'north', half: 'bottom' }`. Numeric
// ids are version- and edition-specific, and a layer that stores them cannot convert between two versions of the
// same edition, let alone between editions.
//
// Only what is implemented is claimed. `CanonicalWorld` and its parts are INTERFACES with an in-memory provider
// (see src/io/world.js); Anvil, LevelDB and the archive providers come later and plug into the same interface.

// --- warnings -------------------------------------------------------------------------------

/** The structured warning codes of §30. A string code is what makes a conversion auditable. */
export const IoWarning = {
  UNSUPPORTED_BLOCK: 'UNSUPPORTED_BLOCK',
  UNSUPPORTED_BLOCK_PROPERTY: 'UNSUPPORTED_BLOCK_PROPERTY',
  UNKNOWN_ENTITY: 'UNKNOWN_ENTITY',
  UNKNOWN_BIOME: 'UNKNOWN_BIOME',
  UNSUPPORTED_BLOCK_ENTITY: 'UNSUPPORTED_BLOCK_ENTITY',
  UNSUPPORTED_DIMENSION_SETTING: 'UNSUPPORTED_DIMENSION_SETTING',
  UNSUPPORTED_COMPONENT: 'UNSUPPORTED_COMPONENT',
  DATA_VERSION_MISMATCH: 'DATA_VERSION_MISMATCH',
  LEGACY_NUMERIC_ID: 'LEGACY_NUMERIC_ID',
  TRUNCATED_VALUE: 'TRUNCATED_VALUE',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED'
};

/**
 * A collector, so a conversion never throws away the reason it was lossy.
 *
 * Warnings are RETURNED with the result rather than logged, because the caller is a UI that has to show the user
 * what it is about to lose, and a test that has to assert it.
 */
export class WarningCollector {
  constructor() { this.warnings = []; }
  /** @param {string} code one of `IoWarning` */
  add(code, message, detail = {}) {
    this.warnings.push({ code, message, ...detail });
    return this;
  }
  get count() { return this.warnings.length; }
  get ok() { return this.warnings.length === 0; }
  byCode() {
    const out = {};
    for (const warning of this.warnings) out[warning.code] = (out[warning.code] ?? 0) + 1;
    return out;
  }
}

// --- block states ---------------------------------------------------------------------------

const NAME_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/**
 * A namespaced block state with its properties.
 *
 * The name is normalised at construction: `oak_stairs`, `minecraft:oak_stairs` and `OAK_STAIRS` all become
 * `minecraft:oak_stairs`. Normalising late (at export) is how a model ends up holding three spellings of one
 * block and comparing them as different.
 */
export class CanonicalBlockState {
  constructor(name, properties = {}) {
    const normalised = CanonicalBlockState.normaliseName(name);
    this.name = normalised;
    // Sorted property order is what makes two equal states stringify identically, and string identity is what
    // the palettes of every format are built on.
    this.properties = {};
    for (const key of Object.keys(properties).sort()) {
      if (properties[key] === undefined || properties[key] === null) continue;
      this.properties[key] = typeof properties[key] === 'boolean' ? String(properties[key]) : properties[key];
    }
    Object.freeze(this.properties);
    Object.freeze(this);
  }

  /** `oak_stairs` / `minecraft:oak_stairs` / `OAK_STAIRS` -> `minecraft:oak_stairs`; arbitrary namespaces pass. */
  static normaliseName(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('a block state needs a name');
    }
    const trimmed = name.trim().toLowerCase();
    const namespaced = trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
    if (!NAME_PATTERN.test(namespaced)) {
      throw new Error(`"${name}" is not a valid namespaced block id`);
    }
    return namespaced;
  }

  /** `minecraft:oak_stairs[facing=north,half=bottom]`, properties in sorted order. */
  toString() {
    const keys = Object.keys(this.properties);
    if (keys.length === 0) return this.name;
    return `${this.name}[${keys.map((key) => `${key}=${this.properties[key]}`).join(',')}]`;
  }

  equals(other) {
    if (!(other instanceof CanonicalBlockState)) return false;
    if (other.name !== this.name) return false;
    const a = Object.keys(this.properties);
    const b = Object.keys(other.properties);
    if (a.length !== b.length) return false;
    return a.every((key) => this.properties[key] === other.properties[key]);
  }

  /** A stable palette key. Every codec's palette is keyed by this. */
  get key() { return this.toString(); }

  withProperties(patch) {
    return new CanonicalBlockState(this.name, { ...this.properties, ...patch });
  }

  /**
   * Parse the `name[prop=value,...]` form, which is how Sponge's `Palette` and Bedrock's block names both spell
   * a state in their string-valued variants.
   */
  static parse(text) {
    const match = /^([^[\]]+)(?:\[(.*)\])?$/.exec(String(text).trim());
    if (!match) throw new Error(`cannot parse block state "${text}"`);
    const properties = {};
    if (match[2]) {
      for (const pair of match[2].split(',')) {
        const [key, value] = pair.split('=');
        if (key && value !== undefined) properties[key.trim()] = value.trim();
      }
    }
    return new CanonicalBlockState(match[1], properties);
  }

  toJSON() { return { name: this.name, ...(Object.keys(this.properties).length ? { properties: this.properties } : {}) }; }
}

export const AIR = new CanonicalBlockState('minecraft:air');

// --- structures -----------------------------------------------------------------------------

/**
 * One named cuboid region of a structure.
 *
 * Litematica has several per file, Sponge and vanilla have exactly one, and Bedrock has one per structure. A
 * single structure type with a REGIONS array models all four without a special case, and the origin is kept
 * relative to the region so a multi-region file survives a round trip with its layout intact.
 */
export class CanonicalRegion {
  constructor({ name = 'main', origin = { x: 0, y: 0, z: 0 }, size, blocks = [], blockEntities = [], entities = [], metadata = {} } = {}) {
    this.name = name;
    this.origin = { x: origin.x | 0, y: origin.y | 0, z: origin.z | 0 };
    this.size = { x: size?.x | 0, y: size?.y | 0, z: size?.z | 0 };
    if (this.size.x <= 0 || this.size.y <= 0 || this.size.z <= 0) {
      throw new Error('a region needs a positive size on every axis');
    }
    this.blocks = blocks;
    this.blockEntities = blockEntities;
    this.entities = entities;
    this.metadata = metadata;
  }

  /** Blocks indexed by `x,y,z`, which is what placement and export both walk. */
  index() {
    const map = new Map();
    for (const block of this.blocks) map.set(`${block.pos.x},${block.pos.y},${block.pos.z}`, block);
    return map;
  }

  contains(pos) {
    return pos.x >= 0 && pos.y >= 0 && pos.z >= 0 && pos.x < this.size.x && pos.y < this.size.y && pos.z < this.size.z;
  }
}

/**
 * A structure file's content, edition- and format-independent.
 *
 * `source` is provenance rather than decoration: it records which format the data came from and at which version,
 * so a later export can warn that it is writing a Bedrock structure as a Java one, and a reader can tell whether
 * an error is theirs or the file's. §5's rule -- never silently interpret one version as another -- needs the
 * source version to be present in the first place.
 */
export class CanonicalStructure {
  constructor({ name = 'structure', regions = null, size = null, source = {}, metadata = {} } = {}) {
    this.name = name;
    this.regions = regions ?? [new CanonicalRegion({ ...(size ? { size } : { size: { x: 1, y: 1, z: 1 } }) })];
    this.source = {
      format: source.format ?? 'canonical',
      edition: source.edition ?? 'java',
      gameVersion: source.gameVersion ?? null,
      dataVersion: source.dataVersion ?? null,
      formatVersion: source.formatVersion ?? null
    };
    this.metadata = metadata;
  }

  /** The default region: every single-region format reads and writes through this. */
  get main() { return this.regions[0]; }
  get size() { return this.main.size; }

  get blockCount() { return this.regions.reduce((total, region) => total + region.blocks.length, 0); }

  /** Every distinct block state in the structure, which is what each format writes as its palette. */
  palette() {
    const seen = new Map();
    for (const region of this.regions) {
      for (const block of region.blocks) if (!seen.has(block.state.key)) seen.set(block.state.key, block.state);
    }
    return [...seen.values()];
  }

  toJSON() {
    return {
      name: this.name,
      source: this.source,
      regions: this.regions.map((region) => ({
        name: region.name,
        origin: region.origin,
        size: region.size,
        blocks: region.blocks.length,
        blockEntities: region.blockEntities.length,
        entities: region.entities.length
      })),
      blocks: this.blockCount
    };
  }
}

// --- versions -------------------------------------------------------------------------------

/**
 * Java DataVersions, newest first, for the versions this project has actually looked at.
 *
 * A table is unavoidable: DataVersion is an opaque integer publish by Mojang per release, and there is no
 * formula. An unknown DataVersion is REPORTED rather than assumed, because interpreting a 1.22 chunk with 1.21
 * codecs is exactly the silent corruption §5 forbids.
 */
export const JAVA_DATA_VERSIONS = [
  { dataVersion: 4189, gameVersion: '1.21.4', note: 'this project\'s target version' },
  { dataVersion: 4082, gameVersion: '1.21.3' },
  { dataVersion: 3955, gameVersion: '1.21.1' },
  { dataVersion: 3953, gameVersion: '1.21' },
  { dataVersion: 3839, gameVersion: '1.20.6' },
  { dataVersion: 3700, gameVersion: '1.20.4' },
  { dataVersion: 3578, gameVersion: '1.20.2' },
  { dataVersion: 3463, gameVersion: '1.20' },
  { dataVersion: 3337, gameVersion: '1.19.4' },
  { dataVersion: 3105, gameVersion: '1.19' },
  { dataVersion: 2975, gameVersion: '1.18.2' },
  { dataVersion: 2730, gameVersion: '1.17.1' },
  { dataVersion: 2586, gameVersion: '1.16.5' },
  { dataVersion: 2230, gameVersion: '1.15.2' },
  { dataVersion: 1631, gameVersion: '1.13.2' },
  { dataVersion: 1343, gameVersion: '1.12.2' }
];

/** The version this project targets, in one place, so an export does not invent its own answer. */
export const TARGET_JAVA = { edition: 'java', gameVersion: '1.21.4', dataVersion: 4189 };
/** Bedrock has no DataVersion; it carries a format version string plus an engine version in pack manifests. */
export const TARGET_BEDROCK = { edition: 'bedrock', gameVersion: '1.21.40', formatVersion: '1.21.40' };

/**
 * Version identity for a file, and the questions a conversion needs to ask about it.
 *
 * §5: track edition, game version, DataVersion, format version, source and target, and never silently interpret
 * one version as another. Every field here is optional because a `.schem` from 2015 legitimately has none of it.
 */
export class MinecraftVersion {
  constructor({ edition = 'java', gameVersion = null, dataVersion = null, formatVersion = null, source = null } = {}) {
    this.edition = edition;
    this.gameVersion = gameVersion;
    this.dataVersion = dataVersion === null ? null : Number(dataVersion);
    this.formatVersion = formatVersion;
    this.source = source;
  }

  static forJavaDataVersion(dataVersion, source = 'file') {
    const known = JAVA_DATA_VERSIONS.find((entry) => entry.dataVersion === Number(dataVersion));
    return new MinecraftVersion({
      edition: 'java',
      dataVersion,
      gameVersion: known?.gameVersion ?? null,
      source
    });
  }

  get java() { return this.edition === 'java'; }
  get bedrock() { return this.edition === 'bedrock'; }

  toString() {
    const version = this.gameVersion ?? this.formatVersion ?? (this.dataVersion === null ? 'unknown' : `DataVersion ${this.dataVersion}`);
    return `${this.edition} ${version}`;
  }
}

/**
 * Compare two versions and say -- in the canonical warning vocabulary -- whether a conversion is safe.
 *
 * Deliberately conservative: only an exact version match is called safe, and an unknown version is a mismatch
 * rather than a pass. Optimism here is how a world gets written with the wrong palette.
 */
export function compareVersions(source, target, warnings = new WarningCollector()) {
  if (!source || !target) return { same: false, comparable: false };
  if (source.edition !== target.edition) {
    warnings.add(IoWarning.DATA_VERSION_MISMATCH,
      `converting between editions (${source.edition} to ${target.edition}): block palettes and chunk layout differ`,
      { source: source.toString(), target: target.toString() });
    return { same: false, comparable: true, crossEdition: true };
  }
  if (source.edition === 'java') {
    if (source.dataVersion === null || target.dataVersion === null) {
      warnings.add(IoWarning.DATA_VERSION_MISMATCH, 'a DataVersion is missing, so the conversion cannot be checked');
      return { same: false, comparable: false };
    }
    if (source.dataVersion !== target.dataVersion) {
      warnings.add(IoWarning.DATA_VERSION_MISMATCH,
        `source DataVersion ${source.dataVersion} differs from target ${target.dataVersion}`,
        { source: source.dataVersion, target: target.dataVersion });
      return { same: false, comparable: true };
    }
    return { same: true, comparable: true };
  }
  return { same: source.formatVersion === target.formatVersion, comparable: true };
}

// --- the world side, as interfaces ------------------------------------------------------------

/**
 * `CanonicalChunk`/`CanonicalSection`/`CanonicalWorld` are declared here as the SHAPE the format providers
 * implement, and nothing more is claimed: the in-memory provider is in src/io/world.js, and Anvil, LevelDB and
 * archive providers are not written yet. Declaring the interface first is what stops a provider from inventing
 * its own shape and forcing every consumer to learn it.
 *
 * A world is STREAMED, never loaded: §32 requires `open()`/`getChunk()`/`iterateChunks()`/`close()` because a
 * real save is gigabytes, and a design that materialises it cannot be fixed later without rewriting callers.
 *
 * @typedef {object} CanonicalSection
 * @property {number} y            section index (Java: blockY >> 4)
 * @property {Map<string, CanonicalBlockState>} palette  state key -> state
 * @property {(x:number,y:number,z:number) => CanonicalBlockState} stateAt  LOCAL coords within the chunk
 * @property {(x:number,y:number,z:number,state:CanonicalBlockState) => void} setState
 *
 * @typedef {object} CanonicalChunk
 * @property {number} x
 * @property {number} z
 * @property {number} dataVersion
 * @property {string} status
 * @property {CanonicalSection[]} sections
 * @property {object[]} blockEntities
 * @property {object[]} entities
 * @property {{ [y: number]: string[] }} biomes
 *
 * @typedef {object} CanonicalWorld
 * @property {() => object} getMetadata
 * @property {(x: number, z: number) => CanonicalChunk | null} getChunk
 * @property {() => Iterable<CanonicalChunk>} iterateChunks
 * @property {() => void} close
 */
