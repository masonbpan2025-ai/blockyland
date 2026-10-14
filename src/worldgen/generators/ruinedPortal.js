// Ruined portals, from the wiki (https://minecraft.wiki/w/Ruined_Portal and /Structure).
//
// From the pages:
//   * 13 designs: "Giant ruined portals have 3 distinct designs, and normal ruined portals have 10 designs. When a
//     ruined portal generates, it has a 5% chance to be a giant ruined portal ... This gives normal ruined portals a
//     95% chance, for a 9.5% chance per normal ruined portal design."
//   * Per-biome setups (the Generation table): vertical placement, mossiness, air pocket, overgrown, vines and
//     blackstone, below in PORTAL_SETUPS. The standard and mountain variants are each a 50/50 pair of setups.
//   * The vertical rules: underground "from 15 to n-n2", windswept hills "from 70 to n-n2", partly buried "n-n2, plus
//     a random integer from 2 to 8", Nether "with air pockets ... 32 to 100", without "50% ... 27 to 29, and 50% ... 29
//     to 100".
//   * The replacement table (gold 30% air; lava to magma or netherrack; netherrack 7% magma; obsidian 15% crying;
//     block ageing by mossiness; blackstone in the Nether), applied in `processPortal` below.
//   * "Natural terrain around ruined portals generates as netherrack."
//
// The designs: portal_1..3 and giant_portal_1 are the /Structure page's blueprints, block for block. The other nine
// have no drawing on the wiki, only a description and a materials table; they are built in
// ruinedPortalDesigns.js to that description with exactly that table's counts, so their SHAPE is ours.
//
// Not on the wiki, so ours: how the block-ageing split falls between the full block and the stair (half each); how
// many leaves an overgrown portal gets and how many vines (a quarter of the candidates each); which setups can be
// cold (standard, mountain and ocean); the reach of the netherrack spread (the portal's half-width plus 3).

import { defineBlueprintStructure, cellsOf, templateFrom, cellChance } from '../blueprintStructure.js';
import { LegacyRandom } from '../random.js';
import { createBlockIdResolver } from '../blockIds.js';
import { BLUEPRINTS } from './blueprints/ruined_portal.js';
import { DESIGNED_PORTALS } from './ruinedPortalDesigns.js';

export const GIANT_CHANCE = 0.05;
export const PORTAL_LOOT = 'minecraft:chests/ruined_portal';
export const NORMAL_DESIGNS = ['portal_1', 'portal_2', 'portal_3', 'portal_4', 'portal_5', 'portal_6', 'portal_7', 'portal_8', 'portal_9', 'portal_10'];
export const GIANT_DESIGNS = ['giant_portal_1', 'giant_portal_2', 'giant_portal_3'];
/** Which designs are the wiki's own blueprints (the rest are built from the description and materials table). */
export const BLUEPRINT_DESIGNS = { portal_1: 'ruined_portal_1', portal_2: 'ruined_portal_2', portal_3: 'ruined_portal_3', giant_portal_1: 'giant_ruined_portal_1' };

const surfaceSetup = (mossiness, airPocket, extra = {}) => ({ placement: 'on_land_surface', mossiness, airPocketProbability: airPocket, overgrown: false, vines: false, canBeCold: false, replaceWithBlackstone: false, ...extra });

/** The Generation table, per registry id: a list of [weight, setup]. */
export const PORTAL_SETUPS = {
  ruined_portal: [
    [1, surfaceSetup(0.2, 1, { placement: 'underground', canBeCold: true })],
    [1, surfaceSetup(0.2, 0.5, { canBeCold: true })]
  ],
  ruined_portal_desert: [[1, surfaceSetup(0, 0, { placement: 'partly_buried' })]],
  ruined_portal_jungle: [[1, surfaceSetup(0.8, 0.5, { overgrown: true, vines: true })]],
  ruined_portal_swamp: [[1, surfaceSetup(0.5, 0, { vines: true })]],
  ruined_portal_mountain: [
    [1, surfaceSetup(0.2, 1, { placement: 'in_mountain', canBeCold: true })],
    [1, surfaceSetup(0.2, 0.5, { canBeCold: true })]
  ],
  ruined_portal_ocean: [[1, surfaceSetup(0.8, 0, { placement: 'on_ocean_floor', canBeCold: true })]],
  ruined_portal_nether: [[1, surfaceSetup(0, 0.5, { placement: 'in_nether', replaceWithBlackstone: true })]]
};

/** "A ruined portal is in a cold biome if the temperature is less than 0.15" (the wiki's Biome temperatures). */
export const COLD_BIOMES = new Set(['snowy_plains', 'ice_spikes', 'snowy_taiga', 'snowy_beach', 'frozen_river', 'frozen_ocean', 'grove', 'snowy_slopes', 'jagged_peaks', 'frozen_peaks']);

export function selectSetup(structureId, random) {
  const list = PORTAL_SETUPS[structureId];
  if (!list) throw new Error(`${structureId} is not a ruined portal id`);
  const total = list.reduce((sum, [w]) => sum + w, 0);
  let roll = random.nextIntBound(total);
  for (const [w, setup] of list) { roll -= w; if (roll < 0) return setup; }
  return list[0][1];
}

/** The design's cells, with the ground layer (the drawing's layer 1) at y 1. */
export function designCells(design) {
  if (BLUEPRINT_DESIGNS[design]) {
    const data = BLUEPRINTS[BLUEPRINT_DESIGNS[design]];
    return { cells: cellsOf(data), size: data.size };
  }
  return DESIGNED_PORTALS[design]();
}

const BLACKSTONE = {
  stone: 'polished_blackstone', stone_slab: 'polished_blackstone_slab', smooth_stone_slab: 'polished_blackstone_slab',
  stone_bricks: 'polished_blackstone_bricks', mossy_stone_bricks: 'polished_blackstone_bricks', cracked_stone_bricks: 'cracked_polished_blackstone_bricks',
  chiseled_stone_bricks: 'chiseled_polished_blackstone', stone_brick_slab: 'polished_blackstone_brick_slab', stone_brick_stairs: 'polished_blackstone_brick_stairs',
  stone_brick_wall: 'polished_blackstone_brick_wall', iron_bars: 'chain'
};
const FULL = new Set(['stone', 'stone_bricks', 'chiseled_stone_bricks']);

/** The replacement table, one block at a time. `r` is a number in [0, 1), `r2` a second one for the split. */
export function processPortalBlock(name, props, { mossiness, cold, ocean, blackstone }, r, r2) {
  let out = { name, props };
  switch (name) {
    case 'block_of_gold': case 'gold_block': out = r < 0.3 ? null : { name: 'gold_block' }; break;
    case 'lava': out = cold ? { name: 'netherrack' } : ocean || r < 0.2 ? { name: 'magma_block' } : { name: 'lava' }; break;
    case 'netherrack': out = !cold && r < 0.07 ? { name: 'magma_block' } : out; break;
    case 'magma_block': out = cold ? { name: 'netherrack' } : out; break;
    case 'obsidian': out = r < 0.15 ? { name: 'crying_obsidian' } : out; break;
    default:
      if (FULL.has(name)) {
        if (r < 0.5 * (1 - mossiness)) out = r2 < 0.5 ? { name: 'cracked_stone_bricks' } : { name: 'stone_brick_stairs', props: { facing: 'north', half: 'bottom' } };
        else if (r < 0.5) out = r2 < 0.5 ? { name: 'mossy_stone_bricks' } : { name: 'mossy_stone_brick_stairs', props: { facing: 'north', half: 'bottom' } };
      } else if (/_stairs$/.test(name)) {
        if (r < 0.5 * (1 - mossiness)) out = { name: r2 < 0.5 ? 'stone_slab' : 'stone_brick_slab' };
        else if (r < 0.5) out = r2 < 0.5 ? { name: 'mossy_stone_brick_stairs', props } : { name: 'mossy_stone_brick_slab' };
      } else if (/_slab$/.test(name)) {
        if (r < mossiness) out = { name: 'mossy_stone_brick_slab', props };
      } else if (/_wall$/.test(name)) {
        if (r < mossiness) out = { name: 'mossy_stone_brick_wall' };
      }
  }
  if (out && blackstone && BLACKSTONE[out.name]) out = { ...out, name: BLACKSTONE[out.name] };
  return out;
}

export function buildRuinedPortal({ design = 'portal_1', seed = 0, mossiness = 0, cold = false, ocean = false, blackstone = false, airPocket = false, overgrown = false, vines = false } = {}) {
  const { cells, size } = designCells(design);
  const filled = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`));
  const flags = { mossiness, cold, ocean, blackstone };
  const out = [];
  for (const c of cells) {
    const p = processPortalBlock(c.name, c.props, flags, cellChance(seed, c.x, c.y, c.z, 1), cellChance(seed, c.x, c.y, c.z, 2));
    if (!p) { if (airPocket) out.push({ ...c, name: 'air', props: null }); continue; }
    const cell = { ...c, name: p.name, props: p.props ?? null };
    if (cell.name === 'chest') { cell.props = c.props ?? { facing: 'north' }; cell.nbt = { id: 'minecraft:chest', LootTable: PORTAL_LOOT }; }
    out.push(cell);
  }
  // Leaves on top and vines on the sides, for the setups that have them; an air pocket fills the rest of the box.
  for (let x = 0; x < size[0]; x++) {
    for (let z = 0; z < size[2]; z++) {
      for (let y = size[1] - 1; y >= 0; y--) {
        const key = `${x},${y},${z}`;
        if (filled.has(key)) {
          if (overgrown && y + 1 < size[1] && cellChance(seed, x, y, z, 3) < 0.25) out.push({ x, y: y + 1, z, name: 'jungle_leaves', props: { persistent: 'true' } });
          break;
        }
      }
      for (let y = 2; y < size[1]; y++) {
        const key = `${x},${y},${z}`;
        if (filled.has(key)) continue;
        const side = [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']].find(([dx, dz]) => filled.has(`${x + dx},${y},${z + dz}`));
        if (vines && side && cellChance(seed, x, y, z, 4) < 0.25) out.push({ x, y, z, name: 'vine', props: { [OPPOSITE_FACE[side[2]]]: 'true' } });
        else if (airPocket) out.push({ x, y, z, name: 'air', props: null });
      }
    }
  }
  // De-duplicate: a leaf or vine never overwrites a block.
  const seen = new Set();
  const unique = [];
  for (const c of out) { const k = `${c.x},${c.y},${c.z}`; if (seen.has(k)) continue; seen.add(k); unique.push(c); }
  return templateFrom(unique, size, { edit: (c) => (c.name === 'air' ? { name: 'air' } : c) });
}
const OPPOSITE_FACE = { west: 'east', east: 'west', north: 'south', south: 'north' };

/** The template's bottom y for a setup (the drawing's layer 1 is the ground, so the bottom is one below it). */
export function portalBaseY(setup, { surface, oceanFloor, height, random }) {
  const between = (lo, hi) => (hi <= lo ? lo : lo + random.nextIntBound(hi - lo + 1));
  switch (setup.placement) {
    // `surface` is the top solid block, which the drawing's layer 1 (y 1 of the template) replaces.
    case 'on_land_surface': return surface - 1;
    case 'on_ocean_floor': return (oceanFloor ?? surface) - 1;
    case 'partly_buried': return surface - height + between(2, 8);
    case 'underground': return between(15, surface - height);
    case 'in_mountain': return between(Math.min(70, surface - height), surface - height);
    case 'in_nether':
      if (setup.airPocket) return between(32, 100);
      return random.nextFloat() < 0.5 ? between(27, 29) : between(29, 100);
    default: throw new Error(`unknown ruined portal placement "${setup.placement}"`);
  }
}

const portal = defineBlueprintStructure({
  name: 'minecraft:ruined_portal',
  choose: (random, ctx) => {
    const setup = selectSetup(ctx.structureId, random);
    const giant = random.nextFloat() < GIANT_CHANCE;
    const list = giant ? GIANT_DESIGNS : NORMAL_DESIGNS;
    const design = list[random.nextIntBound(list.length)];
    const airPocket = random.nextFloat() < setup.airPocketProbability;
    const biome = ctx.context.biomeAt ? ctx.context.biomeAt(ctx.originX, ctx.originZ) : null;
    return {
      design, seed: random.nextInt(), mossiness: setup.mossiness, cold: setup.canBeCold && COLD_BIOMES.has(biome),
      ocean: setup.placement === 'on_ocean_floor', blackstone: setup.replaceWithBlackstone, airPocket, overgrown: setup.overgrown, vines: setup.vines,
      placement: setup.placement
    };
  },
  build: ({ placement, ...params }) => buildRuinedPortal(params),
  baseY: (ctx) => {
    const random = new LegacyRandom(BigInt(ctx.params.seed) ^ 0x5DEECE66Dn);
    const oceanFloor = ctx.context.surfaceY ? ctx.context.surfaceY(ctx.centreX, ctx.centreZ, 'ocean_floor_wg') : ctx.surface;
    return portalBaseY({ placement: ctx.params.placement, airPocket: ctx.params.airPocket }, { surface: ctx.surface, oceanFloor, height: ctx.size[1], random });
  },
  offset: 4,
  meta: (start, ctx) => {
    // "Natural terrain around ruined portals generates as netherrack": the ground round the portal, thinning out.
    const spread = [];
    if (ctx.params.placement !== 'in_nether') {
      const reach = Math.ceil(Math.max(ctx.size[0], ctx.size[2]) / 2) + 3;
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const d = Math.hypot(dx, dz) / reach;
          if (d > 1 || cellChance(ctx.params.seed, dx, 0, dz, 5) > 1 - d * d) continue;
          const x = ctx.centreX + dx; const z = ctx.centreZ + dz;
          const y = (ctx.params.placement === 'on_ocean_floor' && ctx.context.surfaceY ? ctx.context.surfaceY(x, z, 'ocean_floor_wg') : ctx.surfaceAt(x, z));
          spread.push([x, y, z, !ctx.params.cold && cellChance(ctx.params.seed, dx, 1, dz, 6) < 0.07 ? 'magma_block' : 'netherrack']);
        }
      }
    }
    return { design: ctx.params.design, giant: GIANT_DESIGNS.includes(ctx.params.design), setup: ctx.params.placement, spread };
  }
});

export const generateRuinedPortal = portal.generate;

export function realizeRuinedPortal(start, setBlock, blockIds, options = {}) {
  // The spread first, so the portal's own blocks win where they overlap it.
  const resolver = createBlockIdResolver(blockIds || undefined);
  let spreadWritten = 0;
  for (const [x, y, z, name] of start.meta.spread ?? []) {
    if (options.clip && !options.clip.contains(x, y, z)) continue;
    if (start.box.contains(x, y, z)) continue;
    const state = { name: `minecraft:${name}`, properties: {} };
    const id = resolver.resolveState(state);
    if (id !== null && setBlock(x, y, z, id, { state })) spreadWritten++;
  }
  const report = portal.realize(start, setBlock, blockIds, options);
  return { ...report, spreadWritten, note: `ruined portal ${start.meta.design}: ${BLUEPRINT_DESIGNS[start.meta.design] ? "the wiki's blueprint, block for block" : "built to the wiki's description and materials table"}` };
}

export const ruinedPortalTemplate = portal.templateFor;
