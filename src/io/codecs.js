// Structure codecs: Sponge `.schem`, vanilla Java `.nbt`, and the adapters that connect both to the game.
//
// Every codec here converts between a FILE and `CanonicalStructure`, and nothing else. No codec knows about any
// other codec, which is what makes `convertStructure()` a five-line funnel rather than a matrix of pairwise
// translations: read to canonical, write from canonical.
//
// WHAT IS DELIBERATELY MISSING, and why it is not hidden: Bedrock `.mcstructure`, legacy `.schematic`,
// `.litematic`, Anvil regions, LevelDB worlds and the pack formats are NOT implemented below. They have
// interfaces (see docs/MINECRAFT_IO_ARCHITECTURE.md and the matrix in docs/MINECRAFT_IO_PARITY.md) and their
// status is NOT STARTED, because I cannot verify a Bedrock block-index ordering or a LevelDB key layout without
// a real file to test against, and shipping an unverified writer under a "supported" label is worse than
// shipping none.

import {
  CanonicalBlockState, CanonicalStructure, CanonicalRegion, AIR,
  IoWarning, WarningCollector, TARGET_JAVA, MinecraftVersion
} from './canonical.js';
import { readNbtAuto, writeNbt, gzip, gunzip, isGzipped, readNbt, TagType, NbtError } from './nbt.js';

// --- Sponge Schematic, version 2 and 3 --------------------------------------------------------

/** Sponge writes its varints unsigned, least-significant group first. */
export function writeVarInt(value) {
  const out = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    out.push(byte);
  } while (remaining !== 0);
  return out;
}

/** Read one varint, refusing a value that would overflow rather than looping for ever on a corrupt file. */
export function readVarInt(bytes, offset) {
  let result = 0;
  let shift = 0;
  let cursor = offset;
  for (;;) {
    if (cursor >= bytes.length) throw new NbtError('a varint runs past the end of the block data');
    if (shift > 35) throw new NbtError('a varint is longer than 5 bytes: the file is corrupt');
    const byte = bytes[cursor++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: cursor };
}

export const SPONGE_FORMATS = {
  'sponge-schem-v2': { id: 'sponge-schem-v2', version: 2, extension: 'schem', supportsBiomes: false, supportsEntities: false },
  // v3 adds a biome palette and entities. Writing v3 when the caller asked for v2 would change the file's
  // meaning for a consumer that cannot read it, so the version is explicit rather than "latest".
  'sponge-schem-v3': { id: 'sponge-schem-v3', version: 3, extension: 'schem', supportsBiomes: true, supportsEntities: true }
};

/**
 * Read a Sponge `.schem` (version 2 or 3) into the canonical form.
 *
 * §7's fields, all of them: dimensions, offset, palette, block states, block entities, entities, biomes,
 * metadata, DataVersion. A field the file does not carry is left absent and REPORTED rather than invented.
 */
export async function readSpongeSchematic(bytes, { warnings = new WarningCollector() } = {}) {
  const root = await readNbtAuto(bytes);
  const version = Number(root.Version ?? 2);
  if (version < 1 || version > 3) {
    warnings.add(IoWarning.DATA_VERSION_MISMATCH, `Sponge schematic version ${version} is not implemented; reading it as version 3`);
  }
  const width = Number(root.Width ?? 0);
  const height = Number(root.Height ?? 0);
  const length = Number(root.Length ?? 0);
  if (!(width > 0 && height > 0 && length > 0)) {
    throw new NbtError('a Sponge schematic needs positive Width, Height and Length');
  }

  // The palette maps a state string to an index; the reverse is what the block data indexes into.
  const paletteNode = root.Palette ?? {};
  const palette = new Map();
  for (const [key, index] of Object.entries(paletteNode)) {
    let state;
    try {
      state = CanonicalBlockState.parse(key);
    } catch (error) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `palette entry "${key}" is not a block state; using air`, { key });
      state = AIR;
    }
    palette.set(Number(index), state);
  }

  const blockData = root.BlockData;
  if (!(blockData instanceof Uint8Array)) throw new NbtError('a Sponge schematic needs a BlockData byte array');
  const volume = width * height * length;
  const blocks = [];
  let cursor = 0;
  for (let index = 0; index < volume; index++) {
    const read = readVarInt(blockData, cursor);
    cursor = read.next;
    const state = palette.get(read.value);
    if (!state) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `block data index ${read.value} is not in the palette; using air`, { index: read.value });
      continue;
    }
    if (state.equals(AIR)) continue; // air is the absence of a block in the canonical model
    // Sponge orders blocks y, then z, then x: the width is the fastest axis.
    const x = index % width;
    const z = Math.floor(index / width) % length;
    const y = Math.floor(index / (width * length));
    blocks.push({ pos: { x, y, z }, state });
  }

  const blockEntities = (root.BlockEntities ?? []).map((entry) => {
    const pos = entry.Pos;
    if (!(pos instanceof Int32Array) || pos.length < 3) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK_ENTITY, 'a block entity has no usable Pos; it was dropped');
      return null;
    }
    const nbt = { ...entry };
    delete nbt.Pos;
    delete nbt.Id;
    return { pos: { x: pos[0], y: pos[1], z: pos[2] }, id: entry.Id ?? null, nbt };
  }).filter(Boolean);

  const entities = (root.Entities ?? []).map((entry) => {
    const pos = entry.Pos;
    if (!(pos instanceof Float64Array) && !Array.isArray(pos)) {
      warnings.add(IoWarning.UNKNOWN_ENTITY, 'an entity has no usable Pos; it was dropped');
      return null;
    }
    const nbt = { ...entry };
    delete nbt.Pos;
    return { pos: { x: Number(pos[0]), y: Number(pos[1]), z: Number(pos[2]) }, nbt };
  }).filter(Boolean);

  // REATTACH the block entities' data to the blocks they sit on.
  //
  // Sponge keeps block-entity data in a separate list while vanilla `.nbt` keeps it ON the block, so without
  // this the information survives a Sponge round trip but is LOST the moment anyone converts Sponge to Java:
  // the Java writer looks for `block.nbt`, finds nothing, and writes a chest with no loot table. The canonical
  // model holds both views of the same fact, and this is where they are reconciled.
  const blockByPosition = new Map(blocks.map((block) => [`${block.pos.x},${block.pos.y},${block.pos.z}`, block]));
  for (const entity of blockEntities) {
    const block = blockByPosition.get(`${entity.pos.x},${entity.pos.y},${entity.pos.z}`);
    if (!block) continue;
    block.nbt = { ...(entity.nbt ?? {}), ...(entity.id && !entity.nbt?.id ? { id: entity.id } : {}) };
  }

  const structure = new CanonicalStructure({
    name: root.Metadata?.Name ? String(root.Metadata.Name) : 'sponge-schematic',
    regions: [new CanonicalRegion({
      name: 'main',
      origin: root.Offset && root.Offset.length >= 3
        ? { x: root.Offset[0], y: root.Offset[1], z: root.Offset[2] }
        : { x: 0, y: 0, z: 0 },
      size: { x: width, y: height, z: length },
      blocks,
      blockEntities,
      entities,
      metadata: root.Metadata ? { ...root.Metadata } : {}
    })],
    source: {
      format: `sponge-schem-v${version}`,
      edition: 'java',
      dataVersion: root.DataVersion ?? null,
      gameVersion: MinecraftVersion.forJavaDataVersion(root.DataVersion ?? -1).gameVersion
    },
    metadata: { paletteMax: root.PaletteMax ?? palette.size, version }
  });
  return { structure, warnings };
}

/**
 * Write a canonical structure as a Sponge `.schem`.
 *
 * Gzipped, because that is what every consumer expects and what the specification's examples are. `version`
 * defaults to 3 (the current specification) and 2 is available because a v2-only tool cannot read a v3 file.
 */
export async function writeSpongeSchematic(structure, { version = 3, gzipped = true, warnings = new WarningCollector() } = {}) {
  const region = structure.main;
  const states = structure.palette();
  const indexOf = new Map(states.map((state, index) => [state.key, index]));
  const palette = {};
  states.forEach((state, index) => { palette[state.toString()] = index; });

  const { x: width, y: height, z: length } = region.size;
  // Air needs a palette index of its own, because the block-data stream is POSITIONAL: every one of the
  // volume positions must write a varint, and a position with no block has to write something. Without this,
  // the stream is short and every later block reads the wrong palette entry -- a corruption that looks random.
  let airIndex = indexOf.get(AIR.key);
  if (airIndex === undefined) {
    airIndex = states.length;
    states.push(AIR);
    indexOf.set(AIR.key, airIndex);
    palette[AIR.toString()] = airIndex;
  }

  const byPosition = region.index();
  const encoded = [];
  let total = 0;
  // Sponge orders blocks y, then z, then x: the width is the fastest axis.
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const block = byPosition.get(`${x},${y},${z}`);
        const bytes = writeVarInt(block ? indexOf.get(block.state.key) : airIndex);
        encoded.push(bytes);
        total += bytes.length;
      }
    }
  }
  const blockData = new Uint8Array(total);
  {
    let offset = 0;
    for (const bytes of encoded) {
      blockData.set(bytes, offset);
      offset += bytes.length;
    }
  }

  const blockEntities = region.blockEntities.map((entity) => ({
    ...entity.nbt,
    Id: entity.id ?? entity.nbt?.Id ?? 'minecraft:chest',
    Pos: new Int32Array([entity.pos.x, entity.pos.y, entity.pos.z])
  }));
  const entities = region.entities.map((entity) => ({
    ...entity.nbt,
    // A plain ARRAY, not a Float64Array: the specification wants a TAG_List of TAG_Double here, and this
    // writer has no mapping for a typed float array -- it would fall through to a COMPOUND and write "0", "1"
    // and "2" as keys, corrupting the file in a way that reads back as nonsense rather than as an error. The
    // doubles themselves are then forced by `entityPositionTypes`, because a whole coordinate such as 4 would
    // otherwise be guessed as an INT.
    Pos: [entity.pos.x, entity.pos.y, entity.pos.z]
  }));
  if (entities.length > 0 && version < 3) {
    warnings.add(IoWarning.UNSUPPORTED_COMPONENT,
      `Sponge schematic v2 cannot hold entities: ${entities.length} will be lost. Export as v3 instead.`,
      { entities: entities.length });
  }

  const root = {
    Version: version,
    DataVersion: structure.source.dataVersion ?? TARGET_JAVA.dataVersion,
    Width: width,
    Height: height,
    Length: length,
    Offset: Int32Array.from([region.origin.x, region.origin.y, region.origin.z]),
    PaletteMax: states.length,
    Palette: palette,
    BlockData: blockData,
    Metadata: { Name: structure.name, Author: String(structure.metadata.author ?? 'minecraft-in-browser'), ...region.metadata }
  };
  if (version >= 3 && blockEntities.length > 0) root.BlockEntities = blockEntities;
  if (version >= 3 && entities.length > 0) root.Entities = entities;

  const raw = writeNbt(root, { types: { Version: TagType.INT, DataVersion: TagType.INT, Width: TagType.SHORT, Height: TagType.SHORT, Length: TagType.SHORT, ...entityPositionTypes(root.Entities) } });
  return gzipped ? await gzip(raw) : raw;
}



// --- vanilla Java structure templates (`.nbt`) ------------------------------------------------

/**
 * Read a vanilla Java structure template: the format the game's own structure blocks export.
 *
 * The palette here is a LIST of compounds (`{ Name, Properties }`) rather than Sponge's string keys, and the
 * blocks reference it by index with explicit positions, so the two formats cannot share a reader even though
 * both are NBT.
 */
export async function readJavaStructure(bytes, { warnings = new WarningCollector() } = {}) {
  const root = await readNbtAuto(bytes, { littleEndian: false });
  const sizeList = root.size;
  if (!Array.isArray(sizeList) || sizeList.length < 3) throw new NbtError('a Java structure needs a size list of three ints');
  const size = { x: Number(sizeList[0]), y: Number(sizeList[1]), z: Number(sizeList[2]) };

  const palette = (root.palette ?? []).map((entry) => {
    try {
      return new CanonicalBlockState(entry.Name ?? entry.name, entry.Properties ?? entry.properties ?? {});
    } catch (error) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `palette entry "${entry.Name}" is not a valid block; using air`, { name: entry.Name });
      return AIR;
    }
  });

  const blocks = [];
  for (const entry of root.blocks ?? []) {
    const pos = entry.pos;
    if (!Array.isArray(pos) || pos.length < 3) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, 'a block has no usable pos; it was dropped');
      continue;
    }
    const state = palette[Number(entry.state)];
    if (!state) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `block state index ${entry.state} is not in the palette; using air`, { index: entry.state });
      continue;
    }
    if (state.equals(AIR)) continue;
    const block = { pos: { x: Number(pos[0]), y: Number(pos[1]), z: Number(pos[2]) }, state };
    if (entry.nbt) block.nbt = entry.nbt;
    blocks.push(block);
  }

  const blockEntities = blocks.filter((block) => block.nbt).map((block) => ({
    pos: block.pos,
    id: block.nbt.id ?? null,
    nbt: block.nbt
  }));

  const entities = (root.entities ?? []).map((entry) => {
    const pos = entry.pos;
    const value = { x: Number(pos?.[0] ?? 0), y: Number(pos?.[1] ?? 0), z: Number(pos?.[2] ?? 0) };
    return { pos: value, blockPos: entry.blockPos ? { x: entry.blockPos[0], y: entry.blockPos[1], z: entry.blockPos[2] } : null, nbt: entry.nbt ?? {} };
  });

  const structure = new CanonicalStructure({
    name: structureNameFrom(root),
    regions: [new CanonicalRegion({ name: 'main', size, blocks, blockEntities, entities })],
    source: { format: 'java-structure-nbt', edition: 'java', dataVersion: root.DataVersion ?? null, gameVersion: MinecraftVersion.forJavaDataVersion(root.DataVersion ?? -1).gameVersion },
    metadata: { author: root.author ?? null }
  });
  return { structure, warnings };
}

function structureNameFrom(root) {
  // Vanilla has no name field; the file name is the name. A caller that knows the file name passes it in.
  return root?.metadata?.name ?? 'java-structure';
}

/** Write a canonical structure as a vanilla Java template. */
export async function writeJavaStructure(structure, { gzipped = true, includeEntities = true, warnings = new WarningCollector() } = {}) {
  const region = structure.main;
  const states = structure.palette();
  const indexOf = new Map(states.map((state, index) => [state.key, index]));

  const blocks = region.blocks.map((block) => {
    const entry = { pos: [block.pos.x, block.pos.y, block.pos.z], state: indexOf.get(block.state.key) };
    if (block.nbt) entry.nbt = block.nbt;
    return entry;
  });
  const entities = includeEntities ? region.entities.map((entity) => ({
    pos: [entity.pos.x, entity.pos.y, entity.pos.z],
    blockPos: entity.blockPos ? [entity.blockPos.x, entity.blockPos.y, entity.blockPos.z] : [Math.floor(entity.pos.x), Math.floor(entity.pos.y), Math.floor(entity.pos.z)],
    nbt: entity.nbt ?? {}
  })) : [];
  if (!includeEntities && region.entities.length > 0) {
    warnings.add(IoWarning.UNSUPPORTED_COMPONENT, `${region.entities.length} entities were not written at the caller's request`);
  }

  const root = {
    size: [region.size.x, region.size.y, region.size.z],
    palette: states.map((state) => ({
      Name: state.name,
      ...(Object.keys(state.properties).length ? { Properties: { ...state.properties } } : {})
    })),
    blocks,
    entities,
    DataVersion: structure.source.dataVersion ?? TARGET_JAVA.dataVersion
  };
  const raw = writeNbt(root, { types: { DataVersion: TagType.INT } });
  return gzipped ? await gzip(raw) : raw;
}

// --- adapters onto the game's own template class ----------------------------------------------

/**
 * Adapt a canonical structure to the game's `StructureTemplate`, so an imported file can be PLACED.
 *
 * This is the direction that makes an import useful: `src/worldgen/template.js` already knows how to place a
 * template into the world with rotation and mirroring, so the IO layer's job ends at producing one.
 */
export function toStructureTemplate(structure, { StructureTemplate, name = null } = {}) {
  if (!StructureTemplate) throw new Error('toStructureTemplate needs the StructureTemplate class');
  const region = structure.main;
  const palette = [];
  const indexOf = new Map();
  const paletteIndex = (state) => {
    if (!indexOf.has(state.key)) {
      const entry = { Name: state.name };
      if (Object.keys(state.properties).length > 0) entry.Properties = { ...state.properties };
      indexOf.set(state.key, palette.length);
      palette.push(entry);
    }
    return indexOf.get(state.key);
  };
  const blocks = region.blocks.map((block) => ({
    pos: [block.pos.x, block.pos.y, block.pos.z],
    state: paletteIndex(block.state),
    ...(block.nbt ? { nbt: block.nbt } : {})
  }));
  // The template's palette needs an air entry: its block-state indices are looked up positionally and vanilla
  // templates always carry one, so a missing air would shift every index by one on the next read.
  paletteIndex(AIR);
  return new StructureTemplate({
    size: [region.size.x, region.size.y, region.size.z],
    palette,
    blocks,
    entities: region.entities.map((entity) => ({ pos: [entity.pos.x, entity.pos.y, entity.pos.z], blockPos: entity.blockPos ? [entity.blockPos.x, entity.blockPos.y, entity.blockPos.z] : null, nbt: entity.nbt })),
    dataVersion: structure.source.dataVersion
  });
}

/** The reverse: capture something the game already builds as a canonical structure, ready to export. */
export function fromStructureTemplate(template, { name = 'structure', source = {} } = {}, warnings = new WarningCollector()) {
  const blocks = [];
  for (const block of template.blocks) {
    const entry = template.palette[block.state];
    if (!entry) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `template block references palette index ${block.state}, which does not exist`);
      continue;
    }
    let state;
    try {
      state = new CanonicalBlockState(entry.Name ?? entry.name, entry.Properties ?? entry.properties ?? {});
    } catch (error) {
      warnings.add(IoWarning.UNSUPPORTED_BLOCK, `template palette entry "${entry.Name}" is not a valid block`);
      continue;
    }
    if (state.equals(AIR)) continue;
    blocks.push({ pos: { x: block.pos[0], y: block.pos[1], z: block.pos[2] }, state, ...(block.nbt ? { nbt: block.nbt } : {}) });
  }
  return new CanonicalStructure({
    name,
    regions: [new CanonicalRegion({
      size: { x: template.size[0], y: template.size[1], z: template.size[2] },
      blocks,
      blockEntities: blocks.filter((block) => block.nbt).map((block) => ({ pos: block.pos, id: block.nbt.id ?? null, nbt: block.nbt })),
      entities: (template.entities ?? []).map((entity) => ({ pos: { x: entity.pos[0], y: entity.pos[1], z: entity.pos[2] }, nbt: entity.nbt ?? {} }))
    })],
    source: { format: 'runtime-template', edition: 'java', dataVersion: template.dataVersion ?? null, ...source }
  });
}

// --- formats and detection --------------------------------------------------------------------

/**
 * Every format this layer knows about, whether or not it is implemented.
 *
 * Declaring an unimplemented format is deliberate: the import UI has to be able to RECOGNISE a `.mcworld` and
 * say "not supported yet" rather than "unknown file", and the matrix in docs/MINECRAFT_IO_PARITY.md is generated
 * from this same table so the two cannot drift.
 */
export const IO_FORMATS = {
  'sponge-schem-v3': { id: 'sponge-schem-v3', label: 'Sponge Schematic v3', edition: 'java', kind: 'schematic', extension: 'schem', importer: readSpongeSchematic, exporter: writeSpongeSchematic, status: 'FUNCTIONAL' },
  'sponge-schem-v2': { id: 'sponge-schem-v2', label: 'Sponge Schematic v2', edition: 'java', kind: 'schematic', extension: 'schem', importer: readSpongeSchematic, exporter: (s, o) => writeSpongeSchematic(s, { ...o, version: 2 }), status: 'FUNCTIONAL' },
  'java-structure-nbt': { id: 'java-structure-nbt', label: 'Java structure template', edition: 'java', kind: 'structure', extension: 'nbt', importer: readJavaStructure, exporter: writeJavaStructure, status: 'FUNCTIONAL' },
  'bedrock-mcstructure': { id: 'bedrock-mcstructure', label: 'Bedrock structure', edition: 'bedrock', kind: 'structure', extension: 'mcstructure', importer: null, exporter: null, status: 'NOT STARTED' },
  'legacy-schematic': { id: 'legacy-schematic', label: 'MCEdit schematic', edition: 'java', kind: 'schematic', extension: 'schematic', importer: null, exporter: null, status: 'NOT STARTED' },
  'litematica': { id: 'litematica', label: 'Litematica', edition: 'java', kind: 'schematic', extension: 'litematic', importer: null, exporter: null, status: 'NOT STARTED' },
  'java-anvil-region': { id: 'java-anvil-region', label: 'Anvil region', edition: 'java', kind: 'anvil', extension: 'mca', importer: null, exporter: null, status: 'NOT STARTED' },
  'java-world': { id: 'java-world', label: 'Java world', edition: 'java', kind: 'archive', extension: 'zip', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-leveldb': { id: 'bedrock-leveldb', label: 'Bedrock world', edition: 'bedrock', kind: 'leveldb', extension: 'db', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-mcworld': { id: 'bedrock-mcworld', label: 'Bedrock .mcworld', edition: 'bedrock', kind: 'archive', extension: 'mcworld', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-mcpack': { id: 'bedrock-mcpack', label: 'Bedrock .mcpack', edition: 'bedrock', kind: 'asset-pack', extension: 'mcpack', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-mcaddon': { id: 'bedrock-mcaddon', label: 'Bedrock .mcaddon', edition: 'bedrock', kind: 'archive', extension: 'mcaddon', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-mctemplate': { id: 'bedrock-mctemplate', label: 'Bedrock .mctemplate', edition: 'bedrock', kind: 'archive', extension: 'mctemplate', importer: null, exporter: null, status: 'NOT STARTED' },
  'bedrock-mcproject': { id: 'bedrock-mcproject', label: 'Bedrock Editor project', edition: 'bedrock', kind: 'archive', extension: 'mcproject', importer: null, exporter: null, status: 'NOT STARTED' },
  'java-resource-pack': { id: 'java-resource-pack', label: 'Java resource pack', edition: 'java', kind: 'asset-pack', extension: 'zip', importer: null, exporter: null, status: 'NOT STARTED' },
  'java-data-pack': { id: 'java-data-pack', label: 'Java data pack', edition: 'java', kind: 'data-pack', extension: 'zip', importer: null, exporter: null, status: 'NOT STARTED' }
};

/**
 * Identify a file by CONTENT, falling back to the extension only to distinguish formats that share a container.
 *
 * §34 is explicit that the extension must not be trusted, and it is right: a `.schem` is a gzipped NBT file, a
 * `.nbt` structure is usually a gzipped NBT file, and users rename both. The NBT root's own fields are the
 * evidence -- `Palette` with `Width` is Sponge, `palette` with `size` is vanilla, `structure` with
 * `block_indices` is Bedrock -- and that is what is checked here.
 *
 * @returns {{format: string|null, confidence: 'content'|'extension'|'none', reason: string, detected: object}}
 */
export function detectFormat(bytes, { filename = '' } = {}) {
  const extension = String(filename).toLowerCase().split('.').pop();
  const byExtension = Object.values(IO_FORMATS).find((format) => format.extension === extension) ?? null;
  const detected = {};

  // Content first, and only for the NBT-based formats, because that is what can be told apart cheaply.
  if (bytes && bytes.length > 2) {
    if (isGzipped(bytes)) detected.compressed = 'gzip';
    else if (bytes[0] === 0x0a || bytes[0] === 0x0b) detected.compressed = 'none';
  }
  const nbtSniff = sniffNbtRoot(bytes);
  if (nbtSniff) {
    detected.root = nbtSniff.root;
    if (nbtSniff.sponge) {
      return { format: nbtSniff.version >= 3 ? 'sponge-schem-v3' : 'sponge-schem-v2', confidence: 'content', reason: `NBT root has Sponge fields (Version ${nbtSniff.version})`, detected };
    }
    if (nbtSniff.bedrockStructure) {
      return { format: 'bedrock-mcstructure', confidence: 'content', reason: 'NBT root has Bedrock structure fields', detected };
    }
    if (nbtSniff.javaStructure) {
      return { format: 'java-structure-nbt', confidence: 'content', reason: 'NBT root has a size/palette/blocks triple', detected };
    }
    if (nbtSniff.litematic) {
      return { format: 'litematica', confidence: 'content', reason: 'NBT root has Litematica version and regions', detected };
    }
  }
  if (byExtension) {
    return { format: byExtension.id, confidence: 'extension', reason: `recognised by the .${extension} extension`, detected };
  }
  return { format: null, confidence: 'none', reason: 'content and extension both unrecognised', detected };
}

/**
 * Sniff an NBT root WITHOUT decompressing, from the first uncompressed tags only.
 *
 * Deliberately shallow: it reads the first compound's keys and stops. A full parse of an untrusted header just to
 * identify it would hand an attacker the work they wanted anyway.
 */
function sniffNbtRoot(bytes) {
  let payload = bytes;
  if (isGzipped(bytes)) return null; // compressed: the caller decompresses once and sniffs the result
  try {
    const root = readNbt(payload, { limits: { ...NBT_LIMITS_LOCAL } });
    const keys = root && typeof root === 'object' ? Object.keys(root) : [];
    return {
      root: keys.slice(0, 24),
      sponge: keys.includes('Palette') && keys.includes('Width') && keys.includes('BlockData'),
      version: Number(root.Version ?? 0),
      bedrockStructure: keys.includes('structure') && keys.includes('format_version'),
      javaStructure: keys.includes('size') && keys.includes('palette') && keys.includes('blocks'),
      litematic: keys.includes('Version') && keys.includes('Regions') && keys.includes('Metadata')
    };
  } catch (error) {
    return null;
  }
}

const NBT_LIMITS_LOCAL = { maxDepth: 6, maxElements: 4096, maxStringLength: 4096, maxBytes: 8 * 1024 * 1024 };

// --- the facade -------------------------------------------------------------------------------

/**
 * Import any supported structure file into the canonical form.
 *
 * Decompresses once, sniffs, then dispatches -- so a caller never has to know which codec to use, and a user
 * never has to name the format correctly.
 */
export async function importStructure(bytes, { filename = '', format = null, warnings = new WarningCollector() } = {}) {
  let payload = bytes;
  if (isGzipped(payload)) {
    const plain = await gunzip(payload);
    // Sponge schematics are gzipped NBT; keep the original for the codec, which handles both.
    const sniff = detectFormat(plain, { filename });
    const chosen = format ?? sniff.format;
    if (!chosen) {
      warnings.add(IoWarning.LIMIT_EXCEEDED, `could not identify the file: ${sniff.reason}`);
      return { structure: null, format: null, warnings, detected: sniff.detected };
    }
    const spec = IO_FORMATS[chosen];
    if (!spec?.importer) throw new Error(`${spec?.label ?? chosen} is recognised but not implemented yet`);
    const result = await spec.importer(bytes, { warnings });
    return { ...result, format: chosen, detected: sniff.detected };
  }
  const sniff = detectFormat(payload, { filename });
  const chosen = format ?? sniff.format;
  if (!chosen) {
    warnings.add(IoWarning.LIMIT_EXCEEDED, `could not identify the file: ${sniff.reason}`);
    return { structure: null, format: null, warnings, detected: sniff.detected };
  }
  const spec = IO_FORMATS[chosen];
  if (!spec?.importer) throw new Error(`${spec?.label ?? chosen} is recognised but not implemented yet`);
  const result = await spec.importer(payload, { warnings });
  return { ...result, format: chosen, detected: sniff.detected };
}

/**
 * Universal structure conversion (§29).
 *
 * One funnel: to canonical, then to the target. Information the target cannot represent is warned about HERE,
 * using the target's declared capabilities, rather than discovered as a silent loss by the user.
 */
export async function convertStructure(bytes, targetFormat, { filename = '', warnings = new WarningCollector() } = {}) {
  const imported = await importStructure(bytes, { filename, warnings });
  if (!imported.structure) return { bytes: null, structure: null, warnings, from: null, to: targetFormat };
  const target = IO_FORMATS[targetFormat];
  if (!target?.exporter) throw new Error(`${target?.label ?? targetFormat} cannot be written yet`);

  const structure = imported.structure;
  const region = structure.main;
  if (target.edition !== structure.source.edition) {
    warnings.add(IoWarning.DATA_VERSION_MISMATCH,
      `converting a ${structure.source.edition} structure to ${target.edition}: block ids and states are not interchangeable across editions`,
      { from: imported.format, to: targetFormat });
  }
  if (target.id.startsWith('sponge-schem-v2') && region.entities.length > 0) {
    warnings.add(IoWarning.UNSUPPORTED_COMPONENT, `${region.entities.length} entities cannot be represented in Sponge v2`);
  }
  if (target.id === 'java-structure-nbt' && region.blockEntities.length !== region.blocks.filter((b) => b.nbt).length) {
    warnings.add(IoWarning.UNSUPPORTED_BLOCK_ENTITY, 'some block entities have no block to carry them');
  }
  const out = await target.exporter(structure, { warnings });
  return { bytes: out, structure, warnings, from: imported.format, to: targetFormat };
}

/**
 * Forced DOUBLE types for a Sponge `Entities` list's positions.
 *
 * The specification types these as TAG_List of TAG_Double, and the writer's guessing rules would call a whole
 * coordinate such as 4 an INT. A Bedrock or Sponge reader that validates the type would then reject the file,
 * so the types are stated rather than guessed.
 */
function entityPositionTypes(entities) {
  const types = {};
  (entities ?? []).forEach((_, index) => {
    for (let axis = 0; axis < 3; axis++) types[`Entities[${index}].Pos[${axis}]`] = TagType.DOUBLE;
  });
  return types;
}
