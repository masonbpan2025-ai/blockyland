// Fossils, from the wiki (https://minecraft.wiki/w/Fossil and /Structure).
//
// From the pages:
//   * a feature of deserts, swamps and mangrove swamps: "Each chunk has two attempts within Y-coordinates 0 to 320 or
//     -63 to -8 underground to generate a fossil, each with a chance of 1/64. They have an equal chance to generate as
//     any of the four variants of skull or four variants of spine";
//   * "the pure-bone layer with a structure integrity of 0.9, meaning 10% of the bone blocks are removed and do not
//     override original terrain blocks"; then "the ore layer ... with a structure integrity of 0.1, replacing 10% of
//     the existing fossil with coal ore for fossils that generate above Y level 0. Diamond ore or deepslate diamond ore
//     generate below Y level -8" -- and "The locations of these ore blocks do not always correspond with the voids";
//   * the eight drawings on /Structure (each matches its materials table).
//
// This world is 64 tall (P0.4 remap): the upper attempt is buried anywhere from y 8 up to just under the ground, the
// deep attempt (diamond ore) in y 1..12.

import { defineBlueprintStructure, cellsOf, templateFrom, cellChance } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/fossil.js';

export const FOSSIL_DESIGNS = ['skull_1', 'skull_2', 'skull_3', 'skull_4', 'spine_1', 'spine_2', 'spine_3', 'spine_4'];
export const FOSSIL_CHANCE = 1 / 64;
export const FOSSIL_ATTEMPTS = 2;
export const BONE_INTEGRITY = 0.9;
export const ORE_INTEGRITY = 0.1;

export function buildFossil({ design = 'skull_1', deep = false, seed = 0 } = {}) {
  const data = BLUEPRINTS[design];
  const ore = deep ? 'deepslate_diamond_ore' : 'coal_ore';
  const cells = cellsOf(data);
  const out = [];
  for (const c of cells) {
    const bone = cellChance(seed, c.x, c.y, c.z, 1) < BONE_INTEGRITY;
    const isOre = cellChance(seed, c.x, c.y, c.z, 2) < ORE_INTEGRITY;
    // The ore layer is placed over the bone layer, so an ore can fill a spot the bone layer left empty.
    if (isOre) out.push({ ...c, name: ore, props: null });
    else if (bone) out.push(c);
  }
  return templateFrom(out, data.size);
}

/** The two attempts of a chunk: each 1 in 64, upper or deep. */
function attempts(random) {
  const out = [];
  for (let i = 0; i < FOSSIL_ATTEMPTS; i++) {
    const hit = random.nextFloat() < FOSSIL_CHANCE;
    const design = FOSSIL_DESIGNS[random.nextIntBound(FOSSIL_DESIGNS.length)];
    const depth = random.nextFloat();
    const seed = random.nextInt();
    const dx = random.nextIntBound(8); const dz = random.nextIntBound(8);
    if (hit) out.push({ design, deep: i === 1, seed, depth, dx, dz });
  }
  return out;
}

const fossil = defineBlueprintStructure({
  name: 'minecraft:fossil',
  choose: (random, ctx) => {
    const found = attempts(random);
    ctx.more = found.slice(1);
    return found[0] ?? null;
  },
  build: ({ design, deep, seed }) => buildFossil({ design, deep, seed }),
  baseY: (ctx) => {
    const { deep, depth } = ctx.params;
    const top = ctx.surface - ctx.size[1] - 1;
    return deep ? 1 + Math.floor(depth * 12) : Math.max(8, 8 + Math.floor(depth * Math.max(0, top - 8)));
  },
  extraPieces: (random, ctx) => (ctx.more ?? []).map((params) => ({ params, x: ctx.originX + params.dx, z: ctx.originZ + params.dz, rotation: random.nextIntBound(4) })),
  extraY: (ctx) => (ctx.params.deep ? 1 + Math.floor(ctx.params.depth * 12) : Math.max(8, 8 + Math.floor(ctx.params.depth * Math.max(0, ctx.surface - ctx.size[1] - 9)))),
  offset: 0,
  meta: (start, ctx) => ({ designs: start.pieces.map((p) => p.meta.params.design) })
});

export const generateFossil = fossil.generate;
export const realizeFossil = fossil.realize;
