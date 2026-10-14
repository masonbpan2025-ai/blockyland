// Ocean ruins, from the wiki (https://minecraft.wiki/w/Cold_Ocean_Ruins, /Warm_Ocean_Ruins and their /Structure pages).
//
// From the pages:
//   * cold ruins in "normal, cold, and frozen ocean biomes or in their deep variants"; warm ruins in "warm, lukewarm,
//     and deep lukewarm ocean biomes";
//   * "30% of ocean ruins generate as large ocean ruins; the other 70% generate as small ruins. If the ocean ruin is
//     large, there is a 90% chance for 4-8 (inclusive) small ocean ruins to generate around it in a cluster";
//   * integrity: cold "brick" 0.9 if large and 0.8 if small, "cracked" 0.7, "mossy" 0.5; warm 0.9 large, 0.8 small;
//   * "Suspicious gravel randomly replaces normal gravel" (cold) and suspicious sand replaces sand (warm), with the
//     ocean ruin archaeology loot; "all air blocks and structure blocks act as structure voids" (only the drawn
//     blocks are placed, the sea and the sea floor stay where the drawing is empty);
//   * one chest in all but two designs, with the big or small underwater ruin loot;
//   * drowned per design (the Types tables), persistent; "Reduced structure integrity may also remove drowned".
//
// The drawings: the /Structure pages draw all 12 cold designs in their brick, cracked and mossy forms and all 12
// warm designs. Warm ruin_2 and _6's blue terracotta is the table's light blue terracotta.
//
// Not on the wiki, so ours: the odds of each design and of brick/cracked/mossy (equal); how often gravel and sand turn
// suspicious (1 in 25); where in a cluster the small ruins go (within 24 blocks of the big one); where the drowned
// stand (on open floor inside the ruin). Zombie nautiluses are newer than this game.

import { defineBlueprintStructure, cellsOf, templateFrom, cellChance } from '../blueprintStructure.js';
import { LegacyRandom } from '../random.js';
import { BLUEPRINTS as COLD } from './blueprints/cold_ocean_ruins.js';
import { BLUEPRINTS as WARM } from './blueprints/warm_ocean_ruins.js';

export const LARGE_RUIN_CHANCE = 0.3;
export const CLUSTER_CHANCE = 0.9;
export const CLUSTER_SIZE_RANGE = [4, 8];
export const SUSPICIOUS_CHANCE = 1 / 25;
export const RUIN_LOOT = { big: 'minecraft:chests/underwater_ruin_big', small: 'minecraft:chests/underwater_ruin_small' };
export const RUIN_ARCHAEOLOGY = { cold: 'minecraft:archaeology/ocean_ruin_cold', warm: 'minecraft:archaeology/ocean_ruin_warm' };

/** The designs, as drawing keys: cold `[big|small][n]` with a material, warm by name. */
export const COLD_BIG = ['big_ruin1', 'big_ruin2', 'big_ruin3', 'big_ruin8'];
export const COLD_SMALL = ['ruin1', 'ruin2', 'ruin3', 'ruin4', 'ruin5', 'ruin6', 'ruin7', 'ruin8'];
export const COLD_MATERIALS = ['brick', 'cracked', 'mossy'];
export const WARM_BIG = ['big_ruin_warm4', 'big_ruin_warm5', 'big_ruin_warm6', 'big_ruin_warm7'];
export const WARM_SMALL = ['ruin_warm1', 'ruin_warm2', 'ruin_warm3', 'ruin_warm4', 'ruin_warm5', 'ruin_warm6', 'ruin_warm7', 'ruin_warm8'];

/** Drowned per design, [min, max], from the Types tables. */
export const RUIN_DROWNED = {
  big_ruin1: [1, 2], big_ruin2: [1, 2], big_ruin3: [1, 3], big_ruin8: [1, 2],
  ruin1: [0, 1], ruin2: [0, 2], ruin3: [0, 0], ruin4: [0, 2], ruin5: [0, 1], ruin6: [0, 4], ruin7: [0, 1], ruin8: [0, 1],
  big_ruin_warm4: [2, 2], big_ruin_warm5: [4, 4], big_ruin_warm6: [2, 2], big_ruin_warm7: [2, 2],
  ruin_warm1: [0, 0], ruin_warm2: [2, 2], ruin_warm3: [1, 1], ruin_warm4: [1, 1], ruin_warm5: [1, 1], ruin_warm6: [0, 0], ruin_warm7: [0, 0], ruin_warm8: [1, 1]
};

export function integrityOf({ climate, big, material }) {
  if (climate === 'warm' || material === 'brick') return big ? 0.9 : 0.8;
  return material === 'cracked' ? 0.7 : 0.5;
}

export function ruinDrawing({ climate, design, material }) {
  return climate === 'warm' ? WARM[design] : COLD[`${design}_${material}`];
}

export function buildOceanRuin({ climate = 'cold', design = 'ruin1', material = 'brick', seed = 0 } = {}) {
  const data = ruinDrawing({ climate, design, material });
  const big = /^big/.test(design);
  const integrity = integrityOf({ climate, big, material });
  const random = new LegacyRandom(BigInt(seed) * 6364136223846793005n + 1442695040888963407n);
  const cells = cellsOf(data);
  const kept = cells.filter((c) => c.name === 'chest' || cellChance(seed, c.x, c.y, c.z, 1) < integrity);
  // Drowned on open floor inside the ruin: a kept block with two empty blocks above it, not at the edge.
  const filled = new Set(kept.map((c) => `${c.x},${c.y},${c.z}`));
  const floors = kept.filter((c) => !filled.has(`${c.x},${c.y + 1},${c.z}`) && !filled.has(`${c.x},${c.y + 2},${c.z}`)
    && c.x > 0 && c.z > 0 && c.x < data.size[0] - 1 && c.z < data.size[2] - 1 && c.name !== 'chest');
  const [lo, hi] = RUIN_DROWNED[design] ?? [0, 0];
  const count = lo + random.nextIntBound(hi - lo + 1);
  const entities = [];
  for (let i = 0; i < count && floors.length; i++) {
    const f = floors.splice(random.nextIntBound(floors.length), 1)[0];
    // "Reduced structure integrity may also remove drowned": the ones that "always generate" keep at least one.
    if (i >= lo && random.nextFloat() >= integrity) continue;
    entities.push({ pos: [f.x + 0.5, f.y + 1, f.z + 0.5], blockPos: [f.x, f.y + 1, f.z], nbt: { type: 'drowned', options: { persistent: true } } });
  }
  const archaeology = RUIN_ARCHAEOLOGY[climate];
  return templateFrom(kept, data.size, {
    entities,
    edit: (c) => {
      if (c.name === 'chest') return { name: 'chest', props: c.props ?? { facing: 'north' }, nbt: { id: 'minecraft:chest', LootTable: big ? RUIN_LOOT.big : RUIN_LOOT.small } };
      if ((c.name === 'gravel' && climate === 'cold') || (c.name === 'sand' && climate === 'warm')) {
        if (cellChance(seed, c.x, c.y, c.z, 2) < SUSPICIOUS_CHANCE) return { name: `suspicious_${c.name}`, nbt: { id: 'minecraft:brushable_block', LootTable: archaeology } };
      }
      if (c.name === 'blue_terracotta' && climate === 'warm') return { name: 'light_blue_terracotta' };
      return c;
    }
  });
}

function pickRuin(random, climate, big) {
  const list = climate === 'warm' ? (big ? WARM_BIG : WARM_SMALL) : (big ? COLD_BIG : COLD_SMALL);
  const design = list[random.nextIntBound(list.length)];
  const material = climate === 'warm' ? null : COLD_MATERIALS[random.nextIntBound(3)];
  return { climate, design, material, seed: random.nextInt() };
}

const climateOf = (ctx) => (ctx.structureId === 'ocean_ruin_warm' ? 'warm' : 'cold');
const floorAt = (ctx, x, z) => (ctx.context.surfaceY ? ctx.context.surfaceY(x, z, 'ocean_floor_wg') : 40);

const ruin = defineBlueprintStructure({
  name: 'minecraft:underwater_ruin',
  choose: (random, ctx) => pickRuin(random, climateOf(ctx), random.nextFloat() < LARGE_RUIN_CHANCE),
  build: buildOceanRuin,
  // The drawing's bottom layer is the sea floor's top block.
  baseY: (ctx) => floorAt(ctx, ctx.centreX, ctx.centreZ),
  extraPieces: (random, ctx) => {
    if (!/^big/.test(ctx.params.design) || random.nextFloat() >= CLUSTER_CHANCE) return [];
    const [lo, hi] = CLUSTER_SIZE_RANGE;
    const n = lo + random.nextIntBound(hi - lo + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const angle = random.nextFloat() * Math.PI * 2;
      const dist = 12 + random.nextIntBound(13);
      out.push({ params: pickRuin(random, ctx.params.climate, false), x: Math.round(ctx.centreX + Math.cos(angle) * dist) - 3, z: Math.round(ctx.centreZ + Math.sin(angle) * dist) - 3, rotation: random.nextIntBound(4) });
    }
    return out;
  },
  extraY: (ctx) => floorAt(ctx, ctx.centreX, ctx.centreZ),
  offset: 0,
  meta: (start, ctx) => ({ climate: ctx.params.climate, design: ctx.params.design, material: ctx.params.material, big: /^big/.test(ctx.params.design), cluster: start.pieces.length - 1 })
});

export const generateOceanRuin = ruin.generate;
export const realizeOceanRuin = ruin.realize;
