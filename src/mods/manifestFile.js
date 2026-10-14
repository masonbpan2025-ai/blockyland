// The filesystem half of the mod table. NODE ONLY.
//
// Split out of `registry.js` and `loader.js` because both are reachable from `main.js`, and therefore from the
// browser -- where `node:fs` does not exist. Vite stubs the builtin in dev and tree-shakes it out of the build,
// so it happened to work; relying on that is how a browser-only failure stays invisible until a user finds it.
//
// The rule this restores is the one the rest of `src/` already followed: nothing the browser loads imports a
// Node builtin. `resourceRegistry.js` states the same discipline for Three.js and the DOM -- it is "deliberately
// free of" them and takes what it needs from its callers. This module is the caller that has a filesystem.
//
// Nothing here is imported by `main.js`, `loader.js` or `registry.js`. The CLI, the Inspector's disk path and
// the tests use it; the game does not.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { normaliseManifest } from './registry.js';
import { MANIFEST_FILE, MODS_DIRECTORY } from './paths.js';

/**
 * Load and validate a mod manifest from a `mod.json` on disk.
 *
 * The browser gets the same object from the mod's `manifest.js`; a test asserts the two are identical.
 */
export function readModManifest(path) {
  if (!existsSync(path)) return { ok: false, reason: `${path} does not exist` };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `${path} is not valid JSON: ${error.message}` };
  }
  return normaliseManifest(raw);
}

/** Every mod on disk, read from its `mod.json`. For the CLI, the Inspector and the tests. */
export function loadModTable({ directory = MODS_DIRECTORY } = {}) {
  if (!existsSync(directory)) return { mods: [], rejected: [] };
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(`${directory}/${d.name}/${MANIFEST_FILE}`))
    .map(d => ({ id: d.name.replace(/-/g, '_'), manifestPath: `${directory}/${d.name}/${MANIFEST_FILE}` }));
  const mods = [], rejected = [];
  for (const entry of entries) {
    const result = readModManifest(entry.manifestPath);
    if (!result.ok) rejected.push({id: entry.id, reason: result.reason});
    else mods.push({...result.manifest, manifestPath: entry.manifestPath,
      directory: entry.manifestPath.replace(/\/[^/]+$/, ''), mapUrls: {}, load: null});
  }
  return {mods, rejected};
}
