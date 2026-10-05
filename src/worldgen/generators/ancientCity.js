// Ancient city: the deep dark's jigsaw structure, with a FIXED floor height.
//
// From the wiki (`Ancient City`, 1.21.4 revision) and this repository's registry entry: deep dark only,
// `underground_structures`, `beard_box` terrain adaptation, and -- a published value rather than an
// approximation -- "the floor is always at Y = -51". Built from deepslate family blocks with sculk,
// reinforced deepslate, wool carpets and candles; holds chests with the ancient city and ice-box loot; and
// the warden's spawn overrides are what make the deep dark dangerous rather than the structure's blocks.
//
// PROVENANCE: no Minecraft assets. Parts are built by code from the described rooms and materials, so the
// LAYOUT is a clean-room approximation while the pool graph, chaining, connector joining, fixed floor height
// and terrain adaptation are the engine's real behaviour.
//
// APPROXIMATIONS, recorded rather than hidden: room sizes and the corridor lengths are clean-room; loot-table
// ids are conventional because the wiki publishes `{{LootChest}}` keys rather than namespaced ids; the
// structure does not place a warden, because vanilla reaches it through spawn overrides in the deep dark
// rather than through structure blocks.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const ANCIENT_MATERIALS = {
  brick: 'minecraft:deepslate_bricks',
  tile: 'minecraft:deepslate_tiles',
  polished: 'minecraft:polished_deepslate',
  cobbled: 'minecraft:cobbled_deepslate',
  chiseled: 'minecraft:chiseled_deepslate',
  reinforced: 'minecraft:reinforced_deepslate',
  sculk: 'minecraft:sculk',
  sensor: 'minecraft:sculk_sensor',
  shrieker: 'minecraft:sculk_shrieker',
  vein: 'minecraft:sculk_vein',
  wool: 'minecraft:gray_wool',
  lantern: 'minecraft:soul_lantern',
  candle: 'minecraft:candle',
  chest: 'minecraft:chest',
  loot: 'minecraft:chests/ancient_city',
  iceLoot: 'minecraft:chests/ancient_city_ice_box'
};

/** A PUBLISHED value: the ancient city's floor is always at Y = -51. */
export const ANCIENT_CITY_FLOOR_Y = -51;
export const ANCIENT_MAX_DEPTH = 6;
export const ANCIENT_MAX_DISTANCE = 96;
export const CITY_SLOT = 'ancient_city/road';
export const ROOM_SLOT = 'ancient_city/room';
export const CITY_POOL = 'ancient_city/roads';
export const ROOM_POOL = 'ancient_city/rooms';

export function buildAncientPart(kind, materials = ANCIENT_MATERIALS) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map();
  const material = (name) => {
    if (!index.has(name)) { index.set(name, palette.length); palette.push({ Name: name }); }
    return index.get(name);
  };
  const jigsawState = (front, top) => {
    const orientation = front + '_' + top; // vanilla's order: `up_north` FRONTS NORTH
    const key = 'jigsaw:' + orientation;
    if (!index.has(key)) { index.set(key, palette.length); palette.push({ Name: 'minecraft:jigsaw', Properties: { orientation } }); }
    return index.get(key);
  };
  const blocks = [];
  let declared = [0, 0, 0];
  const declare = (size) => { declared = size; return size; };
  // A block outside the declared size would be written outside the piece box: a plan whose advertised box is a
  // lie, and a chunk-clipping hazard. It is an error, not a silent extra block.
  const push = (x, y, z, state, nbt = null) => {
    const [sx, sy, sz] = declared;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
      throw new Error('ancient city ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const slot = (x, y, z, name, pool, front, top = 'up') => {
    push(x, y, z, jigsawState(front, top), { name, pool, orientation: front + '_' + top, joint: 'aligned', target: 'minecraft:empty' });
  };
  const m = (key) => material(materials[key]);
  /** A deepslate room: floor, walls, ceiling, with two opposing doorways and sculk creeping in. */
  const room = (sx, sy, sz, doorX) => {
    for (let x = 0; x < sx; x++) {
      for (let z = 0; z < sz; z++) {
        const edge = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;
        push(x, 0, z, x % 3 === 0 ? m('cobbled') : m('brick'));
        for (let y = 1; y < sy - 1; y++) {
          if (!edge) continue;
          if ((z === 0 || z === sz - 1) && x === doorX && y <= 2) continue;
          // Sculk creeps along the walls and ceiling edges, which is what makes a room read as deep dark.
          const sculked = (x + z + y) % 7 === 0;
          push(x, y, z, sculked ? m('sculk') : y === sy - 2 ? m('tile') : m('brick'));
        }
        push(x, sy - 1, z, (x + z) % 5 === 0 ? m('sculk') : m('tile'));
      }
    }
  };

  if (kind === 'entrance') {
    // The starting road: a long hall with a road slot at each end and a room slot on each side.
    const size = declare([7, 6, 15]);
    room(7, 6, 15, 3);
    push(3, 1, 7, m('reinforced'));
    push(3, 3, 3, m('lantern'));
    push(1, 1, 11, m('wool'));
    push(5, 1, 11, m('wool'));
    push(3, 1, 12, m('chest'), { id: 'minecraft:chest', LootTable: materials.loot });
    slot(3, 0, 0, CITY_SLOT, CITY_POOL, 'north');
    slot(3, 0, 14, CITY_SLOT, CITY_POOL, 'south');
    slot(0, 0, 7, ROOM_SLOT, ROOM_POOL, 'west');
    slot(6, 0, 7, ROOM_SLOT, ROOM_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'road' || kind === 'road_corner') {
    const wide = kind === 'road_corner' ? 9 : 7;
    const size = declare([wide, 6, wide]);
    room(wide, 6, wide, Math.floor(wide / 2));
    if (kind === 'road') {
      slot(Math.floor(wide / 2), 0, 0, CITY_SLOT, CITY_POOL, 'north');
      slot(Math.floor(wide / 2), 0, wide - 1, CITY_SLOT, CITY_POOL, 'south');
      slot(0, 0, Math.floor(wide / 2), ROOM_SLOT, ROOM_POOL, 'west');
    } else {
      slot(Math.floor(wide / 2), 0, 0, CITY_SLOT, CITY_POOL, 'north');
      slot(wide - 1, 0, Math.floor(wide / 2), CITY_SLOT, CITY_POOL, 'east');
    }
    // Shriekers and sensors are the structure's warning system: they are blocks with behaviour, not decoration.
    push(1, 1, 1, m('shrieker'));
    push(wide - 2, 1, wide - 2, m('sensor'));
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'temple' || kind === 'ice_box' || kind === 'ruin') {
    const wide = kind === 'temple' ? 13 : kind === 'ice_box' ? 9 : 7;
    const tall = kind === 'temple' ? 9 : 6;
    const size = declare([wide, tall, wide]);
    room(wide, tall, wide, Math.floor(wide / 2));
    if (kind === 'temple') {
      // The central temple: a reinforced deepslate frame, the only place vanilla offers that block, and the
      // city's landmark chest.
      for (let x = 2; x <= wide - 3; x++) { push(x, 1, 2, m('reinforced')); push(x, 1, wide - 3, m('reinforced')); }
      for (let z = 2; z <= wide - 3; z++) { push(2, 2, z, m('reinforced')); push(wide - 3, 2, z, m('reinforced')); }
      push(Math.floor(wide / 2), 1, Math.floor(wide / 2), m('chiseled'));
      push(1, 1, 1, m('chest'), { id: 'minecraft:chest', LootTable: materials.loot });
      push(wide - 2, 1, wide - 2, m('candle'));
    } else if (kind === 'ice_box') {
      // The ice box: a sealed room with its own loot table, and the one place worth a different table.
      push(1, 1, 1, m('chest'), { id: 'minecraft:chest', LootTable: materials.iceLoot });
      for (let x = 3; x <= wide - 4; x++) { push(x, 1, 3, m('reinforced')); push(x, 1, wide - 4, m('reinforced')); }
    } else {
      push(2, 1, 2, m('shrieker'));
      push(wide - 3, 1, wide - 3, m('chest'), { id: 'minecraft:chest', LootTable: materials.loot });
    }
    const doorX = Math.floor(wide / 2);
    push(doorX, 1, 0, m('sculk'));
    slot(doorX, 0, 0, ROOM_SLOT, null, 'north');
    return { size, palette, blocks, entities: [] };
  }

  throw new Error('unknown ancient city part ' + kind);
}

export function createAncientPools(materials = ANCIENT_MATERIALS) {
  const pools = new TemplatePoolRegistry();
  const element = (kind, weight = 1) => new PoolElement({
    name: kind,
    weight,
    build: () => ({
      connectors: buildAncientPart(kind, materials).blocks
        .filter((block) => block.nbt && Object.prototype.hasOwnProperty.call(block.nbt, 'pool'))
        .map((block) => ({
          name: block.nbt.name,
          pool: block.nbt.pool,
          orientation: block.nbt.orientation,
          joint: block.nbt.joint,
          local: { x: block.pos[0], y: block.pos[1], z: block.pos[2] }
        }))
    })
  });
  pools.register(new TemplatePool({ id: 'ancient_city/starts', elements: [element('entrance', 1)] }));
  pools.register(new TemplatePool({
    id: CITY_POOL,
    elements: [element('road', 3), element('road_corner', 2)]
  }));
  pools.register(new TemplatePool({
    id: ROOM_POOL,
    elements: [element('temple', 1), element('ice_box', 1), element('ruin', 2)]
  }));
  return pools;
}

function buildPiece(element, rotation, mirror, at, materials) {
  const template = new StructureTemplate(buildAncientPart(element.name, materials), 'minecraft:ancient_city/' + element.name);
  const box = template.boundingBox(at, rotation, mirror);
  const connectors = template.jigsaws(rotation, mirror).map((jigsaw) => ({
    name: jigsaw.name,
    pool: jigsaw.pool,
    orientation: jigsaw.orientation,
    joint: jigsaw.joint,
    position: { x: at.x + jigsaw.local.x, y: at.y + jigsaw.local.y, z: at.z + jigsaw.local.z }
  }));
  return { box, connectors };
}

export function generateAncientCity({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 8;
  const originZ = chunkZ * 16 + 8;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const pools = createAncientPools();

  const result = addPieces({
    random,
    startPool: pools.resolve('ancient_city/starts'),
    pools,
    buildPiece: (element, rotation, mirror, at) => buildPiece(element, rotation, mirror, at, ANCIENT_MATERIALS),
    maxDepth: ANCIENT_MAX_DEPTH,
    origin: { x: originX, y: ANCIENT_CITY_FLOOR_Y, z: originZ },
    maxDistanceFromCentre: ANCIENT_MAX_DISTANCE
  });

  const start = new StructureStart({
    structureId: 'ancient_city',
    chunkX,
    chunkZ,
    pieces: result.pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = {
    pieces: result.pieces.length,
    maxDepth: Math.max(0, ...result.pieces.map((piece) => piece.meta.depth ?? 0)),
    diagnostics: result.diagnostics,
    connected: result.isConnected(),
    // Published rather than approximated: the floor is always at -51 in vanilla.
    floorY: ANCIENT_CITY_FLOOR_Y,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizeAncientCity(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const chests = [];
  let written = 0;
  let shriekers = 0;
  let sensors = 0;

  for (const piece of start.pieces) {
    const kind = piece.meta.element;
    const template = new StructureTemplate(buildAncientPart(kind, ANCIENT_MATERIALS), 'minecraft:ancient_city/' + kind);
    const origin = { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
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
      if (block.nbt?.LootTable) chests.push(block.nbt.LootTable);
      if (block.state.name === ANCIENT_MATERIALS.shrieker) shriekers++;
      if (block.state.name === ANCIENT_MATERIALS.sensor) sensors++;
      if (setBlock(block.x, block.y, block.z, id, {
        state: block.state,
        ...(block.nbt?.LootTable ? { lootTable: block.nbt.LootTable } : {})
      })) written++;
    }
  }

  return {
    written,
    pieces: start.pieces.length,
    chests: chests.length,
    chestLoot: chests,
    shriekers,
    sensors,
    floorY: start.meta?.floorY ?? ANCIENT_CITY_FLOOR_Y,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room rooms; no warden is placed, because vanilla reaches it through deep dark spawn overrides'
  };
}
