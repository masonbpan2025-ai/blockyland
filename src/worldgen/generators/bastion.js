// Bastion remnant: a Nether jigsaw structure that FLOATS by design.
//
// From the wiki (`Bastion Remnant`, 1.21.4 revision): one id in the Nether, four variants (bridge, hoglin
// stable, housing units, treasure), built from blackstone family blocks with gold blocks and gilded
// blackstone, and -- recorded in the registry since round 1 -- it floats over the lava sea by design
// (MC-179796). That is why it carries NO terrain adaptation: bedding it into the ground would be a deviation,
// not a fix.
//
// PROVENANCE: no Minecraft assets. Parts are built by code from the described materials and layout, so the
// LAYOUT is a clean-room approximation while the pool graph, multi-level chaining, connector joining and
// placement are the engine's real behaviour.
//
// ORIENTATIONS come from `StructureTemplate.jigsaws(rotation, mirror)`, never hand-transformed. Hand-rolling
// that transform cost four rounds in the chain fixture; see STRUCTURE_ARCHITECTURE.md risk 6.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

/** The bastion's materials, shared by every part because the variants differ in LAYOUT, not in palette. */
export const BASTION_MATERIALS = {
  brick: 'minecraft:polished_blackstone_bricks',
  blackstone: 'minecraft:blackstone',
  wall: 'minecraft:blackstone_wall',
  accent: 'minecraft:basalt',
  gold: 'minecraft:gold_block',
  gilded: 'minecraft:gilded_blackstone',
  chest: 'minecraft:chest',
  loot: 'minecraft:chests/bastion_treasure'
};

/**
 * Where a bastion floats. Vanilla's bastions hang over the lava sea well above the nether floor; the wiki does
 * not publish the height band, so this is a documented approximation rather than a value taken from data.
 */
export const BASTION_Y_RANGE = [54, 70];

export const BASTION_MAX_DEPTH = 5;
export const BASTION_MAX_DISTANCE = 96;
export const WALKWAY_SLOT = 'bastion/walkway';
export const SEGMENT_SLOT = 'bastion/segment';
export const WALKWAY_POOL = 'bastion/walkways';
export const SEGMENT_POOL = 'bastion/segments';

export function buildBastionPart(kind, materials = BASTION_MATERIALS) {
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
  // A block outside the declared size would be written outside the piece box, breaking chunk clipping and
  // making the plan's advertised box a lie, so it is an error rather than a silent extra block.
  const push = (x, y, z, state, nbt = null) => {
    const [sx, sy, sz] = declared;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
      throw new Error('bastion ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const slot = (x, y, z, name, pool, front, top = 'up') => {
    push(x, y, z, jigsawState(front, top), { name, pool, orientation: front + '_' + top, joint: 'aligned', target: 'minecraft:empty' });
  };
  const m = (key) => material(materials[key]);

  if (kind === 'bridge') {
    // The starting walkway: a long, narrow span with a walkway slot at each end so the bastion extends both
    // ways, and a segment slot on each side. Two connectors share a name, which is the case deviation 0e
    // blocked until the per-instance fix.
    const size = declare([5, 5, 13]);
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 13; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 12;
        push(x, 0, z, edge ? m('blackstone') : m('brick'));
        if (edge) { push(x, 1, z, m('wall')); push(x, 2, z, m('wall')); }
      }
    }
    for (let z = 0; z < 13; z++) { push(2, 3, z, m('brick')); if (z % 4 === 0) push(2, 4, z, m('accent')); }
    slot(2, 0, 0, WALKWAY_SLOT, WALKWAY_POOL, 'north');
    slot(2, 0, 12, WALKWAY_SLOT, WALKWAY_POOL, 'south');
    slot(0, 0, 6, SEGMENT_SLOT, SEGMENT_POOL, 'west');
    slot(4, 0, 6, SEGMENT_SLOT, SEGMENT_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'walkway') {
    const size = declare([5, 3, 9]);
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 9; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 8;
        push(x, 0, z, edge ? m('blackstone') : m('brick'));
        if (x === 0 || x === 4) push(x, 1, z, m('wall'));
      }
    }
    slot(2, 0, 0, WALKWAY_SLOT, WALKWAY_POOL, 'north');
    slot(2, 0, 8, WALKWAY_SLOT, WALKWAY_POOL, 'south');
    if (kind === 'walkway') slot(0, 0, 4, SEGMENT_SLOT, SEGMENT_POOL, 'west');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'housing' || kind === 'stable' || kind === 'treasure') {
    const wide = kind === 'treasure' ? 9 : 7;
    const tall = kind === 'stable' ? 6 : 5;
    const size = declare([wide, tall, wide]);
    for (let x = 0; x < wide; x++) {
      for (let z = 0; z < wide; z++) {
        const edge = x === 0 || x === wide - 1 || z === 0 || z === wide - 1;
        push(x, 0, z, edge ? m('blackstone') : m('brick'));
        for (let y = 1; y < tall - 1; y++) if (edge) push(x, y, z, y === tall - 2 ? m('brick') : m('blackstone'));
      }
    }
    for (let x = 0; x < wide; x++) for (let z = 0; z < wide; z++) push(x, tall - 1, z, m('brick'));
    // Gold and gilded blackstone are the bastion's signature; the treasure room also holds a chest.
    push(1, 1, 1, m('gold'));
    push(wide - 2, 1, 1, m('gilded'));
    push(1, 1, wide - 2, m('gilded'));
    if (kind === 'treasure') {
      blocks.push({ pos: [Math.floor(wide / 2), 1, Math.floor(wide / 2)], state: material(materials.chest), nbt: { id: 'minecraft:chest', LootTable: materials.loot } });
      blocks.push({ pos: [2, 2, 2], state: material(materials.gold) });
    }
    if (kind === 'stable') {
      // A hoglin stable's pens: fences of walls with gaps, and a chest of hoglin loot.
      for (let z = 2; z < wide - 2; z++) { push(2, 1, z, m('wall')); push(wide - 3, 1, z, m('wall')); }
      blocks.push({ pos: [3, 1, 3], state: material(materials.chest), nbt: { id: 'minecraft:chest', LootTable: 'minecraft:chests/bastion_hoglin_stable' } });
    }
    // The connector that joined this room to its walkway, now a finished block.
    slot(Math.floor(wide / 2), 0, 0, SEGMENT_SLOT, null, 'north');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'rampart') {
    // A corner tower: it offers a walkway slot only, so a chain can turn but never dead-ends unexpectedly.
    const size = declare([7, 7, 7]);
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        if (x === 0 || x === 6 || z === 0 || z === 6) {
          for (let y = 0; y < 7; y++) push(x, y, z, y === 6 ? m('brick') : m('blackstone'));
        } else {
          push(x, 0, z, m('brick'));
        }
      }
    }
    push(3, 1, 3, m('gold'));
    slot(3, 0, 0, WALKWAY_SLOT, null, 'north');
    return { size, palette, blocks, entities: [] };
  }

  throw new Error('unknown bastion part ' + kind);
}

/** Pools. The bridge is the start; walkways chain; the rooms and the rampart attach to a walkway's sides. */
export function createBastionPools(materials = BASTION_MATERIALS) {
  const pools = new TemplatePoolRegistry();
  const element = (kind, weight = 1) => new PoolElement({
    name: kind,
    weight,
    build: () => ({
      connectors: buildBastionPart(kind, materials).blocks
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
  pools.register(new TemplatePool({ id: 'bastion/starts', elements: [element('bridge', 1)] }));
  pools.register(new TemplatePool({ id: WALKWAY_POOL, elements: [element('walkway', 1)] }));
  pools.register(new TemplatePool({
    id: SEGMENT_POOL,
    elements: [element('housing', 3), element('stable', 2), element('treasure', 1)]
  }));
  return pools;
}

function buildPiece(element, rotation, mirror, at, materials) {
  const template = new StructureTemplate(buildBastionPart(element.name, materials), 'minecraft:bastion/' + element.name);
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

export function generateBastion({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 6;
  const originZ = chunkZ * 16 + 6;
  // A bastion FLOATS: its Y comes from the random band, never from the terrain, which is the documented
  // behaviour (MC-179796) and why this structure carries no terrain adaptation.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const [minY, maxY] = BASTION_Y_RANGE;
  const y = minY + random.nextIntBound(maxY - minY + 1);
  const pools = createBastionPools();

  const result = addPieces({
    random,
    startPool: pools.resolve('bastion/starts'),
    pools,
    buildPiece: (element, rotation, mirror, at) => buildPiece(element, rotation, mirror, at, BASTION_MATERIALS),
    maxDepth: BASTION_MAX_DEPTH,
    origin: { x: originX, y, z: originZ },
    maxDistanceFromCentre: BASTION_MAX_DISTANCE
  });

  const start = new StructureStart({
    structureId: 'bastion_remnant',
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
    floats: true,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizeBastion(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const chests = [];
  let written = 0;

  for (const piece of start.pieces) {
    const kind = piece.meta.element;
    const template = new StructureTemplate(buildBastionPart(kind, BASTION_MATERIALS), 'minecraft:bastion/' + kind);
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
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room bastion parts; the height band is an approximation, and it floats by design'
  };
}
