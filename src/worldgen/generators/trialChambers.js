// Trial chambers: an underground copper-and-tuff structure that chains VERTICALLY as well as horizontally.
//
// From the wiki (`Trial Chambers`, 1.21.4 revision) and the entry already in this repository's registry:
// generated underground in any Overworld biome (the gate is a tag with no explicit biome list); built from
// deepslate, tuff and copper family blocks; contains trial spawners, vaults and copper bulbs; and carries
// `terrain_adaptation: encapsulate`, which is what seals its rooms off from the caves they would otherwise
// open into.
//
// What this structure adds that no earlier one did: a STAIRCASE part whose connector faces UP, so the pool
// graph grows vertically. The engine has handled a vertical join since the pillager outpost's tower, but
// nothing until now has CHAINED through one.
//
// PROVENANCE: no Minecraft assets. Parts are built by code from the described materials and rooms, so the
// LAYOUT is a clean-room approximation while the pool graph, vertical and horizontal chaining, connector
// joining and `encapsulate` adaptation are the engine's real behaviour.
//
// APPROXIMATIONS, recorded rather than hidden: the depth band and room sizes are not published in a form I
// could verify, so they are clean-room values; loot-table ids are conventional because the wiki publishes
// `{{LootChest}}` keys rather than namespaced ids.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const TRIAL_MATERIALS = {
  brick: 'minecraft:tuff_bricks',
  polished: 'minecraft:polished_tuff',
  chiseled: 'minecraft:chiseled_tuff',
  deepslate: 'minecraft:deepslate_bricks',
  tiles: 'minecraft:deepslate_tiles',
  copper: 'minecraft:copper_block',
  oxidized: 'minecraft:oxidized_copper',
  cut: 'minecraft:cut_copper',
  grate: 'minecraft:copper_grate',
  bulb: 'minecraft:copper_bulb',
  spawner: 'minecraft:trial_spawner',
  vault: 'minecraft:vault',
  chest: 'minecraft:chest',
  gravel: 'minecraft:gravel'
};

/** The depth band. The wiki does not publish the trial chambers' height range in a verifiable form. */
export const TRIAL_Y_RANGE = [-24, -8];
export const TRIAL_MAX_DEPTH = 6;
export const TRIAL_MAX_DISTANCE = 80;
export const CORRIDOR_SLOT = 'trial/corridor';
export const ROOM_SLOT = 'trial/room';
export const CORRIDOR_POOL = 'trial/corridors';
export const ROOM_POOL = 'trial/rooms';

export function buildTrialPart(kind, materials = TRIAL_MATERIALS) {
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
      throw new Error('trial ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const slot = (x, y, z, name, pool, front, top = 'up') => {
    push(x, y, z, jigsawState(front, top), { name, pool, orientation: front + '_' + top, joint: 'aligned', target: 'minecraft:empty' });
  };
  const m = (key) => material(materials[key]);
  /** A hollow box: floor, walls and ceiling, with the walls left open where a door is wanted. */
  const shell = (sx, sy, sz, floor, wall, ceiling, doorX, doorZ) => {
    for (let x = 0; x < sx; x++) {
      for (let z = 0; z < sz; z++) {
        const edge = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;
        push(x, 0, z, floor);
        for (let y = 1; y < sy - 1; y++) {
          if (!edge) continue;
          if (z === 0 && x === doorX && y <= 2) continue;
          if (z === sz - 1 && x === doorZ && y <= 2) continue;
          push(x, y, z, wall);
        }
        push(x, sy - 1, z, ceiling);
      }
    }
  };

  if (kind === 'corridor') {
    // Three lanes wide and long, with a corridor slot at each end, a room slot on each side, and copper bulbs
    // for light. Two connectors share the corridor slot's name, which deviation 0e blocked until the
    // per-instance fix.
    const size = declare([5, 5, 13]);
    shell(5, 5, 13, m('brick'), m('polished'), m('brick'), 2, 2);
    for (const z of [3, 9]) push(0, 3, z, m('bulb'));
    push(2, 3, 6, m('grate'));
    slot(2, 0, 0, CORRIDOR_SLOT, CORRIDOR_POOL, 'north');
    slot(2, 0, 12, CORRIDOR_SLOT, CORRIDOR_POOL, 'south');
    slot(0, 0, 6, ROOM_SLOT, ROOM_POOL, 'west');
    slot(4, 0, 6, ROOM_SLOT, ROOM_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'corridor_corner') {
    const size = declare([7, 5, 7]);
    shell(7, 5, 7, m('brick'), m('polished'), m('brick'), 3, 3);
    push(0, 3, 3, m('bulb'));
    slot(3, 0, 0, CORRIDOR_SLOT, CORRIDOR_POOL, 'north');
    slot(6, 0, 3, CORRIDOR_SLOT, CORRIDOR_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'staircase') {
    // The vertical link: four steps up over four blocks, with the exit connector facing UP so the next
    // corridor is placed a level above this one. This is the only part in the repository that chains upward.
    const size = declare([5, 9, 9]);
    for (let z = 0; z < 9; z++) {
      const step = Math.min(4, Math.floor(z / 2));
      for (let x = 0; x < 5; x++) {
        push(x, step, z, m('brick'));
        for (let y = step + 1; y < 9; y++) {
          const edge = x === 0 || x === 4 || z === 0 || z === 8;
          if (edge) push(x, y, z, y === 8 ? m('tiles') : m('deepslate'));
        }
      }
      push(0, step + 1, z, m('cut'));
    }
    slot(2, 0, 0, CORRIDOR_SLOT, CORRIDOR_POOL, 'north');
    slot(2, 4, 8, CORRIDOR_SLOT, CORRIDOR_POOL, 'up');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'room_small' || kind === 'room_large') {
    const wide = kind === 'room_large' ? 13 : 9;
    const tall = kind === 'room_large' ? 7 : 5;
    const size = declare([wide, tall, wide]);
    shell(wide, tall, wide, m('brick'), m('polished'), m('tiles'), Math.floor(wide / 2), Math.floor(wide / 2));
    // A trial spawner in the middle and a vault in a corner: the two blocks that make a trial chamber a trial
    // chamber, placed as block entities rather than as decoration.
    blocks.push({
      pos: [Math.floor(wide / 2), 1, Math.floor(wide / 2)],
      state: material(materials.spawner),
      nbt: { id: 'minecraft:trial_spawner', TrialSpawnerState: 'waiting_for_players' }
    });
    for (const y of [1, 2]) push(1, y, wide - 2, m('chiseled'));
    blocks.push({
      pos: [wide - 2, 1, wide - 2],
      state: material(materials.vault),
      nbt: { id: 'minecraft:vault', ominous: 0, LootTable: 'minecraft:chests/trial_chambers/reward' }
    });
    push(1, 1, 1, m('oxidized'));
    push(wide - 2, 1, 1, m('copper'));
    slot(Math.floor(wide / 2), 0, 0, ROOM_SLOT, null, 'north');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'intersection') {
    // Four ways out plus a vault: the junction a trial chamber's corridors meet at.
    const size = declare([9, 6, 9]);
    shell(9, 6, 9, m('brick'), m('polished'), m('brick'), 4, 4);
    push(4, 4, 4, m('chiseled'));
    blocks.push({
      pos: [4, 1, 4],
      state: material(materials.vault),
      nbt: { id: 'minecraft:vault', ominous: 0, LootTable: 'minecraft:chests/trial_chambers/reward_ominous' }
    });
    slot(4, 0, 0, CORRIDOR_SLOT, CORRIDOR_POOL, 'north');
    slot(4, 0, 8, CORRIDOR_SLOT, CORRIDOR_POOL, 'south');
    slot(0, 0, 4, CORRIDOR_SLOT, CORRIDOR_POOL, 'west');
    slot(8, 0, 4, CORRIDOR_SLOT, CORRIDOR_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  throw new Error('unknown trial chamber part ' + kind);
}

export function createTrialPools(materials = TRIAL_MATERIALS) {
  const pools = new TemplatePoolRegistry();
  const element = (kind, weight = 1) => new PoolElement({
    name: kind,
    weight,
    build: () => ({
      connectors: buildTrialPart(kind, materials).blocks
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
  pools.register(new TemplatePool({ id: 'trial/starts', elements: [element('corridor', 1)] }));
  pools.register(new TemplatePool({
    id: CORRIDOR_POOL,
    elements: [element('corridor', 3), element('corridor_corner', 2), element('staircase', 1), element('intersection', 1)]
  }));
  pools.register(new TemplatePool({
    id: ROOM_POOL,
    elements: [element('room_small', 3), element('room_large', 1)]
  }));
  return pools;
}

function buildPiece(element, rotation, mirror, at, materials) {
  const template = new StructureTemplate(buildTrialPart(element.name, materials), 'minecraft:trial_chambers/' + element.name);
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

export function generateTrialChambers({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 8;
  const originZ = chunkZ * 16 + 8;
  // Underground, so the Y comes from the random band rather than from the terrain height.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const [minY, maxY] = TRIAL_Y_RANGE;
  const y = minY + random.nextIntBound(maxY - minY + 1);
  const pools = createTrialPools();

  const result = addPieces({
    random,
    startPool: pools.resolve('trial/starts'),
    pools,
    buildPiece: (element, rotation, mirror, at) => buildPiece(element, rotation, mirror, at, TRIAL_MATERIALS),
    maxDepth: TRIAL_MAX_DEPTH,
    origin: { x: originX, y, z: originZ },
    maxDistanceFromCentre: TRIAL_MAX_DISTANCE
  });

  const start = new StructureStart({
    structureId: 'trial_chambers',
    chunkX,
    chunkZ,
    pieces: result.pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  const levels = new Set(result.pieces.map((piece) => piece.box.minY));
  start.meta = {
    pieces: result.pieces.length,
    maxDepth: Math.max(0, ...result.pieces.map((piece) => piece.meta.depth ?? 0)),
    diagnostics: result.diagnostics,
    connected: result.isConnected(),
    levels: levels.size,
    y,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizeTrialChambers(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const blockEntities = [];
  let written = 0;

  for (const piece of start.pieces) {
    const kind = piece.meta.element;
    const template = new StructureTemplate(buildTrialPart(kind, TRIAL_MATERIALS), 'minecraft:trial_chambers/' + kind);
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
      // Trial spawners and vaults are BLOCK ENTITIES with data that matters, so they are reported rather than
      // passed as anonymous blocks: a chamber whose spawner has no state is not a trial chamber.
      if (block.nbt?.id) blockEntities.push({ kind: block.nbt.id, x: block.x, y: block.y, z: block.z });
      if (setBlock(block.x, block.y, block.z, id, {
        state: block.state,
        ...(block.nbt?.LootTable ? { lootTable: block.nbt.LootTable } : {}),
        ...(block.nbt?.id ? { blockEntity: block.nbt.id } : {})
      })) written++;
    }
  }

  return {
    written,
    pieces: start.pieces.length,
    blockEntities,
    spawners: blockEntities.filter((entry) => entry.kind === 'minecraft:trial_spawner').length,
    vaults: blockEntities.filter((entry) => entry.kind === 'minecraft:vault').length,
    levels: new Set(start.pieces.map((piece) => piece.box.minY)).size,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room rooms; the depth band and room sizes are approximations'
  };
}
