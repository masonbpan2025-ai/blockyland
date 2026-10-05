// Terrain adaptation: bedding a structure into the ground.
//
// Every surface structure so far has carried the same deviation -- the desert pyramid, the swamp hut and the
// shipwreck all sit ON the surface height instead of being bedded into it, which is visible in the Inspector
// as a floating edge on sloped ground. This module is vanilla's answer to that, from `Structure definition`:
//
//   * `none`          -- do nothing;
//   * `beard_thin`    -- SHAVE terrain above the structure's floor and add FOUNDATION columns beneath it,
//                        which is what makes a village road meet a hillside;
//   * `beard_box`     -- the same over the structure's inflated box rather than its tight box;
//   * `bury`          -- cover the structure over with terrain material (underground structures);
//   * `encapsulate`   -- seal the structure's box with terrain material wherever it wrote nothing, so a room
//                        does not open into a cavern.
//
// It is deliberately WORLD-FREE, like the rest of the engine: terrain arrives as a `surfaceY(x, z)` callback
// and the structure's own blocks as an `isStructureBlock(x, y, z)` predicate. That keeps it a pure function
// of its inputs, which is what lets it be tested without generating a world -- and what will let the
// Inspector show the adaptation for any structure at any seed.

import { BlockBox } from './geometry.js';

export const TERRAIN_ADAPTATIONS = ['none', 'beard_thin', 'beard_box', 'bury', 'encapsulate'];

/** Vanilla inflates the box by 12 for the box-shaped adaptations. */
export const TERRAIN_ADAPTATION_INFLATE = 12;

/**
 * Compute the terrain-adaptation writes for one structure.
 *
 * Returns WRITES rather than performing them, so the same result can be fed to a chunk writer, the
 * Inspector's preview volume or a test array.
 *
 * @param {object} options
 * @param {string} options.adaptation
 * @param {BlockBox} options.box                 the structure's box (already inflated by the caller if it wants)
 * @param {function} options.surfaceY            `(x, z) => y` terrain height
 * @param {number} options.foundationBlock       block id used for foundation columns
 * @param {number} [options.terrainBlock]        block id used for bury/encapsulate
 * @param {number} [options.airBlock]            block id used to shave; omit to leave shaved blocks alone
 * @param {function} [options.isStructureBlock]  `(x, y, z) => bool`, so nothing the structure wrote is
 *                                               overwritten
 */
export function adaptToTerrain({
  adaptation = 'none',
  box,
  surfaceY,
  foundationBlock,
  terrainBlock = foundationBlock,
  airBlock = null,
  isStructureBlock = () => false
} = {}) {
  if (!TERRAIN_ADAPTATIONS.includes(adaptation)) {
    throw new Error(`unknown terrain adaptation "${adaptation}"`);
  }
  if (adaptation === 'none') {
    return { writes: [], counts: { shaved: 0, foundation: 0, buried: 0, encapsulated: 0 }, adaptation };
  }
  if (!box) throw new Error(`terrain adaptation "${adaptation}" needs a box`);
  if (typeof surfaceY !== 'function') throw new Error(`terrain adaptation "${adaptation}" needs a surfaceY callback`);

  const target = adaptation === 'beard_box' ? box.inflate(TERRAIN_ADAPTATION_INFLATE) : box;
  const writes = [];
  const counts = { shaved: 0, foundation: 0, buried: 0, encapsulated: 0 };

  const push = (x, y, z, block, kind) => {
    // Never overwrite the structure itself. `bury` and `encapsulate` exist precisely to fill around it, and
    // a foundation column that ate a wall would turn a village into a pit.
    if (isStructureBlock(x, y, z)) return;
    writes.push({ x, y, z, block, kind });
    counts[kind === 'shave' ? 'shaved' : kind === 'foundation' ? 'foundation' : kind === 'bury' ? 'buried' : 'encapsulated']++;
  };

  if (adaptation === 'beard_thin' || adaptation === 'beard_box') {
    const floor = box.minY;
    for (let x = target.minX; x <= target.maxX; x++) {
      for (let z = target.minZ; z <= target.maxZ; z++) {
        const height = surfaceY(x, z);
        if (height > floor) {
          // Shave: terrain standing above the structure's floor is removed so the structure is not buried.
          for (let y = floor; y <= height; y++) {
            if (airBlock === null) continue;
            push(x, y, z, airBlock, 'shave');
          }
        } else if (height < floor) {
          // Foundation: the gap between the terrain and the structure's floor is filled, so a structure on a
          // slope rests on something rather than hovering.
          for (let y = height + 1; y < floor; y++) push(x, y, z, foundationBlock, 'foundation');
        }
      }
    }
    return { writes, counts, adaptation, box: target.toArray() };
  }

  if (adaptation === 'bury') {
    // From the structure's ceiling up to the terrain surface, which for an underground structure is above it.
    for (let x = target.minX; x <= target.maxX; x++) {
      for (let z = target.minZ; z <= target.maxZ; z++) {
        const height = surfaceY(x, z);
        for (let y = target.maxY + 1; y <= height; y++) push(x, y, z, terrainBlock, 'bury');
      }
    }
    return { writes, counts, adaptation, box: target.toArray() };
  }

  // encapsulate: fill the SHELL of the inflated box, so a structure's rooms are sealed off from caverns they
  // would otherwise open into. The interior is left alone, which is what distinguishes it from filling.
  for (let x = target.minX; x <= target.maxX; x++) {
    for (let y = target.minY; y <= target.maxY; y++) {
      for (let z = target.minZ; z <= target.maxZ; z++) {
        const onShell = x === target.minX || x === target.maxX
          || y === target.minY || y === target.maxY
          || z === target.minZ || z === target.maxZ;
        if (onShell) push(x, y, z, terrainBlock, 'encapsulate');
      }
    }
  }
  return { writes, counts, adaptation, box: target.toArray() };
}

/** The `terrain_adaptation` a registry entry carries, resolved to a name this module understands. */
export function adaptationFor(entry) {
  const value = entry?.terrainAdaptation ?? entry?.terrain_adaptation ?? 'none';
  const normalised = String(value).toLowerCase().replace(/^minecraft:/, '');
  return TERRAIN_ADAPTATIONS.includes(normalised) ? normalised : 'none';
}

export { BlockBox };
