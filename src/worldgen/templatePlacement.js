// Template placement: turning a template plus its processors into the blocks to write.
//
// This is vanilla's `StructureTemplate.placeInWorld` reduced to its observable behaviour, and it is the
// last piece between the template loader and a placed structure. It deliberately does NOT write to a world:
// it returns the blocks, so the caller decides whether that is a chunk, the Inspector's preview volume, or
// a test's array. That keeps the "planning is world-free" contract from STRUCTURE_ARCHITECTURE.md intact.
//
// Two vanilla behaviours are reproduced explicitly because both are easy to miss:
//
//   1. A processor returning null means "leave the world's block alone" -- not "write air". Ruined
//      structures stay half-buried because of this.
//   2. A pool element with `projection: terrain_matching` gets a `gravity` processor HARDCODED onto it with
//      offset -1, whether or not its processor list mentions one (the wiki states this explicitly under
//      Processor_list > gravity).
//
// Diagnostics are returned rather than logged: `requirements` names any world query the caller did not
// supply, `unhandledProperties` names block-state properties that could not be rotated, and `skipped`
// counts blocks a processor dropped. A structure that generates "mostly right" must be able to say why.

import { createProcessorList, ProcessorList } from './processors.js';
import { bareName } from './blockState.js';

/** Vanilla's hardcoded projection offset. */
export const TERRAIN_MATCHING_GRAVITY_OFFSET = -1;

/**
 * @param {object} options
 * @param {import('./template.js').StructureTemplate} options.template
 * @param {{x:number,y:number,z:number}} options.origin  placement position (the template's min corner)
 * @param {number} [options.rotation]
 * @param {string} [options.mirror]
 * @param {object|ProcessorList} [options.processors]
 * @param {string} [options.projection]  `rigid` or `terrain_matching`
 * @param {object} [options.world]       optional queries: getBlockState, hasBlockTag, heightmap, isFullShape
 * @param {object} options.random        a LegacyRandom-compatible source
 * @param {{chunkX?:number, chunkZ?:number}} [options.clip]  realise only this chunk
 */
export function placeTemplate({
  template,
  origin,
  rotation = 0,
  mirror = 'none',
  processors = null,
  projection = 'rigid',
  world = null,
  random,
  clip = null
} = {}) {
  if (!template) throw new Error('placeTemplate needs a template');
  if (!random || typeof random.nextFloat !== 'function') {
    throw new Error('placeTemplate needs a deterministic random source; Math.random would break parity');
  }

  let list = processors instanceof ProcessorList ? processors : createProcessorList(processors || {});
  const notes = [];

  // Vanilla hardcodes gravity on terrain-matching pieces. Adding it here rather than requiring the data to
  // carry it means a clean-room template gets the documented behaviour by declaring its projection.
  if (projection === 'terrain_matching' && !list.types.includes('gravity')) {
    const forced = createProcessorList({
      processors: [{ processor_type: 'minecraft:gravity', offset: TERRAIN_MATCHING_GRAVITY_OFFSET }]
    });
    list = new ProcessorList([...list.processors, ...forced.processors], { id: list.id });
    notes.push('gravity appended for a terrain_matching piece (vanilla hardcodes this with offset -1)');
  }

  const bounds = template.boundingBox(origin, rotation, mirror);
  const clipBox = clip
    ? { minX: clip.chunkX * 16, maxX: clip.chunkX * 16 + 15, minZ: clip.chunkZ * 16, maxZ: clip.chunkZ * 16 + 15 }
    : null;

  const blocks = [];
  const skipped = [];
  const requirementSet = new Set(list.unmetRequirements(world));
  const processorTypes = list.types;

  for (const entry of template.place(origin, rotation, mirror)) {
    const localPos = { x: entry.x - origin.x, y: entry.y - origin.y, z: entry.z - origin.z };
    const context = {
      world,
      random,
      pos: { x: entry.x, y: entry.y, z: entry.z },
      localPos,
      // `jigsaw_replacement` reads the FINAL STATE off the block's own block entity, so it has to travel
      // with the block rather than sit in the processor's data.
      jigsawFinalState: entry.nbt?.final_state || 'minecraft:air',
      state: { cappedUsed: null }
    };
    const { block } = list.process(toProcessorBlock(entry), context);
    if (block === null) {
      skipped.push({ x: entry.x, y: entry.y, z: entry.z, reason: 'processor' });
      continue;
    }
    // `gravity` may return a moved Y; honour it here so processors stay pure.
    const y = block.y !== undefined ? block.y : entry.y;
    if (clipBox && (entry.x < clipBox.minX || entry.x > clipBox.maxX || entry.z < clipBox.minZ || entry.z > clipBox.maxZ)) {
      continue;
    }
    blocks.push({
      x: entry.x,
      y,
      z: entry.z,
      state: block.state,
      blockName: block.state.name,
      nbt: block.nbt ?? null,
      paletteIndex: entry.stateIndex
    });
  }

  return {
    blocks,
    skipped,
    bounds,
    processorTypes,
    requirements: [...requirementSet].sort(),
    unhandledProperties: [...template.unhandledProperties].sort(),
    notes
  };
}

function toProcessorBlock(entry) {
  return { state: { name: entry.blockName, properties: propertiesOf(entry.state) }, nbt: entry.nbt ?? null };
}

/** Recover the property map from a canonical state string, without re-parsing in the common case. */
function propertiesOf(stateString) {
  const open = stateString.indexOf('[');
  if (open < 0) return {};
  const body = stateString.slice(open + 1, -1);
  const out = {};
  for (const pair of body.split(',')) {
    const equals = pair.indexOf('=');
    out[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return out;
}

/**
 * Summarise a placement for the Inspector's template panel.
 *
 * The block-type histogram is what makes a template's composition legible at a glance, and the counts of
 * skipped blocks and unmet requirements are the parts that say whether the placement is trustworthy.
 */
export function describePlacement(placement) {
  const histogram = new Map();
  for (const block of placement.blocks) {
    const name = bareName(block.blockName);
    histogram.set(name, (histogram.get(name) || 0) + 1);
  }
  return {
    blockCount: placement.blocks.length,
    skipped: placement.skipped.length,
    bounds: placement.bounds.toArray(),
    processorTypes: placement.processorTypes,
    requirements: placement.requirements,
    unhandledProperties: placement.unhandledProperties,
    notes: placement.notes,
    blockTypes: [...histogram].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  };
}
