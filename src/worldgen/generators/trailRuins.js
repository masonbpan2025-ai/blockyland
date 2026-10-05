// Trail ruins: a BURIED chain of path pieces with archaeology.
//
// From the wiki (`Trail Ruins`, 1.21.4 revision) and this repository's registry entry: taiga, old-growth taiga
// and birch, and jungle family biomes; generated a little BELOW the surface with `terrain_adaptation: bury`,
// which is what covers it over again; built from mud bricks, packed mud and terracotta with gravel, candles and
// decorated pots; and it holds SUSPICIOUS GRAVEL and SAND carrying the archaeology loot, plus chests.
//
// Its defining property is that it is a TRAIL: a run of path pieces that chain end to end, with ruins alongside
// them, rather than one building. That is why it is built here on the jigsaw engine as a chain, reusing the
// machinery verified by the village and the bastion.
//
// PROVENANCE: no Minecraft assets. Parts are built by code from the described shapes and materials, so the
// LAYOUT is a clean-room approximation while the chaining, the buried placement, the archaeology blocks and the
// loot are the engine's real behaviour.
//
// APPROXIMATIONS, recorded rather than hidden: the depth below the surface and the room sizes are clean-room;
// the archaeology loot ids are conventional, because the wiki publishes `{{LootChest}}`-style keys rather than
// namespaced ids.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const TRAIL_MATERIALS = {
  brick: 'minecraft:mud_bricks',
  mud: 'minecraft:packed_mud',
  terracotta: 'minecraft:terracotta',
  white: 'minecraft:white_terracotta',
  orange: 'minecraft:orange_terracotta',
  gravel: 'minecraft:gravel',
  sand: 'minecraft:sand',
  coarse: 'minecraft:coarse_dirt',
  log: 'minecraft:oak_log',
  plank: 'minecraft:oak_planks',
  candle: 'minecraft:candle',
  pot: 'minecraft:decorated_pot',
  chest: 'minecraft:chest',
  suspiciousGravel: 'minecraft:suspicious_gravel',
  suspiciousSand: 'minecraft:suspicious_sand',
  loot: 'minecraft:chests/trail_ruins_rare',
  archaeology: 'minecraft:archaeology/trail_ruins_common'
};

/** How far below the surface the trail sits. The wiki does not publish the offset in a verifiable form. */
export const TRAIL_DEPTH = 2;
export const TRAIL_MAX_DEPTH = 4;
export const TRAIL_MAX_DISTANCE = 48;
export const PATH_SLOT = 'trail/path';
export const RUIN_SLOT = 'trail/ruin';
export const PATH_POOL = 'trail/paths';
export const RUIN_POOL = 'trail/ruins';

export function buildTrailPart(kind, materials = TRAIL_MATERIALS) {
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
      throw new Error('trail ruins ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const slot = (x, y, z, name, pool, front, top = 'up') => {
    push(x, y, z, jigsawState(front, top), { name, pool, orientation: front + '_' + top, joint: 'aligned', target: 'minecraft:empty' });
  };
  const m = (key) => material(TRAIL_MATERIALS[key]);

  if (kind === 'entrance') {
    // The trail's head: a wider ruined platform with a path slot onwards and a ruin slot on each side.
    const size = declare([7, 4, 11]);
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 11; z++) {
        const edge = x === 0 || x === 6 || z === 0 || z === 10;
        push(x, 0, z, edge ? m('gravel') : m('coarse'));
        // Ruined walls: present in patches rather than as a whole building.
        if (edge && (x + z) % 3 !== 0) { push(x, 1, z, m('brick')); if ((x + z) % 2 === 0) push(x, 2, z, m('mud')); }
      }
    }
    push(2, 1, 5, m('candle'));
    push(4, 1, 7, m('pot'));
    // Archaeology: the blocks worth brushing, carrying the trail's loot.
    push(3, 1, 9, m('suspiciousGravel'), { id: 'minecraft:suspicious_gravel', LootTable: materials.archaeology });
    push(1, 1, 1, m('suspiciousSand'), { id: 'minecraft:suspicious_sand', LootTable: materials.archaeology });
    slot(3, 0, 0, PATH_SLOT, PATH_POOL, 'north');
    slot(0, 0, 5, RUIN_SLOT, RUIN_POOL, 'west');
    slot(6, 0, 5, RUIN_SLOT, RUIN_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'path' || kind === 'path_corner') {
    // The trail itself: a run of packed mud and gravel with the path slot at BOTH ends, so the trail continues
    // until the depth limit stops it. Two connectors share the slot name, which deviation 0e blocked until the
    // per-instance fix -- this is the fifth structure to rely on it.
    const long = kind === 'path' ? 13 : 7;
    const size = declare([5, 3, kind === 'path' ? long : 7]);
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < (kind === 'path' ? long : 7); z++) {
        push(x, 0, z, (x + z) % 4 === 0 ? m('gravel') : m('coarse'));
        if ((x === 0 || x === 4) && (x + z) % 3 !== 0) push(x, 1, z, m('brick'));
      }
    }
    push(2, 1, 6, m('candle'));
    if (kind === 'path') {
      push(2, 1, 3, m('suspiciousGravel'), { id: 'minecraft:suspicious_gravel', LootTable: materials.archaeology });
      slot(2, 0, 0, PATH_SLOT, PATH_POOL, 'north');
      slot(2, 0, long - 1, PATH_SLOT, PATH_POOL, 'south');
      slot(0, 0, 6, RUIN_SLOT, RUIN_POOL, 'west');
    } else {
      slot(2, 0, 0, PATH_SLOT, PATH_POOL, 'north');
      slot(4, 0, 3, PATH_SLOT, PATH_POOL, 'east');
    }
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'ruin_small' || kind === 'ruin_large' || kind === 'camp') {
    const wide = kind === 'ruin_large' ? 9 : 7;
    const size = declare([wide, 4, wide]);
    for (let x = 0; x < wide; x++) {
      for (let z = 0; z < wide; z++) {
        const edge = x === 0 || x === wide - 1 || z === 0 || z === wide - 1;
        push(x, 0, z, edge ? m('gravel') : m('coarse'));
        // Partial walls: a ruin has gaps, which is what distinguishes it from a room.
        if (edge && (x * 3 + z * 5) % 4 !== 0) push(x, 1, z, x % 2 === 0 ? m('brick') : m('terracotta'));
      }
    }
    if (kind === 'camp') {
      for (let x = 1; x < wide - 1; x++) for (let z = 1; z < wide - 1; z++) if ((x + z) % 3 === 0) push(x, 1, z, m('white'));
      push(2, 1, 2, m('candle'));
      push(wide - 3, 1, wide - 3, m('pot'));
    }
    // The rare chest and a second archaeology block, so every ruin is worth excavating.
    blocks.push({ pos: [Math.floor(wide / 2), 1, Math.floor(wide / 2)], state: material(TRAIL_MATERIALS.chest), nbt: { id: 'minecraft:chest', LootTable: TRAIL_MATERIALS.loot } });
    push(1, 1, wide - 2, m('suspiciousSand'), { id: 'minecraft:suspicious_sand', LootTable: materials.archaeology });
    if (kind === 'ruin_large') push(wide - 2, 2, 1, m('log'));
    slot(Math.floor(wide / 2), 0, 0, RUIN_SLOT, null, 'north');
    return { size, palette, blocks, entities: [] };
  }

  throw new Error('unknown trail ruins part ' + kind);
}

export function createTrailPools(materials = TRAIL_MATERIALS) {
  const pools = new TemplatePoolRegistry();
  const element = (kind, weight = 1) => new PoolElement({
    name: kind,
    weight,
    build: () => ({
      connectors: buildTrailPart(kind, materials).blocks
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
  pools.register(new TemplatePool({ id: 'trail/starts', elements: [element('entrance', 1)] }));
  pools.register(new TemplatePool({ id: PATH_POOL, elements: [element('path', 3), element('path_corner', 2)] }));
  pools.register(new TemplatePool({ id: RUIN_POOL, elements: [element('ruin_small', 3), element('ruin_large', 1), element('camp', 1)] }));
  return pools;
}

function buildPiece(element, rotation, mirror, at, materials) {
  const template = new StructureTemplate(buildTrailPart(element.name, materials), 'minecraft:trail_ruins/' + element.name);
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

export function generateTrailRuins({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 8;
  const originZ = chunkZ * 16 + 8;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  // Buried: the trail sits below the surface, and the registry's `bury` adaptation covers it over again.
  const y = surface - TRAIL_DEPTH;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const pools = createTrailPools();

  const result = addPieces({
    random,
    startPool: pools.resolve('trail/starts'),
    pools,
    buildPiece: (element, rotation, mirror, at) => buildPiece(element, rotation, mirror, at, TRAIL_MATERIALS),
    maxDepth: TRAIL_MAX_DEPTH,
    origin: { x: originX, y, z: originZ },
    maxDistanceFromCentre: TRAIL_MAX_DISTANCE
  });

  const start = new StructureStart({
    structureId: 'trail_ruins',
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
    y,
    depthBelowSurface: TRAIL_DEPTH,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizeTrailRuins(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const chests = [];
  const archaeology = [];
  let written = 0;

  for (const piece of start.pieces) {
    const kind = piece.meta.element;
    const template = new StructureTemplate(buildTrailPart(kind, TRAIL_MATERIALS), 'minecraft:trail_ruins/' + kind);
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
      // The blocks worth brushing are reported separately from the chests: a trail ruin's reward is as much the
      // archaeology as the loot, and a structure that "contains suspicious blocks" only in a comment is not it.
      if (block.state.name === 'minecraft:suspicious_gravel' || block.state.name === 'minecraft:suspicious_sand') {
        archaeology.push({ x: block.x, y: block.y, z: block.z, block: block.state.name, lootTable: block.nbt?.LootTable ?? null });
      }
      if (block.nbt?.LootTable && !archaeology.some((entry) => entry.x === block.x && entry.y === block.y && entry.z === block.z)) {
        chests.push(block.nbt.LootTable);
      }
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
    archaeology,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room trail parts; the depth below the surface is an approximation'
  };
}
