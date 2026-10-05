// Pillager outpost: the first structure built on the jigsaw engine.
//
// From the wiki (`Pillager Outpost`, 1.21.4 revision):
//   * a watchtower on a base plate, with surrounding FEATURES: cages (some holding an iron golem), tents and
//     logs, joined by jigsaw connectors;
//   * the pool graph is the smallest of the jigsaw structures, which is exactly why it is the first one:
//     `pillager_outpost/base_plates`, `.../watchtower` and `.../features`;
//   * it spawns pillagers, and its `terrain_adaptation` is `beard_thin`.
//
// PROVENANCE: no Minecraft assets. Every template here is built by code and is a clean-room approximation of
// the described parts, so the structure's SHAPE is approximate while its POOL GRAPH, connector joining,
// placement and adaptation are the engine's real behaviour.
//
// DEVIATIONS: the tower's dimensions and the feature mix are clean-room; vanilla's outpost pillager spawning
// is an area effect around the structure rather than a fixed set of entities, so only the watchtower's
// occupant is placed here and the area spawning is left to the mob system, which is recorded rather than
// faked with extra entities.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const OUTPOST_POOLS = {
  base: 'pillager_outpost/base_plates',
  tower: 'pillager_outpost/watchtower',
  features: 'pillager_outpost/features'
};

/** How many feature connectors a base plate offers. */
export const BASE_PLATE_CONNECTORS = 4;

const PALETTE_MATERIALS = {
  'minecraft:dark_oak_log': { Name: 'minecraft:dark_oak_log', Properties: { axis: 'y' } },
  'minecraft:dark_oak_planks': { Name: 'minecraft:dark_oak_planks' },
  'minecraft:cobblestone': { Name: 'minecraft:cobblestone' },
  'minecraft:oak_fence': { Name: 'minecraft:oak_fence' },
  'minecraft:iron_bars': { Name: 'minecraft:iron_bars' },
  'minecraft:white_wool': { Name: 'minecraft:white_wool' },
  'minecraft:chest': { Name: 'minecraft:chest', Properties: { facing: 'north', waterlogged: 'false' } }
};

/** A jigsaw block whose `pool` points at the feature pool, so the engine can grow the structure. */
function jigsawBlock(name, pool, orientation, finalState = 'minecraft:air', target = 'minecraft:empty') {
  return { name, pool, orientation, finalState, target, joint: 'aligned' };
}

/**
 * Build one part. Returns a pseudo-template whose `entities` may carry the tower's occupant and whose
 * connectors are exposed through real jigsaw blocks, so the SAME machinery the template loader uses drives
 * the joining.
 */
export function buildOutpostPart(part) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map(palette.map((entry, i) => [entry.Name, i]));
  const blocks = [];
  const materials = [];
  const materialIndex = (name) => {
    if (!index.has(name)) { index.set(name, palette.length); palette.push(PALETTE_MATERIALS[name]); }
    return index.get(name);
  };
  // A jigsaw block's orientation is a STATE property, and a single shared palette entry made every
  // connector report the same facing -- so the joining maths could never turn a child to face its parent.
  const jigsawIndexFor = (orientation) => {
    const key = 'jigsaw:' + orientation;
    if (!index.has(key)) { index.set(key, palette.length); palette.push({ Name: 'minecraft:jigsaw', Properties: { orientation } }); }
    return index.get(key);
  };

  if (part === 'base_plate') {
    const width = 9;
    const size = [width, 1, width];
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < width; z++) blocks.push({ pos: [x, 0, z], state: materialIndex('minecraft:cobblestone') });
    }
    // The centre connector takes the watchtower; the corners offer features.
    blocks.push({
      pos: [4, 0, 4], state: jigsawIndexFor('up_north'),
      nbt: jigsawBlock('pillager_outpost/tower', OUTPOST_POOLS.tower, 'up_north')
    });
    for (const [x, z] of [[1, 1], [1, 7], [7, 1], [7, 7]]) {
      blocks.push({
        pos: [x, 0, z], state: jigsawIndexFor('up_north'),
        nbt: jigsawBlock('pillager_outpost/feature', OUTPOST_POOLS.features, 'up_north')
      });
    }
    return { size, palette, blocks, entities: [] };
  }

  if (part === 'watchtower') {
    const width = 5;
    const height = 10;
    const size = [width, height, width];
    for (let y = 1; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < width; z++) {
          const edge = x === 0 || x === width - 1 || z === 0 || z === width - 1;
          const corner = (x === 0 || x === width - 1) && (z === 0 || z === width - 1);
          if (corner && y < height - 1) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:dark_oak_log') });
          // Solid below the platform, open above it so the tower has a usable top floor.
          else if (edge && y <= 4) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:dark_oak_planks') });
          else if (edge && y >= 7) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:dark_oak_planks') });
        }
      }
      if (y === 5) for (let x = 0; x < width; x++) for (let z = 0; z < width; z++) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:dark_oak_planks') });
    }
    // Roof and a chest on the platform, which is what vanilla's vault-less outpost actually holds.
    for (let x = 0; x < width; x++) for (let z = 0; z < width; z++) blocks.push({ pos: [x, height - 1, z], state: materialIndex('minecraft:dark_oak_planks') });
    blocks.push({ pos: [1, 6, 1], state: materialIndex('minecraft:chest'), nbt: { id: 'minecraft:chest', LootTable: 'minecraft:chests/pillager_outpost' } });
    // The connector that joined this tower to its base plate, now a finished block.
    blocks.push({ pos: [2, 0, 2], state: jigsawIndexFor('down_north'), nbt: jigsawBlock('pillager_outpost/tower', null, 'down_north', 'minecraft:dark_oak_planks') });
    return { size, palette, blocks, entities: [{ pos: [2.5, 7, 2.5], blockPos: [2, 7, 2], nbt: { id: 'minecraft:pillager', PersistenceRequired: 1 } }] };
  }

  if (part === 'cage' || part === 'cage_golem') {
    const size = [3, 3, 3];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const edge = x === 0 || x === 2 || z === 0 || z === 2;
          if (edge && y < 2) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:iron_bars') });
          else if (y === 2) blocks.push({ pos: [x, y, z], state: materialIndex('minecraft:dark_oak_planks') });
        }
      }
    }
    blocks.push({ pos: [1, 0, 1], state: jigsawIndexFor('down_north'), nbt: jigsawBlock('pillager_outpost/feature', null, 'down_north', 'minecraft:cobblestone') });
    return {
      size, palette, blocks,
      entities: part === 'cage_golem'
        ? [{ pos: [1.5, 0, 1.5], blockPos: [1, 0, 1], nbt: { id: 'minecraft:iron_golem', PersistenceRequired: 1 } }]
        : []
    };
  }

  if (part === 'tent') {
    const size = [5, 3, 5];
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 4;
        if (edge) blocks.push({ pos: [x, 2, z], state: materialIndex('minecraft:white_wool') });
      }
    }
    for (const [x, z] of [[0, 0], [0, 4], [4, 0], [4, 4]]) blocks.push({ pos: [x, 0, z], state: materialIndex('minecraft:oak_fence') });
    blocks.push({ pos: [2, 0, 2], state: jigsawIndexFor('down_north'), nbt: jigsawBlock('pillager_outpost/feature', null, 'down_north', 'minecraft:white_wool') });
    return { size, palette, blocks, entities: [] };
  }

  if (part === 'log') {
    const size = [1, 4, 1];
    for (let y = 0; y < 4; y++) blocks.push({ pos: [0, y, 0], state: materialIndex('minecraft:dark_oak_log') });
    blocks.push({ pos: [0, 0, 0], state: jigsawIndexFor('down_north'), nbt: jigsawBlock('pillager_outpost/feature', null, 'down_north', 'minecraft:dark_oak_log') });
    return { size, palette, blocks, entities: [] };
  }

  throw new Error(`unknown pillager outpost part "${part}"`);
}

/** The three pools of the outpost graph. */
export function createOutpostPools() {
  const pools = new TemplatePoolRegistry();
  const connectorsOf = (part) => {
    const json = buildOutpostPart(part);
    return json.blocks
      .filter((block) => block.nbt && block.nbt.pool !== undefined)
      .map((block) => ({
        name: block.nbt.name,
        pool: block.nbt.pool,
        orientation: block.nbt.orientation,
        joint: block.nbt.joint,
        finalState: block.nbt.final_state ?? block.nbt.finalState,
        local: { x: block.pos[0], y: block.pos[1], z: block.pos[2] }
      }));
  };
  const element = (part, weight) => new PoolElement({
    name: part,
    weight,
    build: () => ({ connectors: connectorsOf(part) })
  });

  pools.register(new TemplatePool({ id: OUTPOST_POOLS.base, elements: [element('base_plate', 1)] }));
  pools.register(new TemplatePool({ id: OUTPOST_POOLS.tower, elements: [element('watchtower', 1)] }));
  pools.register(new TemplatePool({
    id: OUTPOST_POOLS.features,
    elements: [element('cage', 3), element('cage_golem', 1), element('tent', 2), element('log', 4)]
  }));
  return pools;
}

/** Build a piece's box and world-space connectors, which is what the engine joins on. */
function buildJigsawPiece(element, rotation, mirror, at) {
  const json = buildOutpostPart(element.name);
  const template = new StructureTemplate(json, `minecraft:pillager_outpost/${element.name}`);
  const box = template.boundingBox(at, rotation, mirror);
  // The template's own jigsaw extraction gives local positions already transformed, so world space is a
  // translation -- no second geometry path that could disagree with the block placement.
  const jigsaws = template.jigsaws(rotation, mirror);
  const connectors = jigsaws.map((jigsaw) => ({
    name: jigsaw.name,
    pool: jigsaw.pool,
    orientation: jigsaw.orientation,
    joint: jigsaw.joint,
    finalState: jigsaw.finalState,
    position: { x: at.x + jigsaw.local.x, y: at.y + jigsaw.local.y, z: at.z + jigsaw.local.z }
  }));
  const connectorPositions = {};
  for (const connector of connectors) connectorPositions[connector.name] = connector.position;
  return { box, connectors, connectorPositions };
}

export function generatePillagerOutpost({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 4;
  const originZ = chunkZ * 16 + 4;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const pools = createOutpostPools();
  const origin = { x: originX - 4, y: surface, z: originZ - 4 };

  const result = addPieces({
    random,
    startPool: pools.resolve(OUTPOST_POOLS.base),
    pools,
    buildPiece: buildJigsawPiece,
    maxDepth: 2,
    origin,
    maxDistanceFromCentre: 48
  });

  const start = new StructureStart({
    structureId: 'pillager_outpost',
    chunkX,
    chunkZ,
    pieces: result.pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = {
    pieces: result.pieces.length,
    diagnostics: result.diagnostics,
    connected: result.isConnected(),
    surface,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizePillagerOutpost(start, setBlock, blockIds, { spawnMob = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const spawned = [];
  let written = 0;

  for (const piece of start.pieces) {
    const part = piece.meta.element;
    const template = new StructureTemplate(buildOutpostPart(part), piece.template ?? `minecraft:pillager_outpost/${part}`);
    const origin = { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
    // For a rigid, unmirrored part the box's min corner IS the origin, which keeps realization independent
    // of the planning maths: if the two disagreed, pieces would visibly detach from each other.
    const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(piece.index) * 2654435761n);
    const placement = placeTemplate({
      template,
      origin,
      rotation: piece.rotation,
      mirror: piece.mirror,
      processors: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] },
      random,
      world: null
    });
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) { missingBlocks.add(block.state.name); continue; }
      if (setBlock(block.x, block.y, block.z, id, { state: block.state })) written++;
    }
    if (spawnMob) {
      for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
        const type = String(entity.nbt?.id || '').replace('minecraft:', '');
        if (spawnMob(type, origin.x + entity.local.x, origin.y + entity.local.y, origin.z + entity.local.z, { persistent: true })) {
          spawned.push(type);
        }
      }
    }
  }

  return {
    written,
    pieces: start.pieces.length,
    spawned,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room outpost parts; vanilla area-spawns pillagers around the outpost, which is not reproduced here'
  };
}
