// Amethyst geodes, from the wiki (https://minecraft.wiki/w/Amethyst_Geode and /Structure).
//
// From the pages:
//   * "Amethyst geodes generate between Y=-58 and Y=30. Each chunk has a 1/24 chance to attempt to generate a geode";
//   * "three layers: an outer layer of smooth basalt, a middle layer of calcite, and a hollow layer of primarily
//     amethyst blocks, with 8.3% replaced by budding amethyst"; "Amethyst crystals generate within the structure on
//     budding amethyst"; "a 95% chance of generating with a crack, exposing their inside";
//   * "Caves, aquifers, and canyons may be overridden by amethyst geodes" -- the hollow is written as air;
//   * /Structure draws one geode (14 x 15 x 13: 697 smooth basalt, 253 calcite, 167 amethyst, 16 budding).
//
// Geodes are not templates: each is shaped by its own random points. Ours: the shape -- the shells are distances from
// three jittered centres (the hollow inside 4.5, amethyst to 5.2, calcite to 5.9, basalt to 7.2), sized so a geode
// comes out like the drawn one; the crack is a two-block-wide cut from the middle out one side; each face of a
// budding amethyst into the hollow gets a crystal half the time, of an even size.
// This world is 64 tall (P0.4 remap): Y -58..30 becomes y 2 up to the geode's top 4 below the ground.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { templateFrom } from '../blueprintStructure.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const GEODE_CHANCE = 1 / 24;
export const BUDDING_SHARE = 0.083;
export const CRACK_CHANCE = 0.95;
export const SHELLS = { hollow: 4.5, amethyst: 5.2, calcite: 5.9, basalt: 7.2 };
const SIZE = 16; const MID = 7.5;
const CRYSTALS = ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'];
const FACES = [[1, 0, 0, 'east'], [-1, 0, 0, 'west'], [0, 1, 0, 'up'], [0, -1, 0, 'down'], [0, 0, 1, 'south'], [0, 0, -1, 'north']];

export function buildGeode({ seed = 0 } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 0x5DEECE66Dn + 11n);
  const centres = [...Array(3)].map(() => [MID + random.nextFloat() * 2 - 1, MID + random.nextFloat() * 2 - 1, MID + random.nextFloat() * 2 - 1]);
  const cracked = random.nextFloat() < CRACK_CHANCE;
  const angle = random.nextFloat() * Math.PI * 2;
  const crackDir = [Math.cos(angle), 0.3 - random.nextFloat() * 0.6, Math.sin(angle)];
  const distance = (x, y, z) => Math.min(...centres.map(([a, b, c]) => Math.hypot(x - a, y - b, z - c)));
  const inCrack = (x, y, z) => {
    if (!cracked) return false;
    const v = [x - MID, y - MID, z - MID];
    const along = v[0] * crackDir[0] + v[1] * crackDir[1] + v[2] * crackDir[2];
    if (along < 2) return false;
    const off = Math.hypot(v[0] - along * crackDir[0], v[1] - along * crackDir[1], v[2] - along * crackDir[2]);
    return off < 1.1;
  };
  const grid = new Map();
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) for (let z = 0; z < SIZE; z++) {
    const d = distance(x, y, z);
    if (d >= SHELLS.basalt) continue;
    let name;
    if (d < SHELLS.hollow || inCrack(x, y, z)) name = 'air';
    else if (d < SHELLS.amethyst) name = random.nextFloat() < BUDDING_SHARE ? 'budding_amethyst' : 'amethyst_block';
    else if (d < SHELLS.calcite) name = 'calcite';
    else name = 'smooth_basalt';
    grid.set(`${x},${y},${z}`, { x, y, z, name, props: null });
  }
  // Crystals on the budding amethyst's faces into the hollow.
  for (const c of [...grid.values()].filter((g) => g.name === 'budding_amethyst')) {
    for (const [dx, dy, dz, facing] of FACES) {
      const n = grid.get(`${c.x + dx},${c.y + dy},${c.z + dz}`);
      if (!n || n.name !== 'air' || random.nextFloat() >= 0.5) continue;
      n.name = CRYSTALS[random.nextIntBound(4)];
      n.props = { facing };
    }
  }
  return templateFrom([...grid.values()], [SIZE, SIZE, SIZE]);
}

const cache = new Map();
function templateFor(seed) {
  if (!cache.has(seed)) { cache.set(seed, new StructureTemplate(buildGeode({ seed }), 'minecraft:amethyst_geode')); if (cache.size > 32) cache.delete(cache.keys().next().value); }
  return cache.get(seed);
}

export function generateGeode({ seed, chunkX, chunkZ, structureId, context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  if (random.nextFloat() >= GEODE_CHANCE) return null;
  const x = chunkX * 16 + random.nextIntBound(16) - 8;
  const z = chunkZ * 16 + random.nextIntBound(16) - 8;
  const ground = context.surfaceY ? context.surfaceY(x + 8, z + 8) : 40;
  const top = ground - 4 - SIZE;
  if (top < 2) return null;
  const y = 2 + random.nextIntBound(top - 2 + 1);
  const geodeSeed = random.nextInt();
  const t = templateFor(geodeSeed);
  const origin = { x, y, z };
  const piece = new StructurePiece({ id: 'minecraft:amethyst_geode', index: 0, type: 'template', family: 'feature', template: 'minecraft:amethyst_geode', box: t.boundingBox(origin, 0), meta: { origin, seed: geodeSeed } });
  const start = new StructureStart({ structureId, chunkX, chunkZ, pieces: [piece], biome: context.biomeAt ? context.biomeAt(x + 8, z + 8) : null, seed });
  start.meta = { seed: geodeSeed, y, ground };
  return start;
}

export function realizeGeode(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missing = new Set();
  let written = 0;
  for (const piece of start.pieces) {
    const placement = placeTemplate({ template: templateFor(piece.meta.seed), origin: piece.meta.origin, rotation: 0, processors: { processors: [] }, random: new LegacyRandom(0n), world: null });
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) { missing.add(block.state.name); continue; }
      if (setBlock(block.x, block.y, block.z, id, { state: block.state })) written++;
    }
  }
  return { written, missingBlocks: [...missing].sort(), note: 'amethyst geode: three shells round a hollow' };
}

/** Whether the geode built from this seed has its crack (the draw `buildGeode` makes after its three centres). */
export function geodeIsCracked(seed) {
  const random = new LegacyRandom(BigInt(seed) * 0x5DEECE66Dn + 11n);
  for (let i = 0; i < 9; i++) random.nextFloat();
  return random.nextFloat() < CRACK_CHANCE;
}
