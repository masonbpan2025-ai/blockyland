// Villages: five ids, one generator, and the first MULTI-DEPTH structure.
//
// From the wiki (`Village`, 1.21.4 revision): five ids differing only in their materials; a THREE-level pool
// graph (a town centre opens streets, streets chain into more streets and offer houses and termini on their
// sides, and the village stops at `max_depth`); `beard_thin` terrain adaptation; loot chests per biome.
//
// PROVENANCE: no Minecraft assets. Every part is built by code from the described shape, so the LAYOUT is a
// clean-room approximation while the pool graph, multi-depth expansion, connector joining and adaptation are
// the engine's real behaviour.
//
// ORIENTATIONS ARE NOT BUILT BY HAND HERE. The parts state a jigsaw's front and top, and every transformed
// orientation comes from `StructureTemplate.jigsaws(rotation, mirror)`. Hand-rolling that transform is what
// cost four rounds in `structureJigsawChains.test.js`: the encoding is `<front>_<top>` (`up_north` FRONTS
// NORTH), and a connector's orientation must rotate with its piece because the engine expands through it.

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const VILLAGE_BIOMES = {
  village_plains: { biome: 'plains', path: 'minecraft:dirt_path', wall: 'minecraft:oak_planks', log: 'minecraft:oak_log', roof: 'minecraft:oak_stairs', foundation: 'minecraft:cobblestone', centre: 'minecraft:bell', loot: 'minecraft:chests/village/village_plains_house' },
  village_desert: { biome: 'desert', path: 'minecraft:sandstone', wall: 'minecraft:cut_sandstone', log: 'minecraft:sandstone', roof: 'minecraft:sandstone_stairs', foundation: 'minecraft:sandstone', centre: 'minecraft:bell', loot: 'minecraft:chests/village/village_desert_house' },
  village_savanna: { biome: 'savanna', path: 'minecraft:dirt_path', wall: 'minecraft:acacia_planks', log: 'minecraft:acacia_log', roof: 'minecraft:acacia_stairs', foundation: 'minecraft:cobblestone', centre: 'minecraft:bell', loot: 'minecraft:chests/village/village_savanna_house' },
  village_snowy: { biome: 'snowy_plains', path: 'minecraft:snow_block', wall: 'minecraft:spruce_planks', log: 'minecraft:spruce_log', roof: 'minecraft:spruce_stairs', foundation: 'minecraft:cobblestone', centre: 'minecraft:bell', loot: 'minecraft:chests/village/village_snowy_house' },
  village_taiga: { biome: 'taiga', path: 'minecraft:dirt_path', wall: 'minecraft:spruce_planks', log: 'minecraft:spruce_log', roof: 'minecraft:spruce_stairs', foundation: 'minecraft:cobblestone', centre: 'minecraft:bell', loot: 'minecraft:chests/village/village_taiga_house' }
};

export const VILLAGE_MAX_DEPTH = 6;
export const VILLAGE_MAX_DISTANCE = 112;
export const STREET_SLOT = 'village/street';
export const HOUSE_SLOT = 'village/house';
export const STREET_POOL = 'village/streets';
export const HOUSE_POOL = 'village/houses';

export function buildVillagePart(kind, materials) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map();
  const material = (name) => {
    if (!index.has(name)) { index.set(name, palette.length); palette.push({ Name: name }); }
    return index.get(name);
  };
  const jigsawState = (front, top) => {
    const orientation = front + '_' + top; // vanilla's order: `up_north` fronts north
    const key = 'jigsaw:' + orientation;
    if (!index.has(key)) { index.set(key, palette.length); palette.push({ Name: 'minecraft:jigsaw', Properties: { orientation } }); }
    return index.get(key);
  };
  const blocks = [];
  let declared = [0, 0, 0];
  const declare = (size) => { declared = size; return size; };
  // A block outside the declared size is written OUTSIDE the piece box, which breaks chunk clipping and makes
  // the plan's advertised box a lie, so it is an error rather than a silent extra block.
  const push = (x, y, z, state, nbt = null) => {
    const [sx, sy, sz] = declared;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
      throw new Error('village ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const slot = (x, y, z, name, pool, front, top = 'up', finalState = null) => {
    const nbt = { name, pool, orientation: front + '_' + top, joint: 'aligned', target: 'minecraft:empty' };
    if (finalState) nbt.final_state = finalState;
    push(x, y, z, jigsawState(front, top), nbt);
  };
  const m = (key) => material(materials[key]);

  if (kind === 'town_centre') {
    const size = declare([7, 2, 7]);
    for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) push(x, 0, z, m('path'));
    push(3, 1, 3, m('centre'));
    slot(3, 0, 0, STREET_SLOT, STREET_POOL, 'north');
    slot(3, 0, 6, STREET_SLOT, STREET_POOL, 'south');
    slot(0, 0, 3, STREET_SLOT, STREET_POOL, 'west');
    slot(6, 0, 3, STREET_SLOT, STREET_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'street') {
    // A street offers the street slot at BOTH ends -- so the chain continues and the depth limit is what stops
    // it -- plus a house slot on each side. Two connectors share the street slot's name, which is the case the
    // engine could not represent before deviation 0e was fixed.
    const size = declare([3, 1, 9]);
    for (let x = 0; x < 3; x++) for (let z = 0; z < 9; z++) push(x, 0, z, m('path'));
    slot(1, 0, 0, STREET_SLOT, STREET_POOL, 'north');
    slot(1, 0, 8, STREET_SLOT, STREET_POOL, 'south');
    slot(0, 0, 4, HOUSE_SLOT, HOUSE_POOL, 'west');
    slot(2, 0, 4, HOUSE_SLOT, HOUSE_POOL, 'east');
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'house_small' || kind === 'house_large') {
    const wide = kind === 'house_large' ? 7 : 5;
    const tall = kind === 'house_large' ? 5 : 4;
    const size = declare([wide, tall, wide]);
    const doorX = Math.floor(wide / 2);
    for (let x = 0; x < wide; x++) for (let z = 0; z < wide; z++) push(x, 0, z, m('foundation'));
    for (let y = 1; y < tall - 1; y++) {
      for (let x = 0; x < wide; x++) {
        for (let z = 0; z < wide; z++) {
          const edge = x === 0 || x === wide - 1 || z === 0 || z === wide - 1;
          if (!edge) continue;
          if (z === 0 && (x === doorX || x === doorX - 1) && y <= 2) continue; // doorway faces the connector
          push(x, y, z, m('wall'));
        }
      }
    }
    for (let x = 0; x < wide; x++) for (let z = 0; z < wide; z++) push(x, tall - 1, z, m('roof'));
    // Loot chests, with their tables on the block entity as in every other structure here.
    blocks.push({ pos: [1, 1, 1], state: material('minecraft:chest'), nbt: { id: 'minecraft:chest', LootTable: materials.loot } });
    if (kind === 'house_large') {
      blocks.push({ pos: [wide - 2, 1, wide - 2], state: material('minecraft:chest'), nbt: { id: 'minecraft:chest', LootTable: materials.loot } });
    }
    slot(doorX, 0, 0, HOUSE_SLOT, null, 'north', 'up', materials.wall);
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'farm') {
    const size = declare([7, 2, 7]);
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        const edge = x === 0 || x === 6 || z === 0 || z === 6;
        push(x, 0, z, edge ? m('log') : m('path'));
        if (!edge && (x + z) % 2 === 0) push(x, 1, z, m('log'));
      }
    }
    slot(3, 0, 0, HOUSE_SLOT, null, 'north', 'up', materials.path);
    return { size, palette, blocks, entities: [] };
  }

  if (kind === 'terminus') {
    // A street end. It deliberately offers NO street slot, which is what stops a village being an endless line.
    const size = declare([3, 3, 5]);
    for (let x = 0; x < 3; x++) for (let z = 0; z < 5; z++) push(x, 0, z, m('path'));
    for (let y = 1; y <= 2; y++) { push(0, y, 4, m('log')); push(2, y, 4, m('log')); }
    slot(1, 0, 0, STREET_SLOT, null, 'north', 'up', materials.path);
    return { size, palette, blocks, entities: [] };
  }

  throw new Error('unknown village part ' + kind);
}

/** Pools, built per biome so every element carries that village's materials. */
export function createVillagePools(materials) {
  const pools = new TemplatePoolRegistry();
  const element = (kind, weight = 1) => new PoolElement({
    name: kind,
    weight,
    build: () => ({
      connectors: buildVillagePart(kind, materials).blocks
        .filter((block) => block.nbt && Object.prototype.hasOwnProperty.call(block.nbt, 'pool'))
        .map((block) => ({
          name: block.nbt.name,
          pool: block.nbt.pool,
          orientation: block.nbt.orientation,
          joint: block.nbt.joint,
          finalState: block.nbt.final_state ?? null,
          local: { x: block.pos[0], y: block.pos[1], z: block.pos[2] }
        }))
    })
  });
  pools.register(new TemplatePool({ id: 'village/town_centres', elements: [element('town_centre', 1)] }));
  pools.register(new TemplatePool({ id: STREET_POOL, elements: [element('street', 1)] }));
  pools.register(new TemplatePool({
    id: HOUSE_POOL,
    elements: [element('house_small', 3), element('house_large', 2), element('farm', 2), element('terminus', 1)]
  }));
  return pools;
}

/** A piece's box and its world-space connectors, taken from the template layer rather than hand-transformed. */
function buildPiece(element, rotation, mirror, at, materials) {
  const template = new StructureTemplate(buildVillagePart(element.name, materials), 'minecraft:village/' + element.name);
  const box = template.boundingBox(at, rotation, mirror);
  const connectors = template.jigsaws(rotation, mirror).map((jigsaw) => ({
    name: jigsaw.name,
    pool: jigsaw.pool,
    orientation: jigsaw.orientation,
    joint: jigsaw.joint,
    finalState: jigsaw.finalState,
    position: { x: at.x + jigsaw.local.x, y: at.y + jigsaw.local.y, z: at.z + jigsaw.local.z }
  }));
  return { box, connectors };
}

export function generateVillage({ seed, chunkX, chunkZ, structureId, context }) {
  const spec = VILLAGE_BIOMES[structureId];
  if (!spec) throw new Error(structureId + ' is not a village id');
  const originX = chunkX * 16 + 2;
  const originZ = chunkZ * 16 + 2;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const pools = createVillagePools(spec);

  const result = addPieces({
    random,
    startPool: pools.resolve('village/town_centres'),
    pools,
    buildPiece: (element, rotation, mirror, at) => buildPiece(element, rotation, mirror, at, spec),
    maxDepth: VILLAGE_MAX_DEPTH,
    origin: { x: originX, y: surface, z: originZ },
    maxDistanceFromCentre: VILLAGE_MAX_DISTANCE
  });

  const start = new StructureStart({
    structureId,
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
    biomeVariant: spec.biome,
    partMix: result.pieces.map((piece) => piece.meta.element)
  };
  return start;
}

export function realizeVillage(start, setBlock, blockIds, { spawnMob = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const spec = VILLAGE_BIOMES[start.structureId];
  const missingBlocks = new Set();
  const chests = [];
  let written = 0;

  for (const piece of start.pieces) {
    const kind = piece.meta.element;
    const template = new StructureTemplate(buildVillagePart(kind, spec), 'minecraft:village/' + kind);
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
    if (spawnMob && kind === 'town_centre') {
      // Villagers are ambient population rather than structure blocks: one is placed as a marker at the centre
      // and the rest is left to the mob system, which is recorded rather than faked with extra entities.
      spawnMob('villager', origin.x + 3.5, origin.y + 1, origin.z + 3.5, { persistent: true });
    }
  }

  return {
    written,
    pieces: start.pieces.length,
    chests: chests.length,
    chestLoot: chests,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room village parts; villagers are ambient population, so only the centre is marked'
  };
}
