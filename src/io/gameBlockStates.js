// Minecraft block states <-> this game's blocks.
//
// The game stores one block id per voxel. Some of a Minecraft state's properties are folded into WHICH id it is
// (a door's upper half is OAK_DOOR_TOP, an open trapdoor is OAK_TRAPDOOR_OPEN, wheat at age 3 is WHEAT_STAGE_3);
// the facing-like ones live beside the voxel in `world.structureOrientations`, set through
// `world.applyStructureOrientation()` and read by the mesher. This module converts between the two views:
//
//   gameBlockFromState(state)            -> { id, orientation }   a .schem palette entry, ready to place
//   blockIdToCanonicalState(id, stored)  -> CanonicalBlockState   a placed block (plus its stored orientation)
//
// Only properties the game can show are converted. Everything else (a log's axis, a wall's connections) is not
// lost on an import -> export round trip, because Building Studio keeps the file's original state string beside
// each voxel and writes it back unchanged (see buildingStudio.js).

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { normaliseBlockName, NAME_ALIASES } from '../blockNameMatch.js';
import { CanonicalBlockState, AIR } from './canonical.js';

const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const FACINGS = new Set(['north', 'south', 'east', 'west']);

// --- the id variants that stand for a property value ---------------------------------------------------------

const variantOf = new Map();   // variant id -> { baseId, props }
const doorIds = new Map();     // base door id -> { lower, upper, lowerOpen, upperOpen }
const trapdoorOpen = new Map(); // base trapdoor id -> open id
const bedHead = new Map();     // bed (foot) id -> head id
const cropStages = new Map();  // vanilla crop name -> [id at stage 0, 1, ...]

// The game draws carrots and potatoes in 4 stages where Minecraft counts 8 ages; these are vanilla's texture steps.
const CROPS = { WHEAT: { name: 'wheat', ages: [0, 1, 2, 3, 4, 5, 6, 7] }, CARROTS: { name: 'carrots', ages: [0, 2, 4, 7] }, POTATOES: { name: 'potatoes', ages: [0, 2, 4, 7] }, BEETROOTS: { name: 'beetroots', ages: [0, 1, 2, 3] } };
const CROP_NAME_OF = new Map();

for (const [key, id] of Object.entries(BLOCKS)) {
  const def = BLOCK_DEFS[id];
  if (def?.door && !def.isTop && BLOCKS[`${key}_TOP`] !== undefined && !/_OPEN$/.test(key)) {
    const set = { lower: id, upper: BLOCKS[`${key}_TOP`], lowerOpen: BLOCKS[`${key}_OPEN`] ?? id, upperOpen: BLOCKS[`${key}_TOP_OPEN`] ?? BLOCKS[`${key}_TOP`] };
    doorIds.set(id, set);
    variantOf.set(set.upper, { baseId: id, props: { half: 'upper' } });
    if (set.lowerOpen !== id) variantOf.set(set.lowerOpen, { baseId: id, props: { half: 'lower', open: 'true' } });
    if (set.upperOpen !== set.upper) variantOf.set(set.upperOpen, { baseId: id, props: { half: 'upper', open: 'true' } });
  }
  if (def?.trapdoor && !/_OPEN$/.test(key) && BLOCKS[`${key}_OPEN`] !== undefined) {
    trapdoorOpen.set(id, BLOCKS[`${key}_OPEN`]);
    variantOf.set(BLOCKS[`${key}_OPEN`], { baseId: id, props: { open: 'true' } });
  }
  if (def?.bed && !def.isHead && BLOCKS[`${key}_HEAD`] !== undefined && !bedHead.has(id)) {
    bedHead.set(id, BLOCKS[`${key}_HEAD`]);
    variantOf.set(BLOCKS[`${key}_HEAD`], { baseId: id, props: { part: 'head' } });
  }
  const stage = key.match(/^(WHEAT|CARROTS|POTATOES|BEETROOTS)_STAGE_(\d)$/);
  if (stage) {
    const crop = CROPS[stage[1]];
    const ids = cropStages.get(crop.name) ?? [];
    ids[Number(stage[2])] = id;
    cropStages.set(crop.name, ids);
    CROP_NAME_OF.set(id, crop.name);
    // A plain WHEAT / CARROTS id may alias the last stage; the stage key wins so its age is exact.
    variantOf.set(id, { baseId: id, props: { age: String(crop.ages[Number(stage[2])]) }, crop: crop.name });
  }
}
if (BLOCKS.FARMLAND_MOIST !== undefined) variantOf.set(BLOCKS.FARMLAND_MOIST, { baseId: BLOCKS.FARMLAND, props: { moisture: '7' } });
if (BLOCKS.FARMLAND !== undefined) variantOf.set(BLOCKS.FARMLAND, { baseId: BLOCKS.FARMLAND, props: { moisture: '0' } });
if (BLOCKS.END_PORTAL_FRAME_FILLED !== undefined) variantOf.set(BLOCKS.END_PORTAL_FRAME_FILLED, { baseId: BLOCKS.END_PORTAL_FRAME, props: { eye: 'true' } });

// Minecraft names whose game key means something else: the game's SNOW is the full block (Minecraft's snow_block),
// while Minecraft's `snow` is the thin layer.
const NAME_OVERRIDES = { snow: BLOCKS.SNOW_LAYER };

if (BLOCKS.LIT_FURNACE !== undefined) variantOf.set(BLOCKS.LIT_FURNACE, { baseId: BLOCKS.FURNACE, props: { lit: 'true' } });

// Game blocks whose display name is not their Minecraft id ("Block of Gold" is minecraft:gold_block). The last two
// are the game's redstone twins of a vanilla block; they export as that block and import back as it.
const EXPORT_NAMES = {
  CLAY: 'clay', COAL_BLOCK: 'coal_block', IRON_BLOCK: 'iron_block', GOLD_BLOCK: 'gold_block', DIAMOND_BLOCK: 'diamond_block',
  EMERALD_BLOCK: 'emerald_block', NETHERITE_BLOCK: 'netherite_block', LAPIS_ORE: 'lapis_ore', DEEPSLATE_LAPIS_ORE: 'deepslate_lapis_ore',
  JIGSAW: 'jigsaw', SPAWNER: 'spawner', TARGET_BLOCK: 'target', PRESSURE_PLATE: 'stone_pressure_plate',
  // The game's older twin of vanilla sulfur (it already drops sulfur). `sulfur_block` is no Minecraft name, so
  // WorldEdit replaced it with air.
  SULFUR_BLOCK: 'sulfur'
};
const EXPORT_NAME_OF = new Map(Object.entries(EXPORT_NAMES).filter(([key]) => BLOCKS[key] !== undefined).map(([key, name]) => [BLOCKS[key], `minecraft:${name}`]));

function cropIdForAge(name, age) {
  const ids = cropStages.get(name);
  if (!ids) return undefined;
  const ages = Object.values(CROPS).find((c) => c.name === name).ages;
  let stage = 0;
  for (let s = 0; s < ages.length; s++) if (Number(age) >= ages[s]) stage = s;
  return ids[stage] ?? ids[ids.length - 1];
}

// --- names ---------------------------------------------------------------------------------------------------

/** A game id's Minecraft name, without properties. */
function baseName(id) {
  if (CROP_NAME_OF.has(id)) return `minecraft:${CROP_NAME_OF.get(id)}`;
  if (id === BLOCKS.FARMLAND || id === BLOCKS.FARMLAND_MOIST) return 'minecraft:farmland';
  if (EXPORT_NAME_OF.has(id)) return EXPORT_NAME_OF.get(id);
  const def = BLOCK_DEFS[id];
  if (def && def.name) {
    const norm = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (norm) return `minecraft:${norm}`;
  }
  for (const [key, val] of Object.entries(BLOCKS)) if (val === id) return `minecraft:${key.toLowerCase()}`;
  return 'minecraft:stone';
}

/** The game id a Minecraft name means, ignoring properties. Unknown names fall back to a look-alike, as before. */
function idForName(name) {
  const raw = name.replace(/^minecraft:/, '').toLowerCase();
  if (cropStages.has(raw)) return cropStages.get(raw).at(-1);
  if (NAME_OVERRIDES[raw] !== undefined) return NAME_OVERRIDES[raw];
  const upper = raw.toUpperCase();
  if (BLOCKS[upper] !== undefined) return BLOCKS[upper];
  const folded = normaliseBlockName(raw);
  if (NAME_ALIASES[folded] && BLOCKS[NAME_ALIASES[folded]] !== undefined) return BLOCKS[NAME_ALIASES[folded]];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) if (def?.name && normaliseBlockName(def.name) === folded) return Number(id);
  if (raw.includes('stair')) return BLOCKS.STONE_BRICKS || BLOCKS.COBBLESTONE;
  if (raw.includes('plank')) return BLOCKS.OAK_PLANKS;
  if (raw.includes('log') || raw.includes('wood')) return BLOCKS.OAK_LOG;
  if (raw.includes('leaves')) return BLOCKS.OAK_LEAVES;
  if (raw.includes('glass')) return BLOCKS.GLASS;
  if (raw.includes('brick')) return BLOCKS.BRICKS || BLOCKS.STONE_BRICKS;
  if (raw.includes('sand')) return BLOCKS.SAND;
  if (raw.includes('dirt')) return BLOCKS.DIRT;
  if (raw.includes('wool')) return BLOCKS.WHITE_WOOL;
  return BLOCKS.STONE;
}

// Standing and ceiling-hanging signs turn in 16 steps (rotation 0 faces south, 4 west, 8 north, 12 east); the game
// draws four, so a rotation shows as its nearest facing and the exact value is kept for export.
const ROTATION_FACING = ['south', 'west', 'north', 'east'];
const FACING_ROTATION = { south: 0, west: 4, north: 8, east: 12 };
const isSignDef = (def) => Boolean(def?.sign || def?.wallSign || def?.hangingSign);
const usesFacing = (id) => Boolean(BLOCK_DEFS[id]?.wallSign) || /wall_hanging_sign$/.test(baseName(id));

const isLadder = (def, id) => id === BLOCKS.LADDER || def?.model?.wallAttached === 'ladder';
const isVine = (id) => id === BLOCKS.VINE;

// --- state -> game -------------------------------------------------------------------------------------------

/**
 * Where a Minecraft block state lands in the game: the id to place, and the orientation request to hand
 * `world.applyStructureOrientation()` (null when there is nothing to orient).
 */
export function gameBlockFromState(state) {
  if (!state || state.name === 'minecraft:air' || state.equals?.(AIR)) return { id: BLOCKS.AIR, orientation: null };
  const props = state.properties || {};
  let id = idForName(state.name);
  const def = BLOCK_DEFS[id];
  const orientation = {};
  const facing = FACINGS.has(props.facing) ? props.facing : null;

  if (def?.door && doorIds.has(id)) {
    const set = doorIds.get(id);
    const upper = props.half === 'upper', open = props.open === 'true';
    id = upper ? (open ? set.upperOpen : set.upper) : (open ? set.lowerOpen : set.lower);
    if (facing) Object.assign(orientation, { facing, half: upper ? 'upper' : 'lower', hinge: props.hinge === 'right' ? 'right' : 'left' });
  } else if (def?.trapdoor && trapdoorOpen.has(id)) {
    if (props.open === 'true') id = trapdoorOpen.get(id);
  } else if (cropStages.has(state.name.replace(/^minecraft:/, ''))) {
    if (props.age !== undefined) {
      id = cropIdForAge(state.name.replace(/^minecraft:/, ''), props.age) ?? id;
      // The game draws carrots and potatoes in 4 stages for Minecraft's 8 ages: the world remembers the exact age
      // beside the block, and forgets it as soon as the crop grows (any change of id clears it).
      orientation.plantAge = Number(props.age);
    }
  } else if (id === BLOCKS.FARMLAND || id === BLOCKS.FARMLAND_MOIST) {
    if (props.moisture !== undefined) id = Number(props.moisture) > 0 ? BLOCKS.FARMLAND_MOIST : BLOCKS.FARMLAND;
  } else if (id === BLOCKS.FURNACE || id === BLOCKS.LIT_FURNACE) {
    if (props.lit !== undefined) id = props.lit === 'true' ? BLOCKS.LIT_FURNACE : BLOCKS.FURNACE;
  } else if (id === BLOCKS.END_PORTAL_FRAME || id === BLOCKS.END_PORTAL_FRAME_FILLED) {
    if (props.eye !== undefined) id = props.eye === 'true' ? BLOCKS.END_PORTAL_FRAME_FILLED : BLOCKS.END_PORTAL_FRAME;
  } else if (def?.bed && bedHead.has(id)) {
    if (props.part === 'head') id = bedHead.get(id);
    if (facing) Object.assign(orientation, { facing, half: props.part === 'head' ? 'head' : 'foot' });
  } else if (def?.stair) {
    if (facing) Object.assign(orientation, { facing, half: props.half === 'top' ? 'top' : 'bottom' });
  } else if (isSignDef(def)) {
    if (facing) orientation.facing = facing;
    else if (props.rotation !== undefined) {
      const rotation = Number(props.rotation) & 15;
      Object.assign(orientation, { facing: ROTATION_FACING[Math.round(rotation / 4) % 4], rotation });
    }
  } else if (def?.slab) {
    if (props.type === 'top') orientation.slabType = 'top';
  } else if (id === BLOCKS.CHEST || id === BLOCKS.TRAPPED_CHEST) {
    if (facing) orientation.facing = facing;
  } else if (isLadder(def, id)) {
    if (facing) orientation.facing = facing;
  } else if (isVine(id)) {
    const faces = {};
    for (const side of ['north', 'south', 'east', 'west', 'up']) if (props[side] === 'true') faces[side] = true;
    if (Object.keys(faces).length) orientation.vineFaces = faces;
  }
  return { id, orientation: Object.keys(orientation).length ? orientation : null };
}

/** Name-only mapping, kept for callers that have no properties to give. */
export function canonicalStateToBlockId(state) {
  return gameBlockFromState(state).id;
}

// --- game -> state -------------------------------------------------------------------------------------------

/**
 * A placed block as a Minecraft state. `stored` is the block's entry in `world.structureOrientations`, when it
 * has one: `{ facing, half, hinge, slabType, isTop, wall, walls }`, as `applyStructureOrientation` stores it.
 */
export function blockIdToCanonicalState(id, stored = null) {
  if (id === BLOCKS.AIR || id === undefined || id === null) return AIR;
  const variant = variantOf.get(id);
  const baseId = variant?.baseId ?? id;
  const props = { ...(variant?.props ?? {}) };
  const def = BLOCK_DEFS[baseId];
  const o = stored || {};
  const facing = FACINGS.has(o.facing) ? o.facing : null;

  // A crop's exact age, when the world remembers one that still belongs to this stage.
  const crop = variant?.crop;
  if (crop && Number.isInteger(o.plantAge) && cropIdForAge(crop, o.plantAge) === id) props.age = String(o.plantAge);

  if (def?.door && doorIds.has(baseId)) {
    props.half ??= 'lower';
    props.open ??= 'false';
    if (facing) { props.facing = facing; props.hinge = o.hinge === 'right' ? 'right' : 'left'; }
  } else if (def?.trapdoor) {
    props.open ??= 'false';
  } else if (def?.bed && bedHead.has(baseId)) {
    props.part ??= 'foot';
    if (facing) props.facing = facing;
  } else if (def?.stair) {
    if (facing) { props.facing = facing; props.half = o.isTop || o.half === 'top' ? 'top' : 'bottom'; }
  } else if (isSignDef(def)) {
    if (usesFacing(baseId)) { if (facing) props.facing = facing; }
    else if (Number.isInteger(o.rotation)) props.rotation = String(o.rotation);
    else if (facing) props.rotation = String(FACING_ROTATION[facing]);
  } else if (def?.slab) {
    if (o.slabType === 'top') props.type = 'top';
  } else if (baseId === BLOCKS.CHEST || baseId === BLOCKS.TRAPPED_CHEST) {
    if (facing) props.facing = facing;
  } else if (isLadder(def, baseId)) {
    const wallFacing = OPPOSITE[o.wall] ?? facing;
    if (wallFacing) props.facing = wallFacing;
  } else if (isVine(baseId) && Array.isArray(o.walls)) {
    for (const side of ['north', 'south', 'east', 'west', 'up']) props[side] = String(o.walls.includes(side));
  }

  try {
    return new CanonicalBlockState(baseName(baseId), props);
  } catch {
    return new CanonicalBlockState('minecraft:stone');
  }
}

/** The orientation a placed state needs, or null: what `rebuild` hands `applyStructureOrientation`. */
export function orientationForState(state) {
  return gameBlockFromState(state).orientation;
}
