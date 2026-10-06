// Ocean ruins: the first structure that is a CLUSTER rather than a single template.
//
// From the wiki (`Ocean Ruins`, 1.21.4 revision):
//   * two ids: `ocean_ruin_cold` (cold, frozen, normal and deep oceans) and `ocean_ruin_warm` (warm ocean);
//   * "30% of ocean ruins generate as a large ruin", which is 4 to 8 ruins clustered together; the rest are
//     a single ruin;
//   * cold ruins are built from stone bricks and cobblestone, warm ones from sandstone, with coral fans and
//     sea pickles on the warm ones;
//   * suspicious sand and gravel hold the archaeology loot.
//
// The wiki does NOT publish the `ocean_ruin` configuration fields (recorded in STRUCTURE_REFERENCES.md), so
// the cluster radius, the exact ruin footprints and the material mix below are a clean-room approximation of
// the described structure. The 30% large chance, the 4-to-8 range and the per-variant materials are the
// published facts and are the ones the tests pin.
//
// PROVENANCE: no Minecraft assets are used. Every ruin is built by code.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

/** The published large-ruin chance, and the published cluster size range. */
export const LARGE_RUIN_CHANCE = 0.3;
export const CLUSTER_SIZE_RANGE = [4, 8];

/** The two variants' materials, from the wiki's description of each. */
export const OCEAN_RUIN_VARIANTS = {
  cold: {
    blocks: ['minecraft:stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:mossy_stone_bricks', 'minecraft:cobblestone', 'minecraft:mossy_cobblestone'],
    accent: 'minecraft:stone_brick_slab',
    archaeology: 'minecraft:archaeology/ocean_ruin_cold',
    suspicious: 'minecraft:suspicious_gravel',
    coral: []
  },
  warm: {
    blocks: ['minecraft:sandstone', 'minecraft:chiseled_sandstone', 'minecraft:cut_sandstone', 'minecraft:smooth_sandstone'],
    accent: 'minecraft:sandstone_slab',
    archaeology: 'minecraft:archaeology/ocean_ruin_warm',
    suspicious: 'minecraft:suspicious_sand',
    coral: ['minecraft:tube_coral_fan', 'minecraft:brain_coral_fan', 'minecraft:sea_pickle']
  }
};

/**
 * Build one ruin: a broken walled box with a floor, holes where it collapsed, and the variant's extras.
 *
 * @param {object} options
 * @param {'cold'|'warm'} options.variant
 * @param {number} options.seed       makes the collapse deterministic per ruin
 */
export function buildOceanRuin({ variant = 'cold', seed = 0 } = {}) {
  const spec = OCEAN_RUIN_VARIANTS[variant];
  if (!spec) throw new Error(`unknown ocean ruin variant "${variant}"`);
  const random = new LegacyRandom(BigInt(seed) * 6364136223846793005n + 1442695040888963407n);

  // Footprint and height vary, which is what makes a cluster look like several ruins rather than one shape
  // repeated 4 to 8 times.
  const size = [3 + random.nextIntBound(4), 2 + random.nextIntBound(3), 3 + random.nextIntBound(4)];
  const [sx, sy, sz] = size;
  const palette = [
    { Name: 'minecraft:air' },
    ...spec.blocks.map((Name) => ({ Name })),
    { Name: spec.accent },
    { Name: spec.suspicious },
    ...spec.coral.map((Name) => ({ Name }))
  ];
  const MAIN = 1;
  const ACCENT = 1 + spec.blocks.length;
  const SUSPICIOUS = ACCENT + 1;
  const CORAL = SUSPICIOUS + 1;
  const blocks = [];
  const set = (x, y, z, state) => {
    if (x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz) blocks.push({ pos: [x, y, z], state });
  };
  const material = () => MAIN + random.nextIntBound(spec.blocks.length);

  // Floor, then the walls, with each block having a chance of having collapsed.
  for (let x = 0; x < sx; x++) {
    for (let z = 0; z < sz; z++) if (random.nextFloat() < 0.85) set(x, 0, z, material());
  }
  for (let y = 1; y < sy; y++) {
    for (let x = 0; x < sx; x++) {
      for (let z = 0; z < sz; z++) {
        const edge = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;
        if (!edge) continue;
        // A third of the wall is simply gone: ocean ruins are ruins, not buildings.
        if (random.nextFloat() < 0.33) continue;
        set(x, y, z, material());
      }
    }
  }
  // A surviving lintel or slab line, so the shape reads as architecture.
  const accentY = Math.min(sy - 1, 1);
  for (let z = 0; z < sz; z++) if (random.nextFloat() < 0.5) set(0, accentY, z, ACCENT);

  // One suspicious block per ruin, carrying its archaeology loot table as a block entity.
  const sxPos = random.nextIntBound(sx);
  const szPos = random.nextIntBound(sz);
  blocks.push({
    pos: [sxPos, 0, szPos],
    state: SUSPICIOUS,
    nbt: { id: spec.suspicious, LootTable: spec.archaeology }
  });

  // Coral only on the warm variant, and only on top of something solid.
  if (spec.coral.length) {
    for (let i = 0; i < 1 + random.nextIntBound(3); i++) {
      const x = random.nextIntBound(sx);
      const z = random.nextIntBound(sz);
      const y = 0;
      if (blocks.some((block) => block.pos[0] === x && block.pos[1] === y && block.pos[2] === z)) {
        blocks.push({ pos: [x, y + 1, z], state: CORAL + random.nextIntBound(spec.coral.length) });
      }
    }
  }

  return { size, palette, blocks, entities: [], meta: { variant, seed } };
}

/** How many ruins this cluster has, and where each sits relative to the origin. */
export function planCluster({ seed, chunkX, chunkZ }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const large = random.nextFloat() < LARGE_RUIN_CHANCE;
  const [minRuins, maxRuins] = CLUSTER_SIZE_RANGE;
  const count = large ? minRuins + random.nextIntBound(maxRuins - minRuins + 1) : 1;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    // Large clusters spread out; a lone ruin sits at the origin.
    const spread = large ? 10 : 0;
    offsets.push({
      x: spread ? random.nextIntBound(spread * 2 + 1) - spread : 0,
      z: spread ? random.nextIntBound(spread * 2 + 1) - spread : 0,
      ruinSeed: random.nextInt()
    });
  }
  return { large, count, offsets };
}

export function generateOceanRuin({ seed, chunkX, chunkZ, structureId, context }) {
  const variant = structureId === 'ocean_ruin_warm' ? 'warm' : 'cold';
  const originX = chunkX * 16 + 8;
  const originZ = chunkZ * 16 + 8;
  const floor = context.surfaceY ? context.surfaceY(originX, originZ, 'ocean_floor_wg') : 40;

  const { large, count, offsets } = planCluster({ seed, chunkX, chunkZ });
  const pieces = offsets.map((offset, index) => {
    const params = { variant, seed: offset.ruinSeed };
    const template = new StructureTemplate(buildOceanRuin(params), `minecraft:ocean_ruin/${variant}`);
    const origin = { x: originX + offset.x, y: floor, z: originZ + offset.z };
    return new StructurePiece({
      id: template.name,
      index,
      type: 'template',
      family: 'template',
      template: template.name,
      box: template.boundingBox(origin, 0),
      meta: { origin, params, archaeology: OCEAN_RUIN_VARIANTS[variant].archaeology }
    });
  });

  const start = new StructureStart({
    structureId,
    chunkX,
    chunkZ,
    pieces,
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { variant, large, ruinCount: count, y: floor };
  return start;
}

export function realizeOceanRuin(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const suspicious = [];
  let written = 0;
  let piecesWritten = 0;

  for (const piece of start.pieces) {
    const template = new StructureTemplate(buildOceanRuin(piece.meta.params), piece.template);
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
    let wrote = 0;
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) { missingBlocks.add(block.state.name); continue; }
      const lootTable = block.nbt?.LootTable ?? null;
      if (lootTable) suspicious.push({ x: block.x, y: block.y, z: block.z, lootTable, block: block.state.name });
      if (setBlock(block.x, block.y, block.z, id, { state: block.state, ...(lootTable ? { lootTable } : {}) })) {
        written++;
        wrote++;
      }
    }
    if (wrote > 0) piecesWritten++;
  }

  return {
    written,
    piecesWritten,
    pieces: start.pieces.length,
    suspicious,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room ruins; the config fields the wiki omits make the footprints approximate'
  };
}
