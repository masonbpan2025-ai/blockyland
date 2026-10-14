// Shared rules for turning a wiki {{layered blueprint}} into block states: names, halves, beds, and facings.
// Used by scripts/generate-village-blueprints.mjs and scripts/generate-structure-blueprints.mjs; the rules are tested
// against the drawings in tests/villageBlueprints.test.js.
import { cellsOf } from './villageBlueprintParse.mjs';
import { wikiBlockId } from './generate-village-wiki-data.mjs';

export const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
export const CLOCKWISE = ['north', 'east', 'south', 'west'];
export const turn = (dir, quarters) => CLOCKWISE[(CLOCKWISE.indexOf(dir) + quarters + 400) % 4];
export const opposite = (dir) => turn(dir, 2);
/** The direction a sprite points after its `-rotN`, from its base direction. */
export const rotated = (base, rot) => turn(base, Math.round(rot / 90));

const FULL_SLAB = {
  'double acacia slab': 'acacia_planks', 'double sandstone slab': 'sandstone', 'double smooth sandstone slab': 'smooth_sandstone',
  'double smooth stone slab': 'smooth_stone'
};
const CROPS = { wheat: 'wheat_stage_7', carrots: 'carrots_stage_3', potatoes: 'potatoes_stage_3', beetroots: 'beetroots_stage_3' };
const FRONT_FACING = /^(chest|furnace|smoker|blast_furnace|barrel|loom|stonecutter|lectern|grindstone|campfire|carved_pumpkin|jack_o_lantern|cartography_table|fletching_table|smithing_table|composter|brewing_stand|bell)$/;
const NOT_SOLID = /^(air|torch|wall_torch|lantern|ladder|.*_carpet|.*_pressure_plate|.*_button|.*_banner|.*_sign|short_grass|tall_grass|fern|large_fern|dandelion|poppy|azure_bluet|oxeye_daisy|cornflower|dead_bush|wheat.*|carrots.*|potatoes.*|beetroots.*|.*_stem|snow|water|lava|sweet_berry_bush|.*_sapling|.*_trapdoor|.*_door(_top)?|.*_fence_gate)$/;
export const GROUND = /^(grass_block|dirt|dirt_path|sand|smooth_sandstone|gravel|farmland_moist|snow_block|coarse_dirt|water|cobblestone|mossy_cobblestone|sandstone|packed_ice)$/;

/** A legend entry as a block name and properties, before any neighbour-based facing. */
export function baseState(entry) {
  const raw = entry.name;
  const mods = entry.mods;
  if (entry.entity) return { entity: entry.entity.replace(/\s+/g, '_') };
  if (FULL_SLAB[raw]) return { name: FULL_SLAB[raw] };
  let name = wikiBlockId(raw);
  if (name === 'crafting') name = 'crafting_table';
  if (name === 'waterlogged_smooth_sandstone_stairs') name = 'smooth_sandstone_stairs';
  if (CROPS[name]) return { name: CROPS[name] };
  if (name === 'farmland') return { name: 'farmland_moist' };
  if (name === 'jigsaw') return null;
  if (/_bed$/.test(name)) {
    const head = mods.includes('head');
    const facing = rotated('east', entry.rot); // foot -> head
    return { name: head ? `${name}_head` : name, props: { facing, part: head ? 'head' : 'foot' }, bed: { head, facing } };
  }
  if (/_door$/.test(name)) {
    const top = mods.includes('top'); // "+up+right" is the lower half with a right-hand hinge, not the top
    const hinge = mods.includes('right') ? 'right' : 'left';
    return { name: top ? `${name}_top` : name, props: { half: top ? 'upper' : 'lower', hinge, open: 'false' }, door: true };
  }
  if (/_stairs$/.test(name)) return { name, props: { facing: rotated('north', entry.rot), half: mods.includes('top') && mods.includes('upside') ? 'top' : 'bottom' } };
  if (/_slab$/.test(name)) return { name, props: { type: mods.includes('top') ? 'top' : 'bottom' } };
  if (name === 'torch' || name === 'wall_torch') return { name, torch: true, facing: rotated('north', entry.rot), explicitWall: name === 'wall_torch' };
  if (name === 'bell') return { name, props: { attachment: mods.includes('ceiling') ? 'ceiling' : 'floor', facing: rotated('south', entry.rot) } };
  if (name === 'lantern') return { name, props: mods.includes('ceiling') || mods.includes('hanging') ? { hanging: 'true' } : null };
  if (/(_log|_wood)$/.test(name)) return { name, props: { axis: mods.includes('top') ? 'y' : (entry.rot % 180 === 0 ? 'x' : 'z') } };
  if (FRONT_FACING.test(name)) return { name, props: { facing: rotated('south', entry.rot) } };
  if (/(_trapdoor|ladder|_wall_banner|_button|_wall_sign|_fence_gate)$/.test(name)) return { name, attached: true };
  return { name };
}

export function solidName(name) { return Boolean(name) && !NOT_SOLID.test(name); }


/**
 * Resolve every cell of a blueprint to a block state, with neighbour-derived facings.
 * Options: `stairsFromNeighbours` -- stairs drawn without a rotation face their single solid neighbour (the desert
 * pyramid's page says its stairs face the middle sandstone; village blueprints rotate theirs explicitly).
 */
export function resolveCells(bp, { stairsFromNeighbours = false, variant = null } = {}) {
  const cells = cellsOf(bp, { variant }).map((c) => ({ ...c, state: baseState(c.entry) })).filter((c) => c.state);
  const unknown = [...new Set(cells.filter((c) => c.state.name === undefined && !c.state.entity).map((c) => c.entry.name))];
  const at = new Map(cells.map((c) => [`${c.x},${c.z},${c.layer}`, c]));
  const nameAt = (x, z, layer) => at.get(`${x},${z},${layer}`)?.state.name ?? null;
  const solidAt = (x, z, layer) => solidName(nameAt(x, z, layer));
  const width = Math.max(...bp.layers.flatMap((l) => l.rows.map((r) => r.length)));
  const depth = Math.max(...bp.layers.map((l) => l.rows.length));

  // Neighbour-derived facings.
  for (const c of cells) {
    const s = c.state;
    if (s.torch) {
      // A wall torch hangs on the wall behind it; one with nothing behind it stands on the floor.
      const back = opposite(s.facing);
      const [dx, dz] = DIRS[back];
      const onWall = s.explicitWall || (c.entry.rot !== 0 ? true : solidAt(c.x + dx, c.z + dz, c.layer));
      if (onWall) { s.name = 'wall_torch'; s.props = { facing: s.facing }; } else { s.name = 'torch'; s.props = null; }
    }
    if (s.attached) {
      // Hang it on a solid neighbour, facing away from it; a trapdoor with none lies flat.
      const wall = Object.keys(DIRS).find((d) => solidAt(c.x + DIRS[d][0], c.z + DIRS[d][1], c.layer));
      const facing = wall ? opposite(wall) : 'north';
      if (/_button$/.test(s.name)) s.props = wall ? { face: 'wall', facing } : { face: 'floor', facing: 'north' };
      else if (/_trapdoor$/.test(s.name)) s.props = wall ? { facing, half: 'bottom', open: 'true' } : { facing: 'north', half: 'bottom', open: 'false' };
      else if (/_fence_gate$/.test(s.name)) {
        const alongX = /fence/.test(nameAt(c.x - 1, c.z, c.layer) ?? '') || /fence/.test(nameAt(c.x + 1, c.z, c.layer) ?? '');
        s.props = { facing: alongX ? 'north' : 'east', open: 'false' };
      } else s.props = { facing };
    }
  }
  // Doors face the open side: the side of the doorway whose straight line reaches the edge of the drawing.
  const reachesEdge = (x, z, layer, dir) => {
    const [dx, dz] = DIRS[dir];
    for (let k = 1; ; k++) {
      const nx = x + dx * k; const nz = z + dz * k;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) return k;
      if (solidAt(nx, nz, layer)) return 0;
    }
  };
  const doorOutward = (c) => {
    const options = Object.keys(DIRS).filter((d) => !solidAt(c.x + DIRS[d][0], c.z + DIRS[d][1], c.layer) && !solidAt(c.x - DIRS[d][0], c.z - DIRS[d][1], c.layer));
    const scored = options.map((d) => ({ d, reach: reachesEdge(c.x, c.z, c.layer, d) })).filter((o) => o.reach > 0);
    const pref = ['south', 'east', 'west', 'north'];
    scored.sort((a, b) => a.reach - b.reach || pref.indexOf(a.d) - pref.indexOf(b.d));
    return scored[0]?.d ?? options[0] ?? 'south';
  };
  for (const c of cells) {
    if (!c.state.door) continue;
    const lower = c.state.props.half === 'lower' ? c : at.get(`${c.x},${c.z},${c.layer - 1}`) ?? c;
    c.state.props.facing = doorOutward(lower);
  }

  if (stairsFromNeighbours) {
    for (const c of cells) {
      if (!/_stairs$/.test(c.state.name ?? '') || c.entry.rot !== 0) continue;
      const solid = Object.keys(DIRS).filter((d) => solidAt(c.x + DIRS[d][0], c.z + DIRS[d][1], c.layer));
      const backed = solid.filter((d) => !solidAt(c.x - DIRS[d][0], c.z - DIRS[d][1], c.layer));
      const facing = backed[0] ?? solid[0];
      if (facing) c.state.props = { ...c.state.props, facing };
    }
  }
  return { cells, at, nameAt, solidAt, width, depth, reachesEdge, doorOutward, unknown };
}
