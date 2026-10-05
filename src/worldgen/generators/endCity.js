// End city: a tower of rooms, an optional bridge, and at most one ship.
//
// From the wiki (`End City`, 1.21.4 revision) and this repository's registry entry (recorded in round 1):
// generated on the outer End islands (`end_midlands`, `end_highlands`), built from end stone and purpur, and
// with two PUBLISHED probabilities rather than approximations -- a 50% bridge chance and a 12.5% ship chance,
// with AT MOST ONE ship.
//
// PROVENANCE: no Minecraft assets. Rooms, bridge and ship are built by code from the described shapes, so the
// LAYOUT is a clean-room approximation while the probabilities, the multi-piece composition, chunk-safe
// realization and the loot are the engine's real behaviour. The registry marks this family `TEMPLATE`, but a
// tower is procedural here: the pseudo-template path lets it reuse the one realization pipeline, which is the
// same choice the desert pyramid and swamp hut made.
//
// APPROXIMATIONS, recorded rather than hidden: room sizes, the tower's room count and the ship's proportions
// are clean-room; loot-table ids are conventional because the wiki publishes `{{LootChest}}` keys.
//
// TWO PROPERTIES ARE WORTH THE TEST BUDGET: the ship is capped at ONE however the rolls fall, and the bridge
// and ship are SEPARATE PIECES rather than part of the tower, so each has its own box and its own chunk
// footprint.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

export const END_CITY_MATERIALS = {
  stone: 'minecraft:end_stone',
  brick: 'minecraft:end_stone_bricks',
  purpur: 'minecraft:purpur_block',
  pillar: 'minecraft:purpur_pillar',
  stairs: 'minecraft:purpur_stairs',
  slab: 'minecraft:purpur_slab',
  rod: 'minecraft:end_rod',
  glass: 'minecraft:magenta_stained_glass',
  chest: 'minecraft:chest',
  loot: 'minecraft:chests/end_city_treasure'
};

/** The two published probabilities. At most ONE ship, however the rolls fall. */
export const BRIDGE_CHANCE = 0.5;
export const SHIP_CHANCE = 0.125;
export const MAX_SHIPS = 1;
export const ROOM_SIZE = [5, 4, 5];
export const ROOM_COUNT_RANGE = [3, 6];

/**
 * Build one piece of the city as a pseudo-template.
 *
 * @param {object} options
 * @param {'tower'|'bridge'|'ship'} options.kind
 * @param {number} [options.rooms]  rooms in a tower
 * @param {number} [options.length] bridge length
 */
export function buildEndCityPart({ kind = 'tower', rooms = 4, length = 9 } = {}) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map();
  const material = (name) => {
    if (!index.has(name)) { index.set(name, palette.length); palette.push({ Name: name }); }
    return index.get(name);
  };
  const blocks = [];
  let declared = [0, 0, 0];
  const declare = (size) => { declared = size; return size; };
  // A block outside the declared size would be written outside the piece box: a plan whose advertised box is a
  // lie, and a chunk-clipping hazard. It is an error, not a silent extra block.
  const push = (x, y, z, state, nbt = null) => {
    const [sx, sy, sz] = declared;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
      throw new Error('end city ' + kind + ': block ' + x + ',' + y + ',' + z + ' is outside ' + declared.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const m = (key) => material(END_CITY_MATERIALS[key]);

  if (kind === 'tower') {
    const [wide, tall, deep] = ROOM_SIZE;
    const count = Math.max(ROOM_COUNT_RANGE[0], Math.min(ROOM_COUNT_RANGE[1], Math.trunc(rooms)));
    const size = declare([wide, tall * count + 2, deep]);
    for (let room = 0; room < count; room++) {
      const base = room * tall;
      // Floor, then a ring of walls with windows, then the ceiling that is the next room's floor.
      for (let x = 0; x < wide; x++) {
        for (let z = 0; z < deep; z++) push(x, base, z, (x + z) % 2 === 0 ? m('brick') : m('purpur'));
      }
      for (let y = 1; y < tall; y++) {
        for (let x = 0; x < wide; x++) {
          for (let z = 0; z < deep; z++) {
            const edge = x === 0 || x === wide - 1 || z === 0 || z === deep - 1;
            if (!edge) continue;
            // Windows are what make an End tower read as a tower rather than a box.
            const window = y === 2 && (x + z) % 3 === 0;
            push(x, base + y, z, window ? m('glass') : y === tall - 1 ? m('brick') : m('pillar'));
          }
        }
      }
      // A doorway on one side per room, and an end rod for light.
      push(2, base + 1, 0, m('air'));
      push(2, base + tall - 1, 2, m('rod'));
    }
    // The top room's treasure, which is the reason to climb.
    const top = tall * count;
    blocks.push({ pos: [2, top - 1, 2], state: material(END_CITY_MATERIALS.chest), nbt: { id: 'minecraft:chest', LootTable: END_CITY_MATERIALS.loot } });
    // A cap so the tower is closed.
    for (let x = 0; x < wide; x++) for (let z = 0; z < deep; z++) push(x, top + 1 <= declared[1] - 1 ? top + 1 : top, z, m('slab'));
    return { size, palette, blocks, entities: [], meta: { kind, rooms: count } };
  }

  if (kind === 'bridge') {
    const span = Math.max(5, Math.trunc(length));
    const size = declare([3, 3, span]);
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < span; z++) {
        push(x, 0, z, m('purpur'));
        if (x === 0 || x === 2) { push(x, 1, z, m('brick')); push(x, 2, z, m('brick')); }
      }
    }
    push(1, 2, 0, m('rod'));
    return { size, palette, blocks, entities: [], meta: { kind, length: span } };
  }

  if (kind === 'ship') {
    // A purpur hull with a mast, a hold, and the treasure chest that carries the elytra table.
    const hull = 13;
    const beam = 7;
    const size = declare([beam, 10, hull]);
    for (let z = 0; z < hull; z++) {
      const taper = z < 2 || z >= hull - 2 ? 1 : 0;
      for (let x = taper; x < beam - taper; x++) {
        push(x, 0, z, m('purpur'));
        const edge = x === taper || x === beam - 1 - taper;
        if (edge) { push(x, 1, z, m('brick')); push(x, 2, z, m('brick')); }
      }
    }
    for (let z = 2; z < hull - 2; z++) push(3, 3, z, m('slab'));
    push(3, 3, 6, m('pillar'));
    for (let y = 4; y < 9; y++) push(3, y, 6, m('pillar'));
    push(3, 8, 6, m('brick'));
    blocks.push({ pos: [3, 1, 9], state: material(END_CITY_MATERIALS.chest), nbt: { id: 'minecraft:chest', LootTable: END_CITY_MATERIALS.loot } });
    for (const z of [4, 8]) push(1, 3, z, m('rod'));
    return { size, palette, blocks, entities: [], meta: { kind } };
  }

  throw new Error('unknown end city part ' + kind);
}

export function generateEndCity({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 5;
  const originZ = chunkZ * 16 + 5;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);

  // Fixed draw order: room count, bridge roll, ship roll. Adding a draw later must not shift these.
  const rooms = ROOM_COUNT_RANGE[0] + random.nextIntBound(ROOM_COUNT_RANGE[1] - ROOM_COUNT_RANGE[0] + 1);
  const hasBridge = random.nextFloat() < BRIDGE_CHANCE;
  const hasShip = random.nextFloat() < SHIP_CHANCE;
  const bridgeLength = 7 + random.nextIntBound(7);

  const pieces = [];
  const towerParams = { kind: 'tower', rooms };
  const tower = new StructureTemplate(buildEndCityPart(towerParams), 'minecraft:end_city/tower');
  pieces.push(new StructurePiece({
    id: 'minecraft:end_city/tower',
    index: 0,
    type: 'template',
    family: 'template',
    template: tower.name,
    box: tower.boundingBox({ x: originX, y: surface, z: originZ }, 0),
    meta: { origin: { x: originX, y: surface, z: originZ }, params: towerParams }
  }));

  if (hasBridge) {
    const bridgeParams = { kind: 'bridge', length: bridgeLength };
    const bridge = new StructureTemplate(buildEndCityPart(bridgeParams), 'minecraft:end_city/bridge');
    // The bridge leaves the tower's third room, so it sits a few blocks above the surface.
    const origin = { x: originX + 5, y: surface + ROOM_SIZE[1] * 2, z: originZ + 1 };
    pieces.push(new StructurePiece({
      id: 'minecraft:end_city/bridge',
      index: 1,
      type: 'template',
      family: 'template',
      template: bridge.name,
      box: bridge.boundingBox(origin, 0),
      meta: { origin, params: bridgeParams }
    }));
  }

  if (hasShip) {
    const shipParams = { kind: 'ship' };
    const ship = new StructureTemplate(buildEndCityPart(shipParams), 'minecraft:end_city/ship');
    const origin = { x: originX + 12, y: surface + 8, z: originZ + 12 };
    pieces.push(new StructurePiece({
      id: 'minecraft:end_city/ship',
      index: pieces.length,
      type: 'template',
      family: 'template',
      template: ship.name,
      box: ship.boundingBox(origin, 0),
      meta: { origin, params: shipParams }
    }));
  }

  const start = new StructureStart({
    structureId: 'end_city',
    chunkX,
    chunkZ,
    pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = {
    rooms,
    hasBridge,
    hasShip,
    // At most one ship, whatever the roll: the cap is asserted rather than assumed.
    ships: pieces.filter((piece) => piece.meta.params.kind === 'ship').length,
    pieces: pieces.length,
    y: surface
  };
  return start;
}

export function realizeEndCity(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const chests = [];
  let written = 0;

  for (const piece of start.pieces) {
    const template = new StructureTemplate(buildEndCityPart(piece.meta.params), piece.template);
    const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(piece.index) * 2654435761n);
    const placement = placeTemplate({
      template,
      origin: piece.meta.origin,
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
    note: 'clean-room tower, bridge and ship; the room count and proportions are approximations'
  };
}
