// Swamp hut: a small spruce hut on oak-log stilts, with a witch and a black cat.
//
// From the wiki (`Swamp Hut`):
//   * Swamp only. Mangrove swamps do not generate huts (Swamp Hills is Bedrock-only).
//   * Walls and floor are spruce planks; the pillars are oak logs and extend down to solid ground, even over a
//     canyon; the roof is spruce stairs and spruce planks. There is no door.
//   * The interior is two blocks high and holds a crafting table, an EMPTY cauldron and a flower pot with a red
//     mushroom. There is no chest and no loot.
//   * The porch is a small platform several blocks above the ground with no stairs up to the hut.
//   * One witch and one black cat spawn inside, and neither despawns naturally. More witches can spawn at any
//     block of a 7 x 7 x 9 (x, y, z) area covering the hut and one block over the porch, from one level below the
//     floor to two blocks above the roof; the witch does not spawn on Peaceful.
//   * The hut generates on or above the surface, so there is no terrain shaping: only the pillars reach down.
//
// THE PIECE BOX IS THE SPAWN BOX. The wiki's 7 x 7 x 9 area is the hut's piece box, and the game's structure
// spawn override (`vanillaStructureSpawns.swamp_hut`, bounding box `piece`) reads exactly that, so the box here
// is deliberately the volume from one level below the floor to two above the roof. The pillars reach below it.
//
// PROVENANCE: no Minecraft assets. Built by code from the description above, so the floor plan inside the
// 7 x 7 x 9 volume is a clean-room approximation; the facts the wiki states are the ones the tests assert.
//
// Local coordinates (before rotation), x 0..6, y 0..6, z 0..8, the front (porch) at z = 0:
//   y 0       one level below the floor: only the pillars
//   y 1       the floor and the porch
//   y 2..3    the interior (two blocks high), walls with a doorway at the front
//   y 4       the roof: planks, with an overhang of stairs
//   y 5..6    the two blocks above the roof

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

/** The hut's piece box, which is also its spawn box: x, y, z extents in blocks. */
export const HUT_WIDTH = 7;
export const HUT_HEIGHT = 7;
export const HUT_DEPTH = 9;

/** The floor's local y: one level above the bottom of the box. */
export const HUT_FLOOR_Y = 1;
/** The floor is this many blocks above the average ground under the footprint. */
export const HUT_STILT_HEIGHT = 2;

/** The pillars: the four corners of the body and the two ends of the porch, as `[x, z]`. */
export const HUT_LEGS = [[1, 2], [5, 2], [1, 7], [5, 7], [3, 0]];

/** The hut's mobs, which are part of the structure rather than ambient spawns. Local block positions. */
export const HUT_ENTITIES = [
  { type: 'witch', x: 3, y: 2, z: 4, persistent: true },
  { type: 'cat', x: 4, y: 2, z: 4, persistent: true, variant: 'all_black' }
];

/**
 * The furnishings the wiki lists, as `[x, y, z, block]`: a crafting table and an empty cauldron side by side at the
 * back wall, and the flower pot with a red mushroom on the sill of the left window. There is deliberately no chest.
 */
export const HUT_FURNISHINGS = [
  [3, 2, 6, 'minecraft:crafting_table'],
  [4, 2, 6, 'minecraft:cauldron'],
  [1, 3, 5, 'minecraft:potted_red_mushroom']
];

/** The oak fences the wiki lists: a post at each front corner of the porch, and one on top of two wall sections. */
export const HUT_FENCES = [[1, 2, 1], [5, 2, 1], [2, 3, 2], [3, 3, 7]];

/** Window openings in the side walls, as `[x, y, z]`. The pot sits in the first row of the left one. */
export const HUT_WINDOWS = [[1, 3, 4], [5, 3, 4], [5, 3, 5]];

/**
 * @param {object} options
 * @param {Array<{x:number,z:number,depth:number}>} [options.legs] how many pillar blocks each leg has BELOW the
 *   box's bottom level (the level at y 0 is always a pillar block). Empty for the plain box.
 */
export function buildSwampHut({ legs = [], seed = 0 } = {}) {
  // Pillars extend below the 7-high box, so the template is built `shift` blocks taller and everything is
  // moved up by `shift`. The piece box stays the 7 x 7 x 9 volume; the placement origin moves down by `shift`.
  const shift = legs.reduce((most, leg) => Math.max(most, leg.depth), 0);
  const size = [HUT_WIDTH, HUT_HEIGHT + shift, HUT_DEPTH];
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:spruce_planks' },
    { Name: 'minecraft:oak_log', Properties: { axis: 'y' } },
    { Name: 'minecraft:spruce_stairs', Properties: { facing: 'east', half: 'bottom' } },
    { Name: 'minecraft:spruce_stairs', Properties: { facing: 'west', half: 'bottom' } },
    { Name: 'minecraft:spruce_stairs', Properties: { facing: 'south', half: 'bottom' } },
    { Name: 'minecraft:spruce_stairs', Properties: { facing: 'north', half: 'bottom' } },
    { Name: 'minecraft:crafting_table' },
    { Name: 'minecraft:cauldron' },
    { Name: 'minecraft:potted_red_mushroom' },
    { Name: 'minecraft:oak_fence', Properties: { east: 'false', north: 'false', south: 'false', west: 'false', waterlogged: 'false' } }
  ];
  const PLANKS = 1, LOG = 2, STAIR_EAST = 3, STAIR_WEST = 4, STAIR_SOUTH = 5, STAIR_NORTH = 6, FENCE = 10;
  const furnishingState = { 'minecraft:crafting_table': 7, 'minecraft:cauldron': 8, 'minecraft:potted_red_mushroom': 9 };
  const blocks = [];
  const at = new Map();
  const set = (x, y, z, state) => {
    const ty = y + shift;
    if (x < 0 || x >= size[0] || ty < 0 || ty >= size[1] || z < 0 || z >= size[2]) {
      throw new Error('swamp hut: block ' + x + ',' + y + ',' + z + ' is outside the box');
    }
    const key = x + ',' + ty + ',' + z;
    if (at.has(key)) blocks[at.get(key)] = { pos: [x, ty, z], state };
    else { at.set(key, blocks.length); blocks.push({ pos: [x, ty, z], state }); }
  };

  // Floor: the body and its front row, plus the porch step in front of that.
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 7; z++) set(x, HUT_FLOOR_Y, z, PLANKS);
  for (let x = 2; x <= 4; x++) set(x, HUT_FLOOR_Y, 0, PLANKS);
  // Walls, two blocks high. The front (z 2) is open on its right-hand block; the side walls and the back are solid
  // apart from the windows below; the interior is explicitly cleared.
  for (let y = 2; y <= 3; y++) {
    for (let x = 1; x <= 5; x++) for (let z = 1; z <= 7; z++) set(x, y, z, 0);
    for (let x = 2; x <= 3; x++) set(x, y, 2, PLANKS);
    for (let z = 3; z <= 6; z++) { set(1, y, z, PLANKS); set(5, y, z, PLANKS); }
    for (let x = 2; x <= 4; x++) set(x, y, 7, PLANKS);
  }
  // Pillars at the four corners of the body, running up through the walls (the legs below are added per piece).
  for (const [x, z] of [[1, 2], [5, 2], [1, 7], [5, 7]]) for (let y = 0; y <= 3; y++) set(x, y, z, LOG);
  set(3, 0, 0, LOG);
  for (const [x, y, z] of HUT_WINDOWS) set(x, y, z, 0);
  for (const [x, y, z] of HUT_FENCES) set(x, y, z, FENCE);
  for (const leg of legs) for (let k = 1; k <= leg.depth; k++) set(leg.x, -k, leg.z, LOG);
  // Roof: planks over the body, a ring of stairs on all four sides rising towards the middle.
  for (let x = 1; x <= 5; x++) for (let z = 2; z <= 7; z++) set(x, 4, z, PLANKS);
  for (let z = 1; z <= 8; z++) { set(0, 4, z, STAIR_EAST); set(6, 4, z, STAIR_WEST); }
  for (let x = 1; x <= 5; x++) { set(x, 4, 1, STAIR_SOUTH); set(x, 4, 8, STAIR_NORTH); }
  // Furnishings: a crafting table, an empty cauldron and a flower pot holding a red mushroom.
  for (const [x, y, z, name] of HUT_FURNISHINGS) set(x, y, z, furnishingState[name]);

  return {
    size,
    palette,
    blocks,
    entities: HUT_ENTITIES.map((entity) => ({
      pos: [entity.x, entity.y + shift, entity.z],
      blockPos: [entity.x, entity.y + shift, entity.z],
      nbt: { id: `minecraft:${entity.type}`, ...(entity.variant ? { CatType: entity.variant } : {}), PersistenceRequired: 1 }
    })),
    meta: { seed, shift }
  };
}

export function generateSwampHut({ seed, chunkX, chunkZ, context }) {
  // The north-west corner of the chunk, as the wiki says huts generate.
  const originX = chunkX * 16;
  const originZ = chunkZ * 16;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const rotation = random.nextIntBound(4);
  const params = { seed: random.nextInt() };
  const surfaceAt = (x, z) => (context.surfaceY ? context.surfaceY(x, z, 'world_surface_wg') : 64);

  // The plain 7 x 9 box tells us which columns the hut covers once rotated, so the ground can be read there.
  const plain = new StructureTemplate(buildSwampHut(params), 'minecraft:swamp_hut');
  const footprint = plain.boundingBox({ x: originX, y: 0, z: originZ }, rotation);
  let total = 0;
  let columns = 0;
  for (let x = footprint.minX; x <= footprint.maxX; x++) {
    for (let z = footprint.minZ; z <= footprint.maxZ; z++) { total += surfaceAt(x, z); columns++; }
  }
  const ground = Math.floor(total / columns);
  // "On or above the surface": the floor stands HUT_STILT_HEIGHT above the average ground, on its pillars.
  const boxY = ground + HUT_STILT_HEIGHT - HUT_FLOOR_Y + 1;
  const origin = { x: originX, y: boxY, z: originZ };

  // Each pillar reaches down to the solid ground under it, wherever that is: lower than the average on a slope,
  // and all the way to the bottom of a canyon.
  const legs = HUT_LEGS.map(([x, z]) => {
    const local = plain.transformPos(x, 0, z, rotation);
    const groundY = surfaceAt(origin.x + local.x, origin.z + local.z);
    return { x, z, depth: Math.max(0, boxY - groundY - 1), groundY };
  });

  const template = new StructureTemplate(buildSwampHut(params), 'minecraft:swamp_hut');
  const piece = new StructurePiece({
    id: 'minecraft:swamp_hut',
    type: 'template',
    family: 'hardcoded',
    template: template.name,
    rotation,
    // The box is the hut's 7 x 7 x 9 spawn volume, from one level below the floor to two above the roof.
    box: template.boundingBox(origin, rotation),
    meta: { origin, params, legs, ground }
  });
  const start = new StructureStart({
    structureId: 'swamp_hut',
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(originX + 3, originZ + 4) : null,
    seed
  });
  start.meta = { rotation, ground, floorY: boxY + HUT_FLOOR_Y, legDepths: legs.map((leg) => leg.depth) };
  return start;
}

export function realizeSwampHut(start, setBlock, blockIds, { spawnMob = null, clip = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const legs = piece.meta.legs.map(({ x, z, depth }) => ({ x, z, depth }));
  const template = new StructureTemplate(buildSwampHut({ ...piece.meta.params, legs }), piece.template);
  const shift = template.size[1] - HUT_HEIGHT;
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 2654435761n + BigInt(start.chunkZ));
  const origin = { x: piece.meta.origin.x, y: piece.meta.origin.y - shift, z: piece.meta.origin.z };
  const placement = placeTemplate({
    template,
    origin,
    rotation: piece.rotation,
    mirror: piece.mirror,
    processors: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] },
    random,
    world: null
  });

  const missingBlocks = new Set();
  let written = 0;
  for (const block of placement.blocks) {
    const id = resolver.resolveState(block.state);
    if (id === null) { missingBlocks.add(block.state.name); continue; }
    if (setBlock(block.x, block.y, block.z, id, { state: block.state })) written++;
  }

  const spawned = [];
  const spawns = [];
  for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
    const type = String(entity.nbt?.id || '').replace('minecraft:', '');
    const x = origin.x + entity.local.x;
    const y = origin.y + entity.local.y;
    const z = origin.z + entity.local.z;
    spawns.push({ type, x: x + 0.5, y, z: z + 0.5 });
    // An entity is not a block: a hut that "contains" a witch only in a comment is not parity. With a clip (the
    // live world realizes chunk by chunk) only the chunk that holds the mob spawns it.
    if (!spawnMob || (clip && !clip.contains(x, y, z))) continue;
    const ok = spawnMob(type, x + 0.5, y, z + 0.5, {
      persistent: true,
      variant: entity.nbt?.CatType ?? null
    });
    if (ok) spawned.push(type);
  }

  return {
    written,
    spawned,
    spawns,
    legs: legs.map((leg) => leg.depth + 1),
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room hut inside the wiki\'s 7 x 7 x 9 spawn box; no terrain shaping, only pillars to the ground'
  };
}
