// Desert well, from the wiki's blueprint (https://minecraft.wiki/w/Desert_Well and /Structure).
//
// From the pages: a feature (not a structure) of deserts, "a 1/1000 chance to be generated in the given chunk"; built
// of sandstone and sandstone slabs round a water source, with two suspicious sand under the water: "The first
// suspicious sand generates directly below the water source blocks, and the second generates below that layer."
// The blueprint's red wool is sandstone and its blue wool sand, "and a suspicious sand randomly replaces a block within
// each of them" -- so 89 sandstone, 4 sand, 2 suspicious sand (the materials table), with the desert well
// archaeology loot.
//
// Not modelled: the placement test that the ground under the 5x5 is solid sand (the engine places by biome and
// surface height only).

import { defineBlueprintStructure, cellsOf, templateFrom, groundOf, pickN } from '../blueprintStructure.js';
import { LegacyRandom } from '../random.js';
import { BLUEPRINTS } from './blueprints/desert_well.js';

const DATA = BLUEPRINTS.desert_well;
export const DESERT_WELL_CHANCE = 1 / 1000;
export const DESERT_WELL_LOOT = 'minecraft:archaeology/desert_well';

export function buildDesertWell({ seed = 0 } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 25214903917n + 11n);
  const cells = cellsOf(DATA);
  const [suspiciousStone] = pickN(random, cells.filter((c) => c.name === 'red_wool'), 1);
  const [suspiciousSand] = pickN(random, cells.filter((c) => c.name === 'blue_wool'), 1);
  return templateFrom(cells, DATA.size, {
    edit: (c) => {
      if (c === suspiciousStone || c === suspiciousSand) return { name: 'suspicious_sand', nbt: { id: 'minecraft:brushable_block', LootTable: DESERT_WELL_LOOT } };
      if (c.name === 'red_wool') return { name: 'sandstone' };
      if (c.name === 'blue_wool') return { name: 'sand' };
      return c;
    }
  });
}

const well = defineBlueprintStructure({
  name: 'minecraft:desert_well',
  choose: (random) => ({ seed: random.nextInt() }),
  build: buildDesertWell,
  // The water (the drawing's layer 0, "ground") is level with the sand surface.
  baseY: (ctx) => ctx.surface - groundOf(DATA),
  offset: 4
});

export const generateDesertWell = well.generate;
export const realizeDesertWell = well.realize;
