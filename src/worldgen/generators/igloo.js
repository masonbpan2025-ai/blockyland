// The igloo generator: the first structure built on the template pipeline.
//
// Vanilla behaviour reproduced here (wiki `Igloo`, 1.21.4 revision):
//   * the biome gate is the structure set's (`#has_structure/igloo`: snowy taiga, snowy plains, snowy
//     slopes) and is enforced by the engine from the registry, not here;
//   * HALF of all igloos have a basement. Vanilla rolls this from the chunk's decoration random, so it is
//     a deterministic function of (seed, chunk) -- and it must be drawn from the same kind of source, or a
//     different half of the world's igloos would get basements;
//   * the basement holds a villager and a zombie villager, both clerics, behind iron bars, with a splash
//     potion of weakness on a brewing stand and a golden apple in a chest. Those are content, and they are
//     initialized as entities/block entities rather than decorative blocks.
//
// PARITY: marked `PARTIAL` in STRUCTURE_PARITY.md, and honestly so. Placement, the biome gate, the 50%
// roll, the piece boxes, the chest's loot reference and the two entities are vanilla-equivalent. The
// GEOMETRY is a clean-room approximation -- this repository has no Minecraft assets, so `igloo/top` and
// `igloo/bottom` are built from the wiki's description rather than being the vanilla files.

import { StructurePiece, StructureStart } from '../start.js';
import { BlockBox } from '../geometry.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';
import { buildIglooTop, buildIglooBasement, IGLOO_BASEMENT_DEPTH } from '../templates/igloo.js';

/** Vanilla's basement chance. Published as "half of all igloos". */
export const IGLOO_BASEMENT_CHANCE = 0.5;

/** The dirt the snow sits on is cleared, so a buried igloo does not float inside terrain. */
const IGLOO_PROCESSORS = {
  processors: [
    // Jigsaw markers are a template-editing device; they never appear in a finished world.
    { processor_type: 'minecraft:jigsaw_replacement' }
  ]
};

export function generateIgloo({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 4;
  const originZ = chunkZ * 16 + 4;
  const surface = context.surfaceY ? context.surfaceY(originX + 3, originZ + 3, 'world_surface_wg') : 70;

  // The basement roll comes from the chunk's large-feature stream, which is the same derivation vanilla
  // uses for per-chunk structure decisions. It is drawn FIRST so that adding the basement later cannot
  // shift any other draw.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const roll = random.nextFloat();
  const hasBasement = roll < IGLOO_BASEMENT_CHANCE;
  const rotation = random.nextIntBound(4);
  const basementSeed = random.nextInt();

  // The dome's ground layer (the drawing's layer 0) sits at the surface; the basement is directly beneath it in the
  // same x/z frame, so the ladder lands under the trapdoor whatever the rotation.
  const topOrigin = { x: originX, y: surface, z: originZ };
  const top = new StructureTemplate(buildIglooTop({ hasBasement }), 'minecraft:igloo/top');
  const pieces = [new StructurePiece({
    id: 'minecraft:igloo/top', index: 0, type: 'template', family: 'template', template: 'minecraft:igloo/top', rotation,
    box: top.boundingBox(topOrigin, rotation),
    // DEVIATION: vanilla gives the igloo no terrain adaptation, which on a snowy slope leaves the uphill half of the
    // dome full of snow and dirt. The dome alone is bedded in (shaved above its floor, propped up below it); the
    // basement keeps none, since shaving above ITS floor would dig it out.
    meta: { processors: IGLOO_PROCESSORS, origin: topOrigin, hasBasement, adaptation: 'beard_thin' }
  })];
  if (hasBasement) {
    const basementOrigin = { x: originX, y: surface - IGLOO_BASEMENT_DEPTH, z: originZ };
    const basement = new StructureTemplate(buildIglooBasement({ seed: basementSeed }), 'minecraft:igloo/bottom');
    pieces.push(new StructurePiece({
      id: 'minecraft:igloo/bottom', index: 1, type: 'template', family: 'template', template: 'minecraft:igloo/bottom', rotation,
      box: basement.boundingBox(basementOrigin, rotation),
      meta: { processors: IGLOO_PROCESSORS, entities: basement.entities, origin: basementOrigin, basementSeed }
    }));
  }

  const start = new StructureStart({
    structureId: 'igloo', chunkX, chunkZ, pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null, seed
  });
  start.meta = { hasBasement, basementRoll: roll, surface, rotation };
  return start;
}

/**
 * Realize an igloo.
 *
 * Entity spawning goes through the `spawnMob` callback rather than being written as blocks: a villager is
 * not a block, and a structure that "contains" one only in a comment is not parity.
 */
export function realizeIgloo(start, setBlock, blockIds, { spawnMob = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  let written = 0;
  const spawned = [];
  const missingBlocks = new Set();
  const requirements = new Set();

  for (const piece of start.pieces) {
    const template = piece.template === 'minecraft:igloo/top'
      ? new StructureTemplate(buildIglooTop({ hasBasement: piece.meta?.hasBasement ?? start.meta?.hasBasement ?? true }), piece.template)
      : new StructureTemplate(buildIglooBasement({ seed: piece.meta?.basementSeed ?? 0 }), piece.template);
    const origin = piece.meta?.origin
      || { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
    // A per-piece random derived from the start keeps realization reproducible and independent of how many
    // chunks are realized, or in what order.
    const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(piece.index) * 7919n);
    const placement = placeTemplate({
      template,
      origin,
      rotation: piece.rotation,
      mirror: piece.mirror,
      processors: piece.meta?.processors || {},
      random,
      world: null // no world queries: jigsaw_replacement needs none
    });

    for (const name of placement.requirements) requirements.add(name);
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) {
        missingBlocks.add(block.state.name);
        continue;
      }
      const meta = block.nbt ? { nbt: block.nbt, state: block.state, ...(block.nbt.LootTable ? { lootTable: block.nbt.LootTable } : {}) } : { state: block.state };
      if (setBlock(block.x, block.y, block.z, id, meta)) {
        written++;
      }
    }

    for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
      const mobType = String(entity.nbt?.id || '').replace('minecraft:', '');
      if (!spawnMob) continue;
      // Both are clerics and never despawn (they are part of the structure).
      const placed = spawnMob(mobType, origin.x + entity.local.x, origin.y + entity.local.y, origin.z + entity.local.z, { persistent: true, profession: 'cleric' });
      if (placed) spawned.push(mobType);
    }
  }

  return {
    written,
    spawned,
    missingBlocks: [...missingBlocks].sort(),
    requirements: [...requirements].sort(),
    note: "the wiki's blueprint, block for block; the infested bricks are placed at random up to the materials table's counts"
  };
}
