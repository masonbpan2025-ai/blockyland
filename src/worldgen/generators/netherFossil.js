// Nether fossils, from the wiki (https://minecraft.wiki/w/Nether_Fossil and /Structure).
//
// From the pages:
//   * "Nether fossils generate randomly throughout the Nether in soul sand valleys" (set `nether_fossils`);
//   * "composed of 5 to 27 bone blocks. Unlike regular fossils, they do not have a lowered structure integrity and no
//     blocks are replaced with coal or diamond ore";
//   * 14 variants, each drawn on /Structure (every drawing matches its table);
//   * "Nether fossils have a 1/3 (~33.3%) chance of generating a dried ghast adjacent to them" (this game has the
//     dried ghast block, so it is placed).
//
// Ours: where it sits (on the valley floor, rotated at random) and which side the dried ghast is on.

import { defineBlueprintStructure, cellsOf, templateFrom } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/nether_fossil.js';

export const NETHER_FOSSIL_VARIANTS = 14;
export const NETHER_FOSSIL_SIZE_RANGE = [5, 27];
export const DRIED_GHAST_CHANCE = 1 / 3;

export function buildNetherFossil({ variant = 1, ghast = false, ghastSpot = 0 } = {}) {
  const data = BLUEPRINTS[`fossil_${variant}`];
  const cells = cellsOf(data);
  const out = [...cells];
  let size = data.size;
  if (ghast) {
    // Beside the fossil, on the floor: one of the four sides of its bottom layer, widening the box by one.
    const [sx, sy, sz] = size;
    const spots = [[-1, 0, 0], [sx, 0, 0], [0, 0, -1], [0, 0, sz]];
    const [gx, , gz] = spots[ghastSpot % 4];
    const shift = [gx < 0 ? 1 : 0, gz < 0 ? 1 : 0];
    for (const c of out) { c.x += shift[0]; c.z += shift[1]; }
    out.push({ x: gx + shift[0], y: 0, z: gz + shift[1], name: 'dried_ghast', props: null });
    size = [sx + (gx < 0 || gx >= sx ? 1 : 0), sy, sz + (gz < 0 || gz >= sz ? 1 : 0)];
  }
  return templateFrom(out, size);
}

const fossil = defineBlueprintStructure({
  name: 'minecraft:nether_fossil',
  choose: (random) => ({ variant: 1 + random.nextIntBound(NETHER_FOSSIL_VARIANTS), ghast: random.nextFloat() < DRIED_GHAST_CHANCE, ghastSpot: random.nextIntBound(4) }),
  build: buildNetherFossil,
  // On the valley floor: the drawing's bottom layer one above the ground block.
  baseY: (ctx) => ctx.surface + 1,
  offset: 4,
  meta: (start, ctx) => ({ variant: ctx.params.variant, ghast: ctx.params.ghast })
});

export const generateNetherFossil = fossil.generate;
export const realizeNetherFossil = fossil.realize;
