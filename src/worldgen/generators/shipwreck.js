// Shipwreck: the first structure with more than one piece and a decay processor.
//
// From the wiki (`Shipwreck`, 1.21.4 revision):
//   * 20 templates: three orientations (rightsideup, sideways, upsidedown) each in intact and degraded
//     form, plus `with_mast` variants -- the registry has TWO ids, `shipwreck` (any ocean) and
//     `shipwreck_beached` (beach, snowy beach, with `is_beached` true);
//   * "up to 3 chests depending on intact sections: supply in the bow, treasure in the upper stern, map in
//     the lower stern. A shipwreck with >= 2 chests always contains its map chest";
//   * shipwrecks are found by dolphins and carry treasure maps.
//
// PROVENANCE: this repository ships no Minecraft assets, so the templates below are NOT vanilla's
// `shipwreck/*` files. They are a clean-room hull built from the described shape, length and chest rules.
//
// APPROXIMATIONS, stated in the file and in the parity matrix:
//   1. vanilla stores the three orientations as separate templates; here ONE hull is built and then
//      transformed (upside-down flips Y, sideways swaps Y and Z). Same intent, different mechanism.
//   2. the wiki publishes the chest *keys* (`shipwreck-supply`, ...) but not namespaced loot-table ids, so
//      the ids below are the conventional names and are recorded as such.
//   3. the mast is a flag here rather than a separate template.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

/** Vanilla's three hull orientations, and the intact/degraded pair. */
export const HULL_ORIENTATIONS = ['rightsideup', 'sideways', 'upsidedown'];
export const DECAY_STATES = ['full', 'degraded'];

/** Where the three chests sit, relative to the hull's length, and which loot key each carries. */
export const SHIPWRECK_CHESTS = [
  { name: 'supply', alongLength: 0.2, deck: 0, lootTable: 'minecraft:chests/shipwreck_supply' },
  { name: 'treasure', alongLength: 0.8, deck: 1, lootTable: 'minecraft:chests/shipwreck_treasure' },
  { name: 'map', alongLength: 0.8, deck: 0, lootTable: 'minecraft:chests/shipwreck_map' }
];

/**
 * Which chests a wreck with `count` intact sections carries.
 *
 * The wiki's rule is NOT "the first N of the list": "a shipwreck with >= 2 chests always contains its map
 * chest", and the treasure chest only appears when all three sections survive. Kept as one function
 * because the template and the plan metadata both need it, and computing it twice let them disagree --
 * which is how the two-chest-no-map bug appeared.
 */
export function selectShipwreckChests(count) {
  const wanted = Math.max(1, Math.min(SHIPWRECK_CHESTS.length, Math.trunc(count)));
  const [supplyChest, treasureChest, mapChest] = SHIPWRECK_CHESTS;
  const selected = [supplyChest];
  if (wanted >= 2) selected.push(mapChest);
  if (wanted >= 3) selected.push(treasureChest);
  return selected;
}

/**
 * Build a hull, then transform it into one of the three orientations.
 *
 * @param {object} options
 * @param {number} [options.length]  hull length in blocks
 * @param {'rightsideup'|'sideways'|'upsidedown'} [options.orientation]
 * @param {boolean} [options.mast]
 * @param {number} [options.chests]  how many chests to include, 1..3, bow first
 */
export function buildShipwreck({ length = 12, orientation = 'rightsideup', mast = false, chests = 3 } = {}) {
  const span = Math.max(6, Math.trunc(length));
  const width = 3;
  const height = 4;
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:oak_planks' },
    { Name: 'minecraft:spruce_planks' },
    { Name: 'minecraft:oak_fence' },
    { Name: 'minecraft:chest', Properties: { facing: 'north', waterlogged: 'false' } },
    { Name: 'minecraft:oak_log', Properties: { axis: 'y' } }
  ];
  const raw = [];
  const set = (x, y, z, state) => raw.push({ pos: [x, y, z], state });

  // Hull: a floor, two flanks, and a deck. The flanks taper at bow and stern, which is what makes it read
  // as a boat rather than a box.
  for (let x = 0; x < span; x++) {
    const taper = x < 2 || x >= span - 2 ? 1 : 0;
    for (let z = taper; z < width - taper; z++) set(x, 0, z, x % 3 === 0 ? 2 : 1);
    for (let y = 1; y < height; y++) {
      for (let z = taper; z < width - taper; z++) {
        const edge = z === taper || z === width - 1 - taper;
        if (edge) set(x, y, z, x % 3 === 0 ? 2 : 1);
      }
    }
    // Deck planks across the middle, leaving the holds open.
    if (x % 5 === 2) for (let z = 0; z < width; z++) set(x, height - 1, z, 1);
  }

  if (mast) {
    const mastX = Math.floor(span / 2);
    for (let y = height; y < height + 5; y++) set(mastX, y, 1, 5);
  }

  // Chests, in the documented order: supply in the bow, then the stern pair. A hull with only one chest
  // gets the supply chest, which is what the "at least two chests includes the map" rule presupposes.
  //
  // The loot table travels on the BLOCK's block entity, as it does in vanilla, rather than being assigned
  // by traversal order at realization time. Traversal order is not the bow-to-stern order, and decay can
  // drop a chest, so order-based assignment mislabels the survivors.
  // Chests follow the wiki's rule, which is NOT "the first N of the list": a wreck with two or more chests
  // ALWAYS includes its map chest, and the treasure chest only appears when all three sections survive.
  // Taking the first N entries instead produced a two-chest wreck with no map, which is exactly the case
  // the rule exists for.
  const selected = selectShipwreckChests(chests);
  for (const chest of selected) {
    const x = Math.min(span - 1, Math.max(0, Math.round(chest.alongLength * (span - 1))));
    const y = Math.min(height - 1, chest.deck + 1);
    raw.push({ pos: [x, y, 1], state: 4, nbt: { id: 'minecraft:chest', LootTable: chest.lootTable, name: chest.name } });
  }

  // Orientation: vanilla stores these as separate templates. One hull plus an axis transform is the same
  // intent with less data, and the size has to follow the transform or the piece box would be wrong.
  const scale = [span, height + (mast ? 5 : 0), width];
  const transformed = raw.map((block) => {
    const [x, y, z] = block.pos;
    if (orientation === 'upsidedown') return { pos: [x, scale[1] - 1 - y, z], state: block.state };
    if (orientation === 'sideways') return { pos: [x, z, y], state: block.state };
    return { pos: [x, y, z], state: block.state };
  });
  const size = orientation === 'sideways'
    ? [scale[0], scale[2], scale[1]]
    : [scale[0], scale[1], scale[2]];

  return { size, palette, blocks: transformed, entities: [], meta: { orientation, mast, chests: selected.length } };
}

export function generateShipwreck({ seed, chunkX, chunkZ, structureId, context }) {
  const originX = chunkX * 16 + 2;
  const originZ = chunkZ * 16 + 2;
  const beached = structureId === 'shipwreck_beached';
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, beached ? 'world_surface_wg' : 'ocean_floor_wg') : 60;

  // Fixed draw order: orientation, decay, length, mast, chests. Adding a draw later must not shift these.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const orientation = HULL_ORIENTATIONS[random.nextIntBound(HULL_ORIENTATIONS.length)];
  const decayed = random.nextFloat() < 0.5;
  const length = 8 + random.nextIntBound(9);
  const mast = random.nextFloat() < 0.25;
  // "Up to 3 chests depending on intact sections": a degraded wreck keeps fewer sections, so it keeps
  // fewer chests, and at least one is always present.
  const maxChests = decayed ? 1 + random.nextIntBound(2) : 1 + random.nextIntBound(3);
  const params = { length, orientation, mast, chests: maxChests };

  const template = new StructureTemplate(buildShipwreck(params), `minecraft:shipwreck/${orientation}`);
  const rotation = random.nextIntBound(4);
  const y = beached ? surface : Math.max(2, surface - height70(template));

  const processors = [{ processor_type: 'minecraft:jigsaw_replacement' }];
  // A degraded wreck is degraded by block_rot, which is the documented mechanism: blocks are dropped, and
  // the world's own blocks survive where they are dropped rather than becoming air.
  if (decayed) {
    processors.push({ processor_type: 'minecraft:block_rot', integrity: 0.75 });
    processors.push({ processor_type: 'minecraft:block_age', mossiness: 0.5 });
  }

  const piece = new StructurePiece({
    id: template.name,
    type: 'template',
    family: 'template',
    template: template.name,
    rotation,
    box: template.boundingBox({ x: originX, y, z: originZ }, rotation),
    meta: { origin: { x: originX, y, z: originZ }, params, processors: { processors }, loot: selectShipwreckChests(maxChests).map((chest) => chest.lootTable) }
  });

  const start = new StructureStart({
    structureId,
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { orientation, decayed, mast, chests: maxChests, beached, y };
  return start;
}

/** Half the hull's height, so a sunken wreck sits on the sea floor rather than on top of it. */
function height70(template) {
  return Math.floor(template.size[1] / 2);
}

export function realizeShipwreck(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const template = new StructureTemplate(buildShipwreck(piece.meta.params), piece.template);
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 15485863n + BigInt(start.chunkZ));
  const placement = placeTemplate({
    template,
    origin: piece.meta.origin,
    rotation: piece.rotation,
    mirror: piece.mirror,
    processors: piece.meta.processors,
    random,
    world: null
  });

  const chestId = resolver.resolve('minecraft:chest');
  const missingBlocks = new Set();
  let written = 0;
  let chests = 0;
  const chestLoot = [];
  const plannedLoot = new Set(piece.meta.loot);
  for (const block of placement.blocks) {
    const id = resolver.resolveState(block.state);
    if (id === null) { missingBlocks.add(block.state.name); continue; }
    const isChest = id === chestId;
    // The loot table comes from the block entity the template carries, so a chest keeps its identity even
    // when decay has removed its neighbours.
    const lootTable = isChest ? (block.nbt?.LootTable ?? null) : null;
    if (isChest) {
      chests++;
      if (lootTable) chestLoot.push(lootTable);
      if (lootTable && !plannedLoot.has(lootTable)) {
        throw new Error(`realized a chest with unplanned loot ${lootTable}`);
      }
    }
    if (setBlock(block.x, block.y, block.z, id, {
      state: block.state,
      ...(lootTable ? { lootTable, chestName: block.nbt?.name ?? null } : {})
    })) written++;
  }
  return {
    written,
    chests,
    chestLoot,
    plannedChests: piece.meta.loot.length,
    plannedLoot: piece.meta.loot,
    missingBlocks: [...missingBlocks].sort(),
    processorTypes: placement.processorTypes,
    note: 'clean-room hull; orientations are an axis transform rather than separate templates'
  };
}
