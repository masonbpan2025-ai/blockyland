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
import { LegacyRandom } from '../random.js';
import { legacyFromLargeFeatureSeed } from '../placement.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';
import { buildIglooTop, buildIglooBasement } from '../templates/igloo.js';

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
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;

  // The basement roll comes from the chunk's large-feature stream, which is the same derivation vanilla
  // uses for per-chunk structure decisions. It is drawn FIRST so that adding the basement later cannot
  // shift any other draw.
  const roll = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ).nextFloat();
  const hasBasement = roll < IGLOO_BASEMENT_CHANCE;

  const top = new StructureTemplate(buildIglooTop(), 'minecraft:igloo/top');
  const pieces = [new StructurePiece({
    id: 'minecraft:igloo/top',
    type: 'template',
    family: 'template',
    template: 'minecraft:igloo/top',
    box: top.boundingBox({ x: originX, y: surface, z: originZ }, 0),
    meta: { processors: IGLOO_PROCESSORS }
  })];

  if (hasBasement) {
    // Vanilla places the basement below the dome, offset so the ladder lines up with the trapdoor. The
    // offset is an approximation of the vanilla geometry; the DEPTH (a room whose ceiling is one block
    // under the dome floor) is what matters for it to be reachable.
    const basementY = surface - 5;
    const basement = new StructureTemplate(buildIglooBasement(), 'minecraft:igloo/bottom');
    const basementOrigin = { x: originX - 1, y: basementY, z: originZ - 2 };
    pieces.push(new StructurePiece({
      id: 'minecraft:igloo/bottom',
      type: 'template',
      family: 'template',
      template: 'minecraft:igloo/bottom',
      box: basement.boundingBox(basementOrigin, 0),
      meta: { processors: IGLOO_PROCESSORS, entities: basement.entities, origin: basementOrigin }
    }));
  }

  const start = new StructureStart({
    structureId: 'igloo',
    chunkX,
    chunkZ,
    pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { hasBasement, basementRoll: roll, surface };
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
      ? new StructureTemplate(buildIglooTop(), piece.template)
      : new StructureTemplate(buildIglooBasement(), piece.template);
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
      if (setBlock(block.x, block.y, block.z, id, block.nbt ? { nbt: block.nbt, state: block.state } : { state: block.state })) {
        written++;
      }
    }

    for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
      const mobType = String(entity.nbt?.id || '').replace('minecraft:', '');
      if (!spawnMob) continue;
      const placed = spawnMob(mobType, origin.x + entity.local.x, origin.y + entity.local.y, origin.z + entity.local.z);
      if (placed) spawned.push(mobType);
    }
  }

  return {
    written,
    spawned,
    missingBlocks: [...missingBlocks].sort(),
    requirements: [...requirements].sort(),
    note: 'geometry is a clean-room approximation of the wiki description'
  };
}
