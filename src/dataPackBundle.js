// The bundled vanilla pack: shipping it, and getting it back.
//
// `scripts/build-vanilla-pack.mjs` writes `public/datapacks/vanilla-1.21.4.json` -- the curated vanilla data
// as a map of pack path to JSON, which is the same shape a pasted data pack arrives in. This is the runtime
// half: fetch it once, remember it, and hand it to the store as the `bundled` default.
//
// It is fetched lazily and only once. The file is about a megabyte, so it is not part of the JavaScript
// bundle and it is not fetched until something asks for it.

import { PACK_SOURCES, addPack } from './dataPackStore.js';

/** Where the built pack lives. `public/` is served at the root, so this is a URL and a repo path at once. */
export const BUNDLED_PACK_URL = '/datapacks/vanilla-1.21.4.json';
export const BUNDLED_PACK_META_URL = '/datapacks/vanilla-1.21.4.meta.json';
export const BUNDLED_PACK_NAME = 'Vanilla 1.21.4';

/** The pack, once fetched, so a second caller does not download it again. */
let cachedPack = null;
let inFlight = null;

/**
 * Fetch the bundled pack's files.
 *
 * Returns null rather than throwing when the bundle is absent or unreadable. A missing default pack must not
 * stop the game: it means the player gets the game's own built-in content instead, which is exactly what
 * happened before this module existed.
 *
 * @returns {Promise<{files:object, meta:object|null}|null>}
 */
export async function loadBundledPack(options = {}) {
  if (cachedPack) return cachedPack;
  if (inFlight) return inFlight;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  inFlight = (async () => {
    try {
      const res = await fetchImpl(BUNDLED_PACK_URL);
      if (!res.ok) return null;
      const files = await res.json();
      if (!files || typeof files !== 'object') return null;
      // The metadata is a nice-to-have: a pack that loads without it is still a working pack, and the meta
      // file is only there to say where the data came from.
      let meta = null;
      try {
        const metaRes = await fetchImpl(BUNDLED_PACK_META_URL);
        if (metaRes.ok) meta = await metaRes.json();
      } catch { /* the pack is the point; the provenance is a bonus */ }
      cachedPack = { files, meta };
      return cachedPack;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Forget the fetched pack. For a test, or for a reload that wants to re-read it. */
export function resetBundledPackCache() {
  cachedPack = null;
  inFlight = null;
}

/**
 * Put the bundled pack into a store as the `bundled` default.
 *
 * Disabled if the bundle cannot be read, so the store never holds a pack with no files that still claims to
 * be enabled -- which would apply nothing and look like it had.
 *
 * @returns {Promise<{ok:boolean, reason?:string, pack?:object}>}
 */
export async function installBundledPack(store, options = {}) {
  const bundle = await loadBundledPack(options);
  if (!bundle) return { ok: false, reason: 'the bundled pack could not be read' };
  const result = addPack(store, {
    name: options.name ?? BUNDLED_PACK_NAME,
    files: bundle.files,
    source: PACK_SOURCES.BUNDLED,
    format: bundle.meta?.format ?? 48,
    enabled: options.enabled !== false,
  });
  if (result.ok) result.pack.meta = bundle.meta ?? null;
  return result;
}

/**
 * Re-attach the bundle to any pack a save restored that is waiting for it.
 *
 * A bundled pack is stored in a save as a reference, so after a load its files are missing until this runs.
 * Without it the pack would sit in the store, enabled, applying nothing.
 *
 * @returns {Promise<string[]>} the names that were re-attached
 */
export async function reattachBundledPacks(store, awaiting = [], options = {}) {
  if (!Array.isArray(awaiting) || awaiting.length === 0) return [];
  const bundle = await loadBundledPack(options);
  if (!bundle) return [];
  const { attachBundledFiles } = await import('./dataPackStore.js');
  const done = [];
  for (const name of awaiting) {
    if (attachBundledFiles(store, name, bundle.files)) done.push(name);
  }
  return done;
}
