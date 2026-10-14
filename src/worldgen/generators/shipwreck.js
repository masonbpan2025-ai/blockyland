// Shipwrecks, from the wiki (https://minecraft.wiki/w/Shipwreck and /Structure).
//
// From the pages:
//   * "Shipwrecks generate in all oceans commonly. On rarer occasions, they generate above sea level nearby the water,
//     in beaches, snowy beaches" -- the two registry ids, `shipwreck` and `shipwreck_beached` (`is_beached`);
//   * 20 templates: upright, sideways and upside-down, each whole, front half (bow) and back half (stern), intact and
//     degraded, plus the ship with a mast (intact and degraded);
//   * "Only two wood types are used per ship (one is the primary type, which is used by the logs and exterior, and the
//     other the secondary type) ... Primary dark oak with secondary jungle and spruce, primary jungle with secondary
//     spruce, primary oak with secondary birch and spruce, primary spruce with secondary dark oak, jungle, and oak";
//   * "Supply chests generate in the bow of the ships, treasure chests generate in the upper section of the stern, and
//     map chests in the lower section ... map chests from shipwreck sterns may generate in upside-down bows".
//
// The /Structure page draws 12 of the 20 templates; the other 8 are stubs. Those are cut from the drawn whole ship of
// the same orientation where the drawn halves sit in their whole ship (the bow is the whole ship's z 4..27, the stern
// its z 0..15), and `upsidedown_full_degraded` is the drawn upside-down ship with blocks taken away down to its
// materials table; each derived one is then trimmed to its materials table. Every template's counts are checked
// against the Shipwreck page's table in tests/structureShipwreck.test.js (the drawn ones differ by a few blocks, pinned).
//
// Not on the wiki, so ours: the odds of each template (equal) and of each wood pair (equal); that beached wrecks use
// the upright templates; and how deep an ocean wreck sinks (its bottom two layers in the sea floor).

import { defineBlueprintStructure, cellsOf, templateFrom, cellChance } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/shipwreck.js';

const WOODS = ['dark_oak', 'oak', 'spruce', 'jungle', 'birch', 'acacia'];
const woodOf = (name) => WOODS.find((w) => name.startsWith(`${w}_`)) ?? null;

/** The wiki's eight wood pairs, as [primary, secondary]. */
export const WOOD_PAIRS = [['dark_oak', 'jungle'], ['dark_oak', 'spruce'], ['jungle', 'spruce'], ['oak', 'birch'], ['oak', 'spruce'], ['spruce', 'dark_oak'], ['spruce', 'jungle'], ['spruce', 'oak']];

/** The wiki's template names (Shipwreck page) and the drawing each comes from. */
export const SHIPWRECK_TEMPLATES = {
  with_mast: 'shipwreck_with_mast', with_mast_degraded: 'shipwreck_with_mast_degraded',
  rightsideup_full: 'right_side_up', rightsideup_full_degraded: 'right_side_up_degraded',
  rightsideup_fronthalf: 'right_side_up_front_half', rightsideup_fronthalf_degraded: 'right_side_up_front_half_degraded',
  rightsideup_backhalf: 'right_side_up_back_half', rightsideup_backhalf_degraded: 'right_side_up_back_half_degraded',
  sideways_full: 'sideways', sideways_full_degraded: 'sideways_degraded',
  sideways_fronthalf: null, sideways_fronthalf_degraded: null, sideways_backhalf: null, sideways_backhalf_degraded: null,
  upsidedown_full: 'upside_down', upsidedown_full_degraded: null,
  upsidedown_fronthalf: null, upsidedown_fronthalf_degraded: null,
  upsidedown_backhalf: null, upsidedown_backhalf_degraded: 'upside_down_back_half_degraded'
};
export const BEACHED_TEMPLATES = Object.keys(SHIPWRECK_TEMPLATES).filter((t) => /^(rightsideup|with_mast)/.test(t));

/** The Shipwreck page's "Consists of" column, with oak as the primary wood and spruce as the secondary. */
export const SHIPWRECK_MATERIALS = {
  rightsideup_backhalf: { oak_planks: 166, oak_stairs: 112, spruce_planks: 67, spruce_slab: 20, spruce_fence: 15, spruce_stairs: 13, oak_fence: 6, oak_log: 4, oak_trapdoor: 3, oak_slab: 2, chest: 2, oak_door: 1 },
  rightsideup_backhalf_degraded: { oak_planks: 153, oak_stairs: 109, spruce_planks: 59, spruce_slab: 20, spruce_fence: 14, spruce_stairs: 10, oak_fence: 6, oak_log: 4, oak_slab: 4, oak_trapdoor: 2, chest: 2, oak_door: 1 },
  rightsideup_fronthalf: { oak_planks: 128, oak_stairs: 108, spruce_planks: 58, spruce_stairs: 20, spruce_fence: 18, oak_trapdoor: 11, oak_log: 8, chest: 1, oak_door: 1 },
  rightsideup_fronthalf_degraded: { oak_planks: 111, oak_stairs: 100, spruce_planks: 44, spruce_stairs: 12, spruce_fence: 10, oak_trapdoor: 11, oak_log: 7, chest: 1, oak_door: 1 },
  rightsideup_full: { oak_planks: 252, oak_stairs: 178, spruce_planks: 104, spruce_fence: 31, spruce_slab: 31, spruce_stairs: 26, oak_trapdoor: 14, oak_log: 10, oak_fence: 6, chest: 3, oak_slab: 2, oak_door: 1 },
  rightsideup_full_degraded: { oak_planks: 243, oak_stairs: 171, spruce_planks: 89, spruce_slab: 31, spruce_fence: 27, spruce_stairs: 23, oak_log: 10, oak_trapdoor: 9, oak_fence: 6, chest: 3, oak_slab: 2, oak_door: 1 },
  sideways_backhalf: { oak_planks: 143, oak_stairs: 105, spruce_planks: 101, spruce_fence: 10, oak_fence: 6, spruce_stairs: 5, oak_log: 4, oak_trapdoor: 3, chest: 2 },
  sideways_backhalf_degraded: { oak_planks: 123, oak_stairs: 99, spruce_planks: 88, spruce_fence: 10, oak_fence: 6, oak_log: 4, oak_trapdoor: 3, spruce_stairs: 3, chest: 2 },
  sideways_fronthalf: { oak_planks: 117, oak_stairs: 104, spruce_planks: 60, spruce_stairs: 13, spruce_fence: 11, oak_log: 7, oak_trapdoor: 7, chest: 1 },
  sideways_fronthalf_degraded: { oak_planks: 83, oak_stairs: 81, spruce_planks: 46, spruce_stairs: 13, spruce_fence: 8, oak_trapdoor: 7, oak_log: 6, chest: 1 },
  sideways_full: { oak_planks: 223, oak_stairs: 171, spruce_planks: 159, spruce_fence: 30, spruce_stairs: 22, oak_trapdoor: 14, oak_log: 10, oak_fence: 6, chest: 3 },
  sideways_full_degraded: { oak_planks: 206, spruce_planks: 150, oak_stairs: 149, spruce_fence: 24, spruce_stairs: 21, oak_trapdoor: 11, oak_log: 10, oak_fence: 6, chest: 3 },
  upsidedown_backhalf: { oak_planks: 176, oak_stairs: 107, spruce_planks: 60, spruce_fence: 10, spruce_stairs: 10, spruce_slab: 7, oak_trapdoor: 4, oak_log: 4, oak_slab: 3, oak_fence: 2, chest: 2 },
  upsidedown_backhalf_degraded: { oak_planks: 167, oak_stairs: 98, spruce_planks: 55, spruce_fence: 10, spruce_stairs: 8, spruce_slab: 7, oak_trapdoor: 4, oak_log: 4, oak_slab: 3, oak_fence: 2, chest: 2 },
  upsidedown_fronthalf: { oak_planks: 123, oak_stairs: 93, spruce_planks: 60, spruce_stairs: 21, oak_trapdoor: 14, oak_log: 9, spruce_fence: 8, chest: 2 },
  upsidedown_fronthalf_degraded: { oak_planks: 112, oak_stairs: 82, spruce_planks: 54, spruce_stairs: 20, oak_trapdoor: 11, oak_log: 9, spruce_fence: 8, chest: 2 },
  upsidedown_full: { oak_planks: 219, oak_stairs: 153, spruce_planks: 116, spruce_fence: 30, spruce_stairs: 28, spruce_slab: 19, oak_trapdoor: 14, oak_log: 10, oak_fence: 4, chest: 3, oak_slab: 2 },
  upsidedown_full_degraded: { oak_planks: 194, oak_stairs: 133, spruce_planks: 109, spruce_stairs: 28, spruce_fence: 27, spruce_slab: 19, oak_trapdoor: 14, oak_log: 10, oak_fence: 4, chest: 3, oak_slab: 2 },
  with_mast: { oak_planks: 209, oak_stairs: 182, spruce_planks: 108, spruce_slab: 70, oak_log: 67, spruce_fence: 35, spruce_stairs: 24, oak_trapdoor: 16, oak_fence: 6, oak_slab: 4, chest: 3, oak_door: 1 },
  with_mast_degraded: { oak_planks: 201, oak_stairs: 172, spruce_planks: 107, spruce_slab: 63, spruce_fence: 28, oak_log: 24, spruce_stairs: 23, oak_trapdoor: 16, oak_fence: 6, oak_slab: 4, chest: 3, oak_door: 1 }
};

export const SHIPWRECK_LOOT = { supply: 'minecraft:chests/shipwreck_supply', treasure: 'minecraft:chests/shipwreck_treasure', map: 'minecraft:chests/shipwreck_map' };

/** A drawing's cells with its woods named by role: `P` (primary, the logs' wood) and `S`. */
function drawnCells(key) {
  const cells = cellsOf(BLUEPRINTS[key]);
  const primary = woodOf(cells.find((c) => /_log$/.test(c.name))?.name ?? '');
  // The secondary wood is the commoner of the others; a third wood in a drawing (the upside-down ship's four dark oak
  // fences) is the primary's, as the materials table counts it.
  const others = {};
  for (const c of cells) { const w = woodOf(c.name); if (w && w !== primary) others[w] = (others[w] ?? 0) + 1; }
  const secondary = Object.entries(others).sort((a, b) => b[1] - a[1])[0]?.[0];
  return cells.map((c) => {
    const w = woodOf(c.name);
    return { ...c, name: w ? `${w === secondary ? 'S' : 'P'}${c.name.slice(w.length)}` : c.name };
  });
}
/** The length axis of a drawing: the long one. */
const lengthAxis = (cells) => (Math.max(...cells.map((c) => c.x)) > Math.max(...cells.map((c) => c.z)) ? 'x' : 'z');

/** Take blocks away (deterministically) until no kind exceeds the table; the result's counts are then <= the table's. */
function trimTo(cells, table, salt) {
  const want = Object.fromEntries(Object.entries(table).map(([k, n]) => [k.replace(/^oak_/, 'P_').replace(/^spruce_/, 'S_'), n]));
  const byName = {};
  for (const c of cells) (byName[c.name] ??= []).push(c);
  const drop = new Set();
  for (const [name, list] of Object.entries(byName)) {
    const surplus = list.length - (want[name] ?? 0);
    if (surplus <= 0 || name === 'chest') continue;
    list.sort((a, b) => cellChance(salt, a.x, a.y, a.z) - cellChance(salt, b.x, b.y, b.z)).slice(0, surplus).forEach((c) => drop.add(c));
  }
  return cells.filter((c) => !drop.has(c));
}

function cut(cells, from, to) {
  const axis = lengthAxis(cells);
  return cells.filter((c) => c[axis] >= from && c[axis] <= to).map((c) => ({ ...c, [axis]: c[axis] - from }));
}

const designs = new Map();
/** A template's cells (woods as P/S) and size. */
export function shipwreckDesign(template) {
  if (designs.has(template)) return designs.get(template);
  const drawing = SHIPWRECK_TEMPLATES[template];
  let cells;
  if (drawing) cells = drawnCells(drawing);
  else {
    const [, orientation, part, degraded] = /^(\w+?)_(full|fronthalf|backhalf)(_degraded)?$/.exec(template);
    let whole = drawnCells(orientation === 'sideways' ? (degraded ? 'sideways_degraded' : 'sideways') : 'upside_down');
    if (orientation === 'upsidedown' && degraded) whole = trimTo(whole, SHIPWRECK_MATERIALS.upsidedown_full_degraded, 7);
    cells = part === 'full' ? whole : part === 'fronthalf' ? cut(whole, 4, 27) : cut(whole, 0, 15);
    // The bow carries only the bow's chest (the drawn upright bow leaves out the whole ship's stern chests), except
    // upside down, where "map chests from shipwreck sterns may generate in upside-down bows".
    if (part === 'fronthalf' && orientation !== 'upsidedown') cells = cells.filter((c) => c.name !== 'chest' || c[lengthAxis(cells)] + 4 >= 16);
    // The upside-down stern: the drawn degraded stern has blocks the whole ship's cut lacks; the intact stern has both.
    if (template === 'upsidedown_backhalf') {
      const have = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`));
      for (const c of drawnCells('upside_down_back_half_degraded')) if (!have.has(`${c.x},${c.y},${c.z}`)) cells.push(c);
    }
    cells = trimTo(cells, SHIPWRECK_MATERIALS[template], 11);
  }
  const size = [Math.max(...cells.map((c) => c.x)) + 1, Math.max(...cells.map((c) => c.y)) + 1, Math.max(...cells.map((c) => c.z)) + 1];
  const design = { cells, size, axis: lengthAxis(cells) };
  designs.set(template, design);
  return design;
}

/** Which loot a chest holds, from where it is along the ship (the stern is the low end of every drawing). */
export function chestKind(template, cell, axis) {
  const along = cell[axis];
  const offset = /fronthalf/.test(template) ? 4 : 0;
  const at = along + offset;
  if (at >= 16) return /^upsidedown/.test(template) ? 'map' : 'supply';
  return at < 6 ? 'treasure' : 'map';
}

export function buildShipwreck({ template = 'rightsideup_full', wood = 0 } = {}) {
  const { cells, size, axis } = shipwreckDesign(template);
  const [primary, secondary] = WOOD_PAIRS[wood];
  return templateFrom(cells, size, {
    edit: (c) => {
      if (c.name === 'chest') return { name: 'chest', props: c.props, nbt: { id: 'minecraft:chest', LootTable: SHIPWRECK_LOOT[chestKind(template, c, axis)] } };
      if (/^[PS]_/.test(c.name)) return { name: `${c.name[0] === 'P' ? primary : secondary}${c.name.slice(1)}`, props: c.props };
      return c;
    }
  });
}

const wreck = defineBlueprintStructure({
  name: 'minecraft:shipwreck',
  choose: (random, ctx) => {
    const beached = ctx.structureId === 'shipwreck_beached';
    const list = beached ? BEACHED_TEMPLATES : Object.keys(SHIPWRECK_TEMPLATES);
    return { template: list[random.nextIntBound(list.length)], wood: random.nextIntBound(WOOD_PAIRS.length), beached };
  },
  build: ({ template, wood }) => buildShipwreck({ template, wood }),
  baseY: (ctx) => {
    if (ctx.params.beached) return ctx.surface;
    const floor = ctx.context.surfaceY ? ctx.context.surfaceY(ctx.centreX, ctx.centreZ, 'ocean_floor_wg') : ctx.surface;
    return floor - 1;
  },
  offset: 0,
  meta: (start, ctx) => ({ template: ctx.params.template, beached: ctx.params.beached, wood: WOOD_PAIRS[ctx.params.wood] })
});

export const generateShipwreck = wreck.generate;
export const realizeShipwreck = wreck.realize;
