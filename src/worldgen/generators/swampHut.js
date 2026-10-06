// Swamp hut: a small hut on legs, with a witch and a black cat.
//
// From the wiki (`Swamp Hut`, 1.21.4 revision), the parts I could verify:
//   * swamp and mangrove swamp only, structure set `swamp_huts` (spacing 32, separation 8, salt 14357620);
//   * a square spruce hut raised on legs above the ground, with a roof;
//   * it spawns a WITCH and a BLACK CAT, and these are spawn overrides rather than ambient spawns: the
//     hut's mobs are part of the structure, which is why they are placed as entities here;
//   * vanilla marks it `beard_thin`, like the desert pyramid.
//
// PROVENANCE: no Minecraft assets. Built by code, and represented as a pseudo-template so it reuses the
// same rotation/processor/realization pipeline as every other structure.
//
// DEVIATIONS, recorded rather than hidden:
//   1. the hut's exact dimensions, leg height and roof profile are a clean-room approximation;
//   2. the INTERIOR FURNISHINGS are not implemented. The wiki's infobox does not enumerate them in a form
//      I could verify against a primary source, and inventing a crafting table or cauldron would be exactly
//      the kind of plausible-looking guess the parity matrix exists to prevent;
//   3. `beard_thin` terrain adaptation is not applied (terrain shaping is a known missing subsystem), so on
//      sloped ground the legs do not reach the soil.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

/** The hut's footprint and how far its legs reach below the floor. */
export const HUT_WIDTH = 7;
export const HUT_LEG_HEIGHT = 3;
export const HUT_HEIGHT = 3;

/** The hut's mobs, which are part of the structure rather than ambient spawns. */
export const HUT_ENTITIES = [
  { type: 'witch', x: 3, y: 4, z: 3, persistent: true },
  { type: 'cat', x: 2, y: 4, z: 2, variant: 'all_black' }
];

export function buildSwampHut({ seed = 0 } = {}) {
  const width = HUT_WIDTH;
  const size = [width, HUT_HEIGHT + HUT_LEG_HEIGHT + 1, width];
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:spruce_planks' },
    { Name: 'minecraft:spruce_log', Properties: { axis: 'y' } },
    { Name: 'minecraft:spruce_stairs', Properties: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } }
  ];
  const blocks = [];
  const set = (x, y, z, state) => {
    const [sx, sy, sz] = size;
    if (x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz) blocks.push({ pos: [x, y, z], state });
  };

  const floorY = HUT_LEG_HEIGHT;
  // Legs at the four corners, from the floor down to the ground. They are what makes a hut rather than a
  // shed, and what the missing beard_thin adaptation would otherwise bed into the soil.
  for (const [x, z] of [[0, 0], [0, width - 1], [width - 1, 0], [width - 1, width - 1]]) {
    for (let y = 0; y < floorY; y++) set(x, y, z, 2);
  }
  // Floor and walls, with a doorway on the south side.
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < width; z++) set(x, floorY, z, 1);
  }
  for (let y = 1; y <= HUT_HEIGHT; y++) {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < width; z++) {
        const edge = x === 0 || x === width - 1 || z === 0 || z === width - 1;
        if (!edge) continue;
        set(x, floorY + y, z, 1);
      }
    }
  }
  set(3, floorY + 1, 0, 0);
  set(3, floorY + 2, 0, 0);
  // Roof: a ring of stairs one block up and one block in, so it reads as a pitched roof.
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < width; z++) {
      const edge = x === 0 || x === width - 1 || z === 0 || z === width - 1;
      if (edge) set(x, floorY + HUT_HEIGHT + 1, z, 3);
    }
  }
  for (let x = 1; x < width - 1; x++) {
    for (let z = 1; z < width - 1; z++) set(x, floorY + HUT_HEIGHT + 1, z, 1);
  }

  return { size, palette, blocks, entities: HUT_ENTITIES.map((entity) => ({
    pos: [entity.x + 0.5, entity.y, entity.z + 0.5],
    blockPos: [entity.x, entity.y, entity.z],
    nbt: { id: `minecraft:${entity.type}`, ...(entity.variant ? { CatType: entity.variant } : {}), PersistenceRequired: 1 }
  })), meta: { seed } };
}

export function generateSwampHut({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 4;
  const originZ = chunkZ * 16 + 4;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 64;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const rotation = random.nextIntBound(4);
  const params = { seed: random.nextInt() };
  const template = new StructureTemplate(buildSwampHut(params), 'minecraft:swamp_hut');
  const piece = new StructurePiece({
    id: 'minecraft:swamp_hut',
    type: 'template',
    family: 'hardcoded',
    template: template.name,
    rotation,
    // The hut's own y = 0 is the ground, so the origin is the surface.
    box: template.boundingBox({ x: originX, y: surface, z: originZ }, rotation),
    meta: { origin: { x: originX, y: surface, z: originZ }, params }
  });
  const start = new StructureStart({
    structureId: 'swamp_hut',
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { rotation, surface };
  return start;
}

export function realizeSwampHut(start, setBlock, blockIds, { spawnMob = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const template = new StructureTemplate(buildSwampHut(piece.meta.params), piece.template);
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 2654435761n + BigInt(start.chunkZ));
  const placement = placeTemplate({
    template,
    origin: piece.meta.origin,
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
  for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
    const type = String(entity.nbt?.id || '').replace('minecraft:', '');
    if (!spawnMob) continue;
    // An entity is not a block: a hut that "contains" a witch only in a comment is not parity.
    const ok = spawnMob(type, piece.meta.origin.x + entity.local.x, piece.meta.origin.y + entity.local.y, piece.meta.origin.z + entity.local.z, {
      persistent: true,
      variant: entity.nbt?.CatType ?? null
    });
    if (ok) spawned.push(type);
  }

  return {
    written,
    spawned,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room hut; interior furnishings are not implemented and beard_thin is not applied'
  };
}
