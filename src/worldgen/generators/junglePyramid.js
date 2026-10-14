// Jungle pyramid, from the wiki's blueprint (https://minecraft.wiki/w/Jungle_Pyramid and /Structure).
//
// From the pages: jungle and bamboo jungle; "Jungle pyramids consist of cobblestone, mossy cobblestone, and vines.
// There are 3 floors." Two chests: "one at the end of a hallway of arrow booby traps, and one hidden behind a lever
// puzzle" -- three levers on three chiseled stone bricks driving a sticky-piston door; two tripwire lines, each
// firing a dispenser "hidden behind vines" (dispenser loot: 2-14 arrows).
//
// The /Structure page's drawing is placed block for block, and its Blueprint table supplies what the drawing does not
// show: every stair's facing, the chests' facings, the sticky pistons (the drawing draws two of the three as plain
// pistons; the table and the materials list say three sticky pistons), and that both chests are plain chests (the
// drawing shows one as trapped; the materials table lists 2 chests and no trapped chest). Each "C" is "Cobblestone or
// Mossy Cobblestone" (the materials table); the wiki gives no ratio, so each one is a coin toss.
//
// Not modelled: the trap and the puzzle as working redstone (the game's redstone does not run on structure blocks
// yet); the blocks are placed with their states.

import { defineBlueprintStructure, cellsOf, templateFrom, groundOf, cellChance } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/jungle_pyramid.js';

const DATA = BLUEPRINTS.jungle_pyramid;
export const JUNGLE_CHEST_LOOT = 'minecraft:chests/jungle_temple';
export const JUNGLE_DISPENSER_LOOT = 'minecraft:chests/jungle_temple_dispenser';
/** The /Structure materials table. Cobblestone counts cobblestone and mossy cobblestone together. */
export const JUNGLE_MATERIALS = {
  chest: 2, chiseled_stone_bricks: 3, cobblestone: 1157, cobblestone_stairs: 24, dispenser: 2, lever: 3,
  redstone_wire: 15, repeater: 1, sticky_piston: 3, tripwire: 5, tripwire_hook: 4, vine: 3
};
/** The drawing's y for its layer 0 (the ground). */
export const JUNGLE_GROUND = groundOf(DATA);

// The Blueprint table's stair facings, by drawing layer: [layer, x, z, facing], with the page's 1-based "Nx My"
// coordinates already turned into the drawing's 0-based x and z. Layers -2..0 and 2..4 face one way throughout.
const STAIRS = [
  ...[-2, -1, 0].map((layer) => [layer, null, null, 'east']),
  [1, 8, 5, 'east'], [1, 8, 6, 'east'], ...[4, 5, 6, 7].map((z) => [1, 14, z, 'west']),
  ...[2, 3, 4].map((layer) => [layer, null, null, 'west']),
  [5, 9, 4, 'north'], [5, 9, 7, 'south'],
  [10, 6, 5, 'east'], [10, 6, 6, 'east'], [10, 8, 5, 'west'], [10, 8, 6, 'west']
];
const stairFacing = (c) => {
  const layer = c.y - JUNGLE_GROUND;
  const hit = STAIRS.find(([l, x, z]) => l === layer && (x === null || (x === c.x && z === c.z)));
  return hit?.[3] ?? null;
};

/** Which way something faces to look at a neighbour that matches `test`. */
function facingToward(cells, c, test) {
  const at = (x, y, z) => cells.find((o) => o.x === x && o.y === y && o.z === z);
  for (const [dx, dz, facing] of [[0, -1, 'north'], [0, 1, 'south'], [1, 0, 'east'], [-1, 0, 'west']]) {
    const o = at(c.x + dx, c.y, c.z + dz);
    if (o && test(o.name)) return facing;
  }
  return null;
}
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function buildJunglePyramid({ seed = 0 } = {}) {
  const cells = cellsOf(DATA);
  return templateFrom(cells, DATA.size, {
    edit: (c) => {
      switch (c.name) {
        case 'cobblestone': return { name: cellChance(seed, c.x, c.y, c.z) < 0.5 ? 'cobblestone' : 'mossy_cobblestone' };
        case 'cobblestone_stairs': return { name: 'cobblestone_stairs', props: { facing: stairFacing(c) ?? c.props?.facing ?? 'north', half: 'bottom' } };
        // Table: "Chest 5x 10y East" and "Chest 12x 9y North"; both plain chests with the jungle pyramid loot.
        case 'chest': case 'trapped_chest':
          return { name: 'chest', props: { facing: c.name === 'chest' ? 'east' : 'north' }, nbt: { id: 'minecraft:chest', LootTable: JUNGLE_CHEST_LOOT } };
        // Table: "All Dispensers -- Towards Vines".
        case 'dispenser':
          return { name: 'dispenser', props: { facing: facingToward(cells, c, (n) => n === 'vines') }, nbt: { id: 'minecraft:dispenser', LootTable: JUNGLE_DISPENSER_LOOT } };
        // The hooks face along their wire.
        case 'tripwire_hook': return { name: 'tripwire_hook', props: { facing: facingToward(cells, c, (n) => n === 'tripwire'), attached: 'true', powered: 'false' } };
        case 'tripwire': return { name: 'tripwire', props: { attached: 'true' } };
        // On the chiseled stone bricks' far side from the room.
        case 'lever': return { name: 'lever', props: { face: 'wall', facing: OPPOSITE[facingToward(cells, c, (n) => n === 'chiseled_stone_bricks')], powered: 'false' } };
        // Table: "Sticky Piston 7x 11y North", "7x 10y Up" (layer -1) and "Sticky Piston North" (layer 0).
        case 'sticky_piston': case 'piston': return { name: 'sticky_piston', props: { facing: c.z === 9 ? 'up' : 'north' } };
        // Table: "Redstone Repeater -- East".
        case 'redstone_repeater': return { name: 'repeater', props: { facing: 'east' } };
        case 'redstone_dust': return { name: 'redstone_wire' };
        // On the dispenser they hide.
        case 'vines': return { name: 'vine', props: { [facingToward(cells, c, (n) => n === 'dispenser') ?? 'south']: 'true' } };
        default: return c;
      }
    }
  });
}

const pyramid = defineBlueprintStructure({
  name: 'minecraft:jungle_pyramid',
  choose: (random) => ({ seed: random.nextInt() }),
  build: buildJunglePyramid,
  // The drawing's layer 0 (ground) sits on the surface; layers -3..-1 are below it.
  baseY: (ctx) => ctx.surface - JUNGLE_GROUND,
  offset: 0,
  meta: (start, ctx) => ({ groundFloorY: ctx.surface, floors: 3 })
});

export const generateJunglePyramid = pyramid.generate;
export const realizeJunglePyramid = pyramid.realize;
