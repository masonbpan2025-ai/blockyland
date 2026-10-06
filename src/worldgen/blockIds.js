// Block name -> block id resolution, plus the missing-block report a placement needs.
//
// `StructureTemplate` and the processor pipeline all speak in vanilla block STATES
// ("minecraft:oak_stairs[facing=east]"), while the voxel world speaks in ids (`BLOCKS.OAK_STAIRS`).
// Something has to bridge that, and STRUCTURE_ARCHITECTURE.md listed it as the one missing adapter.
//
// Three lookups are tried, in order, because this repository's registry is not uniform:
//
//   1. the `BLOCKS` enum key (`SNOW_BLOCK`), which is where hand-written blocks live;
//   2. the shared vanilla-name matcher (`src/blockNameMatch.js`), which folds "Block of X", trailing
//      nouns, plurals and state suffixes -- reusing it rather than inventing a second vocabulary is
//      deliberate, and docs/block-parity-gap-review.md records why a per-script regex was a mistake;
//   3. the block-definition display name ("Snow Block"), which is where the generated extra blocks live.
//
// A name that resolves is cached; a name that does not is recorded in `missing`, because "the structure
// placed nothing there" and "this game has no such block" look identical in the world and only one of
// them is a bug to fix.

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { resolveVanillaBlock } from '../blockNameMatch.js';
import { bareName } from './blockState.js';

/** Vanilla state name -> `minecraft:`-stripped, upper-snake enum key. */
export function enumKeyFor(name) {
  return bareName(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * @param {Record<string, number>} [blocks] registry to resolve against; defaults to this game's
 * @returns {{ resolve(name: string): number|null, resolveState(state: object): number|null,
 *             get missing(): string[], get unresolved(): Map<string, number>, cacheSize: number }}
 */
export function createBlockIdResolver(blocks = BLOCKS) {
  const cache = new Map();
  const missing = new Map();

  function resolve(name) {
    if (!name) return null;
    const stateName = bareName(name);
    if (cache.has(stateName)) return cache.get(stateName);

    let id = null;
    const key = enumKeyFor(stateName);
    if (Object.prototype.hasOwnProperty.call(blocks, key) && typeof blocks[key] === 'number') {
      id = blocks[key];
    }

    if (id === null) {
      // The matcher takes a wiki-style display name; feed it the de-namespaced, de-underscored form.
      const candidates = resolveVanillaBlock(stateName.replace(/_/g, ' '), undefined);
      for (const candidate of candidates) {
        const value = blocks[candidate];
        if (typeof value === 'number') { id = value; break; }
      }
    }

    if (id === null) {
      const wanted = stateName.replace(/_/g, ' ').toLowerCase();
      for (const [blockId, definition] of Object.entries(BLOCK_DEFS)) {
        if (definition && typeof definition.name === 'string' && definition.name.toLowerCase() === wanted) {
          id = Number(blockId);
          break;
        }
      }
    }

    if (id === null) missing.set(stateName, (missing.get(stateName) || 0) + 1);
    else cache.set(stateName, id);
    return id;
  }

  return {
    resolve,
    resolveState(state) {
      return resolve(typeof state === 'string' ? state : state?.name);
    },
    get missing() {
      return [...missing.keys()].sort();
    },
    get unresolved() {
      return missing;
    },
    get cacheSize() {
      return cache.size;
    }
  };
}

/** A resolver shared by callers that have no reason to want their own. */
export const defaultBlockIdResolver = createBlockIdResolver();

export { BLOCKS };
