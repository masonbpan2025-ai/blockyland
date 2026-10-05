// The ruined portal generator: three vanilla mechanics that no other structure exercises together.
//
// From the wiki (`Ruined Portal`, 1.21.4 revision):
//   * the generic `ruined_portal` id holds a WEIGHTED LIST of setups (`setups[]`), while the six biome
//     variants (`_desert`, `_jungle`, `_mountain`, `_ocean`, `_swamp`) and `_nether` each pin one setup;
//   * a setup carries `placement` (on_land_surface, partly_buried, on_ocean_floor, in_mountain,
//     underground, in_nether), `air_pocket_probability`, `mossiness`, `overgrown`, `vines`, `can_be_cold`
//     and `replace_with_blackstone`;
//   * 5% of portals are giant (giant_portal_1..3) and 95% normal;
//   * obsidian has a 15% chance of being crying obsidian (Java);
//   * the nether variant uses blackstone materials (`replace_with_blackstone`), which is the
//     `blackstone_replace` processor;
//   * mossiness is the `block_age` processor's argument.
//
// Two flags are carried as data but NOT yet applied, and the file says so rather than pretending:
// `overgrown` and `vines` (they need a vegetation pass), and `can_be_cold` (it needs a biome temperature
// query this engine does not have). They are recorded so the deviation is visible.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom } from '../random.js';
import { legacyFromLargeFeatureSeed } from '../placement.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';
import { createProcessorList } from '../processors.js';
import { buildRuinedPortal } from '../templates/ruinedPortal.js';

/** Vanilla's giant chance. */
export const GIANT_CHANCE = 0.05;

/** The documented setups, keyed by the registry id that pins them. */
export const PORTAL_SETUPS = {
  ruined_portal_desert: { placement: 'partly_buried', mossiness: 0, airPocketProbability: 0, overgrown: false, vines: false, canBeCold: false, replaceWithBlackstone: false, baseBlock: 'minecraft:sandstone', weight: 1 },
  ruined_portal_jungle: { placement: 'on_land_surface', mossiness: 0.8, airPocketProbability: 0, overgrown: true, vines: true, canBeCold: false, replaceWithBlackstone: false, baseBlock: 'minecraft:stone_bricks', weight: 1 },
  ruined_portal_mountain: { placement: 'in_mountain', mossiness: 0.2, airPocketProbability: 0, overgrown: false, vines: false, canBeCold: true, replaceWithBlackstone: false, baseBlock: 'minecraft:stone_bricks', weight: 1 },
  ruined_portal_ocean: { placement: 'on_ocean_floor', mossiness: 0.8, airPocketProbability: 0, overgrown: false, vines: false, canBeCold: true, replaceWithBlackstone: false, baseBlock: 'minecraft:stone_bricks', weight: 1 },
  ruined_portal_swamp: { placement: 'on_land_surface', mossiness: 0.5, airPocketProbability: 0, overgrown: true, vines: false, canBeCold: false, replaceWithBlackstone: false, baseBlock: 'minecraft:stone_bricks', weight: 1 },
  ruined_portal_nether: { placement: 'in_nether', mossiness: 0, airPocketProbability: 0.5, overgrown: false, vines: false, canBeCold: false, replaceWithBlackstone: true, baseBlock: 'minecraft:blackstone', weight: 1 }
};

/**
 * The generic `ruined_portal` id's weighted setup list. The wiki publishes the setups and the six
 * biome-pinned variants but not the weights of the generic list, so the weights here are equal and that is
 * recorded rather than invented as exact.
 */
export const GENERIC_PORTAL_SETUP_WEIGHTS = {
  surface: { ...PORTAL_SETUPS.ruined_portal_swamp, placement: 'on_land_surface', mossiness: 0.2, weight: 1 },
  underground: { ...PORTAL_SETUPS.ruined_portal_mountain, placement: 'underground', weight: 1 }
};

/** Pick the setup for a registry id: pinned, or a weighted draw for the generic id. */
export function selectSetup(structureId, seed, chunkX, chunkZ) {
  if (structureId !== 'ruined_portal') {
    const pinned = PORTAL_SETUPS[structureId];
    if (!pinned) throw new Error(`${structureId} is not a ruined portal id`);
    return { setup: pinned, source: 'pinned' };
  }
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const entries = Object.entries(GENERIC_PORTAL_SETUP_WEIGHTS);
  const total = entries.reduce((sum, [, setup]) => sum + setup.weight, 0);
  let roll = random.nextIntBound(total);
  for (const [name, setup] of entries) {
    roll -= setup.weight;
    if (roll < 0) return { setup, source: `weighted:${name}` };
  }
  return { setup: entries[0][1], source: 'weighted:fallback' };
}

/**
 * Where a portal sits vertically, from its setup's `placement`.
 *
 * `airPocketProbability` is the nether rule: half of nether portals sit in an air pocket between Y 32 and
 * 100, and the other half are split between a low band and the rest.
 */
export function selectPortalY({ setup, seed, chunkX, chunkZ, surface, oceanFloor }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  // A second draw so the Y roll does not consume the same numbers as the setup roll for pinned ids.
  random.nextInt();
  switch (setup.placement) {
    case 'on_land_surface':
      return surface;
    case 'partly_buried':
      // Buried by up to three blocks, which is what makes a desert portal look sunk into the sand.
      return surface - random.nextIntBound(4);
    case 'in_mountain':
      return surface + (random.nextFloat() < 0.5 ? 0 : random.nextIntBound(6));
    case 'on_ocean_floor':
      return oceanFloor ?? surface - 8;
    case 'underground':
      return surface - 15 - random.nextIntBound(6);
    case 'in_nether': {
      const airPocket = random.nextFloat() < (setup.airPocketProbability ?? 0);
      if (airPocket) return 32 + random.nextIntBound(69);
      return random.nextFloat() < 0.5 ? 27 + random.nextIntBound(3) : 29 + random.nextIntBound(72);
    }
    default:
      throw new Error(`unknown ruined portal placement "${setup.placement}"`);
  }
}

export function generateRuinedPortal({ seed, chunkX, chunkZ, structureId, context }) {
  const { setup, source } = selectSetup(structureId, seed, chunkX, chunkZ);
  const originX = chunkX * 16 + 6;
  const originZ = chunkZ * 16 + 6;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  const oceanFloor = context.surfaceY ? context.surfaceY(originX, originZ, 'ocean_floor_wg') : surface - 8;

  // The shape roll and the damage roll come from the chunk's large-feature stream, so both are stable per
  // chunk. They are drawn in a fixed order: adding a draw later must not shift these.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  random.nextInt();
  const giant = random.nextFloat() < GIANT_CHANCE;
  const integrity = 0.35 + random.nextFloat() * 0.6;
  const y = selectPortalY({ setup, seed, chunkX, chunkZ, surface, oceanFloor });

  const templateParams = {
    shape: giant ? 'giant' : 'normal',
    baseBlock: setup.baseBlock,
    goldBlocks: 1 + Math.floor(random.nextFloat() * 3),
    withChest: true,
    integrity,
    cryingChance: 0.15,
    seed: Number(BigInt(seed) % 100000n) + chunkX * 31 + chunkZ
  };
  const template = new StructureTemplate(buildRuinedPortal(templateParams), `minecraft:ruined_portal/${templateParams.shape}`);

  const processors = [
    { processor_type: 'minecraft:jigsaw_replacement' },
    // mossiness is the documented argument to block_age, and it is the per-setup value rather than a
    // constant, which is why a swamp portal is mossier than a desert one.
    { processor_type: 'minecraft:block_age', mossiness: setup.mossiness }
  ];
  if (setup.replaceWithBlackstone) processors.push({ processor_type: 'minecraft:blackstone_replace' });

  const piece = new StructurePiece({
    id: `minecraft:ruined_portal/${giant ? 'giant' : 'normal'}`,
    type: 'template',
    family: 'template',
    template: template.name,
    box: template.boundingBox({ x: originX, y, z: originZ }, 0),
    meta: { processors: { processors }, origin: { x: originX, y, z: originZ }, setup, templateParams }
  });

  const start = new StructureStart({
    structureId,
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { setup, setupSource: source, giant, integrity, y, unappliedFlags: ['overgrown', 'vines', 'canBeCold'].filter((flag) => setup[flag]) };
  return start;
}

export function realizeRuinedPortal(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  // The template is rebuilt from the SAME parameters generation used. Rebuilding it with different ones
  // (a different gold count, say) would place blocks outside the box the plan advertised, which is the
  // kind of mismatch that makes a structure's reported bounds a lie.
  const params = piece.meta.templateParams;
  const setup = piece.meta.setup;
  const template = new StructureTemplate(buildRuinedPortal(params), piece.template);

  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 104729n + BigInt(start.chunkZ));
  const placement = placeTemplate({
    template,
    origin: piece.meta.origin,
    rotation: piece.rotation,
    mirror: piece.mirror,
    processors: piece.meta.processors,
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
  return {
    written,
    missingBlocks: [...missingBlocks].sort(),
    requirements: placement.requirements,
    processorTypes: placement.processorTypes,
    note: 'geometry is a clean-room approximation; overgrown, vines and can_be_cold are not applied'
  };
}

export { createProcessorList };
