// Structure templates: loading a vanilla-shaped template and transforming it into the world.
//
// This is the subsystem that unblocks the 15 template-family ids in docs/STRUCTURE_PARITY.md (igloo,
// shipwreck, ruined portal, ocean ruins, nether fossil, end city, woodland mansion and the fast-growing
// list of variants). It is a LOADER, not a hard-coded structure: vanilla expresses these structures as
// data, so the engine reads data.
//
// Template shape (the same in a `.nbt` file and in the JSON form some tools emit):
//
//   { size: [sx, sy, sz],
//     palette: [ { Name: "minecraft:oak_stairs", Properties: { facing: "east" } }, ... ],
//     blocks:  [ { pos: [x, y, z], state: <palette index>, nbt?: {...} }, ... ],
//     entities:[ { pos: [x,y,z], blockPos: [x,y,z], nbt: {...} }, ... ],
//     DataVersion: 4189 }
//
// Coordinates in `pos` are template-local, and `pos` is the block's MINIMUM corner, so a template of size
// (3,4,5) with rotation 0 occupies a 3x4x5 box from the placement position.
//
// WHERE VANILLA TEMPLATES COME FROM: they are Mojang assets and are not in this repository. The loader
// accepts either a clean-room template authored as data here, or a vanilla-shaped file the user supplies;
// see docs/STRUCTURE_REFERENCES.md, "Templates are a data problem". No layout below is invented.

import { BlockBox, Rotation, Mirror, CHUNK_SIZE } from './geometry.js';
import { parseBlockState, formatBlockState, rotateBlockState, normaliseName, bareName } from './blockState.js';
import { readNbt, readNbtAuto, isGzipped, TagType } from './nbt.js';

/** The two marker blocks a template can carry, both of which the jigsaw engine and post-processing need. */
export const JIGSAW_BLOCK = 'minecraft:jigsaw';
export const STRUCTURE_BLOCK = 'minecraft:structure_block';

export class StructureTemplate {
  /**
   * @param {object} data
   * @param {number[]} data.size        [x, y, z] in blocks
   * @param {object[]} data.palette     vanilla palette entries
   * @param {object[]} data.blocks      [{ pos, state, nbt }]
   * @param {object[]} [data.entities]
   */
  constructor({ size, palette = [], blocks = [], entities = [], dataVersion = null, name = null }) {
    if (!Array.isArray(size) || size.length !== 3) throw new Error('a template needs a size of [x, y, z]');
    this.size = size.map((value) => Math.trunc(Number(value)));
    if (this.size.some((value) => !(value > 0))) throw new Error(`template size must be positive, got ${size}`);
    this.palette = palette;
    this.blocks = blocks;
    this.entities = entities;
    this.dataVersion = dataVersion;
    this.name = name;
    /** Properties the transform could not rotate, collected across every block. Surfaced, not hidden. */
    this.unhandledProperties = new Set();
  }

  static fromNbt(parsed, name = null) {
    const root = parsed && parsed.value !== undefined ? parsed.value : parsed;
    if (!root || typeof root !== 'object') throw new Error('a template root must be a compound');
    const size = toNumberArray(root.size);
    const palette = (root.palette ?? []).map((entry) => ({
      name: entry.Name ?? entry.name ?? 'minecraft:air',
      properties: entry.Properties ?? entry.properties ?? {}
    }));
    const blocks = (root.blocks ?? []).map((entry) => ({
      pos: toNumberArray(entry.pos),
      state: Number(entry.state ?? 0),
      nbt: entry.nbt ?? null
    }));
    const entities = (root.entities ?? []).map((entry) => ({
      pos: toNumberArray(entry.pos),
      blockPos: toNumberArray(entry.blockPos ?? entry.pos),
      nbt: entry.nbt ?? null
    }));
    return new StructureTemplate({ size, palette, blocks, entities, dataVersion: root.DataVersion ?? null, name });
  }

  /** The same shape as `fromNbt`, for a template stored as JSON (which is what a clean-room one is). */
  static fromJson(json, name = null) {
    return StructureTemplate.fromNbt(json, name);
  }

  /** Read a `.nbt` file, inflating gzip transparently. */
  static async fromNbtBytes(bytes, name = null) {
    return StructureTemplate.fromNbt(await readNbtAuto(bytes), name);
  }

  /** Vanilla's state string for a palette index, so a caller never has to know about indices. */
  paletteState(index) {
    const entry = this.palette[index];
    if (!entry) throw new Error(`palette index ${index} is out of range (${this.palette.length} entries)`);
    return formatBlockState({ name: entry.name, properties: entry.properties || {} });
  }

  get blockCount() {
    return this.blocks.length;
  }

  /** The bounding box this template occupies when placed at `origin` with the given transform. */
  boundingBox(origin, rotation = 0, mirror = Mirror.NONE) {
    const [sx, sy, sz] = this.size;
    const quarterTurns = ((rotation % 4) + 4) % 4;
    const swapped = quarterTurns % 2 === 1;
    const width = swapped ? sz : sx;
    const depth = swapped ? sx : sz;
    return new BlockBox(
      origin.x, origin.y, origin.z,
      origin.x + width - 1, origin.y + sy - 1, origin.z + depth - 1
    );
  }

  /**
   * Transform a template-local block position into the rotated/mirrored grid.
   *
   * Order is vanilla's: mirror first, then rotate. Both operations use the PRE-transform extents, which is
   * what makes the composition correct -- mirroring does not change a template's size, so rotating after it
   * still turns a (w, d) grid into (d, w).
   *
   * Parity note: this is validated here by geometry and round-trip tests only. No comparison against
   * vanilla-transformed template output exists yet, and it is recorded as a deviation in
   * docs/STRUCTURE_PARITY.md rather than presented as exact.
   */
  transformPos(x, y, z, rotation = 0, mirror = Mirror.NONE) {
    const [sx, , sz] = this.size;
    let px = x;
    let pz = z;
    if (mirror === Mirror.LEFT_RIGHT) px = sx - 1 - px;
    else if (mirror === Mirror.FRONT_BACK) pz = sz - 1 - pz;
    const rotated = Rotation.rotateArrayIndex(rotation, px, pz, sx, sz);
    return { x: rotated.x, y, z: rotated.z };
  }

  /** The extents after the transform, in the same order as `size`. */
  transformedSize(rotation = 0) {
    const [sx, sy, sz] = this.size;
    return ((rotation % 4) + 4) % 4 % 2 === 1 ? [sz, sy, sx] : [sx, sy, sz];
  }

  /**
   * Every block, transformed and offset to a world origin.
   *
   * Yields `{ x, y, z, stateIndex, state, nbt }` where `state` is the transformed state STRING -- so a
   * caller that only wants to write blocks never touches the palette or the property tables.
   */
  *place(origin, rotation = 0, mirror = Mirror.NONE) {
    for (const block of this.blocks) {
      const [x, y, z] = block.pos;
      const local = this.transformPos(x, y, z, rotation, mirror);
      const raw = this.paletteState(block.state);
      const transformed = rotateBlockState(parseBlockState(raw), rotation, mirror);
      for (const property of transformed.unhandled) this.unhandledProperties.add(property);
      yield {
        x: origin.x + local.x,
        y: origin.y + local.y,
        z: origin.z + local.z,
        stateIndex: block.state,
        state: formatBlockState(transformed.state),
        blockName: transformed.state.name,
        nbt: block.nbt,
        unhandled: transformed.unhandled
      };
    }
  }

  /**
   * Jigsaw blocks, which the jigsaw engine connects on.
   *
   * Vanilla stores the connector's fields in the block entity, which is why this reads `nbt` rather than
   * the palette: `name`, `target`, `pool`, `joint`, `final_state`, and the two priorities.
   */
  jigsaws(rotation = 0, mirror = Mirror.NONE) {
    const out = [];
    for (const block of this.blocks) {
      const entry = this.palette[block.state];
      if (!entry || normaliseName(entry.name) !== JIGSAW_BLOCK) continue;
      const local = this.transformPos(block.pos[0], block.pos[1], block.pos[2], rotation, mirror);
      const data = block.nbt || {};
      // The orientation comes from the block state's `orientation` property, and it must be transformed
      // with the rest of the state or a connector will point the wrong way after rotation.
      const state = rotateBlockState(parseBlockState(this.paletteState(block.state)), rotation, mirror).state;
      out.push({
        local,
        orientation: state.properties.orientation || 'up_north',
        name: data.name || 'minecraft:empty',
        target: data.target || 'minecraft:empty',
        pool: data.pool || 'minecraft:empty',
        joint: data.joint || 'rollable',
        finalState: data.final_state || 'minecraft:air',
        selectionPriority: Number(data.selection_priority ?? 0),
        placementPriority: Number(data.placement_priority ?? 0)
      });
    }
    return out;
  }

  /** `structure_block` markers in DATA mode: how vanilla carries per-structure metadata into placement. */
  dataMarkers(rotation = 0, mirror = Mirror.NONE) {
    const out = [];
    for (const block of this.blocks) {
      const entry = this.palette[block.state];
      if (!entry || normaliseName(entry.name) !== STRUCTURE_BLOCK) continue;
      const data = block.nbt || {};
      if ((data.mode || '').toLowerCase() !== 'data') continue;
      const local = this.transformPos(block.pos[0], block.pos[1], block.pos[2], rotation, mirror);
      out.push({ local, metadata: data.metadata || '' });
    }
    return out;
  }

  /** Entities a template spawns, with their positions transformed. */
  entitiesTransformed(rotation = 0, mirror = Mirror.NONE) {
    return this.entities.map((entity) => {
      const local = this.transformPos(entity.pos[0], entity.pos[1], entity.pos[2], rotation, mirror);
      return { local, nbt: entity.nbt };
    });
  }

  /** A cheap description for the Inspector's template panel. */
  describe() {
    const names = new Map();
    for (const block of this.blocks) {
      const name = bareName(this.palette[block.state]?.name || 'minecraft:air');
      names.set(name, (names.get(name) || 0) + 1);
    }
    return {
      name: this.name,
      size: this.size,
      blocks: this.blocks.length,
      paletteEntries: this.palette.length,
      entities: this.entities.length,
      jigsaws: this.jigsaws().length,
      dataMarkers: this.dataMarkers().length,
      dataVersion: this.dataVersion,
      blockTypes: [...names].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      unhandledProperties: [...this.unhandledProperties]
    };
  }
}

function toNumberArray(value) {
  if (!value) return [0, 0, 0];
  return Array.from(value, (entry) => Math.trunc(Number(entry)));
}

/**
 * A registry of loaded templates.
 *
 * Deliberately the same shape as vanilla's `StructureTemplateManager`: an id -> template map with a
 * `load` that can come from memory (clean-room data) or from bytes (a supplied `.nbt`).
 */
export class StructureTemplateManager {
  constructor(templates = {}) {
    this.templates = new Map(Object.entries(templates));
    this.missing = new Set();
  }

  has(id) {
    return this.templates.has(id);
  }

  get(id) {
    const template = this.templates.get(id);
    if (!template) this.missing.add(id);
    return template || null;
  }

  add(id, template) {
    this.templates.set(id, template);
    return template;
  }

  registerJson(id, json) {
    return this.add(id, StructureTemplate.fromJson(json, id));
  }

  async registerNbtBytes(id, bytes) {
    return this.add(id, await StructureTemplate.fromNbtBytes(bytes, id));
  }

  list() {
    return [...this.templates.keys()].sort();
  }

  /** Every template the caller asked for but which is not loaded -- the honest coverage report. */
  get missingTemplates() {
    return [...this.missing].sort();
  }
}

export { readNbt, readNbtAuto, isGzipped, TagType, parseBlockState, formatBlockState, rotateBlockState };
