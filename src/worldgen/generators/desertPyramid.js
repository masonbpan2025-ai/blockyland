// Desert pyramid, built from the wiki's blueprint.
//
// Source: https://minecraft.wiki/w/Desert_Pyramid and its /Structure page (saved under docs/structure-audit/wiki/),
// whose layered blueprint (layers -14 to 10) is converted by scripts/generate-structure-blueprints.mjs. The drawing
// matches the page's materials table exactly (238 cut sandstone, 62 chiseled sandstone, 66 orange and 2 blue
// terracotta, 17 stairs, 2 slabs, 9 TNT, 4 chests, 1 stone pressure plate, ~2885 sandstone).
//
// What the drawing leaves to chance, from the page's notes, decided here with the structure's own random:
//   * red wool -- the 83 blocks buried in the cellar room: sand, 5 to 7 of them suspicious sand;
//   * green wool -- a pair: one sand, one sandstone;
//   * blue wool -- the 25 blocks of the cellar's collapsed roof: 33% sandstone, the rest sand, one suspicious sand.
// So a pyramid has 6 to 8 suspicious sand in all, as the page says.
//
// From the main page: desert only; 21x21 ground floor; a checkerboard wind rose of terracotta round a blue terracotta
// centre; below it a hidden room with four chests rigged by a stone pressure plate under the blue terracotta, wired
// to nine TNT; a 5x5 cellar room at the back, buried in sand, with suspicious sand (archaeology). The four chests use
// the desert pyramid loot table; suspicious sand uses the desert pyramid archaeology table.
//
// Not modelled: the foundation that extends down into a ravine below the pyramid.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';
import { STRUCTURE_BLUEPRINTS } from './structureBlueprintData.js';

const BLUEPRINT = STRUCTURE_BLUEPRINTS.desert_pyramid;

export const PYRAMID_BASE = 21;
/** The blueprint's layer 0 (the ground floor) is this many blocks above the template's bottom. */
export const PYRAMID_BASE_Y = -BLUEPRINT.minLayer;
export const PYRAMID_CHEST_LOOT = 'minecraft:chests/desert_pyramid';
export const PYRAMID_ARCHAEOLOGY_LOOT = 'minecraft:archaeology/desert_pyramid';
/** Kept for callers that list the four chests' tables: all four are the same table. */
export const PYRAMID_CHESTS = [PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT];

/** The pyramid as a template, its random blocks decided from `seed`. */
export function buildDesertPyramid({ seed = 0 } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 2862933555777941757n + 3037000493n);
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map([['minecraft:air', 0]]);
  const state = (name, props = null) => {
    const key = name + JSON.stringify(props ?? {});
    if (!index.has(key)) { index.set(key, palette.length); palette.push(props ? { Name: name, Properties: props } : { Name: name }); }
    return index.get(key);
  };
  const cells = BLUEPRINT.blocks.split(';').map((r) => r.split(',').map(Number)).map(([x, y, z, p]) => ({ x, y, z, entry: BLUEPRINT.palette[p] }));
  const plate = cells.find((c) => c.entry.Name === 'minecraft:stone_pressure_plate');
  const of = (name) => cells.filter((c) => c.entry.Name === name);
  const pick = (list, n) => {
    const pool = [...list];
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(random.nextIntBound(pool.length), 1)[0]);
    return out;
  };

  const special = new Map();
  // Cellar: sand, 5-7 of it suspicious.
  const cellar = of('minecraft:red_wool');
  for (const c of cellar) special.set(c, 'minecraft:sand');
  for (const c of pick(cellar, 5 + random.nextIntBound(3))) special.set(c, 'minecraft:suspicious_sand');
  // The pair: one sand and one sandstone.
  const pair = of('minecraft:green_wool');
  const sandFirst = random.nextBoolean();
  pair.forEach((c, i) => special.set(c, (i === 0) === sandFirst ? 'minecraft:sand' : 'minecraft:sandstone'));
  // Collapsed roof: 33% sandstone, the rest sand, then one suspicious sand.
  const roof = of('minecraft:blue_wool');
  for (const c of roof) special.set(c, random.nextFloat() < 0.33 ? 'minecraft:sandstone' : 'minecraft:sand');
  for (const c of pick(roof, 1)) special.set(c, 'minecraft:suspicious_sand');

  const blocks = [];
  for (const c of cells) {
    const name = special.get(c) ?? c.entry.Name;
    if (name === 'minecraft:chest') {
      // "Chest -- facing: pressure plate" (the blueprint's facing table).
      const dx = plate.x - c.x; const dz = plate.z - c.z;
      const facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
      blocks.push({ pos: [c.x, c.y, c.z], state: state(name, { facing }), nbt: { id: 'minecraft:chest', LootTable: PYRAMID_CHEST_LOOT } });
    } else if (name === 'minecraft:suspicious_sand') {
      blocks.push({ pos: [c.x, c.y, c.z], state: state(name), nbt: { id: 'minecraft:brushable_block', LootTable: PYRAMID_ARCHAEOLOGY_LOOT } });
    } else {
      blocks.push({ pos: [c.x, c.y, c.z], state: special.has(c) ? state(name) : state(name, c.entry.Properties ?? null) });
    }
  }
  return { size: BLUEPRINT.size, palette, blocks, entities: [], meta: { seed } };
}

export function generateDesertPyramid({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16;
  const originZ = chunkZ * 16;
  const centreX = originX + Math.floor(PYRAMID_BASE / 2);
  const centreZ = originZ + Math.floor(PYRAMID_BASE / 2);
  const surface = context.surfaceY ? context.surfaceY(centreX, centreZ, 'world_surface_wg') : 70;
  // The ground floor (blueprint layer 0) replaces the top layer of sand.
  const y = surface - PYRAMID_BASE_Y;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const rotation = random.nextIntBound(4); // the entrance faces a random direction
  const params = { seed: random.nextInt() };
  const template = new StructureTemplate(buildDesertPyramid(params), 'minecraft:desert_pyramid');
  const piece = new StructurePiece({
    id: 'minecraft:desert_pyramid', type: 'template', family: 'hardcoded', template: template.name, rotation,
    box: template.boundingBox({ x: originX, y, z: originZ }, rotation),
    // groundY: the box reaches down to the buried treasure room, so terrain adaptation must take the ground floor,
    // not the box bottom, as the floor -- or it would hollow out the sand round the tomb.
    meta: { origin: { x: originX, y, z: originZ }, params, groundY: surface }
  });
  const start = new StructureStart({
    structureId: 'desert_pyramid', chunkX, chunkZ, pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(centreX, centreZ) : null, seed
  });
  start.meta = { rotation, surface, y, groundFloorY: surface, treasureY: y + 3 };
  return start;
}

export function realizeDesertPyramid(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const template = new StructureTemplate(buildDesertPyramid(piece.meta.params), piece.template);
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 40503n + BigInt(start.chunkZ));
  const placement = placeTemplate({
    template, origin: piece.meta.origin, rotation: piece.rotation, mirror: piece.mirror,
    processors: { processors: [] }, random, world: null
  });
  const missingBlocks = new Set();
  const chests = [];
  let written = 0;
  let tnt = 0;
  let plateSeen = false;
  let suspicious = 0;
  for (const block of placement.blocks) {
    const id = resolver.resolveState(block.state);
    if (id === null) { missingBlocks.add(block.state.name); continue; }
    const name = block.state.name;
    if (name === 'minecraft:chest' && block.nbt?.LootTable) chests.push(block.nbt.LootTable);
    if (name === 'minecraft:tnt') tnt++;
    if (name === 'minecraft:stone_pressure_plate') plateSeen = true;
    if (name === 'minecraft:suspicious_sand') suspicious++;
    if (setBlock(block.x, block.y, block.z, id, { state: block.state, ...(block.nbt?.LootTable ? { lootTable: block.nbt.LootTable } : {}) })) written++;
  }
  return {
    written, chests, suspiciousSand: suspicious,
    trap: { tnt, pressurePlate: plateSeen, armed: tnt > 0 && plateSeen },
    missingBlocks: [...missingBlocks].sort(),
    note: "the wiki's blueprint, block for block; the cellar's sand and the collapsed roof are randomised as the page describes"
  };
}
